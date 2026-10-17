# Frontend Analytics — GA4 + Yandex Metrica

Status: **READY_FOR_EXTERNAL_REVIEW**.

2026-10-17. Local source candidate only. No production action, real analytics
hit, credentials access, commit/push/PR/merge or deployment performed.

## Baseline and scope

`git fetch origin --prune` exit0. Fresh origin/main and new worktree HEAD:
**3103c28372e3b44b7d7949b854704984aec7eb3c**. Separate native-WSL worktree
`aktau-frontend-analytics`, branch **feat/frontend-analytics**, initially clean.
No reuse/change of C2 or other existing worktrees. Read the complete Owner task
v2, supplied root rules, frontend/AGENTS.md, installed Next16.3.8 App Router
script/usePathname documentation and requested layout/config/navigation sources.
No pre-existing analytics implementation found in frontend/src.

Owner reports the two Production IDs are already configured in Vercel. Their
values/settings were not requested, read or independently verified. Exactly two
optional public build-time settings are used: NEXT_PUBLIC_GA_ID and
NEXT_PUBLIC_YANDEX_METRIKA_ID. **No new enable flag or other env was added.**
No dependency, lockfile, packageManager or CI changes.

## Implementation

- One invisible client Analytics component in the existing `[lang]/layout.tsx`,
  outside Providers. No second root layout, SEO or visual/UI changes.
- Shared pure validation: bounded uppercase ASCII GA4 G-ID; positive decimal
  Metrica ID up to12 digits, safely representable as a number. Missing/invalid
  config independently skips that provider; arbitrary env text is never inserted
  into executable inline code. CSP uses the same validators.
- Browser-only effect checks exact canonical HTTPS origin, rejects localhost /
  Vercel preview, and accepts only bounded existing public RU/KK route forms.
  SSR emits no analytics script. Script elements mount only after init and the
  first manual view have been queued; `next/script` afterInteractive performs
  loader deduplication. No @next/third-parties/GTM/dependency installation.
- Per-document provider ID/last-path state survives StrictMode, rerenders and
  layout remounts. A→B→A records three views; unchanged pathname, query/hash-only
  updates and repeated effects do not create another view. A full document load
  starts a new document/view, as expected.
- GA uses the standard arguments/dataLayer queue, send_page_view=false, manual
  page_view only. Global safe page fields are updated for each pathname; title
  is the fixed public brand, referrer is only the previous safe application path
  (or canonical root initially), location is canonical origin+pathname. Google
  signals/ad personalization signals disabled. No query, hash, external referrer,
  document.title, search phrase, coordinates, session payload or custom events
  are passed by this application integration.
- Metrica uses its standard arguments queue and loader timestamp. Init has
  defer=true; Webvisor, clickmap, trackLinks, trackHash, accurateTrackBounce and
  ecommerce disabled, sendTitle=false. Manual hit includes only sanitized URL,
  previous safe path/root and fixed brand title. No noscript pixel or goals.
- A blocked loader leaves the queued commands without affecting the app;
  exceptions from either provider do not break navigation or the other tracker.
  No analytics failure logging or new application API requests.

The Next/performance skills informed the isolated client boundary and deferred
scripts; visual/brand changes and unrelated skill telemetry were outside scope.
Owner's explicit next/script/no-new-dependency requirement takes precedence over
the optional third-parties package recommendation in generic guidance.

## CSP boundary

No IDs means the original CSP/header output is unchanged; invalid IDs likewise.
Existing API/image/tile permissions and Referrer-Policy:no-referrer remain.
Configured GA permits script only from www.googletagmanager.com, and connect/img
collectors www.google-analytics.com and region1.google-analytics.com. Configured
Metrica permits script/connect/img only from mc.yandex.ru. Image collector origins
allow the SDKs' image-transport fallback; no application noscript pixel exists.
All are exact HTTPS origins, conditional per validated provider. No wildcard,
blanket https:, unsafe-eval, frames, Webvisor domains or header-policy rewrite.

Primary references inspected:

- [Google manual pageview guidance](https://developers.google.com/analytics/devguides/collection/ga4/views?technology=websites): disable automatic configuration views; Enhanced Measurement history tracking can still duplicate manual views.
- [Google CSP guidance](https://developers.google.com/tag-platform/security/guides/csp): collectors and loaders require appropriate directives; only the selected exact origins are allowed here, not its full optional-feature list.
- [Metrica initialization](https://yandex.com/support/metrica/en/code/counter-initialize): defer and tracking/title options.
- [Metrica SPA integration](https://yandex.com/support/metrica/en/code/counter-spa-setup): deferred initialization plus explicit hit URL/referrer/title.
- [Metrica CSP guidance](https://yandex.com/support/metrica/en/code/install-counter-csp): basic tag/collector permissions, without enabling replay/frame integrations.

The local browser verifies our loader/collector paths under the actual Next CSP,
NOT all opaque behavior or regional fallback destinations of real vendor SDKs.
No unobserved origins were opened speculatively. If production monitoring later
shows another required basic collector, review that exact origin separately.

## Actual tests and environment

Native WSL, Node24.10.0, pnpm10.32.1, locked Next16.3.8/React19.3.0. Clean
subprocess env; no production IDs/secrets loaded. Dummy IDs only. HTTP builds
point at an unused loopback API address: build does not call production/API.
Browser tests use the existing explicit test-only mock mode, not runtime fallback.

| Executed command/check | Exit / actual result |
| --- | --- |
| `pnpm install --frozen-lockfile` | 0; existing lock graph unchanged, no dependency additions |
| Focused Vitest analytics/component/security-header tests | 0;17/17 PASS |
| `pnpm typecheck` with explicit local HTTP/site config | 0; route types + tsc PASS, including E2E source |
| `pnpm lint` | 0;0 errors,2 warnings: pre-existing freshness.ts and the new explicit effect→loader gate in Analytics.tsx; no lint rules disabled |
| `pnpm test` | 0;41 files /228 tests PASS; includes existing17 webhook/security, sitemap/SEO/OSM and all new analytics tests |
| `pnpm build`, HTTP mode without either ID | 0; production build PASS, existing route/ISR structure retained |
| `pnpm build`, same HTTP config with both dummy IDs | 0; production build PASS, no real analytics requests |
| `PW_CHANNEL=chrome` + two dummy IDs + canonical site URL, `pnpm exec playwright test e2e/analytics.spec.ts --workers=1` | final exit0;6/6 PASS, desktop + iPhone Chromium emulation; existing Playwright webServer also builds/starts local production-mode Next |
| `pnpm audit --prod` | 0; No known vulnerabilities found |
| Independent transpiled HEAD-vs-candidate header comparison, no IDs | 0;4/4 byte-identical controls (API absent/present × testMocks false/true) |
| `node --test scripts/revalidation/verify-part16.test.mjs` | 0;4/4 PASS |
| `node scripts/revalidation/verify-part16.mjs` | 0; existing boundaries PASS, not production freshness evidence |
| `node scripts/ci/check-source.mjs` | 0; source/security and immutable migration bytes PASS |
| `git diff --check`, exact scope, report links, bounded privacy/secret scan | PASS; no staged files, protected source/lockfiles unchanged |

Initial unconfigured `pnpm typecheck` exited1 at the existing explicit API-mode
config gate; rerun with the approved local HTTP config passed. This was not
fixed by weakening production configuration. First default browser attempt could
not launch absent Playwright Chromium revision1243; used already-installed Chrome
through existing PW_CHANNEL, no browser/dependency installation. Early interception
runs exposed test lifecycle errors (disposed/already-handled RSC responses).
The helper now drains handlers before teardown, buffers local responses, and
ignores only failed/cancelled browser RSC requests; active request failures still
fail. Final6/6 includes zero pageerror assertions. No product code/cache/prefetch
policy changed to make those harness errors disappear.

The additional credentialed-URL regex initially flagged the existing synthetic
negative fixture in security-headers.test.ts. Confirmed that exact literal also
exists in HEAD; allowed only that known test fixture, not arbitrary credentialed
URLs. The bounded scan then passed. No real credential was found or printed.

Next logged `The destination stream closed early` during the local intercepted
navigation/teardown runs. All final page/analytics assertions passed; these
server messages are recorded, not presented as proof of a production defect or
fully diagnosed framework behavior. No timeout/dependency changes made.

### What the browser test actually proves

All apparent canonical-origin requests are explicitly intercepted and fulfilled
from the loopback Next server; third-party libraries are synthetic stubs and
collector requests are intercepted/fulfilled locally. Other external requests
(including map/images) are blocked. **No production HTTP or real analytics hit.**
Tests verify initial view queues survive a deliberately delayed loader; exactly
one loader/provider and one view/provider for each real RU/KK and Back/Forward
pathname transition; no query content in collected payloads; unchanged-path
history updates do not create views; blocked scripts preserve visible navigation;
localhost with production canonical config loads no counters; allowed collector
transports produce no analytics CSP violations. Unit controls cover no IDs,
single provider, both IDs, malformed/injection values, StrictMode/remounts,
noncanonical/preview origins and throwing providers. This is integration of our
code with real Next/browser routing, not proof vendor dashboards receive visits.
iPhone is browser emulation, not a physical device test.

## Exact changed files

- frontend/src/app/[lang]/layout.tsx
- frontend/src/components/analytics/Analytics.tsx (new)
- frontend/src/components/analytics/Analytics.test.tsx (new)
- frontend/src/lib/analytics.ts (new)
- frontend/src/lib/analytics.test.ts (new)
- frontend/src/lib/security-headers.ts
- frontend/src/lib/security-headers.test.ts
- frontend/next.config.ts
- frontend/e2e/analytics.spec.ts (new; explicit dummy-ID local profile only)
- frontend/.env.example (only the two empty optional public ID names added)
- frontend/README.md
- this FRONTEND_ANALYTICS_REPORT.md (one new report)

No changes to Backend2, Go/Nest, PostgreSQL/schema, ingestion, C2, Redis/Siri,
API/DTO, ISR/tag/HMAC, robots/sitemap/SEO functions or metadata, GitHub workflows,
production env, Vercel settings, DNS or Cloudflare. Existing test-only mock flags
are reused by the browser harness, not introduced as analytics activation flags.
Ignored builds/test-results are not part of review source. No commit/push/PR/merge.

## Owner verification after review and separately authorized release

1. Confirm only names/scopes: both existing NEXT_PUBLIC IDs are available to
   Vercel Production build. No need to share values or create another flag.
2. GA4 Web stream Enhanced Measurement: disable history-based page changes to
   avoid duplicate pageviews. Disable other enhanced automatic events/form
   interactions for pageviews-only scope; leave automatic user-provided-data,
   advertising and custom event integrations off. Metrica goals/Webvisor remain
   out of scope. These dashboard settings were not inspected/changed here.
3. After review → authorized source integration/CI/release, a new Production
   build is necessary for public env IDs to be embedded. Do not enable mocks.
4. In a real browser without adblock, verify Network/Console then GA4 Realtime
   and Metrica live visits: initial RU/KK, navigation, Back/Forward, query-only
   change without another view; safe URL/title/referrer fields, no unexpected
   collector CSP errors. Script presence/deploy success alone is not delivery.
5. Search Console/Yandex Webmaster, DNS verification and production changes
   remain separate Owner tasks. External blocking is a measurement limitation,
   not permission to weaken CSP or make application rendering depend on analytics.

**STOP for independent Code Review.** Local candidate ready; real vendor
delivery and current Production configuration remain NOT VERIFIED by this task.

## Production Pilot Analytics — preflight STOP, 2026-10-17 (append-only)

**Current pilot-stage status: BLOCKED — PILOT_WEBVISOR_FRAMING_DECISION_REQUIRED.**
This is not a reversal of the earlier basic-pageview candidate review. Owner
now reports GA4, Metrica, Search Console and Webmaster connected and working;
that production evidence is Owner-reported, not independently tested here.
The two-month pilot implementation is NOT complete. Earlier report bytes and
test history above remain unchanged.

### Fresh baseline, inspected scope

Fetched origin with prune, exit0. Fresh origin/main and new HEAD:
**c7b9fee979a6ee481ba4b00c8bdd6551a728d2d8** (merged analytics PR #36).
Created separate native-WSL worktree aktau-frontend-pilot-analytics / branch
**feat/frontend-pilot-analytics**, initially clean. Other worktrees, including
C2 and the original analytics branch, were not changed. No reset/rebase/merge.

Read the full pilot task, supplied project rules, frontend/AGENTS.md, installed
Next16.3.8 script/usePathname documentation, current analytics/CSP/config/layout
and tests, requested Search/Category/Product components and DTO/query helpers.
Existing analytics still uses manual pageviews, send_page_view=false and defer;
Webvisor/clickmap/trackLinks are false. No second init or counter was added.

### Part A security conflict: documented playback path versus current policy

Verified source: frontend/src/lib/security-headers.ts emits
`frame-ancestors 'none'` and `X-Frame-Options: DENY` with or without either ID.
Adding frame-src/child-src controls outgoing frames; it does not remove the
incoming-frame prohibition. These security controls were NOT changed.

The official [Metrica CSP instructions](https://yandex.com/support/metrica/en/code/install-counter-csp)
describe frame/child permissions and permitted frame ancestors for replay.
Current policy rejects that documented vendor-framing path. A local synthetic
Chromium test served the real generated headers to an intercepted fixture and
attempted embedding from a synthetic Metrica-origin parent: the browser blocked
the frame in no-ID, Metrica-only and both-ID configurations. All traffic was
intercepted; no vendor SDK, production document or real analytics request.

This proves the header restriction, **not** that all modern Webvisor recording
or playback modes necessarily require weakening it. A real replay under the
unchanged policy has not been demonstrated; a DOM-snapshot/alternative viewer
may behave differently. No vendor-dashboard access or real replay was performed.
Do not claim that simply setting webvisor=true would deliver working playback,
or that recording itself has been proven impossible. Per the task's explicit
security STOP, retain current working pageview analytics and obtain the narrow
Owner/security decision before implementation instead of silently opening frames.

### Privacy and disclosure gates, not invented legal conclusions

The [official recording settings](https://yandex.com/support/metrica/en/webvisor/settings)
document ym-disable-keys for fields and ym-hide-content for displayed content.
The current shared SearchField serves both Header input and fallback and is not
yet marked. SearchPage interpolates q in its h1 and empty state. Future replay
work must mask these exact locations, never add ym-record-keys, and Owner must
turn Record all fields OFF. None of these changes were applied after this STOP.

Masking DOM content does not hide location.href from a third-party SDK.
SearchBox writes free input into q; SearchPage reads it from useSearchParams.
The current manual payload omits query/hash, but this does not attest what an
independently executing SDK can observe. Merely filtering our event adapter,
or adding mask classes, cannot justify a claim of complete raw-query secrecy.
No URL/deep-link/history/SEO architecture change is authorized or made.

Current source/docs inspection found no approved public Privacy/Terms/operator
disclosure closing the previously documented Part17/18 decisions. This is a
missing Owner release decision, not an independently established legal violation.
Owner approval to develop replay is not invented into visitor consent or final
legal text. Before replay release, Owner must settle disclosure/consent as
applicable and explicitly address the residual search-URL exposure; otherwise
defer replay. Do not guess operator identity, retention or jurisdiction.

### Minimal choices for Owner / next source iteration

1. Preserve both framing protections and defer Webvisor; explicitly split the
   pilot work and continue Parts B/C without replay or any new env flag.
2. Require a verified replay mode that works under unchanged protections, or
   separately authorize a narrowly reviewed framing exception if truly necessary.
   Verify the actual viewer origin(s); do not copy the vendor's entire domain
   list, wildcard, Referer-based bypass or obsolete XFO ALLOW-FROM. Review CSP/XFO
   compatibility and affected routes before writing a change. No exception is
   implemented or selected on Owner's behalf.

In either case confirm privacy/disclosure disposition before replay activation.
No request for actual IDs, account tokens or other secret values is needed.

Parts B/C remain **NOT IMPLEMENTED**, not PASS. Source-grounded continuation:

| Action | Existing location / required behavior |
| --- | --- |
| view_item | ProductPage renders ProductDetails only after product success; use actual DTO ID/category and per-real-view dedup, not every refetch |
| search / search_no_results | SearchBox has350ms debounce and push/replace; SearchPage has success/error/placeholder states. Emit only settled successful intents, never intermediate typing/error/placeholder; use query_class/length_bucket unless a real approved term dictionary exists |
| filter_apply / filter_reset | CategoryPage changeFilter/resetFilters and actual schema; DynamicFilters options are schema-driven. Instrument actual user handlers, not URL restoration/history |
| sort_change | Category/Search SortSelect callbacks; desktop select/mobile sheet exist; do not count default render |
| category_view | Loaded CategoryPage category; define distinct KPI versus existing page_view and dedup real views |
| offers_expand | ProductPage show-all-offers button exists; store offer rows are text, not clickable offers. No store_offer_click/purchase event |
| attribution | Initial entry only: bounded allowlisted utm_source/medium/campaign; external referrer origin only. No arbitrary q/query/PII or campaign propagation to every SPA page |

No fictitious dictionary, event/goal, total result count, purchase or store-click
claim was introduced. Future Yandex goal names and GA custom definitions need
Owner dashboard verification, not just an application call.

### Actual local checks of the preserved baseline

Node24.10.0/pnpm10.32.1, existing dependencies, dummy IDs only, clean subprocess
env. Build HTTP API URL points only at an unused loopback endpoint. Browser
tests use existing explicit test mocks with all analytics traffic intercepted.

| Executed command/check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | exit0, lockfile/dependency graph unchanged |
| `pnpm typecheck` with explicit local HTTP/site configuration | exit0 |
| `pnpm lint` | exit0;0 errors,2 pre-existing warnings in freshness.ts and Analytics.tsx, no new warning or suppression |
| `pnpm test` | exit0;41 files,228/228 PASS; existing basic analytics tests only, not pilot feature coverage |
| `pnpm build` with dummy IDs / HTTP loopback configuration | exit0; production-mode baseline build, no deployment or real analytics hit |
| `PW_CHANNEL=chrome pnpm exec playwright test e2e/analytics.spec.ts --workers=1` with existing dummy IDs/site settings | exit1;5/6 PASS. Desktop blocked-scripts case failed at e2e/analytics.spec.ts:20: route.fulfill, Route is already handled! Other desktop and all iPhone-emulation cases passed. No retry, code change or substitution of historical6/6 |
| Inline synthetic Playwright iframe probe using source-derived headers | exit0;3/3 framing denials confirmed, no victim script ran, zero real network requests |
| `node scripts/ci/check-source.mjs`; `git diff --check`; scope/links/bounded privacy scan | PASS; report-only scope, all source/test/config/lockfiles unchanged, full historical report prefix preserved |

The Playwright stack identifies a local interception/route-lifecycle failure;
it does not establish a production analytics/business defect. Its exact runtime
cause is not independently diagnosed here, and the failure remains open. Local
Next also logged destination stream closed early. No harness fix or weakened
assertion is smuggled into this report-only STOP. There are no new pilot unit,
integration or replay-delivery PASS claims.

### Owner checklist after resolving the STOP and reviewing implementation

- Choose the framing/replay approach and legal/privacy disposition explicitly.
- For a future approved release, verify Webvisor enabled in its dashboard,
  Record all fields OFF, input/content masks and URL exposure policy, then actual
  replay readability. A mock or loaded script does not prove replay delivery.
- Verify exact CSP permissions/network/console without widening other origins;
  preserve clickjacking protection unless a specific exception was reviewed.
- Keep GA history-based Enhanced Measurement pagechanges OFF; verify one manual
  SPA pageview and real initial UTM/referrer attribution after release.
- After Parts B/C implementation, create/verify agreed Metrica JavaScript goals
  and GA custom definitions; verify actual view_item/search and action timing in
  Realtime/DebugView, no raw search input, no false no-results on API errors.
- Search Console/Webmaster and DNS are already Owner-reported working; do not
  reconnect them. Production env remains the same two IDs, no extra flag.

**Exact changed file: this existing FRONTEND_ANALYTICS_REPORT.md, append-only.**
No source/test/runtime, CSP/header, masks, dependencies, frontend settings,
Go/Backend2/Nest/DB/C2/HMAC/API, DNS/Vercel env or production mutation. No actual
analytics hits, SSH/SQL, sync, deploy, commit/push/PR/merge. **STOP — BLOCKED**
pending Owner/security replay decision; baseline Playwright failure also remains
unresolved. Basic working analytics was preserved, not disabled or rewritten.

## 2026-10-17 — Pilot continuation: Parts B/C source candidate

**Current scoped status: READY_FOR_EXTERNAL_REVIEW (Parts B/C only).**
**Part A: BLOCKED / deferred mandatory Webvisor security gate, NOT implemented.**
The Owner explicitly separated Parts B/C from the replay STOP. Webvisor remains
false; frame-ancestors, X-Frame-Options, CSP, input/replay behavior and all iframe
restrictions remain byte-identical to main. This is not full pilot/production
acceptance and does not resolve the historical replay/privacy findings above.

### Baseline and preservation

Work continued on feat/frontend-pilot-analytics in its existing isolated WSL
worktree. `git fetch origin --prune` exit0; HEAD and origin/main both
`c7b9fee979a6ee481ba4b00c8bdd6551a728d2d8`. Initially the only changed file was
this report from the previous STOP. Its complete 23,086-byte pre-existing prefix
is preserved, including all historical results and BLOCKED statements.
No other worktree was modified. No staging, commit, push, PR or deployment.

### Part B: implementation and event definitions

One typed product-event adapter reconstructs fixed allowlisted payloads rather
than forwarding arbitrary objects. The existing provider initialization/manual
pageviews were extracted into a shared browser module: both confirmed-data child
effects and the layout use the same queues and dedup, so effect ordering cannot
lose the first product event or initialize a counter twice. Next/React guidance
informed the separation of confirmed-data effects from explicit action handlers;
no server tracking or backend change was introduced.

| Event | Actual trigger and safe payload |
| --- | --- |
| view_item | Successful Product DTO rendered in ProductDetails; items contains only real item_id and item_category |
| category_view | Known category plus successful schema/products, not placeholder data; category_slug |
| search | Successful, non-fetching, non-placeholder current results plus 1,000ms settlement; query_class=redacted, length_bucket, visible_count capped at24, has_results |
| search_no_results | Same settled successful query with zero items; never API error/loading/placeholder |
| filter_apply | Actual DynamicFilters change, known schema key and changed selection; category_slug and filter_key only, no value/free text |
| filter_reset | Existing reset action with active filters; category_slug |
| sort_change | Actual changed user selection in Category/Search; real price_asc/price_desc/name_asc and category when applicable |
| offers_expand | Existing show-all-offers click only; real item_id/item_category; store rows remain non-clickable |

All events include ru/kk language. No invented purchase, store_offer_click, sale,
conversion revenue, price, product name, coordinates or session identity.
category_view is a category funnel event, not an extra pageview; dashboards must
not add it to page_view as if they were two distinct visits.

Search UI debounce remains350ms. The separate1,000ms analytics settlement is a
defined quiet-window heuristic, not a claim to know the user's final intention.
Every input edit cancels pending settlement immediately, before URL debounce;
changed queries, error/fetching/placeholder states and unmount cancel it too.
No raw search_term is supplied: this candidate measures volume, length buckets
and empty-result rate, **not exact requested terms**. A canonical term vocabulary
would require a separately approved source, not an invented product dictionary.

Product/category views dedup within each real pathname visit, including
StrictMode, hydration, remount and refetch. A real Back/Forward pathname revisit
counts once, not twice. Query-only restores are not new views/actions. Completed
searches dedup across the document's route visits (including Back/Forward and
sort/refetch); retyping the same query in that document is conservatively not a
new search KPI. Bounded sets stop admitting new keys after512 entries. Query
dedup keys are ephemeral browser memory only, not persisted or sent to providers.
No-ID, invalid-ID and noncanonical-origin paths are no-ops; one valid ID works
independently. Provider exceptions do not break UI or the other tracker.

GA uses the existing event queue; Metrica uses reachGoal with the same eight
fixed event identifiers. The view_item items structure follows the
[GA recommended-event reference](https://developers.google.com/analytics/devguides/collection/ga4/reference/events).
Creating the corresponding goals is a dashboard Owner action, not something
proved by queued calls; see the [Metrica reachGoal contract](https://yandex.ru/support/metrica/ru/objects/reachgoal).

### Part C: conservative initial attribution

Only entry pageviews receive validated campaign parameters, in fixed order.
The source-defined conservative vocabulary is:

- utm_source: google, yandex, instagram, telegram, facebook, whatsapp, qr, siri;
- utm_medium: organic, cpc, social, referral, email, qr, offline;
- utm_campaign: pilot, pilot_2026, launch, aktau_market.

These are allowed technical tokens, not claims that such campaigns already ran.
Unknown, duplicate, free-text, email, URL, telephone, coordinates and session-like
values are dropped. Owner should align campaign naming before release; arbitrary
new campaign strings are intentionally not accepted automatically.

External attribution accepts HTTPS origins only from the explicit public list:
www.google.com, www.google.kz, yandex.ru, yandex.kz, www.instagram.com, t.me,
www.facebook.com. Paths/query/hash/credentials are never exported; internal,
untrusted/private hosts and absent referrers produce empty referrer, not a
fabricated root/direct source. Other referral origins are intentionally omitted.
Subsequent RU/KK SPA pageviews contain canonical origin+pathname only; custom
events also explicitly use clean page_location/page_path, without UTM or q.
Browser URL, deep links and history are not rewritten by analytics.

The same two existing public ID settings are used. No dependency, env variable,
enable flag or additional tracker was added. Existing send_page_view=false,
manual hit, defer=true and privacy-oriented initialization remain in place.

### Baseline Playwright race: reproduced and corrected

Before source changes, desktop blocked-script test repeated3 times with1 worker:
exit1,2 PASS/1 FAIL, reproducing Route is already handled! at route.fulfill.
The saved local trace places the asynchronous fetch/fulfill failure during
after-hooks. Installed Playwright's server removeHandler can continue an
in-flight intercepted request while its client handler still owns fetch work;
an unroute wait alone does not give this harness an explicit quiescent boundary.

The harness now navigates to about:blank, drains its tracked fetch/fulfill jobs,
then calls unrouteAll(wait). No route error is swallowed as the fix; all existing
assertions remain, no retry or timeout increase. The pre-existing narrowly scoped
cancelled-RSC handling remains unchanged. Synthetic Metrica SDK interception now
also records reachGoal, rather than testing only page hits.

Analytics desktop+iPhone profile repeated3 times: **24/24 PASS**, including the
new real-UI event/entry-attribution case and blocked providers. The final full
suite also passed after the added cross-route search-history dedup regression.
Next server still sometimes reports destination stream closed early when browser
streams/prefetch are cancelled; this pre-existing observation is not hidden or
claimed fixed. No browser page-error/CSP assertion was weakened.

### Actual verification

Node24.10.0, pnpm10.32.1, installed Chrome via PW_CHANNEL=chrome; native WSL.
Commands used RTK; test subprocesses used clean env, dummy counter IDs only.
For typecheck/build: explicit HTTP mode with API URLs at unused loopback3999,
site=https://aktau.market. Browser builds use the existing explicit mock profile.
Canonical-origin browser requests are fulfilled from loopback3100; Google/Yandex
scripts and collectors are synthetic/intercepted, never real analytics hits.
Localhost/noncanonical pages do not initialize counters.

| Command/check | Actual outcome |
| --- | --- |
| pnpm install --frozen-lockfile | exit0, already up to date; package/lockfiles unchanged |
| pnpm typecheck | exit0 |
| pnpm lint | exit0,0 errors; same2 existing set-state-in-effect warnings in freshness.ts and Analytics.tsx, no new warning/suppression |
| pnpm test | final exit0,43 files,259/259 PASS; includes27 adapter/privacy/hook tests and4 real-UI integration tests |
| pnpm build, explicit HTTP mode/dummy IDs | exit0, production build, no deployment |
| pnpm exec playwright test e2e/analytics.spec.ts --workers=1 --repeat-each=3 | exit0,24/24 PASS; desktop+iPhone |
| pnpm exec playwright test --workers=2 | exit0,59 PASS/3 existing platform-specific SKIP,0 FAIL; final source incl. search history fix |
| pnpm audit --prod | exit0, no known vulnerabilities reported |
| node scripts/ci/run-checks.mjs security | exit0, source/workflow policy and synthetic backup guards PASS |
| node --test scripts/revalidation/verify-part16.test.mjs | exit0,4/4 PASS |
| node scripts/revalidation/verify-part16.mjs | exit0, static boundaries PASS, not production freshness evidence |
| git diff --check; changed-scope/Markdown links/bounded privacy scan | PASS; no credentials/private artifacts; historical report prefix preserved |

An initial clean-env typecheck without required API configuration exited1;
it was rerun with the documented explicit local HTTP configuration, not relaxed.
The first new integration-test run had2 failures because its own rerender removed
QueryClientProvider. Corrected only that test lifecycle; final259 tests above
actually ran and passed. An intermediate mixed component/function export lint
warning was removed by extracting browser queue logic, without suppression.

### Exact changed files (13; new files explicitly included)

- docs/production/reports/FRONTEND_ANALYTICS_REPORT.md — append-only, previous STOP retained;
- frontend/src/lib/analytics.ts — pure safe attribution;
- frontend/src/lib/analytics-browser.ts — NEW, shared existing init/pageviews and document-local dedup;
- frontend/src/lib/pilot-analytics.ts — NEW, typed adapter and confirmed-data hooks;
- frontend/src/lib/pilot-analytics.test.tsx — NEW, adapter/attribution/privacy/dedup regressions;
- frontend/src/views/PilotAnalytics.test.tsx — NEW, actual DTO/error/action integration;
- frontend/src/components/analytics/Analytics.tsx — same loaders via shared initialization;
- frontend/src/components/analytics/Analytics.test.tsx — accurate absent-referrer expectation;
- frontend/src/components/layout/SearchBox.tsx — local settlement-cancel signal only;
- frontend/src/views/ProductPage.tsx — successful view and real offers expansion;
- frontend/src/views/CategoryPage.tsx — confirmed category and actual filter/reset/sort actions;
- frontend/src/views/SearchPage.tsx — confirmed settled results and actual sort action;
- frontend/e2e/analytics.spec.ts — interception lifecycle fix, reachGoal and pilot UI coverage.

### Remaining limitations and Owner release checklist

1. **Part A remains required but BLOCKED.** No Webvisor enablement, masking or
   framing exception is smuggled into this candidate. Resolve its separate
   security/privacy gate and disclosure/consent disposition before replay release.
2. Review Parts B/C source independently before any commit/PR/deployment. Align
   the deliberately restricted campaign/referral vocabulary with actual pilot
   acquisition plans; omitted values are a privacy tradeoff, not complete channel
   attribution. Existing third-party SDKs can independently access browser URL;
   sanitized manual payloads/mocks do not prove their full real-wire privacy.
3. In GA4 retain history-based Enhanced Measurement pagechanges OFF; also verify
   automatic site-search/form/outbound collection cannot bypass this redacted
   manual event policy. Create event-scoped category_slug, filter_key, sort_type,
   language, query_class, length_bucket, has_results definitions as needed and
   visible_count metric. Use built-in item_id/item_category for view_item.
   No exact-term search report or purchase/revenue report is promised.
4. In Metrica create/verify JavaScript goals with these exact identifiers:
   view_item, category_view, search, search_no_results, filter_apply,
   filter_reset, sort_change, offers_expand. Do not enable automatic link/click
   goals or count offers as store clicks. Verify allowed nested item parameters
   and other visit parameters in the real dashboard after an approved release.
5. After separately authorized deployment, verify GA Realtime/DebugView and
   Metrica delivery: direct entry, allowed UTM/referrer, RU/KK, one pageview per
   actual navigation, one loaded item/category view, settled search/empty/error,
   user-only filter/sort and real expansion. Check browser Network/CSP console,
   search-data absence and behavior with ad blockers. No such live check ran here.

Security headers/CSP, Next/API cache/ISR/revalidation/SEO contracts, source DTOs,
Go/Backend2/Nest/PostgreSQL/C2/HMAC, DNS, Vercel env and production are unchanged.
No new secret reads, real analytics hits, provider benchmark, SSH/SQL, sync,
deployment, commit/push/PR/merge. **STOP for independent Code Review.**

## 2026-10-17 — P1 review fix: private search dedup storage

**Status: READY_FOR_EXTERNAL_REVIEW (Parts B/C); finding outcome: fixed.**
**Part A remains BLOCKED at its separate mandatory security gate.**

Continued the existing feat/frontend-pilot-analytics candidate without resetting
or rewriting its work. Fetch exit0; HEAD and origin/main remain
`c7b9fee979a6ee481ba4b00c8bdd6551a728d2d8`. Only root AGENTS instructions were
consulted for this iteration, not nested AGENTS files. The complete prior
36,462-byte report prefix remains byte-identical; historical evidence above is
preserved, not reclassified as results from this iteration.

### Finding, narrow fix and verification boundary

Confirmed path: useSearchResult constructs a raw-query onceKey for search and
search_no_results; trackProductEvent previously stored it in the public
window.__aktauPageviews.searches Set. Provider payload redaction was already
working, but did not prevent ordinary access to the raw global Set.

The search Set now lives only in a non-exported module-scoped WeakMap, keyed by
the existing document-local pageview state object. No raw query or reference to
that Set is assigned to window, document, storage, event payloads or provider
commands. The public searches field is removed from the Window type and is no
longer created. The shared adapter covers both search event representations;
non-search event dedup and all payloads remain unchanged.

The same state identity survives StrictMode, refetch, sort, Back/Forward and
layout remount; its search history is not reset on pathname navigation. A new
document-local state has an independent Set. WeakMap does not strongly retain
abandoned state keys; no deterministic garbage-collection timing is claimed.
The existing512-key fail-closed bound and admission behavior remain unchanged.

Following the focused fix-finding workflow, the source-to-sink path and direct
callers were reviewed in separate investigation/review passes in this same
single-agent session. Both search event names reach only the private branch;
other direct callers use product/category/action keys, not raw search strings.
This closes the reported exposed-state copy, not every possible third-party
access path: the browser URL/DOM still contains the original search as already
documented. No claim of general SDK isolation or full real-wire privacy.

### Regressions and actual results

Added two synthetic search privacy cases (email and telephone). They inspect
GA/ym arguments and recursively inspect own string/Symbol/non-enumerable
properties and nested collections reachable from window.__aktauPageviews;
JSON.stringify alone would miss the original Set. They also assert that the
public searches property does not exist. Both events must still be emitted once.
A third regression exercises the512-key boundary, remount preservation, duplicate
suppression at capacity and independent admission after replacing document-local
state. Existing StrictMode/refetch/sort/history tests remain enabled.

Before the runtime fix, the two privacy tests reproduced the finding: exit1,
2 FAIL at the public-state assertion;28 tests were unselected, not PASS.
After the fix, the entire focused file passed30/30 with0 skipped.

All commands used RTK and clean subprocess env, Node24.10.0/pnpm10.32.1. Build
used explicit HTTP API configuration at unused loopback3999 and dummy analytics
IDs; Playwright used the existing mock profile and installed Chrome. Canonical
browser traffic was fulfilled locally and analytics libraries/collectors were
intercepted; no real Google/Yandex hits or production requests were sent.

| Executed command/check | Actual result |
| --- | --- |
| pnpm typecheck | exit0 |
| pnpm exec vitest run src/lib/pilot-analytics.test.tsx | exit0,30/30 PASS,0 skipped |
| pnpm lint | exit0,0 errors; same2 pre-existing set-state-in-effect warnings, no new warnings or suppression |
| pnpm test | exit0,43 files,262/262 PASS,0 skipped |
| pnpm build | exit0, HTTP production-mode build, not deployment |
| PW_CHANNEL=chrome pnpm exec playwright test --workers=2 with explicit dummy IDs/site | exit0,59 PASS,3 existing platform-specific SKIP,0 FAIL; includes all8 analytics cases |
| pnpm audit --prod | exit0, no known vulnerabilities reported |
| node scripts/ci/run-checks.mjs security | exit0; source/workflow policy and synthetic backup guards PASS |
| node --test scripts/revalidation/verify-part16.test.mjs | exit0,4/4 PASS |
| node scripts/revalidation/verify-part16.mjs | exit0, static boundaries PASS, not production evidence |
| diff/scope/Markdown links/bounded privacy checks | PASS; original report prefix and617 out-of-scope source/test/doc files preserved; one additional EOF-only cleanup below |

The previously documented Next destination-stream-closed messages also occurred
in this local browser run; no attempt to tune production or hide errors was made.
The3 Playwright skips are platform-specific tests, not successful executions.
Explicit unfiltered tracked/no-index whitespace checks caught pre-existing
extra blank lines at analytics.ts and analytics-browser.ts EOF. Each was removed
without changing any executable token or policy; tracked whitespace check then
exited0. No-index checks have empty diagnostic output (their diff exit1 denotes
a new file, not a whitespace error). Earlier RTK-filtered output was insufficient
to establish the tracked whitespace result; the unfiltered check is authoritative.

### Exact scope and new review archive

These4 files contain the P1 fix/report changes relative to the reviewed candidate:

- frontend/src/lib/pilot-analytics.ts — private WeakMap storage;
- frontend/src/lib/analytics-browser.ts — removed public searches field;
- frontend/src/lib/pilot-analytics.test.tsx —3 focused regressions;
- docs/production/reports/FRONTEND_ANALYTICS_REPORT.md — this append-only record.

One additional file, frontend/src/lib/analytics.ts, has only its extra trailing
blank line removed to satisfy git diff --check. UTM/referrer policy is unchanged.

The full candidate still has the13 changed/new paths listed in the previous
section; all other files are preserved byte-identically. No changes
to events, UTM policy, SPA pageviews, UI/API, Webvisor=false, CSP/frame protection,
dependencies, Go/Nest/DB/C2/HMAC, infrastructure, env or production.

Fresh archive generation uses the unchanged existing script and approved target:
`node scripts/create-clean-archive.mjs full-stack`.
Output: `artifacts/full-stack-integration-review.tar.gz` in this worktree.
It is regenerated from corrected current files, not reused from the old review.
Verification covers safe regular members, no duplicate/traversal entries, all13
changed/new paths, byte-match for every member including this updated report,
and bounded secret patterns. Git, TODO, artifacts, dependencies, builds, env,
private keys/backups and temporary test output are excluded.

Part A/security and Owner dashboard/post-deploy gates listed above remain open.
No commit, push, PR, merge, deployment or production modification.
**STOP for independent repeat Code Review.**
