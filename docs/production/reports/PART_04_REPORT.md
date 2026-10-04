# Production Part 04 — PostgreSQL production layer

Status: **BLOCKED**

Current continuation: **Go read-only pool session-policy remediation — local proof**.
Current blocker: `AWAITING_EXTERNAL_REVIEW_AND_IMMUTABLE_COMMIT_FOR_LIVE_POOL_VALIDATION`.
Pre-change restricted connection mode: SUPAVISOR_SESSION; startup-policy failure
reproduced safely. Minimal physical-connection initialization and all required
LOCAL proofs/quality gates PASS. Production security metadata remains applied and
unchanged. Modified Go source has NOT run against production, so live policy and
repository parity acceptance remain pending; Part04 is NOT DONE. See the final
remediation section. All previous blockers, local proofs and stopped runs remain
historical evidence below, including LIVE_GO_READ_ONLY_POOL_SESSION_POLICY_FAILED.
Sections A–T preserve the initial stopped run; current Phase A evidence follows
in “External-review approved RLS design — Phase A”; those historical sections
predate the production baseline and the final bootstrap attempt.

## A. Goal/scope

Read-only internal Go catalog repositories without public HTTP business endpoints.
Stopped on material live/migration RLS drift; implementation is partial, not accepted.

## B. Baseline

- Branch: integrate/full-stack. Fetch --prune completed; initial working tree clean.
- HEAD = origin/integrate/full-stack: `fa985f3312802995ff3bf6dfec31a180727f3c0e`.
- Root AGENTS.md was production-version: Part 00–03 DONE, Part 04 CURRENT.
- Go: go1.27.1 linux/amd64. PostgreSQL client tools: 17.10.
- Docker client/server: 29.1.3. Live PostgreSQL: 17.6; local postgres:17-alpine: 17.11.

## C. Live read-only inspection

Application tables are in public; no required application table outside public
was detected. Live catalog/count/dump sessions used
default_transaction_read_only=on and statement_timeout=5000. No production writes.

| Table | Live before/after dump | Restored clone |
| --- | ---: | ---: |
| stores | 3 | 3 |
| store_locations | 15 | 15 |
| categories | 6 | 6 |
| raw_products | 863 | 863 |
| canonical_products | 849 | 849 |
| product_mappings | 863 | 863 |
| offers | 863 | 863 |

## D. Local production clone

Fresh app-public-schema.sql and app-public.dump retained privately under
`/home/denis/.local/share/aktau-market/backups/part04/<timestamp>/`, outside repo.
Directory 0700, backup files 0600. No full Supabase disaster-recovery claim.

Final restore used --no-owner --no-acl --exit-on-error: exit 0. Seven counts equal.
The initial launcher invocation omitted pg_restore --dbname; corrected before
restore. A subsequent attempt stopped on CREATE SCHEMA public in the empty clone;
only the verified-empty disposable public schema was dropped, then restore passed.
No errors were ignored or --exit-on-error removed. Local ANALYZE completed.
A separate local reference DB used the existing checked-in migration.

## E. Schema parity — STOP finding

Initial catalog audit matched 3 enums, 7 tables, 48 columns, 15 PK/FK constraints
and 21 indexes; nullability/defaults/unique/cascade rules matched. However that
first audit did not include RLS and was therefore **not a complete schema PASS**.

Subsequent read-only security catalog checks proved the exact material drift:

| Tables | Live + restored clone | Existing migration reference |
| --- | --- | --- |
| stores, store_locations, categories, raw_products, canonical_products, product_mappings, offers | RLS enabled, FORCE RLS false; zero policies | RLS disabled, FORCE RLS false; zero policies |

Restricted clone role's SELECT categories returned **0**, while admin returned
**6**. This impacts the target non-owner runtime role, not cosmetic metadata.
Part 04 stop condition 1 applies. No RLS workaround, production policy/grant or
schema change was attempted. External review must resolve representation of
existing RLS and approved API SELECT policy/access design before continuation.

## F. Access model

Design in POSTGRES_LAYER.md: API SELECT-only five runtime tables; no raw/mappings;
separate future ingestion and migration roles. Local-only part04_api is non-owner,
non-superuser, no role/database creation, five SELECT grants.

Fixture schema: SELECT/repositories PASS; raw/mapping SELECT denied; direct role
DML/DDL denied independently of pool defaults. Restored clone: grants allow the
statement, but RLS returns zero rows — access-model gate FAIL.

## G. Go repository architecture

Partial internal/catalog models/interfaces and internal/postgres category/product
repositories. No Go migration history; INSERT-only deterministic fixture.
No public HTTP wiring or dashboard/voice/ingestion work.

## H. Query semantics

SQL-side category/search/filter/sort/page, MIN usable price, MAX usable UTC snapshot,
offers price ASC. Brand special case; JSON primitive types retained; same-key OR,
cross-key AND. Usable offers: inStock and price>0. Two product queries independent
of page size; schema validation adds at most two bounded queries.

Current data collation check: existing ru-x-icu matches Node Russian localeCompare
exactly for all 849 usable product IDs on live/local. Final HTTP parity NOT RUN.
Reference `%`/`_` search behavior comparison remains NOT RUN; no parity claim.

## I. SQL safety

Values/JSON keys remain parameters; sort chooses static enum fragments. Local
fixture injection search/key/id/sort tests PASS. Unknown filters/typed options
rejected. Pool forces transaction read-only and 5s statement timeout. Local admin
write through API pool rejected. Session settings are not a privilege substitute.

## J. Deterministic integration tests

Explicit TEST_DATABASE_URL only, never runtime DATABASE_URL/.env fallback.
Loopback guard checks URL and pgx effective host; dedicated part04_fixture DB.
Existing Prisma migration + INSERT-only fixture; local cleanup only.

TestDestructiveTargetGuard PASS. TestDeterministicCatalog PASS with 17 subtests:
categories/filter discovery, category/search, three sorts, page, OR/AND, brand,
numeric vs string, boolean, offer/snapshot/detail/null, not-found, injections,
roundtrip bound, restricted role and read-only pool. Repeated fixture run PASS.

## K. Production-clone smoke

**FAIL**: TestProductionClone category precondition (restricted role sees 0 vs 6).
This failure was investigated, not suppressed. RLS drift then triggered STOP.

## L. Live read-only parity

NOT RUN: local clone mandatory gate failed. No NestJS process was started and no
voice/Gemini/Redis calls were made. No live repository parity is claimed.

## M. EXPLAIN results

Local ANALYZE PASS. TestLocalClonePlans **FAIL** at data-input precondition due to
RLS-hidden rows; no representative EXPLAIN ANALYZE result recorded.
Production EXPLAIN/EXPLAIN ANALYZE NOT RUN. No index/extension added or justified.

## N. Go/security quality gates

| Check actually executed | Result |
| --- | --- |
| gofmt -w cmd internal tests | PASS |
| go test ./... (before final tagged clone/plan additions) | PASS |
| explicit go test -tags=integration ./... -v | FAIL: clone smoke + plan input gate; other executed unit/fixture tests PASS; live profile SKIP |
| final gofmt empty check, tidy/verify, race, vet, staticcheck, govulncheck | NOT RUN after STOP |
| Part 03 Docker DB up/down/recovery regression | NOT RUN after STOP |
| contracts lint | NOT RUN after STOP |

No final full-Go/security acceptance is claimed; Part 03 historic PASS results are
not substituted for Part 04 gates. Dependencies were not changed.

## O. DB safety

**Supabase READ ONLY. No production DDL/DML/role/grant/index/extension/policy change.**
Backups and introspection only; production credentials never printed. Local
transient role/fixture DB/reference DB/restore/ANALYZE were disposable-only.
Part04-owned PostgreSQL container/volume removed after inspection; private backups
retained outside repo. No seed/parser/import or production EXPLAIN ANALYZE.

## P. Contract protection

`git diff --name-only HEAD -- backend frontend contracts docs/production/API_V1_CONTRACT.md`
was empty. Frozen contracts and traffic owner unchanged. Go catalog routes remain
unwired; runtime JSON 404 behavior was not modified, but final Docker proof NOT RUN.

## Q. Changed files

- backend-go/cmd/api/main.go; internal/postgres/pool.go + pool_test.go.
- New internal/catalog/models.go; postgres/categories.go, products.go,
  repository.go, repository_test.go, plans_test.go.
- New tests/fixtures/catalog.sql, tests/integration/catalog_test.go, smoke_test.go.
- backend-go/README.md; docs/production/POSTGRES_LAYER.md; this report.
- scripts/create-clean-archive.mjs: permanent production-part-04 target and
  application schema-dump name exclusions.

## R. Remaining limitations

RLS history/access policy drift is the blocker. No live parity, plan review or
final quality/Docker acceptance yet. Partial repositories must not be deployed.
Do not disable RLS, grant BYPASSRLS or change Supabase without separate reviewed
local proof and explicit owner approval. Part 05 is not started.

## S. Integration impact

No frontend/NestJS/API contract change. Go readiness pool now explicitly read-only;
unwired repositories remain unaccepted. No production data/schema/roles changed.

## T. Status and archive

**BLOCKED — external review required for RLS drift.**

Review archive: artifacts/production-part-04-review.tar.gz, permanent target
production-part-04. Archive contains the partial source/report, not completed
acceptance evidence. Verification **PASS**: 300 archived files byte-match current
source (including this report); required sources present; no real .env, known
credentials/private-key patterns, dumps/backups, node_modules, build/test outputs,
Go binaries/profiles or temporary workspaces. `git diff --check` PASS. Protected
source diff empty. No commit, push or deploy.

## External-review approved RLS design — Phase A

### Preflight and authority

Fetched/pruned origin again. Branch integrate/full-stack; HEAD and origin still
`fa985f3312802995ff3bf6dfec31a180727f3c0e`. Working tree contained only known
uncommitted Part 04 work. Go/PG client/Docker versions match section B. The owner
approved this exact local-only design; it does **not** authorize production apply.

### Live read-only role/ACL audit

Identity: current_user=session_user=postgres, active role=none. All seven app
tables remain owned by postgres, RLS enabled, FORCE RLS false, policies=0.
Current postgres is not superuser, but has BYPASSRLS **and** table ownership:
either explains current visibility without SELECT policies. It also inherits
service_role/pg_read_all_data among audited memberships; future Go login must
not inherit these privileges. This is evidence, not a guessed RLS mechanism.
The historical administrative origin of ENABLE RLS is not recoverable from these
catalogs; its absence from the initialization migration is the proven drift.

| Existing role | Superuser | Create role/DB | Login | Inherit | BYPASSRLS |
| --- | --- | --- | --- | --- | --- |
| anon | false | false/false | false | true | false |
| authenticated | false | false/false | false | true | false |
| authenticator | false | false/false | true | false | false |
| postgres | false | true/true | true | true | true |
| service_role | false | false/false | false | true | true |
| supabase_admin | true | true/true | true | true | true |

aktau_api_reader is absent on live. No absent role was assumed to exist.
Existing anon/authenticated/service_role have SELECT, INSERT, UPDATE, DELETE,
TRUNCATE, REFERENCES, TRIGGER on all seven tables, not grantable. postgres has
the same grantable privileges. These managed grants are preserved; no unrelated
revoke is necessary for the approved reader design. Policies/group membership
are not given to anon/authenticated. No PUBLIC table grant was found.

Schema ACL used pg_namespace/aclexplode: PUBLIC, anon, authenticated, postgres,
service_role have USAGE; pg_database_owner has USAGE+CREATE. No PUBLIC CREATE.
The restricted login is neither DB owner nor member of pg_database_owner.

Inspection found PGOPTIONS alone did not persist the intended controls (off/2min).
Corrected audit batches explicitly SET default_transaction_read_only=on and
statement_timeout=5000, BEGIN READ ONLY, SET LOCAL timeout=5000, catalog SELECT,
COMMIT. Inspected controls confirmed defaults=on, transaction=on, timeout=5s.
Only connection-local SETs/read-only transactions were used; no DB objects/data
or roles/grants/policies were changed. The initial PGOPTIONS-only checks were
SELECT-only too, but are not represented as enforcement proof.

Final live sanity again confirmed 0 policies, reader role absent, RLS7/FORCE0
and unchanged counts: stores3/locations15/categories6/raw863/canonical849/
mappings863/offers863. Production repositories were not run with owner credentials.

### Security artifacts and approved scope

New operator/bootstrap:
`backend/prisma/security/aktau_api_reader_role.sql`.
It creates/verifies only aktau_api_reader: NOLOGIN, NOSUPERUSER, NOCREATEDB,
NOCREATEROLE, NOREPLICATION, NOBYPASSRLS, INHERIT; no password. Existing unsafe
attributes, inherited role membership or object ownership are rejected.

Exactly one new Prisma migration:
`backend/prisma/migrations/20261004000000_rls_runtime_access/migration.sql`.
Initialization migration/schema/models remain unchanged. Security-only contents:
RLS enabled on all seven; schema USAGE + SELECT on only the five runtime tables;
five policies `aktau_api_reader_select`, FOR SELECT TO aktau_api_reader USING(true).
No FORCE/DISABLE, PUBLIC/ALL/WITH CHECK policy, raw/mapping grant, BYPASSRLS,
sequence privilege, role creation, revoke, data change or index/extension change.
Migration transaction/guard require the pre-provisioned safe group.

Future deployment ordering (none executed on Supabase): operator group bootstrap
→ reviewed Prisma security migration → private separate LOGIN provisioning/rotation
→ only group membership → least-privilege live verification. Cluster-global role
is intentionally not created inside Prisma's per-database migration history.
Production steps await separate explicit owner approval after external review.

### Clean local reconstruction and restored clone

Reused the prior fresh private public dump, never copied into repo. Restored anew
into owned postgres:17-alpine disposable container/volume, localhost port15432;
restore exit0 and seven counts matched the new live audit. Initial pg_isready
observed a temporary initialization server; launcher corrected readiness to TCP
before restore. No restore errors were suppressed.

Baseline clone reproduced the finding: RLS7, policies0; restricted non-member
probe with five SELECT grants saw categories0. Then group bootstrap provisioned
only the stable group. A clean part04_fixture DB used bootstrap → existing init
→ new security migration → INSERT-only fixtures. Target metadata and 18 fixture
subtests PASS. Seven negative bootstrap tests (LOGIN/BYPASSRLS/CREATEROLE/
CREATEDB/SUPERUSER/REPLICATION/NOINHERIT) fail safely with P0001 and rollback.

The reviewed migration was then applied **only to restored local clone**. Random
disposable part04_api_login is non-superuser, non-owner, INHERIT, no DB/role
creation/replication/BYPASSRLS, and belongs only to aktau_api_reader. No use of
service_role/postgres credentials for repository verification.

| Table | Login SELECT/grant | SELECT policy | Visible clone rows |
| --- | --- | --- | ---: |
| stores | allowed | reader only | 3 |
| store_locations | allowed | reader only | 15 |
| categories | allowed | reader only | 6 |
| canonical_products | allowed | reader only | 849 |
| offers | allowed | reader only | 863 |
| raw_products | denied, no grant | none | SQLSTATE 42501 |
| product_mappings | denied, no grant | none | SQLSTATE 42501 |

All seven RLS enabled, FORCE false; exactly five policies; no ownership bypass.
current_user=part04_api_login; reader membership=true; other memberships=0.
Direct INSERT/UPDATE/DELETE/CREATE TABLE/ALTER TABLE failed with SQLSTATE42501,
independent of read-only pool settings. An admin credential through OpenReadOnly
failed UPDATE with SQLSTATE25006. Non-member probe still sees categories0 after
apply: no PUBLIC policy leak. No row_security=off or RLS disable used.
All seven admin counts stayed unchanged after local security apply.

### Clone repositories, search and Russian ordering

ListCategories/GetFilterSchema/ListProducts/GetProductByID PASS through the
restricted login. No raw/mapping dependency; page≤100, typed options/scalars,
usable offers/minPrice/UTC snapshots/detail/filter invariants and bounded
roundtrips PASS. Local NestJS reference also used this restricted clone login.
All current 849 IDs and product semantics matched exactly through limit100 pages
for price_asc, price_desc, name_asc. Filters/categories/detail also matched.
Existing ru-x-icu reproduces reference Russian ordering; no collation creation.

| Search input | Local Prisma/NestJS and Go matching count | Exact paginated parity |
| --- | ---: | --- |
| МОЛОКО | 44 | PASS |
| `%` | 849 | PASS |
| `_` | 849 | PASS |
| single backslash | 4 | PASS |
| `Молок%` | 44 | PASS |
| `Молок_` | 44 | PASS |
| backslash + `%` | 168 | PASS |
| backslash + `_` | 0 | PASS |
| `literal%_` + backslash + `not-present` | 0 | PASS |
| SQL injection-shaped string | 0 | PASS |

Observed adapter semantics: unescaped %/_ are SQL wildcards; backslash acts as
LIKE escape. A lone backslash before the appended `%` matches names ending in a
literal percent, while backslash-percent followed by appended wildcard matches
names containing literal percent. No assumption, runtime search fix or contract
change was needed. User input remains parameterized.

First HTTP parity attempt failed transport because the /mnt/d NestJS reference
did not start in the launcher window, not because of a semantic/assertion mismatch.
An outside-repo native-WSL copy of current compiled runtime/dependencies was used;
copied pnpm symlinks were relocated to that workspace (not dependency changes).
Compiled runtime was byte-identical. After startup, full local HTTP parity PASS.
No .env copied/loaded; no production connection, Gemini/Redis/voice call involved.

### Local EXPLAIN review (restricted login)

Local admin ANALYZE only; EXPLAIN ANALYZE/BUFFERS/JSON SELECTs executed with
part04_api_login. Final plans use the exact repository static sort fragments.

| Query | Planning ms | Execution ms | Rows returned | Main work / existing indexes |
| --- | ---: | ---: | ---: | --- |
| default page | 0.687 | 3.218 | 24 | aggregate849, join863, top-N sort; canonical PK + offer canonical index |
| category page | 0.704 | 0.629 | 24 | category77 / usable join79; category + offer canonical indexes |
| search | 0.746 | 1.631 | 24 | name scan849, 44 matches / join47; offer canonical index |
| real dynamic filter | 0.684 | 1.394 | 3 | category77 → typed match3; category + offer canonical indexes |
| price_desc | 0.744 | 3.190 | 24 | aggregate849 / join863; PK + offer canonical index |
| name_asc | 0.642 | 3.500 | 24 | aggregate849 / join863, Russian sort; PK + offer canonical index |
| detail | 0.484 | 0.194 | 1 | PK lookup + offer canonical index |
| filter discovery | 0.503 | 0.328 | 4 distinct options | category77, scalar candidates40; category + offer canonical indexes |
| page offer fetch (one selected ID) | 0.223 | 0.069 | 1 | offer canonical index, stores seq scan3 |

SQL LIMIT present; product page bounded to two roundtrips (+two fixed discovery
queries if filtering), no app-side catalog scan/sort or application N+1. No raw/
mapping scan or Cartesian explosion. Small-category/store seq scans reasonable.
All statements completed well below5s; no index/extension proposal needed.
No production EXPLAIN ANALYZE or schema/index change.

### Go quality, integration and foundation regression

| Gate actually executed | Phase A final result |
| --- | --- |
| gofmt -w cmd internal tests; gofmt -l . empty | PASS |
| go mod tidy / go mod verify | PASS, no dependency changes |
| go test ./... | PASS |
| go test -race ./... | PASS |
| go vet ./... | PASS |
| pinned go tool staticcheck ./... | PASS |
| pinned go tool govulncheck ./... | PASS, “No vulnerabilities found”, exit0 |
| explicit go test -count=1 -tags=integration ./... -v | PASS: 29 top-level +112 nested PASS records, zero failures; live profile intentionally SKIP |
| contracts pnpm lint | PASS |
| Docker build + Part03 disposable smoke | PASS |

Docker: non-root UID10001, read-only+tmpfs, compiler absent, Docker health healthy;
DB up live200/ready200; DB down live200/ready503; recovery ready200 without API
restart. JSON categories404 and POST live405; clean SIGTERM exit0≤10s. Only owned
disposable smoke resources cleaned. Go HTTP business routes remain absent.
No selective package-only result substituted for full required suites.

### Protection, cleanup, archive and final status

Protected diff empty for frontend/**, contracts/**, API_V1_CONTRACT.md,
backend/src/**, schema.prisma, seed.ts and existing init migration. The **only**
new backend/** artifacts are the approved bootstrap + one security migration.
Go business logic did not change in Phase A; changes are integration harness,
security proof, exact-query plan harness and documentation. No Go migration copy.

Local reference process/native test workspace and PhaseA-owned Docker container/
volume removed after proof; original private backups retained outside repo.
Final live audit confirms unchanged security/count state and no group/policies
created. No production DDL/DML/roles/grants/policies/migration/index/extension,
no seed/parser/import, no commit/push/deploy. Live least-privilege repository/NestJS
parity is intentionally NOT RUN until separately approved Phase B.

The final test-only safety review also rejects non-local pgx fallback hosts (not
just the primary host); offline loopback-guard regression PASS, including a mixed
local/remote host-list URL. No network connection or fixture setup in that check.

Archive rebuilt by permanent production-part-04 target; includes new migration,
group bootstrap and current tests/report. Report byte-match, required files,
exclusions and credential scan verified before handoff: 303 files, including the
current report, byte-match current source. Native compiled reference comparison
also confirmed 49 files byte-identical before cleanup. No real env, dumps/backups,
passwords, volumes/native workspace, binaries/profiles/dependency/build/test output.

**Phase A local proof: READY FOR OWNER/EXTERNAL REVIEW.**

**Overall Part 04: BLOCKED — `AWAITING_EXPLICIT_PRODUCTION_RLS_APPLY_APPROVAL`.**
No other Phase A blocker remains. Production apply is a separate authorization;
do not proceed automatically to Phase B or Part 05.

## External review hardening before Phase B

### Preflight and scope

Fetch --prune executed. Branch integrate/full-stack; HEAD=origin remains
`fa985f3312802995ff3bf6dfec31a180727f3c0e`. Only known uncommitted Part 04 files
were present. This continuation does not authorize production apply. Original
RLS drift, initial failures and subsequent local Phase A proof above are retained.
No repository/runtime business behavior, protected source or dependency changed.

### Independent migration guard

The existing new security migration now independently requires safe reader role
flags, no membership in any parent role, no owned pg_class relation/schema in
the current DB and no owned database in the cluster. The guard precedes all
ALTER/GRANT/POLICY operations inside the migration transaction. Bootstrap remains
unchanged; migration does not rely on the operator remembering to run it.

Each isolated local path passed **11 negative migration cases**: parent-role
membership, table ownership, schema ownership, database ownership and seven
unsafe role attributes. Each returned SQLSTATE P0001; transaction rollback and
unchanged security/ACL/count snapshot were verified. No test was weakened.

### Live database CONNECT audit — READ ONLY

Read-only catalog/aclexplode audit, repeated at the end, confirmed:

| Grantee | Existing database privileges | Grantable |
| --- | --- | --- |
| PUBLIC | CONNECT, TEMPORARY | false |
| postgres | CONNECT, CREATE, TEMPORARY | false |
| dashboard_user | CONNECT, CREATE, TEMPORARY | false |
| supabase_etl_admin | CREATE | false |
| supabase_storage_admin | CREATE | false |

`has_database_privilege(current_user,current_database(),'CONNECT')` = true.
Database name/host/DSN/password were not printed. Default/transaction read-only
were on and statement timeout5s, explicitly enforced for each query batch.

**The future restricted LOGIN obtains CONNECT from existing database-level
PUBLIC ACL; this Phase does not change database CONNECT ACL.** No redundant
grant was added to bootstrap/migration. Local clean and clone paths reproduced
this ACL; a brand-new group-only LOGIN connected successfully with no direct
CONNECT grant to login or reader group. PUBLIC TEMPORARY is existing baseline,
not an added privilege; persistent-schema DDL remained denied.

### Guarded operator rollback

Added `backend/prisma/security/rollback_aktau_api_reader_access.sql`. It is NOT
a Prisma migration or automatic runtime action. In one transaction it checks
safe role flags, parent membership/ownership absence, no remaining group member,
RLS7/FORCE0, exact five SELECT/reader-only/USING(true)/no-WITH-CHECK policies,
SELECT5/schema USAGE with no extra reader/grant-option/column/function/type/
default/database ACL. Unexpected cross-DB role dependencies also abort DROP and
roll back the whole transaction. Bounded lock/statement timeouts are included.

Only after guards does it drop the five owned policies, revoke SELECT5/schema
USAGE and drop the group. It never disables RLS, changes FORCE, mutates data or
revokes managed ACLs. A remaining LOGIN causes explicit refusal: known clients
must be drained and the known LOGIN revoked/dropped by the operator first.
Full managed ACL comparison is also a mandatory pre-rollback runbook gate;
unrelated drift requires review rather than an indiscriminate rollback.

Each path passed **17 negative rollback cases**: remaining LOGIN, PUBLIC/false/
missing/extra raw policy, write/raw/grant-option/schema-CREATE/database ACL drift,
duplicate grantors masking a missing runtime-table grant, inherited role,
table/schema/database ownership, unsafe flag and FORCE drift.
Each failed closed with P0001 and preserved the pre-attempt snapshot.

### Local forward → rollback → forward proof

Two isolated postgres:17-alpine clusters, localhost-only ports, private random
disposable credentials and ownership-labelled resources were used. Separate
clusters avoid cross-database dependencies of the cluster-global group.

- Clean: existing checked-in init migration + INSERT-only deterministic fixture;
  local baseline RLS7 explicitly reproduced before capture.
- Clone: existing private public dump restored again with --no-owner/--no-acl/
  --exit-on-error, exit0; counts equal fresh live audit. No new production dump
  or production change was required.

Because --no-acl omits grants, audited managed table/schema/database grants were
reproduced **locally only before baseline capture**. Managed roles were simulated
as NOLOGIN/non-admin roles; no production credentials or managed memberships
were copied. Normalized ACL snapshots include all existing grantees, privileges,
grantability and grantors, plus ownership/policies/counts.

Each path executed the actual artifacts: bootstrap → migration → private
restricted LOGIN with only group membership → security and all four repository
checks → explicit LOGIN revoke/drop → rollback → exact baseline comparison →
bootstrap/migration/new LOGIN → access works again → second LOGIN removal and
rollback. Final baseline: RLS7/FORCE0/policies0/reader absent; counts and full
table/schema/database ACL snapshots byte-equivalent. Raw/mapping SELECT denied.

| App table | Clean fixture before/after cycles | Restored clone before/after cycles | Live final |
| --- | ---: | ---: | ---: |
| stores | 3 | 3 | 3 |
| store_locations | 0 | 15 | 15 |
| categories | 3 | 6 | 6 |
| raw_products | 3 | 863 | 863 |
| canonical_products | 7 | 849 | 849 |
| product_mappings | 0 | 863 | 863 |
| offers | 9 | 863 | 863 |

Committed `tests/integration/rollout_test.go` automates this proof. Its separate
SECURITY_DATABASE_URL/API target must be loopback, including pgx fallback hosts,
effective DB=part04_security and matching effective host/port; API username is
part04_api_login. No runtime DATABASE_URL or backend/.env fallback. Each path
passed one top-level lifecycle test +33 nested PASS records, zero failures.

### Mandatory reruns and preserved regression evidence

| Gate actually executed in this continuation | Result |
| --- | --- |
| gofmt -w cmd internal tests; gofmt -l . empty | PASS |
| go mod tidy / go mod verify | PASS; no dependency change |
| go test ./... | PASS, all packages |
| go test -race ./... | PASS, all packages |
| go vet ./... | PASS |
| pinned go tool staticcheck ./... | PASS |
| pinned go tool govulncheck ./... | PASS, exit0, No vulnerabilities found |
| lifecycle test on clean init+fixture DB | PASS: 1 top-level +33 nested |
| lifecycle test on restored production clone | PASS: 1 top-level +33 nested |
| full go test -count=1 -tags=integration ./... -v | PASS: 28 top-level +112 nested; zero failed |
| contracts pnpm lint (final Node24 environment) | PASS |
| protected-source diff / git diff --check | PASS |

Full tagged suite included deterministic catalog, existing bootstrap negative
tests, restricted clone repository/security smoke and all nine local EXPLAIN
cases. Live profile was intentionally skipped; lifecycle was already executed
separately on both isolated targets. The local HTTP parity profile was not rerun:
the previous complete 849-ID/all-sort/NestJS/search parity evidence above remains
valid because runtime/repository SQL and policy semantics did not change. Current
plans again completed in milliseconds without index/extension changes.

Part03 Docker DB-up/down/recovery/non-root/read-only/categories404 proof from the
preceding Phase A run is preserved, not claimed as rerun here: no runtime pool or
HTTP change in this hardening. Full unit/race middleware/foundation gates reran.
No unnecessary NestJS/Next/voice/Gemini/Redis matrix was rerun.

### Runbook, protection, cleanup and archive

POSTGRES_LAYER.md now includes the exact future Phase B PRE/FORWARD/LIVE VERIFY/
ROLLBACK sequence, failure triggers, private backup+restore, ACL/count re-audit,
restricted LOGIN lifecycle and guarded rollback. Security-only Prisma apply is
not coupled to Part05 HTTP rollout. Production apply remains separately gated.

Protected frontend/contracts/API_V1_CONTRACT.md, backend/src, Prisma schema/seed/
existing init migration diff remains empty. Only approved new backend security
artifacts are changed. Both hardening-owned Docker containers/volumes were
removed after tests; private original backups/evidence remain outside repo.
Final live audits reconfirm reader absent, policies0, RLS7/FORCE0, same managed
ACL/CONNECT state and seven unchanged counts. No Supabase mutation, seed/parser/
import, production EXPLAIN ANALYZE, commit/push/deploy or Phase B/Part05 work.

Archive: `artifacts/production-part-04-review.tar.gz`, rebuilt through permanent
production-part-04 target. Includes strengthened migration, guarded rollback,
current lifecycle tests/docs/report. Verification PASS: current report and all
305 archived files byte-match source; required files present; no real env,
known live/disposable credentials, dumps/backups, Docker volumes, binaries/
profiles, dependencies/build/test outputs or temporary/native workspaces.

**Phase A hardened local proof: READY FOR OWNER/EXTERNAL REVIEW.**

**Overall Part 04: BLOCKED — `AWAITING_EXPLICIT_PRODUCTION_RLS_APPLY_APPROVAL`.**
No other local hardening blocker remains. STOP for external review; do not apply
to Supabase, proceed to Phase B or begin Part05 without explicit authorization.

## Final forward-path hardening before Phase B

### Preflight and forward-only scope

Fetch --prune completed. Branch integrate/full-stack, HEAD=origin still
`fa985f3312802995ff3bf6dfec31a180727f3c0e`; working tree contained only known
Part04 changes. This closes the final forward-safety review findings, not a new
Part or production authorization. All previous blocker/failure/proof history is
retained above. Repository semantics/runtime, rollback artifact and dependency
versions remain unchanged in this continuation.

### Two-direction membership and direct/default ACL guards

Bootstrap and migration **independently** reject existing parent-role membership
(`member=reader.oid`) AND any child LOGIN/group already inheriting the reader
(`roleid=reader.oid`). Safe flags and no relation/schema/database ownership checks
remain; routine/type ownership is also rejected. No pre-existing child receives
access as a side effect of new SELECT policies.

Both artifacts reject direct reader ACLs on database (cluster-wide), schema,
relation, column, function/procedure, type and default ACLs (current DB). Recipient
and grantor entries are inspected; default-ACL ownership is rejected even if
the recipient is PUBLIC rather than reader. PUBLIC-only inherited privileges
are not mistaken for direct reader ACL. Newly created NOLOGIN/no-password group
passes naturally. No automatic revokes, permission repairs or LOGIN creation.

Bootstrap is now explicitly **PRE-activation only**, not an activated reader
health check or permissive reapply. Fixture setup was minimally adapted:
existing init → bootstrap → security migration → private LOGIN/group membership
before repository tests. Prepared fixtures are verified, not bootstrapped again.
Existing seven unsafe-flag bootstrap tests remain independent: they temporarily
remove known local reader membership/grants inside each transaction, prove the
isolated safe bootstrap passes, then mutate one flag and require P0001. Every
temporary change rolls back and its snapshot is compared, not hidden by another
guard condition.

### Exact baseline and bounded execution

Migration requires exactly seven named ordinary public application tables;
only uniform RLS0/FORCE0/policies0 (fresh init) or RLS7/FORCE0/policies0 (clone/
current live) is accepted. Mixed RLS, FORCE, existing app-table policies,
missing/nonordinary target tables fail with P0001. Unrelated public tables/
policies are not a forward prerequisite; a positive local test proves this.

Immediately after BEGIN, lock_timeout=5s and statement_timeout=10s are set LOCAL.
All seven target tables are locked before app RLS/policy inspection so concurrent
target-table ALTER/POLICY changes cannot slip between the state check and apply.
No retry loop or continuation after timeout. A real held-table-lock test on
each cluster returned SQLSTATE55P03 within the bounded window; the migration
transaction was rolled back and security/ACL/count snapshot stayed unchanged.
Positive transaction inspection confirmed actual lock5s/statement10s settings.

### Negative matrix and full lifecycle results

Each of the two isolated local paths passed:

| Guard / probe | Cases and actual result |
| --- | --- |
| bootstrap group guard | 26 negative cases, all P0001 with unchanged snapshot |
| independent migration group guard | same 26 cases, all P0001 with unchanged snapshot |
| app-table baseline | 5 negative cases, all P0001 with unchanged snapshot |
| already activated reader | bootstrap and migration each P0001, no state change |
| lock contention | 55P03, atomic rollback, bounded execution |
| unrelated table policy + actual timeouts | positive PASS; test transaction rolled back |
| previous rollback refusal matrix | all 17 negative cases retained and PASS |

The 26 shared role cases cover all seven unsafe flags, parent role, existing
child LOGIN, existing child NOLOGIN group, table/schema/database ownership,
SELECT/UPDATE/raw SELECT, column SELECT, schema USAGE, database CONNECT, function
EXECUTE, procedure EXECUTE, enum type USAGE, default ACL recipient, default ACL
owner, function ownership and type ownership. No listed ACL fixture needed an
approximation or suppression. Five baseline cases: unexpected raw-table policy,
FORCE, mixed RLS, missing target and a view replacing an ordinary target table.

Snapshots now also record reader flags, both membership directions, column/
routine/type/default reader ACLs and default-ACL ownership; existing seven
counts/table/schema/database ACL/ownership/policy comparison remains. Negative
tests assert guard SQLSTATE and post-rollback snapshot equality: no forward
security changes escape.

Actual full cycles ran again using the same checked-in artifacts on two freshly
created, isolated, labelled postgres:17-alpine clusters with private random
credentials and localhost-only binds:

| Path | Actual initial state | Full lifecycle | Final state |
| --- | --- | --- | --- |
| existing init + INSERT-only fixture | RLS0/FORCE0/policies0/reader absent | PASS: 1 top-level +85 nested PASS records | RLS7/FORCE0/policies0/reader absent |
| restored private production public dump | RLS7/FORCE0/policies0/reader absent | PASS: 1 top-level +85 nested PASS records | RLS7/FORCE0/policies0/reader absent |

Fresh install really starts RLS-disabled on **all seven**; no preparatory RLS
enable was used in this run. Expected rollback snapshot normalizes only the
reviewed initial RLS0→RLS7 transition. No ACL/count/ownership/policy mismatch is
ignored. Clone restore exit0 and counts matched fresh live read-only audit.
Audited managed ACLs were reproduced locally before baseline capture because
the private dump was --no-acl; production ACLs were not changed.

Each path proved bootstrap → migration → restricted LOGIN → all four repository/
security checks → explicit LOGIN removal → guarded rollback → exact expected
baseline → bootstrap/migration/new LOGIN → restricted access works → LOGIN
removal → second rollback. Raw/mapping SELECT denied; PUBLIC CONNECT worked
without direct group/login database grants. Counts and managed ACLs unchanged:

| Table | Clean before/after | Clone/live before/after |
| --- | ---: | ---: |
| stores | 3 | 3 |
| store_locations | 0 | 15 |
| categories | 3 | 6 |
| raw_products | 3 | 863 |
| canonical_products | 7 | 849 |
| product_mappings | 0 | 863 |
| offers | 9 | 863 |

### Mandatory final gates and retained evidence

| Command/gate actually executed | Final result |
| --- | --- |
| gofmt -w cmd internal tests; gofmt -l . empty | PASS |
| go mod tidy; go mod verify | PASS, no module changes |
| go test ./... | PASS, all packages |
| go test -race ./... | PASS, all packages |
| go vet ./... | PASS |
| pinned go tool staticcheck ./... | PASS |
| pinned go tool govulncheck ./... | PASS, exit0, No vulnerabilities found |
| lifecycle on fresh init/fixture | PASS: 1 top-level +85 nested |
| lifecycle on restored clone | PASS: 1 top-level +85 nested |
| go test -count=1 -tags=integration ./... -v | PASS: 28 top-level +112 nested; zero failures |
| contracts pnpm lint, Node24 | PASS |
| protected-source diff; git diff --check | PASS |

Full explicit integration again included deterministic catalog, independent
legacy bootstrap flag tests, restricted clone smoke/security and nine local
EXPLAIN cases. Live/HTTP-parity opt-ins were intentionally not enabled. Original
849-ID all-sort, Russian ru-x-icu, %/_/backslash search and NestJS parity evidence
remains preserved; SQL query semantics and policy semantics did not change.
Current plans remain bounded/millisecond-scale with existing indexes. Prior
Part03 Docker health/non-root/read-only/DB-down/recovery evidence is retained,
not relabelled as rerun; no pool/HTTP runtime changes needed that rerun here.

### Immutable production-apply prerequisite

**Before Phase B, all reviewed Part04 source/security artifacts MUST first be
committed and pushed to integrate/full-stack. Production apply must reference
that exact reviewed commit SHA. Do not apply production security artifacts from
an uncommitted working tree.** External review will separately authorize
commit/push after this final local proof. Neither operation is performed now.
Runbook states this prerequisite before private backup/restore/audit/forward.

### Safety, cleanup, protection and archive

Supabase remained strictly READ ONLY. Final catalog/ACL/count audit confirms
RLS7/FORCE0/policies0, reader absent, existing PUBLIC CONNECT and unchanged seven
counts/managed ACLs. Connection-local controls explicitly enforce read-only
transactions and 5s statement timeout. No production DDL/DML/roles/grants/
policies/migration, seed/parser/import or EXPLAIN ANALYZE. No secrets printed.

Both task-owned disposable containers/volumes removed; private backups/evidence
retained outside repo. Protected frontend/contracts/API_V1_CONTRACT.md and
backend/src/schema/seed/init migration unchanged. No Go public business route,
repository redesign, PhaseB/Part05 work, commit/push/deploy.

Permanent production-part-04 target rebuilt
`artifacts/production-part-04-review.tar.gz`. Verification PASS: all305 archived
files byte-match current source including this report; strengthened forward
artifacts, unchanged guarded rollback and current tests present. No real env,
known credentials/private-key patterns, DB dumps/backups, Docker volumes, Go
binaries/profiles, build/test outputs, dependencies or temporary workspaces.

**Phase A final local proof: READY FOR OWNER/EXTERNAL REVIEW.**

**Overall Part 04: BLOCKED — `AWAITING_EXPLICIT_PRODUCTION_RLS_APPLY_APPROVAL`.**
STOP for external review. No production apply from this uncommitted working tree.

## Production Phase B — exact commit apply

### Authorization and immutable source

Owner explicitly authorized production security metadata apply, subject to every
Phase B prerequisite in `TODO/PRODUCTION_PART_04_PHASE_B.md`. This resolves the
historical `AWAITING_EXPLICIT_PRODUCTION_RLS_APPLY_APPROVAL` blocker; all prior
Phase A findings, failures and local proof above are retained, not overwritten.

Fetch/prune PASS. Branch `integrate/full-stack`, initial working tree clean,
HEAD = origin = `60c5e40c2dcca4866478f7fe7b4501f4b080726f`.
Reviewed commit message: `feat(go): add production PostgreSQL read layer`.
All three SHA-256 checks PASS, reconfirmed before read-only status diagnosis:

| Reviewed artifact | SHA-256 |
| --- | --- |
| security migration.sql | `804feb74cfaab9b9262fd5c873432e1dc61a6004a48d89010df02cdf7c524bc7` |
| aktau_api_reader_role.sql | `bc67db66b06753c95c154405d2cd391a1705c50dcfabac5febd78965d75b5ac8` |
| rollback_aktau_api_reader_access.sql | `04faeb0e6196cd542e2fb58b5268f6f157630b8022096a88a8054aeff54c5a60` |

Tooling preflight PASS: Go1.27.1 linux/amd64, PostgreSQL clients17.10,
Docker client/server29.1.3. Reviewed SQL/source, NestJS credentials and frozen
contracts were not edited. Only this existing report changes in the repository.

### Live read-only PRE inspection

All catalog/count audit batches explicitly SET default_transaction_read_only=on,
statement_timeout=5000, then BEGIN READ ONLY. Inspected defaults/transaction were
both on; timeout5s. Identity current_user=session_user=postgres. Exactly seven
ordinary public app tables, all owned by postgres, RLS7/FORCE0/policies0.
Both aktau_api_reader and aktau_api_runtime absent; no memberships involving them.
No application data was extracted into this report.

| Table | Current live count |
| --- | ---: |
| stores | 3 |
| store_locations | 15 |
| categories | 6 |
| raw_products | 863 |
| canonical_products | 849 |
| product_mappings | 863 |
| offers | 863 |

Like-for-like comparison with Phase A's saved information_schema.table_privileges
projection PASS; schema/database ACL projection PASS, including existing PUBLIC
CONNECT. Full current aclexplode table/schema/database ACLs including grantors
were captured privately outside repo (0600 metadata file).

**Audit precision limitation:** the previous information_schema table projection
does not enumerate PostgreSQL17 MAINTAIN and represents owner grantability
differently from the stored ACL. Current aclexplode additionally reports MAINTAIN
for anon/authenticated/postgres/service_role on all seven tables and explicit
non-grantable entries for postgres. An initial cross-projection assertion failed;
like-for-like inspection confirmed the previously recorded projection matches.
This is not evidence that MAINTAIN was newly granted, and no ACL was repaired or
revoked. Complete historical grantor/MAINTAIN parity cannot be certified from the
old table projection; external review should reconcile this baseline evidence
before a future forward attempt. No full managed-ACL PRE PASS is claimed.

### Mandatory migration-history gate — FAIL / STOP

Read-only catalog proved `public._prisma_migrations` absent. A catalog search
found no `_prisma_migrations` relation in any schema. The first SELECT of the
expected table returned undefined relation; safe catalog existence checks then
confirmed absence without creating any metadata table.

Actual command executed using the existing private environment and Prisma CLI
workflow, with datasource/secret output withheld:

```text
backend/: rtk pnpm exec prisma migrate status
exit: 1
2 migrations found
pending:
  20260923000000_init
  20261004000000_rls_runtime_access
```

Required state was init **applied** and **only** RLS migration pending.
It is not satisfied. Existing application tables/data do not prove Prisma has
recorded init. Deploy would include the unapproved init, not only the approved
security migration. Therefore Phase B stops BEFORE bootstrap and all production
writes. No migrate deploy/dev/reset/db push, migrate resolve, metadata insertion,
replay or history repair was attempted. This requires a separately reviewed
Prisma baseline/reconciliation procedure and owner authorization, not a hot fix.

### Remaining gates — NOT RUN after PRE STOP

| Gate | Actual Phase B result |
| --- | --- |
| Git clean/exact SHA + three artifact hashes | PASS |
| Live RLS/FORCE/policies/role absence/count inspection | PASS |
| Like-for-like previously captured managed ACL projection | PASS; full historic ACL limitation above |
| Init applied / only RLS migration pending | FAIL: both migrations pending, history table absent |
| Fresh Phase B backup + restore/count/lifecycle proof | NOT RUN: PRE blocker discovered first |
| Exact group bootstrap | NOT RUN |
| Prisma security migration deploy | NOT RUN |
| Runtime LOGIN/password provisioning | NOT RUN; no new secret generated |
| Restricted SELECT5/raw+mapping denial/privilege metadata | NOT RUN |
| Live TestLiveReadOnlyParity / local restricted Go readiness | NOT RUN |
| Final Phase B Go unit/race/vet/staticcheck/govulncheck/contracts lint | NOT RUN after STOP; historic Phase A PASS retained, not relabelled |
| Emergency rollback | NOT NEEDED: no forward production mutation |

No new Docker resources or local API processes were created. Existing private
backups are retained, but are not claimed as a fresh Phase B backup/restore PASS.
Only SELECT/catalog inspection, read-only Prisma status and connection-local
read-only controls were used against production. No data/schema/RLS/policy/role/
ACL/history mutation, credentials change, traffic cutover, deploy, Part05,
commit or push occurred.

### Review artifact and final status

Permanent `production-part-04` archive target rebuilt:
`artifacts/production-part-04-review.tar.gz`.
Verification PASS: all305 archived files byte-match current source, including
this report; exact reviewed SQL and required source present. No real .env,
known credentials/private-key patterns, DB dumps/backups, secret directories,
node_modules, build/test outputs, binaries/profiles or temporary workspaces.
Protected source diff empty; final git diff --check PASS.

**Status: BLOCKED — `PRODUCTION_PRISMA_INIT_HISTORY_MISSING`.**
Phase B production security apply: NOT RUN. Part04 implementation gates are not
COMPLETE; Part05 NOT STARTED. Stop for external review of migration provenance
and full historical ACL baseline before any production write.

## Phase A prompt re-entry — preflight scope mismatch

The owner requested execution of the original
`TODO/PRODUCTION_PART_04_RLS_PHASE_A_FIX_PROMPT.md` after the Phase B PRE stop.
The prompt was reread with root AGENTS.md and the current report changes.
Fetch/prune completed; branch integrate/full-stack; HEAD=origin remains
`60c5e40c2dcca4866478f7fe7b4501f4b080726f`, not the original prompt's expected
`fa985f3312802995ff3bf6dfec31a180727f3c0e`. The only working-tree modification
was the known Phase B report above; protected source diff was empty.
Go1.27.1, PG clients17.10 and Docker29.1.3 were verified again.

The original Phase A design and its subsequent hardening are already in the
current reviewed commit, with the local PASS evidence preserved above. No
duplicate migration, source rewrite, reset/rebase or replay was performed.
This older read-only/local-only prompt does not authorize production Prisma
history reconciliation and cannot override the failed Phase B prerequisite.
Execution stops at the baseline/scope mismatch rather than treating the old
approval-only blocker as the current state. No new DB access, local integration
rerun or production mutation occurred in this re-entry; historical tests are not
claimed as newly run.

Overall status remains **BLOCKED — PRODUCTION_PRISMA_INIT_HISTORY_MISSING**,
with the full historical ACL evidence limitation retained. A separately reviewed
baseline/reconciliation scope is needed before Phase B can resume. Part05 was
not started; no commit/push/deploy. The same permanent production-part-04 archive
was rebuilt and verified:305 files byte-match current source/report, reviewed SQL
present, exclusions and known-secret scan PASS. git diff --check PASS.

## Prisma baseline reconciliation — local proof

### Scope, preflight and immutable evidence

Executed the CURRENT reconciliation prompt, not the superseded Phase A prompts.
Fetch/prune PASS; branch integrate/full-stack; HEAD=origin=
`60c5e40c2dcca4866478f7fe7b4501f4b080726f`
(`feat(go): add production PostgreSQL read layer`). Initial working tree had
only this report's known previous-run changes. No unknown source changes.
Prisma CLI skill guided status/resolve/deploy usage; existing Prisma5.22.0 was
verified and preserved. No config/dependency/SQL changes were required.

All three reviewed bootstrap/security/rollback hashes still match the Phase B
table above. Checked-in init SHA-256:
`a5515ab64d6f8307df96971eb9ee1f7f41d6873e877d591167bde6450e881a92`.
No init SQL was edited or executed against production.

### Fresh canonical production baseline — READ ONLY

Fresh private audit enforced SET default_transaction_read_only=on,
statement_timeout=5000, BEGIN READ ONLY; inspected defaults/transaction on and
timeout5s. Identity current_user=session_user=postgres, active_role=none.
All seven exact ordinary public app tables remain owned by postgres,
RLS7/FORCE0/policies0. Reader/runtime roles absent; `_prisma_migrations` absent.
Existing PUBLIC CONNECT present. Relevant existing role flags and memberships
were captured privately, without passwords or any provider secret.

**The current complete aclexplode snapshot is canonical**, as the CURRENT prompt
requires. The historical information_schema projection was not used to infer
past MAINTAIN/grantor values. This resolves the evidentiary limitation for a
future rollout baseline without pretending the older audit was complete:

- anon/authenticated/postgres/service_role each have eight stored privileges on
  all seven tables: SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN;
  explicit is_grantable=false, grantor=postgres, no PUBLIC table ACL.
- public schema: PUBLIC/anon/authenticated/postgres/service_role USAGE;
  pg_database_owner USAGE+CREATE; explicit grantor=pg_database_owner,
  is_grantable=false. No PUBLIC CREATE.
- database: PUBLIC CONNECT+TEMPORARY; postgres/dashboard_user CONNECT+CREATE+
  TEMPORARY; supabase_etl_admin/supabase_storage_admin CREATE; all stored
  grantor=postgres, is_grantable=false. No new database grants.

Owner authority explains information_schema's different owner grantability;
it is not an explicit grant option in the stored ACL. No managed grant was
repaired/revoked. These exact full ACLs, ownership, roles/memberships, policies
and counts were captured in a private0600 metadata snapshot outside the repo.

### Fresh private backup, restore and schema proof

New backup directory:
`/home/denis/.local/share/aktau-market/backups/part04-prisma-baseline/2026-10-04T00-25-53-644Z/`.
Contains public schema-only SQL and custom-format data dump with --no-owner/
--no-acl, plus private canonical catalog metadata. Directory0700/files0600
verified. Before/after production audit and counts unchanged. Dumps/data/ACL
snapshot are NOT in repo or archive. No whole-Supabase disaster-recovery claim.

New task-owned postgres:17-alpine container/volume with loopback-only port15434,
random private disposable credentials; no production credentials in Docker.
Verified empty clone public schema was removed locally before restore because
the dump creates it. Restore --no-owner/--no-acl/--exit-on-error exited0, no ignored
errors. Restored structure matches fresh live structure.

| Table | Live before/after dump/final | Fresh clone before/after resolve/deploy |
| --- | ---: | ---: |
| stores | 3 | 3 |
| store_locations | 15 | 15 |
| categories | 6 | 6 |
| raw_products | 863 | 863 |
| canonical_products | 849 | 849 |
| product_mappings | 863 | 863 |
| offers | 863 | 863 |

A second clean disposable database used ONLY the checked-in init migration.
Semantic comparison PASS: 3 enums/ordered values,7 tables,48 columns/types/
nullability/defaults,15 PK/FK constraints including8 FK cascade actions,21 indexes
including PK/unique definitions. The only allowed security difference was
restored clone RLS7/FORCE0/policies0 vs init-only RLS0/FORCE0/policies0.
No other application structure difference was ignored.

Because --no-acl dumps omit privileges, the complete CURRENT live table/schema/
database ACL baseline was reproduced ONLY on clone before reconciliation.
This includes MAINTAIN, actual grantors, explicit grantability and schema/table
ownership. Managed roles were simulated as safe NOLOGIN roles; no production
credentials/admin memberships copied. Full cloned managed ACL matrix matched
canonical live before local resolve; subsequent comparisons used that snapshot.

### Missing-history reproduction and local resolve

Actual Prisma5.22.0 status on production (READ ONLY) and restored clone both
returned exit1 and pending init + RLS migration; history table absent. This is
the required blocker reproduction, not a hidden failure. Prisma mutation wrapper
asserted task-owned Docker label, loopback host/port and disposable DB target,
overriding BOTH DATABASE_URL and DIRECT_URL in process memory. Production helper
allowed only `migrate status`; no resolve/deploy path to production.

LOCAL clone command:

```text
rtk pnpm exec prisma migrate resolve --applied 20260923000000_init
exit 0
```

Immediate verification PASS: `_prisma_migrations` newly exists, exactly init
recorded, finished_at non-null, rolled_back_at null, applied_steps_count=0.
Observed checksum:
`a5515ab64d6f8307df96971eb9ee1f7f41d6873e877d591167bde6450e881a92`,
exactly equals checked-in file SHA-256. This is observed Prisma/file evidence,
not an invented checksum algorithm. No manual history SQL was used.

Pre/post local resolve application structure, counts, ownership, RLS7/FORCE0/
policies0, complete table/schema/database ACLs, relevant role flags/memberships
all equal; reader/runtime absent. Only migration metadata was added.
Post-resolve `rtk pnpm exec prisma migrate status` returned exit1 with ONLY
`20261004000000_rls_runtime_access` pending; no failed/rolled-back/extra record.

### Local deploy and restricted parity proof

On clone only, executed the exact reviewed group bootstrap using psql
ON_ERROR_STOP, then `rtk pnpm exec prisma migrate deploy`. Deploy exit0; output
and records prove ONLY RLS migration ran, not init. Exactly two records:

| Local record | Finished | Rolled back | Applied steps | Observed checksum |
| --- | --- | --- | ---: | --- |
| 20260923000000_init | true | false | 0 | init SHA-256 above |
| 20261004000000_rls_runtime_access | true | false | 1 | `804feb74cfaab9b9262fd5c873432e1dc61a6004a48d89010df02cdf7c524bc7` |

Security verification PASS: RLS7/FORCE0, exactly5 named reader-only SELECT/
USING(true)/no-WITH-CHECK policies, reader SELECT5 + public USAGE only.
No raw/mapping reader grant/policy; no database direct grant. Managed ACLs,
application structure/ownership and seven counts unchanged except reviewed
reader additions. No index/extension/collation was added.

Disposable LOCAL part04_api_login: group-only reader membership, no owner/admin/
superuser/role-creation/database-creation/replication/BYPASSRLS. Allowed SELECT5
sees full clone counts; raw/mapping SELECT returns SQLSTATE42501, not empty rows.
The existing local-only security test also proves DML/DDL denial independent of
pool read-only defaults. No forbidden-write test ran against production.

Rebuilt current committed NestJS reference (`pnpm build` PASS), no source edits.
Native-WSL temporary runtime/dependencies copy:49 compiled files byte-identical;
copied symlinks already valid, no repair/dependency change needed. Both NestJS
and Go parity used the same LOCAL restricted clone credential, GET-only.
No production env/DSN copied into the workspace; Gemini/Upstash variables absent;
no voice/provider calls. No live repository profile enabled.

Explicit existing integration profile:
`go test -count=1 -tags=integration ./tests/integration -run '^(TestProductionClone|TestLocalCloneParity|TestCloneRestrictedSecurity)$' -v`.
PASS:3 top-level tests,0 failed. It proves read-only pool policy, categories/
all category filters/detail, typed dynamic options, usable offer/minPrice/UTC
snapshot semantics, bounded SQL roundtrips and all849 IDs in exact order for
price_asc/price_desc/name_asc. Offer ties compared per existing frozen semantics.

| Search | Exact local NestJS/Go paginated count | Result |
| --- | ---: | --- |
| МОЛОКО | 44 | PASS |
| `%` | 849 | PASS |
| `_` | 849 | PASS |
| single backslash | 4 | PASS |
| `Молок%` / `Молок_` | 44 each | PASS |
| backslash + `%` | 168 | PASS |
| backslash + `_` | 0 | PASS |
| `literal%_` + backslash + `not-present` | 0 | PASS |
| injection-shaped string | 0 | PASS |

### Quality, cleanup, protection and final live audit

| Gate actually executed in this reconciliation | Result |
| --- | --- |
| Full go test ./... | PASS:100 tests in7 packages |
| Full go test -race ./... | PASS:100 tests in7 packages |
| go vet ./... | PASS |
| pinned go tool staticcheck ./... | PASS |
| pinned go tool govulncheck ./... | PASS:exit0, No vulnerabilities found |
| contracts pnpm lint | PASS |
| local clone/security/HTTP parity profile | PASS:3 tests,0 failed |
| final production read-only canonical baseline + app structure | PASS:equal to fresh pre-backup snapshot |
| protected source diff / git diff --check | PASS |

Final production still has RLS7/FORCE0/policies0, reader/runtime absent,
`_prisma_migrations` absent, unchanged counts/full managed ACL/role state.
No production resolve/deploy, DDL/DML/grant/role/policy mutation or application
repository run occurred. No secret was printed or placed in report/repo/logs.
Own local reference stopped and generated native workspace removed; only
ownership-labelled task container/volume removed. Fresh private backup/catalog
evidence retained outside repo. Runtime production secret was not generated.

Protected backend/src, schema/seed/init/security migration/bootstrap/rollback,
all backend-go source, frontend and contracts remain unchanged. Only this report
and POSTGRES_LAYER.md runbook change. No commit/push/deploy or Part05 work.

### Future production gate and status

POSTGRES_LAYER.md now records the proposal: fresh backup/restore + final canonical
read-only baseline + absent history/both-pending check + init structure comparison
→ separately approved production `resolve --applied init`
→ verify only RLS pending/app state unchanged
→ resume reviewed Phase B security flow. No manual history edit/replay.
**Production resolve is a metadata write and remains separately approval-gated.**
The earlier Phase B approval did not cover baseline history creation; this proof
does not broaden it or count production least-privilege parity as PASS.

Permanent production-part-04 target rebuilt:
`artifacts/production-part-04-review.tar.gz`.
Archive verification PASS:305 files byte-match current source including report
and runbook; required reviewed SQL present; no real .env, known live/current
disposable credentials, private ACL snapshots/backups/dumps, volumes, native
workspace, node_modules, binaries/profiles or build/test artifacts.

**Status: BLOCKED — AWAITING_EXPLICIT_PRODUCTION_PRISMA_BASELINE_APPROVAL.**
Local reconciliation proof PASS, ready for owner/external review. Production
history/security apply NOT RUN; live least-privilege parity NOT RUN; Part05 NOT
STARTED. Stop for review; do not execute the proposed production sequence yet.

## Production Prisma baseline apply

### Narrow authorization and immutable source

Executed `TODO/PRODUCTION_PART_04_PROD_PRISMA_BASELINE_APPLY.md`, which separately
authorizes ONLY the Prisma metadata baseline marker, not RLS apply/API roles.
Fetch/prune PASS; clean initial working tree; branch integrate/full-stack;
HEAD=origin=`4a46fbb0ba9a11cf70212027bc766deb41fa1269`, message
`docs(db): prove Prisma baseline reconciliation`. All prior findings/proof above
remain historical evidence; earlier approval blockers are not erased.

All four artifact SHA-256 checks PASS before backup and immediately before write:

| Immutable artifact | SHA-256 |
| --- | --- |
| init migration | `a5515ab64d6f8307df96971eb9ee1f7f41d6873e877d591167bde6450e881a92` |
| RLS migration | `804feb74cfaab9b9262fd5c873432e1dc61a6004a48d89010df02cdf7c524bc7` |
| reader bootstrap | `bc67db66b06753c95c154405d2cd391a1705c50dcfabac5febd78965d75b5ac8` |
| guarded rollback | `04faeb0e6196cd542e2fb58b5268f6f157630b8022096a88a8054aeff54c5a60` |

Prisma5.22.0, PostgreSQL clients17.10, Docker29.1.3 verified. Prisma CLI skill
guided the existing status/resolve workflow, without config/dependency changes.
Private DIRECT_URL migration target/schema was checked against the exact
endpoint/database used by the read-only audit; values were never printed.
Existing local .env was read privately, not modified or copied into repo/logs.

### Fresh PRE backup and restore

New private backup directory:
`/home/denis/.local/share/aktau-market/backups/part04-prod-baseline/2026-10-04T01-00-12-970Z/`.
Fresh public schema-only/custom dumps used --schema=public/--no-owner/--no-acl.
Current canonical security/catalog and application-structure snapshots saved
privately alongside them. Actual directory0700 and files0600 verified.
No dump/private snapshot is included in repo/archive.

Read-only production audit batches explicitly SET default_transaction_read_only=on,
statement_timeout=5000, BEGIN READ ONLY; inspected defaults+transaction on/timeout5s.
Fresh application structure equals the reviewed clone/init structure (3 enums,
7 tables,48 columns,15 constraints/8 FKs,21 indexes). Reviewed existing RLS7 vs
init RLS0 remains the sole known structural-security difference; no init SQL was
rerun, and the preceding local baselining design/parity proof was not broadened.

A NEW labelled disposable postgres:17-alpine container/volume on loopback15435
used private random local credentials, no production credentials. Its verified
empty public schema was removed locally before dump restore creates public.
`pg_restore --no-owner --no-acl --exit-on-error` exited0, all seven live/clone
counts equal, restored application structure equal PRE. No local baseline or
security deploy was repeated; this was fresh backup validation only.

### Final live PRE — PASS

Immediately before the production write, exact source SHA/clean tree/hashes were
checked again. Canonical snapshot equals fresh PRE; exactly7 ordinary app tables,
same ownership, RLS7/FORCE0/policies0. Reader/runtime absent. Catalog search proves
`_prisma_migrations` absent in EVERY schema. PUBLIC CONNECT unchanged. Full table
ACL via aclexplode including MAINTAIN/grantor, schema/database ACLs, relevant
role flags/memberships and seven counts all equal fresh PRE. Production structural
audit still matches the reviewed init baseline evidence.

Actual `rtk pnpm exec prisma migrate status` PRE:exit1, exactly init + RLS pending.
Pending exit1 was interpreted using names/catalog state, not labelled a command
failure or converted to an up-to-date PASS.

### The sole production write — PASS

From backend/ with the private existing production migration environment:

```text
rtk pnpm exec prisma migrate resolve --applied 20260923000000_init
exit 0
Migration 20260923000000_init marked as applied.
```

Executed ONCE. The redacting wrapper allowed only status or this exact init
resolve, with an attempt marker preventing retry. No production migrate deploy,
init/RLS SQL, bootstrap/rollback artifact, manual history SQL, role creation,
application DDL/DML/grant/policy operation or schema replay was executed.
The intended metadata addition is retained; no attempt was made to undo it.

### Immediate post-resolve + final read-only verification — PASS

History relation now exists only in public, with EXACTLY one row:

| Safe production history field | Actual verified value |
| --- | --- |
| migration_name | 20260923000000_init |
| checksum | `a5515ab64d6f8307df96971eb9ee1f7f41d6873e877d591167bde6450e881a92` |
| finished_at IS NOT NULL | true |
| rolled_back_at IS NULL | true |
| applied_steps_count | 0 |

No failed/rolled-back/extra row. Immediate postcheck and final canonical audit
both proved equality with PRE except the intentional Prisma history existence.
Application structure unchanged; all seven ordinary tables still owned by the
same owner, RLS7/FORCE0/policies0; reader/runtime absent. Full managed ACLs incl
MAINTAIN/grantor, schema/database ACLs/PUBLIC CONNECT and role memberships equal.

| Application table | PRE/dump/restored count | POST/final count |
| --- | ---: | ---: |
| stores | 3 | 3 |
| store_locations | 15 | 15 |
| categories | 6 | 6 |
| raw_products | 863 | 863 |
| canonical_products | 849 | 849 |
| product_mappings | 863 | 863 |
| offers | 863 | 863 |

Post-resolve/final Prisma status both returned exit1 with ONLY
`20261004000000_rls_runtime_access` pending. Init is recorded applied, no RLS
marker/deploy, no unexpected migration. The expected pending exit does not negate
the successfully verified baseline. No application data was changed.

### Required quality/source protection — PASS

| Actual command/gate after baseline apply | Result |
| --- | --- |
| full go test ./... | PASS:100 tests in7 packages |
| full go test -race ./... | PASS:100 tests in7 packages |
| go vet ./... | PASS |
| pinned go tool staticcheck ./... | PASS |
| pinned go tool govulncheck ./... | PASS:exit0, No vulnerabilities found |
| contracts pnpm lint | PASS |
| protected-source diff / git diff --check | PASS |

All backend/**, backend-go/**, frontend/**, contracts/**, scripts/** and frozen
API_V1_CONTRACT.md remain unchanged. Only this report and POSTGRES_LAYER.md factual
status update changed. No unnecessary repository/API/voice matrix was rerun for
the metadata-only write; no Go traffic-owner/parity/cutover claim is made.

Task-owned restore container/volume removed with ownership checks; private backup
and canonical evidence retained outside repo. No API process was started and no
runtime secret provisioned. No secrets printed/stored in report/repo/archive/logs.
No commit/push/deploy, RLS rollout, API-role provisioning or Part05 work.

### Review artifact and current status

Permanent production-part-04 target rebuilt:
`artifacts/production-part-04-review.tar.gz`.
Verification PASS:305 archived files byte-match current source/report/runbook;
all reviewed SQL/source present. Secret scan includes known live credentials and
this task's disposable credential. No real .env, DB dump/backup/private canonical
snapshot, secret directory, Docker volume, node_modules, generated build/test
output or Go binary/profile. Archive is a review artifact, not a DB backup.

**Status: BLOCKED. Production Prisma baseline apply PASS.**
**Overall blocker: AWAITING_EXPLICIT_PRODUCTION_RLS_APPLY_APPROVAL_AFTER_BASELINE.**
Part04 is NOT complete; RLS migration still pending, reader/runtime absent, live
least-privilege parity NOT RUN. Stop for external review; do not proceed to RLS
apply, API roles, Go deploy/cutover or Part05 under this authorization.

## Final Production RLS Phase B — STOP after bootstrap

**Status: BLOCKED.**
**Blocker: PRODUCTION_READER_BOOTSTRAP_AUTO_MEMBERSHIP_CONFLICT.**

The owner explicitly authorized this continuation under
`TODO/PRODUCTION_PART_04_FINAL_RLS_PHASE_B.md`. The preceding approval blocker is
superseded by that authorization, not deleted from historical evidence. No Part05
work or traffic cutover occurred.

### Immutable preflight — PASS

Fetch origin --prune exited0. Branch integrate/full-stack; initial tree clean;
HEAD = origin/integrate/full-stack =
`ae9465a41d2dc95e44bee9890176bac5ded6b1f6`
(`docs(db): record production Prisma baseline`). SHA/tree/artifact checks were
repeated immediately before the bootstrap production write.

| Reviewed artifact | Verified SHA-256 |
| --- | --- |
| init migration | `a5515ab64d6f8307df96971eb9ee1f7f41d6873e877d591167bde6450e881a92` |
| RLS migration | `804feb74cfaab9b9262fd5c873432e1dc61a6004a48d89010df02cdf7c524bc7` |
| reader bootstrap | `bc67db66b06753c95c154405d2cd391a1705c50dcfabac5febd78965d75b5ac8` |
| guarded rollback | `04faeb0e6196cd542e2fb58b5268f6f157630b8022096a88a8054aeff54c5a60` |

Prisma installed version5.22.0; Go1.27.1 linux/amd64; PostgreSQL client17.10;
Docker client/server29.1.3. No source/SQL hot-edit, reset/rebase, commit or push.

### Fresh private backup / restore / PRE — PASS

New portable public schema-only + custom dump and canonical security/structure
evidence retained outside Git:
`/home/denis/.local/share/aktau-market/backups/part04-final-rls/2026-10-04T11-08-52-788Z/`.
Directory0700; all four files0600. Dumps used --schema=public --no-owner --no-acl.
Canonical evidence includes ownership/RLS/FORCE/policies, full aclexplode table
ACL with MAINTAIN/grantor, schema/database ACL, roles/memberships and Prisma rows.
Live audits explicitly set default_transaction_read_only=on, statement_timeout=5000,
BEGIN READ ONLY. No production application data mutation occurred.

Fresh labelled disposable postgres:17-alpine on loopback15436 restored with
--no-owner --no-acl --exit-on-error: exit0. Seven counts and application structure
equal current live PRE and the reviewed init structural evidence. Only the empty
local public schema was removed to allow dump restoration. No local baseline or
security migration was rerun for this fresh restore check.

PRE matched the prior production baseline byte-for-byte: seven ordinary app
tables RLS7/FORCE0/policies0, reader/runtime absent, unchanged full managed ACLs
and existing PUBLIC CONNECT. Exactly one successful Prisma init record,
finished_at non-null, rolled_back_at null, steps0, checksum as above.
Actual migrate status exit1 listed ONLY 20261004000000_rls_runtime_access pending.
The expected pending status was not labelled up-to-date or treated as a failed
migration. Rollback artifact and backup/restore readiness were verified pre-write.

| Table | PRE / restored | Final READ-ONLY audit |
| --- | ---: | ---: |
| stores | 3 | 3 |
| store_locations | 15 | 15 |
| categories | 6 | 6 |
| raw_products | 863 | 863 |
| canonical_products | 849 | 849 |
| product_mappings | 863 | 863 |
| offers | 863 | 863 |

### Exact bootstrap execution / immediate pristine check — FAIL

Executed the exact reviewed aktau_api_reader_role.sql ONCE over the existing
private direct operator connection with psql ON_ERROR_STOP=1: SQL exit0.
No SQL statements were substituted or patched. The new reader is NOLOGIN,
INHERIT, NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS.
Read-only full catalog inventory proves zero ownership, direct/default ACLs and
parent memberships. However the required zero-child-members gate failed:

| Role | Member | Grantor | ADMIN | INHERIT | SET |
| --- | --- | --- | --- | --- | --- |
| aktau_api_reader | postgres | supabase_admin | true | false | false |

The operator is a non-superuser with CREATEROLE. This observed membership is the
documented PostgreSQL behavior when such an operator creates a role, rather than
an explicit additional GRANT performed by this session.
[PostgreSQL17 role attributes](https://www.postgresql.org/docs/17/role-attributes.html).
The prior disposable proof used a superuser and therefore did not reproduce this
operator-dependent behavior. Both the bootstrap's existing-role guard and the
RLS migration's pristine-reader guard reject any child membership.

STOP immediately: no migrate deploy attempted, no LOGIN/password created, no
manual REVOKE/DROP/ALTER or hot-edit. Reader has no application grants/policies;
operator cannot inherit or SET this group through the automatic membership.
It is retained as the inert bootstrap outcome for separate review. The automatic
ADMIN membership is explicitly recorded, not accepted as the required pristine
state. Do not simply retry the unchanged bootstrap/deploy.

### Final state and remaining gates

Additional SELECT-only audit confirmed: RLS7/FORCE0/policies0; application
structure/ownership, all seven counts, complete managed table/schema/database
ACL and PUBLIC CONNECT unchanged. Runtime LOGIN absent; reader has no owned
objects or direct/default privileges; exact unexpected membership above persists.
Prisma history still EXACTLY init successful steps0/checksum, no failed/rolled-back
or extra record; final status exit1 with only RLS pending.

| Gate in this continuation | Actual result |
| --- | --- |
| production Prisma baseline / fresh backup-restore | PASS |
| exact bootstrap SQL execution | PASS: exit0 |
| bootstrap pristine-group verification | FAIL: automatic operator membership |
| RLS deploy / post-migration policies5+SELECT5 verification | NOT RUN: STOP before deploy |
| runtime secret/LOGIN + reader membership | NOT RUN; no secret file created |
| restricted SELECT5 / raw-mapping denial / Go pool policy | NOT RUN |
| live least-privilege Go↔Nest parity / restricted Go readiness | NOT RUN |
| final Go test/race/vet/staticcheck/govulncheck + contracts lint | NOT RUN: STOP; preceding baseline continuation PASS evidence retained above |
| protected-source diff / git diff --check | PASS |

NestJS GET-only reference started locally with existing production DB configuration,
using 49 byte-identical compiled files in a native-WSL temporary copy. Categories
GET returned200 with6 categories; no voice/Gemini/Redis/POST calls. This does NOT
constitute restricted Go parity. Own reference process/native workspace removed;
task-owned restore container/volume removed with label ownership checks. Private
backup remains. backend/.env and NestJS credentials unchanged.

No rollback was executed: the RLS migration was never applied, and the reviewed
rollback requires the full applied rollout state. No Prisma history reconciliation
is needed from this run. A separately reviewed bootstrap/operator-membership
remediation and matching preflight/runbook update are needed before continuation.
This report does not authorize that fix. Production security is PARTIAL (group
creation only), not successful RLS apply. Part04 implementation gates INCOMPLETE;
Part05 NOT STARTED. No Go deploy, traffic change, application DML/DDL, seed/import,
manual history edits, commit or push.

### Updated review archive

Permanent target production-part-04 rebuilt
`artifacts/production-part-04-review.tar.gz` for this BLOCKED external review.
Verification: all305 archived files byte-match current source, report and runbook;
required reviewed SQL included; exclusions/known-credential scan PASS. No real env,
backup/dump/canonical private evidence, node_modules, build/test output, temporary
workspace, Docker volume, Go binary/profile or secrets. Archive is not a DB backup.

**Status: BLOCKED — PRODUCTION_READER_BOOTSTRAP_AUTO_MEMBERSHIP_CONFLICT.**
Stop for external review; do not advance to Part05.

## Reader creator-membership remediation — local proof

**Status: BLOCKED. Local remediation/proof PASS.**
**Overall blocker:
AWAITING_EXPLICIT_PRODUCTION_RLS_RESUME_APPROVAL_AFTER_OPERATOR_MEMBERSHIP_REVIEW.**

Authorization: `TODO/PRODUCTION_PART_04_READER_CREATOR_MEMBERSHIP_REMEDIATION.md`.
This task performed source/test/runbook changes, production READ-ONLY audits and
disposable LOCAL proof only. It did NOT resume production Phase B or remove any
production membership. The previously observed bootstrap conflict is corrected
in proposed source/model, not by changing live roles or accepting unreviewed apply.

### Preflight and preserved production state

Fetch origin --prune PASS. Branch integrate/full-stack; HEAD=origin=
`ae9465a41d2dc95e44bee9890176bac5ded6b1f6`. Initial tree contained ONLY the two
expected report/runbook changes from the stopped run; neither was discarded.

Fresh PRE and FINAL audit used explicit read-only defaults+BEGIN READ ONLY and5s
statement timeout, full ACL/ownership/role/structure/count checks. They matched the
prior stopped-run canonical state exactly. Prisma5.22 status exit1 with ONLY
20261004000000_rls_runtime_access pending; init successful steps0/checksum unchanged.
No failed, extra or rolled-back migration. Production reader safe NOLOGIN/INHERIT,
all elevated flags false; no owned objects, direct/default ACL or parent membership;
runtime absent. Exactly one reader child:

| Role | Member/current operator | Grantor | ADMIN | INHERIT | SET | Grantor superuser |
| --- | --- | --- | --- | --- | --- | --- |
| aktau_api_reader | postgres | supabase_admin | true | false | false | true |

Live operator non-superuser/CREATEROLE; catalog MEMBER=true, USAGE=false, SET=false.
No production SET ROLE or DML/DDL denial attempt was made. Seven tables remain
RLS7/FORCE0/policies0; complete managed ACLs incl MAINTAIN/grantor and PUBLIC CONNECT
unchanged. PRE=FINAL counts: stores3, store_locations15, categories6, raw_products863,
canonical_products849, product_mappings863, offers863. Application structure unchanged.

### Root cause and corrected invariant

The automatic creator anchor is documented PostgreSQL17 behavior, not platform
drift. Non-superuser CREATEROLE creation gets an admin-only membership from the
bootstrap superuser; the old disposable superuser proof could not reveal it.
[PostgreSQL17 role attributes](https://www.postgresql.org/docs/17/role-attributes.html).

All THREE artifacts independently enforce:

- Case A: current_user is superuser, zero child memberships.
- Case B: current_user is non-superuser with CREATEROLE, EXACTLY one child;
  member=current_user, ADMIN=true, INHERIT=false, SET=false, superuser grantor.
- Neither case permits reader parent memberships, unsafe flags/ownership or
  unexpected ACLs. No reusable SQL hard-codes postgres/supabase_admin.

Bootstrap validates after creation as well as on existing-role verification; no
membership repair GRANT/REVOKE is added. Pending migration is corrected in place,
not duplicated; init unchanged. Existing migration transaction, seven-table lock,
5s lock/10s statement timeouts, uniform RLS0/7 baseline and exact grants/policies
remain. Guarded rollback permits only the exact operator anchor after runtime
removal; DROP reader removes it normally. Rollback never disables RLS.

The anchor is control-plane administration, NOT runtime data access or a new
least-privilege credential. MEMBER true does not imply inherited privileges or
SET capability. ADMIN TRUE is not a security boundary: it allows role administration
and new grants. The separately privileged production operator already owns all app
tables and has administrative/BYPASSRLS authority. The exact allowlist is essential.

Future runtime grant is explicit, not PostgreSQL defaults:

```sql
GRANT aktau_api_reader TO aktau_api_runtime
WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
```

Tested runtime MEMBER/USAGE=true, SET/ADMIN=false, sole reader parent, safe LOGIN
flags, non-owner/no direct application grants. Production LOGIN was NOT created.

### NEW artifact hashes — external review required

| Corrected artifact | SHA-256 |
| --- | --- |
| reader bootstrap | `bd09e6cbdbe0fb292e721573184cacadde7d339be68845df8ca5d8e1cfd10a0d` |
| still-pending RLS migration | `aa5d016c002f9b9d7d1feb3de2b77bd667879466ec3e808f6452b620afe09e79` |
| guarded rollback | `6d9d8bc377f985c37dc9e81252a0af79f80f5debe338cdb8544b3e4fa5f1a545` |

Old reviewed Phase B hashes are preserved in history but no longer describe these
proposed artifacts. Init remains
`a5515ab64d6f8307df96971eb9ee1f7f41d6873e877d591167bde6450e881a92`.
Future production resume requires externally accepted/committed immutable source
and separately explicit owner authorization with NEW hashes. No commit/push here.

### Production-like LOCAL topology and positive proof

Two fresh labelled postgres:17-alpine clusters on loopback15437/15438 with private
disposable credentials, no production credentials. Bootstrap superuser provisioned
LOGIN part04_operator: non-superuser CREATEROLE, no CREATEDB/BYPASSRLS/replication;
it owned the dedicated part04_security database and all seven application tables.
Clean path used exact checked-in init + INSERT fixture; clone restored the existing
verified private public dump --no-owner/--no-acl/--exit-on-error as the operator.
Clone seven counts equal current live. Local anon/authenticated/service_role ACLs
were simulated with operator as local object owner/grantor and captured before
cycles. No production managed role/ACL was changed or copied with credentials.

On BOTH primary paths, all bootstrap/migration/rollback operations under test ran
as part04_operator. Bootstrap create+immediate validation PASS; pristine existing
reader reverify was snapshot-equivalent. Automatic exact anchor appeared; operator
MEMBER=true/USAGE=false/SET=false, actual SET ROLE reader denied42501. Migration
PASS, exact policies5/SELECT5. Local aktau_api_runtime inherited only reader with
explicit options; MEMBER/USAGE=true, SET/ADMIN=false, SET ROLE denied42501. Categories,
filter discovery, all3 repository sorts/detail and raw/mapping denial passed.
After removing runtime, operator rollback PASS while anchor remained. Reader DROP
removed the automatic anchor. Forward→rollback→forward→rollback PASS with exact
count/full managed ACL/ownership snapshot equality. Clean RLS0→7 is the only
intentional normalized rollback-target transition; restored clone remains RLS7.

### Negative matrix and preserved regression coverage

Each new operator path passed49 subtests:45 anchor/drift probes (15 for EACH of
bootstrap/migration/rollback), two unsafe-creation self-grant probes, and two
grouping subtests. Required cases: second LOGIN, second NOLOGIN, different operator,
missing anchor, early runtime, ADMIN false, INHERIT true, SET true, non-superuser
grantor, operator lacking CREATEROLE, reader parent, unsafe flags, ownership,
direct/default ACL. Rejections were P0001; transaction rollback and complete
security/ACL/count snapshot equality verified. Newly-created reader under unsafe
createrole_self_grant inherit/set settings was rejected atomically, leaving none.

Non-superuser grantor was independently simulated by a single grantor-field mutation
in pg_auth_members inside a LOCAL bootstrap-superuser transaction, then artifact
execution SET LOCAL ROLE part04_operator; expected P0001 and rollback restored the
original grantor. This adversarial catalog probe cannot target production: all
three explicit URLs/effective pgx hosts/fallbacks/database/user topology are guarded;
no runtime DATABASE_URL fallback. It avoids falsely passing solely through an
extra-child count. No catalog mutation escaped the local test transaction.

Original Case A lifecycle suite remained PASS on clean and clone,85 subtests each,
including unsafe flags/ownership/all ACL classes, RLS/policy negatives, unrelated
policy positive, lock timeout55P03/atomicity, activated-reader refusal and exact
rollback drift/refusal. No old case was removed. Full legacy tagged fixture package
PASS:3 top-level tests +25 subtests; other explicit profiles correctly SKIP there
and were executed independently as documented. Legacy intentional SUPERUSER/
BYPASSRLS/replication flag injection uses its original superuser profile; this is
supplemental Case A regression, not the primary non-superuser proof.

Initial local probe setup failures are not hidden: demoting the bootstrap superuser
was prohibited by PostgreSQL (0A000), and ownership transfer removed operator table
lock permission before the guard. Revised LOCAL-only setups isolate grantor and
restore locking permission so the actual guards return P0001. The existing legacy
unsafe-flag fixture suite initially failed when incorrectly supplied the restricted
operator credential; rerun with its correct superuser topology passed. One rerun
refused an intentionally still-activated rehearsal clone; after completing parity/
rollback its clean-baseline lifecycle rerun passed. Final runs have zero failures;
none of these local setup issues caused a production action or weakened an assertion.

### Current-production-state rehearsal — LOCAL PASS

Restored clone started with successful init history, only RLS pending, RLS7/FORCE0/
policies0, runtime absent. Operator bootstrap created the exact stopped-state
reader/automatic anchor; re-run verification changed no snapshot. Local Prisma5.22
status exit1 listed ONLY RLS pending. migrate deploy exited0 applying ONLY
20261004000000_rls_runtime_access; init not replayed, history2 successful steps0/1,
RLS checksum equals the NEW hash above. Local runtime created with explicit options.

Committed NestJS reference ran locally on3002 against this restored clone, using49
byte-identical compiled files in an ephemeral native-WSL copy. No production
credentials/.env copied, no provider/voice/POST calls. Restricted Go pool verified
read-only default, role/policy/ACL state, SELECT/raw-mapping denial, no SET, and
independent LOCAL DML/DDL denial42501 before repository/Nest parity.

Exact parity PASS:6 categories/all category filters/detail; all849 product IDs and
DTOs in price_asc, price_desc and name_asc, pages<=100 and bounded roundtrips. Search
results in required order: МОЛОКО44, %849, _849, backslash4, Молок%44, Молок_44,
backslash+%168, backslash+_0, literal/injection-shaped cases0/0.
This is LOCAL repository parity, not Go public HTTP API parity/live restricted proof.

Known runtime removed; operator executed corrected guarded rollback with anchor
still present: PASS. Reader/runtime/anchors disappear, RLS7/FORCE0/policies0/counts/
managed ACL unchanged. Successful LOCAL Prisma records intentionally retained;
no manual history edits/replay. Own Nest process/native copy and both labelled
Docker containers/volumes removed. Existing private production backup retained.

### Full quality/source protection and current state

| Actual gate | Result |
| --- | --- |
| gofmt cmd/internal/tests; gofmt -l empty | PASS |
| go mod tidy / go mod verify | PASS; all modules verified; go.mod/sum unchanged |
| full go test ./... | PASS:100 tests/7 packages |
| full go test -race ./... | PASS:100 tests/7 packages |
| go vet ./... / pinned staticcheck ./... | PASS |
| pinned govulncheck ./... | PASS:exit0, No vulnerabilities found |
| tagged integration vet / explicit lifecycle+fixture+clone parity | PASS as detailed above |
| contracts pnpm lint (Node24 final run) | PASS |
| protected-source diff / git diff --check | PASS |
| production PRE and FINAL READ-ONLY audit | PASS: unchanged stopped state |

Changed only three SQL artifacts, rollout_test.go, related security_test.go helper,
POSTGRES_LAYER.md and THIS report. NestJS runtime/Prisma schema/init/seed,
frontend/frozen contracts/API_V1_CONTRACT.md, Go business code/config/dependencies
and archive script unchanged. No new migrations, routes, public contract/bounds,
application data/schema redesign, secret/config edit, seed/import/parser, deploy,
brand rename, commit/push or Part05.

**Production is unchanged in this task:** existing reader + exact creator anchor,
RLS migration pending, runtime absent, RLS7/FORCE0/policies0. Part04 NOT complete;
live restricted runtime parity remains NOT RUN. Await explicit production resume
approval after external operator-membership review.

### Clean review archive

Permanent production-part-04 target rebuilt
`artifacts/production-part-04-review.tar.gz`. Verification PASS:305 files byte-match
current source/report/runbook; new SQL/source present; exclusion/known-credential
scan includes this task's six disposable passwords. No real env, private catalog
snapshot, DB dump/backup, credentials, Docker volumes, node_modules, build/test
outputs, temporary WSL workspace or Go binaries/profiles.

**Status: BLOCKED —
AWAITING_EXPLICIT_PRODUCTION_RLS_RESUME_APPROVAL_AFTER_OPERATOR_MEMBERSHIP_REVIEW.**
Stop for external review; no production resume or Part05 under this authorization.

## Owner-approved RLS resume after creator-membership review — STOP

### Authority, immutable source and preserved history

Executed ONLY `TODO/PRODUCTION_PART_04_RLS_RESUME_AFTER_CREATOR_MEMBERSHIP_REVIEW.md`.
The owner explicitly approved the corrected security rollout. This supersedes
the preceding approval-only blocker; it does not erase earlier missing-history,
bootstrap-membership or local-test failures. No superseded prompt was executed.

Fetch/prune PASS initially and again during final PRE. Branch integrate/full-stack,
clean tree before all production actions; HEAD=origin=
`a8f96dcaacd6c12d07a6ee5f9601718883ff8824`, message
`fix(db): handle PostgreSQL creator role membership`. SHA/tree/hashes were checked
again immediately before forward actions. Prisma5.22.0, Go1.27.1 linux/amd64,
PG client17.10, Docker29.1.3 preserved. No reviewed source/SQL was hot-edited.

| Exact reviewed artifact | Verified SHA-256 |
| --- | --- |
| init migration | `a5515ab64d6f8307df96971eb9ee1f7f41d6873e877d591167bde6450e881a92` |
| pending RLS migration | `aa5d016c002f9b9d7d1feb3de2b77bd667879466ec3e808f6452b620afe09e79` |
| reader bootstrap | `bd09e6cbdbe0fb292e721573184cacadde7d339be68845df8ca5d8e1cfd10a0d` |
| guarded rollback | `6d9d8bc377f985c37dc9e81252a0af79f80f5debe338cdb8544b3e4fa5f1a545` |

### Fresh backup, restore and PRE — PASS

NEW public schema-only and custom-format backup retained privately outside repo,
under the private backups/part04-rls-resume timestamp directory. Directory0700,
all dump/canonical-evidence files0600. Dump --schema=public --no-owner --no-acl;
no internal Supabase schemas or whole-platform recovery claim. Private canonical
metadata includes structure, ownership, full table ACL (MAINTAIN/grantors/options),
schema/database ACL/PUBLIC CONNECT, RLS/FORCE/policies, roles/both membership
directions, successful init history and seven counts. Before/after dump identical.

NEW task-owned postgres:17-alpine clone on loopback15440 used random disposable
credentials only. Restore as non-superuser CREATEROLE part04_operator, owning the
DB/all7 app tables, with --no-owner --no-acl --exit-on-error: exit0. Seven counts
and application structure match fresh live and reviewed init structural evidence;
init history restored as one successful baseline row. A separate clean fixture
cluster on loopback15439 used the unchanged init + INSERT-only fixture.

Because --no-acl omits privileges, the full canonical table/schema/database ACL
matrix was reconstructed locally and compared exactly, mapping production object
owner/grantor postgres to local part04_operator. MAINTAIN/options and special
pg_database_owner schema grantor were preserved; managed roles simulated as
safe NOLOGIN roles. No production credentials entered either container.

Both fresh paths passed the CURRENT committed artifacts/tests:

| Local profile | Clean fixture | Fresh restored clone |
| --- | --- | --- |
| TestReaderRolloutLifecycle (supplemental superuser Case A) | PASS:1 top-level +85 subtests | PASS:1 +85 |
| TestReaderCreatorAnchorLifecycle (primary non-superuser Case B) | PASS:1 +49 | PASS:1 +49 |

Actual forward→rollback→forward→rollback cycles, malformed-anchor refusals,
guard atomicity and exact count/ACL/ownership baseline preservation all passed.
The non-superuser topology was not weakened. No production repair/revoke used.

Fresh/final PRE matched the reviewed stopped state: RLS7/FORCE0/policies0,
safe NOLOGIN reader, no parents/ownership/direct/default ACL, runtime absent,
managed ACL/PUBLIC CONNECT unchanged. Reader had exactly one creator child:
role aktau_api_reader, member/current operator postgres, grantor supabase_admin
(superuser), ADMIN=true/INHERIT=false/SET=false. Operator non-superuser CREATEROLE;
MEMBER=true/USAGE=false/SET=false. Exactly init successful steps0/checksum above;
Prisma status exit1 listed ONLY 20261004000000_rls_runtime_access pending.
The pending exit was expected, not labelled up-to-date.

All application catalog/count batches explicitly SET default read-only on,
statement_timeout5000, then BEGIN READ ONLY; effective values checked. Startup
settings-only diagnostic below is separately identified, not an enforced catalog
batch or successful Go pool policy proof.

### Exact forward actions and immediate verification

1. Exact reviewed bootstrap executed once, psql ON_ERROR_STOP: exit0. Existing
   anchored reader verification/no-op PASS: full PRE/post security, roles,
   memberships, ACLs, counts, structure and Prisma history identical.
2. After renewed sole-pending/hash checks, `backend/: rtk pnpm exec prisma migrate
   deploy` executed ONCE, exit0. Applied ONLY 20261004000000_rls_runtime_access;
   init NOT replayed, no extra/failed/rolled-back record. Postcheck confirmed:

| Migration | Finished | Rolled back | Steps | Checksum |
| --- | --- | --- | ---: | --- |
| 20260923000000_init | true | false | 0 | init SHA-256 above |
| 20261004000000_rls_runtime_access | true | false | 1 | RLS SHA-256 above |

RLS7/FORCE0; exactly five permissive aktau_api_reader_select policies, SELECT,
TO reader only, USING(true), no WITH CHECK, only on the five runtime tables.
Reader has SELECT5 (grantor postgres) and public USAGE (grantor existing schema
owner pg_database_owner), all non-grantable. No raw/mapping policy/grant, database/
column/routine/type/default ACL, ownership or extra authority. Managed ACLs and
structure/counts unchanged; original creator anchor retained.

**Temporary verifier failure retained:** an outside-repo postcheck incorrectly
assumed the new schema-USAGE grantor would be postgres. It stopped on actual
pg_database_owner. Read-only inventory proved the grantor equals the existing
schema owner; this was not unexpected privilege/managed ACL drift. Corrected only
that temporary verifier assumption, then full postcheck PASS. No committed source
or reviewed SQL edited; no deploy retry, GRANT repair or production cleanup.

3. Only after full post-migration verification, created exactly one LOGIN
   aktau_api_runtime: INHERIT, NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/
   NOBYPASSRLS. Granted ONLY reader membership WITH ADMIN FALSE, INHERIT TRUE,
   SET FALSE. Runtime sole parent reader; MEMBER/USAGE=true, SET/ADMIN=false.
   No ownership or direct/default application/schema/database/routine/type ACL.
   High-entropy password retained ONLY in a private0600 file outside repo,
   enclosing directory0700. No password/DSN printed, passed as argv, committed,
   added to backend/.env, report, archive or diagnostic log.

PostgreSQL17 created a separate child/admin anchor on the LOGIN: role
aktau_api_runtime → member postgres, grantor supabase_admin, ADMIN=true,
INHERIT=false, SET=false. This is NOT a privileged runtime parent. Reader retains
its original operator anchor and the exact intended runtime child. No unknown
membership and no ad-hoc membership cleanup occurred.

### Restricted verification and first unresolved STOP

Through the actual restricted credential current_user=aktau_api_runtime:
explicit default/transaction read-only=on, timeout5s; SELECT5 returns full counts.
raw_products and product_mappings SELECT each denied42501, NOT zero rows.
SET ROLE reader denied42501. Catalog privilege metadata proves no seven-table
write/MAINTAIN permission, public CREATE, ownership or BYPASSRLS. No production
INSERT/UPDATE/DELETE/DDL denial experiment was attempted.

Local NestJS GET-only reference on3002 used unchanged existing production config,
49 byte-identical compiled files in an ephemeral native-WSL runtime/dependencies
copy. No .env copied, provider variables absent; categories GET200/6. No voice,
Gemini, Redis or POST calls. Owner access is NOT restricted Go proof.

Existing explicit live profile ran with ONLY restricted LIVE_DATABASE_URL,
LIVE_READONLY_CONFIRM=1 and local GET reference; destructive TEST/SMOKE/SECURITY/
OPERATOR credentials were absent:

```text
go test -count=1 -tags=integration ./tests/integration \
  -run '^TestLiveReadOnlyParity$' -v
exit 1
smoke_test.go:63: read-only policy
FAIL TestLiveReadOnlyParity
```

**STOP: LIVE_GO_READ_ONLY_POOL_SESSION_POLICY_FAILED.** The profile fails its
first SHOW default_transaction_read_only assertion BEFORE category/product
repository queries or any parity comparison. All849 product/order/DTO/search/
filter/detail live parity is therefore NOT VERIFIED. No mock/owner substitute,
test suppression, runtime source fix, extra migration or production repair.

One sanitized restricted startup-settings-only probe with requested PGOPTIONS
read-only on/timeout5000 returned defaults **off / 2min**. After explicit SET on/
5000 and BEGIN READ ONLY, effective defaults/transaction=on, timeout5s. This
reproduces the connection/provider startup-settings issue already recorded in
Phase A, before this security rollout. It is corroborating psql evidence, not a
claim that the failing Go assertion logged its exact returned value/error.
The reviewed Go pool uses startup RuntimeParams; that enforcement gate needs
separately reviewed investigation/hardening. Do NOT hot-edit it or weaken the
test under this immutable production-apply authorization.

Restricted current Go local health smoke actually PASS: /health/live200 statusok,
/health/ready200 statusready, /api/categories structured JSON404 remains unwired.
Connectivity/readiness success does NOT establish the read-only pool gate or
repository parity. No Go deploy/traffic cutover occurred.

### Final STOP-state production audit and rollback decision

Final READ-ONLY audit PASS: successful history2/steps0+1/exact checksums, Prisma
status exit0/up-to-date, RLS7/FORCE0/policies5, exact reader SELECT5+USAGE, safe
runtime/sole parent and both expected creator anchors. Zero owned objects,
unexpected direct/default ACL, role flag or membership. Application structure,
ownership, managed table/schema/database ACL incl MAINTAIN/grantors/PUBLIC CONNECT
remain equivalent to PRE, excluding only reviewed reader additions.

| Application table | PRE/dump/restored | Post-deploy/runtime/final |
| --- | ---: | ---: |
| stores | 3 | 3 |
| store_locations | 15 | 15 |
| categories | 6 | 6 |
| raw_products | 863 | 863 |
| canonical_products | 849 | 849 |
| product_mappings | 863 | 863 |
| offers | 863 | 863 |

No rollback executed: no RLS/ACL/authorization/count failure or repository-query
failure caused by DB security was observed. Failure is the pre-query session
policy gate, with the startup-setting effect independently recorded before this
rollout; no reviewed rollback trigger established. Reader/runtime and successful
migration are retained. Runtime password remains private. Do NOT rerun the
PRE-activation bootstrap, replay init/RLS or edit/resolve Prisma history. If a
later separately reviewed decision requires guarded rollback after applied RLS,
its successful migration marker MUST remain; reconciliation needs separate review.

### Actual checks, protection and cleanup

| Gate executed in this continuation | Actual result |
| --- | --- |
| Immutable SHA/clean tree/reviewed hashes | PASS, repeated before production actions |
| Fresh private backup + restore/count/schema/full local ACL reconstruction | PASS |
| Current Case A + primary Case B lifecycle, clean and clone | PASS as detailed above |
| Full tagged fixture `go test -count=1 -tags=integration ./... -v` | PASS:25 top-level +103 subtests; unmatched explicit profiles honestly SKIP |
| Full tagged restored clone same command | PASS:26 top-level +87 subtests; restricted smoke/security +9 local EXPLAIN cases; other profiles SKIP |
| Existing live TestLiveReadOnlyParity | FAIL:first read-only policy gate; comparisons NOT RUN |
| Local restricted Go health/ready/unwired404 | PASS, not parity/pool-enforcement proof |
| Final live READ-ONLY security/count/ACL/history audit + migrate status | PASS; rollout retained |
| Final plain go test/race/gofmt/tidy/verify/vet/staticcheck/govulncheck | NOT RUN after STOP; historical results not relabelled |
| Final contracts lint | NOT RUN after STOP |
| Protected source / git diff --check | PASS |

Supplemental tagged suites are NOT substituted for missing mandatory final plain
Go/security gates. Prior full-Go/Docker foundation proofs remain historical only.
No production EXPLAIN ANALYZE ran; all new plans/denial-DML/lifecycle probes local.

Own NestJS/Go clients stopped; native workspace/temp Go binary removed. Both
new labelled disposable containers/volumes removed with ownership checks; final
local ports free. Private backups/canonical evidence and runtime secret retained.
No production cleanup/write beyond exact reviewed migration + LOGIN/membership.
No application DML, seed/parser/import, unrelated role/managed ACL change, schema
redesign, index/extension/collation addition, config/.env edit, Go business route,
frozen contract/Frontend/NestJS source change, commit/push/merge/tag/deploy.
Only THIS report changes in Git; reviewed SQL/Go source remain byte-unchanged.

### Review archive and final status

Permanent target production-part-04: artifacts/production-part-04-review.tar.gz.
Rebuild and verification PASS: all305 archived files byte-match current source,
including this SAME report; exact reviewed SQL/tests/frozen contracts present.
Exclusion/credential scan includes all six new disposable passwords and the new
private runtime password. No real .env, secrets, dumps/backups/private canonical
snapshots, node_modules, build/test outputs, Go binaries/profiles, Docker volumes
or temporary native workspace. Archive is a BLOCKED review artifact, NOT completed
Part04 acceptance and NOT a database backup. Final git diff --check PASS; only
this report modified, all reviewed runtime/security/contract source unchanged.

**Status: BLOCKED — LIVE_GO_READ_ONLY_POOL_SESSION_POLICY_FAILED.**
Security metadata actions and least-privilege SQL verification PASS; full live
repository/session-policy and parity acceptance INCOMPLETE. Part04 is NOT DONE;
Part05 NOT STARTED. NestJS remains traffic owner. No Go production traffic cutover.
STOP for external review of the exact retained rollout state and a separately
scoped/immutable Go session-initialization hardening task, not ad-hoc repair.

## Go read-only pool session-policy remediation — local proof

### Immutable PRE and production diagnosis

Scope: TODO/PRODUCTION_PART_04_GO_POOL_SESSION_POLICY_REMEDIATION.md only.
Fetch --prune PASS; branch integrate/full-stack; HEAD=origin=
`a8f96dcaacd6c12d07a6ee5f9601718883ff8824`. Initial dirty tree contained only
the SAME preceding stopped-run report; it was preserved. Go1.27.1 linux/amd64;
no toolchain/dependency/version change. The four protected SHA-256 values matched
both before diagnosis and after source changes:

| Protected artifact | SHA-256 |
| --- | --- |
| init migration | a5515ab64d6f8307df96971eb9ee1f7f41d6873e877d591167bde6450e881a92 |
| RLS migration | aa5d016c002f9b9d7d1feb3de2b77bd667879466ec3e808f6452b620afe09e79 |
| reader bootstrap | bd09e6cbdbe0fb292e721573184cacadde7d339be68845df8ca5d8e1cfd10a0d |
| guarded rollback | 6d9d8bc377f985c37dc9e81252a0af79f80f5debe338cdb8544b3e4fa5f1a545 |

**Restricted connection mode: SUPAVISOR_SESSION.** Private DSN endpoint/port/user
shape matched the official shared-session mapping; target overrides were absent.
Classification used actual private configuration and the
[official Supabase connection-mode documentation](https://supabase.com/docs/guides/database/connecting-to-postgres),
not a guess based on connectivity. No DSN/host/project reference was printed or
recorded. Transaction/unknown mode would have stopped this task without a pool fix.

Before source edits, restricted current_user=aktau_api_runtime; startup-only
diagnostic SHOW returned default_transaction_read_only=off,
transaction_read_only=off, statement_timeout=2min. Explicit session SET plus
BEGIN READ ONLY returned on/on/5s. Subsequent restricted PRE queries were bounded,
explicitly READ ONLY and matched the last retained security evidence: RLS7/FORCE0,
exact policies5, table ownership, complete relevant table/schema/database ACLs
(including grantors/MAINTAIN), safe reader/runtime flags and memberships/anchors,
five allowed table counts. Restricted login cannot read raw_products,
product_mappings or Prisma history: seven-table counts/history above remain prior
verified rollout evidence, NOT newly claimed queries in this continuation.
No owner/operator production session was used; production diagnostics ended
before code edits. No production security/data/history/password change occurred.

### Root cause and minimal source changes

Previously OpenReadOnly configured RuntimeParams(on/5000) and a lazy pool.
Its config-object unit assertion did not prove effective physical-session values;
the earlier live assertion correctly exposed that gap and remains unchanged.

Changed source:

- backend-go/internal/postgres/pool.go
- backend-go/internal/postgres/pool_test.go
- backend-go/internal/postgres/pool_integration_test.go (new, integration-tagged)

Changed documentation: POSTGRES_LAYER.md and this SAME report only.

The pgxpool AfterConnect hook now executes fixed SETs then both SHOWs under a
shared bounded 2s child context. It requires readonly=on and timeout=5s-equivalent;
SET/SHOW/parse/mismatch failures return only a sanitized fixed error. pgxpool
rejects/closes a connection whose hook fails before handing it out. URL validation,
lazy MaxConns4/MinConns0, connect timeout2s and best-effort startup parameters remain.
No retry loop, timeout inflation, proxy dependency, SET ROLE or authorization bypass.
Role/ACL/RLS remains primary authorization; session policy is defense in depth.
No business SQL, HTTP route, live assertion or frozen contract changed.

Normal unit coverage retains config/redaction/outage cases and adds eight
initializer cases: success/equivalent milliseconds, SET failure, both SHOW failures,
readonly mismatch, timeout mismatch and malformed timeout. Errors do not expose
driver details; ordinary unit tests have no network/environment fallback.

### Connected LOCAL proof and regression results

Two fresh labelled loopback-only disposable postgres:17-alpine targets were created
with disposable credentials. Existing private public-schema backup was restored
again into the clone: exit0, all seven application counts/schema/history matched
its saved PRE evidence. No fresh production backup or production mutation in this
task. Counts: stores3/locations15/categories6/raw863/canonical849/mappings863/offers863.

The connected proof requires only explicit POOL_POLICY_DATABASE_URL, dedicated
local DB/restricted login and effective loopback targets (including fallbacks);
it never falls back to DATABASE_URL or an env file. Four acquisitions are held
simultaneously; distinct backend PIDs plus acquired/total stats4 prove physical
sessions rather than reusing one connection. All four report default readonly=on,
timeout5s, and ordinary transactions readonly=on. Both variants PASS:
actual OpenReadOnly startup parameters intact, and test-only startup parameters
omitted against verified LOCAL login defaults off/2min. A real closed physical
connection cannot complete initialization: acquisition fails with the sanitized
error and no usable/acquired connection. Production live profile was NOT RUN.

| Executed gate | Actual result |
| --- | --- |
| gofmt -w cmd internal tests; gofmt -l . | PASS; listing empty |
| go mod tidy; go mod verify | PASS; go.mod/go.sum unchanged |
| Full go test -count=1 -json ./... | PASS:23 top-level +86 subtests, failed0 |
| Full go test -count=1 -json -race ./... | PASS:23 top-level +86 subtests, failed0 |
| go vet ./...; pinned go tool staticcheck ./... | PASS |
| pinned go tool govulncheck ./... | PASS exit0: No vulnerabilities found |
| Full tagged fixture go test -count=1 -tags=integration ./... -v | PASS:26 top-level +111 subtests |
| Full tagged restricted clone same command, physical pool + NestJS reference | PASS:29 top-level +98 subtests |
| Existing legacy lifecycle clean + restored clone | PASS:85 subtests each |
| Primary non-superuser creator-anchor lifecycle clean + restored clone | PASS:49 subtests each |
| contracts rtk pnpm lint (Node24) | PASS |
| Protected source diff / four reviewed SQL hashes | PASS: unchanged |
| git diff --check | PASS |

Profile-specific tests without their explicit environment honestly SKIP; independent
profile runs above supply their proofs. The first legacy clone launch accidentally
overlapped LOCAL restore/managed-ACL preparation and failed its PUBLIC CONNECT
precondition. After preparation completed, the unchanged suite was rerun sequentially
and passed both targets; no assertion or SQL artifact was weakened. No production
access was involved in that harness sequencing error.

Restricted clone repository/security checks PASS: categories, discovery, detail,
typed filters/brand/OR-AND, offers/minPrice/snapshot, bounded roundtrips, LOCAL write
denial, raw/mapping and SET ROLE denial. All849 usable products matched the LOCAL
NestJS reference exactly for price_asc/price_desc/name_asc, via bounded pages.
Wildcard searches matched: МОЛОКО44, %849, _849, backslash4, Молок%44, Молок_44,
escaped-percent168, escaped-underscore0, absent literal0 and injection attempt0.
Nine LOCAL EXPLAIN ANALYZE cases PASS. Reference used the restricted LOCAL clone
credential; 49 copied compiled NestJS files were byte-identical, no env/secrets copied.

### Production boundary, archive and final status

TestLiveReadOnlyParity with modified source: **NOT RUN — explicitly forbidden**.
Production RLS/runtime state was retained; no migration/bootstrap/rollback, role,
grant/policy/ACL, password, application DML, seed/parser/import, Prisma-history or
config/.env mutation against production. No Supabase call after source edits.
No backend/frontend/contracts/config/catalog/repository-business source change;
no public Go catalog route, Part05, traffic cutover, commit/push/merge/tag/deploy.

Cleanup PASS: only the two ownership-labelled disposable containers/volumes and
the task's native NestJS reference workspace were removed. Local reference and DB
ports are free; private backup/evidence and existing runtime secret remain outside
repo. No production cleanup or mutation was performed.

Permanent target production-part-04 rebuilt artifacts/production-part-04-review.tar.gz.
Verification PASS: all306 files byte-match current source, including this SAME
report and all three changed/new Go files; required reviewed SQL is present.
No real env, DSN/private host/project reference/runtime password, known disposable
credentials, private-key patterns, dumps/backups/canonical private evidence,
node_modules, build/test output, Go binaries/profiles, Docker volumes or native
workspace. Exclusions, known-value secret scan and ELF scan PASS. Final protected
source diff empty, reviewed hashes unchanged, git diff --check PASS; only the five
allowed source/docs files differ. This is a BLOCKED review artifact, not a DB backup
or completed Part04 acceptance.

**Status: BLOCKED — AWAITING_EXTERNAL_REVIEW_AND_IMMUTABLE_COMMIT_FOR_LIVE_POOL_VALIDATION.**
Local Go pool session-policy remediation PASS. Modified Go source has NOT run
against production. Part04 is incomplete; Part05 NOT STARTED. Next boundary:
external review → owner commit/push of immutable source → separately owner-approved
read-only live session-policy and parity validation. STOP for external review.
