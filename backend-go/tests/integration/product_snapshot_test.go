//go:build integration

package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/config"
	"adilbaga/backend-go/internal/httpapi"
	"adilbaga/backend-go/internal/observability"
	"adilbaga/backend-go/internal/postgres"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func catalogTestRouter(repo *postgres.Repository, logger *slog.Logger) http.Handler {
	return httpapi.Router(config.Config{RateRPS: 1000, RateBurst: 1000}, logger,
		httpapi.Dependencies{Categories: repo, Products: repo})
}

func testProductSnapshot(t *testing.T, ctx context.Context, admin *pgx.Conn, pool *pgxpool.Pool) {
	db := &countedDB{pool: pool}
	handler := catalogTestRouter(postgres.NewRepository(db), observability.New(io.Discard, "info"))
	get := func(path string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil).WithContext(ctx))
		if pool.Stat().AcquiredConns() != 0 {
			t.Fatal("catalog retained a pooled connection")
		}
		return w
	}
	for _, tc := range []struct {
		query                      string
		status, queries, discovery int
	}{
		{"category=milk", 200, 3, 0},
		{"category=milk&brand=a", 200, 5, 1},
		{"category=milk&brand=unknown", 400, 3, 1},
		{"category=milk&brand=a&offset=99", 200, 4, 1},
	} {
		db.count, db.begins, db.rollbacks, db.discoveries = 0, 0, 0, 0
		if w := get("/api/products?" + tc.query); w.Code != tc.status {
			t.Fatalf("status=%d want=%d", w.Code, tc.status)
		}
		if db.count != tc.queries || db.begins != 1 || db.rollbacks != 1 || db.discoveries != tc.discovery ||
			db.options.IsoLevel != pgx.RepeatableRead || db.options.AccessMode != pgx.ReadOnly {
			t.Fatalf("queries=%d begin=%d rollback=%d discovery=%d options=%+v", db.count, db.begins, db.rollbacks, db.discoveries, db.options)
		}
	}
	db.discoveries = 0
	db.beforeProducts = func(ctx context.Context) error {
		if db.discoveries != 1 {
			return errors.New("publication must follow a single discovery")
		}
		_, err := admin.Exec(ctx, `BEGIN;
INSERT INTO snapshots(id,status,"publishedAt") VALUES('fixture-next','published','2026-10-06 11:00:00');
INSERT INTO raw_products(id,"storeId","sourceProductId","rawName","rawPrice","snapshotId")
VALUES('fixture-next-raw','dina','1','Fixture',42,'fixture-next');
INSERT INTO offers(id,"canonicalProductId","rawProductId","storeId",price,"snapshotAt","snapshotId")
VALUES('fixture-next-offer','p1','fixture-next-raw','dina',42,'2026-10-06 11:00:00','fixture-next');
UPDATE canonical_products SET brand='B' WHERE id='p1';
COMMIT`)
		return err
	}
	defer func() {
		if _, err := admin.Exec(ctx, `BEGIN;
UPDATE canonical_products SET brand='A' WHERE id='p1';
DELETE FROM offers WHERE "snapshotId"='fixture-next';
DELETE FROM raw_products WHERE "snapshotId"='fixture-next';
DELETE FROM snapshots WHERE id='fixture-next';
COMMIT`); err != nil {
			t.Error("snapshot fixture cleanup failed")
		}
	}()
	w := get("/api/products?category=milk&brand=a&limit=1")
	db.beforeProducts = nil
	var items []catalog.Product
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &items) != nil || len(items) != 1 ||
		items[0].ID != "p1" || items[0].Brand == nil || *items[0].Brand != "A" ||
		items[0].MinPrice != 100 || len(items[0].Offers) != 2 ||
		items[0].SnapshotAt.Format(time.RFC3339) != "2026-10-02T11:00:00Z" {
		t.Fatal("response mixed published snapshots or lost existing product metadata")
	}
	if w := get("/api/products?category=milk&brand=a"); w.Code != 400 {
		t.Fatal("next request did not observe changed brand visibility")
	}
	if w := get("/api/products?category=milk&brand=b"); w.Code != 200 {
		t.Fatal("next snapshot filter rejected")
	}
}

func testProductFaults(t *testing.T, ctx context.Context, admin *pgx.Conn, pool *pgxpool.Pool) {
	locker, err := pgx.Connect(ctx, admin.Config().ConnString())
	if err != nil {
		t.Fatal("disposable fixture locker unavailable")
	}
	defer locker.Close(context.Background())
	var logs bytes.Buffer
	handler := catalogTestRouter(postgres.NewRepository(pool), observability.New(&logs, "info"))

	const marker = "synthetic-query-value-q8m9k"
	probe := func(ctx context.Context, id string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, "/api/products?category=milk&brand=a&search="+marker, nil).WithContext(ctx)
		r.Header.Set("X-Request-ID", id)
		r.Header.Set("Authorization", "synthetic-header-m3p5")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	check := func(w *httptest.ResponseRecorder, id string, status int, stage, reason string) {
		t.Helper()
		if w.Code != status {
			t.Fatalf("status=%d want=%d", w.Code, status)
		}
		// pgx releases a canceled connection through asynchronous destruction.
		deadline := time.Now().Add(2 * time.Second)
		for pool.Stat().AcquiredConns() != 0 && time.Now().Before(deadline) {
			time.Sleep(10 * time.Millisecond)
		}
		if pool.Stat().AcquiredConns() != 0 {
			t.Fatal("request retained a connection")
		}
		for _, secret := range []string{marker, "synthetic-header-m3p5", "permission denied", "canceling statement", "SELECT "} {
			if strings.Contains(logs.String(), secret) || strings.Contains(w.Body.String(), secret) {
				t.Fatal("private detail in logs or response")
			}
		}
		found := 0
		for line := range strings.SplitSeq(logs.String(), "\n") {
			if line == "" {
				continue
			}
			var rec map[string]any
			if json.Unmarshal([]byte(line), &rec) != nil {
				t.Fatal("invalid structured log")
			}
			if rec["msg"] != "catalog_request_503" {
				continue
			}
			found++
			elapsed, numeric := rec["duration_ms"].(float64)
			if rec["request_id"] != id || rec["route"] != "/api/products" || rec["stage"] != stage || rec["reason_class"] != reason || !numeric || elapsed < 0 {
				t.Fatalf("unexpected sanitized 503 event: stage=%v reason=%v", rec["stage"], rec["reason_class"])
			}
			t.Logf("safe 503 %s %s %.0f ms", stage, reason, elapsed)
		}
		if status == 503 {
			if found != 1 || strings.TrimSpace(w.Body.String()) != `{"statusCode":503,"message":"Service Unavailable","error":"Service Unavailable"}` ||
				!strings.Contains(logs.String(), `"error_code":"request_deadline"`) {
				t.Fatal("503 envelope or access outcome changed")
			}
		} else if found != 0 {
			t.Fatal("non-503 produced a 503 event")
		}
		logs.Reset()
	}
	lockOffers := func(t *testing.T) pgx.Tx {
		t.Helper()
		tx, err := locker.Begin(ctx)
		if err != nil {
			t.Fatal("cannot begin fixture lock")
		}
		t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
		if _, err := tx.Exec(ctx, "LOCK TABLE public.offers IN ACCESS EXCLUSIVE MODE"); err != nil {
			t.Fatal("cannot lock disposable offers")
		}
		return tx
	}
	waitBlocked := func(t *testing.T) int {
		t.Helper()
		deadline := time.Now().Add(2 * time.Second)
		for time.Now().Before(deadline) {
			var pid int
			err := admin.QueryRow(ctx, `SELECT a.pid FROM pg_stat_activity a
WHERE a.datname=current_database() AND a.usename='part04_api_login' AND $1=ANY(pg_blocking_pids(a.pid))`, locker.PgConn().PID()).Scan(&pid)
			if err == nil {
				return pid
			}
			if !errors.Is(err, pgx.ErrNoRows) {
				t.Error("fixture activity check failed")
				return 0
			}
			time.Sleep(10 * time.Millisecond)
		}
		t.Error("catalog query did not wait on synthetic lock")
		return 0
	}
	t.Run("statement timeout", func(t *testing.T) {
		lockOffers(t)
		check(probe(ctx, "fixture-statement"), "fixture-statement", 503, "discovery", "statement_timeout")
	})
	t.Run("explicit database cancellation", func(t *testing.T) {
		lockOffers(t)
		result := make(chan *httptest.ResponseRecorder, 1)
		go func() { result <- probe(ctx, "fixture-pg-cancel") }()
		if pid := waitBlocked(t); pid != 0 {
			var signaled bool
			if err := admin.QueryRow(ctx, "SELECT pg_cancel_backend($1)", pid).Scan(&signaled); err != nil || !signaled {
				t.Error("fixture backend cancellation failed")
			}
		}
		check(<-result, "fixture-pg-cancel", 503, "discovery", "sql_cancel")
	})
	t.Run("request deadline in SQL", func(t *testing.T) {
		lockOffers(t)
		short, cancel := context.WithTimeout(ctx, 750*time.Millisecond)
		defer cancel()
		check(probe(short, "fixture-request"), "fixture-request", 503, "discovery", "request_deadline")
	})
	t.Run("client cancellation", func(t *testing.T) {
		lockOffers(t)
		client, cancel := context.WithCancel(ctx)
		defer cancel()
		result := make(chan *httptest.ResponseRecorder, 1)
		go func() { result <- probe(client, "fixture-client") }()
		waitBlocked(t)
		cancel()
		w := <-result
		if w.Body.Len() != 0 || !strings.Contains(logs.String(), `"error_code":"request_canceled"`) {
			t.Fatal("client cancellation wrote a response or lost its access outcome")
		}
		check(w, "fixture-client", 200, "", "") // Recorder defaults to 200 when never written.
	})
	t.Run("pool deadline", func(t *testing.T) {
		var held []*pgxpool.Conn
		defer func() {
			for _, conn := range held {
				conn.Release()
			}
		}()
		for range pool.Config().MaxConns {
			conn, err := pool.Acquire(ctx)
			if err != nil {
				t.Fatal("could not occupy local pool")
			}
			held = append(held, conn)
		}
		w := probe(ctx, "fixture-acquire") // Exercise the actual 15s middleware budget.
		for _, conn := range held {
			conn.Release()
		}
		held = nil
		check(w, "fixture-acquire", 503, "pool_acquire", "pool_wait_deadline")
	})
	t.Run("independent database error", func(t *testing.T) {
		if _, err := admin.Exec(ctx, "REVOKE SELECT ON public.offers FROM aktau_api_reader"); err != nil {
			t.Fatal("fixture revoke failed")
		}
		defer func() {
			if _, err := admin.Exec(ctx, "GRANT SELECT ON public.offers TO aktau_api_reader"); err != nil {
				t.Error("fixture grant restoration failed")
			}
		}()
		const metric = "catalog_db|discovery|other"
		before := observability.Default.Snapshot().Series[metric].Count
		w := probe(ctx, "fixture-db-error")
		check(w, "fixture-db-error", 500, "", "")
		if observability.Default.Snapshot().Series[metric].Count != before+1 {
			t.Fatal("independent DB error lost its bounded phase metric")
		}
		if strings.TrimSpace(w.Body.String()) != `{"statusCode":500,"message":"Internal Server Error","error":"Internal Server Error"}` {
			t.Fatal("500 envelope changed")
		}
	})
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/products?category=milk&brand=a", nil).WithContext(ctx))
	check(w, "", 200, "", "")
	if strings.TrimSpace(w.Body.String()) == "[]" {
		t.Fatal("successful reuse must return fixture products")
	}
}
