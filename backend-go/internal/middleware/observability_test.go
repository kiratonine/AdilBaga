package middleware

import (
	"adilbaga/backend-go/internal/observability"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestAccessSignalsAndNoPublicMetrics(t *testing.T) {
	const marker = "private-request-563adf44093c15a7"
	var logs bytes.Buffer
	registry := observability.NewRegistry()
	r := chi.NewRouter()
	r.Use(RequestID, AccessLog(observability.New(&logs, "info"), registry))
	r.Get("/api/products/{id}", func(w http.ResponseWriter, req *http.Request) {
		status, _ := strconv.Atoi(req.URL.Query().Get("status"))
		w.WriteHeader(status)
	})
	for _, status := range []int{200, 400, 404, 429, 500, 503} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", "/api/products/"+marker+"?private="+marker+"&status="+strconv.Itoa(status), nil))
		if w.Code != status {
			t.Fatal("changed HTTP behavior")
		}
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/metrics", nil))
	if w.Code != 404 {
		t.Fatal("public metrics must not exist")
	}
	for _, line := range strings.Split(strings.TrimSpace(logs.String()), "\n") {
		var entry map[string]any
		if json.Unmarshal([]byte(line), &entry) != nil {
			t.Fatal("non JSON log")
		}
		status := int(entry["status"].(float64))
		if entry["error_code"] != observability.ErrorCode(status) {
			t.Fatal("error code mismatch")
		}
		for _, key := range []string{"timestamp", "level", "request_id", "route", "method", "status", "duration_ms", "error_code"} {
			if _, ok := entry[key]; !ok {
				t.Fatal("missing access field")
			}
		}
	}
	raw, _ := json.Marshal(registry.Snapshot())
	if strings.Contains(logs.String(), marker) || bytes.Contains(raw, []byte(marker)) {
		t.Fatal("access privacy")
	}
	if registry.Snapshot().Series["http|/api/products/{id}|GET|4xx"].Count != 3 || registry.Snapshot().Series["http|/api/products/{id}|GET|5xx"].Count != 2 {
		t.Fatal("status class counters")
	}
}
