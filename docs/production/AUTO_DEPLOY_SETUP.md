# Go API auto-deploy — SOURCE CANDIDATE, disabled by default

No activation/deployment/server or secret setup was performed by this task.
Production remains Supabase / existing Go API, not a new provider or registry.
New workflow does not change the existing nine CI jobs, compose or API/Voice code.

## Trust and enablement

Repository variable `AUTO_DEPLOY_ENABLED` must be absent or exactly `false` until
external Code Review and owner authorization. Only literal `true` enables the
production gate; unset/invalid values disable it. `workflow_dispatch` defaults
to `dry-run`, which runs offline tests without SSH or production secrets.
An enabled manual deploy requires main, exact 40-character SHA, push-main CI
run ID, immutable build artifact ID and independent root-owned Owner approval.
All nine CI jobs must succeed at the current attempt. CI workflow_run can verify
eligibility but cannot build or roll out automatically. No PR/fork artifacts/code
are consumed. Variant A is per-artifact manual release, NOT unattended CD.
CI identity is verified by API workflow path/ID, not just the display name.
Main is checked again on runner before transport and on VPS before closed cutover.
Stale releases yield `SKIPPED_STALE`; active SHA yields `NO_OP`.
Build-only is an explicit main workflow_dispatch mode, available with the flag
disabled, without production Environment or SSH secrets. It saves an image ONCE
and uploads only image.tar and manifest.json under an attempt-specific immutable
artifact name. After separate Owner approval, an explicit deploy dispatch
downloads that SAME artifact ID, verifies producer/bytes, then reads broker status.
If only docs/tests/frontend changed and
Go runtime inputs did not, return `NO_RUNTIME_CHANGE`, preserving Part15's
documentation-only/no-rebuild rule. Runtime diff uses Dockerfile, go.mod/go.sum,
cmd and internal, not an invented historical baseline. Planning is not dry-run:
it belongs only to the authorized deploy job and may read VPS status.

`workflow_run` can access privileged context, so this workflow checks out trusted
main only for guards, then the API-verified exact candidate for a manual build.
Only the pinned immutable-artifact downloader in explicit deploy is allowed.
Do not add arbitrary downloads, remote commands, caller-controlled paths,
shell interpolation, PR caches or broader token permissions.
See [GitHub workflow-run guidance](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run).

## Exact historical tooling compatibility (source-only P1 follow-up)

Transport still blocks every protected change under `backend/prisma`, `contracts`
and `deploy/compose.production.yml` by default. There is exactly one source-pinned
exception, not a blanket exclusion of package files or the contracts directory:

- active release must be `438ecdfa3d386a186dcd8b73c3c10aef5e79dc82`;
- the complete protected diff must contain **both and only** the following paths;
- runtime Git-object checks must match all four regular-file (`100644 blob`)
  identities below; no working-tree, artifact-supplied or environment override.

| Path | Active blob | Candidate blob |
| --- | --- | --- |
| contracts/package.json | ee97d962531376e81a0b9175d8eef2aaa36a7c9c | 48a7866b9084cbc25b2dafc1089713eb555e0a38 |
| contracts/pnpm-lock.yaml | 5ec3371eba46c18660421d89949aa0ebf890d534 | 4a631ef27450ce85b818e4fe02705b9bcd224c13 |

These blobs identify only the reviewed ajv/yaml tooling dependency update. The
candidate is the **fresh main commit verified by CI and immutable artifact
checks**, not a fixed future merge SHA. Missing/unknown objects, Git failures,
renames/deletes, additional paths, changed pins or a different active release
fail closed for this exception. Ordinary releases with no protected diff retain
their existing behavior. This gate proves neither API/DB runtime compatibility
nor actual VPS readiness; independent approval, rollback, broker and deployment
activation prerequisites are unchanged. No production setup is authorized by
this source exception.

## Owner-only GitHub setup — NOT executed

1. External review of source, root broker, failure tests and privileges first.
2. Merge through the normal PR process with flag disabled. Run offline dispatch.
3. Configure Environment `production` restricted to main; add a required owner
   reviewer and prevent self-review/admin bypass where available on this plan.
   Check actual repository visibility/plan restrictions: do not assume reviewers
   or deployment-protection features exist. If unavailable, keep the flag false
   until the owner separately approves the first controlled run and its access.
   [GitHub environment restrictions](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
4. Environment variables: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`. Values are
   owner-configured, not guessed. Host syntax is a DNS name or IPv4; user cannot
   be root. Set the SSH port explicitly. No application/provider secrets here.
5. Environment secrets: dedicated `DEPLOY_SSH_KEY`, independently authenticated
   `DEPLOY_KNOWN_HOSTS`. Verify host fingerprint out of band. Never trust a fresh
   unauthenticated ssh-keyscan result. Use `[host]:port` entries for nondefault
   ports. No personal/root key, agent forwarding or permissive host checking.
6. Keep DATABASE_URL/owner/ingest, Gemini/Upstash and Cloudflare secrets exclusively
   in existing VPS private runtime configuration, not GitHub Actions.

## Server privilege boundary — separate review/authorization required

This implementation needs a new root-owned fixed broker. It is **not installed**
and no existing generic sudo rule is assumed acceptable for CI. Do not give the
CI user docker group membership, general sudo, shell/tee/python/systemctl rights,
or write access to root code/configuration. Missing prerequisites fail closed.

Only after explicit owner approval, a trusted operator may install reviewed bytes:

- `scripts/deploy/auto-entrypoint.sh` → `/usr/local/sbin/adilbaga-deploy`, root0755;
- `auto_broker.py`, `auto_smoke.py` → `/usr/local/lib/adilbaga-deploy/`, root0644
  within root0755 directory (no deploy-user write access);
- private `/var/lib/adilbaga/deploy` root0700, on the same persistent local host;
- its `authorizations` directory root0700, approval records root0600; every parent
  root-owned, non-symlink and not group/other writable. The deploy principal has
  NO approval-write operation or additional sudo permission;
- dedicated SSH account/key, restricted forwarding/PTY and only exact broker
  command as its allowed SSH operation; no unrelated shell access.

An independently reviewed sudoers entry must authorize only the fixed wrapper
with **zero arguments**, e.g. the sudoers empty-argument convention `""`; validate
using `visudo -cf`, with env_reset/no SETENV. Account naming and installation are
not prescribed as already applied. Audit inherited/broad sudo and groups first.
Do not widen privileges to make tests green. This source run cannot assert actual
VPS SSH/sudo/Environment compatibility; activation requires a separate gate.

Broker clears inherited env, runs isolated Python and never interprets uploaded
code. Incoming data is bounded JSON metadata plus one image tar, no caller paths
or commands. SHA/checksum/rootfs/API binary/User/revision/platform are verified;
only exact release reference is replaced atomically. Runtime env/compose bytes
must remain unchanged. No Docker prune, migrations, DB probes, ingestion or secret
rotation. A DB/compose/frozen-contract change relative to active release blocks
automatic transport. Root-owned compose hash is fixed to the reviewed Part15 file.

## Variant A: independent approval of one exact saved archive

This procedure is a future separately authorized operator task, NOT executed by
the source implementation. No actual authorization or signing credential is
created here. Existing trusted Owner administrative access is separate from the
restricted deployment account; do not grant that account approval-install rights.

1. Keep AUTO_DEPLOY_ENABLED absent/false. After reviewed source is merged and its
   exact push-main CI succeeds, dispatch this workflow on main with mode=build,
   sha=that exact SHA and ci_run=that successful run. artifact_id stays empty.
   The build job has only read-only GitHub metadata permissions and the GitHub
   artifact runtime service; no deploy SSH, private API env or production secrets.
2. Wait for the whole build-only run to finish successfully. In original repository
   Actions, independently check CI workflow `.github/workflows/ci.yml`, CI run and
   current attempt/9 jobs, then producer workflow `.github/workflows/deploy-production.yml`,
   exact main SHA, manual build mode, run/attempt and upload step. The checked-in
   build workflow/source is part of the trusted computing base. Never approve a
   matching label alone or metadata sent privately by the restricted uploader.
3. Obtain the artifact by its numeric GitHub artifact ID from that verified run,
   named `adilbaga-api-<sha>-<buildRunId>-<buildAttempt>`. Independently download and
   inspect exactly image.tar and manifest.json. Compute SHA256 and byte size of
   image.tar on the trusted Owner workstation; compare producer/run/attempt and
   manifest. GitHub's artifact ZIP digest is NOT the image.tar digest. Never build,
   modify, truncate or docker-save again after approval. Artifact retention is7days;
   deletion/expiry requires another reviewed build/approval, not a name fallback.
4. Through the separately approved trusted administrative channel, atomically
   install `<releaseSha>.json` under the fixed root-only authorizations directory.
   Validate record bytes/schema offline before installation; use a new root0600
   file in that directory, flush/fsync, atomic rename, and parent-directory fsync.
   Only this trusted administrative role can grant/revoke approval. No broker
   request creates it; no approval record, approvedBy identity or administrative
   channel details are uploaded to GitHub artifacts. Approval is the root-protected
   file custody, not a JSON boolean or uploader assertion by itself.
5. Only after separate activation authorization, temporarily enable the existing
   flag for an explicit mode=deploy dispatch on main with the same sha, ci_run and
   artifact_id. Production Environment approval is additional protection, not a
   substitute for step4. Release verifies artifact API identity and producer before
   download, rechecks exact raw bytes afterward, and NEVER invokes build/save.
   Main drift fails closed; do not rebuild silently to bypass stale approval.

### Strict approval schema v1

Exactly these keys, no duplicates/unknown fields. All run/attempt/id fields are
positive JSON integers ≤9007199254740991, not strings/bools. Record size≤16384bytes.

| Field | Required value |
| --- | --- |
| schemaVersion | integer1 |
| repository / environment | kiratonine/AdilBaga / production |
| releaseSha | exact lowercase40hex current main |
| ciWorkflow / ciRunId / ciAttempt | .github/workflows/ci.yml and independently verified successful main CI |
| buildWorkflow / buildRunId / buildAttempt | .github/workflows/deploy-production.yml and verified immutable archive producer |
| artifactIdentity | exact object with numeric id and attempt-specific name defined above |
| archiveSha256 / archiveSize | lowercase64hex and byte size of EXACT image.tar, 1..268435456bytes |
| approved | true, established only by trusted file installation |
| approvedBy | owner: followed by1..64 ASCII letters/digits/underscore/hyphen; non-sensitive audit handle, not an authentication mechanism |
| approvedAt / expiresAt | Unix seconds integers; approvedAt≤now<expiresAt; maximum validity86400seconds |
| authorizationId | new random lowercase32hex per attempted load |

The submitted manifest keeps its existing image fields and adds `provenance`
with repository, ciWorkflow/ciRunId/ciAttempt, buildWorkflow/buildRunId/buildAttempt
and artifactIdentity. These are UNTRUSTED claims matched against the independent
record; they cannot create authority. Path selection is fixed from validated SHA.

### Verification, consumption and TOCTOU

Under the existing remote flock, broker uses no-follow/CLOEXEC directory-fd
traversal, fstat root/mode/link/size checks and strict bounded JSON. Actual stored
archive bytes must match both independent approval and transfer manifest before
tar inventory or Docker access. A uniquely named root0600 archive in root0700
STATE is copied into a Linux sealing-enabled memfd; write/grow/shrink/further-seal
changes are disabled. After inventory, original file identity/bytes and approval
are checked again. docker load inherits only the sealed fd and reads its proc-fd
path, never the original archive pathname. Unsupported sealing fails closed.

Before load, a root0600 exclusive `<authorizationId>.used` marker is fsynced along
with its directory. One approval permits ONE attempted load. A failed load,
rollback, crash or post-load stale decision requires explicit NEW approval ID;
there is no automatic authorization retry. NO_OP on the active SHA and stale
pre-load skip do not load or consume approval. Do not erase a used marker to retry.
Immediately before cutover, the same authorization bytes/expiry and main freshness
are rechecked. Approval failures are pre-cutover and never stop the live tunnel or
trigger compensation. Existing compensation remains for failures after cutover.
Root/admin compromise or a compromised trusted builder is outside this boundary;
this does not attest real host ACLs from offline tests.

## Rollout, rollback, observation

GitHub concurrency does not cancel running rollout. Broker holds remote flock
through preflight, cutover, smoke, 600-second observation and compensation.
Before enabling automation, separately agree that every manual rollout holds
the same `/var/lib/adilbaga/deploy/lock` for its entire transaction. Existing
Part15 commands are not modified here. A manual operator who bypasses the shared
lock is NOT covered by flock; do not promise mutual exclusion with such a process.
The detached worker survives an SSH/runner disconnect, uses bounded operations,
retains both images and fixed result classes; runner polls for up to20 minutes.
Transient cold503 is allowed within30-second readiness budget, not forever.

Tunnel stays closed until local health/hardening/actual peer/catalog/Voice/real
Upstash checks pass. Public HTTPS/CORS and application smoke run after reopening.
Prices come from live filtered GET responses; no product/price fixture is used.
Only owned short-lived test sessions are cleaned; no payloads/secrets are logged.
Gemini success is not required when approved fallback serves correct results.
No provider benchmarks, physical Siri claim or cache/timeout/model adjustment.

One failure compensation restores the exact old API_IMAGE, recreates, checks
readiness, hardening and local application BEFORE reopening. A failed rollback
closes Tunnel and returns `BLOCKED_ROLLBACK_FAILED`. No database rollback.

**Power loss/SIGKILL are not caught by Python finally.** A persistent RUNNING
journal blocks another submission; it is not self-healing recovery. Do not erase
this journal blindly. Operator must close Tunnel, inspect the saved state and
review recovery. A source-only mock test does not prove crash-safe production
recovery. No reboot/startup recovery facility is introduced silently.

## Enablement sequence

After review: disabled merge → exact-SHA hosted checks/dry-run → manual build-only
→ independent artifact verification/Owner record → separately approved broker/
Environment setup and controlled manual release/rollback proof. No setup is implied
by these instructions. Enable the existing flag only in a reviewed maintenance
window with main fixed; disable again after the separately approved manual run.
Variant A never enables unattended main-push rollout. Existing physical Siri PASS
is Owner evidence, not something this source task repeats or claims to execute.
