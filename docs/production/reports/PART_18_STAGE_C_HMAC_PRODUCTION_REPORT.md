# Aktau Market — Part18 Stage C1: Production HMAC Acceptance

Status: **BLOCKED**.

**PRODUCTION_POST_NOT_RUN**. Mandatory preflight lacks current deployment/env,
coordination and trusted signing-context confirmation. This is missing evidence,
not an observed webhook failure. No production cache invalidation occurred.

## Source and deployment provenance

Audit date: 2026-10-14. Worktree branch: `feat/part-18-hmac-acceptance`.
Fresh `git fetch origin --prune` exited 0. Exact HEAD and origin/main:
`c8e7bb74e2e5cb31d1d1e460ed57c6456d0d8f5f`.
Initial tracked tree clean; only the existing untracked
[HMAC preparation report](PART_18_STAGE_C_HMAC_PREP_REPORT.md) was present.
No branch reset, rebase or other-worktree modification.

Fresh public GitHub deployment metadata read exited 0: Production deployment
**7066363941**, exact SHA above, latest status **success**. This supports a
successful deployment of current source but does not independently establish
the current aktau.market alias, Vercel Ready state or applied secret scope.
No authorized Vercel Settings proof was obtained in this run.

Reviewed the [revalidation contract](../FRONTEND_REVALIDATION.md), existing
Go signer/notifier and Next POST handler and prior preparation evidence.
The fixed event, timestamp-dot-body HMAC-SHA256, strict signature shape,
constant-time comparison and fixed invalidation targets remain unchanged.

## Mandatory preflight disposition

| Prerequisite | Result | Missing evidence / next action |
| --- | --- | --- |
| Source branch and fresh main | PASS | Exact SHA above |
| Approved webhook in current source | PASS | Existing POST handler; no runtime edits |
| GitHub Production deployment status | PASS, metadata only | Deployment success does not prove domain alias |
| Current Vercel domain deployment Ready and exact SHA | PENDING | Owner read-only Project adil-baga → Domains → aktau.market → Production deployment: confirm Ready and Git SHA |
| REVALIDATE_HMAC_SECRET applied to that deployment | PENDING | Owner read-only Environment Variables: confirm name, Production scope and deployment after provisioning; do not Reveal/Copy value |
| No concurrent Backend2 snapshot publication | PENDING | Fresh Owner/Backend2 coordination confirmation for this test window; earlier Voice-test confirmation is not reused |
| Existing protected VPS signing context | PENDING | Owner identifies existing private config path and variable name only; then execute signing in that trusted context without local secret copy |

No filesystem secret search, SSH configuration read or credentials acquisition
was attempted. The API runtime environment is not used as an ingestion-secret
fallback. Existing HMAC provisioning is neither assumed absent nor rotated.
Requests for metadata/coordination/config location were issued without asking
for any secret value. Until these facts are supplied and checked, STOP precedes
even the unauthenticated production POST.

## Owner-approved GET405 clarification

The previous preparation blocker `PUBLIC_GET405_NO_STORE_MISMATCH` is resolved
by the explicit Owner contract decision, not a code or deployment change.
All POST outcomes require no-store; automatically generated Next.js GET405 is
the allowed exception and does not invalidate cache. Only the corresponding
sentence in FRONTEND_REVALIDATION.md was corrected. The old report, observed
headers and historical diagnosis remain byte-identical.

## Actual local checks

| Command / check | Exit / result |
| --- | --- |
| Fresh fetch, branch/status/HEAD/main | 0; expected branch and SHA |
| `go test -count=1 ./internal/revalidation` with clean env, Go1.27.2 | 0; existing signer/config/notification/timeout/publication tests PASS |
| `node --test scripts/revalidation/verify-part16.test.mjs` | 0; 4/4 PASS |
| `node scripts/revalidation/verify-part16.mjs` | 0; static boundaries PASS, not production evidence |
| Bounded public GitHub deployment metadata fetch | 0; deployment success as recorded above |
| New operator invocation / invocation mock suite | NOT RUN; mandatory Stage1 prerequisites unresolved |
| Final scope, Markdown links, diff-check, bounded report scan, prior report byte-match | PASS; checked after documentation edits |

Existing signer tests demonstrate protocol and redirect/timeout behavior,
but are **not** claimed as validation of a new strict401/204 operator invocation.
In particular notifier acceptance of other2xx is not the C1 acceptance gate.

## Production request ledger

| Step | HTTP status | duration_ms | Empty body | Cache-Control | Result |
| --- | --- | --- | --- | --- | --- |
| POST1 unauthenticated | NOT RUN | N/A | NOT CHECKED | NOT CHECKED | BLOCKED before request |
| POST2 signed | NOT RUN | N/A | NOT CHECKED | NOT CHECKED | BLOCKED before request |

Request budget used: **0/2 production POST**. No retries or parallel requests.
No production response data, signing timestamps, signatures or secrets captured.

## Remaining acceptance sequence

After prerequisite proof, validate an outside-Git invocation against loopback
mocks before any public POST: existing Body/Signature, strict401 then204,
empty responses/no-store, maximum2 sequential requests, per-operation wall-clock
≤5s, shared deadline≤15s, redirect rejection, no retries, sanitized failure output.
Unexpected status/body/header, timeout or challenge stops before another request.
Signing stays inside the existing trusted VPS context; no secret copied locally.

C1 signed204 alone would prove authentication and cache-event acceptance, not
fresh data convergence. Part16 C2 still requires separately authorized observation
after a legitimate snapshot publish: post-COMMIT notification and required new
server responses converging within5s. No publish is authorized by this task.

## Safety and scope

Only this new report and the approved POST/no-store wording are changed.
The existing preparation report and all five earlier Part18 reports are preserved
byte-identical. No runtime/source/test/API/DB/dependency change. No production
POST, HMAC event, Voice, Redis, SQL, ingestion, snapshot publication, deployment,
systemd action or Backend2 operation. Automatic Go CI/CD remains FROZEN.
No commit/push/PR/merge. STOP pending prerequisite evidence and external review.

## Read-only C1 follow-up — 2026-10-14

Status remains **BLOCKED**. The initial ledger above is preserved:
**0/2 production POST by this agent**. This follow-up also issued zero POST.
No production auth flow, token acquisition or cache invalidation was attempted.

### Fresh provenance and metadata

`git fetch origin --prune`, branch/status/HEAD/main checks exited0.
Branch remains feat/part-18-hmac-acceptance; HEAD=origin/main=
**c8e7bb74e2e5cb31d1d1e460ed57c6456d0d8f5f**. Existing documentation changes and
three untracked reports were preserved; no drift/reset/rebase/merge.
Reviewed roadmap Part18 and existing frontend webhook/Go notifier source.
No runtime change: fixed event/signature/POST no-store behavior remains intact;
the approved automatic GET405 exception requires no source fix.

Bounded public GitHub metadata GETs (manual redirect rejection,10s per request,
no retries, no credentials) exited0: deployment **7066363941**, Production,
exact SHA above, latest status **success**; exact-SHA **Vercel** commit context
also **success**. This is fresh deployed-source evidence, not direct proof of
the current domain alias or Vercel environment settings.

Available tool metadata was checked: no authorized Vercel administrative
metadata connector was exposed. Local executable presence check exited0 and
reported **vercel_cli_not_present**. No CLI installed, credentials searched,
Dashboard restriction bypassed or browser authorization initiated.

| Required production evidence | Current disposition |
| --- | --- |
| Fresh main / approved webhook source | PASS, source evidence |
| GitHub Production deployment and Vercel status | PASS, metadata evidence only |
| Vercel Production deployment Ready, alias aktau.market, exact SHA | **PENDING OWNER** |
| REVALIDATE_HMAC_SECRET Production scope applied to that deployment | **PENDING OWNER**, no secret value needed |
| Shared trusted signing context and fresh no-publish window | Confirmation needed before any future acceptance invocation |
| Backend2 signed204 | External reported evidence; not independently observed |
| Backend2 response empty body / no-store | **NOT CONFIRMED**, explicitly not retained |

### Backend2 evidence reconciliation

Owner relayed one signed request from the Backend2 VPS sync identity at
**2026-10-14 13:48:04UTC**, returning204. This is a separate external event and
does not change this agent's0/2 ledger. Backend2 did not preserve response body
or Cache-Control and will not retry without permission. No assertion of
empty/no-store, current alias or deployment correlation is inferred from204.
Backend2 also reports sync/timers disabled; this task did not inspect or change
them. A new coordination window must be confirmed before any future test.

[Owner restore drill](PART_18_OWNER_BACKUP_RESTORE_REPORT.md) is independently
completed and Owner reports external Code Review PASS. Restore is not repeated.
Its successful checksum/restore does not close the unrelated HMAC C1 gaps.
Only historical/superseded labels in that report were clarified this follow-up;
counts, checksums and successful restore results are unchanged.

### OWNER ACTION — read-only Vercel checklist

1. Open the existing **adil-baga** project → Deployments → current Production
   deployment. Record **Ready**, full Git commit SHA and deployment identifier.
   Expected source SHA currently is c8e7bb74e2e5cb31d1d1e460ed57c6456d0d8f5f;
   if different, report the drift rather than redeploying.
2. Open Project → Domains → **aktau.market**; confirm it points to that same
   Production deployment. Confirm Production branch **main** in project Git
   settings. Report metadata only; do not change alias or branch.
3. Open Project → Settings → Environment Variables. Confirm the name
   **REVALIDATE_HMAC_SECRET** exists with **Production** scope, is server-only,
   and was provisioned before the current deployment was built. Confirm this
   deployment actually includes that setting using available deployment metadata
   or the Owner's provisioning/deployment record. Name/scope alone is insufficient
   if the setting was added afterward. Do not Reveal/Copy value, rotate or deploy.
4. Return those nonsensitive confirmations. If application to the current
   deployment cannot be established, leave it PENDING; no speculative PASS.

### Minimal remaining bounded C1 plan — NOT AUTHORIZED / NOT RUN

After metadata and signing-context proof, obtain **new explicit Owner
authorization** for at most2 sequential POST and a coordinated no-publish window.
Use an outside-Git invocation reusing the existing fixed Body/Signature protocol,
first tested on loopback mocks for status/header/body failures, redirect rejection,
timeouts and request cap. Existing notifier accepts general2xx; the operator
acceptance check must specifically require204 and must not rely on Notify alone.

One unauthenticated fixed-event POST must return401, empty body, no-store.
Only after that PASS, one correctly signed fixed-event POST must return204,
empty body, no-store. Each operation wall-clock≤5s, shared deadline≤15s;
no retries, parallelism, third probe or automatic repair. Signing stays in the
existing trusted context, without copying the secret locally. Any unexpected
status/header/body, redirect, challenge or timeout STOPs. Log only safe outcome,
status/duration and empty-body/no-store booleans, never signature/timestamp/body.

No extra production request is needed to re-check the already approved GET405
exception. C1 event acceptance is not C2 publish-to-cache freshness evidence;
C2 remains a separately authorized legitimate-publication observation.

### Follow-up verification and safety

Git/source/read-only public metadata/tool-presence checks above executed;
Markdown links, scope, git diff --check and bounded report scan PASS.
Earlier HMAC preparation and Stage A/B1/B2/Voice reports plus the existing
FRONTEND_REVALIDATION.md clarification remain byte-identical. This task modifies
only the two existing HMAC/restore reports. No new source/test/runtime/file,
restore, SSH action, production POST, DB write, sync/apply/systemd/deploy,
Backend2 operation or Git commit/push/PR/merge. Automatic CI/CD stays FROZEN.
STOP for Owner evidence and external review.

## Operator preparation and Owner Vercel evidence — 2026-10-14

**Local preparation: READY_FOR_EXTERNAL_REVIEW. Production C1 remains BLOCKED /
NOT RUN**, pending fresh explicit execution authorization, Backend2 coordination
and identification/verification of the existing trusted signing context.
The historical ledger remains **0/2 production POST**. No SSH connection or
production HTTP request was made in this preparation.

### Owner-reported deployment evidence

Owner reports frontend/Vercel owner **Евнер** confirmed Production Ready,
alias **aktau.market**, correct current deployment and applied
**REVALIDATE_HMAC_SECRET**. This closes the earlier Vercel metadata questions
as **Owner-reported evidence**, not independent UI/API observation by this agent.
No new deployment identifier or full SHA was supplied in that message; it is
recorded as confirmation of the correct deployment in the current C1 context,
without inventing additional metadata. Existing independent GitHub deployment
evidence remains the separate success record documented above.

Fresh fetch/status/branch/main checks exited0: branch feat/part-18-hmac-acceptance,
HEAD=origin/main=c8e7bb74e2e5cb31d1d1e460ed57c6456d0d8f5f. No source drift.
Earlier statements of PENDING OWNER in this report are historical and are
superseded by this Owner confirmation only; no claim of independent access.
Backend2-reported signed204 remains external evidence with empty-body/no-store
not retained. Its historical request is not counted as an agent request.

### Outside-Git invocation

Temporary operator directory: `aktau-c1-operator.kRKIQjjU` in local OS temporary
storage, not the repository. It contains a minimal Go module, cmd/c1 invocation,
mock tests and a **byte-identical copy** of the existing internal/revalidation
client.go. `cmp` exited0. No signer reimplementation in the invocation, dependency
installation, runtime edit, secret file or SSH action.

Invocation source SHA256:
`7fe05bbf4474b0b6d934c8458056e798fc7639baee2d5833ed722ef1abd8940c`.
Mock test source SHA256:
`0a3f3d53727aca3c9ceeb29c90c4addd672342315437f8dc93ce76517c71a97e`.

The invocation reuses revalidation.Body and revalidation.Signature. Its default
mode allows only literal loopback HTTP; production needs an explicit opt-in flag
and the exact fixed HTTPS endpoint. The flag is a technical guard, **not Owner
authorization**. REVALIDATE_HMAC_SECRET is read only from process environment;
no file search, secret argument, stdin dump or local secret copy. Only synthetic
test secret was used locally. Real signing is reserved for the existing protected
VPS context, after that context and permission are confirmed.

One process performs exactly one bounded sequence: unauthenticated401 first;
signed204 only after first-response PASS. Before the first request it rejects
missing/short secret or invalid endpoint/budgets. There is a single shared15s
context, fresh operation contexts≤5s, client/connection/TLS/header bounds,
no redirects, retries, cookies or environment-proxy use. No public mode was run.

Both responses must be empty, exact expected status, unambiguous no-store and
no redirect Location/HTML content type. Only one response byte is read to detect
unexpected body without unbounded buffering. Failure STOPs immediately; no
third request, retry or automatic remediation. Safe output is JSON containing
only step, status, duration_ms, empty_body, no_store, outcome_class. Transport
errors are fixed classes, not raw exception/URL/provider/header output.

### Actual mock verification

Clean environment, Go1.27.2, synthetic secret and local httptest only.
Final suite: **18 scenarios PASS**, three top-level test groups:

- 13 response scenarios:401→204 success; unexpected first/second status;
 503 first/second; nonempty response; absent/incorrect no-store; absent second
 no-store; HTML challenge;302/307 redirect rejection; operation timeout.
- 4 zero-request guards: missing secret, operation budget>5s, total budget>15s,
 already canceled context.
- 1 shared-deadline case: first request consumes budget, second times out at
 the overall deadline rather than receiving a new independent total budget.

Mock server independently checks exact fixed bytes and HMAC protocol, no auth
headers on request1 and current Unix stamp/signature on request2. Request counts
assert1 on first failure,2 at most and no redirect destination request. Output
checks reject secret/body/auth-header/signature/URL disclosure. No retries.

| Command / check | Final exit / result |
| --- | --- |
| `go test -timeout=15s -count=1 ./...` in temporary operator module | 0; 18 scenarios PASS |
| `go test -race -timeout=20s -count=1 ./...` in temporary module | 0; PASS |
| `go vet ./...` in temporary module | 0; PASS |
| gofmt temporary invocation/tests | 0; formatted |
| `cmp` copied signer against repository source | 0; byte-identical |
| `node --test scripts/revalidation/verify-part16.test.mjs` | 0; 4/4 PASS |
| `node scripts/revalidation/verify-part16.mjs` | 0; static boundaries PASS |
| Final report links/scope/diff-check/bounded scan and preserved file checks | PASS |

During helper development, initial timeout mock handler cleanup waited indefinitely
and the owned test process was stopped. Mock cleanup was bounded. The first race
run then found unsynchronized mock request counters, not an application/signing
defect; counters were made atomic, final normal/race/vet reruns PASS. No production
request, repository runtime fix or relaxed acceptance assertion was involved.

### Remaining bounded production plan — awaits explicit permission

1. External review of this invocation/report, then Owner explicitly authorizes
   the controlled SSH/operator execution and **at most2 sequential POST**.
   Confirm a fresh no-publish/no-ingestion window with Backend2. Earlier disabled
   timer handoff is not a fresh coordinated execution window.
2. Owner identifies the existing protected signing config path/variable name
   only. Do not request the value. In the trusted VPS context, verify safe loading
   and inject only the existing secret into the invocation process, tracing OFF;
   never copy it locally or use API/DB/provider credentials as fallback. STOP
   before request1 if this cannot be done safely. Do not modify Backend2 config.
3. Recheck source/deployment evidence for drift before execution. Execute one
   process once against the fixed production endpoint, budgets5s/15s. Capture
   only the safe outcome fields. Request1 must be401 empty/no-store; only then
   request2 signed204 empty/no-store. On timeout, unexpected status/body/header,
   redirect/challenge or exhausted budget STOP with no retry.
4. Record the actual two outcomes and budget in a new report addition. Preserve
   historical0/2 ledger rather than rewriting it. Do not publish a snapshot,
   trigger ingestion, change timers or infer C2 freshness from204.

Pending: **Backend2 fresh coordination**, **protected signing-context identity**,
**new explicit execution authorization**, then actual401/204 body/header evidence.
No production POST is authorized or executed by this preparation. Restore PASS
and other completed stages were not repeated. Only this HMAC production report
is edited in Git scope; previous reports/docs/source are preserved. Automatic
CI/CD remains FROZEN. No commit/push/PR/merge. STOP for Code Review and permission.

## Backend2 post-publish handoff — recorded 2026-10-15, REPORTED only

Two distinct external events must not be conflated:

- Backend2 reports a standalone signed POST at2026-10-14 **13:48:04UTC**,
  response204; empty response body and no-store were not retained.
- Backend2 now reports its first production sync: snapshot
  **1bbda89e-165d-4518-86a9-14af53a89c4a**, publishedAt2026-10-14
  **15:47:52UTC**, offers+3312 and **post-COMMIT frontend_revalidation success**.
  No independently captured response/header or deployment-level freshness evidence
  was supplied for this second event.

These are Backend2-reported evidence, not agent-observed POST or independent
C1/C2 PASS. Historical agent ledger remains **0/2 production POST**; no new POST,
SSH or production access occurred. The new encrypted recovery-point verification
is recorded separately in
[post-publish Owner restore report](PART_18_POST_PUBLISH_OWNER_RESTORE_REPORT.md);
its current decrypt blocker does not prove notification failure. Existing C1
body/no-store acceptance and C2 bounded freshness evidence remain open.

## C1 HTTP reconciliation and C2 observation preparation — 2026-10-15

**C1 HTTP acceptance: PASS — Backend2-reported production execution.**
Overall report remains **BLOCKED** for unresolved procedural provenance and
unobserved C2. Historical agent ledger remains **0/2 production POST**; the
following two POST belong to Backend2, not this agent. This task performed
zero production GET/POST, SSH or SQL.

### New externally supplied C1 evidence

Owner relays execution2026-10-15 **14:30:57–14:31:00UTC**, exit0:

| Backend2 step | HTTP | Cache-Control | Empty body | HTTP acceptance |
| --- | ---: | --- | --- | --- |
| POST1 unauthenticated | 401 | ['no-store'] | true | PASS, reported |
| POST2 correctly signed | 204 | ['no-store'] | true | PASS, reported |

Exactly2 sequential POST, no retries, as reported. Individual operation durations
were not supplied; no invented duration_ms or independent observation is claimed.
This new HTTP evidence supersedes earlier missing body/no-store evidence **for
this execution**, not for the separate2026-10-14 standalone204 or publication
notification. Those earlier events and historical agent0/2 results stay unchanged.

**Procedural gap:** supplied preflight timestamp14:22:39UTC precedes execution
start14:30:57UTC by **8m18s**. No intervening refresh/release/env/coordination check
was supplied. Request Backend2's factual clarification of what remained stable
and whether any immediate recheck was actually performed; do not invent one.
This gap does not negate the reported response statuses, but prevents a claim
that the full preflight-to-execution procedure is independently established.

**Artifact provenance gap:** Owner supplied the script digest as
`51bc61b24a9b0e9e6a3f56e0d99e3539076a836590a04a4f9859`.
A bounded local format check finds **52 hex characters, not64**. It is retained
exactly as reported, not accepted as a verified SHA256 or silently completed.
Request the full64-character SHA256 and its reviewed artifact correspondence;
do not repeat production POST to fix documentation. No script was fetched via SSH.

### Current approved C2 contract

Reviewed [FRONTEND_REVALIDATION.md](../FRONTEND_REVALIDATION.md) and existing
cache-smoke/sitemap/SSR hydration code. Reuse catalog-data expiry, fixed product
ISR invalidation and unchanged3600s fallback. Accepted C2 is bounded eventual
consistency **within one shared5000ms after accepted signed204**, not guaranteed
first-response freshness. A first STALE inside the window is allowed and must be
recorded. Targets: RU product, KK product, sitemap, catalog, dashboard, category.
New server responses are the boundary; already-open client React Query caches
are not pushed by this webhook. Failed/degraded notification with TTL fallback
cannot be relabeled as accepted-event5s PASS.

The2026-10-14 publication cannot be retrospectively tested within its elapsed
5s window. Observe the **first next legitimate publication after arming**; do
not create a publication, replay HMAC or rerun apply just for observation.

### Existing LOCAL synthetic smoke — actual execution, not production proof

No new observer/business validator was added. Reused unchanged
scripts/revalidation/cache-smoke.mjs and existing frontend mock fixtures: unique
API namespace/product IDs, mutable synthetic revision, real loopback Next
production server, warm old-data preconditions, local auth401/signed204 and
shared5000ms convergence checks. Clean env; metadata guard confirmed no real
frontend dotenv files, existing production build available. No production API,
real HMAC secret, provider or DB context was used.

| LOCAL target | First cache status | First fresh | Convergence | elapsed_ms | Stale responses |
| --- | --- | --- | --- | ---: | ---: |
| product_ru | MISS | true | PASS | 161 | 0 |
| product_kk | MISS | true | PASS | 162 | 0 |
| sitemap | absent | true | PASS | 40 | 0 |
| catalog | absent | true | PASS | 158 | 0 |
| dashboard | absent | true | PASS | 154 | 0 |
| category | absent | true | PASS | 160 | 0 |

All warm preconditions lacked the revised marker; product warm cache HIT.
Shared detail API fetch count was8 at warm stage,9 at sitemap observation and16
at other fresh observations; these are shared counters, not per-path cost.
This run's first responses fresh do not erase historical STALE observations or
establish a Vercel SLA. Synthetic markers are local-only; no production marker
or price was invented. Existing harness finally closed its owned local servers.

Actual commands/results:

- `node --test scripts/revalidation/verify-part16.test.mjs`: exit0, **4/4 PASS**;
  static boundary tests, not production observer fault-injection evidence.
- `node scripts/revalidation/cache-smoke.mjs` in clean Node24 env: exit0,
  all6 LOCAL paths fresh within40–162ms; synthetic API + local Next only.
- Bounded digest-format check: exit0, correctly reports52 characters/invalid
  SHA256 representation; not a successful artifact-identity verification.
- One optional source lookup of a nonexistent lib/api/server.ts path returned
  exit2; actual route hydration and sitemap source were read. No source fix.
- Final diff-check, links, scope, bounded scan and prior-report preservation PASS.

### Minimal bounded READ-ONLY production observation plan — NOT EXECUTED

The following is a review proposal requiring separate Owner approval for GET
budget and coordination, not authorization to run the publisher or a new POST.

1. **Pin event and distinguishable markers before arming.** Owner/Backend2 selects
   the next independently legitimate publication window, identifies current and
   intended next revision and freezes deployment/other-publish drift during
   observation. From its already prepared bundle/approved metadata, supply a
   minimal expected-value manifest for the six fixed public URLs. No runtime,
   DTO, header or API revision field is added. Use existing actual observable
   fields, not synthetic text or fabricated prices. Stable product IDs retained.
2. **Prove warm stale baseline.** At most1 frontend GET per target (6 total),
   same fixed URL/header/client profile as after publication; no query cache
   buster, browser-cache reload override or alternate route. Retain only safe
   old/new marker booleans/cache status, not full HTML. At least one relevant
   expected new marker must differ from baseline for **each** target. If a target
   is observationally indistinguishable, STOP/PENDING_EVIDENCE rather than call
   an unchanged page fresh. Do not manufacture a data change for the test.
3. **Arm timing before publication.** Observer must already be ready and receive
   the actual accepted signed204 event from the legitimate existing notification
   path, with trustworthy timing correlation. Set one monotonic deadline t0+5s;
   cross-process handoff/startup delay counts, never restart the window on chat
   confirmation or first GET. Same-coordinator monotonic timing is preferred.
   If accepted204 timing cannot be established without a new unapproved hook,
   leave this prerequisite pending for a separately reviewed operator design;
   do not modify runtime/pipeline or issue another POST as a shortcut.
4. **Bound observation.** Proposal: at most3 conditional GET per target
   (18 post-event GET; **24 total frontend GET including6 baseline**). One active
   request per target, at most6 across targets, as in the existing local harness.
   Every fetch and full-body read uses only the remaining shared deadline, TLS
   verification and no redirect following. Capture the first response before
   any poll. Poll only after a verified stale response, bounded pause≤100ms and
   only while time/request budget remains; no unconditional wait or error retry.
   This explicit request cap is a **production-plan requirement**, not a claim
   that the existing local harness already implements a3-attempt cap.
5. **Record outcome and STOP.** For each target record first cache status/fresh
   boolean, first-response completion elapsed_ms, stale count, eventual freshness
   and time until first full response matching expected revision, plus request
   count. Accept only all6 within shared5000ms. Non200, redirect/challenge,
   timeout, failed marker check at deadline, drift or request-cap exhaustion
   STOPs observation; no cache purge/redeploy/publish retry or repair. Unknown
   x-nextjs-cache status is recorded as absent, not inferred HIT/STALE.

#### Existing-field revision-marker mapping

| Target | Proposed existing observable proof |
| --- | --- |
| RU/KK product | Same stable product ID; expected new product snapshotAt/offer/price projection in server-rendered hydration or visible/JSON-LD fields, verified for each language; never match only a stable name |
| sitemap | Exact expected loc→lastmod projections for selected product URLs and catalog/dashboard/category URLs; product snapshotAt and dashboard snapshotAt may differ, do not require all lastmod equal one publication timestamp |
| catalog | Expected revised top-deal/product hydration or dashboard snapshotAt projection actually present in SSR; require distinct baseline/new marker |
| dashboard | Existing summary.snapshotAt plus selected expected aggregate/price projection from the next revision |
| category | Same category/filters/first-page parameters; expected changed product-set or product snapshotAt/offer projection from the real revision |

Sitemap currently pages products in batches100, up to50 pages. A single frontend
GET can fan out to multiple backend reads; this is not load testing and the
proposed observer must not enumerate thousands of product-detail URLs. Six fixed
pages and bounded probes only; Owner approves the budget before execution.

Real publication may leave some values unchanged or reuse old source capture
times. Do not equate publishedAt with every product snapshotAt; inadequate
markers block evidence collection, not automatically prove stale runtime.
Production product-detail API fetch count is not independently observable through
this read-only page plan; record NOT OBSERVED unless an already approved safe
counter exists. Do not substitute the local shared count as production evidence.

### Current disposition and safety

C1 **HTTP PASS, Backend2-reported**; procedural gap and malformed digest need
clarification, no repeat C1 POST requested. C2 **PENDING / NOT OBSERVED**.
Recovery Integrity PASS with limitations remains as the existing recovery report;
that report and all other prior reports remain byte-identical. Only this report
receives this append-only reconciliation/plan. No runtime/schema/tooling change,
production GET/POST/SQL, SSH, ingest/apply/systemd/timer/deploy/rollback or Git
commit/push/PR/merge. Auto-deploy FROZEN. STOP for Code Review and Owner evidence.

## Backend1 documentation PR finalization — 2026-10-15

**Documentation candidate: PASS / ready for independent PR review.** This is
not Part18 launch acceptance. Overall HMAC report status stays BLOCKED because
C2 production convergence is NOT PROVEN and procedural provenance remains open.
C1 HTTP PASS is Backend2-reported, not independently executed by this agent.
Recovery Integrity PASS uses independently executed local restore/audits plus
the explicitly Backend2-reported production binary-safe reference; historical
legacy FAIL/BLOCKED and separate-capture limitations are retained.

Fresh fetch origin --prune exit0: branch feat/part-18-hmac-acceptance,
HEAD=origin/main=c8e7bb74e2e5cb31d1d1e460ed57c6456d0d8f5f. No staged files.
Full tracked diff is only the POST/no-store versus automatic GET405 documentation
clarification. Four new untracked reports were read as complete proposed files;
ordinary git diff alone does not include them. No Backend2/frontend/runtime change.

### Digest provenance recheck — no invented correction

The52-character string in the prior reconciliation exactly reproduces the
Owner-supplied message. Local length/hex validation confirms52, not64. A targeted
exact-string search of repository docs/scripts/ops/workflow material found it
only in this untracked report. No complete verified replacement was supplied.
Therefore there is **no proven agent transcription or digit-count typo to fix**;
the source handoff is incomplete as a SHA256 representation. Existing text and
digest remain unchanged. Request Backend2's full digest and reviewed-script
correspondence as metadata only, without SSH or another HTTP acceptance run.
This does not revoke the reported401/204 HTTP results or fabricate a script match.

### Exact proposed documentation-only PR scope

1. docs/production/FRONTEND_REVALIDATION.md — modified; no-store all POST
   outcomes, approved automatic Next GET405 exception, no runtime change.
2. docs/production/reports/PART_18_STAGE_C_HMAC_PREP_REPORT.md — new; historical
   preparation/GET405 blocker and local evidence, retained without rewriting.
3. docs/production/reports/PART_18_STAGE_C_HMAC_PRODUCTION_REPORT.md — new;
   append-only evidence progression, C1 reported HTTP PASS, procedural gaps,
   historical agent0/2 ledger and pending C2 observation plan.
4. docs/production/reports/PART_18_OWNER_BACKUP_RESTORE_REPORT.md — new;
   initial Owner archive recovery, historical decrypt failure/resumption and
   explicitly limited successful local restore.
5. docs/production/reports/PART_18_POST_PUBLISH_OWNER_RESTORE_REPORT.md — new;
   post-publish recovery, preserved legacy FAIL, local integrity/security gates,
   equivalent binary-safe Recovery Integrity PASS and evidence attribution.

No artifacts, helper binaries/source, backups, keys, private env or additional
reports belong in the commit. Other tracked reports/source remain identical to
HEAD. Do not stage ignored files or use git add -A/commit -a.

### Open next-stage gates and actual final checks

Remaining C1 procedural evidence:8m18s preflight→execution clarification and
full64-character script SHA256. No fabricated intervening preflight or need to
repeat the two HTTP calls is asserted. C2 requires a separately approved
read-only bounded observation of the next legitimate publication, distinguishable
revision markers, accepted204 timing and all6 paths within one shared5s budget.
Sync/timer work stays Backend2-owned; auto-deploy remains FROZEN.

This finalization runs Git/scope/staged/untracked inventory, full changed-document
content/Markdown-link checks, git diff --check, bounded secret/privacy patterns
and historical-report preservation; PASS. It does not rerun local recovery,
Voice/provider benchmarks, runtime test matrices or production checks: no code
changed. Prior local cache-smoke/verifier results remain historical evidence,
not new CI/production PASS. Only this report was appended during finalization;
no new report or implementation file. No production access, commit/push/PR/merge.
Owner Git commands are provided in the handoff response, not executed. STOP for
independent Code Review.
