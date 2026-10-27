# C2 latency / AFTER investigation — 2026-10-27

**ROOT_CAUSE_NOT_PROVEN / BLOCKED for historical production RCA.** Dashboard's historical full-response timeout is confirmed, its responsible layer is not. Current sitemap latency is independently reproduced in production. Two source corrections are locally qualified: removing the cold sitemap pagination waterfall and preserving AFTER failure classification. Their source candidate is ready for review; production convergence, the historical Dashboard/AFTER cause and acceptance closure are not claimed.

## 1. Source and scope

Fresh `origin/main=328f6f269bab320c89ac279e74558b70a3c188fd`, native worktree `/home/denis/tmp/aktau-c2-latency-after-20261027`, branch `fix/c2-latency-after-diagnostics-20261027`. Existing checkouts and reports preserved. Root AGENTS/RTK, roadmap, revalidation contract, Part16/32 reports, current Backend2 handoff, C2/Go/Next implementation and tests reviewed. Next16.4.1, Node24.10.0, Go1.27.3, non-root tests; next-best-practices and vercel-react-best-practices applied to source analysis.

Seven paths only:

1. [projection-provider.mjs](../../../scripts/revalidation/projection-provider.mjs): additive closed AFTER failure enum; existing validation/custody and verdict unchanged. Synthetic factory gains only explicit local failure scenarios.
2. [c2-projection-v2.test.mjs](../../../scripts/revalidation/c2-projection-v2.test.mjs):11 new diagnostic/privacy/durable-ledger/one-shot regressions.
3. [fixtures/projection-provider-v2.mjs](../../../scripts/revalidation/fixtures/projection-provider-v2.mjs): local child-process failures matching the existing Go exit protocol, plus arbitrary stderr rejection.
4. [cache-smoke.mjs](../../../scripts/revalidation/cache-smoke.mjs): optional fixed LOCAL large-data/slow-upstream profiles; default smoke retained. No production endpoint override introduced.
5. [sitemap.ts](../../../frontend/src/app/sitemap.ts): first products page unchanged, then fixed concurrency4 pagination instead of serial roundtrips; same ordering/markers/50-page bound.
6. [sitemap.test.ts](../../../frontend/src/app/sitemap.test.ts): concurrency/order/lastmod/cap/error/short-page regressions.
7. This report.

**Unchanged:** frontend runtime outside sitemap traversal, Go runtime/SQL, DTO/API, sitemap format and exact markers, HMAC, READY5000, HTTP4000 ceiling, convergence5000, diagnostic20000,21GET/2sitemap, calibration uncertainty, source identity, private registry, fixtureOnly, binary/root authority, policy/pins, ingestion and deployment tooling. No retries, warming hook, limit increase or synthetic production publication.

## 2. Fresh read-only VPS evidence

Four bounded SSH sessions through existing `my-vps`, strict host verification, BatchMode and ForwardAgent=no. Only fixed Git/status, systemctl show, Docker inspect/logs, journal and ledger reads; sanitized projections emitted. No DB connection, runtime/provider invocation, env/credential read, lock acquisition, service/timer mutation or file installation on VPS. Earlier diagnostic script omitted Docker stderr; it was corrected locally and both streams checked. Neither stream retained historical API requests in the selected windows: **0 bytes/0 lines**, not evidence of zero traffic.

2026-10-27T15:05:51Z readback:

- Publisher HEAD and independent source authority both **`6e7a96d6fe71029718d61e104d2f9197f17e9fae`**, Git clean.
- API container running/healthy, revision **`b4f4b889a046ee59d3730f3a2c45e0f1d49b93ac`**. This is API image identity, not publisher/frontend SHA.
- Daily/weekly/custodian services inactive, Result=success; daily/weekly timers active. Existing production publication behavior preserved.
- Ledger now **20 INCONCLUSIVE,0 PASS,0 FAIL;0/3**, SHA256 `85cc552fd2d5d4df772bc7b876c780e2f1df99afefa8d242139a74120f9064f5`. New natural attempt `7e79002006efa3b5618bd881dba41d80` is capture_failed/product_kk/timeout,6requests. Owner's19-entry baseline was overtaken by normal scheduled work; nothing was replayed.

| Genuine attempt | Durable result | Signed HTTP request interval | Event-consumed → terminal |
| --- | --- | --- | --- |
| 2026-10-26 13:00 UTC cycle, `f291d98fa10be10486287ef10008fee6` | after_unavailable,6GET |567.195ms,actual204 |13,978ms |
| 2026-10-27 01:00 UTC cycle, `6a58005bad7eff439fddf8a3567f5402` | capture_failed/dashboard/timeout,6GET |1289.144ms,actual204 |8338ms |
| 2026-10-27 13:00 UTC cycle, `7e79002006efa3b5618bd881dba41d80` | capture_failed/product_kk/timeout,6GET |722.432ms,actual204 |8760ms |

Journal corroborates READY armed at01:01:59.718UTC/1915ms and publication phase01:02:17.730UTC on27Oct. Prior cycle: armed13:01:56.516UTC/1985ms, publication phase13:02:13.541UTC on26Oct. These journal phase timestamps are **not** exact accepted204 timestamps. Transition UTC and raw signed-request interval were projected from existing ledger history; no full FIFO payload exported.

**Important bound:** request timeout is `min(4000, remaining shared acceptance window)` for an acceptance sample. Existing FIFO mapping adds calibration uncertainty to the whole signed-request interval. For the Dashboard attempt, the first GET therefore had **at most3710.856ms**, before calibration/delivery/start deductions, rather than an independent4000ms budget. READY1915ms is pre-publication and is not itself subtracted from convergence. The conservative accepted204 interval and SLA are preserved; reducing uncertainty without proof would weaken the contract.

Terminal failure summaries intentionally contain empty HTTP events/results. Historical TTFB, actual GET deadline, status, headers/cache/region, individual durations and AFTER child exit/stderr are absent. The13.978s terminal interval is compatible with slow capture plus AFTER execution, but does not prove the CLI's8s deadline fired.

## 3. Observability availability and independent public GETs

No connected Vercel/Cloudflare account tool, installed authenticated CLI context or supplied runtime-log export is available in this session. GitHub deployment metadata proves builds, not function spans. Authenticated Vercel Runtime Logs/Observability and Cloudflare historical request analytics for01:02UTC27Oct /13:00UTC26Oct are **NOT_VERIFIED**; no guessed credentials or settings changes. VPS retained no API log lines for00:59–01:06UTC27Oct and12:58–13:06UTC26Oct. Consequently there is no end-to-end request-ID correlation for the failed attempts.

Exactly **6 public diagnostic GET attempts**, two rounds of three concurrent paths,15:07:48–15:08:19UTC. TLS verified, no cookies/auth/proxy/redirect following, identity encoding,15s timeout,2MiB API/HTML and8MiB XML read caps. These are ordinary read-only probes well after the natural publication, not C2/warming-before-C2 measurements. No POST/HEAD/HMAC sent. API/HTML response bodies processed only in memory; only safe headers/counts/timestamps saved.

| Path | Round1 TTFB / complete | Round2 TTFB / complete | Evidence |
| --- | --- | --- | --- |
| api.aktau.market/api/dashboard |1214.86/1242.98ms |946.11/966.13ms |200,46,833bytes,CF DYNAMIC; cfOrigin dur754/732ms |
| aktau.market/ru/dashboard |1130.71/1361.54ms |631.54/863.59ms |200,261,302bytes,age0,Vercel MISS,ARN/IAD region tokens |
| aktau.market/sitemap.xml |timeout before response headers |timeout before response headers |No status/body/TTFB available at15s bound; not assumed200 or4xx/5xx |

API snapshotAt **2026-10-27T13:01:59.099Z**,3015canonicalProducts,244matchedAcrossStores/spreads, identical both rounds. Cloudflare cfOrigin includes origin-side/network work; it is not SQL duration. The current Dashboard did not reproduce the historical timeout. Current sitemap responsiveness is a confirmed operational problem; neither probe certifies a cold/warm cache state.

[Vercel response-header documentation](https://vercel.com/docs/headers/response-headers) distinguishes CDN MISS from runtime fetch-cache state and describes region tokens. MISS alone does not prove a cold function or cold Data Cache. [Runtime Logs](https://vercel.com/docs/logs/runtime) expose function duration/start type and request/cache details, which are missing here. No past function region/cold start is inferred from today's ARN/IAD tokens.

## 4. Source analysis and isolated reproduction

- Dashboard page awaits `connection()` then one cached server `getDashboard()`, hydrates the real DTO and renders244spreads in today's dataset. Site layout has no server-fetch waterfall. Client map is dynamic/noSSR; it cannot cause observer HTML-fetch timeouts by downloading map tiles.
- Server HTTP adapter tags each API URL `catalog-data`, revalidate3600. Signed handler uses `revalidateTag(...,{expire:0})` plus product path expiry. [Next documentation](https://nextjs.org/docs/app/api-reference/functions/revalidateTag) confirms the next request pays blocking revalidation;204 is not proof all pages regenerated. [connection()](https://nextjs.org/docs/app/api-reference/functions/connection) requests runtime rendering; it does not eliminate tagged fetch caching. Source/cache configuration unchanged.
- Baseline sitemap launches categories/dashboard/product traversal together, but products were paginated **sequentially**,100×up to50pages.3015products required31calls. It also depends on Dashboard, so slow Dashboard can affect sitemap and catalog concurrently. Warm URL caches may help; cumulative cold-page network/query latency is an established critical path, but not a correlated historical Dashboard RCA.
- Dashboard SQL is one aggregate query. C2 projection reuses it in a read-only RepeatableRead transaction, then performs ACL/chain/category/sitemap/category-page reads. Go CLI bounds the full operation at8s, Node child at10s. Connection/session/identity initialization and multiple network roundtrips are inside those bounds. No production SQL/EXPLAIN or reader credential was used.
- Node `load()` is the component returning **null**: it catches execution/Go exit/JSON/schema/SHA/canonical-body validation errors alike. Go itself emits a nonzero exit and safe class, not a JSON null. Thus previous after_unavailable does **not** prove Go SQL failure, invalid authority or timeout specifically.

Local disposable PG17:3015synthetic products,9045offers per snapshot, two legitimate **local** snapshot states, unchanged SQL, real Go CLI/strict production read-only role. BEFORE296.23ms/2096bytes; AFTER239.24ms/1248bytes, same witness and correct S1→S0; Dashboard EXPLAIN ANALYZE140.40/138.03ms. Both providers succeeded. This excludes neither production network/pool/role problems nor different production data distributions. Disposable containers cleaned; no restored production data used.

**Minimal sitemap correction:** retain the single first-page request (short catalogs still make one call), then request at most4pages concurrently. Promise.all preserves page order; stop output at the first short page and never request page50 or later. No pagination parameter/DTO, sort, hreflang, per-product lastmod, category/dashboard lastmod, tagging or invalidation changes. Bound stays50API product calls/5000products, with at most3speculative final-batch pages; this3015-product fixture makes33rather than31calls. All page failures propagate: no200partial sitemap. A speculative page failure can also fail the render, intentionally fail-closed. Burst load can reach4API requests per sitemap instead of1; this needs production observation after review, not an assumed SLA guarantee. No warming or requests outside an actual sitemap render.

Real Next production-mode HTTP fixture,3015synthetic products,244spreads,15locations, **7,048,055-byte XML**, fresh URL namespace per run. Baseline S0, local signed204/strict expiry, then six representations concurrently under the **same** original5000ms clock. Exact structural markers checked by the existing observer; no raw-date-max oracle. Results:

| Local profile | Result / timing |
| --- | --- |
| Default small fixture |6/6 PASS; operator same-event sixGET, latest374.65ms |
| `--large`, zero injected upstream delay |6/6 first fresh976–1134ms; same-event operator6GET latest1440.65ms; XML within8MiB |
| `--large-slow-dashboard`,4500ms after-publication upstream delay |INCONCLUSIVE; dashboard/catalog/sitemap timeout around4001ms,6GET; no PASS/FAIL substitution |
| Paired original main with `--large-slow-pages`,200ms per100-product API page after invalidation |FAIL-FIRST exit1:INCONCLUSIVE instead of requiredPASS; serial31delays have6200ms floor, observer aborts at its unchanged4000ms ceiling |
| Same fixture/build settings, corrected sitemap |PASS-AFTER exit0:6/6PASS,6GET; sitemap2749.00ms, other five294–407ms. Upstream sequential-delay floor becomes9waves×200ms=1800ms rather than6200ms |

All four final **qualifications** passed their expected assertions. Slow Dashboard remains an INCONCLUSIVE observation, not six-representation PASS. The paired baseline used frontend bytes archived directly from328f6f2, its own frozen install/HTTP production build and the **same current** large fixture as the candidate; no other checkout was changed. These synthetic fault injections prove the sitemap waterfall mechanism/improvement, not which caused the historical Dashboard failure. A no-delay large fixture passed before and after; no universal latency improvement or future production PASS is inferred.

## 5. Minimal AFTER diagnostic correction

Existing envelope remains **INCONCLUSIVE / after_unavailable**, same request_count, empty events/results and one-shot settlement. Additive **`afterFailureClass`** is one of `timeout`, `identity`, `chain`, `projection`, `validation`, `output`, `execution`:

- timeout: Node's bounded child termination or exact existing Go timeout record with matching exit1;
- identity/chain/projection/output: exact complete Go stderr record AND matching exit3/4/1/1;
- validation: child succeeded but JSON/framing/schema/source/policy/canonical-body checks failed;
- output: bounded stdout overflow, or Go output record;
- execution: other child/admission/OS failures; arbitrary stderr/message is never exported.

The existing Go identity class also covers Acquire/Ping failures; it is **not** proof of a privilege violation. No raw stderr/stdout, SQL, authority payload, DSN, HTML or FIFO receipt is added. Diagnostic storage is per-load, not shared mutable provider state. Existing private trust maps, all validation, after_late/deadline checks and classification are unchanged. No class can mint custody or a qualified verdict.

Existing Node/Python ledger contracts allow additive fields within evidence. Regression writes/reopens real private local ledger: INCONCLUSIVE,series0, no leaked synthetic private stderr, no additional GET and no second AFTER. No ledger schema or production history rewritten. Existing capture `failedTarget`/`failureClass` remain separate from this AFTER field.

## 6. Fail-first, final tests and honest limitations

Evidence directory outside Git: `/home/denis/tmp/aktau-c2-latency-after-evidence-20261027`.

| Command | Actual result |
| --- | --- |
| `node --test --test-name-pattern="AFTER diagnostic" scripts/revalidation/c2-projection-v2.test.mjs` before runtime fix, with child fixtures installed |exit1, **0PASS/11FAIL/0SKIP**, missing enum assertions |
| Same focused command after fix |exit0,11/11PASS,0SKIP |
| Sitemap unit fail-first / pass-after |before:exit1,concurrency1 assertion fails (6other testsPASS); after:exit0,7/7PASS. Exact RU/KK order, each product's own lastmod,5000cap, error propagation and short-page one-call behavior checked |
| `node scripts/ci/run-checks.mjs go` |exit0: unit/race/vet/staticcheck/integration-staticcheck/govulncheck/builds, READY full-size2CPU qualification; C2+guard377/377PASS,0SKIP,actual local relayprobe |
| Final non-root `C2_LOCAL_PROBE=.../relayprobe node --test scripts/revalidation/*.test.mjs scripts/ci/guard.test.mjs` |exit0,377/377PASS,0FAIL,0SKIP |
| `node scripts/ci/run-checks.mjs ops` |exit0,Python190PASS; Node185/185PASS,0SKIP |
| `node scripts/ci/run-db-integration.mjs` |exit0,owned disposablePG17+migrations+real Go projection/READY integration; cleanupPASS |
| `node .../large-pg.mjs` (owned external local fixture using existing disposable runner) |exit0;3015products/two snapshots/real restricted Go BEFORE+AFTER, SQL timings above |
| `node scripts/ci/run-checks.mjs frontend` after sitemap change |exit0, frozen install/typecheck/lint/unit278PASS with `--no-isolate`/audit/build; E2E57PASS, **11existingSKIP**, not counted as PASS |
| `cd frontend && pnpm test` |exit0,45files,278/278PASS, isolated mode |
| `node scripts/ci/run-root-bundle-integration.mjs` |exit0,69/69PASS,real isolated Linux UID/runuser/Git/ACL/crash/rollback tests,own Docker fixture cleaned; no production root execution |
| Explicit HTTP-mode production build + `node scripts/revalidation/cache-smoke.mjs [small\|--large\|--large-slow-dashboard\|--large-slow-pages]` |all four final expected qualifications exit0; slow-Dashboard negative staysINCONCLUSIVE, controlled-page latency passes only after sitemap fix |
| JS syntax, Part16 static verifier, security profile, diff/scope/privacy/links |executed locally; no production acceptance claim |

Qualification setup failures retained in logs: the first large run used the E2E-generated mock build and returned404; rebuilt in explicit HTTP mode. The first large XML fixture exceeded its intended bounded size; adjusted only synthetic ID/image lengths to7,048,055bytes. LOCAL fetch AbortError/TimeoutError initially mapped to generic transport; the test adapter now normalizes these to the same closed timeout enum as production publicGet. A ledger reopen test initially tried close without a prepared terminal attempt; corrected to the real lifecycle, then the full377-suite passed. Assertions/production limits were not relaxed; no failing run counted as PASS.

Reproduction after frozen frontend install:

```sh
cd frontend
NEXT_PUBLIC_API_MODE=http NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:18090 \
API_BASE_URL=http://127.0.0.1:18090 NEXT_PUBLIC_SITE_URL=http://localhost:3100 \
NEXT_PUBLIC_ENABLE_TEST_MOCKS=0 pnpm build
cd ..
node scripts/revalidation/cache-smoke.mjs --large
node scripts/revalidation/cache-smoke.mjs --large-slow-dashboard
node scripts/revalidation/cache-smoke.mjs --large-slow-pages
```

No external GA/Yandex hits in tests; local HTTP fixtures only. Hosted CI belongs to the exact PR head and is reported in PR checks/final handoff; queued/skipped is not SUCCESS. This source report does not predeclare a not-yet-created hosted run successful.

## 7. Remaining work and production boundary

**Dashboard historical root cause: NOT_PROVEN. AFTER historical root cause: NOT_PROVEN. Current sitemap slowness: CONFIRMED; responsible production upstream spans/cache state: NOT_PROVEN. Cold-pagination waterfall and AFTER information-loss defects: CONFIRMED; source/local corrections qualified.** No before/after production latency improvement exists, because production was not changed.

Backend1 owns next implementation and deployment. Needed evidence: authenticated Vercel invocation details for the failed timestamps (user-agent C2, path, request start/end, cache reason/runtime-fetch spans, function duration/start type/region), matching Go request durations or existing metrics for the same interval, and future AFTER enum. Do not assume aggregate current health or MISS supplies these. No further evidence was requested from Backend2: its role remains observing natural cycles and retaining true results.

After independent review/authorized merge, the frontend correction uses the existing Vercel integration, followed by bounded site readback; no cache/env/settings changes. The Node correction uses existing authenticated `sync-publisher-build.yml mode=manual-artifact` for exact-main+CI9; verify original ZIP/provenance/source.bundle/Go1.27.3/12C2 hashes and protected contracts, then separately authorized single official root-executor promotion with idle/locks/authority/reader/ledger/rollback preservation and independent readback. Producer/root pins must be checked against actual reviewed source, never manually patched or assumed compatible. **No merge, artifact, root approval or promotion created by this task.** Dashboard/Go-runtime/cache changes still need an evidence-backed diff if missing spans establish their bottleneck.

HTTP4000/READY5000/convergence5000 and conservative clock boundaries stay intact. No artificial sync, second apply, HMAC POST, Vercel mutation, VPS promotion, merge, release/tag or AUTO DEPLOY. Backend2 must not interpret these local tests or a future diagnostic field as production PASS. Natural acceptance remains0/3; no history removed.

**STOP for independent review.**
