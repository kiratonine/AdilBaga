# Public Voice HTTP500 — focused diagnostic review

Status: **BLOCKED**.

Date:2026-10-08. Diagnostic execution is complete; production Voice correctness
and the d6098f6 rollout remain blocked pending external review. One synthetic
TOP1 request reproduced an application-origin500 on the accepted **old release**.
No deployment/retry/configuration repair was performed.

## 1. Git / VPS read-only preflight

Fresh `git fetch origin --prune` completed. Branch `integrate/full-stack`;
HEAD=origin=`d6098f622dc5bb18fd9e7ec4f4a0c82033927981`. The four known uncommitted
deployment/report/runbook changes from the accepted rollback were preserved;
there were no new runtime/source changes. They were not reset or committed.

Read-only SSH/Docker inspection independently confirmed:

- Active runtime revision `e6ef854e2973e5b0871888bbc3111e026cdccc5b`.
- Running, Docker healthy, restart0; Tunnel active.
- Sole publication127.0.0.1:8080; no public API port binding.
- Both e6ef854... and d6098f6... images retained with their exact revision labels.
- Existing private API env byte-identical to the privately retained deployment
  baseline; running container values match that file. No values or hashes of
  secret material are recorded here.

This inspection is not a new physical-connection/DB security audit or a claim that
healthy liveness implies Voice correctness. No direct production DB diagnostic
connection was opened in this task.

## 2. Historical evidence actually available

The d6098f6 container was removed by the authorized rollback. Docker inventory
contains **zero retained containers** for that image. Its logging configuration
was the Docker `local` driver; the current container's logs start at
2026-10-08T12:56:18.379943675Z and belong to restored e6ef854..., not the failed
new container. No retained new-container per-request log archive was found in
the task's known evidence. This does not assert that an unknown off-host collector
could not exist; no such collector/evidence was available to this review.

Retained new-release evidence is limited to the earlier report, successful local
VPS Voice timings and **one aggregate stability sample**. That sample contained
three provider successes, one invalid_output, three timeouts and three fallback
events; NLP durations4007/1275/1106/4314/8001/8002/8001ms. These mixed local/public
events have no retained per-request IDs or complete failing-turn trace. No
ERROR-level entries were counted in that sample, but it preceded completion of
the failing smoke and cannot exclude a subsequent panic/dependency error.

Thus the original new-release500 has **no established route/turn, duration,
request_id, envelope or correlated cause** beyond its occurrence in the public
Voice phase. The current reproduction below must not retroactively fill those
historical gaps.

Before today's smoke, a bounded tail of3000 current old-container log lines
yielded483 JSON events, no Voice access/dependency events and no panic events.
Three503 access events were the historical cold readiness checks during rollback,
not Voice failures. Full logs/provider output were never printed or persisted.

## 3. Single current old-release public application smoke

Exactly **one** POST was made, using a synthetic complete approved cheapest-milk
request with valid quantity/fat fields and synthetic coordinates. User text,
coordinates, result payloads, session IDs and provider bodies are omitted.
The operator used an identified diagnostic User-Agent, not browser impersonation.

| Field | Observed value |
| --- | --- |
| Method / route | POST `/api/voice/start` |
| Client start UTC | 2026-10-08T13:16:11.302771+00:00 |
| HTTP status | **500** |
| Total / TTFB | 15412.968 /15412.940ms |
| Content-Type | `application/json` |
| Transport | curl exit0; completed HTTP response, not client transport timeout |
| Sanitized envelope class | generic application Internal Server Error |
| X-Request-ID | `diag-d7ab5c4a098146a29987f86d9eded215` |
| cf-ray | `a4756b2e5ba1c0fd-ARN` |
| TOP1 result | FAIL; no successful result claimed |

The returned X-Request-ID exactly matches this Go access event:

```text
timestamp: 2026-10-08T13:16:26.895193505Z
level: INFO
msg: http_request
request_id: diag-d7ab5c4a098146a29987f86d9eded215
method: POST
route: /api/voice/start
status: 500
duration_ms: 15000
error_code: internal_error
```

Safe dependency events in its server-time interval:

| Server timestamp UTC | Event | Outcome / duration |
| --- | --- | --- |
| 13:16:26.338634907 | nlp_provider | timeout |
| 13:16:26.338750261 | nlp_provider | fallback |
| 13:16:26.338768925 | nlp_request | failure;8003ms;gemini_unavailable |

NLP/session records do **not** contain request_id in the current logger; their
association is a timestamp-window correlation, not end-to-end trace identity.
No session_dependency or panic/http_error event appeared in this interval.
The exact correlated access event proves Go emitted500, so an **edge-only error
is excluded for this reproduction**. The edge carried the matching request ID
and status; this does not exclude network latency as a budget contributor.

The TOP1 smoke failed, so execution stopped as instructed. No second Voice POST,
clarification/continue, provider benchmark or session cleanup command was run.
No owned session ID was received. This task did not explicitly issue Redis
commands; runtime-side activity is limited to whatever the single request did.

## 4. Source failure mapping — unchanged in both releases

Git diff between e6ef854... and d6098f6... is empty for voice, Gemini, Redis,
middleware and PostgreSQL repositories. Current inspected failure paths therefore
also describe the deployed old release.

- `internal/middleware/http.go`: request context budget15s. Timeout middleware
  writes503 **only if the handler has not already written a status**. It does not
  replace an already-written500. AccessLog records status/duration/request_id;
  Recover emits a safe http_error event on panic, without a stack/body.
- `internal/httpapi/voice.go`: ErrInvalid→400, ErrNotFound→404,
  ErrSessionUnavailable→503; any other service error→500. JSON marshal failure
  can also yield500. Public generic envelopes do not identify the failed stage.
- `internal/voice/service.go`: input first loads categories, then sequentially
  discovers each visible category's schema. Generic category/schema/parsing,
  product/location dependency and result invariant errors lose their underlying
  cause and map to500. Continue additionally performs Redis GET/SET/DEL.
- `internal/voice/fallback.go`: provider errors invoke approved deterministic
  fallback. A provider timeout does **not by itself require public500**; fallback
  returns parsed state, then business work must finish under the remaining parent
  request context. Fallback does not supply fictitious product data.
- `internal/gemini/client.go`: shared provider budget8s, safe outcome classes.
  Its timer starts after Voice input/schema loading, not at HTTP request entry.
- `internal/redis/session.go`: bounded3s adapter operations; failures become
  ErrSessionUnavailable/503. An otherwise-complete TOP1 result does not need a
  session, and no Redis failure was observed in this request window.
- `internal/postgres/products.go`: Voice calls ListProducts directly, including
  snapshot reader, typed filter validation/discovery, product/offer queries and
  subsequent location read. Repository work uses the request context.
  databaseError can preserve context cancellation/deadline, but Service replaces
  dependency errors with generic strings. Query metrics are in-memory aggregates,
  not request-correlated SQL/stage logs.
- Pool: max4/min0, connect timeout2s, read-only sessions, statement_timeout5s.
  These are source settings, **not evidence** that this request hit a connection
  or SQL timeout. Server WriteTimeout20s is distinct from context15s.

The approved optimization changes only HTTP GET products discovery. Voice does
not invoke that HTTP handler. No Voice-path change or direct causal link to the
products-discovery optimization was identified.

## 5. Facts, hypotheses and missing evidence

**Demonstrated:** the old accepted release can return application-origin500 for
the approved complete TOP1 request. Its exact Go duration was15000ms. The observed
NLP interval included timeout/fallback and lasted8003ms. Health/image/port/env
invariants were intact at preflight. The original local new-release flows passed
with end-to-end durations8.03–11.99s; they did not establish universal availability.

**Strong hypothesis, not established exact root cause:** the request exhausted
its parent budget while running deterministic work after provider degradation.
Using only server timestamps, inferred pre-NLP time is approximately6440.575ms;
provider8003ms leaves approximately556.425ms until access completion. These are
derived intervals, not explicit stage timings; client/VPS clocks are not used
to calculate them. The input code has sequential discovery work consistent with
pre-NLP latency, but its individual queries/waits were not measured here.

**Missing:** request context Err at failure; exact product/filter/location stage;
SQL wait/cancellation class; pool acquisition timing; direct request_id on NLP
logs; complete original d6098f6 failure trace. No correlated panic or Redis failure
was observed, but absence of those events does not identify the generic error.
Do not assert that Gemini alone, Supabase outage, a SQL statement timeout, Docker,
Cloudflare or the new discovery guard caused the original500.

No runtime fix is recommended for immediate application without review.
Increasing15s/8s budgets or changing provider/model/keys would not be a justified
diagnostic fix. Merely mapping a confirmed deadline to503 would improve failure
classification, not prove application correctness or cure latency.

## 6. Separately reviewed bounded same-SHA diagnostic rollout proposal

**Proposal only — NOT authorized/executed in this task.** Reuse the retained exact
d6098f6 image after external review; no rebuild/source hot-fix or DB change.

1. Review a diagnostic observer locally using synthetic errors before production.
   Its output allowlist is method/route/request_id/status/duration/Content-Type/
   cf-ray, fixed error classes, safe provider/session events and timestamps. Save
   each turn immediately, including failure metadata, never only at suite end.
   Keep raw body/text/coordinates/session values out of logs and stored evidence.
2. Before replacement, start a bounded **continuously sanitized** Docker-log
   capture into private operator storage. Persist access/dependency events before
   container removal; do not block rollback on an after-the-fact log fetch.
   Record release/start time with every capture to avoid mixing containers.
3. Recheck exact image identity/env/least privilege and preserve e6ef854... rollback.
   Use the existing reviewed Tunnel-stop/compose rollout. No configuration repair,
   provider benchmark, parallel synthetic Voice calls or public exposure changes.
4. Make at most one loopback complete TOP1 request; only if it passes, make one
   equivalent public request with independent safe request IDs and unchanged25s
   client bound. Record each response even if non201. Any hard gate failure:
   immediate existing rollback; no retry/dependency tuning/DB rollback.
5. Only if separately approved and already permitted to the restricted identity,
   collect a small bounded read-only pg_stat_activity summary during that one
   request: state/wait_event_type/wait_event and counts, not SQL/arguments/client
   addresses or raw session data. No owner fallback or grants. This is supporting
   evidence, not guaranteed correlation to a specific Go stage.
6. Compare access-event interval with NLP intervals and any permitted wait data.
   Preserve complete sanitized evidence before declaring failure/rollback done.
   External tracing cannot recover unlogged ctx.Err or exact service-stage errors.
   If ambiguity remains, STOP and request a separately reviewed privacy-safe
   phase/context-cause telemetry patch with its own SHA/CI. Do not hot-edit the
   reviewed runtime or pretend a new binary is the same SHA.

If later tracing establishes deadline cancellation in post-NLP DB work, review
phase latency/bounded discovery improvements while preserving current snapshot,
filter validation and DB truth; do not weaken timeouts, fallback or API semantics
blindly. Nothing from this conditional proposal is implemented here.

## 7. Boundaries / local hygiene

Only this new diagnostic report was added by this task. Previous four documents
remain unchanged from task entry. Runtime/tests/dependencies/contracts/compose/
frontend untouched. Private operator helpers/evidence stay outside Git.
No build/image modification/redeploy/rollback repetition, VPS configuration change,
Cloudflare/WAF/Tunnel change, direct DB writes/migration/ingestion/snapshot,
credential rotation, scheduler, commit/push or Part17 work.
The accepted old release remains the active deployment; no provider configuration
or timeout was changed after the failed smoke. Physical Siri was not tested.

Local checks: tracked `git diff --check` PASS; new report LF/trailing-whitespace
and bounded secret/privacy scan PASS. Protected runtime/frontend/contracts/compose
diff remains empty. No full test matrix was rerun for this report-only diagnostic;
no new source/test PASS is claimed. STOP for external review.
