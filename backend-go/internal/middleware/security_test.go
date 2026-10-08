package middleware

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"adilbaga/backend-go/internal/observability"
	"github.com/go-chi/chi/v5"
)

func TestSecurityHeadersAndPrivatePath(t *testing.T) {
	const marker = "privatepathqyrhbvzdmxwuknlcj"
	var logs bytes.Buffer
	router := chi.NewRouter()
	router.Use(SecurityHeaders, RequestID, NewIPResolver(nil).Middleware, AccessLog(observability.New(&logs, "info")))
	router.Get("/api/products/{id}", func(w http.ResponseWriter, r *http.Request) {
		if ClientIPValue(r.Context()) != "203.0.113.79" {
			t.Error("rate-limit client context lost")
		}
		w.WriteHeader(200)
	})
	for _, path := range []string{"/api/products/" + marker, "/" + marker + "?text=privatequeryqvgspmxyz"} {
		r := httptest.NewRequest("GET", path, nil)
		r.RemoteAddr = "203.0.113.79:9123"
		r.Header.Set("Authorization", "Bearer privateauthqthkz")
		r.Header.Set("Cookie", "privatecookieqwzkt")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		if w.Header().Get("X-Content-Type-Options") != "nosniff" || w.Header().Get("Referrer-Policy") != "no-referrer" || w.Header().Get("Strict-Transport-Security") != "" {
			t.Fatal("unsafe/missing headers")
		}
	}
	for _, sensitive := range []string{marker, "203.0.113.79", "client_ip", "privatequeryqvgspmxyz", "privateauthqthkz", "privatecookieqwzkt"} {
		if strings.Contains(logs.String(), sensitive) {
			t.Fatal("sensitive metadata leaked")
		}
	}
	if !strings.Contains(logs.String(), "/api/products/{id}") || !strings.Contains(logs.String(), "unmatched") {
		t.Fatal("route classification missing")
	}
}
