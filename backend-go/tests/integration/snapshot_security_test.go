//go:build integration

package integration

import (
	"context"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Independent explicit LOCAL profile, with no runtime/production URL fallback.
func TestLocalSnapshotSecurity(t *testing.T) {
	adminURL := os.Getenv("SNAPSHOT_SECURITY_DATABASE_URL")
	if adminURL == "" {
		t.Skip("explicit local snapshot security profile required")
	}
	u, e := url.Parse(adminURL)
	if e != nil || !localURL(adminURL) || u.Path != "/part08" || u.User.Username() != "postgres" {
		t.Fatal("dedicated loopback part08 owner required")
	}
	ctx, cancel := context.WithTimeout(t.Context(), 45*time.Second)
	defer cancel()
	connect := func(value, user string) *pgx.Conn {
		t.Helper()
		v, e := url.Parse(value)
		if e != nil || !localURL(value) || v.Host != u.Host || v.Path != u.Path || v.User.Username() != user {
			t.Fatal("explicit matching restricted local connection required")
		}
		c, e := pgx.Connect(ctx, value)
		if e != nil {
			t.Fatal("local connection unavailable")
		}
		t.Cleanup(func() { _ = c.Close(context.Background()) })
		return c
	}
	admin := connect(adminURL, "postgres")
	reader := connect(os.Getenv("SNAPSHOT_SECURITY_READER_URL"), "part08_api")
	writer := connect(os.Getenv("SNAPSHOT_SECURITY_WRITER_URL"), "part08_writer")
	fingerprint := func() string {
		t.Helper()
		var hash string
		if admin.QueryRow(ctx, `SELECT md5(json_build_array((SELECT json_agg(r ORDER BY id) FROM stores r),(SELECT json_agg(r ORDER BY id) FROM store_locations r),(SELECT json_agg(r ORDER BY id) FROM categories r),(SELECT json_agg(r ORDER BY id) FROM canonical_products r),(SELECT json_agg(r ORDER BY id) FROM raw_products r),(SELECT json_agg(r ORDER BY id) FROM product_mappings r),(SELECT json_agg(r ORDER BY id) FROM offers r),(SELECT json_agg(r ORDER BY id) FROM snapshots r),(SELECT json_agg(r ORDER BY id) FROM source_runs r))::text)`).Scan(&hash) != nil {
			t.Fatal("local data fingerprint unavailable")
		}
		return hash
	}
	before := fingerprint()
	t.Run("exact grants policies and safe role", func(t *testing.T) {
		var safe bool
		e := admin.QueryRow(ctx, `SELECT NOT (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AND rolinherit
   AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid)
   AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid)
   AND (SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE a.grantee=r.oid AND c.relnamespace='public'::regnamespace)=17
   AND NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE a.grantee=r.oid AND a.is_grantable)
   AND (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles=ARRAY['aktau_ingest_writer']::name[])=17
   AND (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles=ARRAY['aktau_api_reader']::name[])=6
   AND (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname IN ('stores','store_locations','categories','raw_products','canonical_products','product_mappings','offers','snapshots','source_runs') AND relrowsecurity AND NOT relforcerowsecurity)=9
   FROM pg_roles r WHERE rolname='aktau_ingest_writer'`).Scan(&safe)
		if e != nil || !safe {
			t.Fatal("writer/reader ACL or RLS matrix drift")
		}
		for _, role := range []string{"part08_api", "part08_writer"} {
			if admin.QueryRow(ctx, `SELECT rolcanlogin AND rolinherit AND NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AND (SELECT count(*) FROM pg_auth_members WHERE member=r.oid)=1 AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid AND (admin_option OR set_option OR NOT inherit_option)) FROM pg_roles r WHERE rolname=$1`, role).Scan(&safe) != nil || !safe {
				t.Fatal("restricted local login drift")
			}
		}
	})
	allowed := func(c *pgx.Conn, q string, args ...any) {
		t.Helper()
		tx, e := c.Begin(ctx)
		if e != nil {
			t.Fatal("local proof transaction")
		}
		defer tx.Rollback(context.Background())
		if _, e = tx.Exec(ctx, q, args...); e != nil {
			t.Fatal("allowed capability unavailable")
		}
	}
	denied := func(c *pgx.Conn, q, code string, args ...any) {
		t.Helper()
		tx, e := c.Begin(ctx)
		if e != nil {
			t.Fatal("local proof transaction")
		}
		defer tx.Rollback(context.Background())
		_, e = tx.Exec(ctx, q, args...)
		var p *pgconn.PgError
		if !errors.As(e, &p) || p.Code != code {
			t.Fatal("expected explicit denial/constraint class " + code)
		}
	}
	t.Run("reader SELECT6 deny private3 all writes DDL roles", func(t *testing.T) {
		for _, table := range []string{"stores", "store_locations", "categories", "canonical_products", "offers", "snapshots"} {
			allowed(reader, "SELECT * FROM public."+table+" LIMIT 1")
		}
		for _, table := range []string{"raw_products", "product_mappings", "source_runs"} {
			denied(reader, "SELECT * FROM public."+table, "42501")
		}
		for _, table := range []string{"stores", "store_locations", "categories", "canonical_products", "offers", "snapshots", "source_runs", "raw_products", "product_mappings"} {
			for _, q := range []string{"UPDATE public." + table + " SET id=id WHERE false", "DELETE FROM public." + table + " WHERE false", "INSERT INTO public." + table + "(id) VALUES('local-negative')"} {
				denied(reader, q, "42501")
			}
		}
		for _, q := range []string{"CREATE TABLE public.part08_negative(id int)", "ALTER TABLE snapshots ADD COLUMN part08_negative int", "CREATE ROLE part08_negative"} {
			denied(reader, q, "42501")
		}
	})
	t.Run("writer SELECT8 UPDATE3 deny forbidden operations", func(t *testing.T) {
		for _, table := range []string{"stores", "categories", "snapshots", "source_runs", "raw_products", "canonical_products", "product_mappings", "offers"} {
			allowed(writer, "SELECT * FROM public."+table+" LIMIT 1")
		}
		denied(writer, "SELECT * FROM public.store_locations", "42501")
		for _, table := range []string{"snapshots", "source_runs", "canonical_products"} {
			allowed(writer, "UPDATE public."+table+" SET id=id WHERE id=(SELECT id FROM public."+table+" LIMIT 1)")
		}
		for _, table := range []string{"stores", "categories", "raw_products", "product_mappings", "offers", "store_locations"} {
			denied(writer, "UPDATE public."+table+" SET id=id WHERE false", "42501")
		}
		for _, table := range []string{"stores", "categories", "store_locations"} {
			denied(writer, "INSERT INTO public."+table+"(id) VALUES('local-negative')", "42501")
		}
		for _, table := range []string{"stores", "categories", "store_locations", "raw_products", "canonical_products", "product_mappings", "offers", "snapshots", "source_runs"} {
			denied(writer, "DELETE FROM public."+table+" WHERE false", "42501")
		}
		for _, q := range []string{"CREATE TABLE public.part08_negative(id int)", "ALTER TABLE snapshots ADD COLUMN part08_negative int", "CREATE ROLE part08_negative"} {
			denied(writer, q, "42501")
		}
	})
	t.Run("INSERT capabilities and composite constraints", func(t *testing.T) {
		var store, category, oldRaw, oldSnapshot, canonical string
		if admin.QueryRow(ctx, `SELECT o."storeId",c."categoryId",o."rawProductId",o."snapshotId",c.id FROM offers o JOIN canonical_products c ON c.id=o."canonicalProductId" LIMIT 1`).Scan(&store, &category, &oldRaw, &oldSnapshot, &canonical) != nil {
			t.Fatal("populated proof rows required")
		}
		tx, e := writer.Begin(ctx)
		if e != nil {
			t.Fatal("local proof transaction")
		}
		defer tx.Rollback(context.Background())
		steps := []struct {
			q    string
			args []any
		}{
			{`INSERT INTO snapshots(id) VALUES('part08-capability')`, nil},
			{`INSERT INTO source_runs(id,"snapshotId","storeId") VALUES('part08-capability','part08-capability',$1)`, []any{store}},
			{`INSERT INTO raw_products(id,"snapshotId","storeId","sourceProductId","rawName","rawPrice") SELECT 'part08-capability','part08-capability',"storeId","sourceProductId","rawName","rawPrice" FROM raw_products WHERE id=$1`, []any{oldRaw}},
			{`INSERT INTO canonical_products(id,name,"categoryId") VALUES('part08-capability','local capability',$1)`, []any{category}},
			{`INSERT INTO product_mappings(id,"rawProductId","canonicalProductId","matchMethod") VALUES('part08-capability','part08-capability','part08-capability','manual')`, nil},
			{`INSERT INTO offers(id,"snapshotId","storeId","rawProductId","canonicalProductId",price) VALUES('part08-capability','part08-capability',$1,'part08-capability','part08-capability',1)`, []any{store}},
		}
		for _, s := range steps {
			if _, e = tx.Exec(ctx, s.q, s.args...); e != nil {
				t.Fatal("writer INSERT capability unavailable")
			}
		}
		if e = tx.Rollback(ctx); e != nil {
			t.Fatal("local proof rollback")
		}
		denied(writer, `INSERT INTO raw_products(id,"snapshotId","storeId","sourceProductId","rawName","rawPrice") SELECT 'part08-duplicate',"snapshotId","storeId","sourceProductId","rawName","rawPrice" FROM raw_products WHERE id=$1`, "23505", oldRaw)
		denied(writer, `INSERT INTO source_runs(id,"snapshotId","storeId") SELECT 'part08-duplicate',"snapshotId","storeId" FROM source_runs LIMIT 1`, "23505")
		denied(writer, `INSERT INTO offers(id,"snapshotId","storeId","rawProductId","canonicalProductId",price) SELECT 'part08-mismatch',s.id,$1,$2,$3,1 FROM snapshots s WHERE s.id<>$4 LIMIT 1`, "23503", store, oldRaw, canonical, oldSnapshot)
		denied(writer, `INSERT INTO snapshots(id,status) VALUES('part08-invalid','published')`, "23514")
		denied(writer, `UPDATE source_runs SET "productCount"=-1 WHERE id=(SELECT id FROM source_runs LIMIT 1)`, "23514")
		denied(writer, `UPDATE source_runs SET "errorCount"=-1 WHERE id=(SELECT id FROM source_runs LIMIT 1)`, "23514")
		denied(admin, `DELETE FROM snapshots WHERE id=$1`, "23503", oldSnapshot)
	})
	if before != fingerprint() {
		t.Fatal("local security proof changed application data")
	}
	if os.Getenv("SNAPSHOT_ROLLBACK_CONFIRM") != "1" {
		return
	}
	t.Run("exact guarded writer rollback preserves reader and history", func(t *testing.T) {
		var readerACL string
		q := `SELECT md5(coalesce(json_agg(x ORDER BY x::text)::text,'[]')) FROM (SELECT c.relname,a.privilege_type,a.is_grantable FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname='aktau_api_reader'))x`
		if admin.QueryRow(ctx, q).Scan(&readerACL) != nil {
			t.Fatal("reader ACL baseline")
		}
		if e := writer.Close(ctx); e != nil {
			t.Fatal("local writer close")
		}
		if _, e := admin.Exec(ctx, `REVOKE aktau_ingest_writer FROM part08_writer; DROP ROLE part08_writer`); e != nil {
			t.Fatal("known local runtime removal")
		}
		data, e := os.ReadFile(filepath.Join("..", "..", "..", "backend", "prisma", "security", "rollback_aktau_ingest_writer_access.sql"))
		if e != nil {
			t.Fatal("rollback artifact read")
		}
		if _, e = admin.Exec(ctx, string(data)); e != nil {
			t.Fatal("guarded writer rollback failed")
		}
		var currentACL string
		var roles, policies int
		if admin.QueryRow(ctx, q).Scan(&currentACL) != nil || currentACL != readerACL || before != fingerprint() {
			t.Fatal("rollback changed reader/data/history")
		}
		if admin.QueryRow(ctx, `SELECT count(*) FROM pg_roles WHERE rolname IN ('aktau_ingest_writer','part08_writer')`).Scan(&roles) != nil || roles != 0 {
			t.Fatal("writer roles retained")
		}
		if admin.QueryRow(ctx, `SELECT count(*) FROM pg_policies WHERE schemaname='public'`).Scan(&policies) != nil || policies != 6 {
			t.Fatal("reader policy preservation")
		}
	})
}
