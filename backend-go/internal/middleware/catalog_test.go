package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"adilbaga/backend-go/internal/observability"
	"github.com/go-chi/chi/v5"
)

func TestCatalogDeadlineLogsAreRequestScoped(t *testing.T) {
	var logs bytes.Buffer
	metrics := observability.NewRegistry()
	r := chi.NewRouter()
	r.Use(RequestID, AccessLog(observability.New(&logs, "info"), metrics), Timeout)
	r.Get("/api/products", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(RequestIDValue(r.Context()), "-sql") {
			observability.RecordCatalogPhase(r.Context(), observability.Products, "statement_timeout", 5*time.Second)
			observability.RecordCatalogPhase(r.Context(), observability.Offers, "sql_cancel", time.Millisecond)
		}
		if !HandleRequestError(w, r, context.DeadlineExceeded) {
			t.Error("deadline was not handled")
		}
	})
	const total = 16
	var wg sync.WaitGroup
	for i := range total {
		wg.Go(func() {
			id := fmt.Sprintf("diag-%d", i)
			if i%2 == 0 {
				id += "-sql"
			}
			req := httptest.NewRequest("GET", "/api/products?brand=synthetic-private-marker", nil)
			req.Header.Set("X-Request-ID", id)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != 503 {
				t.Errorf("status=%d", w.Code)
			}
		})
	}
	wg.Wait()
	if strings.Contains(logs.String(), "synthetic-private-marker") {
		t.Fatal("private brand logged")
	}
	seen := make(map[string]bool)
	for line := range strings.SplitSeq(strings.TrimSpace(logs.String()), "\n") {
		var record map[string]any
		if json.Unmarshal([]byte(line), &record) != nil {
			t.Fatal("invalid JSON event")
		}
		if record["msg"] != "catalog_request_503" {
			continue
		}
		id, ok := record["request_id"].(string)
		if !ok || seen[id] || record["route"] != "/api/products" {
			t.Fatal("missing request, duplicate event or invalid route template")
		}
		seen[id] = true
		stage, reason := "unknown", "request_deadline"
		if strings.HasSuffix(id, "-sql") {
			stage, reason = "products", "statement_timeout"
		}
		if record["stage"] != stage || record["reason_class"] != reason {
			t.Fatal("failure attributed to the wrong request or phase")
		}
	}
	if len(seen) != total || metrics.Snapshot().Series["catalog_db|products|statement_timeout"].Count != total/2 {
		t.Fatal("missing bounded outcome observations")
	}
}
