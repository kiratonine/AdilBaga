# Go API auto-deploy — SOURCE CANDIDATE, disabled by default

No activation/deployment/server or secret setup was performed by this task.
Production remains Supabase / existing Go API, not a new provider or registry.
New workflow does not change the existing nine CI jobs, compose or API/Voice code.

## Trust and enablement

Repository variable `AUTO_DEPLOY_ENABLED` must be absent or exactly `false` until
external Code Review and owner authorization. Only literal `true` enables the
production gate; unset/invalid values disable it. `workflow_dispatch` defaults
to `dry-run`, which runs offline tests without SSH or production secrets.
An enabled manual deploy requires main, exact 40-character SHA and push-main CI
run ID, with all nine jobs successful at the current run attempt. Automatic runs
accept only original-repository push-main CI; no PR artifacts/code are consumed.
CI identity is verified by API workflow path/ID, not just the display name.
Main is checked again on runner before transport and on VPS before closed cutover.
Stale releases yield `SKIPPED_STALE`; active SHA yields `NO_OP`.
After gates and Environment approval, read-only broker status resolves the real
active release before any image build. If only docs/tests/frontend changed and
Go runtime inputs did not, return `NO_RUNTIME_CHANGE`, preserving Part15's
documentation-only/no-rebuild rule. Runtime diff uses Dockerfile, go.mod/go.sum,
cmd and internal, not an invented historical baseline. Planning is not dry-run:
it belongs only to the authorized deploy job and may read VPS status.

`workflow_run` can access privileged context, so this workflow checks out trusted
main only for guards, then the API-verified exact candidate for the build. Do not
add artifact downloads, arbitrary remote commands, caller-controlled paths,
shell interpolation, PR caches or broader token permissions.
See [GitHub workflow-run guidance](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run).

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

After review: disabled merge → actual hosted offline checks → owner-configured
Environment/key/broker privileges → dry-run → separately approved controlled
manual deployment and rollback proof in an authorized test environment → public
E2E/manual Siri → owner sets `AUTO_DEPLOY_ENABLED=true`. Because manual deploy
uses the same global flag, enable it only in a reviewed maintenance window, with
main fixed and no concurrent main push, then disable again if review is pending.
Do not claim unattended activation from offline tests.
