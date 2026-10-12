package voice

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
)

import "adilbaga/backend-go/internal/catalog"

type vocabularyFixture struct {
	fixtures
	vocabularyCalls, liveCalls      int
	selected                        []string
	stale, failVocabulary, failLive bool
}

func (f *vocabularyFixture) ListVoiceVocabulary(ctx context.Context) (catalog.VoiceVocabulary, error) {
	f.vocabularyCalls++
	if f.failVocabulary {
		return catalog.VoiceVocabulary{}, context.DeadlineExceeded
	}
	if err := ctx.Err(); err != nil {
		return catalog.VoiceVocabulary{}, err
	}
	in := testInput()
	in.Categories = append(in.Categories, catalog.Category{Slug: "bread"})
	in.Schemas[0].Filters[1].Options = append(in.Schemas[0].Filters[1].Options, json.RawMessage("1.5"))
	return catalog.VoiceVocabulary{Categories: in.Categories, Schemas: in.Schemas}, nil
}
func (f *vocabularyFixture) GetFilterSchema(ctx context.Context, slug string) (catalog.FilterSchema, error) {
	f.liveCalls++
	f.selected = append(f.selected, slug)
	if f.failLive {
		return catalog.FilterSchema{}, context.DeadlineExceeded
	}
	if err := ctx.Err(); err != nil {
		return catalog.FilterSchema{}, err
	}
	s, err := f.fixtures.GetFilterSchema(ctx, slug)
	if !f.stale && slug == "milk" {
		s.Filters[1].Options = append(s.Filters[1].Options, json.RawMessage("1.5"))
	}
	return s, err
}

func vocabularyService(f *vocabularyFixture, p Parser, m *memory) *Service {
	return &Service{Vocabulary: f, Categories: f, Parser: p, Products: f, Locations: f, Sessions: m}
}

func TestVocabularyOneParsePerTurn(t *testing.T) {
	f := &vocabularyFixture{}
	m := &memory{states: map[string]Session{}}
	calls := 0
	provider := capturingParser(func(ctx context.Context, in Input) (Parsed, error) {
		calls++
		if f.liveCalls != calls-1 {
			t.Fatal("live discovery occurred before NLP")
		}
		return (Fallback{}).Parse(ctx, in)
	})
	s := vocabularyService(f, NLP{Provider: provider}, m)
	complete, err := s.Start(t.Context(), StartRequest{Text: "самое дешёвое молоко 1 литр 1.5%", Latitude: 1, Longitude: 2})
	if err != nil || complete.Mode != "single" || len(complete.Items) != 1 || calls != 1 || f.liveCalls != 1 || f.vocabularyCalls != 1 {
		t.Fatal("one-shot vocabulary flow failed")
	}
	start, err := s.Start(t.Context(), StartRequest{Text: "самое дешёвое молоко", Latitude: 1, Longitude: 2})
	if err != nil || !reflect.DeepEqual(start.MissingFields, []string{"volumeMl", "fatPercent"}) || m.ttl != SessionTTL {
		t.Fatal("incomplete start failed")
	}
	middle, err := s.Continue(t.Context(), ContinueRequest{start.SessionID, "один литр"})
	if err != nil || !reflect.DeepEqual(middle.MissingFields, []string{"fatPercent"}) {
		t.Fatal("partial continue failed")
	}
	result, err := s.Continue(t.Context(), ContinueRequest{start.SessionID, "1.5%"})
	if err != nil || result.Mode != "single" || len(m.states) != 0 || m.deletes != 1 || calls != 4 || f.liveCalls != 4 || f.vocabularyCalls != 4 {
		t.Fatal("continue call count/session cleanup failed")
	}
	if !reflect.DeepEqual(f.selected, []string{"milk", "milk", "milk", "milk"}) {
		t.Fatal("unrelated discovery")
	}
	list, err := s.Start(t.Context(), StartRequest{Text: "найди молоко 1 литр 1.5%"})
	if err != nil || list.Mode != "list" || len(list.Items) != 3 || f.query.Limit != 3 {
		t.Fatal("TOP3 changed")
	}
	if string(f.query.Filters["fatPercent"][0]) != "1.5" || complete.Items[0].Address == nil || complete.Items[0].DistanceMeters == nil {
		t.Fatal("typed filters/location lost")
	}
}

func TestVocabularyClarificationAndSwitch(t *testing.T) {
	f := &vocabularyFixture{}
	m := &memory{states: map[string]Session{}}
	s := vocabularyService(f, Fallback{}, m)
	for _, phrase := range []string{"найди хлеб", "найди яйца"} {
		r, err := s.Start(t.Context(), StartRequest{Text: phrase})
		if err != nil || r.Status != "result" {
			t.Fatal("milk-only questions leaked")
		}
	}
	r, err := s.Start(t.Context(), StartRequest{Text: "неизвестный товар"})
	if err != nil || !reflect.DeepEqual(r.MissingFields, []string{"intent", "category"}) || f.liveCalls != 2 {
		t.Fatal("unknown category must clarify without discovery")
	}
	_, err = s.Continue(t.Context(), ContinueRequest{r.SessionID, "найди"})
	if err != nil {
		t.Fatal("intent clarification failed")
	}
	_, err = s.Continue(t.Context(), ContinueRequest{r.SessionID, "хлеб"})
	if err != nil {
		t.Fatal("category clarification failed")
	}
	m.states["owned"] = Session{Parsed: Parsed{Intent: pointer("search"), Category: pointer("milk"), Filters: map[string]json.RawMessage{"volumeMl": []byte("1000")}}}
	r, err = s.Continue(t.Context(), ContinueRequest{"owned", "найди хлеб"})
	if err != nil || r.Status != "result" || f.query.Category != "bread" || len(f.query.Filters) != 0 {
		t.Fatal("category switch retained old filters")
	}
}

func TestVocabularyLiveValidationFailsClosed(t *testing.T) {
	for _, raw := range []string{
		`{"intent":"search","category":"milk","filters":{"price":1}}`,
		`{"intent":"search","category":"bread","filters":{"volumeMl":1000}}`,
		`{"intent":"search","category":"phones","filters":{}}`,
		`{"intent":"search","category":"milk","filters":{"volumeMl":"1000"}}`,
		`{"intent":"search","category":"milk","filters":{},"store":"x"}`,
	} {
		t.Run(raw, func(t *testing.T) {
			f := &vocabularyFixture{stale: true}
			m := &memory{states: map[string]Session{}}
			p := capturingParser(func(_ context.Context, in Input) (Parsed, error) {
				// Real providers validate closed JSON; a direct internal adapter is also checked by Service.
				var parsed Parsed
				if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
					return Parsed{}, ErrInvalid
				}
				if _, err := Validate([]byte(raw), in); err != nil {
					return Parsed{}, err
				}
				return parsed, nil
			})
			s := vocabularyService(f, p, m)
			if _, err := s.Start(t.Context(), StartRequest{}); err == nil || f.productCalls != 0 || m.sets != 0 {
				t.Fatal("unvalidated candidate reached SQL/session")
			}
		})
	}
	for _, cause := range []error{context.DeadlineExceeded, ErrInvalid, errors.New("provider unavailable")} {
		f := &vocabularyFixture{stale: true}
		m := &memory{states: map[string]Session{"owned": {Parsed: Parsed{Intent: pointer("cheapest"), Category: pointer("milk"), Filters: map[string]json.RawMessage{}}}}}
		s := vocabularyService(f, NLP{Provider: capturingParser(func(context.Context, Input) (Parsed, error) { return Parsed{}, cause })}, m)
		response, err := s.Continue(t.Context(), ContinueRequest{"owned", "1 литр 1.5%"})
		if err != nil || response.Status != "needs_clarification" || !reflect.DeepEqual(response.MissingFields, []string{"fatPercent"}) || m.sets != 1 || m.deletes != 0 || f.productCalls != 0 {
			t.Fatal("fallback bypassed live validation or changed session")
		}
	}
	// Already stored values must be checked again against this turn's live options.
	f := &vocabularyFixture{stale: true}
	m := &memory{states: map[string]Session{"owned": {Parsed: Parsed{Intent: pointer("cheapest"), Category: pointer("milk"), Filters: map[string]json.RawMessage{"fatPercent": []byte("1.5")}}}}}
	s := vocabularyService(f, Fallback{}, m)
	response, err := s.Continue(t.Context(), ContinueRequest{"owned", "1 литр"})
	if err != nil || response.Status != "needs_clarification" || !reflect.DeepEqual(response.MissingFields, []string{"fatPercent"}) || m.sets != 1 || f.productCalls != 0 {
		t.Fatal("stored stale option accepted")
	}
}

func TestVocabularyDependenciesFailClosed(t *testing.T) {
	for _, stage := range []string{"vocabulary", "live"} {
		f := &vocabularyFixture{failVocabulary: stage == "vocabulary", failLive: stage == "live"}
		s := vocabularyService(f, Fallback{}, &memory{states: map[string]Session{}})
		if _, err := s.Start(t.Context(), StartRequest{Text: "найди молоко"}); err == nil || f.productCalls != 0 {
			t.Fatal("dependency failure accepted")
		}
	}
	s := vocabularyService(&vocabularyFixture{}, Fallback{}, nil)
	s.Vocabulary = nil
	if _, err := s.Start(t.Context(), StartRequest{}); err == nil {
		t.Fatal("missing vocabulary dependency must fail closed")
	}
}
