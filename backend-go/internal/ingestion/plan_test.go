package ingestion

import "testing"

func raw(store, id string) RawProduct {
	return RawProduct{StoreCode: store, SourceProductID: id, Name: id, Price: 100}
}
func one() *float64 { v := 1.0; return &v }
func group(members ...RawProduct) Group {
	g := Group{Name: "g", Category: "milk"}
	for _, m := range members {
		g.Members = append(g.Members, Member{Raw: m, Method: "ai", Confidence: one(), Review: "approved"})
	}
	return g
}

var cats = map[string]string{"milk": "cat-milk"}

func bundleOf(groups ...Group) Bundle {
	b := Bundle{Version: "1.0", Groups: groups}
	for _, g := range groups {
		for _, m := range g.Members {
			b.RawProducts = append(b.RawProducts, m.Raw)
		}
	}
	return b
}

func TestResolveStrictStillRejectsMerge(t *testing.T) {
	a, d, f := raw("DINA", "1"), raw("DANA", "2"), raw("FIX_PRICE", "3")
	prev := map[Identity][]string{a.Identity(): {"X"}, d.Identity(): {"Y"}}
	_, rep, err := resolve(bundleOf(group(a, d), group(f)), prev, nil, cats, 100, false)
	if err == nil || rep.FailureCode != "canonical_merge_conflict" {
		t.Fatalf("want merge conflict, got %v %q", err, rep.FailureCode)
	}
}

func TestResolveReclusterMergeKeepsLargestPrevious(t *testing.T) {
	a, a2, d, f := raw("DINA", "1"), raw("DANA", "9"), raw("DANA", "2"), raw("FIX_PRICE", "3")
	prev := map[Identity][]string{a.Identity(): {"Y"}, a2.Identity(): {"Y"}, d.Identity(): {"X"}}
	out, rep, err := resolve(bundleOf(group(a, a2, d), group(f)), prev, nil, cats, 100, true)
	if err != nil {
		t.Fatal(err)
	}
	if out[0].ID != "Y" || !out[0].Reused || rep.MergedCanonical != 1 {
		t.Fatalf("want reuse Y with 1 merge, got %+v %+v", out[0], rep)
	}
}

func TestResolveReclusterSplitGivesNewIDToSmallerGroup(t *testing.T) {
	a, d, d2, f := raw("DINA", "1"), raw("DANA", "2"), raw("DANA", "3"), raw("FIX_PRICE", "4")
	prev := map[Identity][]string{a.Identity(): {"X"}, d.Identity(): {"X"}, d2.Identity(): {"X"}}
	out, rep, err := resolve(bundleOf(group(a, d), group(d2), group(f)), prev, nil, cats, 100, true)
	if err != nil {
		t.Fatal(err)
	}
	if out[0].ID != "X" || out[1].ID == "X" || out[1].Reused || rep.SplitCanonical != 1 {
		t.Fatalf("want X kept by larger group and split counted, got %+v %+v %+v", out[0], out[1], rep)
	}
}
