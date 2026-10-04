package voice

import (
	"context"
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
)

var keywords = []struct {
	pattern *regexp.Regexp
	slug    string
}{
	{regexp.MustCompile(`молок[оа]`), "milk"}, {regexp.MustCompile(`хлеб`), "bread"}, {regexp.MustCompile(`яйц[ао]`), "eggs"}, {regexp.MustCompile(`сахар`), "sugar"}, {regexp.MustCompile(`масл[оа]`), "oil"},
}
var volume500 = regexp.MustCompile(`\b500\s*мл(?:[^\p{L}]|$)`)
var volume1000 = regexp.MustCompile(`(?:^|[^\p{L}\p{N}])(?:1|один)\s*(?:литра?|л)(?:[^\p{L}]|$)`)
var percent = regexp.MustCompile(`\b(\d+(?:[.,]\d+)?)\s*(?:%|процент(?:а|ов)?)(?:[^\p{L}]|$)`)
var cheap = regexp.MustCompile(`деш[её]в|дешевле`)
var search = regexp.MustCompile(`цены|найди|найти|покажи`)

type Fallback struct{}

func (Fallback) Parse(_ context.Context, in Input) (Parsed, error) {
	text := strings.ToLower(in.Text)
	p := Parsed{Filters: map[string]json.RawMessage{}}
	for _, k := range keywords {
		if k.pattern.MatchString(text) {
			for _, c := range in.Categories {
				if c.Slug == k.slug {
					slug := k.slug
					p.Category = &slug
				}
			}
			break
		}
	}
	selected := p.Category
	if selected == nil {
		selected = in.CurrentCategory
	}
	if selected != nil && *selected == "milk" {
		add := func(k string, v float64) {
			raw, _ := json.Marshal(v)
			if validFilter(raw, allowed(in.Schemas, selected, k)) {
				p.Filters[k] = raw
			}
		}
		if volume500.MatchString(text) {
			add("volumeMl", 500)
		} else if volume1000.MatchString(text) {
			add("volumeMl", 1000)
		}
		if match := percent.FindStringSubmatch(text); len(match) > 1 {
			if v, err := strconv.ParseFloat(strings.ReplaceAll(match[1], ",", "."), 64); err == nil {
				add("fatPercent", v)
			}
		}
	}
	if cheap.MatchString(text) {
		v := "cheapest"
		p.Intent = &v
	} else if search.MatchString(text) {
		v := "search"
		p.Intent = &v
	}
	return p, nil
}

// NLP wraps a provider with the approved deterministic fallback, never a data fallback.
type NLP struct{ Provider Parser }

func (n NLP) Parse(ctx context.Context, in Input) (Parsed, error) {
	if n.Provider != nil {
		if p, err := n.Provider.Parse(ctx, in); err == nil {
			return p, nil
		}
	}
	return (Fallback{}).Parse(ctx, in)
}
