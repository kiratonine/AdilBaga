package gemini

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"adilbaga/backend-go/internal/voice"
)

func TestOutboundSecurity(t *testing.T) {
	c := New([]string{"privatekeyqzrtnh"}, "gemini-3.1-flash-lite", nil)
	if c.endpoint != "https://generativelanguage.googleapis.com/v1beta/models/" || c.timeout != Timeout || c.http.Timeout != Timeout {
		t.Fatal("provider endpoint/budget changed")
	}
	for _, kind := range []string{"redirect", "oversized"} {
		t.Run(kind, func(t *testing.T) {
			var logs bytes.Buffer
			followed := false
			target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { followed = true; success(w, valid) }))
			defer target.Close()
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if kind == "redirect" {
					http.Redirect(w, r, target.URL, http.StatusTemporaryRedirect)
					return
				}
				_, _ = w.Write([]byte(strings.Repeat("x", MaxResponseBytes+1)))
			}))
			defer provider.Close()
			client := New([]string{"privatekeyqzrtnh"}, "model", slog.New(slog.NewJSONHandler(&logs, nil)))
			client.endpoint = provider.URL + "/"
			_, err := client.Parse(context.Background(), voice.Input{})
			if err == nil || followed {
				t.Fatal("redirect or oversized response accepted")
			}
			if strings.Contains(logs.String()+err.Error(), "privatekeyqzrtnh") || strings.Contains(logs.String(), provider.URL) || strings.Contains(logs.String(), target.URL) {
				t.Fatal("outbound diagnostic leak")
			}
		})
	}
}
