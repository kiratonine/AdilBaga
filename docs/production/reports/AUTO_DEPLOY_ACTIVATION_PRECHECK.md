# Automatic CI/CD — activation precheck

Status: **BLOCKED**.

Activation blocker: **OWNER_ENVIRONMENT_PROTECTION_NOT_CONFIGURED**. Production
Environment has no main-only branch policy or required reviewer; only the
repository owner/admin can configure these, and the owner is currently unavailable.
The authorized collaborator confirms Actions Variables is empty, so the flag is
not configured by that UI evidence; read-only variable API returned401, not an
independent absence proof. No flag or Environment setting was changed. Manual
dry-run and exact-main hosted CI are independently verified PASS. Precheck and
plan are complete; activation remains blocked. This report is **not authorization
to install, enable, or deploy**.

## 1. Git/source preflight and scope

Fresh fetch/prune verified origin/main:
`bbdd25aac35852b9a1f24a391dcdca2621fd5457` — merge PR23, automatic CI/CD candidate.
Local branch remains integrate/full-stack, HEAD
`20a96120c165fd45ecfcf740c3ef66e2703a2bf7`; no switch/merge/reset/rebase.
Existing four modified Part15 operations/report files and untracked
PART_15_PRODUCTION_GO_API_DEPLOYMENT.md preserved. Prior CI/CD review worktree
also preserved. This task adds only this report.

Read current-main AUTO_DEPLOY_SETUP.md, AUTO_DEPLOY_CI_CD_REPORT.md, deployment
workflow, deploy/README.md and rollback runbook; local AGENTS.md governs this
workspace (it is not tracked in current origin/main). Main operations docs retain
historical e6ef854 checkpoint wording. Latest438ecdf production/Siri confirmation
is in the separate uncommitted Part15 closure; it was not overwritten or treated
as a fresh VPS audit. No production SSH, DB/API/provider probe was made here.

## 2. Exact-SHA CI and automatic workflow

[CI run38318571413](https://github.com/kiratonine/AdilBaga/actions/runs/38318571413),
push main, exact bbdd25aa... SHA, attempt1, completed/success. Independently fetched
run metadata and jobs:

| Mandatory job | ID | Conclusion |
| --- | --- | --- |
| Contracts | 115040970578 | success |
| Frontend | 115040970790 | success |
| Go Quality | 115040970372 | success |
| Security | 115040970770 | success |
| Nest Reference | 115040970828 | success |
| Pipeline Quality | 115040970784 | success |
| PostgreSQL Integration | 115041288063 | success |
| Ephemeral Staging | 115041551317 | success |
| CI Gate | 115042269501 | success |

[Automatic deploy-workflow run38318993040](https://github.com/kiratonine/AdilBaga/actions/runs/38318993040),
workflow_run, same SHA, attempt1, completed/success:
Deployment offline checks115042313548 success; gate115042408286 skipped;
rollout115042408793 skipped. **Workflow success is not a deployment PASS.**
No image build/SSH/production job was run. This is evidence of gating at that run,
not independently readable proof of the current repo-variable value.

## 3. Authorized collaborator-triggered manual dry-run — PASS

User was instructed: Actions → Deploy production Go API → Run workflow;
branch main, mode=dry-run, sha/ci_run blank, never deploy; do not enable the flag.
User supplied [run38319610769](https://github.com/kiratonine/AdilBaga/actions/runs/38319610769).

Independently verified: workflow_dispatch, main, exact bbdd25aa... SHA,
attempt1, completed/success. Selected mode=dry-run is user-reported; the REST
workflow-run metadata does not expose dispatch inputs, so that field is not
claimed independently returned by the API.

- Deployment offline checks115044294684: success; decoded logs show Node21/21,
  Python28/28, Part15 31/31 and both static verifiers PASS.
- gate115044369964: skipped, no steps.
- rollout115044371120: skipped, no steps.

Source-boundary inspection plus hosted job evidence confirm **no production
secrets/SSH/VPS access in this dry-run**: only rollout references Environment
production and DEPLOY_SSH_KEY/DEPLOY_KNOWN_HOSTS, auto-transport and auto-build;
it never started. Offline tests use synthetic values, mocks and temporary local
files, not actual DB/provider/SSH connections. Standard read-only GitHub checkout
token is not an application/production credential. No production settings changed.

Agent did not create the run: available authenticated GitHub integration exposes
read resources, not workflow_dispatch; local gh CLI is absent. No new PAT/key or
broader connection permission was requested to bypass that boundary.

## 4. Environment production — observed, not hardened yet

Repository is public. Read-only GET environments and environments/production
returned200. Canonical existing Environment name **Production**, ID22810540477;
the lowercase workflow reference resolves to it, not a separate backend-only
Environment. Environment names are case-insensitive in
[GitHub documentation](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
Other observed names: Preview, scintillating-amazement / production. No old
Environment was deleted or renamed; no Railway call/action was made.

Observed Production policy:

- deployment_branch_policy=null: no Environment branch restrictions;
- protection_rules=[]: no required reviewers/wait rules;
- can_admins_bypass=true: admin bypass permitted;
- required-reviewer/self-review prevention is not configured.

Required reviewers/selected branch restrictions are available for this public
repository under the documented current plan rules; actual account plan is not
claimed known. See
[GitHub deployment-protection reference](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
The agent's GitHub connection reports admin=false/maintain=false; no settings
write was attempted. Do not treat source guards as a replacement for Environment
protection or assume the existing Production Environment is exclusive to Go API.
User confirms they are not repository owner and cannot see Settings → Environments;
the owner can return in a few days. This is an access/authorization gate, not
evidence that the public-repository protection features are unsupported.

**Future owner-approved UI changes, NOT executed:**

1. Settings → Environments → existing Production; review its other consumers
   before applying shared protections. Do not create a case-only duplicate.
2. Deployment branches and tags → Selected branches and tags → add **Branch
   main only**. No wildcard/tag/PR rule; Protected branches only is not equivalent
   to explicit main and can admit all branches when protection is absent.
3. Required reviewers → actual authorized owner; Save protection rules.
4. Enable Prevent self-review and disallow admin bypass where exposed.
   Arrange a distinct authorized initiator/reviewer: an owner who initiates a
   deployment cannot approve their own run under Prevent self-review. Do not
   weaken this silently or share accounts to bypass it.
5. Re-read safe metadata/UI to prove the effective policy. If a required control
   is unavailable, stop for owner/review rather than guessing a plan upgrade.
6. AUTO_DEPLOY_ENABLED remains absent/false throughout this preparation.

## 5. Safe SSH / broker preparation plan — not installed

Proposed dedicated account: `adilbaga_ci` (name and absence must be separately
approved/verified). No personal key, root SSH, docker-group membership or inherited
sudo/admin groups. Key generation/custody must be approved before creation; use
a dedicated Ed25519 key, private file0600 in owner-controlled private storage,
never Git/report/chat. Owner transfers it only to Production Environment secret
DEPLOY_SSH_KEY after separate authorization; public key stays on VPS. No key was
generated, copied, rotated or inspected in this task.

Strict independently verified VPS host fingerprint/known_hosts, including correct
port syntax; never trust unauthenticated fresh ssh-keyscan output by itself.
GitHub Environment DEPLOY_KNOWN_HOSTS and nonsecret DEPLOY_HOST/USER/PORT are future
owner setup. No Supabase/Gemini/Upstash/Cloudflare credential goes to GitHub.

Authorized key should have restricted/forced command only:
`restrict,command="sudo -n /usr/local/sbin/adilbaga-deploy"` plus the approved public
key. No PTY, forwarding, user startup scripts, sftp/scp/general shell access from
this key. Lock account password; independently audit home/key-file permissions
and effective groups. No sshd/UFW/global configuration changes are presumed needed
or authorized; if needed, stop for a new scope.

Install exact reviewed main-SHA bytes only after owner approval:

| Source | Root-owned target | Mode |
| --- | --- | --- |
| scripts/deploy/auto-entrypoint.sh | /usr/local/sbin/adilbaga-deploy | 0755 |
| scripts/deploy/auto_broker.py | /usr/local/lib/adilbaga-deploy/auto_broker.py | 0644 |
| scripts/deploy/auto_smoke.py | /usr/local/lib/adilbaga-deploy/auto_smoke.py | 0644 |

Library directory root0755; private state /var/lib/adilbaga/deploy root0700.
No deploy-user write permission to broker/library/config/state. Wrapper clears
inherited env and uses isolated Python; broker accepts bounded JSON/data, never
uploaded scripts/arbitrary paths/commands. Compose and private API env remain
unchanged. Record source/file checksums without printing credential-file hashes.

**Proposed sudoers scope, for independent review only:**

```sudoers
Defaults:adilbaga_ci env_reset
adilbaga_ci ALL=(root) NOPASSWD: NOSETENV: /usr/local/sbin/adilbaga-deploy ""
```

Empty argument convention requires zero CLI arguments. Validate using visudo
before any installation; audit all effective inherited rules/groups. No general
sudo/docker/systemctl/python/tee rights; no SETENV or agent forwarding. Confirm
denial of extra arguments/unrelated commands in a separately authorized test
environment. Do not install these lines from this report without owner approval.

All future manual rollout operators must hold the same private flock for the
entire transaction; current manual Part15 command sequences are not modified.
Define supervised recovery from RUNNING journal/SIGKILL/power failure before
activation; journal presence is a stop/review condition, not automatic crash
recovery. Retain actual prior image and exact previous reference; no DB rollback.

## 6. Separate owner authorizations required

No permission below is implied by this precheck:

1. GitHub Production Environment protection changes, with review of other users.
2. Dedicated account/name, key generation, storage, installation and forced key
   restrictions; host-fingerprint verification/custody.
3. Fixed root-owned broker/library/private-state installation at reviewed SHA.
4. Narrow reviewed sudoers entry, effective-permission/negative tests, and shared
   manual-lock/recovery operating procedure.
5. GitHub Environment SSH variables/secrets placement (never app/provider secrets).
6. Separately scoped non-production installation/rollback rehearsal with real
   controller failure tests; offline mocks are not proof of installed recovery.
7. A future controlled maintenance-window production workflow deployment, including
   any temporary enablement of the shared AUTO_DEPLOY_ENABLED flag. **Even manual
   deploy uses this flag**; it cannot be enabled in this preparation task.
8. Only after rollout/recovery/public E2E and owner Siri acceptance, explicit
   authorization for unattended automatic releases.

Docs-only current-main changes relative to accepted Go runtime can legitimately
produce NO_RUNTIME_CHANGE, not a deployment or rollback-test PASS. Do not fabricate
a runtime change/snapshot to exercise rollout. Schedule any real rollout proof
under a separate approved compatible release and test scope.

## 7. Current stop and next actions

Confirmed: main CI9/9 PASS, automatic offline workflow PASS/rollout skipped,
manual dry-run PASS/no prod job, protection capabilities/current gaps identified.
Disabled flag evidence: collaborator reports the Actions Variables list is empty;
current API-value verification is unavailable401. Both observed runs skipped the
production job; no flag was enabled by this task. The earlier flag-confirmation
checkpoint is resolved by attributed UI evidence, not silently reclassified as
an authenticated API result.

Remaining blocker: Production Environment lacks required protections, and owner
administration is unavailable. When owner returns, first review/approve the exact
Environment changes in section4, keep AUTO_DEPLOY_ENABLED absent/false, then
independently re-read effective main-only policy/reviewers/bypass configuration.
No installation or real rollout follows automatically from that correction;
sections5–6 require separate approvals. Preserve this report and update it after
the future protected-Environment verification; do not bypass the owner gate.

This task made no VPS/SSH/DB/provider/credential/Environment mutation, deployment,
image build, ingestion/new snapshot, frontend change, commit/push/merge.
Only safe GitHub reads and this local report were performed; user initiated
the authorized offline dispatch. STOP before production changes.
