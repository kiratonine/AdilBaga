//go:build integration

package integration

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/postgres"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

func localURL(value string) bool {
	u, err := url.Parse(value)
	if err != nil || !localHost(u.Hostname()) {
		return false
	}
	c, err := pgx.ParseConfig(value)
	if err != nil || !localHost(c.Host) {
		return false
	}
	for _, fallback := range c.Fallbacks {
		if !localHost(fallback.Host) {
			return false
		}
	}
	return true
}
func localHost(host string) bool { return host == "localhost" || host == "127.0.0.1" || host == "::1" }
func TestDestructiveTargetGuard(t *testing.T) {
	for _, v := range []string{"", "postgres://user:pass@db.example/db", "postgres://user:pass@127.0.0.1/db?host=remote.example", "postgres://user:pass@127.0.0.1/db?host=127.0.0.1,remote.example", "postgres://user:pass@%bad"} {
		if localURL(v) {
			t.Fatal("non-local or malformed target accepted")
		}
	}
	for _, v := range []string{"postgres://user:pass@127.0.0.1/db", "postgres://user:pass@localhost/db", "postgres://user:pass@[::1]/db"} {
		if !localURL(v) {
			t.Fatal("valid local URL rejected")
		}
	}
}

type countedDB struct {
	pool  *pgxpool.Pool
	count int
}

func (d *countedDB) Query(ctx context.Context, s string, a ...any) (pgx.Rows, error) {
	d.count++
	return d.pool.Query(ctx, s, a...)
}
func (d *countedDB) QueryRow(ctx context.Context, s string, a ...any) pgx.Row {
	d.count++
	return d.pool.QueryRow(ctx, s, a...)
}

type countedTx struct {
	pgx.Tx
	owner *countedDB
}

func (d *countedDB) BeginTx(ctx context.Context, options pgx.TxOptions) (pgx.Tx, error) {
	tx, err := d.pool.BeginTx(ctx, options)
	if err != nil {
		return nil, err
	}
	return &countedTx{Tx: tx, owner: d}, nil
}
func (tx *countedTx) Query(ctx context.Context, s string, a ...any) (pgx.Rows, error) {
	tx.owner.count++
	return tx.Tx.Query(ctx, s, a...)
}
func (tx *countedTx) QueryRow(ctx context.Context, s string, a ...any) pgx.Row {
	tx.owner.count++
	return tx.Tx.QueryRow(ctx, s, a...)
}
func ids(products []catalog.Product) []string {
	out := make([]string, 0, len(products))
	for _, p := range products {
		out = append(out, p.ID)
	}
	return out
}
func raw(values ...string) []json.RawMessage {
	out := make([]json.RawMessage, 0, len(values))
	for _, v := range values {
		out = append(out, json.RawMessage(v))
	}
	return out
}

func TestDeterministicCatalog(t *testing.T) {
	value := os.Getenv("TEST_DATABASE_URL")
	if value == "" {
		t.Skip("explicit TEST_DATABASE_URL required")
	}
	if !localURL(value) {
		t.Fatal("destructive integration target must be loopback")
	}
	// Refuse arbitrary local databases too: this is a dedicated disposable fixture DB.
	u, _ := url.Parse(value)
	if u.Path != "/part04_fixture" {
		t.Fatal("dedicated part04_fixture database required")
	}
	apiURL := os.Getenv("TEST_API_DATABASE_URL")
	if !localURL(apiURL) {
		t.Fatal("explicit local restricted API URL required")
	}
	au, _ := url.Parse(apiURL)
	if au.Host != u.Host || au.Path != u.Path {
		t.Fatal("API target must match fixture database")
	}
	if au.User.Username() != "part04_api_login" {
		t.Fatal("fixture API must use the restricted part04_api_login")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	admin, err := pgx.Connect(ctx, value)
	if err != nil {
		t.Fatal("local fixture connection failed")
	}
	t.Cleanup(func() { _ = admin.Close(context.Background()) })
	var tables int
	err = admin.QueryRow(ctx, `SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations'`).Scan(&tables)
	if err != nil {
		t.Fatal("local inspection failed")
	}
	// Initialize from the existing Prisma init/bootstrap/security artifacts BEFORE
	// provisioning LOGIN membership. An activated reader must not bootstrap again.
	if tables != 9 {
		t.Fatal("prepare the dedicated fixture schema and security before activating LOGIN")
	}
	var products int
	if err = admin.QueryRow(ctx, `SELECT count(*) FROM canonical_products`).Scan(&products); err != nil || products != 0 {
		t.Fatal("fixture database must be empty")
	}
	// The taxonomy migration seeds production categories; the INSERT-only fixture needs a catalog with only its own rows.
	if _, err = admin.Exec(ctx, `TRUNCATE categories CASCADE`); err != nil {
		t.Fatal("seeded categories cleanup failed")
	}
	data, err := os.ReadFile(filepath.Join("..", "fixtures", "catalog.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = admin.Exec(ctx, string(data)); err != nil {
		t.Fatal("fixture inserts failed")
	}
	t.Cleanup(func() {
		_, err := admin.Exec(context.Background(), `TRUNCATE offers,product_mappings,canonical_products,raw_products,source_runs,snapshots,store_locations,categories,stores CASCADE`)
		if err != nil {
			t.Error("local fixture cleanup failed")
		}
	})
	pool, err := postgres.OpenReadOnly(ctx, apiURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	db := &countedDB{pool: pool}
	repo := postgres.NewRepository(db)
	t.Run("approved security state", func(t *testing.T) { assertReaderSecurity(t, ctx, pool) })
	t.Run("categories and filters", func(t *testing.T) {
		categories, err := repo.ListCategories(ctx)
		if err != nil || len(categories) != 3 || categories[0].Slug != "empty" || categories[2].Slug != "oil" {
			t.Fatal("category order")
		}
		if _, err := repo.GetFilterSchema(ctx, "unknown"); !errors.Is(err, catalog.ErrNotFound) {
			t.Fatal("category not-found")
		}
		schema, err := repo.GetFilterSchema(ctx, "milk")
		if err != nil || len(schema.Filters) != 3 {
			t.Fatal("filter discovery")
		}
		if !reflect.DeepEqual(schema.Filters[0].Options, raw(`"A"`, `"B"`)) || !reflect.DeepEqual(schema.Filters[1].Options, raw(`500`, `1000`, `"1000"`)) {
			t.Fatal("actual typed options/order")
		}
	})
	cases := []struct {
		name string
		q    catalog.ProductQuery
		want []string
	}{
		{"default", catalog.ProductQuery{}, []string{"p4", "p1", "p2", "p3"}},
		{"category", catalog.ProductQuery{Category: "milk"}, []string{"p1", "p2", "p3"}},
		{"case insensitive", catalog.ProductQuery{Search: "молоко"}, []string{"p1", "p2", "p3"}},
		{"descending", catalog.ProductQuery{Sort: catalog.PriceDesc}, []string{"p3", "p1", "p2", "p4"}},
		{"Russian name", catalog.ProductQuery{Sort: catalog.NameAsc}, []string{"p4", "p1", "p2", "p3"}},
		{"page", catalog.ProductQuery{Limit: 2, Offset: 1}, []string{"p1", "p2"}},
		{"same key OR", catalog.ProductQuery{Category: "milk", Filters: catalog.DynamicFilter{"volumeMl": raw(`500`, `1000`)}}, []string{"p1", "p2"}},
		{"cross key AND", catalog.ProductQuery{Category: "milk", Filters: catalog.DynamicFilter{"volumeMl": raw(`500`, `1000`), "brand": raw(`"A"`)}}, []string{"p1"}},
		{"string not numeric", catalog.ProductQuery{Category: "milk", Filters: catalog.DynamicFilter{"volumeMl": raw(`"1000"`)}}, []string{"p3"}},
		{"boolean", catalog.ProductQuery{Category: "milk", Filters: catalog.DynamicFilter{"organic": raw(`false`)}}, []string{"p2"}},
		{"brand", catalog.ProductQuery{Category: "milk", Filters: catalog.DynamicFilter{"brand": raw(`"A"`)}}, []string{"p1", "p3"}},
		{"unknown category", catalog.ProductQuery{Category: "unknown"}, []string{}},
		{"injection search", catalog.ProductQuery{Search: `'; DROP TABLE offers; --`}, []string{}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			db.count = 0
			p, err := repo.ListProducts(ctx, c.q)
			if err != nil || !reflect.DeepEqual(ids(p), c.want) {
				t.Fatalf("query mismatch %v: %v", ids(p), err)
			}
			if db.count > 5 {
				t.Fatal("N+1 roundtrips")
			}
		})
	}
	t.Run("detail and offer semantics", func(t *testing.T) {
		p, err := repo.GetProductByID(ctx, "p1")
		if err != nil || p.MinPrice != 100 || len(p.Offers) != 2 || p.Offers[0].Price != 100 || p.Offers[1].Price != 120 || p.Offers[0].OldPrice != nil {
			t.Fatal("offer/min semantics")
		}
		if p.SnapshotAt.Format(time.RFC3339) != "2026-10-02T11:00:00Z" || string(p.Attributes["volumeMl"]) != "1000" || string(p.Attributes["organic"]) != "true" || len(p.Attributes) != 3 {
			t.Fatal("snapshot/scalars")
		}
		for _, id := range []string{"unknown", "zero", "out", "none", `' OR true --`} {
			if _, err := repo.GetProductByID(ctx, id); !errors.Is(err, catalog.ErrNotFound) {
				t.Fatal("detail not-found")
			}
		}
	})
	t.Run("invalid filters and pagination", func(t *testing.T) {
		for _, q := range []catalog.ProductQuery{
			{Limit: 101}, {Offset: 9007199254740992}, {Sort: `name; DROP TABLE stores`},
			{Category: "milk", Filters: catalog.DynamicFilter{`x'); DROP TABLE offers; --`: raw(`true`)}},
			{Filters: catalog.DynamicFilter{"brand": raw(`"A"`)}},
			{Category: "milk", Filters: catalog.DynamicFilter{"volumeMl": raw(`999`)}},
			{Category: "milk", Filters: catalog.DynamicFilter{"organic": raw(`"false"`)}},
		} {
			if _, err := repo.ListProducts(ctx, q); !errors.Is(err, catalog.ErrInvalidQuery) {
				t.Fatal("invalid query accepted")
			}
		}
	})
	t.Run("dashboard SQL aggregates", func(t *testing.T) {
		db.count = 0
		d, err := repo.GetDashboard(ctx)
		if err != nil || db.count != 1 {
			t.Fatal("one bounded dashboard SQL roundtrip required")
		}
		if d.Summary.CanonicalProducts != 4 || d.Summary.Stores != 3 || d.Summary.MatchedAcrossStores != 1 || d.Summary.SnapshotAt != "2026-10-02T11:00:00.000Z" {
			t.Fatal("usable summary")
		}
		if len(d.PriceSpreads) != 1 || d.PriceSpreads[0].ProductID != "p1" || d.PriceSpreads[0].DifferencePercent != 20 || len(d.Locations) != 2 {
			t.Fatal("spreads/locations")
		}
		if len(d.Baskets) != 3 || d.Baskets[0].Total != 120 || d.Baskets[1].Total != 100 || d.Baskets[2].Total != 50 {
			t.Fatal("store-specific basket prices")
		}
		for _, b := range d.Baskets {
			if len(b.Items) != 3 {
				t.Fatal("fixed basket slots")
			}
			for _, item := range b.Items {
				if item.Price == nil && (item.ProductID != nil || item.Name != nil) {
					t.Fatal("missing null semantics")
				}
			}
		}
	})
	t.Run("restricted role and read-only pool", func(t *testing.T) {
		for _, sql := range []string{`SELECT * FROM raw_products`, `SELECT * FROM product_mappings`} {
			assertDenied(t, pool.Exec, ctx, sql, "42501")
		}
		adminRO, err := postgres.OpenReadOnly(ctx, value)
		if err != nil {
			t.Fatal(err)
		}
		defer adminRO.Close()
		assertDenied(t, adminRO.Exec, ctx, `UPDATE stores SET name=name`, "25006")
		var readOnly string
		if err := pool.QueryRow(ctx, `SHOW default_transaction_read_only`).Scan(&readOnly); err != nil || readOnly != "on" {
			t.Fatal("pool read-only policy")
		}
		// Prove role permissions independently of read-only transaction policy.
		role, err := pgx.Connect(ctx, apiURL)
		if err != nil {
			t.Fatal("restricted role connect")
		}
		defer role.Close(context.Background())
		for _, sql := range []string{`UPDATE stores SET name=name`, `DELETE FROM stores WHERE false`, `INSERT INTO stores(id,code,name) VALUES('bad','DINA','bad')`, `CREATE TABLE public.bad(id int)`, `ALTER TABLE stores ADD COLUMN bad int`} {
			assertDenied(t, role.Exec, ctx, sql, "42501")
		}
	})
}

func assertDenied(t *testing.T, exec func(context.Context, string, ...any) (pgconn.CommandTag, error), ctx context.Context, sql, code string) {
	t.Helper()
	_, err := exec(ctx, sql)
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != code {
		t.Fatal("expected explicit privilege/read-only denial, not an empty set or unrelated error")
	}
}

func TestBootstrapFailsClosed(t *testing.T) {
	value := os.Getenv("TEST_DATABASE_URL")
	if value == "" {
		t.Skip("explicit local fixture DB required")
	}
	if !localURL(value) {
		t.Fatal("bootstrap test must be local")
	}
	u, _ := url.Parse(value)
	if u.Path != "/part04_fixture" {
		t.Fatal("dedicated fixture database required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	admin, err := pgx.Connect(ctx, value)
	if err != nil {
		t.Fatal("local connect failed")
	}
	defer admin.Close(context.Background())
	bootstrap, err := os.ReadFile(filepath.Join("..", "..", "..", "backend", "prisma", "security", "aktau_api_reader_role.sql"))
	if err != nil {
		t.Fatal(err)
	}
	for _, attribute := range []string{"LOGIN", "BYPASSRLS", "CREATEROLE", "CREATEDB", "SUPERUSER", "REPLICATION", "NOINHERIT"} {
		t.Run(attribute, func(t *testing.T) {
			before := securitySnapshot(t, ctx, admin)
			tx, err := admin.Begin(ctx)
			if err != nil {
				t.Fatal("local transaction failed")
			}
			defer tx.Rollback(context.Background())
			// Isolate the attribute being tested from the new intentional refusal
			// of an already activated reader. All temporary revokes roll back.
			if _, err = tx.Exec(ctx, `REVOKE aktau_api_reader FROM part04_api_login; REVOKE SELECT ON stores,store_locations,categories,canonical_products,offers,snapshots FROM aktau_api_reader; REVOKE USAGE ON SCHEMA public FROM aktau_api_reader`); err != nil {
				t.Fatal("local attribute-test isolation failed")
			}
			if _, err = tx.Exec(ctx, string(bootstrap)); err != nil {
				t.Fatal("isolated safe group bootstrap failed")
			}
			if _, err = tx.Exec(ctx, "ALTER ROLE aktau_api_reader "+attribute); err != nil {
				t.Fatal("local negative-test setup failed")
			}
			_, err = tx.Exec(ctx, string(bootstrap))
			var pgErr *pgconn.PgError
			if !errors.As(err, &pgErr) || pgErr.Code != "P0001" {
				t.Fatal("unsafe existing group role accepted")
			}
			if err := tx.Rollback(ctx); err != nil {
				t.Fatal("local attribute-test rollback failed")
			}
			assertSameSnapshot(t, before, securitySnapshot(t, ctx, admin))
		})
	}
}
