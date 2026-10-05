package gemini

import (
	"adilbaga/backend-go/internal/observability"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestParseMetricsPrivacy(t *testing.T) {
	for _, good := range []bool{true, false} {
		var logs bytes.Buffer
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if good {
				success(w, valid)
			} else {
				w.WriteHeader(503)
				_, _ = w.Write([]byte("private-provider-body"))
			}
		}))
		c := New([]string{"private-key"}, "model", observability.New(&logs, "info"))
		c.endpoint = server.URL + "/"
		c.metrics = observability.NewRegistry()
		_, err := c.Parse(context.Background(), input())
		server.Close()
		if (err == nil) != good {
			t.Fatal("parse outcome")
		}
		class, outcome := "failure", "server_error"
		if good {
			class, outcome = "success", "success"
		}
		s := c.metrics.Snapshot()
		if s.Series["gemini|parse|"+class].Count != 1 || s.Series["gemini|outcome|"+outcome].Count != 1 {
			t.Fatal("missing parse/outcome signals")
		}
		raw, _ := json.Marshal(s)
		for _, secret := range []string{"private-key", "private-voice-sentinel", "private-provider-body"} {
			if strings.Contains(logs.String(), secret) || bytes.Contains(raw, []byte(secret)) {
				t.Fatal("provider observability privacy")
			}
		}
	}
}
