package observability

import (
	"bytes"
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestBoundedPrivateConcurrentMetrics(t *testing.T) {
	r := NewRegistry()
	const marker = "sensitive-c42f71d19e3088d6"
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				r.HTTP(marker, marker, 503, time.Millisecond)
				r.Dependency(marker, marker, marker, time.Millisecond)
				r.Age(marker, time.Now(), time.Now())
			}
		}()
	}
	wg.Wait()
	r.RegisterPool(func() PoolStats { return PoolStats{Max: 4, Total: 2, Idle: 1, Acquired: 1} })
	s := r.Snapshot()
	if len(s.Series) != 2 || len(s.Gauges) != 0 || s.Pool.Max != 4 {
		t.Fatal("unbounded dimensions or invalid pool snapshot")
	}
	for _, h := range s.Series {
		if h.Count != 2000 || h.Failures != 2000 || h.Buckets[0] != 2000 {
			t.Fatal("lost concurrent observations")
		}
	}
	b, _ := json.Marshal(s)
	if strings.Contains(string(b), marker) {
		t.Fatal("private metric dimension retained")
	}
	s.Series["changed"] = Histogram{}
	if len(r.Snapshot().Series) != 2 {
		t.Fatal("snapshot aliases mutable registry")
	}
}

func TestAgesAndDependencySignals(t *testing.T) {
	r := NewRegistry()
	now := time.Unix(10000, 0)
	r.Age("", now, now.Add(-time.Hour))
	r.Age("DINA", now, now.Add(-time.Minute))
	r.Age("DANA", now, now.Add(time.Minute))
	r.Age("FIX_PRICE", now, time.Time{})
	for _, kind := range []string{"db", "redis", "gemini", "ingestion"} {
		operation := map[string]string{"db": "query", "redis": "get", "gemini": "parse", "ingestion": "publish"}[kind]
		r.Dependency(kind, operation, "failure", 10*time.Millisecond)
	}
	s := r.Snapshot()
	if s.Gauges["snapshot_age_seconds"] != 3600 || s.Gauges["source_age_seconds|DINA"] != 60 || s.Gauges["source_age_seconds|DANA"] != 0 || len(s.Gauges) != 3 || len(s.Series) != 4 {
		t.Fatal("invalid sampled age/dependency signals")
	}
}

func TestStructuredLoggerAndErrorCodes(t *testing.T) {
	var b bytes.Buffer
	New(&b, "info").Info("http_request", "request_id", "local", "route", "/api/products", "method", "GET", "status", 200, "duration_ms", 1, "error_code", "")
	var entry map[string]any
	if err := json.Unmarshal(b.Bytes(), &entry); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"timestamp", "level", "request_id", "route", "method", "status", "duration_ms", "error_code"} {
		if _, ok := entry[key]; !ok {
			t.Fatalf("missing log field %s", key)
		}
	}
	if _, ok := entry["time"]; ok {
		t.Fatal("legacy timestamp key")
	}
	for status, want := range map[int]string{200: "", 400: "bad_request", 404: "not_found", 429: "rate_limited", 500: "internal_error", 503: "service_unavailable"} {
		if ErrorCode(status) != want {
			t.Fatalf("classification status %d", status)
		}
	}
}
