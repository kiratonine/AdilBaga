//go:build integration

package postgres

import (
	"adilbaga/backend-go/internal/observability"
	"context"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SELECT-only operator/freshness proof; deliberately refuses runtime URL fallbacks.
func TestLocalObservability(t *testing.T) {
	operator, reader := os.Getenv("PART11_OPERATOR_DATABASE_URL"), os.Getenv("PART11_READER_DATABASE_URL")
	if operator == "" && reader == "" {
		t.Skip("explicit Part11 restored loopback profile required")
	}
	var host string
	for i, value := range []string{operator, reader} {
		u, err := url.Parse(value)
		if err != nil || u.User == nil || u.Path != "/part11_recovery" || (u.Hostname() != "127.0.0.1" && u.Hostname() != "::1") || u.RawQuery != "sslmode=disable" {
			t.Fatal("explicit disposable loopback target required")
		}
		c, err := pgx.ParseConfig(value)
		if err != nil || len(c.Fallbacks) != 0 || c.Host != u.Hostname() {
			t.Fatal("local driver target mismatch")
		}
		if i == 0 {
			host = u.Host
			if u.User.Username() != "postgres" {
				t.Fatal("local operator required")
			}
		} else if host != u.Host || u.User.Username() != "aktau_api_runtime" {
			t.Fatal("matching restricted reader required")
		}
	}
	ctx, cancel := context.WithTimeout(t.Context(), 20*time.Second)
	defer cancel()
	op, err := OpenReadOnly(ctx, operator)
	if err != nil {
		t.Fatal("operator pool unavailable")
	}
	defer op.Close()
	fresh, err := NewRepository(op).SourceFreshness(ctx)
	if err != nil || len(fresh) != 3 {
		t.Fatal("operator freshness unavailable")
	}
	for _, f := range fresh {
		if _, ok := observability.Default.Snapshot().Gauges["source_age_seconds|"+f.StoreCode]; !ok {
			t.Fatal("source observation missing")
		}
	}
	pool, err := OpenProductionReadOnly(ctx, reader)
	if err != nil {
		t.Fatal("reader pool unavailable")
	}
	defer pool.Close()
	held := []*pgxpool.Conn{}
	defer func() {
		for _, c := range held {
			c.Release()
		}
	}()
	for range 4 {
		c, err := pool.Acquire(ctx)
		if err != nil {
			t.Fatal("physical reader unavailable")
		}
		held = append(held, c)
	}
	s := observability.Default.Snapshot()
	if s.Pool.Max != 4 || s.Pool.Acquired != 4 || s.Pool.Total != 4 {
		t.Fatal("numeric physical pool snapshot mismatch")
	}
	for _, c := range held {
		c.Release()
	}
	held = nil
	if _, err := NewRepository(pool).LatestPublishedSnapshot(ctx); err != nil {
		t.Fatal("latest snapshot unavailable")
	}
	if _, err := NewRepository(pool).SourceFreshness(ctx); err == nil {
		t.Fatal("reader freshness access must remain denied")
	}
	var value int
	if pool.QueryRow(ctx, "SELECT 1/0").Scan(&value) == nil {
		t.Fatal("expected safe local query failure")
	}
	s = observability.Default.Snapshot()
	if s.Series["db|query|success"].Count == 0 || s.Series["db|query|failure"].Failures < 2 {
		t.Fatal("DB query observations absent")
	}
	if _, ok := s.Gauges["snapshot_age_seconds"]; !ok {
		t.Fatal("snapshot age observation absent")
	}
}
