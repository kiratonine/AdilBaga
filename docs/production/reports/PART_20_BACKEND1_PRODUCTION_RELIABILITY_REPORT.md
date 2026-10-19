# Part20 — Backend 1 production reliability sprint

Status: **READY_FOR_EXTERNAL_REVIEW / PART20_SOURCE_READY**.
**ACTIVATION_PENDING; external delivery NOT_VERIFIED; production release BLOCKED.**
Task date2026-10-19. Source software delivered; no production operation performed.

## 1. Baseline and exact scope

Fresh fetch/prune exit0; main/base **4c4d2f0c5533ab85b1f10d4d1fc501bd29bc6195**.
New native-WSL worktree `aktau-part20-backend1-production-reliability`, branch
`feat/part20-backend1-production-reliability`. Target absent before creation.
Other worktrees/main checkout edits preserved; no reset/rebase/stash/clean.

Read complete Owner Part20 task/root instructions and Part19 report/verifier,
deployment validation/build interfaces, alert policy, DB recovery/runbooks and
CI/C2 harnesses. Roadmap/frozen API/OpenAPI/revalidation/release/compose/rollback
inputs previously reviewed in Part19 remain byte-identical: beecb8c→current main
changes only Part19's three accepted files. Historical unprovisioned/e6/Nest
wording is not used as current evidence. Existing equivalents searched: no
monitor/release-admission CLI, only the reused Part19 verifier and broker tooling.

Seven new allowed paths only:

1. `scripts/ops/monitor-go-production.mjs`
2. `scripts/ops/monitor-state.mjs`
3. `scripts/ops/monitor-go-production.test.mjs`
4. `scripts/ops/check-go-release.mjs`
5. `scripts/ops/check-go-release.test.mjs`
6. [Manual monitor/release runbook](../../../ops/monitor/README.md)
7. This report.

State persistence is separated to keep filesystem custody/atomicity testable;
three runtime modules are each under100 lines. No existing source/report edits.
Part19 verifier stays byte-identical; no second endpoint/schema request engine.
No Go/API/DTO, SQL/schema/migration, ingestion/parser/timer, Frontend, C2/HMAC,
deployment/CI/workflow, dependency/lockfile or configuration change.

Accepted historical inputs, **not rechecked**: Go438ecdfa3d386a186dcd8b73c3c10aef5e79dc82
healthy/restart0, deploy-wrapper ABSENT in Part19; startup-only C2 regex runtime
delta does not justify urgent rollout. Backend2 timed daily success and snapshot
541212ba-5c51-485c-91ec-ea78f77c3c39/publishedAt2026-10-19T13:02:26Z/3026canonical/
matched240 remain Backend2-reported. Owner Frontend/Siri acceptance retained.
No teammate request, private-plan ruleset enforcement assumption or flag change.

## 2. Executable monitor and delivery behavior

Default/`--offline` prints only OFFLINE/ACTIVATION_PENDING/requests0/deliveries0;
no config read, state write or network. Explicit `--run` is a future separately
approved non-root operator invocation, **not executed against production**.
It requires valid private receiver/token/state configuration before admission.
Missing receiver emits delivery_not_configured/exit2, not a successful alert.

The default checker is exactly `() => createVerifier()()`: same five fixed GETs,
8s/request/50s shared, bounded bodies, no redirect/retry/credentials or added
public URL. Only the complete five successful typed records count healthy.
Partial/malformed PASS, WAF/transport/schema failure or exception map to fixed
probe_unavailable. No offer-derived snapshotAt is persisted or treated as
publication recency, no uptime/cadence/SLA or snapshot freshness claimed.

| Observation | Durable transition / delivery |
| --- | --- |
| Complete healthy outside incident | OK, failures0 |
| First unsuccessful | DEGRADED, failures1 |
| Second consecutive unsuccessful | INCIDENT, failures2, one incident_opened |
| More failures while incident | INCIDENT, saturated counter, no duplicate open |
| First healthy poll after incident | OK, one incident_recovered; RECOVERED output |
| Pending event exists | Drain only that event, zero new health probes |

Policy candidates: two failures open an incident; failed delivery has60s
persisted cooldown and at most3 attempts across explicit invocations. There is
no scheduler, daemon, polling loop, automatic reset, general queue or unlimited
history. One pending event prevents recovery/open reordering. Monitoring pauses
during receiver outage; DELIVERED drain output is not a fresh healthy observation.
This limitation is explicit rather than inventing recovery during missing probes.

Linux state directory: absolute/normalized, outside source/Git/artifacts/modules,
operator-owned0700; root invocation rejected. Ancestors root/current-UID only,
non-symlink/not writable by others (root-sticky ancestor exception for owned
temporary directories). Directory fd identity rechecked after open, fixed paths
anchored through it. Exclusive0600 monitor.lock serializes whole invocation.
State canonical JSON≤16KiB,0600/one link, fixed enums/counters/UTC times/random ID
only. Unknown fields, corrupt/noncanonical state, unsafe metadata or interrupted
pending file fail closed, not replaced by a healthy default. A fresh directory
is a new monitoring lifetime; deliberate deletion is not automatic recovery.

Atomic save: exclusive0600 temp, complete partial-write loop, file fsync,
rename and directory fsync. Save errors poison the handle and retain interlock.
Attempt/ID/cooldown are durable **before** sending. Crash/stale lock is not
automatically cleared; ambiguous storage requires manual reconciliation. Clock
rollback blocks; forward jumps do not prove elapsed time/health. Normal process
termination can leave an interlock: no claim finally handles SIGKILL/power loss.
Same-UID/root compromise or storage lying about fsync is outside custody proof.

Notifier: one operator-configured canonical HTTPS URL, no userinfo/query/fragment
(even empty delimiters), fixed bearer/idempotency/content headers, validated
token, verified TLS, no proxy agent/cookie/redirect/retry,5s absolute timeout.
No credentials configured/read here; tests use synthetic tokens. Response bodies
are not read/logged; receiver2xx means accepted, not human/downstream delivery.
Payload: type incident_opened/recovered, UTC timestamp, fixed go_api_unavailable
category only. Generated event ID is an idempotency header, not an API identifier.
No URL/token/HTTP data/product/store/voice/search/session/location in state/output.

Exactly-once distributed delivery is **not promised**: crash after receiver
acceptance before local acknowledgement can resend the same key. Receiver
authentication and durable idempotency are activation prerequisites. Exhausted
or ambiguous pending events require Owner reconciliation, no silent deletion.
CLI output is bounded fixed outcome/reason only. Exit0 offline/OK/RECOVERED/
DELIVERED; exit1 DEGRADED/INCIDENT/PENDING; exit2 BLOCKED/config/arguments.

## 3. Offline release admission — deliberately no approval authority

`check-go-release.mjs` default/`--offline`: NOT_VERIFIED/offline_no_inputs,
zero reads/writes/network. Explicit `--check` reads fixed **existing** local
Part15 layout: manifest.json/image.tar/api plus clean-export backend-go/Dockerfile
and go.mod; optional second different-SHA rollback bundle. No new transport
format, backup/config reader, Docker invocation, fetch or root record creation.

Bounds: normalized absolute directories/no symlink ancestors; no-follow regular
single-link files; metadata16KiB, archive256MiB, binary64MiB, recipes64KiB; stable
size/mtime/ctime during read. Strict field/digest/SHA/duplicate-key validation;
optional provenance claims must match existing producer schema/name rules.
Part15 verifyArtifactIdentity reused for LOCAL manifest identity/digest invariants;
auto-build artifactName reused. Exported recipe must equal exact existing local
Git objects for supplied full40 SHA. Git runs read-only, timeout/output-bounded,
no replace objects or lazy fetch; no runtime credentials inherited into that call.

The identity function receives LOCAL claims, **not independent remote image
measurements**. No checksum/label/producer JSON can grant deployment permission.
Valid local consistency returns READY_FOR_OWNER_REVIEW, **production always BLOCKED**.
Saved archive internals/actual tag, built base/toolchain, hosted producer/CI,
root approval/broker, runtime DB/Voice/config compatibility, rollback compatibility
and post-cutover smoke stay NOT_VERIFIED. The checker does not parse/load the
Docker archive or replace sealed-fd/single-use root broker authorization. Even a
self-consistent synthetic non-image remains unauthenticated. This is the allowed
safe read-only actual-schema checker, not a fabricated portable/production proof.

Actual demonstration: existing unchanged Part19 local candidate beecb8c…,
archive SHA c6baa01d02ad80910beb7f77f651aab2940caa791f6a9b2c8837ef5957dcb57d,
passed local hash/metadata/exact recipe review; output production BLOCKED and
all independent gates NOT_VERIFIED. No candidate rebuilt, modified or transferred.
Synthetic negatives reject altered archive/binary hash, wrong/missing SHA/label,
wrong platform/user/entrypoint/layer, recipe/toolchain drift, unknown approval,
symlink/oversize/secret-looking JSON/duplicate keys/invalid provenance. Separate
local rollback consistency is tested but **not** promoted to compatibility PASS.

## 4. Fail-first development and actual test battery

Non-root uid1000; installed Node24.10.0/Go1.27.2/pnpm10.32.1, explicit PATH.
Tests first: both new test entrypoints initially exited1 for missing implementation
modules. This is TDD baseline, not a discovered pre-existing production failure.
First implemented monitor run29 PASS/1 FAIL: a5ms mock deadline raced setImmediate;
made success/error mock callbacks deterministic microtasks, kept timeout assertions
and real5000ms production deadline unchanged. No timeout inflation/retry masking.

Meaningful fail-first regressions against the candidate: repository state-path
test exit1 (one forbidden open); fixed rejection before any open. Later URL/
optional-provenance focused run exit1,5 PASS/5 FAIL: empty query/fragment delimiters
and null/false/0 provenance were accepted; fixed exact validation. Histories not
presented as production bugs. Token line-terminator case already rejected, no
gratuitous change. All regressions retained in final complete suite.

| Actual command / check | Exit / result |
| --- | --- |
| node --test scripts/ops/monitor-go-production.test.mjs scripts/ops/check-go-release.test.mjs scripts/ops/verify-go-production.test.mjs | 0;92/92 PASS,0 SKIP (40 monitor +30 release +22 unchanged verifier) |
| node --check all5 new JS modules/tests | 0 each |
| Monitor --offline; release --offline | 0; zero-network/state defaults |
| Release --check existing Part19 local review candidate | 0; local review ready, production BLOCKED |
| C2_LOCAL_PROBE=owned-temp/relayprobe node --test scripts/revalidation/*.test.mjs scripts/ci/guard.test.mjs | 0;286/286 PASS,0 SKIP;27.371s; local Go1.27.2 helper built first |
| node scripts/revalidation/joint-poc.mjs | 0;15/15 PASS,0 SKIP;14.613s; real CLI/PG17/FIFO, fixture bodies, cleanup PASS |
| node scripts/ci/run-db-integration.mjs | 0; all7 race-enabled integration invocations PASS,6 migrated disposable DBs, cleanup PASS |
| go test -count=1 ./...; go test -race -count=1 ./... | 0 each;15 tested packages each; no-test packages not counted; env-gated live profiles not asserted executed |
| go vet ./...; go tool staticcheck ./...; go tool staticcheck -tags=integration ./... | 0 each |
| go tool govulncheck ./... | 0; no vulnerabilities found at this run |
| node --test scripts/deploy/auto-gate.test.mjs scripts/deploy/verify-part15.test.mjs | 0;52/52 PASS,0 SKIP |
| python3 -B -m unittest discover -s scripts/deploy -p 'auto_*_test.py' | 0;39/39 PASS |
| node scripts/deploy/verify-auto-deploy.mjs; node scripts/deploy/verify-part15.mjs; node scripts/revalidation/verify-part16.mjs | 0 each; static boundaries, not activation evidence |
| node scripts/ci/run-checks.mjs security | 0; source/workflow and1/1 synthetic backup guard PASS |
| node scripts/ci/run-checks.mjs contracts | 0; frozen install/lint PASS;12 schema/static PASS,10 HTTP tests SKIP without origin, not counted as PASS |
| Final scope/history/Markdown links/diff/privacy/archive verification | PASS at artifact handoff |

Monitor tests include actual private disk state/fsync, partial writes, restart
dedupe, cooldown/exhaustion, failed notifier, concurrent invocation, corrupt/
symlink/hardlink/mode/foreign-owner rejection, interrupted rename/fsync, persisted
attempt-before-send, clock rollback, cancellation, real child SIGTERM/interlock,
CLI exits/stderr/default no-I/O, payload/output sentinel non-disclosure and source
no-scheduler checks. One actual loopback HTTP integration uses unchanged verifier
with test-only local transport and existing contract fixtures plus real HTTP
notification framing; drives OK→DEGRADED→INCIDENT→RECOVERED,12 local GET/two local
POST, no external hits. Native HTTPS behavior separately mocked for TLS/timeout/
redirect/error/abort; loopback HTTP is not claimed actual TLS authentication.

Existing C2/Go/DB regressions retained unchanged. The two owned fresh PG17 instances
from DB runner/joint PoC cleaned their resources only; no old container reused.
Joint PoC uses SQL fixture COMMIT, not production ingestion. No Frontend E2E
repeated; full ephemeral staging NOT_RUN here (no Go/API/Frontend runtime changes;
prior parity accepted, new functionality covered by local ops integration).

## 5. C2, operational follow-up and review artifact

C2 source remains separate from public Go Docker rollout: existing supervisor/
private production factory, independent binary/source/deployment approval,
restricted reader/FIFO/ledger custody, BEFORE before canonical mutation, actual204,
qualified AFTER and post identity/cleanup. Three qualified legitimate-publication
PASS≤5s remain OPEN;21 GET/2 sitemap/20s diagnostics unchanged. No artificial
snapshot, bypass of fixtureOnly, install or real observer executed.

Next after independent source review: Owner separately chooses authenticated,
idempotent private receiver and approved non-root environment/state provisioning;
decides a reviewed invocation cadence/launcher (none created), then authorizes
bounded first real alert/recovery receipts. Real delivery remains NOT_VERIFIED.
Go release still requires trusted exact hosted artifact/approval, approved release
route and compatible rollback/application Voice gates; absent broker not installed.
Recovery/monitoring/legal and latest matching backup evidence remain independent.

New clean full-stack archive through unchanged script, unique ignored copy:
`artifacts/adilbaga-part20-backend1-production-reliability-20261019.tar.gz`.
Final SHA256 provided in handoff, not self-embedded. Verify safe unique regular
members, all-file/source/report byte-match, no Git/TODO/env/dependencies/builds/
test outputs/logs/private state/binary/images/backups/keys. Existing reports and
unrelated sources unchanged. Required new ops test commands are explicit above;
unchanged hosted CI does not automatically add these new test files to its profiles.

Commit/push only own seven-path branch and Draft PR after gates/main check;
head/URL/hosted CI supplied separately, never preclaimed PASS. **Zero production
SSH/HTTP/SQL/Redis, alert/webhook delivery, secrets/settings/services/timers,
ingest/publish/backup/restore/deploy/rollback or merge. AUTO_DEPLOY_ENABLED unchanged.**
STOP for one independent Code Review; source merge would not activate monitoring.
