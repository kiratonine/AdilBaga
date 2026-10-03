# Production Part 01 — Finalize Next.js frontend migration

Status: **READY_FOR_EXTERNAL_REVIEW**. Updated: 2026-10-03.

## A. Goal and scope

Next.js App Router is now the only frontend in `frontend/`. Removed the old Vite
source only after all pre-switch gates passed. No Go, brand rename, deploy,
backend API/DTO change, DB mutation, commit or push. Read root/Next AGENTS,
Production Part 01, roadmap, Part 00 report, migration plan, frontend worklog,
existing adapters/types/E2E and backend catalog/voice contracts.

Next/React skills informed request-time rendering and bounded fetch caching;
the installed Next 16.3.8 connection/fetch documentation was checked first.
Existing views/hydration/i18n/SEO/map architecture was retained.

## B. Baseline

- Branch: `integrate/full-stack` throughout.
- `rtk git fetch origin --prune`: PASS.
- Initial working tree: clean, no pending MERGE_HEAD.
- HEAD / origin/integrate/full-stack:
  `ce391a4ae09d3bf74f4f200bb68c891fd8588f22`.
- Divergence: 0/0; final HEAD unchanged. Part 00 is READY_FOR_EXTERNAL_REVIEW.
- No reset/rebase/merge/pull/commit/push performed in this Part.

## C. Fail-closed configuration

`src/lib/config.ts` validates explicit http/mock mode and HTTP(S) URLs. Missing or
unknown mode fails. HTTP requires public URL even if internal API_BASE_URL is
provided; server may default only to the explicitly configured public URL.
Credentialed/invalid URLs are rejected without echoing their values.

Production build AND start validate HTTP mode and NEXT_PUBLIC_SITE_URL in
next.config.ts; the adapter also validates config. Production mocks require
the exact explicit test-only flag NEXT_PUBLIC_ENABLE_TEST_MOCKS=1. No silent
adapter fallback, empty URL fallback or implicit production localhost origin.
Dev/unit mocks remain explicit. Production .env.example now defaults to HTTP and
planned https://api.aktau.market / https://aktau.market; test opt-in is commented.

Actual negative build smokes on the native copy: missing mode, unknown mode,
missing public API URL, production mock without opt-in and missing site URL
all rejected with nonzero exit and the expected setting-only error (5/5 PASS).
Mock production build with opt-in: PASS via both Playwright mock runs.

## D. Build independence / cache

Catalog, Dashboard and sitemap call Next `connection()` before API access:
request-time rendering, not API-dependent pre-render. No force-dynamic fetch-cache
override or CSR-only catalog. Server GETs have next.revalidate=3600 and tag
catalog-data; browser fetch omits Next-specific options. Next stores only HTTP
200 responses; errors remain ApiError, never fixtures. Catalog prefetches became
fetchQuery so mandatory server failures propagate rather than being swallowed.
Existing product ISR (empty generateStaticParams) and category/search flows retained.
No public revalidation endpoint added.

Verified no TCP listener at :65534, then actually executed in BOTH original and
final repository paths:

```text
NEXT_PUBLIC_API_MODE=http
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:65534
API_BASE_URL=http://127.0.0.1:65534
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100
rtk proxy pnpm build
```

Both builds exit 0; catalog/dashboard/sitemap listed dynamic. No fake API.
This proves backend independence, NOT a fully offline build: existing
next/font/google still requires Google Fonts during compilation.

## E. Pre-switch checks / mock suite

Node v24.10.0, pnpm 10.32.1, frozen existing Next lockfile/dependencies preserved.

| Check | Actual result |
| --- | --- |
| typecheck (next typegen + tsc) | PASS |
| oxlint | PASS, 0 errors |
| Full unit suite | PASS: 179 tests / 34 files, 0 failed, no worker startup timeout |
| Mock Playwright | PASS: 47 passed / 3 platform-specific skips / 0 failed |
| Backend-down production build | PASS |
| Real HTTP Playwright | PASS: 12/12, 0 failed, 0 skipped |
| Real ru/kk SSR/SEO smoke | PASS |

The initial no-env typecheck correctly failed strict config validation; rerun with
explicit HTTP/site configuration passed. One initial typecheck reported a new
Playwright env union typing error; added Record<string,string> annotation before
build and subsequent checks. No assertion failures occurred.

Full units ran in owner-authorized native WSL workspace
`/home/denis/tmp/aktau-market-part01-tSBGvh/frontend-next`, using:
`NEXT_PUBLIC_API_MODE=mock rtk proxy pnpm test --pool=forks --maxWorkers=1 --no-isolate`.
144 source files byte-compared with the repository; frozen install PASS. The
known /mnt/d worker-startup issue established in Part 00 was not retried blindly.
No dependency/timeout hack. Copy excludes real .env, dependencies, .next and test
outputs (fresh dependencies installed there). Pre-switch E2E also used this copy.

## F. Real NestJS / Supabase HTTP E2E

Unchanged existing NestJS dist started on :3000 with backend/.env via a temporary
redacting command wrapper. Credentials never printed; runtime not fixture.
Production Supabase READ-ONLY: GET API/tests only, no seed/parser/migration/db push.
Backend build/tests/matching/audit and voice direct/clarification/Upstash PASS from
Part 00 retained, NOT newly claimed executed in this frontend-only Part.

Live API checks: 6 categories (bread/eggs/milk/oil/other/sugar), 849 canonical
products, 3 stores, 14 matched across stores, 15 locations. SnapshotAt:
2026-09-26T11:36:05.102Z. Baskets unchanged: DINA 2230, DANA 1963, FIX_PRICE 2050 KZT.

New data-agnostic e2e/http.spec.ts derives IDs, counts, prices, filter values and
search query from real API. Covers category tiles, top price spreads, exact first
page/order/minPrice, real dynamic filter and URL, descending sort, search, product
h1/offers/category link/status, Dashboard summary/spreads/baskets/15 markers and
labels/addresses, real sitemap and unknown category/product HTTP 404/noindex.
No fixture ID/name/price/map-count assumptions. Browser console/page errors: none.
Both desktop and iPhone viewport projects PASS. Not physical-iPhone Siri testing.

Playwright config isolates suites: ordinary mode excludes http.spec.ts, explicitly
builds mock artifact with test-only opt-in; E2E_API=http selects ONLY http.spec.ts,
requires public URL, uses HTTP and clears mock opt-in. Existing server reuse is
disabled to prevent stale/cross-mode artifacts. Real NestJS runs independently.

## G. SSR / SEO

Separate real HTML smoke before switch: catalog, Dashboard, real category and real
product in ru/kk HTTP 200. Server HTML contains real category/product data,
Dashboard summary/baskets, title, description, exact canonical, ru/kk/x-default
hreflang and OG. Real product AggregateOffer lowPrice matches backend; Breadcrumb
JSON-LD present. No known mock product ID. Search noindex/follow retained.
HTTP E2E additionally verifies real Product JSON-LD/offers, sitemap real IDs in
both languages, robots sitemap reference and 404/noindex. Organization/WebSite
and broader SEO mock expectations also remain green. Brand Adil Bağa unchanged.

## H. Path switch / preservation

Only after all pre-switch PASS: scoped `rtk git rm -r frontend` removed 83 old
tracked Vite files, then Git-aware move brought the Next project to frontend/.
No legacy frontend runtime source retained in repository; frontend-next/ absent.
Local ignored frontend/.env preserved without content changes at its original
final path; no new .env created and no env staged. Legacy generated/ignored files
retained outside repo at `/mnt/d/install/projects/adilbaga-part01-legacy-WkmF5x`.
Initial cross-filesystem generated-file transfer was interrupted, then completed
as a same-filesystem move; final paths/source comparison/checks PASS. A partial
generated-file recovery copy remains in the private native test workspace, not
in repo/archive. No user data deleted by cleanup.

## I. Final-path validation

| Check after switch | Actual result |
| --- | --- |
| frontend/ typecheck | PASS |
| frontend/ oxlint | PASS, 0 errors |
| Full units, native frontend/ byte-identical copy | PASS: 179/179, 34 files, 0 failed/timeouts |
| frontend/ backend-down production build | PASS, API :65534 not running |
| frontend/ mock E2E | PASS: 47 passed / 3 platform skips / 0 failed |
| frontend/ real NestJS/Supabase HTTP E2E | PASS: 12/12, desktop+iPhone, 0 failed/skipped |
| git diff / cached diff --check | PASS |
| Backend/data/root AGENTS diff versus HEAD | Empty |
| frontend-next/ / legacy index.html | Absent |
| Tracked env files | Only backend/.env.example and frontend/.env.example |

Final E2E ran directly from the repository's final frontend/ on /mnt/d, not the
native workspace, including fresh mock/HTTP production builds. Final units ran
in `/home/denis/tmp/aktau-market-part01-tSBGvh/frontend`; final source comparison
again 144 files byte-identical (no timeout/dependency/config workarounds).

## J. Documentation

Root/package README now describe Next App Router, runtime env and separate
mock/HTTP E2E commands. Worklog adds authoritative current state and Part 01 entry;
earlier decisions/paths remain explicitly historical. Migration plan COMPLETE,
final path frontend/, external review pending; next is Part 02 contract freeze,
not started. Planned URLs documented, not deployed or publicly indexed here.

## K. Changed files

Next source moved frontend-next/** → frontend/**; old Vite source/entry/routing/
configs removed. Compared with the accepted Next baseline, functional edits only:

- frontend/src/lib/config.ts (+ config.test.ts), site.ts;
- frontend/src/api/catalogApi.ts (+ existing test), httpAdapter.ts (+ tests);
- frontend/src/app/[lang]/(site)/catalog/page.tsx and dashboard/page.tsx;
- frontend/src/app/sitemap.ts (+ existing test context mock);
- frontend/next.config.ts, playwright.config.ts, vitest.config.mts, .env.example;
- frontend/e2e/http.spec.ts and frontend/README.md;
- README.md, frontend worklog/migration plan;
- scripts/create-clean-archive.mjs: permanent production-part-01 target;
- this report.

Existing package.json, Next pnpm lockfile, UI/view/i18n/public-contract source and
backend/data preserved; apparent larger diff is legacy removal/path cutover.
Git-aware removal/move staged path changes; further edits/new files remain
unstaged/untracked for owner review. No commit created.

## L. Remaining limitations

No mandatory blockers. Known non-gating Next server diagnostic during aborted
navigation: `The destination stream closed early`; also NO_COLOR/FORCE_COLOR
warnings. Tests remained green, browser console/page errors absent; not hidden.
Google Fonts build network dependency and Part 00 future production debts remain.
Physical Siri = PENDING OWNER; no new Gemini/Upstash/key smoke claimed here.

## M. Integration impact

Frontend commands and future hosting context must now use frontend/ (Next SSR
Node runtime), not the retired Vite package or intermediate path. Production
configuration is explicit/fail-closed; deployments must not enable test mocks.
NestJS remains the reference implementation; API/DTO/schema/data/voice unchanged.
Part 00 backup/restore/history audit evidence retained; no repeated DB operation.

## N. Archive and status

Permanent target: `scripts/create-clean-archive.mjs production-part-01`.
Artifact: `artifacts/production-part-01-review.tar.gz`.
Clean archive verification recorded after generation: source/docs/tests/report
included, no .git/TODO/artifacts/.env/dependencies/build/test outputs/DB backups/
generated ignored next-env.d.ts. Only safe .env.example files permitted.
Verification PASS: 254 files; required Next/backend/docs/report paths present;
zero forbidden paths, zero known local credential hits, zero tested Google-key/
JWT/private-key pattern hits. Only backend/.env.example and frontend/.env.example
included. Archived report byte-matches working report. Known-pattern/value scan
is bounded, not an exhaustive security audit. Review archive excludes the native
workspace and outside-repo generated-file recovery copies. Test servers stopped.

**READY_FOR_EXTERNAL_REVIEW** — mandatory pre-switch/final-path gates PASS;
Supabase read-only, no backend contract/data changes, commit/push/deploy or Part 02.
