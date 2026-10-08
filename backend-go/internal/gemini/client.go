// Package gemini translates text into validated structure, never business data.
package gemini

import (
	"adilbaga/backend-go/internal/observability"
	"adilbaga/backend-go/internal/voice"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

const Timeout = 8 * time.Second
const MaxResponseBytes = 1 << 20

type Client struct {
	keys     []string
	model    string
	http     *http.Client
	logger   *slog.Logger
	endpoint string
	timeout  time.Duration
	metrics  *observability.Registry
}

func Keys(values ...string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v != "" && !seen[v] {
			out = append(out, v)
			seen[v] = true
		}
	}
	return out
}
func New(keys []string, model string, logger *slog.Logger) *Client {
	return &Client{keys: Keys(keys...), model: model, metrics: observability.Default, http: &http.Client{Timeout: Timeout, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, logger: logger, endpoint: "https://generativelanguage.googleapis.com/v1beta/models/", timeout: Timeout}
}

const systemInstruction = "You are the stateless NLP parser for Adil Bağa. Extract only the CURRENT utterance: intent, category, explicitly stated filters. cheapest means one cheapest/minimum-price option; search means find/show prices/options, including top-three requests. Never choose products, compare prices, select stores, compute nearest locations or invent missing values. Use null for unmentioned intent/category; omit unmentioned filters, never null filter values. Use only supplied canonical category slugs and filter keys. With currentCategory, return category=null unless the user explicitly names/changes category. Prioritize expectedFields when supplied. Normalize liters to milliliters, kilograms to grams, percentages to numeric percent. Return JSON only, no prose."

type filterField struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Type  string `json:"type"`
}
type categoryWord struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}
type compactContext struct {
	Text            string         `json:"text"`
	Categories      []categoryWord `json:"categories"`
	FilterFields    []filterField  `json:"filterFields"`
	CurrentCategory *string        `json:"currentCategory"`
	ExpectedFields  []string       `json:"expectedFields"`
}

func vocabulary(in voice.Input) ([]filterField, error) {
	fields := map[string]filterField{}
	for _, s := range in.Schemas {
		for _, f := range s.Filters {
			kind := ""
			if f.Type == "boolean" {
				kind = "boolean"
			} else if f.Type != "multi-select" {
				return nil, errors.New("invalid NLP context")
			}
			for _, raw := range f.Options {
				var value any
				if json.Unmarshal(raw, &value) != nil {
					return nil, errors.New("invalid NLP context")
				}
				actual := ""
				switch value.(type) {
				case string:
					actual = "string"
				case float64:
					actual = "number"
				case bool:
					actual = "boolean"
				default:
					return nil, errors.New("invalid NLP context")
				}
				if kind != "" && kind != actual {
					return nil, errors.New("invalid NLP context")
				}
				kind = actual
			}
			if kind == "" || f.Key == "" {
				return nil, errors.New("invalid NLP context")
			}
			if previous, ok := fields[f.Key]; ok {
				if previous.Type != kind {
					return nil, errors.New("invalid NLP context")
				}
				continue
			}
			fields[f.Key] = filterField{f.Key, f.Label, kind}
		}
	}
	keys := make([]string, 0, len(fields))
	for key := range fields {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	out := make([]filterField, 0, len(keys))
	for _, key := range keys {
		out = append(out, fields[key])
	}
	return out, nil
}
func schema(in voice.Input, fields []filterField) map[string]any {
	categories := []any{}
	for _, c := range in.Categories {
		categories = append(categories, c.Slug)
	}
	categories = append(categories, nil)
	properties := map[string]any{}
	for _, f := range fields {
		properties[f.Key] = map[string]any{"type": f.Type}
	}
	if len(in.ExpectedFields) > 0 {
		key := "filters"
		property := map[string]any{"type": "object", "properties": properties, "additionalProperties": false}
		if len(in.ExpectedFields) == 1 && in.ExpectedFields[0] == "intent" {
			key = "intent"
			property = map[string]any{"type": []string{"string", "null"}, "enum": []any{"cheapest", "search", nil}}
		} else if len(in.ExpectedFields) == 1 && in.ExpectedFields[0] == "category" {
			key = "category"
			property = map[string]any{"type": []string{"string", "null"}, "enum": categories}
		}
		return map[string]any{"type": "object", "properties": map[string]any{key: property}, "required": []string{key}, "additionalProperties": false}
	}
	return map[string]any{"type": "object", "additionalProperties": false,
		"required": []string{"intent", "category", "filters"}, "properties": map[string]any{
			"intent":   map[string]any{"type": []string{"string", "null"}, "enum": []any{"cheapest", "search", nil}},
			"category": map[string]any{"type": []string{"string", "null"}, "enum": categories},
			"filters":  map[string]any{"type": "object", "properties": properties, "additionalProperties": false},
		}}
}

// Select vocabulary before inference, so unrelated categories/options never enter
// a clarification payload. Full Input remains available to strict validation.
func requestVocabulary(in voice.Input) ([]filterField, error) {
	if len(in.ExpectedFields) == 0 {
		return vocabulary(in)
	}
	if len(in.ExpectedFields) == 1 && (in.ExpectedFields[0] == "intent" || in.ExpectedFields[0] == "category") {
		return []filterField{}, nil
	}
	if in.CurrentCategory == nil {
		return nil, errors.New("invalid NLP context")
	}
	selected := voice.Input{}
	for _, source := range in.Schemas {
		if source.Category != *in.CurrentCategory {
			continue
		}
		s := source
		s.Filters = nil
		seen := map[string]bool{}
		for _, expected := range in.ExpectedFields {
			if seen[expected] || expected == "intent" || expected == "category" {
				return nil, errors.New("invalid NLP context")
			}
			seen[expected] = true
			found := false
			for _, f := range source.Filters {
				if f.Key == expected {
					s.Filters = append(s.Filters, f)
					found = true
					break
				}
			}
			if !found {
				return nil, errors.New("invalid NLP context")
			}
		}
		selected.Schemas = append(selected.Schemas, s)
		return vocabulary(selected)
	}
	return nil, errors.New("invalid NLP context")
}

func body(in voice.Input) ([]byte, error) {
	fields, err := requestVocabulary(in)
	if err != nil {
		return nil, err
	}
	content := compactContext{Text: in.Text, Categories: []categoryWord{}, FilterFields: fields, CurrentCategory: in.CurrentCategory, ExpectedFields: in.ExpectedFields}
	for _, c := range in.Categories {
		content.Categories = append(content.Categories, categoryWord{c.Slug, c.Name})
	}
	raw, err := json.Marshal(content)
	if len(in.ExpectedFields) > 0 {
		compact := map[string]any{"text": in.Text, "expectedFields": in.ExpectedFields}
		if in.ExpectedFields[0] == "category" {
			compact["categories"] = content.Categories
		} else if in.ExpectedFields[0] != "intent" {
			found := false
			for _, c := range in.Categories {
				if in.CurrentCategory != nil && c.Slug == *in.CurrentCategory {
					compact["currentCategory"] = categoryWord{c.Slug, c.Name}
					found = true
					break
				}
			}
			if !found {
				return nil, errors.New("invalid NLP context")
			}
			compact["filterFields"] = fields
		}
		raw, err = json.Marshal(compact)
	}
	if err != nil {
		return nil, errors.New("invalid NLP context")
	}
	return json.Marshal(map[string]any{
		"systemInstruction": map[string]any{"parts": []any{map[string]string{"text": systemInstruction}}},
		"contents":          []any{map[string]any{"parts": []any{map[string]string{"text": string(raw)}}}},
		"generationConfig":  map[string]any{"responseMimeType": "application/json", "responseJsonSchema": schema(in, fields)},
	})
}

// RequestStats exposes sizes only, never provider payload or vocabulary values.
func RequestStats(in voice.Input) (bodyBytes, schemaBytes, fieldCount int, err error) {
	fields, err := requestVocabulary(in)
	if err != nil {
		return 0, 0, 0, err
	}
	raw, err := body(in)
	if err != nil {
		return 0, 0, 0, err
	}
	response, err := json.Marshal(schema(in, fields))
	return len(raw), len(response), len(fields), err
}

// Normalize only the closed targeted provider shape; do not discard extras.
// Canonical validation still uses the complete real backend schemas.
func validateResponse(raw []byte, in voice.Input) (voice.Parsed, error) {
	if len(in.ExpectedFields) == 0 {
		return voice.Validate(raw, in)
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil || len(fields) != 1 {
		return voice.Parsed{}, voice.ErrInvalid
	}
	key := "filters"
	if len(in.ExpectedFields) == 1 && (in.ExpectedFields[0] == "intent" || in.ExpectedFields[0] == "category") {
		key = in.ExpectedFields[0]
	}
	value, found := fields[key]
	if !found {
		return voice.Parsed{}, voice.ErrInvalid
	}
	if key == "filters" {
		var filters map[string]json.RawMessage
		if json.Unmarshal(value, &filters) != nil || filters == nil {
			return voice.Parsed{}, voice.ErrInvalid
		}
		for k, v := range filters {
			allowed := false
			for _, expected := range in.ExpectedFields {
				if k == expected {
					allowed = true
				}
			}
			if !allowed || bytes.Equal(bytes.TrimSpace(v), []byte("null")) {
				return voice.Parsed{}, voice.ErrInvalid
			}
		}
	}
	canonical := map[string]json.RawMessage{"intent": []byte("null"), "category": []byte("null"), "filters": []byte("{}")}
	canonical[key] = value
	normalized, err := json.Marshal(canonical)
	if err != nil {
		return voice.Parsed{}, voice.ErrInvalid
	}
	return voice.Validate(normalized, in)
}
func (c *Client) outcome(ctx context.Context, class string) {
	c.registry().Dependency("gemini", "outcome", class, 0)
	if c.logger != nil {
		c.logger.InfoContext(ctx, "nlp_provider", "provider_outcome_class", class)
	}
}
func (c *Client) registry() *observability.Registry {
	if c.metrics != nil {
		return c.metrics
	}
	return observability.Default
}
func (c *Client) Parse(ctx context.Context, in voice.Input) (parsed voice.Parsed, resultErr error) {
	start := time.Now()
	defer func() {
		class, code := "success", ""
		if resultErr != nil {
			class = "failure"
			code = "gemini_unavailable"
		}
		c.registry().Dependency("gemini", "parse", class, time.Since(start))
		if c.logger != nil {
			c.logger.InfoContext(ctx, "nlp_request", "outcome_class", class, "duration_ms", time.Since(start).Milliseconds(), "error_code", code)
		}
	}()
	requestBody, err := body(in)
	if err != nil {
		return voice.Parsed{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()
	fail := func(class string) (voice.Parsed, error) {
		c.outcome(ctx, class)
		return voice.Parsed{}, errors.New("NLP provider unavailable")
	}
	for _, key := range c.keys {
		if ctx.Err() != nil {
			break
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint+url.PathEscape(c.model)+":generateContent", bytes.NewReader(requestBody))
		if err != nil {
			return fail("bad_request")
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("x-goog-api-key", key)
		response, err := c.http.Do(req)
		if err != nil {
			class := "network_error"
			if errors.Is(err, context.DeadlineExceeded) || ctx.Err() != nil {
				class = "timeout"
			}
			c.outcome(ctx, class)
			continue
		}
		status := response.StatusCode
		if status < 200 || status >= 300 {
			_ = response.Body.Close()
			class := "bad_request"
			retry := false
			if status == 429 {
				class = "rate_limited"
				retry = true
			} else if status >= 500 {
				class = "server_error"
				retry = true
			} else if status == 401 || status == 403 {
				class = "auth_error"
			}
			c.outcome(ctx, class)
			if retry {
				continue
			}
			return voice.Parsed{}, errors.New("NLP provider unavailable")
		}
		raw, err := io.ReadAll(io.LimitReader(response.Body, MaxResponseBytes+1))
		_ = response.Body.Close()
		if err != nil || len(raw) > MaxResponseBytes {
			return fail("invalid_output")
		}
		var envelope struct {
			Candidates []struct {
				Content struct {
					Parts []struct {
						Text string `json:"text"`
					} `json:"parts"`
				} `json:"content"`
			} `json:"candidates"`
		}
		if json.Unmarshal(raw, &envelope) != nil || len(envelope.Candidates) == 0 {
			return fail("invalid_output")
		}
		for _, part := range envelope.Candidates[0].Content.Parts {
			if part.Text != "" {
				p, err := validateResponse([]byte(part.Text), in)
				if err != nil || ctx.Err() != nil {
					return fail("invalid_output")
				}
				c.outcome(ctx, "success")
				return p, nil
			}
		}
		return fail("invalid_output")
	}
	return fail("fallback")
}
