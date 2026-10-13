package voice

import (
	"context"
	"encoding/json"
	"errors"

	"adilbaga/backend-go/internal/catalog"
)

func validateParsed(p Parsed, in Input) error {
	raw, err := json.Marshal(p)
	if err != nil {
		return ErrInvalid
	}
	_, err = Validate(raw, in)
	return err
}

// Validate both provider/fallback candidates before any session mutation or SQL.
// Do not hold a snapshot transaction across the provider's network request.
func (s *Service) liveInput(ctx context.Context, in Input, p Parsed) (Input, Parsed, error) {
	if err := validateParsed(p, in); err != nil {
		return Input{}, Parsed{}, err
	}
	selected := p.Category
	if selected == nil {
		selected = in.CurrentCategory
	}
	if selected == nil {
		return in, p, nil
	}
	schema, err := s.Categories.GetFilterSchema(ctx, *selected)
	if err != nil {
		return Input{}, Parsed{}, errors.New("voice schema dependency failed")
	}
	configured := in.Schemas
	in.Schemas = []catalog.FilterSchema{schema}
	p = clarifyUnavailableMilk(p, configured, in)
	if err := validateParsed(p, in); err != nil {
		return Input{}, Parsed{}, err
	}
	return in, p, nil
}

// Only the two existing required milk fields can become missing when a declared
// numeric option is unavailable now. Unknown/foreign/ill-typed values are not
// repaired. Copy the map so parser or Redis-owned state is never mutated.
func clarifyUnavailableMilk(p Parsed, configured []catalog.FilterSchema, live Input) Parsed {
	category := p.Category
	if category == nil {
		category = live.CurrentCategory
	}
	if category == nil || *category != "milk" {
		return p
	}
	filters := make(map[string]json.RawMessage, len(p.Filters))
	for key, value := range p.Filters {
		filters[key] = value
	}
	for _, key := range []string{"volumeMl", "fatPercent"} {
		raw, exists := filters[key]
		if !exists {
			continue
		}
		value, ok := decodePrimitive(raw)
		if _, number := value.(float64); ok && number && validFilter(raw, allowed(configured, category, key)) && !validFilter(raw, allowed(live.Schemas, category, key)) {
			delete(filters, key)
		}
	}
	p.Filters = filters
	return p
}
