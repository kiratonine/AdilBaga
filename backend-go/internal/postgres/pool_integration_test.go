//go:build integration

package postgres

import (
	"context"
	"net"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// This opt-in connected proof never reads runtime DATABASE_URL. Refuse every
// effective target except a dedicated loopback test DB and restricted login.
func policyTestURL(t *testing.T) string {
	t.Helper()
	raw := os.Getenv("POOL_POLICY_DATABASE_URL")
	if raw == "" {
		t.Skip("POOL_POLICY_DATABASE_URL not set; connected local proof not run")
	}
	u, err := url.Parse(raw)
	if err != nil || u.Path != "/part04_security" || len(u.Query()) != 1 || u.Query().Get("sslmode") != "disable" {
		t.Fatal("pool policy test requires an explicit dedicated local target")
	}
	c, err := pgxpool.ParseConfig(raw)
	if err != nil || c.ConnConfig.Database != "part04_security" || c.ConnConfig.User != "part04_api_login" {
		t.Fatal("pool policy test requires a restricted local login")
	}
	hosts := []string{c.ConnConfig.Host}
	for _, fallback := range c.ConnConfig.Fallbacks {
		hosts = append(hosts, fallback.Host)
	}
	for _, host := range hosts {
		ip := net.ParseIP(host)
		if ip == nil || !ip.IsLoopback() {
			t.Fatal("pool policy test refuses non-loopback targets")
		}
	}
	return raw
}

func TestLocalPhysicalPoolSessionPolicy(t *testing.T) {
	raw := policyTestURL(t)
	for _, omitStartup := range []bool{false, true} {
		name := "startup_intact"
		if omitStartup {
			name = "startup_omitted"
		}
		t.Run(name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			pool, err := OpenReadOnly(ctx, raw)
			if err != nil {
				t.Fatal("local pool configuration failed")
			}
			if omitStartup {
				c := pool.Config()
				pool.Close()
				delete(c.ConnConfig.RuntimeParams, "default_transaction_read_only")
				delete(c.ConnConfig.RuntimeParams, "statement_timeout")
				pool, err = pgxpool.NewWithConfig(ctx, c)
				if err != nil {
					t.Fatal("local lazy pool creation failed")
				}
			}
			defer pool.Close()
			if pool.Stat().TotalConns() != 0 {
				t.Fatal("pool must remain lazy")
			}
			// Hold every acquired connection: four acquisitions must mean four
			// distinct physical sessions, not reuse of a single pooled session.
			connections := make([]*pgxpool.Conn, 0, 4)
			defer func() {
				for _, conn := range connections {
					conn.Release()
				}
			}()
			pids := make(map[uint32]bool)
			for range 4 {
				conn, err := pool.Acquire(ctx)
				if err != nil {
					t.Fatal("local policy-initialized acquisition failed")
				}
				connections = append(connections, conn)
				pids[conn.Conn().PgConn().PID()] = true
				var readOnly, timeout string
				if err := conn.QueryRow(ctx, "SHOW default_transaction_read_only").Scan(&readOnly); err != nil || readOnly != "on" {
					t.Fatal("physical session default read-only policy failed")
				}
				if err := conn.QueryRow(ctx, "SHOW statement_timeout").Scan(&timeout); err != nil {
					t.Fatal("physical session timeout query failed")
				}
				duration, err := time.ParseDuration(timeout)
				if err != nil || duration != 5*time.Second {
					t.Fatal("physical session timeout policy failed")
				}
				tx, err := conn.Begin(ctx)
				if err != nil {
					t.Fatal("ordinary local transaction failed")
				}
				err = tx.QueryRow(ctx, "SHOW transaction_read_only").Scan(&readOnly)
				rollbackErr := tx.Rollback(ctx)
				if err != nil || rollbackErr != nil || readOnly != "on" {
					t.Fatal("ordinary transaction did not inherit read-only policy")
				}
			}
			if len(pids) != 4 || pool.Stat().AcquiredConns() != 4 || pool.Stat().TotalConns() != 4 {
				t.Fatal("proof requires four held distinct physical connections")
			}
			t.Log("four distinct held physical connections: default/transaction read-only on, timeout 5s")
		})
	}

	t.Run("failed_initialization_not_acquirable", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		configured, err := OpenReadOnly(ctx, raw)
		if err != nil {
			t.Fatal("local pool configuration failed")
		}
		c := configured.Config()
		configured.Close()
		initialize := c.AfterConnect
		c.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
			// A real physical connection whose initialization cannot execute SET
			// must never become a usable pooled connection.
			_ = conn.Close(ctx)
			return initialize(ctx, conn)
		}
		pool, err := pgxpool.NewWithConfig(ctx, c)
		if err != nil {
			t.Fatal("local pool creation failed")
		}
		defer pool.Close()
		conn, err := pool.Acquire(ctx)
		if conn != nil {
			conn.Release()
			t.Fatal("failed initialization handed out a connection")
		}
		if err == nil || err.Error() != "PostgreSQL session policy initialization failed" || pool.Stat().AcquiredConns() != 0 {
			t.Fatal("failed physical initialization must return only the sanitized error")
		}
	})
}
