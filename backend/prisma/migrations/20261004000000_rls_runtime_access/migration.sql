-- Security-only migration. Provision/verify aktau_api_reader separately first.
-- Phase A applies this ONLY to disposable local databases. No runtime apply.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10s';

DO $guard$
DECLARE
    reader_oid oid;
    app_tables text[] := ARRAY['stores','store_locations','categories','raw_products',
        'canonical_products','product_mappings','offers'];
    rls_enabled integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'aktau_api_reader' AND NOT rolcanlogin AND NOT rolsuper
          AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication
          AND NOT rolbypassrls AND rolinherit
    ) THEN
        RAISE EXCEPTION 'Provision/verify the restricted aktau_api_reader group first';
    END IF;
    SELECT oid INTO reader_oid FROM pg_catalog.pg_roles WHERE rolname = 'aktau_api_reader';
    -- Independently enforce the same pre-activation operator anchor as bootstrap.
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member = reader_oid)
       OR NOT (
           ((SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user)
            AND (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE roleid = reader_oid) = 0)
           OR
           ((SELECT NOT rolsuper AND rolcreaterole FROM pg_catalog.pg_roles WHERE rolname = current_user)
            AND (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE roleid = reader_oid) = 1
            AND EXISTS (
                SELECT 1 FROM pg_catalog.pg_auth_members m
                JOIN pg_catalog.pg_roles grantor ON grantor.oid = m.grantor
                WHERE m.roleid = reader_oid
                  AND m.member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
                  AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
                  AND grantor.rolsuper))
       ) THEN
        RAISE EXCEPTION 'Reader must have only the exact current-operator admin anchor or no members for a superuser';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relowner = reader_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner = reader_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datdba = reader_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE proowner = reader_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_type WHERE typowner = reader_oid) THEN
        RAISE EXCEPTION 'aktau_api_reader must have no owned objects';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_database d
            CROSS JOIN LATERAL pg_catalog.aclexplode(d.datacl) a
            WHERE reader_oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n
            CROSS JOIN LATERAL pg_catalog.aclexplode(n.nspacl) a
            WHERE reader_oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c
            CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
            WHERE reader_oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute c
            CROSS JOIN LATERAL pg_catalog.aclexplode(c.attacl) a
            WHERE reader_oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
            CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a
            WHERE reader_oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_type t
            CROSS JOIN LATERAL pg_catalog.aclexplode(t.typacl) a
            WHERE reader_oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl d WHERE d.defaclrole = reader_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl d
            CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
            WHERE reader_oid IN (a.grantee,a.grantor)) THEN
        RAISE EXCEPTION 'aktau_api_reader must have no pre-existing direct or default privileges';
    END IF;
    IF (SELECT count(*) FROM pg_catalog.pg_class WHERE relnamespace='public'::regnamespace
        AND relname=ANY(app_tables) AND relkind='r') <> 7 THEN
        RAISE EXCEPTION 'Expected exactly seven ordinary application tables';
    END IF;
    -- Lock all target tables before inspecting RLS/policies: concurrent ALTER or
    -- POLICY DDL cannot slip between this baseline guard and the forward steps.
    LOCK TABLE public.stores, public.store_locations, public.categories,
        public.raw_products, public.canonical_products, public.product_mappings,
        public.offers IN ACCESS EXCLUSIVE MODE;
    SELECT count(*) INTO rls_enabled FROM pg_catalog.pg_class
        WHERE relnamespace='public'::regnamespace AND relname=ANY(app_tables) AND relrowsecurity;
    IF rls_enabled NOT IN (0,7)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace='public'::regnamespace
            AND relname=ANY(app_tables) AND relforcerowsecurity)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
            WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY(app_tables)) THEN
        RAISE EXCEPTION 'Unexpected application RLS or policy baseline';
    END IF;
END
$guard$;

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO aktau_api_reader;
GRANT SELECT ON public.stores, public.store_locations, public.categories,
    public.canonical_products, public.offers TO aktau_api_reader;

CREATE POLICY aktau_api_reader_select ON public.stores
    FOR SELECT TO aktau_api_reader USING (true);
CREATE POLICY aktau_api_reader_select ON public.store_locations
    FOR SELECT TO aktau_api_reader USING (true);
CREATE POLICY aktau_api_reader_select ON public.categories
    FOR SELECT TO aktau_api_reader USING (true);
CREATE POLICY aktau_api_reader_select ON public.canonical_products
    FOR SELECT TO aktau_api_reader USING (true);
CREATE POLICY aktau_api_reader_select ON public.offers
    FOR SELECT TO aktau_api_reader USING (true);

COMMIT;
