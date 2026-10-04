-- Operator/bootstrap artifact. NOT a Prisma migration and NOT applied by runtime.
-- Provision this cluster-global group before the reviewed security migration.
-- Phase A: disposable local PostgreSQL only; production needs separate approval.
DO $bootstrap$
DECLARE
    reader pg_catalog.pg_roles%ROWTYPE;
BEGIN
    SELECT * INTO reader FROM pg_catalog.pg_roles WHERE rolname = 'aktau_api_reader';
    IF NOT FOUND THEN
        CREATE ROLE aktau_api_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
            NOREPLICATION NOBYPASSRLS INHERIT;
        SELECT * INTO reader FROM pg_catalog.pg_roles WHERE rolname = 'aktau_api_reader';
    END IF;
    -- Validate both existing and newly-created roles. PostgreSQL 17 adds a
    -- non-superuser creator's admin-only anchor automatically; never clean it up.
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member = reader.oid)
       OR NOT (
           ((SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user)
            AND (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE roleid = reader.oid) = 0)
           OR
           ((SELECT NOT rolsuper AND rolcreaterole FROM pg_catalog.pg_roles WHERE rolname = current_user)
            AND (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE roleid = reader.oid) = 1
            AND EXISTS (
                SELECT 1 FROM pg_catalog.pg_auth_members m
                JOIN pg_catalog.pg_roles grantor ON grantor.oid = m.grantor
                WHERE m.roleid = reader.oid
                  AND m.member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
                  AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
                  AND grantor.rolsuper))
       ) THEN
        RAISE EXCEPTION 'Reader must have only the exact current-operator admin anchor or no members for a superuser';
    END IF;
    IF reader.rolcanlogin OR reader.rolsuper OR reader.rolcreatedb
       OR reader.rolcreaterole OR reader.rolreplication OR reader.rolbypassrls
       OR NOT reader.rolinherit THEN
        RAISE EXCEPTION 'aktau_api_reader has unexpected security attributes';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relowner = reader.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner = reader.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datdba = reader.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE proowner = reader.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_type WHERE typowner = reader.oid) THEN
        RAISE EXCEPTION 'aktau_api_reader must have no owned objects';
    END IF;
    -- PUBLIC-only privileges are not direct reader grants. Check both
    -- recipient and grantor, including defaults owned by the reader.
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_database d
            CROSS JOIN LATERAL pg_catalog.aclexplode(d.datacl) a
            WHERE reader.oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n
            CROSS JOIN LATERAL pg_catalog.aclexplode(n.nspacl) a
            WHERE reader.oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c
            CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
            WHERE reader.oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute c
            CROSS JOIN LATERAL pg_catalog.aclexplode(c.attacl) a
            WHERE reader.oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
            CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a
            WHERE reader.oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_type t
            CROSS JOIN LATERAL pg_catalog.aclexplode(t.typacl) a
            WHERE reader.oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl d WHERE d.defaclrole = reader.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl d
            CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
            WHERE reader.oid IN (a.grantee,a.grantor)) THEN
        RAISE EXCEPTION 'aktau_api_reader must have no pre-existing direct or default privileges';
    END IF;
END
$bootstrap$;
