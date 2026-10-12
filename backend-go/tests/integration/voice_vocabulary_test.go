//go:build integration

package integration

import (
	"context"
	"errors"
	"net/url"
	"os"
	"reflect"
	"sort"
	"testing"
	"time"

	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/postgres"
	"adilbaga/backend-go/internal/voice"
	"github.com/jackc/pgx/v5"
)

// Mutating profiles refuse every non-loopback and non-owned fixture target.
func vocabularyRepos(t *testing.T) (*pgx.Conn, *countedDB, *postgres.Repository) {
	t.Helper()
	value, api := os.Getenv("VOCABULARY_LOCAL_ADMIN_URL"), os.Getenv("VOCABULARY_LOCAL_API_URL")
	if value == "" && api == "" {
		t.Skip("explicit disposable vocabulary inputs absent")
	}
	if !localURL(value) || !localURL(api) {
		t.Fatal("vocabulary tests require loopback targets")
	}
	u, _ := url.Parse(value)
	a, _ := url.Parse(api)
	if u.Path != "/part04_security" || a.Path != u.Path || a.Host != u.Host || u.User.Username() != "postgres" || a.User.Username() != "part04_api_login" {
		t.Fatal("dedicated local vocabulary target required")
	}
	admin, err := pgx.Connect(t.Context(), value)
	if err != nil {
		t.Fatal("local vocabulary admin connection failed")
	}
	t.Cleanup(func() { _ = admin.Close(context.Background()) })
	pool, err := postgres.OpenReadOnly(t.Context(), api)
	if err != nil {
		t.Fatal("local restricted pool failed")
	}
	t.Cleanup(pool.Close)
	if pool.Ping(t.Context()) != nil {
		t.Fatal("restricted pool warm-up failed")
	}
	db := &countedDB{pool: pool}
	return admin, db, postgres.NewRepository(db)
}

func TestLocalVoiceVocabulary(t *testing.T) {
	admin, db, repo := vocabularyRepos(t)
	categories, err := repo.ListCategories(t.Context())
	if err != nil || len(categories) != 9 {
		t.Fatal("nine-category fixture required")
	}
	db.count = 0
	v, err := repo.ListVoiceVocabulary(t.Context())
	if err != nil || db.count != 2 || !reflect.DeepEqual(v.Categories, categories) || len(v.Schemas) != 9 {
		t.Fatal("bounded vocabulary visibility/order failed")
	}
	// Existing definitions preserve brand strings, typed numbers/strings and booleans;
	// declared stale options exist here but are not valid live values.
	milk := v.Schemas[0]
	if milk.Category != "milk" || len(milk.Filters) != 4 || milk.Filters[0].Key != "brand" || milk.Filters[2].Type != "boolean" {
		t.Fatal("configured definitions changed")
	}
	live, err := repo.GetFilterSchema(t.Context(), "milk")
	if err != nil || len(live.Filters) != 3 || !reflect.DeepEqual(live.Filters[0].Options, raw(`"A"`, `"B"`)) || !reflect.DeepEqual(live.Filters[1].Options, raw(`500`, `1000`, `"1000"`)) {
		t.Fatal("live primitive intersection changed")
	}
	var original []byte
	if admin.QueryRow(t.Context(), `SELECT "filterSchema" FROM categories WHERE slug='oil'`).Scan(&original) != nil {
		t.Fatal("local definition read failed")
	}
	defer func() {
		if _, err := admin.Exec(context.Background(), `UPDATE categories SET "filterSchema"=$1::jsonb WHERE slug='oil'`, string(original)); err != nil {
			t.Error("local definition cleanup failed")
		}
	}()
	for _, definition := range []string{`null`, `{}`, `{"filters":"bad"}`, `{"filters":[null,{"key":"empty","label":"Empty","type":"multi-select","options":[]},{"key":"bad","label":"Bad","type":"unknown"},{"key":"flag","label":"Flag","type":"boolean"}]}`} {
		if _, err := admin.Exec(t.Context(), `UPDATE categories SET "filterSchema"=$1::jsonb WHERE slug='oil'`, definition); err != nil {
			t.Fatal("local malformed setup failed")
		}
		v, err := repo.ListVoiceVocabulary(t.Context())
		if err != nil {
			t.Fatal("malformed definitions must not create vocabulary values")
		}
		for _, s := range v.Schemas {
			if s.Category == "oil" {
				want := 0
				if definition[len(definition)-2:] == `]}` {
					want = 1
				}
				if len(s.Filters) != want {
					t.Fatal("malformed/empty definition handling failed")
				}
			}
		}
	}
	canceled, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := repo.ListVoiceVocabulary(canceled); !errors.Is(err, context.Canceled) {
		t.Fatal("cancellation not propagated")
	}
	assertReaderSecurity(t, t.Context(), db.pool)
}

type vocabularyParserFunc func(context.Context, voice.Input) (voice.Parsed, error)

func (f vocabularyParserFunc) Parse(ctx context.Context, in voice.Input) (voice.Parsed, error) {
	return f(ctx, in)
}

const vocabularyNextSnapshotSQL = `INSERT INTO snapshots(id,status,"publishedAt") VALUES('voice-next','published','2026-10-06 11:00:00');
INSERT INTO raw_products(id,"storeId","sourceProductId","rawName","rawPrice","snapshotId") VALUES('voice-next-raw','dina','next','Synthetic',100,'voice-next');
INSERT INTO offers(id,"canonicalProductId","rawProductId","storeId",price,"inStock","snapshotAt","snapshotId") VALUES('voice-next-offer','p2','voice-next-raw','dina',100,true,'2026-10-06 11:00:00','voice-next');`

func TestLocalVoiceVocabularySnapshotSwitch(t *testing.T) {
	admin, _, repo := vocabularyRepos(t)
	cleanup := func() {
		_, err := admin.Exec(context.Background(), `DELETE FROM offers WHERE "snapshotId"='voice-next'; DELETE FROM raw_products WHERE "snapshotId"='voice-next'; DELETE FROM snapshots WHERE id='voice-next';`)
		if err != nil {
			t.Error("local next-snapshot cleanup failed")
		}
	}
	defer cleanup()
	parserCalls := 0
	s := &voice.Service{Vocabulary: repo, Categories: repo, Products: repo, Locations: repo, Sessions: &paritySessions{states: map[string]voice.Session{}}}
	s.Parser = vocabularyParserFunc(func(ctx context.Context, in voice.Input) (voice.Parsed, error) {
		parserCalls++
		p, err := voice.Validate([]byte(`{"intent":"search","category":"milk","filters":{"volumeMl":1000}}`), in)
		if err != nil {
			return p, err
		}
		if _, err := admin.Exec(ctx, vocabularyNextSnapshotSQL); err != nil {
			t.Fatal("local snapshot switch failed")
		}
		return p, nil
	})
	response, err := s.Start(t.Context(), voice.StartRequest{})
	if err != nil || response.Status != "needs_clarification" || !reflect.DeepEqual(response.MissingFields, []string{"volumeMl", "fatPercent"}) || parserCalls != 1 {
		t.Fatal("snapshot switch let stale candidate through")
	}
	// The result repository revalidates independently even after Service validation.
	cleanup()
	if _, err := repo.GetFilterSchema(t.Context(), "milk"); err != nil {
		t.Fatal("selected validation failed")
	}
	if _, err := admin.Exec(t.Context(), vocabularyNextSnapshotSQL); err != nil {
		t.Fatal("local result snapshot switch failed")
	}
	if _, err := repo.ListProducts(t.Context(), catalog.ProductQuery{Category: "milk", Filters: catalog.DynamicFilter{"volumeMl": raw(`1000`)}}); !errors.Is(err, catalog.ErrInvalidQuery) {
		t.Fatal("stale filter reached result snapshot")
	}
	products, err := repo.ListProducts(t.Context(), catalog.ProductQuery{Category: "milk"})
	if err != nil || !reflect.DeepEqual(ids(products), []string{"p2"}) {
		t.Fatal("stale matched products returned")
	}
}

// The historical preparation algorithm exists only in this bounded comparison.
func TestLocalVoiceVocabularyPreparationComparison(t *testing.T) {
	_, db, repo := vocabularyRepos(t)
	old := func() error {
		categories, err := repo.ListCategories(t.Context())
		if err != nil {
			return err
		}
		for _, c := range categories {
			if _, err := repo.GetFilterSchema(t.Context(), c.Slug); err != nil {
				return err
			}
		}
		return nil
	}
	newPath := func() error {
		if _, err := repo.ListVoiceVocabulary(t.Context()); err != nil {
			return err
		}
		_, err := repo.GetFilterSchema(t.Context(), "milk")
		return err
	}
	for _, fn := range []func() error{old, newPath} {
		if fn() != nil {
			t.Fatal("comparison warm-up failed")
		}
	}
	for _, tc := range []struct {
		name                              string
		fn                                func() error
		queries, operations, transactions int
	}{{"old", old, 28, 10, 10}, {"new", newPath, 5, 2, 2}} {
		durations := []float64{}
		for range 5 {
			db.count = 0
			started := time.Now()
			if tc.fn() != nil {
				t.Fatal("comparison read failed")
			}
			durations = append(durations, float64(time.Since(started))/float64(time.Millisecond))
			if db.count != tc.queries {
				t.Fatalf("bounded query count got=%d want=%d", db.count, tc.queries)
			}
		}
		sort.Float64s(durations)
		// Query counter observes Query/QueryRow, not implicit prepare/wire packets.
		t.Logf("profile=%s repeats=5 repository_operations=%d query_calls=%d transaction_commands=%d median_ms=%.3f min_ms=%.3f max_ms=%.3f", tc.name, tc.operations, tc.queries, tc.transactions*2, durations[2], durations[0], durations[4])
	}
}
