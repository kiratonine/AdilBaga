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
	MergedCanonical            int            `json:"mergedCanonicalCount"`
	SplitCanonical             int            `json:"splitCanonicalCount"`
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

func resolve(b Bundle, previous map[Identity][]string, counts map[string]int, categories map[string]string, maxDrop float64, recluster bool) ([]resolved, Report, error) {
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
	// votes[i][id] = сколько участников группы i ранее принадлежали canonical id
	votes := make([]map[string]int, len(b.Groups))
	for i, g := range b.Groups {
		votes[i] = map[string]int{}
		for _, m := range g.Members {
			for _, id := range previous[m.Raw.Identity()] {
				votes[i][id]++
			}
		}
	}
	// Для split: какая группа сильнее всего претендует на каждый прежний id
	owner := map[string]int{}
	for i := range b.Groups {
		for id, n := range votes[i] {
			j, ok := owner[id]
			if !ok || n > votes[j][id] || (n == votes[j][id] && len(b.Groups[i].Members) > len(b.Groups[j].Members)) {
				owner[id] = i
			}
		}
	}
	used := map[string]bool{}
	out := make([]resolved, 0, len(b.Groups))
	images := 0
	for i, g := range b.Groups {
		if _, ok := categories[g.Category]; !ok {
			return fail("unknown_canonical_category")
		}
		chains := map[string]bool{}
		for _, m := range g.Members {
			chains[m.Raw.StoreCode] = true
		}
		if len(chains) >= 2 {
			report.MatchedAcrossStores++
		}
		if g.ImageURL != nil && *g.ImageURL != "" {
			images++
		}
		if len(votes[i]) > 1 && !recluster {
			return fail("canonical_merge_conflict")
		}
		if len(votes[i]) > 1 {
			report.MergedCanonical++
		}
		v := resolved{Group: g}
		best, bestVotes := "", 0
		for id, n := range votes[i] {
			if recluster && owner[id] != i {
				continue
			}
			if n > bestVotes || (n == bestVotes && id < best) {
				best, bestVotes = id, n
			}
		}
		if best != "" {
			if used[best] {
				return fail("canonical_split_conflict")
			}
			v.ID, v.Reused = best, true
			used[best] = true
			report.ReusedCanonical++
		} else {
			if len(votes[i]) > 0 {
				report.SplitCanonical++
			}
			var err error
			if v.ID, err = opaqueID(); err != nil {
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
