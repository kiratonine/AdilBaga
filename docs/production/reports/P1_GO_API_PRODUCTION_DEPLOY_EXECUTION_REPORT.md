# P1 Go API — Production Deploy Execution

> **Current: P1_BLOCKED_ACTIONS_READ_ONLY_PLAN — NOT DEPLOYED.** Owner accepted
> one-release compensating controls. One authorized deploy dispatch failed during
> read-only planning, before submit/cutover. Flag is now false. Independent VPS
> readback confirms old438 healthy, rollback retained and approval unused. See
> section9.2; earlier checkpoints below are historical, not current status.
> Sections1–6 and their original status below describe the earlier checkpoint;
> their historical results are preserved, not current missing-setup claims.

2026-10-20. **BLOCKED — P1_BLOCKED_HOST_KEY_OUT_OF_BAND_VERIFICATION. NOT DEPLOYED.**

PR53 is merged, new exact-main CI9/9 passes, and one immutable Actions build has
completed. No production write, broker installation, approval issuance, Docker
load, cutover or deploy dispatch occurred. Existing Owner release authorization
is acknowledged; no additional general deployment consent is requested.

The first unfulfilled write prerequisite is independently authenticated host-key
evidence required by Phase B. Strict SSH checking against existing known_hosts
worked, but is not a newly established out-of-band attestation. Additional gates
are missing broker/restricted CI identity, missing deployment configuration and
independent exact-artifact root approval. This is not an incident-induced STOP.
Resume this same TASK after the concrete administrative actions below.

## 1. Source and execution ledger

Audit worktree: `/home/denis/tmp/aktau-p1-production-deploy-execution`;
branch `audit/p1-production-deploy-execution`. HEAD/base:
**`b9c7fc90f54699ef7e483ffebd5e0ea8779d3c23`**. Other worktrees, their reports and
uncommitted changes were preserved. Only this new report is added here.

| UTC / UTC+05 on 2026-10-20 | Object / source | Actual evidence / observer | Result |
| --- | --- | --- | --- |
| 15:42:39 / 20:42:39 | [PR53](https://github.com/kiratonine/AdilBaga/pull/53), reviewed head `ed8d92c41e2a8b2cd9440472c1cec15c17763a63` | GitHub says MERGED by Owner account before this execution's inspection. Agent did not merge it again. | PASS |
| After fetch | New main `b9c7fc90f54699ef7e483ffebd5e0ea8779d3c23` | Parents are b75af8b2… and reviewed ed8d92c…; tree `ef14a76b4f26657fadbe310fa2a238579884ff13` exactly equals reviewed PR tree. Git tree diff exit0. | PASS |
| CI completed 15:48:19 / 20:48:19; independently checked afterward | [Push-main CI39450935221](https://github.com/kiratonine/AdilBaga/actions/runs/39450935221), attempt1 | Existing `verifyCI()` consumed API run, workflow375694597/path, exact-attempt jobs and fresh main; ELIGIBLE. | 9/9 SUCCESS |
| 15:53:04.225993 / 20:53:04.225993 | Fixed VPS release/broker paths, new-main candidate | Root read-only lstat and strict release-reference parsing; old API438ecdfa… remains active; wrapper/library/STATE/authorization absent. | Old release VERIFIED; setup BLOCKED |
| 15:53:36.335621 / 20:53:36.335621 | Docker, rollback tag, units, compose, two loopback GET | Independent selected-field SSH collector; details below. | Selected preflight PASS |
| Created 15:53:49 / 20:53:49; completed 15:55:16 / 20:55:16 | [Build-only39452595506](https://github.com/kiratonine/AdilBaga/actions/runs/39452595506), attempt1, exact new main | One manual mode=build dispatch. Offline, gate, build_only SUCCESS; rollout SKIPPED by design. | IMMUTABLE BUILD PASS, not deploy |
| After build completion | Artifact12279152952, exact tar and producer | Existing artifactMetadata()/verifyDownloaded(), original-ID ZIP checksum, offline tar/config/layer/binary inspection; executed independently of build, but by the same agent. | Technical verification PASS; not independent Owner approval |
| Current preflight | Broker/restricted identity/approval | Broker code and root state absent; identity/sudo boundary not established; no record issued. | BLOCKED |
| Current GitHub metadata | Production environment / configuration | main-only branch policy; no required-reviewer rule returned; vars/secrets empty; repo AUTO_DEPLOY_ENABLED absent. | Configuration BLOCKED |
| Not executed | Deploy, release journal/readback, public application/Voice/Redis, observation | 0 deploy dispatch, 0 Docker load/cutover/rollback. | NOT_RUN; cannot claim DEPLOYED |

All nine mandatory CI jobs completed SUCCESS for the exact current attempt:
Contracts, Frontend, Go Quality, Security, Nest Reference, Pipeline Quality,
PostgreSQL Integration, Ephemeral Staging, CI Gate. PR-head CI is not substituted
for merged-main CI. The automatic workflow_run39451785414 was also successful,
but its run conclusion is not deployment proof.

## 2. Fresh VPS evidence and limits

- Active reference and Docker revision/image agree on
  **`438ecdfa3d386a186dcd8b73c3c10aef5e79dc82`**, not the candidate.
- Container running/healthy, restart0, OOM=false, User10001:10001, readonly rootfs,
  ALL caps dropped/no additions, no-new-privileges, not privileged; exact loopback
  publication confirmed. No complete inspect/env dump was emitted.
- The retained438 tag exists, its image identity equals the active container's
  image identity, revision agrees, platform linux/amd64 and expected user match.
  This establishes retained rollback-image existence, not an executed rollback
  or independent saved-archive parity.
- Compose SHA256 matches reviewed source:
  `7ba6711fcf18a08d96008bb063e1ca475f668fbdfc4a98eb5b00a0fbbdd57eb5`.
  Runtime env/DSN contents were not read; complete env/ACL/peer admission remains
  an installed-broker gate. Root0755 library/0700 STATE do not yet exist.
- cloudflared loaded/enabled/active/running, Result=success. Both daily and full
  sync timers and monitor timer loaded/enabled/active/waiting, Result=success.
  Monitor oneshot loaded/static/inactive/dead, Result=success. These are timer
  states, not a new sync/publication, Telegram receipt or complete cadence proof.
- No process matching the reviewed broker filename was present. Since STATE is
  absent, broker journal/lock reconciliation was unavailable. This narrow process
  projection does not prove global exclusivity against every manual operator.
- Exactly **2 production HTTP GET**, both loopback: live200 **10ms**, ready200
  **249ms**, JSON objects. The collector did not assert exact body fields; no
  response bodies were retained. These are warm old-release preflight evidence,
  not new-release application acceptance or cold-connection timing.

Five bounded read-only SSH sessions were used during operator preflight:
the first stopped on an operator regex error before Docker/HTTP; a narrow
release-reference check succeeded; a fuller collector stopped on invalid
Go-template syntax; a narrow Docker-name check succeeded; the corrected selected
collector completed. The errors were in temporary operator commands, not proven
VPS defects, and caused no production writes/HTTP retries. They were not deploy
attempts. Fixed argv, sanitized JSON and suppressed stderr were used. Root-side
TERM/KILL timeout was100s for full collectors (15s for narrow checks), local bound
115s/25s; individual command bounds12s, curl max-time8s/body4096/no redirects.
SSH host checking was never disabled; no forwarding or multiplex reuse was
requested in full collectors. No service operation was performed.

Counts: **5 SSH sessions; 2 loopback GET; 0 public production GET/HEAD; 0 POST;
0 SQL/Redis; 0 install/deploy/rollback**. GitHub metadata/download requests and
local loopback test HTTP are separate. No backup contents, runtime credentials,
private keys or raw logs were read.

## 3. Immutable artifact — factual independent-review packet

Repository `kiratonine/AdilBaga`; source/revision
`b9c7fc90f54699ef7e483ffebd5e0ea8779d3c23`.

| Field | Verified value |
| --- | --- |
| CI | `.github/workflows/ci.yml`, workflow375694597, run39450935221, attempt1, push/main9/9 |
| Builder | `.github/workflows/deploy-production.yml`, workflow382629732, run39452595506, attempt1, workflow_dispatch/main |
| Numeric artifact ID | **12279152952**, not expired at inspection |
| Immutable name | `adilbaga-api-b9c7fc90f54699ef7e483ffebd5e0ea8779d3c23-39452595506-1` |
| Original ZIP size / SHA256 | 21975083 bytes / `a1200576ef4a07a29dbdf058d4c9a606070e3332fe8d172f97441ce63377d409` |
| **image.tar size / SHA256** | **21974016 bytes** / **`240ef303650dc79709930a31434906cfa6145a26e97d862100b0320b84333e98`** |
| Platform / user / entrypoint | linux/amd64 /10001:10001 / `/usr/local/bin/api` |
| API binary SHA256 | `c1a18d1ade799b2921ef057ab30f524f9c4f3b8d71a091d13c62b5e44a4eac4b` |

All three rootfs diff IDs were independently recomputed from saved layers and
matched config/manifest:

```text
sha256:74d97c428c51a828f9051a7a40a53ff1fc99e54fc30323ce36760701b0b7f711
sha256:f99ba4a2dc870a09735e9d9802a44095c685c261cfb6d0036ae54a85b2092f25
sha256:6add3701e8d1dad0d9213623167400e87dee5d44b379148ec8985d9bbdadd124
```

Downloaded the original numeric-ID endpoint, not latest/name fallback. Original
ZIP SHA matches the GitHub artifact digest. Inventory is exactly image.tar and
manifest.json, CRC passes. Extraction used O_EXCL/O_NOFOLLOW into a new private
local directory; an unavailable local unzip command made no files and was not a
producer/download failure. Neither artifact member was rewritten afterward.
Existing producer/download validators passed against current GitHub metadata.
Offline tar inspection checked safe/unique paths and types, sole exact image tag,
revision/config/platform/user/entrypoint, PATH-only image env, all diff IDs and
actual API bytes. **No local or production docker load was used.** No image was
rebuilt or docker-saved by the agent.

Preserved local original ZIP and its two exact members outside Git in
`/home/denis/tmp/aktau-p1-immutable-artifact-FiQO633a` (0700; files0600).
Retention on GitHub is seven days. Expiry, deleted artifact or source drift
requires explicit new selection/build/approval, not silent replacement.

This packet contains **facts, not an approval record**. Independent Owner/admin
verification and actual root custody are still absent. No approvedBy, approval
time/expiry, authorizationId or approved=true was invented.

## 4. Concrete administrative handoff — resume this TASK, no new Part

### First blocking action: authenticate the host out of band

Owner/admin should open the VPS provider's trusted console, **not this SSH
connection**, and run this read-only command there:

```sh
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

The existing trusted local my-vps known_hosts record has ED25519 fingerprint
**`SHA256:rPis6wSdpRUo1o1hTpzb6L0Ldzo5t88BJFOCxtD/Wtc`**. Confirm exact equality
via that independent console. Return only confirmation/fingerprint, not keys,
passwords or credentials. A mismatch is STOP, not permission to replace
known_hosts. Existing successful strict SSH plus local known_hosts alone did
not satisfy this explicit Phase-B write gate. No ssh-keyscan trust was assumed.

### Then execute already-authorized narrow setup

After that attestation, the existing Owner SSH profile has demonstrated root
read-only sudo; recheck actual write authority and fresh state before any setup.
Install only the following exact GitHub-source-verified main bytes:

| Source → root target | SHA256 / required mode |
| --- | --- |
| scripts/deploy/auto-entrypoint.sh → /usr/local/sbin/adilbaga-deploy | `f7bcc5a0dbc0dd15bc74a50134dc9941cc242a94b6acfb96a69f53d50b927441` /0755 |
| scripts/deploy/auto_broker.py → /usr/local/lib/adilbaga-deploy/auto_broker.py | `2dd252eed4e0c634e908acd33135d61dd02b8d9595911708f459e50efa62406c` /0644 |
| scripts/deploy/auto_smoke.py → /usr/local/lib/adilbaga-deploy/auto_smoke.py | `3f7a22c26d3a73bc32ad78d8aaa26471d30d079f2844498e0705b564f468d0c7` /0644 |

No-clobber/no-follow, protected ancestors, exact owner/mode, atomic creation,
fsync/readback are mandatory. Library parent root0755; STATE
`/var/lib/adilbaga/deploy` and authorizations root0700. Its parent was absent at
preflight; any newly appearing parent must be reconciled, not taken over.
Use a separate non-root deployment account/key, no Owner key or aktau-sync reuse,
no shell/forwarding/PTY/docker group. A separately validated zero-argument sudo
wrapper rule only, env_reset/no SETENV; visudo validation. Do not expand privileges
of the current runtime user. Nothing in this report installs that boundary.

GitHub: existing environment `Production` has a main-only branch policy, but no
required-reviewer rule was returned. Authenticated repository permissions report
push=true, **admin=false**; do not presume admin settings authority. Owner/admin
must verify available reviewer/self-review controls in Settings → Environments →
Production, or explicitly establish supported compensating release controls.
Set only the approved DEPLOY_HOST/DEPLOY_USER/DEPLOY_PORT and dedicated
DEPLOY_SSH_KEY/independently verified DEPLOY_KNOWN_HOSTS in the environment through
private stdin/UI, never in chat/argv/logs. Both environment/repository secret-name
inventories were empty; environment vars and repository vars were empty. Keep
AUTO_DEPLOY_ENABLED absent/false throughout setup and artifact review.

### Independent exact-artifact authorization, not self-approval

Owner/admin independently downloads artifact **12279152952** from the verified
build run and checks the exact producer and tar/binary/layer identities above.
On a trusted workstation, an example exact-ID download is:

```sh
umask 077
gh api repos/kiratonine/AdilBaga/actions/artifacts/12279152952/zip > artifact-original.zip
sha256sum artifact-original.zip
```

Use a new private directory/no overwrite; verify inventory before extraction.
The ZIP hash is **not** the archiveSha256 approval field. Use the image.tar hash
and size above. Admin separately issues the strict v1 record described in
[AUTO_DEPLOY_SETUP](../AUTO_DEPLOY_SETUP.md#strict-approval-schema-v1) under
`/var/lib/adilbaga/deploy/authorizations/b9c7fc90f54699ef7e483ffebd5e0ea8779d3c23.json`.
Use the verified repository/CI/build/attempt/artifact identities, actual Owner
identity and decision, genuine current Unix times/expiry≤24h and a newly issued
authorizationId. Root0600, one regular link, protected parents, bounded strict
JSON, atomic no-clobber install and fsync/readback are required. This agent
**did not issue or install this approval**. Missing independent approval is
BLOCKED_INDEPENDENT_RELEASE_APPROVAL even after host/setup gates are resolved.

Resume this same TASK after host attestation/admin setup and independent record
exist. Recheck main, CI, bytes, rollback, inactive journal/lock and configuration;
only then briefly enable the flag for **one** existing Actions mode=deploy using
SHA b9c7fc90…, CI39450935221 and artifact12279152952. No dispatch was attempted
here. Preserve single-use markers; no retry/cleanup to bypass refusal. If main
has changed, do not reuse this packet silently. Final postflight/Voice/Redis/600s
observation and independent VPS readback remain mandatory. Disable flag after
completion/blocked without cancelling any running worker.

## 5. Actual local checks after merge

RTK wrappers, Node24.10.0 / Go1.27.2, GOTOOLCHAIN=local. All commands below
executed against exact merged main; outcomes are not production acceptance.

| Command / check | Exit / actual result |
| --- | --- |
| PYTHONPATH=scripts/deploy python3 -B -m unittest discover -s scripts/deploy -p 'auto_*_test.py' | 0, **47/47 PASS, 0 SKIP**; local cold HTTP4523ms |
| node --test scripts/deploy/auto-gate.test.mjs scripts/deploy/verify-part15.test.mjs | 0, **95/95 PASS, 0 SKIP** |
| node scripts/deploy/verify-auto-deploy.mjs | 0, static PASS |
| node scripts/deploy/verify-part15.mjs | 0, static PASS |
| node scripts/ci/run-checks.mjs go | 0, gofmt/tidy/module verification, full unit and race, vet, staticcheck default/integration-tag source, govulncheck (no vulnerabilities), API/ingest local builds PASS |
| node scripts/ci/run-checks.mjs ops | 0, **177/177 PASS, 0 SKIP** |
| node scripts/ci/run-checks.mjs security | 0, source/workflow policy and synthetic backup guard PASS |
| node scripts/revalidation/verify-part16.mjs | 0, static PASS, not production C2 |
| Existing verifyCI(), artifactMetadata(), verifyDownloaded() against GitHub metadata/exact download | 0 each, correct current identities/bytes |
| verifyCompatibility(438ecdfa…, b9c7fc90…) with actual Git objects | 0, exact pinned tooling exception PASS |
| Offline tar/config/RootFS/API inspection and main source-vs-GitHub broker hashes | 0, technical verification PASS, no Owner approval inferred |

No new local DB integration run was needed by this execution TASK; fresh hosted
exact-main PostgreSQL Integration and Ephemeral Staging both succeeded. Source
checks do not substitute for production credentials/configuration/peer/smoke.
Final report links, diff-check, exact report-only scope, tracked-byte preservation
and bounded privacy checks are recorded in the final handoff.

Final verification at **15:59:51 UTC /20:59:51 +05**: fresh fetch still reports
HEAD=origin/main=b9c7fc90…; repository variables still empty/flag absent.
`git diff --check` and `git diff --exit-code` exit0. Porcelain scope contains only
this untracked report; all tracked source and historical reports remain unchanged.
Local Markdown target/anchor check passes1/1; bounded private-key, credential-URL,
provider/GitHub-token and secret-assignment patterns find no match. Private
artifact directory0700 and all three files0600 verified; exact tar SHA rechecked.
These checks are bounded validation, not an exhaustive security audit.

## 6. Safety, risk and cross-team status

Production API remains the old438 release at the latest measured checkpoint.
P1 remains open; readiness503 cold-Supabase RCA stays **LIKELY_NOT_PROVEN**.
There is no claim of post-release stability, Gemini success, current snapshot
observation, physical Siri re-test or production C2 PASS. C2/Part31/Part32 were
not activated. Go/Frontend/Backend2/DB/ingestion/Telegram/timers/credentials and
configuration were not modified; no production write or Git publication.

The only GitHub mutation by this execution was the one permitted **build-only**
dispatch; no flag, secret, environment, account or sudo change. Historical reports
remain byte-identical. No new source PR was created. Current API438 image remains
available as the future rollback target; rollback itself was not executed.

Factual handoff for Backend2 (not externally sent): **P1 not deployed; active API
438ecdfa… healthy at15:53:36 UTC. Exact-main b9c7fc90… has CI9/9 and a verified
immutable build. Host attestation, broker/deploy configuration and independent
artifact approval remain gates. Sync/monitor timers were active at preflight;
ingest, C2/Part31/Part32 and your configuration were not changed.**

STOP at the concrete administrative trust gates above; continue this same TASK
after their genuine fulfillment, without another general deployment-permission
request.

## 7. Continuation after Owner host-key confirmation

### 7.1 Current result and phase ledger

**P1_BLOCKED_INDEPENDENT_RELEASE_APPROVAL. Production P1 NOT DEPLOYED.**
Owner explicitly confirmed that the provider console's ED25519 fingerprint
matches `SHA256:rPis6wSdpRUo1o1hTpzb6L0Ldzo5t88BJFOCxtD/Wtc`. This resolves
the earlier out-of-band host-key gate, not the independent image authorization.
Subsequent SSH sessions explicitly select ssh-ed25519 and retain strict host
checking. No fresh keyscan, new authentication flow or generic consent request.

Fresh fetch still gave exact main/HEAD
`b9c7fc90f54699ef7e483ffebd5e0ea8779d3c23`. Existing verifyCI() revalidated
CI39450935221 attempt1/current workflow/exact nine jobs as ELIGIBLE. Existing
artifactMetadata()/verifyDownloaded() revalidated original artifact12279152952
and unchanged saved bytes. **No second build, deploy dispatch or retry.**

| UTC / UTC+05 on 2026-10-20 | Operation / observer | Actual result |
| --- | --- | --- |
| 16:18:38.103392 /21:18:38.103392 | Root read-only fixed preflight | PASS: expected438 active, hardening, rollback, source compose, parent ownership/modes/inodes/ACL, visudo and timers; live20015ms, ready200253ms. |
| Between preflight and16:22:31 /21:22:31 | Approved root broker setup | Four new directories and three exact reviewed files installed atomically/no-clobber; no approval, Docker or service write. |
| 16:22:31.916048 /21:22:31.916048 | Independent root readback after principal checkpoint | Broker hashes/modes/ownership/link count PASS. New995/985 account locked, sole primary group, no sudo grants; home/key/sudoers still absent. |
| 16:23:29.434471 /21:23:29.434471 | Completion from verified own partial account | Restricted principal installed; visudo PASS, sole zero-argument wrapper grant, unrelated commands/extra arguments rejected. No second useradd. |
| After principal setup | Actual restricted-key SSH using existing sshOptions() and exact broker status protocol | PASS: active438 and available=true; no submit/archive/load. This also executed installed broker preflight/runtime identity/peer checks without exposing runtime env. |
| After restricted status | Approved GitHub environment configuration via private stdin | Three variables and two secrets created successfully; metadata presence independently re-read. Flag remains absent. |
| 16:27:09.736498 /21:27:09.736498 | Separate root read-only post-setup | All broker files/forced key/sudoers/modes PASS; no approval or release journal; old API healthy/restarts0/OOM=false; compose unchanged; all four service/timer projections still active; live20012ms, ready200313ms. |

### 7.2 Exact VPS changes and custody

Created only these approved deployment resources:

- `/usr/local/lib/adilbaga-deploy` root:root0755; broker and smoke root:root0644.
- `/usr/local/sbin/adilbaga-deploy` root:root0755, zero-argument reviewed wrapper.
- `/var/lib/adilbaga` root:root0755, previously absent; deploy and authorizations
  children root:root0700. No existing parent was taken over.
- Dedicated account/group **adilbaga-deploy**, UID995/GID985, password locked,
  no supplementary groups; not the pre-existing deploy/Owner account or aktau-sync.
- New root:root0755 `/home/adilbaga-deploy` and `.ssh`; root:root0644
  authorized_keys containing only the new dedicated public key with **restrict**
  and forced `/usr/bin/sudo -n /usr/local/sbin/adilbaga-deploy` command. Root owns
  the home/key so this user cannot replace the forced command or add keys.
- `/etc/sudoers.d/adilbaga-deploy` root:root0440. env_reset, !setenv and only
  NOPASSWD/NOSETENV for the fixed root wrapper with the sudoers empty argument
  specification. No grant to the existing Owner/runtime account was added.

The three installed code SHA256 values **exactly match section4 and fresh
GitHub contents at merged main**. Independent post-read used O_NOFOLLOW,
regular-file/root:root/exact mode/one-link checks; all code hashes match. All new
directory modes/owners were verified without access/default POSIX ACLs. Parent
root custody and preflight dev/inode identities were pinned before writes.
Writes used held directory descriptors, exclusive temporary creation, complete
bytes/mode/fsync before no-clobber hardlink publication, then directory fsync and
one-link readback. Unknown targets would block, not overwrite. No production
source or runtime env/compose was edited.

**Operator checkpoint, not a suppressed failure:** first principal setup created
the account and stopped before home/key/sudoers because it incorrectly expected
`sudo -l -U` to return1 for a disallowed user. Root's actual invocation returned0
while saying not allowed with zero grants. Read-only reconciliation independently
confirmed UID995/GID985, locked password, sole group985, zero grants and absent
remaining targets. The temporary operator-only check was corrected to require
explicit disallow text plus zero grants, allowing the two valid diagnostic exit
conventions. Four synthetic positive/negative tests passed. Completion rechecked
that exact newly-created account and absent targets; **useradd and successful
writes were not retried, overwritten, rolled back or deleted**. No failed file
write or unknown partial target was bypassed. The initial inline preflight also
had a temporary syntax error before operations; it was replaced with a locally
compiled collector, not treated as a server fault.

### 7.3 Dedicated key and GitHub configuration

A new dedicated ED25519 key was generated outside Git in a private Owner-local
0700 directory, private key0600. No existing private key was read/reused. The
GitHub encrypted secret was populated through private stdin, never argv/output.
Local source is `/home/denis/tmp/aktau-p1-release-operator-EkAGNnFb/deploy_identity`;
retain it privately for Owner custody/revocation, not a review/source archive.
Its known_hosts file was built from the existing exact ED25519 key independently
confirmed by Owner; no host/IP/key line is included here.

In environment **Production** these names now exist:

```text
variables: DEPLOY_HOST, DEPLOY_USER, DEPLOY_PORT
secrets:   DEPLOY_SSH_KEY, DEPLOY_KNOWN_HOSTS
```

Values were neither logged nor copied into this report. Host/port came from the
approved SSH profile, not a guessed server; user is the new restricted principal.
Presence inventories were empty before creation; no previous setting or secret
was overwritten. All five API operations returned exit0; post-inventory matches.
Actual successful variable/secret operations demonstrate those narrow rights,
**not broader Environment-administration rights**. Main branch policy remains;
required-reviewer protection is still not evidenced/configured by this task.
Repository metadata reports admin=false. Owner must configure supported required
reviewer/prevent-self-review controls in Settings → Environments → Production,
or explicitly establish the compensating Owner controls allowed by the TASK.
Do not infer this decision from the general deployment authorization.

**AUTO_DEPLOY_ENABLED remains absent; no flag enablement, rollout or workflow
dispatch occurred during this continuation.** Original build/artifact from
section3 remains the only release candidate.

### 7.4 Exact next Owner action — independent record, not another general consent

1. Independently inspect [build39452595506](https://github.com/kiratonine/AdilBaga/actions/runs/39452595506)
   and [main CI39450935221](https://github.com/kiratonine/AdilBaga/actions/runs/39450935221),
   source SHA, attempts, numeric artifact12279152952 and the image.tar/binary/layer
   identity in section3. Download the original artifact by ID to your own trusted
   private workstation context; do not rely solely on this agent's checksum claim.
2. Through your **independent administrative procedure**, issue/install the strict
   v1 release record at
   `/var/lib/adilbaga/deploy/authorizations/b9c7fc90f54699ef7e483ffebd5e0ea8779d3c23.json`.
   The directory now exists and is root0700. Exact factual record fields are:

| Record field | Required value |
| --- | --- |
| schemaVersion | integer1 |
| repository / environment | kiratonine/AdilBaga / production |
| releaseSha | b9c7fc90f54699ef7e483ffebd5e0ea8779d3c23 |
| ciWorkflow / ciRunId / ciAttempt | .github/workflows/ci.yml /39450935221 /1 |
| buildWorkflow / buildRunId / buildAttempt | .github/workflows/deploy-production.yml /39452595506 /1 |
| artifactIdentity.id | integer12279152952 |
| artifactIdentity.name | adilbaga-api-b9c7fc90f54699ef7e483ffebd5e0ea8779d3c23-39452595506-1 |
| archiveSha256 | 240ef303650dc79709930a31434906cfa6145a26e97d862100b0320b84333e98 |
| archiveSize | integer21974016 |
| approved | true **only following your independent artifact review/decision** |
| approvedBy | owner: followed by your actual safe audit handle; not invented by this agent |
| approvedAt / expiresAt | Real Unix seconds at your issuance; now within interval, validity≤86400s |
| authorizationId | New lowercase32hex issued by your independent admin procedure |

   Root0600, one regular link, no-follow/protected ancestors, strict keys/types,
   atomic no-clobber creation, file and directory fsync/readback are mandatory.
   Do not overwrite an existing record or erase any used marker. See the existing
   [approval procedure](../AUTO_DEPLOY_SETUP.md#variant-a-independent-approval-of-one-exact-saved-archive).
   **No approval JSON, nonce, fake authorizer or approval=true record has been
   generated by this agent.** The present root directory is empty.
3. Establish the Environment reviewer/compensating control noted above. Keep the
   flag off. Return only that the genuine record/control exists, not JSON or keys.

After these concrete gates, resume this same TASK: fresh main/CI/artifact/record
and rollback/state check, one existing Actions mode=deploy for the exact IDs,
bounded broker compensation/600s observation, independent VPS and public
application/Voice/owned-session postflight, then flag disabled again. No new
generic release consent, build or artificial snapshot is requested.

### 7.5 Verification and current safety conclusion

- Local operator atomic-write tests **3/3 PASS**: exact bytes/mode, no clobber of
  an existing regular target, no symlink-target replacement. UID ownership was
  explicitly mocked only in the local sandbox; real root custody was read back.
- Temporary sudo-policy regressions **4/4 PASS**: both valid no-grant exit
  conventions, explicit broad grant rejected, empty/ambiguous output rejected.
- Temporary operator Python source compiled locally before execution. These are
  operator scripts outside Git, not source changes or a replacement deployment
  runner. All source/runtime files remain at exact reviewed main.
- Existing full post-merge checks in section5 remain actual previous PASS on
  unchanged bytes; they were not relabeled as newly rerun. Fresh source/artifact
  gate and real restricted broker status passed in this continuation.
- Separate post-setup readback confirms no release journal/lock/archive/used
  marker created: STATE has only its authorizations directory, with0 entries.
  Root approval is absent. API still438 healthy/restart0/OOM=false; compose and
  cloudflared/daily/full/monitor projections unchanged. No deploy or rollback.
- Continuation used **8 SSH sessions**, including the locally faulty initial
  collector and the principal-check checkpoint; all bounded/strict. There were
  **4 explicitly counted loopback health GETs**, plus the installed broker's
  bounded readiness polling during its single status call. That protocol does
  not return its exact probe count, so a fabricated exact grand total is not
  claimed. Previous checkpoint counted2 GETs. No public production GET/HEAD,
  Voice POST, Redis/SQL, snapshot, HMAC event or service operation was performed.
- Production writes were confined to the approved new broker/account/key/sudo
  namespace; GitHub writes to the five approved deployment settings. No C2,
  Backend2/ingest, existing account privileges, DB, Frontend, monitor, Cloudflare
  configuration, timer, Go image or release reference was modified.

Updated factual Backend2 handoff (not externally sent): **API438ecdfa… remains
healthy at16:27:09 UTC; exact-main b9c7fc90… is built/CI-green but NOT DEPLOYED.
Broker/transport setup now passes. Independent artifact approval and Environment
release controls are pending. Sync/monitor timers stayed active; ingest/C2 and
your setup were not changed.**

### 7.6 Owner-only console procedure — NOT EXECUTED by this agent

After your independent artifact verification in7.4, the following is a concrete
root-console installation procedure. **It deliberately stops until you replace
OWNER_HANDLE with your real audit handle and set REVIEW_CONFIRMED to True based
on your independent review.** These are not instructions to approve without
review. Execute through your independent administrator/provider console, not
the restricted deployment identity. Do not send the resulting JSON here.
Actual time and authorizationId are issued by your process at execution, not
invented by this report. Existing targets are never overwritten; any failure
requires preserving state and manual reconciliation, not rerunning blindly.

```sh
sudo /usr/bin/python3 -I -B - <<'PY'
import hashlib, json, os, re, secrets, sys, time
from pathlib import Path

OWNER_HANDLE = None
REVIEW_CONFIRMED = False
assert REVIEW_CONFIRMED is True
assert isinstance(OWNER_HANDLE, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,64}', OWNER_HANDLE)
assert os.geteuid() == 0
library = Path('/usr/local/lib/adilbaga-deploy')
fd = os.open(library / 'auto_broker.py', os.O_RDONLY | os.O_NOFOLLOW)
with os.fdopen(fd, 'rb') as source:
    raw = source.read(65537)
assert hashlib.sha256(raw).hexdigest() == '2dd252eed4e0c634e908acd33135d61dd02b8d9595911708f459e50efa62406c'
sys.path.insert(0, str(library))
import auto_broker as broker

sha = 'b9c7fc90f54699ef7e483ffebd5e0ea8779d3c23'
p = dict(repository='kiratonine/AdilBaga', ciWorkflow='.github/workflows/ci.yml',
         ciRunId=39450935221, ciAttempt=1,
         buildWorkflow='.github/workflows/deploy-production.yml',
         buildRunId=39452595506, buildAttempt=1,
         artifactIdentity=dict(id=12279152952,
             name='adilbaga-api-' + sha + '-39452595506-1'))
m = dict(sha=sha, revision=sha, os='linux', arch='amd64', user='10001:10001',
         entrypoint=['/usr/local/bin/api'],
         rootfs=['sha256:74d97c428c51a828f9051a7a40a53ff1fc99e54fc30323ce36760701b0b7f711',
                 'sha256:f99ba4a2dc870a09735e9d9802a44095c685c261cfb6d0036ae54a85b2092f25',
                 'sha256:6add3701e8d1dad0d9213623167400e87dee5d44b379148ec8985d9bbdadd124'],
         binary='c1a18d1ade799b2921ef057ab30f524f9c4f3b8d71a091d13c62b5e44a4eac4b',
         archive='240ef303650dc79709930a31434906cfa6145a26e97d862100b0320b84333e98',
         size=21974016, provenance=p)
broker.validate_manifest(m)
now = int(time.time())
a = dict(schemaVersion=1, environment='production', releaseSha=sha,
         archiveSha256=m['archive'], archiveSize=m['size'], approved=True,
         approvedBy='owner:' + OWNER_HANDLE, approvedAt=now, expiresAt=now + 3600,
         authorizationId=secrets.token_hex(16), **p)
data = json.dumps(a, separators=(',', ':')).encode()
assert len(data) <= 16384
target = broker.STATE / 'authorizations' / (sha + '.json')
with broker.root_parent(target) as parent:
    try:
        os.stat(target.name, dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError:
        pass
    else:
        raise RuntimeError('record_exists_STOP_no_overwrite')
    temporary = '.owner-approval-' + secrets.token_hex(16) + '.pending'
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                 0o600, dir_fd=parent)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    os.link(temporary, target.name, src_dir_fd=parent, dst_dir_fd=parent,
            follow_symlinks=False)
    os.fsync(parent)
    os.unlink(temporary, dir_fd=parent)
    os.fsync(parent)
assert broker.authorization(m)[0] == data
print('ROOT_RECORD_CREATED_AND_VALIDATED; NO_DEPLOYMENT')
PY
```

This procedure installs only the independently issued record. It does not
download/approve an artifact by itself, enable the flag, invoke broker submit,
load Docker, change release.env or start any service. This agent performed syntax
validation only; the console command and its approval branch were **NOT RUN**.
The Environment protection/control decision in7.4 is separately still required.

## 8. Independent approval and Environment recheck — 2026-10-20

**P1_BLOCKED_PRODUCTION_ENVIRONMENT_CONTROLS. NOT DEPLOYED.** The latest Owner
message both reports completed administrative gates and includes a caution not
to assume completion before the real action. Accordingly neither gate was
presumed: only bounded read-only checks were performed before any activation.

| UTC / UTC+05 | Gate / direct evidence | Actual result |
| --- | --- | --- |
| Fresh fetch before VPS inspection | HEAD=origin/main=`b9c7fc90f54699ef7e483ffebd5e0ea8779d3c23`; report remains the sole untracked path; tracked source unchanged | PASS source identity, no drift |
| 16:45:55.975541 /21:45:55.975541 | One strict ED25519-pinned Owner-profile SSH, root read-only checker; all three broker file hashes/modes/root ownership/one link verified; existing broker.authorization() used unchanged | PASS code/custody checks |
| Same checkpoint | Exact root record exists; existing authorization validator checks strict schema, protected no-follow root parent/file, matching SHA/CI/build/attempt/artifact ID/name and exact tar hash/size | **APPROVAL_PASS**; no JSON/authorizer/nonce exposed |
| Same checkpoint | Remaining lifetime **3519 seconds**; corresponding single-use marker absent | Valid and unused at checkpoint, not a promise of later validity |
| Immediately after SSH | GitHub GET environments/Production | Rules contain **branch_policy only**; no required_reviewers rule; `can_admins_bypass=true`; no prevent-self-review evidence |
| Same metadata collection | GitHub GET environment deployment-branch-policies | Exactly main branch policy; no broad branch eligibility |
| Same metadata collection | GitHub GET repository Actions variables | **AUTO_DEPLOY_ENABLED absent**; left unchanged |

The record was installed by the independent Owner/admin, not generated,
repaired, renewed or replaced by this agent. Validation read it in memory through
the existing reviewed broker; it did not consume approval, invoke submit, run
readiness/application smoke or touch Docker. No approval/used marker was written
or deleted. A genuine approval now resolves the earlier primary blocker; that
historical BLOCKED remains preserved in sections1–7.

**Why STOP:** the main-only Environment restriction is directly verified, but
required reviewer / prevent-self-review / no-admin-bypass protections are not.
The broad statement that controls were checked does not identify an independently
approved compensating control for the returned configuration. The TASK permits
compensation if native protections are insufficient, but forbids assuming that
decision or enabling the flag without it. This is a missing release-control
decision/evidence, not proof of an unsupported GitHub plan or a production defect.
No GitHub authentication or permission workaround was attempted.

### Exact remaining Owner action

In repository Settings → Environments → **Production**, configure a required
independent Owner reviewer, prevent self-review and disable admin bypass where
supported; preserve the existing main-only policy. Return confirmation for
read-only API verification. If those features cannot be used, explicitly approve
the **specific compensating arrangement** allowed by this TASK: independently
reviewed single-use root artifact authorization plus this one controlled manual
deploy, fixed main/exact CI/artifact, remote broker interlock, short-lived
activation flag and no competing release. Feature availability/compensation must
not be inferred from this report. This is not a repeat request for general
deployment consent.

Do not regenerate the current approval merely for this check. It was valid for
3519 seconds at the recorded checkpoint; revalidate immediately before the
controlled release. If it actually expires, only the independent admin may issue
a fresh decision/record through the existing procedure; no automatic renewal,
overwrite, reused nonce or removal of used markers is authorized.

### Execution and safety ledger for this continuation

- **1 SSH session**, remote root-side TERM/KILL30s, local45s, no retries; stdout
  only sanitized JSON. Three GitHub release-control/flag metadata reads followed.
- **0 production API GET/HEAD/POST, 0 SQL/Redis**, no install, credentials/settings
  change, workflow dispatch, flag write, Docker load/cutover, rollback or service
  operation. No C2/ingestion/sync/monitor action.
- On the failed Environment gate, broader active/rollback/journal and fresh
  CI/artifact pre-deploy checks and all postflight/600s observation were **NOT
  RUN**. Existing earlier source CI/build/health evidence is historical, not a
  new production observation. Latest independently observed active image remains
  the section7 checkpoint438ecdfa…; this continuation makes no fresh health claim.
- Existing source/tests were not changed or rerun solely for this administrative
  check. Only this report is updated. No commit/push/PR or merge.

Resume the same TASK after the concrete control gate is resolved: revalidate all
pre-deploy gates, then at most one Actions deploy of existing artifact12279152952
without rebuild, with full broker/public smoke/observation and independent
readback. **No DEPLOYED claim is made.**

## 9. Owner-approved compensating controls and single deploy execution

2026-10-20. Owner explicitly accepts, **for this one release only**, the missing
GitHub required-reviewer protection and existing **can_admins_bypass=true** as a
known residual risk under this exact compensating arrangement: independently
verified single-use root approval; main-only; exact main CI9/9; immutable
artifact12279152952; restricted reviewed broker; one manual deploy without a
competing release; temporary AUTO_DEPLOY_ENABLED activation. This is a real
Owner decision, not an inferred plan limitation, permanent waiver or approval
for later releases. Section8's administrative STOP is superseded by this decision,
not erased. No Environment protection setting is changed to implement the waiver.

At this entry's creation, **NOT DEPLOYED / PRE_DEPLOY_GATES_PENDING**. Only after
all fresh technical gates pass may one existing workflow_dispatch mode=deploy be
issued. Existing approval must be revalidated/unused and must not be recreated;
any failure stops without replay or manual Docker deployment. Actual gate,
dispatch, broker, observation and independent readback results follow below.

### 9.1 Fresh admission and single dispatch

| UTC / UTC+05 on 2026-10-20 | Gate / operation | Result |
| --- | --- | --- |
| Before flag activation | Fresh main/CI/artifact API plus unchanged local bytes | Exact b9c7fc90…, CI39450935221 attempt1 nine SUCCESS jobs, producer/artifact12279152952/tar21974016/SHA240ef303… PASS via existing validators; source-pinned compatibility PASS. |
| Same metadata admission | Deployment workflow inventory / Environment / settings / flag | 0 noncompleted deployment runs; main-only and five required setting names present; reviewer absent/admin bypass true under explicit one-release Owner compensation; flag absent. |
| 16:54:21.076275 /21:54:21.076275 | Independent read-only VPS admission through unchanged installed broker library | All three installed hashes/root modes/one-link checks PASS; authorization strict schema/exact artifact PASS; unused, **3014s** remaining after checks. |
| Same VPS admission | STATE, lock, competing process, rollback, host | No journal/archive/orphan; any existing lock obtainable without creation; no broker worker; active438 and retained rollback image PASS; existing Host.preflight() validates actual private runtime identity/compose/peer/hardening. One measured ready GET PASS333ms. Cloudflared/daily/full/monitor states active/success. |
| 16:54:43.708396 /21:54:43.708396 | Repository AUTO_DEPLOY_ENABLED=true | exit0; API readback literaltrue before dispatch. No Environment/security setting weakened. |
| 16:54:44.297011 /21:54:44.297011 | **One** existing workflow_dispatch mode=deploy | exit0, exact SHA b9c7fc90…, CI39450935221, immutable artifact12279152952; no rebuild/retry. |
| Created16:54:47 /21:54:47 | [Deploy run39461571578](https://github.com/kiratonine/AdilBaga/actions/runs/39461571578), exact main | Initially in_progress, not success/deployment proof. Final outcome follows below. |

Owner coordination confirms no competing release for this attempt. GitHub active
run inventory and VPS source/journal/process/lock checks corroborate their bounded
observed scopes; no claim of universal exclusion of an arbitrary bypassing admin.
The broker's remote flock and independent single-use approval remain mandatory.
No manual Docker command, release write, ingest/sync/C2 or DB action was used to
start this release. Preflight observer only measured the existing ready helper;
no validation/security semantics or installed file was modified.

### 9.2 Final attempt outcome — FAIL before transport/cutover

**P1_BLOCKED_ACTIONS_READ_ONLY_PLAN. NOT DEPLOYED; NOT ROLLED BACK.**
Exactly one authorized deploy workflow was dispatched. It completed **FAILURE**;
no retry/rerun, alternative deploy, manual Docker load or broker bypass followed.
The failure occurred before broker submit, not during a new API's readiness or
Voice execution. The old API was never replaced by this attempt.

| UTC / UTC+05 on 2026-10-20 | Direct evidence | Result |
| --- | --- | --- |
| 16:54:47–16:55:43 /21:54:47–21:55:43 | [Run39461571578](https://github.com/kiratonine/AdilBaga/actions/runs/39461571578), attempt1, exact b9c7fc90… | **completed/failure** |
| Completed16:55:09 /21:55:09 | Deployment offline checks, job118762095739 | SUCCESS; all its deployment test/static steps succeeded |
| Completed16:55:24 /21:55:24 | gate, job118762255822 | SUCCESS |
| 16:55:37–16:55:38 /21:55:37–21:55:38 | rollout job118762385811: verify immutable producer identity | SUCCESS |
| 16:55:38–16:55:39 /21:55:38–21:55:39 | Download original immutable artifact | SUCCESS |
| 16:55:39 /21:55:39 | Verify exact saved bytes, never rebuild/resave | SUCCESS |
| **16:55:39–16:55:41 /21:55:39–21:55:41** | **Read-only release plan for already-approved archived bytes** | **FAILURE**, safe marker BLOCKED_TRANSPORT_OR_ROLLOUT; no PLAN_VERIFIED |
| 16:55:41 /21:55:41 | Approved broker transport and bounded rollout | **SKIPPED**, not PASS; no submit/cutover from this workflow |
| Same run | build_only | SKIPPED as expected in deploy mode; no second build |
| **16:56:47.712375 /21:56:47.712375** | Repository flag setfalse, then API readback | **exit0; AUTO_DEPLOY_ENABLED=false independently verified**. Completed run was not cancelled. |
| **16:57:45.145191 /21:57:45.145191** | Independent bounded root readback, not a second deployment | Old API438/hardening/runtime identity/rollback all PASS; ready200271ms through existing helper; cloudflared/daily/full/monitor active/success |
| Same root readback | Strict independent approval and STATE reconciliation | Approval still valid/unused, **2810s** remaining; no release journal, archive/orphan or competing broker worker; remote lock available |
| 16:59:20.127437 /21:59:20.127437 | Bounded authentication metadata reconciliation for16:55:35–16:55:43 UTC | Queried ssh.service and sudo journals return0 records in this narrow window; no raw logs/addresses/keys emitted. Absence is not proof that SSH was never attempted or why it failed. |

**600s observation: NOT_RUN. Public API/Voice/Redis smoke: NOT_RUN. Owned test
sessions: none created by this attempt; cleanup NOT_APPLICABLE. Rollback:
NOT_RUN, not a successful compensation claim.** A failed planning gate is STOP;
there is no new release for which post-cutover acceptance could be truthfully
claimed. Sending Voice/Redis mutations or running an unrelated live test would
not turn this attempt into a deployment. Source-defined local/public smoke and
600s broker observation were never reached because transport was skipped.

### 9.3 Failure localization, uncertainty and safe next step

Failed-step logs were read privately through gh and reduced only to finite safe
markers/booleans. **Only BLOCKED_TRANSPORT_OR_ROLLOUT was observed**; no exposed
SSH/broker/assertion stage or cause. Log projection confirms all nine expected
step env names are nonempty, including both SSH secrets, but does not establish
their decoded runner values or successful SSH usage. No values, key lines,
provider payload, private host/IP or raw logs were copied here.

Actual local Git confirms active438 is an ancestor of main and the existing
compatibility validator passed on real objects before dispatch. These facts
do not prove which operation in Actions failed. The two-second step duration
and absence of queried auth journal records are **not** a proven network,
credential, host-key, Git-object, CI or broker RCA. The current transport's
top-level catch deliberately reduces errors to the same safe fixed string;
this is an observability limitation, not authorization to guess or weaken guards.

**Reconciliation completed only to the following proven extent:** workflow
finished before transport; independent STATE is clean with no worker/archive or
receipt; approval unused; old438 image/ref and retained rollback healthy; timers
unchanged; flagfalse. Do not erase/recreate approval or use this reconciliation
as permission for an automatic second dispatch. This Owner authorization was
limited to **one** attempt and has been spent at the workflow level, although
artifact-load authorization remains unconsumed at the broker.

Next safe action is a separately scoped privacy-safe diagnosis of the existing
read-only planning boundary, using current source/offline fixtures and exact
recorded runner evidence. If needed, propose fixed stage/error classes and tests
for transport diagnostics without printing private stderr/values; do not apply
unreviewed code to a privileged release or rerun solely to expose secrets. Any
identified source/configuration correction must preserve independent artifact
authorization, SSH verification, exact CI/source/artifact, compatibility and
rollback gates. A later retry requires explicit reconciliation/retry decision,
fresh gate/expiry checks and no blind reuse of expired authorization. No new
build is claimed necessary until the concrete cause/correction is established.

Cold-Supabase RCA remains LIKELY_NOT_PROVEN; this planning failure is not evidence
about the readiness mitigation's production behavior. P1 is still open.

### 9.4 Safety and handoff

- This section's execution used **3 bounded SSH sessions**: pre-deploy admission,
  independent post-failure readback and narrow auth-metadata reconciliation.
  The first two reused the reviewed broker's preflight in a read-only operator
  invocation, each with exactly **1** measured readiness GET. The third made no
  HTTP request. No public production GET/HEAD/POST or SQL/Redis by this operator.
  Any unsuccessful planning SSH status attempt in Actions is not counted as a
  proven additional health request; its inner progress was not observable.
- One flag activation, one dispatch, one flag disable; no rerun/cancel/rebuild.
  No root approval created/renewed/consumed/deleted. No source, API, DB, Frontend,
  ingestion, sync, C2, Cloudflare/Telegram setting or service/timer mutation.
- Independent readback is proof of **old438 still active**, not P1_DEPLOYED,
  POSTFLIGHT_PASS or ROLLED_BACK. No claim of600s observation, public Voice/Redis
  success, provider success, zero future503 or physical Siri re-test.
- No commit/push/PR/merge. Only the same report is updated; historical sections
  and tracked source remain preserved. Owner's compensating decision is recorded
  with its one-release limit, not converted to permanent admin-bypass acceptance.

Factual Backend2 handoff (not externally sent): **One P1 Actions attempt failed
in read-only planning before submit. At16:57:45 UTC, active API remained438ecdfa…
healthy; rollback retained; sync/full/monitor timers and cloudflared active.
AUTO_DEPLOY_ENABLED=false, no rollout/rollback, ingestion/DB/C2 untouched. P1
remains NOT DEPLOYED pending planning-failure diagnosis and a reviewed retry
decision.** STOP, no second deploy.

## 10. Actions planning diagnosis and configuration-only recovery — 2026-10-20

**CONFIGURATION_CORRECTED — P1_BLOCKED_AWAITING_SPECIFIC_RETRY_DECISION.
NOT DEPLOYED.** One concrete, deterministically reproduced SSH-input blocker was
found in the actual secret-upload chain and corrected without source changes.
No additional deploy/rerun, build or activation flag change was made. The previous
one-attempt decision remains spent; the packet below is a proposal, not permission
to execute. Sections1–9 are preserved byte-for-byte, including historical failures.

### 10.1 Source, historical job and unchanged admission

The full recovery TASK and root rules, current deploy source/tests/workflow,
approval setup and rollback/API-down runbooks were read. Fresh origin/main and
existing audit HEAD remain **b9c7fc90f54699ef7e483ffebd5e0ea8779d3c23**. No tracked
source was edited. Historical runbook release labels were not used as live state.

Independent GitHub reads again confirm run39461571578 attempt1, workflow_dispatch,
exact source and completed failure. Job118762385811 again reports producer,
download and saved-byte checks SUCCESS; read-only plan failed at
**16:55:39–16:55:41 UTC**, subsequent transport SKIPPED. Privately projected logs
still contain only BLOCKED_TRANSPORT_OR_ROLLOUT, not the underlying exception.
Nonsecret logged plan inputs match the approved values: host/port/principal,
DEPLOY_PHASE=plan, DEPLOY_MODE=deploy, flagtrue at that historical attempt, source
and CI run. Values of private settings were compared in memory, not disclosed.
Secret names were populated; that fact alone was not treated as valid key bytes.

Current CI39450935221 attempt1/exact9 jobs again passes existing verifyCI(),
artifact12279152952 producer and saved bytes again pass existing validators,
and verifyCompatibility(active438,main) passes with **real Git objects**.
Active438 is an ancestor of main; the workflow's full-history checkout is
sufficient for these objects under normal fetch semantics. No extra Git-object
fetch, changed compatibility policy or contracts exclusion was introduced.

### 10.2 Confirmed configuration defect and causal evidence

**Confirmed blocker: the original CLI stdin upload removed the final LF from the
OpenSSH private key; transport writes secret bytes verbatim, yielding a key the
OpenSSH parser rejects.** This is an independently reproduced serialization
failure, not a guess based on absent SSH journal entries.

1. The actual original upload in section7 used installed **gh2.45.0** with
   piped stdin, not an argv body. Its noninteractive getBody() explicitly returns
   `bytes.TrimRight(body, "\r\n")`; see the
   [official versioned CLI source](https://github.com/cli/cli/blob/v2.45.0/pkg/cmd/secret/set/set.go#L376-L396).
2. This behavior was also tested against the **installed binary**, not merely
   inferred from upstream: three synthetic LF/CRLF/multiple-LF inputs through
   `gh secret set ... --no-store` produced sealed-box lengths equal to the
   trimmed payload plus48, not the supplied payload plus48. Only synthetic
   input was used; --no-store performed **no secret update**. No ciphertext or
   private-key length/hash/value was printed. Final name inventory confirms no
   synthetic secret was created.
3. Secret metadata showed its last update **16:24:41 UTC**, matching this task's
   original upload, unchanged before repair. Host/user/port variable values match
   the trusted local profile; scope is the existing Production environment.
4. On newly generated **synthetic offline-only** ED25519 keys, original bytes
   parse with exit0; precisely the CLI trim transformation yields exit255 with
   the finite **libcrypto rejection** class; restoring the final LF parses with
   exit0. No private key or public-key body was emitted.
5. The unchanged real auto-transport entrypoint was then exercised with synthetic
   CI/artifact/SSH, real local Git history and the real OpenSSH key parser:
   original input → PLAN_VERIFIED; CLI-trimmed input → exactly the historical
   BLOCKED_TRANSPORT_OR_ROLLOUT/exit1; preserved-final-LF input → PLAN_VERIFIED.
   Each case reached exactly one mocked status operation, **0 real SSH, 0 submit**.
   The failing case left the pre-existing GITHUB_OUTPUT sentinel unchanged and
   exposed neither parser stderr nor key material. This reproduces the entire
   planner path, rather than only a regex or key parser in isolation.

This proves a blocking defect in the known uploaded representation and explains
the observed outward planner failure through that input chain. **The historical
Actions process's raw exception/decrypted secret was not retrieved**; the generic
catch means its actual first thrown exception is not independently visible.
Do not claim that every possible additional runner problem has thereby been
excluded. In particular, the absent auth journal was not used as proof of the
phase. A new live runner result still requires the reviewed retry below.

### 10.3 Proven configuration-only repair — one existing secret

At **17:19:44.164181 UTC /22:19:44.164181 +05**, only existing environment
**DEPLOY_SSH_KEY** was updated through the approved GitHub REST encrypted-secret
endpoint; exit0, metadata updated_at **17:19:45 UTC**. The existing dedicated key
was retained, not regenerated; VPS authorized_keys, accounts, sudoers and broker
were not changed.

The repair used the existing private Owner-local key and GitHub public encryption
key, existing system libsodium sealed-box API and a JSON request through private
stdin. It **preserves the original complete bytes/final LF** and avoids the
CLI getBody() trim. No new dependency was installed, no plaintext secret was
passed in argv/logs/report, and no secret value was retrieved from GitHub. Before
updating, the script required the expected old metadata timestamp to reject
unrelated concurrent secret changes; afterward it checked new metadata and
flagfalse. The encrypted API operation did not modify any other setting.

Three independent synthetic sealed-box encrypt/decrypt round trips verified
byte preservation, including multiline/final LF inputs. The configured host/port
and both original and CLI-trimmed known_hosts representations passed exact-host
lookup offline; **known_hosts did not require correction**. Its secret was not
rewritten. No ssh-keyscan or host-key/authentication relaxation was used.

Actual dedicated-key **operation:status** then passed using existing sshOptions(),
the actual Environment host/port mapping, the exact corrected key bytes and the
reconstructed effective known_hosts bytes. The client used strict host checking,
the Owner-attested ED25519 key, no agent/forwarding/interactive fallback and a
clean client configuration comparable to the runner. It returned old438 and
available=true; no submit. This proves the repaired material/mapping works through
the restricted forced-command/zero-arg sudo/login-shell/broker boundary from the
approved operator. It is **not** a claim that a new Actions runner has already
decrypted/used the corrected secret; no diagnostic deploy was dispatched.

No source correction was necessary for this proven configuration defect. No
source branch/Draft PR, new build or source archive was created merely to report
it. The old immutable Docker artifact remains unchanged and is not relabeled.

### 10.4 All pre-submit failure sites — evidence versus remaining uncertainty

| Site in actual call order | Diagnosis / bounded evidence |
| --- | --- |
| manualRelease / SHA inputs | Historical mode/flag/SHA/CI input projections match; dispatch was main. No bypass. Synthetic full-entrypoint admission passes. |
| CI check | Preceding hosted gate SUCCESS; current exact-main/current-attempt9/9 validates again. A generic historical catch alone is not a recorded CI substage. |
| Artifact path/manifest | Historical producer/download/byte steps SUCCESS; current validators pass; synthetic runner uses the exact fixed path protocol. No archive rewrite. |
| SSH config / material | Exact mapping/known_hosts coverage PASS; final-LF loss in original key upload is the **confirmed blocking defect**; repaired byte-preserving upload. |
| SSH transport/auth/host verification | Key parser before/after reproduced; real repaired dedicated status PASS. Historical remote/network/error text is not exposed, so no separate network/RCA claim. |
| Remote status JSON | Real repaired status valid/expected; no new submit, shell command or public endpoint. |
| Git compatibility | Real old/main objects and all pinned checks PASS; active is a main ancestor. No global contracts override. |
| Runtime Git diff | The existing real full-plan fixture traverses actual readonly Git diff and returns PLAN_VERIFIED with corrected key representation. No runtime/source change. |
| GITHUB_OUTPUT | Original/corrected fixture writes only changed=true; bad-key fixture leaves its sentinel unchanged. Historical raw output-file error is not separately observable. |

Privacy-safe fixed stage diagnostics remain a compatible future improvement if a
further runner-specific error occurs, not an unreviewed change made to the
current privileged release. The general catch was not weakened or altered.

### 10.5 Fresh VPS/authorization and exact reviewed-retry packet

Independent bounded root readback at **17:21:35.574332 UTC /22:21:35.574332 +05**:

- Unchanged reviewed broker files/custody, actual runtime identity/hardening and
  retained rollback image PASS through existing Host.preflight().
- Active reference/image still **438ecdfa3d386a186dcd8b73c3c10aef5e79dc82**, healthy;
  readiness one measured helper GET PASS282ms. No cold-connect RCA inferred.
- No release journal, archive/orphan or competing worker; existing lock available.
  Cloudflared/daily/full/monitor states remain active/success. No changes made.
- Existing independent approval validates against the exact original artifact,
  is unused and expires **2026-10-20 17:44:36 UTC /22:44:36 +05**. Remaining1379s
  at that checkpoint, **not a refreshed countdown or future validity promise**.
  No renewal/recreation, approval issuance or marker deletion occurred.
- AUTO_DEPLOY_ENABLED remains **false**; no active deployment workflow.

**Proposed new incident-recovery decision, not executed:** one additional manual
Actions mode=deploy for source
`b9c7fc90f54699ef7e483ffebd5e0ea8779d3c23`, CI39450935221 attempt1/exact9 SUCCESS,
artifact12279152952/build39452595506 attempt1, image.tar21974016 bytes/SHA256
`240ef303650dc79709930a31434906cfa6145a26e97d862100b0320b84333e98`, after review
of the key-serialization repair. Accept the same *explicit one-attempt*
compensating controls, no competing release, retained438 rollback, fresh broker/
state/current authorization checks and temporary repository flag activation,
followed by disablement at reconciled completion/failure. The previous consent
cannot be replayed as this new decision.

Immediately before any newly authorized attempt, recheck main/CI/artifact, actual
approval expiry/unused state, active image/rollback and no competing workflow/
worker. If expired, stop for a genuine independent admin authorization procedure;
do not overwrite an expired record or manufacture fresh approval. If main drifts,
this old artifact/approval cannot authorize the new SHA. No rebuild is required
solely for the config repair while the exact source/artifact remain unchanged.
A later failure must stop for reconciliation, not trigger automatic dispatch.

### 10.6 Actual checks, counts and handoff

| Actual local/operator check | Result |
| --- | --- |
| Synthetic OpenSSH parser before/trimmed/restored | 3/3 case assertions PASS; trimmed case expected exit255/libcrypto, others exit0 |
| Full unchanged planner with real Git and parser / synthetic runner+SSH | 3/3 PASS; original/corrected exit0 PLAN_VERIFIED; trimmed expected exit1, output untouched; no real SSH/submit |
| Existing system sealed-box byte-preservation round trips | 3/3 PASS; no installation or private-value logging |
| Exact configured host/port known_hosts coverage, original and effective CLI serialization | 2/2 PASS |
| Actual installed gh --no-store stdin behavior | 3/3 PASS, synthetic only, **0 remote secret writes** |
| Existing exact CI/producer/download/compatibility validators against current metadata/bytes/real Git | exit0 PASS |
| Repaired dedicated real restricted status / independent root preflight | exit0 PASS each; not deployment acceptance |

There were **2 real SSH sessions**: one dedicated status and one Owner root
read-only preflight. The latter counted1 readiness GET; the status protocol's
internal bounded poll count is not returned and is not fabricated. **0 public
production API GET/HEAD/POST, 0 SQL/Redis, 0 workflow dispatch/rerun, 0 flag writes,
0 Docker load/cutover/rollback, 0 ingest/C2/service/timer changes.** The only remote
mutation is one update of the already existing Environment key secret. Public
Voice/Redis acceptance and600s observation are **NOT_RUN**, not PASS.

All source and historical test files remain unchanged. Section3's full source-
correction CI/Go/ops/security/PR/archive gates are **NOT_APPLICABLE to this config-
only route**, not relabeled as newly passed/skipped tests. Previous section5
checks remain historical on unchanged bytes. Existing CI9/9 is freshly verified
for the same exact main, not substituted for a deploy outcome.

Backend2 handoff was supplied through Owner in the commentary, not sent to an
invented external recipient: **P1 is not deployed. Old438 is healthy. One earlier
deploy failed in read-only planning before cutover; the key upload serialization
blocker is now repaired and readonly status passes. Ingest/timers/DB/C2 remain
unchanged. Continue independent nonproduction Go data-layer tests/PRs/fixtures
where possible; do not assume P1 is live or perform new production writes for
this release. Await one reviewed recovery decision and actual readback.**

**STOP for the specific retry decision. No DEPLOYED or successful public E2E/
600s claim.** Root cause of the original readiness503 incident remains
LIKELY_NOT_PROVEN; the demonstrated transport-input defect is a separate issue.

Final offline integrity at **17:26:21 UTC /22:26:21 +05**: fresh fetch still gives
the exact original main/HEAD; temporary Node diagnostic syntax exit0;
`git diff --check` and tracked-source diff exit0. Historical report prefix
**51967 bytes** matches SHA256
`e542ff8e7a78deea6fa63b2656fd6a466b1a0b2d212bf3fa9ad926d690df7517`;
only section10 is appended. Report-only porcelain scope, local Markdown targets/
anchors2/2 and bounded private-key/credential-URL/token/secret-assignment scan
PASS. Repository flagfalse and no active deployment workflows rechecked. No
source/credential material entered Git or a new review archive.

## 11. Explicitly authorized recovery attempt — 2026-10-20

**CURRENT: P1_BLOCKED_ACTIONS_READ_ONLY_PLAN. NOT DEPLOYED.** The one newly
authorized recovery attempt was executed and failed before transport/submit.
It did not replace the running API. Sections1–10, including the configuration
repair and historical failures, are preserved byte-identically. The initial
status banner remains historical; this section is the latest disposition.

### 11.1 Fresh admission and Owner decision

Owner separately authorized exactly one new recovery workflow after the SSH
serialization correction, accepting the same one-release compensating controls
for missing required reviewer/admin bypass described in section9 and the exact
recovery runbook. No permanent waiver, independent approval issuance, renewal or
second retry is inferred. No competing release was reported or observed in the
bounded GitHub/remote process, journal and lock checks.

Fresh fetch confirms audit HEAD=origin/main=
**b9c7fc90f54699ef7e483ffebd5e0ea8779d3c23**. Existing verifyCI() independently
validated CI39450935221 attempt1, all nine mandatory jobs SUCCESS. Existing
artifactMetadata()/verifyDownloaded() validated original artifact12279152952,
build39452595506 attempt1 and unchanged local original bytes; real-Git
verifyCompatibility(old438, candidate) passed. No rebuild/source change.
Repository flag was literalfalse; no noncompleted deployment workflow existed.
Production Environment metadata still reports branch_policy only, with existing
main-only restriction and the explicitly accepted compensating decision.

| UTC on 2026-10-20 | Actual gate / operation | Result |
| --- | --- | --- |
| 17:35:44.490540 | Independent strict Owner-profile root read-only preflight | All three reviewed broker hashes, custody and existing Host.preflight() PASS; old438 active/healthy, retained rollback, hardening/runtime identity/compose PASS; ready GET301ms. |
| Same preflight | Independent root authorization and STATE | Exact approval valid/unused; expiry17:44:36 UTC /22:44:36+05; remaining530s after checks. No journal/archive/orphan/worker; existing lock available. No record or marker changed. |
| Same preflight | Cloudflared, daily/full sync and monitor timer projections | All active, Result=success; no service operation. |
| 17:35:59.659 | Actual corrected dedicated-key operation:status | PASS through existing sshOptions(), actual Environment mapping and effective trusted known_hosts; old438, available=true. Strict ED25519 checking/no forwarding; no submit. |
| 17:36:09.091464 | Repository flag activation | Settrue; independently read back literaltrue. |
| 17:36:11.776914 | Exactly one recovery dispatch | exit0; mode=deploy, exact main/CI/artifact IDs above. No build/rerun/fallback. |

At dispatch there were approximately504s until fixed approval expiry, adequate
for the authorized start/load admission; the broker retained its own mandatory
fresh authorization checks. The600s observation was not assumed to complete
before expiry and was never reached. No time was backdated or extended.

### 11.2 Actual Actions result and independent reconciliation

[Recovery run39467521117](https://github.com/kiratonine/AdilBaga/actions/runs/39467521117),
attempt1, workflow_dispatch/main/exact approved SHA, created17:36:13 UTC,
completed **FAILURE** at17:37:29 UTC.

| Job / step | Actual result |
| --- | --- |
| Deployment offline checks118782690212 | SUCCESS; existing Python/Node/static deployment steps SUCCESS, not application acceptance |
| gate118782994720 | SUCCESS |
| rollout118783120900, producer17:37:20–17:37:21 | SUCCESS |
| Download original artifact / exact saved-byte verification | SUCCESS; byte verification17:37:24 |
| Read-only plan17:37:24–17:37:25 | **FAILURE**, fixed safe marker BLOCKED_TRANSPORT_OR_ROLLOUT; no PLAN_VERIFIED |
| Approved broker transport / bounded rollout | **SKIPPED**, not PASS; no submit/cutover from this workflow |
| build_only118783122604 | SKIPPED by deploy mode; no new build |
| Flag disable, independently verified17:38:18.699851 | **AUTO_DEPLOY_ENABLED=false**, exit0; completed workflow not cancelled |
| Independent root readback17:38:24.659806 | **Old438 still active/healthy**, retained rollback, broker/runtime identity/hardening PASS; measured readiness GET279ms |
| Same readback | Approval still valid/unused, remaining370s; no journal/archive/orphan/worker; remote lock available; cloudflared/daily/full/monitor active/success |

Exact active revision remains
**438ecdfa3d386a186dcd8b73c3c10aef5e79dc82**, not the candidate. There was no
compensating rollback to claim: transport was skipped and no broker receipt was
created. Artifact authorization remains unused, but the Owner's new workflow
attempt authorization is spent. Do not dispatch again on that basis.

Logs were captured privately and projected to finite safe marker booleans:
BLOCKED_TRANSPORT_OR_ROLLOUT present, PLAN_VERIFIED absent; no visible
Permission-denied/libcrypto/host-key error or broker-DEPLOYED marker. Absence of
these strings is not proof of their underlying states. No raw logs, private
host/username/key, signatures, credentials or runtime env were retained here.

**The new runner failure's exact inner cause is NOT_VERIFIED.** Section10's
key-serialization defect and repair remain demonstrated, but that correction
did not suffice for this runner. The generic catch still hides the first failing
operation; the one-second plan duration alone does not identify it. No root
approval, broker, SSH check, compatibility or rollback guard was bypassed to
obtain success. No unreviewed source/configuration correction was attempted.

### 11.3 Acceptance, safety and concrete next step

- Public API/Voice/Redis release smoke and600s observation: **NOT_RUN**, because
  broker transport was never reached. No test session was created; cleanup is
  NOT_APPLICABLE. These checks are not replaced by old-release health evidence.
- This continuation used **3 operator SSH sessions**: initial root preflight,
  restricted status, independent post-failure root readback. Root collectors
  explicitly measured2 loopback readiness GETs. Restricted status's internal
  bounded readiness poll count is not returned; the failed runner's inner SSH
  progress is not visible. No fabricated exact aggregate request count.
- **0 operator public production GET/HEAD/POST, 0 SQL/Redis, 0 Docker load,
  cutover/rollback, 0 new build, 0 source/secret/service/timer change.** One flag
  enable, exactly one workflow dispatch, one flag disable. No ingest/sync/C2,
  DB/Frontend/Cloudflare/Telegram mutation or physical Siri repeat.
- Only this report is appended. No commit/push/PR/merge, archive rebuild,
  independent approval renewal/replacement or marker deletion.

Next safe step is a separately reviewed privacy-safe diagnosis of the **current
runner's read-only planner boundary**, preferably fixed stage/error-class
observability with fail-first tests if source changes are needed. Do not make a
diagnostic deploy or change the current code under the spent attempt permission.
Any future retry needs a new explicit retry decision and fresh complete gates.
The existing record expires17:44:36 UTC; after expiry an independent root-admin
must reconcile the existing SHA-keyed record using the reviewed authorization
procedure in section7.4/AUTO_DEPLOY_SETUP. Do not overwrite it, delete a used
marker, backdate or automatically renew it. Agent did not perform that action.

**Backend2 handoff, supplied via Owner (not externally sent):** recovery run
39467521117 failed at read-only plan before submit. At17:38:24 UTC old API438ecdfa…
remained healthy; rollback retained; cloudflared and sync/full/monitor timers
active/success; deployment flagfalse. P1 is **NOT DEPLOYED**. Ingest, DB, C2 and
Backend2 configuration were not changed. Do not assume readiness mitigation is
live. Original cold-Supabase readiness RCA remains LIKELY_NOT_PROVEN.

**STOP — BLOCKED for independent review; no second recovery dispatch.**

## 12. Autonomous recovery — source diagnostics and confirmed broker blocker

2026-10-20. **P1_NOT_DEPLOYED — SOURCE_REVIEW_PENDING.** Owner authorized
source-side diagnosis, tests and a focused Draft PR, not a blind third deploy or
self-issued independent authorization. The two historical failed releases remain
failures. Sections1–11 are unchanged: original74858 bytes SHA256
`e833f808f4f9521f1fc7fa60b9eaab203b246d058f524abf50010572db713044`.

### 12.1 Fresh source, runner evidence and truthful diagnosis

Created separate native-WSL worktree
`/home/denis/tmp/aktau-p1-runner-planning-recovery`, branch
`fix/p1-runner-planning-recovery`, from fresh origin/main
**b9c7fc90f54699ef7e483ffebd5e0ea8779d3c23**. Other branches/worktrees were not
reset/rebased/cleaned. The same operational report is continued; its same-path
snapshot accompanies the source review, not a second incident report.

Re-read both actual rollout job logs privately:118762385811 and118783120900.
Both still expose only BLOCKED_TRANSPORT_OR_ROLLOUT, not a specific inner
exception. The nine expected setting names are present; values/raw logs are
not copied. **The second GitHub runner planning root cause is NOT_VERIFIED.**
No key rotation, guessed firewall/port change, permissive host checking, token
permission expansion or new deploy was used to guess it.

At18:02:44.889 UTC, the full new read-only planner ran locally using actual
GitHub API CI/artifact metadata, full real Git objects, unchanged artifact and
the actual restricted SSH options/environment mapping/key/trusted-hosts bytes.
It returned **PLAN_VERIFIED, exit0, submit0**, with repository flagfalse.
Temporary RUNNER_TEMP/event/output files follow the workflow protocol. Actual
secrets stayed private in process memory/0600 temporary key files, never logs.
This exercises more than the earlier mocked SSH plan, but it is **WSL evidence,
not a GitHub-hosted-runner result**; egress/HOME/runner-specific differences are
not excluded. No production application POST or DB connection was made.

### 12.2 Fail-first diagnostics and immutable read-only runner path

First added four full-entrypoint negative regressions (SSH authentication,
host-key rejection, timeout, malformed broker JSON). On unchanged source all
four failed the new stage assertions: old output was only the generic marker.
After the source correction, those and subsequent regressions pass.

- Transport emits only source-defined stage/category pairs and the original
  BLOCKED_TRANSPORT_OR_ROLLOUT marker. It never emits exception messages/stacks,
  raw SSH stdout/stderr, addresses, keys or provider responses. Unknown failures
  remain UNKNOWN. Existing decisions/bounds are not changed by diagnostics.
- Workflow adds explicit **mode=plan**, main-only, Production Environment,
  read-only token permissions, disabled activation and existing offline checks.
  It verifies the same producer/download/current-main CI gates and uses the
  fixed restricted status protocol. It has no build, flag-setting or submit
  step. Existing deploy job and its transport condition remain intact.
- Immutable CLI `auto-transport.mjs plan` rejects an enabled flag, wrong event,
  non-main context or non-plan mode. Its constant readOnly branch returns before
  submit even with DEPLOY_PHASE=submit. It does not authorize loading/cutover.
- Full-entrypoint tests cover redaction canaries, auth/host/timeout/unknown/JSON,
  missing credentials, corrupt artifact, CI error, missing Git objects,
  forbidden contract delta, output failure, wrong event and activationtrue.
  They assert bounded one status at most and no submit/fallback/retry.

**The new hosted diagnostic has NOT been dispatched.** Changing a workflow
requires external source review and ordinary CI/merge first. New main will need
a new exact-main immutable build before its diagnostic artifact admission; the
old artifact must not be relabeled to the new SHA. This is not permission to
dispatch deploy merely to discover another error.

### 12.3 Separately confirmed downstream root-broker defect

At18:04:46.296964 UTC, one bounded root read-only invocation of the **installed**
Host.fresh_main(exact main) made only its fixed public GitHub metadata GET and
returned **BLOCKED / unexpected_hsts**. No submit, Docker access or service
operation. The broker's generic HTTP helper applies the application's deferred
HSTS policy to GitHub's own HTTPS response. This conclusively blocks that future
worker stage, but is **not** the cause of read-only runner planning: status does
not call fresh_main. The two issues must not be conflated.

Added a fail-first real helper test with a synthetic GitHub HSTS response: before
fix, the positive test errors with unexpected_hsts while API/lookalike rejection
control passes. Minimal source fix permits HSTS only for the exact fixed GitHub
main metadata URL, GET, no body. Public/loopback API HSTS remains rejected, as do
lookalike/query-suffixed URLs and POST/body variants. Existing status, JSON/body,
edge-cache and no-redirect checks remain; no generic caller override was added.

Candidate broker SHA256:
`5b2f0021b6a60e0128539a043273311131b544941d57ab5ee9d56562a14b1b21`.
Installed reviewed broker remains the **old**
`2dd252eed4e0c634e908acd33135d61dd02b8d9595911708f459e50efa62406c`;
this task did not replace it. External review and a separately authorized exact-
byte/root-custody broker update are production prerequisites. Source merge alone
does not repair the installed broker. Approval/sealing/single-use, rollback,
readiness30s/7s and600s observation code paths are otherwise unchanged.

### 12.4 Fresh host reconciliation, expired authority and safety

At18:02:00.765634 UTC, independent read-only Host.preflight() confirms old438
healthy, rollback retained and hardening PASS; STATE has0 release journals and0
archives. Genuine old approval is **expired, unused**; exact expiry remains
17:44:36 UTC /22:44:36+05. The temporary collector then encountered its own
missing subprocess import before process/timer fields. This operator NameError
is not a host fault. A separate narrow corrected collector at18:02:11.139875
confirmed no broker worker and cloudflared/daily/full/monitor active/success.
Neither collector wrote server state; no failed mutation was retried.

This continuation's production accesses: **4 SSH sessions** (host reconciliation,
narrow process/timers, local full planner restricted status, installed fresh-main
metadata probe). One explicit Host.preflight() readiness operation plus bounded
status's internal polling; exact internal GET count is not returned. One public
GitHub metadata GET from VPS, not a production application request. **0 public
application GET/HEAD/POST,0 Voice/Redis/SQL,0 new workflow dispatch,0 flag writes,
0 Docker load/cutover/rollback,0 service/timer/credential/ingest/C2 changes.**
Repository flagfalse verified. No new root record or used marker was created,
extended, replaced or deleted. No actual production acceptance is claimed.

### 12.5 Executed source checks

Node24.10.0, Go1.27.2/GOTOOLCHAIN=local. These are source/local checks, not live
release proof. Existing source regressions were retained.

| Actual command / check | Exit and result |
| --- | --- |
| Four new planner-stage regressions before correction | exit1;0/4 PASS,4/4 expected assertion FAIL (generic marker cannot identify stage) |
| Broker GitHub-HSTS positive + API/lookalike control before correction | exit1;1 expected error,1 control PASS |
| node --test scripts/deploy/auto-gate.test.mjs scripts/deploy/verify-part15.test.mjs | exit0; **110/110 PASS,0 SKIP** |
| PYTHONPATH=scripts/deploy python3 -B -m unittest discover -s scripts/deploy -p 'auto_*_test.py' | exit0; **50/50 PASS**; original47 retained; local cold HTTP4524ms |
| Existing offline real-key-parser/full-planner fixtures, adjusted only for new fixed diagnostic line | exit0;3/3 case assertions PASS; complete/trimmed/restored final LF; real Git, synthetic SSH,0 submit |
| Actual local read-only full GitHub/Git/SSH planner | exit0; PLAN_VERIFIED, no submit; not hosted runner proof |
| node scripts/ci/run-checks.mjs go | exit0; full unit/race, vet, staticcheck default/integration, govulncheck(no vulnerabilities), tidy/verify and API/ingest local builds PASS |
| node scripts/ci/run-checks.mjs ops | exit0; **177/177 PASS,0 SKIP**, synthetic/local HTTPS/installer lifecycle |
| node scripts/ci/run-checks.mjs security | exit0; source/workflow policy and synthetic backup guard PASS |
| verify-auto-deploy.mjs / verify-part15.mjs / revalidation/verify-part16.mjs | exit0 each; static PASS, not production evidence |
| JS syntax and actionlint on changed workflow | exit0; PASS |
| git diff --check | exit0; PASS |

### 12.6 Review and release dependency order

Exact source scope: deploy-production.yml; auto-transport.mjs; auto-gate.test.mjs;
auto_broker.py; auto_broker_test.py; AUTO_DEPLOY_SETUP.md; same-path snapshot of
this report. No Go/DB/Frontend/Backend2/C2/schema/HMAC/monitor change.

Next Owner action is **independent review of the focused source PR**, including
the main-only nonmutating diagnostic and narrowly scoped broker HSTS exception.
Do not create a new root approval for the obsolete artifact now. After source
approval/merge and exact-main CI9/9: build a new immutable artifact, run the
separately reviewed read-only hosted plan, isolate its actual failure class if
any, and complete technical correction/CI as needed. Independently review/update
the installed broker exact bytes under separate administrative authority.

Only once a final exact candidate/CI/build/artifact exists can the report supply
the complete independent Owner approval packet. Existing expired SHA-keyed state
must be retained/reconciled, not overwritten. A genuinely independent root0600
record and **new specific exact-artifact release-attempt authorization** are
mandatory before flag activation/deploy. Future artifact IDs, approval timestamps,
authorizer/nonce and CI results are deliberately not invented here.

**WAITING at source review / independent release authority, not DEPLOYED.** The
overall goal remains open. Backend2: old438 is still the last directly verified
live API; continue local/mock data-layer work, not new production writes for this
release. Runner RCA remains NOT_VERIFIED; original readiness503 cold-Supabase RCA
remains LIKELY_NOT_PROVEN. No repeated physical Siri test.

### 12.7 Published source-review checkpoint and exact-head hosted CI

At18:17:35.976069 UTC /23:17:35.976069+05 the GitHub API independently confirms:

- Source commit **8da0a59d6248c478107b5bb247a269f6ae4a2d34**, parent exact main
  b9c7fc90f54699ef7e483ffebd5e0ea8779d3c23; ordinary feature push, no force.
- [Draft PR54](https://github.com/kiratonine/AdilBaga/pull/54), base main, correct
  head, open/draft/not merged, mergeable=true/clean. Review inventory is empty;
  green CI is **not** independent source approval. No automatic merge.
- [CI39472320152](https://github.com/kiratonine/AdilBaga/actions/runs/39472320152),
  attempt1, exact head, completed/success at18:15:52 UTC. Exactly **9/9 SUCCESS**:
  Contracts, Frontend, Go Quality, Security, Nest Reference, Pipeline Quality,
  PostgreSQL Integration, Ephemeral Staging, CI Gate. Every job's head SHA and
  attempt independently matched; no pending/skipped job relabeled PASS.
- Exactly the seven source/report paths listed12.6 are committed. Source worktree
  clean. Main remains b9c7fc90…; flagfalse independently read back. No deployment
  workflow was dispatched by this continuation. PR comment records this checkpoint.

Clean source review artifact, generated by unchanged create-clean-archive.mjs
full-stack and retained under unique name:

`/home/denis/tmp/aktau-p1-runner-planning-recovery/artifacts/adilbaga-p1-runner-planning-recovery-20261020.tar.gz`

SHA256 **24ce2062d4c67e28c32370a5ef36a76b6d5b8786c3cb8a95dfd6c0c9cf84586a**;
4660542bytes; **677 regular safe members**, no traversal/symlink/duplicate,
.git/TODO/.env (except allowed examples)/dependencies/build/test artifacts,
private-key/backup files. Every member matches both the committed source and
worktree bytes, including the same report snapshot through12.6. This publication
ledger is appended afterward to the original operational report; it is not
claimed to be inside the already-hashed archive. That review snapshot and this
live ledger remain one incident report/history, not new report fragmentation.

**SOURCE_READY_FOR_EXTERNAL_REVIEW; overall P1_NOT_DEPLOYED.** Exact immediate
Owner action: have independent review approve PR54's transport diagnostic and
fixed-URL broker correction. Keep it Draft/unmerged and flagfalse until that
review. After approval, continue this same TASK through ordinary merge/new-main
CI, new immutable build, read-only hosted diagnosis and authorized exact broker
update. Then provide the real new artifact packet for independent root approval
and request the one new exact-attempt release decision. Do not run the old7.6
no-clobber installer against the expired old SHA target, fabricate replacement
authority, or dispatch deploy on this source-checkpoint permission.

Backend2 factual status remains: old438 healthy at last actual host observation;
P1 readiness mitigation not live; ingestion, DB, C2, sync and monitor unchanged.
No production Voice/Redis acceptance or600s observation has occurred. The full
production goal remains **unachieved**, pending these genuine trust boundaries.

## 13. PR54 approved continuation — exact-main build and hosted plan

2026-10-20. **IN_PROGRESS; P1_NOT_DEPLOYED.** Owner reports independent review
APPROVED FOR MERGE and personally merged PR54. This resolves section12's source
review gate, not the separate broker-replacement, artifact-approval or one-attempt
release gates. The full new execution TASK was read. All preceding88357 bytes
are preserved, SHA256
`9151a1d613cf77976faddce37f74b0677abf05eabaa0aa407df92a682d57d8be`.

### 13.1 Actual merge and fresh host checkpoint

GitHub readback confirms PR54 merged; actual new main
**6a4b4c7a91ec471db54987b689c3c87a785523a3**, not its feature head. Fresh fetch
and local tree comparison prove tree
**988b6e405c9040ff9c634422fca5fe46ebd6590f** exactly equals reviewed8da0a59…;
tree diff exit0. New clean audit worktree:
`/home/denis/tmp/aktau-p1-pr54-production-execution`, branch
`audit/p1-pr54-production-execution`. Other worktrees/source were preserved.
The original operational report including12.7 remains authoritative; the shorter
merged12.6 snapshot was not used to overwrite it.

Exact push-main [CI39475310847](https://github.com/kiratonine/AdilBaga/actions/runs/39475310847)
was initially incomplete (staging pending), **not** relabeled as9/9. An unrelated
dynamic Dependabot update run39475339199 failure is not this mandatory CI run and
is not used as source-release proof. Final CI admission/build ledger follows.

Independent bounded root read-only preflight18:33:37.550515 UTC:

- All three installed wrapper/broker/smoke old reviewed hashes, root:root modes
  and one-link regular-file checks PASS. Broker remains old2dd252…; no update.
- Host.preflight() confirms active **438ecdfa3d386a186dcd8b73c3c10aef5e79dc82**,
  healthy, retained rollback, runtime identity/hardening/compose PASS.
-0 root release journals,0 stored archives, remote lock available, no worker.
  No genuine approval for new6a4b4c7… exists. Old artifact/expired record retained.
- Cloudflared/daily/full/monitor active, Result=success (monitor timer's sampled
  SubState=running, not a newly enabled unit). No service operation.
- Repository flagfalse; no noncompleted deployment workflow before build.

No production write, approval issuance, load, cutover, build or plan dispatch
had occurred at this checkpoint. Subsequent steps are logged below, not assumed.

### 13.2 Fresh exact-tree source tests

Executed on merged new-main bytes with Node24.10.0/Go1.27.2, not substituted
PR-head or production evidence:

| Actual command | Exit / result |
| --- | --- |
| PYTHONPATH=scripts/deploy python3 -B -m unittest discover -s scripts/deploy -p 'auto_*_test.py' |0; **50/50 PASS**, local cold HTTP4533ms |
| node --test scripts/deploy/auto-gate.test.mjs scripts/deploy/verify-part15.test.mjs |0; **110/110 PASS** (full output suppressed after earlier counted suite; failure propagated with set-e) |
| verify-auto-deploy / verify-part15 / verify-part16 |0 each, static PASS |
| node scripts/ci/run-checks.mjs go |0; full unit/race/vet/staticcheck default+integration/govulncheck(no vulnerabilities), module/tidy and local API/ingest builds PASS |
| node scripts/ci/run-checks.mjs ops |0; **177/177 PASS,0 SKIP**, synthetic/local HTTPS |
| node scripts/ci/run-checks.mjs security |0; source/workflow and synthetic backup guards PASS |

No source correction or new source PR was needed at this checkpoint. These
tests do not establish runner PLAN_VERIFIED, broker update or runtime deployment.

### 13.3 Exact-main CI and one immutable build — PASS

Existing verifyCI() independently validated completed push-main run39475310847,
attempt1, workflow375694597/.github/workflows/ci.yml and all nine exact-attempt
SUCCESS jobs for6a4b4c7…; fresh main matches. Automatic workflow_run39476288510
completed its disabled/offline path, not deployment. No noncompleted deployment
workflow existed before build. Flagfalse throughout.

One authorized **build-only** dispatch at18:38:32.854963 UTC /23:38:32.854963+05,
exit0; [build39476536632](https://github.com/kiratonine/AdilBaga/actions/runs/39476536632),
attempt1, created18:38:35, completed SUCCESS18:40:03. Offline/gate/build_only
SUCCESS; plan_only/rollout SKIPPED by build mode, not acceptance PASS.

| Independently checked field | Actual value |
| --- | --- |
| Source |6a4b4c7a91ec471db54987b689c3c87a785523a3 |
| CI run / attempt |39475310847 /1, push-main9/9 SUCCESS |
| Builder / attempt |39476536632 /1, manual build-only |
| New numeric artifact |**12289662280** |
| Immutable name |adilbaga-api-6a4b4c7a91ec471db54987b689c3c87a785523a3-39476536632-1 |
| Original ZIP bytes / SHA256 |21975083 / **00d90089273bb047b6daaeeebee1df81736721c3a17862baf8cbde80e92cc1ec** |
| image.tar bytes / SHA256 |21974016 / **75c8c1c0ac1a3630c996f116c81333164524c55ee0efd9f006408f9a1df7bf50** |
| API binary SHA256 |c1a18d1ade799b2921ef057ab30f524f9c4f3b8d71a091d13c62b5e44a4eac4b |
| Platform / user / entrypoint |linux/amd64 /10001:10001 /usr/local/bin/api |
| Artifact expiry metadata |2026-10-27T18:39:57Z; recheck before use |

Exact rootfs diff IDs independently recomputed from saved layers:

```text
sha256:74d97c428c51a828f9051a7a40a53ff1fc99e54fc30323ce36760701b0b7f711
sha256:7b10c78327b40ab096d1b7daa23e1b3262e167a63efd8b101d0080001f403a54
sha256:92a4daad440220d2e9d4de4ab49bf0f90f4a08620eb08edf1ea844d56fb8477f
```

Downloaded original numeric-ID ZIP once; checksum matches GitHub digest. Exactly
image.tar and manifest.json, CRC PASS; exclusive/no-follow0600 writes in new0700
`/home/denis/tmp/aktau-p1-pr54-immutable-artifact-6zIVXpQP`. Original ZIP/members
preserved unchanged. Offline safe unique tar inventory, exact image tag/config,
revision, platform/user/entrypoint, PATH-only env, every diff ID and actual API
binary bytes PASS. Existing artifactMetadata()/verifyDownloaded() and real Git
verifyCompatibility(old438,new main) PASS. No Docker load, rebuild or docker save
outside reviewed producer. Old artifact12279152952 was not reused/relabeled.

### 13.4 Actual hosted read-only plan — FAIL, no submit

One reviewed `mode=plan` dispatch at18:41:05.947401 UTC, flagfalse, exact new
SHA/CI/artifact above, exit0. [Plan39476904334](https://github.com/kiratonine/AdilBaga/actions/runs/39476904334),
attempt1, created18:41:07, completed FAILURE18:41:48 UTC.

- Offline job118815108973 SUCCESS. plan_only118815290556 producer/download/
  saved-byte verification SUCCESS. gate/build_only/rollout SKIPPED by plan mode.
- Actual diagnostic step18:41:44–18:41:46 returned finite signal
  **P1_PLAN_SSH_STATUS UNKNOWN**, plus BLOCKED_TRANSPORT_OR_ROLLOUT.
  **PLAN_VERIFIED absent.** Job success/old local plan were not substituted.
- This localizes failure to the SSH/status subprocess, **not CI, artifact,
  Git compatibility, runtime diff or output writing**. It does not distinguish
  key/peer/client/broker rejection because the reviewed classifier still has an
  UNKNOWN bucket. No guessed SSH key rewrite, ACL/sudo/network change or deploy
  dispatch followed. Source CLI's immutable readOnly branch cannot submit.

Bounded server correlation: narrow ssh/sudo journals for18:41:40–18:41:50 UTC
returned0 records; an additional logger-identifier/file projection initially
stopped on an operator root-owner assumption (auth.log is system-logger-owned,
not necessarily root). Corrected reader accepts only root or the existing
system syslog account, regular/no-follow file, at most512KiB tail. It parsed2258
ISO rows but found0 in the requested window. **This is not proof of no SSH
connection/authentication**: retention/tail coverage/logger availability are not
established for that historical10s interval. No raw messages, addresses, key
fingerprints or usernames were output. Error was in the temporary reader, not a
production setting; no state was changed to make it pass.

Independent post-plan root readback **18:54:12.301732 UTC** confirms old438 still
healthy; rollback/hardening PASS, old installed broker hash unchanged, no release
journal/archive/worker, lock available, new-main approval absent. Cloudflared,
daily/full/monitor active/success. Flag remainsfalse. No production Voice/Redis
smoke,600s observation, cutover or compensation occurred.

### 13.5 Bounded SSH-classification follow-up — source review required

The plan failure is a real diagnostic result, not grounds for blind repeat.
Created separate native source worktree
`/home/denis/tmp/aktau-p1-ssh-status-classification`, branch
`fix/p1-ssh-status-classification`, from fresh unchanged6a4b4c7… main.
Only transport classification, its existing tests and this report snapshot are
changed; workflow/broker/SSH arguments/keys/timeout/retry/submit/approval and all
Go/DB/ingest/Frontend/C2 sources remain unchanged.

Six fail-first full-entrypoint cases demonstrate the gap on original source:
key-parser rejection is misclassified AUTH_FAILED; peer close, missing client,
output-limit, negotiation failure and exact BLOCKED_BROKER stdout all collapse
to UNKNOWN. A first test-fixture draft had an escaped-newline SyntaxError; this
was fixed before the genuine six original-source classification failures were
recorded (exit1,0/6 PASS). No fixture error is counted as valid fail-first proof.

Minimal in-memory classification now adds source-defined finite categories for
these cases; only an exact one-property BLOCKED_BROKER object is recognized.
Unknown/arbitrary output remains UNKNOWN; private canaries are not logged.
A bounded numeric P1_SSH_EXIT (0..255 or UNAVAILABLE only) distinguishes client
termination without disclosing arbitrary error codes/messages. Eight new
regressions include unknown broker extra fields and attacker-like status text.
No diagnostic category is treated as authorization or a positive status. All
failures still fail closed, one SSH operation at most and no submit/fallback.

Current source tests: **Node118/118 PASS,0 SKIP**; Python50/50 PASS (local cold
HTTP4527ms); ops177/177 PASS; full Go unit/race/vet/staticcheck default+integration/
govulncheck(no vulnerabilities)/local API+ingest builds PASS; security, Part15/16,
JS syntax and diff-check PASS. Commands are the same required gates13.2, rerun
in the new source worktree. Hosted exact-head CI and publication follow below.
**No claim that this diagnostic-only change fixes the unknown runner cause.**
New source needs ordinary review/merge before another hosted read-only plan; if
merged, use a new exact-main artifact, not relabeled12289662280.

### 13.6 Broker replacement proposal and current factual Owner packet

Separately prepared operator-only proposal outside Git:
`/home/denis/tmp/aktau-p1-pr54-operator-zbbiB8e5/broker_replace_proposal.py`;
SHA256 **ab8d93858b9abdc1f96c12541073a1f8020734139dc9694e90ccfea868e52561**.
Tests in same folder, test_broker_replace_proposal.py SHA256
**b8a4af0988c289fb71e1144925306e03e7a2301b0600c9ad7bb0f7cdaacfdd02**.
Files0600/folder0700. Sandbox8/8 PASS: exact replacement/private backup, stale
old/wrong new rejection, no-clobber backup, symlink/hardlink/orphan refusal and
fsync-failure retention. Root ownership is mocked only in sandbox, not claimed
as production proof. Later added exact-bool admission/nonblocking lock hardening
retains8/8; no privileged write path was executed.

The production read-only admission using source-matched candidate bytes passed
**BROKER_REPLACEMENT_PROPOSAL_READY / writesfalse**. New broker bytes were also
independently compared to GitHub contents at exact merged main. This is a
proposal, not the separately required Owner approval of replacement.

Exact proposed mutation (only after explicit procedure/byte approval): fixed
root library/STATE no-follow descriptor traversal, root UID/GID/modes/no ACL,
quiescent journal/worker, existing release interlock (root0600 lock created only
if absent), reject any changed old target or pre-existing backup/pending state.
Exclusive private backup of old verified bytes in the same root-controlled
library, exclusive new file, file+directory fsync, stale-target identity/bytes
recheck, atomic replacement, exact new custody/hash readback. No parent chmod/
chown, new SSH/sudo grant, approval-file operation or service command.
Old hash **2dd252eed4e0c634e908acd33135d61dd02b8d9595911708f459e50efa62406c** →
new **5b2f0021b6a60e0128539a043273311131b544941d57ab5ee9d56562a14b1b21**;
target /usr/local/lib/adilbaga-deploy/auto_broker.py, root:root0644. Retained backup
basename auto_broker.py.before-pr54.<old-full-SHA256>.backup, root0600. Failures
preserve own resources for reconciliation, not automatic retry/unknown overwrite.
After authorized replacement, separately require restricted status and real
Host.fresh_main(final main) PASS; if not, reconcile/restore only verified prior
bytes under reviewed administrative procedure. **Replacement NOT_RUN.**

**Factual artifact packet exists in13.3, but RELEASE_APPROVAL_NOT_READY:** actual
hosted plan failed; the follow-up source is not yet reviewed/merged. Do not ask
Owner to issue a soon-obsolete approval for6a4b4c7… or silently modify the old
expired b9c7fc90… record. After final source/plan PASS, reuse this packet format
with real final main/CI/build/artifact IDs and fresh broker readback; only then
Owner independently verifies the exact tar and issues genuine strict v1 root0600
record for that final SHA and a specific one-attempt release decision. No
approvedBy/timestamp/nonce, approved=true record or future ID was fabricated.

**P1_NOT_DEPLOYED.** Technical work continued through the ordinary plan failure;
the remaining source-review and independent root-write/release-authority gates
are real boundaries, not repeated requests for general project consent.
