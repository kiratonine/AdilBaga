# PR72 CI audit and manual promotion readiness — 2026-10-25

## Status, authority and baselines

**CI_REPAIRED_PR72_READY_FOR_REVIEW / READY_FOR_INDEPENDENT_REVIEW**.
SOURCE REVIEW CANDIDATE; production promotion **BLOCKED pending independent review
and root producer-pin provisioning**. No merge of PR72, deployment, SSH connection,
production request, authority/credential/variable change or artificial publication.

Assigned scope: `ADILBAGA_PR72_REVIEW_BLOCKERS_AND_MANUAL_VPS_DEPLOY_READINESS_TASK_2026-10-25.md`.
Root rules, roadmap, READY diagnostic/fix reports and existing promotion protocol,
builder/client/workflows, runtime gate and handoff were inspected. Single agent;
dependency boundary investigation and candidate review performed as separate passes.
The `nestjs-best-practices` and `codex-security:fix-finding` workflows were applied.

Initial fresh main: `44bea0a3af6ccb18ce0ef7073bda80d4275cd3f9`.
Reviewed PR72 HEAD: `ced52ab05f09358f3d217f024c59e41b05c33b9f`.
Its review TAR SHA256 is `62d7d7aa7c9f1ec0ffe28cfb5a29d8742f7659e9e3f3bf9a5225b76a28a331bd`;
the earlier task verified all725 members against HEAD. This source TAR is not a
production install kit. READY candidate retains 5000ms admission ceiling and
unchanged post204 convergence SLA; historical production RCA remains unproven.

Separate native worktrees: `aktau-nest-audit-20261025` (branch
`fix/nest-dependency-audit-20261025`) and `aktau-manual-c2-promotion-20261025`
(branch `feat/manual-sync-c2-promotion`). Existing PR72 worktree/branch retained.
Original Windows checkout/untracked files and other branches preserved.

## A. Six-advisory matrix and dependency fix

Node24.18.0, pnpm10.32.1. Fresh `pnpm why` proves the paths below;
baseline `pnpm audit --prod` exit1: four high, two moderate. This is the fail-first
boundary: authenticated registry advisories with the actual frozen dependency graph.

| Package / parent | Before | Minimal strategy / after | Advisory | Candidate |
|---|---|---|---|---|
| direct zod |3.25.76|remove unused dependency|[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)|not installed|
|express5.2.1 > body-parser|2.3.0|parent-specific override2.4.0|[GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828)|audit clear|
|@nestjs/platform-express11.2.6 > multer|2.4.0|parent-specific override2.5.0|[GHSA-q7qp-rjg7-q26m](https://github.com/advisories/GHSA-q7qp-rjg7-q26m)|audit clear|
|cheerio1.2.0 > undici|7.30.0|parent-specific override7.30.1|[GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c)|audit clear|
|same undici|7.30.0|same7.30.1|[GHSA-4qv8-2p9j-2685](https://github.com/advisories/GHSA-4qv8-2p9j-2685)|audit clear|
|same undici|7.30.0|same7.30.1|[GHSA-f72v-6w45-q472](https://github.com/advisories/GHSA-f72v-6w45-q472)|audit clear|

Fresh source/tests/scripts search found no zod import/require/use; only package
and lock entries. Removed rather than making an unnecessary zod3→4 migration.
Published parent ranges: body-parser ^2.2.1, multer2.4.0 (exact pin deliberately
overridden to patched same-major2.5.0), undici ^7.19.0. Supported Node engines
remain compatible. No Nest/Prisma major update; parent versions unchanged.
Patched body-parser requires qs6.16.1, retained alongside existing qs6.16.0.
No broader dependency refresh, scripts change, ignored advisory or audit suppression.

Nest PR scope exactly `backend/package.json`, `backend/pnpm-lock.yaml`.
[PR73](https://github.com/kiratonine/AdilBaga/pull/73), candidate
`c53406f4c35b173b1d0eb8fded83bb4fd43df451`.
Local `node scripts/ci/run-checks.mjs nest` exit0: frozen install, db:generate,
build, 28/28 fixture tests (0skip), audit **No known vulnerabilities found**.
Legitimate HTTP DTO/Voice fixtures pass; no API/DTO/parser or Go runtime edits.
Candidate review checked parent ranges, lockfile snapshots, duplicate versions and
absence of remaining vulnerable versions. Full hosted gate remains independent.

## B. Manual promotion gap and minimal candidate

**MANUAL_PROMOTION_REQUIRES_SOURCE_CHANGE** on initial main.
`sync-publisher-build.yml` dispatch admits eligibility job, but client `gate()`
treats only `mode=build-only` as artifact-only. `mode=promote` requires
`SYNC_C2_PROMOTION_ENABLED=true` and calls SSH status using CI secrets. Separate
promote workflow is also guarded by that flag. Mere workflow_dispatch availability
does not provide a manual trusted promote artifact.

Read-only GitHub metadata: build workflow id394174815, correct path, active;
latest workflow_run39979133697 at44bea0a completed **SKIPPED**, not trusted build.
Repository variable-name inventory contains AUTO_DEPLOY_ENABLED only; no values
were printed or changed. No build, plan, promotion or other workflow dispatch run.

Minimal candidate introduces explicit `mode=manual-artifact` in the existing build
workflow/client. It validates exact main + completed successful push CI9 + local
HEAD, emits `kind=promote`, and does **zero SSH**. Normal CD gates remain intact.
The secret-free build job, artifact name/recipe, root executor/admission/schema and
transaction/rollback are unchanged. No new admin API/key/privilege, root approval,
generic TAR admission, sourceSha edit or repeated initial authorization.

Root independently re-fetches GitHub repository/run/workflow/CI9/source tree,
artifact digest/id/size/expiry and three producer pins. Source change to workflow
must cause `producer_source_changed` under the current pin. An independently
reviewed root-pin update is a future provisioning gate, not a self-upgrade from
the artifact. Executor/builder/wrapper hashes remain unchanged. Full admin personal
SSH is transport only, never provenance authority. Unknown state is fail-closed.

Exact future commands, existing wire frame and independent pin-update/rollback
packet are documented in [handoff section19](../BACKEND2_SYNC_C2_AUTOMATED_PROMOTION_HANDOFF.md#19-reviewed-manual-artifact-path-2026-10-25-source-candidate).
This is a source proposal awaiting separate review, **not an approved executable
production runbook**. Root policy and GitHub environment protection are not
assumed satisfied; no production installation/readback has been performed.

## C. Local qualification and preservation

| Check | Actual result |
|---|---|
|baseline manual gate CLI regression, synthetic GitHub API and no SSH env|exit1,4PASS/1FAIL; expected artifact eligibility rejected|
|same focused suite after fix|exit0,5/5PASS,0SKIP|
|negative manual mode/normal promote without flag/failed CI/main drift|rejected through actual CLI; existing CI validator negatives retained|
|`node scripts/ci/run-checks.mjs ops`|exit0; Python122/122 and Node185/185,0SKIP|
|unchanged root admission tests|independent digest/pins/kind/build/tree/CI and archive tampering negatives PASS in Python suite|
|`node scripts/ci/run-checks.mjs security`|exit0,source policy and synthetic backup guard PASS|
|JS syntax changed modules; `git diff --check`|exit0|
|existing local promotion PoC|exit0,actual Git/Go metadata,12-file coupled promotion/rollback PASS; reader inode/ledger preserved|

PoC command (only disposable filesystem, no DB/HTTP/publication):
`python3 -B scripts/ops/sync-promotion-local-poc.py OLD_LOCAL_TAR NEW_LOCAL_TAR`.
Inputs were pre-existing public local fixture TARs fd2b9a3-initial and main-local-poc;
this checks unchanged transaction/rollback, not a new authenticated GitHub build
or production root authority. Actual Go1.27.3; fixtureOnly=true,
productionAuthority=false; HTTPRequests=0,publications=0. The manual-artifact
gate was independently exercised by the new CLI test using synthetic GitHub API.

Manual PR scope: workflow, `scripts/ops/sync-promotion.mjs`, corresponding test,
handoff and this consolidated report. No root tool, READY code, Go, pipeline,
frontend, API/schema/migration or previous report modified by this PR.

## D. Dependency order and remaining gates

1. Complete exact-head PR73 CI9 and ordinary protected merge if allowed.
2. Merge new main into PR72 (no rebase/reset/force), preserve reviewed READY diff,
   run required focused/full Go, ops/security/PG integration and exact-head CI9.
3. Independently review manual-artifact PR; no merge/deployment by this TASK.
4. After later approved merges, exact-main CI9; independent producer workflow-pin
   provisioning with known old/new full policy hashes and backup, no other pins.
5. Explicit GitHub manual-artifact build on that exact source/CI, immutable original
   ZIP verification, existing root admission, idle locks, complete coupled rollback.
6. Separately authorized one manual SSH transaction and readback. Unknown result
   requires journal reconciliation, never blind retry or hand-edited JSON.
7. Next genuine sync only: safe READY reason/timing, READY/COMMIT/204/FIFO/AFTER,
   real verdict and series. No synthetic second apply, no local PASS as production.

Production READY timing remains a hypothesis; 5000ms is a ceiling, not a guarantee
under all load. Apt/unattended maintenance risk is separate. Three consecutive
qualified production C2 PASS remain unproven; INCONCLUSIVE adds nothing.
No claim of live publisher/API/VPS health or present authority alignment is made.

## E. Publication/CI follow-up

Exact PR/merge SHAs, completed hosted job outcomes, PR72 preservation and final
scope/privacy checks are appended below as actually obtained. No pending/skipped
check is counted as PASS. This report preserves earlier reports byte-for-byte.

### E1. Nest gate completed and ordinary merge

PR73 exact-head [CI40125440019](https://github.com/kiratonine/AdilBaga/actions/runs/40125440019):
Contracts, Go Quality, Nest Reference, Frontend, Pipeline Quality, Security,
PostgreSQL Integration, Ephemeral Staging and CI Gate **all SUCCESS (9/9)**.
TASK explicitly authorized ordinary merge of this separate dependency PR after
diff review/CI. Used squash with exact `--match-head-commit`, no admin/bypass;
merged main `47eda0b1ba7b008e7ea6543a5729fb42f7ca81ed`.

PR72 updated by normal merge of this main; no rebase/reset/force. All12 reviewed
READY files (including original fix report) remain byte-identical to ced52ab.
Neither README/Go diagnostics nor budget/trust predicates were rewritten.
Required post-update local/hosted checks are running; no success inferred yet.

Manual candidate additionally tests the actual unchanged root admission boundary:
changed workflow bytes reject under old root pin; explicit synthetic independently
updated pin allows authenticated fixture, but build-only still rejects.
Python suite rerun **123/123 PASS**,exit0; Node ops185/185 prior PASS; Part16 PASS.
Root executor, gate, entry wrapper, builder and activation workflow bytes match
main. Local Markdown links PASS. No existing report changed in this branch.

### E2. PR72 post-main local checks and source review pins

Updated PR72 head `752d759889edddc2e5dd4f189b8900530980d041`.
Focused Go unit/race/vet exit0. Full Go profile first invocation exited1 at the
existing FIFO test `pre-armed receiver learns actual Go snapshot`: INCONCLUSIVE
instead of PASS (356/357). Its code/runtime bytes are unchanged. Exact rejecting
reason was not logged by that assertion; contention/timing is a hypothesis, not
confirmed RCA. Isolated test rerun passed. Full Go profile rerun after concurrent
heavy work completed exited0: all unit/race/vet/staticcheck/govulncheck and
**357/357 Node,0SKIP**. No assertion, guard, timeout or test code was weakened.
Both observed outcomes are retained here; this is not a claim of eliminated flake.
Real2CPU qualification passed in both invocations (shared2579/2576ms;
core2460/2367ms;5000ms ceiling). PR72 ops122Python+184Node PASS; security PASS;
disposable PG17 runner exit0, restricted roles and actual local Go BEFORE/READY/
Stage/COMMIT/FIFO/AFTER scenarios pass, own containers cleaned. No production DB.

Manual source PR [#74](https://github.com/kiratonine/AdilBaga/pull/74) initial head
`f35f8bd8a7d72a5d5093ae1ef08ce7e14509cd8c`. Its root code is unchanged; only
client/workflow, regressions, handoff and this report differ from new main.
Git-source SHA256 values below are **not live VPS readback**:

| Pin | Main47eda0b / candidate |
|---|---|
|build workflow old|`2437a807970c17d865e164ba668d3c3e1c69ba51ec8b414a88e49d0b02dee9aa`|
|build workflow candidate|`1d7764798c1c78ac616e4615ef46ba7fd810b1f192692318cdf1a3aa66da6312`|
|builder unchanged|`308504c27ee7ceed871b1044d88a20a1f45a9525c9e4f3cca9d9b8382240b9b4`|
|root executor unchanged|`fca92db4cda0d94d25f6b7afbe314cb9bac94fff024f619eb94a24a365330670`|
|entry wrapper unchanged|`a44f926e8d2bf930f1015930421dd4e6751c7963aaf9caf1fc35a99f4ad21048`|
|runtime gate unchanged|`2feee48afb5bd8382c32c4e20a37296bf561e7e12b02fef267eb4ed74db71d88`|

Before future provisioning, independently obtain the actual old root-policy bytes,
metadata/inode and all pins; derive/approve full candidate policy hash with only
the workflow entry changed. Those live values are intentionally NOT_VERIFIED in
this offline task. Never overwrite a different installed executor/policy blindly.

### E3. Completed exact-head CI and final review handoff

| Job | Nest PR73 c53406f | main47eda0b | PR72 752d759 | Manual PR74 f35f8bd |
|---|---|---|---|---|
|Contracts|SUCCESS|SUCCESS|SUCCESS|SUCCESS|
|Go Quality|SUCCESS|SUCCESS|SUCCESS|SUCCESS|
|Nest Reference|SUCCESS|SUCCESS|SUCCESS|SUCCESS|
|Frontend|SUCCESS|SUCCESS|SUCCESS|SUCCESS|
|Pipeline Quality|SUCCESS|SUCCESS|SUCCESS|SUCCESS|
|Security|SUCCESS|SUCCESS|SUCCESS|SUCCESS|
|PostgreSQL Integration|SUCCESS|SUCCESS|SUCCESS|SUCCESS|
|Ephemeral Staging|SUCCESS|SUCCESS|SUCCESS|SUCCESS|
|CI Gate|SUCCESS|SUCCESS|SUCCESS|SUCCESS|

Runs: [Nest40125440019](https://github.com/kiratonine/AdilBaga/actions/runs/40125440019),
[main40125929434](https://github.com/kiratonine/AdilBaga/actions/runs/40125929434),
[PR72 40125961758](https://github.com/kiratonine/AdilBaga/actions/runs/40125961758),
[manual source40126012502](https://github.com/kiratonine/AdilBaga/actions/runs/40126012502).
All runs completed SUCCESS,9/9; no skipped/pending checks counted. PR72 remains
OPEN,MERGEABLE,CLEAN, **not merged**. PR73 alone was merged as expressly authorized.

The final follow-up commit changes only this report and handoff (bounded360s
local SSH timeout/connect cap added); manual source/runtime/tests remain identical
to the qualified source head above. Its separate final-head CI is available in
[PR74 checks](https://github.com/kiratonine/AdilBaga/pull/74/checks); the final external
handoff records its actual exact SHA/run, never infers success from the earlier run.

Manual path classification: **source candidate supports authenticated manual
artifact creation + existing fixed root wire transaction**, pending independent
review/merge and producer-pin provisioning. It is not yet an approved/installed
production path. No new root trust protocol is needed or weakened: changed producer
workflow bytes must still be independently approved. Actual installed policy/hash,
environment controls, current locks/publisher/rollback/reader/ledger and future
immutable artifact are NOT_VERIFIED here and must pass at the later authorized
window. Those are explicit deployment blockers, not CI blockers.

Final privacy/source checks: known fixed root executor/builder/wrappers and
activation workflow unchanged; only6 manual PR paths; reviewed12 PR72 paths
unchanged after main merge; old reports preserved; local Markdown links and
diff-check PASS. Clean source review archives are generated after report freeze,
safe members and full file byte-match verified, SHA256 delivered externally.
Archives remain review inputs only, never authenticated promotion install kits.

STOP before PR72/manual PR merge or any VPS action. No production READY/C2 PASS,
timer/API/data changes, flags, secrets, root policy changes or reused approval.
