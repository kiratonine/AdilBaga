# Go operator monitor — source candidate, ACTIVATION_PENDING

Inactive service/timer templates are provided; no service, production probe or
external delivery is activated by installing source or merging this change.
Node24, Linux, dedicated **non-root** operator required for active state. The API,
ingestion and Frontend are not modified. This is not a public metrics endpoint.

## Offline now

From the repository root (no private configuration needed):

```bash
rtk proxy node scripts/ops/monitor-go-production.mjs --offline
rtk proxy node scripts/ops/check-go-release.mjs --offline
rtk proxy node --test scripts/ops/monitor-go-production.test.mjs scripts/ops/check-go-release.test.mjs
```

Default monitor/checker execution is offline, no state/network/delivery I/O.
Tests own disposable private state and loopback services; transport mocks never
contact production or a real receiver. Part21 adds real loopback TLS handshakes,
ephemeral private certificates and independent monitoring processes; production
TLS verification is unchanged. This is not real notification delivery evidence.

## Future activation — separate Owner approval, not performed

Choose one private HTTPS receiver and require it to authenticate the bearer token
and durably deduplicate `Idempotency-Key`. A2xx is receiver acceptance, **not** a
human receipt or downstream delivery guarantee. No vendor/account chosen here.
Use a separately reviewed root-managed private environment injection into the
dedicated non-root process. Do not put values into Git, reports, argv, shell
history, browser/client env or CI. Do not read real credentials just to test.

In legacy HTTPS mode (delivery unset or `https`), these private process variables
are consumed by explicit `--run`; Telegram mode is documented below:

- `AKTAU_MONITOR_STATE_DIR`: normalized absolute directory outside source,
  Git/artifacts/dependencies, owned by the effective operator UID, mode0700.
  Preprovision only after approval; the CLI does not mkdir/chown/chmod.
- `AKTAU_MONITOR_RECEIVER_URL`: one exact canonical HTTPS URL, no userinfo/query/
  fragment, max2048chars, no redirects. Configuration is operator-trusted, not a
  public URL-forwarding endpoint. Do not point it at any unrelated internal API.
- `AKTAU_MONITOR_RECEIVER_TOKEN`:16–512 ASCII token characters from the documented
  token alphabet (letters/digits/dot/underscore/tilde/plus/slash/hyphen).
  Missing/invalid config blocks before state creation/probes.

Future **manual one-shot** example, only in that separately approved non-root
environment (do not run during source review):

```bash
rtk proxy node scripts/ops/monitor-go-production.mjs --run
```

One invocation uses the existing Part19 verifier unchanged: at most5 sequential
fixed unauthenticated Go GETs,8s/request,50s shared, bounded bodies, no retries/
redirects. Pending-delivery drain invocations make0 API GETs. At most one delivery
attempt per invocation,5s absolute timeout, fixed POST headers/payload, verified
TLS, no proxy agent/cookies/redirects/retry or response-body logging. No Voice,
HMAC, Redis, DB, publication or other endpoints. No loop or activation command is
hidden in imports/default mode. A cadence/launcher is a separate Owner decision.

## State and policy candidates (not a production SLA)

| Previous state / observation | New state / action |
| --- | --- |
| Any non-incident / complete healthy verifier | OK, reset consecutive failures |
| OK / unsuccessful verifier | DEGRADED, failures1, no delivery |
| DEGRADED / next unsuccessful verifier | INCIDENT, failures2, persist incident_opened then try delivery |
| INCIDENT / unsuccessful verifier | INCIDENT, saturated count2, no repeated incident |
| INCIDENT / first successful poll | OK, persist incident_recovered then try delivery; RECOVERED output |
| Pending event | Drain that event only; no new health observation or reordering |

Healthy requires the complete5-check successful Part19 result, not a partial
PASS/status string. WAF/transport/schema errors are unsuccessful; no raw error
is persisted. Zero-success-ever can open an incident after two failed polls.
No `snapshotAt`/product/body data retained or freshness/publish SLA inferred.

Every invocation is serialized by exclusive0600 `monitor.lock`. State is a
bounded canonical JSON `state.json`, mode0600, no history growth; directory/
ancestor UID/mode/type/symlink checks and anchored directory fd protect custody.
Root-sticky ancestors such as `/tmp` are allowed for owned test directories,
not a reason to use shared unprotected production state. Same-UID/root compromise
or storage falsely acknowledging fsync is outside this trust boundary.

Each save writes an exclusive0600 pending file fully, fsyncs it, renames and
fsyncs the directory. Faults leave the lock/pending interlock and block future
runs. Concurrent invocations never check/send. No stale-lock-by-age/PID removal.
Wall clock rollback blocks before probes/delivery; forward jumps are not evidence
of uptime or real elapsed time. Counts are poll-based, not a guessed cadence.

One pending event only, no general queue. Save ID/attempt/cooldown **before send**.
Failed/ambiguous delivery stays pending,60s cooldown, max3 automatic attempts
across explicit manual invocations; after that, operator reconciliation required.
Repeated calls cannot flood delivery. No probe is made while a pending event is
undelivered, so health monitoring pauses during delivery outage: output PENDING,
never invented OK/recovery. Successful draining is DELIVERED, not a fresh probe.

Crash after receiver acceptance but before local ack may resend the **same**
idempotency key. Exactly-once distributed delivery is impossible without receiver
cooperation; receiver dedup is a prerequisite. SIGTERM/SIGKILL use normal process
termination, leaving the crash interlock rather than pretending finally ran.
In-process abort support prevents subsequent state success/delivery; HTTPS abort
destroys its request. Current verifier keeps its existing bounded timeout policy.

Exit0: OFFLINE/OK/RECOVERED/DELIVERED; exit1: DEGRADED/INCIDENT/PENDING;
exit2: arguments/config/state/clock/cancellation BLOCKED. Output contains only
fixed outcome/reason enums. Event body has type, UTC timestamp, fixed category
`go_api_unavailable`; generated event ID is only an idempotency header. No URL,
token, API IDs, headers, body, product/store, search/voice or coordinates output.

## Recovery / reset (manual, no reset switch)

1. Suspend further operator invocations; prove none is active, not merely an old
   lock timestamp. Retain the private state/lock/pending files for review.
2. Privately reconcile the pending ID with the receiver's durable acceptance/
   dedup record. Never print that private state/token/URL into shared logs.
3. On exhausted/ambiguous delivery, fix receiver availability under separate
   authority; do not delete a pending incident just to show green. No implicit
   replay or retry-counter reset is provided.
4. For corrupt/interrupted storage, compare current and pending records plus
   receiver evidence. Owner approves any repair/restoration with the exact event
   identity; preserve quarantined originals outside Git. Do not select a healthy
   state blindly or auto-unlock after crash. If no reliable record exists,
   report monitoring/delivery NOT_VERIFIED and retain the interlock.
5. An intentional new monitoring lifetime requires separately approved fresh
   private0700 directory and reconciliation of old pending events. It resets
   poll history and can create another incident, so is not silent recovery.

## Offline Go release review, not deploy approval

`check-go-release.mjs` consumes the **existing** Part15/auto-build local layout:
manifest.json, image.tar, api, backend-go/Dockerfile and backend-go/go.mod.
The latter two are the existing clean Git-export recipe, not a new manifest format.

```bash
# LOCAL artifacts only; replace placeholders, never use credentials/backup paths.
rtk proxy node scripts/ops/check-go-release.mjs --check /absolute/review/candidate FULL40SHA
# Optional independent local rollback bundle and its different full SHA:
rtk proxy node scripts/ops/check-go-release.mjs --check /absolute/review/candidate FULL40SHA /absolute/review/rollback PREVIOUS40SHA
```

Read-only, fixed filenames/caps, no symlink traversal, strict manifest/duplicate
keys and digest/metadata checks; source recipe compares to existing local Git
objects for the exact supplied SHA, no fetch/build/load. Existing Part15 identity
validator and auto-build artifact-name rules reused. No modifications to artifacts.
No stdout private path/body/error/config. Exit0 local consistency/ordinary offline;
exit1 rejected artifact; exit2 unsupported args. Output bounded matrix only.

**READY_FOR_OWNER_REVIEW means LOCAL CONSISTENCY ONLY; production always BLOCKED.**
The same local manifest claims cannot authenticate Docker archive contents, tag,
actual base/toolchain, hosted CI producer, remote bytes, root approval, broker,
runtime DB/Voice compatibility, rollback compatibility or post-cutover smoke.
Those gates remain NOT_VERIFIED even if artifact JSON says otherwise. Even a
self-consistent synthetic non-image is not authenticated by a checksum. The
checker intentionally does not replace broker tar inventory, sealed-fd custody,
single-use independent authorization or Docker identity verification. No fabricated
IDs, approval files, copy/load/transport or upgrade of a local result to release PASS.

Current healthy438 and historical absent wrapper are dated Part19 observations,
not read again here. Future release requires exact hosted artifact/Owner approval,
appropriate approved release route, compatible preserved rollback, private config
and application Voice gates. Keep AUTO_DEPLOY_ENABLED disabled. C2 provisioning
and3 qualified legitimate-publication≤5s measurements remain separate OPEN work.

The mandatory existing Security job runs `node scripts/ci/run-checks.mjs ops`
with Node24: all92 Part20 cases plus the Part21 lifecycle/unit-kit tests. The
original nine CI job names and deployment eligibility contract are unchanged.
OpenSSL and systemd-analyze must already exist on the Linux test runner; tests
do not install them. A broken operator suite fails the job, not a silent skip.

## Part21 activation permission packet — NOT EXECUTED

**BLOCKED_ON_REAL_RECEIVER.** One future Owner decision must identify the
dedicated non-root account, root-controlled Node24 executable under `/usr` or
`/opt`, exact reviewed source commit, receiver/channel, credential provisioning,
cadence and independent receipt procedure. No provider, account, SSH identity or
actual Node path is invented here. No new SSH/sudo grant is needed by the monitor.

Request authority only for these new resources and operations:

| Resource | Future custody / permitted change |
| --- | --- |
| `/opt/aktau-monitor/releases/FULL40SHA` | Root-owned immutable reviewed source; directories0755, four runtime modules0644: monitor-go-production, monitor-state, verify-go-production, telegram-notifier under scripts/ops |
| `/etc/aktau-monitor/receiver.env` | Root-owned0600; parent0755; private provisioning, never cat/log/copy to artifacts |
| `/var/lib/aktau-monitor/state` | Selected account owns0700, state/lock0600; root-controlled parent0755 |
| `/var/lib/aktau-monitor/acceptance` | Separate fresh0700 test state, same account; never reuse real monitoring state |
| `/etc/aktau-monitor/test-receiver.env` | Optional root0600, only Owner-controlled TEST receiver URL/token; no real incident destination for synthetic tests |
| `/etc/systemd/system/aktau-go-monitor.service` and `.timer` | Root0644 rendered reviewed units; initially disabled |

Only the three documented AKTAU_MONITOR variables belong in receiver.env. The
state path must be the approved fixed state directory. Systemd reads this file
as manager, then starts the non-root process. Source and Node executable plus
all ancestors must be root-controlled, non-writable by the monitor. Reject
symlinks, shared writable source, unexpected versions/digests or existing
unreconciled state. Do not overwrite an existing unit or private state silently.

The following is a **future private operator command packet, not authorization
to execute it now**. Set non-secret `MONITOR_USER`, `NODE24`, `SOURCE_DIR` and
`RENDER_DIR` to the separately approved values. SOURCE_DIR must end in the full
reviewed40hex commit; NODE24 must be the approved root-controlled executable.
Render as non-root in a fresh local0700 directory outside Git:

```bash
id "$MONITOR_USER"
"$NODE24" --version                         # must be v24.x, reviewed version
stat -c '%U %a %F' "$NODE24" "$SOURCE_DIR"
git show HEAD:scripts/ops/monitor-go-production.mjs | sha256sum
sha256sum "$SOURCE_DIR/scripts/ops/monitor-go-production.mjs"
# Repeat for monitor-state.mjs, verify-go-production.mjs and telegram-notifier.mjs.
"$NODE24" scripts/ops/render-monitor-units.mjs --render "$RENDER_DIR" "$MONITOR_USER" "$NODE24" "$SOURCE_DIR"
systemd-analyze verify "$RENDER_DIR/aktau-go-monitor.service" "$RENDER_DIR/aktau-go-monitor.timer"
```

Owner must verify every ancestor, source digest and exact commit, not only the
shown leaf stat. Confirm receiver DNS/TLS, bearer authentication, durable
idempotency and a private downstream receipt channel independently. Never put
URL/token in the command line. Provision the root-owned env files via the
existing private operator procedure; this kit does not create credentials.
After path/custody validation and approval, Owner may install only the two
rendered0644 units (no account or source changes implicit in these commands):

```bash
sudo install -o root -g root -m 0644 "$RENDER_DIR/aktau-go-monitor.service" /etc/systemd/system/aktau-go-monitor.service
sudo install -o root -g root -m 0644 "$RENDER_DIR/aktau-go-monitor.timer" /etc/systemd/system/aktau-go-monitor.timer
sudo systemd-analyze verify /etc/systemd/system/aktau-go-monitor.service /etc/systemd/system/aktau-go-monitor.timer
sudo systemctl daemon-reload
# Manual one-shot mode: timer stays disabled. Up to5 fixed API GET, <=1 delivery.
sudo systemctl start aktau-go-monitor.service
sudo journalctl -u aktau-go-monitor.service -n 10 --no-pager -o cat
```

First one-shot must yield complete OK, not pending/blocked; do not manufacture
an outage of the Go API. Inspect only sanitized monitor outcomes. Exit1 is a
completed unhealthy/pending observation, not success evidence or a restart.

Bounded synthetic open/recovery acceptance uses the **test receiver only**,
its separate environment file and fresh acceptance state. This future transient
unit injects test observations into the real monitor; **0 public API requests,
at most2 HTTPS POST, each<=5s, no retries**. No tokens/URLs in argv or output:

```bash
sudo systemd-run --unit=aktau-go-monitor-acceptance --wait --pipe \
  -p "User=$MONITOR_USER" -p "WorkingDirectory=$SOURCE_DIR" \
  -p EnvironmentFile=/etc/aktau-monitor/test-receiver.env \
  -p NoNewPrivileges=yes -p ProtectSystem=strict -p ProtectHome=yes \
  -p ReadWritePaths=/var/lib/aktau-monitor/acceptance -p UMask=0077 \
  -p TimeoutStartSec=20s -p KillMode=control-group \
  "$NODE24" --input-type=module -e '
import {runMonitor,createNotifier} from "./scripts/ops/monitor-go-production.mjs";
const notify=createNotifier({url:process.env.AKTAU_MONITOR_RECEIVER_URL,token:process.env.AKTAU_MONITOR_RECEIVER_TOKEN});
const directory="/var/lib/aktau-monitor/acceptance";
const bad=()=>({outcome:"FAIL"});
const good=()=>({outcome:"PASS",requests:5,records:["live","ready","categories","products","dashboard"].map(endpoint=>({endpoint,outcome:"PASS",schemaClass:"valid",statusClass:"2xx"}))});
for(const [check,expected] of [[bad,"DEGRADED"],[bad,"INCIDENT"],[good,"RECOVERED"]]){
 const result=await runMonitor({directory,check,notify});
 console.log(JSON.stringify(result)); if(result.outcome!==expected)process.exit(2);
}'
```

STOP on any unexpected outcome, missing receipt, TLS/auth failure or leftover
lock. A2xx proves only receiver acceptance. Owner must correlate exactly one
synthetic open and one recovery with independent human/downstream receipt and
durable receiver dedup; never print private event IDs into shared logs. This
manual approval remains required after local tests and CI pass.

Only after these checks and the approved cadence decision, enable the new timer:

```bash
sudo systemctl enable --now aktau-go-monitor.timer
sudo systemctl status aktau-go-monitor.timer --no-pager
# Disable/rollback the monitor scheduler only; preserve private state/evidence.
sudo systemctl disable --now aktau-go-monitor.timer
sudo systemctl stop aktau-go-monitor.service
```

Enable and disable are alternative phases, not one script to run end-to-end.
The candidate timer is5min after inactivity, no catch-up, no overlap, no restart
loop. Service70s includes verifier50s + notifier5s + storage margin; stop5s kills
the whole group. Never delete crash locks/pending state automatically; follow
the reconciliation section above. Source rollback needs a separately reviewed
previous immutable source and rerender; no Go image rollback is implied. Go,
Cloudflare, sync/C2 timers and AUTO_DEPLOY_ENABLED remain unchanged.

## Part22 — direct Telegram (inactive source candidate)

Telegram is **outbound sendMessage only**; no receiver server, webhook, polling,
getUpdates, commands or callback endpoint is needed. Protocol reference:
[official Bot API sendMessage](https://core.telegram.org/bots/api#sendmessage).
No Telegram network requests are made during tests or this source sprint.

Explicit Telegram process environment consists of exactly these four entries:

- `AKTAU_MONITOR_DELIVERY=telegram`
- `BOT_TOKEN` — strict token; never in argv/output/Git/CI or a shared transcript.
- `ADMIN_ID` — positive numeric personal private-chat ID, not a subscriber list.
- `AKTAU_MONITOR_STATE_DIR=/var/lib/aktau-monitor/state`

Root-managed `/etc/aktau-monitor/telegram.env` must be root:root0600, regular,
single-link, under a root-controlled nonsymlink directory. Provision via an
approved private encrypted-stdin procedure only: never source/eval the old
backend dotenv, upload it wholesale, or print values/lengths/hashes. The Part22
attempt stopped at read-only preflight because the required directory was absent;
no credentials were read/transferred and no VPS file was created. Creation of
the missing root-controlled parent and staging remain a future Owner action.

Unset delivery keeps legacy HTTPS behavior; `https` selects it explicitly.
Unknown delivery or missing Telegram values blocks before state/probes, never
falls back. Default/`--offline` reads no env or state and sends nothing. The
renderer defaults to legacy receiver.env; pass the final literal `telegram` to
select only telegram.env, never both files or an arbitrary env path:

```bash
"$NODE24" scripts/ops/render-monitor-units.mjs --render "$RENDER_DIR" "$MONITOR_USER" "$NODE24" "$SOURCE_DIR" telegram
systemd-analyze verify "$RENDER_DIR/aktau-go-monitor.service" "$RENDER_DIR/aktau-go-monitor.timer"
```

Do not install the raw template, unresolved placeholders or a unit from another
reviewed source. The70s bound, non-root hardening and0700 state remain unchanged.
All four runtime modules must match the same reviewed commit; Node24 and source
ancestors must be root-controlled. The existing Part21 packet describes source,
state and unit installation; substitute the explicit Telegram-rendered service,
and do not provision the legacy receiver env for Telegram mode.

### Receipt/retry limitations and reconciliation

Telegram success requires complete HTTP200, bounded valid JSON `ok:true`, positive
message_id and the configured private chat identity when returned. Response body,
chat/message IDs and token-bearing request path are never logged or persisted.
One attempt<=5s,32768-byte response cap, default TLS, no proxy/redirect/retry.
Messages contain only fixed Russian ALERT/RECOVERED, service name and UTC time.

**Telegram has no durable idempotency key.** Before a send the real monitor
durably saves its existing attempt plus `manualReconciliation:true`. On confirmed
success it clears pending normally. Any unsuccessful/ambiguous result (including
429, TLS error, timeout or definite rejection) leaves the latch. Subsequent runs,
even after cooldown or delivery-mode changes, emit only
`PENDING / delivery_reconciliation_required`, with0 GET/POST. There is at most
one automatic Telegram send for that event, not exactly-once delivery. This
conservative policy intentionally also requires manual handling for definite
rejections; no unsafe transport-phase guess is used to authorize a resend.
An already attempted legacy pending event cannot be automatically sent to
Telegram either. Legacy HTTPS events without this latch retain their existing
idempotency/cooldown/maximum-three-attempt behavior.

SIGTERM/crash can leave the existing lock; no automatic unlock or reset. After
ambiguous Telegram receipt monitoring pauses, including recovery observation,
until Owner privately reconciles the event/time with chat receipt and preserved
state. There is no reset/retry CLI. Never erase state to make green; keep original
evidence and separately approve any repair. Rolling back to pre-Part22 source
cannot read a latched record: reconcile first, preserve/quarantine that record,
and use compatible reviewed source rather than silently dropping the field.

### Post-review manual checklist — NOT EXECUTED

1. Owner opens the bot and sends `/start` personally. Confirm ADMIN_ID is that
   personal private chat; no webhook/getUpdates or bot command implementation.
2. Approve root-controlled parent/env staging and verify only metadata/booleans,
   never file contents. Existing secret file must not be overwritten silently.
3. Install the four source modules and render/verify units using the reviewed SHA
   and approved non-root account/Node24 path, as in Part21; timer stays disabled.
4. In a scheduled manual smoke slot, send **one known synthetic ALERT** using
   the private manager-injected env below. This is a transport receipt test,
   not a real outage or a monitor-state incident. If reply is ambiguous STOP,
   inspect chat privately; do not retry. Verify sanitized ACCEPTED plus actual
   human receipt (API200 alone is not a human read receipt).
5. Run the installed service once: up to5 fixed public GET,<=1 delivery; require
   complete OK from the healthy API. Do not sabotage Go to create an incident.
6. Synthetic incident/recovery E2E stays local against the loopback test transport:
   `node --test scripts/ops/telegram-lifecycle.test.mjs`. Never route test fixtures
   to a real bot; the new tests intercept every send.
7. Only after source review/merge, manual receipt and one-shot PASS, Owner may
   enable the existing new monitor timer. No activation is authorized here.

Future **one-message** smoke command (no values in argv/history/logs; actual
Node/account/source still require Owner selection). Do not run in source review:

```bash
sudo systemd-run --unit=aktau-monitor-telegram-smoke --wait --pipe \
  -p "User=$MONITOR_USER" -p "WorkingDirectory=$SOURCE_DIR" \
  -p EnvironmentFile=/etc/aktau-monitor/telegram.env \
  -p NoNewPrivileges=yes -p ProtectSystem=strict -p ProtectHome=yes \
  -p TimeoutStartSec=10s -p KillMode=control-group -p LimitCORE=0 \
  "$NODE24" --input-type=module -e '
import {randomBytes} from "node:crypto";
import {createTelegramNotifier} from "./scripts/ops/telegram-notifier.mjs";
try{
 const send=createTelegramNotifier({token:process.env.BOT_TOKEN,admin:process.env.ADMIN_ID});
 const ok=await send({id:randomBytes(16).toString("hex"),type:"incident_opened",atUTC:Date.now()});
 console.log(JSON.stringify({outcome:ok?"ACCEPTED":"RECONCILE_STOP"}));process.exitCode=ok?0:2;
}catch{console.log("{\"outcome\":\"CONFIG_BLOCKED\"}");process.exitCode=2;}'
```

After separate Owner approval, manual one-shot / later enable / disable commands:

```bash
sudo systemctl start aktau-go-monitor.service
sudo journalctl -u aktau-go-monitor.service -n 10 --no-pager -o cat
# Only after receipt and complete one-shot OK, not automatically after rendering:
sudo systemctl enable --now aktau-go-monitor.timer
# Alternative rollback phase: disable this new timer only; keep private state.
sudo systemctl disable --now aktau-go-monitor.timer
sudo systemctl stop aktau-go-monitor.service
```

A same-VPS monitor cannot send an alert if the whole VPS/network fails. External
watchdog redundancy remains a later operational improvement, not covered by a
working Telegram adapter. Real smoke NOT_RUN, monitor INACTIVE, C2 OPEN and Go
API unchanged until separately authorized operations and evidence say otherwise.
