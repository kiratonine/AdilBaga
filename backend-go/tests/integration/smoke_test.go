//go:build integration

package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"reflect"
	"sort"
	"strconv"
	"testing"
	"time"

	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/postgres"
)

func TestProductionClone(t *testing.T) {
	target := os.Getenv("SMOKE_DATABASE_URL")
	if target == "" {
		t.Skip("explicit local clone URL required")
	}
	if !localURL(target) {
		t.Fatal("clone smoke must target loopback")
	}
	u, _ := url.Parse(target)
	if u.User.Username() != "part04_api_login" {
		t.Fatal("clone repository must use restricted login")
	}
	smoke(t, target, false)
}
func TestLocalCloneParity(t *testing.T) {
	target := os.Getenv("SMOKE_DATABASE_URL")
	reference := os.Getenv("REFERENCE_API_BASE_URL")
	if target == "" || reference == "" {
		t.Skip("explicit local clone and reference API required")
	}
	u, err := url.Parse(reference)
	if err != nil || !localHost(u.Hostname()) || !localURL(target) {
		t.Fatal("local parity must use loopback DB/reference")
	}
	dbURL, _ := url.Parse(target)
	if dbURL.User.Username() != "part04_api_login" {
		t.Fatal("parity requires restricted login")
	}
	smoke(t, target, true)
}
func TestLiveReadOnlyParity(t *testing.T) {
	target := os.Getenv("LIVE_DATABASE_URL")
	if target == "" {
		t.Skip("explicit live read-only profile required")
	}
	if os.Getenv("LIVE_READONLY_CONFIRM") != "1" {
		t.Fatal("explicit LIVE_READONLY_CONFIRM=1 required")
	}
	if os.Getenv("REFERENCE_API_BASE_URL") == "" {
		t.Fatal("reference GET API required")
	}
	smoke(t, target, true)
}
func smoke(t *testing.T, target string, parity bool) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	pool, err := postgres.OpenReadOnly(ctx, target)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	db := &countedDB{pool: pool}
	repo := postgres.NewRepository(db)
	var policy string
	if err := pool.QueryRow(ctx, `SHOW default_transaction_read_only`).Scan(&policy); err != nil || policy != "on" {
		t.Fatal("read-only policy")
	}
	categories, err := repo.ListCategories(ctx)
	if err != nil || len(categories) < 6 {
		t.Fatal("categories smoke")
	}
	for i := 1; i < len(categories); i++ {
		if categories[i-1].Slug > categories[i].Slug {
			t.Fatal("category order")
		}
	}
	if parity {
		var actual []catalog.Category
		getJSON(t, ctx, "/api/categories", nil, &actual)
		if !reflect.DeepEqual(categories, actual) {
			t.Fatal("category parity")
		}
	}
	for _, order := range []catalog.Sort{catalog.PriceAsc, catalog.PriceDesc, catalog.NameAsc} {
		seen := map[string]bool{}
		total := 0
		for offset := int64(0); ; offset += 100 {
			db.count = 0
			page, err := repo.ListProducts(ctx, catalog.ProductQuery{Sort: order, Limit: 100, Offset: offset})
			if err != nil {
				t.Fatal(err)
			}
			if len(page) > 100 || db.count > 2 {
				t.Fatal("page bound/N+1")
			}
			if parity {
				var actual []catalog.Product
				getJSON(t, ctx, "/api/products", url.Values{"sort": {string(order)}, "limit": {"100"}, "offset": {strconv.FormatInt(offset, 10)}}, &actual)
				compareProducts(t, page, actual, order, offset)
			}
			for _, p := range page {
				if seen[p.ID] {
					t.Fatal("duplicate across pages")
				}
				seen[p.ID] = true
				if p.MinPrice <= 0 || len(p.Offers) == 0 || p.MinPrice != p.Offers[0].Price || p.SnapshotAt.IsZero() || p.SnapshotAt.Location() != time.UTC {
					t.Fatal("product invariants")
				}
				for i, o := range p.Offers {
					if o.Price <= 0 || (i > 0 && p.Offers[i-1].Price > o.Price) {
						t.Fatal("offer invariants")
					}
				}
			}
			if total == 0 && len(page) > 0 {
				detail, err := repo.GetProductByID(ctx, page[0].ID)
				if err != nil {
					t.Fatal(err)
				}
				compareProducts(t, []catalog.Product{detail}, page[:1], order, 0)
				if parity {
					var actual catalog.Product
					getJSON(t, ctx, "/api/products/"+url.PathEscape(detail.ID), nil, &actual)
					compareProducts(t, []catalog.Product{detail}, []catalog.Product{actual}, order, 0)
				}
			}
			total += len(page)
			if len(page) < 100 {
				break
			}
		}
		if total == 0 {
			t.Fatal("no usable products")
		}
		t.Logf("sort=%s all products=%d exact parity=%t", order, total, parity)
	}
	for _, c := range categories {
		schema, err := repo.GetFilterSchema(ctx, c.Slug)
		if err != nil {
			t.Fatal(err)
		}
		if parity {
			var actual catalog.FilterSchema
			getJSON(t, ctx, "/api/categories/"+url.PathEscape(c.Slug)+"/filters", nil, &actual)
			if !sameJSON(schema, actual) {
				t.Fatal("filter schema parity for " + c.Slug)
			}
		}
		var filter *catalog.FilterDefinition
		for i := range schema.Filters {
			if schema.Filters[i].Type == "multi-select" && len(schema.Filters[i].Options) > 0 {
				filter = &schema.Filters[i]
				break
			}
		}
		query := catalog.ProductQuery{Category: c.Slug, Limit: 100}
		params := url.Values{"category": {c.Slug}, "limit": {"100"}}
		if filter != nil {
			query.Filters = catalog.DynamicFilter{filter.Key: []json.RawMessage{filter.Options[0]}}
			var value any
			_ = json.Unmarshal(filter.Options[0], &value)
			params.Set(filter.Key, fmt.Sprint(value))
		}
		products, err := repo.ListProducts(ctx, query)
		if err != nil {
			t.Fatal(err)
		}
		for _, p := range products {
			if p.Category.Slug != c.Slug {
				t.Fatal("category SQL")
			}
			if filter != nil {
				var raw json.RawMessage
				if filter.Key == "brand" {
					raw, _ = json.Marshal(p.Brand)
				} else {
					raw = p.Attributes[filter.Key]
				}
				if !sameJSONRaw(raw, filter.Options[0]) {
					t.Fatal("actual filter value")
				}
			}
		}
		if parity {
			var actual []catalog.Product
			getJSON(t, ctx, "/api/products", params, &actual)
			compareProducts(t, products, actual, catalog.PriceAsc, 0)
		}
	}
	if parity {
		for _, search := range []string{"МОЛОКО", "%", "_", `\`, `Молок%`, `Молок_`, `\%`, `\_`, `literal%_\not-present`, `' OR true --`} {
			total := 0
			for offset := int64(0); ; offset += 100 {
				products, err := repo.ListProducts(ctx, catalog.ProductQuery{Search: search, Limit: 100, Offset: offset})
				if err != nil {
					t.Fatal(err)
				}
				var actual []catalog.Product
				getJSON(t, ctx, "/api/products", url.Values{"search": {search}, "limit": {"100"}, "offset": {strconv.FormatInt(offset, 10)}}, &actual)
				compareProducts(t, products, actual, catalog.PriceAsc, offset)
				total += len(products)
				if len(products) < 100 {
					break
				}
			}
			t.Logf("search=%q exact reference parity products=%d", search, total)
		}
	}
}
func getJSON(t *testing.T, ctx context.Context, path string, params url.Values, out any) {
	t.Helper()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, os.Getenv("REFERENCE_API_BASE_URL")+path+"?"+params.Encode(), nil)
	if err != nil {
		t.Fatal("reference URL invalid")
	}
	response, err := (&http.Client{Timeout: 15 * time.Second}).Do(request)
	if err != nil {
		t.Fatal("reference GET failed")
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatalf("reference GET status %d", response.StatusCode)
	}
	if json.NewDecoder(response.Body).Decode(out) != nil {
		t.Fatal("reference JSON invalid")
	}
}
func sameJSONRaw(a, b json.RawMessage) bool {
	var av, bv any
	return json.Unmarshal(a, &av) == nil && json.Unmarshal(b, &bv) == nil && reflect.DeepEqual(av, bv)
}
func sameJSON(a, b any) bool {
	ar, _ := json.Marshal(a)
	br, _ := json.Marshal(b)
	return sameJSONRaw(ar, br)
}
func compareProducts(t *testing.T, a, b []catalog.Product, order catalog.Sort, offset int64) {
	t.Helper()
	if !reflect.DeepEqual(ids(a), ids(b)) {
		t.Fatalf("ID order mismatch sort=%s offset=%d", order, offset)
	}
	for i := range a {
		// Frozen contract orders offers by price only, not tie order between stores.
		less := func(o []catalog.Offer) func(int, int) bool {
			return func(i, j int) bool {
				if o[i].Price != o[j].Price {
					return o[i].Price < o[j].Price
				}
				return o[i].StoreCode < o[j].StoreCode
			}
		}
		aa, bb := a[i], b[i]
		aa.Offers = append([]catalog.Offer(nil), aa.Offers...)
		bb.Offers = append([]catalog.Offer(nil), bb.Offers...)
		sort.Slice(aa.Offers, less(aa.Offers))
		sort.Slice(bb.Offers, less(bb.Offers))
		if !aa.SnapshotAt.Equal(bb.SnapshotAt) {
			t.Fatal("snapshot parity")
		}
		bb.SnapshotAt = aa.SnapshotAt
		if !sameJSON(aa, bb) {
			t.Fatalf("product semantic mismatch sort=%s page offset=%d index=%d", order, offset, i)
		}
	}
}
