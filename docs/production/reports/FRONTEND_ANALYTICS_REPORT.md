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
