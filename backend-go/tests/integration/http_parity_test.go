//go:build integration

package integration

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"reflect"
	"testing"
)

// Explicit GET-only origins. No inferred endpoint, credentials or DB connection.
func TestHTTPParity(t *testing.T) {
	goBase, reference := os.Getenv("GO_API_BASE_URL"), os.Getenv("REFERENCE_API_BASE_URL")
	if goBase == "" || reference == "" || os.Getenv("HTTP_PARITY_CONFIRM") != "1" {
		t.Skip("explicit HTTP parity origins/confirmation required")
	}
	for _, base := range []string{goBase, reference} {
		u, err := url.Parse(base)
		if err != nil || u.Scheme != "http" || !localHost(u.Hostname()) || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
			t.Fatal("credential-free loopback HTTP origin required")
		}
	}
	get := func(base, path string, status int) any {
		t.Helper()
		ctx, cancel := boundedContext(t.Context(), operationBudget)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, "GET", base+path, nil)
		if err != nil {
			t.Fatal("request invalid")
		}
		resp, err := (&http.Client{Timeout: operationBudget}).Do(req)
		if err != nil {
			t.Fatal("HTTP parity GET transport/timeout")
		}
		defer resp.Body.Close()
		if resp.StatusCode != status || resp.Header.Get("Content-Type") == "" {
			t.Fatalf("HTTP parity status %d expected %d", resp.StatusCode, status)
		}
		raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
		if err != nil {
			t.Fatal("HTTP body read failed")
		}
		var value any
		if json.Unmarshal(raw, &value) != nil {
			t.Fatal("HTTP JSON invalid")
		}
		if status >= 400 {
			body, ok := value.(map[string]any)
			if !ok || body["statusCode"] != float64(status) {
				t.Fatal("ApiError status mismatch")
			}
			switch m := body["message"].(type) {
			case string:
				if m == "" {
					t.Fatal("empty error")
				}
			case []any:
				for _, s := range m {
					if _, ok := s.(string); !ok {
						t.Fatal("ApiError message shape")
					}
				}
			default:
				t.Fatal("ApiError message missing")
			}
			for _, key := range []string{"stack", "code", "password", "token", "query", "sql"} {
				if _, ok := body[key]; ok {
					t.Fatal("private error field")
				}
			}
		}
		return value
	}
	compare := func(path string, status int) any {
		t.Helper()
		a, b := get(goBase, path, status), get(reference, path, status)
		if status == 200 && !reflect.DeepEqual(a, b) {
			t.Fatal("HTTP DTO/order mismatch at " + pathName(path))
		}
		return a
	}
	categories := compare("/api/categories", 200).([]any)
	compare("/api/products", 200)
	compare("/api/products?limit=100", 200)
	compare("/api/products?limit=24&offset=1", 200)
	total := 0
	scan := func(params url.Values) int {
		seen := map[string]bool{}
		for page := 0; page < pageCeiling(total); page++ {
			params.Set("limit", "100")
			params.Set("offset", fmt.Sprint(page*100))
			items := compare("/api/products?"+params.Encode(), 200).([]any)
			for _, v := range items {
				id := v.(map[string]any)["id"].(string)
				if seen[id] {
					t.Fatal("duplicate HTTP page ID")
				}
				seen[id] = true
			}
			if len(items) < 100 {
				return len(seen)
			}
		}
		t.Fatal("HTTP pagination ceiling exhausted")
		return 0
	}
	for _, sort := range []string{"price_asc", "price_desc", "name_asc"} {
		t.Run(sort, func(t *testing.T) {
			n := scan(url.Values{"sort": {sort}})
			if total == 0 {
				total = n
			}
			if n != total {
				t.Fatal("sort population differs")
			}
			t.Logf("exact all-product HTTP parity sort=%s products=%d", sort, n)
		})
	}
	for _, entry := range categories {
		category := entry.(map[string]any)["slug"].(string)
		t.Run("filters_"+category, func(t *testing.T) {
			schema := compare("/api/categories/"+url.PathEscape(category)+"/filters", 200).(map[string]any)
			compare("/api/products?category="+url.QueryEscape(category), 200)
			filters := schema["filters"].([]any)
			q := url.Values{"category": {category}, "limit": {"100"}}
			chosen := 0
			for _, item := range filters {
				d := item.(map[string]any)
				key := d["key"].(string)
				options, _ := d["options"].([]any)
				if d["type"] == "boolean" && len(options) == 0 {
					options = []any{true, false}
				}
				if len(options) == 0 {
					continue
				}
				single := url.Values{"category": {category}, "limit": {"100"}}
				for _, option := range options[:min(2, len(options))] {
					single.Add(key, fmt.Sprint(option))
				}
				products := compare("/api/products?"+single.Encode(), 200).([]any)
				if len(products) > 0 {
					id := products[0].(map[string]any)["id"].(string)
					compare("/api/products/"+url.PathEscape(id), 200)
				}
				if chosen < 2 {
					q.Set(key, fmt.Sprint(options[0]))
					chosen++
				}
				compare("/api/products?category="+url.QueryEscape(category)+"&"+url.QueryEscape(key)+"=__invalid_option__", 400)
			}
			if chosen > 0 {
				compare("/api/products?"+q.Encode(), 200)
			}
		})
	}
	for _, term := range []string{"МОЛОКО", "%", "_", `\`, "Молок%", "Молок_", `\%`, `\_`, `literal%_\not-present`, `' OR true --`} {
		t.Run("search_"+fmt.Sprint(len(term))+"_"+url.QueryEscape(term), func(t *testing.T) {
			n := scan(url.Values{"search": {term}})
			t.Logf("exact search parity products=%d", n)
		})
	}
	for _, query := range []string{"limit=101", "limit=0", "limit=1.5", "offset=-1", "offset=9007199254740992", "sort=invalid", "limit=1&limit=2", "category=milk&category=milk", "search=a&search=b", "sort=price_asc&sort=price_desc", "offset=0&offset=1", "category=milk&unknownFilter=1", "volumeMl=1000", "category=unknown&someDynamicKey=1"} {
		compare("/api/products?"+query, 400)
	}
	compare("/api/products/opaque-unknown-http-parity", 404)
	compare("/api/categories/unknown-http-parity/filters", 404)
	compare("/api/dashboard", 200)
	t.Logf("GET-only catalog/dashboard HTTP parity complete: categories=%d products=%d", len(categories), total)
}
func pathName(path string) string {
	for i, c := range path {
		if c == '?' {
			return path[:i]
		}
	}
	return path
}
