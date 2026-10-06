//go:build integration

package ingestion

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func TestLocalTxBatchAtomicity(t *testing.T) {
	value := os.Getenv("TEST_INGEST_ADMIN_DATABASE_URL")
	if value == "" {
		t.Skip("explicit disposable part08 owner required")
	}
	u, err := url.Parse(value)
	if err != nil || !localTarget(value) || u.User == nil || u.User.Username() != "postgres" {
		t.Fatal("batch writes require dedicated loopback part08 owner")
	}
	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()
	conn, err := pgx.Connect(ctx, value)
	if err != nil {
		t.Fatal("local batch database unavailable")
	}
	defer conn.Close(context.Background())
	count := func() int {
		t.Helper()
		var n int
		if conn.QueryRow(ctx, `SELECT count(*) FROM categories WHERE id LIKE 'scrum7-batch-%'`).Scan(&n) != nil {
			t.Fatal("local batch inventory unavailable")
		}
		return n
	}
	if count() != 0 {
		t.Fatal("unexpected batch fixture rows")
	}
	for _, rejectTail := range []bool{false, true} {
		tx, err := conn.Begin(ctx)
		if err != nil {
			t.Fatal("local transaction unavailable")
		}
		defer tx.Rollback(context.Background())
		batch := &txBatch{tx: tx}
		for i := 0; i <= batchSize; i++ {
			id := fmt.Sprintf("scrum7-batch-%d", i)
			if batch.queue(ctx, `INSERT INTO categories(id,slug,name) VALUES($1,$1,'original')`, id) != nil {
				t.Fatal("local batch queue failed")
			}
		}
		if rejectTail {
			if batch.queue(ctx, `INSERT INTO categories(id,slug,name) VALUES($1,$1,'duplicate')`, "scrum7-batch-0") != nil {
				t.Fatal("tail queued too early")
			}
			if batch.flush(ctx) == nil {
				t.Fatal("constraint failure swallowed")
			}
		} else {
			if batch.queue(ctx, `UPDATE categories SET name='ordered' WHERE id=$1`, "scrum7-batch-0") != nil || batch.flush(ctx) != nil {
				t.Fatal("ordered dependent write failed")
			}
			var n int
			var name string
			if tx.QueryRow(ctx, `SELECT count(*) FROM categories WHERE id LIKE 'scrum7-batch-%'`).Scan(&n) != nil || n != batchSize+1 ||
				tx.QueryRow(ctx, `SELECT name FROM categories WHERE id='scrum7-batch-0'`).Scan(&name) != nil || name != "ordered" {
				t.Fatal("batch order/count semantics differ")
			}
		}
		if tx.Rollback(ctx) != nil || count() != 0 {
			t.Fatal("batch rollback leaked writes from earlier full batch")
		}
	}
	t.Log("LOCAL 500+tail ordered SQL + constraint failure rollback PASS")
}
