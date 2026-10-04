package ingestion

import (
	"crypto/rand"
	"errors"
	"fmt"
)

type Report struct {
	RawCount                   int            `json:"rawCount"`
	PerStore                   map[string]int `json:"perStoreCounts"`
	CanonicalCount             int            `json:"canonicalCount"`
	MatchedAcrossStores        int            `json:"matchedAcrossTwoOrMoreStores"`
	NewCanonical               int            `json:"newCanonicalCount"`
	ReusedCanonical            int            `json:"reusedCanonicalCount"`
	ImageCoverage              float64        `json:"imageCoverage"`
	SourceMetadataAvailability int            `json:"sourceMetadataAvailability"`
	FailureCode                string         `json:"failureCode,omitempty"`
}

func opaqueID() (string, error) {
	var v [16]byte
	if _, err := rand.Read(v[:]); err != nil {
		return "", errors.New("identity generation failed")
	}
	v[6] = (v[6] & 15) | 64
	v[8] = (v[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", v[:4], v[4:6], v[6:8], v[8:10], v[10:]), nil
}

type resolved struct {
	Group  Group
	ID     string
	Reused bool
}

func resolve(b Bundle, previous map[Identity][]string, counts map[string]int, categories map[string]string, maxDrop float64) ([]resolved, Report, error) {
	report := Report{RawCount: len(b.RawProducts), CanonicalCount: len(b.Groups), PerStore: map[string]int{}, SourceMetadataAvailability: len(b.Sources)}
	fail := func(code string) ([]resolved, Report, error) {
		report.FailureCode = code
		return nil, report, errors.New(code)
	}
	for _, s := range stores {
		report.PerStore[s] = 0
	}
	for _, p := range b.RawProducts {
		report.PerStore[p.StoreCode]++
	}
	for _, s := range stores {
		if report.PerStore[s] == 0 {
			return fail("required_source_missing")
		}
		if counts[s] > 0 && float64(counts[s]-report.PerStore[s])*100/float64(counts[s]) > maxDrop {
			return fail("store_count_drop")
		}
	}
	for _, s := range b.Sources {
		if s.ProductCount != nil && *s.ProductCount != report.PerStore[s.StoreCode] {
			return fail("source_count_mismatch")
		}
	}
	used := map[string]bool{}
	out := make([]resolved, 0, len(b.Groups))
	images := 0
	for _, g := range b.Groups {
		if _, ok := categories[g.Category]; !ok {
			return fail("unknown_canonical_category")
		}
		identities := map[string]bool{}
		chains := map[string]bool{}
		for _, m := range g.Members {
			chains[m.Raw.StoreCode] = true
			for _, id := range previous[m.Raw.Identity()] {
				identities[id] = true
			}
		}
		if len(chains) >= 2 {
			report.MatchedAcrossStores++
		}
		if g.ImageURL != nil && *g.ImageURL != "" {
			images++
		}
		if len(identities) > 1 {
			return fail("canonical_merge_conflict")
		}
		v := resolved{Group: g}
		for id := range identities {
			v.ID = id
			v.Reused = true
		}
		if v.Reused {
			if used[v.ID] {
				return fail("canonical_split_conflict")
			}
			used[v.ID] = true
			report.ReusedCanonical++
		} else {
			var err error
			v.ID, err = opaqueID()
			if err != nil {
				return nil, report, err
			}
			report.NewCanonical++
		}
		out = append(out, v)
	}
	if report.CanonicalCount > 0 {
		report.ImageCoverage = float64(images) / float64(report.CanonicalCount)
	}
	return out, report, nil
}
