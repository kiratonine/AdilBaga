# Part19 — Backend 1 release & integration sprint

Status: **READY_FOR_EXTERNAL_REVIEW / PART19_SOURCE_READY**.
Date:2026-10-19. Production release/installation **NOT APPROVED**; C2 production OPEN.

## 1. Baseline and accepted inputs

Fresh fetch/prune exit0. Source/base/main: **beecb8c11219c7863f0c7722a8b4fdaaedfd72a5**.
New native-WSL branch/worktree: `feat/part19-backend1-release-integration` /
`aktau-part19-backend1-release-integration`. Existing worktrees and their local
reports preserved; no reset/rebase/stash/clean. Main checkout retains its two
pre-existing untracked C2 design reports. No historical report copied/rewritten.

Read root rules/full Owner TASK, roadmap, frozen v1/OpenAPI, deploy/compose,
revalidation, auto-deploy/alert/rollback/API-down docs, relevant Part15–18/C2
reports/source and external D1/D2/B-HOST inputs. Historical e6/Nest/no-Siri/
unprovisioned statements are not current production evidence.

Accepted **Backend2-reported**, not newly executed: first timed daily after PR44,
2026-10-19 18:00:34–18:02:28 +05, Result=success/exit0, three stores successful,
no stale sources; snapshot `541212ba-5c51-485c-91ec-ea78f77c3c39`, publishedAt
2026-10-19T13:02:26Z; raw3267/canonical3026/matched240. No repeated teammate request.
Frontend/Vercel accepted by Owner; no audit/config/deploy or Frontend changes.
Physical Siri and historical Voice438 acceptance preserved, not repeated.
AUTO_DEPLOY_ENABLED absent/disabled is accepted Owner evidence, not changed.
Private-repo ruleset enforcement is not assumed. Backend2 sudo expiry unchanged.

Source hosted [CI run39248661577](https://github.com/kiratonine/AdilBaga/actions/runs/39248661577)
for exact base SHA: **9/9 SUCCESS**, completed: Frontend, Pipeline Quality,
Contracts, Go Quality, Security, Nest Reference, PostgreSQL Integration,
Ephemeral Staging, CI Gate. Deployment workflow success is not rollout evidence.

## 2. Source deliverable and exact scope

No equivalent operator verifier existed (`auto_smoke.py` is deployment/Voice
tooling and would exceed this scope). Added:

1. `scripts/ops/verify-go-production.mjs` — standard-library operator CLI.
2. `scripts/ops/verify-go-production.test.mjs` —22 offline fixture/transport tests.
3. This report only.

Default/`--offline`: usage JSON, **0 network requests**. Explicit `--live`:
five fixed sequential HTTPS GETs only, no caller URL/query/header override,
8s absolute request timer,50s shared deadline,64KiB health/1MiB JSON body caps.
No redirects/retries/proxy agent/cookies/auth/discovery/Voice/HMAC. Uses declared
`AktauMarket-Operator-Verifier/1.0`, not browser impersonation or WAF evasion.
Timer spans connection through bounded complete body; abort/error/invalid UTF-8,
length mismatch/oversize and non200 stop. Separate invocations do not share
results; the injected verifier itself is one-shot. Tests never contact production.

Checks health status from current Go router, categories/ProductCard/dashboard
shapes from frozen v1, nullable fields, offer/store types and timestamp presence.
This is intentionally high-level regression/health validation, not a replacement
for complete OpenAPI/business parity or an availability SLA. Malformed200 schema/
JSON/content type yields FAIL; infrastructure/transport/WAF rejection BLOCKED.
Only bounded enum/status-class/latency/schema/outcome JSON and unambiguous dashboard
summary snapshotAt emitted. No HTTP bodies, private headers, IDs, prices, store
data, locations, session/customer data or raw exceptions are printed/stored.
No deployed SHA is inferred from GET.

Reproduce with Node24.10.0 (Go gates use installed Go1.27.2, non-root uid1000):

```bash
node scripts/ops/verify-go-production.mjs
node --test scripts/ops/verify-go-production.test.mjs
```

`--live` is an operational action requiring its own bounded authorization;
the Part19 five-GET allowance has already been consumed below. Do not repeat it.

## 3. Actual local test/integration results

Commands used RTK/proxy, installed Node24.10.0/Go1.27.2/pnpm10.32.1. Initial shell
defaults Node20/Go1.27.1 were inspected, then explicitly replaced in PATH for
gates; no dependencies/toolchain policy altered. Logs/temp executables outside Git.

| Actual command / check | Exit / actual result |
| --- | --- |
| node --test scripts/ops/verify-go-production.test.mjs | 0;22/22 PASS,0 SKIP; final91.742ms |
| Default CLI | 0; OFFLINE, requests0 |
| node --check both new modules | 0 each |
| go build -o owned-temp/relayprobe ./internal/revalidation/testdata/relayprobe | 0; unchanged local Go1.27.2 helper |
| C2_LOCAL_PROBE=owned-temp/relayprobe node --test scripts/revalidation/*.test.mjs scripts/ci/guard.test.mjs | 0;286/286 PASS,0 SKIP;26.141s |
| node scripts/revalidation/verify-part16.mjs | 0; static boundaries PASS |
| node scripts/ci/run-checks.mjs security | 0; source/workflow PASS;1/1 synthetic backup guard PASS |
| go test -count=1 ./... | 0;15 tested packages PASS; no-test packages not counted as tests; env-gated live profiles not asserted executed |
| go test -race -count=1 ./... | 0; same15 packages PASS |
| go vet ./...; go tool staticcheck ./... | 0 each |
| go tool govulncheck ./... | 0; no vulnerabilities found at this run |
| node --test scripts/deploy/auto-gate.test.mjs scripts/deploy/verify-part15.test.mjs | 0;52/52 PASS =21+31,0 SKIP |
| python3 -B -m unittest discover -s scripts/deploy -p 'auto_*_test.py' | 0;39/39 PASS |
| node scripts/deploy/verify-auto-deploy.mjs; node scripts/deploy/verify-part15.mjs | 0 each; offline static only |
| node scripts/ci/run-db-integration.mjs | 0; full7 race-enabled integration invocations, disposable PG17, six migrated DBs and cleanup PASS |
| node scripts/revalidation/joint-poc.mjs | 0;15/15 PASS,0 SKIP;14.888s; real Go CLI/PG17/FIFO with fixture HTTP evidence |
| node scripts/ci/run-checks.mjs contracts | 0; frozen install/lint PASS;12 static/schema tests PASS,10 HTTP tests SKIP without origin, not counted as PASS |
| Existing ephemeral harness local Go/Nest/contract subset, external local-parity.mjs | 0;5/5 Go parity tests PASS; Go and Nest each18/18 executed GET/schema contracts PASS;4 fixture-only Voice HTTP tests SKIP per GET profile |
| git diff --check; new-file whitespace/links/scope/privacy; archive checks | PASS at final artifact handoff |

Local parity subset reuses unchanged `scripts/ci/postgres.mjs`, fixture SQL and
the exact five parity test selectors from `run-ephemeral-staging.mjs`; creates
fresh owned PG17, builds reference Nest, starts owned loopback Go/Nest with test
credentials, runs existing contracts `test:live` against each, then terminates
owned APIs and cleans its PG. No Next E2E repeated (Frontend accepted/untouched).
Full parity command and fixture setup remain reproducible in the existing
ephemeral-staging script; no alternative business validator introduced.
The local Voice parity test executes controlled fixture flows, not live Gemini.

Three new disposable PG17 instances were used independently by DB runner, joint
PoC and parity subset; loopback bindings, four actual migrations, restricted roles,
ACL/RLS denial and cleanup handled by unchanged CI harness. No existing container,
production DSN, backup, schema or data touched. Joint PoC is SQL fixture COMMIT,
not real ingestion Stage/Publish and not production C2 acceptance.

## 4. Exact API runtime delta and immutable local candidate

Compared production-label SHA438ecdfa3d386a186dcd8b73c3c10aef5e79dc82 with main
using git diff/name-status and actual `go list -deps ./cmd/api` build inputs.

| Changed input | Classification / impact |
| --- | --- |
| cmd/c2projection, relay/trace testdata and Node observation tooling | C2_ONLY; not public routes/handlers |
| cmd/ingest and internal/revalidation Notify/relay | INGEST_ONLY/C2_ONLY; API dependency graph does not import revalidation |
| internal/postgres/c2projection.go | **RUNTIME_CHANGE (startup only)**: API imports postgres; four new package-level regexp.MustCompile calls retained in compiled postgres.init |
| go.mod | x/sys0.48.0 indirect→direct only; same version/go.sum/toolchain; x/sys not in API dependency graph |
| deploy/README.md | DOCS_ONLY; compose unchanged |

cmd/api, HTTP/Voice/config business paths, original SQL, Dockerfile, go.sum and
all other original API dependency source remain unchanged. No new request-path
query or API behavior is demonstrated. Nevertheless **API runtime delta YES**,
not an invented NO_GO_API_ROLLOUT_NEEDED: objdump exit0 independently confirms
four C2 regex calls in actual API package init. It does not establish urgency,
performance regression or a reason to deploy merely for tag freshness.

Controlled same-toolchain Linux diagnostic builds from release438 and main with
`-trimpath -buildvcs=false -ldflags="-s -w -buildid="` differ:
438 binary SHA256 d851d65d57dc8acd955552a683fd5b04694ca1eaf81e0476d24ac857565e36e6;
main b3852d5fc09555a5fb7d434e1f09bdaf082697a9cf291b5c71180730b89b9e2e.
These are local comparison builds, not bytes recovered from production image.

Built a **local-only immutable candidate** following existing Part15/auto-build
clean-export recipe, not by invoking deploy workflow or manufacturing GH context:
`git archive beecb8c… backend-go` → clean export → unchanged Dockerfile,
`docker build --pull --platform linux/amd64 --label org.opencontainers.image.revision=FULL_SHA`.
All117 exported source files match committed Git objects byte-for-byte.

- Source/tag/revision: beecb8c11219c7863f0c7722a8b4fdaaedfd72a5 /
  `adilbaga-api:beecb8c11219c7863f0c7722a8b4fdaaedfd72a5`.
- linux/amd64; UID10001:10001; entrypoint /usr/local/bin/api.
- One docker-save export:21,975,552bytes;
  SHA256 **c6baa01d02ad80910beb7f77f651aab2940caa791f6a9b2c8837ef5957dcb57d**.
- Exported API binary SHA256
  **fc68b28fdd1fc82434d834146de2940d5055c9522e356502caf3702dc9f0ce0e**.
- Three RootFS diff IDs preserved in local manifest; selected image metadata,
  export size/hash and copied API binary independently checked. Owned inspection
  container created only for docker cp, never started, then removed.
- Local artifact: `/tmp/aktau-part19-checks-pXaG3U8d/release/image.tar`;
  adjacent `manifest.json` contains only existing Part15 artifact fields.

**NOT transport/deploy approval**: this local artifact has no GitHub build-only
producer/artifact ID and no independently installed root authorization. Do not
invent those fields or pass this manifest to Variant A. That route requires a
separately authorized exact hosted build/Owner approval/install/transport and
rollback gate. Docker base tags are not digest-pinned; source identity and this
saved artifact are fixed, but arbitrary future rebuild byte identity is not
promised. No load/transfer/deploy, root approval or flag activation occurred.

## 5. Authorized production read-only batch — consumed once

New verifier `--live` executed **once**, exit0, five sequential GET only,
2026-10-19T14:24:19.275Z–14:24:23.902Z. All exact HTTP200/JSON/high-level schemas
PASS; no redirects/retries. Output intentionally contains status classes only.

| Endpoint enum | Latency ms | Schema / outcome |
| --- | ---: | --- |
| live | 563 | valid/PASS |
| ready | 1077 | valid/PASS |
| categories | 996 | valid/PASS |
| products (limit1) | 1149 | valid/PASS |
| dashboard | 842 | valid/PASS |

Dashboard summary snapshotAt **2026-10-19T13:01:59.318Z**, independently observed
public DTO field, not snapshot ID/publishedAt or a new live SQL observation.
Different offer-derived summary timestamp and Backend2 publication time are
not equated: frozen v1 semantics differ. No product/store details retained.
Latest actual image identity remains the earlier B-HOST438 label observation;
public GET does not attest deployed SHA or immutable binary provenance.

Fresh Part19 SSH allowance used **ONE connection**, one metadata operation,
no repeats of B-HOST1–8. Existing alias, BatchMode/strict host verification,
no PTY/forwarding/multiplex/proxy fallback;178s parent deadline, root GNU timeout
165s TERM/KILL. Fixed root read-only lstat projection for the four approved paths,
stop at first non-EXISTS; offline synthetic projections4/4 PASS beforehand.
No search/listing/file-content read. Sanitized result:
**wrapper ABSENT (ENOENT)**, operations1. This resolves prior E09 UNKNOWN for
`/usr/local/sbin/adilbaga-deploy` at this observation, not the cause of its earlier
generic error. Broker/state/authorizations were **NOT RUN/UNKNOWN** after STOP.
No permission/install/remediation or further SSH/commands attempted.

## 6. C2 handoff and open decisions

Use existing production supervisor/private factory, not fixtures or an ad-hoc
observer. Separately approved Owner/Backend2 installation must establish:
root-controlled immutable c2projection/relayprobe + independently approved binary
digests/sourceSHA; current alias/deployment ID/frontendSHA attestation; restricted
reader credential custody; private ledger and per-attempt FIFO under aktau-sync.
No new SSH/sudo rights. Fresh ledger-generated attemptId must be propagated to
the existing opt-in ingestion relay for the same **legitimate** publication.
Acquire qualified BEFORE S0 before canonical mutation; arm persistent reader,
refresh clock calibration within original35-minute supervision; actual204/FIFO S1;
capture six bounded representations; trusted Go AFTER S1/S0 using pinned witness;
independent unchanged deployment/post-cleanup attestation; finalize durable ledger.
No fixtureOnly/private-custody bypass, no new/restarted5s window or imported proof.
Retain21 GET/2 sitemap,≤20s diagnostics, shared≤5s acceptance,3 qualified PASS;
FAIL resets count, INCONCLUSIVE does not count. Production sequence not executed.

| Remaining gate | Owner / next action |
| --- | --- |
| C2 production acceptance OPEN | Owner + Backend2: separate authority/provisioning approval, then observe3 legitimate publications; scheduled success alone is not measurement |
| Broker wrapper absent, other paths UNKNOWN | Owner/Backend1: separately choose reviewed manual Part15 release or reviewed Variant A installation; never install/enable implicitly |
| Release decision / rollback compatibility | Owner/Backend1: defer non-urgent startup-only candidate or authorize exact artifact route; preserve/prove compatible previous image, then separately approve application/Voice release smoke |
| Monitoring/alerts and current backup recovery | Owner/Backend2: provide/accept real cadence, receipt/recovery and matching latest recovery evidence; scripts/local tests do not prove operations |
| Legal/contact and governance | Owner: approve real operator/contact/legal; do not imply paid ruleset enforcement or invent identity |

Recommended immediate choice: review/merge source tooling only; keep healthy438
until a separately justified release window. C2 rollout is independent of public
API image rollout and still requires its own explicit authorization.

## 7. Review artifact / safety

One fresh source archive through unchanged `scripts/create-clean-archive.mjs full-stack`,
unique copy `artifacts/adilbaga-part19-backend1-release-integration-20261019.tar.gz`.
Final SHA256 supplied in handoff (not self-embedded). Verify safe regular unique
members, every source/report byte, no Git/TODO/env/dependencies/builds/test outputs/
logs/backups/binaries or external image candidate included. No source-contract,
Go/Frontend/Backend2/DB/CI/CD edits. Old reports retain exact committed bytes.

Optional Draft PR only after final source gates/main check; PR URL/head/hosted CI
are reported separately, not preclaimed here. No merge or production deployment.
Production changes: **NONE**; only five public GET and one targeted SSH metadata
read. No Voice/HMAC/SQL/Redis/Gemini, sync/publish/restore, service/timer/ACL/secret/
settings change, real C2 observer or rollout. STOP for one independent Code Review.
