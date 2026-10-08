package voice

import (
	"adilbaga/backend-go/internal/catalog"
	"bytes"
	"encoding/json"
	"io"
	"strings"
)

func schemaFor(schemas []catalog.FilterSchema, category *string) *catalog.FilterSchema {
	if category != nil {
		for i := range schemas {
			if schemas[i].Category == *category {
				return &schemas[i]
			}
		}
	}
	return nil
}
func allowed(schemas []catalog.FilterSchema, category *string, key string) *catalog.FilterDefinition {
	schema := schemaFor(schemas, category)
	if schema != nil {
		for i := range schema.Filters {
			if schema.Filters[i].Key == key {
				return &schema.Filters[i]
			}
		}
	}
	return nil
}
func decodePrimitive(raw json.RawMessage) (any, bool) {
	var v any
	if json.Unmarshal(raw, &v) != nil {
		return nil, false
	}
	switch v.(type) {
	case nil, string, bool, float64:
		return v, true
	}
	return nil, false
}
func validFilter(raw json.RawMessage, d *catalog.FilterDefinition) bool {
	v, ok := decodePrimitive(raw)
	if !ok || d == nil {
		return false
	}
	if v == nil {
		return true
	}
	if d.Type == "boolean" {
		if _, ok := v.(bool); !ok {
			return false
		}
		if len(d.Options) == 0 {
			return true
		}
	}
	for _, o := range d.Options {
		other, ok := decodePrimitive(o)
		if ok && v == other {
			return true
		}
	}
	return false
}

// Validation is independent of the provider's response schema.
func Validate(raw []byte, in Input) (Parsed, error) {
	var p Parsed
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil || len(fields) != 3 || fields["intent"] == nil || fields["category"] == nil || fields["filters"] == nil {
		return p, ErrInvalid
	}
	if dec.Decode(&p) != nil || dec.Decode(new(any)) != io.EOF || p.Filters == nil {
		return Parsed{}, ErrInvalid
	}
	if p.Intent != nil && *p.Intent != "cheapest" && *p.Intent != "search" {
		return Parsed{}, ErrInvalid
	}
	if p.Category != nil {
		found := false
		for _, c := range in.Categories {
			if c.Slug == *p.Category {
				found = true
			}
		}
		if !found {
			return Parsed{}, ErrInvalid
		}
	}
	selected := p.Category
	if selected == nil {
		selected = in.CurrentCategory
	}
	for k, v := range p.Filters {
		if !validFilter(v, allowed(in.Schemas, selected, k)) {
			return Parsed{}, ErrInvalid
		}
	}
	return p, nil
}
func Merge(previous Session, update Parsed, schemas []catalog.FilterSchema) Session {
	category := update.Category
	if category == nil {
		category = previous.Category
	}
	same := category != nil && previous.Category != nil && *category == *previous.Category
	out := Session{Parsed: Parsed{Intent: previous.Intent, Category: category, Filters: map[string]json.RawMessage{}}, Latitude: previous.Latitude, Longitude: previous.Longitude}
	if out.Intent == nil {
		out.Intent = update.Intent
	}
	if same {
		for k, v := range previous.Filters {
			if allowed(schemas, category, k) != nil {
				out.Filters[k] = v
			}
		}
	}
	for k, v := range update.Filters {
		if allowed(schemas, category, k) != nil && !bytes.Equal(bytes.TrimSpace(v), []byte("null")) {
			out.Filters[k] = v
		}
	}
	return out
}
func Missing(s Session) []string {
	out := []string{}
	if s.Intent == nil {
		out = append(out, "intent")
	}
	if s.Category == nil {
		out = append(out, "category")
	}
	if s.Category != nil && *s.Category == "milk" {
		for _, k := range []string{"volumeMl", "fatPercent"} {
			v := s.Filters[k]
			if len(v) == 0 || strings.TrimSpace(string(v)) == "null" {
				out = append(out, k)
			}
		}
	}
	return out
}

// QuestionFields targets only the question asked now, not every missing field.
func QuestionFields(missing []string) []string {
	for _, priority := range []string{"intent", "category"} {
		for _, key := range missing {
			if key == priority {
				return []string{priority}
			}
		}
	}
	out := []string{}
	for _, key := range []string{"volumeMl", "fatPercent"} {
		for _, missingKey := range missing {
			if missingKey == key {
				out = append(out, key)
				break
			}
		}
	}
	return out
}

func Question(missing []string) string {
	has := func(k string) bool {
		for _, m := range missing {
			if m == k {
				return true
			}
		}
		return false
	}
	if has("intent") {
		return "Что нужно сделать: найти цены или самый дешёвый товар?"
	}
	if has("category") {
		return "Какой товар вы ищете?"
	}
	if has("volumeMl") && has("fatPercent") {
		return "Какой объём и жирность молока вам нужны?"
	}
	if has("volumeMl") {
		return "Какой объём молока вам нужен?"
	}
	return "Какая жирность молока вам нужна?"
}
