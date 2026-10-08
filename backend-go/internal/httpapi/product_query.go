package httpapi

import (
	"adilbaga/backend-go/internal/catalog"
	"encoding/json"
	"math"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

var decimalInteger = regexp.MustCompile(`^[0-9]+$`)
var decimalNumber = regexp.MustCompile(`^-?[0-9]+(?:\.[0-9]+)?$`)

func parseProductQuery(raw url.Values, definitions []catalog.FilterDefinition) (catalog.ProductQuery, error) {
	q := catalog.ProductQuery{Sort: catalog.PriceAsc, Limit: 24, Filters: make(catalog.DynamicFilter)}
	for _, key := range []string{"category", "search", "sort", "limit", "offset"} {
		if values, ok := raw[key]; ok && len(values) != 1 {
			return q, catalog.ErrInvalidQuery
		}
	}
	q.Category = strings.TrimSpace(raw.Get("category"))
	q.Search = strings.TrimSpace(raw.Get("search"))
	if _, ok := raw["sort"]; ok {
		q.Sort = catalog.Sort(raw.Get("sort"))
		if q.Sort != catalog.PriceAsc && q.Sort != catalog.PriceDesc && q.Sort != catalog.NameAsc {
			return q, catalog.ErrInvalidQuery
		}
	}
	for _, key := range []string{"limit", "offset"} {
		if values, ok := raw[key]; ok {
			if !decimalInteger.MatchString(values[0]) {
				return q, catalog.ErrInvalidQuery
			}
			n, err := strconv.ParseUint(values[0], 10, 64)
			if err != nil || n > 9007199254740991 {
				return q, catalog.ErrInvalidQuery
			}
			if key == "limit" {
				if n < 1 || n > 100 {
					return q, catalog.ErrInvalidQuery
				}
				q.Limit = int(n)
			} else {
				q.Offset = int64(n)
			}
		}
	}
	for key, values := range raw {
		switch key {
		case "category", "search", "sort", "limit", "offset":
			continue
		}
		if q.Category == "" || len(values) == 0 {
			return q, catalog.ErrInvalidQuery
		}
		var definition *catalog.FilterDefinition
		for i := range definitions {
			if definitions[i].Key == key {
				definition = &definitions[i]
				break
			}
		}
		if definition == nil {
			return q, catalog.ErrInvalidQuery
		}
		for _, input := range values {
			var first any
			if len(definition.Options) > 0 {
				if json.Unmarshal(definition.Options[0], &first) != nil {
					return q, catalog.ErrInvalidQuery
				}
			}
			var parsed any = input
			switch {
			case definition.Type == "boolean" || isBoolean(first):
				if input != "true" && input != "false" {
					return q, catalog.ErrInvalidQuery
				}
				parsed = input == "true"
			case isNumber(first):
				if !decimalNumber.MatchString(input) {
					return q, catalog.ErrInvalidQuery
				}
				n, err := strconv.ParseFloat(input, 64)
				if err != nil || math.IsInf(n, 0) || math.IsNaN(n) {
					return q, catalog.ErrInvalidQuery
				}
				parsed = n
			}
			if len(definition.Options) > 0 {
				found := false
				for _, option := range definition.Options {
					var value any
					if json.Unmarshal(option, &value) == nil && value == parsed {
						found = true
						break
					}
				}
				if !found {
					return q, catalog.ErrInvalidQuery
				}
			}
			encoded, err := json.Marshal(parsed)
			if err != nil {
				return q, catalog.ErrInvalidQuery
			}
			q.Filters[key] = append(q.Filters[key], encoded)
		}
	}
	return q, nil
}
func isBoolean(v any) bool { _, ok := v.(bool); return ok }
func isNumber(v any) bool  { _, ok := v.(float64); return ok }
