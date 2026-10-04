# Production Part 05 — Combined Catalog + Dashboard API parity

Status: **READY_FOR_EXTERNAL_REVIEW**

Combined scope: roadmap Part05 Catalog API parity + roadmap Part06 Dashboard
production rewrite. Owner confirmed Part04 external PASS. Validation completed
2026-10-04. NestJS remains traffic owner; no Go deploy/cutover. Part07 NOT STARTED.
No separate PART_06_REPORT.md is created for this batch.

## Immutable starting provenance

Fetch origin --prune PASS; branch integrate/full-stack; starting tree clean.
HEAD=origin/integrate/full-stack:
`1ad693eae554a41390a414e99929569d07fd08fd`.
Direct parent: `4082a92912cba37e7e020d714f1709f06b378c74`.
The committed parent-to-HEAD delta is exactly docs/production/reports/PART_04_REPORT.md,
the owner's final report-only commit. No reset/rebase/merge was used.

## Changed files and implementation

- backend-go/cmd/api/main.go
- backend-go/internal/httpapi/server.go
- backend-go/internal/httpapi/server_test.go
- backend-go/internal/httpapi/catalog.go (new)
- backend-go/internal/httpapi/catalog_test.go (new)
- backend-go/internal/httpapi/product_query.go (new)
- backend-go/internal/dashboard/models.go (new)
- backend-go/internal/postgres/dashboard.go (new)
- backend-go/internal/postgres/dashboard_integration_test.go (new)
- backend-go/tests/fixtures/catalog.sql
- backend-go/tests/integration/catalog_test.go
- backend-go/tests/integration/http_parity_test.go (new)
- scripts/create-clean-archive.mjs
- docs/production/reports/PART_05_REPORT.md (this new report)

One reviewed read-only pool and one repository adapter are created in main;
router receives category/product/dashboard interfaces through a small Dependencies
struct. Five public GET endpoints are wired without a new envelope. Existing pool
initialization, max4/min0/connect2s/read-only/statement5s policy is unchanged.
No Go runtime dependency on raw_products/product_mappings.

HTTP parsing preserves default limit24/max100/offset0/MAX_SAFE_INTEGER, exact
sort enum, single standard parameters, trimmed category/search, unknown category
without dynamic filters returning []. Dynamic keys are category-schema allowlisted;
numeric/boolean/string types, repeated same-key OR and cross-key AND are retained.
Unknown key/option/category-with-filter returns400. No search<=200 bound is added.
Opaque product/category strings remain opaque, not UUID validated. Responses/errors
are JSON; repository failures are sanitized500, validation400, missing404. Query,
SQL, credentials and driver errors are not exposed or logged by the new handlers.
Product snapshot wire strings use UTC three-digit milliseconds, matching
Date.toISOString without changing repository time.Time models.

## Dashboard SQL architecture and plans

GetDashboard performs exactly **one SQL roundtrip**, returning only final analytics
JSON. SQL materializes usable offers once, groups summary/spreads, joins real
locations, and selects each chain's cheapest fixed slot with row_number. No full
Product DTO hydration/page scan in Go, N+1 or per-product/store query loop.
Only existing five readable tables are used; no view/index/migration/schema change.

Summary excludes out-of-stock/zero-price/no-offer products; snapshot is max usable
offer timestamp. Spreads require two distinct chains, use reference floating-point
rounding, and sort percent DESC/id ASC. Locations retain DB store.code/name/id order.
Baskets keep DINA/DANA/FIX_PRICE order, milk1000ml/sugar1000g/oil1000ml only, JSONB
numeric exact attributes (not string equivalents), price then binary ID tie-break,
null/null/null missing positions and sum of found prices only. No category fallback.

Restricted LOCAL PostgreSQL17 EXPLAIN ANALYZE of the exact final dashboard SQL:
planning6.059ms, execution6.212ms, one result row. Usable join863 rows/canonical849;
aggregate849, spreads14, locations15, fixed slots3×stores3, candidates51 and winners9.
Small sequential scans/hash joins/CTE scans and bounded sorts are appropriate for
this dataset; no index/extension proposal is justified. Existing nine catalog plans
plus the new dashboard plan passed. No production EXPLAIN ANALYZE was run.

HTTP cache TTL/ETag/conditional304 is intentionally deferred: frozen v1 fixes no TTL
or ETag representation. No new cache guarantee, status or in-memory source-of-truth
cache is introduced. Snapshot/freshness work remains a later scope.

## LOCAL proof and quality gates

Existing private application backup was freshly restored into disposable PG17;
clone counts matched all seven retained application counts. A separate fresh
schema/INSERT fixture exercises multi-chain spread, milk per-store prices, oil
in one store, missing sugar slots, typed attributes, locations and max usable
snapshot. Two synthetic StoreLocation rows were added only to the test fixture.

| Gate | Actual result |
| --- | --- |
| gofmt -w cmd internal tests; gofmt -l . | PASS, listing empty |
| go mod tidy/verify | PASS; go.mod/go.sum unchanged |
| Full Go unit ./... | PASS, 28 top-level +104 subtests, failed0 |
| Full Go race ./... | PASS, 28 top-level +104 subtests, failed0 |
| vet ./... | PASS |
| staticcheck normal and integration tags | PASS both |
| govulncheck ./... | PASS, no vulnerabilities found |
| Full tagged deterministic fixture ./... | PASS, 31 top-level +130 subtests |
| Full tagged restricted clone ./... | PASS, 35 top-level +150 subtests |
| Legacy reader lifecycle, clean/clone | PASS, 85 subtests on each |
| Non-superuser creator-anchor lifecycle, clean/clone | PASS, 49 subtests on each |
| Physical pool-policy integration | PASS, four distinct held connections in both intact/omitted startup cases; failed initialization not acquirable |
| LOCAL repository NestJS/Go parity | PASS, 849×three sorts, filters/detail, ten searches |
| Restricted clone security / catalog plans / dashboard SQL plan | PASS |
| Explicit LOCAL HTTP NestJS/Go parity | PASS, 5.34s, 19 named phases; exact dashboard equality |
| NestJS build/test | PASS, 25/25 tests, no source change |
| contracts lint/offline test | PASS; 12 offline assertions, ten HTTP tests honestly skipped without origin |
| LOCAL clone frozen GET profile, NestJS and Go | PASS each, 18 passed/four voice skipped |
| NestJS deterministic fixture contract profile | PASS, 22/22 including existing reference-only voice tests |
| Go deterministic SQL fixture frozen GET profile | PASS, 18 passed/four voice skipped |
| Docker runtime regression | PASS |

NestJS and Go deterministic fixtures are **not identical datasets**: NestJS uses
the frozen example fixture; Go keeps its established typed/security SQL fixture.
Therefore Go SQL-fixture black-box validation used the existing data-agnostic GET
profile (named live by the tool, but backed only by LOCAL fixture DB), not frozen
example equality or unimplemented Go voice. Exact cross-backend equality was
proved on the shared restored clone and production snapshot. Skipped opt-in
integration profiles were independently executed under their correct explicit
credentials; a skip was not counted as PASS.

Docker image adilbaga-part05-api:review: multi-stage unchanged, UID10001, compiler
absent, read-only filesystem/tmpfs, healthcheck healthy. Local categories/products/
dashboard200; live/ready200 with DB, live200/ready503 when disposable DB stopped,
ready200 recovery without API process restart. Clean SIGTERM exit0 in434ms.
Image contains no baked credential. No production Docker deployment.
Separate LOCAL container with deliberately unavailable loopback DB/no production
credential confirmed POST /api/voice/start and /api/voice/continue structured404,
and POST /health/live structured405. No voice/provider implementation or call.

## Production READ-ONLY proof

All mandatory LOCAL gates passed before production access. Candidate Go source
fingerprint was retained privately and rechecked; no source hot-fix occurred after
this boundary. New candidate was run locally only, using the existing restricted
aktau_api_runtime credential, not owner credentials. Mode remains SUPAVISOR_SESSION;
raw startup off/off/2min was not manually primed. Committed pool initializes its own
read-only policy. Unchanged NestJS loopback reference used its existing configuration;
49 compiled files byte-matched the native WSL copy; no .env copied/provider calls.

Fresh canonical PRE and POST audits PASS with connection-local read-only on,
statement5s and BEGIN READ ONLY. Exact RLS7/FORCE0/policies5, owners, reader/runtime
safe flags, memberships/control-plane anchors, SELECT5+public USAGE only, no
raw/mapping access, no unexpected direct/column/default ACL, full managed ACL
including MAINTAIN/grantors, PUBLIC CONNECT and history2 were unchanged.
Prisma **migrate status only**, PRE/POST: exit0/up to date; init steps0/RLS steps1,
successful exact checksums, no failed/extra/rolled-back history. No SQL artifact
was executed against production.

| Table | PRE | POST |
| --- | ---: | ---: |
| stores | 3 | 3 |
| store_locations | 15 | 15 |
| categories | 6 | 6 |
| raw_products | 863 | 863 |
| canonical_products | 849 | 849 |
| product_mappings | 863 | 863 |
| offers | 863 | 863 |

Restricted Go health live/ready200. Frozen production READ-ONLY GET profile against
NestJS and Go: PASS each, 18 passed/four voice tests deliberately skipped.
New TestHTTPParity production run: **PASS, 288.00s**, all849 exact decoded DTO/order
matches in price_asc/price_desc/name_asc, six category schemas, representative
dynamic OR/AND queries/details, default/limit100/offset, compatible400/404 envelopes,
and exact dashboard equality. Page ceiling/duplicate-ID protection/fresh15s GET
budgets remain bounded; no third-party/provider requests or writes.

| Search | LOCAL and production exact count |
| --- | ---: |
| МОЛОКО | 44 |
| % | 849 |
| _ | 849 |
| Single backslash | 4 |
| Молок% | 44 |
| Молок_ | 44 |
| Escaped percent | 168 |
| Escaped underscore | 0 |
| Absent literal | 0 |
| Injection-shaped literal | 0 |

Exact production dashboard: canonical849/stores3/matched14/spreads14/locations15,
snapshot2026-09-26T11:36:05.102Z; baskets:

| Chain | Total KZT | Missing slots |
| --- | ---: | --- |
| DINA | 2230 | none |
| DANA | 1963 | none |
| FIX_PRICE | 2050 | none |

No production DDL/DML, migrations/resolve/deploy, roles/grants/policies, password
rotation, bootstrap/rollback or Prisma-history changes. Audits used only authorized
SELECT/SHOW/read-only transactions/connection-local safety settings. Prisma skill
was used solely to keep status-only verification separate from mutation commands.

## Integration impact, cleanup and archive

backend/**, frontend/**, contracts/**, Prisma schema/security and reviewed Go pool
are byte-unchanged. Frozen OpenAPI/examples and API_V1_CONTRACT remain unchanged.
Frontend consumer requires no change. Runtime source is only Go and permanent
archive-target changes listed above. No new dependency, migration history, fixture
runtime fallback, Gemini/Redis or Voice implementation. Historical foundation docs
are not a new cutover authorization; this report records current combined scope.

Only this task's owned loopback clients, native workspaces/temp binaries, labelled
containers/network/volumes were removed; owned ports are free. Private backups,
credentials and canonical audit evidence stayed outside repo. Production retained
its original security/data state; no production cleanup.

Permanent production-part-05 target rebuilt artifacts/production-part-05-review.tar.gz.
Verification PASS: all315 files byte-match current source/report; required new
handlers, dashboard SQL/domain, HTTP harness and permanent target included. No
real .env, known production/local credential, private-key pattern, DB dump/backup/
canonical audit evidence, node_modules, generated/build/test output, Go binary/
profile/ELF, Docker data or native temporary workspace. Current report matches
archived report bytes; final git diff --check PASS. No secret printed or staged.

Remaining blockers: **none found in mandatory gates**. This batch still requires
external review before accepting roadmap05+06 as complete. NestJS remains traffic
owner; Go public Voice is intentionally not implemented. No commit/push/merge/tag,
deploy/cutover or Part07. STOP for external review.
