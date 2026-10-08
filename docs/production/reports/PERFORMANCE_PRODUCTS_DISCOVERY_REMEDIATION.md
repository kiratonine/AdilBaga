# Products discovery — focused performance remediation

Status: **READY_FOR_EXTERNAL_REVIEW**.

Date: 2026-10-08. Scope: accepted `PERFORMANCE_AUDIT_2026_10_08.md`; no Part17 work.

## Baseline and safety

`git fetch origin --prune` completed. Working branch: `integrate/full-stack`.
At preflight, HEAD = origin/integrate/full-stack = origin/main =
`45314932e1606911ac1f927d3a07b60ac084d3d4`; divergence 0/0.
The merged OSM hotfix is included and untouched. The only pre-existing working-tree
change was the accepted, untracked performance audit; it was preserved unchanged.

No production endpoint/database/provider access was performed in this remediation.
No deployment, commit, push, ingestion or infrastructure change was performed.
All database setup and writes below were confined to new task-owned disposable
loopback PostgreSQL containers using the existing local CI harness.

## Minimal implementation

`products()` now discovers filter definitions only when the parsed query contains
a key outside `category`, `search`, `sort`, `limit`, `offset`, and the existing
single nonblank category condition holds. Unknown dynamic keys still trigger
discovery and fail strict query validation; they are not silently discarded.

The query parser, PostgreSQL repositories, snapshot helpers, usable-offer rules,
pagination bounds, sort/default behavior, DTOs and error envelopes are unchanged.
An unknown category with base parameters still returns an empty array with 200;
an unknown category with a dynamic filter still returns 400. Discovery errors on
the dynamic path retain the existing fail-closed handling.

Changed implementation/test files:

- `backend-go/internal/httpapi/catalog.go`: one additional discovery condition.
- `backend-go/internal/httpapi/product_query.go`: base-key classification helper.
- `backend-go/internal/httpapi/catalog_test.go`: test-repository discovery counter.
- `backend-go/internal/httpapi/product_discovery_test.go`: focused regressions.

No changes to frontend, NestJS, frozen contracts, Go dependencies, SQL, migrations,
Prisma, Redis/Gemini/Voice, revalidation or production image/environment.

## Focused coverage

`TestProductDiscoveryCalls`: 23 table cases PASS. Base-only queries call
GetFilterSchema **0 times**; dynamic queries with a valid scalar category call it
**1 time**, including unknown filters/categories and invalid typed values.
Repeated base parameters, limit 0/101, negative offset and unsafe-integer offset
remain 400. Numeric repeated filters retain numeric JSON values, boolean false
remains boolean, and brand remains a string. Dynamic filters without a category
or with repeated category remain 400 without discovery.

`TestBaseProductsWithoutCategoryRepository`: PASS; a base-only request succeeds
even when no category repository is supplied. Existing `TestProductQuery` and
`TestReadHandlers` also pass, retaining defaults, query errors and sanitized 500s.

## Bounded before/after measurement

Environment: WSL Linux/amd64, Go 1.27.1, Node 24.10.0, Docker 29.1.3,
disposable `postgres:17-alpine`. No artificial latency or production data was used.
The final baseline binary was built from an isolated `git archive HEAD backend-go`
copy of the exact committed SHA, not from the edited working tree. The candidate
binary was built with the same `go build ./cmd/api` settings. Disassembly confirmed
the discovery guard is present only in the candidate. Both processes used the same
loaded `backend-go/tests/fixtures/catalog.sql`, restricted local runtime role,
configuration and database. This small fixture has four public usable products
and two visible categories; it is not a production-size benchmark.

Each query received three warmup requests per binary and fifteen measured requests
per binary. Before/after order alternated each pair; requests were sequential,
not a load test. Duration includes local HTTP request, body read and JSON decode.
Every measured pair had identical status 200 and byte-equivalent JSON serialization.
The search uses percent-encoded Cyrillic `молоко`, matching the fixture names.

| Query after `/api/products?` | Before median, ms | After median, ms | Samples per binary |
| --- | ---: | ---: | ---: |
| `category=milk&sort=price_asc&limit=24&offset=0` | 4.783 | 2.819 | 15 |
| `category=milk&search=молоко` (percent-encoded on wire) | 4.453 | 2.815 | 15 |
| `category=milk&volumeMl=1000` | 5.177 | 5.161 | 15 |

Final benchmark request count: **108** (90 measured + 18 warmup), excluding readiness,
parity and contract requests. Discovery counts are proven separately by the mock
counter tests; these timings do not constitute SQL query-count instrumentation.

An initial 108-request round was discarded: asynchronous baseline compilation
overlapped the source edit and disassembly showed both binaries contained the
candidate guard. Its timings are not before/after evidence. The final round above
used a separately built immutable HEAD copy and verified binary differences.
Across both rounds, 216 benchmark requests were made, all local.

Base-only local medians decreased by 1.964 ms and 1.638 ms; the dynamic-filter
control was effectively unchanged. This single small-fixture sample is not a
statistical confidence study or a production capacity measurement. The confirmed
benefit is removal of unnecessary discovery work; no production speedup or RSC
improvement is promised. Dynamic-filter discovery intentionally remains unchanged.

## Mandatory verification results

All commands below completed with exit 0. Go ran with `GOTOOLCHAIN=local`.

- `gofmt -l cmd internal tests`: empty; modified Go files were formatted.
- `go mod verify`: all modules verified; go.mod/go.sum unchanged.
- `go test -count=1 ./...`: PASS.
- `go test -race -count=1 ./...`: PASS.
- `go vet ./...`: PASS.
- Pinned `go tool staticcheck ./...`: PASS.
- Pinned `go tool staticcheck -tags=integration ./...`: PASS.
- Pinned `go tool govulncheck ./...`: exit 0, **No vulnerabilities found**.
- Unchanged `scripts/ci/run-db-integration.mjs`: PASS, including race-enabled
  deterministic catalog, typed filters, sorts/pagination, dashboard, snapshot
  security, ingestion atomicity, restricted identity, physical pool policy,
  query plans, observability and restricted-role regressions.
- Nest reference `pnpm db:generate` and `pnpm build`: PASS; source unchanged.
- Local `TestHTTPParity` and `TestLocalSecurityQueryParity`: PASS. Full fixture
  product order/DTO parity for price_asc, price_desc, name_asc; discovery,
  dynamic filters, repeated parameters, detail, ten search cases, query errors
  and dashboard. Four public products and two categories, not production parity.
- `contracts` lint: PASS; offline test: **12 PASS, 10 profile-dependent SKIP**.
- Frozen GET `contracts pnpm test:live` against each local Go/Nest process:
  **18 PASS, 4 Voice-profile SKIP** per backend. Despite the command name,
  both targets were explicit loopback fixture servers, not production.
- `git diff --check`: PASS.

An initial contracts invocation used the shell's Node20 and emitted an engine
warning despite passing. Lint/tests were rerun successfully under supported
Node24.10.0; the final contract results above refer to that rerun.

The Go full suites retain their existing guarded live-profile skips when explicit
live inputs are absent; the listed local integration/parity profiles were actually
executed, not inferred from those skips. No real provider smoke or production
benchmark was required or performed. Task-owned PostgreSQL containers and Go/Nest
processes were cleaned up successfully.

## Review boundary

The accepted audit remains unchanged. This report is the focused remediation
evidence. Production performance impact remains unmeasured until a separately
authorized reviewed release and bounded production observation. No further
optimization is proposed from these small-fixture timings.
