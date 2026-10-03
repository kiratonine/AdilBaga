package postgres

import (
	"context"
	"strings"
	"testing"
	"time"
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
		t.Fatal("read-only/statement timeout policy missing")
	}
	// MinConns=0: creating/closing a valid pool does not connect or call Ping.
	pool.Close()
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
