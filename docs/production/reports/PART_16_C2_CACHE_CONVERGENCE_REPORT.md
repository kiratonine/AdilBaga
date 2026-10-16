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
