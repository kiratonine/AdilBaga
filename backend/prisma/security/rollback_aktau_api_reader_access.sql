-- Operator-only emergency rollback; NOT a Prisma migration or runtime action.
-- Separately approved execution only. Remove the known runtime LOGIN first.
-- Restore pre-Part04 baseline: RLS7/FORCE0/policies0, reader absent, data untouched.
-- Every check and destructive step is atomic; unexpected drift aborts everything.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10s';

LOCK TABLE public.stores, public.store_locations, public.categories,
    public.raw_products, public.canonical_products, public.product_mappings,
    public.offers IN ACCESS EXCLUSIVE MODE;

DO $guard$
DECLARE
    reader pg_catalog.pg_roles%ROWTYPE;
    runtime_tables text[] := ARRAY['stores','store_locations','categories','canonical_products','offers'];
    app_tables text[] := runtime_tables || ARRAY['raw_products','product_mappings'];
BEGIN
    SELECT * INTO reader FROM pg_catalog.pg_roles WHERE rolname = 'aktau_api_reader';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rollback requires the reviewed reader rollout state';
    END IF;
    IF reader.rolcanlogin OR reader.rolsuper OR reader.rolcreatedb
       OR reader.rolcreaterole OR reader.rolreplication OR reader.rolbypassrls
       OR NOT reader.rolinherit
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member = reader.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relowner = reader.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner = reader.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datdba = reader.oid) THEN
        RAISE EXCEPTION 'Reader role attributes, membership or ownership drift';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE roleid = reader.oid) THEN
        RAISE EXCEPTION 'Explicitly remove runtime LOGIN memberships before rollback';
    END IF;
    IF (SELECT count(*) FROM pg_catalog.pg_class
        WHERE relnamespace = 'public'::regnamespace AND relname = ANY(app_tables)
          AND relkind = 'r' AND relrowsecurity AND NOT relforcerowsecurity) <> 7 THEN
        RAISE EXCEPTION 'Application RLS baseline drift';
    END IF;
    -- Require the exact five owned policies, and no other public/reader policy.
    IF (SELECT count(*) FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
        WHERE c.relnamespace='public'::regnamespace OR reader.oid=ANY(p.polroles)) <> 5
       OR (SELECT count(*) FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
           WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY(runtime_tables)
             AND p.polname='aktau_api_reader_select' AND p.polcmd='r' AND p.polpermissive
             AND p.polroles=ARRAY[reader.oid] AND pg_catalog.pg_get_expr(p.polqual,p.polrelid)='true'
             AND p.polwithcheck IS NULL) <> 5 THEN
        RAISE EXCEPTION 'Reader policy drift';
    END IF;
    -- Check direct ACLs, not effective privileges (PUBLIC USAGE/CONNECT are preserved).
    IF (SELECT count(*) FROM pg_catalog.pg_class c
        CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a WHERE a.grantee=reader.oid) <> 5
       OR (SELECT count(DISTINCT c.oid) FROM pg_catalog.pg_class c
           CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
           WHERE a.grantee=reader.oid AND c.relnamespace='public'::regnamespace
             AND c.relname=ANY(runtime_tables) AND a.privilege_type='SELECT' AND NOT a.is_grantable) <> 5
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute c
           CROSS JOIN LATERAL pg_catalog.aclexplode(c.attacl) a WHERE a.grantee=reader.oid)
       OR (SELECT count(*) FROM pg_catalog.pg_namespace n
           CROSS JOIN LATERAL pg_catalog.aclexplode(n.nspacl) a WHERE a.grantee=reader.oid) <> 1
       OR (SELECT count(*) FROM pg_catalog.pg_namespace n
           CROSS JOIN LATERAL pg_catalog.aclexplode(n.nspacl) a WHERE a.grantee=reader.oid
             AND n.nspname='public' AND a.privilege_type='USAGE' AND NOT a.is_grantable) <> 1
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_database d
           CROSS JOIN LATERAL pg_catalog.aclexplode(d.datacl) a WHERE a.grantee=reader.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
           CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a WHERE a.grantee=reader.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_type t
           CROSS JOIN LATERAL pg_catalog.aclexplode(t.typacl) a WHERE a.grantee=reader.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl d
           CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a WHERE a.grantee=reader.oid) THEN
        RAISE EXCEPTION 'Reader ACL drift';
    END IF;
END
$guard$;

DROP POLICY aktau_api_reader_select ON public.stores;
DROP POLICY aktau_api_reader_select ON public.store_locations;
DROP POLICY aktau_api_reader_select ON public.categories;
DROP POLICY aktau_api_reader_select ON public.canonical_products;
DROP POLICY aktau_api_reader_select ON public.offers;
REVOKE SELECT ON public.stores, public.store_locations, public.categories,
    public.canonical_products, public.offers FROM aktau_api_reader;
REVOKE USAGE ON SCHEMA public FROM aktau_api_reader;
DROP ROLE aktau_api_reader;

COMMIT;
