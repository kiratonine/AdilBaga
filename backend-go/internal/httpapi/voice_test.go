package httpapi

import (
	"adilbaga/backend-go/internal/observability"
	"adilbaga/backend-go/internal/voice"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeVoice struct {
	calls int
	err   error
	panic bool
}

func (f *fakeVoice) Start(_ context.Context, r voice.StartRequest) (voice.Response, error) {
	f.calls++
	if f.panic {
		panic("private-panic-text")
	}
	return voice.Response{Status: "result", Mode: "single", Items: []voice.Item{}, Speech: "Подходящих товаров не найдено."}, f.err
}
func (f *fakeVoice) Continue(_ context.Context, r voice.ContinueRequest) (voice.Response, error) {
	f.calls++
	return voice.Response{}, f.err
}
func TestVoiceHTTP(t *testing.T) {
	for _, tt := range []struct {
		name, path, body string
		status           int
	}{
		{"numbers", "start", `{"text":"private-text","latitude":43.6,"longitude":51.1}`, 201},
		{"strings", "start", `{"text":"private-text","latitude":" 43.6 ","longitude":"5.11e1"}`, 201},
		{"low", "start", `{"text":"private-text","latitude":-90,"longitude":-180}`, 201},
		{"high", "start", `{"text":"private-text","latitude":90,"longitude":180}`, 201},
		{"opaque", "continue", `{"sessionId":"not uuid / opaque","text":"private-text"}`, 201},
		{"blank", "start", `{"text":" ","latitude":0,"longitude":0}`, 400},
		{"null", "start", `{"text":null,"latitude":0,"longitude":0}`, 400},
		{"wrong text", "start", `{"text":1,"latitude":0,"longitude":0}`, 400},
		{"lat", "start", `{"text":"x","latitude":91,"longitude":0}`, 400},
		{"lon", "start", `{"text":"x","latitude":0,"longitude":181}`, 400},
		{"nan", "start", `{"text":"x","latitude":"NaN","longitude":0}`, 400},
		{"infinity", "start", `{"text":"x","latitude":"Infinity","longitude":0}`, 400},
		{"hex", "start", `{"text":"x","latitude":"0x1","longitude":0}`, 400},
		{"empty coordinate", "start", `{"text":"x","latitude":" ","longitude":0}`, 400},
		{"unknown", "start", `{"text":"x","latitude":0,"longitude":0,"unknown":true}`, 400},
		{"trailing", "start", `{"text":"x","latitude":0,"longitude":0}{}`, 400},
		{"malformed", "start", `{`, 400},
		{"blank session", "continue", `{"sessionId":" ","text":"x"}`, 400},
		{"blank follow-up", "continue", `{"sessionId":"opaque","text":" "}`, 400},
		{"continue unknown", "continue", `{"sessionId":"opaque","text":"x","unknown":true}`, 400},
	} {
		t.Run(tt.name, func(t *testing.T) {
			var logs bytes.Buffer
			f := &fakeVoice{}
			d := testDependencies(pingFunc(func(context.Context) error { return nil }))
			d.Voice = f
			w := httptest.NewRecorder()
			r := httptest.NewRequest("POST", "/api/voice/"+tt.path, strings.NewReader(tt.body))
			r.Header.Set("Content-Type", "application/json")
			Router(testConfig(), observability.New(&logs, "info"), d).ServeHTTP(w, r)
			if w.Code != tt.status || w.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("unexpected status %d", w.Code)
			}
			if strings.Contains(logs.String(), "private-text") || strings.Contains(logs.String(), "43.6") {
				t.Fatal("logs leaked")
			}
			if tt.status == 400 && f.calls != 0 {
				t.Fatal("invalid called service")
			}
			if !json.Valid(w.Body.Bytes()) {
				t.Fatal("not JSON")
			}
		})
	}
}
func TestVoiceErrorsAndPrivacy(t *testing.T) {
	for _, tt := range []struct {
		name   string
		err    error
		panic  bool
		status int
	}{{"notfound", voice.ErrNotFound, false, 404}, {"session", voice.ErrSessionUnavailable, false, 503}, {"internal", errors.New("private-provider-body"), false, 500}, {"panic", nil, true, 500}} {
		t.Run(tt.name, func(t *testing.T) {
			var logs bytes.Buffer
			d := testDependencies(pingFunc(func(context.Context) error { return nil }))
			d.Voice = &fakeVoice{err: tt.err, panic: tt.panic}
			w := httptest.NewRecorder()
			r := httptest.NewRequest("POST", "/api/voice/start", strings.NewReader(`{"text":"private-voice-text","latitude":12.3456789,"longitude":23.456789}`))
			r.Header.Set("Content-Type", "application/json")
			Router(testConfig(), observability.New(&logs, "info"), d).ServeHTTP(w, r)
			if w.Code != tt.status {
				t.Fatal("error mapping")
			}
			for _, sentinel := range []string{"private-provider-body", "private-panic-text", "private-voice-text", "12.3456789", "23.456789"} {
				if strings.Contains(logs.String()+w.Body.String(), sentinel) {
					t.Fatal("privacy leak")
				}
			}
		})
	}
}
