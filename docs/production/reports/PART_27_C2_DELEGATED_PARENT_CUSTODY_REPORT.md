# Part27 — C2 delegated-parent custody compatibility

Status: **READY_FOR_EXTERNAL_REVIEW**. Source result:
**SOURCE_READY_FOR_REVIEW**. Production installation/activation: **NOT_RUN**.
C2 acceptance remains **0/3 NOT_RUN**; Recovery is an independent input gate.

## Baseline and authority

Owner-approved source-only compatibility fix for the existing operator-owned
`/var/lib/aktau-sync` parent. New native-WSL branch
`feat/part27-c2-delegated-parent-custody` from freshly fetched
`origin/main = 4af79a3db7971ba8143ac7cb7913f47ef03151ce` after PR49. Work date:
2026-10-19 UTC / 2026-10-20 local. Existing worktrees preserved; no reset/rebase.

Reviewed [Part25 and its P1 history](PART_25_RECOVERY_C2_PROVISIONING_REPORT.md),
the outside-Git Part26 handoff, [operator kit](../../../ops/c2/README.md),
installer/tests, existing ops CI profile and production provider/supervisor.
Part26 reported operator-owned0755 parent and missing `/usr/local/libexec`;
those remain dated evidence, not a fresh VPS inventory. No SSH was needed or
performed in Part27. Source main is not a deployed Go/Vercel identity.

This does not authorize installation, independent approval creation, credentials,
new root parents, publisher integration or production observations. Existing Go
API, Frontend, Backend2, DB and Telegram/sync infrastructure were not touched.

## Exact four-path change

1. `ops/c2/install-reviewed-c2.py`: fixed private delegated-parent helper,
   repeated UID/GID/mode/device/inode validation, child target/ledger custody
   checks and descriptor-pinned rollback revalidation.
2. `ops/c2/test_install_reviewed_c2.py`: 19 focused regressions, safe sandbox OS
   account/metadata mocking; all original 25 test bodies retained unchanged.
3. `ops/c2/README.md`: precise exception, parent nonmutation, residual trust and
   independent future install prerequisites.
4. This consolidated report.

No other source, dependency, Go/SQL/DTO/API/Frontend/HMAC, C2 manifest/provider/
FIFO/supervisor, workflow, systemd, backup or secret changes. Historical reports
remain byte-identical. The shared general `Installer.directory()` implementation
is **exactly unchanged**, verified by source-segment comparison with baseline.

## Narrow delegated custody model

`_c2_parent(approval)` is used only for the third fixed target
`/var/lib/aktau-sync/c2`. There is no configurable path/UID, generic exception
list, env override or additional CLI flag. It derives account UID/primary GID
from `pwd.getpwnam('aktau-sync')`, requires the validated independent
`approval.operatorUid` to match, and rejects invalid GID values. It does not
create accounts, memberships, sudo/ACL grants or credentials.

The root-only walker pins `/var/lib`; the literal `aktau-sync` directory is
opened relative to that fd with O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC. fstat requires
directory type, exact account UID/GID and exact0755 (therefore no effective
group/other write, including ACL-mask writes). Current linked directory must
have the same device/inode and expected mode. Identity is retained and checked
again before receipt writes, stage publication and deletion. Replacement,
owner/group/mode drift or symlink blocks the operation, not an automatic repair.

All other paths retain root-only ancestry: installer, approval, receipt, bundle,
`/etc`, `/usr/local/libexec`, `/var` and `/var/lib`. Root authorization and
artifact bytes are never admitted through the delegated parent. The first two
targets retain root ownership/content checks; root target directory ownership,
group and modes are additionally checked on rollback.

New C2/ledger directories remain operator-owned0700 in production. Sandbox
tests map newly created ownership to the actual nonroot test user, as the old
profile did; OS identity/parent metadata mismatches are modeled safely without
real foreign chown. Before handover, new stages must be linked to their pinned
fd, root-owned0700 and initially empty. After rename the target inode and
expected custody are checked again. Read-once artifact digests, independent
approval, canonical bounded JSON, exclusive receipt, no-clobber rename, partial
write loops and fsync protections are preserved.

Rollback validates target and ledger type/owner/group/mode and pinned inode,
keeps child descriptors for revalidation, and requires an empty inactive ledger.
Observed replacements, foreign files, reader credentials, active state, invalid
receipt or orphan staging block **before deletion**, preserving receipt/resources
for manual reconciliation. P1 inventory still covers all three fixed parents,
even if a partial receipt lacks later intents. Unknown stages are never adopted
or removed based on a matching name. No automatic stale-lock cleanup/retry.

No operation chowns/chmods the existing delegated parent or writes unrelated
siblings. A later separately approved install necessarily adds its own new
C2 child/stage entries, not modifications to existing Backend2 state. Parent
UID/GID/mode/inode and sibling bytes are verified unchanged across the local
successful install/rollback test; future directory-entry changes naturally
affect parent timestamps. No production parent contents changed in Part27.

### Residual risk / operator cooperation

An operator-owned parent is **not** root-controlled approval. Its owner can
change children or permissions between syscalls or after installer exit. Pinned
fds and repeated checks detect observed substitution; they do not provide an
atomic filesystem transaction against a malicious concurrent owner. Authorized
operator/admin must exclude concurrent C2 mutation during install/rollback.
No claim of zero operational risk or protection against a malicious root is
made. Root authority/binaries/receipt remain outside that mutable subtree.
Any observed ambiguity leaves an interlock for manual review rather than a
blanket cleanup or permission repair.

## Fail-first and local test evidence

Before implementation, the initial 10 new cases plus original 25 were executed
against the baseline installer: **exit1, 35 tests, 2 assertion failures and
5 errors**. Correct delegated custody failed the old root-only traversal;
tests expecting a later race check also could not reach their injected point.
This was not production evidence. The old tests were not weakened to pass.
Nine additional regression methods then broadened edge coverage.

Final Python result: **44/44 PASS**, original25 + new19, no skipped cases.
Coverage includes verified UID/GID0755 positive install/rollback; invalid UID/
GID/modes/account approval; symlink/non-directory; inode replacement between
open/fstat and after inventory; parent drift during rollback; target/ledger
replacement/ownership/mode; nonempty ledger/foreign reader; crash/orphan at all
three targets; registered partial stage rollback; root-only approval/bundle/
receipt/ancestor protection; env path/UID override ignored. Parent and unrelated
sibling contents/metadata are preserved. All fixtures are disposable and local.

| Executed command/check | Actual result |
| --- | --- |
| `python3 -B -m unittest discover -s ops/c2 -p 'test_*.py'` | exit0; 44/44 PASS |
| `node --test scripts/ops/prepare-recovery-operator.test.mjs scripts/ops/c2-provisioning-plan.test.mjs` | exit0; 17/17 PASS, 0 SKIP; wrapper requires the full Python suite |
| `node scripts/ci/run-checks.mjs ops` | exit0; 177/177 PASS, 0 SKIP |
| `node scripts/ci/run-checks.mjs security` | exit0; source/workflow policy and existing backup synthetic guards PASS |
| `node scripts/revalidation/verify-part16.mjs` | exit0; static boundaries only |
| Local Go1.27.2 `go build` of existing relayprobe, supplied as C2_LOCAL_PROBE | exit0; test tool only |
| `node --test scripts/revalidation/*.test.mjs scripts/ci/guard.test.mjs` | exit0; 286/286 PASS, 0 SKIP |
| Python AST, original root walker/source and original25 test-body preservation | PASS |
| JS syntax, Markdown links, exact scope, bounded privacy, `git diff --check` | PASS |

Node24.10.0 and Go1.27.2 were explicitly selected, GOTOOLCHAIN=local, tests ran
nonroot. No separate local Go unit/race/vet, PG17 integration, backup/restore or
Next build was run for this Python-only change; none is claimed as new local
PASS. The mandatory exact-head hosted CI is separately checked before handoff;
its 9/9 requirement is not replaced by local results or an older head.

## Publication and review artifact

After local gates: one scoped commit, ordinary push of this new branch and a
Draft PR to main. Commit/PR/exact-head CI URL and outcome are supplied in the
final handoff, not inferred from baseline CI. No merge or production workflow
dispatch. The unchanged repository full-stack archive script produces a fresh
uniquely named Part27 TAR.GZ; safe regular/unique members, source byte-match,
history preservation and SHA256 are verified and supplied externally, avoiding
self-referential archive hashes in the archived report.

## Remaining production gates / rollback posture

1. Independent source review and Owner merge; then independently approve exact
   immutable artifacts/installer and establish root-controlled trust inputs.
   This source fix does not create approval.json or manufacture approved flags.
2. Fresh authorized preflight must verify existing account UID/GID0755 parent,
   all root-only ancestry, absent targets/orphan/receipt interlocks and root
   artifact/approval custody. Missing `/usr/local/libexec` or other root parents
   must be prepared only under separate reviewed installation authority.
   Never change the existing operator parent's ownership/mode as a workaround.
3. Exact Vercel READY Production alias/deployment/frontend SHA proof, restricted
   C2 reader, independently approved private namespace and Backend2 BEFORE hook
   before canonical mutation remain separate. No ingest/hook change here.
4. Only after those gates may a separate approved operator run `--verify` and
   one inactive install, then verify hashes/modes/inactive state. No automatic
   reader/deployment record/FIFO/service/timer activation is included.
5. Actual C2 acceptance still requires three qualified genuine publications,
   unchanged 5s shared SLA, <=20s diagnostics, <=21 GET/2 sitemap, 35-minute
   supervision, true204/FIFO/AFTER/cleanup custody. No artificial sync or notify.
6. Recovery remains independently RECOVERY_BLOCKED_INPUT from the previous
   operator handoff until an approved dedicated backup handle is supplied;
   no API/ingest/admin credential substitution or fresh restore claim here.

Rollback in production was NOT_RUN because no production resources were created.
The sandbox positive/crash/interlock cases verify only own-resource inactive
rollback. Future orphan/partial/live/ownership drift means BLOCKED and manual
reconciliation; never delete foreign state, backups, secrets or services.

Part27 production accounting: **0 SSH/HTTP/SQL/Redis**, **0 installation or
permission changes**, **0 publish/sync/HMAC/C2 observations**, **0 systemd or
Telegram changes**. Existing `/var/lib/aktau-sync` was not accessed or modified
on VPS. No production private data, host identifiers, credentials or raw logs
are present in source/report/archive. STOP for independent Code Review.
