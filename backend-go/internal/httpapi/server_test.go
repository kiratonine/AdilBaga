package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"adilbaga/backend-go/internal/config"
	"adilbaga/backend-go/internal/middleware"
	"adilbaga/backend-go/internal/observability"
)

type pingFunc func(context.Context) error

func (f pingFunc) Ping(ctx context.Context) error { return f(ctx) }
func testConfig() config.Config {
	return config.Config{Port: 8080, CORSOrigins: []string{"https://aktau.market"}, RateRPS: 20, RateBurst: 40}
}

func TestHealthAndRouting(t *testing.T) {
	for _, tt := range []struct {
		name, method, path string
		dbErr              bool
		status             int
		health             string
	}{
		{"live independent", "GET", "/health/live", true, 200, "ok"},
		{"ready", "GET", "/health/ready", false, 200, "ready"},
		{"not ready", "GET", "/health/ready", true, 503, "not_ready"},
		{"business route", "GET", "/api/categories", false, 200, ""},
		{"method mismatch", "POST", "/health/live", false, 405, ""},
	} {
		t.Run(tt.name, func(t *testing.T) {
			called := false
			db := pingFunc(func(ctx context.Context) error {
				called = true
				deadline, ok := ctx.Deadline()
				if !ok || time.Until(deadline) > ReadinessTimeout {
					t.Error("probe not bounded")
				}
				if tt.dbErr {
					return errors.New("sensitive-db-host-and-password")
				}
				return nil
			})
			w := httptest.NewRecorder()
			Router(testConfig(), observability.New(&bytes.Buffer{}, "info"), testDependencies(db)).ServeHTTP(w, httptest.NewRequest(tt.method, tt.path, nil))
			if w.Code != tt.status || w.Header().Get("Content-Type") != "application/json" || (tt.path != "/api/categories" && w.Header().Get("Cache-Control") != "no-store") {
				t.Fatalf("response %d %v", w.Code, w.Header())
			}
			if strings.Contains(w.Body.String(), "sensitive") {
				t.Fatal("DB details leaked")
			}
			var body any
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if tt.health != "" {
				if body.(map[string]any)["status"] != tt.health {
					t.Fatal("wrong health status")
				}
			} else if tt.path != "/api/categories" && (body.(map[string]any)["statusCode"] != float64(tt.status) || body.(map[string]any)["message"] != http.StatusText(tt.status)) {
				t.Fatal("wrong envelope")
			}
			if called != (tt.path == "/health/ready") {
				t.Fatal("unexpected DB check")
			}
		})
	}
}

func TestCORS(t *testing.T) {
	for _, tt := range []struct {
		name, origin, method, requested, headers string
		want                                     int
	}{
		{"absent", "", "GET", "", "", 200}, {"exact", "https://aktau.market", "GET", "", "", 200}, {"unknown", "https://evil.example", "GET", "", "", 403},
		{"suffix attack", "https://aktau.market.evil.example", "GET", "", "", 403},
		{"preflight", "https://aktau.market", "OPTIONS", "POST", "Content-Type,X-Request-ID", 204},
		{"bad method", "https://aktau.market", "OPTIONS", "DELETE", "", 403},
		{"bad header", "https://aktau.market", "OPTIONS", "GET", "Authorization", 403},
	} {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(tt.method, "/health/live", nil)
			if tt.origin != "" {
				r.Header.Set("Origin", tt.origin)
			}
			r.Header.Set("Access-Control-Request-Method", tt.requested)
			r.Header.Set("Access-Control-Request-Headers", tt.headers)
			w := httptest.NewRecorder()
			Router(testConfig(), observability.New(&bytes.Buffer{}, "info"), testDependencies(pingFunc(func(context.Context) error { return nil }))).ServeHTTP(w, r)
			if w.Code != tt.want {
				t.Fatalf("got %d", w.Code)
			}
			if tt.origin != "" && tt.want != 403 && w.Header().Get("Access-Control-Allow-Origin") != tt.origin {
				t.Fatal("allow origin mismatch")
			}
			if w.Header().Get("Access-Control-Allow-Credentials") != "" || !strings.Contains(w.Header().Get("Vary"), "Origin") {
				t.Fatal("unsafe CORS")
			}
		})
	}
}

func TestRateLimitAndHealthExemption(t *testing.T) {
	c := testConfig()
	c.RateRPS = .001
	c.RateBurst = 1
	h := Router(c, observability.New(&bytes.Buffer{}, "info"), testDependencies(pingFunc(func(context.Context) error { return nil })))
	for _, tt := range []struct {
		method, path string
		want         int
	}{{"GET", "/api/categories", 200}, {"GET", "/api/categories", 429}, {"GET", "/health/live", 200}, {"GET", "/health/ready", 200}, {"OPTIONS", "/unimplemented", 404}} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(tt.method, tt.path, nil))
		if w.Code != tt.want {
			t.Fatalf("%s %s got %d want %d", tt.method, tt.path, w.Code, tt.want)
		}
		if tt.want == 429 && !strings.Contains(w.Body.String(), `"statusCode":429`) {
			t.Fatal("non-JSON limiter error")
		}
	}
}

func TestServerTimeouts(t *testing.T) {
	s := Server(testConfig(), http.NotFoundHandler(), observability.New(&bytes.Buffer{}, "info"))
	if s.Addr != ":8080" || s.ReadHeaderTimeout != 5*time.Second || s.ReadTimeout != 15*time.Second || s.WriteTimeout != 20*time.Second || s.IdleTimeout != 60*time.Second || s.MaxHeaderBytes != 64<<10 || middleware.RequestTimeout != 15*time.Second || ShutdownTimeout != 10*time.Second {
		t.Fatal("server limits changed")
	}
}
