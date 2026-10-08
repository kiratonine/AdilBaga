# PostgreSQL production layer — Part 04

Status: **BLOCKED**. NestJS remains the reference/traffic owner. Go business HTTP
API parity is not implemented. This document records inspected facts and a
owner-approved access model, not permission to change Supabase. Historical Phase A
sections below predate the retained production RLS/runtime rollout. Current Go
pool remediation is LOCAL only; live validation awaits an immutable reviewed
commit. See the latest section in the same Part 04 report.

## Schema and fresh clone

Supabase PostgreSQL 17.6 contains the seven application tables in `public`:
stores, store_locations, categories, raw_products, canonical_products,
product_mappings and offers. Fresh public schema-only/custom dumps were made
outside the repository with read-only session options, directory 0700/files 0600.
Restore into disposable PostgreSQL 17.11 (`postgres:17-alpine`) exited 0 and all
seven table counts matched live. A separate local reference database was created
using the checked-in Prisma initialization migration, not a Go schema copy.

Catalog comparison matched 3 enums/ordered values, 7 tables, 48 columns including
types/nullability/defaults, 15 PK/FK constraints and 21 indexes including PK/unique
indexes. All 8 FK cascade update/delete rules matched.

**Material security-schema drift:** all seven live/restored application tables
have `relrowsecurity=true`, `relforcerowsecurity=false`, with no `pg_policies` rows.
All seven initial-migration-only reference tables have both RLS flags false. This was missed by
the initial structural comparison and discovered when the restricted clone role
returned zero categories. It cannot be dismissed as platform metadata: it changes
the runtime role's observable data access. Stop condition 1 applies.

## Runtime access design (production policies still pending)

Approved stable group `aktau_api_reader`: NOLOGIN, NOSUPERUSER, NOCREATEDB,
NOCREATEROLE, NOREPLICATION, NOBYPASSRLS, INHERIT. A separately provisioned runtime
LOGIN inherits only this group, owns no tables and has no privileged membership.
It needs CONNECT database, USAGE public,
SELECT **only** categories/canonical_products/offers/stores/store_locations.
No DML/DDL, raw_products/product_mappings access, role creation or ownership.
Keep PUBLIC permissions and RLS implications under explicit deployment review.
Future ingestion uses a separate credential; exact ingestion DML grants are
deferred to Part 08. Migration uses a separate credential, reviewed DDL only,
never a runtime API credential.

A transient local-only `part04_api` role with the five SELECT grants passed the
deterministic migration-based fixture tests. Direct SELECT on raw_products and
product_mappings failed; INSERT/UPDATE/DELETE/CREATE TABLE failed independently
of the pool's read-only settings. **On the production clone the same grants were
insufficient: categories SELECT succeeded but returned 0 rather than 6 rows.**
No BYPASSRLS or policies were added, even locally, to conceal this finding.

The owner approved Phase A: RLS stays enabled on all seven tables, FORCE stays
false; exactly five SELECT policies use TO aktau_api_reader USING(true), never
PUBLIC, FOR ALL or WITH CHECK. No raw/mapping policies or grants. Bootstrap is
separate because roles are cluster-global, not Prisma's per-database history.
The new security migration only enables RLS and grants the reader five SELECTs
plus schema USAGE/policies. Existing initialization migration remains unchanged.
Do not disable RLS, use owner/service_role credentials for future Go runtime or
add BYPASSRLS. No unrelated Supabase-managed grant is revoked.

## Phase A live security audit

Observed current_user=session_user=postgres, active role=none. This role owns all
seven application tables, has BYPASSRLS, is not superuser; both ownership (with
FORCE RLS false) and BYPASSRLS explain visibility. Live roles/policies were not
changed. RLS's original administrative origin cannot be inferred from catalogs;
the proven drift is security state absent from checked-in initialization history.

Existing anon/authenticated/service_role each have SELECT/INSERT/UPDATE/DELETE/
TRUNCATE/REFERENCES/TRIGGER on all seven tables (not grantable). postgres has the
same grantable privileges. These managed ACLs are preserved: no API group
membership/policy is given to anon/authenticated, so the new reader design does
not require unrelated revokes. Schema PUBLIC/anon/authenticated/service_role have
USAGE; pg_database_owner has USAGE+CREATE. PUBLIC has no CREATE. Schema ACL was
inspected through pg_namespace/aclexplode, not an incomplete information_schema
schema-usage projection. The reader role does not exist on live yet.

PGOPTIONS alone was observed not to persist the requested settings on this
connection. Phase A's audit explicitly SET default_transaction_read_only=on and
statement_timeout=5000, then BEGIN READ ONLY in each catalog-query batch; inspected
settings confirmed read-only defaults+transaction=on and timeout=5s. These are
connection-local controls, not production schema/data mutations.

## Reviewed artifacts and future deployment order

- `backend/prisma/security/aktau_api_reader_role.sql`: operator-only group bootstrap;
  PRE-activation only. Refuses unsafe attributes, parent memberships, any child
  other than the exact permitted operator-admin anchor below, ownership or any
  direct/default ACL involving the reader. It validates newly-created roles too.
  It is not a health
  check/idempotent reapply for an already activated runtime group.
- `backend/prisma/migrations/20261004000000_rls_runtime_access/migration.sql`:
  independently enforces the same role/ACL invariants and seven ordinary app
  tables with FORCE0/policies0. Permits only uniform RLS0 (fresh) or RLS7 (clone).
  Target tables are locked before RLS/policy inspection; migration transaction
  has lock_timeout5s and statement_timeout10s. No retry or partial apply.
- `backend/prisma/security/rollback_aktau_api_reader_access.sql`: operator-only,
  transactionally guarded emergency rollback, never an automatic migration.

Future order, **not executed on Supabase in Phase A**:

1. Operator provisions/verifies group bootstrap, without a password.
2. Apply the reviewed Prisma security migration.
3. Provision/rotate a separate LOGIN credential privately, outside Git.
4. Grant only aktau_api_reader membership with explicit ADMIN FALSE, INHERIT TRUE,
   SET FALSE; ensure no ownership/privileged parent membership/BYPASSRLS.
5. Verify catalog/ACLs, counts and live least-privilege repository/NestJS parity.

Production steps require separate external review and explicit owner approval.
Ingestion and migration credentials remain separate from this runtime reader.

## Database CONNECT and rollback baseline

Fresh live read-only database ACL inspection confirmed PUBLIC CONNECT and
TEMPORARY (not grantable). Current inspection identity has CONNECT. The future
restricted login obtains CONNECT from the **existing database-level PUBLIC ACL**,
not from an owner/service_role membership. Bootstrap/migration do not grant or
change database CONNECT. If this precondition changes, STOP for separately
reviewed CONNECT scope; do not silently add a grant. PUBLIC TEMPORARY does not
authorize persistent public-schema DDL; it is existing baseline, not a new grant.

Local clean and restored clusters reproduced the audited managed table/schema/
database ACLs because --no-acl dumps omit them. A brand-new restricted login
connected with only reader membership, with no direct database grant to either
login or group. Managed roles were simulated as non-login roles, not production
credentials. No managed ACL was revoked as part of reader forward/rollback.

The exact rollback target is the existing live security state, **not** the init
migration's RLS-disabled state: seven RLS enabled, FORCE false, no policies,
reader group absent, data/counts and existing ACLs unchanged. The rollback checks
safe role flags, no parent-role membership/ownership, no remaining runtime/unknown
members (only the exact permitted operator-admin anchor may remain),
RLS7/FORCE0, exact five SELECT/reader-only/USING(true)/no-WITH-CHECK policies and
exact reader SELECT5 + schema USAGE with no grant option/extra reader privileges.
It also rejects column/function/type/default/database ACLs granted to the reader.
Any mismatch aborts its transaction before drops/revokes. Remaining cross-database
role dependencies make DROP ROLE fail and roll back the transaction too.
Table locks and bounded lock/statement timeouts keep the rollback finite; do not
remove guards or suppress errors. Existing unrelated ACLs are never revoked.
Before executing, the operator must compare the full managed ACL matrix with the
captured baseline; any unrelated drift requires review, not blind rollback.

Local automated proof uses a dedicated /part04_security DB in two isolated PG17
clusters (clean init+INSERT fixture, and restored production dump). It rejects
non-loopback primary/fallback hosts and effective pgx target overrides. Baseline
snapshots compare seven counts, RLS/ownership/policies, and normalized full table,
schema and database ACL entries including grantors. Both cycles passed forward
→ explicit LOGIN removal → guarded rollback → exact baseline → forward access
again → second rollback to baseline. No RLS disable is used by rollback.
The final fresh-install proof starts with the init migration's actual RLS0;
rollback intentionally preserves the resulting RLS7 production security baseline.
Only that reviewed RLS0→RLS7 flag transition is normalized in the expected
rollback snapshot; no ACL/count/ownership/policy difference is ignored.

Forward role checks inspect direct ACLs on databases (cluster-wide), schemas,
relations, columns, routines, types and default ACLs (current DB); both recipient
and grantor are checked, as is default-ACL ownership. PUBLIC-only privileges do
not count as direct reader ACL. Unexpected group members, even NOLOGIN children,
are rejected before policy activation. Routine/type ownership is rejected too.
Baseline validation concerns only the exact seven target tables; unrelated
public-table policies are not a forward prerequisite. Existing reader ACLs or
memberships other than the exact permitted operator-admin anchor mean STOP, not
automatic revokes or a permissive bootstrap.

## Reviewed creator-admin anchor — LOCAL remediation proof only

PostgreSQL17 automatically grants a new role back to a non-superuser CREATEROLE
creator through the bootstrap superuser: ADMIN true, INHERIT false, SET false.
This is an intentional administrative relationship, not unexpected platform drift.
[PostgreSQL17 role attributes](https://www.postgresql.org/docs/17/role-attributes.html).
The old superuser-only proof missed it; the stopped production bootstrap history
is preserved below and in the same Part04 report.

Bootstrap, independently the pending migration guard, and rollback after runtime
removal now require exactly one of the following, evaluated against current_user:

- Case A: current operator is superuser and reader has zero child memberships.
- Case B: current operator is NON-superuser with CREATEROLE; reader has EXACTLY one
  child, member=current_user, ADMIN true / INHERIT false / SET false, with a grantor
  whose catalog rolsuper is true. No hard-coded operator/grantor name is used.

Both cases forbid reader parent memberships, unsafe flags, ownership and unexpected
direct/default ACLs. A different operator, extra LOGIN/NOLOGIN child, missing or
malformed anchor, non-superuser grantor, or premature runtime member is rejected
with P0001. Bootstrap never revokes/grants membership to repair drift; creation
and resulting-state validation are atomic. Local creation with unsafe opt-in
createrole_self_grant settings is rejected without leaving a reader behind.

For the exact non-superuser anchor, MEMBER=true but USAGE=false and SET=false;
SET ROLE reader fails42501 locally. ADMIN TRUE is NOT an authorization boundary:
it allows role administration/new membership grants. The production operator
already owns app tables and separately has administrative/BYPASSRLS authority;
it must never be advertised as the least-privilege runtime.

Future runtime membership must be explicit PostgreSQL17 semantics:

```sql
GRANT aktau_api_reader TO aktau_api_runtime
WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
```

Runtime MEMBER/USAGE=true, SET/ADMIN=false, exactly this parent, safe LOGIN flags,
no ownership/direct grants. A non-superuser creator may also receive a separate
admin-only anchor on the newly-created LOGIN itself; that is a child relationship,
not the runtime inheriting an operator role. DROP removes those automatic anchors.
After inventory/draining, remove ONLY the known runtime LOGIN; do not manually
remove the reader's exact operator anchor. Guarded rollback drops the reader and
its automatic anchor, preserving RLS7/FORCE0 and managed ACL/count baseline.
Unknown member/dependency still means STOP.

Local clean init/fixture and restored clone both passed non-superuser operator
forward→rollback→forward→rollback, exact snapshots and negative matrix. The stopped
production-state rehearsal reverified an existing anchored reader without mutation,
Prisma deployed ONLY pending RLS, restricted Go↔Nest exact parity passed for all849
products in3 sorts/categories/filters/detail/search, and operator rollback passed.
This is LOCAL proof, not production apply permission; original superuser Case A
and existing fixture/unsafe-flag regressions remain separately verified.

## Future Phase B runbook — NOT EXECUTED / separate approval required

The following is an operator sequence for later explicit production approval,
not permission to execute it now. Security metadata rollout is independent of
Part 05 HTTP implementation/cutover; Go is not the public traffic owner.

**Immutable production-apply prerequisite:** all externally reviewed Part04
source/security artifacts MUST first be committed and pushed to
integrate/full-stack. Production apply must reference that exact reviewed commit
SHA. Do not apply security artifacts from an uncommitted working tree. External
review must authorize commit/push first; neither is performed by Phase A.

PRE:

1. Fetch; check integrate/full-stack, clean working tree and HEAD=origin equal
   to the exact reviewed/pushed Part04 SHA. STOP if any artifact is uncommitted
   or differs from that immutable reviewed source.
2. Take fresh private public schema/custom backup outside repo (0700/0600).
3. Restore into a new disposable PG17 cluster with exit-on-error; compare all
   seven counts and semantic relations. STOP on restore/count failure.
4. READ ONLY re-audit the current stopped state: RLS7/FORCE0/policies0, safe existing
   reader with the exact current-operator admin anchor, runtime absent, ownership, full
   table/schema/database ACL matrix and PUBLIC CONNECT. Save private baseline.
   STOP on any change from the reviewed state; no opportunistic grants/revokes.
5. Prepare the exact reviewed rollback path above and test it on that clone.
   Check pending Prisma migrations: only the reviewed security migration may
   be applied; unexpected pending migrations require STOP.
6. Generate the future runtime LOGIN password privately, outside source/history/
   command logs; provision no credential in this repository or report.

FORWARD (only after explicit owner authorization):

7. Execute `backend/prisma/security/aktau_api_reader_role.sql`; fail closed.
   Before activation, group must have no parent membership, ownership or direct/
   default ACL. Child memberships must satisfy EXACT Case A/B above. An existing
   valid reader is verification-only; never run this as an activated-role check.
8. Apply exactly `20261004000000_rls_runtime_access` through the separately
   reviewed Prisma/operator deployment procedure, not Go runtime startup.
   All seven tables must be ordinary, FORCE0/policies0, and uniformly RLS0 or
   RLS7. Lock/statement timeout is a failed transaction: STOP, never retry blindly.
9. Privately create the restricted LOGIN: INHERIT, non-owner, no superuser/
   create-role/create-DB/replication/BYPASSRLS privileges.
10. Grant only aktau_api_reader membership WITH ADMIN FALSE, INHERIT TRUE, SET FALSE.
    Verify MEMBER/USAGE=true, SET/ADMIN=false and no other runtime parent role.
    No additional database CONNECT grant is needed.
11. Verify identity/flags/membership, SELECT5/raw+mapping denial, RLS7/FORCE0/
    exact policies5, reader ACLs, unchanged managed ACLs and all seven counts.

LIVE VERIFY (restricted credential, no mutation):

12. Run explicit SELECT-only Go repository smoke under the restricted LOGIN;
    read-only pool/session defaults and bounded statement timeout remain required.
13. Run NestJS ↔ Go paginated price_asc/price_desc/name_asc and search/filter/
    detail parity; reference must use an approved connection, never claim owner
    access as restricted Go proof.
14. Check health/readiness with restricted connectivity; no business HTTP rollout.
15. Confirm no application writes and recompare counts/security/managed ACLs.

ROLLBACK TRIGGERS:

- Policy/ACL mismatch or unexpected authorization behavior.
- Restricted repository failure.
- NestJS/Go parity failure caused by the DB security change.

ROLLBACK (operator-only, exact reviewed artifact):

16. Stop/drain restricted clients. Explicitly revoke reader membership from and
    remove the known runtime LOGIN. Inventory all members first: only known runtime
    and the exact current-operator admin anchor are allowed; unknown members or
    ownership/dependencies require STOP. Never DROP an unknown role or manually
    revoke the operator anchor; the guarded reader DROP removes it.
17. Compare managed ACLs with the captured baseline, then execute
    `backend/prisma/security/rollback_aktau_api_reader_access.sql` with
    ON_ERROR_STOP/exit-on-error. Any guard/dependency error means STOP, not a
    partial rollback or guard removal. Keep deployment metadata consistent using
    a separately reviewed Prisma recovery procedure; this artifact does not
    rewrite `_prisma_migrations` or authorize replaying unrelated migrations.
18. READ ONLY verify RLS7/FORCE0/policies0, reader absent, seven counts and full
    managed table/schema/database ACL baseline unchanged. Retain private evidence.

No step above was applied to Supabase in Phase A. Phase B and live least-privilege
parity remain blocked pending explicit approval; no Part 05 work is authorized.

## Prisma baseline reconciliation — locally proven, production NOT applied

Current immutable implementation SHA:
`60c5e40c2dcca4866478f7fe7b4501f4b080726f`. The Phase B PRE audit found
production has the existing application schema/data but no `_prisma_migrations`
relation. Prisma5.22.0 reports BOTH init and security migrations pending.
Do not run deploy in this state: it would include init, not only the approved
security migration. Do not manually create/edit migration records.

The current complete READ-ONLY aclexplode snapshot, not an inferred historical
information_schema projection, is now the canonical security baseline. It
includes MAINTAIN, explicit grantability and grantors. Current managed table ACL
contains eight privileges per table for anon/authenticated/postgres/service_role,
all explicitly non-grantable, grantor postgres. Table ownership still supplies
owner authority; information_schema's owner grantability is not the stored ACL.
Schema/database ACLs and relevant role attributes/memberships are also captured.
Canonical metadata and fresh public dumps are private outside repo (0700/0600).
No historical MAINTAIN values were guessed and no managed grant was revoked.

Fresh PG17 clone restore exited0, seven counts matched live, and the init-only
reference matched 3 enums, 7 tables, 48 columns, 15 constraints/8 FKs and21 indexes
including FK actions/defaults/nullability. Only allowed security difference:
clone RLS7/FORCE0/policies0 vs init RLS0/FORCE0/policies0.
Init file SHA-256:
`a5515ab64d6f8307df96971eb9ee1f7f41d6873e877d591167bde6450e881a92`.

On the LOCAL clone only, Prisma `migrate resolve --applied 20260923000000_init`
exited0, created exactly one successful record and left application structure,
counts, RLS/policies/ownership/full managed ACL unchanged. Observed Prisma
checksum equals that file SHA-256; no checksum algorithm was assumed.
Status then showed only the RLS migration pending. Exact reviewed bootstrap and
Prisma deploy applied only RLS, exited0, and produced two successful records.
Restricted local group-only login passed repository/NestJS parity for all849 IDs
in each sort, categories/filters/detail and wildcard/backslash search; raw/mapping
denied. Current complete managed ACLs including grantors/MAINTAIN were reproduced
locally before resolve because --no-acl dumps omit them, then verified unchanged
except the reviewed reader additions. Local disposable resources were removed.

### Proposed future production baseline gate — DO NOT EXECUTE yet

This sequence is a proposal for separately reviewed owner approval, **not** a
production action authorized by the local proof:

1. Recheck immutable reviewed SHA/source, fresh private public backup and restore
   PASS with seven-count equality.
2. Capture final READ-ONLY canonical complete ACL/RLS/role/count baseline; require
   RLS7/FORCE0/policies0, reader/runtime absent, existing PUBLIC CONNECT.
3. Verify production `_prisma_migrations` absent and BOTH expected migrations
   pending; STOP on any failed/rolled-back/unexpected migration or state change.
4. Reconfirm production application structure equals checked-in init except the
   reviewed existing RLS state; STOP on any other application drift.
5. **Only under separate explicit approval**, execute production Prisma5.22.0
   `migrate resolve --applied 20260923000000_init`. This is a production metadata
   write, not read-only verification. No manual history SQL or init replay.
6. Verify exactly init successfully recorded, observed checksum/file evidence,
   only RLS pending, and application structure/count/security/managed ACL baseline
   unchanged. STOP on any mismatch; no blind retry or metadata cleanup.
7. Only then resume the previously reviewed Phase B PRE/bootstrap/security-deploy/
   restricted LOGIN/live-verification flow with its own exact artifact hashes and
   backup/rollback gates. Do not deploy Go or start Part05 automatically.

If security migration is recorded applied and an emergency guarded rollback is
later needed, do not modify/delete `_prisma_migrations`, replay the migration or
mark it resolved ad hoc. Stop for separately reviewed history reconciliation.

The local proof above did NOT change production. Subsequently, under the separate
`PRODUCTION_PART_04_PROD_PRISMA_BASELINE_APPLY.md` authorization from immutable
commit `4a46fbb0ba9a11cf70212027bc766deb41fa1269`, production baseline ONLY was
applied after a new private backup/restore and final read-only PRE checks.
Prisma5.22.0 `migrate resolve --applied 20260923000000_init` exited0. Exactly init
is now recorded successfully, checksum equals the init SHA-256 above, steps0,
finished_at non-null/rolled_back_at null. Only the RLS migration remains pending.
All app structure/counts/ownership/RLS7/FORCE0/policies0/full managed ACLs/role
state remain equal to PRE. Reader/runtime roles remain absent. No deploy or
security SQL was executed, no application data was changed.

The preceding approval blocker was superseded by owner authorization for the
final Phase B continuation from immutable commit
`ae9465a41d2dc95e44bee9890176bac5ded6b1f6`. Fresh public backup/PG17 restore,
seven-count/application-structure equality and the exact init-only Prisma history
were verified again. Exact reader bootstrap executed once, SQL exit0; immediate
pristine-group verification failed. The non-superuser CREATEROLE operator received
automatic membership: role aktau_api_reader, member postgres, grantor supabase_admin,
ADMIN true / INHERIT false / SET false. This is documented
[PostgreSQL17 behavior](https://www.postgresql.org/docs/17/role-attributes.html)
and conflicts with the reviewed zero-child-members guards.

That conflict is now remediated in locally proven source/tests, NOT by a production
mutation. Current overall blocker:
`AWAITING_EXPLICIT_PRODUCTION_RLS_RESUME_APPROVAL_AFTER_OPERATOR_MEMBERSHIP_REVIEW`.
Reader remains safe NOLOGIN with no ownership/direct/default ACLs and its exact
automatic operator anchor; it matches the new proposed Case B. No production
membership cleanup was attempted. The corrected pending migration/bootstrap/
rollback artifacts require NEW external review/immutable SHA/hash approval before
any production resume; the old Phase B reviewed hashes no longer describe source.
RLS migration remains the ONLY pending migration; runtime LOGIN/secret absent.
Final RLS7/FORCE0/policies0, managed ACLs/PUBLIC CONNECT, ownership/structure and
seven counts remain unchanged. No deploy or rollback ran: rollback requires the
applied rollout state and must not be used for this bootstrap-only outcome.
Do not repeat baseline/bootstrap/deploy or edit history automatically. Resume only
after separately reviewed bootstrap/operator-membership remediation/runbook approval.
The same Part04 report contains exact observed evidence. Live restricted parity
remains NOT RUN; NestJS is traffic owner.

## Repository implementation (HTTP still unwired)

`internal/catalog` contains domain models and category/product interfaces.
`internal/postgres` implements ListCategories/GetFilterSchema/ListProducts/
GetProductByID. No handlers/routes or Go migrations were added.

Products use two bounded queries (page and all page offers); filter validation
adds at most two discovery queries. Category/search/dynamic filters/order/page,
MIN usable price/MAX snapshot and offer sorting are SQL-side. Offers require
inStock=true and price>0. Snapshot timestamp-without-time-zone uses explicit UTC.
Brand reads canonical_products.brand; other dynamic values read JSONB attributes.
Primitive JSON types are preserved. Same-key OR and cross-key AND are explicit.
SQL identifiers are static; keys, JSON values, category, search, id and pagination
are bound parameters. Sort uses only internal enum-selected static fragments.

`OpenReadOnly` retains best-effort startup RuntimeParams, but those parameters
alone are NOT effective-session proof. Before source changes, the existing
restricted production credential was safely classified as **SUPAVISOR_SESSION**;
startup diagnostics returned default/transaction read-only **off** and timeout
**2min**, while explicit session SET worked. Classification used the actual
private configuration, without target overrides, and the official
[Supabase connection-mode documentation](https://supabase.com/docs/guides/database/connecting-to-postgres).
No endpoint, project reference or credential is recorded here.

Local remediation registers pgxpool `AfterConnect`: fixed SETs enforce
default_transaction_read_only=on and statement_timeout=5000, then both SHOWs must
confirm on/5s-equivalent before a physical connection can enter the usable pool.
Initialization shares a bounded 2s child context; SET/SHOW/mismatch failures return
only a sanitized error and pgxpool closes the rejected connection. Lazy
max4/min0/connect-timeout2s behavior is retained. The connected local proof holds
four distinct physical sessions, including startup parameters omitted against
local role defaults off/2min, and verifies ordinary transactions inherit read-only.

Role/ACL/RLS least privilege remains primary authorization, not replaced by
session defaults that privileged users can override. Transaction-pooler or unknown
mode is a STOP condition, not silently considered session-compatible. No modified
Go code has run against production: live restricted session-policy/parity
validation still needs external review, an immutable commit and separate owner
authorization. Part04 is incomplete; NestJS remains traffic owner.

## Collation and query plans

Existing `ru-x-icu` is present live and on the local clone. SELECT ordering matched
Node `localeCompare('ru')` exactly for all 849 usable product IDs in both databases.
No collation was created. Live least-privilege HTTP/Go repository parity remains
pending Phase B; local clone parity is recorded in the current Part 04 report.

The original plan precondition failure is preserved in the report. After LOCAL
security apply, ANALYZE + restricted-role EXPLAIN ANALYZE covered default/category/
search/filter/descending/name/detail/discovery/offers. Existing PK/category/offer
indexes were sufficient; SELECT plans completed in milliseconds under the 5s
timeout. Bounded product/offer roundtrips and SQL LIMIT verified; no raw/mapping
scan or Cartesian explosion. Small-table sequential scans are expected, not a
reason for speculative indexing. No pg_trgm/GIN/composite index/extension/collation
was added. No production EXPLAIN ANALYZE ran. Safe plan measurements are in report.

## Rollout boundary

Phase A local security proof is for owner/external review. Final Phase B had
explicit production authorization but stopped at the bootstrap membership gate.
Overall Part 04 remains BLOCKED pending external acceptance of the local
remediation and explicit production resume/security deploy/least-privilege live
parity. This task performed production READ-ONLY audits only. Protected
NestJS/Next/frozen contracts remain unchanged. Public `/api/categories` stays
unwired in Go; no Part 05 work or traffic cutover is authorized.
