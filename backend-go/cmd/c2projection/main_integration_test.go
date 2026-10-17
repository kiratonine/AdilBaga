//go:build integration

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"adilbaga/backend-go/internal/postgres"
	"github.com/jackc/pgx/v5"
)

const (
	s0 = "aaaaaaaa-0000-4000-8000-000000000000"
	s1 = "bbbbbbbb-1111-4111-8111-111111111111"
	s2 = "cccccccc-2222-4222-8222-222222222222"
)

type output struct {
	Version            int     `json:"version"`
	Phase              string  `json:"phase"`
	AttemptID          string  `json:"attemptId"`
	SnapshotID         string  `json:"snapshotId"`
	PreviousSnapshotID *string `json:"previousSnapshotId"`
	Provenance         struct {
		Kind, EvidenceID, CanonicalStateID, SourceSHA, FrontendSHA, Semantics, SnapshotStatus string
		ConsistentRead                                                                        bool
	} `json:"provenance"`
	Body postgres.C2Body `json:"body"`
}

// Explicit disposable PG17 database only; never DATABASE_URL or a production profile.
func disposable(t *testing.T) (admin, reader string) {
	t.Helper()
	admin, reader = os.Getenv("C2_ADMIN_DATABASE_URL"), os.Getenv("C2_READER_DATABASE_URL")
	if admin == "" && reader == "" {
		t.Skip("explicit disposable C2 projection profile required")
	}
	a, errA := url.Parse(admin)
	r, errR := url.Parse(reader)
	loopback := func(h string) bool { return h == "127.0.0.1" || h == "::1" }
	if errA != nil || errR != nil || os.Getenv("C2_DISPOSABLE_CONFIRM") != "1" || a.User == nil || r.User == nil ||
		a.User.Username() != "postgres" || r.User.Username() != "aktau_api_runtime" || a.Path != "/part16_c2" || a.Host != r.Host || a.Path != r.Path ||
		!loopback(a.Hostname()) || a.RawQuery != "sslmode=disable" || r.RawQuery != "sslmode=disable" {
		t.Fatal("refusing non-disposable/non-loopback C2 profile")
	}
	for _, v := range []string{admin, reader} {
		c, err := pgx.ParseConfig(v)
		if err != nil || !loopback(c.Host) || len(c.Fallbacks) != 0 || c.Database != "part16_c2" {
			t.Fatal("invalid local C2 target")
		}
	}
	return admin, reader
}

func TestLocalC2Projection(t *testing.T) {
	adminURL, readerURL := disposable(t)
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	admin, err := pgx.Connect(ctx, adminURL)
	if err != nil {
		t.Fatal("local admin connection failed")
	}
	defer admin.Close(context.Background())
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := admin.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("fixture SQL failed: %v", err)
		}
	}
	exec(`TRUNCATE snapshots,stores,categories,canonical_products CASCADE;
INSERT INTO stores(id,code,name) VALUES ('dina','DINA','Dina'),('dana','DANA','Dana'),('fix','FIX_PRICE','Fix Price');
INSERT INTO categories(id,slug,name) VALUES ('milk','milk','Milk'),('oil','oil','Oil'),('bulk','bulk','Bulk');
INSERT INTO canonical_products(id,name,brand,"categoryId",attributes)
SELECT 'p'||lpad(i::text,2,'0'),'Product '||i,'A',CASE WHEN i<=6 THEN 'milk' ELSE 'oil' END,'{}' FROM generate_series(1,12) i;`)
	// Spread grows with i, so Top-8 is p12..p05 and the BEFORE witness is p05.
	snapshot := func(id, at string, delta int) {
		exec(`INSERT INTO snapshots(id,status) VALUES ($1,'validating')`, id)
		exec(`INSERT INTO raw_products(id,"storeId","sourceProductId","rawName","rawPrice","snapshotId")
SELECT left($1,8)||'-'||s||'-'||i,s,s||i,'raw',100,$1 FROM generate_series(1,12) i, unnest(ARRAY['dina','dana']) s`, id)
		exec(`INSERT INTO offers(id,"canonicalProductId","rawProductId","storeId",price,"inStock","snapshotAt","snapshotId")
SELECT 'o-'||left($1,8)||'-'||s||'-'||i,'p'||lpad(i::text,2,'0'),left($1,8)||'-'||s||'-'||i,s,
 CASE s WHEN 'dina' THEN 100+i+$3 ELSE 100+i+i*i*3+$3 END,true,$2::timestamp,$1 FROM generate_series(1,12) i, unnest(ARRAY['dina','dana']) s`, id, at, delta)
	}
	publish := func(id, at string) {
		exec(`UPDATE snapshots SET status='published',"publishedAt"=$2 WHERE id=$1`, id, at)
	}

	sourceSHA = sha
	defer func() { sourceSHA = "" }()
	invoke := func(env map[string]string, args []string) (int, []byte, string) {
		var stdout, stderr bytes.Buffer
		code := run(args, func(k string) string { return env[k] }, &stdout, &stderr)
		if code != exitOK && stdout.Len() != 0 {
			t.Fatal("partial output on failure")
		}
		if strings.Contains(stderr.String(), "ci-local-only") || strings.Contains(stderr.String(), "SELECT") {
			t.Fatal("stderr leaked details")
		}
		return code, stdout.Bytes(), stderr.String()
	}
	prod := map[string]string{"APP_ENV": "production", "C2_PROJECTION_DATABASE_URL": readerURL}
	project := func(args []string) output {
		t.Helper()
		code, out, stderr := invoke(prod, args)
		if code != exitOK {
			t.Fatalf("projection exit %d %s", code, stderr)
		}
		var o output
		decoder := json.NewDecoder(bytes.NewReader(out))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&o) != nil || len(out) >= 16<<10 || o.Version != 2 || o.AttemptID != attempt || o.Provenance.SourceSHA != sha || o.Provenance.FrontendSHA != sha || !o.Provenance.ConsistentRead {
			t.Fatal("projection document invalid")
		}
		return o
	}
	afterArgs := func(snapshot, previous, witness, slug string) []string {
		return []string{"-phase", "after", "-attempt", attempt, "-frontend-sha", sha, "-snapshot", snapshot, "-previous", previous, "-witness", witness, "-slug", slug}
	}
	expectCode := func(name string, env map[string]string, args []string, want int) {
		t.Helper()
		if code, _, _ := invoke(env, args); code != want {
			t.Fatalf("%s: exit %d, want %d", name, code, want)
		}
	}

	// No published UUID snapshot yet: fail closed.
	expectCode("empty history", prod, before(), exitChain)

	snapshot(s0, "2026-10-15 00:30:00.123", 0)
	publish(s0, "2026-10-15 01:00:00")
	snapshot(s1, "2026-10-16 00:30:00.456", 10) // staged, not yet visible
	b := project(before())
	if b.Phase != postgres.C2PhaseBefore || b.SnapshotID != s0 || b.PreviousSnapshotID != nil || b.Provenance.EvidenceID != attempt+"-before" {
		t.Fatal("BEFORE identity")
	}
	if b.Body.DashboardAt != "2026-10-15T00:30:00.123Z" || strings.Join(b.Body.TopEight, ",") != "p12,p11,p10,p09,p08,p07,p06,p05" {
		t.Fatalf("BEFORE dashboard/top-8: %s %v", b.Body.DashboardAt, b.Body.TopEight)
	}
	if b.Body.WitnessID == nil || *b.Body.WitnessID != "p05" || len(b.Body.Candidates) != 8 || len(b.Body.CategoryPages) != 2 {
		t.Fatal("BEFORE witness/candidates")
	}
	if b.Body.Sitemap.ProductCount != 12 || b.Body.Sitemap.Truncated || strings.Join(b.Body.Sitemap.CategorySlugs, ",") != "milk,oil" {
		t.Fatal("BEFORE sitemap")
	}
	// Byte-identical to the API: same MAX expression and productWire layout.
	pool, err := postgres.OpenReadOnly(ctx, readerURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	api, err := postgres.NewRepository(pool).GetProductByID(ctx, "p05")
	if err != nil {
		t.Fatal(err)
	}
	var witness postgres.C2Candidate
	for _, c := range b.Body.Candidates {
		if c.ID == "p05" {
			witness = c
		}
	}
	if witness.SnapshotAt == nil || *witness.SnapshotAt != api.SnapshotAt.UTC().Format("2006-01-02T15:04:05.000Z") || *witness.Slug != "milk" ||
		*witness.TopEightIndex != 7 || *witness.CategoryIndex != 4 || *witness.SitemapIndex != 4 {
		t.Fatal("BEFORE witness fields")
	}
	again := project(before())
	if again.Provenance.CanonicalStateID != b.Provenance.CanonicalStateID {
		t.Fatal("BEFORE projection not deterministic")
	}

	// AFTER requested before S1 is committed: chain mismatch.
	expectCode("after before commit", prod, afterArgs(s1, s0, "p05", "milk"), exitChain)
	publish(s1, "2026-10-16 01:00:00")
	exec(`UPDATE canonical_products SET name=name||' revised'`) // reused masters mutate on publish
	a := project(afterArgs(s1, s0, "p05", "milk"))
	if a.Phase != postgres.C2PhaseAfter || a.SnapshotID != s1 || a.PreviousSnapshotID == nil || *a.PreviousSnapshotID != s0 || a.Provenance.EvidenceID != attempt+"-after" ||
		a.Provenance.CanonicalStateID == b.Provenance.CanonicalStateID {
		t.Fatal("AFTER identity/chain")
	}
	if a.Body.WitnessID == nil || *a.Body.WitnessID != "p05" || len(a.Body.Candidates) != 1 || len(a.Body.CategoryPages) != 1 || a.Body.CategoryPages[0].Slug != "milk" {
		t.Fatal("AFTER must project only the pinned witness")
	}
	w := a.Body.Candidates[0]
	if a.Body.DashboardAt != "2026-10-16T00:30:00.456Z" || w.SnapshotAt == nil || *w.SnapshotAt != "2026-10-16T00:30:00.456Z" || w.TopEightIndex == nil || w.CategoryIndex == nil || w.SitemapIndex == nil {
		t.Fatal("AFTER witness markers")
	}
	ghost := project(afterArgs(s1, s0, "ghost", "milk"))
	if g := ghost.Body.Candidates[0]; g.ID != "ghost" || g.Slug != nil || g.SnapshotAt != nil || g.TopEightIndex != nil || g.CategoryIndex != nil || g.SitemapIndex != nil {
		t.Fatal("absent witness must be null data, not a substitute")
	}
	expectCode("wrong snapshot", prod, afterArgs(s2, s0, "p05", "milk"), exitChain)
	expectCode("wrong previous", prod, afterArgs(s1, s2, "p05", "milk"), exitChain)

	// Read-only identity: each grant must be rejected, then restored.
	acl := []struct{ name, grant, revoke string }{
		{"direct INSERT", `GRANT INSERT ON offers TO aktau_api_runtime`, `REVOKE INSERT ON offers FROM aktau_api_runtime`},
		{"PUBLIC UPDATE", `GRANT UPDATE ON snapshots TO PUBLIC`, `REVOKE UPDATE ON snapshots FROM PUBLIC`},
		{"column UPDATE", `GRANT UPDATE (price) ON offers TO aktau_api_runtime`, `REVOKE UPDATE (price) ON offers FROM aktau_api_runtime`},
		{"sequence UPDATE", `CREATE SEQUENCE c2_probe_seq; GRANT USAGE,UPDATE ON SEQUENCE c2_probe_seq TO aktau_api_runtime`, `DROP SEQUENCE c2_probe_seq`},
		{"schema CREATE", `GRANT CREATE ON SCHEMA public TO aktau_api_runtime`, `REVOKE CREATE ON SCHEMA public FROM aktau_api_runtime`},
		{"database CREATE", `GRANT CREATE ON DATABASE part16_c2 TO aktau_api_runtime`, `REVOKE CREATE ON DATABASE part16_c2 FROM aktau_api_runtime`},
		{"SET membership", `GRANT aktau_api_reader TO aktau_api_runtime WITH SET TRUE`, `GRANT aktau_api_reader TO aktau_api_runtime WITH SET FALSE`},
	}
	for _, c := range acl {
		exec(c.grant)
		code, _, stderr := invoke(prod, afterArgs(s1, s0, "p05", "milk"))
		exec(c.revoke)
		if code != exitIdentity || stderr != "c2projection_failed:identity\n" {
			t.Fatalf("%s accepted: exit %d", c.name, code)
		}
	}
	expectCode("superuser in production", map[string]string{"APP_ENV": "production", "C2_PROJECTION_DATABASE_URL": adminURL}, afterArgs(s1, s0, "p05", "milk"), exitIdentity)
	expectCode("superuser ACL outside production", map[string]string{"APP_ENV": "test", "C2_PROJECTION_DATABASE_URL": adminURL}, afterArgs(s1, s0, "p05", "milk"), exitIdentity)
	project(afterArgs(s1, s0, "p05", "milk")) // restored grants admit again

	// An intervening publication breaks the S1 -> S0 chain. Its 5001 cheaper
	// products also prove the 50-page sitemap boundary.
	snapshot(s2, "2026-10-17 00:30:00.789", 20)
	exec(`INSERT INTO canonical_products(id,name,brand,"categoryId",attributes)
SELECT 'b'||lpad(i::text,4,'0'),'Bulk '||i,'A','bulk','{}' FROM generate_series(1,5001) i`)
	exec(`INSERT INTO raw_products(id,"storeId","sourceProductId","rawName","rawPrice","snapshotId")
SELECT 'cccccccc-bulk-'||i,'fix','bulk'||i,'raw',1,$1 FROM generate_series(1,5001) i`, s2)
	exec(`INSERT INTO offers(id,"canonicalProductId","rawProductId","storeId",price,"inStock","snapshotAt","snapshotId")
SELECT 'o-bulk-'||i,'b'||lpad(i::text,4,'0'),'cccccccc-bulk-'||i,'fix',1,true,'2026-10-17 00:30:00.789',$1 FROM generate_series(1,5001) i`, s2)
	publish(s2, "2026-10-17 01:00:00")
	expectCode("intervening publication", prod, afterArgs(s1, s0, "p05", "milk"), exitChain)
	started := time.Now()
	t2 := project(before())
	t.Logf("BEFORE projection over 5013 products: %s", time.Since(started))
	if t2.SnapshotID != s2 || t2.PreviousSnapshotID == nil || *t2.PreviousSnapshotID != s1 || t2.Body.Sitemap.ProductCount != 5000 || !t2.Body.Sitemap.Truncated {
		t.Fatal("sitemap boundary")
	}
	for _, c := range t2.Body.Candidates {
		if c.SitemapIndex != nil {
			t.Fatal("products beyond 5000 must not claim sitemap membership")
		}
	}
	if t2.Body.WitnessID != nil {
		t.Fatal("no qualified witness beyond the sitemap boundary")
	}
}
