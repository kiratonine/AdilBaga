//go:build integration

package integration

import (
	"context"
	"net/url"
	"os"
	"reflect"
	"testing"
	"time"

	"adilbaga/backend-go/internal/postgres"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var runtimeTables = []string{"canonical_products", "categories", "offers", "store_locations", "stores"}

func assertReaderSecurity(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	var user string
	var member, safe bool
	err := pool.QueryRow(ctx, `SELECT current_user,pg_has_role(current_user,'aktau_api_reader','member'),NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AND rolcanlogin AND rolinherit FROM pg_roles WHERE rolname=current_user`).Scan(&user, &member, &safe)
	if err != nil || user != "part04_api_login" || !member || !safe {
		t.Fatal("restricted login identity/attributes/membership")
	}
	var groupSafe bool
	err = pool.QueryRow(ctx, `SELECT NOT (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AND rolinherit AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) FROM pg_roles r WHERE rolname='aktau_api_reader'`).Scan(&groupSafe)
	if err != nil || !groupSafe {
		t.Fatal("group security attributes or inherited admin role")
	}
	var memberships int
	err = pool.QueryRow(ctx, `SELECT count(*) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND roleid<>(SELECT oid FROM pg_roles WHERE rolname='aktau_api_reader')`).Scan(&memberships)
	if err != nil || memberships != 0 {
		t.Fatal("unexpected login role membership")
	}
	var secured int
	err = pool.QueryRow(ctx, `SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[]) AND relrowsecurity AND NOT relforcerowsecurity AND relowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user) AND relowner<>(SELECT oid FROM pg_roles WHERE rolname='aktau_api_reader')`, []string{"stores", "store_locations", "categories", "canonical_products", "offers", "raw_products", "product_mappings"}).Scan(&secured)
	if err != nil || secured != 7 {
		t.Fatal("RLS flags or owner bypass")
	}
	rows, err := pool.Query(ctx, `SELECT tablename,cmd,roles,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename`)
	if err != nil {
		t.Fatal("policy inspection failed")
	}
	var tables []string
	for rows.Next() {
		var table, command, qual string
		var roles []string
		var check *string
		if rows.Scan(&table, &command, &roles, &qual, &check) != nil {
			t.Fatal("policy decoding failed")
		}
		if command != "SELECT" || !reflect.DeepEqual(roles, []string{"aktau_api_reader"}) || qual != "true" || check != nil {
			t.Fatal("policy scope drift")
		}
		tables = append(tables, table)
	}
	err = rows.Err()
	rows.Close()
	if err != nil || !reflect.DeepEqual(tables, runtimeTables) {
		t.Fatal("exactly five runtime-only policies required")
	}
	var usage, create bool
	err = pool.QueryRow(ctx, `SELECT has_schema_privilege(current_user,'public','USAGE'),has_schema_privilege(current_user,'public','CREATE')`).Scan(&usage, &create)
	if err != nil || !usage || create {
		t.Fatal("schema privilege boundary")
	}
	for _, table := range append(append([]string(nil), runtimeTables...), "raw_products", "product_mappings") {
		allowed := table != "raw_products" && table != "product_mappings"
		var selectLogin, selectGroup, write bool
		err = pool.QueryRow(ctx, `SELECT has_table_privilege(current_user,$1,'SELECT'),has_table_privilege('aktau_api_reader',$1,'SELECT'),has_table_privilege(current_user,$1,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')`, "public."+table).Scan(&selectLogin, &selectGroup, &write)
		if err != nil || selectLogin != allowed || selectGroup != allowed || write {
			t.Fatal("table privilege matrix")
		}
	}
}

func TestCloneRestrictedSecurity(t *testing.T) {
	target := os.Getenv("SMOKE_DATABASE_URL")
	if target == "" {
		t.Skip("explicit local clone required")
	}
	if !localURL(target) {
		t.Fatal("restricted-role write checks must be local")
	}
	u, _ := url.Parse(target)
	if u.User.Username() != "part04_api_login" {
		t.Fatal("clone must use restricted login")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := postgres.OpenReadOnly(ctx, target)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	assertReaderSecurity(t, ctx, pool)
	for _, sql := range []string{`SELECT * FROM raw_products`, `SELECT * FROM product_mappings`} {
		assertDenied(t, pool.Exec, ctx, sql, "42501")
	}
	// Independent privilege proof without pool read-only defaults; zero-row DML
	// would not alter fixtures even if a broken role unexpectedly accepted it.
	conn, err := pgx.Connect(ctx, target)
	if err != nil {
		t.Fatal("local role connect failed")
	}
	defer conn.Close(context.Background())
	for _, sql := range []string{`UPDATE stores SET name=name WHERE false`, `DELETE FROM stores WHERE false`, `INSERT INTO stores(id,code,name) SELECT 'bad','DINA','bad' WHERE false`, `CREATE TABLE public.bad(id int)`, `ALTER TABLE stores ADD COLUMN bad int`} {
		assertDenied(t, conn.Exec, ctx, sql, "42501")
	}
	t.Log("restricted login: group-only membership, RLS7/FORCE0/policies5, SELECT5, raw/mapping privilege denial and DML/DDL denial PASS")
}
