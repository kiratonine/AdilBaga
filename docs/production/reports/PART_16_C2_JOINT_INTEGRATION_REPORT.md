# Part16 C2 joint Go/Node integration — local attempt

Status: **BLOCKED**. No joint flow PASS, commit, push or PR claimed.
Production C2 remains OPEN. This is a failed local integration candidate,
preserved for review under the TODO's stop-on-any-FAIL rule.

## Approved inputs and worktree

Owner task document was found as
`TODO/ADILBAGA_PART16_C2_JOINT_INTEGRATION_TASK.md` (the shorter filename in the
request is absent). Read completely, along with root instructions and final
projection v2 contract. No nested instructions loaded.

Fetch exit0. All planning refs match exactly; all three PRs are OPEN:

| Input | Verified SHA / base |
| --- | --- |
| main | 61eccfb957237781a8b5c14110f4a73de4952e83 |
| PR35 | b934cfb62e3d89a64c967f45b367f81ea9f251b1 / main |
| PR38 | c2a28a5116a3cfb4678c8f48e3d7ddc0e03b3b95 / PR35 branch |
| PR39 | 4ba5b5276c0f2148b22fb31473f1f6816ef09d3f / main |

Created separate native-WSL branch **feat/part16-c2-joint-integration** from PR38.
`git merge --no-ff --no-commit` PR39 completed without conflicts. The merge is
intentionally **uncommitted**: HEAD remains PR38 and MERGE_HEAD is PR39. No merge
to main, no cherry-picking files, no changes in existing worktrees/branches.

## Attempted implementation (NOT accepted or fully verified)

- Existing private provider registry extended to provider-neutral ownership;
  observer/FIFO use those checks, with compatibility aliases for old names.
  No JSON/file/flag or public callback registration replaces custody.
- Added production-disabled local Go factory in projection-provider.mjs:
  owned private temporary directory, fixed c2projection ELF basename/hash,
  local disposable part16_c2 reader credentials only, exact argv, clean child
  environment,10s timeout,64KiB process output bound and strict JSON+LF<16KiB.
  Existing schema/body digest/source/frontend checks and fixtureOnly remain.
- Added joint-poc.mjs, using the unchanged CI postgres harness to create its
  own loopback PG17, apply real Prisma migrations and provision fixture roles.
  The provider is the real compiled CLI, not a synthetic replacement.
- Added testdata/c2fixture helper: actual read-only Go C2Project is used solely
  to render fixture markers from the real current database. It does not register
  trusted AFTER or send HTTP. Trusted CLI AFTER belongs to the adapter after
  capture. This separate fixture reference read is not a production workflow.
- Publication uses an explicitly local SQL transaction, **not Stage/Publish**.
  The existing unchanged relayprobe performs the one signed loopback notification
  and FIFO relay. No full Stage→Publish E2E is claimed.

CLI compiled with sourceSHA=PR39 above; its provider/SQL paths were checked
byte-identical to that ref before build. frontendSha=the planning main SHA
identifies the local representation source only, NOT a verified Vercel release.
Go1.27.2 and Node24.10.0 used; no production environment loaded.

## Actual failure and STOP

Command: `node scripts/revalidation/joint-poc.mjs` in a clean process environment.
**exit1;15 tests,6 PASS,9 FAIL,0 SKIP;8.012s test duration.**

The running Node test process completed its already-defined cases before
cleanup; after seeing failure no new corrective/test iteration was started.

Confirmed integration-fixture defect:

- joint-poc.mjs renderTargets reads `state.Body.Candidates[0]`.
- The Go helper encodes C2State with root `Body`, but C2Body fields have JSON
  tags: the candidate array is `body.candidates` inside that root Body, not
  `Body.Candidates`. The nested dashboard field is likewise `dashboardAt`, not
  `DashboardAt`.
- Seven cases failed directly with TypeError at that access. Both required
  positive cases returned INCONCLUSIVE instead of PASS; their getter invokes
  the same renderer, and the observer fails closed on the thrown error.
- The failed positive result does NOT establish a defect in the Go provider,
  HMAC, FIFO clock, ISR or production. Complete causal acceptance is unproven.

Failed cases: complete real FIFO six-path flow; stale→fresh within5s;
late discovery; proven late stale; after_late; intervening publication;
moved witness; missing witness; wrong event. No negative outcome is promoted
to qualified coverage when its setup failed.

Passed local cases: unrelated changed-body INCONCLUSIVE,200 rejection/zero GET,
unchanged-marker INCONCLUSIVE, source identity mismatch, unsafe local profile/
symlink rejection, read-only ACL failure. These6 results do not compensate for
the9 failures and do not prove the complete integration chain. In particular,
the unrelated-body case can be inconclusive for the renderer error; it is NOT
claimed validated AFTER comparison coverage.

Existing Node/Go regression files were retained unchanged. They have NOT been
rerun on this failed integration tree; historical passes are not substituted.

## Resource safety and unexecuted gates

The harness created its own new postgres:17-alpine with127.0.0.1/random-port
binding, and successfully ran Prisma migrations/chain checks for six disposable
databases. All fixture SQL, canonical mutations and ACL denial probes were
limited to that owned local instance. The existing finally reported **PG cleanup
PASS**; its container/anonymous volumes were removed. The owned temporary Go
binary/FIFO directory was also removed in finally. Other containers untouched.

Go fixture helper gofmt and local build succeeded. No production HTTP of any
method, PostgreSQL, SSH, sync, scheduler, deployment, credentials or settings
were accessed/changed. Original SQL/provider runtime, notifier/HMAC, frontend,
schema/migrations and public API files were not modified by this integration.

Per the mandatory STOP rule, these post-integration gates were **NOT RUN**:

```sh
node --test scripts/revalidation/*.test.mjs scripts/ci/guard.test.mjs
node scripts/revalidation/verify-part16.mjs
node scripts/ci/run-db-integration.mjs
node scripts/ci/run-checks.mjs security
go test -count=1 ./...
go test -race -count=1 ./...
go vet ./...
```

Required5s/20s,21 GET/2 sitemap and original FIFO calibration policy are retained
in source, but no successful combined measured path/timing/budget is claimed.

## Review handoff

New/modified integration-only paths:

- scripts/revalidation/projection-provider.mjs
- scripts/revalidation/production-observer.mjs
- scripts/revalidation/fifo-adapter.mjs
- scripts/revalidation/joint-poc.mjs (new)
- backend-go/internal/revalidation/testdata/c2fixture/main.go (new)
- this new integration report

Other staged paths are the exact incoming PR39 merge, not new integration edits.
Historical C2 and provider reports are preserved byte-identical to their respective
reviewed parent refs. No commit/push/PR permitted after this FAIL.

Next safe step: Owner review/authorization to resume the same branch, correct
only fixture field decoding first, then rerun the real joint PoC and every
mandatory gate. No evidence justifies changing SQL/provider contracts or security
checks. A new attempt must keep this failed evidence and must not claim PASS
unless all positive and negative setup paths actually execute.

Review archive: **adilbaga-part16-c2-joint-poc-20261017.tar.gz**, failed local
candidate only. STOP — **BLOCKED** for independent review, not merge-ready.

## 2026-10-17 — Owner-approved P1 resume and completed local gates

**Current local status: READY_FOR_EXTERNAL_REVIEW.** The initial BLOCKED heading,
6 PASS /9 FAIL run and STOP above are historical and preserved verbatim. This
new section records the separately authorized correction/resume, not a rewrite
of that failed run. Production C2 remains OPEN; no production acceptance or
full Stage→Publish E2E is claimed.

### Precheck and narrow correction

Same worktree and branch feat/part16-c2-joint-integration. Fetch exit0. HEAD and
PR38 ref remain c2a28a5116a3cfb4678c8f48e3d7ddc0e03b3b95; MERGE_HEAD and PR39
ref remain4ba5b5276c0f2148b22fb31473f1f6816ef09d3f. The pending no-ff/no-commit
merge was preserved; no abort/reset/new worktree. All earlier integration code,
parent reports and source regressions retained.

Only joint-poc.mjs changed in this correction before testing: renderTargets now
reads root Body with nested candidates/dashboardAt, matching the real Go JSON
tags. It asserts an array with exactly one candidate, the pinned witness ID and
slug, expected snapshot and exact canonical millisecond ISO timestamps. No Go
DTO/tag, CLI, SQL, custody, FIFO, verdict, HTTP limit or notification change.

Negative assertions now also require the intended reason, successful capture
and nonempty HTTP200/error-free evidence. Thus a fixture TypeError, lost body or
capture failure cannot masquerade as the expected INCONCLUSIVE.

### Separate real joint PoC — actual result

`node scripts/revalidation/joint-poc.mjs`: **exit0;15/15 PASS,0 FAIL,0 SKIP**,
test duration12.219s. All required first-run failures now execute through their
actual setup and pass. Both owned PG17 and temporary binary/FIFO directories
were cleaned by the original finally blocks.

| Scenario | Verified result |
| --- | --- |
| Real Go CLI BEFORE S0 → SQL fixture COMMIT S1 → original signed loopback204/FIFO → six HTTP fixture bodies → real CLI AFTER | PASS; all6 targets qualified within original5s |
| Selected product first STALE, then FRESH | PASS;7 GET, exactly1 product stale response, original shared5s acceptance |
| Changed body differs from trusted AFTER | INCONCLUSIVE;6 changed/error-free HTTP200 samples and6 classified target results, not an exception |
| Actual notifier200 | INCONCLUSIVE/not_accepted204;0 GET; notifier still reports success per unchanged2xx contract |
| Unchanged product/dashboard marker | INCONCLUSIVE/unchanged_marker; capture_complete and nonempty valid samples |
| Fresh first observed7500ms, no proven late stale | INCONCLUSIVE; product first_fresh_ms7500, no false FAIL |
| Proven stale request started after5000ms | Expected FAIL; trusted qualified AFTER,21 GET, no measurement error |
| AFTER age>60s | INCONCLUSIVE/after_late with successful prior capture |
| Intervening snapshot | INCONCLUSIVE/after_unavailable from real CLI chain refusal |
| Witness moved category | INCONCLUSIVE/unqualified_after from real AFTER |
| Witness no longer usable | INCONCLUSIVE/unqualified_after from real AFTER |
| Wrong event snapshot | INCONCLUSIVE/after_unavailable from real CLI chain refusal |
| Wrong expected source SHA | No trusted BEFORE minted |
| Remote/production profile or symlink binary | Constructor rejects |
| Write ACL on local reader | Real provider refuses BEFORE; local grant revoked in finally |

First complete real-clock/FIFO run: target order product_ru, product_kk, sitemap,
catalog, dashboard, category. Fresh response elapsed values after latest event
bound:124.064/124.442/125.296/125.626/125.864/126.105ms (rounded for report).
Measured clock uncertainty6.281ms is included conservatively in PASS; zero clock
error was not assumed.6 fixture GET only; one actual signed loopback notification;
fixtureOnly=true. Product/dashboard timestamps were independently different.
The second real-clock/FIFO positive case asserts PASS and one stale sample; no
unlogged exact convergence time is invented. Virtual time is used only by the
explicit long-boundary negative cases, not either FIFO positive scenario.

The fixture renderer obtains current values from the real Go C2Project against
the local DB. That reference is never registered as trusted AFTER. The actual
provider adapter invokes the separately built real CLI AFTER only after capture,
once; all repeated AFTER attempts are rejected. No retrospective GET/restarted
window exists. Frozen nested evidence mutation and serialized evidence rejection
remain covered. This is SQL-publication fixture integration, not production sync
or an integration of the actual Stage/Publish ingestion API.

### Mandatory regression/CI gates — actual commands

Clean process environment, Node24.10.0 / Go1.27.2 / pnpm10.32.1 / Docker PG17.
Built the unchanged relayprobe using Go1.27.2 in a new owned temporary directory;
passed it only through C2_LOCAL_PROBE for the Node tests. No production env read.

| Command | Actual result |
| --- | --- |
| node --test scripts/revalidation/*.test.mjs scripts/ci/guard.test.mjs | exit0;228/228 PASS,0 FAIL,0 SKIP;22.516s |
| node scripts/revalidation/verify-part16.mjs | exit0; static boundaries PASS |
| node scripts/ci/run-db-integration.mjs | exit0; complete disposable PG17 profile PASS, including cleanup |
| node scripts/ci/run-checks.mjs security | exit0; source/workflow policy and synthetic backup guard PASS |
| go test -count=1 ./... | exit0 PASS |
| go test -race -count=1 ./... | exit0 PASS |
| go vet ./... | exit0 PASS |

The complete DB runner independently created another fresh loopback PG17,
performed real Prisma migrate deploy plus chain checks in all six disposable
databases, and passed all seven existing race-enabled integration invocations:
catalog/bootstrap guards, production identity, real C2 projection/ACL/sitemap5000,
transaction atomicity, snapshot security, pool/plans/observability selection and
restricted security. No existing container or external DB was reused. Previous
partial/malformed/timeout/oversized/body-digest, clock/FIFO/ownership, schema v1/v2,
request-cap and synthetic negative regressions remained unmodified and passed;
they are not misrepresented as additional real-CLI malformed-output cases.

### Integration/release boundaries

Integration-only scope remains the three Node adapter/observer files, joint-poc.mjs,
testdata/c2fixture/main.go and this report. Compared with the prior failed archive,
this correction changes only joint-poc.mjs and appends this section. Incoming
main/frontend files in the pending merge are already-reviewed PR39 ancestry,
not new frontend work; frontend must remain byte-identical to planning main.
Provider CLI/SQL and its tests remain byte-identical to approved PR39. Historical
C2 and Backend2 provider reports remain byte-identical to their parent refs.

Owner authorizes completion of the existing merge/commit, push and integration
PR base=main after final scope/privacy/diff checks. Exact resulting SHA and PR
URL belong to the final handoff; future hosted CI is not inferred from local
PASS. No merge into main/deployment/auto-deploy activation is authorized here.

New review archive: **adilbaga-part16-c2-joint-poc-p1-fix-20261017.tar.gz** via
unchanged full-stack archiver, not reuse of the failed archive. Production remains
disabled: no public GET/POST/HEAD, SSH, SQL, sync, HMAC event or settings changes.
Production C2 needs separate authorization and the agreed production SLA evidence.
**STOP for independent Code Review — READY_FOR_EXTERNAL_REVIEW (local only).**
