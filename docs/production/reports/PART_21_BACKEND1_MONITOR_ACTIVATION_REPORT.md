# Part21 — Backend1 monitoring activation kit

Date: 2026-10-19. Source status: **READY_FOR_EXTERNAL_REVIEW**.
Live activation: **BLOCKED_ON_REAL_RECEIVER / NOT_PERFORMED**.

## Baseline and boundaries

- New native-WSL worktree `aktau-part21-monitor-activation`, branch
  `feat/part21-monitor-activation`.
- Fresh fetched base: `6b20fc03dcbe4da4f492890fc08bc017bf43fa41`;
  merged Part20 commit `8acab7b60be1bc6fd293370f7d2e475560617761` is its ancestor.
- Part19–20 monitor, state custody, verifier, notifier and release checker are
  reused byte-identically. No Go, Frontend, C2, DB, ingestion, deployment runtime,
  dependency, credential or production configuration change.
- No production HTTP/SSH/SQL/Redis, actual notification, service installation,
  timer activation, Go API image build/rollout, backup decrypt/restore or settings change.
  Local HTTPS fixtures and disposable PostgreSQL17 are not production evidence.
- Owner-accepted Frontend, physical Siri and Backend2 publication evidence is
  retained without re-testing or contacting those participants. Historical
  Go438 health and absent deploy wrapper are not re-observed here.

## Deliverable A — mandatory CI integration

Existing Security job now executes `node scripts/ci/run-checks.mjs ops` on
Node24. The new profile runs all92 existing Part20 cases and18 Part21 cases.
It checks the installed OpenSSL prerequisite; it never installs dependencies.
The existing runner has bounded subprocess output/deadline and propagates
nonzero exits. Nine fixed mandatory names, CI triggers/permissions, deployment
eligibility and auto-deploy guards are unchanged.

Two regression boundaries are exercised: exact workflow job identity and
unconditional Security step; actual copied CI runner/common in a miniature owned
test repository. Its positive fixture exits0, then a deliberately broken suite
exits nonzero with the expected synthetic assertion. No assertions, skips,
retries or allow-failure steps hide that failure. The new workflow/profile
contract was checked before its implementation, then passed after wiring it.

Hosted exact-head CI and proof of the Security ops step are publication gates,
not inferred from local results. They are recorded in the final PR handoff
after publication; this pre-publication report does not claim future CI success.

## Deliverable B — persisted process / HTTPS lifecycle

`monitor-lifecycle.test.mjs` adds only test fixtures, not a receiver runtime.
It creates an owned0700 temporary directory, ephemeral EC certificate/private
key0600 outside Git, and HTTPS listener bound only to127.0.0.1. Each monitoring
cycle is an independent Node24 process importing the unchanged real monitor,
state store and verifier. Test-only verifier transport maps the existing fixed
requests to that owned HTTPS fixture. Native TLS verification stays enabled;
the fixture CA is injected only in test requests, never globally or in source
runtime configuration.

Verified boundaries:

- Healthy → degraded → incident → repeated failure → recovered → healthy:
  exactly one open and one recovery, no duplicate notice.
- Real untrusted TLS rejection before HTTP acceptance; wrong bearer401 and no
  durable receipt. Authenticated receiver persists/fsyncs its receipt before ack.
- Lost reply after durable acceptance retains pending state; cooldown makes no
  GET/POST; a later process reuses the same ID. Receiver reads its durable file,
  deduplicates and does not redeliver, then recovery follows in order.
- Non2xx delivery, three-attempt exhaustion and stop-on-reconciliation:
  restoring receiver availability alone cannot reset attempts or resume probes.
- Real unchanged5000ms HTTPS timeout after acceptance: ambiguous false result,
  one request, no transport retry. No short TLS-handshake timing assumption.
- Attempt persisted before send; concurrent process blocked with0 GET/POST;
  SIGTERM after receipt leaves crash lock and pending attempt. Next process
  remains blocked with0 GET/POST, requiring private manual reconciliation.
- State/CLI output excludes fixture URL/token/auth/product sentinels.0700/0600
  permissions checked. Child processes, sockets and only owned temporary files
  are cleaned up by tests. No private key or runtime state enters the archive.
- Existing retained suites cover default CLI offline0 I/O and missing receiver
  rejection before probes/state. No replacement CLI or monitoring engine.

A2xx is **receiver acceptance**, not independent human/downstream receipt.
Distributed exactly-once delivery is not claimed. Monitoring pauses while an
event is pending; crash/exhaustion is not silently repaired.

## Deliverable C — inactive systemd kit

Two templates and one small offline strict renderer are provided, not installed.
Only validated account, root-controlled Node path and full-SHA source path are
substituted. Renderer writes two exclusive0600 files in an explicit fresh owned
0700 directory outside Git; it rejects unsafe values, symlinks, nonprivate or
nonempty output. Default renderer performs no writes. No shell interpolation,
credential access, command execution or activation is hidden in the renderer.

Service: non-root Type=oneshot, private root-managed EnvironmentFile, UMask0077,
empty capabilities, no new privileges, strict filesystem with only state writable,
home/device/kernel restrictions, group termination, no restarts.70s start bound
covers verifier50s + notifier5s + storage margin;5s stop bound. Exit1 is a
completed unhealthy/pending observation; exit2 is a failure, neither an invented
healthy result. No V8-incompatible executable-memory restriction is introduced.

Timer candidate:5min after inactivity, Persistent=false, no overlap/catch-up.
No API, sync or C2 timer is touched. Cadence is a proposed Owner policy, not an
asserted production SLA.

Expanded templates passed real `systemd-analyze verify --root=OWNED_FIXTURE_ROOT
--man=no aktau-go-monitor.service aktau-go-monitor.timer`. The synthetic root
contains only test targets and a copy of the current Node24 executable. It is
not a service start/chroot, installed account check or proof of VPS compatibility.
An initial direct-host validation failed because this NVM-only WSL has no
`/usr/bin/node`; the test was corrected to use this isolated filesystem instead
of installing Node or weakening the template. Final tests all pass.

The [monitor runbook](../../../ops/monitor/README.md#part21-activation-permission-packet--not-executed)
contains the one-pass future permission packet: exact paths/custody, source and
Node verification, private env injection, render/verify/install, first manual
one-shot, bounded synthetic open/recovery against Owner-controlled TEST receiver,
independent receipt, conditional timer enable and disable/reconciliation.
Its commands have **not** been executed. No actual user, Node VPS path, receiver,
recipient, token or SSH profile is invented.

The alert policy's obsolete unprovisioned-VPS claim is narrowly superseded with
a Part19 citation; active monitoring is explicitly not inferred from API health.

## Deliverable D — unchanged release/rollback and C2 boundaries

Existing accessible immutable local Part19 bundle was checked with:

```bash
node scripts/ops/check-go-release.mjs --check LOCAL_PART19_BUNDLE beecb8c11219c7863f0c7722a8b4fdaaedfd72a5
```

Exit0: READY_FOR_OWNER_REVIEW / local_consistency_only; **production BLOCKED**.
No new artifact was built. Candidate source recipe and local bytes match;
rollback bundle/compatibility, hosted artifact identity, remote transport, root
approval/broker, live configuration/DB/Voice and cutover smoke remain NOT_VERIFIED.
The local bundle path is deliberately not a portable artifact or production
authorization. Private state/backups are not read.

These external Node tools do not require a Go Docker rollout. AUTO_DEPLOY_ENABLED
remains absent/false by policy, not freshly queried here. C2 production three
qualified legitimate-publication <=5s measurements remain **OPEN**. Only existing
local regressions/PoC were executed, not a new production observer or publication.

## Executed checks

Node24.10.0, Go1.27.2, non-root Linux uid1000; existing OpenSSL3.0.13 and
systemd-analyze255. Commands used RTK proxy; no production secrets supplied.

| Command / check | Exit | Actual result |
| --- | --- | --- |
| `node scripts/ci/run-checks.mjs ops` | 0 | 110/110 PASS,0 SKIP; includes92 retained +18 new |
| `node scripts/ci/run-checks.mjs security` | 0 | Source/workflow policy PASS; backup synthetic guard1/1 |
| `node --test scripts/deploy/auto-gate.test.mjs scripts/deploy/verify-part15.test.mjs` | 0 | 52/52 PASS |
| `python3 -B -m unittest discover -s scripts/deploy -p 'auto_*_test.py'` | 0 | 39/39 PASS |
| `node scripts/deploy/verify-auto-deploy.mjs` | 0 | Static boundaries PASS, not deployment acceptance |
| `node scripts/deploy/verify-part15.mjs` | 0 | Static deployment boundaries PASS |
| `node scripts/revalidation/verify-part16.mjs` | 0 | Static Part16 boundaries PASS |
| `C2_LOCAL_PROBE=OWNED_TEMP_RELAYPROBE node --test scripts/revalidation/*.test.mjs scripts/ci/guard.test.mjs` | 0 | 286/286 PASS,0 SKIP; existing relayprobe built locally with Go1.27.2 |
| `node scripts/revalidation/joint-poc.mjs` | 0 | Existing local Go/FIFO/Node/PG17 PoC15/15 PASS,0 SKIP; owned PG cleanup PASS |
| `node scripts/ci/run-db-integration.mjs` | 0 | Disposable PG17/migrations/restricted C2 and integration profile PASS; cleanup PASS |
| `cd backend-go && go test -count=1 ./...` | 0 | All packages PASS |
| `cd backend-go && go test -race -count=1 ./...` | 0 | All packages PASS |
| `cd backend-go && go vet ./...` | 0 | PASS |
| `node --check` each changed JS file | 0 | CI runner, lifecycle tests, renderer syntax PASS |
| Default monitor and renderer `--offline` | 0 |0 requests/deliveries; no installation |
| `git diff --check`, exact scope, Markdown links, bounded privacy scan | 0 | PASS; no excluded source changes |

No SKIP is counted as PASS. Earlier fixture validation failure is retained above;
the final ops invocation is the successful corrected result, not a reused old log.

## Exact changed paths and review artifact

1. `.github/workflows/ci.yml` — one mandatory Security ops step.
2. `scripts/ci/run-checks.mjs` — bounded Node24 ops profile.
3. `scripts/ops/monitor-lifecycle.test.mjs` — process/TLS/CI/unit-kit regressions.
4. `scripts/ops/render-monitor-units.mjs` — offline strict renderer.
5. `ops/monitor/systemd/aktau-go-monitor.service` — inactive template.
6. `ops/monitor/systemd/aktau-go-monitor.timer` — inactive template.
7. `ops/monitor/README.md` — runnable future activation/receipt/reconciliation packet.
8. `docs/production/OBSERVABILITY_ALERT_POLICY.md` — bounded dated factual correction.
9. This report — consolidated Part21 evidence.

Clean full-stack review archive is created with the unchanged repository script:
`artifacts/adilbaga-part21-backend1-monitor-activation-20261019.tar.gz`.
It includes current source/report; SHA256 and verified regular-member count are
provided in the final handoff, outside the archive to avoid a circular digest.
Safe unique members, source byte-match and absence of secrets/private keys/state,
Git/TODO/dependencies/builds/logs/backups are mandatory before publication.
All other tracked source, previous reports and archive script match the base.

## Remaining real activation gates

1. Owner selects/provisions authenticated HTTPS receiver and downstream channel;
   durable idempotency and independent open/recovery receipt must be evidenced.
2. Owner approves exact non-root account, root-controlled Node24/source install,
   private env/state custody, new unit paths and cadence in the single packet.
3. Separately authorized bounded install, manual check and test-receiver receipt
   E2E must pass before timer enable. None is authorized/executed in this sprint.
4. C2 production acceptance and any Go release/rollback remain separate gates;
   local monitor/CI tests cannot close them. No Frontend/Backend2 re-acceptance.

Source sprint is ready for one independent Code Review. No merge or production
activation is authorized by the Draft PR or by passing hosted CI.
