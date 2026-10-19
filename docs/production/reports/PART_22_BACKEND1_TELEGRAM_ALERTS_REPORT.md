# Part22 — Direct Telegram alerts integration

Date2026-10-19. Source: **READY_FOR_EXTERNAL_REVIEW**.
VPS: **STAGING_BLOCKED — parent_absent**. Real Telegram smoke **NOT_RUN**;
monitor **INACTIVE**; Go API **UNCHANGED**; production C2 **OPEN**.

## Baseline and ownership

Fresh `git fetch origin --prune` confirmed expected main/base
`c0cd239695a496c0359d79c0f56773df0ec11f0b` (Part21/PR47 merged).
New native WSL worktree `aktau-part22-telegram-alerts`, branch
`feat/part22-telegram-alerts`. Other worktrees, untracked main-checkout reports
and prior reports preserved; no reset/rebase/stash/clean. Publication SHA/Draft
PR/actual hosted CI state are supplied in the final handoff, not preclaimed here.

Read root rules, full Part22 task, roadmap/current ops policy, Part20–21 reports,
monitor/state/verifier/release tests, inactive templates/renderer and existing
CI/deployment identity contract. No frontend/Go/SQL/ingest/C2/HMAC/API/DTO,
dependency, scheduler or auto-deploy workflow modification.

## A — direct transport and durable ambiguity policy

New `telegram-notifier.mjs` implements only outbound HTTPS `sendMessage` to the
fixed `api.telegram.org` host and token-bearing path. No webhook, listener,
getUpdates, incoming commands, proxy, alternate host or subscriber database.
Protocol checked against [official Bot API](https://core.telegram.org/bots/api#sendmessage).

`AKTAU_MONITOR_DELIVERY=telegram` explicitly selects the new factory; unset or
`https` preserves the legacy authenticated receiver. Invalid/unknown mode or
missing Telegram config blocks before state/probes. Default/offline reads no
env/state and makes0 requests. Strict token syntax, positive canonical private
chat ID bounded to52bits, literal selected dotenv parsing, duplicate and
substitution rejection. No environment file is read by the runtime adapter.

One request per selected attempt; default TLS verification, no proxy agent,
cookie, redirects or retries;5s absolute timeout includes connect/body;
32768-byte response cap, full UTF-8/JSON/completeness/length validation. Success
requires HTTP200, boolean ok:true, positive safe message_id and configured
private chat identity when present. No raw response/exception/request path is
logged. Fixed concise Russian ALERT/RECOVERED text contains service/UTC only;
no product/store/price, voice/search/session/coordinate, URL, event ID or user text.

Telegram has **no durable idempotency key**. To avoid unsafe guessed transport
phases and duplicate sends, the minimal reviewed-state extension persists
`manualReconciliation:true` on the existing pending record **before** its first
Telegram send. Confirmed successful response clears pending normally. Every
other outcome, including definite rejection, requires private manual
reconciliation, with0 subsequent GET/POST. No automatic resends after timeout,
loss, cooldown, restart or switching delivery mode. Already-attempted legacy
pending events cannot automatically migrate to Telegram either.

The existing version1 state format accepts only this optional true latch on an
attempted pending event; malformed/false/unattempted latches are rejected.
Unlatched legacy events retain the existing idempotency/cooldown/max3-attempt
behavior. Source/state must be rolled back compatibly: old code rejects a
latched record; never drop the field or erase state to force a green result.
Crash/ambiguous-storage locks remain untouched; no reset/unlock command added.

Tradeoff: an unconfirmed send pauses health/recovery observation until private
reconciliation. Even a definite rejection needs Owner handling. At-most-one
automatic Telegram attempt is not an exactly-once or human receipt guarantee.

## B — real local HTTPS/process tests and CI

All110 existing Part21 ops cases retained and passing;50 new Telegram cases:
40 unit/parser/transport cases and10 lifecycle/config/state/unit-kit cases.
Mandatory Security job uses the existing ops profile, extended with two test
entrypoints. Nine CI jobs/triggers/permissions and deploy guards unchanged.
The miniature broken-suite regression includes the new test entrypoints and
still proves nonzero propagation. No skip, retry or allow-failure added.

Independent child processes use the real persisted monitor/state/notifier and
an ephemeral loopback HTTPS fake Bot API; cert/key/state outside Git, owned
0700/0600, cleaned with owned processes/sockets only. Fixed original Telegram
origin asserted before test-only mapping to127.0.0.1. Trusted fixture CA is
injected per request; untrusted native TLS fails. No actual analytics, Telegram
or public Go endpoints are contacted by these tests.

Covered: healthy→two failures→one open, repeated-failure dedup, one recovery;
durable attempt/latch before send; lost reply after durable receipt,429,
untrusted TLS and actual5000ms timeout; crash after acceptance, concurrent
process and retained lock; restart/cooldown/mode-switch no-resend; sanitized
outputs/state; unknown/missing config and zero-I/O offline; malformed latch.
Unit streams cover 204/302/400/401/429/500/503, ok:false, malformed schema,
wrong chat/type, partial/oversized/invalid UTF-8/HTML/length, exception/abort.

Tests preceded the transport implementation: first notifier test invocation
exit1/ERR_MODULE_NOT_FOUND (expected TDD baseline, not a production defect).
First lifecycle run:7 PASS/1 FAIL because Telegram renderer still selected
receiver.env; the exact failed assertion was corrected by explicit fixed-file
selection, not weaker tests. Final complete suite160/160 PASS.
An initial relayprobe build used a nonexistent cmd path and exited1; corrected
to the existing internal/revalidation/testdata/relayprobe without source changes.

## C — bounded inactive credential staging

Only metadata of the exact Owner-approved local backend dotenv path was checked:
regular/nonsymlink input present. `ssh -G` confirmed the existing my-vps alias,
non-root principal, strict host-key checking and no proxy. No alternate host or
host-key bypass. No dotenv values, lengths, hashes or unrelated entries output.

Exactly **one SSH session**, read-only preflight, outer deadline25s (sudo
subprocess<=15s), no retries/fallback. Options: BatchMode=yes,
StrictHostKeyChecking=yes, ForwardAgent=no, ClearAllForwardings=yes,
ControlMaster=no, ControlPath=none, PermitLocalCommand=no, ConnectTimeout8s,
bounded server-alive settings. Fixed remote Python validated non-root principal;
existing `sudo -n` ran a fixed metadata-only root check. No shell-supplied secrets.
Only sanitized fixed JSON outcome was retained; stderr/raw remote output not
shown. No environment/secret/DSN/backup/service contents were read remotely.

Outcome: **STAGING_BLOCKED / parent_absent**. Required root-controlled
`/etc/aktau-monitor` did not exist. The preflight stopped before any write or
credential read; no directory, temporary credential file or telegram.env was
created. No overwrite, privilege repair, sudo grant or second SSH session.
Local BOT_TOKEN/ADMIN_ID were **not read or transferred** because remote
prerequisites failed. The original backend dotenv remains untouched. Thus
root0600 staging is NOT_VERIFIED/NOT_PERFORMED, never STAGED_INACTIVE.

Next Owner action after review: approve/provision the root-controlled private
parent, then separately stage only the two validated literal entries using
encrypted stdin and exclusive atomic no-clobber0600 creation, fsync and boolean
metadata validation. Never upload the full dotenv or expose values in argv,
logs, report, archive or Git. Any existing file requires reviewed replace/restore
authority; no silent overwrite. This sprint does not broaden the file-only
permission to create host provisioning or modify other resources.

## D — inactive systemd selection / activation handoff

Service template changes only EnvironmentFile placeholder. Renderer maps an
optional final `telegram` choice to exactly `/etc/aktau-monitor/telegram.env`;
default/https maps receiver.env. No arbitrary file path or simultaneous secret
files. Both rendered variants pass real systemd-analyze verify in an owned
fixture filesystem with Node24 and synthetic targets, not installed services.
70s bound, non-root hardening,0700 state and unchanged timer are preserved.

The [complete monitor runbook](../../../ops/monitor/README.md#part22--direct-telegram-inactive-source-candidate)
contains reviewed-SHA/four-module/Node24/root-custody preflight, explicit rendering,
future private env injection, one known synthetic manual Telegram smoke, actual
human receipt, healthy service one-shot, conditional enable and disable/rollback.
Bot `/start` and personal private chat must be confirmed by Owner; no setWebhook
needed. Real smoke is NOT_RUN, not inferred from synthetic Bot API200.
Timer and service installation/start/enable are not performed here. The complete
local synthetic incident/recovery is run only against the fake HTTPS transport;
never induce a real production outage for testing.

Whole-host/network failure cannot send alerts from the same VPS. A future
external watchdog is a distinct operational improvement. C2 remains OPEN; no
Go rollout or new release/rollback compatibility is claimed by this adapter.

## Actual verification ledger

Non-root Linux, Node24.10.0, Go1.27.2; existing OpenSSL/systemd-analyze;
RTK/proxy used. Commands below exit0 unless explicitly historical above.

| Executed command | Actual final result |
| --- | --- |
| `node scripts/ci/run-checks.mjs ops` |160/160 PASS,0 SKIP;110 retained +50 new |
| `node scripts/ci/run-checks.mjs security` | Source/workflow and synthetic backup guard1/1 PASS |
| `node --test scripts/deploy/auto-gate.test.mjs scripts/deploy/verify-part15.test.mjs` |52/52 PASS |
| `python3 -B -m unittest discover -s scripts/deploy -p 'auto_*_test.py'` |39/39 PASS |
| `node scripts/deploy/verify-auto-deploy.mjs` | Static boundaries PASS |
| `node scripts/deploy/verify-part15.mjs` | Static boundaries PASS |
| `node scripts/revalidation/verify-part16.mjs` | Static boundaries PASS |
| `C2_LOCAL_PROBE=OWNED_TEMP_RELAYPROBE node --test scripts/revalidation/*.test.mjs scripts/ci/guard.test.mjs` |286/286 PASS,0 SKIP; existing Go1.27.2 relayprobe built first |
| `node scripts/revalidation/joint-poc.mjs` |15/15 PASS,0 SKIP; owned PG cleanup PASS |
| `node scripts/ci/run-db-integration.mjs` | Disposable PG17/migrations/restricted integration PASS; cleanup PASS |
| `cd backend-go && go test -count=1 ./...` | All packages PASS |
| `cd backend-go && go test -race -count=1 ./...` | All packages PASS |
| `cd backend-go && go vet ./...` | PASS |
| `cd backend-go && go tool staticcheck ./...` | PASS |
| `cd backend-go && go tool staticcheck -tags=integration ./...` | PASS |
| `cd backend-go && go tool govulncheck ./...` | PASS; no vulnerabilities found at execution |
| JS syntax, runbook bash syntax, diff/scope/links/privacy/history | PASS at final artifact verification |

Local tests are not production observations. No public health/Voice/HMAC request,
ingest/publish/sync, SQL/Redis, install, restart, timer activation or Go deployment.
AUTO_DEPLOY_ENABLED/settings/secrets were not changed. No real bot send occurred.

## Exact source scope / review package

1. `scripts/ops/telegram-notifier.mjs` — outbound transport/strict parser/private factory marker.
2. `scripts/ops/telegram-notifier.test.mjs` —40 unit regressions.
3. `scripts/ops/telegram-lifecycle.test.mjs` —10 process/TLS/state/config/unit-kit cases.
4. `scripts/ops/monitor-go-production.mjs` — explicit delivery selection and persisted reconciliation admission.
5. `scripts/ops/monitor-state.mjs` — narrowly validated optional latch.
6. `scripts/ops/monitor-lifecycle.test.mjs` — new entrypoints in retained CI failure fixture.
7. `scripts/ops/render-monitor-units.mjs` — fixed explicit env-file selection.
8. `ops/monitor/systemd/aktau-go-monitor.service` — only EnvironmentFile wiring.
9. `scripts/ci/run-checks.mjs` — Telegram tests in mandatory ops profile.
10. `ops/monitor/README.md` — complete Telegram handoff and retry/privacy limitations.
11. `docs/production/OBSERVABILITY_ALERT_POLICY.md` — bounded source-only Telegram note.
12. This consolidated report.

Other sources and previous reports match main; no private staging artifacts or
credentials in source. Clean full-stack archive produced by unchanged script:
`artifacts/adilbaga-part22-telegram-alerts-20261019.tar.gz`. Safe unique regular
members, all source/report byte-match and bounded privacy checks are required;
SHA256/member count supplied in final handoff (no circular self-digest).

Commit/push only this source scope and Draft PR after local gates; exact hosted
CI status is reported separately and pending/skipped is not called PASS.
No merge or live activation. STOP for independent Code Review.
