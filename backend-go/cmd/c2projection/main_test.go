package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"adilbaga/backend-go/internal/postgres"
	"github.com/jackc/pgx/v5"
)

func TestProjectionPreparationConfig(t *testing.T) {
	for _, raw := range []string{
		"postgres://aktau_api_runtime:synthetic-only@127.0.0.1:5432/part16_c2?sslmode=disable",
		"postgres://aktau_api_runtime:synthetic-only@127.0.0.1:5432/part16_c2?sslmode=disable&default_query_exec_mode=simple_protocol",
	} {
		value, err := projectionDatabaseURL(raw)
		if err != nil {
			t.Fatal("projection configuration rejected")
		}
		c, err := pgx.ParseConfig(value)
		if err != nil || c.DefaultQueryExecMode != pgx.QueryExecModeExec {
			t.Error("one-shot projection must use extended exec without first-use statement preparation")
		}
		if c != nil && (c.Host != "127.0.0.1" || c.Port != 5432 || c.Database != "part16_c2" || c.User != "aktau_api_runtime" || c.Password != "synthetic-only") {
			t.Error("projection connection identity changed")
		}
	}
	if projectionTimeout != 8*time.Second || projectionTimeout >= 10*time.Second {
		t.Error("projection preparation must have a fixed eight-second bound below Node process deadline")
	}
}

func TestProjectionPreparationConfigRejectsMalformed(t *testing.T) {
	for _, raw := range []string{"", "https://invalid", "postgres://u:synthetic-only@127.0.0.1/db?sslmode=%QQ", "postgres://u:synthetic-only@127.0.0.1/db?bad;query=value"} {
		value, err := projectionDatabaseURL(raw)
		if err == nil || value != "" || strings.Contains(err.Error(), "synthetic-only") || strings.Contains(err.Error(), raw) && raw != "" {
			t.Fatal("malformed projection configuration did not fail closed with sanitized error")
		}
	}
}

const (
	attempt  = "0123456789abcdef0123456789abcdef"
	sha      = "0123456789abcdef0123456789abcdef01234567"
	snapshot = "aaaaaaaa-1111-4111-8111-bbbbbbbbbbbb"
	previous = "22222222-2222-4222-8222-222222222222"
)

func before(extra ...string) []string {
	return append([]string{"-phase", "before", "-attempt", attempt, "-frontend-sha", sha}, extra...)
}
func after() []string {
	return []string{"-phase", "after", "-attempt", attempt, "-frontend-sha", sha, "-snapshot", snapshot, "-previous", previous, "-witness", "p1", "-slug", "milk"}
}
func replace(args []string, flag, value string) []string {
	out := append([]string(nil), args...)
	for i := range out {
		if out[i] == flag {
			out[i+1] = value
		}
	}
	return out
}

func TestParse(t *testing.T) {
	valid := [][]string{before(), after()}
	for _, args := range valid {
		if _, ok := parse(args); !ok {
			t.Fatalf("valid arguments rejected: %v", args)
		}
	}
	invalid := map[string][]string{
		"empty":             {},
		"positional":        append(before(), "extra"),
		"equals form":       {"-phase=before", "-attempt", attempt, "-frontend-sha", sha},
		"double dash":       {"--phase", "before", "-attempt", attempt, "-frontend-sha", sha},
		"duplicate":         append(before(), "-attempt", attempt),
		"unknown":           before("-dsn", "x"),
		"before with after": before("-witness", "p1"),
		"after incomplete":  after()[:12],
		"bad phase":         replace(before(), "-phase", "AFTER"),
		"upper attempt":     replace(before(), "-attempt", strings.ToUpper(attempt)),
		"short attempt":     replace(before(), "-attempt", attempt[:31]),
		"newline attempt":   replace(before(), "-attempt", attempt+"\n"),
		"bad frontend sha":  replace(before(), "-frontend-sha", sha[:39]),
		"same snapshots":    replace(after(), "-previous", snapshot),
		"upper uuid":        replace(after(), "-snapshot", strings.ToUpper(snapshot)),
		"non-uuid snapshot": replace(after(), "-snapshot", "fixture-internal-v1"),
		"bad witness":       replace(after(), "-witness", "p1/../x"),
		"bad slug":          replace(after(), "-slug", "Milk"),
		"newline slug":      replace(after(), "-slug", "milk\n"),
	}
	for name, args := range invalid {
		if _, ok := parse(args); ok {
			t.Errorf("%s accepted", name)
		}
	}
}

func TestReadyBeforePrivatePhase(t *testing.T) {
	args := replace(before(), "-phase", "ready-before")
	if _, ok := parse(args); !ok {
		t.Fatal("private READY BEFORE phase unavailable; dashboardAt is not snapshots.publishedAt")
	}
}

func TestReadyEnvelopeTruePublishedAtPreservesV2(t *testing.T) {
	sourceSHA = sha
	defer func() { sourceSHA = "" }()
	published, _ := time.Parse(time.RFC3339Nano, "2026-10-21T01:02:03.004Z")
	state := postgres.C2State{SnapshotID: snapshot, PublishedAt: published, Body: postgres.C2Body{DashboardAt: "2026-10-20T00:00:00.000Z"}}
	o, _ := parse(before())
	original, err := document(o, state)
	if err != nil {
		t.Fatal(err)
	}
	out, err := readyDocument(original, state)
	if err != nil || len(out) >= 16<<10 {
		t.Fatal("envelope")
	}
	var parsed struct {
		Projection json.RawMessage `json:"projection"`
		Baseline   struct {
			SnapshotID  string `json:"snapshotId"`
			PublishedAt string `json:"publishedAt"`
		} `json:"baseline"`
	}
	if json.Unmarshal(out, &parsed) != nil || !bytes.Equal(parsed.Projection, bytes.TrimSuffix(original, []byte{'\n'})) || parsed.Baseline.SnapshotID != snapshot || parsed.Baseline.PublishedAt != "2026-10-21T01:02:03.004Z" {
		t.Fatal("true S0 timestamp or unchanged v2 bytes lost")
	}
	for _, at := range []time.Time{{}, published.Add(time.Nanosecond)} {
		state.PublishedAt = at
		if b, e := readyDocument(original, state); e == nil || b != nil {
			t.Fatal("unsafe S0 precision accepted")
		}
	}
}

func TestRunFailsClosedBeforeDatabase(t *testing.T) {
	env := func(values map[string]string) func(string) string { return func(k string) string { return values[k] } }
	good := map[string]string{"APP_ENV": "test", "C2_PROJECTION_DATABASE_URL": "postgres://u:p@127.0.0.1:1/db?sslmode=disable"}
	cases := []struct {
		name, source string
		args         []string
		env          map[string]string
	}{
		{"unbuilt source sha", "", before(), good},
		{"invalid source sha", "xyz", before(), good},
		{"bad args", sha, before("x"), good},
		{"missing APP_ENV", sha, before(), map[string]string{"C2_PROJECTION_DATABASE_URL": good["C2_PROJECTION_DATABASE_URL"]}},
		{"staging APP_ENV", sha, before(), map[string]string{"APP_ENV": "staging", "C2_PROJECTION_DATABASE_URL": good["C2_PROJECTION_DATABASE_URL"]}},
		{"missing DSN", sha, before(), map[string]string{"APP_ENV": "test"}},
		{"invalid DSN", sha, before(), map[string]string{"APP_ENV": "test", "C2_PROJECTION_DATABASE_URL": "mysql://x"}},
	}
	for _, tc := range cases {
		sourceSHA = tc.source
		var stdout, stderr bytes.Buffer
		if code := run(tc.args, env(tc.env), &stdout, &stderr); code != exitUsage || stdout.Len() != 0 {
			t.Errorf("%s: code=%d stdout=%d", tc.name, code, stdout.Len())
		}
		if strings.Contains(stderr.String(), "u:p") || !strings.HasPrefix(stderr.String(), "c2projection_failed:") {
			t.Errorf("%s: unsafe stderr", tc.name)
		}
	}
	// Unreachable loopback port: the lazy pool fails on Acquire, not on New.
	sourceSHA = sha
	var stdout, stderr bytes.Buffer
	if code := run(before(), env(good), &stdout, &stderr); code != exitIdentity || stdout.Len() != 0 || stderr.String() != "c2projection_failed:identity\n" {
		t.Fatalf("unreachable database: code=%d stderr=%q", code, stderr.String())
	}
	sourceSHA = ""
}

func TestDocumentHashesEmbeddedBody(t *testing.T) {
	sourceSHA = sha
	defer func() { sourceSHA = "" }()
	witness, slug, at, zero := "p1", "milk", "2026-10-16T01:00:00.000Z", 0
	state := postgres.C2State{SnapshotID: snapshot, PreviousSnapshotID: func() *string { v := previous; return &v }(), Body: postgres.C2Body{
		DashboardAt: at, TopEight: []string{"p1"}, WitnessID: &witness,
		Candidates:    []postgres.C2Candidate{{ID: "p1", Slug: &slug, SnapshotAt: &at, TopEightIndex: &zero, CategoryIndex: &zero, SitemapIndex: &zero}},
		CategoryPages: []postgres.C2CategoryPage{{Slug: "milk", ProductIDs: []string{"p1"}}},
		Sitemap:       postgres.C2Sitemap{CategorySlugs: []string{"milk"}, ProductCount: 1}}}
	o, _ := parse(after())
	out, err := document(o, state)
	if err != nil || len(out) >= 16<<10 || !bytes.HasSuffix(out, []byte("}\n")) || bytes.Count(out, []byte("\n")) != 1 {
		t.Fatal("document framing")
	}
	var parsed struct {
		Version    int             `json:"version"`
		Phase      string          `json:"phase"`
		Body       json.RawMessage `json:"body"`
		Provenance struct {
			EvidenceID, CanonicalStateID, SourceSHA string
		} `json:"provenance"`
	}
	if json.Unmarshal(out, &parsed) != nil || parsed.Version != 2 || parsed.Phase != postgres.C2PhaseAfter || parsed.Provenance.EvidenceID != attempt+"-after" || parsed.Provenance.SourceSHA != sha {
		t.Fatal("document envelope")
	}
	sum := sha256.Sum256(parsed.Body)
	wantBody, err := json.Marshal(state.Body)
	if err != nil || !bytes.Equal(parsed.Body, wantBody) || parsed.Provenance.CanonicalStateID != hex.EncodeToString(sum[:]) {
		t.Fatal("canonicalStateId must hash the embedded body bytes")
	}
	keys := []string{`"version"`, `"phase"`, `"attemptId"`, `"snapshotId"`, `"previousSnapshotId"`, `"provenance"`, `"body"`}
	last := -1
	for _, k := range keys {
		i := bytes.Index(out, []byte(k))
		if i <= last {
			t.Fatal("envelope key order")
		}
		last = i
	}
}

func TestDocumentSizeLimit(t *testing.T) {
	sourceSHA = sha
	defer func() { sourceSHA = "" }()
	o, _ := parse(before())
	for _, tc := range []struct {
		name     string
		idLength int
		tooLarge bool
	}{
		{"small", 8, false},
		{"bounded eight categories with long IDs", 128, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			at := "2026-10-16T01:00:00.000Z"
			state := postgres.C2State{SnapshotID: snapshot, Body: postgres.C2Body{DashboardAt: at}}
			for category := 0; category < 8; category++ {
				slug := fmt.Sprintf("category-%c", 'a'+category)
				page := postgres.C2CategoryPage{Slug: slug}
				for product := 0; product < 24; product++ {
					id := fmt.Sprintf("p%03d-", category*24+product) + strings.Repeat("x", tc.idLength-5)
					if !postgres.C2ValidID(id) || len(id) != tc.idLength {
						t.Fatal("invalid bounded fixture ID")
					}
					page.ProductIDs = append(page.ProductIDs, id)
				}
				state.Body.CategoryPages = append(state.Body.CategoryPages, page)
				state.Body.Sitemap.CategorySlugs = append(state.Body.Sitemap.CategorySlugs, slug)
				id, topIndex, categoryIndex, sitemapIndex := page.ProductIDs[0], category, 0, category*24
				state.Body.TopEight = append(state.Body.TopEight, id)
				state.Body.Candidates = append(state.Body.Candidates, postgres.C2Candidate{ID: id, Slug: &slug,
					SnapshotAt: &at, TopEightIndex: &topIndex, CategoryIndex: &categoryIndex, SitemapIndex: &sitemapIndex})
			}
			state.Body.WitnessID = &state.Body.TopEight[0]
			state.Body.Sitemap.ProductCount = 8 * 24
			body, err := json.Marshal(state.Body)
			if err != nil {
				t.Fatal(err)
			}
			out, err := document(o, state)
			if tc.tooLarge {
				if len(body)+1 < 16<<10 || len(body)+1 >= 64<<10 {
					t.Fatal("fixture must exceed 16KiB but remain below old 64KiB limit")
				}
				if err == nil || out != nil {
					t.Fatalf("oversized document accepted: %d bytes including LF", len(out))
				}
				return
			}
			if err != nil || len(out) >= 16<<10 || !bytes.HasSuffix(out, []byte("\n")) || bytes.Count(out, []byte("\n")) != 1 {
				t.Fatal("small document framing/size")
			}
			var parsed projection
			if json.Unmarshal(out, &parsed) != nil {
				t.Fatal("invalid JSON")
			}
			encoded, err := json.Marshal(parsed)
			sum := sha256.Sum256(body)
			if err != nil || len(out) != len(encoded)+1 || !bytes.Equal(out[:len(out)-1], encoded) ||
				!bytes.Equal(parsed.Body, body) || parsed.Provenance.CanonicalStateID != hex.EncodeToString(sum[:]) {
				t.Fatal("size including LF, document format or canonicalStateId changed")
			}
			t.Logf("small document: %d bytes including LF", len(out))
		})
	}
}
