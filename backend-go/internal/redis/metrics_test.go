package redis

import (
	"adilbaga/backend-go/internal/observability"
	"adilbaga/backend-go/internal/voice"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSessionMetricsPrivacy(t *testing.T) {
	const marker = "private-session-751ed569a3939b4f"
	var logs bytes.Buffer
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) }))
	defer server.Close()
	s := New(server.URL, marker, observability.New(&logs, "info"))
	s.metrics = observability.NewRegistry()
	_ = s.Set(context.Background(), marker, voice.Session{}, voice.SessionTTL)
	_, _, _ = s.Get(context.Background(), marker)
	_ = s.Delete(context.Background(), marker)
	snapshot := s.metrics.Snapshot()
	for _, op := range []string{"set", "get", "delete"} {
		h := snapshot.Series["redis|"+op+"|failure"]
		if h.Count != 1 || h.Failures != 1 {
			t.Fatal("missing dependency observation")
		}
	}
	raw, _ := json.Marshal(snapshot)
	if strings.Contains(logs.String(), marker) || bytes.Contains(raw, []byte(marker)) || strings.Contains(logs.String(), sessionKey(marker)) {
		t.Fatal("session observability privacy failed")
	}
	if !strings.Contains(logs.String(), `"error_code":"redis_unavailable"`) {
		t.Fatal("missing safe error code")
	}
}
