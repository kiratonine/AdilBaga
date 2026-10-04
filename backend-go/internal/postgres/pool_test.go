package postgres

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestInvalidURL(t *testing.T) {
	for _, value := range []string{"", "https://secret-password@example.com", "postgres://private-password@%bad", "postgres://user:private-password@%zz/db", "postgres://user:private-password@%C0%AF/db", "postgres://test:private-password@localhost/test?sslmode=invalid"} {
		pool, err := OpenReadOnly(context.Background(), value)
		if pool != nil || err == nil || strings.Contains(err.Error(), "secret-password") || strings.Contains(err.Error(), "private-password") {
			t.Fatal("invalid config accepted or leaked")
		}
	}
}

func TestValidURLWithoutNetwork(t *testing.T) {
	pool, err := OpenReadOnly(context.Background(), "postgres://user:private-password@127.0.0.1:1/db?sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	if pool.Config().ConnConfig.RuntimeParams["default_transaction_read_only"] != "on" || pool.Config().ConnConfig.RuntimeParams["statement_timeout"] != "5000" {
		t.Fatal("best-effort startup parameters missing (not connected policy proof)")
	}
	c := pool.Config()
	if c.AfterConnect == nil || c.MinConns != 0 || c.MaxConns != 4 || c.ConnConfig.ConnectTimeout != 2*time.Second {
		t.Fatal("physical initializer or lazy/bounded connection config missing")
	}
	// MinConns=0: creating/closing a valid pool does not connect or call Ping.
	pool.Close()
}

type sessionStub struct {
	readOnly, timeout, failAt string
	commands                  []string
	bounded                   bool
}

func (s *sessionStub) Exec(ctx context.Context, sql string, _ ...any) (pgconn.CommandTag, error) {
	s.commands = append(s.commands, sql)
	deadline, ok := ctx.Deadline()
	s.bounded = ok && time.Until(deadline) <= 2*time.Second
	if s.failAt == "SET" {
		return pgconn.CommandTag{}, errors.New("private-password private-host")
	}
	return pgconn.CommandTag{}, nil
}

func (s *sessionStub) QueryRow(_ context.Context, sql string, _ ...any) pgx.Row {
	s.commands = append(s.commands, sql)
	value := s.readOnly
	if sql == "SHOW statement_timeout" {
		value = s.timeout
	}
	return sessionRow{value: value, fail: s.failAt == sql}
}

type sessionRow struct {
	value string
	fail  bool
}

func (r sessionRow) Scan(dest ...any) error {
	if r.fail {
		return errors.New("private-password private-host")
	}
	*dest[0].(*string) = r.value
	return nil
}

func TestSessionInitialization(t *testing.T) {
	for _, tt := range []struct {
		name, readOnly, timeout, failAt string
		valid                           bool
	}{
		{"effective policy", "on", "5s", "", true},
		{"equivalent milliseconds", "on", "5000ms", "", true},
		{"SET failed", "on", "5s", "SET", false},
		{"read-only SHOW failed", "on", "5s", "SHOW default_transaction_read_only", false},
		{"timeout SHOW failed", "on", "5s", "SHOW statement_timeout", false},
		{"read-only not established", "off", "5s", "", false},
		{"timeout not established", "on", "2m", "", false},
		{"malformed timeout", "on", "private-password", "", false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			stub := &sessionStub{readOnly: tt.readOnly, timeout: tt.timeout, failAt: tt.failAt}
			err := initializeReadOnlySession(context.Background(), stub)
			if (err == nil) != tt.valid || !stub.bounded {
				t.Fatal("initializer must enforce and verify a bounded policy")
			}
			if err != nil && err.Error() != "PostgreSQL session policy initialization failed" {
				t.Fatal("initializer error must be sanitized")
			}
			if tt.valid && !reflect.DeepEqual(stub.commands, []string{"SET default_transaction_read_only = on; SET statement_timeout = 5000", "SHOW default_transaction_read_only", "SHOW statement_timeout"}) {
				t.Fatal("SET then both SHOW checks required")
			}
		})
	}
}

func TestOutageDoesNotPreventPoolCreation(t *testing.T) {
	// Loopback port with no service; never consult a runtime/production env file.
	pool, err := OpenReadOnly(context.Background(), "postgres://test:test@127.0.0.1:1/test?sslmode=disable")
	if err != nil {
		t.Fatal("outage must not prevent pool creation")
	}
	defer pool.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	if err := pool.Ping(ctx); err == nil {
		t.Fatal("unexpected database on loopback port 1")
	}
}
