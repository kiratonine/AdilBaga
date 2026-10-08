-- Guarded access-only rollback. Remove known ingestion LOGIN membership first.
-- Does not remove snapshots/history/schema/data or touch the API reader.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='10s';
LOCK TABLE public.stores,public.categories,public.snapshots,public.source_runs,public.raw_products,public.canonical_products,public.product_mappings,public.offers IN ACCESS EXCLUSIVE MODE;
DO $guard$
DECLARE writer pg_roles%ROWTYPE;
BEGIN
 SELECT * INTO writer FROM pg_roles WHERE rolname='aktau_ingest_writer';
 IF NOT FOUND OR writer.rolcanlogin OR writer.rolsuper OR writer.rolcreatedb OR writer.rolcreaterole OR writer.rolreplication OR writer.rolbypassrls OR NOT writer.rolinherit
 OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=writer.oid)
 OR EXISTS(SELECT 1 FROM pg_class WHERE relowner=writer.oid)
 OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=writer.oid)
 OR EXISTS(SELECT 1 FROM pg_database WHERE datdba=writer.oid)
 OR EXISTS(SELECT 1 FROM pg_proc WHERE proowner=writer.oid)
 OR EXISTS(SELECT 1 FROM pg_type WHERE typowner=writer.oid) THEN RAISE EXCEPTION 'Writer role security drift'; END IF;
 IF NOT (
 ((SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=writer.oid))
 OR ((SELECT NOT rolsuper AND rolcreaterole FROM pg_roles WHERE rolname=current_user)
 AND (SELECT count(*) FROM pg_auth_members WHERE roleid=writer.oid)=1
 AND EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.grantor WHERE m.roleid=writer.oid AND m.member=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option AND g.rolsuper))
 ) THEN RAISE EXCEPTION 'Remove runtime members; retain only exact operator admin anchor'; END IF;
 IF (SELECT count(*) FROM pg_policy WHERE writer.oid=ANY(polroles))<>17
 OR (SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE writer.oid IN(a.grantee,a.grantor))<>17
 OR (SELECT count(*) FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl)a WHERE writer.oid IN(a.grantee,a.grantor))<>1
 OR NOT EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl)a WHERE n.nspname='public' AND a.grantee=writer.oid AND a.privilege_type='USAGE' AND NOT a.is_grantable)
 OR EXISTS(SELECT 1 FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl)a WHERE writer.oid IN(a.grantee,a.grantor))
 OR EXISTS(SELECT 1 FROM pg_database c CROSS JOIN LATERAL aclexplode(c.datacl)a WHERE writer.oid IN(a.grantee,a.grantor))
 OR EXISTS(SELECT 1 FROM pg_proc c CROSS JOIN LATERAL aclexplode(c.proacl)a WHERE writer.oid IN(a.grantee,a.grantor))
 OR EXISTS(SELECT 1 FROM pg_type c CROSS JOIN LATERAL aclexplode(c.typacl)a WHERE writer.oid IN(a.grantee,a.grantor))
 OR EXISTS(SELECT 1 FROM pg_default_acl c WHERE c.defaclrole=writer.oid)
 OR EXISTS(SELECT 1 FROM pg_default_acl c CROSS JOIN LATERAL aclexplode(c.defaclacl)a WHERE writer.oid IN(a.grantee,a.grantor)) THEN RAISE EXCEPTION 'Writer ACL/policy drift'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname='stores' AND p.polname='aktau_ingest_writer_select' AND p.polcmd='r' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND pg_get_expr(p.polqual,p.polrelid)='true' AND p.polwithcheck IS NULL)
 OR NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.relnamespace='public'::regnamespace AND c.relname='stores' AND a.grantee=writer.oid AND a.privilege_type='SELECT' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'Writer exact privilege/policy mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname='categories' AND p.polname='aktau_ingest_writer_select' AND p.polcmd='r' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND pg_get_expr(p.polqual,p.polrelid)='true' AND p.polwithcheck IS NULL)
 OR NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.relnamespace='public'::regnamespace AND c.relname='categories' AND a.grantee=writer.oid AND a.privilege_type='SELECT' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'Writer exact privilege/policy mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname='snapshots' AND p.polname='aktau_ingest_writer_select' AND p.polcmd='r' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND pg_get_expr(p.polqual,p.polrelid)='true' AND p.polwithcheck IS NULL)
 OR NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.relnamespace='public'::regnamespace AND c.relname='snapshots' AND a.grantee=writer.oid AND a.privilege_type='SELECT' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'Writer exact privilege/policy mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname='snapshots' AND p.polname='aktau_ingest_writer_insert' AND p.polcmd='a' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND p.polqual IS NULL AND pg_get_expr(p.polwithcheck,p.polrelid)='true')
 OR NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.relnamespace='public'::regnamespace AND c.relname='snapshots' AND a.grantee=writer.oid AND a.privilege_type='INSERT' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'Writer exact privilege/policy mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname='snapshots' AND p.polname='aktau_ingest_writer_update' AND p.polcmd='w' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND pg_get_expr(p.polqual,p.polrelid)='true' AND pg_get_expr(p.polwithcheck,p.polrelid)='true')
 OR NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.relnamespace='public'::regnamespace AND c.relname='snapshots' AND a.grantee=writer.oid AND a.privilege_type='UPDATE' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'Writer exact privilege/policy mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname='source_runs' AND p.polname='aktau_ingest_writer_select' AND p.polcmd='r' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND pg_get_expr(p.polqual,p.polrelid)='true' AND p.polwithcheck IS NULL)
 OR NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.relnamespace='public'::regnamespace AND c.relname='source_runs' AND a.grantee=writer.oid AND a.privilege_type='SELECT' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'Writer exact privilege/policy mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname='source_runs' AND p.polname='aktau_ingest_writer_insert' AND p.polcmd='a' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND p.polqual IS NULL AND pg_get_expr(p.polwithcheck,p.polrelid)='true')
 OR NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.relnamespace='public'::regnamespace AND c.relname='source_runs' AND a.grantee=writer.oid AND a.privilege_type='INSERT' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'Writer exact privilege/policy mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname='source_runs' AND p.polname='aktau_ingest_writer_update' AND p.polcmd='w' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND pg_get_expr(p.polqual,p.polrelid)='true' AND pg_get_expr(p.polwithcheck,p.polrelid)='true')
 OR NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.relnamespace='public'::regnamespace AND c.relname='source_runs' AND a.grantee=writer.oid AND a.privilege_type='UPDATE' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'Writer exact privilege/policy mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname='raw_products' AND p.polname='aktau_ingest_writer_select' AND p.polcmd='r' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND pg_get_expr(p.polqual,p.polrelid)='true' AND p.polwithcheck IS NULL)
 OR NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.relnamespace='public'::regnamespace AND c.relname='raw_products' AND a.grantee=writer.oid AND a.privilege_type='SELECT' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'Writer exact privilege/policy mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname='raw_products' AND p.polname='aktau_ingest_writer_insert' AND p.polcmd='a' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND p.polqual IS NULL AND pg_get_expr(p.polwithcheck,p.polrelid)='true')
 OR NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.relnamespace='public'::regnamespace AND c.relname='raw_products' AND a.grantee=writer.oid AND a.privilege_type='INSERT' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'Writer exact privilege/policy mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname='canonical_products' AND p.polname='aktau_ingest_writer_select' AND p.polcmd='r' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND pg_get_expr(p.polqual,p.polrelid)='true' AND p.polwithcheck IS NULL)
 OR NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.relnamespace='public'::regnamespace AND c.relname='canonical_products' AND a.grantee=writer.oid AND a.privilege_type='SELECT' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'Writer exact privilege/policy mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname='canonical_products' AND p.polname='aktau_ingest_writer_insert' AND p.polcmd='a' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND p.polqual IS NULL AND pg_get_expr(p.polwithcheck,p.polrelid)='true')
 OR NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.relnamespace='public'::regnamespace AND c.relname='canonical_products' AND a.grantee=writer.oid AND a.privilege_type='INSERT' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'Writer exact privilege/policy mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname='canonical_products' AND p.polname='aktau_ingest_writer_update' AND p.polcmd='w' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND pg_get_expr(p.polqual,p.polrelid)='true' AND pg_get_expr(p.polwithcheck,p.polrelid)='true')
 OR NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.relnamespace='public'::regnamespace AND c.relname='canonical_products' AND a.grantee=writer.oid AND a.privilege_type='UPDATE' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'Writer exact privilege/policy mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname='product_mappings' AND p.polname='aktau_ingest_writer_select' AND p.polcmd='r' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND pg_get_expr(p.polqual,p.polrelid)='true' AND p.polwithcheck IS NULL)
 OR NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.relnamespace='public'::regnamespace AND c.relname='product_mappings' AND a.grantee=writer.oid AND a.privilege_type='SELECT' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'Writer exact privilege/policy mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname='product_mappings' AND p.polname='aktau_ingest_writer_insert' AND p.polcmd='a' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND p.polqual IS NULL AND pg_get_expr(p.polwithcheck,p.polrelid)='true')
 OR NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.relnamespace='public'::regnamespace AND c.relname='product_mappings' AND a.grantee=writer.oid AND a.privilege_type='INSERT' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'Writer exact privilege/policy mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname='offers' AND p.polname='aktau_ingest_writer_select' AND p.polcmd='r' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND pg_get_expr(p.polqual,p.polrelid)='true' AND p.polwithcheck IS NULL)
 OR NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.relnamespace='public'::regnamespace AND c.relname='offers' AND a.grantee=writer.oid AND a.privilege_type='SELECT' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'Writer exact privilege/policy mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname='offers' AND p.polname='aktau_ingest_writer_insert' AND p.polcmd='a' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND p.polqual IS NULL AND pg_get_expr(p.polwithcheck,p.polrelid)='true')
 OR NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.relnamespace='public'::regnamespace AND c.relname='offers' AND a.grantee=writer.oid AND a.privilege_type='INSERT' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'Writer exact privilege/policy mismatch'; END IF;
END $guard$;
DROP POLICY aktau_ingest_writer_select ON public.stores;
REVOKE SELECT ON public.stores FROM aktau_ingest_writer;
DROP POLICY aktau_ingest_writer_select ON public.categories;
REVOKE SELECT ON public.categories FROM aktau_ingest_writer;
DROP POLICY aktau_ingest_writer_select ON public.snapshots;
DROP POLICY aktau_ingest_writer_insert ON public.snapshots;
DROP POLICY aktau_ingest_writer_update ON public.snapshots;
REVOKE SELECT,INSERT,UPDATE ON public.snapshots FROM aktau_ingest_writer;
DROP POLICY aktau_ingest_writer_select ON public.source_runs;
DROP POLICY aktau_ingest_writer_insert ON public.source_runs;
DROP POLICY aktau_ingest_writer_update ON public.source_runs;
REVOKE SELECT,INSERT,UPDATE ON public.source_runs FROM aktau_ingest_writer;
DROP POLICY aktau_ingest_writer_select ON public.raw_products;
DROP POLICY aktau_ingest_writer_insert ON public.raw_products;
REVOKE SELECT,INSERT ON public.raw_products FROM aktau_ingest_writer;
DROP POLICY aktau_ingest_writer_select ON public.canonical_products;
DROP POLICY aktau_ingest_writer_insert ON public.canonical_products;
DROP POLICY aktau_ingest_writer_update ON public.canonical_products;
REVOKE SELECT,INSERT,UPDATE ON public.canonical_products FROM aktau_ingest_writer;
DROP POLICY aktau_ingest_writer_select ON public.product_mappings;
DROP POLICY aktau_ingest_writer_insert ON public.product_mappings;
REVOKE SELECT,INSERT ON public.product_mappings FROM aktau_ingest_writer;
DROP POLICY aktau_ingest_writer_select ON public.offers;
DROP POLICY aktau_ingest_writer_insert ON public.offers;
REVOKE SELECT,INSERT ON public.offers FROM aktau_ingest_writer;
REVOKE USAGE ON SCHEMA public FROM aktau_ingest_writer;
DROP ROLE aktau_ingest_writer;
COMMIT;
