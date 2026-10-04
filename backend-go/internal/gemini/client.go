// Package gemini translates text into validated structure, never business data.
package gemini

import (
	"adilbaga/backend-go/internal/voice"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
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
	return &Client{keys: Keys(keys...), model: model, http: &http.Client{Timeout: Timeout, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, logger: logger, endpoint: "https://generativelanguage.googleapis.com/v1beta/models/", timeout: Timeout}
}
func schema(in voice.Input) map[string]any {
	properties := map[string]any{}
	for _, s := range in.Schemas {
		for _, f := range s.Filters {
			kind := "string"
			if f.Type == "boolean" {
				kind = "boolean"
			} else if len(f.Options) > 0 {
				var v any
				_ = json.Unmarshal(f.Options[0], &v)
				if _, ok := v.(float64); ok {
					kind = "number"
				}
			}
			properties[f.Key] = map[string]any{"anyOf": []any{map[string]any{"type": kind}, map[string]any{"type": "null"}}}
		}
	}
	slugs := []string{}
	for _, c := range in.Categories {
		slugs = append(slugs, c.Slug)
	}
	return map[string]any{"type": "object", "properties": map[string]any{
		"intent":   map[string]any{"anyOf": []any{map[string]any{"type": "string", "enum": []string{"cheapest", "search"}}, map[string]any{"type": "null"}}},
		"category": map[string]any{"anyOf": []any{map[string]any{"type": "string", "enum": slugs}, map[string]any{"type": "null"}}},
		"filters":  map[string]any{"type": "object", "properties": properties, "additionalProperties": false},
	}, "required": []string{"intent", "category", "filters"}, "additionalProperties": false}
}
func body(in voice.Input) ([]byte, error) {
	schemas, err := json.Marshal(in.Schemas)
	if err != nil {
		return nil, errors.New("invalid NLP context")
	}
	slugs := []string{}
	for _, c := range in.Categories {
		slugs = append(slugs, c.Slug)
	}
	current := "none"
	if in.CurrentCategory != nil {
		current = *in.CurrentCategory
	}
	prompt := strings.Join([]string{
		"Extract only intent, category, and explicitly stated filter values from the user text.",
		"Use null for missing intent/category and omit missing filters. Return JSON only.",
		"Allowed intents: cheapest, search. Do not select products, prices, stores, or locations.",
		"Allowed category and filter context: " + string(schemas),
		"Allowed category slugs: " + strings.Join(slugs, ", "),
		"Current category for a clarification, if any: " + current, "User text: " + in.Text}, "\n")
	return json.Marshal(map[string]any{"contents": []any{map[string]any{"parts": []any{map[string]string{"text": prompt}}}}, "generationConfig": map[string]any{"responseMimeType": "application/json", "responseJsonSchema": schema(in)}})
}
func (c *Client) outcome(ctx context.Context, class string) {
	if c.logger != nil {
		c.logger.InfoContext(ctx, "nlp_provider", "provider_outcome_class", class)
	}
}
func (c *Client) Parse(ctx context.Context, in voice.Input) (voice.Parsed, error) {
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
				p, err := voice.Validate([]byte(part.Text), in)
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
