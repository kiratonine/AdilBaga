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
