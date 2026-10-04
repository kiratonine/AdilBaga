package ingestion

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func sample() Bundle {
	confidence := 1.0
	b := Bundle{Version: "1.0", GeneratedAt: "2026-10-05T12:00:00Z"}
	for _, store := range stores {
		p := RawProduct{StoreCode: store, SourceProductID: "source", Name: "Milk", Price: 100, RawPayload: map[string]any{}}
		b.RawProducts = append(b.RawProducts, p)
		b.Groups = append(b.Groups, Group{Name: "Milk", Category: "milk", Attributes: map[string]any{"volumeMl": json.Number("1000"), "lactoseFree": false}, Members: []Member{{Raw: p, Method: "deterministic", Confidence: &confidence, Review: "approved"}}})
	}
	return b
}

func TestPreparedDataset(t *testing.T) {
	f, err := os.Open("../../../data/snapshots/final_dataset.json")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	b, err := Decode(f)
	if err != nil {
		t.Fatal(err)
	}
	if len(b.RawProducts) != 863 || len(b.Groups) != 849 {
		t.Fatal("prepared dataset counts")
	}
	_, report, err := resolve(b, nil, nil, map[string]string{"milk": "milk", "sugar": "sugar", "oil": "oil", "eggs": "eggs", "bread": "bread", "other": "other"}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if report.MatchedAcrossStores != 14 || report.NewCanonical != 849 {
		t.Fatal("prepared dataset identity metrics")
	}
}

func TestBundleValidation(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(*Bundle)
	}{
		{"version", func(b *Bundle) { b.Version = "2" }},
		{"capture", func(b *Bundle) { b.GeneratedAt = "invalid" }},
		{"duplicate", func(b *Bundle) { b.RawProducts = append(b.RawProducts, b.RawProducts[0]) }},
		{"price", func(b *Bundle) { b.RawProducts[0].Price = 0 }},
		{"member mismatch", func(b *Bundle) { b.Groups[0].Members[0].Raw.Price++ }},
		{"coverage", func(b *Bundle) { b.Groups = b.Groups[1:] }},
		{"nested attribute", func(b *Bundle) { b.Groups[0].Attributes["x"] = map[string]any{"x": true} }},
		{"confidence", func(b *Bundle) { v := 2.0; b.Groups[0].Members[0].Confidence = &v }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b := sample()
			tc.mutate(&b)
			if b.Validate() == nil {
				t.Fatal("invalid bundle accepted")
			}
		})
	}
	if sample().Validate() != nil {
		t.Fatal("valid typed bundle rejected")
	}
	if _, err := Decode(strings.NewReader(`{} {}`)); err == nil {
		t.Fatal("trailing JSON accepted")
	}
}

func TestCanonicalIdentityAndQuality(t *testing.T) {
	cats := map[string]string{"milk": "category"}
	b := sample()
	old := map[Identity][]string{b.RawProducts[0].Identity(): {"stable-1"}, b.RawProducts[1].Identity(): {"stable-2"}}
	result, report, err := resolve(b, old, nil, cats, 0)
	if err != nil || result[0].ID != "stable-1" || result[1].ID != "stable-2" || report.ReusedCanonical != 2 || report.NewCanonical != 1 {
		t.Fatal("stable identity")
	}
	cases := []struct {
		name     string
		bundle   Bundle
		previous map[Identity][]string
		counts   map[string]int
		code     string
	}{
		{"drop", b, nil, map[string]int{"DINA": 2}, "store_count_drop"},
		{"merge", b, map[Identity][]string{b.RawProducts[0].Identity(): {"one", "two"}}, nil, "canonical_merge_conflict"},
		{"split", b, map[Identity][]string{b.RawProducts[0].Identity(): {"one"}, b.RawProducts[1].Identity(): {"one"}}, nil, "canonical_split_conflict"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, r, e := resolve(tc.bundle, tc.previous, tc.counts, cats, 0)
			if e == nil || r.FailureCode != tc.code {
				t.Fatal("quality gate")
			}
		})
	}
	b.RawProducts = b.RawProducts[1:]
	b.Groups = b.Groups[1:]
	if _, r, e := resolve(b, nil, nil, cats, 0); e == nil || r.FailureCode != "required_source_missing" {
		t.Fatal("required store")
	}
	b = sample()
	b.Groups[0].Category = "unknown"
	if _, r, e := resolve(b, nil, nil, cats, 0); e == nil || r.FailureCode != "unknown_canonical_category" {
		t.Fatal("unknown category")
	}
}
