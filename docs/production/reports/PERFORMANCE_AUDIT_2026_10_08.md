# Production Next.js performance audit — Adil Bağa

Status: **READY_FOR_EXTERNAL_REVIEW**

Diagnostic pass only. No runtime fix, commit, push or deployment. This is not
Part17 work. Measurements identify latency contributors, not a universal single
root cause for the owner's original waterfall.

## Baseline and scope

Fetch --prune completed; initial working tree clean on integrate/full-stack.
HEAD, origin/integrate/full-stack and origin/main all equal
`45314932e1606911ac1f927d3a07b60ac084d3d4`.
Main contains merged PR18 / OSM hotfix commit
`f30b326e4a28a9c5910ca06b838d39ababae6e2e`.
Its four-file diff uses the official tile endpoint and image-scoped referrer
policy, preserves global no-referrer and removes a/b/c tile CSP origins.
One production HEAD response independently confirmed status200,
Referrer-Policy=no-referrer, official OSM CSP origin present and obsolete origins
absent. No new map/tile smoke was run in this performance audit.

Frontend production source is main on Vercel; measured site aktau.market,
public Go API api.aktau.market. Repository/deployment SHA association beyond
public behavior was not independently obtained from the Vercel dashboard.

## Method and limits

2026-10-08, approximately11:08–11:14UTC. WSL2 Linux6.18.40.1, x86_64;
Node24.10.0; installed Chrome151.0.7922.173, headless,1280x800.
No CPU/network throttling, browser cache disabling, service configuration change
or artificial cache invalidation. This is one operator network, not mobile/field
percentiles or a capacity test.

Bounded, sequential browsing: fresh-context direct milk visit and reload;
separate fresh-context catalog→milk click→product click→back→repeat product click.
Two supplemental sessions sampled complete RSC bodies and a product document.
Automatic Next viewport prefetch and normal lazy images were left intact.
No exhaustive product crawl, image prefetch, OSM request, load generator, Voice,
Gemini, Upstash, operator SQL or private production credential was used.
Public API measurements were12 sequential GETs, three per endpoint.

Chrome DevTools Protocol Network events separated Document, RSC/prefetch and
Image traffic; browser Performance API measured navigation and explicit GETs.
TTFB below is client request start→response headers, not isolated server CPU or
SQL. After-headers time includes stream waiting, delivery and browser processing;
it is not proof of bandwidth limitation. Small CDP event ordering differences
can be a few milliseconds. Encoded CDP bytes include transfer overhead;
decoded bytes are observed body bytes. Canceled streams have no reliable final
encoded transfer size and are explicitly identified.

Fresh browser context means cold **browser** state only. We did not flush Vercel
Data Cache, ISR or CDN. x-vercel-cache=MISS on dynamic routes is not evidence that
the underlying3600s fetch cache missed. Product HIT is distinct from both browser
Router Cache and API latency.

Only sanitized timings/labels were retained outside Git during collection.
No HAR, cookies, request bodies, RSC bodies, product names/IDs, image paths,
credentials, private configuration or private filesystem paths are in this report.

## Actual navigation versus prefetch

Content-ready means the expected product-card grid/detail DOM was visible, not
that every image had decoded or a field LCP measurement completed. Click durations
include Playwright's actionability wait; they are not React-render CPU timings.

| Action | Content ready, ms | Observation |
| --- | ---: | --- |
| Milk, first browser visit | 678.7 |24 SSR/hydrated cards |
| Milk, same-context reload | 604.0 |24 cards; repeat browser/cache state |
| Catalog entry | 882.6 |8 initial deal cards |
| Actual catalog→milk click | 426.2 |24 cards; not background prefetch |
| Actual milk→product click | 50.5 |Product already prefetched |
| Router back to milk | 42.3 |Reused client state |
| Repeat product click | 43.6 |Warm Router Cache |

The owner's2.37s category RSC /1.46s product prefetch observations remain valid
external observations, but were **not reproduced** as those exact timings here.
A slow/canceled background request must not be equated to click latency.

Across the primary two contexts:37 prefetch requests,21 aborted and5 without a
completed timing at the observation boundary. Partial route-shell reads and test
navigation/context lifecycle can abort streams; these are not counted as failed
user page loads. No causal prefetch contention was established.

Completed product prefetch samples:

- One MISS: TTFB754.3ms, total755.5ms,12,835 encoded /51,741 decoded bytes.
- Seven HITs: TTFB111.0–132.8ms, total112.8–134.1ms;
  11,713–12,859 encoded /49,494–51,741 decoded bytes.
- Subsequent product clicks50.5/43.6ms did not issue a new product RSC request in
  the recorded window. Prefetch demonstrably helped this navigation sample.

## Response and stream measurements

| Response | TTFB ms | Total ms | After headers ms | Encoded bytes | Decoded bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Milk HTML, first browser visit |494.7|506.4|11.7|25,618|196,372|
| Milk HTML, repeat reload |271.4|492.3|220.9|25,026|196,372|
| Catalog HTML |471.6|767.5|295.9|35,159|181,826|
| Real milk-click RSC, partial/aborted |242.8|256.9 to abort|14.1|not available|22,244 observed|
| Product HTML, supplemental HIT |65.0|112.9|47.9|18,394 body bytes|104,989|

Milk reload had a202.7ms gap between body events; catalog had a290.7ms gap.
These show that a download interval can contain periods without arriving body
chunks. They do not identify whether the gap is generation, proxy buffering or
network scheduling. No Vercel function trace or Server-Timing was available to
separate those causes. The production HEAD exposed no Server-Timing header.

Four bounded same-origin complete-body RSC controls, RSC:1 and one fixed
diagnostic transport query, returned200 / text/x-component / Brotli / MISS:

| Control | TTFB ms | Total ms | After headers ms | Decoded bytes |
| --- | ---: | ---: | ---: | ---: |
| First session, request1 |248.8|258.8|10.0|27,638|
| First session, request2 |244.3|263.9|19.6|27,638|
| Second session, request1 |268.1|277.6|9.5|27,638|
| Second session, request2 |246.1|263.2|17.1|27,638|

These controls read to EOF; they do not include the router-state headers of an
actual click and are **not** claimed to be its identical payload or wire size.
They did not reproduce a2.12s body tail. Small compressed product payloads and
fast body tails do not support a blanket “RSC is too large” diagnosis.

## Public Go API latency

Browser GETs from aktau.market, existing connection state, no cache-busting or
private access. All12 responses200. Request parameters for the list were
category=milk, sort=price_asc, limit24, offset0; detail used the clicked product.

| Endpoint | Total min / median / max, ms | TTFB samples, ms | Body read, ms | Decoded bytes |
| --- | --- | --- | --- | ---: |
| categories |735.1 /799.8 /1045.5|1044.7,734.6,798.9|0.5–0.9|798|
| milk filters |909.2 /909.6 /912.3|908.5,911.6,908.9|0.7|1,826|
| milk products,24 |1484.1 /1624.6 /1824.6|1823.4,1623.6,1482.5|1.0–1.6|12,365|
| product detail |782.2 /796.8 /798.4|795.6,797.4,781.4|0.8–1.2|557|

Confirmed: API waiting dominates response-body transfer for these requests.
This measures browser→Cloudflare→Go→database path as a whole. It does **not**
prove slow SQL, pool starvation, a DB index defect, VPS CPU saturation or a
specific region/network hop. No DB/infra optimization is authorized by this evidence.

No spontaneous duplicate browser API GETs appeared in the primary fresh milk
visit. The12 API requests in the click context were deliberately initiated by
the audit after navigation, not a React Query hydration waterfall.

## Source-confirmed dependencies

- Category page: categories and filter schema run in parallel, then the first
 24-product query is awaited before returning HydrationBoundary. Filter parsing
 genuinely needs the discovered schema when dynamic filters are present.
- Category generateMetadata requests categories/filters too, but server.ts
 wraps both in React.cache; there is no source basis to claim two independent
 fetches per render. Metadata also waits for filter discovery for404 handling.
- Product: getProduct, then category filters for labels. Metadata and page
 share cached getProduct. Filters are optional on error but still awaited on
 success. Product ISR remains revalidate3600 with empty generateStaticParams.
- Catalog: categories/dashboard parallel, then up to8 detail requests in
 parallel. It is a bounded dependency chain, not an8-request serial loop.
- Server httpAdapter uses next.revalidate3600 and catalog-data; client queries
 use staleTime Infinity. Providers owns one QueryClient per browser tab and
 HydrationBoundary seeds matching query keys. No evidence of blind mount refetch.
- No route-level loading.tsx exists. Category client skeletons cannot provide
 immediate feedback while the preceding server page is still awaiting its data.
- ProductCard uses default Next Link prefetch; no manual aggressive crawler.

One additionally confirmed API dependency explains an optimization candidate:
backend-go/internal/httpapi/catalog.go products() calls GetFilterSchema whenever
one nonempty category is provided, **even when the query has no dynamic filters**.
Only after discovery does it parse the query and call ListProducts. Discovery
uses its own snapshot read transaction. The repository then uses another
snapshot read transaction plus bounded product/offers queries. ListProducts
validateFilters itself returns immediately when Filters is empty.
This is not N+1, but the unfiltered request still pays for unnecessary discovery.
Its exact contribution has not been isolated with server timings; subtracting
the filters median from the products median is not a valid SQL benchmark.

## External images and loading policy

ProductImage is native img, loading=lazy, decoding=async, automatic fetch priority
everywhere, including product detail. It falls back on missing/failed source and
checks pre-hydration failures. No Next image optimizer/resizing is configured.

- Fresh milk context:2 DINA JPEGs200,534.4/725.3ms,8,618/11,162 encoded bytes;
 six DANA images200,278.2–506.8ms. Largest DANA PNG:153,533 transferred bytes,
 about506.8ms total, including152.1ms after headers.
- Fresh catalog context:8 DINA JPEGs200,648.8–668.1ms,5,946–12,924 encoded bytes.
- Milk reload DINA conditional requests returned304 at129.5ms: browser image
 caching is operating, not globally disabled.
- Milk grid had24 cards but17 image elements; at the bounded observation one
 visible image was loaded and8/17 total were loaded. Other below-viewport lazy
 images and products without a source must not be reported as failed transfers.
- No FIX_PRICE image was requested in the observed viewports; its performance
 is unknown, not PASS or FAIL.

Supplemental image observation limitation: the first helper's completion wait
timed out after its two successful RSC measurements because the targeted image
element no longer satisfied the completion condition. A second bounded5s
observation saw no remaining main img element (placeholder state); product
document200/HIT and H1 LCP candidate192ms were recorded. Without captured image
status in that supplemental helper, its disappearance is **not** attributed to
403, a provider outage or hydration. These attempts do not prove image-LCP
priority is the bottleneck. No blanket eager-loading/priority change is proposed.

## Confidence and minimal remediation proposal — NOT implemented

| Finding | Confidence | Consequence |
| --- | --- | --- |
| Go endpoint wait dominates API transfers |High,12 samples|Cache misses / client filter requests can expose it |
| No-filter products still run discovery first |High, source|Avoidable sequential work; benefit needs a focused before/after proof |
| External image latency is independent of RSC |High, real image requests|Some pictures complete later even with ready text/prices |
| Default prefetch helps warm product clicks |High for measured flow|Do not disable globally based on canceled requests |
| Missing route loading boundary |High, source|A pending dynamic navigation lacks server-route fallback feedback |
| Original2.12s tail caused by SQL, Vercel CPU or bandwidth |Unproven|Do not claim one root cause or optimize infrastructure |
| Oversized RSC / harmful prefetch contention |Not established|Do not rewrite hydration, ISR or caching |

**Smallest actual-latency candidate for a separate reviewed patch:** restrict the
Go HTTP schema-discovery call to requests containing category-dependent dynamic
query keys. Base category/search/sort/limit/offset-only requests should not need
discovery. Do not remove validation for unknown/dynamic keys, bypass latest
snapshot protection, change unknown-category behavior, DTOs or public bounds.
This is an internal API optimization proposal only; no Go code was changed here.
Prove call counts and exact Nest/Go400/404/list/filter parity locally, then make
a few bounded before/after samples. Expected speedup is not asserted as a measured
number. No schema, index, role or DB cache change is needed by this proposal.

**Smallest frontend-only UX candidate:** one category-route loading.tsx reusing
the existing CategoryPageSkeleton/accessible loading state. It addresses the
measured426ms pending click and longer cache-miss navigation by showing feedback;
it does not promise to reduce the API latency or body transfer. Keep product ISR,
3600s data cache, tag/path revalidation, SSR content, RU/KK and Link defaults.
Validate streamed SEO metadata, unknown-category404/noindex behavior, layout
stability, accessibility and actual-click feedback before accepting that patch.
Next documents this boundary as a partial-prefetch/navigation-feedback mechanism,
not a database acceleration mechanism. [Next navigation guide](https://nextjs.org/docs/app/getting-started/linking-and-navigating).

Not recommended now: disable all prefetch; drop ISR/TTL; remove SSR hydration;
mark every grid image eager/high priority; add a CDN/provider/dependency; mutate
DB/indexes; or move regions without evidence. A selective detail-image priority
change needs an actual image LCP/load-delay trace on an image-bearing product.

The initial owner's slow sample still needs a comparable sanitized trace with
cache status, full/partial payload distinction, actual click timing and chunk
gaps. Correlating existing privacy-safe API durations and Vercel timings later
would distinguish network, dependency waiting and render work without expanding
public DTOs. Public-page MISS alone cannot diagnose Data Cache failure.
[Next fetch cache reference](https://nextjs.org/docs/app/api-reference/functions/fetch).
For phase definitions, distinguish queued/waiting/download intervals rather than
assigning bandwidth blame from their labels alone.
[Chrome Network timing reference](https://developer.chrome.com/docs/devtools/network/reference#timing-explanation).

## Verification and safety

Only this report is changed. Runtime/tests/dependencies/configuration remain
byte-unchanged; the merged OSM fix is preserved. Existing test suites were not
rerun because no executable source was changed. This report does not substitute
audit observations for a new test-suite PASS. Temporary browser helpers ran
outside the repository and closed their processes/contexts.

git diff --check and bounded report secret/private-path scan completed PASS.
No DB migrations, ingestion, snapshots, production writes, infrastructure/Vercel
settings, provider/session writes, deploy, commit or push. STOP for external review
before implementing either proposed patch.
