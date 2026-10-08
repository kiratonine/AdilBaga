//go:build integration

package integration

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"reflect"
	"testing"
)

// Security probes are GET-only, synthetic, and restricted to explicit loopback
// servers using the same disposable dataset. No production profile is inferred.
func TestLocalSecurityQueryParity(t *testing.T) {
	bases := []string{os.Getenv("REFERENCE_API_BASE_URL"), os.Getenv("GO_API_BASE_URL")}
	if bases[0] == "" || bases[1] == "" || os.Getenv("HTTP_PARITY_CONFIRM") != "1" {
		t.Skip("explicit LOCAL HTTP security parity required")
	}
	for _, base := range bases {
		u, err := url.Parse(base)
		if err != nil || u.Scheme != "http" || !localHost(u.Hostname()) || u.User != nil || u.Path != "" || u.RawQuery != "" {
			t.Fatal("credential-free loopback origin required")
		}
	}
	for _, tt := range []struct {
		name, query string
		status      int
	}{
		{"quoted injection", "search=" + url.QueryEscape(`' OR true --`), 200},
		{"encoded semicolon", "search=" + url.QueryEscape(`'; SELECT pg_sleep(1); --`), 200},
		{"comment", "search=" + url.QueryEscape(`/* harmless */`), 200},
		{"unknown dynamic key", "category=milk&unknownKey=1", 400},
		{"repeated pagination", "limit=1&limit=2", 400},
		{"canonical literal semicolon", "search=a%3Bb", 200},
	} {
		t.Run(tt.name, func(t *testing.T) {
			var values []any
			for _, base := range bases {
				ctx, cancel := boundedContext(t.Context(), operationBudget)
				req, err := http.NewRequestWithContext(ctx, "GET", base+"/api/products?"+tt.query, nil)
				if err != nil {
					cancel()
					t.Fatal("local request invalid")
				}
				resp, err := (&http.Client{Timeout: operationBudget}).Do(req)
				if err != nil {
					cancel()
					t.Fatal("local transport failed")
				}
				raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
				_ = resp.Body.Close()
				cancel()
				if err != nil || resp.StatusCode != tt.status {
					t.Fatalf("security wire parity status=%d expected=%d", resp.StatusCode, tt.status)
				}
				var value any
				if json.Unmarshal(raw, &value) != nil {
					t.Fatal("response not JSON")
				}
				values = append(values, value)
			}
			if tt.status == 200 && !reflect.DeepEqual(values[0], values[1]) {
				t.Fatal("security query response mismatch")
			}
		})
		if t.Failed() {
			return
		}
	}
	t.Run("Go rejects noncanonical raw semicolon", func(t *testing.T) {
		ctx, cancel := boundedContext(t.Context(), operationBudget)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, "GET", bases[1]+"/api/products?search=a;b", nil)
		if err != nil {
			t.Fatal("local request invalid")
		}
		resp, err := (&http.Client{Timeout: operationBudget}).Do(req)
		if err != nil {
			t.Fatal("local transport failed")
		}
		defer resp.Body.Close()
		var envelope struct {
			StatusCode int    `json:"statusCode"`
			Message    string `json:"message"`
			Error      string `json:"error"`
		}
		if resp.StatusCode != http.StatusBadRequest || json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&envelope) != nil || envelope.StatusCode != 400 || envelope.Message == "" || envelope.Error == "" {
			t.Fatal("noncanonical query must return compatible JSON 400")
		}
	})
}
