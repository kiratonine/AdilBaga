package httpapi

import (
	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/dashboard"
	"adilbaga/backend-go/internal/observability"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

type testRepository struct {
	err         error
	query       catalog.ProductQuery
	filterCalls int
}

func (r *testRepository) ListCategories(context.Context) ([]catalog.Category, error) {
	return []catalog.Category{{ID: "milk", Slug: "milk", Name: "Молоко"}}, r.err
}
func (r *testRepository) GetFilterSchema(_ context.Context, slug string) (catalog.FilterSchema, error) {
	r.filterCalls++
	if r.err != nil {
		return catalog.FilterSchema{}, r.err
	}
	if slug != "milk" {
		return catalog.FilterSchema{}, catalog.ErrNotFound
	}
	return catalog.FilterSchema{Category: slug, Filters: []catalog.FilterDefinition{
		{Key: "volumeMl", Label: "Volume", Type: "multi-select", Options: []json.RawMessage{json.RawMessage(`500`), json.RawMessage(`1000`)}},
		{Key: "brand", Label: "Brand", Type: "multi-select", Options: []json.RawMessage{json.RawMessage(`"A"`)}},
		{Key: "organic", Label: "Organic", Type: "boolean"},
	}}, nil
}
func (r *testRepository) ListProducts(_ context.Context, q catalog.ProductQuery) ([]catalog.Product, error) {
	r.query = q
	return []catalog.Product{}, r.err
}
func (r *testRepository) GetProductByID(_ context.Context, id string) (catalog.Product, error) {
	if id != "opaque" {
		return catalog.Product{}, catalog.ErrNotFound
	}
	return catalog.Product{ID: id, Name: "Milk", Attributes: map[string]json.RawMessage{}, Offers: []catalog.Offer{{StoreCode: catalog.DINA, StoreName: "Dina", Price: 100}}, MinPrice: 100, SnapshotAt: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)}, r.err
}
func (r *testRepository) GetDashboard(context.Context) (dashboard.Dashboard, error) {
	return dashboard.Dashboard{PriceSpreads: []dashboard.PriceSpread{}, Locations: []dashboard.Location{}, Baskets: []dashboard.Basket{}}, r.err
}
func testDependencies(db Pinger) Dependencies {
	repo := &testRepository{}
	return Dependencies{DB: db, Categories: repo, Products: repo, Dashboard: repo}
}

func TestReadHandlers(t *testing.T) {
	for _, tt := range []struct {
		path   string
		status int
	}{
		{"/api/categories", 200}, {"/api/categories/milk/filters", 200}, {"/api/categories/opaque/filters", 404},
		{"/api/products", 200}, {"/api/products?category=unknown", 200}, {"/api/products?category=unknown&x=1", 400},
		{"/api/products/opaque", 200}, {"/api/products/unknown", 404}, {"/api/dashboard", 200},
		{"/api/products?limit=101", 400}, {"/api/products?limit=0", 400}, {"/api/products?limit=1.5", 400},
		{"/api/products?offset=-1", 400}, {"/api/products?offset=9007199254740992", 400},
		{"/api/products?sort=", 400}, {"/api/products?sort=invalid", 400}, {"/api/products?volumeMl=1000", 400},
		{"/api/products?category=milk&unknown=1", 400},
	} {
		t.Run(tt.path, func(t *testing.T) {
			w := httptest.NewRecorder()
			Router(testConfig(), observability.New(&bytes.Buffer{}, "info"), testDependencies(pingFunc(func(context.Context) error { return nil }))).ServeHTTP(w, httptest.NewRequest("GET", tt.path, nil))
			if w.Code != tt.status || w.Header().Get("Content-Type") != "application/json" {
				t.Fatalf("status=%d", w.Code)
			}
			if tt.path == "/api/products/opaque" && !strings.Contains(w.Body.String(), `"snapshotAt":"2026-10-01T00:00:00.000Z"`) {
				t.Fatal("ISO milliseconds wire parity")
			}
		})
	}
	for _, path := range []string{"/api/categories", "/api/categories/milk/filters", "/api/products", "/api/products/opaque", "/api/dashboard"} {
		repo := &testRepository{err: errors.New("private-password/SQL/host")}
		w := httptest.NewRecorder()
		Router(testConfig(), observability.New(&bytes.Buffer{}, "info"), Dependencies{DB: pingFunc(func(context.Context) error { return nil }), Categories: repo, Products: repo, Dashboard: repo}).ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 500 || strings.Contains(w.Body.String(), "private") {
			t.Fatal("repository error leaked")
		}
	}
}
func TestProductQuery(t *testing.T) {
	schema, _ := (&testRepository{}).GetFilterSchema(t.Context(), "milk")
	for _, input := range []string{"", "category=+milk+&search=+abc+", "limit=100&offset=9007199254740991", "category=milk&volumeMl=0500&volumeMl=1000&organic=false&brand=A", "search=" + strings.Repeat("a", 201)} {
		values, _ := url.ParseQuery(input)
		q, err := parseProductQuery(values, schema.Filters)
		if err != nil {
			t.Fatal("valid rejected", input)
		}
		if input == "" && (q.Limit != 24 || q.Offset != 0 || q.Sort != catalog.PriceAsc) {
			t.Fatal("defaults")
		}
		if strings.Contains(input, "0500") && (len(q.Filters["volumeMl"]) != 2 || string(q.Filters["organic"][0]) != "false") {
			t.Fatal("typed OR/AND")
		}
	}
	for _, key := range []string{"category", "search", "sort", "limit", "offset"} {
		values := url.Values{key: {"1", "2"}}
		if _, err := parseProductQuery(values, nil); !errors.Is(err, catalog.ErrInvalidQuery) {
			t.Fatal("repeat accepted")
		}
	}
	for _, input := range []string{"limit=+1", "limit=-1", "limit=NaN", "limit=", "offset=1e2", "category=milk&organic=TRUE", "category=milk&organic=1", "category=milk&volumeMl=1e3", "category=milk&volumeMl=1000.", "category=milk&volumeMl=.5", "category=milk&volumeMl=999", "category=milk&brand=B"} {
		values, _ := url.ParseQuery(input)
		if _, err := parseProductQuery(values, schema.Filters); !errors.Is(err, catalog.ErrInvalidQuery) {
			t.Fatal("invalid accepted", input)
		}
	}
}
