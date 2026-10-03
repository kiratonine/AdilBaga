package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"sync"
	"testing"
	"time"

	"adilbaga/backend-go/internal/observability"
)

func TestProxy(t *testing.T) {
	trusted := NewIPResolver([]netip.Prefix{netip.MustParsePrefix("10.0.0.0/8")})
	for _, tt := range []struct{ name, peer, cf, xff, want string }{
		{"untrusted", "192.0.2.5:12", "203.0.113.10", "203.0.113.11", "192.0.2.5"},
		{"trusted cf", "10.0.0.5:12", "203.0.113.10", "203.0.113.11", "203.0.113.10"},
		{"trusted xff", "10.0.0.5:12", "", "203.0.113.11, 10.0.0.2", "203.0.113.11"},
		{"spoofed leftmost", "10.0.0.5:12", "", "203.0.113.11, 192.0.2.9", "192.0.2.9"},
		{"malformed cf", "10.0.0.5:12", "bad", "203.0.113.11", "10.0.0.5"},
		{"malformed xff", "10.0.0.5:12", "", "bad, 203.0.113.11", "10.0.0.5"},
		{"ipv6", "[2001:db8::1]:12", "203.0.113.10", "", "2001:db8::1"},
		{"mapped peer", "[::ffff:192.0.2.5]:12", "203.0.113.10", "", "192.0.2.5"},
		{"invalid peer", "bad", "203.0.113.10", "", "unknown"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/", nil)
			r.RemoteAddr = tt.peer
			r.Header.Set("CF-Connecting-IP", tt.cf)
			if tt.cf == "" {
				r.Header.Del("CF-Connecting-IP")
			}
			r.Header.Set("X-Forwarded-For", tt.xff)
			if got := trusted.Resolve(r); got != tt.want {
				t.Fatalf("got %s want %s", got, tt.want)
			}
		})
	}
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "10.0.0.1:12"
	r.Header.Set("CF-Connecting-IP", "203.0.113.1")
	if got := NewIPResolver(nil).Resolve(r); got != "10.0.0.1" {
		t.Fatal("forwarding trusted by default")
	}
}

func TestRequestID(t *testing.T) {
	for _, id := range []string{"", "safe-ID_123.abc", "bad value", strings.Repeat("a", 65), "кириллица"} {
		t.Run(id, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/", nil)
			if id != "" {
				r.Header.Set("X-Request-ID", id)
			}
			w := httptest.NewRecorder()
			RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if RequestIDValue(r.Context()) != w.Header().Get("X-Request-ID") {
					t.Error("ID not in context")
				}
				w.WriteHeader(204)
			})).ServeHTTP(w, r)
			got := w.Header().Get("X-Request-ID")
			if !safeID(got) {
				t.Fatal("unsafe/generated ID missing")
			}
			if safeID(id) && got != id {
				t.Fatal("safe ID not echoed")
			}
			if !safeID(id) && got == id {
				t.Fatal("unsafe ID echoed")
			}
		})
	}
}

func TestLimits(t *testing.T) {
	for _, tt := range []struct {
		name   string
		length int
		known  bool
		want   int
	}{
		{"known oversized", MaxBodyBytes + 1, true, 413}, {"chunked oversized", MaxBodyBytes + 1, false, 413}, {"exact limit", MaxBodyBytes, false, 204},
	} {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "/", strings.NewReader(strings.Repeat("a", tt.length)))
			if !tt.known {
				r.ContentLength = -1
			}
			w := httptest.NewRecorder()
			Limits(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) })).ServeHTTP(w, r)
			if w.Code != tt.want {
				t.Fatalf("got %d", w.Code)
			}
		})
	}
	for _, n := range []int{MaxURIBytes, MaxURIBytes + 1} {
		r := httptest.NewRequest("GET", "/", nil)
		r.RequestURI = "/" + strings.Repeat("a", n-1)
		w := httptest.NewRecorder()
		Limits(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) })).ServeHTTP(w, r)
		want := 204
		if n > MaxURIBytes {
			want = 414
		}
		if w.Code != want {
			t.Fatalf("URI length %d status %d", n, w.Code)
		}
	}
}

func TestRecoveryLogging(t *testing.T) {
	var logs bytes.Buffer
	logger := observability.New(&logs, "info")
	h := RequestID(NewIPResolver(nil).Middleware(AccessLog(logger)(Recover(logger)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("sensitive-panic") })))))
	r := httptest.NewRequest("POST", "/panic?token=sensitive-query", strings.NewReader("sensitive-body"))
	r.Header.Set("Authorization", "sensitive-auth")
	r.Header.Set("Cookie", "sensitive-cookie")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 500 || strings.Contains(w.Body.String(), "sensitive") {
		t.Fatal("unsafe panic response")
	}
	if strings.Contains(logs.String(), "sensitive") || strings.Contains(logs.String(), "token=") {
		t.Fatal("logs contain sensitive data")
	}
	lines := strings.Split(strings.TrimSpace(logs.String()), "\n")
	if len(lines) != 2 {
		t.Fatalf("log count %d", len(lines))
	}
	for _, line := range lines {
		var entry map[string]any
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Fatal(err)
		}
		if entry["request_id"] != w.Header().Get("X-Request-ID") || entry["path"] != "/panic" {
			t.Fatal("missing safe metadata")
		}
	}
}

func TestRecoveryAfterWrite(t *testing.T) {
	w := httptest.NewRecorder()
	Recover(observability.New(&bytes.Buffer{}, "info"))(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(202); panic("secret") })).ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != 202 || w.Body.Len() != 0 {
		t.Fatal("recovery wrote a second response")
	}
}

func TestTimeoutContext(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	Timeout(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		deadline, ok := r.Context().Deadline()
		if !ok || time.Until(deadline) > RequestTimeout || time.Until(deadline) < RequestTimeout-time.Second {
			t.Error("deadline missing/wrong")
		}
		w.WriteHeader(204)
	})).ServeHTTP(httptest.NewRecorder(), r)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	w := httptest.NewRecorder()
	Timeout(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})).ServeHTTP(w, r.WithContext(ctx))
	if w.Code != 503 {
		t.Fatal("canceled unwritten request not rejected")
	}
}

func TestBoundedLimiter(t *testing.T) {
	l := NewLimiter(20, 1)
	now := time.Now()
	for i := 0; i < MaxRateClients; i++ {
		if !l.allow(fmt.Sprint(i), now) {
			t.Fatal("capacity reached early")
		}
	}
	if l.allow("overflow", now) || len(l.clients) != MaxRateClients {
		t.Fatal("unbounded limiter")
	}
	if l.allow("0", now) {
		t.Fatal("tokens reset")
	}
	if !l.allow("new", now.Add(RateIdleTTL+time.Second)) || len(l.clients) != 1 {
		t.Fatal("idle entries not expired")
	}
}

func TestConcurrentLimiter(t *testing.T) {
	l := NewLimiter(1, 5)
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Go(func() { l.allow("same-client", time.Now()) })
	}
	wg.Wait()
	if len(l.clients) != 1 {
		t.Fatal("duplicate client entries")
	}
}
