//go:build integration

package postgres

import (
	"context"
	"encoding/json"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"adilbaga/backend-go/internal/catalog"
	"github.com/jackc/pgx/v5"
)

func TestLocalClonePlans(t *testing.T) {
	value := os.Getenv("SMOKE_DATABASE_URL")
	if value == "" {
		t.Skip("explicit local clone required")
	}
	local := func(host string) bool { return host == "127.0.0.1" || host == "localhost" || host == "::1" }
	u, err := url.Parse(value)
	if err != nil || !local(u.Hostname()) {
		t.Fatal("EXPLAIN ANALYZE must be local")
	}
	c, err := pgx.ParseConfig(value)
	if err != nil || !local(c.Host) {
		t.Fatal("EXPLAIN ANALYZE target must be local")
	}
	for _, fallback := range c.Fallbacks {
		if !local(fallback.Host) {
			t.Fatal("EXPLAIN ANALYZE fallback target must be local")
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := OpenReadOnly(ctx, value)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	repo := NewRepository(pool)
	categories, err := repo.ListCategories(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var slug, categoryID, key string
	var option json.RawMessage
	for _, c := range categories {
		schema, err := repo.GetFilterSchema(ctx, c.Slug)
		if err != nil {
			t.Fatal(err)
		}
		for _, f := range schema.Filters {
			if f.Type == "multi-select" && len(f.Options) > 0 {
				slug = c.Slug
				categoryID = c.ID
				key = f.Key
				option = f.Options[0]
				break
			}
		}
		if slug != "" {
			break
		}
	}
	products, err := repo.ListProducts(ctx, catalog.ProductQuery{Limit: 1})
	if err != nil || len(products) == 0 || slug == "" {
		t.Fatal("plan inputs unavailable")
	}
	filter, _ := json.Marshal(catalog.DynamicFilter{key: []json.RawMessage{option}})
	snapshot, err := repo.LatestPublishedSnapshot(ctx)
	if err != nil {
		t.Fatal("plan snapshot unavailable")
	}
	priceAsc, _ := sortSQL(catalog.PriceAsc)
	priceDesc, _ := sortSQL(catalog.PriceDesc)
	nameAsc, _ := sortSQL(catalog.NameAsc)
	cases := []struct {
		name string
		sql  string
		args []any
	}{
		{"default", productBaseSQL + priceAsc + ` LIMIT $5 OFFSET $6`, []any{"", "", "{}", "", 24, 0, snapshot.ID}},
		{"category", productBaseSQL + priceAsc + ` LIMIT $5 OFFSET $6`, []any{slug, "", "{}", "", 24, 0, snapshot.ID}},
		{"search", productBaseSQL + priceAsc + ` LIMIT $5 OFFSET $6`, []any{"", "молоко", "{}", "", 24, 0, snapshot.ID}},
		{"filter", productBaseSQL + priceAsc + ` LIMIT $5 OFFSET $6`, []any{slug, "", string(filter), "", 24, 0, snapshot.ID}},
		{"price_desc", productBaseSQL + priceDesc + ` LIMIT $5 OFFSET $6`, []any{"", "", "{}", "", 24, 0, snapshot.ID}},
		{"name_asc", productBaseSQL + nameAsc + ` LIMIT $5 OFFSET $6`, []any{"", "", "{}", "", 24, 0, snapshot.ID}},
		{"detail", productBaseSQL + `ORDER BY id COLLATE "ru-x-icu" ASC LIMIT $5 OFFSET $6`, []any{"", "", "{}", products[0].ID, 1, 0, snapshot.ID}},
		{"filters", discoverySQL, []any{categoryID, []string{key}, snapshot.ID}},
		{"offers", offersSQL, []any{[]string{products[0].ID}, snapshot.ID}},
		{"latest_snapshot", latestSnapshotSQL, nil},
		{"price_history", priceHistorySQL, []any{products[0].ID, "DINA", 100}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var raw []byte
			if err := pool.QueryRow(ctx, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) `+c.sql, c.args...).Scan(&raw); err != nil {
				t.Fatal(databaseError(err))
			}
			var plans []map[string]json.RawMessage
			if json.Unmarshal(raw, &plans) != nil || len(plans) != 1 {
				t.Fatal("invalid plan")
			}
			var plan map[string]json.RawMessage
			if json.Unmarshal(plans[0]["Plan"], &plan) != nil {
				t.Fatal("invalid node")
			}
			var nodes []string
			var indexes []string
			var relations []string
			var visits []string
			var visit func(map[string]json.RawMessage)
			visit = func(n map[string]json.RawMessage) {
				var node, idx, rel string
				_ = json.Unmarshal(n["Node Type"], &node)
				_ = json.Unmarshal(n["Index Name"], &idx)
				_ = json.Unmarshal(n["Relation Name"], &rel)
				nodes = append(nodes, node)
				if idx != "" {
					indexes = append(indexes, idx)
				}
				if rel != "" {
					relations = append(relations, rel)
				}
				visits = append(visits, fmtNode(n, node))
				var children []map[string]json.RawMessage
				_ = json.Unmarshal(n["Plans"], &children)
				for _, child := range children {
					visit(child)
				}
			}
			visit(plan)
			for _, rel := range relations {
				if rel == "raw_products" || rel == "product_mappings" {
					t.Fatal("runtime scanned ingestion tables")
				}
			}
			if c.name != "filters" && c.name != "offers" && !strings.Contains(strings.Join(nodes, ","), "Limit") {
				t.Fatal("SQL LIMIT missing")
			}
			t.Logf("planning_ms=%s execution_ms=%s nodes=%v indexes=%v rows/loops=%v", plans[0]["Planning Time"], plans[0]["Execution Time"], nodes, indexes, visits)
		})
	}
}
func fmtNode(n map[string]json.RawMessage, node string) string {
	return node + ":rows=" + string(n["Actual Rows"]) + "/loops=" + string(n["Actual Loops"]) + "/removed=" + string(n["Rows Removed by Filter"])
}
