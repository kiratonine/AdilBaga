# C2 READY admission budget fix — 2026-10-24

## 1. Status and baseline

Source-only candidate **LOCAL_QUALIFIED**; publication/hosted exact-head CI results
are appended below. Final target: READY_FOR_INDEPENDENT_REVIEW, not production PASS.

- TASK: `C2-READY-BUDGET-20261024`; Owner explicitly approved the source-only
  READY admission ceiling change **2000 → 5000ms**. No merge/deploy approval.
- Fresh `origin/main` / source base: `44bea0a3af6ccb18ce0ef7073bda80d4275cd3f9`.
- Branch: `fix/c2-ready-admission-budget`.
- Native WSL worktree: `/home/denis/tmp/aktau-c2-ready-budget-fix-20261024`.
- Original Windows checkout and other worktrees were preserved.
- Actual tools: Go1.27.3 linux/amd64, Node v24.18.0; no dependency/lockfile upgrade.
- Fully read the assigned TASK, root rules/RTK, diagnostic report and Backend2 report.
  Diagnostic input: `C2_REQUEST_READY_NOT_ARMED_DIAGNOSTIC_REPORT_20261024.md`,
  SHA256 `9ca7e5aa64b28ef6a9f747296740f01dd8ea96dd773fcb21dd0486cc5259a5e5`.
  Its source/production evidence is historical input, not newly collected here.

The precise historical rejecting branch remains UNKNOWN. The diagnosis found
ready_consumed for the same retained READY/claim attempt, so a pre-connect-only
explanation is incomplete. This fix addresses a reproduced deadline mechanism
and adds safe classification for a later natural run; it does not retrospectively
prove the cause or claim that production C2 is repaired.

## 2. Explicit operational contract change

Previous `ops/c2/README.md` described **1500ms total IPC budget**, below the
**approved2000ms ceiling**. This candidate explicitly replaces that with:

| Contract | Candidate behavior |
|---|---|
| Go READY admission | Exactly5000ms maximum; one shared context for files/proc and exchange |
| Parent deadline/cancellation | Always authoritative; earlier parent deadline wins |
| Go helper post-accept | Same5000ms ceiling, capped by remaining original parent lifetime |
| Client residual time | Helper allowance never restores time already spent by client |
| Node startup | Existing1500ms until first listening frame unchanged |
| Original ingest/root lifetimes | Ingest5min, root/supervisor35min unchanged |
| C2 convergence | **5s AFTER actual accepted signed HTTP204 unchanged** |
| Observer limits | 20s diagnostics,21 GET/2 sitemap,6 representations unchanged |
| Acceptance series | Three genuine qualified consecutive PASS; no synthetic acceptance |

This is a bounded candidate, not a measured production p99. Optional pre-Stage
admission can now delay ordinary ingestion up to5s instead of1.5s. Timeout or
validation failure still only excludes C2; no extra apply or notification is added.

## 3. Exact source/test scope

| Path | Purpose |
|---|---|
| `backend-go/internal/revalidation/ready.go` | Reviewed5000ms constant, private typed diagnostic enums/value snapshot and compatible class-only wrapper |
| `backend-go/internal/revalidation/ready_linux.go` | Atomic phase observation, typed finite rejection reasons, one worker/deadline, monotonic deadline recheck and existing validation predicates |
| `backend-go/internal/revalidation/ready_other.go` | Required portable stub for new detailed entrypoint; unsupported stays fail-closed |
| `backend-go/internal/revalidation/ready_server_linux.go` | Explain shared reviewed ceiling and original parent cap; existing server logic uses the same constant |
| `backend-go/internal/revalidation/ready_linux_test.go` | Deadline/cancellation/late-worker snapshots, reason privacy, peer/record/response/socket negatives |
| `backend-go/internal/revalidation/ready_server_linux_test.go` | Actual accepted-window timeout, shorter parent/cancel, valid but late answer rejected, owned cleanup |
| `backend-go/internal/revalidation/ready_budget_qualification_test.go` | Explicit full-sized ELF/real Go-helper/Node qualification, separate build tag |
| `backend-go/cmd/ingest/main.go` | One safe log immediately after detailed admission and BEFORE Stage; old post-Stage class/baseline log retained |
| `backend-go/cmd/ingest/main_test.go` | Required ordering assertion update and actual structured logger privacy test |
| `ops/c2/README.md` | Explicit admission ceiling, timing boundaries, diagnostics/privacy/late-worker semantics |
| `scripts/ci/run-checks.mjs` | Run full-size tagged qualification in Go Quality with actual2-CPU affinity; no workflow/credential/config changes |
| This report | Single fix report, incremental factual validation/publication evidence |

No Node production module, peer identity implementation, HMAC, publisher/promotion
executor, launcher, scraper, SQL/schema/migration, API DTO, frontend or Siri changed.
New test dependencies are package-private function arguments; the public detailed
entrypoint has fixed production loaders/exchange. No exported factory, path/UID,
approval, env or synthetic-production override was introduced.

## 4. FAIL-FIRST before the budget fix

Initial unchanged baseline READY group passed under Go1.27.3.
Then the new tagged shared-window regression was added while ReadyBudget was
still1500ms. Production code had not yet been edited. One baseline reproduction:

```bash
# backend-go, native WSL; SDK/Node24 on PATH
GOTOOLCHAIN=local GOMAXPROCS=2 taskset -c 0,1 go test -count=1 \
  -tags=readyqualification -run '^TestReadyLargeELFSharedDeadline$' -v ./internal/revalidation
```

**Exit1, expected failure:**

```text
full_size_client_ms=1500 admission_ms=1438 budget_ms=1500
fixture_only=true production_authority=false
valid full-size shared-deadline READY rejected; expected armed
FAIL TestReadyLargeELFSharedDeadline
```

This is a behavioral failure, not a compilation error or skipped test. The parent
checkpoint was received and the helper's owned socket was cleaned. The test did
not substitute a production READY, provider registry, approval or publication.

## 5. PASS-AFTER and qualification boundary

The same shared-window test and inputs passed with ReadyBudget5000ms. Full-sized
work includes actual ELF bytes: local Node executable, freshly compiled relay,
and the Go test executable used as a synthetic self-ELF, padded if necessary to
the reference minimum sizes123655872 /11179430 /16477035 bytes. The supervisor
module is the actual source. All admission bytes are read and SHA256-checked,
not replaced by a declared hash. Added800ms admission and800ms responder latency
model scheduling/work overhead deterministically, without relying on random CPU load.

Actual Go serveReadySocket/PeerIdentity helper and Node openReadyRelay run over
a private Unix socket. The Node callback independently reads/hashes the full
Node fixture and module, verifies the actual test peer PID/UID/GID and writes a
checkpoint before a canonical READY-v2. Delivered is required for positive cases;
the ticket's baseline must bind only once. No DB, FIFO event or HTTP is needed.

The second tagged case drives the **same package-private client core used by
RequestReadyDetailed**, with synthetic root/proc dependencies, actual full-size
hashing and the same real Unix client/helper/Node exchange. Production's fixed
root authority paths/OS identity are not forged. The existing private test peer
branch is explicitly used in these nonroot fixtures; this is not a complete
production-root attestation test or a true production ingest executable run.

All client/helper/Node/build descendants inherit **two actual allowed CPUs** via
taskset; GOMAXPROCS2 is additional, not the sole resource limitation. The CI
profile discovers two CPU IDs from its real allowed mask, not hardcoded VPS CPUs.

| Round | Shared client wall | Admission | Full client-core result |
|---|---:|---:|---|
| First PASS-AFTER | 2596ms | 1416ms | armed,2506ms including cleanup |
| Go profile checkpoint | 2442ms | 1295ms | armed,2438ms including cleanup |
| Final Go profile | 2833ms | 1512ms | armed,2577ms including cleanup |

All are below5000ms. These limited local samples are **not production p99**, nor
proof under every CPU/IO load. Stronger contention may still cause a truthful
not_armed. No timeout was increased beyond5000ms to obtain a passing result.

## 6. Safe terminal diagnosis

RequestReady remains a class-only compatible wrapper. RequestReadyDetailed returns
a ticket plus a value-only ReadyDiagnostic; its fields and enum constructors are
private. Only fixed strings, bounded elapsed and a boolean can reach logging.

The atomic progress phase is read once for the terminal snapshot when timeout or
worker completion wins. It is the observed phase at that decision, not a claim
of exact kernel operation time. Worker updates cannot rewrite the returned copy.
No worker logs or asynchronous telemetry pipeline exists. A buffered result lets
a late worker finish without blocking Stage, but it cannot start a new IPC after
expired admission or grant a late ticket. Parent/monotonic checks also reject a
deadline whose context timer has not yet been scheduled under CPU contention.

Fixed phase values:

```text
opt_in, authority_read, authority_validate, hash_node, hash_relay,
supervisor_identity, hash_supervisor, self_identity, socket_check, connect,
peer_check, authority_recheck, request_write, response_read,
response_validate, socket_recheck, complete, unsupported
```

Fixed reason values:

```text
rejected, disabled, configuration_invalid, authority_unavailable,
authority_invalid, lifetime_invalid, boot_mismatch, file_invalid,
hash_mismatch, process_identity, socket_invalid, transport_error,
peer_rejected, authority_changed, socket_changed, nonce_unavailable,
response_invalid, deadline, parent_deadline, cancelled, ready, unsupported
```

Outcomes remain `armed`, `not_armed`, `disabled`. The later `baseline_mismatch`
class remains at the existing post-Stage S0 binding point. Additional log fields:
`phase`, `reason`, `outcome`, `elapsed_ms` clamped0..5000 and
`deadline_or_cancelled`; ordinary timestamp/level/message metadata is retained.

The new `c2_ready_admission` log is emitted exactly once immediately after the
optional call and before Stage, only when FIFO opt-in was present. `c2_ready`
after Stage remains to report locked-baseline binding. Thus Stage duration no
longer masquerades as the admission completion timestamp. `ready_consumed` still
does not imply delivered, a ticket, event_consumed, notification or PASS.

Privacy assertions exercise the real ingest logging helper with synthetic private
input and verify the exact key allowlist. Error text is never copied; typed
rejections map to fixed reasons and unknown errors map to `rejected`. No PID,
nonce, source hash, dynamic path, raw READY, credential, authority/payload, price
or coordinate is emitted. Existing logs outside this narrow path are untouched.

## 7. Trust, cancellation and ordinary publication safety

- All root ancestry/no-follow/regular/owner/mode/link/size and final stat checks
  remain; full Node, relay, module and actual-self cryptographic verification remains.
- Node and relay digest failures are now classified at their own hash stages;
  a bad Node hash may reject earlier, never skip a check to admit success.
- Actual SO_PEERCRED, UID/GID, protected process/root proc owner, start ticks,
  command, executable, parent, boot and TracerPid checks remain.
- Canonical v1/v2, policy/source/boot/nonce/S0/time/lifetime checks, authority
  rereads, socket inode rechecks and one-use baseline are retained.
- One child context, one worker, one Unix exchange; no retry or additional apply.
  The caller never waits for a noncancelable filesystem worker after timeout.
  Such work can finish later, but its result is not externally authorized/logged.
- Server uses the original parent35min cap; even valid late parent answers are
  rejected and owned socket cleanup is verified. No fresh observation window.
- Ordinary Stage uses the original ingest parent context, not the canceled READY
  child. Stage/Publish/notification/trace code and launcher dry-run/apply logic are
  unchanged. API/HMAC semantics and public contracts are unchanged.

## 8. Local validation results

Every listed PASS was actually executed; exit0 unless the baseline FAIL above.
Existing test fixtures do not count as production evidence.

| Command/profile | Result |
|---|---|
| `go test -count=1 -run '^(TestReady\|TestSiteContentReady)' ./internal/revalidation`, baseline | PASS |
| `go test -count=1 ./internal/revalidation` | PASS,11.136s final focused run |
| `go test -race -count=1 ./internal/revalidation` | PASS,12.249s final focused run |
| `go test -count=1 ./internal/revalidation ./cmd/ingest` | Both PASS |
| `go vet ./internal/revalidation ./cmd/ingest` | PASS |
| `node scripts/ci/run-checks.mjs go` | PASS: full Go unit/race/vet, module verification, staticcheck default/integration, govulncheck, API/ingest/probe compile |
| Go profile heavy qualification | Both tagged2CPU cases PASS; no skip |
| `go tool staticcheck -tags=readyqualification ./internal/revalidation` | PASS |
| Go profile Node C2 + guard suite, actual local relay | **357/357 PASS,0 SKIP** |
| `node --test scripts/revalidation/c2-production-supervisor.test.mjs` | **34/34 PASS,0 SKIP** |
| `node scripts/ci/run-checks.mjs ops` | Python C2 **122 PASS**; Node ops/HTTPS **184/184 PASS,0 SKIP** |
| `node scripts/ci/run-checks.mjs security` | PASS; synthetic backup guard1/1 |
| `node scripts/revalidation/verify-part16.mjs` | PASS, static only |
| `node scripts/ci/run-db-integration.mjs` | Full disposable PG17 profile PASS; own resources cleaned |
| Formatting / JS syntax / diff / links / bounded privacy | Final integrity results appended before publication |

The DB runner created its own loopback PG17, applied existing fixture migrations,
validated restricted readers/roles, pool/security/performance regressions, and ran
actual Go↔Node BEFORE/READY/Stage/COMMIT/FIFO/AFTER cases. Both legacy and site-policy
healthy cases passed with6 fixture GET; intervening/stage/publish/notification
failures remained INCONCLUSIVE/0 GET as expected. No live DSN or production SQL.

New/default negatives include timeout at the actual5000ms ceiling, parent shorter
deadline, cancellation during hash and response wait, late worker returning a
ticket, immutable terminal snapshots, safe typed/unknown errors, wrong UID/GID,
wrong/non-dumpable peer branch, socket permission, changed authority, malformed/
duplicate/unknown/oversized/trailing responses and source/boot/expiry/nonce drift.
Existing real Linux non-dumpability/peer/socket/cleanup and canonical v1/v2 tests
remain. Ops launcher tests retain success/stale/failure/no-second-apply behavior.

Default builds do not compile the explicitly tagged full-size test; the Go CI
profile separately executes it. No skipped heavy profile is represented as PASS.
Unconfigured production/DB-tagged tests are not a substitute for the actual
disposable DB profile above. Frontend/Nest full local suites are not rerun for
this Go-only runtime diff; mandatory hosted CI still includes those jobs.

## 9. Risks, deployment handoff and strict stop

The historical refusal is still not proven to be solely timeout. Later safe
telemetry on a **natural** run must distinguish response/peer/authority/deadline
causes. The local full-size fixtures do not mint real root provenance and do not
measure actual Supabase/VPS/scheduler pressure. Five seconds is a ceiling, not a
promise that every host load succeeds. Node's synchronous responder rehash still
exists; streaming/caching would be separate reviewed work, not silently included.
PackageKit/unattended-upgrade interruption remains a separate maintenance issue;
this patch does not change OS restart policy.

After independent review only: Owner decides merge, exact-main CI9, fresh immutable
full C2 kit/ingest/provider/source records from that exact source and independently
authenticated coupled promotion with preserved rollback. Do **not** replay the
spent initial approval/--initial-reviewed or hand-edit source/hashes. Preserve
the current Dina publisher, reader/ledger/history, HMAC and existing services.
Only real post-deployment evidence can establish three qualified convergence PASS.

This task: **NO MERGE; NO PRODUCTION DEPLOY; NO SSH; no VPS/DB/root authority/env/
timer/secret changes; no artificial production sync/ingest/publication; no flags,
GitHub Release/tag or manual workflow dispatch. C2 convergence still unverified.**

## 10. Review artifact

Use the existing `scripts/create-clean-archive.mjs full-stack`; retain a unique copy
`artifacts/adilbaga-c2-ready-budget-fix-20261024.tar.gz`. The final TAR must include
the current branch source and this report, exclude .git/TODO/artifacts/.env/private
material/dependencies/builds/test outputs, and byte-match every included source.
The final artifact SHA256 is reported externally to avoid a self-referential
archive/report checksum. Archive creation/verification evidence is appended below.

## 11. Final local integrity and publication gate

Final local checks: exact 12-path scope PASS; no existing reports changed;
Markdown local links PASS; bounded private-key/token/credential-URL scan PASS;
`git diff --check` exit0. The additional delayed-context-timer regression passed
under `go test -race -count=1 -run '^TestReadyDeadlineDoesNotWaitForContextTimer$'
./internal/revalidation` (exit0): an elapsed parent deadline cannot be treated
as available time merely because its context timer has not fired yet.

All local gates described above completed before publication. Hosted exact-head
results remain a separate gate and are recorded through the PR checks below.
