# C2 root executor/policy pair helper — 2026-10-25

Status: READY_FOR_EXTERNAL_REVIEW. Task result: **ROOT_UPGRADE_HELPER_READY_FOR_REVIEW**, conditional on the exact final PR-head CI9 recorded in the publication evidence below/PR checks. **Source only: no VPS installation, root mutation, release artifact or promotion.**

## 1. Frozen input and authority

Assigned task: `ADILBAGA_C2_ROOT_EXECUTOR_PAIR_UPGRADE_HELPER_TASK_20261025.md`.
Input is the independently reviewed `C2_ROOT_EXECUTOR_UPGRADE_EXECUTION_PLAN_REPORT_20261025.md` in the separate audit worktree `/home/denis/tmp/aktau-c2-root-executor-upgrade-plan-20261025/`, SHA256 `b6857a7afa8872acfae8525bd99dba8f3fdca08dcf0eca3deb6f002967a33283`. It is an input plan, not a live authorization record; it was read completely and not copied/replaced by another plan.

Fresh source baseline immediately before implementation: `origin/main=8cff133be30a8c31f4d5e06d297dcf9af5e97847`; [push-main CI40208958302](https://github.com/kiratonine/AdilBaga/actions/runs/40208958302),9/9 SUCCESS. New native-WSL worktree `/home/denis/tmp/aktau-c2-root-executor-pair-upgrade-helper`, branch `feat/c2-root-executor-pair-upgrade-helper`. Original checkout/untracked files and prior worktrees/reports are preserved; no reset/rebase/force or production access.

| Exact immutable packet | SHA256 | Bytes |
| --- | --- | --- |
|Old installed executor|`fca92db4cda0d94d25f6b7afbe314cb9bac94fff024f619eb94a24a365330670`|56173|
|Reviewed replacement executor|`d69c667212b2a6c8a25081ccdc90f798024e850784262976e06e45ce13f45118`|59455|
|Old canonical policy|`aea14e7d8814311c57586a3397f24ef754de7072a817b05aa0888497214ac74d`|1557|
|Two-pin candidate policy|`2bf672f1626252f107447552493ad982999d3d7f444f000394a7006d952ddb8b`|1557|
|Unchanged producer workflow|`1d7764798c1c78ac616e4615ef46ba7fd810b1f192692318cdf1a3aa66da6312`|3929|
|Unchanged builder|`308504c27ee7ceed871b1044d88a20a1f45a9525c9e4f3cca9d9b8382240b9b4`|5211|

New helper source SHA256: `98d1d5a4311a2e45b6ceb543558b40f2fc5d2c4826e064ed3f4ec5712a85fe68` (34494 bytes). This is a review fingerprint, not permission to install it. The production executor file in this branch remains byte-identical to reviewed d69c6672…; it is not modified again by this helper implementation.

## 2. Fixed-purpose architecture

The helper is separate from publisher promotion. Production CLI accepts only `--verify`, `--apply`, `--recover`, `--rollback`; requires real/effective UID0, isolated Python `-I -B`, and its exact root-controlled installed pathname. No source/path/UID/command/environment/sandbox/approval override or stdin protocol. No sudoers, SSH key, workflow setting, dependency, service or root-policy schema extension.

Independent source verification uses the already pinned existing executor's bounded GitHub HTTPS client (fixed repository, TLS, no redirects/inherited proxy,8s request timeout). It validates exact reviewed8cff133 source, push-main CI40208958302 and all9 completed-success job identities, then fixed workflow/builder/executor paths, encoding, sizes and complete SHA256. Unknown/missing/unavailable metadata fails closed. Downloaded candidate bytes are hashed and syntax-compiled, **not executed**. Bootstrap code is read only from the fixed installed root executor after full known old/new hash+size/custody validation. There is no uploader-supplied approval or latest-main selection.

The executable/policy source packet intentionally remains the frozen reviewed8cff133 code even after a future helper-only PR merge changes main. No target is silently advanced. A subsequent publisher artifact must use its separately approved then-current exact main/CI and independently unchanged producer hashes; this helper neither builds nor approves that artifact.

The minimal descriptor filesystem layer is needed before bootstrap and for features absent from the old generic single-file write primitive: no-follow pinned directories/files, no unexpected ACL/xattr, exact modes/UID/GID/nlink, exclusive creation, full hash AND inode/stamp CAS, safe journal publication and separate pair recovery. Existing policy validator, GitHub client, Host idle/source/Go closure/ledger validation and release inventory are reused rather than redefining C2 semantics.

### Guarded state and mutation boundary

- Existing locks, exact order: ingress (`state/ingress.lock`,0600) → runtime (`runtime.lock`,0644) → controller (`controller.lock`,0600). Read-only opens, nonblocking exclusive lock, empty regular single-link root file, pinned inode/name checks; no create/stop-to-gain-lock.
- Active/failed services, operator process, READY/deployment/operator lock, nonterminal custodian journal, promotion interlock, wrong loaded wrapper, disabled timer or unknown retained release/backup state reject before live writes. Actual service identity remains fixed `aktau-sync`,UID999/GID987 in production; no configurable UID/path.
- Existing Host checks clean Dina publisher/source fd2b9a3, actual provider embedded source/Go1.27.3, all12 files/C2 records/site and codec-validated ledger. Strict descriptor reads additionally reject root file/ancestor mode/owner/link/xattr/ACL surprises. Releases must remain root0700. Exact two retained receipt digests and all28 old backup hashes are checked.
- Reader is metadata only, including inode/mode/UID/GID/nlink/size/timestamps; no DSN bytes/hash. Ledger current inode/hash and per-entry digests are captured fresh. Equality is required inside a protected operation. On a later recovery, a codec-valid append may have a fresh inode; original prefix must remain identical and the fresh current ledger is preserved. Reader or historical rewrite rejects. No frozen historical15/16-entry inode or copied DSN.
- Only `/usr/local/libexec/aktau-sync-promotion/publisher-promotion.py` and `/etc/aktau-sync-promotion/policy.json` are replaced. Policy diff is exactly the two linked executor hashes, canonical JSON+LF and full2bf672f1… digest. Workflow/builder/other pins, sourceSha, C2 authorization/automatic/site,12-file closure, reader, ledger, service/timer/role state are not written.
- Overall production helper deadline120s; existing child command/group timeout+TERM/KILL cleanup is retained. No shell=True or new command endpoint. Read-only source fetch is outside the three-lock critical section. Space/read-only-mount admission checks all four relevant parent filesystems before READY/apply and restore staging; no cross-filesystem rename assumption.

## 3. Durable pair transaction and explicit recovery

Fixed new backup namespace: `/var/backups/aktau-c2-executor-upgrade-20261025-8cff133b/`,root0700. Fixed distinct root0600 journal: `/var/lib/aktau-sync-promotion/state/executor-pair-upgrade-8cff133b.json`. Neither the old workflow backup nor failed publisher rollback domain is reused. Journal stores old complete target identity/hash/mode, safe state fingerprints, registered resource inodes and phase; both old full files are separately backed up0600 and fsynced before any live replacement.

The state sequence includes intent → registered backup directory/files → registered staged files → **prepared → executor_replaced → pair_replaced → verified**. Each target temp is exclusive, in its own existing target parent,0600 while written, then correct final mode and fsync. Atomic rename, file/name/parent inode+hash CAS and parent fsync occur separately. This is **not** a physically atomic two-file commit. A durable verified receipt is distinct from C2 acceptance. No root entry/status call happens while holding ingress (avoids self-deadlock).

Initial journal hardlink publication holds the pending descriptor and verifies both named links/inode/count before unlinking its own pending name. A swapped foreign pending is retained. Journal updates also CAS the exact prior bytes and inode. Partial/short writes, stale parent/target, changed metadata or failed fsync never return a qualified success.

| Actual pair + durable evidence | Explicit action/result |
| --- | --- |
|old/old, no journal|verify only READY; apply can begin one new transaction|
|old/old, registered incomplete journal|recover marks known attempt rolled_back; retains registered stages/backups|
|new/old, known registered candidate inode|recover restores executor from the correct own old backup|
|new/new, incomplete/receipt not yet verified|recover restores both old files, policy first then executor|
|new/new, verified journal/receipt|recover retains verified pair; explicit rollback can restore both only if protected state still matches/validly extends|
|old/new, even with valid staged policy inode|BLOCKED: this protocol never creates that ordering|
|unknown hash/inode/journal, missing/tampered backup, unregistered resource|BLOCKED; retain every resource for manual reconciliation|

Rollback is itself journaled with registered restore-temp inodes, policy-first/executor-second rename phases and final readback. Recovery recognizes only original or registered candidate/restore inodes with exact bytes/modes. It never calls publisher `--rollback-last`/`--rollback-interrupted`, changes dataset/ledger, or guesses unknown ownership. Even a terminal rollback consumes this one-off attempt: a second --apply is rejected, not a blind retry.

Unregistered mkdir/file gaps intentionally **BLOCK**, including a crash between mkdir/fsync and durable inode registration, or a failed backup fsync. Those are not claimed automatically recoverable. The pair may be still old or a known partial state, but unknown resources are not adopted or deleted. Root-private evidence is preserved for a separately reviewed reconciliation. Corrupt/missing/torn journals and unexpected journal pending/family/backup/temp names also block.

## 4. FAIL-FIRST, PASS-AFTER and actual Linux evidence

The first regression existed before the helper. It called the existing real single-file Filesystem.write primitive twice conceptually; actual SIGKILL immediately after executor replacement left the new/old pair without a recovery journal. The assertion that recovery restores the original pair **failed with exit1**, not an import/compile/missing-function error. Reproduced again in an owned temporary source copy without the helper, running only `test_sigkill_between_two_renames_recovers_original_pair`; exact old/new executor and policy bytes/hashes were used.

After implementation, the identical scenario invokes the helper, kills the child at `executor_renamed` (before the next phase persist), restarts with explicit recover and proves the exact old/old pair. Focused final tests:31/31 PASS,0 SKIP.

The mandatory existing Go Quality root runner is reused, not skipped or replaced by same-UID proof. It launches the new aggregate entry in its unchanged digest-pinned Ubuntu24.04 image: actual root UID0 and actual separate account UID1999, real runuser/Git/Go plus real filesystem openat/rename/flock/fsync/chown/ACL/SIGKILL on isolated temporary files. No network, host Docker socket, host deployed path, real credential, privileged container or production service. SDK/repo read-only, bounded private tmpfs, CPU/memory/pids; only necessary existing capabilities. Final root aggregate: **41/41 PASS,0 SKIP**: previous7 actual FD/Git/Go tests retained,31 pair regressions and3 actual root/foreign-owner/operator-child tests.

At all persisted upgrade points, both target rename gaps and seven rollback points, real fork/SIGKILL leaves durable evidence; explicit restart recovers or retains verified terminal state as specified. Five unregistered resource gaps and mkdir-before-registration return BLOCKED with identical live pair/journal and retained resources. Twenty-eight real modeled retained backup files,12 modeled closure files, actual operator-owned reader/ledger metadata and bytes stay unchanged by the pair transaction. Existing actual Git/Go coupled promotion/rollback qualification remains independently exercised.

Authority/business/GitHub responses in helper transaction tests are explicit local models, not actual VPS truth. The root OS/filesystem/UID/process operations are real. Source factory boundary tests use actual reviewed public bytes and full expected hashes behind synthetic HTTPS-response adapters, including all three producer pins and exact CI9 failures. No synthetic data is passed off as a real release or C2 measurement.

Negative cases cover wrong old/new digest or length, third policy field, stale inode/parent, symlink/hardlink, actual foreign owner, writable ancestor, named POSIX ACL/xattr despite superficially safe mode, busy/nonempty locks, runtime busy, Source/CI/repo/workflow mismatch/skipped jobs/unavailable authority/invalid encoding, missing or altered backups, journal corruption/unknown phase/extra keys, unknown mixed pair, unexpected stages, root space/read-only mounts, partial/zero write, backup/directory fsync failure, cancellation, historical ledger rewrite, current-window resource change, duplicate apply, missing journal, wrong CLI mode/override, FD leakage and real runuser descendant timeout/cleanup. Unknown state never returns verified.

Intermediate **fixture** corrections are recorded honestly: a directory context assertion was initially placed inside rather than around the context; a nonroot mutation injector tried writing its own0444 fixture without first temporarily setting owner-write. These were corrected without relaxing helper assertions. Staged diff-check also rejected raw unified-patch blank context whitespace; that public fixture was encoded as a JSON line array, preserving the exact reconstructed old hash, before any push. No runtime helper bytes changed for that formatting correction. Root real-owner tests remain mandatory, not replaced by mocks.

## 5. Local verification (actual commands / exit codes)

Native WSL; RTK wrappers, Python3.12, Node24.18.0/pnpm10.32.1, Go1.27.3/GOTOOLCHAIN=local. No dependency versions changed.

| Command/profile | Result |
| --- | --- |
|Baseline real uncoordinated-rename/SIGKILL regression|exit1, expected concrete mixed-pair assertion FAIL|
|`python3 -B -m unittest discover -s ops/c2 -p test_root_executor_pair_upgrade.py`|exit0,31/31,0 SKIP|
|`python3 -B -m unittest discover -s ops/c2 -p 'test_*.py'` (also executed by ops)|exit0,164/164,0 SKIP|
|`node scripts/ci/run-checks.mjs ops`|exit0,Python164 + Node185/185,0 SKIP|
|`node scripts/ci/run-root-bundle-integration.mjs`|exit0,41/41 mandatory root aggregate,0 SKIP, owned container/image cleanup PASS|
|`node scripts/ci/run-checks.mjs go`, first run|exit1: Go test/race/vet/staticcheck/govulncheck/qualification/build passed; unchanged Node C2 had355/357 PASS,2 FAIL|
|Exact two FIFO cases in isolation, no assertions/timeouts changed|exit0,2/2,0 SKIP|
|Full `node scripts/ci/run-checks.mjs go`, repeat after parallel jobs ended|exit0: all Go checks + Node C2/guard357/357,0 SKIP|
|`node scripts/ci/run-db-integration.mjs`|exit0, disposable PG17/migrations/security/parity/recovery/provider/real Go+Node READY publication flow; PG cleanup PASS|
|`node scripts/ci/run-checks.mjs security`|exit0, source/privacy policy + synthetic backup guard|
|`node scripts/revalidation/verify-part16.mjs`|exit0, static boundaries PASS|
|Python compile, Node runner syntax, report links, exact scope/source-history/privacy and `git diff --check`|PASS,exit0|

The first Go run's two unchanged FIFO cases were `pre-armed receiver learns actual Go snapshot...` and `v2 real Go mock204 -> private FIFO...`, both INCONCLUSIVE vs PASS. They passed isolated and on full repeat; exact cause is **NOT CONFIRMED**, concurrent local load is only a hypothesis. Original FAIL is retained; no timeout/SLA/retry/concurrency/assertion alteration, no stale result substituted, and no claim this helper fixes that intermittent C2 test behavior. Final exact-head hosted CI remains a separate mandatory publication gate.

The expected duplicate-ZIP Python fixture warning is retained. Tests without test functions are not invented PASS counts; no required SKIP is treated as PASS. Local/mock/PG evidence is not production READY/convergence evidence.

## 6. Exact changed paths

1. `ops/c2/root-executor-pair-upgrade.py` — fixed-purpose bootstrap/source/guard/FS/pair journal/recovery CLI.
2. `ops/c2/test_root_executor_pair_upgrade.py` —31 regression tests, real temporary FS and SIGKILL cases, explicit legacy fail-first path.
3. `ops/c2/root_executor_pair_integration.py` — mandatory root/real-owner/child integration aggregate including original FD tests.
4. `ops/c2/fixtures/pair-upgrade/executor-before.json` — small public reverse patch encoded as JSON lines (no whitespace drift); exact fca92db4… baseline reconstructed offline, digest asserted (not another installed executor).
5. `ops/c2/fixtures/pair-upgrade/policy-before.json` — approved public1557byte metadata fixture, exact old digest, no credential/approval creation.
6. `scripts/ci/run-root-bundle-integration.mjs` — same isolated runner/image and cleanup, aggregates old and new mandatory root qualification. CI9 topology/workflow bytes unchanged.
7. `ops/c2/README.md` — source-only invocation/authority/recovery limits.
8. This single factual report.

Old executor implementation, Go/Node C2 runtime, SQL/migrations/schema, ingestion/Notify/HMAC, Frontend/API/Siri, workflow producer, builder, deploy/systemd/sudo/SSH/env/credentials are unchanged. Other reports remain byte-identical; input plan remains in its existing audit worktree. No SSH/VPS read or mutation, artifact dispatch/download/replay, release/tag or promotion in this task.

## 7. Separate installation / execution / recovery runbook (NOT EXECUTED)

Before any real installation, independent Code Review must approve this exact helper PR head/CI9 and full helper digest above, fixed reviewed source packet, exact two-pin policy digest, private backup/journal namespace and rollback procedure. Root custody of an uploaded file is not independent approval. No new sudo/CI-key grant; only existing separately authorized Owner/admin channel may install/invoke the helper. Do not source user .env or read/copy DSN.

After that review and specifically scoped Owner authorization:

1. Fresh bounded read-only preflight: then-current GitHub source/CI compatibility and exact reviewed executor bytes, existing old pair/hash/mode/custody, root parents/ACL/xattrs, idle service/operator/three locks, retained two-stage inventory28backup digests, reader metadata/validated ledger and no pending upgrade/promotion state. Legitimate ledger progress is sampled freshly; no rollback to the historical count/inode. Unexpected state stops, not repaired by chmod/chown/service restart.
2. Independently obtain helper bytes from the reviewed immutable source commit, verify the reviewed helper SHA256, install only at the fixed new root admin pathname via separately approved no-clobber/root custody procedure. This task does not perform or fabricate that installation/approval; do not execute an arbitrary uploaded helper as root.
3. Following commands are **FUTURE ONLY** and require the independently installed exact helper. They are not Source-review tests against VPS:

```bash
sudo /usr/bin/python3 -I -B /usr/local/libexec/aktau-sync-promotion/root-executor-pair-upgrade.py --verify
# Expected ROOT_EXECUTOR_PAIR_UPGRADE_READY, no durable writes.
# After separately authorized one apply:
sudo /usr/bin/python3 -I -B /usr/local/libexec/aktau-sync-promotion/root-executor-pair-upgrade.py --apply
# Expected ROOT_EXECUTOR_PAIR_VERIFIED; NOT publisher source alignment or C2 PASS.
```

4. Independent read-only root metadata/hash/policy readback and existing status request only **after locks release**. Preserve existing workflow pin and both linked new executor hashes; unchanged old publisher/12/C2 authority/site/reader/ledger, service/timer state and retained release history must be proved. No daemon-reload, service restart or artificial cycle.
5. If an operation stops, never call --apply again. Inspect the root-private journal/registered resources first. An independently authorized recovery uses only:

```bash
# FUTURE CONDITIONAL, not a publisher rollback and not an automatic retry.
sudo /usr/bin/python3 -I -B /usr/local/libexec/aktau-sync-promotion/root-executor-pair-upgrade.py --recover
# Or explicitly undo a verified pair before any subsequent publisher promotion:
sudo /usr/bin/python3 -I -B /usr/local/libexec/aktau-sync-promotion/root-executor-pair-upgrade.py --rollback
```

Known backups restore exactly fca92db4… + aea14e7d…, with new registered restore inodes and correct modes, never the older a6ea142f… workflow-policy backup. Unknown/unregistered/torn/foreign resources stay BLOCKED and retained; no deletion/adoption/second initial approval. The journal is separate from publisher interlock; it does not masquerade as a publisher transaction. If publisher/C2 state has since changed, automatic pair rollback is refused.

6. Only after real root pair upgrade/readback and another specific release authorization may the operator create a **new** authenticated manual artifact for the approved current main/CI and one direct promotion. Do not reuse failed artifact12596557937/build40189038360/identity, --initial-reviewed or enable AUTO DEPLOY/SYNC_C2_PROMOTION_ENABLED. Future artifact/main identity is not supplied or approved by this helper. Observe the next genuine scheduled publication for READY/C2; no artificial sync or invented PASS.

## 8. Limits and remaining production gates

- This implementation was **not installed or exercised on the VPS**. All current VPS state references are input-plan historical evidence; no refreshed live claim.
- Root filesystem/UID/process operations and Linux fsync/SIGKILL are real, but do not prove cloud storage behavior under physical power loss. File/directory fsync error injections fail closed; hardware power-cut qualification is not claimed.
- Helper transaction business authority/GitHub responses are modeled; actual reused Host guard composition, UID999/GID987 namespace and GitHub reachability/rate limits must pass future production --verify. The root sandbox actor1999 is intentionally distinct, not asserted to be the VPS UID.
- Recovery deliberately refuses unregistered or ambiguous gaps and does not delete stale known stages to permit a second install. Manual reconciliation/new exact reviewed attempt may be necessary. Safety is preferred to guessing; no hidden fallback.
- Helpers are source-only until independent review, exact-source installation and specific Owner authorization. No change in dataset, legitimate sync, C2 authority, secrets, flags or services is authorized by the test result.

**ROOT_UPGRADE_HELPER_READY_FOR_REVIEW. STOP before merge and all production operations.**
