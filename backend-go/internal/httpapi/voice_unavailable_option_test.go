package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/observability"
	"adilbaga/backend-go/internal/voice"
)

type unavailableMilkRepository struct {
	degradationRepository
	productCalls      int
	volumeUnavailable bool
}

func milkDefinitions() catalog.FilterSchema {
	return catalog.FilterSchema{Category: "milk", Filters: []catalog.FilterDefinition{
		{Key: "volumeMl", Label: "Volume", Type: "multi-select", Options: []json.RawMessage{json.RawMessage(`500`), json.RawMessage(`1000`)}},
		{Key: "fatPercent", Label: "Fat", Type: "multi-select", Options: []json.RawMessage{json.RawMessage(`1.5`), json.RawMessage(`3.2`)}},
		{Key: "brand", Label: "Brand", Type: "multi-select", Options: []json.RawMessage{json.RawMessage(`"declared"`)}},
	}}
}
func (r *unavailableMilkRepository) ListVoiceVocabulary(context.Context) (catalog.VoiceVocabulary, error) {
	return catalog.VoiceVocabulary{Categories: []catalog.Category{{Slug: "milk"}}, Schemas: []catalog.FilterSchema{milkDefinitions()}}, nil
}
func (r *unavailableMilkRepository) GetFilterSchema(context.Context, string) (catalog.FilterSchema, error) {
	s := milkDefinitions()
	s.Filters[1].Options = []json.RawMessage{json.RawMessage(`3.2`)}
	s.Filters = s.Filters[:2] // Declared brand has no current usable values either.
	if r.volumeUnavailable {
		s.Filters = s.Filters[1:]
	}
	return s, nil
}
func (r *unavailableMilkRepository) ListProducts(ctx context.Context, q catalog.ProductQuery) ([]catalog.Product, error) {
	r.productCalls++
	if len(q.Filters["fatPercent"]) != 1 || string(q.Filters["fatPercent"][0]) != "3.2" || len(q.Filters["volumeMl"]) != 1 || string(q.Filters["volumeMl"][0]) != "1000" {
		return nil, catalog.ErrInvalidQuery
	}
	return r.degradationRepository.ListProducts(ctx, q)
}

// Only the historical input algorithm is reproduced here; the external local
// profile also compares the exact committed baseline binary independently.
type historicalLiveVocabulary struct{ repo *unavailableMilkRepository }

func (h historicalLiveVocabulary) ListVoiceVocabulary(ctx context.Context) (catalog.VoiceVocabulary, error) {
	c, err := h.repo.ListCategories(ctx)
	v := catalog.VoiceVocabulary{Categories: c}
	for _, category := range c {
		s, e := h.repo.GetFilterSchema(ctx, category.Slug)
		if e != nil {
			return v, e
		}
		v.Schemas = append(v.Schemas, s)
	}
	return v, err
}

func TestUnavailableMilkOptionClarificationParity(t *testing.T) {
	for _, baseline := range []bool{true, false} {
		t.Run(map[bool]string{true: "historical_live_input", false: "vocabulary_candidate"}[baseline], func(t *testing.T) {
			repo := &unavailableMilkRepository{}
			sessions := &degradationSessions{states: map[string]voice.Session{}}
			provider := &degradationParser{err: context.DeadlineExceeded}
			var vocabulary catalog.VoiceVocabularyRepository = repo
			if baseline {
				vocabulary = historicalLiveVocabulary{repo}
			}
			service := &voice.Service{Categories: repo, Vocabulary: vocabulary, Products: repo, Locations: repo, Sessions: sessions, Parser: voice.NLP{Provider: provider}}
			var logs bytes.Buffer
			cfg := testConfig()
			cfg.VoiceRateBurst = 100
			h := Router(cfg, observability.New(&logs, "info"), Dependencies{Voice: service})
			post := func(route, text, id string) struct {
				Status, SessionID, Question, Mode string
				MissingFields                     []string
				Items                             []voice.Item
			} {
				t.Helper()
				body := map[string]any{"text": text}
				if id == "" {
					body["latitude"] = 1
					body["longitude"] = 2
				} else {
					body["sessionId"] = id
				}
				raw, _ := json.Marshal(body)
				r := httptest.NewRequest("POST", route, bytes.NewReader(raw))
				r.Header.Set("Content-Type", "application/json")
				w := httptest.NewRecorder()
				h.ServeHTTP(w, r)
				if w.Code != 201 {
					t.Fatalf("otherwise-valid unavailable-option HTTP status=%d", w.Code)
				}
				var out struct {
					Status, SessionID, Question, Mode string
					MissingFields                     []string
					Items                             []voice.Item
				}
				if json.Unmarshal(w.Body.Bytes(), &out) != nil {
					t.Fatal("invalid response")
				}
				return out
			}
			start := post("/api/voice/start", "самое дешёвое молоко 1 литр 1.5%", "")
			if start.Status != "needs_clarification" || !reflect.DeepEqual(start.MissingFields, []string{"fatPercent"}) || start.Question != voice.Question(start.MissingFields) || repo.productCalls != 0 {
				t.Fatal("unavailable required value reached products or wrong question")
			}
			stored := sessions.states[start.SessionID]
			if string(stored.Filters["volumeMl"]) != "1000" || len(stored.Filters["fatPercent"]) != 0 || sessions.ttl != voice.SessionTTL {
				t.Fatal("known state/TTL changed")
			}
			middle := post("/api/voice/continue", "1.5%", start.SessionID)
			if middle.SessionID != start.SessionID || !reflect.DeepEqual(middle.MissingFields, []string{"fatPercent"}) || repo.productCalls != 0 {
				t.Fatal("repeat unavailable answer escaped clarification")
			}
			finish := post("/api/voice/continue", "3.2%", start.SessionID)
			if finish.Status != "result" || finish.Mode != "single" || len(finish.Items) != 1 || repo.productCalls != 1 || sessions.deletes != 1 || len(sessions.states) != 0 || provider.calls != 3 {
				t.Fatal("live valid answer/session cleanup/single parse failed")
			}
			if strings.Contains(logs.String(), start.SessionID) || strings.Contains(logs.String(), "1.5%") {
				t.Fatal("privacy leak")
			}
		})
	}
}

type unavailableParsed struct{ filters map[string]json.RawMessage }

func (p unavailableParsed) Parse(context.Context, voice.Input) (voice.Parsed, error) {
	intent, category := "cheapest", "milk"
	return voice.Parsed{Intent: &intent, Category: &category, Filters: p.filters}, nil
}

func TestUnavailableMilkOptionScope(t *testing.T) {
	for _, tc := range []struct {
		name              string
		filters           map[string]json.RawMessage
		volumeUnavailable bool
		status            int
		missing           []string
	}{
		{"unavailable_volume_definition", map[string]json.RawMessage{"volumeMl": []byte("1000"), "fatPercent": []byte("3.2")}, true, 201, []string{"volumeMl"}},
		{"both_unavailable", map[string]json.RawMessage{"volumeMl": []byte("1000"), "fatPercent": []byte("1.5")}, true, 201, []string{"volumeMl", "fatPercent"}},
		{"wrong_type", map[string]json.RawMessage{"volumeMl": []byte(`"1000"`)}, false, 400, nil},
		{"not_declared", map[string]json.RawMessage{"fatPercent": []byte("6")}, false, 400, nil},
		{"unknown_key", map[string]json.RawMessage{"price": []byte("100")}, false, 400, nil},
		{"unavailable_optional_brand", map[string]json.RawMessage{"brand": []byte(`"declared"`)}, false, 400, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &unavailableMilkRepository{volumeUnavailable: tc.volumeUnavailable}
			sessions := &degradationSessions{states: map[string]voice.Session{}}
			service := &voice.Service{Categories: repo, Vocabulary: repo, Products: repo, Locations: repo, Sessions: sessions, Parser: unavailableParsed{tc.filters}}
			w := httptest.NewRecorder()
			r := httptest.NewRequest("POST", "/api/voice/start", strings.NewReader(`{"text":"synthetic","latitude":1,"longitude":2}`))
			r.Header.Set("Content-Type", "application/json")
			Router(testConfig(), observability.New(&bytes.Buffer{}, "info"), Dependencies{Voice: service}).ServeHTTP(w, r)
			if w.Code != tc.status || repo.productCalls != 0 {
				t.Fatal("clarification scope/strict rejection changed")
			}
			if tc.status == 201 {
				var response struct {
					Status        string
					MissingFields []string
				}
				if json.Unmarshal(w.Body.Bytes(), &response) != nil || response.Status != "needs_clarification" || !reflect.DeepEqual(response.MissingFields, tc.missing) {
					t.Fatal("required field targeting failed")
				}
			} else if sessions.sets != 0 {
				t.Fatal("invalid optional value changed session")
			}
			// Provider-owned values must remain untouched by clarification normalization.
			if len(tc.filters) == 0 {
				t.Fatal("parser-owned map was mutated")
			}
		})
	}
	// A partial session can already have a valid fat value. An explicit unavailable
	// replacement must ask again rather than select that old, different value.
	repo := &unavailableMilkRepository{}
	sessions := &degradationSessions{states: map[string]voice.Session{"owned": {Parsed: voice.Parsed{Intent: func() *string { v := "cheapest"; return &v }(), Category: func() *string { v := "milk"; return &v }(), Filters: map[string]json.RawMessage{"fatPercent": []byte("3.2")}}}}}
	service := &voice.Service{Categories: repo, Vocabulary: repo, Products: repo, Locations: repo, Sessions: sessions, Parser: voice.Fallback{}}
	result, err := service.Continue(t.Context(), voice.ContinueRequest{SessionID: "owned", Text: "1 литр 1.5%"})
	if err != nil || !reflect.DeepEqual(result.MissingFields, []string{"fatPercent"}) || repo.productCalls != 0 {
		t.Fatal("explicit unavailable answer reused a different previous value")
	}
}
