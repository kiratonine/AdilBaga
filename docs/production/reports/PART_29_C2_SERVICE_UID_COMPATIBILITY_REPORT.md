# Part29 — C2 Service UID Compatibility

Date: 2026-10-20. Status: **READY_FOR_EXTERNAL_REVIEW** (source candidate only).
No production execution or installation approval is implied.

## Scope and baseline

Fresh `origin/main` / base: `dd55ab620e9ab4dcf149edadbbbe0c2bd7d40e09`, after
merged Part27 PR50. Separate native-WSL branch `fix/part29-c2-service-uid`,
worktree `/home/denis/tmp/aktau-part29-c2-service-uid`. Main was re-fetched and
remained unchanged before publication. Existing worktrees/untracked reports
were preserved. Only these four files belong to this change:

- [installer](../../../ops/c2/install-reviewed-c2.py)
- [existing Python suite](../../../ops/c2/test_install_reviewed_c2.py)
- [installation README](../../../ops/c2/README.md)
- this report.

Part28 directly observed the existing literal `aktau-sync` account has a
positive system UID below1000; its parent matched the account UID/primary GID
and0755. This is prior operator evidence, **not a fresh production observation**.
The old `admission()` required operatorUid>=1000, so correct real custody could
not satisfy installation admission. No numeric production UID/GID is published.

## Minimal source fix

`type(operatorUid) is int and operatorUid > 0` replaces the numeric1000 floor.
The existing private `_operator(a)` now runs directly in admission in both
production and the disposable sandbox. It resolves only the literal existing
OS `aktau-sync`, requires exact integer UID equality, and validates primary GID
using the unchanged type/range policy. Unknown account/foreign UID fails closed.
There is no configurable account, UID, path or env override.

UID0, negatives, booleans and noninteger JSON values remain rejected before
writes. The current general root-only directory walker, primary-GID/owner/mode
checks, pinned device/inode and no-follow checks, independent approval fields,
canonical JSON, file inventory/hashes, no-clobber publication, fsync, all-three-
parent crash/orphan and own-resource rollback gates are unchanged. No Go/SQL/
Next/API/HMAC/scheduler/dependency/CI workflow changes.

The test-only delegated-account context gained optional synthetic UID/GID
arguments; original defaults and every original test method are preserved.
No real host account or ownership is changed by tests.

## Fail-first and regression evidence

Before changing installer source, added nine regression methods and ran:

```bash
python3 -B -m unittest discover -s ops/c2 -p 'test_*.py'
```

**exit1;53 tests,2 assertion failures,5 errors.** The positive UID999 admission,
install/rollback and crash exercises failed at the old1000 floor. Separately,
unknown-account and foreign-UID admission tests exposed the sandbox's previous
absence of the production account lookup at admission. Existing install custody
still rejected invalid parents; this was not a claim of a production bypass.
These historical failures were not hidden by skipped tests or altered assertions.

After the two narrow production-code changes: **exit0;53/53 PASS,0 SKIP**.
Original44 cases remain, plus9 new methods covering:

- synthetic positive service UID999 / primary GID998 and regular UID42001;
- sandbox install and exact rollback, unchanged parent/sibling contents;
- UID0/negative/bool/float/string and absent/foreign account rejection;
- invalid OS primary GID type/range and wrong parent's primary GID;
- independent crashes after mkdir/before intent at each of three target parents,
  preservation of orphan/receipt and rejection of a second install.

The original44 retain root-custody, symlink, inode/mode/owner drift, exact target
and ledger, partial writes/fsync, registered partial rollback and ambiguous
orphan/torn-receipt protection. All installation/rollback calls in these tests
use disposable local sandbox paths; no production installer was invoked.

## Commands and actual local results

Selected toolchains: nonroot Node24.10.0, Go1.27.2, GOTOOLCHAIN=local.

| Command/check | Exit / actual result |
| --- | --- |
| Python full installer suite above, baseline with new tests | 1;53 tests,2 failures/5 errors (intentional fail-first) |
| Same suite after fix | 0;53/53 PASS,0 SKIP |
| `node --test scripts/ops/prepare-recovery-operator.test.mjs scripts/ops/c2-provisioning-plan.test.mjs` | 0;17/17 PASS,0 SKIP; includes actual Python sandbox suite |
| `node scripts/ci/run-checks.mjs ops` | 0;177/177 PASS,0 SKIP |
| `node scripts/ci/run-checks.mjs security` | 0;source/workflow policy and synthetic backup guard PASS |
| Go1.27.2 build of unchanged local relayprobe into an owned temporary directory | 0;test prerequisite only |
| `C2_LOCAL_PROBE="$LOCAL_PROBE" node --test scripts/revalidation/*.test.mjs scripts/ci/guard.test.mjs` | 0;286/286 PASS,0 SKIP |
| `node scripts/revalidation/verify-part16.mjs` | 0;static boundaries PASS |
| Python AST + original44 test-method body comparison against base | 0;all original44 unchanged |
| `git diff --check`, exact four-path scope,7 local Markdown links, bounded privacy scan | 0;PASS |

Exact-head hosted CI is recorded in the final publication handoff, not inferred
from the base CI. No unchanged full local Frontend/Go/PG17 sweep is claimed.
The PR's mandatory nine hosted jobs must independently complete SUCCESS;
pending/skipped jobs cannot substitute for this gate.

## Production handoff and residual gates

**Part28 staged resources remain an unapproved old candidate**, not a reviewed
delivery of this source. They were not accessed, overwritten, removed or adopted
in Part29. Future source merge needs a new exact-SHA build, binary/clock/Node/
installer digests, independent Owner artifact review, root custody and a
separate explicit one-time inactive-install permission. No self-approved record
or fabricated credentials/attestations are created here.

Do not renumber UID/GID or chmod/chown the existing service account/parent.
Future preflight must again match the real literal account and primary GID,
mode0755/inode, absent targets and all orphan/receipt interlocks. Existing staging
replacement needs its own no-clobber/reconciliation authorization, not automatic
overwrite. Production rollback/activation is NOT_RUN; no permission is granted
to delete or modify any existing VPS resource by this source review.

Restricted reader, actual Vercel alias/deployment identity, Backend2 BEFORE-
before-canonical-mutation integration and genuine FIFO204/AFTER/cleanup remain
separate gates. C2 production acceptance remains open, not measured here.
Recovery and Telegram are untouched.

Part29 accounting: **0 production SSH/HTTP/SQL/Redis**,0 VPS changes,0 approvals,
0 production install/rollback,0 sync/publish/observer/deploy/service/timer changes.
Owner expressly authorized only scoped Git commit, ordinary push and Draft PR
after local checks, not merge or production actions. STOP for independent review.
