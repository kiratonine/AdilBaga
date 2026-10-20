package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
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

func TestReadinessBudgetAndPrivateDiagnostics(t *testing.T) {
	if ReadinessTimeout != 5*time.Second {
		t.Fatal("readiness must allow a bounded cold path below the monitor's 8s budget")
	}
	for _, tt := range []struct {
		name, class string
		err         error
	}{
		{"deadline", "context_deadline", fmt.Errorf("private-host: %w", context.DeadlineExceeded)},
		{"cancelled", "context_cancelled", context.Canceled},
		{"network", "connection_unavailable", &net.OpError{Op: "dial", Net: "tcp", Err: errors.New("private-password")}},
		{"other", "readiness_failed", errors.New("postgres://private-user:private-password@private-host/db")},
	} {
		t.Run(tt.name, func(t *testing.T) {
			var logs bytes.Buffer
			h := Router(testConfig(), observability.New(&logs, "info"), testDependencies(pingFunc(func(context.Context) error { return tt.err })))
			w := httptest.NewRecorder()
			h.ServeHTTP(w, httptest.NewRequest("GET", "/health/ready", nil))
			if w.Code != 503 || w.Body.String() != "{\"status\":\"not_ready\"}\n" || w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("readiness failure envelope changed")
			}
			if strings.Contains(logs.String()+w.Body.String(), "private-") {
				t.Fatal("dependency details leaked")
			}
			found := false
			for _, line := range strings.Split(strings.TrimSpace(logs.String()), "\n") {
				var row map[string]any
				if err := json.Unmarshal([]byte(line), &row); err != nil {
					t.Fatal(err)
				}
				if row["msg"] == "readiness_failed" {
					found = row["error_class"] == tt.class && row["duration_ms"].(float64) >= 0
					for k := range row {
						if !map[string]bool{"timestamp": true, "level": true, "msg": true, "error_class": true, "duration_ms": true}[k] {
							t.Fatalf("unexpected diagnostic key %s", k)
						}
					}
				}
			}
			if !found {
				t.Fatal("missing bounded private failure classification")
			}
		})
	}
}

// Real loopback HTTP lifecycle, simulated dependency only: not a Supabase latency measurement.
func TestReadinessLoopbackColdAndOutage(t *testing.T) {
	for _, tt := range []struct {
		name   string
		delay  time.Duration
		status int
	}{
		{"healthy cold", 4500 * time.Millisecond, 200},
		{"outage", 0, 503},
	} {
		t.Run(tt.name, func(t *testing.T) {
			db := pingFunc(func(ctx context.Context) error {
				if tt.delay == 0 {
					<-ctx.Done()
					return ctx.Err()
				}
				timer := time.NewTimer(tt.delay)
				defer timer.Stop()
				select {
				case <-timer.C:
					return nil
				case <-ctx.Done():
					return ctx.Err()
				}
			})
			s := httptest.NewServer(Router(testConfig(), observability.New(io.Discard, "info"), testDependencies(db)))
			defer s.Close()
			client := &http.Client{Timeout: 8 * time.Second}
			start := time.Now()
			response, err := client.Get(s.URL + "/health/ready")
			if err != nil {
				t.Fatal(err)
			}
			response.Body.Close()
			elapsed := time.Since(start)
			t.Logf("status=%d duration_ms=%d", response.StatusCode, elapsed.Milliseconds())
			if response.StatusCode != tt.status || elapsed >= 8*time.Second {
				t.Fatal("cold path or outage budget violated")
			}
			response, err = client.Get(s.URL + "/health/live")
			if err != nil {
				t.Fatal(err)
			}
			response.Body.Close()
			if response.StatusCode != 200 {
				t.Fatal("dependency outage affected liveness")
			}
		})
	}
}

func TestReadinessHonorsParentCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	db := pingFunc(func(ctx context.Context) error { return ctx.Err() })
	w := httptest.NewRecorder()
	start := time.Now()
	Router(testConfig(), observability.New(io.Discard, "info"), testDependencies(db)).ServeHTTP(w, httptest.NewRequest("GET", "/health/ready", nil).WithContext(ctx))
	if w.Code != 503 || time.Since(start) > time.Second {
		t.Fatal("parent cancellation ignored")
	}
}
