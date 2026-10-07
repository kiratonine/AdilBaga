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

func multiCategoryInput() voice.Input {
	in := input()
	in.Categories = append(in.Categories, catalog.Category{Slug: "eggs"}, catalog.Category{Slug: "bread"})
	in.Schemas[0].Filters = append(in.Schemas[0].Filters, catalog.FilterDefinition{Key: "lactoseFree", Type: "boolean"})
	in.Schemas = append(in.Schemas,
		catalog.FilterSchema{Category: "eggs", Filters: []catalog.FilterDefinition{{Key: "packageCount", Type: "multi-select", Options: []json.RawMessage{[]byte("10")}}}},
		catalog.FilterSchema{Category: "bread", Filters: []catalog.FilterDefinition{{Key: "weightGrams", Type: "multi-select", Options: []json.RawMessage{[]byte("500")}}, {Key: "brand", Type: "multi-select", Options: []json.RawMessage{[]byte(`"Example"`)}}}},
	)
	return in
}

func TestCompactRequest(t *testing.T) {
	in := multiCategoryInput()
	in.Categories[0].Name = "Молоко"
	in.Categories[0].ID = "Private-Category-ID"
	in.Schemas[0].Filters = append(in.Schemas[0].Filters,
		catalog.FilterDefinition{Key: "fatPercent", Label: "Жирность", Type: "multi-select", Options: []json.RawMessage{[]byte("3.2")}},
		catalog.FilterDefinition{Key: "brand", Label: "Бренд", Type: "multi-select"})
	brand := &in.Schemas[0].Filters[len(in.Schemas[0].Filters)-1]
	for i := 0; i < 200; i++ {
		brand.Options = append(brand.Options, json.RawMessage(`"Brand-Should-Never-Reach-Gemini-Private-Option-Sentinel"`))
	}
	current := "milk"
	in.CurrentCategory = &current
	raw, err := body(in)
	if err != nil {
		t.Fatal("compact construction failed")
	}
	for _, forbidden := range []string{`"Options":`, `"options":`, "Brand-Should-Never-Reach-Gemini", "Private-Option-Sentinel", "Private-Category-ID", "anyOf"} {
		if bytes.Contains(raw, []byte(forbidden)) {
			t.Fatal("oversized/private context leaked")
		}
	}
	var request struct {
		SystemInstruction struct{ Parts []struct{ Text string } }
		Contents          []struct{ Parts []struct{ Text string } }
	}
	if json.Unmarshal(raw, &request) != nil || len(request.SystemInstruction.Parts) != 1 || request.SystemInstruction.Parts[0].Text != systemInstruction {
		t.Fatal("static instruction missing")
	}
	var content compactContext
	if json.Unmarshal([]byte(request.Contents[0].Parts[0].Text), &content) != nil || !reflect.DeepEqual(content.ExpectedFields, in.ExpectedFields) || content.CurrentCategory == nil || *content.CurrentCategory != "milk" || content.Categories[0].Name != "Молоко" {
		t.Fatal("compact clarification vocabulary missing")
	}
	fields, err := vocabulary(in)
	if err != nil || len(fields) != 6 {
		t.Fatal("deduplication failed")
	}
	s := schema(in, fields)
	if s["additionalProperties"] != false || s["anyOf"] != nil || !reflect.DeepEqual(s["required"], []string{"intent", "category", "filters"}) {
		t.Fatal("response must be one closed object")
	}
	props := s["properties"].(map[string]any)
	if !reflect.DeepEqual(props["category"].(map[string]any)["enum"], []any{"milk", "eggs", "bread", nil}) || !reflect.DeepEqual(props["intent"].(map[string]any)["type"], []string{"string", "null"}) {
		t.Fatal("nullable canonical vocabulary lost")
	}
	filters := props["filters"].(map[string]any)
	if filters["additionalProperties"] != false || filters["required"] != nil {
		t.Fatal("filters must be optional and closed")
	}
	want := map[string]string{"volumeMl": "number", "fatPercent": "number", "packageCount": "number", "weightGrams": "number", "brand": "string", "lactoseFree": "boolean"}
	for k, v := range filters["properties"].(map[string]any) {
		p := v.(map[string]any)
		if p["type"] != want[k] || p["enum"] != nil || p["anyOf"] != nil {
			t.Fatal("non-null primitive inference failed")
		}
	}
	legacy, _ := json.Marshal(in.Schemas)
	n, sn, fn, err := RequestStats(in)
	if err != nil || n != len(raw) || n >= 8192 || n*2 >= len(legacy) || fn != 6 {
		t.Fatal("request compaction guard failed")
	}
	t.Logf("request_body_bytes=%d response_schema_bytes=%d filter_fields_count=%d legacy_schema_bytes=%d", n, sn, fn, len(legacy))
}
func TestPrimitiveInferenceFailClosed(t *testing.T) {
	for _, raw := range []string{`"conflict"`, `null`, `{}`, `[]`} {
		in := multiCategoryInput()
		in.Schemas[1].Filters = append(in.Schemas[1].Filters, catalog.FilterDefinition{Key: "volumeMl", Type: "multi-select", Options: []json.RawMessage{[]byte(raw)}})
		if _, err := body(in); err == nil {
			t.Fatal("ambiguous primitive accepted")
		}
	}
	in := multiCategoryInput()
	in.Schemas[1].Filters = append(in.Schemas[1].Filters, catalog.FilterDefinition{Key: "empty", Type: "multi-select"})
	if _, err := body(in); err == nil {
		t.Fatal("unknown primitive guessed")
	}
}
func TestCompactSemanticAuthority(t *testing.T) {
	in := multiCategoryInput()
	for _, raw := range []string{
		`{"intent":null,"category":"milk","filters":{"packageCount":10}}`,
		`{"intent":null,"category":"eggs","filters":{"volumeMl":1000}}`,
		`{"intent":null,"category":"unknown","filters":{}}`,
		`{"intent":null,"category":"milk","filters":{"unknown":1}}`,
		`{"intent":null,"category":"milk","filters":{"volumeMl":999}}`,
	} {
		if _, err := voice.Validate([]byte(raw), in); err == nil {
			t.Fatal("semantic authority weakened")
		}
	}
}

func TestTargetedClarification(t *testing.T) {
	in := multiCategoryInput()
	in.Schemas[0].Filters = append(in.Schemas[0].Filters, catalog.FilterDefinition{Key: "fatPercent", Label: "Жирность", Type: "multi-select", Options: []json.RawMessage{[]byte("3.2")}})
	current := "milk"
	in.CurrentCategory = &current
	for _, expected := range [][]string{{"volumeMl", "fatPercent"}, {"volumeMl"}, {"fatPercent"}, {"intent"}, {"category"}} {
		in.ExpectedFields = expected
		raw, err := body(in)
		if err != nil {
			t.Fatal("targeted request construction failed")
		}
		var request struct {
			Contents         []struct{ Parts []struct{ Text string } }
			GenerationConfig struct{ ResponseJsonSchema map[string]any }
		}
		if json.Unmarshal(raw, &request) != nil {
			t.Fatal("request decoding failed")
		}
		var content map[string]json.RawMessage
		if json.Unmarshal([]byte(request.Contents[0].Parts[0].Text), &content) != nil {
			t.Fatal("context decoding failed")
		}
		s := request.GenerationConfig.ResponseJsonSchema
		props := s["properties"].(map[string]any)
		key := "filters"
		if expected[0] == "intent" || expected[0] == "category" {
			key = expected[0]
		}
		if len(props) != 1 || props[key] == nil || s["additionalProperties"] != false || !reflect.DeepEqual(s["required"], []any{key}) {
			t.Fatal("targeted response shape not minimal")
		}
		if key == "filters" {
			if content["categories"] != nil || len(content) != 4 || bytes.Contains(raw, []byte("packageCount")) || bytes.Contains(raw, []byte("bread")) || bytes.Contains(raw, []byte("brand")) {
				t.Fatal("unrelated context leaked")
			}
			f := props[key].(map[string]any)
			if f["required"] != nil || f["additionalProperties"] != false || len(f["properties"].(map[string]any)) != len(expected) {
				t.Fatal("filters must be expected-only and optional")
			}
		} else if content["filterFields"] != nil || content["currentCategory"] != nil || (key == "intent" && content["categories"] != nil) {
			t.Fatal("unrelated identity context leaked")
		}
	}
	in.ExpectedFields = []string{"volumeMl", "fatPercent"}
	p, err := validateResponse([]byte(`{"filters":{"volumeMl":1000}}`), in)
	if err != nil || p.Intent != nil || p.Category != nil || len(p.Filters) != 1 {
		t.Fatal("partial normalization failed")
	}
	previous := voice.Session{Parsed: voice.Parsed{Intent: providerPointerForTest("cheapest"), Category: &current, Filters: map[string]json.RawMessage{}}}
	merged := voice.Merge(previous, p, in.Schemas)
	if !reflect.DeepEqual(voice.Missing(merged), []string{"fatPercent"}) || *merged.Intent != "cheapest" || *merged.Category != "milk" {
		t.Fatal("partial state merge failed")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { success(w, `{"filters":{"volumeMl":1000}}`) }))
	defer server.Close()
	client := New([]string{"synthetic-key"}, "model", nil)
	client.endpoint = server.URL + "/"
	actual, parseErr := client.Parse(context.Background(), in)
	if parseErr != nil || !reflect.DeepEqual(actual, p) {
		t.Fatal("provider partial-output path failed")
	}
	for _, bad := range []string{`{"filters":{"packageCount":10}}`, `{"filters":{"volumeMl":999}}`, `{"filters":{"volumeMl":null}}`, `{"filters":{},"intent":null}`, `{"filters":null}`} {
		if _, err := validateResponse([]byte(bad), in); err == nil {
			t.Fatal("targeted normalization weakened validation")
		}
	}
	in.ExpectedFields = []string{"intent"}
	p, err = validateResponse([]byte(`{"intent":"cheapest"}`), in)
	if err != nil || p.Intent == nil || len(p.Filters) != 0 || p.Category != nil {
		t.Fatal("intent normalization failed")
	}
	in.ExpectedFields = []string{"category"}
	p, err = validateResponse([]byte(`{"category":"eggs"}`), in)
	if err != nil || p.Category == nil || p.Intent != nil || len(p.Filters) != 0 {
		t.Fatal("category normalization failed")
	}
	if _, err = validateResponse([]byte(`{"category":"unknown"}`), in); err == nil {
		t.Fatal("category allowlist weakened")
	}
}

func providerPointerForTest(value string) *string { return &value }

func TestForeignNullFilterRejected(t *testing.T) {
	in := multiCategoryInput()
	raw := `{"intent":"cheapest","category":"milk","filters":{"volumeMl":1000,"packageCount":null}}`
	if _, err := voice.Validate([]byte(raw), in); err == nil {
		t.Fatal("independent validator accepted foreign null filler")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { success(w, raw) }))
	defer server.Close()
	var logs bytes.Buffer
	c := New([]string{"synthetic-key"}, "model", slog.New(slog.NewJSONHandler(&logs, nil)))
	c.endpoint = server.URL + "/"
	if _, err := c.Parse(context.Background(), in); err == nil || !strings.Contains(logs.String(), `"provider_outcome_class":"invalid_output"`) {
		t.Fatal("provider-independent validation weakened")
	}
}
