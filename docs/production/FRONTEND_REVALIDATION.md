# Snapshot publication → frontend revalidation

Source-review candidate only; bounded convergence acceptance described below.
Vercel Production branch stays **main**;
**integrate/full-stack** is integration/review, not the deployment shortcut.
Part15 runtime remains unchanged. No Part17 work.

## Wire and configuration

Server-only `REVALIDATE_HMAC_SECRET`: at least 32 random bytes of entropy,
privately provisioned to Vercel Production and the one-shot ingestion process.
Never use NEXT_PUBLIC, Git, reports or shell tracing for its value.
Ingestion-only `FRONTEND_REVALIDATE_URL=https://aktau.market/internal/revalidate`.
Examples live in frontend/.env.example and
backend-go/internal/revalidation/.env.example; API runtime does not require them.

POST exact UTF-8 body `{"event":"snapshot_published"}` to `/internal/revalidate`.
`X-Adilbaga-Timestamp` is Unix seconds. `X-Adilbaga-Signature` is `v1=` followed
by lowercase hex HMAC-SHA256 over timestamp + period + exact raw body bytes.
Timestamp skew/replay window is ±300 seconds; replay within that window is
idempotent. Authentication uses constant-time digest comparison. Body max128
bytes (stream counted, not trusting Content-Length). Missing/short server secret
503; bad/missing authentication or oversize body401; authenticated non-fixed body
or query400; success204; GET405. Responses are empty/no-store. No input logging.
There are no caller-selected tags, paths, product IDs or URLs.

## Cache strategy

Reuse server fetch tag `catalog-data` with Next16.3.8
`revalidateTag('catalog-data', { expire: 0 })`, not stale-while-revalidate `max`
and not Server-Action-only updateTag. Explicit fixed
`revalidatePath('/[lang]/(site)/products/[id]', 'page')` invalidates generated product
ISR output for both languages. Catalog/dashboard/category are runtime rendered;
sitemap uses connection() and the same tagged API fetches. This is the intended
expiration strategy; it does **not guarantee strict first-response freshness**.
No unnecessary dynamic-route path invalidation.
Already open browser query caches are not pushed/refreshed by a webhook; new
server requests are the freshness boundary.

### Approved bounded consistency and historical evidence

Real Next16.3.8 production-mode LOCAL smoke with synthetic mutable HTTP data
accepted the signed webhook but returned old product ISR HTML with STALE on its
first request; first sitemap response also retained the old snapshot. Subsequent
bounded diagnostic observation saw fresh product HIT after232ms, not after an
hour. The original test failed strict first-response freshness rather than
claiming eventual regeneration as that stronger PASS. Per-run unique fetch namespace/product
IDs exclude previous-run cache contamination. Correct route-group pattern and
expire0 did not eliminate this result. No Next internals/dependency/timeout or
whole-app caching hacks applied. This historical failure is retained, not rewritten
as first-response success.

The owner subsequently approved **bounded cache convergence within 5 seconds**
after accepted signed204, with a healthy data source. First-response STALE inside
that window is allowed. The LOCAL cache smoke warms all required paths against a
synthetic mutable HTTP API, changes the synthetic revision, accepts signed204 and
probes real Next production responses with one shared5000ms monotonic deadline.
It checks RU/KK product, all sitemap lastmod values, catalog, dashboard and category;
records first response/cache status, stale count, time until fresh and detail API
fetch count. Polling is conditional on a stale response, requests are bounded by
the remaining deadline, and any required path exceeding it FAILS. No unconditional
sleep conceals an old response. This is LOCAL evidence, not a Vercel convergence
SLA; first legitimate production publication must record deployment-level evidence.
Already open client caches are outside this new-server-request boundary. Failed
notification is degraded and retains the separate3600s TTL safety fallback; it is
not claimed to satisfy the accepted-event5s gate.

Current LOCAL result: all six paths PASS within142–324ms; RU/KK product first
responses were STALE, sitemap/category first responses were old, catalog/dashboard
first responses were fresh. See PART_16_REPORT.md for per-path counts/timings.

## Commit ordering and degraded outcome

One-shot cmd/ingest validates notifier config **before connecting/staging** for
any --apply; production requires HTTPS, no userinfo/query/fragment, fixed endpoint
path and secret minimum length. Test/development HTTP is loopback-only.
Dry-run does not require notifier config and never sends HTTP.

Only after successful staged.Publish COMMIT, signed POST runs with a fresh5s
bounded context/client, no redirect following, fixed JSON and no other data.
No network is introduced into the ingestion transaction/package. Publication
failure never notifies. Notification success is structured `outcome_class=success`;
failure is `degraded`. Published data stays published: command publication success
remains exit0 (unless an independent summary-output error occurs). There is one
attempt, no transaction retry, scheduler, queue or automatic second snapshot.
The unchanged3600s fetch/ISR TTL is the safety fallback. A signed event can be
resent separately after network/Vercel recovery; never rerun --apply solely to
invalidate frontend cache. No endpoint/provider response body or URL/secret is
included in notification errors/logging.

## Release (NOT executed in source review)

After external source PASS: commit/push integration → exact-SHA CI → recheck main
divergence → reviewed combined integration-to-main PR/CI → owner merge → Vercel
Production deploy from main. Review full accumulated diff/root directory/frontend
build and environment; do not change Production Branch. Configure the shared
Production secret privately before the release becomes active; env changes need
a deployment. Bounded production smoke: unauthenticated rejection, bad-signature
rejection, correctly signed204, public catalog/dashboard/category/product/sitemap.
Do not publish a production snapshot just to test. First legitimate publish later
records post-commit notification/freshness evidence. Part16 DONE only after those
release/deployment gates, not this source-review candidate.
