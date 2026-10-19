# Go operator monitor — source candidate, ACTIVATION_PENDING

No scheduler/service/daemon, production probe or external delivery is activated.
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
contact production or a real receiver. The loopback transport integration does
not claim a real TLS handshake; default HTTPS/TLS verification is preserved.

## Future activation — separate Owner approval, not performed

Choose one private HTTPS receiver and require it to authenticate the bearer token
and durably deduplicate `Idempotency-Key`. A2xx is receiver acceptance, **not** a
human receipt or downstream delivery guarantee. No vendor/account chosen here.
Use a separately reviewed root-managed private environment injection into the
dedicated non-root process. Do not put values into Git, reports, argv, shell
history, browser/client env or CI. Do not read real credentials just to test.

Only these private process variables are consumed by explicit `--run`:

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

Required local test commands are above and in the Part20 report. Existing hosted
CI profiles are unchanged and do not automatically add these new ops tests;
local PASS is recorded explicitly, not inferred from a generic CI badge.
