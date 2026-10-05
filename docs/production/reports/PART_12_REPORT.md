# Production Part12 — CI/CD & ephemeral staging, Phase A

Status: **READY_FOR_EXTERNAL_REVIEW**.
Date: 2026-10-05. Source candidate only; GitHub Actions **NOT RUN**.

Current result: Phase A local mandatory gates PASS after the reviewed CI-only
fixture overlay. Earlier BLOCKED statuses below are preserved historical evidence,
not current status. See final section for the completed rerun matrix.

## Immutable provenance

Branch `integrate/full-stack`, initially clean.
Fetch `origin --prune` PASS; HEAD=origin:
**PART12_BASE_SHA `7b8c925cb57a985c302207ed504cf1e7af070a18`**.
Owner commit: `feat(prod): add observability backup recovery foundation`.
Accepted Part11 report retained unchanged. No commit/push/reset/rebase/merge.

Only CI/policy/docs, reviewed backup child invocation fixes and archive target edited. Backend/Go runtime, frontend,
contracts, Prisma schema/migrations/security, dataset and six runbooks unchanged.
No production DB connection/mutation, backup URL sourcing, roles/grants, provider
call, Railway/VPS/DNS/Cloudflare, external staging, deploy or ingest execution.
Prisma generation/migration uses explicit dummy/owned loopback URLs. Native source
copy excludes real env; no secret values are printed or archived.

## Workflow candidate

`.github/workflows/ci.yml`: PR toward integration/main, push same branches,
workflow_dispatch; contents:read; no pull_request_target/secrets/deploy. Concurrency
workflow/ref with cancellation. Unique jobs: Contracts10m, Go Quality20m, Nest
Reference15m, Frontend25m, Security10m, PostgreSQL Integration20m, Ephemeral
Staging25m; final stable **CI Gate**2m/always checks seven results all success.
Ubuntu24.04; Node24.10.0, pinned pnpm10.32.1/Corepack, Go from go.mod1.27.1,
PG17 Alpine. No dependency/framework upgrades or registry image push.

Official Actions latest stable tags and immutable commit objects verified through
official GitHub repositories/API on this run:
[checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)
`3d3c42e5aac5ba805825da76410c181273ba90b1`,
[setup-go v7.0.0](https://github.com/actions/setup-go/releases/tag/v7.0.0)
`b7ad1dad31e06c5925ef5d2fc7ad053ef454303e`,
[setup-node v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0)
`820762786026740c76f36085b0efc47a31fe5020`.
Checkout does not persist credentials. No extra marketplace action or artifact upload.

Helpers use sanitized environment allowlist (no inherited live/provider/backup/
libpq config), exact owned PG container, derived loopback binding, fail-closed URL
guard, explicit dedicated DBs, bounded readiness and child commands. SQL setup is
local only. Existing migrations/security artifacts are read without rewriting.
Workflow activation still requires external Phase A PASS and an actual successful
GitHub Actions run on the owner's reviewed pushed revision.

## Initial local results — history preserved

Commands invoked via RTK, Node24.10.0/Go1.27.1/GOTOOLCHAIN=local.
Corepack enable/prepare pinned pnpm PASS. `scripts/ci/run-checks.mjs <group>`
reproduces job commands. Native WSL byte-identical copy:395 source files, excludes
env/dependencies/build/test outputs; prevents known `/mnt/d` Vitest issue without
dependency/config/timeout changes. Three independent check groups used this copy.

| Gate | Actual result |
| --- | --- |
| Go gofmt/tidy/byte + Git module drift/verify | PASS, no module changes |
| Go unit count1, race count1, vet | PASS all packages |
| pinned staticcheck normal + integration | PASS |
| pinned govulncheck | PASS, no vulnerabilities found |
| build cmd/api + cmd/ingest | PASS, binaries outside repo; ingest not run |
| contracts frozen install/lint/offline tests | PASS;12 passed,10 HTTP tests intentionally skipped |
| Nest frozen install/generate/build/test/audit | PASS;25/25,0 failed;0 advisories |
| frontend frozen install/typecheck/lint | PASS in native WSL copy |
| frontend mock unit suite | PASS35 files/182 tests,0 failed |
| frontend audit --prod | PASS0 advisories |
| frontend explicit HTTP production build | PASS, API18080 unavailable; site3100, test mocks disabled |
| Playwright install --with-deps chromium | FAIL: local sudo requires interactive password |
| mock Playwright E2E | NOT RUN after installer failure |
| CI guard tests | PASS2/2, unsafe host/options/DB/credentials rejected, no provider/live fallback |
| fresh PG17 migration + integration | PASS, details below |
| ephemeral staging | FAIL at fresh PG bootstrap startup; no API/reference/browser step ran |
| dedicated Security job/synthetic backup guards/workflow complete review | NOT RUN at mandatory STOP |
| Docker build/security smoke | NOT RUN at mandatory STOP |
| GitHub runner Actions execution | NOT RUN; uncommitted source |

### Fresh PostgreSQL Integration — PASS

`node scripts/ci/run-db-integration.mjs` exited0. New owned loopback PG17; exact
reader bootstrap before migration chain. `pnpm exec prisma migrate deploy` applied
all three expected migrations to five dedicated empty DBs, successful migration
names verified by SQL. Fixture stays existing `tests/fixtures/catalog.sql`.

Explicit `-count=1 -race -tags=integration` profiles actually executed:

- TestDestructiveTargetGuard, TestDeterministicCatalog, TestBootstrapFailsClosed:
  typed JSON filters/brand/OR/AND/search/sorts/pages/offer/min/snapshot/detail,
  dashboard bounded SQL/baskets, SELECT/private/DML/DDL denial and unsafe bootstrap.
- TestLocalProductionIdentity: four physical connections, safe identity/reconnect,
  unsafe flags/role escalation/ownership refusal, local owner rejection.
- TestLocalSnapshotSecurity with guarded writer rollback: reader6/writer17/RLS9,
  constraints, explicit denials, fingerprint/reader/history preservation.
- TestLocalPhysicalPoolSessionPolicy: startup params intact and omitted, four
  distinct held sessions, read-only/5s timeout and rejected initialization.
- TestLocalClonePlans:11 query shapes including discovery/latest/history, no
  private table scan; small fixture plan smoke, not production performance claim.
- TestLocalObservability: numeric pool/query metrics, snapshot/source age,
  operator-only source freshness, reader denial.
- TestCloneRestrictedSecurity: exact ACL/RLS/membership/private3/DML/DDL denial.

Owned PG container/anonymous volumes removed; no unrelated Docker resources touched.
Full 849-product clone HTTP/repository/dashboard plans, complete Voice clone parity,
ingestion publication and original reader/operator lifecycle profiles are not run
or labelled PASS here; separate manual release profiles have different preconditions.
Ordinary Go unit/race includes deterministic fake Gemini/Redis/Voice/privacy/outage/
abuse tests. No real Gemini/Upstash test was enabled.

## Initial mandatory STOP evidence — preserved, remediation below

**PART12_EPHEMERAL_PG_STARTUP_GATE_FAILED**: separate new staging container's
`pg_isready` exited0; immediately following exact reader bootstrap psql exited2:
socket `/var/run/postgresql/.s.PGSQL.5432` did not exist. This is a CI startup
orchestration failure before migrations, not a Prisma/RLS/runtime defect. Initial
readiness may have observed the image's temporary initialization server; this is
a hypothesis, not yet a proved fix. Container cleanup PASS. No retry or source
hot-fix to runtime/schema was made after failure.

Parallel already-started frontend group completed unit/audit/backend-down build,
then its browser dependency installer failed on sudo password. Mock/HTTP E2E and
Docker therefore remain NOT RUN. No failed assertion was hidden, weakened or
relabelled. Separate CI runners isolate job workspaces; local continuation should
run browser/build groups sequentially, not share a Next build directory/port.

Smallest next reviewed action: correct new CI PostgreSQL readiness to distinguish
the final TCP server from image initialization (bounded polling); rerun fresh DB
and staging. Browser installer needs a supported local existing-Chrome reproduction
per TODO (no automatic system package install); Actions retains Chromium install
on hosted Ubuntu. Then complete all mandatory gates and source review. The draft
`CI_BASE_SHA` migration guard still needs trusted event-base wiring; existing
migration bytes remain unchanged and full fresh chain already proved locally.

## External-review continuation — three reviewed fixes

Fetch/recheck again PASS: HEAD=origin=PART12_BASE_SHA. Tree contains only the known
Part12 candidate; no reset/restore/restart, no protected source changes. Previous
PASS evidence above retained, not relabelled as newly rerun.

1. **Final PostgreSQL readiness resolved.** Bounded `pg_isready -h127.0.0.1
   -p5432 -Upostgres -dpostgres` excludes the socket-only temporary init server.
   A second bounded TCP psql SELECT1 must return exit0/exact1 before bootstrap.
   No fixed-sleep workaround. Both independent fresh PG runs passed these gates.
2. **Local browser reproduction resolved.** CI=true retains install --with-deps
   chromium. Local PW_CHANNEL=chrome skips only installer, not E2E; local without
   channel installs chromium without --with-deps. No sudo/apt/system-library install
   was attempted in the continuation. Frontend Playwright config/tests unchanged.
3. **Trusted event base wiring resolved.** Security direct Node step reads trusted
   GITHUB_EVENT_NAME/GITHUB_EVENT_PATH, validates selected40-hex SHA, writes
   CI_BASE_SHA through GITHUB_ENV. PR selects base.sha, push before, dispatch empty.
   Child environment retains this safe metadata for the existing immutability
   guard; no PR/branch/SHA shell interpolation. Full-history checkout unchanged.

New tests **PASS4/4**: loopback URL guard, no inherited provider/live fallback,
three browser modes (including CI precedence), event PR/push/dispatch selection,
zero push-before and rejection of missing/malformed/injected/unsupported events.

Fresh byte-identical native WSL copy **399 source files**, real env excluded;
same Node24/Go1.27.1/pnpm10.32.1. Browser/build groups sequential, no shared ports
or overlapping Next build outputs. Prisma skill used only for existing migrations
on new disposable PG17, retaining5.22.0.

| Continuation gate | Actual result |
| --- | --- |
| `node --test scripts/ci/guard.test.mjs` | PASS4/4 |
| Security group, CI_BASE_SHA=immutable baseline | PASS source/workflow/migration guard + synthetic backup guard1/1 |
| fresh `run-db-integration.mjs` | PASS all prior explicit race/local profiles; final TCP+SELECT1; full migrations verified in five DBs |
| `PW_CHANNEL=chrome run-checks.mjs mock-e2e` | PASS exit0, existing full desktop/iPhone mock suite, no installer/sudo |
| ephemeral staging final PG/bootstrap/migrations/fixture/runtime | PASS |
| Go live/ready/categories/products/dashboard, private metrics404 | PASS |
| local Nest reference startup | PASS, same fixture and local restricted login, providers disabled |
| TestHTTPParity | PASS all4 usable products ×3 sorts,3 categories/filters/detail/dashboard +10 searches |
| TestLocalSecurityQueryParity | PASS canonical/injection/error cases + Go-only raw-semicolon400 |
| TestLocalContentTypeParity | **FAIL** JSON charset + legacy form:429 instead of201 |
| frozen GET HTTP contract commands | NOT RUN; staging stopped at preceding parity failure |
| HTTP Playwright against Go | NOT RUN at mandatory STOP |
| Docker build/security smoke | NOT RUN at mandatory STOP |
| workflow YAML/static policy + aggregate negative cases | PASS; all seven success passes, failure/cancelled/skipped each reject |
| GitHub Actions / Phase B | NOT RUN |

Initial Security synthetic test attempt used an operator PATH missing the installed
RTK executable; child spawn returned null, not a successful backup guard run. Same
unchanged test rerun with correct local PATH PASS1/1. This environment failure is
recorded, not hidden. Test uses synthetic dump/GPG doubles only; no production or
real backup/key material. Mock Next emitted destination-stream-closed messages
after client requests/cleanup; Playwright command exited0, no assertion failure.

### New mandatory blocker — PART12_LOCAL_CONTENT_TYPE_PARITY_RATE_LIMITED

Staging `small fixture GET/security parity` command exits1 because
TestLocalContentTypeParity's first four malformed requests pass400, then JSON
charset and valid legacy-form requests receive429 rather than201. The test prints
only status class, not a sensitive request body. Go's test-profile defaults are
Voice RPS2/burst4; this helper sets only general RATE_LIMIT_RPS/BURST1000, not the
independent Voice limits. This is consistent with exhaustion by six rapid requests,
not evidence of a Content-Type decoder or DB semantic defect. Runtime config/parser,
rate limiter and assertions were **not modified**, and failure was not retried
or declared PASS. Original scope's local mandatory-gate STOP applies.

Both task-owned API/reference processes exited and the owned PostgreSQL container
and volumes were removed. No external infrastructure/provider/production access.
HTTP Playwright and Docker cannot be substituted with earlier-Part evidence.
Next smallest review action: authorize an explicit high-throughput **test-only CI
Voice profile** in the staging helper or a separately reviewed test orchestration
approach; retain production limiter/defaults and separate abuse tests. Then rerun
staging including frozen GET contracts, HTTP browser suite and Docker smoke.

Static review also notes that the additional synthetic backup test spawns `rtk`;
it passes locally with installed RTK, but workflow does not provision RTK on a fresh
hosted runner. No ad-hoc tool install, shim or test suppression was introduced.
This prerequisite must be addressed/reviewed before declaring workflow activation
ready; actual GitHub execution remains NOT RUN.

## Policies and activation boundary

Dependabot weekly gomod/backend-go, npm/backend/frontend/contracts, github-actions;
three open version PRs per ecosystem, integration target, no auto-merge/major groups.
[Branch protection plan](../GITHUB_BRANCH_PROTECTION.md) is documentation only;
enable stable CI Gate only after actual green run on latest reviewed owner-pushed
SHA. [Staging plan](../STAGING_PLAN.md): persistent staging NOT PROVISIONED; future
separate DB/Redis/API/frontend/credentials; forward-only migration + reviewed backup
recovery, representative clone for future schema/data changes. No auto-deploy main.

Phase B NOT STARTED. This candidate cannot receive Phase A READY while mandatory
local staging/E2E/Docker/security gates are incomplete.

## Changed files and archive

New `.github/workflows/ci.yml`, `.github/dependabot.yml`, `scripts/ci/` focused Node
helpers/checks, GITHUB_BRANCH_PROTECTION.md, STAGING_PLAN.md and this report.
Modified only archive helper: permanent `production-part-12` target; exact-path
secret-rotation.md allowance preserved. No README/runtime/contract/migration edits.

Archive: `artifacts/production-part-12-review.tar.gz` is a **BLOCKED partial source
review artifact**, not deployment or CI PASS evidence. Verify safe regular members,
all source/report byte-match, .github/helpers/policy docs and six runbooks present;
no real env/DB dumps/backups/key material/dependencies/build/test outputs/binaries.
Initial archive hygiene **PASS399 safe regular members**; every source/report byte
matches, six runbooks and required CI/docs present. Bounded project-specific
source/credential-pattern scan **PASS398 files** (not an exhaustive scanner claim).
CI/helper and archive-helper Node syntax checks PASS; diff --check PASS;
protected backend/backend-go/frontend/contracts/API contract diff empty.
Final HEAD=origin remains PART12_BASE_SHA; no Part12-labelled containers remain.
Archive is rebuilt after recording this evidence and byte verification repeated.

Continuation archive hygiene **PASS400 safe regular members**, all source/report
bytes equal and six runbooks present. Source pattern/artifact scan **PASS399 files**;
no real env, credentials, backup/dump/key/binary/dependency/build/test members.
Updated report is included byte-identically after final rebuild. Syntax/diff checks
PASS, protected source diff empty, immutable HEAD=origin unchanged and all owned
Part12 containers removed. Candidate remains BLOCKED on the new parity gate above.

**BLOCKED — stopped for external review; no commit/push/deploy.**

## Previous approved harness fixes — nested RTK prerequisite (historical)

Immutable HEAD=origin remains `7b8c925cb57a985c302207ed504cf1e7af070a18`;
fetch/prune PASS, branch `integrate/full-stack`, only known candidate changes.
All previous blocker history and completed PASS evidence above are retained.

Applied exactly the two newly approved fixes:

- Ephemeral staging test Go process now explicitly sets
  `VOICE_RATE_LIMIT_RPS=1000` and `VOICE_RATE_LIMIT_BURST=1000`, alongside the
  existing general high-rate profile. Production defaults remain 2/4;
  VoiceGate, concurrency, limiter/abuse tests and Content-Type assertions unchanged.
- Synthetic backup test invokes `bash <script>` directly, without an outer RTK
  child. No hosted RTK installer, shim or new supply-chain dependency added.

Guard tests rerun **PASS4/4**. Security rerun with child PATH restricted to
Node24, Go and standard system binaries (RTK absent): source/workflow/migration
guard **PASS**, synthetic backup guard **FAIL1/1** at the successful-backup
assertion (`ops/postgres/backup.test.mjs:28`, expected exit0, actual1).
Inspection confirms a second nested dependency:
`ops/postgres/pg-run.mjs` still invokes `spawnSync('rtk', ['proxy', command, ...])`.
Direct bash therefore reaches the real helper but cannot run its synthetic
pg_dump child in a hosted-runner-equivalent PATH. No production credentials,
backup/key material or real PostgreSQL/GPG commands were used.

Current blocker: **PART12_SECURITY_NESTED_RTK_DEPENDENCY**. The approved outer
invocation fix alone does not make this test hermetic. Did not alter the existing
backup runtime helper, install RTK, add a fake RTK shim, weaken assertions or claim
Security PASS. Smallest next review decision: authorize removing the inner RTK
dependency from `pg-run.mjs`, retaining its sanitized env/argv/error behavior.

Per Part12 mandatory STOP on a local gate failure, fresh staging and its parity,
GET contracts, HTTP Playwright and Docker smoke were **NOT RUN in this latest
continuation**. Earlier PASS results remain evidence only for their stated runs;
the test-only Voice rate fix has not yet been proved by a staging rerun.
GitHub Actions **NOT RUN**, Phase B not started. No runtime/API/Prisma/frontend
changes, production access, deploy, commit or push.

Archive rebuilt as a BLOCKED source-review artifact; safe-member, all-source/report
byte-match and bounded secret-pattern verification are rerun below the build.

## Approved nested RTK remediation and fresh staging rerun (historical blocker)

Fetch/prune PASS; branch `integrate/full-stack`; HEAD=origin remains
PART12_BASE_SHA `7b8c925cb57a985c302207ed504cf1e7af070a18`.
Only known candidate changes; no reset/restore/restart of Part12.
Applied the single additional reviewed source fix in `ops/postgres/pg-run.mjs`:
direct `spawnSync(command, operationArgs, ...)`. Command allowlist remains only
pg_dump/pg_restore; no shell; inherited PG variables removed; URL-option allowlist,
sanitized libpq fields, read-only dump PGOPTIONS, explicit restore --dbname,
bounded4MiB buffer and sanitized outcome classification unchanged. No RTK install.

| Latest gate | Actual result |
| --- | --- |
| guard tests | PASS4/4 |
| Security with child PATH excluding RTK, CI_BASE_SHA=baseline | PASS source/workflow/migration guard |
| synthetic backup guard in same RTK-free environment | PASS1/1 |
| native WSL protected-source identity | PASS315 tracked backend/Go/frontend/contracts files byte-identical |
| fresh owned PostgreSQL17 final TCP + SELECT1 | PASS |
| reader bootstrap, five fresh migration chains, restricted local logins and fixture | PASS |
| Go build + Nest generate/build + local Go/Nest startup | PASS |
| Go live/ready/categories/products/dashboard and metrics404 | PASS |
| TestHTTPParity | PASS4 products ×3 sorts; categories/filters/details/dashboard and10 searches |
| TestLocalSecurityQueryParity | PASS all canonical/injection/error cases, encoded semicolon and raw Go-only400 |
| TestLocalContentTypeParity | FAIL2 valid-input subtests:503 expected201; malformed4 subtests PASS400 |
| frozen GET contract commands on Go/Nest | NOT RUN: mandatory parity STOP |
| HTTP Playwright against Go | NOT RUN: mandatory parity STOP |
| Docker build/security/outage/recovery | NOT RUN: mandatory parity STOP |
| workflow YAML/static policy + actual CI Gate success/failure/cancelled/skipped commands | PASS |
| GitHub Actions / Phase B | NOT RUN |

The approved test-only Voice RPS1000/burst1000 profile is active: previous429 is
resolved, with production defaults2/4 and limiter/assertions unchanged. New blocker:
**PART12_CONTENT_TYPE_PARITY_FIXTURE_SESSION_UNAVAILABLE**. Valid JSON charset and
legacy-form requests now receive503 from Go before reaching the Nest comparison.
Inspected existing catalog fixture: milk filterSchema has no fatPercent definition,
and products have no fatPercent attributes. Existing fallback accepts filters only
from discovery schema; milk completeness requires volumeMl and fatPercent.
The test's complete natural-language request therefore becomes incomplete against
this fixture, requests clarification, and reaches unconfigured Redis. This matches
the controlled503 path; it is not evidence that Content-Type decoding differs.
No response body, coordinates, session ID or voice text is logged in this report.

Did not alter fixture, Content-Type assertions, runtime parsing/session fallback,
provider configuration or protected source. Smallest next review decision: approve
a CI-owned fixture overlay that supports the existing direct milk request, with
matching filter discovery/attributes, rather than weakening runtime or adding a
production memory fallback. No unreviewed fix or failed-gate retry was attempted.
Part12 mandatory local-gate STOP applies. Owned Go/Nest processes and PostgreSQL
container/volumes cleaned successfully; no Part12-labelled container remains.
No production/external-provider access, deploy, commit or push.

Prior Go/Nest/frontend unit and mock-E2E PASS results remain unchanged evidence;
runtime source is unchanged. Latest archive remains a BLOCKED source-review
artifact. Rebuilt verification:400 safe regular members, all source/report bytes
match, all six runbooks present; bounded source-pattern scan399 files PASS.
No real env, credentials, DB dump/backup, key material, dependency/build/test output.
Syntax and diff checks PASS. **BLOCKED; stopped for external review.**

## Final approved CI-only overlay — all remaining Phase A gates PASS

Fetch/prune, branch and SHA checks PASS: `integrate/full-stack`, HEAD=origin=
PART12_BASE_SHA `7b8c925cb57a985c302207ed504cf1e7af070a18`. All known candidate
changes preserved. No reset/restore/restart of the Part; every prior blocker above
remains visible. Current status **READY_FOR_EXTERNAL_REVIEW**, Phase A only.

Approved `scripts/ci/fixtures/voice-parity-overlay.sql` applies only through the
existing owned local admin SQL helper in `run-ephemeral-staging.mjs`, immediately
after `load('part04_fixture')`. It adds milk multi-select fatPercent option3.2 and
p1 numeric attributes.fatPercent3.2. Transactional fail-closed DO proof requires
exactly one matching discovery definition and p1 numeric volumeMl1000/fatPercent3.2.
No IDs/prices/offers or other attributes changed. Shared catalog.sql is unchanged;
`run-db-integration.mjs` never applies this overlay. No production data imported.

Node24.10.0/Go1.27.1/GOTOOLCHAIN=local/pnpm10.32.1 retained. Reused native WSL
test workspace `/tmp/adilbaga-part12-resume-x2Rfab`; protected315 tracked backend,
Go, frontend and contract source files byte-identical to the current repository.
Only approved helper/overlay files synced; no real env/secrets copied.

| Final local gate | Actual result |
| --- | --- |
| guard tests | PASS4/4 |
| Security group, CI_BASE_SHA=baseline, child PATH without RTK | PASS source/workflow/migration policy |
| synthetic backup guards in RTK-free PATH | PASS1/1; direct bash and direct allowlisted pg tools |
| fresh PostgreSQL17 integration, original fixture | PASS exit0; five migration chains; all explicit race integration/security/pool/plan/observability profiles listed above |
| independent fresh ephemeral staging PG17 | PASS final TCP + SELECT1, reader bootstrap, five full migration chains, restricted local logins |
| CI-only Voice overlay and SQL invariants | PASS; no shared fixture change |
| Go build, Nest generate/build and local Go/Nest startup | PASS; no real providers |
| Go live/ready/catalog/dashboard; metrics404 | PASS |
| TestHTTPParity | PASS4 usable products ×3 sorts,3 categories/filters/details/dashboard and10 searches |
| TestLocalSecurityQueryParity | PASS canonical/injection/validation cases, encoded semicolon and Go raw-semicolon400 |
| TestLocalContentTypeParity | PASS6/6: malformed4→400; JSON charset and legacy form→201; exact successful Go/Nest response equality |
| frozen GET contracts against local Go | PASS18,0 failed,4 intentionally skipped fixture Voice tests |
| frozen GET contracts against local Nest | PASS18,0 failed,4 intentionally skipped fixture Voice tests |
| HTTP Playwright against Go | PASS12/12,0 failed, desktop+iPhone; catalog/filter/search/detail/SSR/SEO/dashboard/baskets/map/404/sitemap/robots |
| Docker image build and runtime security | PASS healthy, UID10001, no compiler, CA present, read-only rootfs, cap-drop ALL/no-new-privileges/tmpfs; health/catalog/dashboard GET200 |
| Docker DB outage | PASS live200/ready503 |
| Docker same DB recovery, no API restart | PASS ready200 |
| owned process/container/network/volume cleanup | PASS; no Part12-labelled containers remain |
| workflow YAML/static policy and actual CI Gate command | PASS all-seven success; failure/cancelled/skipped each rejected |
| syntax / diff / protected source checks | PASS; backend/backend-go/frontend/contracts/API contract diff empty |
| GitHub Actions / Phase B | NOT RUN / NOT STARTED |

Earlier full Go quality/security/build, Nest25 tests/audit, frontend35 files/182
unit tests/typecheck/lint/audit/backend-down build, contracts lint/offline and mock
Playwright PASS evidence is retained rather than unnecessarily rerun: protected
runtime source, dependencies and their test/config files did not change. Existing
limiter/abuse unit/race coverage remains intact. Explicit staging Voice1000/1000 is
test-only; production defaults2/4 and concurrency unchanged. No timeout/dependency
hack, assertion weakening, Redis memory fallback or mock GET substitution.

Existing Next HTTP Playwright run emitted a destination-stream-closed web-server
message during request/cleanup; command exit0, all12 assertions passed including
browser-console checks. It is recorded, not suppressed or promoted to a failed test.

Fresh PG integration and ephemeral staging ran sequentially. Docker uses only
owned PG17 and local restricted runtime; dummy invalid provider placeholders in
production-profile container, GET/health only. No real Gemini/Upstash, production
DB/backup/credentials, external staging, Railway/VPS/domain/Cloudflare, deploy,
N+1 or ingest apply. No commit/push. Persistent staging and live alert/CD delivery
remain deferred until separately reviewed infrastructure exists.

Final archive `artifacts/production-part-12-review.tar.gz` includes the overlay,
workflow/helpers/policy docs, this current report and all six runbooks. Verification
PASS401 safe regular unique members, all source/report bytes match; bounded
source-pattern/artifact scan400 files PASS. No real env, credentials, dump/backup,
key material, dependencies, binaries or build/test outputs. The permanent archive
target and exact secret-rotation.md exception are preserved. Owner external review,
then separate commit/push and real GitHub CI Gate verification are still required.

**READY_FOR_EXTERNAL_REVIEW — stopped after Phase A; no commit/push/deploy.**
