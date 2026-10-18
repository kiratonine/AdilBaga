# Adil Bağa — automatic Go API deployment source review

Status: **READY_FOR_EXTERNAL_REVIEW**.

**Source-only candidate, not production acceptance or activation.**
Automatic deployment is disabled unless the owner separately configures literal
repository variable `AUTO_DEPLOY_ENABLED=true`. No production SSH, DB, provider,
Docker build/load, deployment or environment setup occurred in this task.

## 1. Goal and actual production context

Implement controlled immutable Go releases after full main CI, with executable
compensation instead of a textual rollback promise. This is a real production
project, not an MVP/demo; the old template's hackathon labels do not authorize
shortcuts. Existing Gemini degradation and DB/Voice/public contracts are unchanged.

## 2. Repository and preserved work

Fresh fetch/prune: origin is `kiratonine/AdilBaga`.
origin/main/base=`438ecdfa3d386a186dcd8b73c3c10aef5e79dc82`;
origin/integrate/full-stack=`20a96120c165fd45ecfcf740c3ef66e2703a2bf7`.
Separate worktree, branch `feat/production-auto-deploy`, created from origin/main.
Original integration worktree was not reset/stashed/cleaned/switched or edited.
Its four modified Part15 operational/report files and untracked
PART_15_PRODUCTION_GO_API_DEPLOYMENT.md remain outside this patch.

Owner/previous-task handoff reports release438ecdf... deployed and manual Siri
passed. **Actual current VPS state was NOT independently rechecked here**, because
this specification explicitly forbids production SSH. Committed main still has
historical Part15 BLOCKED/e6ef854 checkpoint wording; uncommitted closure evidence
was read but is not silently imported into this separate source branch. The broker
discovers the actual current SHA and readiness before each future authorized run;
no historical release is hardcoded as current or rollback target.

Read existing Part15/runbooks/compose/Dockerfile/CI guards. Nine existing CI jobs
and business source remain byte-identical to the base. Deploy directory still
contains exactly README.md and compose.production.yml, as Part15 verifier requires.

## 3. Files

- `.github/workflows/deploy-production.yml`;
- `scripts/deploy/auto-gate.mjs`, `auto-gate.test.mjs`;
- `auto-build.mjs`, `auto-transport.mjs`, `auto-entrypoint.sh`;
- `auto_broker.py`, `auto_smoke.py`, their two test modules;
- `verify-auto-deploy.mjs`, `auto-review-artifacts.mjs`;
- `scripts/create-clean-archive.mjs`: permanent production-auto-deploy target and
  exclusion of generated Python cache directories and worktree `.git` pointer;
- `docs/production/AUTO_DEPLOY_SETUP.md` and this report.

## 4. Workflow trust boundaries

Main push CI workflow_run and explicit manual dispatch only; no PR/fork artifact
execution or pull_request_target. Guards require original repository, push-main,
exact SHA, completed/success CI path/ID/name, current attempt and exactly nine
distinct mandatory successful jobs. Unknown/missing/cancelled/skipped CI fails
closed. Job outputs carry validated SHA/run; event values never become shell code.
Read-only contents/actions token permissions, pinned immutable action references,
job timeouts, fixed concurrency/cancel-in-progress=false. Full existing CI remains
untouched; new offline checks are in the separate deployment workflow.

Absent/false/malformed activation variable and manual dry-run never reach the
production Environment/secrets or SSH. Fresh main checks before transport and
remote cutover reject stale SHA. Hosted workflow has NOT RUN for this uncommitted
candidate; local actionlint/static tests are not a hosted CI claim.

## 5. Environment / SSH setup

See AUTO_DEPLOY_SETUP.md for owner-only steps and plan/visibility limitations.
New dedicated key, confirmed known_hosts, restricted account, root-owned fixed
broker and narrowly scoped zero-argument sudo require separate approval. None was
created or installed. Existing broad personal/operator sudo is not reused by CI.
No application credentials are requested or sent to GitHub. SSH strict checking,
BatchMode, IdentitiesOnly, no forwarding, bounded keepalive and fixed command only.

## 6. Rollout / compensation

After gates/Environment approval, read-only release planning resolves the actual
current image first. Documentation/test/frontend-only changes return
NO_RUNTIME_CHANGE without rebuild/cutover, preserving the Part15 closure rule.
Clean exact checkout→Git export→existing Dockerfile outside VPS→one save archive.
Checksum verified before load, metadata/RootFS/API binary identities matched; no
cross-store .Id equality. Save inventory rejects unsafe/duplicate paths and any
extra image/tag before load, protecting the retained rollback reference.
No registry, prune or latest. Runtime secrets stay on VPS.
DB/Prisma/frozen-contract/compose changes relative to active SHA block transport.

Root-owned installed broker accepts only status/result/submit, bounded manifest
and archive. Never executes uploaded Python, commands or caller paths. Isolated
Python, private root state, exact reviewed compose hash, immutable API env/compose,
atomic release reference and durable private previous reference. Remote flock
holds through detached worker, 600-second observation and compensation. Shared
lock participation is an explicit prerequisite for future manual operators.

After closed cutover:30-second cold readiness, non-root/read-only/cap-drop/security
checks, actual immediate peer observation against existing exact CIDR, catalog/
filters/detail/dashboard/CORS, Voice TOP1/TOP3/clarification and owned Redis TTL/
deletion. Prices/images/stores/nearest/speech checked against current GET data.
Only then Tunnel opens for public edge/application checks. Observation rejects
health/restart/Tunnel/config/ERROR/any HTTP5xx failures. No provider-perfect launch gate.

Unexpected exceptions/interruptions after cutover run one compensation: stop
Tunnel, restore exact previous image reference, recreate, readiness and local
application before reopening, then public verification. Failure closes Tunnel and
returns BLOCKED_ROLLBACK_FAILED. Images retained, no DB rollback.

**Limits:** detached worker survives SSH loss; hard SIGKILL/host power loss cannot
execute finally. Durable RUNNING journal blocks subsequent submission and needs
manual review; no silent boot recovery/scheduler was added. Root filesystem or
systemctl failure can prevent compensation; operator must verify Tunnel remains
closed. Offline mocks do not prove actual SSH/sudo/systemd/Docker/Cloudflare/DB/
Gemini/Redis compatibility. A separate controlled activation and recovery test is
mandatory; do not enable unattended operation from this report alone.

## 7. Frontend / Backend2 impact

NONE: no API/DTO, frontend, pipeline/dictionary/matching, ingestion, Prisma/schema/
migration, Redis/Voice/Gemini business semantics or runtime dependency changes.
No VPS/Cloudflare/firewall/secret/credential change, physical Siri retest or Part17.

## 8. Actual local verification

Node24.10.0 and Python3.12.3, native Linux worktree. Executed:

| Command / check | Result |
| --- | --- |
| node --test scripts/deploy/auto-gate.test.mjs | PASS21/21 |
| node --test scripts/deploy/verify-part15.test.mjs | PASS31/31 |
| python3 -B -m unittest discover -s scripts/deploy -p 'auto_*_test.py' | PASS28/28, original23 plus5 review regressions |
| node scripts/deploy/verify-auto-deploy.mjs | PASS |
| node scripts/deploy/verify-part15.mjs | PASS, unchanged Part15 guards |
| pinned actionlint v1.7.7, new workflow | PASS, exit0 |
| Node syntax / Python AST / sh -n | PASS |
| node scripts/ci/check-source.mjs | PASS, bounded patterns; existing CI policy unchanged |
| git diff --check | PASS |

Tests cover disabled/manual dry-run and untrusted event/CI rejection, exact
attempt/jobs/path, stale SHA, strict SSH arguments, cross-store identity and
metadata/binary/layer mismatches, transfer checksum/truncation/trailing bytes,
atomic reference permissions, real local flock exclusion, cold ready→success,
persistent readiness, failure-stage compensation, rollback failure/closed Tunnel,
unexpected exception/interrupt, catalog-grounded Voice truth and owned-session
cleanup. Docker/HTTP are mocked; only temporary test filesystem resources used.
No application matrix rerun required: Go/Nest/frontend/CI business sources unchanged.
Build/SSH production profiles deliberately NOT RUN, per task prohibition.

## 9. Review artifacts

`artifacts/production-auto-deploy-source.patch` includes every tracked delta and
untracked new file. It is applied to a clean base export and byte-compared with
the current worktree. `artifacts/production-auto-deploy-review.tar.gz` uses the
permanent clean target, includes exact current source/report and excludes TODO,
Git/artifacts/build outputs, env/secrets/keys/DB backups and Python caches.
Safe regular unique-member, source/report byte-match and bounded secret scans
are mandatory final artifact checks, not proof of live production deployment.
First archive verification correctly rejected the worktree `.git` pointer: the
existing archive generator excluded `.git` directories but not worktree pointer
files. Added an exact `.git` filename exclusion, not a relaxed verifier. The failed
archive is replaced by a rebuilt verified artifact; no pointer/private path may
remain in the final review archive.

## 10. Now / subsequent owner scope

Now: reviewed source candidate, disabled automation, no commit/push/merge.
After independent Code Review: owner-controlled merge, hosted offline run,
Environment/SSH/broker authority review and separate installation approval,
dry-run then controlled manual deployment/rollback proof and Siri E2E before
enabling automatic main releases. No hackathon-era relaxation or new infrastructure
is authorized by this report. STOP for Code Review.

## 11. Independent Code Review fixes — application5xx and journal durability

The initial candidate passed21 Node,23 Python and31 Part15 tests. Independent
review found that observation only rejected HTTP500, not other HTTP5xx, and that
journal replace lacked durability barriers. That initial evidence is preserved;
it did not cover these gaps.

Incremental fix scope: `auto_broker.py`, `auto_broker_test.py`, this report only.
No architecture, CI trust/permissions, deployment contract, business source,
credential, database or production change.

- Observation now rejects the entire numeric500–599 range, through the existing
  single-compensation rollout path. INFO502/503/504 therefore cannot pass. Numeric
  2xx/4xx and metadata without HTTP status retain their previous behavior; existing
  ERROR-level rejection is unchanged. No response bodies or private inputs logged.
- Both RUNNING and final journal writes create a no-follow0600 temporary file,
  flush Python buffers, fsync file contents/permissions, atomically replace the
  status file, then fsync the parent directory before successful return. Failed
  sync is propagated, not acknowledged as a successfully persisted write; temporary
  files are cleaned. A pre-rename file-fsync failure preserves the old journal.
- Directory-sync failure after rename has uncertain crash persistence; the call
  raises, rather than pretending the rename is durable. This is not a new claim
  of recovery from power loss/SIGKILL. Existing manual recovery limitations remain.

New regressions: observed500/502/503/504 (also501/599) each cause exactly one
rollback;200/201/204/400/403/404/429/499 and non-HTTP INFO events still pass;
RUNNING/DEPLOYED/rollback final status persistence order, complete flushed bytes,
0600 mode and temporary cleanup; file-fsync failure preserves RUNNING; directory
fsync failure propagates without acknowledgement. All tests use local temporary
files or mocks, with no real SSH/Docker/HTTP/provider/DB action.

Re-run results: Node21/21, Python28/28 including all original23, Part15 31/31;
static auto-deploy/Part15 guards, pinned actionlint1.7.7, syntax/source-security
checks and git diff --check PASS. Hosted Actions and live rollout still NOT RUN.
Source patch and clean review archive rebuilt for this corrected candidate;
exact-base apply/source-byte proof, safe members, report/source byte-match and
bounded secret scan are required again. Automation remains disabled by default;
no commit/push/merge/SSH setup/deployment. STOP for repeat independent Code Review.

## 12. 2026-10-18 — Security Finding01 / CWE-345, Owner-approved Variant A

**Current source candidate: READY_FOR_EXTERNAL_REVIEW.** Earlier source/verification
history above is preserved byte-for-byte. This is not broker installation,
production authorization, hosted artifact acceptance or closure of the security
finding. Auto-deploy remains DISABLED; no actual approval record was issued.

### Baseline, isolation and exact scope

Fresh fetch/prune exit0. HEAD/origin/main matched the approved immutable baseline
**e5486c3cfb3de37e8aab33fda27529b4af972399**. Main working tree was clean; open
GitHub PR inventory returned0. Created a separate native-WSL worktree
`/home/denis/tmp/aktau-security01-deploy-artifact-provenance`, branch
`fix/security01-deploy-artifact-provenance`, at that exact SHA. Other worktrees
were not changed, repaired, reset, pruned or rebased. Root project rules, complete
Owner Variant A task, Codex Security finding/report and existing deployment
sources/tests/setup were read before implementation. No nested AGENTS was used.

Exactly seven tracked paths comprise this candidate:

1. scripts/deploy/auto_broker.py
2. scripts/deploy/auto_broker_test.py
3. scripts/deploy/auto-build.mjs
4. scripts/deploy/auto-transport.mjs
5. .github/workflows/deploy-production.yml
6. docs/production/AUTO_DEPLOY_SETUP.md
7. docs/production/reports/AUTO_DEPLOY_CI_CD_REPORT.md

No application source, Go dependencies/tool configuration, frontend, Backend2,
C2/HMAC/Voice, API, schema/migrations, compose, entrypoint privileges or original
CI workflow/gate was modified. Local test installs/build outputs are ignored and
excluded from the review artifact. No new source/test/support file was needed.

### Reproduction first, then the enforcement boundary

Before changing broker implementation, added
`test_unapproved_self_consistent_archive_never_reaches_docker` using an actual
local synthetic docker-save inventory and matching uploader-controlled hash/size.
The dedicated command
`python3 -B -m unittest discover -s scripts/deploy -p auto_broker_test.py -k unapproved_self_consistent`
returned **exit1 /1 FAIL**: old Host.identity reached the mocked docker load and
raised `AssertionError: unapproved Docker access`. No Docker execution occurred.
This was a concrete source-boundary regression, not merely a missing-symbol test.

Original ordering: receive/check uploader manifest → preflight → image identity
(including docker load/create/cp) → fresh main SHA → closed cutover. Hash, labels,
RootFS and API binary checks authenticated only self-consistency.

New ordering: existing preflight/NO_OP → fresh main → independent fixed-path
root-owned authorization + actual stored-byte hash/size → sealed archive fd →
original archive/tag inventory → approval/file-identity/bytes recheck → durable
single-use approval consumption → docker load from sealed fd → original portable
image/API-binary checks → same authorization/expiry + fresh main recheck → original
stop/activate/local/open/public/observation/one-compensation flow.

Rejected approval/artifact cannot reach load/create/cp, tunnel stop, release-ref
change, activation or runtime environment exposure. These pre-cutover failures do
not invoke rollback or close the healthy old tunnel. NO_OP and pre-load stale skip
do not load/consume authorization. A post-load stale decision does not activate.

### Independent authorization and viable two-phase artifact handoff

The full strict schema/procedure is in
[AUTO_DEPLOY_SETUP.md](../AUTO_DEPLOY_SETUP.md), Variant A section.
Broker accepts no approval-write operation or caller-selected authorization path.
Only trusted Owner/operator administrative authority can atomically provision the
fixed `STATE/authorizations/<releaseSha>.json` outside restricted SSH authority.
The root filesystem custody is authentication; `approved=true` and the owner audit
handle alone confer no trust. Deploy principal cannot create/replace/write the
root0700 directory/root0600 records or change a root-owned ancestor. No new SSH/
sudo rights, signing key, runtime HMAC or broad GitHub credential is introduced.

Schema v1 has exact keys/strict types: repository/environment/releaseSha,
ciWorkflow/ciRunId/ciAttempt, distinct buildWorkflow/buildRunId/buildAttempt,
immutable artifactIdentity{id,name}, archiveSha256/archiveSize, approved/approvedBy,
approvedAt/expiresAt and authorizationId. Positive run/id integers are safe JS
integers; SHA is40hex, digest64hex; raw archive1..256MiB. Approval validity is at
most86400seconds and is checked before load and immediately before cutover.
Missing/corrupt/duplicate/unknown/unreadable/unapproved/expired records fail closed.

Workflow dispatch now has dry-run/build/deploy. Explicit build-only on main is
possible while the deployment flag is false; it verifies exact original main CI,
builds a clean Git export and saves ONE archive, then uses the SHA-pinned GitHub
upload-artifact v4.6.2 action to publish only image.tar and manifest.json. Its name
binds release SHA, producer run and attempt. This job has no production Environment
or deploy SSH secrets. It never issues root approval. Existing read-only GitHub
permissions remain; artifact runtime upload uses the normal Actions service.

Owner must independently inspect the original GitHub CI and producer workflow/
revision/run/current attempt, wait for completed success, download the exact
numeric artifact ID and independently compute image.tar hash/size. The GitHub ZIP
digest and image.tar digest are explicitly distinguished. Only then may a separately
authorized trusted operator install the root approval with file/directory fsync
and atomic rename. Copying uploader-supplied assertions is expressly insufficient.
The trusted CI builder and this independent human approval are the trust roots;
their compromise/misapproval is outside restricted-key containment.

Explicit manual deploy subsequently requires the existing activation flag plus
production Environment approval and sha/ci_run/artifact_id. It verifies artifact
API producer/workflow/repository/main/run/attempt identity, downloads by exact ID
using SHA-pinned download-artifact v4.3.0, verifies raw saved bytes and reuses them.
There is NO build/resave in release phase or fallback to artifact name/latest.
CI workflow_run cannot enter build or rollout. The two action tag→commit mappings
were checked through read-only official GitHub repository metadata. No workflow
dispatch, artifact upload/download or production approval was executed here.

An expired/deleted artifact, unavailable producer evidence, wrong run/attempt or
downloaded-byte mismatch blocks release. Existing runtime-change and DB/compose/
contract delta guards still operate before submit. Build-only can produce a
candidate later skipped as NO_OP/NO_RUNTIME_CHANGE; release never rebuilds it.

### Filesystem, TOCTOU and repeat semantics

All authorization/archive parent directories are opened from / via held dirfds
with O_DIRECTORY/O_NOFOLLOW/O_CLOEXEC and fstat checks for root ownership and no
group/other writes; the final directory is0700. Records and received archives
must be root0600 regular single-link files; reads are bounded and descriptor
metadata is checked before/after reading. Incoming archive has a unique mkstemp
name and is written through that same original descriptor, not reopened for
receipt. JSON duplicate keys/unknown authorization fields fail closed.

Actual stored bytes are compared to independent approval, copied into a Linux
memfd, and sealed against writes/grow/shrink/seal changes. The load subprocess
inherits only that fd and opens /proc/self/fd/N; it cannot follow a later archive
pathname replacement. Before load, original inode/device/size/mtime/ctime and
digest/size plus approval bytes are checked again. An fd-handoff regression uses
a real child process; Docker operations themselves remain mocked in these tests.
Linux sealing support is mandatory, with no unsafe compatibility fallback.

Before load, an exclusive root0600 authorizationId.used marker is flushed/fsynced
along with its root directory. Authorization permits one attempted load. Any
failed load/rollback/crash requires NEW independent approval ID, not marker
deletion or an automatic retry. Existing remote flock serializes this operation;
durable RUNNING/result journal and manual crash-recovery limitations are unchanged.
Approval replacement/expiry before cutover blocks without changing the old live
release. Actual production owner/modes/ACLs and administrative-channel custody
remain later host-review obligations, not inferred from mocked UIDs.

### Actual local verification

Native WSL, Node24.10.0, Python3.12.3 and the existing Go1.27.2 toolchain. No runtime
provider/production env file or credential was loaded. Existing CI runners strip
inherited private env and provision only disposable loopback PostgreSQL fixtures.

Baseline before implementation: Python28/28, Node21/21, Part15 31/31; both static
verifiers, Python compile, Node syntax and diff-check exit0. The negative test
then failed as recorded above. An intermediate new-test expectation treated an
already-consumed approval as OSError rather than the existing Blocked wrapper;
corrected the test's expected denial class, not the fail-closed implementation.
Final focused suite is **39/39 PASS,0 SKIP**, including the original28 tests and
the embedded Node producer/download/manual-release harness (counted as ONE Python
test, not as an invented standalone Node suite count).

| Final command/check | Actual result |
| --- | --- |
| python3 -m unittest discover -s scripts/deploy -p 'auto_*_test.py' | exit0,39/39 PASS,0 SKIP |
| node --test scripts/deploy/auto-gate.test.mjs | exit0,21/21 PASS |
| node scripts/deploy/verify-auto-deploy.mjs | exit0, original trust-boundary markers retained |
| node --test scripts/deploy/verify-part15.test.mjs | exit0,31/31 PASS |
| node scripts/deploy/verify-part15.mjs | exit0 |
| python3 -m py_compile scripts/deploy/auto_broker.py | exit0 |
| node --check scripts/deploy/auto-build.mjs; node --check scripts/deploy/auto-transport.mjs | exit0 each |
| actionlint v1.7.7 .github/workflows/deploy-production.yml | exit0; pinned tool built in owned temporary directory, not added to project dependencies |
| node scripts/ci/run-checks.mjs contracts | exit0, frozen install/lint; offline12 PASS/10 HTTP SKIP explicitly retained |
| existing documented loopback Nest fixture + contracts pnpm test:fixture | exit0,22/22 PASS,0 SKIP; owned process cleaned |
| node scripts/ci/run-checks.mjs go | exit0: gofmt/tidy/no module drift/mod verify/test/race/vet/staticcheck normal+integration/govulncheck/build; no vulnerabilities found |
| node scripts/ci/run-checks.mjs nest | exit0: frozen install/generate/build,27/27 tests, prod audit clean |
| PW_CHANNEL=chrome node scripts/ci/run-checks.mjs frontend | exit0: frozen install/typecheck/lint/263 unit tests/no-isolate/audit/build/configured E2E |
| node scripts/ci/run-checks.mjs pipeline | exit0: frozen install/test/typecheck |
| node scripts/ci/run-checks.mjs security; node --test scripts/ci/guard.test.mjs | exit0: source/workflow policy, synthetic backup guard1/1, CI guards6/6 |
| node scripts/ci/run-db-integration.mjs | exit0: own PG17, all six disposable databases, migrations, seven existing race-enabled integration invocations, cleanup PASS |
| PW_CHANNEL=chrome node scripts/ci/run-ephemeral-staging.mjs | exit0: own PG17, Go/Nest GET/security/Voice parity, GET contracts18 PASS/4 expected fixture-POST SKIP per origin,12/12 HTTP browser tests, local hardened Docker/outage/recovery/cleanup PASS |
| git diff --check; exact scope; relative Markdown links; bounded privacy scan; historical-report prefix preservation | PASS |

All local component profiles underlying the existing CI gate were executable and
completed; this is NOT a hosted nine-job result for an uncommitted candidate.
Configured local browser installer SKIP used existing Chrome; E2E actually ran.
Analytics-ID/platform-gated E2E cases skipped by existing profiles are not claimed
as new analytics PASS. Frontend wrapper retains only output tail, so no full mock
E2E count is fabricated. Existing destination-stream-closed messages appeared;
the unchanged runner still exited0. Go live-provider tests are opt-in and were
not enabled. A first optional fixture operator invocation had shell-quoting syntax
failure before starting a service; corrected invocation completed22/22 above.

Negative tests assert all privileged sinks remain untouched for self-consistent
unapproved bytes; different digest/size/repo/environment/SHA/workflow/run/attempt/
artifact/approval; absent/bad/expired/unreadable records; caller-selected path;
symlinks/wrong owner/mode/writable ancestors; resaved bytes; original file mutation/
replacement and approval replacement. Positive test crosses the REAL authorization/
sealing/image-identity code then mocked controlled rollout. Replay consumption,
same approval/expiry recheck, pre/post-load stale behavior and existing NO_OP,
rollback once/failure,5xx and journal file+directory fsync regressions all pass.
No real forged image, private env or production Docker action was used.

### Review artifact and remaining authorization gates

Fresh clean full-stack archive via unchanged `scripts/create-clean-archive.mjs`:
**artifacts/adilbaga-security-finding01-variant-a-20261018.tar.gz**.
Safe unique regular members, seven-path inclusion, all included source/report
byte-match and bounded private-key/token scans are checked on the final archive;
Git/TODO/env credentials/dependencies/builds/test artifacts/DB backups are excluded.
The earlier report prefix and all out-of-scope tracked paths remain unchanged.

Still NOT RUN/NOT AUTHORIZED: hosted candidate CI/artifact lifecycle, independent
Owner issuance/installation, real restricted-user ACL/SSH/sudo/broker verification,
production rollout or rollback. These are later separately authorized gates.
Source tests do not attest deployed permissions or supply-chain integrity beyond
the defined trusted builder/Owner boundary. Do not enable unattended CD or mark
the finding production-closed on this report alone.

No production SSH/API/SQL/Redis, ingest/publish, actual approval, secrets/settings,
timer/activation/deploy/commit/push/PR/merge occurred. Existing Part15 manual path
and application contracts remain untouched. **STOP — READY_FOR_EXTERNAL_REVIEW.**

## 13. 2026-10-18 — Approved PR41 main-drift integration and publication gate

Owner accepted the Variant A source archive and separately authorized this
isolated integration/publication. Old baseline e5486c3cfb3de37e8aab33fda27529b4af972399
advanced to **240d6ef7564d9d125ef5fcfd4193c441acd10d93**, merged frontend-only PR41.
Fresh fetch confirmed exactly that new main; its hosted CI run39120701203 is
9/9 SUCCESS. PR41 changes22 frontend/worklog paths, none of the seven approved
security paths. The previous publication attempt correctly stopped on drift.

Created new native-WSL worktree
`/home/denis/tmp/aktau-security01-artifact-provenance-main241`, branch
`fix/security01-artifact-provenance-main241`, from exact new main. No reset/rebase/
stash/clean or old-worktree modification. Captured original `git diff --binary`,
checked with `git apply --check`, then applied it. All seven copied files matched
the independently reviewed archive/source byte-for-byte before this append.
The six other paths remain byte-identical; this report preserves the complete old
candidate as a byte-identical prefix. Every PR41 path and all other tracked paths
remain equal to new main. No conflicts, extra source, contract/Go/DB/frontend edits.

Repeated local gates on this new worktree, Node24.10.0/Python3.12.3/Go1.27.2:

| Command/profile | Actual result |
| --- | --- |
| python3 -m unittest discover -s scripts/deploy -p 'auto_*_test.py' | exit0,39/39 PASS |
| node --test scripts/deploy/auto-gate.test.mjs | exit0,21/21 PASS |
| node --test scripts/deploy/verify-part15.test.mjs | exit0,31/31 PASS |
| node scripts/deploy/verify-auto-deploy.mjs; node scripts/deploy/verify-part15.mjs | exit0 each |
| node scripts/ci/run-checks.mjs security; node --test scripts/ci/guard.test.mjs | exit0 each; synthetic backup1/1 and CI guards6/6 |
| node scripts/ci/run-checks.mjs frontend, with existing PW_CHANNEL=chrome | exit0; frozen install/typecheck/lint,273/273 unit tests/no-isolate, audit, production build, configured mock E2E |
| node scripts/ci/run-checks.mjs go | exit0; gofmt/tidy/no drift/mod verify/test/race/vet/staticcheck normal+integration/govulncheck/build; no vulnerabilities found |
| node scripts/ci/run-checks.mjs contracts | exit0; frozen install/lint; offline12 PASS/10 HTTP SKIP, not22 PASS |
| node scripts/ci/run-checks.mjs nest; node scripts/ci/run-checks.mjs pipeline | exit0 each; Nest27/27 plus audit; pipeline test/typecheck |
| node scripts/ci/run-db-integration.mjs | exit0; complete owned disposable PG17 profile, seven race-enabled integration invocations and cleanup PASS |
| PW_CHANNEL=chrome node scripts/ci/run-ephemeral-staging.mjs | exit0; Go/Nest GET/security/Voice parity, GET contracts18 PASS/4 expected fixture-POST SKIP per origin; HTTP E2E14 PASS/6 configured SKIP; local hardened Docker health/outage/recovery and cleanup PASS |
| actionlint1.7.7, Python py_compile, Node --check both changed JS modules | exit0 each |
| git diff --check; scope/history/links/privacy/artifact byte checks | PASS |

No SKIP is counted as PASS: existing Chrome skips only browser installation;
configured analytics/platform/live-filter cases retain their own existing gates.
Mock E2E wrapper retains its output tail, not a fabricated full passed count.
The existing destination-stream-closed diagnostic appeared again with exit0.
All backend/API/Voice/SQL activity above used synthetic loopback fixtures, never
production credentials/data/provider calls. The reviewed security implementation
was not edited or weakened to make integration tests pass.

Publication requires another exact-main/scope check, explicit seven-path staging,
the Owner-specified commit/push and PR, then exact-commit hosted CI inspection.
This appendix is written before that commit: no future SHA, PR or hosted PASS is
invented here; final handoff and GitHub checks carry those results. Auto-deploy
remains disabled; broker installation, real Owner approval, host ACL verification,
artifact-service acceptance and production rollout remain separately authorized
gates. No production SSH/API/DB, secrets/flag changes or merge is performed.

New local review archive: `artifacts/adilbaga-security01-main241-review-20261018.tar.gz`,
via the unchanged full-stack archiver, with safe-member/source/report byte-match
checks. The original worktree/archive is preserved. **READY_FOR_EXTERNAL_REVIEW**
after successful local publication gates; STOP before merge or production action.
