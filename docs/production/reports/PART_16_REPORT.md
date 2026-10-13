# Production Part16 — frontend on-demand revalidation

Status: **READY_FOR_EXTERNAL_REVIEW**

Current Stage A disposition: Vercel deployment metadata owner-confirmed and SHA
matches fresh `origin/main`; prior missing-SHA blocker RESOLVED. Public read-only
checks PASS; no application defect established. Production DONE is not claimed:
authorized signed-event/cache-convergence verification remains a separate gate.

Current independent preflight (2026-10-13): exact-main source/local checks PASS;
Part16 is **not yet claimed production DONE**. Vercel production configuration,
private shared-secret provisioning and authorized signed production smoke remain
unverified. See the appended release-preflight section. Historical source-review
checkpoints below, including STALE evidence, are preserved.

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

## Independent production-release preflight — 2026-10-13

Preflight result: **READY_FOR_EXTERNAL_REVIEW** for source/local verification and
the release checklist, **not Part16 production DONE or permission to deploy**.
No confirmed runtime defect found; no functionality, tests, framework/cache model,
contract or dependency was rewritten. Automatic CI/CD Activation remains frozen
and its workflow/Environment/flag/report were not changed.

### Actual main and evidence provenance

Fresh fetch/prune: origin/main=
`bbdd25aac35852b9a1f24a391dcdca2621fd5457`.
Local integrate/full-stack HEAD=origin/integration=
`20a96120c165fd45ecfcf740c3ef66e2703a2bf7`.
Merge-base is that integration HEAD; main-only3/integration-only0 commits.
Cherry-pick-aware inspection identifies the approved automatic-CI/CD commit on
main. No merge/rebase/switch or attempt to overwrite main was made.

Part16 source commit `57f977cd011c611ec85de1435ec17fcfa0009d05` is an ancestor
of current main. Part16 frontend/notifier/ingest/revalidation sources have no diff
from accepted release438ecdfa... to current main; the source is no longer only an
unmerged candidate. Earlier report lines saying main was untouched describe their
historical source phase, not the current Git state.

Tests ran from a clean Git export of this exact main SHA in native WSL. All548
tracked files byte-compared with Git blobs before and after checks; no real env
was exported, source/module/package/lockfile bytes unchanged. Generated build
outputs/dependencies remained only in that temporary test workspace. Main checkout
was not changed; existing Part15 reports/runbooks and CI/CD precheck preserved.

Independently rechecked [CI run38318571413](https://github.com/kiratonine/AdilBaga/actions/runs/38318571413):
push-main, exact SHA, attempt1, nine distinct jobs success: Contracts, Frontend,
Go Quality, Security, Nest Reference, Pipeline Quality, PostgreSQL Integration,
Ephemeral Staging and CI Gate. These are hosted evidence, not locally rerun DB
integration/HTTP E2E in this task. No local or production PostgreSQL was changed.

GitHub commit status **Vercel / success / Deployment has completed** exists for
this main SHA. That status alone does not establish Production vs Preview alias,
effective Root Directory/Framework/env or successful HMAC activation. No Vercel
dashboard/account settings were read or changed, no deployment initiated, and no
production webhook/API requests were sent.

### Endpoint, cache and notifier review

- `/internal/revalidate` is a Node Route Handler exporting POST only; proxy
  bypass is fixed/narrow. GET is not a cache mutation action.
- Server-only secret, minimum32 UTF-8 bytes; CSPRNG entropy must be provisioned
  operationally, not inferred from a string-length check. HMAC-SHA256 signs exact
  timestamp+period+raw body; lower-hex format/length checked before timingSafeEqual;
  timestamp window includes ±300s boundaries. No arbitrary tags/paths/IDs.
- Streaming128-byte body bound, fixed event, query rejection and empty/no-store
  responses. Missing/short secret503; authentication/oversize401; authenticated
  invalid body/query400; valid204. Secret/signature/input is not logged or returned.
- Existing catalog-data fetch tag/3600s TTL reused. expire0 plus fixed product page
  pattern covers RU/KK ISR; sitemap runtime connection and tagged reads cover
  snapshot freshness. These calls compile against installed Next16.3.8 types.
  The next-best-practices skill guided the Node handler/cache-boundary review;
  current official Next docs were cross-checked, not used to upgrade the framework.
- Go notifier configuration is validated before DB connection/staging for apply;
  production HTTPS/fixed path/no userinfo-query-fragment, short-secret rejection.
  Dry-run does not require notifier and never sends the event.
- Actual `Staged.Publish` returns success only after tx.Commit and sets done=true.
  PublishThenNotify waits for that success, then uses a fresh bounded5s context
  and one redirect-rejecting fixed-body HTTP attempt, outside the transaction.
  Failure returns degraded/nil; deferred Staged.Close sees done=true and does not
  mark a committed snapshot failed. Summary-output failure is an independent exit
  error, not a notification-induced DB rollback. No transaction/network redesign.
- API-only Docker release does **not** by itself prove that an operator has built
  and configured cmd/ingest: the current Dockerfile produces cmd/api only.
  Revalidation credentials belong to the one-shot ingestion process, not API env.

### Fresh executed local checks

Node24.10.0 / pnpm10.32.1 / Next16.3.8, native WSL, frozen install PASS. Default
system Go is1.27.1; used the already cached official Go1.27.2 toolchain with
GOTOOLCHAIN=local. No system toolchain installation/replacement or downgrade.

| Check | Actual result |
| --- | --- |
| frontend typecheck, lint | PASS |
| full frontend mock unit suite, forks/1 worker/no-isolate | PASS37 files /202 tests |
| HTTP production next build, API confirmed unavailable at loopback65534 | PASS |
| Go formatting, mod verify | PASS |
| Go uncached full unit + race suites | PASS; opt-in live/DB tests not activated |
| Go vet; pinned staticcheck normal+integration | PASS |
| pinned govulncheck | PASS: No vulnerabilities found |
| Part15 verifier/tests | PASS31/31, static only |
| Part16 verifier/tests | PASS4/4, static only |
| real LOCAL Next production cache smoke | PASS, all six paths within193ms |
| tracked-source byte-match after checks | PASS548 files |

An initial frontend shell omitted RTK from its restricted PATH and stopped before
any frontend check. Fixed only the temporary operator PATH, not source/config or
timeouts; the full successful sequence above then ran. Unit output included the
known jsdom navigation-not-implemented messages, not assertion failures.

Fresh cache-smoke used a synthetic mutable loopback HTTP API, unique request keys
and product IDs, real Next production server and an explicitly synthetic key.
All six warm stale preconditions were proved; GET405/unauthenticated401/signed204
PASS. One shared5000ms budget, no unconditional wait/budget extension:

| Path | First cache header | First fresh | elapsed_ms | stale responses | Result |
| --- | --- | --- | ---: | ---: | --- |
| RU product | MISS | yes | 192 | 0 | PASS |
| KK product | MISS | yes | 193 | 0 | PASS |
| sitemap | absent | yes | 50 | 0 | PASS |
| catalog | absent | yes | 190 | 0 | PASS |
| dashboard | absent | yes | 184 | 0 | PASS |
| milk category | absent | yes | 191 | 0 | PASS |

Detail API fetch count8 at all warm checks;9 at sitemap convergence and16 at the
other convergence observations. First responses happened to be fresh **in this
run only**. Historical STALE remains valid; no strict first-response guarantee or
Vercel5s SLA inferred. Already-open browser React Query caches are not refreshed
by this server webhook, as accepted in FRONTEND_REVALIDATION.md.

### Exact remaining production/Vercel requirements

Before Part16 DONE, a separately authorized operator with Vercel/project access
must record outcomes without exporting secrets:

1. **Read-only effective Vercel settings/deployment proof:** correct project and
   aktau.market Production alias; Production Branch main; deployed main commit
   containing reviewed Part16; Root Directory frontend; Framework Next.js, not
   Vite; frozen pnpm install and pnpm build; default Next output, no Vite dist or
   static-export override; supported Node major aligned with the Node24 CI.
   There is no committed vercel.json proving dashboard overrides. Do not change
   settings in this preflight or substitute a Preview/HTTP status for this proof.
2. **Effective Production env, safely verified by names/outcomes:**
   NEXT_PUBLIC_API_MODE=http;
   NEXT_PUBLIC_API_BASE_URL=https://api.aktau.market;
   API_BASE_URL=https://api.aktau.market;
   NEXT_PUBLIC_SITE_URL=https://aktau.market;
   test mock opt-in absent/disabled. Privately provision/confirm a server-only
   REVALIDATE_HMAC_SECRET with at least32 random bytes of entropy. No NEXT_PUBLIC
   secret, PR/chat/report values or credential-file hashes. If env must change,
   deployment using those Production values is a **new authorization**, not an
   action allowed by this audit.
3. **One-shot ingestion readiness:** reviewed exact-source cmd/ingest binary and
   private matching shared key, FRONTEND_REVALIDATE_URL fixed HTTPS endpoint,
   APP_ENV production and existing restricted ingestion identity/safety guards.
   Do not add these to API env, create roles/credentials or run --apply here.
   No new API/VPS rollout is required solely to enable an operator notifier.
4. **Authorized bounded deployed endpoint smoke:** unauthenticated and incorrect
   signature rejected; GET405/no locale redirect; correctly signed fixed event204
   with no-store, no browser challenge/cookie requirement, no signature/body/key
   disclosure. Missing-secret503 is fail-closed evidence, **not activation PASS**.
   A valid POST invalidates production cache and needs separate permission despite
   making no PostgreSQL change. Do not publish a snapshot just for this smoke.
5. **Public read/SEO smoke after that accepted event:** catalog/dashboard/category,
   one product in RU and KK and sitemap still valid/current, public HTTP API used,
   canonical/hreflang/structured data preserved. Capture cache/first-response vs
   eventual observations truthfully. Without a data update, do not claim a measured
   old→new production snapshot convergence from unchanged page contents.
6. **External release acceptance / update same report:** only after deployment,
   private config and authorized production smoke PASS can Part16 be closed DONE.
   Main source merge/CI are already present; do not recreate a PR, enable automatic
   API deployment or rebuild runtime solely to advance documentation HEAD.

The next **legitimate** separately approved snapshot publication should record
COMMIT→notification outcome→new frontend/sitemap snapshot marker convergence,
bounded5s after accepted204 with healthy API. This is the original operational
follow-up, not a requirement to fabricate a publication for Part16 DONE. A failed
notification retains3600s TTL degradation and does not satisfy the accepted-event
5s gate; recover by a separately authorized signed resend, never blindly repeat
ingestion --apply or mutate already-published state.

### Final limits and safety

Local/source preflight PASS; real Vercel effective configuration/shared-secret/
signed production event/production cache-freshness gates remain **NOT VERIFIED**.
Existing historical local PG17/parity/HTTP E2E evidence and current exact-SHA hosted
PG17/Ephemeral Staging PASS are distinguished from today's non-DB local rerun.
No assertion that those hosted jobs prove Vercel behavior or physical clients.

No confirmed functional defect needing a Part16 patch or new scope. Only this
report updated; previous diagnostics and work preserved. DB/schema/migration/
snapshot change NONE; ingestion invocation NONE; VPS/Go API deployment NONE;
Vercel/Cloudflare/GitHub Environment/real secret change NONE; provider/Redis action
NONE. CI/CD Activation remains frozen; no commit/push/merge/deployment or Part17.
STOP for Code Review and separate authorization of access-dependent release gates.

## Production Verification — Stage A, 2026-10-13

### Source and access boundary

Fetched origin at entry and again before this report. Branch remains
`integrate/full-stack`; local HEAD `20a96120c165fd45ecfcf740c3ef66e2703a2bf7`;
`origin/main` remains `bbdd25aac35852b9a1f24a391dcdca2621fd5457`.
Existing tracked/untracked operational reports and documentation edits preserved.
No checkout, merge, reset, commit or push. Prior exact-main source/local and hosted
CI evidence above remains applicable; no runtime source changed in this stage.

No authorized Vercel Settings connection is available in this session; Vercel CLI
is absent. Project identity, actual production alias deployment SHA, Git production
branch, Root Directory/framework and environment names/scopes are **NOT VERIFIED**.
Previously observed GitHub Vercel successful deployment status is not proof of
these effective settings. Owner reports that the HMAC secret was already added;
its value was neither read nor requested, and it was not created/rotated.

Manual read-only check requested: Vercel Project → Settings → Git: Production
Branch `main`; Build & Deployment: Root Directory `frontend`, Framework `Next.js`;
Domains: `aktau.market` associated with Production; current Production Deployment:
Git commit SHA. Environment Variables: confirm names and **Production scope only**
for `REVALIDATE_HMAC_SECRET`, `NEXT_PUBLIC_API_MODE`,
`NEXT_PUBLIC_API_BASE_URL`, `API_BASE_URL`, `NEXT_PUBLIC_SITE_URL`.
Do not Reveal values, change settings or trigger deployment. Record project name
and these nonsecret settings/SHA. Owner replied “Да, там все это есть”: requested
branch/root/framework/domain/environment presence and Production scope are therefore
**OWNER-CONFIRMED**, not independently API-verified. The reply did not provide the
project name or actual Production Deployment commit SHA; those identifiers remain
pending. Public response headers/availability cannot establish the deployed SHA.

### Public webhook negative authentication checks

Bounded sequential HTTPS requests from WSL, descriptive verification User-Agent,
no credentials/cookies, redirects disabled, per-request timeout 15–20 seconds.
POST body was the fixed event, never accompanied by a computed valid HMAC.

| Probe | Status | Elapsed ms | Response bytes | Redirect |
| --- | --- | ---: | ---: | --- |
| GET `/internal/revalidate` | 405 | 2362 | 0 | none |
| POST without authentication | 401 | 343 | 0 | none |
| POST malformed signature | 401 | 221 | 0 | none |
| POST current timestamp, well-formed deliberately wrong digest | 401 | 411 | 0 | none |

All POST rejections returned `Cache-Control: no-store`. No authorization bypass
or dangerous redirect observed in these probes. Rejections establish the deployed
negative-auth path, not shared-secret equality, valid signature acceptance or
cache invalidation. No correctly signed production POST executed.

### Public pages and SEO

One sitemap GET; one GET per listed page, no load test or tile/image prefetch.
Product pair chosen from the public sitemap, identical product ID in RU and KK.

| Path | Status | Elapsed ms | Response bytes |
| --- | --- | ---: | ---: |
| `/sitemap.xml` | 200 | 3803 | 4378607 |
| `/ru/catalog` | 200 | 1155 | 181826 |
| `/ru/dashboard` | 200 | 491 | 271440 |
| `/ru/collections/milk` | 200 | 2503 | 196372 |
| RU product | 200 | 2104 | 101075 |
| KK same product | 200 | 1237 | 101206 |

All page responses were HTML without redirects; canonical URLs matched their
requested production paths. Each supplied RU/KK equivalents plus `x-default=ru`.
Catalog/category/product HTML contained JSON-LD; dashboard had no JSON-LD (not
required here). Sitemap returned XML `urlset` with `lastmod` and product URLs.
These are availability/SEO structural samples, not all-product semantic parity,
browser UI E2E or proof of post-publication freshness. Timings are single samples,
not performance medians or an SLA. No production data mutation performed.

### Backend2 PR #19 integration review

[PR #19](https://github.com/kiratonine/AdilBaga/pull/19) remained **OPEN / NOT MERGED**
at both checks. Reviewed head `2454e6d1c0983ddb51a997d09ead727e1c1816bc`;
reported base `45314932e1606911ac1f927d3a07b60ac084d3d4`. Read all 18 changed-file
patches and current-main `daily-sync.sh`/Go notifier wiring. PR tests/data outcomes
in its description remain author-reported, not rerun by this task.

PR introduces `ops/sync` oneshot service/timer at 01:00 and 13:00 UTC (06:00/18:00
Aktau), `Persistent=true`, separate writer environment, plus Dina city guard/scope
and RU/KK stale-price indication after 36 hours. It does **not** modify the Go
notifier or HMAC endpoint. Current `daily-sync.sh` runs scraper/sync, then ingest
dry-run, then `-apply`; that existing apply path initializes the notifier before
staging and calls `PublishThenNotify` only after successful `Staged.Publish()`.
Notification failure is `degraded` and cannot undo a committed snapshot.

The proposed sync environment includes `FRONTEND_REVALIDATE_URL` and the same
server-side `REVALIDATE_HMAC_SECRET` as Vercel. Missing/invalid configuration rejects
apply before staging; dry-run never notifies. API runtime credentials are not an
ingestion substitute. No shared-secret equality or operator environment verified
here. Timer installation/enablement and its possible immediate persistent catch-up
run require separate owner authorization; the PR README enable/start commands were
**not executed**. Scraping, ingestion, scheduling and writer provisioning remain
Backend2 scope, not Stage A activation.

The client-side stale indicator is not a replacement for signed revalidation: it
warns about the age of the rendered snapshot and does not fetch/publish a fresh one.
It computes after mount to avoid hydration mismatch. Part16's 3600s fallback TTL
and accepted bounded five-second convergence after successful signed204 remain
unchanged. No PR edit, merge or duplicate Backend2 implementation performed.

If PR19 later merges: refetch/record the new main SHA and its exact-SHA CI, review
the merged diff, reconfirm Vercel production deployment SHA, rerun the affected
frontend freshness tests and public SEO/negative-auth samples. Do not infer timer
activation from merge. Re-run the authorized cache-convergence gate against the
actual new deployment; ingestion/timer remain separately authorized operations.

### Remaining gates and current disposition

Stage A remains **BLOCKED** on the missing Vercel Production Deployment SHA;
settings are owner-confirmed as above, not independently inspected. Manual
instructions supplied. Source preflight and public negative-auth/
page samples PASS. No confirmed defect requires a code change.

Post-report local checks: Part15 documentation verifier tests **31/31 PASS**;
Part16 tests **4/4 PASS**; both static verifiers PASS; `git diff --check` PASS.
Bounded report scan for credential assignments, database DSNs, private-key material
and private configuration paths PASS. These static checks are not production
cache-invalidation evidence. Full runtime matrices were not repeated: source did
not change and their accepted exact-main evidence remains above.

After metadata confirmation, request separate authorization for a bounded correctly
signed production event and cache-convergence measurement, without publishing a
snapshot just for testing. Confirm existing shared-secret/operator provisioning
without disclosure; retain current cache TTL degradation behavior. A later genuine
authorized publish should record COMMIT → notifier outcome → frontend freshness.
Neither this stage nor local evidence establishes production Part16 DONE.

Automatic CI/CD Activation remains **FROZEN / WAITING_FOR_OWNER**. No VPS access,
Vercel/GitHub Environment/Cloudflare/credential changes, deployment, ingestion,
snapshot publication, timer enablement, database/provider action, commit, push,
merge or Part17. Historical diagnostics preserved; only this report changed by
Stage A. STOP before any production-changing action.

## Stage A continuation — owner-confirmed deployment identity, 2026-10-13

Owner supplied these nonsecret Vercel Production identifiers:

- Project: `adil-baga`.
- Production deployment Git SHA: `bbdd25aac35852b9a1f24a391dcdca2621fd5457`.
- Production domain: `https://aktau.market`.

Fresh `git fetch origin --prune` independently confirms `origin/main` equals that
exact SHA. Branch remains `integrate/full-stack`, local HEAD remains
`20a96120c165fd45ecfcf740c3ef66e2703a2bf7`; all pre-existing work preserved.
Part16 source commit `57f977cd011c611ec85de1435ec17fcfa0009d05` is an ancestor of
the deployment SHA (`merge-base --is-ancestor` exit0).

Read the committed deployment-SHA frontend endpoint/proxy and Go notifier, rather
than infer source identity from local HEAD. The SHA contains Node POST HMAC
authentication, fixed `catalog-data` expiration `{expire:0}`, fixed product ISR
path invalidation, internal-route proxy exclusion and post-publish notifier with
bounded detached context/degraded failure outcome. Tagged3600s fetch cache,
product ISR3600s and runtime sitemap are present at this SHA. This corresponds to
the accepted Part16 implementation; no missing-source defect found.

Vercel project/domain/deployed SHA and settings remain **OWNER-CONFIRMED** from
the owner's dashboard inspection, not independently queried through a Vercel API.
The Git SHA match/ancestry/source content are independently checked. Prior public
405/401 rejection and page/SEO samples support deployed behavior but are not a
cryptographic deployment attestation. No secret values accessed. No new public
probes necessary solely for this metadata confirmation: same main SHA and source,
prior Stage A samples retained without pretending they were rerun.

`VERCEL_PRODUCTION_DEPLOYMENT_SHA_NOT_CONFIRMED` is **RESOLVED**. Historical BLOCKED
sections above describe their then-current state and are preserved. Stage A is
**READY_FOR_EXTERNAL_REVIEW**, not Part16 production DONE.

Remaining separately authorized gates:

1. Confirm existing ingestion-side endpoint/shared-secret provisioning through a
   private, nondisclosing operator check; do not create/rotate the Vercel secret or
   use API runtime credentials for ingestion. No such check executed here.
2. With explicit permission, send a bounded correctly signed fixed production
   event; require204 and measure all six cache paths against the accepted≤5s
   convergence boundary. First-response STALE remains allowed within that window.
   An unchanged live dataset can prove acceptance/availability but cannot by itself
   prove transition from stale data to a newer snapshot. Do not publish test data
   or manufacture a production snapshot for this gate.
3. At the next genuine separately approved publish, record COMMIT→notification
   outcome→fresh catalog/dashboard/category/RU+KK product/sitemap evidence, using
   an actual changed snapshot marker. Timer/ingestion activation remains separate
   Backend2 scope; PR19 merge alone does not authorize activation.

Automatic CI/CD Activation stays **FROZEN / WAITING_FOR_OWNER**. No signed POST,
deployment, production config/secret/DB change, publish, ingestion, timer action,
VPS access, commit, push, merge or Part17. Only this existing report updated.
Continuation checks: Part15/Part16 verifier tests **35/35 PASS**, both static
verifiers PASS, `git diff --check` PASS, bounded report secret/private-path scan
PASS. No runtime test matrix repeated for this documentation-only continuation.
STOP for external review and explicit authorization before production changes.
