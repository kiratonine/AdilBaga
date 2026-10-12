package httpapi

import (
	"adilbaga/backend-go/internal/observability"
	"bytes"
	"net/http/httptest"
	"testing"
)

func TestProductDiscoveryCalls(t *testing.T) {
	for _, tt := range []struct {
		query         string
		status, calls int
	}{
		{"", 200, 0},
		{"category=milk", 200, 0},
		{"category=unknown", 200, 0},
		{"category=milk&search=milk&sort=name_asc&limit=100&offset=9007199254740991", 200, 0},
		{"category=milk&limit=101", 400, 0},
		{"category=milk&limit=0", 400, 0},
		{"category=milk&offset=9007199254740992", 400, 0},
		{"category=milk&offset=-1", 400, 0},
		{"category=milk&category=milk", 400, 0},
		{"category=milk&search=a&search=b", 400, 0},
		{"category=milk&sort=price_asc&sort=price_desc", 400, 0},
		{"category=milk&limit=1&limit=2", 400, 0},
		{"category=milk&offset=0&offset=1", 400, 0},
		{"category=milk&volumeMl=0500&volumeMl=1000&organic=false&brand=A", 200, 1},
		{"category=milk&organic=true", 200, 1},
		{"category=milk&unknown=1", 400, 1},
		{"category=unknown&volumeMl=1000", 400, 1},
		{"category=milk&volumeMl=999", 400, 1},
		{"category=milk&volumeMl=1e3", 400, 1},
		{"category=milk&organic=TRUE", 400, 1},
		{"category=milk&brand=B", 400, 1},
		{"volumeMl=1000", 400, 0},
		{"category=milk&category=milk&volumeMl=1000", 400, 0},
	} {
		t.Run(tt.query, func(t *testing.T) {
			repo := &testRepository{}
			w := httptest.NewRecorder()
			Dependencies{Categories: repo, Products: repo}.products(w, httptest.NewRequest("GET", "/api/products?"+tt.query, nil))
			if w.Code != tt.status || repo.filterCalls != tt.calls {
				t.Fatalf("status=%d discovery_calls=%d; want %d/%d", w.Code, repo.filterCalls, tt.status, tt.calls)
			}
			if tt.query == "category=milk&volumeMl=0500&volumeMl=1000&organic=false&brand=A" {
				if len(repo.query.Filters["volumeMl"]) != 2 || string(repo.query.Filters["volumeMl"][0]) != "500" || string(repo.query.Filters["volumeMl"][1]) != "1000" || string(repo.query.Filters["organic"][0]) != "false" || string(repo.query.Filters["brand"][0]) != `"A"` {
					t.Fatal("typed repeated filters changed")
				}
			}
		})
	}
}

// Base-only requests must not depend on discovery availability.
func TestBaseProductsWithoutCategoryRepository(t *testing.T) {
	w := httptest.NewRecorder()
	repo := &testRepository{}
	Router(testConfig(), observability.New(&bytes.Buffer{}, "info"), Dependencies{Products: repo}).ServeHTTP(w, httptest.NewRequest("GET", "/api/products?category=milk", nil))
	if w.Code != 200 || repo.filterCalls != 0 {
		t.Fatal("base query attempted discovery")
	}
}
