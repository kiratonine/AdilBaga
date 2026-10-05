//go:build integration

package ingestion

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/postgres"
	"github.com/jackc/pgx/v5"
)

func localTarget(value string) bool {
	u, err := url.Parse(value)
	if err != nil || u.Path != "/part08" {
		return false
	}
	allowed := func(h string) bool { return h == "127.0.0.1" || h == "localhost" || h == "::1" }
	if !allowed(u.Hostname()) {
		return false
	}
	c, err := pgx.ParseConfig(value)
	if err != nil || !allowed(c.Host) || c.Database != "part08" {
		return false
	}
	for _, f := range c.Fallbacks {
		if !allowed(f.Host) {
			return false
		}
	}
	return true
}
func TestLocalTargetGuard(t *testing.T) {
	for _, s := range []string{"", "postgres://u:p@example.com/part08", "postgres://u:p@127.0.0.1/production", "postgres://u:p@127.0.0.1/part08?host=remote.example", "postgres://u:p@127.0.0.1/part08?host=127.0.0.1,remote.example"} {
		if localTarget(s) {
			t.Fatal("unsafe target")
		}
	}
	if !localTarget("postgres://u:p@127.0.0.1/part08") {
		t.Fatal("local target rejected")
	}
}
func cloneBundle(t *testing.T, b Bundle) Bundle {
	t.Helper()
	raw, err := json.Marshal(b)
	if err != nil {
		t.Fatal(err)
	}
	v, err := Decode(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatal(err)
	}
	return v
}

// Explicit disposable target only; never reads DATABASE_URL or production profiles.
// This test intentionally leaves published/failed history for the local HTTP
// history-isolation parity profile. The owning harness removes the container.
func TestLocalSnapshotPublication(t *testing.T) {
	writerURL, apiURL := os.Getenv("TEST_INGEST_DATABASE_URL"), os.Getenv("TEST_INGEST_API_DATABASE_URL")
	if writerURL == "" && apiURL == "" {
		t.Skip("explicit disposable snapshot profile required")
	}
	if !localTarget(writerURL) || !localTarget(apiURL) {
		t.Fatal("snapshot writes require dedicated loopback part08 database")
	}
	w, _ := url.Parse(writerURL)
	a, _ := url.Parse(apiURL)
	if w.Host != a.Host || w.Path != a.Path || w.User.Username() != "part08_writer" || a.User.Username() != "part08_api" {
		t.Fatal("explicit matching restricted credentials required")
	}
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	conn, err := pgx.Connect(ctx, writerURL)
	if err != nil {
		t.Fatal("local writer unavailable")
	}
	defer conn.Close(context.Background())
	pool, err := postgres.OpenReadOnly(ctx, apiURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	repo := postgres.NewRepository(pool)
	f, err := os.Open("../../../data/snapshots/final_dataset.json")
	if err != nil {
		t.Fatal(err)
	}
	b, err := Decode(f)
	f.Close()
	if err != nil {
		t.Fatal(err)
	}
	engine, err := New(conn, 0, false)
	if err != nil {
		t.Fatal(err)
	}
	previousIdentity, err := engine.baseline(ctx)
	if err != nil {
		t.Fatal(err)
	}
	current, err := repo.LatestPublishedSnapshot(ctx)
	if err != nil {
		t.Fatal("populated migration clone required")
	}
	output := func() string {
		t.Helper()
		items := []catalog.Product{}
		for page := 0; page < 20; page++ {
			p, e := repo.ListProducts(ctx, catalog.ProductQuery{Limit: 100, Offset: int64(page * 100)})
			if e != nil {
				t.Fatal(e)
			}
			items = append(items, p...)
			if len(p) < 100 {
				break
			}
			if page == 19 {
				t.Fatal("pagination safety")
			}
		}
		dashboard, e := repo.GetDashboard(ctx)
		if e != nil {
			t.Fatal(e)
		}
		filters, e := repo.GetFilterSchema(ctx, "milk")
		if e != nil {
			t.Fatal(e)
		}
		raw, e := json.Marshal([]any{items, dashboard, filters})
		if e != nil {
			t.Fatal(e)
		}
		return string(raw)
	}
	baseline := output()
	adminURL := os.Getenv("TEST_INGEST_ADMIN_DATABASE_URL")
	if !localTarget(adminURL) {
		t.Fatal("explicit local failure-injection admin required")
	}
	adminTarget, _ := url.Parse(adminURL)
	if adminTarget.Host != w.Host || adminTarget.Path != w.Path || adminTarget.User.Username() != "postgres" {
		t.Fatal("local admin must match dedicated clone")
	}
	admin, err := pgx.Connect(ctx, adminURL)
	if err != nil {
		t.Fatal("local failure-injection connection unavailable")
	}
	defer admin.Close(context.Background())
	fingerprint := func() string {
		t.Helper()
		var v string
		if conn.QueryRow(ctx, `SELECT md5(json_build_array((SELECT json_agg(r ORDER BY id) FROM snapshots r),(SELECT json_agg(r ORDER BY id) FROM source_runs r),(SELECT json_agg(r ORDER BY id) FROM raw_products r),(SELECT json_agg(r ORDER BY id) FROM canonical_products r),(SELECT json_agg(r ORDER BY id) FROM product_mappings r),(SELECT json_agg(r ORDER BY id) FROM offers r))::text)`).Scan(&v) != nil {
			t.Fatal("fingerprint unavailable")
		}
		return v
	}
	before := fingerprint()
	report, err := engine.DryRun(ctx, b)
	if err != nil || report.ReusedCanonical != 849 || report.NewCanonical != 0 || before != fingerprint() {
		t.Fatal("dry-run changed rows/identity")
	}
	candidate := cloneBundle(t, b)
	candidate.Groups[0].Name += " local published revision"
	removedIDs := []string{}
	replacements := map[Identity]RawProduct{}
	for i, g := range candidate.Groups {
		if g.Category != "milk" || g.Attributes["fatPercent"] != json.Number("8.5") {
			continue
		}
		removedIDs = append(removedIDs, previousIdentity.Identities[g.Members[0].Raw.Identity()][0])
		candidate.Groups[i].Category = "other"
		candidate.Groups[i].Name = "local replacement " + g.Members[0].Raw.SourceProductID
		candidate.Groups[i].Attributes = map[string]any{"productType": "other"}
		for j, m := range g.Members {
			p := m.Raw
			p.SourceProductID += "-part08-new"
			p.Name = candidate.Groups[i].Name
			replacements[m.Raw.Identity()] = p
			candidate.Groups[i].Members[j].Raw = p
		}
	}
	if len(removedIDs) == 0 {
		t.Fatal("real historical filter fixture unavailable")
	}
	for i, p := range candidate.RawProducts {
		if replacement, ok := replacements[p.Identity()]; ok {
			candidate.RawProducts[i] = replacement
		}
	}
	for i := range candidate.RawProducts {
		candidate.RawProducts[i].Price += 10000
	}
	for i := range candidate.Groups {
		for j := range candidate.Groups[i].Members {
			candidate.Groups[i].Members[j].Raw.Price += 10000
		}
	}
	writerRepo := postgres.NewRepository(conn)
	baselineFreshness, err := writerRepo.SourceFreshness(ctx)
	if err != nil || len(baselineFreshness) != 3 {
		t.Fatal("baseline freshness unavailable")
	}
	for _, source := range baselineFreshness {
		candidate.Sources = append(candidate.Sources, SourceInput{StoreCode: source.StoreCode, CapturedAt: source.LastSuccessfulSync.Add(-24 * time.Hour).Format(time.RFC3339Nano)})
	}
	var triggerExists bool
	if admin.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='part08_reject_offer')`).Scan(&triggerExists) != nil || triggerExists {
		t.Fatal("unexpected failure-injection artifact")
	}
	if _, err := admin.Exec(ctx, `CREATE FUNCTION public.part08_reject_offer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'local publication fault'; END $$; CREATE TRIGGER part08_reject_offer BEFORE INSERT ON offers FOR EACH ROW EXECUTE FUNCTION public.part08_reject_offer()`); err != nil {
		t.Fatal("local fault injection setup")
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), `DROP TRIGGER IF EXISTS part08_reject_offer ON offers; DROP FUNCTION IF EXISTS public.part08_reject_offer()`)
	})
	rejected, err := engine.Stage(ctx, candidate)
	if err != nil {
		t.Fatal(err)
	}
	if rejected.Publish(ctx) == nil {
		t.Fatal("injected publication fault ignored")
	}
	rejected.Close()
	if output() != baseline {
		t.Fatal("publication rollback leaked canonical metadata or offers")
	}
	if _, err := admin.Exec(ctx, `DROP TRIGGER part08_reject_offer ON offers; DROP FUNCTION public.part08_reject_offer()`); err != nil {
		t.Fatal("local fault injection cleanup")
	}
	staged, err := engine.Stage(ctx, candidate)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(staged.Close)
	if baseline != output() {
		t.Fatal("building/validating candidate leaked metadata/offers")
	}
	second, err := pgx.Connect(ctx, writerURL)
	if err != nil {
		t.Fatal("local second writer unavailable")
	}
	defer second.Close(context.Background())
	other, _ := New(second, 0, false)
	start := time.Now()
	_, err = other.DryRun(ctx, b)
	if err == nil || err.Error() != "ingestion already running" || time.Since(start) > time.Second {
		t.Fatal("advisory lock did not fail fast")
	}
	if err = staged.Publish(ctx); err != nil {
		t.Fatal(err)
	}
	staged.Close()
	next, err := repo.LatestPublishedSnapshot(ctx)
	if err != nil || next.ID == current.ID || !next.PublishedAt.After(current.PublishedAt) {
		t.Fatal("N+1 not published")
	}
	if output() == baseline {
		t.Fatal("N+1 not visible without reader restart")
	}
	state, err := engine.baseline(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, g := range candidate.Groups {
		for _, m := range g.Members {
			oldIDs := previousIdentity.Identities[m.Raw.Identity()]
			if len(state.Identities[m.Raw.Identity()]) != 1 || (len(oldIDs) > 0 && !reflect.DeepEqual(state.Identities[m.Raw.Identity()], oldIDs)) {
				t.Fatal("mapping continuity")
			}
		}
	}
	for _, id := range removedIDs {
		if _, err := repo.GetProductByID(ctx, id); !errors.Is(err, catalog.ErrNotFound) {
			t.Fatal("historical-only product leaked")
		}
	}
	currentFilters, err := repo.GetFilterSchema(ctx, "milk")
	if err != nil {
		t.Fatal(err)
	}
	for _, filter := range currentFilters.Filters {
		if filter.Key == "fatPercent" {
			for _, v := range filter.Options {
				if string(v) == "8.5" {
					t.Fatal("historical-only filter option leaked")
				}
			}
		}
	}
	history, err := repo.ListRecentPublishedSnapshots(ctx, 100)
	if err != nil || len(history) != 2 {
		t.Fatal("published history")
	}
	productID := state.Identities[candidate.Groups[0].Members[0].Raw.Identity()][0]
	priceHistory, err := repo.PriceHistory(ctx, productID, candidate.Groups[0].Members[0].Raw.StoreCode, 100)
	if err != nil || len(priceHistory) != 2 {
		t.Fatal("price history")
	}
	fresh, err := writerRepo.SourceFreshness(ctx)
	if err != nil || len(fresh) != 3 {
		t.Fatal("freshness")
	}
	for _, f := range fresh {
		for _, old := range baselineFreshness {
			if old.StoreCode == f.StoreCode && (!f.LastSuccessfulSync.Equal(old.LastSuccessfulSync.Add(-24*time.Hour)) || !f.SnapshotPublishedAt.After(old.SnapshotPublishedAt)) {
				t.Fatal("freshness must follow N+1 publication, not maximum historical capture")
			}
		}
	}
	liveOutput := output()
	abandoned, err := engine.Stage(ctx, candidate)
	if err != nil {
		t.Fatal(err)
	}
	abandoned.Close()
	if output() != liveOutput {
		t.Fatal("abandoned run changed published output")
	}
	after, err := writerRepo.SourceFreshness(ctx)
	if err != nil || !reflect.DeepEqual(fresh, after) {
		t.Fatal("failed snapshot advanced freshness")
	}
	for _, name := range []string{"missing source", "count drop", "unknown category", "merge", "split"} {
		t.Run(name, func(t *testing.T) {
			bad := cloneBundle(t, candidate)
			switch name {
			case "missing source":
				bad.Sources = nil
				raw := bad.RawProducts[:0]
				for _, p := range bad.RawProducts {
					if p.StoreCode != "FIX_PRICE" {
						raw = append(raw, p)
					}
				}
				bad.RawProducts = raw
				groups := []Group{}
				for _, g := range bad.Groups {
					members := []Member{}
					for _, m := range g.Members {
						if m.Raw.StoreCode != "FIX_PRICE" {
							members = append(members, m)
						}
					}
					g.Members = members
					if len(members) > 0 {
						groups = append(groups, g)
					}
				}
				bad.Groups = groups
			case "count drop":
				bad.Sources = nil
				removed := bad.Groups[0].Members
				keys := map[Identity]bool{}
				for _, m := range removed {
					keys[m.Raw.Identity()] = true
				}
				raw := []RawProduct{}
				for _, p := range bad.RawProducts {
					if !keys[p.Identity()] {
						raw = append(raw, p)
					}
				}
				bad.RawProducts = raw
				bad.Groups = bad.Groups[1:]
			case "unknown category":
				bad.Groups[0].Category = "unapproved"
			case "merge":
				bad.Groups[0].Members = append(bad.Groups[0].Members, bad.Groups[1].Members...)
				bad.Groups = append(bad.Groups[:1], bad.Groups[2:]...)
			case "split":
				found := false
				for i, g := range bad.Groups {
					if len(g.Members) > 1 {
						extra := g
						extra.Members = g.Members[1:]
						bad.Groups[i].Members = g.Members[:1]
						bad.Groups = append(bad.Groups, extra)
						found = true
						break
					}
				}
				if !found {
					t.Fatal("cross-store fixture missing")
				}
			}
			if _, err := engine.Stage(ctx, bad); err == nil {
				t.Fatal("quality failure published")
			}
			if output() != liveOutput {
				t.Fatal("failed candidate changed current API")
			}
			after, e := writerRepo.SourceFreshness(ctx)
			if e != nil || !reflect.DeepEqual(after, fresh) {
				t.Fatal("failed quality advanced freshness")
			}
		})
	}
	t.Log("LOCAL 849 canonical IDs / dry-run / fail-fast lock / staged metadata isolation / N+1 publish / history / failed freshness and quality safety PASS")
}
