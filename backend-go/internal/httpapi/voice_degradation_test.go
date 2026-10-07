package httpapi

import (
	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/observability"
	"adilbaga/backend-go/internal/voice"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"
)

// These repositories/sessions are explicitly test-only. The real Router,
// Service, NLP fallback, state merge, business selection and speech are exercised.
type degradationRepository struct{ voiceRepository }

func (r *degradationRepository) ListProducts(_ context.Context, q catalog.ProductQuery) ([]catalog.Product, error) {
	r.query = q
	products := []catalog.Product{}
	for i := 0; i < q.Limit; i++ {
		products = append(products, catalog.Product{ID: strconv.Itoa(i), Name: "Test milk", Offers: []catalog.Offer{{StoreCode: catalog.DINA, StoreName: "Dina", Price: 570 + i}}, MinPrice: 570 + i})
	}
	return products, nil
}

type degradationSessions struct {
	states  map[string]voice.Session
	sets    int
	deletes int
	ttl     time.Duration
}

func (s *degradationSessions) Get(_ context.Context, id string) (voice.Session, bool, error) {
	v, ok := s.states[id]
	return v, ok, nil
}
func (s *degradationSessions) Set(_ context.Context, id string, v voice.Session, ttl time.Duration) error {
	s.states[id] = v
	s.sets++
	s.ttl = ttl
	return nil
}
func (s *degradationSessions) Delete(_ context.Context, id string) error {
	delete(s.states, id)
	s.deletes++
	return nil
}

type degradationParser struct {
	err   error
	calls int
}

func (p *degradationParser) Parse(context.Context, voice.Input) (voice.Parsed, error) {
	p.calls++
	return voice.Parsed{}, p.err
}

func TestVoiceGracefulDegradation(t *testing.T) {
	const credential = "synthetic-credential-84bdf65c792aea"
	const providerError = "synthetic-provider-error-68f31e3dd8e6"
	const marker = "privacy-marker-975aaf6be9cc"
	const lat, lon = 43.637982174629, 51.172943682715
	for _, tc := range []struct {
		name string
		err  error
	}{
		{"provider_failure", errors.New(providerError + ":" + credential)},
		// A deadline-exhausted provider is deterministic; no wall-clock sleep or
		// live dependency is needed to prove fallback after its bounded failure.
		{"provider_timeout", context.DeadlineExceeded},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &degradationRepository{}
			sessions := &degradationSessions{states: map[string]voice.Session{}}
			provider := &degradationParser{err: tc.err}
			svc := &voice.Service{Parser: voice.NLP{Provider: provider}, Sessions: sessions, Categories: repo, Products: repo, Locations: repo}
			var logs bytes.Buffer
			c := testConfig()
			c.VoiceRateBurst = 100 // Test-only; limiter policy has separate coverage.
			h := Router(c, observability.New(&logs, "info"), Dependencies{DB: pingFunc(func(context.Context) error { return nil }), Voice: svc})
			var sensitive []string
			post := func(path, text, id string) struct {
				Status, Mode, SessionID, Question, Speech string
				MissingFields                             []string
				Items                                     []voice.Item
			} {
				t.Helper()
				body := map[string]any{"text": text}
				if id == "" {
					body["latitude"], body["longitude"] = lat, lon
				} else {
					body["sessionId"] = id
				}
				b, err := json.Marshal(body)
				if err != nil {
					t.Fatal("test request encoding failed")
				}
				sensitive = append(sensitive, text)
				w := httptest.NewRecorder()
				r := httptest.NewRequest("POST", path, bytes.NewReader(b))
				r.Header.Set("Content-Type", "application/json")
				h.ServeHTTP(w, r)
				if w.Code != 201 || w.Header().Get("Content-Type") != "application/json" {
					t.Fatalf("application degradation HTTP status=%d", w.Code)
				}
				var result struct {
					Status, Mode, SessionID, Question, Speech string
					MissingFields                             []string
					Items                                     []voice.Item
				}
				if json.Unmarshal(w.Body.Bytes(), &result) != nil {
					t.Fatal("invalid application response")
				}
				if result.SessionID != "" {
					sensitive = append(sensitive, result.SessionID)
				}
				if strings.Contains(w.Body.String(), providerError) || strings.Contains(w.Body.String(), credential) {
					t.Fatal("provider error leaked to response")
				}
				return result
			}
			assertQuery := func(limit int) {
				t.Helper()
				q := repo.query
				if q.Category != "milk" || q.Sort != catalog.PriceAsc || q.Limit != limit || len(q.Filters) != 2 || len(q.Filters["volumeMl"]) != 1 || len(q.Filters["fatPercent"]) != 1 || string(q.Filters["volumeMl"][0]) != "1000" || string(q.Filters["fatPercent"][0]) != "3.2" {
					t.Fatal("fallback extraction/business query mismatch")
				}
			}
			complete := post("/api/voice/start", "самое дешёвое молоко 1 литр 3.2% "+marker, "")
			if complete.Status != "result" || complete.Mode != "single" || len(complete.Items) != 1 || complete.Items[0].Name != "Test milk" || complete.Items[0].Price != 570 || complete.Items[0].Store != "Dina" || complete.Speech != voice.Speech(complete.Items, "single") || sessions.sets != 0 {
				t.Fatal("complete cheapest degradation failed")
			}
			assertQuery(1)
			start := post("/api/voice/start", "самое дешёвое молоко "+marker, "")
			if start.Status != "needs_clarification" || start.SessionID == "" || !reflect.DeepEqual(start.MissingFields, []string{"volumeMl", "fatPercent"}) || start.Question != voice.Question(start.MissingFields) {
				t.Fatal("degradation clarification start failed")
			}
			middle := post("/api/voice/continue", "1 литр "+marker, start.SessionID)
			if middle.Status != "needs_clarification" || middle.SessionID != start.SessionID || !reflect.DeepEqual(middle.MissingFields, []string{"fatPercent"}) || middle.Question != voice.Question(middle.MissingFields) || sessions.sets != 2 || sessions.ttl != voice.SessionTTL {
				t.Fatal("partial clarification/session refresh failed")
			}
			finish := post("/api/voice/continue", "3.2% "+marker, start.SessionID)
			if finish.Status != "result" || finish.Mode != "single" || len(finish.Items) != 1 || !reflect.DeepEqual(finish.Items, complete.Items) || finish.Speech != complete.Speech || sessions.deletes != 1 || len(sessions.states) != 0 {
				t.Fatal("multi-turn degradation completion/session deletion failed")
			}
			assertQuery(1)
			search := post("/api/voice/start", "покажи цены на молоко 1 литр 3.2% "+marker, "")
			if search.Status != "result" || search.Mode != "list" || len(search.Items) != 3 || search.Speech != voice.Speech(search.Items, "list") {
				t.Fatal("search TOP-3 degradation failed")
			}
			for i, item := range search.Items {
				if item.Name != "Test milk" || item.Price != 570+i || item.Store != "Dina" {
					t.Fatal("search returned invalid product result")
				}
			}
			assertQuery(3)
			if provider.calls != 5 {
				t.Fatal("provider was not forced unavailable for every turn")
			}
			sensitive = append(sensitive, marker, providerError, credential, strconv.FormatFloat(lat, 'f', -1, 64), strconv.FormatFloat(lon, 'f', -1, 64))
			if logs.Len() == 0 {
				t.Fatal("privacy proof requires actual access logs")
			}
			for _, value := range sensitive {
				if strings.Contains(logs.String(), value) {
					t.Fatal("degradation privacy leak")
				}
			}
		})
	}
}
