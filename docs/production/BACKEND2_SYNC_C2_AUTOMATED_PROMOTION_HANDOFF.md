# Backend 2: sync/C2 trusted publisher promotion

## 1. Purpose and current evidence

Prepared 2026-10-23; all event times below are UTC unless explicitly stated.
Operational timezone: Asia/Almaty, UTC+5.
Owner authorizes this transition and subsequent Backend2 administration.
This document is a standalone operational handoff, not a C2 PASS certificate.
Source implementation and installation are separate gates.
The installation result is appended below after actual VPS readback.
Until that section records success, treat deployment as PENDING.
Do not infer deployment from the presence of these source files.
Do not infer frontend convergence from source/authority alignment.
Do not issue a synthetic publication to demonstrate readiness.

## 2. Historical context

PR #63 established the site-content-verification production integration.
That policy does not require a changing Vercel deployment ID.
The prior installed C2 closure used source `bb1842bfc3ad25e74840072482801a8656ec7679`.
PR #69 merged the Dina weight-price correction.
The working publisher is `deploy/dina-weight-sync-part32`.
Its observed HEAD is `fd2b9a3eec417f739299e3d1ccc1d3d6b09860fd`.
The two Dina code/test blobs agree with the merged correction.
PR #70 documented the actual publisher branch without switching it.
Source baseline for this implementation is `cbba99f244975e123f3f8405693df39fe38aeee5`.
The older SCRUM-19 branch is historical, not the active publisher.
Existing deployment and rollback refs must be preserved.
An old rollback ref does not authorize losing the Dina correction.
The observed publisher/C2 mismatch is `C2_SOURCE_AUTHORITY_DRIFT`.
The previous `not_armed` event is not a successful C2 measurement.
Its history remains evidence; it must never be rewritten as PASS.

## 3. Ownership and escalation

Owner/Backend1 owns this transition and exact source review.
Backend2 owns ordinary publisher operations after handoff.
Frontend owns the six public representation contracts.
This work does not alter those representations.
Backend2 has a separate authenticated personal SSH identity.
The runtime `aktau-sync` account is not a personal administrator.
The new CI principal is not the Backend2 personal account.
The CI principal must never receive `sudo ALL`.
Public source artifacts are distinct from credentials and production data.
Unknown state requires reconciliation; it must not be repaired by guessing.
Do not paste DSN, keys, environment files, raw data or provider logs into issues.

## 4. Architecture

```text
reviewed main -> exact-main push CI, all 9 jobs successful
                     |
          relevant publisher/C2 runtime diff?
                     |
        isolated Go1.27.3 + Node24.18 build, no SSH secrets
                     |
       immutable GitHub artifact + independently read digest
                     |
      restricted SSH -> fixed root promotion executor
                     |
          exclusive runtime lock + controller lock
                     |
    publisher HEAD + 12-file closure + two root records
                     |
    next ordinary scheduled sync (no artificial publication)
                     |
      BEFORE -> READY -> Stage/COMMIT -> signed204/FIFO
                     |
                AFTER -> FINALIZE -> ledger
```

HMAC body/signature/timeout and post-COMMIT behavior are unchanged.
`REVALIDATE_HMAC_SECRET` is neither read nor replaced by promotion.
Go API deployment is a different system under `/opt/adilbaga`.
Sync publisher lives under `/opt/aktau-sync`.
`AUTO_DEPLOY_ENABLED` remains false and is not used here.
The dedicated switch is `SYNC_C2_PROMOTION_ENABLED`.
Disabling that switch stops future promotions, not ordinary scheduled sync.

## 5. Source inventory

`.github/workflows/sync-publisher-build.yml`: eligibility and immutable build.
`.github/workflows/sync-publisher-promote.yml`: separate restricted transfer.
`scripts/ops/build-sync-promotion.py`: exact Git source export and full bundle.
`scripts/ops/sync-promotion.mjs`: bounded CI/operator client and safe diagnostics.
`scripts/ops/sync-promotion.test.mjs`: client admission regressions.
`scripts/ops/sync-promotion-local-poc.py`: real disposable Git/Go transaction.
`ops/c2/publisher-promotion.py`: root protocol, independent admission and journal.
`ops/c2/test_publisher_promotion.py`: provenance, transaction and crash tests.
`ops/c2/promotion-runtime-gate.py`: shared kernel lock around original entrypoints.
`ops/c2/test_promotion_runtime_gate.py`: runtime lifetime/lock regressions.
`ops/c2/sync-promotion-entry.sh`: fixed zero-argument sudo wrapper.
`ops/c2/promotion-daily.conf`: existing daily service ExecStart wrapper.
`ops/c2/promotion-weekly.conf`: existing weekly service ExecStart wrapper.
`ops/c2/promotion-custodian.conf`: existing C2 service ExecStart wrapper.
`scripts/ci/run-checks.mjs`: include new client tests in existing ops gate.
`ops/c2/README.md`: custody and rollback reference.
`ops/sync/README.md`: publisher update reference; retain historical evidence.
`docs/data/SYNC_RUNBOOK.md`: remove blind production pull instruction.
This handoff and the Owner report complete the documentation scope.
No scraper business code, schema, Go API or frontend runtime is changed.

## 6. Immutable artifact contents

The GitHub ZIP must contain exactly `promotion.tar`.
The TAR contains exactly the 12 closure files plus two public metadata inputs.
`node`: exact approved Linux Node24.18.0 executable.
`entry.mjs`: C2 operator entrypoint.
`custodian.py`: existing C2 process controller.
`ingest`: immutable Go ingestion ELF built from the candidate source.
`c2projection`: Go read-only provider with actual embedded source SHA.
`relayprobe`: monotonic/FIFO helper from the same source.
`c2-production-supervisor.mjs`: existing supervisor.
`projection-provider.mjs`: existing trusted provider.
`fifo-adapter.mjs`: existing event custody.
`production-observer.mjs`: existing bounded observer.
`c2-manifest.mjs`: existing manifest/witness logic.
`source-manifest.json`: exact SHA, fixed recipe and Node major.
`source.bundle`: committed public Git objects for offline source import.
`promotion.json`: canonical producer/source/file digest document.
No `.env`, credential, production data or local Git configuration is exported.
Archive paths, types, inventory, sizes and hashes are checked before live changes.
Symlinks, hardlinks, traversal and duplicate archive entries are rejected.
The TAR/ZIP limit is 256 MiB; memory/disk admission is also bounded.
Build-only packages are not authorized for promotion.

## 7. Independent provenance authority

The restricted uploader does not approve its own manifest.
Root independently reads GitHub HTTPS metadata for the fixed repository.
It verifies current main, successful exact push CI and all nine job names.
It verifies the build workflow, event, run, attempt and successful upload step.
It verifies artifact ID, name, expiry, source identity, size and GitHub ZIP digest.
It verifies root-pinned workflow, builder and protocol source digests.
Root policy pins its installed runtime and all three loaded wrapper drop-ins.
An unapproved change to the producer requires a separate reviewed root upgrade.
No self-upgrading executor is accepted from the artifact.
Go metadata must prove Go1.27.3, linux/amd64 and CGO disabled.
Provider source is checked from the actual ELF global, not an uploader label.
Git tree and source modules are compared with the authenticated public bundle.
Protected migration/contract/API-compose differences block promotion.
Pipeline dependency/package-script changes also require separate reviewed provisioning;
the existing node_modules is not silently reused across changed lock/package files.
One exact old/new Git-blob pair admits the existing Vite-only test-tooling bridge;
runtime dependencies and scripts are unchanged. This is not a directory exemption.
The fd-to-main bridge preserves the known PR69 ancestry and current Dina blobs.
Subsequent legitimate reviewed Dina improvements are not frozen forever.
Missing GitHub authorization, network failure or ambiguity is fail-closed.
No extra SSH or sudo privilege is required for provenance lookup.

## 8. Root C2 records and process authority

`/etc/aktau-c2/automatic.json` remains version 2 and enabled true.
Its `sourceSha` agrees with actual publisher HEAD and rebuilt closure.
Its `files` maps all twelve absolute immutable paths to exact SHA256 values.
Its `sitePolicySha256` pins the unchanged site-content-verification policy.
`authorization.json` pins source, provider, clock, build identity and platform.
The independent site policy is not rewritten by promotion.
`reader.dsn` is checked by metadata only; its content and hash are not read.
The operator directory and reader inode are preserved.
Ledger bytes/inode/history remain untouched by promotion.
Existing approved ledger validation is reused; there is no second verdict algorithm.
READY is still process-bound and created only by the existing BEFORE flow.
Promotion neither creates READY nor bypasses fixtureOnly/private custody.
The original BEFORE/HMAC/FIFO/AFTER chain is unchanged.
Convergence still requires three consecutive qualified PASS within five seconds.
FAIL resets the series; INCONCLUSIVE does not add to it.
Only the actual ledger can establish the current production count.

## 9. Race prevention and transaction phases

Daily, weekly and C2 entrypoints hold a shared runtime lock for their lifetime.
The wrapper execs the original fixed argv; daily exit0/1/3 are preserved.
The C2 process PID/notification semantics are preserved.
Timers and scheduler times are not changed.
Promotion takes the exclusive runtime lock and existing controller lock.
An active sync/C2 attempt is not interrupted or cancelled for deployment.
No source command can cross the verified shared gate during a transaction.
An ingress mutex limits concurrent root archive allocation.
The root operation has a 300-second deadline and bounded child processes.
Timeout cleanup checks pipe-holding descendants, not only direct children.
The durable intent precedes creating the staging directory.
All fourteen old target bytes/metadata are backed up before source import.
Candidate source and binary validation precede any publisher switch.
Source and live file identities are rechecked immediately before replacement.
Publisher and complete closure/authority are switched inside the same lock scope.
Readback must prove all source and hash relationships before commit receipt.
Each durable phase is crash-tested using real SIGKILL in disposable filesystems.
An unresolved interlock blocks new promotions and source execution.
Orphan/unknown release resources are retained for manual reconciliation.

## 10. Separate privilege model

Owner remains the administrative fallback through the existing verified alias.
Backend2 personal login uses its independently confirmed ED25519 public key.
No private key or passphrase was requested, copied or printed.
Personal SSH was tested through the Owner-unlocked local agent.
Agent forwarding remained disabled.
Backend2 UID is 1001; the runtime operator UID is 999, GID987.
Backend2 has `NOPASSWD:ALL` until 2027-01-20 20:06:31 UTC.
Only the existing rule's PASSWD token was changed; expiry was preserved.
This is **Owner-delegated Backend2 production administration**.
A full administrator can access secrets and alter root C2 authority.
Therefore human approval is not cryptographically independent of Backend2.
Do not claim separation that full root access does not provide.
The CI principal must have only the fixed zero-argument promotion operation.
It receives no shell, forwarding, general sudo or personal Backend2 key.
`aktau-sync` remains a runtime account, not a new unrestricted administrator.
No root SSH or password-only login is enabled.

## 11. Backend2 access and offboarding

Use your existing personal private key in your own local SSH agent.
Connect using the separately provided host/port and username `backend2`.
Keep host key checking enabled; never use `StrictHostKeyChecking=no`.
Use `sudo -n id -u` to verify approved root access; expected output is 0.
If login fails, distinguish locked local agent, incorrect key and expired grant.
Do not send private keys or passphrases in chat.
Administrative actions are recorded by the existing sudo/journald audit system.
Owner fallback was tested independently after the sudoers update.
Backup of the prior sudoers file is root-private under `/var/backups`.
To revoke, an authorized admin removes only the Backend2 key and sudoers grant.
Validate with `visudo -c` and `sshd -t` and retain Owner access.
Do not delete runtime data, deployment refs, journals or the account's evidence.
CI key revocation is separate: remove its forced-key entry and environment secret.
Disable the dedicated promotion variable while reconciling CI credentials.

## 12. Read-only diagnostics

```bash
sudo -n -u aktau-sync git -C /opt/aktau-sync rev-parse --abbrev-ref HEAD
sudo -n -u aktau-sync git -C /opt/aktau-sync rev-parse HEAD
sudo -n -u aktau-sync git -C /opt/aktau-sync status --porcelain=v1
systemctl show aktau-sync.service -p ActiveState -p Result -p ExecMainStatus
systemctl show aktau-sync-full.service -p ActiveState -p Result -p ExecMainStatus
systemctl show aktau-c2-custodian.service -p ActiveState -p Result
systemctl list-timers 'aktau-sync*' --no-pager
printf '%s\n' '{"version":1,"operation":"status"}' | sudo -n /usr/local/sbin/aktau-sync-promote
```

The last command requires an installed verified executor; it is not an install command.
Do not dump environment, reader DSN, full ledger or raw logs into public artifacts.
An aligned status proves configuration relationships, not real HTTP convergence.
An absent READY when idle is expected; never create one to satisfy a check.
`not_armed` is ordinary fail-open ingestion, not C2 acceptance.

## 13. Manual fallback, automatic trigger and NO_OP

Automatic builds follow successful main push CI only when relevant runtime changes.
Frontend/docs/API-only changes do not cause a publisher checkout switch.
Eligibility also compares the actual active publisher to the proposed main.
Manual fallback uses the build workflow's `promote` mode with exact main and CI ID.
The separate promotion workflow consumes that completed immutable build.
No unrestricted SSH command or arbitrary remote argument is exposed.
A `build-only` invocation proves buildability without granting deployment authority.
The promotion workflow rejects build-only packages without activating them.
Same-source and fully aligned closure return NO_OP without new publication.
Moved main, failed CI or missing authority stop without candidate activation.
Unknown SSH outcome requires remote receipt reconciliation before any retry.
Do not rerun deploy blindly after a lost connection.
No source update requires or permits a second ingest apply.

## 14. Coupled rollback and crash recovery

All old bytes and publisher identity are preserved in root release directories.
Rollback covers publisher plus all twelve closure files and both root records.
Database, source data, reader and ledger history are never rewound.
Root-only recovery of an interrupted known transaction:
`sudo python3 -I -B /usr/local/libexec/aktau-sync-promotion/publisher-promotion.py --rollback-interrupted`
This requires unchanged original reader/ledger invariants and known partial hashes.
Unknown partial bytes, missing backup or active cleanup uncertainty block rollback.
Deliberate rollback of the last completed release:
`sudo python3 -I -B /usr/local/libexec/aktau-sync-promotion/publisher-promotion.py --rollback-last`
This first requires an idle source, loaded wrappers and a valid current closure.
It preserves newer terminal ledger history using freshly checked invariants.
Both operations are admin-only and not exposed through the CI forced command.
Initial repair rollback returns to the historical fd publisher/bb C2 mismatch.
That preserves Dina but leaves C2 unarmed; it is not an aligned final state.
No rollback ref or forensic directory is automatically deleted.
Incomplete intent/orphan preparation requires reviewed manual reconciliation.
Never remove an interlock merely to make the next job run.

## 15. Evidence and limitations

Existing C2 regression tests remain mandatory; synthetic PASS is not production PASS.
The disposable E2E uses real Git import and actual Go ELF/build metadata.
Its service/authority environment is explicitly local and cannot mint production authority.
It makes zero HTTP requests and zero publications.
Negative tests cover independent digest, producer identity, package and path tampering.
They cover each closure file, source chain, active runtime and mid-transaction drift.
They cover SIGKILL phases, orphan state, unknown partial hashes and coupled rollback.
Node and Python test counts/commands are recorded in the linked Owner report.
Hosted CI must be checked for exact PR HEAD and exact merged main.
Production installation must be checked independently from local results.
No new live C2 attempt is initiated for this task.
Three actual PASS still require the next eligible ordinary publication cycles.
Future API/frontend changes are not evidence of publisher runtime change.

## 16. Handoff checklist

- Verify merged source SHA and exact-main CI before changing root tools.
- Verify root-pinned producer/runtime hashes and loaded service wrappers.
- Verify active publisher equals authorization, automatic source and provider provenance.
- Verify all twelve actual file digests, not only JSON sourceSha.
- Verify reader inode, ledger history and site policy are preserved.
- Verify old kit, source refs and root receipts remain available.
- Verify API health and daily/weekly schedule are unchanged.
- Verify separate Backend2 login and sudo, plus Owner fallback.
- Verify CI principal cannot obtain a shell or arbitrary sudo.
- Monitor the next natural C2 cycle; record actual verdict and safe failure class.
- Keep the five-second SLA and preserve historical failures.

## 17. Copyable Backend2 message

Publisher/C2 promotion now has a source-defined complete-kit transaction and rollback.
Your personal Backend2 SSH/root access was separately verified; expiry is unchanged.
Use the installation evidence below to distinguish deployed components from source.
Do not use git pull or edit sourceSha/READY manually on the publisher VPS.
Do not trigger a publication just to test C2; inspect the next ordinary cycle.
Configuration alignment is not convergence PASS; keep actual ledger history.
See the [Owner report](reports/SYNC_C2_PROMOTION_OWNER_REPORT.md) for exact results.

## 18. Installation/readback evidence

PENDING: this section will be updated only from actual authenticated readback.

## 19. Reviewed manual artifact path (2026-10-25 source candidate)

This supersedes section13's assumption that manual promotion needs the CD transport.
`manual-artifact` is a new **build-only operation**, producing a genuine
`kind=promote` artifact; it does not deploy. It is permitted only by an explicit
main workflow_dispatch after authenticated exact push-main CI9 validation.
It neither calls SSH nor requires/enables either deployment variable. The normal
`promote` build mode and the separate activation workflow retain their existing
CD flag/transport guards. Keep those variables disabled/unset for manual use.
The eligibility job still uses `environment: sync-publisher`; any actual GitHub
environment protection must be satisfied normally, never bypassed.

**Not installed or approved by this document.** Before use, independently review
and merge this source, verify exact-main CI9, and approve the resulting producer
workflow digest. Existing root admission pins the workflow bytes, builder and
executor; changing the workflow intentionally fails `producer_source_changed`
until that independent administrative provisioning occurs. No executor self-upgrade
or admission bypass is added. Existing executor, builder, wrappers and runtime
digests must remain unchanged; if any differs, STOP for separate reviewed upgrade.

Independent root-pin provisioning packet must contain exact old/new full policy
SHA256 and old/new workflow SHA256 derived from authenticated reviewed Git source.
An authorized admin must verify installed executor/wrappers/policy and idle locks,
retain a root-only no-clobber backup, construct a reviewed policy differing **only**
in `producerFiles[".github/workflows/sync-publisher-build.yml"]`, validate it with
the installed `validate_policy`, recheck original inode/hash, and atomically replace
the root-controlled policy with original metadata plus fsync/readback. No uploaded
artifact may supply that policy. Any unexpected byte, active attempt, unknown
receipt or stale source is STOP. Revert that policy from its known backup only
before any transaction; unknown transaction outcome requires journal reconciliation.
This TASK does not perform or authorize that production provisioning.

After that gate and separate production permission, from a reviewed local checkout:

```bash
# SHA and CI_RUN are independently verified exact current main / successful push CI9.
gh workflow run sync-publisher-build.yml --ref main \
  -f mode=manual-artifact -f sha="$SHA" -f ci_run="$CI_RUN"
```

Wait for the exact producer run/attempt to complete successfully. Independently
read GitHub artifact metadata, expected name/source/run/expiry/size and SHA256 digest;
download the original ZIP with `gh api repos/kiratonine/AdilBaga/actions/artifacts/ID/zip`.
Do not rezip, relabel build-only bytes, use a source review archive, or build on VPS.
Verify ZIP digest against authenticated GitHub metadata, one `promotion.tar`, exact
manifest/source tree/toolchain/12 hashes and all existing admission predicates.

The existing root wire request is exactly one canonical JSON line plus original ZIP:

```text
{"artifactId":ID,"buildRunId":BUILD_RUN,"ciRunId":CI_RUN,"operation":"promote","size":ZIP_BYTES,"sourceSha":"EXACT_MAIN","version":1}\n
<original authenticated GitHub ZIP bytes; no trailing bytes>
```

IDs/size are positive JSON integers. A local checked framing file may be constructed
using Python `json.dumps(request,sort_keys=True,separators=(',',':'))+'\n'` followed
by `Path(zip).read_bytes()`; none of these public inputs grants root authority.
Root independently fetches GitHub metadata and enforces every pin/hash before
obtaining exclusive locks and changing the publisher. Framing is the existing
protocol, not a new generic root command or sourceSha override.

```bash
# Future execution only after separate approval, exactly once; no automatic retry.
timeout --signal=TERM --kill-after=5s 360s \
  ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o ForwardAgent=no \
  -o ConnectionAttempts=1 -o ConnectTimeout=10 \
  my-vps 'sudo -n /usr/local/sbin/aktau-sync-promote' < reviewed-request.bin
```

Use the existing personal admin alias/agent; no new CI SSH principal/key/env is
needed. Keep host-key verification. Use the installed fixed zero-argument wrapper,
never a Python script from the upload. Inspect only the bounded sanitized reply.
On disconnect/timeout, reconcile the root journal/receipt using approved read-only
checks before any retry. Preserve source refs, all rollback bytes, reader inode,
ledger/history, site policy, API and timers. Existing coupled rollback entrypoints
in section14 remain unchanged; never hand-edit authority/sourceSha or replay
`--initial-reviewed`. Alignment remains distinct from actual READY/convergence.
