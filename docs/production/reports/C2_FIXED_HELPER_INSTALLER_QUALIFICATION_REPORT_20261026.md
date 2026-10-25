# C2 fixed-purpose helper installer — qualification, 2026-10-26

**HELPER_INSTALLER_READY_FOR_REVIEW** (repository status: **READY_FOR_EXTERNAL_REVIEW**). Source-only implementation and local Linux qualification; **no VPS connection or mutation** in this task. Installation, helper CLI modes, executor/policy upgrades and promotion remain separately authorized future operations.

## 1. Scope and immutable inputs

Owner approved as plan the previous `C2_HELPER_INSTALL_EXECUTION_PLAN_REPORT_20261026.md`, SHA256 `87ebade114c2695064376a2391af540da627be96b1690f9a26970118aa9f6200`, retained in `/home/denis/tmp/aktau-c2-helper-install-review-20261026/docs/production/reports/`. This implementation qualifies its section5.2. That previous report/source history was not rewritten or copied as new evidence.

Base and fresh origin/main: `f38941cf1e007fef251c4b1964629ee523a15327`. Native worktree `/home/denis/tmp/aktau-c2-fixed-helper-installer`; branch `feat/c2-fixed-helper-installer`. Original Windows checkout has existing unrelated untracked files; untouched. No other worktree changed.

Exactly five changed paths:

1. [Installer source](../../../ops/c2/install-root-executor-helper.py) — new fixed-purpose transaction, strict source proof and production admission.
2. [Installer tests](../../../ops/c2/test_install_root_executor_helper.py) — new real filesystem/unit/crash regressions.
3. [Existing root integration entry](../../../ops/c2/root_executor_pair_integration.py) — retains old suites and adds installer/root ownership qualification.
4. [C2 README](../../../ops/c2/README.md) — source-only installation contract.
5. This report.

The approved helper `ops/c2/root-executor-pair-upgrade.py` remains byte-identical: source commit **f38941cf1e007fef251c4b1964629ee523a15327**, Git blob `cc002eb4d3eaa26865ebcf3439fbe1a0139fd1e3`, **34494 bytes**, SHA256 **98d1d5a4311a2e45b6ceb543558b40f2fc5d2c4826e064ed3f4ec5712a85fe68**. No executor, policy, producer workflow, Go, SQL, frontend, C2 runtime or public contract changed.

## 2. Concrete installer and trust boundary

Installer SHA256: `536208d38dacf0d8878c19e21f068f80eccd27f9f1956f20f0325fea1ab7afc6` (32491 bytes); Git blob `6cad634c07228eaa07bdefe70def7f18a1217fb5`. This digest identifies the installer code, **not** the helper payload. Future execution additionally requires independent review/approval of this exact installer and its CI/source commit. PR source approval does not install anything.

Production CLI accepts only `--install`, `--readback`, `--rollback-install`, requires real/effective UID0 and isolated `python3 -I -B`, with a 120-second overall alarm and cancellation handling. There is no stdin/upload execution, path/source/UID/credential/sandbox/env override or general shell command. Tests inject filesystem/business models through Python objects only; those injection hooks are not exposed by CLI/env.

Installer independently obtains the helper from GitHub HTTPS using the existing installed old executor's bounded no-proxy/no-redirect client: fixed repository, exact source commit and Contents path, base64/type/size/blob/SHA checks, frozen push-main CI40230819477 and exact nine successful jobs. Missing/unavailable/incorrect authorization, skipped jobs or tampered payload fail before resources are written. Downloaded helper is **syntax-compiled but never executed**, including module definitions; no helper mode runs.

Only existing installed executor **definitions** are loaded for read-only admission after strict root file custody, 56173-byte length and digest `fca92db4cda0d94d25f6b7afbe314cb9bac94fff024f619eb94a24a365330670`. Its `main()`/promotion functions are not invoked. The installer contains its own fixed filesystem/admission implementation derived from reviewed code; it does not import executable files from an upload or writable checkout.

The installer itself must reach root via a separately reviewed immutable bootstrap, section6; not `sudo python uploaded.py`. The only transferred authority is Owner-reviewed fixed source/digest; public payload bytes from a caller are not accepted as authorization.

## 3. Transaction and preserved state

Fixed target: `/usr/local/libexec/aktau-sync-promotion/root-executor-pair-upgrade.py`. Original target must be absent even if existing bytes match. Staging: `/usr/local/libexec/aktau-sync-promotion/.root-executor-pair-upgrade.py.install-f38941cf.pending`. New root0700 install namespace: `/var/backups/aktau-c2-helper-install-20261026-f38941cf`.

Sequence:

1. Independent source/CI proof before locks; bounded network, no fallback. No downloaded code execution.
2. Existing no-follow root-owned ingress→runtime→controller lock FDs, exact mode/nlink/empty-content validation, exclusive nonblocking flock; no new locks or service stops. Root ancestry FD traversal rejects symlink, group/world write, ACL/xattrs. Production parent CAS is fixed to approved device/inodes (ROOT64770/935172, backups64770/34573), modes0755; drift blocks without override.
3. Under locks: exact old executor and policyAEA hashes, publisher/source authority alignment, 6 runtime pins/12 closure hashes, retained two releases and28 backup digests, wrappers and active/enabled timers, idle actor/services/completed journal; no interlocks/attempts/pair resources. Reader metadata only; ledger validated via pinned existing codec. No reader contents/hash copied. Invalid or changed state blocks.
4. Exclusively create install directory0700; persist root0600 `intent.json` including original absence, parent/directory identities, protected snapshot; root0600 verified public helper copy. File and parent fsync. No pair-upgrade backup/journal creation.
5. Same-parent O_EXCL/O_NOFOLLOW/O_CLOEXEC staging0600; full write loop, mode0755, file+directory fsync, readback hash/size/FD/name CAS. Persist append-only root0600 `receipt.jsonl` with intent/copy/stage identities. Receipt lines are canonical, previous-content-hash chained, strict phase/field schemas. Partial/torn lines reject; never truncate/repair a receipt.
6. Recheck protected state/parents/retained files. `os.link(..., follow_symlinks=False, dir_fd=...)` atomically creates final name without overwrite. Verify both names/heldFD/hash and nlink2, persist linked phase, then unlink only own staged inode and fsync. Verify final nlink1/root0755/exact hash. Persist committed after independent read-only protected-state checks.
7. On cancellation/error/SIGKILL: no broad cleanup, no automatic retry. Unknown/unregistered directory, source-copy/stage gaps or link-before-receipt gap remain BLOCKED and preserved for manual reconciliation. The final target may exist in a blocked incomplete transaction; **this is not success**.

Root helper installation only adds one executable plus its own private evidence namespace. It does not edit the old executor/policy or either pin. All other root/runtime records, prior workflow backup, reader/ledger contents, retained releases and systemd state are protected invariants. No new sudo, SSH identity, service or runtime privilege is added.

## 4. Explicit installation rollback and partial-state rules

`--rollback-install` is a distinct installer operation requiring separate future authorization, not the helper's `--rollback` and not publisher `--rollback-last`. It takes the same three locks and runs the same admission. Receipts/source copy remain after rollback; reinstall is blocked.

- Registered staged-only, linked, committed states can roll back only inode/hash/mode/owner-matching own resources. Rollback intent is durable before first unlink. A crash during registered unlink resumes only that intent; final names are never adopted merely because bytes match.
- Unknown stage/final/backup namespace, moved directory, replaced inode (even same bytes), tampered copy/intent, torn receipt or foreign file blocks before deletion. Evidence/resources stay intact.
- Source helper's pair journal/backup must still be absent and old executor/policy unchanged. If a later root-pair upgrade/promotion occurred, installer rollback is no longer applicable and blocks.
- Ledger may have a valid append between independent idle windows, but original entry history/stable state must match; within one protected window its snapshot must remain unchanged. Reader metadata remains protected, not credentials.
- After a rollback-completed record a second rollback/install is rejected. No automatic orphan cleanup or ownership guessing.

## 5. Actual local qualification

All tests use owned local temporary files or disposable Docker. **No production SSH/HTTP/SQL**, no real DSN, service, sync or artifact promotion.

| Command / qualification | Actual result |
| --- | --- |
| `python3 -B -m unittest discover -s ops/c2 -p test_install_root_executor_helper.py` | 26/26 PASS, exit0, no SKIP |
| `node scripts/ci/run-root-bundle-integration.mjs` | **69/69 PASS**, exit0, no SKIP; final root sandbox qualification |
| `node scripts/ci/run-checks.mjs ops` | Python **190/190** and Node **185/185** PASS, exit0; 0 SKIP |
| `node scripts/ci/run-checks.mjs security` | PASS, exit0; source guard + 1 synthetic backup test |
| `node scripts/revalidation/verify-part16.mjs` | PASS, exit0; static evidence only |
| Python compile of changed Python paths and bootstrap shell/Python/argv syntax | PASS, exit0; no candidate execution |
| Go/C2 profile | PASS, exit0: full Go test/race/vet/staticcheck/integration-tag staticcheck/govulncheck, READY large-ELF2CPU qualification, API/ingest builds; C2/guard Node **357/357**, 0 SKIP |
| exact-PR-head hosted CI | Required before final delivery; authoritative per-head result is linked in the publication section below |

The root sandbox is Linux UID0, network=none, read-only rootfs and `/src` bind, own writable tmpfs, caps dropped except fixed SETUID/SETGID/CHOWN/DAC_OVERRIDE/KILL, bounded CPU/memory/PIDs. Existing distinct-UID runuser/Git/Go and pair/crash suites retained. Real UID1999 cannot read root-private install source/receipt. Foreign UID on old executor/parent/lock is rejected. UID0 files, ownership/modes, symlink/xattr and actual POSIX ACL operations, hardlinks, inode replacement, locks, append/fsync and unlink are real filesystem behavior; business/GitHub authority in the sandbox is explicitly modeled.

Independent live GitHub helper Contents/CI9 proof was additionally run **locally**, exit0, and byte-matched the unchanged helper; this is not a production connection.

26 new focused tests include: success/readback, existing matching and foreign target, invalid size/SHA/type, all three busy/missing/mode/content locks, ancestor symlink, hardlink and real POSIX ACL, stage/final race, parent replacement, protected-state drift, SIGKILL at9 install points and4 rollback points, partial128-byte staging, short write loops, torn receipt, rollback preservation/reinstall rejection, unknown file/intent fields, foreign final/copy/intent inode, unlink race, cancellation/fsync failure, valid ledger append, FD-leak checks and rejected CLI overrides/source/CI metadata. Root-specific suite adds two actual ownership/distinct-UID tests. Method counts are not individual subcase counts.

Earlier local root runs66/66 and68/68 passed before additional coverage; final69/69 includes new pending/backup custody tests. These are not production C2 PASS. Historical INCONCLUSIVE/PASS counters are not modified.

## 6. Future one-time installation command — NOT EXECUTED

Requires a new explicit Owner production authorization, independent exact installer source/digest approval, completed source CI, and a fresh read-only idle/preflight window. No authorization is created by this report. The helper remains sourcef389; delivery of the installer from its separately reviewed PR commit does not rewrite the helper's frozen source or policy.

The following root bootstrap fetches the **installer** itself independently from exact GitHub source. It never trusts an uploaded executable. Before execution Owner/admin must compare `b047be17354dae93675add2d9ad95315573f34dc` and digest with independent review; immutable commit is fixed below after the source commit is created. The bootstrap is a fixed reviewed literal run by the existing Owner admin channel, not a new sudo/SSH grant.

```sh
ROOT_COMMAND=$(python3 -I -B - <<'BUILD_FIXED_COMMAND'
import shlex
body = r"""import base64, hashlib, json, os, sys, signal, urllib.request
signal.signal(signal.SIGALRM, lambda *_: sys.exit(1))
signal.alarm(20)
if os.getuid() != 0 or os.geteuid() != 0: raise SystemExit(1)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args): raise RuntimeError("redirect_blocked")
url = "https://api.github.com/repos/kiratonine/AdilBaga/contents/ops/c2/install-root-executor-helper.py?ref=b047be17354dae93675add2d9ad95315573f34dc"
request = urllib.request.Request(url, headers={"Accept":"application/vnd.github+json","User-Agent":"AdilBaga-Reviewed-Helper-Installer/1"})
with urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect()).open(request, timeout=8) as response:
    if response.status != 200 or "application/json" not in response.headers.get("Content-Type",""): raise SystemExit(1)
    data = response.read(131073)
if len(data) > 131072: raise SystemExit(1)
value = json.loads(data)
if value.get("path") != "ops/c2/install-root-executor-helper.py" or value.get("type") != "file" or value.get("encoding") != "base64" or value.get("size") != 32491 or value.get("sha") != "6cad634c07228eaa07bdefe70def7f18a1217fb5": raise SystemExit(1)
raw = base64.b64decode(value["content"].replace(chr(10),""), validate=True)
if len(raw) != 32491 or hashlib.sha256(raw).hexdigest() != "536208d38dacf0d8878c19e21f068f80eccd27f9f1956f20f0325fea1ab7afc6": raise SystemExit(1)
sys.argv = ["independently-verified-installer","--install"]
exec(compile(raw,"independently-verified-installer","exec"),{"__name__":"__main__"})"""
compile(body, 'reviewed-bootstrap', 'exec')
print('sudo -n /usr/bin/python3 -I -B -c ' + shlex.quote(body))
BUILD_FIXED_COMMAND
)
timeout --signal=TERM --kill-after=5s 150s \
  ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o ForwardAgent=no \
  -o ConnectionAttempts=1 -o ConnectTimeout=10 -o ControlMaster=no \
  -o ControlPath=none my-vps "$ROOT_COMMAND"
```

Bootstrap download has a20-second alarm, installer a120-second alarm; caller timeout150seconds plus5-second kill grace bounds the SSH client. On disconnect/error wait for reconciliation rather than retry. Run once, no retries. No uploader manifest, `curl|sudo python`, insecure host verification, arbitrary path/command input or helper execution. Capture only sanitized status. Expected `HELPER_INSTALLED_NOT_EXECUTED`, exit0, plus independent readback; no READY/C2 PASS implied. Any nonzero/unknown/timeout state: stop and inspect registered resources, do not run install again or issue helper recovery.

### Safe future readback

Reuse the **identical reviewed bootstrap and pins** above, changing only its fixed `sys.argv` mode from `--install` to `--readback`. Expected `HELPER_INSTALL_READBACK_VERIFIED`, exit0. This is installer metadata/hash/admission readback; it never invokes `root-executor-pair-upgrade.py --verify`. Separately compare fixed final root0:0/0755/nlink1/34494/SHA98d, unchanged old executor/policy, both retained releases, reader metadata, ledger and timers. Reader content must never enter a command output.

Explicit rollback, if separately authorized and prerequisites still hold, uses the same verified bootstrap with only mode `--rollback-install`; expected `HELPER_INSTALL_ROLLED_BACK`. No helper `--apply/--recover/--rollback`, sourceSha rewrite, promotion or blind cleanup is part of this installation command.

## 7. Known limits, risks and stop conditions

- This is source qualification, not production installation; historic VPS evidence is in the previous report, not freshly re-collected here. Production parents/actor/source/closure must pass again at execution time; there is no override for drift.
- Trusted root control/advisory lock cooperation is assumed. A malicious independent root actor can change the kernel/filesystem; this code cannot defend against root or storage dishonesty. Required POSIX hardlink/flock/fsync/ACL behavior is qualified on Linux only; unsupported FS blocks and preserves resources.
- SIGKILL can leave a partially written receipt/unknown inode or final helper before commit. Safety takes precedence over automatic availability: do not delete/adopt guessed resources. Manual reconciliation with separate approval may be required.
- Receipt crash tests prove actual SIGKILL behavior, not physical power-loss durability of every disk/controller. fsync ordering is explicit; storage must honor it.
- Fixed source metadata/CI/GitHub TLS unavailable, size/SHA mismatch, wrong owner/mode/ACL, busy lock, changed parent/inode, unknown namespace/record, active actor/attempt, source/closure/release drift, modified history, insufficient space/read-only FS: BLOCKED. Never relax guards to install.
- The source helper/executor pair is unchanged and not yet upgraded by this work. Helper installation alone does not fix the old bundle import at runtime or authorize new manual-artifact/promotion. No new GitHub Environment, root policy or secrets were touched. AUTO DEPLOY stays unchanged/off.

No merge or production operation is performed. STOP for independent source/installer review before any VPS mutation.


## 8. Source publication gate and final integrity

Immutable installer-source commit: `b047be17354dae93675add2d9ad95315573f34dc`. The separate report commit pins that already-created source commit in section6 to avoid a self-referential report/commit hash. The installer code digest is identical across both commits. Source-only PR base=main; no merge/deployment authorized.

Hosted exact-head CI is an independent publication gate, not inferred from local tests. The final handoff must identify the actual PR HEAD/run and all9 job conclusions; pending/skipped/failure must not be reported as success. Review the authoritative [branch CI checks](https://github.com/kiratonine/AdilBaga/actions/workflows/ci.yml?query=branch%3Afeat%2Fc2-fixed-helper-installer). The final delivery records the observed exact-head result separately; this immutable source report does not pre-assert the outcome of a queued CI run.

Integrity checks before publication: exact five-path diff; approved helper/executor/policy/runtime source unchanged; prior plan SHA87ebade1… preserved; all local report links exist; report shell command, embedded Python and remote argv round-trip compile/parse without invoking SSH; source guard and bounded privacy patterns; `git diff --check`. Installation command remains NOT EXECUTED.
