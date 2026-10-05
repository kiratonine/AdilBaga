package httpapi

import (
	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/location"
	"adilbaga/backend-go/internal/observability"
	"adilbaga/backend-go/internal/voice"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type voiceRepository struct{ testRepository }

func (r *voiceRepository) GetFilterSchema(ctx context.Context, slug string) (catalog.FilterSchema, error) {
	s, err := r.testRepository.GetFilterSchema(ctx, slug)
	s.Filters = append(s.Filters, catalog.FilterDefinition{Key: "fatPercent", Type: "multi-select", Options: []json.RawMessage{json.RawMessage("3.2")}})
	return s, err
}
func (*voiceRepository) ListLocations(context.Context) ([]location.Location, error) {
	return []location.Location{}, nil
}

type failedParser struct{}

func (failedParser) Parse(context.Context, voice.Input) (voice.Parsed, error) {
	return voice.Parsed{}, errors.New("private-provider-error")
}

type outageSessions struct{ fail bool }

func (s *outageSessions) Get(context.Context, string) (voice.Session, bool, error) {
	if s.fail {
		return voice.Session{}, false, voice.ErrSessionUnavailable
	}
	return voice.Session{}, false, nil
}
func (s *outageSessions) Set(context.Context, string, voice.Session, time.Duration) error {
	if s.fail {
		return voice.ErrSessionUnavailable
	}
	return nil
}
func (s *outageSessions) Delete(context.Context, string) error {
	if s.fail {
		return voice.ErrSessionUnavailable
	}
	return nil
}
func TestVoiceProviderOutages(t *testing.T) {
	for _, redisFailed := range []bool{false, true} {
		t.Run(map[bool]string{false: "gemini_unavailable", true: "redis_unavailable"}[redisFailed], func(t *testing.T) {
			repo := &voiceRepository{}
			var logs bytes.Buffer
			svc := &voice.Service{Parser: voice.NLP{Provider: failedParser{}}, Sessions: &outageSessions{fail: redisFailed}, Categories: repo, Products: repo, Locations: repo}
			d := Dependencies{DB: pingFunc(func(context.Context) error { return nil }), Categories: repo, Products: repo, Dashboard: repo, Voice: svc}
			c := testConfig()
			c.VoiceRateBurst = 100
			h := Router(c, observability.New(&logs, "info"), d)
			for _, tt := range []struct {
				method, path, body string
				want               int
			}{
				{"POST", "/api/voice/start", `{"text":"самое дешёвое молоко 1 литр 3.2%","latitude":43.6,"longitude":51.1}`, 201},
				{"POST", "/api/voice/start", `{"text":"молоко","latitude":43.6,"longitude":51.1}`, map[bool]int{false: 201, true: 503}[redisFailed]},
				{"POST", "/api/voice/continue", `{"sessionId":"private-session-sentinel","text":"1 литр"}`, map[bool]int{false: 404, true: 503}[redisFailed]},
				{"GET", "/api/categories", "", 200}, {"GET", "/api/dashboard", "", 200}, {"GET", "/health/ready", "", 200},
			} {
				w := httptest.NewRecorder()
				r := httptest.NewRequest(tt.method, tt.path, strings.NewReader(tt.body))
				if tt.method == "POST" {
					r.Header.Set("Content-Type", "application/json")
				}
				h.ServeHTTP(w, r)
				if w.Code != tt.want {
					t.Fatalf("outage status want=%d got=%d", tt.want, w.Code)
				}
			}
			for _, v := range []string{"private-provider-error", "private-session-sentinel", "молоко", "43.6", "51.1"} {
				if strings.Contains(logs.String(), v) {
					t.Fatal("outage privacy leak")
				}
			}
		})
	}
}
func TestVoiceAdditionalRateLimit(t *testing.T) {
	c := testConfig()
	c.RateRPS = 10000
	c.RateBurst = 10000
	c.VoiceRateRPS = .001
	c.VoiceRateBurst = 1
	c.VoiceConcurrency = 1
	d := testDependencies(pingFunc(func(context.Context) error { return nil }))
	d.Voice = &fakeVoice{}
	h := Router(c, observability.New(&bytes.Buffer{}, "info"), d)
	for _, tt := range []struct {
		method, path, ip string
		want             int
	}{{"POST", "/api/voice/start", "192.0.2.1:1234", 201}, {"POST", "/api/voice/start", "192.0.2.1:1234", 429}, {"POST", "/api/voice/start", "192.0.2.2:1234", 201}, {"GET", "/api/categories", "192.0.2.1:1234", 200}, {"GET", "/health/ready", "192.0.2.1:1234", 200}} {
		r := httptest.NewRequest(tt.method, tt.path, strings.NewReader(`{"text":"x","latitude":0,"longitude":0}`))
		r.RemoteAddr = tt.ip
		if tt.method == "POST" {
			r.Header.Set("Content-Type", "application/json")
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != tt.want {
			t.Fatal("voice limiter/global behavior mismatch")
		}
	}
}
