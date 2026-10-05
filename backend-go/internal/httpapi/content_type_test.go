package httpapi

import (
	"bytes"
	"context"
	"net/http/httptest"
	"strings"
	"testing"

	"adilbaga/backend-go/internal/observability"
)

// Reference statuses verified against unchanged NestJS body parsing.
func TestVoiceContentType(t *testing.T) {
	const body = `{"text":"milk","latitude":43.6,"longitude":51.1}`
	for _, tt := range []struct {
		name, contentType, body string
		status                  int
	}{
		{"missing", "", body, 400},
		{"plain", "text/plain", body, 400},
		{"form JSON is not form", "application/x-www-form-urlencoded", body, 400},
		{"malformed JSON", "application/json", "{", 400},
		{"charset", "application/json; charset=utf-8", body, 201},
		{"existing Nest form", "application/x-www-form-urlencoded", "text=milk&latitude=43.6&longitude=51.1", 201},
		{"repeated form", "application/x-www-form-urlencoded", "text=milk&text=oil&latitude=43.6&longitude=51.1", 400},
		{"query not body", "application/x-www-form-urlencoded", "text=milk", 400},
	} {
		t.Run(tt.name, func(t *testing.T) {
			d := testDependencies(pingFunc(func(context.Context) error { return nil }))
			d.Voice = &fakeVoice{}
			r := httptest.NewRequest("POST", "/api/voice/start?latitude=43.6&longitude=51.1", strings.NewReader(tt.body))
			if tt.contentType != "" {
				r.Header.Set("Content-Type", tt.contentType)
			}
			w := httptest.NewRecorder()
			Router(testConfig(), observability.New(&bytes.Buffer{}, "error"), d).ServeHTTP(w, r)
			if w.Code != tt.status {
				t.Fatalf("content-type status %d expected %d", w.Code, tt.status)
			}
		})
	}
}
