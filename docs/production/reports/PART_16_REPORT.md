# Production Part16 — frontend on-demand revalidation

Status: **READY_FOR_EXTERNAL_REVIEW**

Source candidate only. The owner-approved launch gate is cache convergence within
5 seconds after signed204, not guaranteed first-response freshness. No main/Vercel
release or production freshness claim is made.

## Immutable source preflight

Branch integrate/full-stack; clean tree before source changes; fetch --prune PASS.
HEAD=origin/integrate/full-stack=`3682dc5384537c179f8dc4fc0e845bbc135bc5fe`.
origin/main=`37fdf7cfcbc13a02ea43aa97c7a727b96189c4e2`.
Merge-base is origin/main. Main-only0 / integration-only120 commits;
left-right --cherry-pick inspection shows no independent main work.
Vercel Production branch = `main`; integration/review branch = integrate/full-stack.
No merge/rebase/main update or Vercel action in this source-review iteration.
Part15 DONE; production Go release remains e6ef854e2973e5b0871888bbc3111e026cdccc5b.

## Implementation and exact semantics

Protected Node Route Handler POST /internal/revalidate. Server secret name only:
REVALIDATE_HMAC_SECRET. HMAC-SHA256 over timestamp + period + exact body bytes;
X-Adilbaga-Timestamp / X-Adilbaga-Signature, constant-time compare, ±300s.
Body fixed snapshot_published event, max128 streaming bytes; no caller tag/path.
Responses204/401/400/503 empty no-store; no exported GET (Next405).
Locale proxy narrowly bypasses this endpoint, otherwise preserves routing.

Reuse catalog-data; immediate revalidateTag second arg expire0 supported by local
Next16.3.8 type declarations and official API. Fixed product ISR pattern
/[lang]/(site)/products/[id] page invalidation (including route group). Sitemap already runtime/dynamic, tagged
fetch expiry covers it; no blanket invalidation of dynamic catalog/dashboard.
Skill next-best-practices informed Node handler boundary and fixed cache calls.
See docs/production/FRONTEND_REVALIDATION.md for protocol/operations/release.

Go internal/revalidation dedicated client: HTTPS production, fixed endpoint,
no userinfo/query/fragment, secret minimum32bytes; loopback HTTP test/dev only.
cmd/ingest validates before staging. PublishThenNotify invokes signed bounded5s
notification only after successful Publish; dry-run/failed publish never notify.
Ingestion transaction source unchanged. Failure outcome degraded, publication
exit-success preserved; no rollback/failed-state/automatic transaction retry.
One attempt;3600s TTL remains safety fallback. Structured logs contain class only.
Shared TS/Go synthetic golden vector; no actual secret/signature in this report.

## Verification and discovered cache freshness blocker

Go gofmt/module verify/full unit/race/vet/pinned staticcheck normal+integration/
pinned govulncheck PASS (no vulnerabilities found).
Part15 verifier/test PASS31/31; no runtime image/redeploy.
Initial focused frontend tests PASS23/23.
Initial typegen invocation rejected missing explicit API env (expected fail-closed
config); rerun with explicit local HTTP configuration. One new test typing issue
fixed without dependency/config change. Synthetic timeout test cleanup corrected
before complete Go PASS; production notifier timeout unchanged.
Frontend typecheck/lint PASS. Full Vitest on /mnt/d hit the established
fork-worker startup timeout, not an assertion failure; source/config/dependencies
and timeouts were not changed to hide it. A148-file byte-identical native-WSL
source copy (excluding real env/generated/dependencies) installed with frozen
lockfile; full suite PASS36files/200tests. HTTP production build PASS with local
API endpoint absent; no build-time API availability required.
Disposable PG17 run-db-integration harness PASS including category/filter/query/
dashboard/restricted pool, batching rollback/security/least privilege and plans;
only task-owned local test data/roles/migrations used, no production connection.

Historical blocker: **PART16_PRODUCT_ISR_SITEMAP_IMMEDIATE_FRESHNESS_FAILED**.
scripts/revalidation/cache-smoke.mjs uses a synthetic mutable HTTP API and real
Next16.3.8 HTTP production server, fresh per-run fetch-key namespace/product ISR
IDs to exclude persisted-cache contamination. No DB/provider/private credentials.
Baseline product MISS, warm product HIT; unauthenticated POST401, GET405,
signed webhook204. After source revision and accepted webhook, first product
request is STALE with old HTML; underlying detail fetch count advances1→2.
Immediate second request is also STALE; bounded diagnostic polling subsequently
observes fresh HIT in232ms. First sitemap also remains old. Strict first-response
freshness assertion FAIL (exit1); eventual freshness is **not substituted** for
the requested immediate gate. No production or Vercel behavior is inferred.

Initial invalidation pattern omitted the `(site)` route group; local Next implicit
tags and [official path examples](https://nextjs.org/docs/app/api-reference/functions/revalidatePath)
confirmed the full fixed pattern. It was corrected, but the isolated reproduction
above still fails, so route-group correction alone is NOT claimed a resolution.
The [official immediate tag API](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)
and locally compiled two-argument expire0 call remain unchanged; no unsupported
private Next API, dependency upgrade, artificial delay in the endpoint, whole-app
cache disabling or permissive freshness assertion was introduced.
One earlier diagnostic startup raced an unfinished build; discarded as evidence.
Subsequent reproduction ran only after completed build; compiled handler pattern
and cache metadata were checked without raw request/secret logging.

Ephemeral staging completed PASS on fresh disposable PG17: local Go/Nest
TestHTTPParity, category visibility, security query, Content-Type and Voice parity.
Frozen GET contracts PASS on both Go and Nest (18 passed each; four fixture-profile
Voice cases explicitly skipped). Existing real LOCAL HTTP Playwright PASS12/12,
desktop and iPhone viewport, including SSR/SEO, catalog, filters/search/sorts,
dashboard/map and console-error checks. This is not production HTTP evidence.
Docker build/security smoke PASS: non-root UID10001, read-only root filesystem,
CA certificates, no compiler. DB outage live200/ready503 and recovery ready200
without API restart PASS. Task-owned containers/network/processes cleaned up.
Native-WSL source byte-match, final typecheck/lint and full Go matrix PASS.
These regressions cannot override the strict cache-freshness failure; cache-smoke
stops at that assertion, so its later catalog/dashboard checks are NOT claimed PASS.
This was BLOCKED under the original strict first-response acceptance criterion.
The later owner decision and replacement gate are recorded below; historical
STALE evidence is not rewritten as first-response success.
Hosted CI for uncommitted candidate NOT RUN.

## External-review remediation — approved5s convergence gate

External review accepted HMAC webhook and post-COMMIT notifier as a source candidate.
The owner explicitly accepted first-response STALE only within a bounded5s window.
No runtime change in this iteration: tag expire0, fixed product path, ISR strategy,
Next version,3600s fallback TTL, HMAC/body and notifier remain unchanged.
Only the LOCAL cache-smoke and these two Part16 documents were updated.

The real Next16.3.8 HTTP production build ran against a mutable synthetic LOCAL
API. Per-run unique fetch namespace/product IDs; warm stale precondition proved
for every required path, including RU/KK product HIT. GET405/auth401/signed204 PASS.
All paths use one shared monotonic5000ms deadline starting at accepted204; each
request/body is bounded by its remaining budget. Conditional100ms maximum poll
after a stale response only; no unconditional delay or per-poll budget reset.
Sitemap proof requires every lastmod value to equal the new synthetic snapshot.

| Path | First cache header | First response fresh | Time until fresh (ms) | Stale responses | Eventual gate |
| --- | --- | --- | ---: | ---: | --- |
| RU product | STALE | no | 283 | 2 | PASS |
| KK product | STALE | no | 205 | 1 | PASS |
| sitemap | absent | no | 142 | 1 | PASS |
| catalog | absent | yes | 180 | 0 | PASS |
| dashboard | absent | yes | 184 | 0 | PASS |
| milk category | absent | no | 324 | 1 | PASS |

Global synthetic product-detail API fetch count:8 after warm preconditions,16 at
each convergence observation (includes detail/related-product SSR calls across
these paths). Cache-smoke exit0; all required paths fresh within324ms, below5s.
First-response freshness is explicitly NOT claimed for stale rows.
No production/Vercel convergence SLA inferred from a single LOCAL reproduction.

Final rerun: frontend typecheck/lint/HTTP production build PASS; full unit suite
PASS36files/200tests in the unchanged148-file byte-identical native-WSL copy.
All env files/generated outputs excluded from that copy; no worker-timeout hack.
An initial byte-match inventory incorrectly included the intentionally omitted
env example; corrected exclusion inventory PASS without changing source/copy.
Go gofmt check/mod verify/full uncached unit/race/vet/pinned staticcheck normal
and integration/pinned govulncheck PASS, no reachable known vulnerabilities.
Part15 verifier tests31/31 and Part16 tests4/4 PASS; static verifiers PASS.
Earlier full PG17/Go-Nest/contracts/HTTP E2E12/12/Docker regression evidence above
is retained: none of their runtime/test sources changed in this remediation.
No additional DB/provider/production access was needed for the cache gate.

## Changed files and archive

Only Part16 candidate files changed:

- backend-go/cmd/ingest/main.go and main_test.go;
- backend-go/internal/revalidation/.env.example, client.go, client_test.go;
- frontend/.env.example, src/proxy.ts and proxy.test.ts;
- frontend/src/app/internal/revalidate/route.ts and route.test.ts;
- frontend/src/lib/revalidation.ts;
- docs/production/FRONTEND_REVALIDATION.md and this report;
- scripts/create-clean-archive.mjs;
- scripts/revalidation/cache-smoke.mjs, verify-part16.mjs,
  verify-part16.test.mjs, verify-archive.mjs.

Permanent archive target production-part-16 added;
artifacts/production-part-16-review.tar.gz created and verified PASS: 520 safe,
regular, unique members, all archived source/report bytes match working files,
bounded secret scan PASS. No real env, credentials, backups, generated Next files,
dependencies, build/test outputs or temporary workspaces included.
Part16 static tests PASS4/4; verifier PASS; git diff --check PASS.
Archive contains the bounded-convergence source-review candidate, not an accepted
production release. Previous strict-freshness BLOCKED evidence is preserved above.

## Safety and remaining release gates

DB mutation: NONE (production). Migration: NONE (production).
New production snapshot: NONE. Production DB/provider access: NONE.
VPS API change: NONE. Cloudflare change: NONE. Redis/Voice/Gemini change: NONE.
Frontend production deployment/secret setup/signed smoke NOT RUN; main untouched.
Commit/push: NONE. Part17: NOT STARTED.
Source review and exact-SHA CI, reviewed main PR/merge and Vercel production
configuration/deployment smoke remain future separately authorized gates.
