//go:build integration

package integration

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"reflect"
	"testing"
)

func TestLocalContentTypeParity(t *testing.T) {
	bases := []string{os.Getenv("GO_API_BASE_URL"), os.Getenv("REFERENCE_API_BASE_URL")}
	if bases[0] == "" || bases[1] == "" || os.Getenv("HTTP_PARITY_CONFIRM") != "1" {
		t.Skip("explicit LOCAL HTTP parity required")
	}
	for _, base := range bases {
		u, err := url.Parse(base)
		if err != nil || u.Scheme != "http" || !localHost(u.Hostname()) || u.User != nil || u.Path != "" || u.RawQuery != "" {
			t.Fatal("credential-free loopback reference required")
		}
	}
	const text = "самое дешёвое молоко 1 литр 3.2%"
	body, _ := json.Marshal(map[string]any{"text": text, "latitude": 43.63798231415926, "longitude": 51.16918027182818})
	form := url.Values{"text": {text}, "latitude": {"43.63798231415926"}, "longitude": {"51.16918027182818"}}.Encode()
	for _, tt := range []struct {
		name, contentType string
		body              []byte
		status            int
	}{
		{"missing", "", body, 400}, {"text plain", "text/plain", body, 400},
		{"JSON body in form", "application/x-www-form-urlencoded", body, 400},
		{"malformed JSON", "application/json", []byte("{"), 400},
		{"JSON charset", "application/json; charset=utf-8", body, 201},
		{"valid legacy form", "application/x-www-form-urlencoded", []byte(form), 201},
	} {
		t.Run(tt.name, func(t *testing.T) {
			var results []any
			for _, base := range bases {
				ctx, cancel := boundedContext(t.Context(), operationBudget)
				req, err := http.NewRequestWithContext(ctx, "POST", base+"/api/voice/start", bytes.NewReader(tt.body))
				if err != nil {
					cancel()
					t.Fatal("request invalid")
				}
				if tt.contentType != "" {
					req.Header.Set("Content-Type", tt.contentType)
				}
				resp, err := (&http.Client{Timeout: operationBudget}).Do(req)
				if err != nil {
					cancel()
					t.Fatal("local reference request failed")
				}
				raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
				_ = resp.Body.Close()
				cancel()
				if err != nil || resp.StatusCode != tt.status {
					t.Fatalf("content-type class status=%d expected=%d", resp.StatusCode, tt.status)
				}
				var value any
				if json.Unmarshal(raw, &value) != nil {
					t.Fatal("response not JSON")
				}
				results = append(results, value)
			}
			if tt.status == 201 && !reflect.DeepEqual(results[0], results[1]) {
				t.Fatal("successful voice semantics changed")
			}
		})
	}
}
