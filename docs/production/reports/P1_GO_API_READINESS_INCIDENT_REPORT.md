# P1 — Go API Readiness 503 Incident

Date: 2026-10-20. Source candidate: **READY_FOR_EXTERNAL_REVIEW**. Production: **PENDING_PRODUCTION_DEPLOY**. RCA: **LIKELY_NOT_PROVEN**, not a confirmed cold-Supabase diagnosis.

## Baseline and scope

- Fresh main/base: `0095d9951f79d64c7ef9145344b0a1dd6a78867b`.
- Branch: `feat/p1-go-readiness-budget`; native WSL worktree `/home/denis/tmp/aktau-p1-go-readiness-budget`.
- Owner incident TASK was read in full from the primary checkout; root AGENTS, roadmap, current API/pool/tests, monitor, deployment policy, CI and incident/rollback runbooks were inspected. Historical runbook release and monitoring statements are not current production evidence.
- Exactly five changed paths: [server.go](../../../backend-go/internal/httpapi/server.go), [server_test.go](../../../backend-go/internal/httpapi/server_test.go), [pool.go](../../../backend-go/internal/postgres/pool.go), [pool_test.go](../../../backend-go/internal/postgres/pool_test.go), and this report.
- No change to API DTOs, DB/roles/schema/migrations, ingestion, Part32/C2, frontend, Telegram, Docker healthcheck, systemd, credentials or dependencies.

## Evidence and RCA boundary

| Classification | Evidence | What it does not prove |
| --- | --- | --- |
| Jira-reported | Owner TASK reports ready503 around 10:55:46 and 11:00:50 +05, about 2s each, recovery by 11:05:57; live200; Supavisor idle closures around 10:52–10:53 followed by reconnects. | Raw provider/Ping timing, exact failure phase or public catalog outage. |
| BLOCKED_INPUT | Connected Jira search was attempted, but the Atlassian app returned not connected. Owner-supplied TASK is the available Jira evidence; no authorization flow was started. | No independent Jira attachment/provider-log inspection. |
| OBSERVED | One strict-host-key SSH session, exit0, approximately 1610ms including SSH. Monitor journal contains DEGRADED at **05:55:46.800713 UTC / 10:55:46.800713 +05**, INCIDENT at **06:00:51.628269 UTC / 11:00:51.628269 +05**, RECOVERED at **06:05:57.832869 UTC / 11:05:57.832869 +05**. | Journal outcomes have no raw dependency error, readiness HTTP status or probe-duration detail. Do not equate them to independent ready503 measurement. The reported second timestamp differs by roughly one second. |
| OBSERVED | Earlier and later journal observations were OK; observed intervals are about five minutes. All three queried timers are loaded/active/waiting/enabled. Container StartedAt `2026-10-12T19:54:48.042676037Z`, RestartCount=0, OOMKilled=false. | No independent historical timer execution overlap audit or exact installed monitor executable/source digest proof. |
| SOURCE_CONFIRMED | Readiness and physical connect budgets were 2s; MinConns=0, MaxConns=4; per-physical-connection read-only and production identity initialization; readiness discarded Ping errors. | Whether a physical connection was absent, slow, rejected, saturated or stale during the incident. |
| HYPOTHESIS — LIKELY_NOT_PROVEN | A fresh TCP/TLS/authentication/session-policy/identity/Ping path can exceed a 2s end-to-end budget. Jira timing is consistent with this, but DNS/network/pooler/session-policy/identity failure and pool saturation remain alternatives. | TCP-only RTT is not a total connection-path measurement. Healthy live or provider status does not prove DB-backed API availability. |
| BLOCKED_INPUT | **COLD_CONNECT_UNMEASURED_INPUT_BLOCKED**: no independently approved read-only diagnostic handle was supplied. No credentials were searched/read, no API/ingest DSN was reused, and no new production DB connection was made. | No direct Kazakhstan→Supabase cold-connect measurement; no confirmed production RCA. |

No public production HTTP request was performed. No raw journal, Supabase identifiers, addresses, DSNs or credentials were retained in this report.

## Bounded read-only VPS preflight

Exactly **one** SSH connection through `my-vps`; no retries. Flags: `-T`, BatchMode=yes, StrictHostKeyChecking=yes, ForwardAgent=no, ForwardX11=no, ClearAllForwardings=yes, ProxyCommand=none, ProxyJump=none, ControlMaster=no, ControlPath=none, ConnectTimeout=8. Local overall timeout65s. Remote Python ran three fixed argv arrays, without `shell=True`, with `sudo -n timeout --signal=TERM --kill-after=2s 15s` and a 19s subprocess bound per operation:

1. `journalctl -u aktau-go-monitor --since '2026-10-20 10:40:00 +05' --until '2026-10-20 11:30:00 +05' --no-pager -n 100 -o json` — exit0. Projected only timestamp and finite safe monitor outcome/reason fields from JSON messages; other messages suppressed.
2. `systemctl show aktau-go-monitor.timer aktau-sync.timer aktau-sync-full.timer -p LoadState -p ActiveState -p SubState -p UnitFileState -p TimersMonotonic` — exit0. Only safe state properties and a cadence-presence boolean were emitted. That boolean alone does not identify which timer has that cadence; monitor cadence evidence is the journal sequence, not a claim that installed units byte-match source.
3. `docker inspect --format '{{.State.StartedAt}} {{.RestartCount}} {{.State.OOMKilled}}' adilbaga-api` — exit0. Only the three permitted metadata fields were emitted.

Remote stdout was sanitized JSON; stderr suppressed. No docker exec, environment dump, service/config write, Supabase log access, credential access or API probe occurred. This preflight does not independently establish current image SHA or upstream proxy deadlines.

## Minimal mitigation decisions

| Setting/behavior | Before | Candidate | Rationale / limitation |
| --- | --- | --- | --- |
| Handler readiness end-to-end timeout | 2s | **5s** | Accommodates a healthy 4.5s simulated cold path; still returns503 on dependency timeout. Not a guarantee of readiness within5s under arbitrary load. |
| Physical connection timeout | 2s | **5s** | Avoids retaining an earlier physical-connect ceiling below the handler allowance. Does not guarantee AfterConnect/Ping complete within the same period. |
| MinConns / MaxConns | 0 / 4 | **0 / 4 unchanged** | Preserve zero-DB lazy startup and avoid introducing permanent connections/cost without a measured cause or capacity evidence. MinConns=1 was evaluated, not bundled blindly. |
| HealthCheckPeriod / MaxConnIdleTime | pgx defaults 1min / 30min | Unchanged; explicitly regression-pinned | A pool floor would replenish asynchronously and can dip below its minimum; it is not a guarantee against pooler idle closure or503. |
| Session initialization and identity | Separate bounded2s checks | Unchanged | Keep SET/SHOW read-only and timeout proof and exact production role/membership/ownership checks on every new physical connection. |
| Diagnostics | Ping error discarded | Fixed warning + finite `error_class` and numeric `duration_ms` | Classes: context_deadline, context_cancelled, connection_unavailable, readiness_failed. Parent context error takes precedence. Never stringify the driver error. |
| Public behavior | live independent; ready JSON/no-store | Unchanged envelopes and success/failure semantics | No cache/fallback ready; no DB check on live. No probe retry. |

Installed pgx v5.11.0 source was inspected: pool construction remains lazy at MinConns=0; idle checking defaults to1min, idle age30min; physical construction can continue in the background after an Acquire caller cancels. The caller readiness deadline bounds HTTP waiting, **not a promise that every internal connection attempt has terminated at that instant**. The physical5s ceiling and unchanged bounded initialization limit that work; pool maximum remains4. Existing disposable PG17 tests independently exercise reconnection/session-policy/identity admission.

### Timeout compatibility and rollout risks

- Source monitor GET cap **8s**, shared verifier deadline50s; service TimeoutStartSec70s. Candidate handler5s fits these source budgets but network/proxy overhead can still consume the remaining3s. Installed exact monitor bytes and Cloudflare deadlines were not verified in this session.
- HTTP middleware context15s; server ReadTimeout15s, WriteTimeout20s: unchanged and above readiness5s.
- Docker healthcheck is **live-only**, timeout3s; unchanged. Do not silently switch it to readiness or induce restart loops.
- **Important release limitation:** `scripts/deploy/auto_broker.py` uses **3s per readiness probe** within an existing30s loop. A cold5s response can therefore fail that individual probe even though the monitor accepts it. Background construction may make a later existing probe succeed, but this is not guaranteed. Broker code was not changed outside scope. Future exact-SHA cutover must explicitly review this compatibility/rollback gate; current source mitigation does not authorize deployment or claim universally compatible probe budgets.
- The existing monitor requires two unsuccessful observations to open an incident. A single failing check is DEGRADED; an outage between samples can be missed. Same-host monitoring can miss total host/network loss. Policy and Telegram delivery were not changed or tested live.
- Readiness remains only a successful DB Ping under established session/identity policy. It does not prove every catalog/Voice query or dependency is healthy. Longer bounds postpone some failure responses by up to3s; no “zero503” or incident-resolution guarantee is made.

## Fail-first and final tests

All commands used existing Node24.10.0 / Go1.27.2 toolchains and RTK wrappers, with `GOTOOLCHAIN=local`. Timings are actual local wall-clock measurements, not extrapolated Supabase performance.

| Command / check | Exit / result |
| --- | --- |
| Before fix: `go test -count=1 -run 'TestReadinessBudgetAndPrivateDiagnostics|TestReadinessLoopbackColdAndOutage' -v ./internal/httpapi` | **1, expected fail-first**: old2s constant rejected; simulated healthy cold4500ms returned503 at **2002ms**. Outage503 at2001ms. |
| Before fix: `go test -count=1 -run TestValidURLWithoutNetwork ./internal/postgres` | **1, expected fail-first**: old connect2s differs from intentional5s candidate assertion. |
| After fix: `go test -count=1 -v -run 'TestReadiness|TestValidURLWithoutNetwork' ./internal/httpapi ./internal/postgres` | **0 PASS**: real loopback HTTP/synthetic Ping cold returned200 at **4501ms**; outage returned503 at **5004ms**; privacy classes/envelope and parent cancellation pass. |
| `go test -count=1 ./internal/httpapi ./internal/postgres ./cmd/api` | **0 PASS**. |
| `go test -count=1 -run TestLocalStalledHandshake -v ./internal/postgres` | **0 PASS**, real loopback TCP peer stalled PostgreSQL handshake; caller returned failure at **100ms**; no-connection lazy construction verified. Not TLS/SCRAM/real DB latency evidence. |
| `node scripts/ci/run-checks.mjs go` | **0 PASS**: gofmt, module consistency/verify, `go test -count=1 ./...`, race suite, vet, staticcheck (default and integration tags), govulncheck (no vulnerabilities found), API/ingest build. Default tests alone do not select integration-tagged cases. |
| `node scripts/ci/run-db-integration.mjs` | **0 PASS**, real disposable local PG17, migrations/fixtures, restricted API identity, C2 projection, ingestion atomicity/security, physical pool policy/reconnect and restricted permissions tests; cleanup PASS. No production DSN. |
| `node --test scripts/ops/verify-go-production.test.mjs scripts/ops/monitor-go-production.test.mjs` | **0 PASS, 62/62, 0 SKIP**, mocks/local tests only; no real Telegram hit. |
| `node scripts/ci/run-checks.mjs ops` | **0 PASS, 177/177, 0 SKIP**. |
| `node scripts/ci/run-checks.mjs security` | **0 PASS**, source/workflow/privacy patterns and synthetic backup guards. |
| `node scripts/revalidation/verify-part16.mjs` | **0 PASS**, static boundaries, not production C2 acceptance. |

New tests are confined to the two existing test files. They preserve all prior assertions and exercise warm/success/error routing, simulated healthy cold path, genuine deadline expiry, parent cancellation, live independence, fixed failure diagnostics and unchanged public body, fake-credential non-disclosure, pool numeric limits/laziness, and actual loopback stalled-handshake cancellation. Existing disposable integration tests verify unchanged production role and read-only initialization gates.

## Publication and production gate

Publication is authorized by this TASK: commit only these five paths, ordinary push of this feature branch, Draft PR to main, no merge. Hosted checks must be evaluated for the exact resulting commit SHA. **At report freeze hosted CI is pending publication, not PASS**; final handoff supplies actual PR/head/check results without rewriting test history. A clean full-stack archive is generated using the existing archive script; exact path/SHA256 and byte-match result accompany the handoff.

**One Owner action after independent source review:** separately authorize an exact-SHA release/cutover only after reviewing the3s broker versus5s handler limitation, immutable artifact approval and compatible rollback image, approved live/ready/catalog checks, and the missing restricted diagnostic context if a proven cold-connect RCA is required. Until then **PENDING_PRODUCTION_DEPLOY**; no restart, reboot, credential transfer, production build/load, service update, ingest, C2/HMAC execution or settings change was performed. Production incident is not declared fixed.

## Follow-up — PR #52 broker/readiness compatibility, 2026-10-20

**READY_FOR_EXTERNAL_REVIEW, source-only.** This section supersedes the earlier **source** 3s-versus5s broker limitation, not the historical evidence or remaining production gates. Previous reviewed head `b163bb4fb71bc9e0d3dbd8b6dac75304902d3f67` and its [9/9 SUCCESS run](https://github.com/kiratonine/AdilBaga/actions/runs/39421811900) are prior evidence, not CI evidence for this correction. Fresh main remains `0095d9951f79d64c7ef9145344b0a1dd6a78867b`; same branch and existing Draft [PR #52](https://github.com/kiratonine/AdilBaga/pull/52). Preflight found a clean tree and matching local/remote/reviewed head before editing.

### Exact correction and compatibility proof

Only [auto_broker.py](../../../scripts/deploy/auto_broker.py), [auto_broker_test.py](../../../scripts/deploy/auto_broker_test.py) and this append-only report change relative to the reviewed head. The four reviewed Go files remain byte-identical. No new source files, dependency, environment flag or runbook change: `deploy/README.md` already says approximately30s readiness polling and remains accurate.

- `ready()` now passes **min(7s, remaining)** to its fixed loopback HTTP probe: the existing5s Go handler budget plus **2s selected response/scheduling headroom**. Actual local4.5s HTTP responses completed at4523/4524ms (about23/24ms above the synthetic server delay); this supports compatibility in the tested local environment, not a bound on production tail latency. The2s margin is an explicit bounded allowance, not a claim that production overhead was measured.
- The shared monotonic deadline is still **start+30s**, never reset between attempts. Remove the100ms minimum that could exceed the last remaining fraction; never start with a nonpositive remainder; accept success only if it completes before the original deadline. Existing maximum0.5s pause and existing retry loop remain; no additional loop/retry policy was introduced.
- Default `http()` timeout18s, response/redirect/cache validations, all callers of `ready()` (preflight/activation/rollback), release authorization, sealed artifact, cutover ordering, public gates, worker alarms and exactly-one compensation remain unchanged. A persistently failing probe still blocks; cancellation through KeyboardInterrupt is not retried and follows existing rollback compensation.
- Source audit found other readiness HTTP calls in Smoke/public observation using the unchanged18s helper default, monitor GET cap8s, middleware15s and server write20s; none has the former3s-versus5s conflict. The3s TCP-only peer check and3s Docker live-only healthcheck are different checks and were not changed. Installed proxy/monitor/broker settings were not accessed or attested by this source-only follow-up.
- Timing boundary: the shared30s admission/verdict window is preserved and late success is rejected. The existing urllib timeout is a socket/I/O timeout, **not a new hard process-level interruption of an arbitrarily trickling response**; no such broader HTTP/watchdog rewrite is claimed. The transport's existing30s status-call timeout also covers complete broker preflight, not just readiness; do not infer guaranteed full-window preflight completion plus metadata overhead. Worker/transport safety remains unchanged and actual installation/cutover needs separate exact-SHA review.

### Fail-first and actual repeated checks

RTK wrappers; Node24.10.0, Go1.27.2, `GOTOOLCHAIN=local`. Python commands run from root with `PYTHONPATH=scripts/deploy` to resolve the existing broker import convention. No production network or credentials; real HTTP testing bound to owned loopback and inherited proxy discovery disabled in that test only.

| Check / command | Actual result |
| --- | --- |
| Before fix: focused unittest methods `test_real_probe_timeout_allows_healthy_cold_handler`, `test_last_probe_never_exceeds_remaining_fraction`, `test_late_success_is_not_readiness` | **exit1**, expected fail-first: healthy4.5s and5s responses exhausted old3s attempts;100ms floor exceeded50ms remaining; old code accepted success at30.001s. |
| `python3 -B -m unittest -v scripts/deploy/auto_broker_test.py` | **exit0, 42/42 PASS, 0 SKIP**, including eight added regression methods. Real local cold HTTP4523ms; fake4.5s/5s responses accepted on first7s-budget probe. |
| `python3 -B -m unittest discover -s scripts/deploy -p 'auto_*_test.py'` | **exit0, 47/47 PASS, 0 SKIP**. Repeated real local HTTP4524ms. |
| `node --test scripts/deploy/auto-gate.test.mjs scripts/deploy/verify-part15.test.mjs` | **exit0, 52/52 PASS, 0 SKIP** (21 gate +31 Part15). |
| `node scripts/deploy/verify-auto-deploy.mjs` / `node scripts/deploy/verify-part15.mjs` | **exit0 each**, static deployment guards, not rollout acceptance. |
| `cd backend-go && go test -count=1 ./internal/httpapi ./internal/postgres ./cmd/api` | **exit0**, all three packages PASS. |
| `node scripts/ci/run-checks.mjs go` | **exit0**, full unit/race/vet, default/integration-tag staticcheck, module/format checks, govulncheck (no vulnerabilities), API/ingest builds. No local integration-tagged DB execution claimed by this command. |
| `node scripts/ci/run-checks.mjs ops` | **exit0, 177/177 PASS, 0 SKIP**. |
| `node scripts/ci/run-checks.mjs security` | **exit0**, source/workflow bounded privacy checks and synthetic backup guard. |
| `node scripts/revalidation/verify-part16.mjs` | **exit0**, static C2 boundaries unchanged. |
| Python AST syntax / `git diff --check` / scope and history checks | **exit0**; only the three correction paths, exact historical report prefix, reviewed Go/DB/frontend/C2/ops bytes preserved. |

New regressions cover healthy cold4.5s/5s, persistent503 and transport-failure full30s fake-clock exhaustion, sub100ms remainder, no probe after deadline, late-success rejection, cancellation without retry/one compensation, persistent failure/one compensation and real4.5s HTTP with clean server/thread shutdown. Existing authorization and rollback failures remain exercised, including keeping the tunnel closed when compensation fails.

### Handoff / remaining gates

Publish one narrow commit and ordinary push to the same Draft PR; exact-new-head hosted nine-job CI must complete before final handoff. CI was not yet executed for the new commit at this report freeze; the final handoff supplies its actual SHA/run/results. Generate a **new** clean full-stack archive, verify safe members and all-file Git-tree byte equality, and return its SHA256. No old archive is reused.

Cold-Supabase RCA remains **LIKELY_NOT_PROVEN / COLD_CONNECT_UNMEASURED_INPUT_BLOCKED**. Production remains **PENDING_PRODUCTION_DEPLOY**: separate review/Owner exact-SHA cutover authorization, independently approved immutable artifact and retained compatible rollback image, installed broker/proxy identity/timeouts and controlled health/application checks still required. No SSH, production HTTP/DB, broker installation, deployment, service operation, reboot, Backend2/C2 action, secrets or settings change occurred during this follow-up. Part32 is not resumed by this correction.
