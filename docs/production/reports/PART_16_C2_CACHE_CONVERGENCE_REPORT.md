# Part16 C2 — Cache Convergence Diagnosis and Measurement Candidate

Status: **BLOCKED**.

Latest observer correction: local candidate checks PASS; production event-source
integration is still BLOCKED. Missing clock/revision/measurement evidence now
returns INCONCLUSIVE. See final append-only review-fix section; earlier observer
policies below are preserved as historical candidate evidence, not current rules.
Final classification correction below supersedes the historical late-first-fresh
FAIL rule: late discovery alone is INCONCLUSIVE, never proof of late cache update.

**Production root cause: NOT CONFIRMED.** Production C2 is Owner/Backend2-reported
FAIL; remediation remains unproven. Local original and instrumented GET smoke
PASS. A minimal diagnostic-harness candidate is ready for Code Review, **not a
runtime fix or a production acceptance claim**. No speculative cache bypass added.

## Provenance and environment

2026-10-16. Fetch origin --prune exit0. Separate clean native-WSL worktree/branch
**fix/part16-c2-cache-convergence**, based on exact origin/main
**af2fb7708fdbe96c96cda631b8445c1e83090251**. Existing backup/HMAC/Backend2
worktrees untouched. Read project rules, frontend rules, Part16/HMAC reports,
[revalidation contract](../FRONTEND_REVALIDATION.md), frozen OpenAPI and requested
frontend sources. Next/data-pattern/performance guidance and installed Next16.3.8
documentation informed diagnosis; no dependency/runtime strategy was changed.

Native WSL, Node24.10.0/pnpm10.32.1; frozen lockfile install, Next16.3.8.
Explicit clean process env: HTTP API bound to local127.0.0.1, local site URL,
synthetic HMAC secret inside harness, no provider/DB/private production settings.
All POST in this task were to the harness's own loopback Next server only.

## Reported production evidence versus verified local facts

Backend2 reports accepted signed204 at2026-10-15 15:00:56.654UTC,
product HEAD ETag change after10.24–10.85s and catalog convergence>5s.
Retain **reported production C2 FAIL**, not independently observed by this agent.
HEAD has no representation body: an ETag change time is not itself a measurement
of the first fresh GET HTML. ETags also need not be revision identifiers. No new
production GET/HEAD/POST, logs, deployment settings or cache-node state inspected.
The catalog observation is not dismissed merely because product data used HEAD.

## Cache chain traced from current source

1. Go PublishThenNotify calls staged.Publish before notifier.Notify, outside the
   publication transaction; failed notification is degraded, not DB rollback.
   No Go/publisher changes made.
2. Fixed authenticated Next webhook rejects before invalidation, then calls
   revalidateTag('catalog-data', { expire:0 }) and the route-file pattern
   revalidatePath('/[lang]/(site)/products/[id]', 'page'), returning empty204/no-store.
   Existing route-group pattern agrees with shipped revalidatePath guidance.
3. Server HTTP adapter caches API fetches with next.revalidate3600/tag catalog-data.
   React.cache in api/server.ts deduplicates a render's metadata/page calls, not
   a new persistent per-process product cache. No missing tag or second custom
   cache layer found in these requested source paths.
4. Product pages use ISR3600 and on-demand generation; metadata/page share the
   product read, then category filters are loaded. Tag expiry targets Data Cache;
   fixed path invalidation marks Full Route Cache for the next visit, not eager
   regeneration of every product at POST time.
5. Catalog/dashboard/category/sitemap use runtime rendering; tagged fetches remain
   cached despite dynamic HTTP response headers. Catalog's categories/dashboard
   reads are parallel, followed by top-deal detail reads. Sitemap pages the product
   list sequentially100/page, max50 pages. These are real dependencies, but no
   production latency evidence proves them responsible for the reported delay.
6. ISR HTTP responses advertise shared cache policy; a CDN is another layer.
   Shipped CDN guidance says generic external CDNs need invalidation integration;
   **this does not establish a defect in Vercel's integrated platform cache**.
   No evidence here isolates CDN versus server Data/Route cache propagation,
   backend latency, render latency or measurement timing. Vercel is not blamed.

3600s TTL and expire0 are not contradictory: TTL is fallback/time-based policy;
the webhook requests event-driven expiry. Shipped expire0 documentation describes
blocking expired data reads, not an end-to-end distributed5s SLA. Historical
first-response STALE remains allowed only within the agreed shared5s window.

## Actual LOCAL reproduction — before/after instrumentation

Original harness and unchanged frontend build first ran with synthetic mutable
API, unique fetch namespace/product IDs and warm stale preconditions. All6 GET
bodies converged, so **production>5s failure was not reproduced**.

| Path | Before instrumentation ms | Final instrumented ms | Final first cache | First fresh | Stale count |
| --- | ---: | ---: | --- | --- | ---: |
| RU product | 254 | 228 | MISS | true | 0 |
| KK product | 255 | 230 | MISS | true | 0 |
| sitemap | 61 | 53 | absent | true | 0 |
| catalog | 250 | 223 | absent | true | 0 |
| dashboard | 245 | 220 | absent | true | 0 |
| category | 253 | 227 | absent | true | 0 |

Each column is a single LOCAL run, not a benchmark median or claimed speedup.
Frontend runtime is identical before/after. A first instrumented run concurrent
with unit tests took210–767ms; a standalone repeat60–287ms; final stricter405
assertion run53–230ms above. All passed one monotonic5000ms deadline. Variability
is not evidence that the instrumentation optimizes application performance.

Warm product cache HIT/old revision proved stale precondition for all targets.
Freshness uses changed product marker and snapshot fields in complete GET bodies,
sitemap lastmod in XML, never ETag alone. Detail API fetch counter8 warm,
9 at sitemap observation,16 at other final observations; shared counter, not
per-route query cost or production instrumentation.

Final observed GET headers: product cache MISS and
`s-maxage=3600, stale-while-revalidate=31532400`; catalog/dashboard/category
private/no-cache/no-store; sitemap public/max-age0/must-revalidate. Vary recorded.
Age/x-vercel-cache/cf-cache-status absent locally. Separate post-GET product HEAD
was200/empty, cache HIT, same ETag as the already fresh GET; explicitly classified
NOT_PROVABLE_FROM_HEAD. It runs after required GET observations, not as a warmup
that can hide the first-response behavior. There is no CDN in this local proof.

## Minimal candidate and exact changed files

- scripts/revalidation/cache-smoke.mjs: existing synthetic harness retained;
  safe cache-header allowlist, full-body first-response timing, request count,
  strict local401/204 empty/no-store checks,405 empty with approved exception,
  redirects rejected, separate HEAD-only observational probe after GET convergence.
  Accepted-event monotonic origin captured at signed204 response arrival, before
  response assertions; no budget reset after helper completion.
- scripts/revalidation/cache-observer.mjs: extracted existing bounded polling
  measurement into a pure injectable helper, same5000ms gate and conditional100ms
  polling, no endpoint/secret/production runner. Late full-body freshness still FAILS.
- scripts/revalidation/cache-observer.test.mjs: deterministic negative/positive
  clock tests for unchanged/changed ETag versus real marker, first fresh without
  sleep, late5001ms fresh rejection, persistent stale/decreasing operation budget,
  one-shot transport failure without error disclosure, already-expired shared event.
- This report only.

No frontend application runtime fix: no confirmed source cause justifies it.
No force-dynamic/no-store override, eager global purge, Next upgrade, new
dependency/cache/provider or weakened assertion. HMAC security/body/signature,
fixed tags/paths, product ISR, public API/DTO and ingest transaction stay unchanged.

## Actual checks

| Command / check | Exit/result |
| --- | --- |
| pnpm install --frozen-lockfile (frontend, clean env) | 0; lock graph unchanged |
| pnpm build (explicit local HTTP env) | 0; production build/TypeScript PASS |
| pnpm typecheck | 0; next typegen + tsc PASS |
| pnpm lint | 0; existing freshness.ts set-state-in-effect warning,0 errors |
| pnpm test | 0; **39 files /214 tests PASS**, including17 HMAC tests |
| node --test scripts/revalidation/cache-observer.test.mjs scripts/revalidation/verify-part16.test.mjs | 0; **6 observer +4 verifier tests PASS** |
| node scripts/revalidation/verify-part16.mjs | 0; static boundaries PASS |
| Original local cache-smoke | 0;61–255ms,6/6 PASS |
| Final instrumented local cache-smoke | 0;53–230ms,6/6 PASS; local401/204/405 and headers/body assertions PASS |
| Syntax/diff/scope/links/bounded scan/source-preservation checks | PASS |

No old failed test was substituted with historical PASS. Next build occurred
before harness-only edits; application source did not change afterward, so no
second build was needed. No unit config/dependency/timeout inflated. Synthetic
servers cleaned by existing finally. No Go/DB/provider/integration profile was
needed or claimed for this non-runtime candidate.

## Safe next diagnostic decision — separate authorization required

For a next independently legitimate publication, pre-arm a bounded observer on
the approved current deployment. Require trustworthy actual204 timing, distinct
old/new observable fields for the same6 fixed URLs and exact request headers;
no cache busting, publish replay or HEAD as oracle. Capture full-body first GET,
time-to-marker, stale count and safe cache-header allowlist using one shared5s
deadline; respect a separately reviewed request cap. No such production runner
was executed or granted authority here.

Pair those measurements with already authorized safe backend request timings and
deployment/cache-node metadata if available. Fresh backend/GET render but stale
edge headers would support a narrowly reviewed platform cache investigation;
slow uncached API/render would support targeted dependency work instead. None
is currently established. Do not add CDN purges/route-wide no-store merely from
the generic documentation or a HEAD waterfall. Instrumentation alone cannot
guarantee a distributed5s bound on unhealthy/slow dependencies.

**Production C2 remains NOT VERIFIED by this task and previously reported FAIL
is not closed.** Runtime remediation BLOCKED pending discriminating evidence;
this minimal diagnostic candidate is ready for independent Code Review.
Previous Part16/HMAC/recovery reports remain unchanged. No production network,
SQL/SSH/POST, secrets/config/Vercel/Cloudflare/deployment, ingestion/Backend2,
commit/push/PR/merge or Part17 work. STOP for review.

## Jira evidence integration — 2026-10-16, append-only

**Current status: BLOCKED for production C2/root-cause remediation. Diagnostic
observer candidate ready for independent Code Review.** Previous measurements
and the original10 passing tests above are preserved. No frontend runtime fix.

`c2_observer.py` and `c2-run-20261015.jsonl` were not found by scoped worktree
filename search. No attachment location, downloaded contents or execution is
claimed. The following are supplied Jira/Backend2 facts, NOT independently
observed production measurements by this agent:

| Observation relative to signed204 at2026-10-15T15:00:56.654Z | Reported result |
| --- | --- |
| Catalog full GET +6.849s / +15.342s | stale / fresh |
| Dina HEAD +10.242s / subsequent GET +10.625s | REVALIDATED / STALE |
| Dana HEAD +10.652s / subsequent GET +10.974s | REVALIDATED / STALE |
| Fix Price HEAD +10.846s / subsequent GET +11.221s | REVALIDATED / STALE |
| HEAD regeneration durations | approximately2.65–3.46s |
| First fresh catalog GET duration | 4.15s |
| Product first_fresh_at | NULL; GET performed only when ETag changed |

Preserve HEAD observations as cache diagnostics, not product-body freshness.
NULL is missing observation, not proof products never refreshed. Catalog GET
evidence exceeds5s and remains reported C2 FAIL. Neither function latency,
cache propagation nor Vercel itself is established as root cause. These data
cannot isolate transfer time from origin/render latency without correlated logs.

### One bounded GET-only observation candidate

[production-observer.mjs](../../../scripts/revalidation/production-observer.mjs)
exports a preparation-only operator function; import has no I/O, no CLI autorun,
POST or HEAD. Existing local observer remains unchanged. No production request
was issued. Future execution needs separate Owner authorization and event
coordination; it must not replay the historical204.

Operator must pre-arm and provide trusted signed204 UTC, externally established
clock uncertainty0–100ms and an approved six-target manifest of **distinct
before/after observable timestamps**, IDs and paths. Missing, future or already
expired event windows fail before HTTP. Do not invent markers from publication
time: `Product.snapshotAt` can differ from dashboard snapshot time. Select a
stable product actually present in the selected category's first page in both
revisions; verify exact old/new marker projections beforehand using approved
fixtures/evidence, not additional unbudgeted production reads.

The frozen matrix is RU and KK product for the selected ID, `/sitemap.xml`,
`/ru/catalog`, `/ru/dashboard`, `/ru/collections/<slug>`. Product oracle is
dehydrated query `['product',id]`, matching data.id and data.snapshotAt. Category
oracle is `['products',{category:slug,...}]`, pages containing that exact ID and
snapshotAt. Catalog/dashboard use `['dashboard']` summary.snapshotAt. Sitemap
uses lastmod for exact loc `https://aktau.market/ru/catalog`, not the maximum date
or every product's potentially different lastmod. JSON Flight records are
decoded, never evaluated. Unrelated dates, ETags and cache headers cannot PASS.
Unsupported/missing representation markers stop fail-closed.

**Proposed cap:21 GET total;0 HEAD/POST.** At most4 GET per non-sitemap path,
one sitemap GET only; planned event-relative offsets0/2500/7500/15000ms, minimum
2500ms between starts on each path, maximum6 simultaneous operations (one/path).
No retry after transport/status/marker failure; repeated successful-but-stale
observations are scheduled samples, not error retries. A fresh path stops.
Global stop forbids new admissions after an error; already-admitted operations
remain bounded. Sitemap's single observation deliberately sacrifices later
freshness diagnosis to avoid all-products pagination amplification.

One shared5000ms acceptance window starts at the supplied204, never at a later
poll. Complete-body validation time plus clock uncertainty must be within5s.
Diagnostic continuation ends at20s, cannot change an acceptance FAIL into PASS.
Per-operation wall-clock timeout≤4000ms, additionally capped by the remaining
acceptance/diagnostic boundary. Native HTTPS has fixed origin/TLS verification,
GET only, identity encoding, no redirects, cookie jar, auth or environment proxy.
Bodies bounded at2MiB HTML /4MiB XML; encoded or oversized bodies fail closed.
No body/signature/secret is returned in observations.

Each sample records estimated request start/end UTC from a UTC/monotonic anchor,
monotonic event elapsed start/end, complete-response duration, status, marker
freshness and allowlisted headers only: cache-control, etag, age, vary,
x-nextjs-cache, x-vercel-cache, cf-cache-status, x-vercel-id. Per path: first
response, first fresh elapsed (including late), stale count, fixed failure class
and strict acceptance. Clock bound is an operator prerequisite, not measured
automatically by the helper. Polling yields an upper bound on first freshness,
not an exact hidden cache transition time.

### Actual checks for this iteration

| Command / check | Actual result |
| --- | --- |
| `rtk git fetch origin --prune` | exit0; origin/main now c88ecadd04764875aa9f3a78ad8081b8b04db919; branch/HEAD af2fb7708fdbe96c96cda631b8445c1e83090251 preserved, no merge/reset |
| `node --test scripts/revalidation/cache-observer.test.mjs scripts/revalidation/production-observer.test.mjs scripts/revalidation/verify-part16.test.mjs` | exit0;23/23 PASS: original6+4 preserved,13 new tests |
| `node scripts/revalidation/cache-smoke.mjs` (clean env, loopback production Next server only) | exit0; actual structural marker validation6/6 PASS; sitemap40ms, dashboard155ms, catalog161ms, category164ms, RU166ms, KK168ms; first fresh, stale0 |
| New negative mocks | PASS: stale beyond5s/late fresh, changed ETag with stale body, timeout, redirect, oversized streaming body, missing marker, non200, uncertain/future/expired clock, invalid manifest; no raw error leakage |
| Native HTTPS request mock | PASS: fixed GET/TLS, no credentials/cookies, no redirect follow, body cap, wall-clock timer, safe headers |
| `node --check` changed scripts; Part16 static verifier | exit0 |
| `git diff --check`; six-file allowlist scope check; report Markdown links; bounded credential/private-path scan | exit0; PASS,2 relative links resolve |

Local cache-smoke now additionally validates the new structural oracle against
real Next HTML/XML. Only its synthetic sitemap origin is mapped to the fixed
production loc for this check. Existing application build remains byte-unchanged;
frontend unit/typecheck/lint/build results above remain historical, not rerun or
claimed newly executed for operator-only changes. No new dependencies.

### Vercel logs checklist — read-only Owner action, not performed here

For the same deployment SHA/Ready alias and accepted204 UTC, capture safe
correlation metadata for all six GET paths: request start/end, function/ISR
duration, region, status, deployment and request ID (x-vercel-id). Separate HEAD
and GET, regeneration and served response; correlate HIT/STALE/MISS/REVALIDATED,
Age and cache-control with **body-marker samples**, not ETag alone. Correlate
available upstream API duration without payloads/SQL/secrets. Note concurrent
publication, deployment, regional routing, clock uncertainty and streaming/body
completion. Do not enable debug logging or change cache settings. Absence of
logs remains missing evidence, not proof of a platform defect.

Current candidate scope: cache-smoke.mjs, existing cache-observer.mjs and its
tests, new production-observer.mjs and its tests, this report only. No runtime,
HMAC, API, dependencies, Go, ingestion, DB/schema or historical report changed.
Remote advancement is not claimed tested by this candidate; recheck approved
source/deployment representation and revision manifest before any future run.
Production C2 remains NOT VERIFIED independently / reported FAIL. STOP for review.

## Final observer review corrections — 2026-10-16

**Current readiness: local source candidate ready for Code Review; production
execution BLOCKED pending a trusted event/revision source.** No production C2
PASS claimed. Root cause remains NOT CONFIRMED. Historical Jira evidence and
all earlier candidate/check results above are preserved, not overwritten.

### P0-1: event synchronization and explicit remaining dependency

Added `createEventSource()` to the existing observer module, not another sender.
An operator wrapping an **already authorized existing notification** calls
`begin(publicationId)` just before that request, then `accept204(status)` only
after verifying its actual204, and `observe({publicationId,targets})` once the
expected marker manifest is available. Hook does no network/signing/POST/logging.
Publication ID must match. The process captures monotonic request-start and
response-receipt times itself; actual acceptance is conservatively bracketed
inside that interval. No remote-clock≤100ms precision is invented. UTC is for
correlation; acceptance uses monotonic bounds. Delayed metadata consumes the
original window, never resets it. Missing event, revision delta or usable window
returns INCONCLUSIVE with0 GET. No after-marker is guessed from a random date.

The real local Next smoke now attaches this hook to its **same existing signed
loopback notification**, then uses its dynamically assembled synthetic marker
manifest and all six real Next representations. This proves the operator
interface locally; it does NOT integrate with production's automatic Go sync.

**Exact missing production dependency:** Backend2/Owner must separately approve
and provide a live, publication-correlated event/revision handoff from the
existing successful notification path to the observer. It must supply the
verified204 timing interval and independently established changed marker values
for the same publication, early enough to observe the remaining5s window.
Current automatic Go publisher has not been wired to this JS hook. No event
relay/log access or SSH was authorized or implemented here. This is deliberately
BLOCKED, not a claim that a manual UTC string makes automatic sync observable.
UTC-based inputs (even `trusted204=true`, a UTC string and a claimed zero error)
are no longer accepted: they return INCONCLUSIVE before HTTP. A future remote
event relay needs separately reviewed clock-bound verification; no such relay
exists here. Only captured same-process events are accepted in this candidate.
Unknown/wide bounds prevent PASS; no universal100ms assumption remains.

### P0-2 / P1-1: sitemap and actual catalog marker

Sitemap now permits **two GET at offsets0/2500ms**, only inside the remaining
shared acceptance window, never diagnostic sitemap polling. At most one sitemap
request in flight; no overlapping pagination amplification. First stale followed
by a fresh complete body within5s can PASS. Two early stale bodies alone do not
prove violation at5s: without sufficient evidence the result is INCONCLUSIVE.
If a response times out or lacks the selected marker, no error retry is sent.

Catalog checks BOTH dashboard.summary.snapshotAt and the selected visible top
deal's dehydrated `['product',id]` data.id/snapshotAt. The selected ID must occur
in dashboard.priceSpreads first8, matching current catalog page's `topDealIds`
and individual productQuery prefetch. Fresh dashboard with stale product is not
fresh catalog. Selected product without a known before/after delta makes the
plan INCONCLUSIVE, not false PASS or fabricated FAIL.

Sitemap checks eight exact locs: RU/KK catalog, dashboard, selected category and
selected product. First six lastmod values derive from dashboard.snapshotAt;
product pair derives from that exact Product.snapshotAt, which may differ.
The manifest specifies both independent deltas. This proves freshness of the
**selected C2 matrix entries only**, not all sitemap products/URLs. No max-date,
ETag or unrelated lastmod oracle. Duplicate/missing loc, unsupported Flight or
missing product marker is INCONCLUSIVE. Real local HTML/XML validates this
selector, including catalog's actual top-deal product hydration.

### P1-2 / P1-3: classification, clock bounds and privacy

- PASS: all selected markers match their known after-values, and complete-body
  validation finishes within5s even against the earliest possible accepted204.
- FAIL: with valid event/delta prerequisites, first observed fresh body is
  definitely later than5s, or a valid old-marker sample starts definitely after
  5s. A late fresh diagnostic sample cannot repair acceptance. This is bounded
  observed convergence, not knowledge of an unobserved internal transition.
- INCONCLUSIVE: no reliable event/clock/delta, ambiguous deadline interval,
  missing markers, insufficient complete observations, timeout/transport/status
  error or other measurement failure. Such errors never become PASS. A separate
  independently proved late-path violation still makes the aggregate FAIL.

`Date` added to the safe header allowlist, diagnostic only: it is not proof of
sub-second clock accuracy. Cookies/auth/body/signatures/provider data are never
part of returned observations. Existing fixed-origin GET/TLS, no proxy/cookie
inheritance, no redirects/retries, identity-encoding and streaming body limits
remain. There is no production POST/HEAD capability in the observer.

Caps: **21 GET total** =4 RU product +4 KK product +2 sitemap +3 catalog
+4 dashboard +4 category. Catalog offsets0/2500/7500ms; other non-sitemap paths
0/2500/7500/15000ms. Minimum2500ms start spacing per path; one in flight/path,
maximum6 overall. Requests after an error are not newly admitted. Acceptance is
one event-relative5000ms window; diagnostics stop conservatively by20s against
the earliest event bound. Timeout≤4000ms and remaining phase budget; missing
event/manifest or expired window admits no GET. Read caps remain2MiB HTML/4MiB XML.

### Commands and actual results

| Check | Actual result |
| --- | --- |
| `rtk git fetch origin --prune`; branch/HEAD/origin inspection | exit0; branch fix/part16-c2-cache-convergence; HEAD af2fb7708fdbe96c96cda631b8445c1e83090251; origin/main c88ecadd04764875aa9f3a78ad8081b8b04db919; no merge/rebase/reset |
| `node --test --test-reporter=dot scripts/revalidation/production-observer.test.mjs scripts/revalidation/cache-observer.test.mjs scripts/revalidation/verify-part16.test.mjs` | exit0;33/33 PASS (23 production observer,6 preserved local observer,4 verifier) |
| `node --check` production-observer.mjs, production-observer.test.mjs, cache-smoke.mjs | exit0 |
| `node scripts/revalidation/verify-part16.mjs` | exit0; static boundaries PASS |
| `node scripts/revalidation/cache-smoke.mjs` under clean Node24 environment | exit0; six real Next paths PASS: sitemap37ms, dashboard152ms, catalog159ms, category165ms, RU166ms, KK167ms; first fresh/stale0 |
| Same local signed204 operator integration | PASS6/6,6 GET; captured request/204 interval5.035ms; first freshness181.386–248.725ms after response receipt (upper bounds+5.035ms still<5s) |
| Final cache-smoke after rejecting UTC-only inputs | exit0;6/6 PASS: sitemap36ms, dashboard149ms, catalog154ms, category157ms, RU158ms, KK159ms; operator6/6 PASS,6 GET, measured event interval5.232ms, freshness172.650–239.946ms after receipt |
| `git diff --check`; exact six-file scope; Markdown relative links; bounded secret/private-path scan | exit0; PASS,2 links resolve; no runtime/source change outside diagnostic scripts |

New regressions cover sitemap stale→fresh<5s; fresh dashboard/stale catalog
product; unchanged product witness; absent trusted204; timeout/error not PASS;
ambiguous clock/deadline; shared event window/late metadata; mismatched
publication; actual transport Date allowlisting; persistent stale cap21. Virtual
scheduler now advances simultaneous sleepers together rather than independently
adding each path's delay to a shared fake clock. No production clocks inferred.

Only this report and existing operator/local-smoke JS candidate were updated.
This iteration touched production-observer.mjs, production-observer.test.mjs and
cache-smoke.mjs; cache-observer.mjs and its six tests stayed unchanged. Complete
review scope remains these five JS files plus this one report. No frontend
runtime/source/dependency change, so full frontend checks were not rerun; prior
results remain historical. Previous review archive predates these corrections
and is not claimed current. No new report or production request/action created.

Production execution remains BLOCKED on the precise event/revision handoff
above and separate Owner authorization. Production C2 remains NOT VERIFIED by
this agent / historically reported FAIL. STOP for independent Code Review.

## Final classification correction — append-only, 2026-10-16

Independent review reproduced a false FAIL caused by sparse polling. Removed
`firstFresh > 5000` as a violation predicate. Historical policy/test results above
remain preserved but that specific rule is superseded:

- PASS still requires a known fresh complete marker within5s against the earliest
  possible accepted204 (elapsed from event.end plus full event interval≤5000ms).
- FAIL requires a valid stale body whose GET **started strictly after the latest
  possible accepted204 +5000ms**. `start_elapsed_ms` is already measured from
  event.end, the latest event bound; adding uncertainty here would cause false
  FAIL. A sample exactly at the boundary is not "after" it.
- Late first fresh observation without such a stale sample is INCONCLUSIVE:
  polling only bounds discovery and cannot identify when the cache changed.
  Transport/timeout/marker errors remain INCONCLUSIVE unless another valid
  sample independently proves the above violation; they cannot produce PASS.

Exact change this iteration: one observer classification predicate plus its
explanatory comment; test helper supports a real nonzero captured event interval;
the sparse-polling regression is corrected and two boundary-proof regressions
are added. Only production-observer.mjs, production-observer.test.mjs and this
existing report were edited. All previous candidate files remain preserved.
HMAC/API/ISR/runtime, request scheduling/caps and production handoff unchanged.

| Executed command/check | Result |
| --- | --- |
| `node --check scripts/revalidation/production-observer.mjs` and production-observer.test.mjs | exit0 |
| `node --test --test-reporter=dot scripts/revalidation/production-observer.test.mjs scripts/revalidation/cache-observer.test.mjs scripts/revalidation/verify-part16.test.mjs` | exit0;35/35 PASS (25 production observer,6 local observer,4 verifier) |
| `node scripts/revalidation/verify-part16.mjs` | exit0; static boundaries PASS |
| `node scripts/revalidation/cache-smoke.mjs` (clean Node24 env, loopback only) | exit0;6/6 PASS; sitemap37ms, dashboard145ms, catalog149ms, category152ms, RU154ms, KK155ms; stale0 |
| Same-event local operator integration | PASS6/6,6 GET; event interval4.871ms, fresh168.740–251.105ms after receipt, safely inside5s |
| diff-check, exact scope allowlist, report Markdown links, bounded secret scan | PASS |

Regression evidence: stale GET at0/2500, actual mock cache update3000, first
observed fresh7500 => INCONCLUSIVE. Persistent stale GET at7500 relative to the
**latest** accepted204 with a2000ms event interval => FAIL. Stale request begun
after earliest+5s but before latest+5s, followed by timeout, => INCONCLUSIVE.
Existing cap21 GET, sitemap≤2,5s acceptance,20s diagnostic and no production
POST/HEAD regressions remain passing. No new frontend runtime changes, hence no
full frontend unit/build rerun; no production network/SSH/SQL or publisher hookup.

Source candidate ready for independent Code Review; no commit/push/PR performed.
Production handoff remains **BLOCKED**, and local PASS is not production C2 PASS.
Previous review archive is not rebuilt/claimed current in this narrow task.
STOP for Code Review.

## C2 event-handoff discovery

Status: **BLOCKED** — pending Backend2 agreement on event hooks and revision
provenance, then separate Owner approval. This section is a proposed contract,
not an implemented production integration. Historical FAIL/BLOCKED evidence and
the final sparse-polling classification correction above remain unchanged.

### Baseline, scope and independently inspected source facts

2026-10-16: `rtk git fetch origin --prune` exit0; fresh origin/main and new HEAD
**1c3be58893e764f2e4cb029d9d4b46b31381f11b**. Created separate native-WSL worktree
`aktau-part16-c2-event-handoff`, branch **feat/part16-c2-event-handoff**. Initial
working tree clean. The merged diagnostic observer and its classification fix
are already present. No merge/rebase/reset, reuse of the old diagnostic branch,
or edits in existing worktrees. No AGENTS.md at new worktree root; supplied root
project rules and scoped TODO followed. Frontend runtime was inspected, not edited.

The actual route is:

`daily-sync.sh → cmd/ingest -apply → PublishThenNotify → staged.Publish COMMIT
→ Client.Notify original signed POST → [missing receipt/IPC boundary] → JS observer`.

| Phase/data | Confirmed source fact | What is NOT exposed today |
| --- | --- | --- |
| Daily orchestration | daily-sync.sh scrapes, builds bundle, runs dry-run then apply; systemd oneshot runs as aktau-sync | no observer process, private IPC protocol, event receipt or revision manifest |
| Before publication | ingestion.Staged has public SnapshotID(); private groups/captures/previous; decoded bundle contains source CapturedAt or GeneratedAt fallback | cmd stdout/report contains counts, not snapshot identity or marker vectors |
| Publication | Staged.Publish commits before notification; publishedAt is assigned in SQL using DB clock and previous publishedAt+1ms | Publish returns error only; exact new publishedAt is not returned to cmd |
| Notification | Client.Notify has exactly one fixed HMAC POST,5s HTTP timeout/no redirects; actual response.StatusCode exists locally | method returns only error, discards bounded body; no status/start/receipt callback |
| Existing outcome | Notify accepts **all2xx**; tests include200 and204. PublishThenNotify returns success/degraded and protects committed publication | frontend_revalidation success does NOT prove actual204; ingestion exit0 does not prove C2 readiness |
| JS trust | createEventSource uses its own clock/function identity and module-local WeakSet | serialized Go time.Now/UTC/foreign object cannot be imported as a trusted event |
| Existing public marker | Product.snapshotAt is MAX usable offer.snapshotAt for that product in selected published snapshot | not snapshot ID, not necessarily new publishedAt or changed every publication |
| Dashboard marker | summary.snapshotAt is MAX per-product usable timestamp aggregate | not DB publication time; can remain unchanged with reused/stale source captures |

Source references: [notifier and publication wrapper](../../../backend-go/internal/revalidation/client.go),
[cmd/ingest](../../../backend-go/cmd/ingest/main.go),
[staging/publication](../../../backend-go/internal/ingestion/ingestor.go),
[sync runbook](../../../ops/sync/README.md), and the
[frozen wire/cache contract](../FRONTEND_REVALIDATION.md). No production state,
active unit/timer or deployed source was independently inspected in this stage.

Observed source semantics for revisions: offer.snapshotAt is inserted from the
per-store source capture time, with bundle.GeneratedAt fallback. It is not the
publication timestamp. Stable canonical IDs may be reused, captures may be old,
and top-deal ranks/first-page membership can change. The current schema and
existing cmd summary therefore do **not** supply a qualified six-path manifest
for free. No actual next publication's stable/changed witness is established.

### Alternatives and recommendation — PROPOSED, not approved

| Approach | Benefit | Boundary/cost | Decision |
| --- | --- | --- | --- |
| Pre-armed JS observer + causal private IPC with Go | retains existing Flight/XML parser and bounded GET runner; all clock bounds captured in JS | requires new opt-in Go receipt/handshake hooks and approved orchestration, plus marker provenance | recommended for Backend2 agreement |
| Go-native co-located measurement | notifier/GET timestamps can share one monotonic clock | would duplicate or port JS Flight/XML extraction, measurement caps/tests and touch pipeline; no evidence this is smaller | not implemented; alternative only |
| Post-hoc Go/Vercel UTC log correlation | useful duration/region/cache diagnostics | current log has no actual status or interval; wall-clock offset/delivery uncertainty cannot be assumed≤100ms | cannot by itself close strict C2≤5s |

No local cross-process PoC was added: current Go has no hook that can causally
gate its original send and attest its receipt. Fabricating that signal in JS or
parsing `outcome_class=success` would bypass the very incompatibility under
review. This is the explicit discovery STOP condition, not a failed cache test.
Existing local same-process mock tests are runnable and checked below; they do
not prove the proposed Go/JS handoff.

### Proposed minimal causal protocol for Backend2 review

1. Owner authorizes observation of one **legitimate** publication, not a replay,
   extra sync or second signed POST. Backend2 owns publisher integration and
   pre-arms the JS child/companion using private inherited pipes before Notify.
   No public listener, socket exposed to other users, secret transport, queue or
   scheduler. Descriptor/process ownership and go-run child inheritance need
   local verification before choosing the concrete launcher.
2. A run-local attempt identifier and `staged.SnapshotID()` correlate PREPARE,
   COMMIT-success, READY, RESULT and the marker manifest. Same snapshot can have
   different notification attempts; bind both identifiers. They are local
   metadata, never extra fields in the fixed public HMAC body. Event/status
   messages must come from the trusted owned process/pipe, not arbitrary JSONL.
3. Immediately before the existing HTTP send, Go sends PREPARE. JS calls
   `source.begin(attemptId)`, records monotonic **A**, then sends READY. Go must
   receive that matching READY before starting its **one original** HTTP request.
   JS's local arm object remains inside its WeakSet; it does not import a Go
   timestamp. Publication must already be committed before the POST.
4. After the original response is received, Go sends a bounded RESULT containing
   matching run/snapshot/attempt, actual integer http_status and a fixed
   transport/outcome class. No body, URL, auth/signature/timestamp headers, DSN or
   secret. For verified status204 and no transport failure, JS records monotonic
   **B** and calls `source.accept204(204)` at receipt. Preserve identity checks
   before this transition. A RESULT for200/201/202/206 is **not** a C2 event,
   even though existing Notify must continue treating those statuses as success.
5. Causality gives **A ≤ original HTTP send ≤ actual204 ≤ Go receive ≤ B**.
   JS measures the full A..B interval, including IPC/scheduling/transport delay;
   no Go-vs-Node clock comparison or guessed precision. The widest plausible5s
   deadline is B+5000ms; conservative PASS needs fresh body by A+5000ms. FAIL
   needs valid stale GET **started after B+5000ms**. Late first fresh alone is
   INCONCLUSIVE. Unknown, broken, reversed, expired or overly wide bounds admit
   no acceptance claim. UTC remains correlation-only.
6. Observer begins GET only with matching committed publication, verified204,
   and a complete independently justified before/after manifest. A late manifest
   consumes the same A..B event window, never starts another5s. Missing or
   unchanged witness means INCONCLUSIVE/no GET, not a forced PASS/FAIL. Duplicate,
   unrelated, out-of-order or replayed messages must not create a second run.

This handshake is **not currently wired**. Observer readiness/failure must not
become a condition for committing data, retrying publication or changing the
legacy notification success/degraded classification. Any waiting/IPC must be
bounded and observation opt-in; preserving the existing5s notification budget
without extending it or consuming it with a blocking observer is an explicit
Backend2 design gate. If safe READY cannot be established, abandon measurement
and perform the original notification under its existing policy. Do not send an
extra notification to obtain a better measurement. After send, pipe loss or
timeout produces INCONCLUSIVE; committed snapshot stays committed.

### Manifest provenance and bounded evidence — also awaiting agreement

Require a versioned local manifest bound to run/snapshot/attempt, source Git
revision and verified frontend deployment. Its six targets retain the current
fixed URL forms and expected.before/after fields; catalog additionally requires
the selected visible top8 product's productBefore/productAfter, sitemap requires
both snapshot and product marker pairs plus the exact category/product locs.
IDs/slugs must meet the existing allowlist. Different selected product IDs per
target are allowed only if each is explicitly qualified; never silently replace
one after observation. The current manifest has these data slots but no producer.

**Before source:** an independently captured, snapshot-bound previous marker set
with known top-deal/first-page membership, from an approved existing audit/read
context. **After source:** a qualified projection of the committed snapshot's
public usable set using the same existing repository semantics, not the cached
frontend being measured. Available staged group/capture metadata alone does not
prove dashboard rank or category pagination; do not duplicate SQL/ranking logic
in a new generic calculator. SnapshotID can correlate the run but cannot replace
the actual Product/dashboard snapshotAt values.

Backend2 must confirm whether it already has these projections. If not, the
additional bounded **read-only** acquisition and its precise timing/role/request
budget require separate review; no new SQL/API requests are implemented or
authorized here. Any reads would be outside the publication transaction. Exact
new publishedAt, if needed for correlation, also needs an approved source rather
than pretending Publish returned it. No schema/index/cache/public DTO change.

The selected product must actually change and remain in both relevant rendered
sets. RU/KK share product data but require two complete HTML bodies. Catalog
checks dashboard plus its real selected product. Sitemap covers only eight
exact matrix locs: RU/KK catalog, dashboard, category and product; first six
lastmod use dashboard summary timestamp, last two product timestamp. These can
differ. Do not claim all sitemap URLs fresh. If no qualified changed witness
exists for a normal publish, record INCONCLUSIVE, never change production data
merely to manufacture a marker delta.

Concurrent publications or deployment changes invalidate attribution. Backend2's
session advisory lock protects its staging/publication run, not automatically
the entire20s observer period after the CLI exits. Require coordinated exclusion
or a separately approved revision check with its own bounded budget; do not add
unbudgeted GET/SQL or prolong a production lock here.

Recommended evidence destination: Owner-selected private operator directory
outside Git/backups/secrets, directory0700/file0600; one bounded JSONL per run,
proposed maximum64 records/128KiB. Retain protocol version, correlation IDs,
source/deployment revision, actual status, JS A/B bounds and current allowlisted
GET measurements/decision only. No raw HTML/XML, cookie/auth/signature, provider
or source payload. Final write/close and custody need explicit operator checks;
I/O loss means evidence INCONCLUSIVE, not silently durable PASS. No file/FD/
directory was provisioned in production. No log stream is itself a trusted relay.

Keep current limits:≤21 GET,≤2 sitemap GET,≤6 concurrent with one/path, per-path
spacing≥2500ms, complete-body cap2MiB HTML/4MiB XML, timeout≤4s/remaining budget,
no redirects/error retries/cookies/auth/proxy inheritance, acceptance5s and
diagnostics≤20s. Observer sends0 POST/HEAD. No automatic second observation after
a duplicate receipt, failed measurement or loss of manifest.

### Concrete questions and later file scope

Backend2 answers required before implementation:

1. Is opt-in causal PREPARE/READY/RESULT around the **existing** single notifier
   HTTP operation acceptable, with actual204 distinct from generic2xx? Which
   owned process/FD arrangement works with current `go run ./cmd/ingest`?
2. Can SnapshotID and one attempt ID be supplied to both ends after confirmed
   COMMIT, without exposing secrets or changing current stdout consumers?
3. Where do qualified old/new Product/dashboard markers and membership/rank
   evidence already exist? If absent, what precise read-only acquisition is
   acceptable before the event, without measuring the cache against itself?
4. How are observer startup/handshake bounded without changing the original
   notification timeout, exit codes,2xx semantics or publish atomicity?
5. Who coordinates concurrent publish/deploy exclusion, evidence custody and
   any separately authorized preflight reads? How are loss/duplicates reported?

After agreement, likely narrow changes: backend-go/internal/revalidation/client.go
and its tests for optional receipts/hooks around the same send; cmd/ingest/main.go
and appropriate CLI tests for publication correlation; new private IPC adapter
beside scripts/revalidation/production-observer.mjs with mock tests, preserving
its trusted same-process event creation. Any daily-sync.sh launcher or ops/sync
unit adjustment belongs to Backend2 and needs its own approved scope; avoid it
if cmd can safely own the child. A new ingestion metadata/read accessor would
be separately reviewed **only if needed**, not assumed. No frontend/API/schema
change, new dependency, secret/env change or new HMAC webhook is proposed.

### Actual local checks and readiness

| Executed check | Exit/result |
| --- | --- |
| `rtk git fetch origin --prune`; new worktree/branch/base/initial status | 0; clean main-based worktree at1c3be58893e764f2e4cb029d9d4b46b31381f11b |
| `node --check scripts/revalidation/production-observer.mjs` | 0 |
| `node --test scripts/revalidation/production-observer.test.mjs scripts/revalidation/cache-observer.test.mjs scripts/revalidation/verify-part16.test.mjs` under clean Node24.10.0 environment | 0;35/35 PASS,0FAIL,0SKIP |
| `node scripts/revalidation/verify-part16.mjs` | 0; static boundaries PASS, not deployment evidence |
| Inline assertions against unchanged createEventSource API, mock clock only | 0;7/7 PASS: reject200/201/202/206/503, duplicate204, unrelated publication;0 HTTP |
| Cross-process Go/JS IPC PoC / notifier hook tests | NOT IMPLEMENTED / BLOCKED on agreed Backend2 hook; no simulated UTC trust bypass |
| Go tests / full frontend tests / local Next cache-smoke | NOT RUN in this stage; no executable source change or new dependency; historical results above not re-claimed |
| `rtk git status --short`; `rtk git diff --check`; `rtk git diff --stat`; scope/links/bounded scan | exit0; only this report modified; append-only,7 relative links resolve, bounded scan PASS |
| Historical report preservation | full pre-existing HEAD report prefix byte-identical; other tracked reports/source unchanged |

Only this existing report is edited, append-only. No executable PoC/new source
is necessary or justified before Backend2 answers; existing tests exercise the
present fail-closed boundary, not an imagined integrated system. Required future
PoC coverage remains actual204 versus other2xx, degraded/timeout, duplicates,
unrelated publication, missing/unchanged markers, interval/expiry, late-fresh
INCONCLUSIVE, proved late-stale FAIL,0 GET without trusted handoff, cap21 and no
extra POST. Those integration claims are pending, not inherited from unit PASS.

Next gate: independent Code Review of this proposed handoff → Backend2 agreement
on hooks/revisions/budgets → Owner authorization of a narrow source PR/local PoC
→ separate release/production read-only observation permission. No implication
that agreement authorizes VPS/deploy or a new test publication. C2 stays OPEN,
historical reported FAIL, until three consecutive trustworthy production
observations≤5s under the agreed Jira gate or an explicit written Owner SLA
decision. Production root cause remains unproven. No production HTTP/SSH/SQL,
sync/ingest/systemctl/timers, Vercel/Cloudflare/env/secrets, Backend2 code/branch,
commit/push/PR/merge or deployment action. STOP for independent Code Review.

## Local Go/FIFO/Node handoff — Backend2-approved local candidate

2026-10-16. **Local candidate: READY_FOR_EXTERNAL_REVIEW. Production readiness:
BLOCKED; production C2 remains OPEN.** This append-only section supersedes the
earlier proposed PREPARE/READY handshake, not its historical evidence. Owner
supplied `C2_BACKEND2_EVENT_REPLY.md`; read the actual file in the main checkout's
local TODO directory after initially stopping for its missing path. Its approval
covers local implementation/tests only, not rollout, drop-in or VPS observation.
Worktree/branch/base unchanged from discovery above; pre-existing report edits
preserved. No other worktree was edited.

### Implemented opt-in boundary

`WithTrace(func(Attempt))` is configured before client use. With nil trace,
Notify does not read boot/monotonic clocks or relay. Enabled trace records Linux
CLOCK_MONOTONIC immediately before `http.Client.Do` and immediately after it
returns headers, before draining the existing bounded body. Callback receives
actual status, decimal-ns strings, boot ID and fixed error class only. It copies
the receipt in cmd/ingest; FIFO I/O occurs **after PublishThenNotify returns**,
outside DB transactions and the notification deadline. Callback panic is contained;
callbacks must remain bounded (the installed callback is a struct assignment).

Original `Notify(ctx) error`, any2xx-success rule, errors, HMAC/body/URL, no retry,
5s client/context timeout and PublishThenNotify's committed-publication protection
are unchanged.200 succeeds for Notify but is INCONCLUSIVE for C2;204 is the only
admitted C2 status.401 and timeout remain degraded without undoing publication.
No extra signed POST, IPC handshake, DB query or transaction was introduced.

In the one-shot apply command only, absent `C2_EVENT_FIFO` disables all new trace/
relay work. When explicitly configured, a fresh random attempt ID is paired with
existing staged.SnapshotID(). Failed publication exits before relay. After a
successful publication the receipt is attempted once; sent/skipped is the only
new log outcome. FIFO path, IDs, boot ID, clocks, payload and secrets are not
logged there. No production env/settings or examples were changed/activated.

Version1 wire event has exactly: version, snapshotId, attemptId, status,
startMono, endMono, bootId, errorClass. Ns are decimal strings, never JSON numbers.
No captures, prices, product data, headers, URL, DSN or credentials are emitted.
Captures alone would be misleading as a qualified product witness.

Linux relay requires a private owned0700 parent, no symlink ancestors and no
untrusted writable ancestor (root-owned sticky temp directories excepted).
FIFO must be current-euid owned, mode0600. Directory-relative openat uses
O_NOFOLLOW/O_NONBLOCK/O_CLOEXEC; fstat checks inode/device/mode/owner against the
validated FIFO. Payload including one newline≤4096bytes, one write only.
ENXIO/EAGAIN/missing path/invalid object/full pipe/short write yields skipped;
no write retry or blocking wait for reader. Non-Linux build-tag stub always
skips and cannot fabricate monotonic receipt evidence.

### Node adapter, trust and measured clocks

`fifo-adapter.mjs` opens only an explicitly supplied, owned private FIFO, validates
type/permissions/ancestors and descriptor identity, and polls nonblocking with a
bounded wait (default2s, explicit local PoC timeout scenario8s). It accepts one
complete canonical JSON line≤4096bytes. Missing newline/partial write, duplicate
JSON key, trailing/extra records, oversized data, unknown keys/version, wrong
snapshot/attempt/boot, duplicate consumed attempt, invalid ordering, expired
receipt or unverified manifest cannot admit GET. Replay ledger is capped256,
then fails closed. Descriptors close in finally. No raw message/body is logged.

**bootId is not authentication.** Trust rests on the owned private directory/
FIFO, descriptor checks and expected snapshot/attempt. Same euid and root are
trusted; a FIFO cannot attest writer PID/executable. A compromised same-UID
process is outside this boundary. Production permission, process/time-namespace
and operator-context checks still require separate authorization/review.

Clock calibration executes the reviewed local Go probe five times, bracketing
each CLOCK_MONOTONIC sample with Node24 hrtime.bigint(). It intersects observed
offset intervals, requires consistent boot IDs/overlap including zero and width
≤100ms, and accepts only its own in-memory calibration object (not supplied
JSON). Calibration expires after60s and is rechecked on receipt. This is local
evidence, not a claim that bootId alone proves clock equality across namespaces.

Recorded local run: measured Go→Node offset interval **[-3992600,+549399]ns**, width
**4541999ns (4.542ms)** across5 samples; no zero-uncertainty assumption. Prior
successful run interval[-4107501,+535400]ns, width4642901ns. Bounds include process
startup/scheduling, not just timer resolution; they are not benchmark promises.
Production must recalibrate in its approved execution context; calibration from
this WSL host is not portable to VPS or another boot/time namespace.

Event times stay BigInt until subtraction of a local anchor and validation of
bounded relative durations. Bounds are rounded outward by≤1us at conversion to
the existing observer's millisecond clock. Request interval and clock mapping
uncertainty remain in that interval. Receipt age/delivery delay is consumed,
never reset to FIFO arrival. On that private validated boundary only, adapter
reconstructs begin/accept204 via an injected clock in the existing same-process
createEventSource; **production-observer.mjs is byte-unchanged**. No generic
foreign event constructor, parser rewrite or raw UTC trust bypass was added.

Acceptance remains fresh complete markers by earliest possible204+5s. FAIL needs
valid stale GET started after latest possible204+5s; late first fresh alone is
INCONCLUSIVE. Uncertain/missing data remains INCONCLUSIVE. Caps21 GET /2 sitemap,
one in flight per path, shared5s acceptance and≤20s diagnostics are inherited
unchanged; actual-adapter persistent-stale test exhausted exactly21 mock GET
and2 sitemap reads in about15s, within20s. Observer has no POST/HEAD sender.

### Fixtures and remaining production blockers

Local fixture manifest derives selected ID/category/membership from approved
frontend mocks, confirms selected top8 spread/first-page membership and assigns
explicitly synthetic distinct after-markers. Dashboard and product timestamps
are deliberately different; sitemap checks their respective eight exact locs.
This is test-only data, never a production manifest or new production SQL.
The fixtureOnly flag requires an explicitly injected test GET transport; without
one the adapter returns INCONCLUSIVE/0 GET, preventing accidental public reads.

Regression shows identical per-store capture map with two different product
memberships produces two different product maxima. A captures-only manifest is
rejected with0 GET. Captures also do not establish frontend rank or first-page
membership, and reused capture times can leave a marker unchanged. No current
production before/after witness, stable membership, frontend deployment or
concurrent-publication exclusion was observed in this stage.

Remaining gates: Backend2 reviews these exact source hooks/transport; Owner
separately approves any release and FIFO/operator setup; approved read-only
provenance supplies complete snapshot/attempt-bound before/after targets without
self-validating against the cached frontend; verify same clock context and
private ownership on the actual host, coordinate publish/deploy exclusion.
No drop-in, timer, service, env, FIFO or listener was created on VPS. No new
publication, replay notification, production HTTP/SSH/SQL, ingest, image build,
deployment, commit/push/PR/merge. C2 closure still requires the previously agreed
trustworthy production observations or explicit Owner SLA decision.

### Exact review scope

- backend-go/cmd/ingest/main.go
- backend-go/go.mod
- backend-go/internal/revalidation/client.go
- backend-go/internal/revalidation/relay.go
- backend-go/internal/revalidation/relay_linux.go
- backend-go/internal/revalidation/relay_other.go
- backend-go/internal/revalidation/relay_linux_test.go
- backend-go/internal/revalidation/trace_test.go
- backend-go/internal/revalidation/testdata/relayprobe/main.go
- scripts/revalidation/fifo-adapter.mjs
- scripts/revalidation/fifo-adapter.test.mjs
- scripts/revalidation/fixtures/c2-manifest.mjs
- this existing PART_16_C2_CACHE_CONVERGENCE_REPORT.md

Only existing golang.org/x/sys v0.48.0 moves indirect→direct; tidy adds no
dependency/version/checksum drift, go.sum unchanged. No systemd/daily-sync,
ingestor SQL, schemas/migrations, frontend runtime, API/DTO/HMAC/ISR, production
env/secrets or other Backend2 source was changed. Local probe binaries are outside
Git and not a Docker image or deployable production release. Test-owned FIFOs/
directories are cleaned by test finally/after; pre-existing resources untouched.

### Actual verification, including initial failures

First new Node run:52/53 PASS, unordered-event negative fixture FAIL because its
future timestamp was computed when registering tests, before the5s timeout
scenario. Fixed fixture to compute at execution time; no acceptance rule relaxed.
First focused Go race run FAIL: new test-only HTTP counter was unsynchronized.
Replaced new test/probe counters with atomics. Full race suite then PASS.

Commands below use clean process environments (Go auto-selected module toolchain
1.27.2; Node24.10.0), no private config or external provider credentials. Local
Go probe is built outside Git from testdata; no cmd/ingest execution or DB access.

| Command/check | Actual result |
| --- | --- |
| `go build -o <owned-temp>/relayprobe ./internal/revalidation/testdata/relayprobe` | exit0; local helper only |
| `C2_LOCAL_PROBE=<owned-temp>/relayprobe node --test scripts/revalidation/fifo-adapter.test.mjs scripts/revalidation/production-observer.test.mjs scripts/revalidation/cache-observer.test.mjs scripts/revalidation/verify-part16.test.mjs` | final run56/56 PASS,0FAIL,0SKIP:21 FIFO/PoC +35 existing |
| Real Go→httptest HTTP→private FIFO→Node:200/204/401/timeout | PASS; exactly1 loopback POST each; publish true for all, success for200/204, degraded for401/timeout; only204 admits6 fixture GET, others0 |
| No reader/crashed receiver | PASS; notification/publication success, relay skipped,1 loopback POST |
| Go relay tests | PASS: missing/no reader, atomic payload, injected short write/error, full pipe, regular file/symlink/unsafe permissions |
| Node negative/security/cap tests | PASS: bad boot/unordered/delayed/wrong snapshot+attempt, duplicate, missing event, incomplete/duplicate-key/oversized/extra metadata, fake calibration, unchanged marker, wrong manifest, unsafe FIFO;0 GET on invalid handoff; cap21/sitemap2 |
| `go test -count=1 ./...` | exit0; all normal packages PASS; external DB/live integrations not claimed |
| `go test -race -count=1 ./...` | exit0; full race suite PASS after counter fix |
| `go vet ./...` | exit0 |
| `go tool staticcheck ./...`; `go tool staticcheck -tags=integration ./...` | both exit0; pinned module tools |
| `go tool govulncheck ./...` | exit0; No vulnerabilities found |
| `go mod tidy`; `go mod verify` | exit0; existing x/sys promotion only; all modules verified |
| `GOOS=windows GOARCH=amd64 go test -c -o <owned-temp>/revalidation-windows.test.exe ./internal/revalidation` | exit0; safe non-Linux stub compiles; Windows runtime NOT RUN |
| `gofmt -l` changed Go files; `node --check` adapter/tests/fixture/unchanged observer; Part16 static verifier | exit0; gofmt empty; static boundaries PASS |
| `node scripts/ci/check-source.mjs` | exit0;612 safe source files, immutable migration check PASS; bounded patterns only |
| Final fetch/branch/base check | exit0; HEAD=origin/main=1c3be58893e764f2e4cb029d9d4b46b31381f11b; current feat/part16-c2-event-handoff |
| Diff/scope/Markdown/bounded secret scan/preservation | exit0;13-path allowlist PASS,7 links resolve; HEAD report prefix byte-identical and append-only; observer/frontend/SQL/pipeline/ops/contracts/CI/go.sum unchanged |

Full frontend/build/cache-smoke and PostgreSQL integrations were NOT rerun: their
runtime sources/schema/observer are unchanged and no DB/profile was authorized.
Source candidate ready for independent Code Review; **production readiness
remains BLOCKED**, not inferred from fixture PASS. STOP.
