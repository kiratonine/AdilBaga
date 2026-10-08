# Production Part 07 — Voice / Gemini / Redis / Geolocation

Status: **READY_FOR_EXTERNAL_REVIEW**

Latest continuation (2026-10-05): the four approved ST1005 fixes and all remaining
Go/local/provider/production READ-ONLY/Docker/reference/contract gates PASS.
The refreshed clean archive also passed verification. See the final remediation
section below. Earlier stopped-run sections are historical evidence, not the
current gate status; both initial blockers are intentionally preserved.

Combined Part07 implementation stopped at the required real Gemini structured
parse gate on 2026-10-04. This is a **partial, unaccepted candidate**, not completed
production parity. NestJS remains traffic owner. No deploy/cutover or Part08.

## Provenance

Fetch origin --prune completed. Initial working tree clean; branch
integrate/full-stack. HEAD=origin/integrate/full-stack:
`8e0c53010b1ef6977b2148fb79caa32ed62ee2f3`.
Direct parent `1ad693eae554a41390a414e99929569d07fd08fd`;
commit message `feat(go): add catalog and dashboard API parity`.
Initial git diff --check PASS. Go go1.27.1 linux/amd64; Docker client/server29.1.3.

## Implementation — initial candidate description

Two POST routes delegate strict request decoding to a high-level voice service.
Coordinates accept finite JSON numbers/decimal or exponent strings with range
validation; text/sessionId are nonblank and opaque without new length bounds.
Responses use201/no-store and the existing compatible error envelope.

Typed state, approved keyword fallback, reference clarification order/questions,
intent/category/filter merge, cryptographically random session IDs and TTL600
are implemented. Product selection requests price_asc with repository Limit1/3;
one small location query serves the result page. Haversine uses Earth radius6371000,
first exact tie and Math.round-compatible distance. Single/list/empty speech
wording is ported from NestJS. These paths have unit proof only at this stop.

Gemini REST uses the existing model and structured response JSON schema built
from category definitions; decoded output is independently checked against real
allowlisted typed options. Ordered deduplicated keys share one8s deadline.
429/5xx/network/timeout may retry; request/auth4xx and malformed successful output
stop the chain. Only finite outcome classes are logged, without prompt/key/body.
The approved deterministic NLP fallback is separate from product/store decisions.

Upstash REST implements only session SET EX600/GET/DEL, bounded responses and
timeouts, with no production memory fallback. GET/SET/completion DELETE failures
map to503; the DELETE rule follows the frozen contract rather than NestJS's
best-effort cleanup. Production configuration requires HTTPS Upstash/token and
at least one Gemini key. Missing nonproduction sessions stay unavailable.
Additional bounded IP rate limiter and a nonblocking concurrency semaphore wrap
both voice routes; existing global limiter/request budgets remain unchanged.

## Changed files

- backend-go/.env.example
- backend-go/cmd/api/main.go
- backend-go/internal/config/config.go
- backend-go/internal/config/config_test.go
- backend-go/internal/config/voice_test.go (new)
- backend-go/internal/httpapi/server.go
- backend-go/internal/httpapi/voice.go and voice_test.go (new)
- backend-go/internal/httpapi/voice_outage_test.go (new)
- backend-go/internal/voice/models.go, state.go, fallback.go, service.go,
  service_test.go (new)
- backend-go/internal/gemini/client.go and client_test.go (new)
- backend-go/internal/redis/session.go and session_test.go (new)
- backend-go/internal/location/haversine.go and haversine_test.go (new)
- backend-go/internal/postgres/locations.go (new)
- backend-go/internal/middleware/voice_limit.go and voice_limit_test.go (new)
- backend-go/tests/integration/voice_live_test.go (new)
- backend-go/tests/integration/voice_diagnostics_test.go (new)
- backend-go/tests/integration/voice_parity_test.go (new)
- scripts/create-clean-archive.mjs: permanent production-part-07 target
- docs/production/reports/PART_07_REPORT.md (this report)

Frozen OpenAPI/examples/API_V1_CONTRACT, NestJS, frontend, Prisma, Go pool source
and pool tests are unchanged. No Go module dependency change.

## Historical checks — initial stopped run

| Gate | Actual result |
| --- | --- |
| Immutable Git/toolchain preflight | PASS |
| Baseline govulncheck ./... before implementation | PASS, no vulnerabilities found; not final candidate security acceptance |
| gofmt -w cmd internal tests | Executed successfully before unit and live-profile runs |
| Full Go unit go test ./... | PASS, ten tested packages; three packages have no tests |
| TestLiveGeminiStructuredParse, explicit opt-in | **FAIL**, exit1,8.01s; real structured NLP unavailable |
| Protected-source diff | PASS, empty |
| Final race/vet/staticcheck/govulncheck/tidy/verify | NOT RUN after STOP |
| Existing Part04/05 SQL/security/lifecycle/pool/GET integration | NOT RUN in this batch after STOP; historical PASS is not substituted |
| LOCAL NestJS–Go voice HTTP parity | NOT RUN |
| LOCAL location query EXPLAIN ANALYZE | NOT RUN |
| Real isolated Upstash session validation | NOT RUN |
| Production DB PRE/POST audit/status | NOT RUN; production PostgreSQL was not accessed |
| Real Go voice / deterministic production-snapshot parity | NOT RUN |
| Docker runtime regression | NOT RUN |
| NestJS build/test and contracts lint/offline/HTTP profiles | NOT RUN in this batch after STOP |

Unit tests exercised request numeric/string boundaries and invalid bodies, opaque
sessions, state/fallback validation, session refresh/delete and failures, TOP1/3,
speech, Haversine tie behavior, key order/retry classification/shared deadline,
invalid provider outputs, bounded Redis responses, concurrency/rate and privacy
sentinels. No unit test used real providers or PostgreSQL.
The unit run preceded adding the opt-in integration file; that file subsequently
compiled in the failed tagged Gemini profile. No final full-suite claim is made.

## Live Gemini blocker and STOP

Existing local credentials were confirmed configured without exposing values.
The explicit live profile invoked the Go Gemini client **directly**, not the NLP
fallback wrapper, against a static nonpersonal request. It failed to return one
independently validated structured parse within the bounded chain; test duration
8.01s, process exit1. The sanitized error was `real structured NLP unavailable`.
The profile did not retain a provider HTTP status/outcome class; no429/auth/server
classification or root-cause claim is made from elapsed time alone.

Per Part07 sections63/88, this failed mandatory gate requires STOP. No further
provider retries, credential changes, source hot-fix or production validation
was performed. Owner/external review must resolve the provider prerequisite and
authorize continuation before this candidate can complete its remaining gates.
Fallback does **not** count as real Gemini integration PASS.

## Historical initial-run safety, integration impact and remaining gates

No production PostgreSQL access or mutation; no migrations/schema/data/security
changes. No Upstash request/session write was made. Only authorized live Gemini
NLP traffic occurred. Provider secrets stayed in process memory/private tooling
outside the repository; no .env was copied, printed, staged or modified.
No task Docker containers, networks, volumes or application processes were started.
Private sanitized test evidence remains outside repo.

The candidate's production startup now intentionally requires voice provider
configuration. Existing Docker/harness production launchers must supply explicit
configuration or use the documented nonproduction test wiring; these regressions
have not yet been executed. HTTP voice equality, real Redis behavior, production
read-only audits/parity, exhaustive integration/security gates and Docker acceptance
are outstanding. Do not deploy this partial implementation.

Physical Siri against Go production origin: **NOT RUN until staging/deploy**.
Shortcut wire shape was not changed; no physical-device PASS is claimed.
Future edge requirements remain stricter /api/voice/* limiting and no POST cache;
Cloudflare implementation is outside this scope.

## Review archive

Permanent target production-part-07 creates
`artifacts/production-part-07-review.tar.gz` for **blocked partial-source review**.
Archive verification PASS:334 files byte-match current source, including this
report; required new source present. No real .env, known provider/DB/runtime
credential, generic API/private-key pattern, DB dump/backup/private evidence,
node_modules/build/test output, Go binary/profile/ELF or temporary workspace.
Final git diff --check PASS. No commit/push/merge/tag,
deploy/cutover or Part08. STOP for external review.

## Gemini diagnostic remediation and resume — 2026-10-04

### Provenance and scope preservation

Fetched origin --prune again. HEAD=origin remains
8e0c53010b1ef6977b2148fb79caa32ed62ee2f3 on integrate/full-stack.
Working tree contained only the known Part07 candidate/report. No reset/restore,
discard/reimplementation or unrelated changes. Initial continuation diff-check PASS.

The initial LIVE_GEMINI_STRUCTURED_PARSE_FAILED /8.01s STOP remains recorded above.
That run had no outcome capture and does not establish a provider root cause.

### Safe diagnostic change

Added backend-go/tests/integration/voice_diagnostics_test.go with a test-local slog
handler. It retains only an exact finite allowlist of provider_outcome_class
strings, discarding record messages, other attributes, ambient WithAttrs/groups
and unknown/wrong-type values. A deterministic unit test injects private-looking
sentinels and proves only the safe timeout class reaches its summary.
Updated voice_live_test.go to supply this handler and print only the allowlisted
sequence, fixed budget and elapsed seconds. No raw slog record, key/prompt/body,
URL/header/text/session/coordinate data is printed.

No Gemini runtime source/model/schema/credentials/timeout change was necessary.
The production constructor still uses the shared8s deadline. No20s validation
override was added or exercised because the exact8s retry succeeded.

### Direct real Gemini gate

Executed exactly one new production-budget direct test:
TestLiveGeminiStructuredParse, explicit LIVE_GEMINI_CONFIRM=1,
go test -count=1 -tags=integration ./tests/integration with the exact test selector.

**PASS**, process exit0, elapsed3.08s, safe sequence **outcomes=[success]**.
Real structured JSON independently passed voice.Validate and required
intent/category/typed filter extraction. The direct client has no fallback wrapper;
fallback was not involved and is not counted as provider proof.

The diagnostic decision path therefore ended at section6 PASS, without model/key
rotation, request-shape probing, latency controls, repeated provider calls or
timeout inflation. The original8.01s cause cannot be inferred retrospectively;
current compatibility is proven, not a claim that every runtime request avoids
fallback. Runtime bounded-timeout deterministic fallback remains unchanged.

### Resume checks and new mandatory blocker

| Executed continuation gate | Actual result |
| --- | --- |
| Safe diagnostic unit TestVoiceDiagnosticPrivacy | PASS, exit0 |
| gofmt on both affected integration test files | PASS |
| Direct real Gemini production8s budget | PASS,3.08s, outcomes=[success], no fallback |
| Full go test -race ./... | PASS, ten tested packages/three packages without tests |
| go tool staticcheck -tags=integration ./... | **FAIL**, exit1, four ST1005 findings |

Exact sanitized staticcheck findings:

- internal/config/config.go:127:20 — error strings should not be capitalized
- internal/voice/models.go:13:19 — error strings should not be capitalized
- internal/voice/models.go:14:29 — error strings should not be capitalized
- internal/voice/models.go:15:18 — error strings should not be capitalized

These are candidate source findings, not external-provider failures. The task's
section29 explicitly requires STOP when a quality/security gate fails; no automatic
source correction or suppression was made after detecting this failure.
Gemini compatibility is resolved, but Part07 is still **BLOCKED** for this new gate.

### Outstanding checks and safety

Remaining mandatory gates are **NOT RUN in this continuation** after STOP:
full final formatting/tidy/verify/unit/vet/normal staticcheck/govulncheck;
Part04/05 fixture/clone/security/lifecycle/pool/SQL/GET parity regressions;
LOCAL NestJS–Go voice parity/location EXPLAIN ANALYZE/outage and abuse integration;
real isolated Upstash; production READ-ONLY PRE/status/live voice/GET parity/POST;
Docker runtime; NestJS build/tests; frozen contract lint/offline/HTTP profiles.
Historical PASS results do not replace these outstanding final gates.

Production PostgreSQL was not accessed; no audit/status/migration/DDL/DML/security
change. Upstash was not accessed; no remote Redis mutation. No Docker resources or
application processes were started. Only the single authorized real Gemini NLP
gate was invoked. Protected source and Go module files remain unchanged.
Physical Siri Go-origin test remains NOT RUN until staging/deploy. No Part08.

### Refreshed blocked review archive

Same permanent production-part-07 target and same archive path are rebuilt with
the current diagnostic tests/report. This is a blocked partial-source handoff,
not completed acceptance or deployment authorization. Final archive verification
checks current source/report byte equality, exclusions, known credentials,
private-key patterns and ELF. Verification **PASS**:335 files byte-match including
this report; exclusions/known-credential/generic-private-key/ELF scans PASS.
Protected-source/module diff empty; final git diff --check PASS.
No commit/push/deploy/cutover.

## ST1005 remediation and complete remaining gates — 2026-10-05

### Provenance and minimal source correction

Fetched origin --prune; branch integrate/full-stack and immutable HEAD=origin
remain `8e0c53010b1ef6977b2148fb79caa32ed62ee2f3`, parent
`1ad693eae554a41390a414e99929569d07fd08fd`. The working tree contained only the
known Part07 candidate. No reset/restore or restart of the implementation.

The only runtime corrections in this continuation lowercased the four approved
error strings in internal/config/config.go and internal/voice/models.go.
No suppression, HTTP mapping/state-machine change or model/schema/timeout/provider
configuration change was made. Normal and integration-tag staticcheck now PASS.
The original failed staticcheck evidence above remains historical, now resolved.

Added test-only voice outage/abuse HTTP coverage and deterministic LOCAL/live
voice parity profiles; extended voice_live_test.go with a full opt-in live flow.
These use the existing production service/router and restricted repository, not
a replacement implementation. Test fake sessions are injected explicitly and are
compiled only into tests, never a production memory fallback.

Before the production boundary, 56 validated source/module/archive-script files
were privately SHA-256 fingerprinted. PRE and POST checked these fingerprints;
no Go source hot-fix occurred during or after production verification.
Protected NestJS/frontend/OpenAPI/examples/API_V1_CONTRACT/Prisma/pool source and
tests have an empty diff. Go module files are unchanged.

### Go quality and LOCAL regressions

| Executed gate | Actual result |
| --- | --- |
| gofmt -w cmd internal tests; gofmt -l . | PASS; final list empty |
| go mod tidy; go mod verify | PASS; modules unchanged, all modules verified |
| go test ./... | PASS; ten tested packages, three packages without tests |
| go test -race ./... | PASS; full suite, including outage/abuse tests |
| go vet ./... | PASS |
| go tool staticcheck ./... | PASS |
| go tool staticcheck -tags=integration ./... | PASS |
| go tool govulncheck ./... | PASS; no vulnerabilities found |
| Full explicit tagged deterministic fixture suite | PASS; 52 top-level/217 subtests; unrelated opt-in profiles honestly SKIP |
| Full explicit tagged restricted restored-clone suite | PASS; 57 top-level/246 subtests; unrelated opt-in profiles honestly SKIP |
| Legacy reader lifecycle, clean + restored clone | PASS; 85 subtests on each |
| Creator-anchor lifecycle, clean + restored clone | PASS; 49 subtests on each |
| Restricted security and physical pool session policy | PASS; denied raw/mappings/DML/DDL locally; four held distinct physical connections, omitted-startup policy and fail-closed initialization checks |
| LOCAL repository NestJS–Go parity | PASS; all 849 products × three sorts, six schemas/detail and ten search cases |
| LOCAL GET HTTP parity + dashboard | PASS; 4.59s; full population/order/DTO comparison |
| Existing catalog query-plan suite | PASS; nine plans, no index/migration needed |
| Dashboard integration and exact SQL plan | PASS; one result row, execution6.137ms, planning7.277ms |
| TestLocalVoiceParity | PASS; 0.50s, nine phases |
| Exact location SQL EXPLAIN ANALYZE under LOCAL restricted role | PASS; 15 rows/one loop, execution0.251ms, planning1.682ms; no N+1/index/migration |
| Provider/session outage and voice abuse tests | PASS; deterministic LOCAL fake providers only |

LOCAL voice parity covers cheapest TOP1/search TOP3, numeric and numeric-string
coordinates, clarification/continue, category-only/intent-only/missing-one
clarification, empty results, invalid requests and completed/unknown opaque
sessions. Results, missing fields, questions, speech, nearest real address and
rounded Haversine distance match exactly; generated session bytes are not compared.
Gemini is disabled on both sides for deterministic equality. NestJS compiled
reference files were byte-identical in a native WSL workspace without copied .env.

Outage tests prove Gemini unavailability uses the approved deterministic fallback,
including clarification when sessions work. Redis failure leaves fully specified
direct results available but clarification SET/continue GET return503. Existing
unit tests also cover completion DELETE failure. GET catalog/dashboard and readiness
remain available. Voice rate limit returns429 without affecting GET/readiness;
the concurrency-cap test rejects N+1 immediately and proves permit release.
Privacy tests capture logs and reject text/coordinate/session/provider-secret
sentinels; no real provider service was deliberately disrupted.

### Real providers

The genuine direct Gemini evidence is retained unchanged: **PASS,3.08s,
outcomes=[success], no fallback**, independently validated structured parse.
No additional direct Gemini retry, model/key/schema change or timeout inflation
was needed in this continuation. Runtime retains its shared **8s** chain budget.
This is configured-chain compatibility proof, not a claim that each individual
key was live-tested or that fallback cannot occur during provider outages.

TestLiveUpstashSession **PASS**,2.43s: one random task-owned session,
SET EX600 → typed GET → DEL → GET absent. Cleanup deletes only that same owned
session. No SCAN/KEYS/TTL/flush/unrelated-session access. The full live voice gate
also created/deleted only its own short-lived clarification sessions.
No session IDs, payloads, coordinates, credentials or provider URLs are retained
in this report or review archive.

### Production READ-ONLY and live parity

Canonical PRE and POST **PASS and exactly equal**:

| App table | PRE | POST |
| --- | ---: | ---: |
| stores | 3 | 3 |
| store_locations | 15 | 15 |
| categories | 6 | 6 |
| raw_products | 863 | 863 |
| canonical_products | 849 | 849 |
| product_mappings | 863 | 863 |
| offers | 863 | 863 |

Both audits verified RLS7/FORCE0/exact SELECT policies5, successful history2,
reader SELECT5/public USAGE only, restricted runtime flags/membership, creator
anchors, denied raw/mappings privileges, ownership/default ACLs, managed full
ACLs including MAINTAIN/grantors, PUBLIC CONNECT and unchanged schema. Both
Prisma migrate status commands were status-only, exit0/up to date, with explicit
READ-ONLY connection options. No migration/deploy/resolve/bootstrap/rollback ran.

TestFullLiveVoice **PASS**,20.60s: restricted aktau_api_runtime pool with read-only
session policy, real configured Gemini, real Upstash and fixed synthetic test
coordinates. Direct cheapest and search produced nonempty single/list results
within TOP1/TOP3 limits with real locations. Clarification → continue → completed
session404 passed. Captured runtime logs passed privacy checks. Separate direct
Gemini evidence, not successful fallback-capable voice output, proves compatibility.

TestLiveVoiceParity **PASS**,58.09s: exact deterministic Go–NestJS comparison on
production data for the same nine phases as LOCAL, with Gemini disabled and
explicit test-local fake sessions. This parity profile is separate from the real
provider/Upstash flow above and does not claim live Redis by itself.

Production READ-ONLY TestHTTPParity **PASS**,217.59s: exact all849-product parity
for price_asc/price_desc/name_asc, all six category schemas, dynamic filters/detail,
ten search/wildcard/injection cases, compatible400/404 errors and full dashboard.
The local production-config Go process with the restricted credential returned
200 for /health/live, /health/ready, categories, products and dashboard.

Production application SQL was read-only (SELECT/SHOW/status), with the existing
connection-local read-only/timeout initialization retained; no data/schema/security/
history mutation or provider credential change. SQL/role/migration/denial-write proofs were
performed only on disposable LOCAL PostgreSQL17, never production.

### Docker, reference and frozen-contract gates

Docker review build **PASS**. LOCAL runtime proof: UID10001/non-root, no compiler,
read-only filesystem/tmpfs, healthy image healthcheck, existing five GET routes,
deterministic voice direct + clarification/continue/completed404 using an explicit
LOCAL test REST session adapter. DB down leaves live200/ready503; restart of the
same disposable DB recovers ready200 without API restart. SIGTERM exits0 in373ms.
Production startup missing voice providers fails closed, exit1. Image/history
credential checks PASS; no production credential entered Docker/image/history.

NestJS build **PASS**; existing test suite **25/25 PASS**. Contracts lint **PASS**;
offline tests **12 PASS/0 failed/10 HTTP skips**. Additional frozen live GET profile
against restricted Go **18 PASS/0 failed/4 fixture-only voice skips**; categories6,
canonical849, stores3, locations15, baskets3. Skipped tests are not reported as PASS.
Voice wire behavior is separately proved by the exact reference-parity profiles.

### Final safety, integration impact and archive

The candidate implements both frozen voice POST routes while preserving all GET
contracts. Production startup requires configured Gemini and HTTPS Upstash/token;
there is no runtime in-memory session fallback. Additional voice-specific bounded
rate/concurrency protection is instance-local; future edge limits are out of scope.
NestJS remains traffic owner. No deploy/cutover/commit/push/Part08.
Physical Siri against a Go origin: **NOT RUN / PENDING OWNER until staging/deploy**.

Task-owned LOCAL clients, generated native workspaces/temp binaries and
disposable PostgreSQL containers/volumes/network were cleaned up.
Private audit/test evidence remains outside repo. Production reader/login/policies
and data were retained unchanged; authorized Redis sessions were ephemeral.

Final protected-source/module diff and git diff --check **PASS**.
Permanent production-part-07 target rebuilt
`artifacts/production-part-07-review.tar.gz`. Verification **PASS**:337 files
byte-match current source, including this report; required voice/provider/parity
sources present. No real .env, known provider/runtime/DB/LOCAL disposable
credential, private-key/API-key pattern, DB dump/backup/private audit evidence,
node_modules/build/test output, generated ignored Next declaration, Go binary/
profile/ELF or temporary Docker/WSL workspace. The final report is included in the
refreshed archive and verified again after this status update.

All mandatory gates PASS. Both historical blockers are resolved; no remaining
Part07 acceptance blocker. Stop for external review; no deployment/traffic-cutover
or physical-device readiness is implied by this status.
