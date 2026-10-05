package observability

import (
	"math"
	"sync"
	"time"
)

// No exporter or public route. Every dimension is mapped into a closed set;
// neither duration samples nor arbitrary labels are retained.
var Default = NewRegistry()

type Histogram struct {
	Count    uint64    `json:"count"`
	Failures uint64    `json:"failures"`
	Seconds  float64   `json:"seconds"`
	Buckets  [8]uint64 `json:"buckets"`
}

// Buckets are exclusive: <=1ms,10ms,50ms,100ms,500ms,1s,5s,+Inf.
var bucketSeconds = [...]float64{.001, .01, .05, .1, .5, 1, 5}

type PoolStats struct {
	Max          int32 `json:"max_conns"`
	Total        int32 `json:"total_conns"`
	Acquired     int32 `json:"acquired_conns"`
	Idle         int32 `json:"idle_conns"`
	Constructing int32 `json:"constructing_conns"`
}
type MetricsSnapshot struct {
	Series map[string]Histogram `json:"series"`
	Gauges map[string]float64   `json:"gauges"`
	Pool   PoolStats            `json:"pool"`
}
type Registry struct {
	mu     sync.Mutex
	series map[string]Histogram
	gauges map[string]float64
	pool   func() PoolStats
}

func NewRegistry() *Registry {
	return &Registry{series: make(map[string]Histogram), gauges: make(map[string]float64)}
}
func oneOf(value string, options ...string) string {
	for _, option := range options {
		if value == option {
			return value
		}
	}
	return "other"
}
func (r *Registry) observe(key string, failed bool, duration time.Duration) {
	seconds := math.Max(0, duration.Seconds())
	r.mu.Lock()
	defer r.mu.Unlock()
	h := r.series[key]
	h.Count++
	if failed {
		h.Failures++
	}
	h.Seconds += seconds
	bucket := len(bucketSeconds)
	for i, limit := range bucketSeconds {
		if seconds <= limit {
			bucket = i
			break
		}
	}
	h.Buckets[bucket]++
	r.series[key] = h
}
func (r *Registry) HTTP(route, method string, status int, duration time.Duration) {
	route = oneOf(route, "/health/live", "/health/ready", "/api/categories", "/api/categories/{slug}/filters", "/api/products", "/api/products/{id}", "/api/dashboard", "/api/voice/start", "/api/voice/continue", "unmatched")
	method = oneOf(method, "GET", "POST", "OPTIONS", "HEAD", "PUT", "PATCH", "DELETE")
	class := "other"
	switch {
	case status >= 200 && status < 300:
		class = "2xx"
	case status >= 300 && status < 400:
		class = "3xx"
	case status >= 400 && status < 500:
		class = "4xx"
	case status >= 500 && status < 600:
		class = "5xx"
	}
	r.observe("http|"+route+"|"+method+"|"+class, status >= 400, duration)
}
func (r *Registry) Dependency(kind, operation, outcome string, duration time.Duration) {
	switch kind {
	case "db":
		operation = oneOf(operation, "query")
	case "redis":
		operation = oneOf(operation, "get", "set", "delete")
	case "gemini":
		operation = oneOf(operation, "parse", "outcome")
	case "ingestion":
		operation = oneOf(operation, "dry_run", "stage", "publish")
	default:
		kind = "other"
		operation = "other"
	}
	outcome = oneOf(outcome, "success", "failure", "timeout", "network_error", "bad_request", "rate_limited", "server_error", "auth_error", "invalid_output", "fallback")
	r.observe(kind+"|"+operation+"|"+outcome, outcome != "success", duration)
}
func (r *Registry) Age(store string, now, captured time.Time) {
	if captured.IsZero() {
		return
	}
	key := "snapshot_age_seconds"
	if store != "" {
		if oneOf(store, "DINA", "DANA", "FIX_PRICE") == "other" {
			return
		}
		key = "source_age_seconds|" + store
	}
	seconds := math.Max(0, now.Sub(captured).Seconds())
	r.mu.Lock()
	defer r.mu.Unlock()
	r.gauges[key] = seconds
}

// One numeric provider only; repeated registrations cannot grow retained state.
func (r *Registry) RegisterPool(provider func() PoolStats) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.pool = provider
}
func (r *Registry) Snapshot() MetricsSnapshot {
	r.mu.Lock()
	out := MetricsSnapshot{Series: make(map[string]Histogram, len(r.series)), Gauges: make(map[string]float64, len(r.gauges))}
	for key, h := range r.series {
		out.Series[key] = h
	}
	for key, g := range r.gauges {
		out.Gauges[key] = g
	}
	provider := r.pool
	r.mu.Unlock()
	if provider != nil {
		out.Pool = provider()
	}
	return out
}

// Fixed access-log taxonomy; no public DTO/error-body changes.
func ErrorCode(status int) string {
	switch status {
	case 400:
		return "bad_request"
	case 403:
		return "forbidden"
	case 404:
		return "not_found"
	case 405:
		return "method_not_allowed"
	case 413:
		return "payload_too_large"
	case 414:
		return "uri_too_long"
	case 429:
		return "rate_limited"
	case 500:
		return "internal_error"
	case 503:
		return "service_unavailable"
	}
	if status >= 400 && status < 500 {
		return "client_error"
	}
	if status >= 500 {
		return "internal_error"
	}
	return ""
}
