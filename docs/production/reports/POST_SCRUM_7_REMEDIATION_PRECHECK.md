# Post-SCRUM-7 production remediation PRECHECK

Status: **READY_FOR_OWNER_REMEDIATION**.

Date: 2026-10-07. This status is the explicitly requested PRECHECK outcome, **not** production-launch readiness or authorization to execute remediation. Only read-only verification and planning were performed. Stop for external review.

## Immutable baseline and source provenance

- Branch: `integrate/full-stack`.
- Fresh fetch/prune: PASS; initial working tree clean.
- HEAD = fetched origin = `3a763609b0220364755ff3a1945cbdd4a007cadc`.
- GitHub Actions run `37508068559`: all nine jobs completed/success, including CI Gate; rechecked through public GitHub metadata. This proves the accepted code baseline, not production state.
- Read `docs/SCRUM-7_PROD_ROLLOUT_REPORT_FOR_DENIS.md`, the integration report, Part08/08R/08D, Part10 and Part11 reports, current role/migration SQL, backup/restore tooling and rotation/DB/recovery runbooks.
- The Backend2 handoff was initially absent, then supplied by the owner at its local `docs/` path. It is preserved as an owner-provided untracked file; no content changes were made to it.

## External claims versus newly verified evidence

Backend2 reports that the ingest LOGIN was created, taxonomy applied, the first `-recluster -apply` timed out/rolled back, and a later attempt after PR #6 succeeded and published N+1. It reports a subsequent strict dry-run with `newCanonicalCount=0` and owner/ingest password reuse/exposure in a screenshot, with rotation unconfirmed.

Those operation-history, password-exposure/reuse and strict-dry-run claims remain **externally attributed**, not independently replayed or verified here. No password comparison, password/hash extraction, old-credential probe or ingest was performed. The earlier integration audit remains fixture-based; its historical statement that THAT task did not access production remains accurate.

THIS new PRECHECK independently verifies the **current database metadata/count state** below, not who executed earlier operations or whether the original procedure was followed. Historical Part08/10/11 counts/security are context only, not substituted for fresh evidence. The old Part11 backup predates taxonomy/N+1 and is not a current-state recovery point.

## Production target and read-only method

Existing private operator configuration was available, with file permissions0600. Its target was classified as **Supabase**, and the project identity privately matched the supplied handoff. No Neon connection, provider substitution, database transfer or endpoint/credential change occurred.

- PostgreSQL server: 17.6; client psql: 17.10.
- Operator session: `current_user=session_user=postgres`.
- TLS required; credentials/host/URL were kept in private process environment, not command arguments, report or diagnostic output. Inherited libpq routing variables were not used.
- Explicit repeatable-read **READ ONLY** transaction; transaction-local safety settings verified as read-only on/default read-only on/statement timeout5s. Lock timeout2s and client/connect deadlines were bounded. Final `ROLLBACK` completed.
- SELECT covered application counts/history and security catalogs only. No raw product payloads, migration logs, password material or SQL activity text were emitted.
- An operator-only query initially failed with SQLSTATE42725 (ambiguous catalog type concatenation); an explicit text cast fixed that query, not the database. An initial settings guard was also rejected; transaction-local settings were then established and verified. Rejected attempts are not PASS evidence. No Go pool/session-policy result is inferred from this operator connection.

The configured endpoint is the Supabase **session pooler**, not a direct non-pooled backup endpoint. It suffices for this explicitly guarded read-only transaction; the future backup step requires separately prepared direct operator configuration for the same application project.

## Expected versus fresh observed state

| Item | Expected from owner/handoff | Fresh observed |
| --- | ---: | ---: |
| Successful Prisma migrations | 4 | 4 |
| stores | 3 | 3 |
| store_locations | 15 | 15 |
| categories | 10 | 10 |
| canonical_products, including historical identities | 3425 | 3425 |
| raw_products | 4215 | 4215 |
| offers, including history | 4215 | 4215 |
| product_mappings | 4215 | 4215 |
| snapshots | 2 | 2, both published |
| source_runs | 6 | 6, all succeeded |
| Latest snapshot offers | 3352 | 3352 |
| Categories with a current usable offer | 9 | 9 |

Exactly these four successful, non-rolled-back migration records were observed; every checksum matches the checked-in migration bytes at the immutable baseline:

1. `20260923000000_init` (steps0).
2. `20261004000000_rls_runtime_access` (steps1).
3. `20261005000000_snapshot_history` (steps1).
4. `20261006000000_catalog_taxonomy` (steps1).

No extra/unfinished/rolled-back history row was present. Prisma CLI status/deploy/resolve was not run; history was read by SELECT.

Latest published snapshot, selected by `publishedAt DESC, id DESC`: `62c0bfeb-dcbe-432f-abf9-c108e6fdb9a5`, publication `2026-10-06 13:50:35.484` as stored; raw3352/offers3352. Previous `baseline-internal-v1` remains published with raw863/offers863. No building/validating/failed snapshot was present in this audit view.

| SourceRun store | Latest published productCount | Previous baseline productCount |
| --- | ---: | ---: |
| DINA | 1995 | 564 |
| DANA | 1283 | 279 |
| FIX_PRICE | 74 | 20 |
| Total | 3352 | 863 |

All six runs have succeeded status and errorCount0. Latest capture timestamps remain those reported for 2026-10-05; publication is not evidence of a fresh scrape.

All category slugs, in order: `bread`, `dairy`, `eggs`, `groats`, `meat`, `milk`, `oil`, `other`, `sugar`, `vegetables`. `sugar` name is `Сахар`. Exactly the nine launch categories excluding `other` have an offer in the latest published snapshot with `inStock=true` and `price>0`. This is a SQL verification of selection semantics, **not** HTTP/API validation. Global canonical3425 must not be mistaken for the number of current usable public product DTOs.

## Security expectations and fresh observed metadata

- Nine application tables: **RLS9/FORCE0**. Including `_prisma_migrations`: **RLS10/FORCE0**.
- Exactly **23 permissive policies**, reader6 + writer17. Names, table/command/role scope and constant true USING/WITH CHECK semantics match the checked-in security contract; no extra public policy was observed.
- Reader direct ACL: SELECT on stores/store_locations/categories/canonical_products/offers/snapshots + public USAGE only, without grant option.
- Writer direct ACL: stores/categories SELECT; snapshots/source_runs SELECT+INSERT+UPDATE; raw_products SELECT+INSERT; canonical_products SELECT+INSERT+UPDATE; product_mappings/offers SELECT+INSERT; public USAGE only. Exactly17 table privilege entries, without grant option.
- Both group roles are NOLOGIN/INHERIT and have no parent. Both runtime roles are LOGIN/INHERIT; all four have no SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS flags.
- `aktau_api_runtime` has exactly one parent, `aktau_api_reader`; `aktau_ingest_runtime` exactly one parent, `aktau_ingest_writer`. Both runtime memberships: ADMIN=false, INHERIT=true, SET=false.
- PostgreSQL17 creator anchors were observed separately: postgres member of each target role, grantor supabase_admin, ADMIN=true/INHERIT=false/SET=false. These are not additional parents of a runtime role; no anchor cleanup was attempted.
- Both runtime roles have **zero direct ACL entries**. All four target roles have zero relation/schema/database/function/type ownership and zero owned default ACLs. None has schema CREATE; public USAGE is true.
- Effective API metadata: SELECT6 only; raw_products/product_mappings/source_runs and `_prisma_migrations` SELECT false; every checked DML/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN privilege false.
- Effective writer metadata matches SELECT8/INSERT6/UPDATE3; no DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN, store_locations or migration-table privileges.

These are actual catalog/privilege observations, **not** restricted-credential SQL/API execution proof. No production DML/DDL denial probes or SET ROLE escalation attempts were made. No unchanged-managed-ACL claim is made without an earlier complete comparable private inventory.

### `_prisma_migrations` RLS finding

Confirmed: owner postgres, RLS=true, FORCE=false, **zero policies**. Neither runtime role has SELECT on this table. Owner SELECT succeeds because the owner is not forced through RLS; that does not prove another migration identity is safe or functional.

The checked-in application security migrations enable RLS on the nine application tables, not on `_prisma_migrations`. The handoff already reported this condition before taxonomy; its actor/time/cause are **not established** by current catalogs. Treat it as a separate investigation/reconciliation item, not grounds for disabling RLS or rewriting history. No migration privilege change, history edit or repair is authorized here.

## Ordered remediation plan — approval required, NOT EXECUTED

Preserve the current data/history/security baseline. Rotate one credential class at a time; no automatic rollback, owner credential fallback to API, provider migration, ingestion or new snapshot.

### A. Rotate postgres owner/admin password

Owner performs a separately authorized Supabase password rotation for the **same application project** through its trusted management boundary. Use a new independent strong secret, persisted only privately (files0600/directories0700, no argv/chat/Git/log values). Inventory operator/migration/backup connection configurations first; do not copy the replacement owner credential into API/Nest/Go configuration. Verify the replacement in a fresh bounded read-only connection and preserve a safe management access path. PostgreSQL single-password rotation does not promise overlapping old/new validity.

### B. Rotate aktau_ingest_runtime separately

Under separate reviewed authorization, rotate only this existing LOGIN password to a **different independent secret**; retain membership, flags, ACL/ownership and connection policy. Store separately from owner/API secrets. Do not recreate the role, bootstrap groups, broaden grants or run ingest/dry-run/apply as a password test. Validate the new writer identity with a fresh read-only metadata connection, not a write probe.

### C. Verify old credentials no longer work where safely checkable

Make one bounded fresh authentication attempt per old credential through the relevant existing endpoint(s), using a private mechanism and sanitized outcome classes. Authentication rejection is revocation evidence; network/TLS/quota/timeouts are **not**. Existing pooled/authenticated sessions may survive password rotation, so do not infer their invalidation from a fresh-login failure. Any old fresh authentication success requires owner review; do not automatically kill sessions, reset again or change roles. Old secrets must never be placed in this report/history; controlled retirement follows the owner retention policy.

### D. Fresh encrypted backup of current state

After A–C PASS, privately configure explicit `BACKUP_DATABASE_URL` with the rotated operator credential and a verified **direct, non-pooled Supabase connection to this same application DB**. No Neon/empty backup database and no runtime-URL fallback.

PG dump/restore17.10 and GnuPG2.4.4 are available. Existing operator env contains BACKUP_DATABASE_URL but **does not currently set** BACKUP_OUTPUT_DIR/BACKUP_GPG_HOME/BACKUP_GPG_RECIPIENT. Owner must configure these outside the repo with protected permissions and confirm recoverable recipient/private-key custody; existence of older Part11 proof is not enough to assume current custody/configuration.

Use unchanged `ops/postgres/backup.sh` only after authorization and all guards. Dump complete portable public application schema/data plus migration history, not Supabase-managed internal schemas; encrypt with established GnuPG, retain adjacent checksum metadata, verify decryption/custom format, clean plaintext. Preserve older recovery points; no overwriting/pruning or scheduler. Record safe PRE/POST counts, versioned field-complete binary-safe fingerprints and security/history metadata. pg_dump no-owner/no-acl does not capture cluster role/password/ACL state; document that limitation. This creates a **post-rollout current-state** recovery point, not a retroactive pre-rollout backup.

### E. Disposable local PostgreSQL17 restore proof

Use fresh task-owned PG17 resources bound only to loopback, with disposable credentials and a `part11_*` target compatible with the existing restore guard. Never put production credentials into the container. Provision only reviewed local NOLOGIN policy-role prerequisites. If the dump includes CREATE SCHEMA public, prove the owned target public schema is empty first and prepare it only with reviewed **local** DROP SCHEMA public RESTRICT (no CASCADE); failed restriction means STOP.

Run unchanged `ops/postgres/restore-test.sh` with --no-owner/--no-acl/--exit-on-error; require exit0. Compare all ten table counts, deterministic field-complete fingerprints (float8send for matchConfidence, not formatter-dependent legacy hashes), four migration records/checksums, schema/index/constraint/RLS/policy metadata, both published snapshots and all six SourceRuns. Reconstruct approved least-privilege ACLs locally because no-acl does not restore them. Prove local restricted Go smoke. Stop on any mismatch; do not repair production or pick hashes until they match. Delete only owned disposable/plaintext resources; encrypted backup/key custody stays private outside repo.

### F. Restricted runtime/API read-only verification

Obtain/validate the existing private `aktau_api_runtime` credential for this project; never use owner/ingest secrets as API fallback. Prove actual current_user/session_user, committed Go physical read-only/timeout policy, SELECT6/private3 denial and safe membership/flags through allowed reads/metadata, without DML/DDL probes.

Use immutable local Go/Nest processes with the restricted credential and real current Supabase reads; no deployment or traffic cutover. Verify health plus frozen GET categories/filters/products/detail/dashboard, all current usable products in three sorts via bounded pages, search/filter/pagination and sugar baskets. Derive the current usable product count from the latest snapshot rather than global canonical3425. No store scraping, Gemini/Upstash/Voice session writes or ingestion in this read-only verification. Confirm counts/history/security unchanged afterwards.

### G. Investigate migration-history RLS

Read-only review of Supabase administrative/audit history where available, existing migration-role effective identity/privileges/ownership, and checked-in migration provenance. Reproduce any proposed resolution on the restored disposable clone first. Explicitly determine whether RLS is intentional platform/operator hardening and whether a future migration identity needs a reviewed change. Do not disable RLS, add policies, rerun recorded migrations, invoke migrate resolve or rewrite `_prisma_migrations` ad hoc. Any production security/history mutation needs a new separately reviewed authorization.

### H. Final external review

Present A–G evidence with exact committed revision, rotated-credential outcome classes, fresh encrypted-backup/restore proof, current-state counts/fingerprints/history/security and restricted GET parity. Record unresolved platform/credential/history risks honestly. Acceptance is not automatic deployment or catalog publication authorization.

## Scope completion and outstanding actions

Fresh read-only state/security PRECHECK: **PASS**; no count/history/least-privilege mismatch found against the stated expected state. Owner remediation is still necessary for reported credential exposure, current-state backup/restore, actual restricted runtime/API proof and migration-history RLS investigation. None of A–H was executed here. Password rotation status and reported `newCanonicalCount=0` remain unverified.

No backup write, rotation, DDL/DML, migration/status/resolve/deploy, role/grant/revoke, ingest, dry-run, N+1, API deployment, Railway/VPS/domain/Cloudflare or scheduler action. Runtime/tests/harness/contracts were not changed. No commit/push. Only this report was created; the owner-supplied handoff remains untouched. Stop for external review; no further production writes authorized.
