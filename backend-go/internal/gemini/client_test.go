package gemini

import (
	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/voice"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"
)

func input() voice.Input {
	return voice.Input{Text: "private-voice-sentinel", Categories: []catalog.Category{{Slug: "milk"}}, Schemas: []catalog.FilterSchema{{Category: "milk", Filters: []catalog.FilterDefinition{{Key: "volumeMl", Type: "multi-select", Options: []json.RawMessage{[]byte("1000")}}}}}}
}

const valid = `{"intent":"cheapest","category":"milk","filters":{"volumeMl":1000}}`

func success(w http.ResponseWriter, raw string) {
	_ = json.NewEncoder(w).Encode(map[string]any{"candidates": []any{map[string]any{"content": map[string]any{"parts": []any{map[string]string{"text": raw}}}}}})
}
func TestFailover(t *testing.T) {
	for _, tt := range []struct {
		name          string
		status, calls int
		good          bool
	}{{"success", 200, 1, true}, {"429", 429, 2, true}, {"503", 503, 2, true}, {"400", 400, 1, false}, {"401", 401, 1, false}, {"403", 403, 1, false}, {"404", 404, 1, false}} {
		t.Run(tt.name, func(t *testing.T) {
			calls := []string{}
			bodies := [][]byte{}
			var logs bytes.Buffer
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls = append(calls, r.Header.Get("x-goog-api-key"))
				body, _ := io.ReadAll(r.Body)
				bodies = append(bodies, body)
				if len(calls) == 1 && tt.status != 200 {
					w.WriteHeader(tt.status)
					_, _ = w.Write([]byte("private-provider-body"))
					return
				}
				success(w, valid)
			}))
			defer server.Close()
			c := New([]string{" private-key-one ", "private-key-one", "", "private-key-two"}, "gemini-3.1-flash-lite", slog.New(slog.NewJSONHandler(&logs, nil)))
			c.endpoint = server.URL + "/"
			_, err := c.Parse(context.Background(), input())
			if (err == nil) != tt.good || len(calls) != tt.calls {
				t.Fatal("failover mismatch")
			}
			if !reflect.DeepEqual(calls, []string{"private-key-one", "private-key-two"}[:tt.calls]) {
				t.Fatal("key ordering")
			}
			for _, b := range bodies {
				if !bytes.Equal(b, bodies[0]) {
					t.Fatal("body changed")
				}
			}
			for _, sentinel := range []string{"private-key-one", "private-key-two", "private-provider-body", "private-voice-sentinel"} {
				if strings.Contains(logs.String(), sentinel) || (err != nil && strings.Contains(err.Error(), sentinel)) {
					t.Fatal("privacy leak")
				}
			}
		})
	}
}
func TestInvalidProviderOutput(t *testing.T) {
	for _, tt := range []struct {
		name, raw string
		envelope  bool
	}{{"body", "provider-private-body", false}, {"missing", `{"candidates":[]}`, false}, {"prose", "```json\n" + valid + "```", true}, {"bad structure", `{"intent":"buy","category":"milk","filters":{}}`, true}, {"nested", `{"intent":null,"category":"milk","filters":{"volumeMl":{}}}`, true}} {
		t.Run(tt.name, func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if tt.envelope {
					success(w, tt.raw)
				} else {
					_, _ = w.Write([]byte(tt.raw))
				}
			}))
			defer server.Close()
			c := New([]string{"key1", "key2"}, "model", nil)
			c.endpoint = server.URL + "/"
			if _, err := c.Parse(context.Background(), input()); err == nil || calls != 1 {
				t.Fatal("invalid output retried or accepted")
			}
		})
	}
}

type transport func(*http.Request) (*http.Response, error)

func (f transport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestNetworkAndSharedDeadline(t *testing.T) {
	c := New([]string{"one", "two", "three"}, "model", nil)
	c.timeout = 50 * time.Millisecond
	var deadlines []time.Time
	calls := 0
	c.http = &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
		calls++
		deadline, _ := r.Context().Deadline()
		deadlines = append(deadlines, deadline)
		if calls == 1 {
			return nil, errors.New("private-network-sentinel")
		}
		<-r.Context().Done()
		return nil, r.Context().Err()
	})}
	start := time.Now()
	_, err := c.Parse(context.Background(), input())
	if err == nil || calls != 2 || time.Since(start) > time.Second || !deadlines[0].Equal(deadlines[1]) {
		t.Fatal("deadline/network failover mismatch")
	}
}
func TestStructuredBody(t *testing.T) {
	raw, err := body(input())
	if err != nil {
		t.Fatal(err)
	}
	var body map[string]any
	_ = json.Unmarshal(raw, &body)
	generation := body["generationConfig"].(map[string]any)
	if generation["responseMimeType"] != "application/json" {
		t.Fatal("not structured")
	}
	for _, forbidden := range []string{"latitude", "longitude", "price", "storeCode", "DATABASE_URL"} {
		if bytes.Contains(raw, []byte(`"`+forbidden+`"`)) {
			t.Fatal("business/coordinate property leaked")
		}
	}
}
