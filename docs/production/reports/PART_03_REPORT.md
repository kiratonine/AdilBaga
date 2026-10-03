# Production Part 03 — Go production foundation

Status: **READY_FOR_EXTERNAL_REVIEW**. Updated: 2026-10-04.

## A. Goal and scope

Create an isolated Go production foundation without business endpoints, application
SQL, Supabase access or changes to the frozen API. Initial implementation stopped
on the explicit reachable-vulnerability gate. External review then authorized
the narrow remediation below; all Part 03 gates now pass. External acceptance
and deployment are still separate; no public business API parity is claimed.

Read root AGENTS.md, TODO/PRODUCTION_PART_03.md, production roadmap, Part 02 report,
API_V1_CONTRACT.md and contracts/openapi.yaml. Root instructions are the current
production version. Part 02 results are historical evidence, not Part 03 reruns.

## B. Baseline and prerequisite history

| Check | Actual result |
| --- | --- |
| `rtk git fetch origin --prune` | PASS |
| Original 2026-10-03 working tree | Clean before the prerequisite report |
| Continuation working tree | Only the previous untracked Part 03 report; owner explicitly requested continuation preserving it |
| Branch | `integrate/full-stack` |
| Local HEAD | `7ce1caebadfe2cfdd25d58ae6daa56d93028a763` |
| origin/integrate/full-stack | `7ce1caebadfe2cfdd25d58ae6daa56d93028a763` |
| HEAD/origin divergence | `0/0` |
| Initial continuation `rtk proxy go version` / `which go` | Not found in inherited PATH |
| Explicit `/usr/local/go/bin/go version` | PASS: `go1.27.1 linux/amd64` |
| `uname -m` | `x86_64` |
| `rtk proxy docker version` | PASS: client/server 29.1.3, linux/amd64 |

Original 2026-10-03 prerequisite blocker: no local Go executable was found; only
this report was created, and implementation did not start. Owner installed Go
manually. On continuation, `/usr/local/go/bin/go` is executable and reports the
expected version. Commands explicitly prepend `/usr/local/go/bin` to PATH and
use `GOTOOLCHAIN=local`; no system configuration/package/toolchain installation.
**Initial prerequisite blocker resolved.** No report duplication or history rewrite.

Fetch/recheck PASS; HEAD equals origin with divergence 0/0. Root production
AGENTS.md remains unchanged. The existing report is the understood continuation
artifact, not an unrelated source change.

Remediation preflight repeated fetch/status/branch/SHA/toolchain: same HEAD/origin,
0/0. Working tree contained ONLY known Part03 backend-go/, this report and the
archive script change; continuation was explicitly authorized. No unknown changes.

## C. Architecture

New `backend-go/`: cmd/api bootstrap, internal/config, httpapi, middleware,
observability and postgres packages with focused tests. Runtime direct modules:
chi/v5 v5.3.2, pgx/v5 v5.11.0 and x/time v0.16.0. Module Go 1.27.1.
Staticcheck v0.8.1 and govulncheck v1.8.0 are pinned via Go tool directives and
go.mod/go.sum; their dependencies are tooling, not additional runtime frameworks.
No business API, ORM, Redis/Gemini, DI framework or application SQL.

## D. Configuration

Typed configuration requires APP_ENV, DATABASE_URL and CORS_ALLOWED_ORIGINS;
validates environment, port, logging, exact origins, proxy CIDRs and positive
rate settings. .env.example contains no real credentials. Initial fail-closed
validation was not fully verified: `TestConfig/bad_db` was unexpectedly accepted
by URL/pgx parsing, and `TestInvalidURL` also failed. The test input has an escaped
malformed hostname; the validation/test expectation needs review. Error text does
not echo configured values. No workaround was applied at the initial STOP.
Current UTF-8 validation/tests PASS; see remediation section. Original failing
tests were retained, not weakened or substituted.

## E. HTTP hardening

Server timeouts: headers 5s, read 15s, write 20s, idle 60s; headers 64 KiB.
Context timeout 15s; shutdown 10s. Body 1 MiB (bounded pre-read includes unknown
length/chunked input), RequestURI 16 KiB. Safe request IDs, JSON slog access/error
metadata without query/body/headers/panic value, recovery, compatible JSON errors,
exact CORS, trusted-peer-only forwarding with right-to-left XFF chain resolution.
Instance limiter: 8192-client hard cap, 10-minute idle TTL, lazy minute sweep,
capacity fails closed; health and OPTIONS exempt. No wildcard or credentials CORS.
Middleware/router package tests passed in the initial run. Current full-suite and
race gates PASS. Startup now honors the configured LOG_LEVEL as well.

## F. Health/readiness

Implemented live 200/status=ok independent of DB; ready checks Ping with 2s timeout,
200/status=ready or 503/status=not_ready, no-store JSON without DB error details.
Stub-based health/router tests PASS. Real local DB up/down/recovery now PASS;
the earlier run had stopped before these checks (NOT RUN at that time).

## G. PostgreSQL foundation

Only parse/NewWithConfig/Ping/Close; max pool 4, minimum 0, connect timeout 2s.
Pool creation is lazy to allow temporary outage. Unit outage check uses unavailable
loopback port 1, never production configuration. No schema/domain SQL or repositories.

## H. Initial automated checks and blocker history

Historical results below are retained, NOT the final remediation results.

| Command in backend-go/ (RTK proxy, installed local Go) | Actual result |
| --- | --- |
| `gofmt -w cmd internal`, then `gofmt -l .` | PASS; final listing empty |
| `go mod tidy` | PASS; pinned dependency graph/sums generated |
| `go mod verify` | PASS; all modules verified |
| `go test ./...` | FAIL, exit 1: `TestConfig/bad_db`, `TestInvalidURL` |
| cmd/api, httpapi, middleware package tests | PASS in the above initial run |
| observability | No test files; not a separately tested package |
| `go tool staticcheck ./...` (v0.8.1) | PASS, exit 0 |
| `go tool govulncheck ./...` (v1.8.0) | FAIL, exit 3: one reachable vulnerability |
| `go test -race ./...` | NOT RUN after mandatory STOP |
| `go vet ./...` | NOT RUN after mandatory STOP |

**GO-2026-5970: Infinite loop on invalid input in golang.org/x/text.**
Found in transitive `golang.org/x/text@v0.29.0`; scanner lists fix `v0.39.0`.
Reported reachable chains: `postgres.Open` → `pgxpool.NewWithConfig` →
`norm.Form.Properties`, `norm.Form.Span`, `norm.Form.Transform`.
Primary advisory: https://pkg.go.dev/vuln/GO-2026-5970.

Per Part 03 stop condition 13, implementation stopped. No suppression or automatic
dependency override was performed in that run. Owner's external review explicitly
authorized x/text v0.39.0, UTF-8 validation and full reruns; results follow below.

## I. Docker

Multi-stage golang:1.27.1-alpine → alpine:3.24, CA certificates, dedicated
UID/GID 10001, CGO disabled, trimpath, live healthcheck and restricted COPY scope.
`rtk proxy docker build --tag adilbaga-part03-api:review backend-go`: PASS, image
`613330007ee0`. Build was already running when the vulnerability gate returned;
collected its completion, did not start a runtime smoke after STOP.

Initial Docker runtime checks: **NOT RUN** after STOP, no smoke resources created.
Final rebuilt image: `5fa4b4112076`, same review tag, build PASS. Runtime/security/
DB-up/down/recovery checks now PASS; see remediation. No deploy/image push.

## J. Contract protection

`rtk git diff --name-only HEAD -- backend frontend contracts README.md scripts`
returned empty. Frozen OpenAPI/examples/API contract docs unchanged. Go router
test proves `/api/categories` is intentionally structured 404 and POST live 405.
Contract lint was NOT RUN at the initial STOP. Current `rtk pnpm lint` PASS:
Redocly validates the unchanged OpenAPI with exit 0. Final protected-path diff
including docs/production/API_V1_CONTRACT.md is empty. No business endpoint/parity claim.

## K. Database safety

**Production Supabase NOT USED. No DB schema/data mutation.** No production
environment file was loaded. No migration, seed, parser/import, INSERT/UPDATE/
DELETE/DDL or application SELECT. Only disposable local postgres:17-alpine smoke;
no existing DB service was contacted. Docker image initialization creates its
empty disposable database; no application schema, migrations or data were applied.

## L. Changed files

New backend-go/: module/sums, cmd/api main/tests, config/tests, httpapi/tests,
middleware HTTP/proxy/limiter/tests, JSON logger, postgres pool/tests, Dockerfile,
.dockerignore and safe .env.example. Updated this same Part03 report.
backend-go/README.md now documents scope/config/run/security/quality/Docker smoke
and explicitly says public business API parity is NOT implemented. Root README
has only a minimal additive foundation/reference note. Backend/frontend/contracts
source unchanged. Permanent production-part-03 target and Go artifact exclusions
were added during the owner's archive-only follow-up and retained.

## M. Remaining limitations

Initial blockers were the reachable dependency vulnerability and two failing
configuration tests. Both are now resolved; no Part03 demo/review blocker remains.
Business endpoints, SQL repositories, Redis/Gemini, metrics/tracing, Cloudflare
and deployment intentionally absent. Foundation gate PASS is not a launch approval.

## N. Integration impact and archive

NestJS remains traffic owner/reference; Next and frozen API remain unchanged.
No reset/rebase, staging, commit, push or deploy. No advance to Part 04.

Original implementation run stopped before archive creation. On the owner's
subsequent explicit request, a clean archive of that **BLOCKED draft** was created
via permanent `production-part-03` target:
`artifacts/production-part-03-review.tar.gz`.
The permanent target includes backend-go, NestJS/Next source, contracts and this report;
excludes actual env files, credentials, DB dumps/backups, dependencies, generated
build/test outputs, Go binaries/profiles, temporary workspaces and artifacts.
This is an incomplete review snapshot, NOT a claim that Part 03 gates passed.
Historical archive verification is recorded below. The final remediation archive
is rebuilt at the SAME path after all gates; source remains uncommitted.

Historical archive-only follow-up: PASS, 288 files; required Go/NestJS/Next
source, frozen contracts and report present. Zero forbidden paths, Go binaries,
known local credential hits or tested key/JWT/private-key pattern hits. Archived
report byte-matches the current report. Only safe .env.example files are included.
Final diff --check PASS. Tests were not rerun and blockers remain unchanged;
archive creation did not authorize remediation or mark Part 03 PASS at that time.

## External-review remediation — same Part 03

### Dependency security boundary

`go get golang.org/x/text@v0.39.0` then `go mod tidy`: PASS. Minimal explicit
transitive module override **v0.29.0 → v0.39.0** because pgx v5.11.0 still selected
the vulnerable older requirement. No replace, suppression, pgx change or downgrade
of runtime dependencies. chi v5.3.2 and x/time v0.16.0 also retained.

`go list -m golang.org/x/text`: v0.39.0. `go mod why -m` proves the path:
config → pgxpool → pgconn → x/text/secure/precis. Local source confirms pgconn's
SCRAM password normalization calls precis.OpaqueString.String. The shared module
upgrade fixes every linked path rather than guarding one caller. Security skill
fix-finding guided the narrow patch and separate source/bypass/compatibility passes,
performed in this single session without helpers. No unrelated security redesign.

Original strongest reproduction was the scanner's reachable GO-2026-5970 traces;
both post-upgrade and final pinned govulncheck runs exit 0, **No vulnerabilities
found**. This proves the selected graph no longer has that known finding; not a
claim of exhaustive security audit. Actual local PostgreSQL authentication/Ping
and recovery confirm ordinary pgx connectivity still works.

### DATABASE_URL and logging corrections

Before pgx parsing, nonempty hostname must pass unicode/utf8.ValidString. The
original `%bad` test remains: decoded invalid UTF-8 is rejected. Added direct
ValidateDatabaseURL tests for `%zz`, overlong `%C0%AF`, valid postgres/postgresql
and invalid sslmode. postgres.Open exercises both malicious representations,
invalid sslmode and valid lazy pool creation without Ping/network. Load and Open
share the same enforcement boundary; sanitized errors contain no URL/password.
All tests PASS without weakening the original assertions.

Startup uses the config-aware logger, not bootstrap INFO. Bootstrap remains only
top-level fallback for errors. Real Docker run with LOG_LEVEL=error emits no
startup/access INFO output, while existing metadata/privacy/recovery tests PASS.

### Full Go quality gates

All commands use RTK proxy, installed Go 1.27.1 and GOTOOLCHAIN=local.

| Gate | Final actual result |
| --- | --- |
| gofmt -w cmd internal; gofmt -l . | PASS, listing empty |
| go mod tidy / go mod verify | PASS / all modules verified |
| go test ./... (JSON output used for counts) | PASS, 20 top-level tests, 98 including subtests, 5 test packages, 0 failures/skips |
| go test -race ./... | PASS, full suite, no race findings |
| go vet ./... | PASS, exit 0 |
| go tool staticcheck ./... (v0.8.1) | PASS, exit 0 |
| go tool govulncheck ./... (v1.8.0) | PASS, exit 0, No vulnerabilities found |
| Docker multi-stage build | PASS, image 5fa4b4112076 |
| contracts/ rtk pnpm lint | PASS, unchanged OpenAPI valid |

Observability has no standalone test file; middleware tests exercise its JSON
logger and privacy. No selective-package check substituted for the full suites.
Backend/Next matrices were not repeated: protected source remained unchanged.

### Real disposable PostgreSQL / Docker smoke

Used only labeled Part03 resources: network adilbaga-part03, postgres:17-alpine
container adilbaga-part03-postgres, volume adilbaga-part03-data and API
adilbaga-part03-api. Private disposable credentials generated in memory; no env
file, URL or password printed. No app SQL/schema/seed. PostgreSQL port unpublished;
API published only at 127.0.0.1:18080. API --read-only, /tmp tmpfs, cap-drop ALL,
no-new-privileges, production APP_ENV and exact https://aktau.market CORS.

Two initial --internal-network smoke attempts timed out on the host API probe.
Read-only diagnostics proved API was running and ready=200 inside the container,
but actual published ports were null and no :18080 listener existed (host
ECONNREFUSED). All resources were removed after each attempt. Not hidden as PASS.
Resolved the smoke environment by using an isolated user-defined bridge, still
without public DB exposure and with API localhost-only. No Go/runtime code change.

| Final smoke check | Result |
| --- | --- |
| Docker health=healthy | PASS |
| ReadonlyRootfs + /tmp tmpfs | PASS |
| Runtime UID=10001; go/gcc/cc and /usr/local/go absent | PASS |
| DB UP: live=200/status=ok, ready=200/status=ready | PASS |
| GET /api/categories JSON 404 | PASS, intentionally no business parity |
| POST /health/live JSON 405 | PASS |
| Health no-store/JSON/safe request ID/no DB details | PASS |
| LOG_LEVEL=error startup/access INFO suppressed | PASS |
| DB DOWN: API stays running, live=200, ready=503/status=not_ready | PASS |
| DB RECOVERY: ready=200 without API restart | PASS, ID/StartedAt unchanged, RestartCount=0 |
| SIGTERM shutdown | PASS, exit 0 within 10 seconds |
| Owned containers/volume/network cleanup | PASS; unrelated resources untouched |

Smoke runner was temporary outside the repository. Final resource ownership was
checked before removal. Review image remains local only. Supabase NOT USED.

### Final review archive

Rebuilt via permanent production-part-03 target after full PASS, including new
Go README and updated report. Exclusion/credential/pattern/binary checks and
report byte-match are rechecked against final archive. No actual .env, secrets,
DB dumps/backups, Go binaries/profiles, dependencies, generated build/test outputs
or temporary Docker/WSL workspace is part of the review deliverable.

Final archive verification: **PASS, 289 files**. Required source/docs present;
zero forbidden paths, known credential hits, tested secret-pattern hits or Go
binaries. Current report byte-match PASS; every archived file also byte-matches
its working source (zero mismatches). Only safe .env.example files included.
Final git diff --check PASS; HEAD/origin remain 7ce1caebadfe2cfdd25d58ae6daa56d93028a763.

## O. Status

**READY_FOR_EXTERNAL_REVIEW** — initial toolchain blocker, reachable GO-2026-5970
and malformed URL test failures resolved without hiding their history. All
mandatory Go, Docker DB-up/down/recovery, protection and clean-archive gates PASS.
Supabase NOT USED. No commit/push/deploy; stopped for review, no Part 04 work.
