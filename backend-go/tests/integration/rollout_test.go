//go:build integration

package integration

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/postgres"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// This destructive state-machine test has a separate, explicit local target.
// The operator prepares either the existing migration + fixture or a restored
// production clone in a dedicated cluster. Never read .env/runtime DATABASE_URL.
func TestReaderRolloutLifecycle(t *testing.T) {
	value := os.Getenv("SECURITY_DATABASE_URL")
	if value == "" {
		t.Skip("explicit isolated local security database required")
	}
	if !localURL(value) {
		t.Fatal("security lifecycle target must be loopback, including pgx fallbacks")
	}
	u, _ := url.Parse(value)
	apiURL := os.Getenv("SECURITY_API_DATABASE_URL")
	au, err := url.Parse(apiURL)
	if err != nil || !localURL(apiURL) || u.Path != "/part04_security" || au.Path != u.Path || au.Host != u.Host || au.User.Username() != "part04_api_login" {
		t.Fatal("dedicated local security database and matching restricted API URL required")
	}
	adminConfig, adminErr := pgx.ParseConfig(value)
	apiConfig, apiErr := pgx.ParseConfig(apiURL)
	if adminErr != nil || apiErr != nil || adminConfig.Database != "part04_security" || apiConfig.Database != adminConfig.Database || apiConfig.Host != adminConfig.Host || apiConfig.Port != adminConfig.Port || apiConfig.User != "part04_api_login" {
		t.Fatal("effective pgx target must be the dedicated local security database")
	}
	password, present := au.User.Password()
	if !present || password == "" {
		t.Fatal("private disposable login password required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	admin, err := pgx.Connect(ctx, value)
	if err != nil {
		t.Fatal("local lifecycle connection failed")
	}
	defer admin.Close(context.Background())
	bootstrap := securityArtifact(t, "security", "aktau_api_reader_role.sql")
	migration := securityArtifact(t, "migrations", "20261004000000_rls_runtime_access", "migration.sql")
	rollback := securityArtifact(t, "security", "rollback_aktau_api_reader_access.sql")
	var tables, enabled, forced, policies, roles int
	err = admin.QueryRow(ctx, `SELECT count(*),count(*) FILTER(WHERE relrowsecurity),count(*) FILTER(WHERE relforcerowsecurity),(SELECT count(*) FROM pg_policies WHERE schemaname='public'),(SELECT count(*) FROM pg_roles WHERE rolname IN ('aktau_api_reader','part04_api_login')) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1) AND relkind='r'`, append(append([]string(nil), runtimeTables...), "raw_products", "product_mappings")).Scan(&tables, &enabled, &forced, &policies, &roles)
	if err != nil || tables != 7 || (enabled != 0 && enabled != 7) || forced != 0 || policies != 0 || roles != 0 {
		t.Fatal("initial forward baseline must be all RLS disabled or all enabled, FORCE0/policies0/reader absent")
	}
	t.Logf("initial forward baseline: RLS%d/FORCE0/policies0; rollback target always RLS7", enabled)
	// Fresh installs intentionally transition RLS0 -> RLS7. Normalize ONLY this
	// reviewed flag when capturing the rollback target; counts/ACLs stay exact.
	baseline := securitySnapshot(t, ctx, admin, true)
	var connect bool
	err = admin.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba)))a WHERE d.datname=current_database() AND a.grantee=0 AND a.privilege_type='CONNECT')`).Scan(&connect)
	if err != nil || !connect {
		t.Fatal("baseline PUBLIC CONNECT required; no implicit database grant allowed")
	}
	executeSecurity(t, ctx, admin, bootstrap)
	roleCases := map[string]string{
		"inherited role":        `CREATE ROLE part04_untrusted NOLOGIN; GRANT part04_untrusted TO aktau_api_reader`,
		"existing child LOGIN":  `CREATE ROLE part04_unexpected LOGIN; GRANT aktau_api_reader TO part04_unexpected`,
		"existing child group":  `CREATE ROLE part04_unexpected NOLOGIN; GRANT aktau_api_reader TO part04_unexpected`,
		"table ownership":       `ALTER TABLE public.stores OWNER TO aktau_api_reader`,
		"schema ownership":      `ALTER SCHEMA public OWNER TO aktau_api_reader`,
		"database ownership":    `ALTER DATABASE part04_security OWNER TO aktau_api_reader`,
		"direct SELECT":         `GRANT SELECT ON stores TO aktau_api_reader`,
		"direct UPDATE":         `GRANT UPDATE ON stores TO aktau_api_reader`,
		"raw SELECT":            `GRANT SELECT ON raw_products TO aktau_api_reader`,
		"column SELECT":         `GRANT SELECT(name) ON stores TO aktau_api_reader`,
		"schema USAGE":          `GRANT USAGE ON SCHEMA public TO aktau_api_reader`,
		"database CONNECT":      `GRANT CONNECT ON DATABASE part04_security TO aktau_api_reader`,
		"function EXECUTE":      `CREATE FUNCTION public.part04_acl_probe() RETURNS integer LANGUAGE SQL AS 'SELECT 1'; GRANT EXECUTE ON FUNCTION public.part04_acl_probe() TO aktau_api_reader`,
		"procedure EXECUTE":     `CREATE PROCEDURE public.part04_acl_probe() LANGUAGE SQL AS 'SELECT 1'; GRANT EXECUTE ON PROCEDURE public.part04_acl_probe() TO aktau_api_reader`,
		"type USAGE":            `GRANT USAGE ON TYPE public."StoreCode" TO aktau_api_reader`,
		"default ACL recipient": `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO aktau_api_reader`,
		"default ACL owner":     `ALTER DEFAULT PRIVILEGES FOR ROLE aktau_api_reader IN SCHEMA public GRANT SELECT ON TABLES TO PUBLIC`,
		"function ownership":    `CREATE FUNCTION public.part04_owned_probe() RETURNS integer LANGUAGE SQL AS 'SELECT 1'; ALTER FUNCTION public.part04_owned_probe() OWNER TO aktau_api_reader`,
		"type ownership":        `CREATE TYPE public.part04_owned_probe AS ENUM('probe'); ALTER TYPE public.part04_owned_probe OWNER TO aktau_api_reader`,
	}
	for _, flag := range []string{"LOGIN", "SUPERUSER", "CREATEDB", "CREATEROLE", "REPLICATION", "BYPASSRLS", "NOINHERIT"} {
		roleCases[flag] = "ALTER ROLE aktau_api_reader " + flag
	}
	for name, artifact := range map[string]string{"bootstrap": bootstrap, "migration": migration} {
		t.Run(name+" rejects unsafe existing group", func(t *testing.T) {
			before := securitySnapshot(t, ctx, admin)
			for name, setup := range roleCases {
				t.Run(name, func(t *testing.T) {
					rejectSecurityDrift(t, ctx, admin, setup, artifact)
					assertSameSnapshot(t, before, securitySnapshot(t, ctx, admin))
				})
			}
		})
	}
	t.Run("migration rejects unexpected application baseline", func(t *testing.T) {
		before := securitySnapshot(t, ctx, admin)
		mixed := `ALTER TABLE stores ENABLE ROW LEVEL SECURITY`
		if enabled == 7 {
			mixed = `ALTER TABLE stores DISABLE ROW LEVEL SECURITY`
		}
		cases := map[string]string{
			"unexpected app policy": `CREATE POLICY part04_unexpected ON raw_products FOR SELECT TO PUBLIC USING(true)`,
			"FORCE RLS":             `ALTER TABLE stores FORCE ROW LEVEL SECURITY`,
			"mixed RLS":             mixed,
			"missing table":         `ALTER TABLE offers RENAME TO part04_missing_offers`,
			"nonordinary table":     `ALTER TABLE offers RENAME TO part04_actual_offers; CREATE VIEW offers AS SELECT * FROM part04_actual_offers`,
		}
		for name, setup := range cases {
			t.Run(name, func(t *testing.T) {
				rejectSecurityDrift(t, ctx, admin, setup, migration)
				assertSameSnapshot(t, before, securitySnapshot(t, ctx, admin))
			})
		}
	})
	t.Run("migration allows unrelated table policy", func(t *testing.T) {
		before := securitySnapshot(t, ctx, admin)
		tx, err := admin.Begin(ctx)
		if err != nil {
			t.Fatal("local unrelated-policy transaction failed")
		}
		defer tx.Rollback(context.Background())
		if _, err := tx.Exec(ctx, `CREATE TABLE public.part04_unrelated(id int); CREATE POLICY unrelated ON public.part04_unrelated FOR SELECT TO PUBLIC USING(true)`); err != nil {
			t.Fatal("local unrelated-policy setup failed")
		}
		if _, err := tx.Exec(ctx, securityBody(migration)); err != nil {
			t.Fatal("unrelated public policy must not prevent forward migration")
		}
		var lockTimeout, statementTimeout string
		if tx.QueryRow(ctx, `SELECT current_setting('lock_timeout'),current_setting('statement_timeout')`).Scan(&lockTimeout, &statementTimeout) != nil || lockTimeout != "5s" || statementTimeout != "10s" {
			t.Fatal("forward execution bounds not active")
		}
		if err := tx.Rollback(ctx); err != nil {
			t.Fatal("local positive-probe rollback failed")
		}
		assertSameSnapshot(t, before, securitySnapshot(t, ctx, admin))
	})
	t.Run("migration lock timeout is atomic", func(t *testing.T) {
		before := securitySnapshot(t, ctx, admin)
		holder, err := pgx.Connect(ctx, value)
		if err != nil {
			t.Fatal("local lock-holder connect failed")
		}
		defer holder.Close(context.Background())
		executeSecurity(t, ctx, holder, `BEGIN; LOCK TABLE stores IN ACCESS SHARE MODE`)
		started := time.Now()
		_, err = admin.Exec(ctx, migration)
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "55P03" || time.Since(started) > 8*time.Second {
			t.Fatal("forward lock timeout must fail closed within conservative bounds")
		}
		executeSecurity(t, ctx, admin, `ROLLBACK`)
		executeSecurity(t, ctx, holder, `ROLLBACK`)
		assertSameSnapshot(t, before, securitySnapshot(t, ctx, admin))
	})
	forward := func(t *testing.T) {
		t.Helper()
		executeSecurity(t, ctx, admin, bootstrap)
		executeSecurity(t, ctx, admin, migration)
		// PASSWORD is private and never logged; DDL cannot bind this value.
		executeSecurity(t, ctx, admin, `CREATE ROLE part04_api_login LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT PASSWORD '`+strings.ReplaceAll(password, "'", "''")+`'; GRANT aktau_api_reader TO part04_api_login WITH ADMIN FALSE, INHERIT TRUE, SET FALSE`)
		pool, err := postgres.OpenReadOnly(ctx, apiURL)
		if err != nil {
			t.Fatal("restricted pool configuration failed")
		}
		defer pool.Close()
		assertReaderSecurity(t, ctx, pool)
		assertRuntimeAnchor(t, ctx, pool, "part04_api_login")
		var loginConnect, databaseDirectGrant bool
		err = pool.QueryRow(ctx, `SELECT has_database_privilege(current_user,current_database(),'CONNECT'),EXISTS(SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl)a WHERE d.datname=current_database() AND a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('part04_api_login','aktau_api_reader')) AND a.privilege_type='CONNECT')`).Scan(&loginConnect, &databaseDirectGrant)
		if err != nil || !loginConnect || databaseDirectGrant {
			t.Fatal("brand-new login must connect through baseline PUBLIC ACL only")
		}
		repo := postgres.NewRepository(pool)
		categories, err := repo.ListCategories(ctx)
		var expected int
		if err != nil || admin.QueryRow(ctx, `SELECT count(*) FROM categories c WHERE EXISTS (SELECT 1 FROM canonical_products p JOIN offers o ON o."canonicalProductId"=p.id WHERE p."categoryId"=c.id AND o."snapshotId"=(SELECT id FROM snapshots WHERE status='published' AND "publishedAt" IS NOT NULL ORDER BY "publishedAt" DESC,id DESC LIMIT 1) AND o."inStock" AND o.price>0)`).Scan(&expected) != nil || len(categories) != expected {
			t.Fatal("restricted category visibility")
		}
		for _, category := range categories {
			if _, err := repo.GetFilterSchema(ctx, category.Slug); err != nil {
				t.Fatal("restricted filter discovery")
			}
		}
		products, err := repo.ListProducts(ctx, catalog.ProductQuery{})
		if err != nil || len(products) == 0 {
			t.Fatal("restricted product page")
		}
		if _, err := repo.GetProductByID(ctx, products[0].ID); err != nil {
			t.Fatal("restricted detail")
		}
		for _, sql := range []string{`SELECT * FROM raw_products`, `SELECT * FROM product_mappings`} {
			assertDenied(t, pool.Exec, ctx, sql, "42501")
		}
	}
	removeLogin := func() {
		executeSecurity(t, ctx, admin, `REVOKE aktau_api_reader FROM part04_api_login; DROP ROLE part04_api_login`)
	}
	t.Run("forward", func(t *testing.T) { forward(t) })
	for name, artifact := range map[string]string{"bootstrap": bootstrap, "migration": migration} {
		t.Run(name+" refuses activated reader", func(t *testing.T) {
			before := securitySnapshot(t, ctx, admin)
			rejectSecurityDrift(t, ctx, admin, "", artifact)
			assertSameSnapshot(t, before, securitySnapshot(t, ctx, admin))
		})
	}
	t.Run("rollback refuses remaining login", func(t *testing.T) {
		before := securitySnapshot(t, ctx, admin)
		rejectSecurityDrift(t, ctx, admin, "", rollback)
		assertSameSnapshot(t, before, securitySnapshot(t, ctx, admin))
	})
	removeLogin()
	t.Run("rollback refuses policy and ACL drift", func(t *testing.T) {
		before := securitySnapshot(t, ctx, admin)
		cases := map[string]string{
			"PUBLIC policy":                         `ALTER POLICY aktau_api_reader_select ON stores TO PUBLIC`,
			"policy predicate":                      `ALTER POLICY aktau_api_reader_select ON stores USING(false)`,
			"missing policy":                        `DROP POLICY aktau_api_reader_select ON stores`,
			"raw policy":                            `CREATE POLICY unexpected ON raw_products FOR SELECT TO aktau_api_reader USING(true)`,
			"write grant":                           `GRANT UPDATE ON stores TO aktau_api_reader`,
			"raw grant":                             `GRANT SELECT ON raw_products TO aktau_api_reader`,
			"grant option":                          `GRANT SELECT ON stores TO aktau_api_reader WITH GRANT OPTION`,
			"duplicate grantor masks missing table": `CREATE ROLE part04_grantor NOLOGIN; GRANT SELECT ON stores TO part04_grantor WITH GRANT OPTION; SET ROLE part04_grantor; GRANT SELECT ON stores TO aktau_api_reader; RESET ROLE; REVOKE SELECT ON offers FROM aktau_api_reader`,
			"schema CREATE":                         `GRANT CREATE ON SCHEMA public TO aktau_api_reader`,
			"database grant":                        `GRANT CONNECT ON DATABASE part04_security TO aktau_api_reader`,
			"inherited role":                        `CREATE ROLE part04_untrusted NOLOGIN; GRANT part04_untrusted TO aktau_api_reader`,
			"table ownership":                       `ALTER TABLE stores OWNER TO aktau_api_reader`,
			"schema ownership":                      `ALTER SCHEMA public OWNER TO aktau_api_reader`,
			"database ownership":                    `ALTER DATABASE part04_security OWNER TO aktau_api_reader`,
			"unsafe flag":                           `ALTER ROLE aktau_api_reader BYPASSRLS`,
			"FORCE drift":                           `ALTER TABLE stores FORCE ROW LEVEL SECURITY`,
		}
		for name, setup := range cases {
			t.Run(name, func(t *testing.T) {
				rejectSecurityDrift(t, ctx, admin, setup, rollback)
				assertSameSnapshot(t, before, securitySnapshot(t, ctx, admin))
			})
		}
	})
	t.Run("rollback exact baseline", func(t *testing.T) {
		executeSecurity(t, ctx, admin, rollback)
		assertOriginalBaseline(t, ctx, admin)
		assertSameSnapshot(t, baseline, securitySnapshot(t, ctx, admin))
	})
	t.Run("reapply", func(t *testing.T) { forward(t) })
	// A second successful rollback also verifies repeatability and leaves the
	// isolated test target at its original security/ACL/count baseline.
	removeLogin()
	executeSecurity(t, ctx, admin, rollback)
	assertOriginalBaseline(t, ctx, admin)
	assertSameSnapshot(t, baseline, securitySnapshot(t, ctx, admin))
	t.Log("forward/rollback/forward PASS; final baseline RLS7/FORCE0/policies0/reader absent; exact counts, table/schema/database ACLs and ownership preserved")
}

// Separately opt-in to the production-like, non-superuser operator proof. All
// artifacts run as the operator; the bootstrap connection only sets up negative
// probes that a restricted operator could not construct (e.g. unsafe role flags).
func TestReaderCreatorAnchorLifecycle(t *testing.T) {
	operatorURL := os.Getenv("OPERATOR_DATABASE_URL")
	if operatorURL == "" {
		t.Skip("explicit isolated local operator database required")
	}
	bootstrapURL, apiURL := os.Getenv("OPERATOR_BOOTSTRAP_DATABASE_URL"), os.Getenv("OPERATOR_API_DATABASE_URL")
	var configs []*pgx.ConnConfig
	for _, value := range []string{operatorURL, bootstrapURL, apiURL} {
		if !localURL(value) {
			t.Fatal("operator proof must use explicit loopback targets, no runtime fallback")
		}
		c, err := pgx.ParseConfig(value)
		if err != nil || c.Database != "part04_security" {
			t.Fatal("dedicated operator-proof database required")
		}
		configs = append(configs, c)
	}
	for _, c := range configs[1:] {
		if c.Host != configs[0].Host || c.Port != configs[0].Port {
			t.Fatal("operator/bootstrap/runtime targets must match")
		}
	}
	if configs[0].User != "part04_operator" || configs[2].User != "aktau_api_runtime" || configs[2].Password == "" {
		t.Fatal("explicit local operator/runtime identities required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	operator, err := pgx.Connect(ctx, operatorURL)
	if err != nil {
		t.Fatal("local operator connect failed")
	}
	defer operator.Close(context.Background())
	bootstrapConn, err := pgx.Connect(ctx, bootstrapURL)
	if err != nil {
		t.Fatal("local bootstrap connect failed")
	}
	defer bootstrapConn.Close(context.Background())
	var topology, super bool
	err = operator.QueryRow(ctx, `SELECT NOT rolsuper AND rolcanlogin AND rolcreaterole AND NOT rolbypassrls AND (SELECT datdba=r.oid FROM pg_database WHERE datname=current_database()) AND (SELECT count(*)=7 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1) AND relowner=r.oid) FROM pg_roles r WHERE rolname=current_user`, append(append([]string(nil), runtimeTables...), "raw_products", "product_mappings")).Scan(&topology)
	if err != nil || !topology || bootstrapConn.QueryRow(ctx, `SELECT rolsuper FROM pg_roles WHERE rolname=current_user`).Scan(&super) != nil || !super {
		t.Fatal("non-superuser CREATEROLE owner + bootstrap superuser topology required")
	}
	var roles, policies, enabled int
	err = operator.QueryRow(ctx, `SELECT (SELECT count(*) FROM pg_roles WHERE rolname IN ('aktau_api_reader','aktau_api_runtime')),(SELECT count(*) FROM pg_policies WHERE schemaname='public'),(SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1) AND relrowsecurity AND NOT relforcerowsecurity)`, append(append([]string(nil), runtimeTables...), "raw_products", "product_mappings")).Scan(&roles, &policies, &enabled)
	if err != nil || roles != 0 || policies != 0 || (enabled != 0 && enabled != 7) {
		t.Fatal("clean RLS0/7, FORCE0, no policies or reader/runtime required")
	}
	baseline := securitySnapshot(t, ctx, operator, true)
	bootstrap := securityArtifact(t, "security", "aktau_api_reader_role.sql")
	migration := securityArtifact(t, "migrations", "20261004000000_rls_runtime_access", "migration.sql")
	rollback := securityArtifact(t, "security", "rollback_aktau_api_reader_access.sql")
	// Fail closed after creation too: opt-in self-grant settings must not leave
	// a newly-created reader with inherited/settable operator access behind.
	for _, setting := range []string{"inherit", "set"} {
		t.Run("bootstrap creation rejects self-grant "+setting, func(t *testing.T) {
			before := securitySnapshot(t, ctx, operator)
			tx, err := operator.Begin(ctx)
			if err != nil {
				t.Fatal("local bootstrap creation transaction failed")
			}
			defer tx.Rollback(context.Background())
			if _, err = tx.Exec(ctx, "SET LOCAL createrole_self_grant='"+setting+"'"); err != nil {
				t.Fatal("local self-grant setting failed")
			}
			_, err = tx.Exec(ctx, bootstrap)
			var e *pgconn.PgError
			if !errors.As(err, &e) || e.Code != "P0001" {
				t.Fatal("unsafe newly-created reader must be rejected with P0001")
			}
			if err = tx.Rollback(ctx); err != nil {
				t.Fatal("local bootstrap creation rollback failed")
			}
			assertSameSnapshot(t, before, securitySnapshot(t, ctx, operator))
		})
	}
	executeSecurity(t, ctx, operator, bootstrap)
	assertOperatorAnchor(t, ctx, operator)
	before := securitySnapshot(t, ctx, operator)
	executeSecurity(t, ctx, operator, bootstrap)
	assertSameSnapshot(t, before, securitySnapshot(t, ctx, operator))
	assertDenied(t, operator.Exec, ctx, `SET ROLE aktau_api_reader`, "42501")
	anchorCases := map[string]string{
		"second LOGIN":           `CREATE ROLE part04_extra LOGIN; GRANT aktau_api_reader TO part04_extra`,
		"second NOLOGIN":         `CREATE ROLE part04_extra NOLOGIN; GRANT aktau_api_reader TO part04_extra`,
		"runtime attached early": `CREATE ROLE aktau_api_runtime LOGIN; GRANT aktau_api_reader TO aktau_api_runtime WITH ADMIN FALSE, INHERIT TRUE, SET FALSE`,
		"different operator":     `CREATE ROLE part04_extra LOGIN CREATEROLE; REVOKE aktau_api_reader FROM part04_operator; GRANT aktau_api_reader TO part04_extra WITH ADMIN TRUE, INHERIT FALSE, SET FALSE`,
		"missing anchor":         `REVOKE aktau_api_reader FROM part04_operator`,
		"ADMIN false":            `GRANT aktau_api_reader TO part04_operator WITH ADMIN FALSE, INHERIT FALSE, SET FALSE`,
		"INHERIT true":           `GRANT aktau_api_reader TO part04_operator WITH ADMIN TRUE, INHERIT TRUE, SET FALSE`,
		"SET true":               `GRANT aktau_api_reader TO part04_operator WITH ADMIN TRUE, INHERIT FALSE, SET TRUE`,
		// Adversarial catalog-only probe in this explicitly isolated local
		// transaction: normal GRANT needs another admin member, while PostgreSQL
		// forbids demoting its bootstrap superuser. Mutate only grantor to test
		// that guard independently of the child-count rule; always roll back.
		"non-superuser grantor":     `UPDATE pg_catalog.pg_auth_members SET grantor=(SELECT oid FROM pg_roles WHERE rolname='part04_operator') WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname='aktau_api_reader')`,
		"operator lacks CREATEROLE": `ALTER ROLE part04_operator NOCREATEROLE`,
		"reader parent":             `CREATE ROLE part04_extra NOLOGIN; GRANT part04_extra TO aktau_api_reader`,
		"unsafe flags":              `ALTER ROLE aktau_api_reader BYPASSRLS`,
		"ownership":                 `ALTER TABLE stores OWNER TO aktau_api_reader`,
		"direct ACL":                `GRANT SELECT ON stores TO aktau_api_reader`,
		"default ACL":               `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO aktau_api_reader`,
	}
	for name, artifact := range map[string]string{"bootstrap": bootstrap, "migration": migration} {
		t.Run(name+" operator anchor rejection", func(t *testing.T) {
			for name, setup := range anchorCases {
				t.Run(name, func(t *testing.T) {
					rejectOperatorDrift(t, ctx, bootstrapConn, setup, artifact)
					assertSameSnapshot(t, before, securitySnapshot(t, ctx, operator))
					assertOperatorAnchor(t, ctx, operator)
				})
			}
		})
	}
	activate := func() {
		executeSecurity(t, ctx, operator, bootstrap)
		executeSecurity(t, ctx, operator, migration)
		executeSecurity(t, ctx, operator, `CREATE ROLE aktau_api_runtime LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '`+strings.ReplaceAll(configs[2].Password, "'", "''")+`'; GRANT aktau_api_reader TO aktau_api_runtime WITH ADMIN FALSE, INHERIT TRUE, SET FALSE`)
		pool, err := postgres.OpenReadOnly(ctx, apiURL)
		if err != nil {
			t.Fatal("restricted operator-proof pool failed")
		}
		defer pool.Close()
		assertReaderSecurity(t, ctx, pool, "aktau_api_runtime")
		assertRuntimeAnchor(t, ctx, pool, "aktau_api_runtime")
		repo := postgres.NewRepository(pool)
		categories, err := repo.ListCategories(ctx)
		var expected int
		if err != nil || operator.QueryRow(ctx, `SELECT count(*) FROM categories c WHERE EXISTS (SELECT 1 FROM canonical_products p JOIN offers o ON o."canonicalProductId"=p.id WHERE p."categoryId"=c.id AND o."snapshotId"=(SELECT id FROM snapshots WHERE status='published' AND "publishedAt" IS NOT NULL ORDER BY "publishedAt" DESC,id DESC LIMIT 1) AND o."inStock" AND o.price>0)`).Scan(&expected) != nil || len(categories) != expected {
			t.Fatal("operator-proof full category visibility")
		}
		for _, c := range categories {
			if _, err := repo.GetFilterSchema(ctx, c.Slug); err != nil {
				t.Fatal("operator-proof filters")
			}
		}
		for _, order := range []catalog.Sort{catalog.PriceAsc, catalog.PriceDesc, catalog.NameAsc} {
			products, err := repo.ListProducts(ctx, catalog.ProductQuery{Sort: order, Limit: 100})
			if err != nil || len(products) == 0 {
				t.Fatal("operator-proof repository sorts")
			}
			if _, err := repo.GetProductByID(ctx, products[0].ID); err != nil {
				t.Fatal("operator-proof detail")
			}
		}
		for _, sql := range []string{`SELECT * FROM raw_products`, `SELECT * FROM product_mappings`} {
			assertDenied(t, pool.Exec, ctx, sql, "42501")
		}
		assertDenied(t, pool.Exec, ctx, `SET ROLE aktau_api_reader`, "42501")
	}
	removeRuntime := func() {
		executeSecurity(t, ctx, operator, `REVOKE aktau_api_reader FROM aktau_api_runtime; DROP ROLE aktau_api_runtime`)
	}
	activate()
	activated := securitySnapshot(t, ctx, operator)
	rejectOperatorDrift(t, ctx, bootstrapConn, "", rollback)
	assertSameSnapshot(t, activated, securitySnapshot(t, ctx, operator))
	removeRuntime()
	beforeRollback := securitySnapshot(t, ctx, operator)
	rollbackCases := make(map[string]string, len(anchorCases))
	for name, setup := range anchorCases {
		rollbackCases[name] = setup
	}
	// SELECT is expected after activation; an extra write grant is drift.
	rollbackCases["direct ACL"] = `GRANT UPDATE ON stores TO aktau_api_reader`
	// Retain operator locking permission so the ownership guard, not an earlier
	// table-lock permission error, is the independently tested refusal.
	rollbackCases["ownership"] = `ALTER TABLE stores OWNER TO aktau_api_reader; GRANT ALL ON stores TO part04_operator`
	// The same malformed anchors must also be rejected after activation once
	// the known runtime is removed; no manual creator-anchor removal is needed.
	for name, setup := range rollbackCases {
		t.Run("rollback operator anchor rejection/"+name, func(t *testing.T) {
			rejectOperatorDrift(t, ctx, bootstrapConn, setup, rollback)
			assertSameSnapshot(t, beforeRollback, securitySnapshot(t, ctx, operator))
		})
	}
	for cycle := 0; cycle < 2; cycle++ {
		assertOperatorAnchor(t, ctx, operator)
		executeSecurity(t, ctx, operator, rollback)
		assertSameSnapshot(t, baseline, securitySnapshot(t, ctx, operator))
		var remaining int
		if operator.QueryRow(ctx, `SELECT count(*) FROM pg_roles WHERE rolname IN ('aktau_api_reader','aktau_api_runtime')`).Scan(&remaining) != nil || remaining != 0 {
			t.Fatal("reader/runtime and automatic anchors must disappear on DROP ROLE")
		}
		if cycle == 0 {
			activate()
			removeRuntime()
		}
	}
	t.Log("non-superuser CREATEROLE owner: bootstrap create/reverify, exact admin-only anchor, runtime MEMBER/USAGE true SET/ADMIN false, repositories/denials, forward→rollback→forward→rollback PASS; counts/managed ACL baseline exact")
}

// Read-only repository/Nest parity plus independent local write-denial checks
// for the already-provisioned runtime in the stopped-state deploy rehearsal.
func TestOperatorCloneParity(t *testing.T) {
	value := os.Getenv("OPERATOR_API_DATABASE_URL")
	if value == "" {
		t.Skip("explicit local operator clone runtime URL required")
	}
	c, err := pgx.ParseConfig(value)
	if !localURL(value) || err != nil || c.Database != "part04_security" || c.User != "aktau_api_runtime" {
		t.Fatal("rehearsal denials/parity require isolated loopback clone runtime")
	}
	u, err := url.Parse(os.Getenv("REFERENCE_API_BASE_URL"))
	if err != nil || !localHost(u.Hostname()) {
		t.Fatal("rehearsal reference must use loopback")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := postgres.OpenReadOnly(ctx, value)
	if err != nil {
		t.Fatal("rehearsal runtime pool failed")
	}
	defer pool.Close()
	assertReaderSecurity(t, ctx, pool, "aktau_api_runtime")
	assertRuntimeAnchor(t, ctx, pool, "aktau_api_runtime")
	for _, sql := range []string{`SELECT * FROM raw_products`, `SELECT * FROM product_mappings`, `SET ROLE aktau_api_reader`} {
		assertDenied(t, pool.Exec, ctx, sql, "42501")
	}
	pool.Close()
	conn, err := pgx.Connect(ctx, value)
	if err != nil {
		t.Fatal("independent local role connection failed")
	}
	defer conn.Close(context.Background())
	for _, sql := range []string{`UPDATE stores SET name=name WHERE false`, `DELETE FROM stores WHERE false`, `INSERT INTO stores(id,code,name) SELECT 'bad','DINA','bad' WHERE false`, `CREATE TABLE public.bad(id int)`, `ALTER TABLE stores ADD COLUMN bad int`} {
		assertDenied(t, conn.Exec, ctx, sql, "42501")
	}
	_ = conn.Close(context.Background())
	smoke(t, value, true)
}

func assertOperatorAnchor(t *testing.T, ctx context.Context, conn *pgx.Conn) {
	t.Helper()
	var member, usage, set, exact bool
	err := conn.QueryRow(ctx, `SELECT pg_has_role(current_user,'aktau_api_reader','MEMBER'),pg_has_role(current_user,'aktau_api_reader','USAGE'),pg_has_role(current_user,'aktau_api_reader','SET'),(SELECT count(*)=1 AND bool_and(m.member=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option AND g.rolsuper) FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.grantor WHERE m.roleid=(SELECT oid FROM pg_roles WHERE rolname='aktau_api_reader'))`).Scan(&member, &usage, &set, &exact)
	if err != nil || !member || usage || set || !exact {
		t.Fatal("operator must have only exact admin anchor, no inherited or settable reader access")
	}
}

func assertRuntimeAnchor(t *testing.T, ctx context.Context, db interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, login string) {
	t.Helper()
	var member, usage, set, exact bool
	err := db.QueryRow(ctx, `SELECT pg_has_role($1,'aktau_api_reader','MEMBER'),pg_has_role($1,'aktau_api_reader','USAGE'),pg_has_role($1,'aktau_api_reader','SET'),(SELECT count(*)=1 AND bool_and(roleid=(SELECT oid FROM pg_roles WHERE rolname='aktau_api_reader') AND NOT admin_option AND inherit_option AND NOT set_option) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1))`, login).Scan(&member, &usage, &set, &exact)
	if err != nil || !member || !usage || set || !exact {
		t.Fatal("runtime must inherit only reader, no SET or ADMIN")
	}
}

func rejectOperatorDrift(t *testing.T, ctx context.Context, bootstrap *pgx.Conn, setup, artifact string) {
	t.Helper()
	tx, err := bootstrap.Begin(ctx)
	if err != nil {
		t.Fatal("operator negative transaction failed")
	}
	defer tx.Rollback(context.Background())
	if setup != "" {
		if _, err = tx.Exec(ctx, setup); err != nil {
			var e *pgconn.PgError
			if errors.As(err, &e) {
				t.Fatalf("local operator negative setup SQLSTATE %s", e.Code)
			}
			t.Fatal("local operator negative setup failed")
		}
	}
	if _, err = tx.Exec(ctx, `SET LOCAL ROLE part04_operator`); err != nil {
		t.Fatal("negative artifact must run as operator")
	}
	_, err = tx.Exec(ctx, securityBody(artifact))
	var e *pgconn.PgError
	if !errors.As(err, &e) || e.Code != "P0001" {
		t.Fatal("operator guard must reject with P0001 before changes")
	}
}

func securityArtifact(t *testing.T, path ...string) string {
	t.Helper()
	parts := append([]string{"..", "..", "..", "backend", "prisma"}, path...)
	data, err := os.ReadFile(filepath.Join(parts...))
	if err != nil {
		t.Fatal("security artifact unavailable")
	}
	return string(data)
}

func executeSecurity(t *testing.T, ctx context.Context, conn *pgx.Conn, sql string) {
	t.Helper()
	if _, err := conn.Exec(ctx, sql); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			t.Fatalf("local security operation failed: SQLSTATE %s", pgErr.Code)
		}
		t.Fatal("local security operation failed (sanitized)")
	}
}

func rejectSecurityDrift(t *testing.T, ctx context.Context, conn *pgx.Conn, setup, artifact string) {
	t.Helper()
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal("local guard transaction failed")
	}
	defer tx.Rollback(context.Background())
	if setup != "" {
		if _, err := tx.Exec(ctx, setup); err != nil {
			t.Fatal("local guard test setup failed")
		}
	}
	// Run the same SQL inside our negative-test transaction, without its outer
	// BEGIN/COMMIT. Failure aborts the entire transaction; no changes escape.
	_, err = tx.Exec(ctx, securityBody(artifact))
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "P0001" {
		t.Fatal("security guard failed to reject drift before changes")
	}
}

func securityBody(artifact string) string {
	body := strings.Replace(artifact, "BEGIN;", "", 1)
	return strings.TrimSuffix(strings.TrimSpace(body), "COMMIT;")
}

func assertOriginalBaseline(t *testing.T, ctx context.Context, conn *pgx.Conn) {
	t.Helper()
	var secured, policies, roles int
	err := conn.QueryRow(ctx, `SELECT (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1) AND relrowsecurity AND NOT relforcerowsecurity),(SELECT count(*) FROM pg_policies WHERE schemaname='public'),(SELECT count(*) FROM pg_roles WHERE rolname IN ('aktau_api_reader','part04_api_login'))`, append(append([]string(nil), runtimeTables...), "raw_products", "product_mappings")).Scan(&secured, &policies, &roles)
	if err != nil || secured != 7 || policies != 0 || roles != 0 {
		t.Fatal("expected original RLS7/FORCE0/policies0/reader+login absent baseline")
	}
}

func securitySnapshot(t *testing.T, ctx context.Context, conn *pgx.Conn, normalizeRLS ...bool) string {
	t.Helper()
	// Compare effective ACL entries (NULL ACL and explicit default ACL are equal),
	// including managed roles, not just whether our group disappeared.
	var value []byte
	rlsTarget := len(normalizeRLS) > 0 && normalizeRLS[0]
	err := conn.QueryRow(ctx, `SELECT jsonb_build_object(
	 'tables',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',($2 OR c.relrowsecurity),'force',c.relforcerowsecurity,'acl',(SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY a.grantee,a.privilege_type,a.grantor) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a)) ORDER BY c.relname) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1)),
	 'schema',(SELECT jsonb_build_object('owner',pg_get_userbyid(n.nspowner),'acl',(SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY a.grantee,a.privilege_type,a.grantor) FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner)))a)) FROM pg_namespace n WHERE n.nspname='public'),
	 'database',(SELECT jsonb_build_object('owner',pg_get_userbyid(d.datdba),'acl',(SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY a.grantee,a.privilege_type,a.grantor) FROM aclexplode(coalesce(d.datacl,acldefault('d',d.datdba)))a)) FROM pg_database d WHERE d.datname=current_database()),
	 'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname),'[]') FROM pg_policies p WHERE schemaname='public'),
	 'reader',(SELECT count(*) FROM pg_roles WHERE rolname='aktau_api_reader'),
	 'readerFlags',(SELECT jsonb_build_array(rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit) FROM pg_roles WHERE rolname='aktau_api_reader'),
	 'readerMembers',(SELECT coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor),admin_option,inherit_option,set_option) ORDER BY roleid,member,grantor),'[]') FROM pg_auth_members WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname='aktau_api_reader') OR member=(SELECT oid FROM pg_roles WHERE rolname='aktau_api_reader')),
	 'readerExtraACLs',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY scope,object,grantee,grantor,privilege_type),'[]') FROM (
	   SELECT 'column' scope,c.attrelid::text||':'||c.attnum::text object,a.grantee,a.grantor,a.privilege_type,a.is_grantable FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl)a
	   UNION ALL SELECT 'function',p.oid::text,a.grantee,a.grantor,a.privilege_type,a.is_grantable FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl)a
	   UNION ALL SELECT 'type',p.oid::text,a.grantee,a.grantor,a.privilege_type,a.is_grantable FROM pg_type p CROSS JOIN LATERAL aclexplode(p.typacl)a
	   UNION ALL SELECT 'default',p.oid::text,a.grantee,a.grantor,a.privilege_type,a.is_grantable FROM pg_default_acl p CROSS JOIN LATERAL aclexplode(p.defaclacl)a
	 )x WHERE (SELECT oid FROM pg_roles WHERE rolname='aktau_api_reader') IN (grantee,grantor)),
	 'readerDefaultOwners',(SELECT count(*) FROM pg_default_acl WHERE defaclrole=(SELECT oid FROM pg_roles WHERE rolname='aktau_api_reader')),
	 'counts',jsonb_build_array((SELECT count(*) FROM stores),(SELECT count(*) FROM store_locations),(SELECT count(*) FROM categories),(SELECT count(*) FROM raw_products),(SELECT count(*) FROM canonical_products),(SELECT count(*) FROM product_mappings),(SELECT count(*) FROM offers)))`, append(append([]string(nil), runtimeTables...), "raw_products", "product_mappings"), rlsTarget).Scan(&value)
	if err != nil || !json.Valid(value) {
		t.Fatal("safe local baseline snapshot failed")
	}
	return string(value)
}

func assertSameSnapshot(t *testing.T, before, after string) {
	t.Helper()
	if before != after {
		t.Fatal("security/managed ACL/ownership/count snapshot changed unexpectedly")
	}
}
