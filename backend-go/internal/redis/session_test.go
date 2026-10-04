package redis

import (
	"adilbaga/backend-go/internal/voice"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestSessions(t *testing.T) {
	var stored string
	sets := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer private-token" {
			t.Error("auth")
		}
		var args []any
		if json.NewDecoder(r.Body).Decode(&args) != nil {
			t.Error("command")
		}
		if args[1] != "voice-session:private-session" {
			t.Error("key")
		}
		var result any
		switch args[0] {
		case "SET":
			if len(args) != 5 || args[3] != "EX" || args[4] != float64(600) {
				t.Error("TTL")
			}
			stored = args[2].(string)
			sets++
			result = "OK"
		case "GET":
			if stored != "" {
				result = stored
			}
		case "DEL":
			stored = ""
			result = 1
		default:
			t.Error("unauthorized command")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"result": result})
	}))
	defer server.Close()
	s := New(server.URL, "private-token")
	state := voice.Session{Parsed: voice.Parsed{Filters: map[string]json.RawMessage{"volumeMl": []byte("1000"), "boolean": []byte("true"), "brand": []byte(`"Brand"`)}}, Latitude: 1, Longitude: 2}
	ctx := context.Background()
	if err := s.Set(ctx, "private-session", state, voice.SessionTTL); err != nil || sets != 1 {
		t.Fatal("set")
	}
	got, found, err := s.Get(ctx, "private-session")
	if err != nil || !found || !reflect.DeepEqual(got, state) {
		t.Fatal("get typed state")
	}
	if s.Delete(ctx, "private-session") != nil {
		t.Fatal("delete")
	}
	_, found, err = s.Get(ctx, "private-session")
	if err != nil || found {
		t.Fatal("not absent")
	}
}
func TestUnavailable(t *testing.T) {
	for _, tt := range []struct {
		name   string
		status int
		body   string
	}{{"503", 503, "private-body"}, {"malformed", 200, "private-body"}, {"missing result", 200, "{}"}, {"error", 200, `{"error":"private-body"}`}, {"oversized", 200, strings.Repeat("x", MaxResponseBytes+1)}} {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.status)
				_, _ = w.Write([]byte(tt.body))
			}))
			defer server.Close()
			_, _, err := New(server.URL, "private-token").Get(context.Background(), "private-session")
			if !errors.Is(err, voice.ErrSessionUnavailable) || strings.Contains(err.Error(), "private") {
				t.Fatal("uncontrolled error")
			}
		})
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, _, err := New("http://127.0.0.1:1", "private-token").Get(ctx, "private-session")
	if !errors.Is(err, voice.ErrSessionUnavailable) {
		t.Fatal("cancel")
	}
	if New("", "").Set(context.Background(), "x", voice.Session{}, time.Second) != voice.ErrSessionUnavailable {
		t.Fatal("absent dependency")
	}
}
