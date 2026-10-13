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
