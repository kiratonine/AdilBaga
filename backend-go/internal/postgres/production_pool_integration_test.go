//go:build integration

package postgres

import (
	"context"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestLocalProductionIdentity(t *testing.T) {
	value := os.Getenv("PART10_ADMIN_DATABASE_URL")
	if value == "" {
		t.Skip("explicit disposable Part10 identity profile required")
	}
	u, err := url.Parse(value)
	if err != nil || os.Getenv("PART10_DISPOSABLE_CONFIRM") != "1" || u.User == nil || u.User.Username() != "postgres" || u.Path != "/part10_security" || (u.Hostname() != "127.0.0.1" && u.Hostname() != "::1") || u.RawQuery != "sslmode=disable" {
		t.Fatal("refusing non-disposable/non-loopback identity profile")
	}
	c, err := pgx.ParseConfig(value)
	if err != nil || c.Host != u.Hostname() || len(c.Fallbacks) != 0 {
		t.Fatal("invalid local target")
	}
	ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
	defer cancel()
	admin, err := pgx.ConnectConfig(ctx, c)
	if err != nil {
		t.Fatal("local admin connection failed")
	}
	defer admin.Close(context.Background())
	var version int
	if admin.QueryRow(ctx, "SELECT current_setting('server_version_num')::int").Scan(&version) != nil || version < 170000 || version >= 180000 {
		t.Fatal("disposable PostgreSQL17 required")
	}
	var existing int
	if admin.QueryRow(ctx, "SELECT count(*) FROM pg_roles WHERE rolname IN ('aktau_api_runtime','part10_switch')").Scan(&existing) != nil || existing != 0 {
		t.Fatal("identity profile requires absent local probe roles")
	}
	if _, err := admin.Exec(ctx, `CREATE ROLE aktau_api_runtime LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'local-part10-test';
GRANT aktau_api_reader TO aktau_api_runtime WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
CREATE ROLE part10_switch NOLOGIN`); err != nil {
		t.Fatal("local identity provisioning failed")
	}
	defer func() {
		if _, err := admin.Exec(context.Background(), "DROP ROLE aktau_api_runtime; DROP ROLE part10_switch"); err != nil {
			t.Error("local identity cleanup failed")
		}
	}()
	u.User = url.UserPassword("aktau_api_runtime", "local-part10-test")
	acquire := func(pool *pgxpool.Pool, accepted bool) *pgxpool.Conn {
		t.Helper()
		op, done := context.WithTimeout(ctx, 3*time.Second)
		defer done()
		conn, err := pool.Acquire(op)
		if (err == nil) != accepted {
			if conn != nil {
				conn.Release()
			}
			t.Fatal("unexpected production identity admission")
		}
		if err != nil && strings.Contains(err.Error(), "local-part10-test") {
			t.Fatal("identity error leaked credentials")
		}
		return conn
	}
	pool, err := OpenProductionReadOnly(ctx, u.String())
	if err != nil {
		t.Fatal("production pool creation failed")
	}
	defer pool.Close()
	held := []*pgxpool.Conn{}
	defer func() {
		for _, conn := range held {
			if conn.Conn() != nil {
				_ = conn.Conn().Close(context.Background())
				conn.Release()
			}
		}
	}()
	pids := map[uint32]bool{}
	for range 4 {
		conn := acquire(pool, true)
		pids[conn.Conn().PgConn().PID()] = true
		held = append(held, conn)
		var ro, timeout string
		if conn.QueryRow(ctx, "SHOW default_transaction_read_only").Scan(&ro) != nil || ro != "on" || conn.QueryRow(ctx, "SHOW statement_timeout").Scan(&timeout) != nil || timeout != "5s" {
			t.Fatal("physical session policy missing")
		}
	}
	if len(pids) != 4 {
		t.Fatal("four distinct physical connections required")
	}
	for _, conn := range held {
		_ = conn.Conn().Close(ctx)
		conn.Release()
	}
	held = nil // Released pgxpool handles must not be accessed by deferred cleanup.
	for _, tt := range []struct{ name, change, restore string }{
		{"unsafe bypass", "ALTER ROLE aktau_api_runtime BYPASSRLS", "ALTER ROLE aktau_api_runtime NOBYPASSRLS"},
		{"unsafe create role", "ALTER ROLE aktau_api_runtime CREATEROLE", "ALTER ROLE aktau_api_runtime NOCREATEROLE"},
		{"no inheritance", "ALTER ROLE aktau_api_runtime NOINHERIT", "ALTER ROLE aktau_api_runtime INHERIT"},
		{"role switching", "GRANT aktau_api_reader TO aktau_api_runtime WITH SET TRUE", "GRANT aktau_api_reader TO aktau_api_runtime WITH SET FALSE"},
		{"extra parent", "GRANT part10_switch TO aktau_api_runtime", "REVOKE part10_switch FROM aktau_api_runtime"},
		{"reader inherits another role", "GRANT part10_switch TO aktau_api_reader WITH INHERIT TRUE, SET FALSE", "REVOKE part10_switch FROM aktau_api_reader"},
		{"unexpected ownership", "CREATE TABLE public.part10_owned(id int); ALTER TABLE public.part10_owned OWNER TO aktau_api_runtime", "DROP TABLE public.part10_owned"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := admin.Exec(ctx, tt.change); err != nil {
				t.Fatal("local unsafe fixture failed")
			}
			defer func() {
				if _, err := admin.Exec(ctx, tt.restore); err != nil {
					t.Error("local fixture restoration failed")
				}
			}()
			acquire(pool, false)
		})
		if t.Failed() {
			return
		}
	}
	conn := acquire(pool, true)
	if pids[conn.Conn().PgConn().PID()] {
		t.Fatal("new physical initialization required")
	}
	conn.Release()
	owner, err := OpenProductionReadOnly(ctx, value)
	if err != nil {
		t.Fatal("lazy owner pool parse failed")
	}
	acquire(owner, false)
	owner.Close()
	development, err := OpenReadOnly(ctx, value)
	if err != nil {
		t.Fatal("explicit local development role failed")
	}
	acquire(development, true).Release()
	development.Close()
}
