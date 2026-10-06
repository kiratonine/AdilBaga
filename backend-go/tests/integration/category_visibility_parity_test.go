//go:build integration

package integration

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"adilbaga/backend-go/internal/catalog"
	"github.com/jackc/pgx/v5"
)

// Opt-in local fixture proof: no runtime URL fallback, production profile or roles.
func TestLocalCategoryVisibilityParity(t *testing.T) {
	value := os.Getenv("TEST_DATABASE_URL")
	if value == "" || os.Getenv("HTTP_PARITY_CONFIRM") != "1" {
		t.Skip("explicit disposable fixture + local HTTP parity required")
	}
	u, err := url.Parse(value)
	if err != nil || !localURL(value) || u.Path != "/part04_fixture" || u.User == nil || u.User.Username() != "postgres" {
		t.Fatal("dedicated loopback fixture owner required")
	}
	origins := []string{os.Getenv("GO_API_BASE_URL"), os.Getenv("REFERENCE_API_BASE_URL")}
	for _, origin := range origins {
		o, err := url.Parse(origin)
		if err != nil || o.Scheme != "http" || !localHost(o.Hostname()) || o.User != nil || o.Path != "" || o.RawQuery != "" || o.Fragment != "" {
			t.Fatal("explicit credential-free loopback HTTP origins required")
		}
	}
	ctx, cancel := context.WithTimeout(t.Context(), 45*time.Second)
	defer cancel()
	admin, err := pgx.Connect(ctx, value)
	if err != nil {
		t.Fatal("fixture unavailable")
	}
	t.Cleanup(func() { _ = admin.Close(context.Background()) })
	var fixture bool
	if admin.QueryRow(ctx, `SELECT (SELECT count(*) FROM snapshots)=1 AND EXISTS(SELECT 1 FROM snapshots WHERE id='fixture-internal-v1' AND status='published') AND (SELECT count(*) FROM canonical_products)=7`).Scan(&fixture) != nil || !fixture {
		t.Fatal("original deterministic fixture required before overlay")
	}
	data, err := os.ReadFile(filepath.Join("..", "fixtures", "category-visibility.sql"))
	if err != nil {
		t.Fatal(err)
	}
	// All setup statements are atomic. No fixture content is replaced.
	tx, err := admin.Begin(ctx)
	if err != nil {
		t.Fatal("overlay transaction unavailable")
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(ctx, string(data)); err != nil || tx.Commit(ctx) != nil {
		t.Fatal("category acceptance overlay failed")
	}
	t.Cleanup(func() {
		cleanup, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		_, err := admin.Exec(cleanup, `BEGIN;
DELETE FROM offers WHERE id IN ('scrum7-z','scrum7-a','scrum7-out','scrum7-zero','scrum7-negative','scrum7-stale','scrum7-unpublished');
DELETE FROM canonical_products WHERE id IN ('scrum7-z','scrum7-a','scrum7-out','scrum7-zero','scrum7-negative','scrum7-stale','scrum7-unpublished');
DELETE FROM raw_products WHERE id IN ('scrum7-old-raw','scrum7-building-raw');
DELETE FROM snapshots WHERE id IN ('scrum7-old','scrum7-building');
DELETE FROM categories WHERE id IN ('scrum7-z','scrum7-a','scrum7-stale','scrum7-out','scrum7-zero','scrum7-negative','scrum7-unpublished','scrum7-other');
COMMIT;`)
		if err != nil {
			t.Error("owned fixture overlay cleanup failed")
		}
	})
	get := func(origin, path string, output any) {
		t.Helper()
		req, err := http.NewRequestWithContext(ctx, "GET", origin+path, nil)
		if err != nil {
			t.Fatal("local request invalid")
		}
		response, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
		if err != nil {
			t.Fatal("local GET transport failed")
		}
		defer response.Body.Close()
		if response.StatusCode != 200 || json.NewDecoder(http.MaxBytesReader(nil, response.Body, 1<<20)).Decode(output) != nil {
			t.Fatal("local GET response invalid")
		}
	}
	want := []catalog.Category{
		{ID: "milk", Slug: "milk", Name: "Молоко"},
		{ID: "oil", Slug: "oil", Name: "Масло"},
		{ID: "scrum7-a", Slug: "scrum7-current-a", Name: "Current A"},
		{ID: "scrum7-z", Slug: "scrum7-current-z", Name: "Current Z"},
	}
	for _, origin := range origins {
		var got []catalog.Category
		get(origin, "/api/categories", &got)
		if !reflect.DeepEqual(got, want) {
			t.Fatal("category visibility/order/parity acceptance failed")
		}
		var dashboard struct {
			Baskets []struct {
				Items []struct{ CategorySlug, CategoryName string }
			}
		}
		get(origin, "/api/dashboard", &dashboard)
		if len(dashboard.Baskets) != 3 {
			t.Fatal("fixture store baskets differ")
		}
		for _, basket := range dashboard.Baskets {
			if len(basket.Items) != 3 || basket.Items[1].CategorySlug != "sugar" || basket.Items[1].CategoryName != "Сахар" {
				t.Fatal("sugar slug/label parity acceptance failed")
			}
		}
	}
	var retained bool
	if admin.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM categories WHERE id='scrum7-other' AND slug='other')`).Scan(&retained) != nil || !retained {
		t.Fatal("legacy empty category was deleted instead of filtered")
	}
	t.Log("LOCAL Go/Nest PASS: current usable visible; old-only/out-of-stock/zero/negative/unpublished/empty-other hidden; slug ASC; sugar label")
}
