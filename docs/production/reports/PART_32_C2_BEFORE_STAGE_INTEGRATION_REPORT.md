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
