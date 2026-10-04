//go:build integration

package postgres

import (
	"github.com/jackc/pgx/v5"
	"net/url"
	"os"
	"testing"
)

func TestLocalDashboardPlan(t *testing.T) {
	value := os.Getenv("SMOKE_DATABASE_URL")
	if value == "" {
		t.Skip("explicit LOCAL restored clone required")
	}
	// Reuse the established clone guard; never infer DATABASE_URL.
	if !localPlanURL(value) {
		t.Fatal("dashboard ANALYZE must target loopback")
	}
	pool, err := OpenReadOnly(t.Context(), value)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var plan []byte
	if err := pool.QueryRow(t.Context(), "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) "+dashboardSQL).Scan(&plan); err != nil {
		t.Fatal("LOCAL dashboard plan failed")
	}
	t.Logf("dashboard aggregate: one SQL roundtrip, plan bytes=%d", len(plan))
	result, err := NewRepository(pool).GetDashboard(t.Context())
	if err != nil || len(result.Baskets) != 3 {
		t.Fatal("dashboard clone query failed")
	}
	if result.Summary.CanonicalProducts != 849 || len(result.Locations) != 15 {
		t.Fatal("explicit current restored clone population differs")
	}
	for _, b := range result.Baskets {
		if len(b.Items) != 3 {
			t.Fatal("fixed slots")
		}
		total := 0
		for i, item := range b.Items {
			if item.CategorySlug != []string{"milk", "sugar", "oil"}[i] {
				t.Fatal("slot order")
			}
			if item.Price != nil {
				total += *item.Price
			} else if item.ProductID != nil || item.Name != nil {
				t.Fatal("null semantics")
			}
		}
		if b.Total != total {
			t.Fatal("basket totals")
		}
	}
}

func localPlanURL(value string) bool {
	local := func(host string) bool { return host == "127.0.0.1" || host == "localhost" || host == "::1" }
	u, err := url.Parse(value)
	if err != nil || !local(u.Hostname()) {
		return false
	}
	c, err := pgx.ParseConfig(value)
	if err != nil || !local(c.Host) {
		return false
	}
	for _, f := range c.Fallbacks {
		if !local(f.Host) {
			return false
		}
	}
	return true
}
