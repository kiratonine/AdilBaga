package catalog

import (
	"encoding/json"
	"strings"
	"unicode"
	"unicode/utf8"
)

// BrandKey is the Unicode lowercase identity also used by PostgreSQL's
// pg_c_utf8 collation. Whitespace and punctuation are significant.
func BrandKey(value string) string {
	if !utf8.ValidString(value) || strings.TrimSpace(value) == "" {
		return ""
	}
	return strings.ToLower(value)
}

func BrandOptionKey(raw json.RawMessage) string {
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return ""
	}
	return BrandKey(value)
}

func BrandAllowed(value string, options []json.RawMessage) bool {
	key := BrandKey(value)
	if key == "" {
		return false
	}
	for _, option := range options {
		if BrandOptionKey(option) == key {
			return true
		}
	}
	return false
}

// BrandLabel title-cases the first letter of each whitespace-delimited
// word after any leading digits or punctuation. Leave a letter unchanged
// if its title case would round-trip to a different lowercase identity.
func BrandLabel(key string) string {
	firstLetter := true
	return strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			firstLetter = true
		} else if firstLetter && unicode.IsLetter(r) {
			firstLetter = false
			if title := unicode.ToTitle(r); unicode.ToLower(title) == r {
				return title
			}
		}
		return r
	}, key)
}
