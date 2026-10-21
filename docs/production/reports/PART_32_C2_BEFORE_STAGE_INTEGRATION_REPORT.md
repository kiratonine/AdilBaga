# Part32 — Trusted BEFORE Stage Integration

## Current result

**BLOCKED_PRIVATE_READINESS_CONTRACT** — implementation stopped at TASK §4A/§6. Existing regressions pass; no new pre-Stage integration or production readiness is claimed.

- Date: 2026-10-20.
- Fresh `origin/main`, branch base and unchanged HEAD: `0095d9951f79d64c7ef9145344b0a1dd6a78867b`.
- Branch: `feat/part32-c2-before-stage-hook`.
- Native WSL worktree: `/home/denis/tmp/aktau-part32-c2-before-stage-hook`.
- Exact change scope: this report only. No source, tests, contracts, credentials or historical reports changed. No commit, push, PR or production access.
- Execution scope: Owner Part32 TASK and approved Backend2 production handoff, read from the primary checkout's TODO directory. The TASK expressly requires stopping before an unapproved private readiness protocol.

## Source findings

1. [Ingest](../../../backend-go/cmd/ingest/main.go) constructs the engine, then calls `engine.Stage(ctx, bundle)` at line 122. Existing FIFO/attempt setup follows Stage; `PublishThenNotify` and relay remain post-Stage/post-COMMIT. There is currently **no trusted pre-Stage readiness check**.
2. [Supervisor](../../../scripts/revalidation/c2-production-supervisor.mjs) `prepareObservation()` prepares the durable attempt, but trusted BEFORE, stable deployment identity validation, calibration and FIFO opening occur inside `observe()`. The call does not return an independently consumable live-reader READY acknowledgment before observation. An attempt ID, FIFO pathname or ledger file alone cannot prove this state.
3. [FIFO adapter](../../../scripts/revalidation/fifo-adapter.mjs) and [Go relay](../../../backend-go/internal/revalidation/relay_linux.go) implement a nonblocking, one-way post-notification event channel. The earlier approved Backend2 event reply explicitly selected this architecture instead of PREPARE/READY/RESULT. The production handoff describes operator preparation, not a reverse acknowledgment consumed by ingest. Adding that reverse channel changes the private integration contract.
4. [Provider](../../../scripts/revalidation/projection-provider.mjs) and [observer](../../../scripts/revalidation/production-observer.mjs) retain private registry/capture custody. A serialized READY file must not manufacture provider authority or bypass `fixtureOnly`. Existing projection eligibility is not proof that a live receiver is armed.
5. **Source/docs discrepancy:** [ingestor](../../../backend-go/internal/ingestion/ingestor.go) Stage acquires the session lock, captures the baseline and writes snapshot/source/raw staging records. Canonical products, mappings and offers are written by Publish, followed by the published status and transaction COMMIT. The approved Backend2 handoff agrees with this boundary. The broader canonical-Stage wording in the TASK and [C2 README](../../../ops/c2/README.md) is not supported by current code. This does **not** relax the new explicit requirement to have trusted BEFORE and receiver ready before Stage. No unrelated documentation was rewritten.
6. A proposed hook before Stage would also precede the ingestion lock acquired inside Stage. Readiness must not be described as an exclusive lock over S0. Existing baseline/chain validation must reject intervening publication; no new SQL/locking change is authorized here.

## Minimal private contract proposal — NOT APPROVED / NOT IMPLEMENTED

Backend1 and Backend2 need one jointly approved readiness extension before source implementation:

| Boundary | Proposed requirement | Owner |
| --- | --- | --- |
| Node preparation | Expose an internal one-shot armed boundary only after private BEFORE custody, eligible witness, stable deployment identity, calibrated clock, open persistent FIFO descriptor and durable armed state are established. | Backend1 |
| Local readiness channel | One bounded, per-attempt local Unix-domain exchange in an approved private operator namespace; exact endpoint, peer/ancestor/descriptor checks and record format require approval. No public endpoint, new privilege, secret or DB role. | Owner / Backend2 / Backend1 |
| Identity | Bind READY to the fresh attempt, S0, witness/projection digest, independently approved source and frontend/deployment identity, boot and expiry. Source identity must not be trusted merely because an environment variable claims it. | Backend1 / Backend2 |
| Authority | Only the reviewed supervisor with private provider custody can issue READY. Same-UID IPC ownership alone does not authenticate a reviewed executable or prove S0. A deserialized record never creates a production capability. | Backend1 / Owner |
| Ingest check | Immediately before the existing Stage call, opt-in apply flow checks one live, one-time acknowledgment. No hook or new I/O for disabled/dry-run flow. Agree and measure a short IPC budget bounded by the existing ingestion context; no polling, retry, sleep or extra DB/provider query in this path. | Backend2 / Backend1 |
| Failure | Missing, invalid, stale or inaccessible readiness means NOT_ARMED/INCONCLUSIVE and ordinary ingest continues. Preserve main-context cancellation and original Stage/Publish errors. A crash after acknowledgment cannot create PASS. | Backend1 |
| Completion | Preserve existing post-COMMIT HMAC and FIFO event. Consume/reconcile the attempt once, validate AFTER S1/S0 and identity, and retain private evidence. Never reset the 35-minute supervision deadline or actual-204-based 5-second SLA. | Backend1 / Backend2 |

The existing operator-before-publication approach avoids a new wire protocol but does not itself provide the requested ingest-consumed pre-Stage acknowledgment. A wrapper that launches ingest after arming would change publisher orchestration and is outside this source scope. Neither alternative was implemented.

**Next action:** Owner and Backend2 approve the readiness authority/channel, exact identity binding, one-time lifecycle and bounded check semantics above; then resume Part32 source implementation and its fail-first tests. No production permission is requested by this proposal.

## Required implementation regression matrix

These are acceptance tests for the proposed extension, **NOT IMPLEMENTED / NOT RUN** in this blocked Part:

- Trusted READY → Stage → COMMIT → Notify → existing relay, using synthetic adapters.
- Missing/failing/expired readiness, wrong attempt/identity, ownership, symlink, orphan state and absent reader: ordinary ingest continues; zero qualified C2 PASS.
- Disabled/dry-run: zero readiness I/O; cancellation remains cancellation.
- Stage/Publish failure: no notification/relay. Committed notification failure: unchanged degraded behavior.
- Replay, reader death after READY, stale calibration and intervening publication: INCONCLUSIVE, no forged capability or restarted clock.
- Measured bounded local-check latency; unchanged HMAC body, 2xx notifier semantics and HTTP attempt count.

Existing `PublishThenNotify` callback tests, supervisor OS mocks and real local FIFO relay tests provide partial regression seams, not a working cross-process pre-Stage acknowledgment. No cosmetic test-only hook was added to imply otherwise.

## Actual local checks

Environment: Node 24.10.0, Go 1.27.2, `GOTOOLCHAIN=local`; RTK wrappers used. Logs and relayprobe are in an owned temporary directory outside Git. All following commands completed with exit **0**:

| Command | Actual result |
| --- | --- |
| `git fetch origin --prune` and branch/base/status checks | Fresh main matched the baseline; clean new worktree before this report. |
| `cd backend-go && go test -count=1 ./cmd/ingest ./internal/revalidation ./internal/ingestion` | PASS, all three packages. |
| `cd backend-go && go test -count=1 ./...` | PASS, default Go test selection. Integration-build-tagged PostgreSQL/live tests were not selected; this is not a PG17 or production integration claim. |
| `cd backend-go && go build -o <owned-temp>/relayprobe ./internal/revalidation/testdata/relayprobe` | PASS, local relayprobe built. |
| `C2_LOCAL_PROBE=<owned-temp>/relayprobe node --test scripts/revalidation/*.test.mjs scripts/ci/guard.test.mjs` | **286/286 PASS, 0 FAIL, 0 SKIP**; synthetic/local fixtures only. |
| `node scripts/revalidation/verify-part16.mjs` | PASS, static verifier only. |
| `node scripts/ci/run-checks.mjs ops` | **177/177 PASS, 0 SKIP**. |
| `node scripts/ci/run-checks.mjs security` | PASS, source/workflow checks and synthetic backup/security checks. |

Final report-only integrity checks: `git diff --check` exit 0; local Python assertions exit 0 for all eight Markdown links, exact one-untracked-report scope, unchanged tracked source/history and bounded report privacy scan (private-key blocks, credential-bearing PostgreSQL URLs and quoted secret assignments). This bounded scan is not a repository-wide secrets audit. No Docker, production HTTP/SQL/SSH/Redis, ingest apply, installation, systemd, deployment or publication was performed.

## Production gates retained

- Part31: approval record absent and inactive installation NOT_RUN **according to the last supplied evidence**, not refreshed by Part32. This report neither creates nor bypasses independent root approval.
- C2 production acceptance: last supplied status **0/3 NOT_RUN**; no new observation.
- Recovery: last supplied status **RECOVERY_BLOCKED_INPUT**; no backup access or restore.
- Backend2 authorized a narrow source hook, not a new acknowledged IPC contract or production rollout. Its running publisher and services remain untouched.
- No Draft PR, hosted CI or source review archive was produced: the implementation prerequisite is blocked, so publication gates were not reached.

## 2026-10-21 — source completion continuation (in progress)

The preceding BLOCKED_PRIVATE_READINESS_CONTRACT is historical, not a current
claim that Backend2 approval is missing. Owner-provided
ADILBAGA_PART32_APPROVED_CONTRACT_SOURCE_IMPLEMENTATION_HANDOFF_2026-10-20 confirms
the delegated approved Unix READY contract; source details are delegated to
Backend1. The separately named Backend2 response was not present in the primary
checkout TODO inventory; the supplied approved handoff is used without inventing
unseen response text. No further Backend2 approval is requested.

Fresh origin/main6a4b4c7a91ec471db54987b689c3c87a785523a3; new native worktree
`aktau-part32-c2-final-integration`, branch `feat/part32-c2-final-integration`.
Only open PR at initial inventory:55, separate deployment diagnostics, untouched.
Owner authorizes source development/ordinary protected merge, but explicitly
**forbids GitHub Release** notwithstanding the older TASK wording. No release/tag
will be created. VPS deployment, production acceptance and operator trust inputs
remain pending; no production connection is performed in this continuation.

Contract freeze is in [C2 README](../../../ops/c2/README.md), Part32 private READY
v1. Two executable fail-first Go tests exited1 for missing pre-Stage request and
missing true S0 metadata; after initial implementation both pass, exit0.
Dashboard/product snapshotAt cannot substitute for snapshots.publishedAt:
private ready-before adds an envelope from the SAME already-selected RR snapshot
row, no SQL; ordinary projection-v2 before/after documents remain unchanged.
Stage gets only an immutable baseline accessor, no extra query/lock/transaction.

Current scoped implementation: one1500ms Unix exchange; root-controlled process/
executable/deployment authority; one-time nonce/baseline binding; fail-open ingest
and fail-closed relay; Node arm/observe lifecycle with durable armed/consumed
checkpoints. Independently provisioned ready.json is a prerequisite, never issued
by source code. See final appendices below for actual completion evidence when
available; this checkpoint is **not** a source-release/CI/production PASS.

Local Go readiness tests currently PASS: real Unix response, canonical framing,
duplicate/unknown/type/oversize rejection, attempt/nonce/source/frontend/boot/
deployment/digest/timestamp/expiry negatives, timeout/cancellation, peer/path/mode/
symlink/authority drift and one-use baseline mismatch. Focused5 Go packages
(ingest,c2projection,revalidation,ingestion,postgres) exit0. JS syntax exit0.
Existing supervisor suite currently11 PASS/1 FAIL: the old stable fixture does
not yet model private baseline envelope/READY arming. It is being extended without
dropping its positive assertion. Full/integration/hosted gates are NOT_RUN yet.

An additional local Node24 lifecycle experiment proved automatic socket cleanup
deletes a replaced pathname. The source design therefore uses the approved Go
clock/relay ELF's narrow ready-server child, pinned-parent bind,
SetUnlinkOnClose(false), kernel peer credentials and inode-checked own cleanup.
It is not a new daemon/privilege/HTTP service. Replacement/orphan resources must
remain untouched. Actual Go/Node/PG17 joint integration is still outstanding.

## 2026-10-21 — completed local implementation and source review

**SOURCE_IMPLEMENTED_LOCAL_GATES_VERIFIED; publication gates recorded below.**
This continuation supersedes the historical blocked/in-progress assessments,
without rewriting their evidence. Production C2 remains **0/3 NOT_RUN** and
deployment is **PENDING / NOT_AUTHORIZED by this source task**. The Owner's
attachment explicitly forbids GitHub Release: no release or tag will be created.
Ordinary protected PR/main integration, not a GitHub Release, is the requested
source milestone. Physical Siri, Frontend and current production API are accepted
Owner context, not retested or modified here.

### Exact source inventory and preserved boundaries

30 scoped files, based on exact main6a4b4c7a91ec471db54987b689c3c87a785523a3:

- Go ingest main/test: one bounded opt-in check immediately before Stage; trace
  admission only after binding the actual locked Stage baseline.
- Go ingestion ingestor/baseline_test: value-only accessor, no query/lock change.
- Go c2projection main/test and internal/postgres/c2projection: private
  ready-before envelope with actual publishedAt from the existing RR row;
  unchanged legacy v2 output, query literals, selection and SQL privileges.
- Go revalidation ready, ready_linux, ready_other, ready_peer,
  ready_peer_linux, ready_server_linux and their tests; real publication
  integration test; existing relayprobe gains narrow ready-server/operator modes.
- Existing Node projection-provider, c2-production-supervisor and its tests,
  fifo-adapter; ready-ipc/ready-launch tests; two explicit local fixture parents.
  No sixth runtime Node module or changed installer inventory.
- joint-poc source pins: original provider SELECT literals preserved; other
  PostgreSQL repository files compared to the accepted6a baseline (includes
  earlier reviewed P1 pool mitigation, not the obsolete pre-P1 tree).
- CI run-checks Go profile includes real-relay Node regressions; existing DB
  runner retains every old test and adds a second isolated PG17 cluster for
  Part32, because immutable writer bootstrap forbids pre-existing role members.
- Existing ops/c2 README freezes wire, process/peer authority, lifecycle and
  future provisioning. This single Part32 report preserves its original prefix.

Zero changes to frontend, public contracts, Prisma/schema/migrations, SQL query
literals, matching/parsers, existing HMAC client/body, Relay wire, runtime API,
deploy workflow/broker/compose, systemd/timers or PR55. The Stage/Publish methods
retain signatures/transaction semantics; no extra database query is introduced.

### Authority, arming and fail-open boundary

The complete private contract is in [C2 README](../../../ops/c2/README.md#part32-private-ready-v1-source-contract-no-production-provisioning).
One canonical4096-byte-max request/response on an operator-private per-attempt
Unix socket;1500ms total ingest admission+IPC budget, no retry/poll/sleep. The
private1500ms context never replaces the original context passed to Stage.
Canonical strict Go decoding+remarshal and Node framing reject duplicate/unknown
keys, extra frames, wrong types, malformed values and oversized input.

Only independent root-controlled ready.json can bind source/frontend/deployment,
actual protected Node process birth/command, approved executable/module/ingest/
relay hashes, UID/GID, boot and expiry. Same UID, JSON, env, caller flags or
fixtureOnly cannot issue this authority. Root bootstrap is a later admin action:
clean immutable command, permanent in-process privilege drop to the literal
existing aktau-sync account, non-dumpable process, no capabilities. No such
record/bootstrap was created/executed against production by this task.

Node qualifies BEFORE/witness, opens the existing persistent FIFO and fsyncs
armed ledger before serving READY. The Go-owned child listener uses kernel
SO_PEERCRED, pinned-parent/no-follow/inode checks, atomically0600 socket and
SetUnlinkOnClose(false). It is non-dumpable; same-UID access to its private
/proc/fd pipe is actually denied in a native non-root regression. One nonce is
durably consumed before responding. After Stage, a one-use ticket checks exact
S0 ID/UTC millisecond publishedAt; intervening publication excludes C2 only.

Lost/forged/expired/replayed READY, death, bad peers/custody, mismatched baseline
or unavailable C2 never becomes an ingest failure or new notification attempt.
Stage/Publish failure never notifies. Successful COMMIT with notifier failure
keeps original degraded semantics. Existing204/FIFO/AFTER/private capture custody
are preserved. Live helper/unchanged root authority and frontend identity are
rechecked before GET and qualification/finalize. Unverified cleanup retains safe
HTTP evidence and operator.lock, returns INCONCLUSIVE, never deletes a foreign
resource or silently retries. Exclusive coordinated operator namespace custody
is required; inode checks do not claim atomic unlink against malicious same-UID
concurrent writers. Crash/orphan state requires independent reconciliation.

Existing35-minute supervision/calibration refresh, actual204-based5s acceptance,
20s diagnostics,21GET/2sitemap, frozen witness selection and series semantics
remain: FAIL resets, INCONCLUSIVE does not count; three genuine qualified PASS
are still required. No local fixture can satisfy production acceptance.

### Actual tests and error/fix ledger

Non-root WSL; Node24.10.0, Go1.27.2/GOTOOLCHAIN=local. Logs/builds in an owned
temporary directory outside Git. All PostgreSQL is harness-created disposable
PG17/loopback, fixed local credentials and restricted roles, never production.

| Command / check | Actual result |
| --- | --- |
| New ordering/private-S0 tests before implementation | exit1, two meaningful missing-behavior failures; not fixture syntax errors |
| Focused5 Go packages, count1 | exit0, PASS |
| Focused5 Go packages, race/count1 | exit0, PASS |
| Real Go/Node Unix round-trip | PASS, measured27–51ms in local synthetic authority profile; not a privileged production attestation |
| Node full revalidation+guard with built local relayprobe | exit0,321/321 PASS,0 SKIP |
| Original joint-poc.mjs | exit0,15/15 PASS,0 SKIP; real Go CLI/FIFO, old fixture publication semantics retained |
| Full run-db-integration.mjs | exit0, all original checks plus real new pre-Stage chain; both owned PG17 clusters cleaned |
| New PG17 healthy chain | real Go BEFORE/Unix READY/Stage/Publish COMMIT/HMAC204/FIFO/6 HTTP loopback bodies/real CLI AFTER, local PASS,fixtureOnly=true |
| New PG17 intervening publication, Stage failure, Publish failure, notifier401 | all4 INCONCLUSIVE,0 GET; normal business/error/degraded outcomes preserved; canonical/mapping/offer no-mutation assertions before Publish and failed Publish |
| Ops profile | exit0,177/177 PASS,0 SKIP; sandbox installer/no-clobber/orphan regressions preserved |
| Security profile | exit0, source/workflow/backup guards PASS; not a complete repository security audit |
| Contracts profile | exit0,12 PASS/10 explicitly skipped live-fixture cases; NOT claimed22/22 executed; full fixture execution recorded separately below |
| Pipeline profile | exit0, existing tests/typecheck PASS; intentional error-injection logs not real failures |
| Part16 verifier, changed JS syntax | exit0, PASS; static evidence only |

Ordinary failures were diagnosed and corrected, not hidden or called PASS:
prepared synthetic bundle used int instead of permitted float64 volume scalar;
added bundle-shape regression and fixed fixture. Publish-failure injection
violated existing status/publishedAt CHECK; fixed the injection, not schema.
Reusing writer bootstrap across test databases violated the unchanged no-members
guard; use a second fresh cluster, not weakened roles/SQL. Native experiment
proved Node net.Server.close can unlink a substituted path; replaced that narrow
listener with the approved Go child's explicit known-own cleanup. Protected
process metadata uses /proc/PID/status owner, not the user-owned top PID directory.
Added real parent EOF, foreign replacement and orphan-retention tests. One added
test initially exceeded Unix pathname length; shortened only its owned temporary
path and made server output close on exit to avoid a hung assertion. Cleanup
verification then exposed Go race test helper's default1s post-exit sleep;
GORACE=atexit_sleep_ms=0 applies ONLY to test subprocesses, retains race detection
and production timeouts. The subsequent full PG17/race run passed.

### Source review and remaining runtime inputs

Self-review inspected source-to-sink trust, opt-in ordering, canonical wire,
timeout/cancellation, real peer credentials, no-follow filesystem custody,
durable nonce/interlocks and unchanged HMAC/publication/HTTP budgets. This is not
an independent GitHub reviewer approval. Effective GitHub rules were read:
PR and CI Gate required, force/deletion forbidden, required reviewer count0;
no settings changed or admin-bypass requested. Merge still requires actual full
green hosted CI and ordinary GitHub admission, recorded below when completed.

Future separately authorized operator work, NOT performed here:

1. Build from exact merged source using documented trimpath/linux-amd64 recipe;
   independently approve c2projection/relayprobe/ingest and five Node modules.
   Preserve existing API/Backend2/DB/timers and older staging; do not reuse an
   obsolete Part31 approval as authorization for new bytes.
2. Genuine independent root installer approval, source-manifest/receipt and
   inactive --verify/--install under unchanged orphan/no-clobber rules. Separate
   authorization.json, restricted reader.dsn and independently verified Vercel
   alias/deployment/frontend SHA are mandatory; never API/ingest/owner DSN reuse.
3. Root-controlled clean Node bootstrap with private protected child stdio,
   drop privileges without exec, inspect actual birth/command/executable and
   independently create one bounded ready.json for its unique ledger attempt.
   Own private FIFO namespace prepared by the authorized operator; no new service,
   sudo/SSH privilege, global sysctl/permission change or self-issued approval.
4. Arm before a legitimate publication. Go compares READY S0 with locked Stage
   baseline; actual post-COMMIT signed204/FIFO, trusted AFTER and independent post
   identity/inactive opt-in/cleanup attestation complete provisional evidence.
   Retain all safe samples/failed/inconclusive histories. No artificial sync.
5. Three genuine qualified production PASS within unchanged5s SLA; publish-source
   rollout/rollback requires its own deployment authorization and exact hashes.
   Current source completion alone neither activates C2 nor changes live API6a.

### Final local mandatory gates before PR publication

All commands completed, exit0 (no production resources):

- `node scripts/ci/run-checks.mjs go`: gofmt, tidy/verify/no module drift,
  full Go unit/race, vet, staticcheck default+integration, govulncheck (no
  vulnerabilities), API/ingest/relay local builds and321/321 Node PASS,0 SKIP.
- `node scripts/ci/run-ephemeral-staging.mjs`: real disposable PG17, full
  selected fixture-backed GET contract checks, local TLS, Docker runtime/hardening,
  DB outage/recovery without API restart and all owned-resource cleanup PASS.
  Two contract runs each18 PASS/4 Voice-only SKIP; source-defined automatic
  Playwright HTTP selection14 PASS/6 fixture-conditional SKIP. The six GET cases
  skipped by standalone Contracts execute here; four fixture Voice cases do not.
  These pre-existing profile exclusions are not claimed as executed PASS; no
  production API or manual Frontend/Siri test was performed.
- `node scripts/revalidation/joint-poc.mjs`:15/15 PASS; separate new actual
  Stage/Publish/READY integration passes in full DB runner as detailed above.
- Ops, security, contracts, pipeline and Part16 static verifier passed as listed.
- Changed JS syntax PASS. Final protected-path zero-diff, report historical
  prefix, Markdown file links and bounded privacy checks are required at the
  publication checkpoint; they are not substituted by these tests.

No SKIP is represented as executed PASS. GitHub hosted/main results are still
pending at this checkpoint. AUTO_DEPLOY_ENABLED read back false, unchanged;
no Actions plan/deploy, production SSH/HTTP/SQL, root approval or installation.

### Hosted CI first attempt — concrete audit blocker and narrow correction

PR [56](https://github.com/kiratonine/AdilBaga/pull/56), head
71e78c5ce34590a0b013055dae7627b3c4cdc936, run
[39520491656](https://github.com/kiratonine/AdilBaga/actions/runs/39520491656)
**FAILED**, not9/9: Contracts, Frontend, Go Quality, Security and Pipeline Quality
SUCCESS; Nest Reference FAILURE; PostgreSQL Integration/Ephemeral Staging SKIPPED;
CI Gate FAILURE. No merge occurred on this failed run.

Actual Nest job log proves frozen install, generate, build and27/27 tests PASS;
`pnpm audit --prod` then exit1 on existing follow-redirects1.16.0 via axios1.20.0.
Independently reproduced locally before correction, exit1/two high advisories.
GitHub reviewed advisories
[GHSA-q3jh-wrc6-jgq8](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8) and
[GHSA-8r9p-f939-6h3c](https://github.com/advisories/GHSA-8r9p-f939-6h3c)
both identify1.16.1 as patched. This is an existing dependency CI failure, not
a READY test failure or evidence of observed credential exposure in production.

Under the Owner's instruction to fix ordinary CI blockers to completion, the
only additional path is backend/pnpm-lock.yaml: four substitutions resolve only
follow-redirects1.16.0→1.16.1 and its integrity/snapshot. Generated with pnpm10.32.1
`pnpm update follow-redirects --depth Infinity --lockfile-only`; package.json,
axios version, all other resolutions, Nest runtime source/API, SQL/schema,
Frontend and contracts remain unchanged. Final scope is **31 files**, superseding
the original30-path prepublication checkpoint. No audit suppression/ignore,
workflow/branch-rule weakening or production action. Final rerun follows below.

Local `node scripts/ci/run-checks.mjs nest` after the narrow lock correction:
exit0; frozen install, Prisma client generation (no migration), Nest build,
27/27 unit/HTTP tests,0 SKIP and production audit **No known vulnerabilities**.
The initial hosted failure and skipped downstream jobs remain historical;
they are not relabeled as green. The next exact-head hosted run must prove all9.

### Second hosted attempt — newly published Go standard-library advisory

Exact head488949660240969d6d244813f61ae055de21f5e1, run
[39561583810](https://github.com/kiratonine/AdilBaga/actions/runs/39561583810)
FAILED at Go Quality govulncheck; all Go unit/race, vet and both staticcheck
selections passed first. Nest Reference now SUCCESS (27 tests and clean audit),
as are Contracts/Frontend/Pipeline/Security. Downstream PG/staging SKIPPED,
CI Gate FAILURE. This is not a successful required9-job run.

Actual hosted govulncheck and a fresh independent local reproduction (exit3)
identify [GO-2026-6809](https://pkg.go.dev/vuln/GO-2026-6809), compromised
intermediate-certificate distrust in crypto/x509: found Go1.27.2, fixed1.27.3.
The previous local no-vulnerability result is preserved as a historical scan,
not a claim about the later vulnerability database. Official
[Go downloads](https://go.dev/dl/?mode=json) confirms stable1.27.3; the Go
toolchain downloader retrieved it through its normal verification mechanism.

Minimal coherent build correction: backend-go/go.mod patch directive1.27.3 and
backend-go/Dockerfile builder1.27.3-alpine; existing C2 README build recipe updated.
No Go module/library dependency upgrade, API/DB/cache/ingest behavior or deploy
workflow change. The running API/image is NOT rebuilt/deployed by this source
task. This is necessary to meet the Owner's full CI/security gate, not an audit
suppression. Final scope **33 paths**, including the two build pins and earlier
single Nest lock patch. All later builds/tests/hashes use Go1.27.3; old measured
1.27.2 tests are not silently reused as proof of the new toolchain.

## 2026-10-21 — source integrated through normal protected PR

PR [56](https://github.com/kiratonine/AdilBaga/pull/56) was merged normally at
2026-10-21T07:36:41Z after exact head
**2d48c2a92bab7ed9df6273e4a8fa81ae30e6a257** passed all nine jobs in
[39562227237](https://github.com/kiratonine/AdilBaga/actions/runs/39562227237).
REST merge pinned that head; GitHub reported mergeable_state=clean first. No
admin bypass, rule/settings change, force push, direct-main push or PR55 merge.

Actual merged main: **3d92ef933ea1de463c3ea34e7de6d554abe76975**.
Fresh fetch and immutable tree comparison show all source bytes equal the
reviewed feature head. Separate push-main CI
[39563207068](https://github.com/kiratonine/AdilBaga/actions/runs/39563207068)
was queued/running at this checkpoint; it is **not yet claimed successful**.
Final readback is recorded below. No GitHub Release or tag was created, as
explicitly forbidden by the Owner attachment overriding the older Markdown TASK.

All required local checks repeated successfully under **Go1.27.3** after the
build pin correction: focused5 packages/count1 and race/count1; complete Go
profile including tidy/verify/vet/staticcheck/default+integration/govulncheck
(no vulnerabilities), Node321/321/0 SKIP; joint PoC15/15/0 SKIP; complete two-
cluster PG17 integration with all5 new Stage/Publish scenarios; ops177/177,
security/Part16 and ephemeral staging including Docker build, outage/recovery
and owned cleanup. The existing conditional skips remain as enumerated above.
An initial new-toolchain quality invocation correctly rejected uncommitted
go.mod as Git dependency drift; after committing the intentional patch pin,
the same unchanged guard passed. No check was disabled to make the tree green.

### Final exact changed paths (33)

```text
backend-go/Dockerfile
backend-go/go.mod
backend-go/cmd/c2projection/main.go
backend-go/cmd/c2projection/main_test.go
backend-go/cmd/ingest/main.go
backend-go/cmd/ingest/main_test.go
backend-go/internal/ingestion/baseline_test.go
backend-go/internal/ingestion/ingestor.go
backend-go/internal/postgres/c2projection.go
backend-go/internal/revalidation/ready.go
backend-go/internal/revalidation/ready_linux.go
backend-go/internal/revalidation/ready_linux_test.go
backend-go/internal/revalidation/ready_other.go
backend-go/internal/revalidation/ready_peer.go
backend-go/internal/revalidation/ready_peer_linux.go
backend-go/internal/revalidation/ready_publication_integration_test.go
backend-go/internal/revalidation/ready_server_linux.go
backend-go/internal/revalidation/ready_server_linux_test.go
backend-go/internal/revalidation/testdata/relayprobe/main.go
backend/pnpm-lock.yaml
docs/production/reports/PART_32_C2_BEFORE_STAGE_INTEGRATION_REPORT.md
ops/c2/README.md
scripts/ci/run-checks.mjs
scripts/ci/run-db-integration.mjs
scripts/revalidation/c2-production-supervisor.mjs
scripts/revalidation/c2-production-supervisor.test.mjs
scripts/revalidation/fifo-adapter.mjs
scripts/revalidation/fixtures/part32-joint-parent.mjs
scripts/revalidation/fixtures/ready-parent.mjs
scripts/revalidation/joint-poc.mjs
scripts/revalidation/projection-provider.mjs
scripts/revalidation/ready-ipc.test.mjs
scripts/revalidation/ready-launch.test.mjs
```

### Exact-main local build / future independent review packet

Built from a new `git archive` export of merged main3d92ef9, not a mutable VPS
checkout; Go1.27.3, CGO_ENABLED=0/GOOS=linux/GOARCH=amd64, documented trimpath
recipe, projection ldflags `-X main.sourceSHA=3d92ef933ea1de463c3ea34e7de6d554abe76975`.
Ingest separately built with `go build -trimpath ./cmd/ingest`. Local only,
no binary upload/execution on VPS, artifact authorization or installation.

| Exact local artifact | SHA256 |
| --- | --- |
| c2projection | `fabcfa7ddcd51e7685ce57c3a9de5dc123668671a8774d6709b4be8166ec3d8e` |
| relayprobe | `dda6075cbc5a0001dcc0b5a7a447e9e9553b63549ed6eadc8b5795636cfc8281` |
| ingest | `d06f99b3be0e8aee62b169121fc9917c29160726985249a3bd6cabdb32045183` |
| c2-production-supervisor.mjs | `72b5dc46c1bc705caa839c58b5f3f3e0c71de30121869e45536662152642279e` |
| projection-provider.mjs | `be64de92f206493d5698e442b6882296439a262f17147b2804db0c0dc0b41bb9` |
| fifo-adapter.mjs | `bfea914d48fb312753fb39c6546cefa148f1e4c948a393ac3a8eb684f3f7ed5c` |
| production-observer.mjs | `8e52f34b82fe15d552140270c8b56c292bf99f6d87b41021aa9f6e2d742b30f2` |
| c2-manifest.mjs | `e5ed6854f2182b3f8a108e2525585224337d0e3fb4a9eb587450b7213ac3978a` |
| source-manifest.json | `b832675eb55e00b6d7b35478ec22b944af17d760a8a57b7994fc3cf8ada970be` |
| unchanged install-reviewed-c2.py | `b9b2a80a037efcc115d29eb592f353ab785b058bbd0341548c42942344d9eb98` |

Existing `c2-provisioning-plan.mjs --review-bundle` verified exact8-file public
bundle, ELF platform, original Git module bytes and source recipe: exit0,
**REVIEW_REQUIRED_NOT_APPROVAL**. Bundle is local
`/tmp/aktau-part32-main-build-dWL92Rap/bundle`; ingest is its sibling file.
These uploader-generated public hashes are not independent root approval.
Runtime Node executable digest/actual process birth, reader identity, frontend
alias/deployment proof and one-time root ready record remain operator-dependent,
NOT_VERIFIED in this source-only task. No values or approvals are fabricated.

### Requirement-by-requirement source completion audit

| Requirement | Authoritative evidence / current source result |
| --- | --- |
| Trusted actual BEFORE before Stage | private Go ready-before RR metadata, actual Go/Node/PG17 integration and source ordering tests PASS |
| S0 vs locked baseline, witness and one-time nonce | value-only Stage accessor, intervening publication zero-GET test, canonical wire/replay tests and durable consumed checkpoint PASS |
| Fail-open ingestion / fail-closed C2 | Stage/Publish/notifier fault matrix, unavailable/trust/custody/expiry tests, unchanged business outcomes PASS |
| Disabled/dry-run zero new I/O | call confined to apply branch; disabled/invalid opt-in return before I/O; previous dry-run/config tests preserved |
| Real peer/protected private process | actual Unix SO_PEERCRED round-trip and non-dumpable same-UID private-pipe denial PASS; privileged provisioning deliberately not performed |
| HMAC/FIFO/AFTER and deadlines preserved | original regressions plus actual signed204/FIFO/Go AFTER joint chains PASS; no v2/selection/SLA changes |
| Cleanup/crash/orphan/interlock | own cleanup, foreign replacement, parent EOF, replay/lost helper and durable-ledger negative regressions PASS |
| Complete local integration and quality | all commands/results above; source-only synthetic trust clearly distinguished from production authority |
| Hosted PR exact head |9/9 SUCCESS, run39562227237, actual normal merged PR56 |
| Final main exact push CI | pending at this checkpoint; final observed result must supersede below |
| One historical report preserved | same canonical report, original prefix untouched; final checks below |
| Production deployment/C2 acceptance | NOT_RUN /0 of3; later separate authorization and genuine publications required |
| GitHub Release/tag | deliberately NOT_CREATED per explicit Owner prohibition, not a missing source deliverable |

This operational appendix is local evidence appended after merge; it does not
pretend to have been inside its own earlier merge commit. All runtime source
bytes remain equal to exact merged main. No new source PR is opened merely to
embed the CI run's own resulting SHA in a circular report update.

## Final authoritative result — supersedes historical pending checkpoints

**PART32_C2_SOURCE_RELEASED_DEPLOYMENT_PENDING.**

Fresh final GitHub+Git readback proves:

- PR56 actually MERGED, normal merge commit/main
  **3d92ef933ea1de463c3ea34e7de6d554abe76975**; no admin bypass or direct-main push.
- Exact PR-head CI39562227237 **9/9 SUCCESS** and, separately, exact merged-main
  **push** CI [39563207068](https://github.com/kiratonine/AdilBaga/actions/runs/39563207068)
  **9/9 SUCCESS**, completed, headSha exactly the merged SHA above.
- Every mandatory job SUCCESS: Contracts, Frontend, Go Quality, Security,
  Nest Reference, Pipeline Quality, PostgreSQL Integration, Ephemeral Staging,
  CI Gate. No queued/skipped job counted. Earlier failed runs remain failures.
- origin/main unchanged at this final readback; AUTO_DEPLOY_ENABLED literalfalse,
  never enabled by this task. PR55 remains outside scope.
- Source bytes in this worktree equal merged main. The only local tracked
  difference is this append-only post-merge operational evidence, explicitly
  not misrepresented as a new reviewed/pushed source commit.

Final local integrity:33-path scope vs6a, protected Frontend/public API/contracts/
migrations/SQL/query/HMAC/deploy paths preserved; changed JS syntax and diff-check
PASS. Both original historical prefix and exact merged report prefix preserved;
historical prefix SHA256
`e11fe714fcb49d4113e9c7d7f41a902cadb9cedbe30a4172d64ec3af9b5a317e`.
Markdown file targets resolve. Bounded changed-file privacy scan rejects private
key blocks, token patterns and nonlocal credential-bearing DSNs; one exact
synthetic@fixture.invalid OS-mock canary is explicitly excluded, not a credential.
This bounded check is not an exhaustive external security audit.

Final clean source archive is generated with unchanged create-clean-archive.mjs
full-stack, unique name
`adilbaga-part32-c2-main-3d92ef9-20261021.tar.gz` under this worktree's artifacts/.
It contains exact current source and this full operational report, no compiled
binary, TODO, .git, .env/credentials, node_modules, build/test/cache/backup data.
Archive member bytes are independently compared with current files; all source
except the disclosed report appendix is exact merged-main. The SHA256 is
delivered alongside the archive, not embedded recursively inside its own report.

**Owner/Backend1 handoff:** source implementation, local real Go/Node/PG17 chain
and normal protected main integration are complete. Follow the exact-main
build/hashes and staged independent-approval/reader/frontend/process/READY
provisioning sequence above in a **separate authorized VPS deployment task**.
Do not deploy the local synthetic fixture, copy an old approval, infer actual
Vercel identity from main SHA, or activate unattended CI/CD. Qualify three
genuine publications with preserved histories; production C2 remains0/3 NOT_RUN
by this task. No new publication or observer was started. Existing live API,
DB, ingest service, Frontend, Siri, secrets, systemd and timers were not operated
on or mutated in this Part32 continuation. No GitHub Release/tag was created.

**STOP: no additional features or production action.**

## 2026-10-21 — controlled production continuation: immutable publisher gap

**Current status: BLOCKED_INDEPENDENT_LAUNCHER_REVIEW; production C2 remains0/3.
No stable Release/tag, installation or production activation.** This continuation
does not supersede historical failures with local success. The complete earlier
independently reviewed report is preserved byte-for-byte as prefix, SHA256
`02d0d8921ce44d89d8e360fa1ece8ae75e89fb1a4d980699c5f4846adad8b6fe`.

### Fresh source/host evidence, not inferred deployment

New native worktree `/home/denis/tmp/aktau-part32-c2-production-wiring`, branch
`feat/part32-c2-production-wiring`, base/main
**b5f9c1b1c473ffd8f53364d350168c37acb5193a**. Fetch/branch/status/remote PR
metadata checks exit0. PR57 merged normally, exact-main
[39580274959](https://github.com/kiratonine/AdilBaga/actions/runs/39580274959)
all9 jobs SUCCESS. PR56 source remains unchanged in all C2/Go/ops runtime paths.
No other worktree or PR55 changed. GitHub `AUTO_DEPLOY_ENABLED` is literalfalse,
unchanged; `gh release list` empty at preflight.

Two bounded read-only SSH sessions through existing `my-vps`, strict host-key
verification, BatchMode and agent-forwarding disabled, exit0 each. Sanitized
collectors used fixed argv with bounded outputs; no raw environment, credentials,
logs, DB or private file contents were emitted. Collector files remained outside
Git; they were passed to remote Python stdin, not installed on the host.
Readback UTCs **11:24:32.465571** and **11:27:32.957317**,2026-10-21.

| Actual production evidence | Result |
| --- | --- |
| Sync checkout | `/opt/aktau-sync`, owner999:987,0755; `.git`0775; branch `deploy/scrum19-sync`, clean, HEAD **28cc3fc2c25c434e166874e8f5b08e48d0e3b6df** |
| VPS local main and cached origin/main | **beecb8c11219c7863f0c7722a8b4fdaaedfd72a5**, stale; must NOT switch blindly |
| Live API Docker revision | **6a4b4c7a91ec471db54987b689c3c87a785523a3**, running/healthy, restart0,OOMfalse |
| API rollback | **438ecdfa3d386a186dcd8b73c3c10aef5e79dc82** image present, exact revision |
| `/opt/adilbaga` | root-owned0755, no Git checkout; not mistaken for runtime image SHA |
| Go host | `/usr/local/go/bin/go`, root0755, **go1.27.2**; NOT eligible for the required1.27.3 source |
| Node/pnpm | **v24.18.0 /10.32.1**; Node symlink resolves to root0755 regular ELF |
| Daily/weekly service | idle oneshot inactive/dead, MainPID0,Resultsuccess,ExecMainStatus0,Useraktau-sync |
| Daily launch | expected Bash daily-sync.sh/working checkout/environment-file identity matched; contents not dumped |
| Daily timer | active/waiting, next2026-10-21 18:00+05 (13:00UTC), previous06:00:34+05 |
| Weekly timer | active/waiting, next2026-10-26 03:00+05 (Oct25 22:00UTC), previousOct19 |
| Monitor/tunnel | monitor timer active/waiting; cloudflared active/running |
| C2 live targets | all3 fixed installation destinations absent; root approval/authorization/ready/deployment/reader/receipt and fixed ingest ELF absent |
| C2 staging | existing obsolete bundle source **0095d9951f79d64c7ef9145344b0a1dd6a78867b**; reserved orphan-stage count0 in3 fixed parents |
| Existing operator parent | `/var/lib/aktau-sync`999:9870755, inode797968, unchanged; no chmod/chown |

`git diff origin/deploy/scrum19-sync origin/main -- pipeline
backend/prisma/migrations` is empty (exit0). Merge-base is beecb8c; the deploy
branch is not an ancestor, so a naive fast-forward assumption is invalid.
Current main retains SCRUM-19 pipeline/migration bytes. This is source evidence,
not proof that a production migration checksum was queried. Host migration file
SHA256 `188422787905275faae1d42eb91ca7a9873bf8bbca0d4b1954a03029e751bc42`;
actual applied DB migration state remains NOT_VERIFIED (no reader/SQL).

Exactly **4 public GET**, zero POST/HEAD; redirects/proxies disabled,7s timeout,
bounded1MiB responses, no raw body retained:

| Path | HTTP /duration_ms | Safe result |
| --- | --- | --- |
| `/health/ready` |200 /616 | readytrue; Cloudflare header present |
| `/api/categories/milk/filters` |200 /1202 | volumeMl/fatPercent/brand; fat allowlist **[1.5,2.5,3.2,6]** |
| `/api/categories/dairy/filters` |200 /983 | brand-only |
| `/api/dashboard` |200 /714 | summary.snapshotAt **2026-10-21T10:06:19.801Z** |

The dashboard timestamp is NOT published Snapshot identity. Actual current S0
ID/date, effective restricted reader privileges, fresh backup/restore parity and
current Vercel alias/deployment attestation remain NOT_VERIFIED. No Siri/Voice
POST, Redis, SQL or new publication was needed for this blocked checkpoint.

Host safe fingerprints (SHA256, not private contents):

```text
daily-sync.sh bcd8c13182529fa161fa707931ab5a88cc90f9a2002cc2244ae67c446dc35975
go.mod b5d2de8af2ffd8735c419dd010fdc1f8d8d8c12838b8f34e38a1e7330d473f8e
daily.service 0991814d560b0ea66b71d04a5f8819098c839f6744c9049609167c97413db89a
weekly.service cae2c88b6d966edfb4611105220095a9b20086a4c98fa620df272ad1448e2ffb
daily.timer 0f3bef8cd6d3e4da39cbfffdaee02444782f50f252690b315daccca5361ebc0a
weekly.timer 407634b68f8b3757c19c5b252aaee3f643d63d939d4ded551c69a4d0927a313e
monitor.timer 6d5c83cd4d50d6ed1c40550709f702a020110e7b5c23fd307bf3303ef43691bc
cloudflared.service bfec0c1271f37a7d02402dc75a876c5dedf79de4b9fcccdbf5c0afd140502d05
Node24 ELF 41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c
Part30 journal ce5626f05012c6eb295a8c05711d514a82d575aa515e33abb6ba01e55fbb5593
```

Old bundle's c2projection/relay hashes respectively
`e3d23f4c9993eeee47052fd912a095774a6d7854cae41105b7541547d8dfe1d3` /
`8f44110a0f371063a87eb8cd588c8af193e7dd3cfe565d3e8220d3a6d5129ced`.
Its old supervisor/provider/fifo hashes are
`c60ec3590fbd7cbdbe9873efe002a0d48206200de68d3e500790aa9ba1356c91` /
`2566004e253a8f3bb421d3037619e15e3457eecf0dcfc6b18be3fe2fc7961abe` /
`991f0e6ea97fec2ce4c9ba13df34509cd0d33a22057fecd9cdfd8bb14c5e3543`.
The old observer/manifest hashes equal the prior table above; old public bundle
source-manifest hash `5349a05a5157b65ccbe0dde3cc08919292c0dc3ce06ed5f0c93b1ebb80fa7529`.
Part30 journal and preserved Part28 directory were not changed. Direct expected
files were absent at the old preserved directory's root; its nested contents
were not inspected, so it is NOT described as empty or corrupt.

### Fail-first and minimal candidate source boundary

Initial new scheduled-launch regression failed (exit1): both `go run` invocations
cannot be an independently attested executing ELF. After correction the same
test passed. New Python11 tests and Node3 tests passed exit0,0 SKIP, including
the actual scheduled Bash fixture's0/3/1 exit outcomes, not only a regex mock.

The new launcher reuses existing independent root READY/authorization fields;
it does NOT mint them. Fixed root0555 single-linked linux/amd64 ELF
`/usr/local/libexec/aktau-c2-ingest` must match ready.ingestSha256. Root ancestry,
source/relay binding, boot, strict canonical JSON, expiry and operator UID/GID
are checked. Fixed pinned root Go inspector checks host and candidate1.27.3;
native inspection bounded1s/32KiB, child killed/reaped on failure. No arbitrary
executable/env override, downloaded toolchain, new SQL, HMAC or handshake.

Same pinned descriptor executes both dry-run and apply through `/proc/self/fd`;
root record/descriptor drift excludes C2. Only apply gets the derived per-attempt
FIFO/attempt. An exclusive fsynced0600 publisher.claim in existing0700 operator
namespace coordinates one pair; it is not independent authority. Unknown/partial
claims persist; no auto deletion/retry. Actual unchanged Go peer/nonce/S0 checks
are still the only READY authority. Missing/untrusted/lost C2 falls back to the
ordinary publication path with inherited C2 values stripped, never fake armed
or PASS. `GOTOOLCHAIN=local` makes required host maintenance explicit.

This is a material launcher/trust-boundary candidate: **independent review is
mandatory before any VPS update**, even after CI. All positive authority tests
use safe synthetic OS mocks, not production/root approval. No observer started.

Exact intended scope8 paths: daily-sync.sh, new c2-ingest-launch.py and its Python
test under pipeline/scripts; new scripts/ops/c2-ingest-launch.test.mjs;
scripts/ci/run-checks.mjs; ops/c2/README.md; ops/sync/README.md; this single report.
Go/Node C2 algorithm, SQL, migrations, API, Frontend, HMAC and systemd unchanged.

### Dependency-ordered administrative handoff (not executed)

1. Independent review of the new exact launcher candidate/PR/CI. Do not install
   it or silently merge then activate it while this checkpoint is outstanding.
2. Separate admin Go1.27.3 maintenance/provenance and toolchain rollback. Preserve
   SCRUM-19 branch28cc3fc, data, existing unit/env/timers and current API images;
   require no active sync at any later checkout change. Never switch to beecb8c.
3. After reviewed integration/exact-main CI, rebuild exact-source kit+separate
   ingest, fixed launcher/import closure; independent root verifies SHA256 and
   issues real approval. Retain obsolete staging/journal/quarantine, no overwrite.
4. Independently provision actual restricted reader, prove effective read-only
   authority without revealing DSN, attest actual Vercel alias/deployment/SHA.
   No identity inferred from current main or an old Owner-reported SHA.
5. Prepare source/toolchain/ingest/unit rollback and verify fresh recovery point;
   use existing no-clobber verify/install only after all gates pass. Root reviews
   real Node process/closure then issues per-attempt35min READY, never Codex.
6. Observe only genuine scheduled publications, with new attempt/nonce each,
   full BEFORE/lockedS0/COMMIT/actual204/FIFO/AFTER/custody evidence; qualify3
   consecutive PASS≤5s, FAIL resets, INCONCLUSIVE does not count. Current0/3.
7. Only then postflight/rollback checks and immutable stable Release. No Release
   URL exists at this checkpoint. No fake background observation promised.

No production filesystem/service/permission/source changes were made. Existing
API, SCRUM-19 sync, timers, Telegram, Frontend, DB and Siri were preserved.

### Local mandatory gates — actual execution,2026-10-21

Native Node24.10.0, pnpm10.32.1, Go1.27.3 with GOTOOLCHAIN=local. All below
executed against local isolated resources, NOT evidence of production acceptance.

| Actual command | Exit / result |
| --- | --- |
| `node --test scripts/ops/c2-ingest-launch.test.mjs` before correction |1, expected source-policy regression reproduced |
| `python3 -B -m unittest discover -s pipeline/scripts -p test_c2_ingest_launch.py -v` |0,11 PASS/0 SKIP,14 admission negative subcases plus native faults |
| `node --test scripts/ops/c2-ingest-launch.test.mjs` after correction |0,3 PASS/0 SKIP; Python boundary and6 actual scheduled-shell business scenarios |
| `go test -count=1 ./cmd/ingest ./internal/ingestion ./internal/revalidation ./internal/postgres ./cmd/c2projection` (backend-go) |0,5 packages PASS |
| same5 packages with `-count=1 -race` |0,5 packages PASS |
| `node scripts/ci/run-checks.mjs go` |0, full Go tests/race/vet/staticcheck including integration tags/govulncheck/build PASS; Node321 PASS/0 SKIP with real local relay |
| `node scripts/revalidation/joint-poc.mjs` |0,15 PASS/0 SKIP, real local Go/PG17/FIFO fixtures |
| `node scripts/ci/run-db-integration.mjs` |0, two disposable PG17 clusters; migrations, ACL/identity/pool/batch/security and5 real Go BEFORE/Stage/Publish fault cases; owned cleanup PASS |
| `node scripts/ci/run-checks.mjs ops` |0,180 PASS/0 SKIP; new launcher regressions actually included in hosted Security profile |
| `node scripts/ci/run-checks.mjs security` |0, source/workflow/private-data guards and backup synthetic test PASS |
| `node scripts/ci/run-checks.mjs contracts` |0,12 PASS/10 conditional SKIP, not22 PASS |
| `node scripts/ci/run-checks.mjs pipeline` |0, install/unit/typecheck PASS, SCRUM-19 tests unchanged |
| `node scripts/ci/run-checks.mjs nest` |0, generated client/build/unit27 PASS/0 SKIP/audit PASS |
| `node scripts/ci/run-checks.mjs frontend` |0, typecheck/lint/unit273 PASS/build/audit/Playwright command PASS |
| `node scripts/ci/run-ephemeral-staging.mjs` |0, local real API/PG17 HTTP E2E14 PASS/6 conditional SKIP, Docker readonly/nonroot/compiler/health/outage/recovery/cleanup PASS |
| `node scripts/revalidation/verify-part16.mjs` |0, static boundaries PASS, not deployment evidence |
| JS `node --check` for2 changed JS; Python AST for2 new files; `bash -n pipeline/scripts/daily-sync.sh` |0 each |
| `git diff --check`; private external integrity checker |0,exact8 paths,15 local Markdown targets, reviewed report prefix and bounded privacy patterns PASS |

The staging contracts run twice had18 PASS/4 conditional Voice fixture SKIP
each, not22 PASS. Go's opt-in live/profile tests were NOT activated by default
unit commands; targeted local integration was executed through the DB runner.
No skipped live smoke is called production PASS. Mock frontend navigation uses
no actual analytics IDs/hits. Build E2E stderr contains early-stream-close server
diagnostics, but the actual test command exit was0; no assertion was disabled.

Read-only host commands were fixed projections of `git -C /opt/aktau-sync`
branch/HEAD/status/ref/remote under the service owner, `systemctl show/cat` for
the6 named units, exact tool `version`, Docker API State/revision/restart and
old rollback revision, plus lstat/no-follow SHA256 of the explicitly named public
source/staging files. No full Docker inspect/env dump or log query. Private
collector SHA256s: inventory
`3755f7821a708a150be798ee266e18d1eeb9e7f6964ba31462c3bba2a53de846`,
metadata `935a7c01555e237c41d796f1abc360a1e63ea817e491ef7abfba44096d443a75`.
SSH invocations used `sudo -n /usr/bin/timeout --signal=TERM --kill-after=5s`
with105s then45s Python collectors; SSH strict verification/BatchMode/connect10s.
Both session/process exit codes0. Individual sanitized commands included their
exit code; absent checkout refs/files were retained as NOT_VERIFIED/absent, not
silently repaired. No read of reader/ready/approval/env/backup payloads occurred.

GitHub classic branch-protection endpoint returned404 (exit1), not evidence that
main is unprotected. Actual effective `/rules/branches/main` query exit0 proves
PR required, CI Gate required, deletion and non-fast-forward prohibited. Required
reviewer count0 does NOT replace this task's independent launcher-review gate.
Migration file SHA256 on main matches the observed host file exactly; this still
does not prove applied DB state. New source PR/CI and artifact readback follow
below; no stale main CI is substituted for new candidate CI.

### Published source candidate and non-authorizing local artifact packet

Own normal commit **5cbec01928cc81a6e2aeaedf4fa3ebba3d059519**,8 paths, pushed
without force to `feat/part32-c2-production-wiring`.
PR [58](https://github.com/kiratonine/AdilBaga/pull/58), base mainb5f9c1b; no
merge or production activation. Exact-head hosted
[39594654889](https://github.com/kiratonine/AdilBaga/actions/runs/39594654889)
was running at this checkpoint; final result appended below, not presumed PASS.

An additional unmodified frontend E2E invocation with JSON reporter was made
solely to recover accurate skip accounting (the CI helper truncates output):
`pnpm test:e2e --reporter=json`, clean loopback env, exit0, **51 expected PASS,
11 SKIP,0 unexpected,0 flaky**. The8 analytics dummy-ID/canonical-specific cases
were not enabled, plus3 device-specific skips. No real tracking hits. This is
separate from local HTTP staging14 PASS/6 SKIP and does not test live Frontend.

Exact-feature source was exported via `git archive 5cbec019...` into a new
owned temporary directory. No mutable checkout/VPS source was substituted.
Go1.27.3,CGO_ENABLED=0,GOOS=linux,GOARCH=amd64; documented trimpath kit recipe
and `-X main.sourceSHA=5cbec01928cc81a6e2aeaedf4fa3ebba3d059519` for projection;
separate `go build -trimpath ./cmd/ingest`. All3 builds exit0. `go version -m`
confirms actual ingest go1.27.3,linux/amd64,CGO0,trimpath. This is a local
review candidate, NOT an approved or deployed exact-main artifact. Rebuild
after accepted protected integration; do not reuse its feature source SHA as main.

`node scripts/ops/c2-provisioning-plan.mjs --review-bundle
/tmp/aktau-part32-wiring-build-YBmWNU/bundle
5cbec01928cc81a6e2aeaedf4fa3ebba3d059519`: exit0,
**REVIEW_REQUIRED_NOT_APPROVAL**. No upload or remote binary execution.

| Candidate artifact | Local SHA256 |
| --- | --- |
| c2projection | `e3c1300ad7801ec77631ca3a1c622bd74fa4b1f4ad0047ecd277604a646b11a1` |
| relayprobe | `dda6075cbc5a0001dcc0b5a7a447e9e9553b63549ed6eadc8b5795636cfc8281` |
| ingest | `d06f99b3be0e8aee62b169121fc9917c29160726985249a3bd6cabdb32045183` |
| supervisor | `72b5dc46c1bc705caa839c58b5f3f3e0c71de30121869e45536662152642279e` |
| provider | `be64de92f206493d5698e442b6882296439a262f17147b2804db0c0dc0b41bb9` |
| fifo | `bfea914d48fb312753fb39c6546cefa148f1e4c948a393ac3a8eb684f3f7ed5c` |
| observer | `8e52f34b82fe15d552140270c8b56c292bf99f6d87b41021aa9f6e2d742b30f2` |
| manifest | `e5ed6854f2182b3f8a108e2525585224337d0e3fb4a9eb587450b7213ac3978a` |
| public source-manifest.json | `ffc9ba34b51c8f10531326e50d07b9ba920506a2e0dcf363e9f089bb0cbafa6d` |
| unchanged installer | `b9b2a80a037efcc115d29eb592f353ab785b058bbd0341548c42942344d9eb98` |
| new launcher | `7a441769b7b59006bd16f65f277b801838e8c825c063f6f55be0e6054a882194` |

Additional read-only GitHub metadata disclosed6 open Dependabot alerts, not
hidden by green CI or `pnpm audit --prod`:2 high/4 medium, GHSA-587h-7wmj-h5pm,
GHSA-698v-4r3x-3vcv,GHSA-r825-w8mm-5pxw, each for Vite in frontend8.3.2 and
pipeline7.3.6 dev-tool lockfiles; patched versions8.3.3/7.3.7. Actual lockfiles
match the reported versions. Production exploitability was NOT investigated
or asserted. No out-of-scope Frontend/dependency edit or alert dismissal was made;
separate scoped maintenance is required before claiming zero release blockers.
The automatic Vercel Preview status on this PR is not proof of the production
alias identity and is not substituted for independent deployment attestation.

This post-commit operational appendix is deliberately local, not misrepresented
as content already inside its own source commit. The archive includes it; all
non-report source bytes must match5cbec019 exactly. The prior committed report
and independently reviewed historical prefix remain immutable prefixes.

The historical production convergence delay is still ROOT_CAUSE_NOT_VERIFIED.
This candidate fixes executable admission/wiring, not Next/Vercel caching; local
fixture PASS cannot resolve the historical production SLA failure. Weekly full
scrape remains explicitly no-publish and unchanged. No attempted C2 result was
discarded: there were **zero production observer attempts**, not3 failed tests.

Future deployment of the separate ingest ELF must itself be a reviewed root
no-clobber operation: absent fixed destination, verified exact bytes/owner/mode,
protected ancestry, preserved previous source/toolchain/command rollback and
independent readback before issuing READY. The unchanged eight-file installer
does not magically install that ninth executable or this checkout launcher.
No generic overwrite command or permission expansion is authorized by the
source candidate. The full immutable process/import closure remains a root-admin
inspection prerequisite; the measured standalone Node hash is insufficient.

### Final authoritative checkpoint — source candidate ready, production BLOCKED

Exact candidate **5cbec01928cc81a6e2aeaedf4fa3ebba3d059519**,
[PR58](https://github.com/kiratonine/AdilBaga/pull/58), hosted
[CI39594654889](https://github.com/kiratonine/AdilBaga/actions/runs/39594654889)
**completed SUCCESS,9/9 SUCCESS**: Contracts, Frontend, Go Quality, Security,
Nest Reference, Pipeline Quality, PostgreSQL Integration, Ephemeral Staging,
CI Gate. No pending/skipped job counted as successful. `gh run watch
39594654889 --exit-status --interval15` exited0. Fresh PR readback OPEN,
MERGEABLE/CLEAN; not merged because the new launcher needs independent review.

Fresh origin/main remains **b5f9c1b1c473ffd8f53364d350168c37acb5193a**,
its separate CI39580274959 also verified completed9/9 SUCCESS. No new merged-main
candidate CI exists because this candidate has not been merged. No direct-main
push or branch/rules bypass. Initial GitHub CLI metadata queries rejected
unsupported baseRefOid/url fields (exit1); supported PR/REST readbacks succeeded,
not inferred from those rejected commands. Release REST list is empty.

Exact commit paths:

```text
pipeline/scripts/c2-ingest-launch.py
pipeline/scripts/test_c2_ingest_launch.py
pipeline/scripts/daily-sync.sh
scripts/ops/c2-ingest-launch.test.mjs
scripts/ci/run-checks.mjs
ops/c2/README.md
ops/sync/README.md
docs/production/reports/PART_32_C2_BEFORE_STAGE_INTEGRATION_REPORT.md
```

Final Git source integrity: all non-report files match the published commit;
only this append-only post-commit operational report differs locally. Both
committed report and full earlier reviewed report are preserved as byte prefixes.
Other reports/runtime/contracts/migrations/Go/Frontend/SQL/systemd remain
unchanged. Source scope8 paths, Markdown targets, JS/Python/Bash syntax,
bounded privacy scan and `git diff --check` exit0. No skipped production check
is promoted to PASS. Node's observed real ELF path is
`/usr/local/lib/nodejs/node-v24.18.0-linux-x64/bin/node`; its hash alone is not
process/closure approval.

Single clean review artifact is built by the unchanged
`node scripts/create-clean-archive.mjs full-stack`, renamed no-clobber to
`artifacts/adilbaga-part32-c2-production-wiring-review-20261021.tar.gz`.
Archive verification requires regular safe tracked members only, no .git/TODO/
.env/credentials/node_modules/build/test/cache/binary/backup files, all member
bytes equal disk, all non-report bytes equal5cbec019, both report prefixes
preserved. SHA256 is supplied beside the archive, not recursively embedded in
its own report. The archive is source review material, not installer approval.

**BLOCKED_INDEPENDENT_LAUNCHER_REVIEW** is the immediate hard stop. Remaining
external gates also include Go1.27.3 host maintenance, independently approved
exact-main artifacts/root closure/READY, restricted reader and actual Vercel
alias/deployment attestation, demonstrated fresh recovery/rollout rollback,
then3 genuine scheduled qualified publications and final release checks. Open
dev-tool advisories above are disclosed, not waived by this source PR.

Production status remains the timestamped healthy API6a4b4c7 / clean SCRUM-19
sync28cc3fc readback above. **No VPS writes/install/checkout update, no timer or
service change, no new approval/credential, no publish/SQL/HMAC/Voice POST,
no live observer and no dataset change by this task.** Exactly2 read-only SSH
sessions and4 public GET. AUTO_DEPLOY_ENABLED stayedfalse. Actual production
C2 **0/3 NOT_RUN**; stable Release/tag/URL **NOT_CREATED**, correctly gated.

Resume this same task only after independent source review and real external
trust evidence; do not replace absent authority with this report or local tests.
**STOP for independent Code Review.**

## 2026-10-21 — PR58 independent review: P1-01/P1-02 launcher correction

**Current source status: READY_FOR_EXTERNAL_REVIEW after final exact-head CI
readback below. Production status remains BLOCKED, C2 acceptance0/3.** This is
the Owner-approved SOURCE fix, not a continuation of VPS activation. All prior
text, including the earlier incorrect source candidate and historical evidence,
is preserved. Full previous archive report prefix:63125 bytes, SHA256
`d0b91e5261544166d448b7e2b95e53be8741fbd125ba0ea9c9de34de80f14091`.
The earlier9/9 CI did not detect these defects and is not reused as fix evidence.

### Preflight and fail-first reproduction

Existing native worktree/branch unchanged:
`/home/denis/tmp/aktau-part32-c2-production-wiring`,
`feat/part32-c2-production-wiring`. Fresh fetch exit0; previous HEAD and actual
PR58 head **5cbec01928cc81a6e2aeaedf4fa3ebba3d059519**, main
**b5f9c1b1c473ffd8f53364d350168c37acb5193a**, old CI39594654889 verified
completed SUCCESS. The only initial local change was the disclosed previous
append-only operational report; it matched the old archive report exactly.
No reset/rebase/stash/force or other worktree/deploy-branch change.

Before runtime edits, added2 isolated regression methods. A first test-double
attempt lacked Popen.args; that harness error was fixed BEFORE changing runtime.
The valid fail-first command
`python3 -B -m unittest discover -s pipeline/scripts -p test_c2_ingest_launch.py
-k test_p1 -v` then exited**1**:3 assertion failures for expiry/replacement/auth
loss (ELF dry-run followed directly by ordinary-only apply), plus2 errors from
unhandled actual Popen-constructor ENOENT/EACCES (dry/apply). These were the
independently reported defects, not a TypeError or missing fixture. Final green
tests retain the complete-pair assertion; its expectation was not weakened.

Go source confirms default `-apply=false` sets default_transaction_read_only=on
and calls engine.DryRun, not Stage/Publish. A second ordinary dry-run is therefore
read-only; no extra publication, SQL change or canonical mutation was introduced.

### Finite-state correction and unchanged trust boundary

One admitted immutable pair is attempted, then at most one complete ordinary
pair. Stable authority executes the same pinned descriptor for dry-run and apply,
same bundle and corresponding flags; only apply gets the derived C2 values.
Authority loss before apply discards the C2 candidate and restarts ordinary
**dry-run then apply**, not ordinary apply alone. The ordinary pair always has
all inherited C2 values stripped and GOTOOLCHAIN=local. No readmission, new claim,
claim deletion or retry loop; partial/orphan evidence remains preserved.

The dedicated child boundary separates Popen construction from waiting for an
already-started process. Only known constructor/exec errors ENOENT,EACCES,EPERM,
ENOEXEC,ENOTDIR,ELOOP,ETXTBSY can become `preexec_unavailable`. With fixed argv,
no shell/preexec_fn and Popen's exec-error channel, the program has not executed;
a complete ordinary pair is safe even when that failed exec was the apply phase.
Unknown errno/exception, EBADF or any wait error is not evidence of pre-exec and
does NOT retry. In particular ENOENT raised by wait is not classified as spawn
failure. Any child nonzero/committed-degraded outcome propagates unchanged.
**At most one apply program starts**; a failed exec attempt is not a publication.

SIGTERM/SIGINT return143/130. Cancellation/uncertain wait terminates the owned
child, waits up to1s, then kills/reaps with another bounded wait when required;
no fallback after cancellation or a possible commit. Added logs are enum-only
authority_lost/preexec_unavailable, never exception strings, raw authority,
attempt values, DSNs or child payloads. Failure does not print false success.

Root ancestry,0555/single-link immutable fixed ELF, digest/source/boot/expiry/
canonical JSON/version checks, publisher.claim/fsync and descriptor pinning are
unchanged. Go READY1500ms, Stage/S0, HMAC/FIFO/AFTER, Node custody,35min supervision,
5s SLA,21 GET/2 sitemap/20s diagnostics and3-PASS policy remain unchanged.
Normal SCRUM-19 source/category/migration behavior and0/1/3 scheduled outcomes
are preserved. No default Go path, executable env override or dependency added.

### Actual regression coverage and local command results

Native WSL **UID1000 nonroot**, Node24.10.0, Go1.27.3, pnpm10.32.1;
existing `cc` Ubuntu13.3.0, no compiler/dependency installation. Native tests
compile a tiny fixture-only C ELF in a private temporary directory, use actual
Popen/pass_fds and `/proc/self/fd`, and verify both process argv/env and distinct
child PIDs. Synthetic admission mocks explicitly do NOT prove root approval.
Native ENOEXEC before dry-run / EACCES before apply each prove complete ordinary
fallback, with one started apply. Real SIGTERM/SIGINT during both dry-run and apply
verify143/130, no retry and reaped child. All generated executable/fixture data
stays outside Git and is cleaned by the owning tests.

Original11 Python tests remain, with their subprocess doubles moved to the new
explicit execution boundary, assertions retained. Final22 methods cover16 root
admission negative subcases, real pinned READY expiry/replacement/auth drift,
ambiguous spawn/wait errors, terminate/KILL/reap, immutable business errors and
signals, fallback dry-run/apply failure, claim conflict/partial evidence, native
exec/cancellation and stable identity positive controls. The scheduled Bash
fixture now covers7 scenarios including two stale scrapers (exit3), with no real
scraper/API/DB invocation.

| Actual command in this fix stage | Exit/result |
| --- | --- |
| Python unittest discover above, full `-v` |0,22 PASS/0 SKIP |
| `node --test scripts/ops/c2-ingest-launch.test.mjs` |0,3 PASS/0 SKIP, actual Python/native-ELF and scheduled shell tests |
| `bash -n pipeline/scripts/daily-sync.sh` |0 |
| `python3 -m py_compile pipeline/scripts/c2-ingest-launch.py pipeline/scripts/test_c2_ingest_launch.py` with external PYTHONPYCACHEPREFIX |0; own bytecode outside Git removed before archive |
| `node --check scripts/ops/c2-ingest-launch.test.mjs` |0 |
| `node scripts/ci/run-checks.mjs ops` |0,180 PASS/0 SKIP; repeated after final source/test changes |
| `node scripts/ci/run-checks.mjs security` |0, source/workflow/backup guards PASS |
| `node scripts/ci/run-checks.mjs pipeline` |0, frozen install/unit/typecheck PASS |
| `node scripts/ci/run-checks.mjs go` |0, full Go/race/vet/staticcheck/integration-tag analysis/govulncheck/build; C2 Node321 PASS/0 SKIP with local relay |
| `node scripts/ci/run-db-integration.mjs` |0, fresh two-cluster disposable PG17, all existing C2/READY/ACL/migration/integration profiles and owned cleanup PASS |
| `node scripts/revalidation/joint-poc.mjs` |0,15 PASS/0 SKIP, real Go CLI/PG17/FIFO chain |
| `node scripts/ci/run-checks.mjs contracts` |0,12 PASS/10 conditional SKIP |
| `node scripts/ci/run-ephemeral-staging.mjs` |0, actual local HTTP/Docker/PG17, outage/recovery/cleanup PASS |
| `node scripts/revalidation/verify-part16.mjs` |0, static boundaries PASS, not production evidence |
| `git diff --check`; exact scope/history/Markdown/privacy checks |0, checked again for final packet |

Staging's contract invocations retain18 PASS/4 conditional Voice SKIP each;
HTTP Playwright14 PASS/6 conditional SKIP. Default unit runs do not activate
production/live opt-in profiles. No SKIP is called PASS. Local Nest/Frontend
profiles were not separately repeated: no affected runtime/contracts/dependency
paths changed; hosted CI must still pass both jobs at the new exact head.

Correction scope6 paths relative to5cbec019: launcher, its existing Python test,
existing Node launcher test, ops/c2/README.md, ops/sync/README.md, same Part32
report. Daily script and CI wiring need no further change. Total PR scope remains
the original8 paths. No Go/SQL/Frontend/observer/API/HMAC/systemd/schema change.

**Production still BLOCKED,0/3, no fresh observation.** This correction made
**zero SSH and zero production HTTP/SQL/Redis requests**, no VPS source/toolchain/
service/permission change, provisioning, deployment, publication, merge or tag/
Release. All earlier host observations remain historical with their original
timestamps. No external authority was generated or inferred from tests. The
earlier feature build packet is historical, not approval for the new source.
After independent re-review, resume the existing rollout task with its real
root/reader/frontend/Go1.27.3/recovery gates; do not ask Backend2 again or bypass
them. New exact-head publication/CI and final clean packet readback follow below.

### First correction publication and actual hosted failure — not counted PASS

Normal commit/push **c743af16611167879f1e87ae2d384095c88b0de2** updated existing
PR58. CLI `gh pr edit` failed with obsolete Projects(classic) GraphQL lookup;
the supported REST PATCH succeeded, exit0, same PR/head, no new PR or settings
change. Hosted run
[39606177851](https://github.com/kiratonine/AdilBaga/actions/runs/39606177851)
is **FAILURE**, not9/9: Go Quality failed, CI Gate failed, PG/Staging skipped.
Contracts/Security/Pipeline/Nest/Frontend succeeded. This history is retained.

Actual failing unchanged source: `TestVoiceHTTP`,voice_test.go71, raw substring
search for43.6 in the entire JSON log. All20 cases failed at13:14:43.639–.642UTC,
including bodies that do not contain that coordinate. A private local Go overlay
changed ONLY the logger timestamp to13:14:43.640Z: the unmodified original test
reproduced20 leak assertions, exit1. Control timestamp13:14:44.640Z: exit0, zero
assertions. Both ran the actual local router/logger/test; neither changed the
Git tree or privacy assertions. This proves the existing time-sensitive test
false-positive mechanism, not a production Voice leak. Overlay controls are
diagnostic, not substituted for the mandatory unmodified Go suite. The original
failed CI is not reclassified. No Go/Voice/Siri/runtime/test file is changed in
this narrowly scoped launcher correction; that test limitation remains disclosed.

During the same P1 review, strengthened exec-error attribution: a known errno
alone is insufficient. The constructor error must also name exactly argv[0]
and have no filename2, matching the POSIX Popen exec-error pipe's executable
attribution. An absent/wrong filename remains ambiguous and cannot retry.
The added ambiguous-constructor regression first failed on c743af (exit1), then
passed after this tightening. Checked installed CPython subprocess implementation;
all known simulated exec errors now carry the same filename attribution as the
actual native ENOEXEC/EACCES tests. No broader fallback or authority relaxation.

Final affected checks repeated after this change: Python22/22/0 SKIP, launcher
Node3/3/0 SKIP, ops180/180/0 SKIP, py_compile exit0. Entire correction still6 paths
relative to5cbec019; only3 existing source/doc paths plus append-only report
changed after c743af. New exact-head CI must complete9/9 independently; the earlier
failed run remains a failed run. No production connection or activation.

### Final PR58 P1 correction readback — READY_FOR_EXTERNAL_REVIEW

Final source HEAD **dea607b78306ea3df13ff33de8a627b6f680899f**, same branch/PR58,
normal commit/push without force. The two corrective commits are c743af1 and
dea607b; no squash/reset/rebase or main modification. Fresh main remains
**b5f9c1b1c473ffd8f53364d350168c37acb5193a**. Source correction scope6 paths,
overall PR scope8 as listed above; no untracked/staged extras.

Exact-head hosted run
[39607258321](https://github.com/kiratonine/AdilBaga/actions/runs/39607258321)
**completed SUCCESS,9/9 SUCCESS**: Contracts, Frontend, Go Quality, Security,
Nest Reference, Pipeline Quality, PostgreSQL Integration, Ephemeral Staging,
CI Gate. `gh run watch 39607258321 --exit-status --interval15` exit0; run headSha
equals actual PR head. No queued/skipped/Preview job counted toward9. The prior
39606177851 remains FAILURE, fully disclosed above; it was not rerun or called
successful. New CI followed the substantive P1 exec-attribution correction.
The pre-existing clock-sensitive Voice test limitation remains, not secretly
fixed or its assertions weakened. No Go source/test path changed.

After final attribution changes, the actual unmodified local Go quality profile
was repeated: exit0, including full unit/race/vet/staticcheck/govulncheck and
Node321/321/0 SKIP. Final Python22/22, launcher Node3/3, ops180/180, syntax and
security checks exit0; earlier PG17/joint15/staging/contracts/pipeline gates
remain as actually executed above. Compiler-generated ELF fixtures and owned
bytecode were outside Git; own external bytecode cache removed. No mandatory
local or hosted failure is presented as success.

Final source/history/link/privacy/diff audit exit0: six correction paths relative
to5cbec019, all other paths unchanged, entire prior63125-byte report preserved,
15 local Markdown targets resolve, bounded privacy patterns PASS. The source
commit contains the full historical prefix and failure diagnostics. This final
post-commit operational appendix is intentionally local and explicitly differs
from the already-pushed report; all non-report source bytes equal dea607b.
It is not falsely claimed to have been inside its own CI-producing commit.

One new clean source archive is generated using the unchanged
`node scripts/create-clean-archive.mjs full-stack`, unique no-clobber name
`artifacts/adilbaga-part32-pr58-launcher-p1-fix-20261021.tar.gz`. Verify regular
tracked safe members, disk byte-match, non-report Git HEAD byte-match, committed
and complete previous report prefixes; no .git/TODO/.env/secrets/node_modules/
build/cache/test artifacts, ELF or DB backups. Final SHA256 is delivered beside
the archive, not recursively embedded in its own bytes. Old archive is preserved.

**Source correction READY_FOR_EXTERNAL_REVIEW. Production C2 remains BLOCKED,
0/3; no VPS access/deploy/provisioning/publication, no merge or GitHub Release,
no auto-deploy activation, no new root/reader/frontend approval.** No new live
API, Frontend, Siri or dataset claim is made. Root and all other production trust
gates require genuine separately authorized evidence as previously documented.
**STOP for independent Code Review before merge/rollout.**

## 2026-10-21 — Post-PR58 protected integration and fresh production handoff

**Latest authoritative outcome: BLOCKED_EXTERNAL_AUTHORITY / BLOCKED.** Source
review was accepted and PR58 was merged normally; production C2 is NOT installed,
qualified acceptance remains **0/3**, and no stable Release/tag was created.
The earlier source-only STOP and historical failures above remain audit history,
not the current merge status. This entire appendix and the preceding local
post-CI appendix are uncommitted report evidence, not bytes claimed to have been
tested inside the merged commit. No new source correction was necessary.

### Protected source integration and CI

- Owner-approved reviewed head: `dea607b78306ea3df13ff33de8a627b6f680899f`.
- Pre-merge main: `b5f9c1b1c473ffd8f53364d350168c37acb5193a`.
- [PR58](https://github.com/kiratonine/AdilBaga/pull/58) was OPEN/MERGEABLE/CLEAN;
  effective main rules require PR + CI Gate, prohibit deletion/non-fast-forward,
  and require zero additional approving reviewers. Exact-head
  [CI39607258321](https://github.com/kiratonine/AdilBaga/actions/runs/39607258321)
  was independently reread: 9/9 SUCCESS.
- Normal REST merge used `sha=dea607b78306ea3df13ff33de8a627b6f680899f`,
  `merge_method=merge`; exit0, merged=true. No admin bypass, force or direct-main
  push. Fresh merged main is **`981cd8e024a137936a9f5b84db086ddfb8df108d`**.
  `git diff --exit-code dea607b78306ea3df13ff33de8a627b6f680899f
  981cd8e024a137936a9f5b84db086ddfb8df108d` exited0: complete trees identical.
- [Exact-main CI39611755239](https://github.com/kiratonine/AdilBaga/actions/runs/39611755239)
  reports overall SUCCESS and CI Gate SUCCESS. However the individual Contracts
  job119262134363/check-run still reports `in_progress`, null conclusion despite
  every listed step including Complete job reporting success. Independent jobs,
  individual-job and check-runs endpoints agree on this inconsistency. Therefore
  **strict independently verified 9/9 is NOT_VERIFIED**: eight completed SUCCESS
  jobs, Contracts metadata unresolved. A green run/Gate is not substituted for
  its missing completed job conclusion. No workflow rerun/cancellation performed.
- Deployment offline checks SUCCESS; build-only/gate/plan/rollout SKIPPED are not
  production deployment evidence. `AUTO_DEPLOY_ENABLED=false` reread through REST;
  unchanged. An unsupported local `gh variable get` invocation exited1 without
  mutation; the supported REST read returned the literal false value.
- New native audit worktree `/home/denis/tmp/aktau-part32-c2-post-pr58`, branch
  `audit/part32-c2-post-pr58`, HEAD981cd8e. Original source worktree preserved.
  Local scope is this report only. PR58 changed eight approved paths; migration
  bytes, parsers and category behavior were not changed by the merge. Relative
  to `origin/deploy/scrum19-sync`, migration diff is empty; pipeline changes are
  exactly launcher, daily-sync delegation and launcher tests, not parser changes.

### Fresh bounded read-only VPS inventory

One SSH session using existing `my-vps`, host verification enabled, sudo-n,
root-side105s TERM/5s KILL bound; collector finite subprocess8s/output64KiB,
sanitized JSON only, no raw environment/process command lines/logs. Exit0.
Readback UTC **2026-10-21T13:55:21.633904Z**; metadata is timestamped, not a
guarantee that scheduled activity cannot subsequently occur.

| Component | Actual fresh evidence / assessment |
| --- | --- |
| Production API | Docker revision `6a4b4c7a91ec471db54987b689c3c87a785523a3`, image `sha256:6ea91b73fbd492bdff70e8f4d346c22c9763568aa7f20c5fc80b89846b773d68`, running/healthy, restart0, OOMfalse |
| API rollback | Historical `438ecdfa3d386a186dcd8b73c3c10aef5e79dc82` rollback image/revision present; no rollback executed |
| Sync | `deploy/scrum19-sync`, HEAD `28cc3fc2c25c434e166874e8f5b08e48d0e3b6df`, clean, correct origin, upstream origin/deploy/scrum19-sync; owning-user Git read |
| Cached VPS main | local/cached origin main `beecb8c11219c7863f0c7722a8b4fdaaedfd72a5`; not updated or checked out |
| Operator | Existing UID999/GID987; parent0755, device64770/inode797968 unchanged; no ownership/permissions changes |
| Sync units | Daily/weekly oneshots inactive/dead, Result=success, exit0, no active ingest/go PID at sample; original User/WorkingDirectory/ExecStart match |
| Timers | Daily, weekly and Go monitor active/waiting; Cloudflare active/running; daily last2026-10-21 18:00:17+05, next2026-10-22 06:00:00+05; weekly next2026-10-26 03:00:00+05 |
| Toolchain | Host Go1.27.2, Python3.12.3, Node24.18.0, pnpm10.32.1; required Go1.27.3 host maintenance/provenance/rollback gate NOT fulfilled |
| C2 install | All three fixed targets absent; fixed ninth ingest ELF absent; approval/receipt/authorization/deployment/reader/ready records absent |
| Legacy staging | Preserved exact source0095d9951f79d64c7ef9145344b0a1dd6a78867b; obsolete, not approved for981cd8e. No reserved orphan stages found in three parents |
| Part30 journal | root0600, SHA256 `ce5626f05012c6eb295a8c05711d514a82d575aa515e33abb6ba01e55fbb5593`; preserved, not rewritten |
| SCRUM-19 | Installed migration file SHA256 `188422787905275faae1d42eb91ca7a9873bf8bbca0d4b1954a03029e751bc42` matches source; actual applied DB migration state NOT_VERIFIED without restricted reader |

Unit rollback fingerprints (SHA256): daily service
`0991814d560b0ea66b71d04a5f8819098c839f6744c9049609167c97413db89a`,
weekly service `cae2c88b6d966edfb4611105220095a9b20086a4c98fa620df272ad1448e2ffb`,
daily timer `0f3bef8cd6d3e4da39cbfffdaee02444782f50f252690b315daccca5361ebc0a`,
weekly timer `407634b68f8b3757c19c5b252aaee3f643d63d939d4ded551c69a4d0927a313e`,
monitor timer `6d5c83cd4d50d6ed1c40550709f702a020110e7b5c23fd307bf3303ef43691bc`.
No unit content, credentials or private backup payload was exported.
Current fresh backup/recovery-point parity, effective DB rights, historical
quarantine contents and extended filesystem ACLs remain NOT_VERIFIED; metadata
and old successful restore evidence are not new recovery verification.

### Bounded public GET: access failure, not claimed API regression/RCA

Initial health GET13:59:18Z returned HTTPError; the first collector omitted the
status number, so that original status is UNKNOWN. One explicitly recorded
diagnostic pass then queried the four required representations, no automatic
retry/redirect/proxy/cookies or POST; per-request7s/body1MiB bounds.

| UTC completion 14:00:07Z, path | HTTP / duration_ms |
| --- | --- |
| `/health/ready` |403 /193 |
| `/api/categories/milk/filters` |403 /178 |
| `/api/categories/dairy/filters` |403 /200 |
| `/api/dashboard` |403 /186 |

**Exactly5 public HTTP GET attempts total**, zero public POST/HEAD, zero C2
observer GET, zero production SQL/Redis. No response payload retained. Public
readiness/filter/dataset freshness is NOT_VERIFIED from this client; access403
does not identify whether rejection was Cloudflare, an egress boundary or origin.
It does not establish a Go readiness503 or justify a restart/cache change. No
alternate identity/network bypass attempted. Container health is separate evidence.
Owner should verify this access boundary before any public C2 observation.

### Exact merged-source local artifacts: review candidates, NOT authority

Fresh `git archive 981cd8e024a137936a9f5b84db086ddfb8df108d` export; local
Go1.27.3, `GOTOOLCHAIN=local CGO_ENABLED=0 GOOS=linux GOARCH=amd64`, trimpath;
c2projection linker `-X main.sourceSHA=981cd8e024a137936a9f5b84db086ddfb8df108d`.
Local directory `/tmp/aktau-part32-wiring-build-1A2i3s`; no binary sent to VPS.
All three `go version -m` and `file` checks exit0: Go1.27.3, expected package,
linux/amd64 CGO0/trimpath, static x86-64 ELF. Manifest recipe/source and exact five
module bytes reviewed by existing `reviewBundle`: REVIEW_REQUIRED_NOT_APPROVAL.

| Exact candidate | SHA256 |
| --- | --- |
| c2projection | `08be585091bc47d1f8c90c1a8f0dfcf9ef155aff538678e644b2c186934b8aec` |
| relayprobe | `dda6075cbc5a0001dcc0b5a7a447e9e9553b63549ed6eadc8b5795636cfc8281` |
| c2-production-supervisor.mjs | `72b5dc46c1bc705caa839c58b5f3f3e0c71de30121869e45536662152642279e` |
| projection-provider.mjs | `be64de92f206493d5698e442b6882296439a262f17147b2804db0c0dc0b41bb9` |
| fifo-adapter.mjs | `bfea914d48fb312753fb39c6546cefa148f1e4c948a393ac3a8eb684f3f7ed5c` |
| production-observer.mjs | `8e52f34b82fe15d552140270c8b56c292bf99f6d87b41021aa9f6e2d742b30f2` |
| c2-manifest.mjs | `e5ed6854f2182b3f8a108e2525585224337d0e3fb4a9eb587450b7213ac3978a` |
| source-manifest.json | `6b1c0167a65965d2d541ec755eb770649f4cb08013486f579a16c3a89dc29e7e` |
| Separate ninth ingest ELF | `d06f99b3be0e8aee62b169121fc9917c29160726985249a3bd6cabdb32045183` |
| Installer source | `b9b2a80a037efcc115d29eb592f353ab785b058bbd0341548c42942344d9eb98` |
| Launcher source | `321eec00e4f3070b98dc1bc971f4da390528d93c1b2039d37bb71ef3cdc94f16` |

The installer boundary stays eight files; it does NOT install the ninth ingest.
Node closure is exactly the listed five local modules plus Node builtins;
import-cycle/custody checks remain unchanged. Actual host Node ELF at
`/usr/local/lib/nodejs/node-v24.18.0-linux-x64/bin/node` has root0755 safe
root-owned ancestry and SHA256
`41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c`.
This hash alone is NOT approval of a bootstrap, command line, full import closure
or live protected process. No root-owned parent/non-dumpable supervisor, actual
command digest/PID/start ticks, privilege drop or per-attempt READY was asserted.

### Mandatory local gates: all command exits0; conditional skips disclosed

Executed as nonroot UID1000 on native WSL; Node24.10.0, Go1.27.3,
GOTOOLCHAIN=local. Logs remain private local temporary test outputs, not archive
members. Local fixtures/PG17 do not constitute production acceptance.

| Actual command from TASK | Exit / actual result |
| --- | --- |
| `python3 -B -m unittest discover -s pipeline/scripts -p test_c2_ingest_launch.py -v` |0;22 tests, no skips, real pinned-ELF regression included |
| `node --test scripts/ops/c2-ingest-launch.test.mjs` |0;3/3 |
| `bash -n pipeline/scripts/daily-sync.sh` |0 |
| `node scripts/ci/run-checks.mjs ops` |0;180/180 |
| `node scripts/ci/run-checks.mjs security` |0; source/shell/workflow/static/backup guards passed |
| `node scripts/ci/run-checks.mjs pipeline` |0; frozen install, unit tests, typecheck |
| `node scripts/ci/run-checks.mjs go` |0; Go unit/race/vet/staticcheck and integration-tag staticcheck;321/321 Node C2 tests,0skip |
| `node scripts/ci/run-db-integration.mjs` |0; owned disposable PG17 migrations, restricted-role/security/C2 projection/READY-publication integration, cleanup passed |
| `node scripts/revalidation/joint-poc.mjs` |0;15/15, real Go/FIFO/provider/HTTP fixtures, not synthetic provider substitution |
| `node scripts/ci/run-checks.mjs contracts` |0;12 PASS,10 conditional live/fixture SKIP (not PASS) |
| `node scripts/ci/run-checks.mjs nest` |0;27/27, production dependency audit |
| `node scripts/ci/run-checks.mjs frontend` |0;273 unit tests, typecheck/lint/production build/mock Playwright profile; no live analytics hits |
| `node scripts/ci/run-ephemeral-staging.mjs` |0; local real API/PG17 parity,18 PASS/4 fixture SKIP each backend contracts run, HTTP E2E14 PASS/6 conditional SKIP, outage/recovery/nonroot/read-only/Docker cleanup passed |
| `node scripts/revalidation/verify-part16.mjs` |0; static boundaries only |
| `git diff --check` |0; rerun after final append |

Existing disclosed timestamp-sensitive Voice test debt was not hidden or changed.
Frontend log includes harmless destination-stream-closed messages after browser
cleanup; profile exit remains0, not a new production observation. Runtime,
assertions, dependencies and retry policies were not changed to obtain PASS.

### Current Dependabot release applicability

Fresh GitHub alerts read: six OPEN,2high/4medium; not zero alerts. Vite dev-only
transitive versions pipeline7.3.6 and frontend8.3.2; patched7.3.7/8.3.3.
Primary advisory details from alert API:
[GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw)
(medium, editor argument injection requires malicious filesystem entry and
affected editor, WSL applies),
[GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm)
(high, Windows existence-check bypass),
[GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv)
(medium, Windows command escaping/environment/filename prerequisites).
They affect development/editor tooling; the candidate production C2 Go ELF and
five builtin-only Node modules do not import Vite. That is bounded applicability
analysis, not evidence of no developer/supply-chain exposure. No Windows/WSL
exploit attempted. Owner/security must accept the documented residual risk or
approve a narrow dependency patch + CI/review before stable Release. No unrelated
frontend/pipeline lockfile edits or alert dismissals; prod-only audit is not used
to negate development alerts.

### Rollout/rollback matrix and exact external action packet

| Boundary | Current → intended target | Rollback / abort |
| --- | --- | --- |
| API |6a4b4c7 healthy → unchanged |438ecdfa image present; no API rollout authorized/needed here |
| Sync source |clean28cc3fc deploy branch → exact981cd8e-compatible launcher preserving SCRUM-19 |record28cc3fc/branch/unit hashes and secure recovery point first; no source switch while active or trust gates missing |
| Host Go |1.27.2 → independently verified root-maintained1.27.3 |retain exact prior toolchain and maintenance rollback; no GOTOOLCHAIN auto |
| C2 kit |obsolete inactive0095 staging → reviewed exact981 kit, separate ingest and protected Node closure |no-clobber install only after independent approval; preserve Part30 journal/quarantine; ambiguity/orphan BLOCKED, no guessed cleanup |
| Reader/frontend |absent → real restricted reader + independent live Vercel alias/deployment/source identity |no substitute API/ingest/owner DSN, env claim or preview deployment; missing/changed evidence INCONCLUSIVE/0GET |
| Acceptance |0/3 → three distinct legitimate scheduled qualified PASS |FAIL resets; INCONCLUSIVE no increment; original5s/21GET/2sitemap/35m/20s bounds, no artificial publication |

**Next actor is independent Owner/root admin**, not an additional Backend2 request:

1. Review the exact merged981 artifacts/hashes above and rebuild/provenance where
   required. Resolve Contracts job metadata completion and public403 access;
   confirm exact-main9/9 before rollout. Review current dev-tool alert risk.
2. Establish real secure backup/recovery point, pre-change source/toolchain/unit
   rollback; independently authorize verified Go1.27.3 host maintenance with
   preserved1.27.2 rollback BEFORE source switch. No partial upgrade performed
   merely to leave another unreviewed host state while C2 authority is absent.
3. Through existing independent root/admin channel, issue genuine exact-source
   installer/binary/process authorization records; source agent must not create
   `approved=true`. Preserve all existing staging/journals. Separately approve
   root-controlled no-clobber ninth ingest; eight-member installer is unchanged.
4. Provision documented least-privilege restricted reader through protected
   administrative channel (never send DSN/password here), prove effective roles/
   read-only transaction authority. Independently verify exact `aktau.market`
   production alias, deployment ID/sourceSHA and fresh deployment attestation.
5. Independently verify protected Node bootstrap/import/command closure and
   live root-owned parent/non-dumpable processes, pinned binaries and clock.
   Issue one genuine per-attempt READY binding process identity, source/frontend,
   expiry and new attempt; no same-UID or file-presence substitution.
6. Only then perform authorized inactive verify/install, read-only postchecks,
   safe schedule-free exact-source rollout with preserved rollback, and qualify
   naturally scheduled publications. Do not create replacement publications.

Missing independent authority is a real gate, not a request for a passphrase or
permission bypass. No credentials were searched/read, no root records created,
no binaries uploaded/installed, no checkout/toolchain/systemd/ACL/UID changes,
no sync/apply/HMAC/observer/DB/Redis, no production rollback or Release/tag.
Only protected GitHub source merge, local tests/build and permitted read-only
VPS/public/GitHub observations occurred. Scheduled sync/monitor stay untouched.

### Review artifact and final disposition

Generate one new full-stack review archive with unchanged
`node scripts/create-clean-archive.mjs full-stack`, unique copy
`artifacts/adilbaga-part32-post-pr58-production-handoff-20261021.tar.gz`.
Verify every member regular/tracked/safe, all disk bytes, all non-report bytes
against981cd8e, committed report prefix and entire77508-byte independently
reviewed previous report prefix. Exclude Git/TODO/env/secret/build/cache/dump/
ELF/test artifacts. Archive SHA256 is reported externally to avoid self-reference.
Only canonical report changed locally; no report-only source PR or publication.

**SOURCE: MERGED. MAIN_CI: overall SUCCESS / strict9-of-9 NOT_VERIFIED due
Contracts metadata. SYNC:28cc3fc unchanged. C2_INSTALL:NOT_INSTALLED.
ROOT_AUTH:ABSENT. READER:ABSENT. FRONTEND_ID:NOT_VERIFIED.
C2_QUALIFIED_COUNT:0/3. RELEASE_URL:NONE. BLOCKED_EXTERNAL_AUTHORITY. STOP.**

### Final hosted-CI metadata reconciliation — same exact merged commit

Subsequent read of the same jobs endpoint completed the previously inconsistent
Contracts record: **Contracts completed/SUCCESS**. All nine mandatory jobs now
independently report completed/SUCCESS for exact981cd8e, run39611755239:
Nest Reference, Frontend, Go Quality, Pipeline Quality, Security, Contracts,
PostgreSQL Integration, Ephemeral Staging, CI Gate. No workflow retry, source
change or settings change was needed. The earlier incomplete metadata is kept
above as observed history, not an outstanding blocker. **MAIN_CI:9/9 SUCCESS**
is the final authoritative CI status. Root/reader/frontend/Go-maintenance/public
access/recovery prerequisites remain unresolved; C2 still0/3, no stable Release.

Final integrity checks exit0:699 regular safe tracked archive members,699/699
disk byte matches,698/698 non-report merged-main byte matches, entire77508-byte
reviewed report and committed report prefixes preserved;10 local Markdown links
resolve; bounded private-key/token-pattern scan and exact report-only scope pass.
No untracked nonignored files. Remote main readback remains981cd8e; PR58 API
confirms MERGED at2026-10-21T13:52:01Z. Available test-runner durations (not full
profile wall times): Python22 tests2.037s, launcher3 tests2.330s, ops180 tests8.410s,
Node C2 suite321 tests23.783s, joint15 tests14.180s, frontend273 units29.72s,
staging HTTP14 PASS/6 SKIP12.0s. Full command wall times were not separately
instrumented; no invented timing or skipped-case PASS is claimed.

## 2026-10-21 — Owner-authorized direct SSH ordinary sync deployment

**Latest outcome: DEPLOYED_AWAITING_SCHEDULED_SYNC; C2 BLOCKED_REAL_AUTHORITY.**
The newer Owner direct-SSH TASK explicitly authorizes host Go maintenance and
ordinary source rollout independently of C2 provisioning. It supersedes the
previous no-mutation decision above, but does NOT constitute independent C2
approval or erase prior403/CI/source history. **SYNC_SOURCE_DEPLOYED=
981cd8e024a137936a9f5b84db086ddfb8df108d** is now actual VPS evidence, not a plan.
No GitHub Release/tag/draft is allowed or created under this newer TASK.

### Fresh gates, provenance and safe preparation

- Read complete direct-SSH TASK and attachment before execution; root rules and
  RTK policy read. Continued audit worktree/HEAD981cd8e, report-only local diff.
  Fresh fetch exit0: origin/main remains981cd8e. Hosted exact-main run39611755239
  independently reread: all9 completed SUCCESS, including Contracts. No source
  edits, dependency updates, source PR, commit/push or workflow dispatch needed.
- Fresh owning-user inventory2026-10-21T14:59:46Z: clean
  `deploy/scrum19-sync`/28cc3fc, inactive successful oneshots, active/waiting
  enabled daily/weekly timers, no aktau-sync processes; API6a4b4c7 healthy,
  restart0/OOMfalse, old438 rollback image present.43.47GB free before changes.
- Official release metadata fetched over HTTPS from `https://go.dev/dl/?mode=json&include=all`:
  Linux amd64 Go1.27.3 archive70588678bytes; downloaded official
  `https://go.dev/dl/go1.27.3.linux-amd64.tar.gz` with HTTPS-only redirects.
  SHA256 independently matched official metadata:
  `65efbc80fdc1fa2cd2631cad5b481777a68e8725f34e89f50fc6ac714e379b40`.
  No curl-pipe-shell, automatic toolchain download or package-manager upgrade.
- Created one new root0700 maintenance namespace
  `/var/lib/aktau-part32-maintenance-20261021`; exclusive/no-follow root0600
  uploads, checksums rechecked before write. Artifact upload exit0; operation
  script upload exit0. Script SHA256
  `3734cf37f2cf62b54e211547fb4792173f9c91bae124f729387e696a406d1373`.
  Operational helpers remain outside Git/review archive, not new source runtime.
- Source/data rollback preparation: stable old deploy branch remains untouched;
  protected root0600 `data-before.tar` preserves current local data directory,
  SHA256 `0c8cef4f825653dee638aff043ec49b3cb7bf80906e0147c58f4b3193207b411`.
  Tar shape verified; this is a local source-output backup, **not a fresh DB
  backup/restore or production DB parity claim**. No DSN/secret was read.

### Actual authorized deployment, exit0

Root maintenance controller ran once via existing verified `ssh my-vps` and
`sudo -n /usr/bin/python3 -B`, fixed argv/no shell=True; UTC start
**2026-10-21T15:03:24.045655Z**, completion **15:03:37.847356Z**.

1. Verified root Go custody, old binary hash/version, approved source/clean tree,
   absence of active sync, disk capacity and absent versioned destinations.
   Ran `sudo -n -u aktau-sync -H git -C /opt/aktau-sync fetch origin main`;
   FETCH_HEAD exactly981cd8e. No global safe.directory or credentials changes.
2. Compared old28cc3fc to target: migration/data diff empty; pipeline diff is
   exactly daily-sync launcher delegation plus launcher and launcher tests.
   Pipeline package/lockfile bytes unchanged; existing dependencies preserved,
   no unnecessary frozen install or parser changes. SCRUM-19 migration checksum
   remains188422787905275faae1d42eb91ca7a9873bf8bbca0d4b1954a03029e751bc42.
3. Extracted official Go into new versioned root-controlled staging after safe
   member validation; verified staged executable go1.27.3. Temporarily stopped
   **only** daily/weekly timers, rechecked inactive services/no user processes.
   Renamed complete selected old distribution to
   `/usr/local/go.rollback-part32-20261021-1.27.2`; selected new distribution at
   original `/usr/local/go`. Old files were not deleted/overwritten. Empty
   versioned extraction parent retained; no broad cleanup performed.
4. Actual owner command:
   `sudo -n -u aktau-sync -H git -C /opt/aktau-sync switch --no-overwrite-ignore -c deploy/part32-c2-981cd8e 981cd8e024a137936a9f5b84db086ddfb8df108d`.
   No reset/pull/rebase/force, stale-main checkout or unknown ignored-file clobber.
   New versioned deploy branch intentionally has no remote upstream; that is
   not a missing source identity. Original rollback branch/ref untouched.
5. Verified clean exact HEAD, new launcher hash
   `321eec00e4f3070b98dc1bc971f4da390528d93c1b2039d37bb71ef3cdc94f16`,
   selected Go1.27.3, Bash syntax and Python AST compile under service identity.
   Did NOT run production ingest, Go apply, scraper, migration or test publish.
6. `finally` restored precisely both previously active timers; both active after
   operation. No service restart/start/stop, timer disable/definition change or
   systemctl daemon-reload. Root0600 maintenance result persisted; no C2 approval
   or independent attestation was emitted by this controller.

Data integrity was checked before backup, after backup and after source switch:
all18 regular local data files, path/owner/GID/mode/inode and contents digest
identical, aggregate
`098ee5dc2f721de7d085b7802fc55d1ae76aa3d02930a1b084769d0c4a84b9f5`.
No data directory permissions or runtime secrets changed. All four sync unit/
timer SHA256 fingerprints match the preflight table exactly. OperatorUID999/
GID987, checkout and .git ownership/modes/inodes remain unchanged.

### Independent postflight and real rollback evidence

Fresh separate SSH collector exit0 at **2026-10-21T15:04:02.526850Z** confirms:

| Boundary | Actual after-state |
| --- | --- |
| Sync source | `deploy/part32-c2-981cd8e`, HEAD981cd8e024a137936a9f5b84db086ddfb8df108d, clean; cached origin/main updated, stale local main not used |
| Host Go | `/usr/local/go/bin/go version`:go1.27.3 linux/amd64; executable SHA256 `5f5eb6d0b2fb6aa0bb5d5f8c5f1c944e0de955c925f0111af92a9d8f79680b5b` |
| Source fingerprints | daily-sync.sh `09df7e40689ece9cf896ef457e62761ec471691fc7604d6b02bd70369e3a7af3`; go.mod `b47ea0fde1ef2731d9cffe62245a9822bc239017cbcd4f4debd7dbaa0b616510` |
| API | same6a4b4c7 revision/image digest, running/healthy, restart0/OOMfalse;438 rollback image still present |
| Daily/weekly | inactive/dead between schedules; original Result=success/exit0 is PRE-deploy run evidence, not new-source runtime PASS |
| Timers | both active/waiting; next daily2026-10-22 06:00:00+05 (=01:00UTC), weekly2026-10-26 03:00:00+05; monitor active/waiting and Cloudflare active/running unchanged |
| C2 | all fixed targets/root records/reader/frontend/READY/ninth ELF still absent; original historical stage/journal untouched;0/3 |

Rollback old Go executable was independently executed through preserved absolute
path: go1.27.2 linux/amd64, root0755/nonsymlink, original SHA256
`548d3c32f83fa81152f543eb1526be7884cfe0526eb5e9ce29d3eca14786e7e0`.
Protected local data archive was independently rehashed with original root0600
metadata. Source rollback ref remains exact28cc3fc. No rollback was necessary
or executed. Before future rollback: stop only applicable timers, verify both
services idle/no active apply, switch as owner back to `deploy/scrum19-sync`
without resetting it; if reverting Go, preserve new distribution and rename
the old complete distribution back to selected path; verify versions/hashes/
source/data and restore original timers. Never automatically replay an apply.
DB recovery and C2 install rollback remain separate, not proven by these checks.

### Public/Cloudflare/loopback checks: fresh200, historical403 retained

Exactly **12 GET in this direct-deploy task**:4 from WSL through public domain,
4 from VPS through public domain,4 from VPS fixed origin loopback. Each uses
no proxy/auth/cookies/redirect/retry,7s timeout and1MiB body bound; only safe
headers, schema markers and response-body SHA256 retained, no raw responses.
Origin request executed only after Docker ports projection proved the sole
binding `127.0.0.1:8080`; no network exposure/config change.

| Path | WSL public status/ms | VPS public status/ms | VPS loopback status/ms |
| --- | --- | --- | --- |
| health/ready |200/3318 |200/1193 |200/368 |
| milk filters |200/2050 |200/3174 |200/1467 |
| dairy filters |200/1968 |200/1313 |200/1291 |
| dashboard |200/1310 |200/1050 |200/606 |

Responses observed2026-10-21T15:04:52Z–15:05:02Z; each representation's body hash
matches across all three routes. Ready JSON exact status=ready, no-store.
Milk keys volumeMl/fatPercent/brand and fat options[1.5,2.5,3.2,6]; dairy
brand-only. Dashboard summary.snapshotAt2026-10-21T13:01:35.028Z is NOT the
actual C2 S0 identity or proof of a post-deployment publication. Public responses
have Server=cloudflare and CF-Ray/Date; loopback lacks those proxy headers.
Ordinary explicit read-only User-Agent used, no WAF bypass or alternate routing.
Historical403 not reproduced now; root cause remains NOT_VERIFIED. Do not
attribute recovery to source/toolchain change: API runtime did not change.
Across previous handoff plus this task, recorded public attempts are5+8=13;
this task additionally4 loopback. C2 observer GET and production POST/SQL/Redis0.

### Fresh tests and C2 continuation within actual authority

No source changed since exact-main9/9; full prior local sweep remains historical
evidence, not re-labelled a new sweep. Actual reruns now: Python launcher22/22
exit0,0skip,2.090s; Node launcher3/3 exit0,0skip,2.421s; Bash syntax exit0.
These regressions exercise ordinary/full dry-run/apply fallback, stale exit3,
all-failed exit1, success0 and both accepted P1 pinned-ELF cases using mocks/
local native fixtures only. They do not count as a live new-source publication.
VPS source Bash syntax/Python AST exit0; no production toolchain auto-download.

Existing exact981 Go1.27.3-built c2projection/relayprobe/separate ingest and
eight-file kit from the previous section were revalidated using actual CLI:
`node scripts/ops/c2-provisioning-plan.mjs --review-bundle /tmp/aktau-part32-wiring-build-1A2i3s/bundle 981cd8e024a137936a9f5b84db086ddfb8df108d`
exit0, **REVIEW_REQUIRED_NOT_APPROVAL**. All hashes/ELF/build-info source checks
remain those recorded above; same exact source, no stale unmerged artifact.
Kit was not uploaded/installed because fresh independent root approval is absent.
`sudo` permits the host maintenance just performed, but cannot mint a separate
reviewer's C2 artifact/process authorization. No protected reader or independently
verified alias/deployment record exists; no legitimate DB/Vercel custodian session
was available in this operator context. No secrets search/DSN reuse/login bypass.

**C2 next required inputs, one packet:** independent exact981 kit+separate-ingest+
Node closure approval through existing real root custodian; protected restricted
reader with effective readonly proof; independent actual aktau.market alias/
deploymentID/frontendSHA attestation; protected bootstrap/live-process checks
and one-time READY per schedule. Then authorized no-clobber inactive install and
genuine scheduled observations. Preserve35m/1500ms/5s/21GET/2sitemap/20s limits,
fixtureOnly/private custody, FAIL reset/INCONCLUSIVE no increment. No approval,
reader, attestation, READY or three future publications invented here.

Next genuine daily run is in the future. No approved running observer/supervisor
exists; no background monitoring promise is made. Source deployment is real,
but new-source scheduled0/1/3 outcome and post-publish snapshot remain
**NOT_YET_OBSERVED**. Do not roll back working ordinary deployment merely because
the separate C2 authority is absent. No Release/tag/draft, auto-deploy remainsfalse.

### Artifact / final current states

One new clean review archive:
`artifacts/adilbaga-part32-direct-ssh-sync-deploy-20261021.tar.gz`, generated by
unchanged full-stack archive script; expected regular tracked699members,698
non-report byte-identical to981cd8e, report append-only including entire previous
post-PR58 handoff prefix. Excludes maintenance/data/Go binary backups, authority,
secrets/env/Git/TODO/build/cache/test artifacts. SHA256 delivered externally.

```text
RESULT=DEPLOYED_AWAITING_SCHEDULED_SYNC
SOURCE_MAIN_SHA=981cd8e024a137936a9f5b84db086ddfb8df108d
SYNC_BEFORE=deploy/scrum19-sync/28cc3fc2c25c434e166874e8f5b08e48d0e3b6df
SYNC_AFTER=deploy/part32-c2-981cd8e/981cd8e024a137936a9f5b84db086ddfb8df108d
GO_HOST_BEFORE_AFTER=1.27.2 -> 1.27.3
API_CONTAINER_REVISION=6a4b4c7a91ec471db54987b689c3c87a785523a3
AUTO_DEPLOY_ENABLED=false (unchanged; final REST readback required)
SYNC_TIMER_STATE=active/waiting; original enabled state retained
LAST_SCHEDULED_SYNC=2026-10-21 18:00:17+05 pre-deploy; new source NOT_YET_OBSERVED
ROOT_C2_APPROVAL=ABSENT
RESTRICTED_READER=ABSENT
FRONTEND_DEPLOYMENT_IDENTITY=NOT_VERIFIED
PUBLIC_C2_EGRESS=API_PUBLIC200_FROM_WSL_AND_VPS; SIX_FRONTEND_C2_PATHS_NOT_MEASURED
C2_INSTALL=INACTIVE_NOT_INSTALLED; C2_DEPLOYMENT=BLOCKED_REAL_AUTHORITY
C2_QUALIFIED_COUNT=0/3
ROLLBACK_READINESS=OLD_SOURCE_REF_AND_COMPLETE_GO_PRESERVED_LOCAL_DATA_BACKUP_VERIFIED; DB_RECOVERY_NOT_FRESHLY_VERIFIED
GITHUB_RELEASE=NOT_CREATED_BY_OWNER_REQUEST
NEXT_ACTION=GENUINE_SCHEDULED_SYNC_READBACK_AND_INDEPENDENT_C2_INPUT_PACKET
```

No further safe production activation can be inferred from absent independent
records. Ordinary deployment remains installed; Part32 C2 acceptance is still
incomplete, not falsely SOURCE_ONLY or C2 SUCCESS. STOP for review of real state.

Final local diff-check exit0; live remote main still981cd8e. Supported GitHub
REST readback confirms `AUTO_DEPLOY_ENABLED=false`, not merely an unchanged
local assumption. Archive/member/byte/history/link/privacy checks are rerun on
the final append; canonical report is the only tracked local change. Root
maintenance artifacts/rollback/data backup are intentionally retained on VPS,
not uploaded into source archive or public Git history.

## 2026-10-21 — Activation-after-Owner-checks: exact inputs and manual operator entry

**Current production outcome: BLOCKED_EXACT_MISSING_INPUT, NOT_ARMED, C2 0/3.**
Ordinary source remains actually deployed981cd8e with Go1.27.3; it was NOT
redeployed or upgraded again. The new Task accepts installation/activation as
separate from later3/3; no fake READY, fixture GET or artificial publication is
used. No Release/tag/draft; auto-deploy remainsfalse. All prior history preserved.

### Fresh production/Owner evidence and actual access limits

Owner-reported ADMIN_OK, NTP synchronized, Vercel Production Ready/aktau.market
alias/frontendSHA981cd8e and existence of aktau_api_runtime are recorded as such,
not independently proven effective DB grants or machine deployment attestation.
Fresh permitted SSH inventory exit0 at2026-10-21T16:06:22.823258Z independently
confirms clean deploy/part32-c2-981cd8e/981cd8e, hostGo1.27.3, operator999/987,
all three C2 targets and independent approval/authorization/deployment/READY
absent; because `/var/lib/aktau-sync/c2` itself is absent, its correct reader
path `/var/lib/aktau-sync/c2/reader.dsn` is absent too. The older collector's
extra `/etc/aktau-c2/reader.dsn` metadata is NOT used as proof of this different
path. Reserved staging-orphan counts in three parents0; old0095 bundle and
Part30 journal retained, not approved anew or overwritten. API6a4b4c7 healthy,
restart0/OOMfalse. Separate `timedatectl show -p NTPSynchronized --value` returned
yes; daily timer active/waiting, next2026-10-22 06:00+05. Latest successful18:00
run remains PRE-deployment evidence; no new-source scheduled outcome yet.

Four new bounded public API GET,2026-10-21T16:14:57Z–16:15:02Z: ready200/827ms,
milk filters200/1393ms, dairy filters200/1952ms, dashboard200/1097ms. Readytrue/
no-store; unchanged milk keys/fat options and dairy brand-only, dashboard
summary.snapshotAt13:01:35.028Z (not C2 baseline identity). No retries, proxy,
redirects, auth/cookies, production POST/HEAD/SQL/Redis;7s/1MiB bounds. This task
adds4 API GET, not an observer run. No Siri repeat or dataset mutation.

Available browser Vercel Dashboard redirects to login; no installed Vercel CLI
or connected Vercel service tool. Supabase Dashboard likewise redirects to
sign-in; no installed Supabase CLI/service connection. No login attempt, token
request or permission bypass. Owner having an admin account does not imply
this separate browser/tool session has its custody.

Authorized GitHub API does expose Vercel[bot] Production deployment7227874749,
source981cd8e, created13:52:28Z, success13:52:29Z, immutable environment URL
`https://adil-baga-funf4fts6-kiratonines-projects.vercel.app`. Payload is empty;
no actual dpl ID or independently current alias binding is supplied there.
The numeric GitHub deployment ID/hostname is NOT relabelled `dpl_...`.
Owner allows deferring ID lookup; do so without fabricating it. Activation still
cannot silently bypass the existing provider/READY contract's mandatory actual
deploymentId or weaken custody. That would be a separate trust-contract change.

No approved protected reader context/host/role proof was supplied. ROLE_PASSWORD
location is only an Owner hint: no backend.env contents or credentials were
read/copied, no API/ingest/admin DSN reused, no role/password/ACL altered and no
diagnostic production DB connection attempted. Thus actual LOGIN/inherited roles,
SELECT/DML/DDL/RLS/schema privileges and production read-only identity remain
NOT_VERIFIED; existence of role alone is not a read-only proof.

### Exact artifact review packet, partial independent Owner response

The already-built exact981 Go1.27.3/CGO0/linuxamd64/trimpath kit above is still
valid; no redundant rebuild or ordinary deployment. Owner supplied independently
computed full digests matching the local artifacts:

| Artifact | Owner-provided SHA256 |
| --- | --- |
| c2projection | `08be585091bc47d1f8c90c1a8f0dfcf9ef155aff538678e644b2c186934b8aec` |
| relayprobe | `dda6075cbc5a0001dcc0b5a7a447e9e9553b63549ed6eadc8b5795636cfc8281` |
| separate ingest | `d06f99b3be0e8aee62b169121fc9917c29160726985249a3bd6cabdb32045183` |

These are useful independent binary checksum evidence, NOT an invented explicit
review outcome/authorization record for the eight-file install or a live process.
The other five Node hashes, manifest, installer and hostNode hashes are fully
listed above. One concrete review packet/request covers exact source981, that
complete inventory, independent inactive-install outcome, separately approved
ninth ingest, approved protected reader handle and genuine deployment identity.
No general SSH permission was requested again. No `approved=true` record was
created by the source agent, no installer verify/install or rollback attempted.

### Proven operational gap and minimal source correction

Trace: daily-sync.sh invokes only c2-ingest-launch.py; launcher explicitly does
not arm/provision; c2-production-supervisor.mjs only exports prepareObservation,
without autorun. Existing same-process dropProductionSupervisorPrivileges is
available but has no executable caller. Installing kit alone cannot launch a
protected receiver or issue authentic READY. No systemd/source/secret mutation
was used to hide this gap.

New branch `feat/part32-c2-operator-entry` was created at981cd8e in the existing
owned native worktree, preserving all report history/local changes. Minimal
source candidate, exactly four paths:

1. `scripts/revalidation/c2-operator-entry.mjs`: standalone **manual one-attempt**
   entry installed separately at fixed `/usr/local/libexec/aktau-c2-operator.mjs`.
   Actual root/Linux/fixed-path/no-args CLI dynamically imports ONLY installed
   production provider/supervisor. Same-process privilege drop then original
   prepare/arm/observe/finalize, no fixture/provider/env/approval/path override.
2. `scripts/revalidation/c2-operator-entry.test.mjs`: focused negative/positive
   lifecycle/clock/control/root-boundary tests. Local stand-ins exercise only
   orchestration; they cannot mint a private capture or production capability.
3. `ops/c2/README.md`: exact manual launch with cleared env/verified immutable
   Node, independent BEFORE/actual-process READY/AFTER barriers, limitations.
4. This existing canonical report, append-only.

The entry DOES NOT create independent root records, DSN, deployment evidence,
snapshots, SQL, HMAC, services, timers, files in the eight-member installer, or
new scheduler. No Go/public/C2 wire/manifest/HTTP-budget changes. Root reviews
the separate entry's digest AND actual Node command/import closure before live
launch; it is not inserted as a foreign ninth file in the guarded kit directory.

Operator phases: new attempt PREPARED requires real BEFORE attestation, `ARM`+LF
calls original arm; ARMED_REQUIRES_LIVE_ROOT_READY is explicitly NOT production
ACTIVE, independent root must attest the actual live process before ingest;
observe is provisional until genuine post identity/cleanup and `FINALIZE`+LF.
Only original supervisor ledger verdict/count is returned, never a local PASS.
One original35-minute monotonic bound includes both external waits. Late AFTER,
bad/early/combined/over16-byte command, EOF/CANCEL, wrong root/session/arm/result,
or provider error fails closed with only fixed sanitized states. Unknown lock/
FIFO/socket state is retained for reconciliation, not auto-cleaned/rearmed.
Stdout errors fail closed; final safe output drains before process exit.

This supplies a real executable manual mechanism, not automatic future arming.
No additional systemd unit/root privilege grant is needed for a human root
parent. Independent records must be installed close to the genuine schedule,
not now with a nine-hour-expired35-minute READY. A future automatic per-schedule
controller remains distinct; no such infrastructure is claimed installed.

### Actual fail-first and verification, no production substitution

Initial `node --test scripts/revalidation/c2-operator-entry.test.mjs` exited1
with ERR_MODULE_NOT_FOUND before implementation: the source had no operational
entrypoint. This is a missing-entry failure, not a claim of a live C2 incident.
After implementation focused10/10 PASS,0skip; syntax of both changed JS exit0.
Tests include stable lifecycle, missing root authority before provider, BEFORE/
AFTER cancellation, NOT_ARMED, original deadline/late AFTER, unchanged FAIL and
INCONCLUSIVE, malformed IDs/results, safe failure output, bounded partial/EOF/
combined control, actual nonroot/source CLI and override rejection. No assertions
disabled/retries/real analytics/production traffic used.

Actual local profiles with Node24.10/Go1.27.3/GOTOOLCHAIN=local/nonroot:

| Command | Exit/result |
| --- | --- |
| `node scripts/ci/run-checks.mjs ops` |0;180/180 |
| `node scripts/ci/run-checks.mjs security` |0; guarded source/security/backup checks |
| `node scripts/ci/run-checks.mjs go` |0;Go unit/race/vet/staticcheck + Node331/331,0skip |
| `node scripts/ci/run-db-integration.mjs` |0;real owned disposable PG17 restricted-role/READY/C2 integration and cleanup |
| `node scripts/revalidation/joint-poc.mjs` |0;15/15 real Go/FIFO/provider/HTTP fixtures; no production substitute |
| `node scripts/revalidation/verify-part16.mjs` |0;static contract boundaries |
| `git diff --check` |0 |

Full Go profile ran before a final two-line stdout-drain hardening; focused10
tests/syntax were rerun on final bytes. Exact-head hosted CI must test the final
commit; old main9/9 is not candidate CI evidence. No long unrelated baseline
frontend/pipeline test rerun is falsely claimed. Existing local joint/PG17 tests
prove the unchanged underlying real chain; new entry's root/process bridge is
locally modeled and NOT live-activation proof.

### Current handoff boundary

Publish the narrow source candidate through an ordinary PR/mandatory CI, with
no production install/merge claim before its actual outcome. Root-process closure
has now gained a separately reviewed entry candidate: prior three ELF digest
checks do not approve this new command or attest its live process. Before any
execution, verify immutable installed closure and real root review, reader ACLs,
deploymentId and per-attempt source/process identity. Ordinary981 sync remains
unchanged and must not be blocked by missing C2 prerequisites.

**RESULT=BLOCKED_EXACT_MISSING_INPUT; VPS_SYNC_SHA=981cd8e; VPS_GO=1.27.3;
C2_KIT=NOT_INSTALLED; C2_INGEST_ELF=NOT_INSTALLED; C2_READER=BLOCKED;
VERCEL_PRODUCTION_ID=NOT_VERIFIED; C2_PROCESS_AUTHORITY=BLOCKED;
C2_ARMING=NOT_ARMED; C2_QUALIFIED_COUNT=0/3.** Last new-source scheduled sync
NOT_YET_OBSERVED. No background supervisor/waiting process invented. No nightly
publication awaited or manually triggered. Root/reader/frontend inputs remain
concrete external dependencies; source correction is independent useful work,
not a claim of production ACTIVE. Final source PR/CI/archive readback follows
append-only below; no Release/tag/draft or auto-deploy activation.

## 2026-10-21 — Actual Owner-approved inactive install, reader proof and operator source merge

Current result: **C2_INSTALLED_INACTIVE / BLOCKED_EXACT_MISSING_INPUT**, not
ACTIVE or production acceptance. All earlier NOT_INSTALLED/reader BLOCKED
statements describe their historical checkpoints; nothing is deleted or
retroactively changed to PASS. Qualified production count remains **0/3**.

### Source and CI actually completed

Manual one-attempt entry source commit
`c846584a4ea7a29212fb6eaf1a00c0080fcc3ecd` was published normally in
[PR59](https://github.com/kiratonine/AdilBaga/pull/59), exact-head
[CI39633974863](https://github.com/kiratonine/AdilBaga/actions/runs/39633974863)
completed9/9 SUCCESS. A normal protected merge, pinned to that head, produced
main `5a4478aecdb131793b9ac194d3e1aa08bba4aac0`;
[exact-main CI39637452760](https://github.com/kiratonine/AdilBaga/actions/runs/39637452760)
completed9/9 SUCCESS: Nest Reference, Frontend, Contracts, Pipeline Quality,
Security, Go Quality, PostgreSQL Integration, Ephemeral Staging, CI Gate.
`git diff --exit-code c846584a4ea7a29212fb6eaf1a00c0080fcc3ecd origin/main`
exited0: complete trees identical. No force push, branch-rule bypass, Release,
deploy workflow or automatic production update was performed.

Changed source paths in PR59: `scripts/revalidation/c2-operator-entry.mjs`,
`scripts/revalidation/c2-operator-entry.test.mjs`, `ops/c2/README.md`, and this
append-only report. The later operational appendix is not falsely represented
as CI-tested committed text. Final entry SHA256 is
`80fc19966442325e00a519f8740e23a26fd19493228ea3e4918d298946ac4f35`.
The entry has NOT been installed or launched on VPS; merging source does not
approve its command closure or its future live process.

### Real independent approval and single inactive installation

Owner independently supplied the three exact ELF digests and then explicitly
approved exact981cd8e inactive kit and separate ingest ELF. Owner also authorized
reader administration through existing SSH. This is independent human approval
for those immutable files, NOT approval of a fictitious process/READY or new
operator command. The agent acted as installation operator after that signoff;
the agent did not act as the independent reviewer.

At16:27:30Z the protected installation helper verified the previous0095 bundle,
fixed targets, custody, UID999/GID987, parent inode and absence of orphans. It
preserved the old bundle without overwrite/delete as
`/var/lib/aktau-c2-install/bundle.preserved-0095d995-20261021`. Root0600 canonical
installer approval faithfully recorded the already supplied Owner decision.
Exactly one reviewed installer `--verify` returned READY, exit0; exactly one
`--install` returned C2_PROVISIONED_INACTIVE, exit0. Separate ninth ingest was
installed no-clobber at `/usr/local/libexec/aktau-c2-ingest`, root:root0555,
single link. Installer receipt, Part30 journal/quarantine and old staging remain.
No existing `/var/lib/aktau-sync` ownership/mode was changed.

Actual ELF SHA256:

| Fixed artifact | Independently approved / installed hash |
| --- | --- |
| c2projection | `08be585091bc47d1f8c90c1a8f0dfcf9ef155aff538678e644b2c186934b8aec` |
| relayprobe | `dda6075cbc5a0001dcc0b5a7a447e9e9553b63549ed6eadc8b5795636cfc8281` |
| separate ingest | `d06f99b3be0e8aee62b169121fc9917c29160726985249a3bd6cabdb32045183` |

Readback16:57:11Z independently verified all eight installed file hashes,
root ownership, exact0555/0444 modes/single links, and separate ingest hash/
custody. `/etc/aktau-c2/authorization.json` exists; `deployment.json` and
`ready.json` do NOT exist. No supervisor is claimed alive or armed.

### Reader: actual TLS/identity/ACL proof; projection timeout remains

Only the specifically authorized local ROLE_PASSWORD value was selected in
memory and sent by encrypted SSH stdin. Existing protected runtime configuration
contributed endpoint/database/tenant topology only. Its ingest username/password
was NOT used as the reader identity. No whole env copy, argv secret, credentials
in Git/report/archive, privileged DB connection or DB grants/DDL/DML occurred.

Historical attempts are retained: first local custody assumption rejected the
operator-owned0600 topology file; subsequent approved CLI identity failure was
traced to TLS unknown authority, before authentication. A verified official
Supabase CA was obtained from the official certificate URL, independently hashed
and installed only at `/etc/aktau-c2-install/supabase-prod-ca-2021.crt`, root0444.
No global trust store change, sslmode downgrade or DB SSL setting change occurred.
The [official SSL guidance](https://supabase.com/docs/guides/platform/ssl-enforcement)
documents verify-full certificate validation. CA file SHA256:
`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.

Bounded read-only diagnostics use the exact existing production identity and
C2 effective ACL predicates. An earlier SELECT test included `source_runs`,
which this C2Project path does not read. Its false result did NOT prove missing
required C2 privileges. Source trace confirmed the six actual dependencies:
categories, canonical_products, offers, stores, store_locations, snapshots.
The diagnostic allowlist was corrected outside Git; no grants were changed to
satisfy the erroneous seven-table expectation.

At16:55:57Z actual API-role diagnostics returned connected=true,
verifiedTLS=true, identityGuard=true, readonlyTransactionStarted=true,
aclGuard=true, requiredSelectProved=true. Connect1151ms, identity374ms,
ACL268ms. This proves the existing real role and effective read-only/SELECT
policy for that bounded connection; it is NOT a successful full projection.
Only after these gates passed, no-clobber `reader.dsn` was created with file+
directory fsync at the fixed contract path, owner999:987,0600,single link.
Independent metadata readback confirmed those properties without printing it.

The immutable approved Go projection was also attempted with valid BEFORE args,
APP_ENV=production and the installed reader. It exited1, safe class `timeout`,
6091ms wall duration including driver cleanup. Raw projection/stdout/stderr was
suppressed. An earlier real attempt also timed out. Do not equate successful
identity/ACL proof to a completed BEFORE or increase timeouts speculatively.
The intermediate readback invocation without CLI args returned usage2 and used
an incorrect container/timer label; it performed no DB query or mutation and
was corrected from source before the valid readback. It is not counted as a
projection PASS or as a failed real service.

### Independent production boundaries and exact remaining packet

GitHub Vercel bot metadata now reports Production deployment7231754710 for
main5a4478a, created16:44:57Z, success, immutable deployment URL. Earlier bot
metadata reported7227874749 for981cd8e. Neither GitHub numeric ID nor hostname
is a real Vercel `dpl_...` or proof of current `aktau.market` alias binding.
Owner's earlier981 frontend observation is historical after this newer source
merge. Authorized Vercel dashboard session was unavailable; no login bypass,
token search or invented deployment identity. **VERCEL_PRODUCTION_ID=NOT_VERIFIED.**

One concrete Owner/custodian packet remains: provide the real current Production
`dpl_...`, exact alias→Ready deployment/source SHA proof, and independently review
the manual operator entry digest above with installed five-module981 closure
and actual Node24 executable SHA256
`41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c`.
Proposed fixed root command, not yet executed:

```text
sudo -n /usr/bin/env -i /usr/local/lib/nodejs/node-v24.18.0-linux-x64/bin/node /usr/local/libexec/aktau-c2-operator.mjs
```

Approval of files/command still does not attest a live PID/start ticks/boot,
non-dumpability and actual armed FIFO. Those must be checked on the real process
close to the legitimate schedule before a fresh READY; no35-minute record is
created hours early. Full projection timeout is a separate technical blocker
requiring measured stage diagnosis, not additional general Owner permission.

Readback: VPS sync981cd8e clean; Go1.27.3 unchanged; daily/full/monitor timers
enabled+active/waiting. API6a4b4c7 running healthy, restart0. Source rollback28cc3fc,
old Go1.27.2, old kit and API rollback438ecdfa remain preserved by the earlier
verified operations; no destructive rollback test was performed. With a reader
present, installer rollback must not delete unknown credentials/state: reconcile
exact owned resources first. No sync/API/service restart, publication, HMAC POST,
observer GET, SQL writes or overnight wait. `AUTO_DEPLOY_ENABLED=false` was
independently reread through GitHub variables API; unsupported local `gh variable
get` was not claimed successful. No Release/tag/draft.

**Current: kit INSTALLED_VERIFIED; separate ingest INSTALLED_VERIFIED; reader
REAL_READONLY_PROVED; full BEFORE BLOCKED_TIMEOUT; process authority BLOCKED;
arming NOT_ARMED; qualified0/3; last new-source scheduled sync NOT_YET_OBSERVED.**
The objective of real arming is incomplete. Source/reader/install progress is
real, but cannot substitute for missing deployment/process authority or a valid
completed BEFORE. New clean archive and history/member/byte/privacy checks are
performed after this append; public archive excludes all credentials, root
records, diagnostic binaries, certificates, dumps and private operation outputs.

### Follow-up measured timeout boundary, no budget or installed-source change

A single diagnostic-only CLI copy was built in the existing temporary Git
export with Go1.27.3, instrumenting only query ordinal/start/end/duration/success
in the existing tracer. No SQL, args, rows or raw driver error was recorded.
This is NOT the approved immutable provider and creates no trusted C2 evidence;
it was placed only in the root0700 maintenance namespace, never in installed
kit/authorization. SHA256
`90a02cf014a2e3df07cc97bb21d4220423d7cd133a2a46a321dc273a3a177a1e`.
The initial nonroot execution was correctly rejected by that root-only parent
before exec/DB; no permissions were widened. Root then ran the diagnostic with
the same real restricted DB identity/read-only guards, not an admin DB role.

Actual result: exit1, safe class timeout,5760ms wall. Ordinals1–11 completed
successfully in346,469,460,243,120,255,245,527,325,504,251ms respectively
(3745ms query total, excluding initial connect). Ordinal12 failed after125ms
as the existing shared five-second CLI context expired; rollback ordinal13
also reported failure. In this exact serial BEFORE path those successful steps
cover session setup/identity/ping, BEGIN/ACL, snapshot chain, dashboard,
categories and sitemap; the next category-page step does not receive a fresh
budget. Thus this sample demonstrates cumulative connection/roundtrip budget
exhaustion, not a permission rejection or proof that one SQL statement took5s.
It does NOT establish general cold-Supabase RCA or justify changing public API,
SQL, SLA or timeouts. No privileged DB connection, retry loop, installed binary
replacement or source fix was performed. A separately tested/reviewed C2-only
preparation-budget/roundtrip solution is required before claiming working BEFORE;
production observation's204→GET five-second SLA remains unchanged.

### Falsification of a timeout-only candidate; no production rollout

A second temporary diagnostic-only build changed its own whole-CLI context to
8s, keeping the same SQL/guards and safe ordinal tracer. This was a bounded
read-only experiment, not a source candidate, approved artifact, budget change
in the installed kit or C2 capture. SHA256
`09384e559ad05fdc3f57653cd435b630dcfacdc0c45f3a5e25f1ab8608e79b54`.
Exactly one real restricted-reader run still exited1 timeout,8658ms wall.
Ordinals1–10 succeeded in126,265,316,559,217,389,531,1269,501,1715ms;
ordinal11 failed after790ms, then rollback failed after0ms. The increased
diagnostic budget did NOT prove a working solution; no production budget was
increased and no further timeout ladder/retry loop is authorized by this result.
These two different samples demonstrate variable cumulative preparation cost,
not a proven isolated slow SQL/cache/region/cold-connection root cause.

Node production execFile already bounds the process at10s; the Go CLI owns the
inner5s context, session/identity checks and RR data traversal. A compatible
source correction would need regression-backed C2-only reduction of roundtrips
or an explicitly reviewed bounded preparation-budget contract, preserving all
identity/ACL/transaction guards and204→GET SLA. No common API pool, SQL, DB schema,
installed approved ELF or independent approval was changed to conceal failure.
Missing live Vercel identity and process review remain separate external gates.
A single concrete Owner request for actual `dpl_...`+alias/frontend proof was
issued; no request for credentials or repeated general SSH permission.

## 2026-10-21 — C2-only preparation candidate and Owner deployment identity

Owner supplied actual Vercel ID suffix `AczbPzNBbwT2khvbEd61A7DZHnLU` and
explicitly confirmed the current Ready/Production `aktau.market` deployment
uses frontend SHA `5a4478aecdb131793b9ac194d3e1aa08bba4aac0` after PR59.
Contract-form ID is `dpl_AczbPzNBbwT2khvbEd61A7DZHnLU`; this is Owner-reported
external evidence, not an invented GitHub ID or independent API/UI observation.
It supersedes the earlier missing-ID checkpoint. No deployment.json/READY was
created hours before the next genuine publication; root/process attestation is
still required and no C2 ACTIVE/PASS is claimed.

### Minimal source candidate, not an installed approval replacement

New native worktree `aktau-part32-c2-projection-preparation`, branch
`fix/part32-c2-projection-preparation`, starts from fresh exact-main5a4478a.
The previous worktree, full report prefix and all artifacts were preserved.
Only CLI `main.go`, its `main_test.go`, `ops/c2/README.md` and this report change.
No SQL, common API pool, ingest/notifier, HTTP/manifest/FIFO contract, Frontend,
dataset, service/timer or credential is changed. An unchanged-function extraction
first exposed the old default query mode and five-second CLI budget; the new
`TestProjectionPreparationConfig` then failed with both mode assertions and
the budget assertion (exit1). After the narrow fix, focused CLI suite exited0.

The one-shot CLI now normalizes its DSN only in memory to pgx extended `exec`
mode, avoiding first-use Describe/Prepare roundtrips. This is parameterized
extended protocol, NOT simple-protocol interpolation. Identity, actual TLS and
URI credentials/options remain intact; malformed options fail closed with a
fixed nonsecret error. A fixed eight-second whole-CLI preparation bound remains
below Node's existing ten-second process cap. Per-statement5s and public API
pool are unchanged. This is distinct from, and does not restart or relax, the
five-second actual204→fresh GET acceptance window/20s diagnostics/21 GET/2 sitemap.
Failed preparation still yields no trusted document/qualification.

A diagnostic exec-mode-only5s run still timed out (5607ms wall), despite shorter
initializer roundtrips; that sample alone is NOT claimed a fix. The combined
candidate was built outside Git and placed only in the root maintenance
namespace, with no installed-kit/authorization replacement. Its diagnostic
binary SHA256 `f203b19379daa0e803adfdfdd585659fb390585bfd1d6775d0e4899437afcbb1`
uses baseline source metadata plus uncommitted candidate bytes, explicitly NOT
an immutable approved release. One real read-only API-role BEFORE exited0 in
3766ms, returned a valid v2 document and eligible witness; all row data, IDs,
DSN and raw outputs were suppressed. This is a real diagnostic success, NOT
trusted production custody, full observer acceptance or proof of reliable
latency under all network/cache states. No AFTER/publication/HTTP was fabricated.
No further production diagnostic retries are needed for this source review.

### Actual test gates and limitations

Node24.10.0, Go1.27.3/GOTOOLCHAIN=local, nonroot native WSL:

| Command | Actual result |
| --- | --- |
| `go test -count=1 ./cmd/c2projection -run TestProjectionPreparationConfig` before fix | exit1, mode/budget regression reproduced |
| `go test -count=1 ./cmd/c2projection` after fix | exit0 |
| `node scripts/ci/run-checks.mjs security` | exit0,0skip |
| `node scripts/ci/run-db-integration.mjs` | exit0, real owned disposable PG17, including changed real CLI BEFORE/AFTER and cleanup |
| `node scripts/revalidation/joint-poc.mjs` | exit0,15/15,0skip |
| `node scripts/revalidation/verify-part16.mjs` | exit0 |
| first `node scripts/ci/run-checks.mjs go` | exit1 in unchanged Voice outage privacy tests during race run; unit phase passed |
| repeated unchanged Go profile after investigating that failure | exit0: unit/race/vet/staticcheck/integration-tag staticcheck/govulncheck/build plus Node331/331,0skip |
| gofmt / `git diff --check` | exit0 |

The first race failure is preserved, not rewritten as PASS. It came from the
existing `TestVoiceProviderOutages` whole-log substring assertion; that assertion
also examines timestamp strings and can collide with short coordinate literals.
No raw failing logger payload was retained, so timestamp collision is a source-
supported hypothesis, NOT a proven privacy RCA. Neither test/assertions nor
production Voice were changed; hosted exact-head CI must independently cover
the final candidate. Initial shell profile starts also exited127 due an unquoted
inherited Windows PATH containing spaces; quoted PATH corrected the invocation,
not tests/runtime, and those failed starts are not counted as test PASS.

### Next independent gate

Installed approved981 kit and ingest remain unchanged and inactive; reader is
REAL_READONLY_PROVED. New provider source requires ordinary PR/mandatory CI and
independent exact-source/artifact review before replacing any installed bytes.
The prior Owner approval for981 does not extend to this new binary. Operator
entry/process closure also needs actual independent review and a real live
attestation close to schedule, not a guessed PID or an expired READY. Current
source candidate is ready for review; full production goal remains incomplete,
arming NOT_ARMED and qualified count0/3. No Release/tag/draft/auto-deploy.

### Publication and final exact-head CI readback (source review only)

One normal source commit `acaa57260470f539ff2fbbb6c179bf0e2a2a5ce5` was pushed
without force on `fix/part32-c2-projection-preparation` and published as
[Draft PR60](https://github.com/kiratonine/AdilBaga/pull/60), base main5a4478a.
It contains exactly the four paths above. No merge or production replacement.
[Hosted CI39646719826](https://github.com/kiratonine/AdilBaga/actions/runs/39646719826)
was independently read after completion: exact acaa572 head,9/9 SUCCESS
(Frontend, Nest Reference, Go Quality, Pipeline Quality, Security, Contracts,
PostgreSQL Integration, Ephemeral Staging, CI Gate). PR is Draft/MERGEABLE;
green CI is not an independent Code Review or root artifact approval.

Additional actual required local gates: `node scripts/ci/run-checks.mjs ops`
exit0,180/180/0skip; `python3 -B -m unittest discover -s pipeline/scripts -p
test_c2_ingest_launch.py -v`22/22 OK; `node --test
scripts/ops/c2-ingest-launch.test.mjs` exit0,3/3/0skip; `bash -n
pipeline/scripts/daily-sync.sh` exit0. Node331 full suite includes the real
local relay; no production captures or private capability was fabricated.

This last operational appendix is deliberately uncommitted after exact-head CI;
only this report differs from acaa572. All source bytes remain precisely the
CI-tested commit. The final clean archive checks all700 non-report members
against that head, all701 against current disk, and the complete prior134616-byte
operational report plus main history as prefixes. Safe-member, bounded privacy,
Markdown-link, exact-scope and diff checks exclude secrets/env/dumps/ELFs/CA/root
records and temporary diagnostics. Archive hash is reported externally, avoiding
a self-referential archive/report digest.

**Next external action: independent source review of PR60 and exact manual
operator command/closure.** Do not transfer981 approval to a new binary, overwrite
the installed kit, discard receipt/reader/ledger or claim READY based on this
source result. After review/normal merge, a fresh exact-main build and truthful
no-clobber replacement/reconciliation packet must precede any new root approval.
If a merge causes a new Vercel deployment, refresh actual alias/deployment/SHA
attestation rather than reuse the currently reported5a4478a deployment blindly.
READY can only attest a real live armed process within35min of a legitimate
schedule. No overnight wait, synthetic publish, new permission grant or false
production PASS. **SOURCE=READY_FOR_EXTERNAL_REVIEW; C2=C2_INSTALLED_INACTIVE,
NOT_ARMED,0/3.** Original activation objective remains incomplete.

## 2026-10-21 — Reviewed PR60 production continuation: exact-main and immutable review packet

Owner supplied independent APPROVED FOR MERGE for exact acaa572 and authorized
this continuation through the Part32 PR60 activation TASK. Fresh precheck proved
unchanged head, reviewed archive SHA256 e0e10be7..., MERGEABLE,9/9 PR-head CI.
PR60 was transitioned Draft→Ready and merged normally, pinned to acaa572 with
no bypass/force. Actual main is **`d3a9cc59621764335f8ebe5fd54194a09d4b927e`**;
its complete tree equals reviewed acaa572. Exact-main
[CI39650032465](https://github.com/kiratonine/AdilBaga/actions/runs/39650032465)
completed9/9 SUCCESS. No Release/tag/draft or deployment workflow dispatched.

New audit worktree `aktau-part32-pr60-activation`, branch
`audit/part32-pr60-reviewed-activation`, preserves the entire previous operational
report prefix. No source edit or VPS mutation has been performed in this new
continuation at this checkpoint. `AUTO_DEPLOY_ENABLED=false` reread through
GitHub variables API. Focused Go CLI/postgres unit and race commands each exit0;
unchanged broader gates are the exact PR/main CI plus explicitly recorded local
results above, not invented reruns.

### Fresh VPS preflight18:09:15Z

One bounded root-side read-only Python inventory over existing verified `my-vps`
SSH returned exit0; root TERM110s/KILL5s bound, each metadata command8s, no retries,
no env/DSN/private record body or raw logs emitted. Sync981cd8e clean, owner999:987,
Go1.27.3; no ingest/go process observed, services idle/success0; daily/full timers
active/waiting with unchanged exact unit hashes and next daily22Oct06:00+05.
API6a4b4c7 healthy/running, restart0/OOMfalse; rollback438ecdfa image preserved.
NTP synchronized, free42,798,718,976bytes. Existing ledger0700 owner999:987 empty,
namespace contains only ledger+reader; no reserved installer stages observed in
three fixed parents. Reader metadata owner999:987/0600, no symlink, unchanged;
contents never printed. Operator entry absent, deployment/READY absent, old root
authorization present. Existing receipt root0600 SHA256
`d8ffdbe5f5ab035acdd7263f342af3ce40d98de3880c1b1adcd604170ebf4af5`.
Installed eight hashes match the prior approved981 set. Full DB recovery point
is not newly proved by this metadata check; preserved data.tar is NOT a DB backup.
No new DB/admin write is part of this release.

Two bounded frontend GETs only at this checkpoint: `/ru` redirect rejected
without following (source locale page intentionally redirects to catalog), then
canonical `/ru/catalog` HTTP200/827ms, bounded2MiB body, no cookies/proxy/retries.
Only safe headers/body hash/ID presence inspected; no HTML or product data saved.
Canonical body contained no `dpl_...` marker. GitHub Vercel bot reports successful
Production deployment7233596902 for new d3a9cc5 at18:08:55Z, immutable deployment
URL `https://adil-baga-mpvo9oodl-kiratonines-projects.vercel.app`. Numeric GitHub ID
and that URL do NOT prove actual Vercel `dpl_...` or exact alias binding. Prior
Owner-confirmed dpl_Acz.../5a4478a remains historical, not silently reused after
merge. Fresh actual alias/deployment/frontend proof remains a separate input.

### Independently reviewable exact d3a9cc5 build, NOT authorization

Fresh immutable `git archive d3a9cc5`, all701 exported files matched Git object
bytes; Go1.27.3/local, CGO0/linux/amd64/trimpath, documented build recipe.
`go mod verify` passed. Three ELFs built outside Git; Go package/toolchain/platform
and ELF64 LE amd64 verified. Initial validator incorrectly required an ldflags
line in `go version -m` metadata; the trimmed executable omits that line. This
assertion failed BEFORE any upload/approval/install. Build bytes were preserved,
not blindly rebuilt. A read-only ELF verifier resolved actual `main.sourceSHA`
Go string-header symbol through mapped ELF segments and proved the linked string
is exactly d3a9cc5. Exact-source/export/manifest review then returned
**REVIEW_REQUIRED_NOT_APPROVAL**, not approved=true.

| File | Installed/previous SHA256 | New exact d3a9cc5 SHA256 |
| --- | --- | --- |
| c2projection | `08be585091bc47d1f8c90c1a8f0dfcf9ef155aff538678e644b2c186934b8aec` | `605cdd29172e4eabbf04f63e3eaf1b701fbe808182fb5fbd85c6b92a7ef16474` |
| relayprobe | `dda6075cbc5a0001dcc0b5a7a447e9e9553b63549ed6eadc8b5795636cfc8281` | same |
| c2-production-supervisor.mjs | `72b5dc46c1bc705caa839c58b5f3f3e0c71de30121869e45536662152642279e` | same |
| projection-provider.mjs | `be64de92f206493d5698e442b6882296439a262f17147b2804db0c0dc0b41bb9` | same |
| fifo-adapter.mjs | `bfea914d48fb312753fb39c6546cefa148f1e4c948a393ac3a8eb684f3f7ed5c` | same |
| production-observer.mjs | `8e52f34b82fe15d552140270c8b56c292bf99f6d87b41021aa9f6e2d742b30f2` | same |
| c2-manifest.mjs | `e5ed6854f2182b3f8a108e2525585224337d0e3fb4a9eb587450b7213ac3978a` | same |
| source-manifest.json | `6b1c0167a65965d2d541ec755eb770649f4cb08013486f579a16c3a89dc29e7e` | `657c1adf7ab4f74336ff05e19febac589524cbcf3c5c3b6c3d1e1287650431b6` |
| separate ingest | `d06f99b3be0e8aee62b169121fc9917c29160726985249a3bd6cabdb32045183` | same (fresh rebuild) |
| standalone operator entry | not installed | `80fc19966442325e00a519f8740e23a26fd19493228ea3e4918d298946ac4f35` |
| actual Node24.18 ELF | `41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c` | unchanged runtime, not rebuilt |
| original installer | `b9b2a80a037efcc115d29eb592f353ab785b058bbd0341548c42942344d9eb98` | unchanged source |

New c2projection size14,620,766bytes. Fresh relay and ingest match the previously
approved ELFs exactly; five-module/entry bytes match merged Git objects. This
packet requests independent review of new provider+manifest and separate entry
command/import closure, NOT a future process/PID/READY. Proposed fixed command:

```text
sudo -n /usr/bin/env -i /usr/local/lib/nodejs/node-v24.18.0-linux-x64/bin/node /usr/local/libexec/aktau-c2-operator.mjs
```

Preserve old981 bundle/approval/receipt, immutable ingest, reader and every old
rollback. No installer retry/overwrite: current installer only supports initial
install/rollback and intentionally refuses a reader-bearing rollback. A safe
replacement receipt/atomic-swap procedure must be reviewed/tested before mutation;
old approval cannot authorize new bytes. Recurring automation also cannot re-date
cached frontend/process assertions: a genuinely independent fresh per-attempt
custodian is still mandatory. Specific replacement/custodian integration work
continues independently; no artificial publication or waiting overnight.

Checkpoint: **NEW_MAIN_CI=9/9_SUCCESS; NEW_ELF=BUILT_VERIFIED_NOT_APPROVED;
VPS_INSTALLED=OLD981_INACTIVE; READER=PREVIOUS_REAL_READONLY_PROOF_PRESERVED;
OPERATOR=NOT_INSTALLED; READY=ABSENT; C2_NOT_ARMED; QUALIFIED=0/3.**

## 2026-10-21 — Owner-confirmed d3a9cc5 kit: installed BEFORE proved, schedule handoff

This append-only continuation supersedes the immediately preceding *checkpoint*,
not its history. Current result: **C2_INSTALLED_AND_BEFORE_OK; NOT_ARMED; 0/3**.
Recurring unattended activation remains **BLOCKED_INDEPENDENT_CUSTODIAN_WIRING**;
production convergence is NOT VERIFIED. No Release/tag/draft was created.

### Independent Owner evidence and exact source

Owner explicitly confirmed the presented d3a9cc5 projection/manifest hash packet,
the six unchanged kit files, separate unchanged ingest, and independently reviewed
standalone entry/fixed Node command/import closure. This approval covers actual
artifact bytes and inactive installation, NOT a future PID/READY or C2 PASS.
Only after that confirmation was the canonical root install approval materialized.
No agent self-review was represented as independent artifact authorization.

Separately, Owner confirmed Ready/Production alias `aktau.market`, exact frontend
SHA **d3a9cc59621764335f8ebe5fd54194a09d4b927e**, Vercel deployment
**dpl_FUnss13QtAuWVMQYPoGNPf9ka3RM**. This is **Owner-reported**, not an
independently authenticated Vercel API/UI observation by this agent. Previous
dpl_Acz.../5a4478a remains historical. It cannot be automatically re-dated as
fresh per-attempt BEFORE/AFTER evidence for later scheduled runs.

Fresh main still d3a9cc5. [Exact-main CI39650032465](https://github.com/kiratonine/AdilBaga/actions/runs/39650032465)
independently re-read: all nine jobs completed SUCCESS (Go Quality, Nest
Reference, Security, Frontend, Pipeline Quality, Contracts, PostgreSQL
Integration, Ephemeral Staging, CI Gate). Exact merged tree equals reviewed
PR60 head; no new tracked runtime patch in this continuation.

### Actual inactive replacement and preserved custody

The unchanged original installer intentionally cannot overwrite its live targets
or roll back a reader-bearing state. It was NOT patched, bypassed or run against
an edited receipt. A bounded private one-time administrative coordinator first
verified old/new independent approvals, complete kit hashes, all three targets,
receipt/inodes, root ancestry and parent identity, inactive namespace/empty
ledger, Node/entry closure and reader metadata. It preserves all old targets,
bundle, authorization and receipt with no-replace renames and fsync, then runs
the **unchanged original installer once**, with all three fixed targets absent.
The original installer creates a fresh receipt for the actual new target inodes.
The existing reader inode is moved unchanged to the newly installed state.
No receipt ownership/inode checks were disabled; no file was overwritten/deleted.

Private coordinator SHA256
`0637a5144d33160bcb878d10b0eb1a57d222076773e3223dbd0bc3bb730940a6`;
tests `ff65cf1031d0997d9f5ade9000fe797959f5f81c5c3ec0b84a08bc62ee720a59`.
These operational files remain outside Git/review source archive. Local syntax
passed; coordinator unittest suite **12/12 PASS**, exit0, nonroot; unchanged
original `python3 -B -m unittest discover -s ops/c2 -p 'test_*.py'` **53/53 PASS**,
exit0. Coverage includes parent swap, unsafe stage/entry/Node, reader inode and
hardlink protection, partial/crashed transaction, no-clobber, torn journal,
foreign ledger, normal preservation/restore and known installation failure.
An initial private test-fixture mutation hit PermissionError on its intentionally
read-only fixture; fixture setup was corrected before final12/12, not a live
resource failure or weakened assertion. The coordinator received local code/test
review, not a separate external source PR; it adds no reusable runtime authority.

Actual bounded operations (UTC):

| Operation | Exit/result |
| --- | --- |
| 18:41:30 stage exact13-member private transport | 0, STAGED_NO_OVERWRITE; no runtime target changed |
| 18:42:33 coordinator --verify, once | 0, REPLACEMENT_VERIFIED_NOT_APPROVAL |
| 18:45:17 coordinator --execute, once | 0, C2_REPLACED_INACTIVE_READER_PRESERVED |
| 18:47:04 independent SSH readback | 0, all eight installed hashes match approved table above |
| 18:52:02–18:52:06 idle checkout identity alignment | 0, EXACT_SOURCE_ALIGNED_NO_PUBLICATION |
| 18:52:41 separate final SSH inventory | 0, exact new source/kit, inactive empty namespace, API healthy |

Protected old state is retained at
`/var/lib/aktau-c2-install/rollback-d3a9cc5`: old kit, authority, state, bundle,
approval and receipt plus durable replacement journal. Old receipt SHA256
`d8ffdbe5f5ab035acdd7263f342af3ce40d98de3880c1b1adcd604170ebf4af5` preserved;
new actual original-installer receipt SHA256
`02a36e334ee923272ba267609a2478abd9fe844442f3abe0a444688454998eb1`.
Known-complete inactive restore was tested locally, NOT executed on VPS.
Do not use ordinary installer rollback on the reader-bearing state. Unknown
ledger/socket/claim, torn journal or changed inventory requires reconciliation,
not retry or deletion. Existing Part30 journal/quarantine remain untouched.

Installed provider/manifest hashes are respectively605cdd29... and657c1adf...
(full values in preceding table). Five modules, relay and ingest remain exactly
unchanged. Standalone root-controlled entry80fc1996... is installed separately,
not as a ninth kit member. Installed ELF0555/modules0444, root custody checked.
Reader remains UID999/GID987,0600, **same dev64770/inode933613**; neither credential
contents nor environment were printed or copied locally. New ledger0700 is
empty; deployment.json/ready.json absent; all three stage-orphan counts zero.

### Real installed restricted-reader BEFORE — not observation/acceptance

At18:47:03.599Z the approved **installed** c2projection ran `-phase ready-before`
through the actual protected reader as UID999/GID987: **exit0 / 5,446ms**.
Existing pure schema-v2 and eligibility validation passed. Baseline S0
`aa9574c9-f992-4e39-92ca-4f1fb65e86d3`, publishedAt
`2026-10-21T13:01:56.413Z`; valid baseline and eligible witness proved without
printing raw projection/product payload. Production TLS, exact reader identity
and effective read-only ACL guards passed on that real connection. This is a
single successful8s-budget preparation, not a latency guarantee or5s C2 test.

Separate actual root Node privilege-drop diagnostic passed
`NON_ROOT_PROTECTED`: real999/987, zero capabilities and non-dumpability.
It did not call prepareObservation(), create an attempt/READY, open the observer
or manufacture trusted capture. Private diagnostic JSON was not imported as a
production provider capability. No HMAC POST, apply or snapshot was triggered.

### Ordinary sync/source, API and public safety readback

Only while both sync services were inactive, with no operator process and a clean
own checkout, switched to **deploy/part32-c2-d3a9cc5**, exact source d3a9cc5.
Fresh fetched main matched; new branch did not exist. The entire981→d3 diff is
six known paths; pipeline, ops/sync, frontend, Go internals, Prisma, contracts and
data have **zero diff**. No reset/rebase/stash/clean, Go build, ingest, service
restart or timer stop/start. Bash/launcher AST syntax checks exit0.

Before/after data state:18 regular files; content+path+uid/gid+mode+inode aggregate
unchanged `098ee5dc2f721de7d085b7802fc55d1ae76aa3d02930a1b084769d0c4a84b9f5`.
All six inspected unit hashes unchanged. Preserved source refs981 and SCRUM-19
28cc3fc2..., old complete Go1.27.2 distribution, private local-data archive and
old API rollback image438ecdfa... remain. That data archive is NOT a DB backup;
no fresh complete DB recovery/parity claim is made by this Part.

Final VPS API revision **6a4b4c7a91ec471db54987b689c3c87a785523a3**, running/healthy,
restart0/OOMfalse, unchanged image. Go1.27.3, Cloudflare running; daily/weekly
and monitor timers active. Last daily success21Oct18:00:17+05 predates the new
checkout: **new-source scheduled run NOT_YET_OBSERVED**. Next daily is
**22Oct2026 06:00+05 / 01:00UTC**; weekly26Oct03:00+05.

Four postflight public GETs only,18:52:41–18:52:44Z, sequential/no retries,
redirect rejection, no cookies/proxy, bounded body/time; no raw body saved:

| Target | HTTP / duration_ms |
| --- | --- |
| API health/live | 200 /397 |
| API health/ready | 200 /609 |
| API dashboard | 200 /1164 |
| Frontend RU catalog | 200 /1611 |

This continuation's public HTTP total is **6 GET** including the earlier two
identity-preflight GETs (one deliberately rejected `/ru` redirect); **0 POST,
0 HEAD, 0 observer GET**. Health responses no-store/Cloudflare DYNAMIC; catalog
Vercel MISS/Age0. These prove bounded reachability, NOT deployment alias identity
or convergence. `AUTO_DEPLOY_ENABLED=false` independently re-read via GitHub API;
the local gh version lacks `variable get` (CLI rejected it, no mutation); exact
API read succeeded. No Release/tag, API/Frontend/Siri deployment or DB writes.

### Exact scheduled arming handoff and recurring-contract boundary

Task §7 explicitly forbids a READY hours before publication. At this checkpoint
the next legitimate timer is still over six hours away; no pretend background
waiting or short-lived READY issued now. Planned window for the next schedule:
**22Oct00:50–00:59UTC (05:50–05:59+05)**, after rechecking actual timer/idle state.
One root custodian must remain present through genuine AFTER/finalization:

1. Reverify installed hashes/reader metadata, clean publisher d3/source identity,
   no orphan/current attempt, clock and actual Ready Production alias identity.
   Re-confirm the Vercel identity then, rather than re-date today's Owner message.
2. Run exactly the independently approved empty-env Node entry command above
   under a protected live root parent/private control pipe. On PREPARED, bind
   actual newly generated attempt to authentic fresh BEFORE deployment record;
   only then send ARM. Independently inspect live PID/startTicks/boot/executable,
   command/import closure/non-dumpability and armed FIFO/helper/ledger before
   issuing the one canonical process-bound READY. Do not pre-script ARM/FINALIZE.
3. Let the **existing** daily timer run ordinary sync. No manual apply/Notify or
   timer trigger. A real actual204/FIFO event admits at most21 GET/2 sitemap;
   original5s SLA/20s diagnostics/35minute total remain. No qualifying event,
   unchanged witness or missing authority means INCONCLUSIVE, never fake PASS.
4. Independently prove same actual Vercel deployment AFTER and own cleanup/opt-in
   inactivity; issue genuine post record, FINALIZE once; retain sanitized durable
   evidence and genuine ledger count. FAIL resets count, INCONCLUSIVE does not
   count/reset; three qualified PASS still required. Unknown state interlocks.

**Recurring outcome is not achieved by installing this manual entry.** Minimal
compatible candidate is a reviewed root-owned custodian wrapper at the existing
daily service boundary (same timer schedule), preserving business UID/GID, cwd,
exit0/1/3, rollback, no extra publication and C2-failure-independent normal sync.
It must independently validate real Vercel alias/deployment before/after plus
actual Node/PID/closure and cleanup for **each new attempt**. No new cron or
self-issued monitored-actor approval. Existing fixed provider/READY/FIFO wire,
private registry, fixtureOnly guards and SLA need not be relaxed.

Concrete missing dependency: no approved, authenticated **read-only Vercel
custodian context** exists for unattended fresh before/after verification; only
Owner's specific current-deployment statement is available. Also current manual
entry deliberately leaves unknown cancellation/crash state interlocked: an
unattended wrapper requires reviewed cancellation/reconciliation and systemd
operator wiring tests before installation. Silently re-dating cached Vercel
statements or treating a wrapper's own readiness as independent proof would
violate the frozen trust boundary. Original units were therefore left unchanged.

Specific next decision is **how the independent root custodian obtains fresh
read-only Vercel evidence** (protected approved API context or a present Owner
per attempt), followed by separate source/ops-wiring review; do not send tokens
in chat. Existing kit/reader/SSH permissions and Backend2 handoff are already
approved and are NOT being requested again. A later reviewed wrapper must test
missing/stale/drifted alias, pre-exec failure, same-UID source substitution,
child crash/timeout, orphan/duplicate attempt, safe cancellation, publisher
exit0/1/3 preservation and no extra network/publish attempt.

**Current operational milestone: C2_INSTALLED_AND_BEFORE_OK.** No PREPARED/ARM/
live READY/scheduled publication/AFTER/finalization was executed here; durable
qualified count remains **0/3**. **C2_NOT_ARMED; RECURRING_BLOCKED; acceptance
OPEN; ROOT_CAUSE_NOT_VERIFIED.** Stop for independent operational review and the
real scheduled custodian window, not a fabricated production success.

### Final offline integrity and review artifact

After the operational appendix: `node scripts/ci/run-checks.mjs security` exit0
(source/workflow policy PASS, synthetic backup1/1,0skip),
`node scripts/revalidation/verify-part16.mjs` exit0 (static evidence only),
`git diff --check` exit0. Exact scope is this single report, no staged/untracked
source files. Main report prefix140,031bytes and previous operational report
prefix142,675bytes preserved byte-for-byte; all10 local Markdown file links
resolve. Bounded scan of the appended diff found no private-key/credential/DSN/
token payload. Earlier exact-source local/full hosted gates are identified above;
they were not falsely described as newly rerun production evidence.

Review artifact is generated with unchanged
`node scripts/create-clean-archive.mjs full-stack`, then an exclusive unique
copy named `adilbaga-part32-pr60-installed-before-20261021.tar.gz` in this audit
worktree's ignored artifacts directory. Archive safety, complete member inventory
and byte comparison are checked after generation; its final SHA256 is delivered
alongside the archive, not embedded recursively in this report. Private approval/
transport/reader/ELF/coordinator files are outside the source archive. No source
commit/push/PR was needed or made for this report-only operational continuation.

## 2026-10-22 — Owner-authorized unattended C2: source integration checkpoint

New Owner/Frontend/Backend2 instruction explicitly authorizes the necessary code,
private contract/configuration, systemd and direct SSH deployment to remove human
ARM/FINALIZE from future ordinary sync. This supersedes the preceding missing
unattended-custodian permission/input blocker; it does NOT retroactively create
a fresh Vercel observation, artifact human review, READY or qualified PASS.
Current checkpoint is **SOURCE_IMPLEMENTED; PRODUCTION_AUTO_NOT_YET_INSTALLED**.
Original main d3a9cc59621764335f8ebe5fd54194a09d4b927e; separate native worktree
`aktau-part32-c2-auto-custodian`, branch `feat/part32-c2-auto-custodian`.
All previous operational report bytes were transferred and compared equal before
this append. Main checkout's unrelated untracked files/worktrees are untouched.

### Explicit minimal private-contract change

Owner repeats the configured frontend d3a9cc5 / dpl_FUnss13QtAuWVMQYPoGNPf9ka3RM /
aktau.market and forbids new Vercel token/ID/API requests. New deployment-record
**version2** therefore names its evidence basis `owner-pinned-configuration`.
It binds the canonical protected frontend configuration SHA256, preserves the
historical `ownerConfirmedAt`, and separately records actual root `checkedAt`.
It contains no newly dated external Vercel Ready claim. Provider validates the
fixed independent root pin, exact schema/hash, freshness of THIS attempt's config
check and complete BEFORE/AFTER invariants. Manual version1 behavior remains.
Unchanged READY-v1 uses the per-attempt root/process/config-check clock; no Go
wire/SQL/HMAC/manifest/GET algorithm or private capability bypass is introduced.

This is an Owner-approved evidence-policy change, not evidence that the old
deployment statement is freshly verified. Automatic results are explicitly
configuration-bound; out-of-band Vercel alias changes which do not update the
root pin cannot independently be detected/certified. No frontend runtime,
Vercel configuration, API/token login or HMAC secret is changed. See updated
[C2 runbook](../../../ops/c2/README.md#part32--owner-authorized-unattended-custodian)
and [revalidation contract](../FRONTEND_REVALIDATION.md#part32-unattended-observation-explicit-frontend-configuration-evidence).

### Automatic architecture and safety

New root-controlled Python custodian has no publish/SQL/API command. Existing
daily service gets exactly one ignored-failure privileged pre-start requesting
the dedicated Type=notify C2 service. Original business User/env/cwd/ExecStart,
daily/weekly schedules, weekly no-publish and exit0/1/3 remain. No cron, new
timer, always-on generic daemon, retry or additional apply is introduced.

Root verifies exact fixed12-file closure/policy, existing artifact authority,
clean real publisher source and literal service account; reader METADATA only.
It starts fixed empty-env Node over private pipes. Actual PREPARED precedes own
FIFO/config record; actual ARMED precedes kernel checks of Node/helper PID,
parent, executable/argv, start ticks, zero capabilities, non-dumpability and
the actual nonblocking FIFO reader descriptor. Only then is genuine READY issued
and systemd notified. Node alone owns trusted BEFORE/FIFO/capture/AFTER/verdict.
Root verifies source/config/closure and own helper cleanup before FINALIZE,
independently compares genuine ledger verdict/count, and preserves sanitized
per-attempt config/READY/result evidence under root-only custody.

Orderly timeout/stop now cancels ONLY the owned session, writes terminal
INCONCLUSIVE and unlocks only when cleanup is proved. Unknown cleanup remains
interlocked. Interrupted service recovery requires a different real systemd
invocation, actual exclusive kernel cgroup/no previous actor plus no operator
process and validated matching state. Known old resources are preserved in
unique root forensic directories before marking an interrupted attempt only
INCONCLUSIVE. Historical PASS/FAIL/count remain; corrupt/foreign/ambiguous state
is BLOCKED, not deleted/replayed. Reboot proof is explicitly distinguished from
simulated boot tests and persistent wiring; no live VPS reboot at this checkpoint.

### Actual fail-first and local results to date

| Command/check | Actual result |
| --- | --- |
| New pinned-identity OS factory tests BEFORE implementation | exit1:2 expected positive failures;3 negatives PASS;104 unrelated filtered SKIP, not a full-suite claim |
| New clean-cancellation regression BEFORE entry fix | exit1: cancellation callback not called; expected regression reproduced |
| First custodian tests before new module existed | exit1, import FileNotFoundError; new-feature red phase, not a production defect |
| Early supervisor test edit | exit1, illegal top-level return in isolated test script; fixture syntax corrected before assertions, not a source/runtime failure |
| Initial ops profile after adding Python CI branch | exit1:178/180 Node; Python67/67 PASS; immutable-source fixture mixed HEAD with dirty modules, miniature CI fixture lacked new prerequisites |
| Corrected ops profile | exit0:180/180 Node,0skip; Python67/67 at that revision; later custodian tests extend coverage |
| Current focused Python custodian tests | exit0:28/28, no production resources/network; real bounded child pipes and filesystem operations plus explicit OS/kernel models |
| Combined installer/custodian suite | exit0:81/81 at recorded checkpoint |
| `node scripts/ci/run-checks.mjs go` with native Node24.10/Go1.27.3 | exit0:unit/race/vet/staticcheck/integration-tag analysis/govulncheck/build; real local relay;342/342 Node,0skip |
| `node scripts/revalidation/joint-poc.mjs` | exit0:15/15,0skip; real Go CLI/FIFO/AFTER, SQL fixture COMMIT explicitly local, no production substitution |
| `node scripts/ci/run-db-integration.mjs` | exit0: two new disposable loopback PG17 clusters, migrations/ACL/security/pool tests and real pre-Stage READY/Stage/COMMIT/FIFO/AFTER scenarios; own cleanup PASS |
| `node scripts/ci/run-checks.mjs security` | exit0, source/workflow/backup synthetic guards,0skip |
| `node scripts/revalidation/verify-part16.mjs` | exit0, static boundaries only |
| `systemd-analyze verify ops/c2/aktau-c2-custodian.service` | exit0; local syntax, not installed activation |
| report prefix / `git diff --check` | exit0; previous operational report byte-equal before append; historical FAIL/BLOCKED preserved |

The two CI fixtures were corrected without weakening assertions: bundle fixture
now takes exact immutable Git-object bytes rather than mixed working-tree bytes;
miniature ops root includes all existing Node tests and an explicit synthetic
Python suite, with independent negative propagation controls for both runners.
No production monitor runtime changed. Source publisher/Go/SQL/frontend/API
remain unchanged. Later checks/deployment evidence must be appended, not inferred
from this checkpoint or old green CI.

### Fresh bounded production inventory, not activation

One sanitized read-only SSH collector exit0 at **2026-10-21T19:34:08.196066Z**:
sync d3a9cc5 clean; API6a4b4c7a91ec471db54987b689c3c87a785523a3 running/healthy,
restart0/OOMfalse; reader0600 UID999/GID987, same dev64770/inode933613;
installed ledger entries0; root deployment/READY absent. Existing installed
approved d3 kit/operator remain inactive. No new production HTTP, publish,
ingest, service change or source update in this source checkpoint.

Next is final source review/gates → normal protected PR/CI/merge → immutable
exact-main build/provenance → Owner-delegated administrative installation with
versioned rollback → real read-only service start/cancel/crash-recovery checks
and existing-timer wiring. Do not call the mechanism enabled until actual unit,
policy, runtime process/READY and cleanup readback proves it. **0/3 remains**.
No Release/tag/draft Release or AUTO_DEPLOY_ENABLED activation is authorized.

Final pre-publication source check: focused custodian **29/29**; complete Python
installer/custodian **82/82**, Node ops **180/180,0skip**, final ops profile exit0.
The added case invokes the real systemd verifier on BOTH the companion and the
composed unchanged daily service plus new drop-in. JS runtime syntax checks
exit0. Go/C2/PG17 results above correspond to the same Node/Go runtime changes;
later edits were custodian/docs/tests only. Repository rules API confirms normal
PR+CI Gate and zero mandatory approving reviewers; legacy branch-protection
endpoint404 is NOT treated as permission to bypass rules. Fresh remote main
still d3a9cc5. Protected source publication and real deployment follow, not a
source-only final result.
