package ingestion

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"math"
	"reflect"
	"strings"
	"time"
)

type RawProduct struct {
	StoreCode       string         `json:"storeCode"`
	SourceProductID string         `json:"sourceProductId"`
	SourceURL       *string        `json:"sourceUrl"`
	Name            string         `json:"name"`
	Brand           *string        `json:"brand"`
	Category        *string        `json:"category"`
	Price           int64          `json:"price"`
	OldPrice        *int64         `json:"oldPrice"`
	ImageURL        *string        `json:"imageUrl"`
	RawPayload      map[string]any `json:"rawPayload"`
}
type Member struct {
	Raw        RawProduct `json:"rawProduct"`
	Method     string     `json:"matchMethod"`
	Confidence *float64   `json:"matchConfidence"`
	Review     string     `json:"reviewStatus"`
}
type Group struct {
	Name       string         `json:"canonicalName"`
	Brand      *string        `json:"brand"`
	Category   string         `json:"category"`
	ImageURL   *string        `json:"imageUrl"`
	Attributes map[string]any `json:"attributes"`
	Members    []Member       `json:"members"`
	// Matcher IDs, minPrice and offers are intentionally not decoded/trusted.
}
type SourceInput struct {
	StoreCode    string `json:"storeCode"`
	CapturedAt   string `json:"capturedAt"`
	ProductCount *int   `json:"productCount"`
	ErrorCount   int    `json:"errorCount"`
	// Arbitrary sourceStats/error bodies are never persisted as metadata.
}
type Bundle struct {
	Version     string        `json:"version"`
	GeneratedAt string        `json:"generatedAt"`
	RawProducts []RawProduct  `json:"rawProducts"`
	Groups      []Group       `json:"canonicalProducts"`
	Sources     []SourceInput `json:"sourceRuns"`
}
type Identity struct{ StoreCode, SourceProductID string }

func (r RawProduct) Identity() Identity { return Identity{r.StoreCode, r.SourceProductID} }

var stores = []string{"DINA", "DANA", "FIX_PRICE"}

func knownStore(v string) bool { return v == "DINA" || v == "DANA" || v == "FIX_PRICE" }
func reject() error            { return errors.New("prepared bundle invalid") }

// Prepared-file limit only, not a new public voice/search limit.
const MaxBundleBytes = 64 << 20

func Decode(reader io.Reader) (Bundle, error) {
	var b Bundle
	raw, err := io.ReadAll(io.LimitReader(reader, MaxBundleBytes+1))
	if err != nil || len(raw) > MaxBundleBytes {
		return b, reject()
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	if dec.Decode(&b) != nil {
		return b, reject()
	}
	var extra any
	if dec.Decode(&extra) != io.EOF {
		return b, reject()
	}
	return b, b.Validate()
}
func timestamp(v string) (time.Time, error) {
	t, err := time.Parse(time.RFC3339Nano, v)
	if err != nil || t.Year() < 1 || t.Year() > 9999 {
		return time.Time{}, reject()
	}
	return t.UTC(), nil
}
func scalar(v any) bool {
	switch x := v.(type) {
	case nil, string, bool:
		return true
	case json.Number:
		f, err := x.Float64()
		return err == nil && !math.IsNaN(f) && !math.IsInf(f, 0)
	case float64:
		return !math.IsNaN(x) && !math.IsInf(x, 0)
	}
	return false
}
func (b Bundle) Validate() error {
	if b.Version != "1.0" {
		return reject()
	}
	if _, err := timestamp(b.GeneratedAt); err != nil {
		return err
	}
	raw := make(map[Identity]RawProduct)
	for _, p := range b.RawProducts {
		if !knownStore(p.StoreCode) || strings.TrimSpace(p.SourceProductID) == "" || strings.TrimSpace(p.Name) == "" || p.Price <= 0 || p.Price > math.MaxInt32 {
			return reject()
		}
		if p.OldPrice != nil && (*p.OldPrice < math.MinInt32 || *p.OldPrice > math.MaxInt32) {
			return reject()
		}
		if _, ok := raw[p.Identity()]; ok {
			return reject()
		}
		raw[p.Identity()] = p
	}
	seen := make(map[Identity]bool)
	for _, g := range b.Groups {
		if strings.TrimSpace(g.Name) == "" || strings.TrimSpace(g.Category) == "" || len(g.Members) == 0 {
			return reject()
		}
		for _, v := range g.Attributes {
			if !scalar(v) {
				return reject()
			}
		}
		for _, m := range g.Members {
			p, ok := raw[m.Raw.Identity()]
			if !ok || seen[m.Raw.Identity()] || !reflect.DeepEqual(p, m.Raw) {
				return reject()
			}
			if m.Method != "barcode" && m.Method != "deterministic" && m.Method != "ai" && m.Method != "manual" {
				return reject()
			}
			if m.Review != "approved" && m.Review != "pending" && m.Review != "rejected" {
				return reject()
			}
			if m.Confidence == nil || math.IsNaN(*m.Confidence) || math.IsInf(*m.Confidence, 0) || *m.Confidence < 0 || *m.Confidence > 1 {
				return reject()
			}
			seen[m.Raw.Identity()] = true
		}
	}
	if len(seen) != len(raw) {
		return reject()
	}
	sourceSeen := map[string]bool{}
	for _, s := range b.Sources {
		if !knownStore(s.StoreCode) || sourceSeen[s.StoreCode] || s.ErrorCount < 0 {
			return reject()
		}
		if _, err := timestamp(s.CapturedAt); err != nil {
			return err
		}
		if s.ProductCount != nil && *s.ProductCount < 0 {
			return reject()
		}
		sourceSeen[s.StoreCode] = true
	}
	if len(b.Sources) != 0 && len(sourceSeen) != 3 {
		return reject()
	}
	return nil
}
