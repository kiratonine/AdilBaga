# C2 root-private bundle FD import fix — 2026-10-25

Status: READY_FOR_EXTERNAL_REVIEW (source-only; production promotion remains blocked pending independent review).

## Baseline and evidence boundary

- Base `origin/main`: `8d4e78da0f4a927a0e7bdc1f83dcaec56634aca7`, fetched again before publication; separate native-WSL branch `fix/c2-root-bundle-fd-import`.
- Root rules and assigned source-only task were read from the main checkout. Other worktrees and historical reports are preserved.
- Historical production diagnosis comes from `PR72_PR74_C2_DIRECT_VPS_PROMOTION_EXECUTION_REPORT_20261025.md`, R3–R9: root could read the authenticated bundle, UID999 could not traverse root-owned releases/0700. Previous promotion rolled back. These are historical observations, not new VPS readback.
- This task performed **zero production SSH/HTTP/SQL**, no workflow dispatch, approval/pin migration, release, installation or publication. Failed artifact `12596557937` was not reused. No `--initial-reviewed` execution.

## Root cause and minimal transport correction

Confirmed import-boundary defect: `Host.import_source()` handed an inaccessible private pathname to Git running as `aktau-sync`. Readability of the child bundle (0444) does not grant traversal of its root-private parent.

Root now opens only the internally constructed release/source.bundle via existing directory-descriptor custody plus O_NOFOLLOW/O_DIRECTORY and openat O_RDONLY/O_NONBLOCK/O_NOFOLLOW/O_CLOEXEC. It requires a regular root-owned single-link exact0444 file, nonempty bounded size, authenticated manifest SHA256, and unchanged file/directory identity before/after hashing and successful fetch. Hashing is streamed and bounded. Public CLI/schema/env provide no new path, command, UID or FD override.

Only this verified read-only FD is explicitly inherited by fixed `runuser -u aktau-sync -- git ... fetch --no-tags /proc/self/fd/N <sourceSha>`. Host.git rejects other FD-bearing invocations. Parent-directory descriptors and unrelated root descriptors are not inherited. FD lifetime ends before source postchecks, including exceptions/cancellation. Existing unknown-cleanup error is preserved so transaction interlock prevents a racing rollback.

The cleanup probe now explicitly closes its /proc scandir iterator on early return; TERM/KILL policy and process-group/interlock semantics are unchanged. This removes a ResourceWarning observed in the real timeout regression rather than hiding it.

Tree, blob, ancestry/bridge, protected paths, tooling dependency allowlist, Dina/SCRUM-19, clean publisher, all12 closure hashes, immutable Go metadata/source, journal/no-clobber, invariants and coupled rollback remain required. No chmod/chown/ACL workaround or public staging copy was introduced.

## Reproducible fail-first and distinct UID proof

Mandatory Docker sandbox: digest-pinned Ubuntu24.04, root UID0 and actual `aktau-sync` UID1999 (not a fake UID or same-user mock), actual runuser and Git, root-owned releases0700/child0755, valid Git-generated root0444 bundle, writable operator-owned Git repository. No network, host Docker socket, services, production data or credentials are exposed to the running container. Repository and Go SDK are read-only mounts; only private tmpfs is writable. Five necessary capabilities are bounded explicitly; no privileged container.

1. Baseline executor from exact8d4e78d mounted over the source, with the same test `RootBundleTests.test_actual_host_import_across_private_parent`: exit1, `promotion.Blocked: command_failed` at the old pathname fetch. Direct operator pathname access fails; root has valid bytes. No fixture TypeError or missing prerequisite.
2. Corrected executor, same scenario: PASS. Actual operator tree and committed blob match; private parent stays0700 and sibling private file remains unreadable.
3. Full mandatory root profile: **7/7 PASS, 0 SKIP, exit0**. Actual Go1.27.3-built synthetic CLI binaries are metadata/source-verified; actual Git import, detached source switch, all12 local file/authority updates, committed receipt, explicit coupled rollback and receipt inventory are exercised through the real Transaction/Host methods. A failed fetch rolls back to the prior clean source/closure; replay is rejected. Reader/ledger model bytes and inodes survive. This is disposable integration, not production trust or production convergence evidence.

The coupled fixture models service/GitHub authority and reader/ledger state explicitly; it does not call systemd, production APIs or a database. Synthetic Node/JS files are not claimed to be running production observer evidence. Actual provider/READY/C2 flow is additionally covered by the separate unchanged Go/Node/PG17 integration profile.

Negative coverage includes digest mismatch; same-inode byte tamper with restored mtime; file/directory inode swap; no-follow symlink/FIFO; hardlink; wrong root owner/mode; zero/oversized sparse file; truncated bundle; missing/closed inherited FD; wrong SHA/tree; real runuser/Git rejection; actual operator descendant timeout/cleanup; cancellation; preserved cleanup-unverified error; no unrelated inheritable FD; replay/interlock/orphan/crash recovery and original transaction/receipt guards. Existing tests are retained.

Intermediate fixture failures were fixed without weakening assertions: initial repository bootstrap used an unsafe cross-owner Git directory (replaced with the generated public bootstrap bundle); timeout expected the wrong existing class (corrected to command_deadline); fixture omitted initialBridge; a truncated bundle whose requested object was already cached did not guarantee Git rejection (negative transaction now also requests an absent SHA; separate fresh-repository truncated-bundle rejection remains). All final negatives assert the intended boundary; the transaction negative specifically requires command_failed.

## Mandatory CI integration

[CI workflow](../../../.github/workflows/ci.yml) retains its nine-job topology. Go Quality includes an unconditional `node scripts/ci/run-root-bundle-integration.mjs` step. Missing Docker/root sandbox/Go1.27.3 fails; tests do not skip. The image uses actual UID1999, no network and bounded memory/CPU/pids/tmpfs. The runner removes only its own uniquely named container/image, including failure cleanup.

The producer workflow `.github/workflows/sync-publisher-build.yml` and `.github/workflows/sync-publisher-promote.yml` is unchanged. No GitHub Environment, required checks, permissions or deployment settings were modified. Exact PR head and hosted CI run/job results are recorded in the PR body and final handoff; pending/skipped jobs are not treated as success. Source publication is allowed by this task; merge and deployment remain forbidden.

## Commands and actual local results

All commands run from this worktree using RTK proxy, Node24.18.0/pnpm10.32.1 and Go1.27.3 (GOTOOLCHAIN=local).

| Check | Actual result |
| --- | --- |
| Baseline `python3 -B -m unittest discover -s ops/c2 -p 'test_*.py'` before fix | exit0,123 tests PASS |
| Baseline real root/runuser import regression | exit1, expected command_failed |
| `node scripts/ci/run-root-bundle-integration.mjs` | exit0,7/7,0 SKIP; distinct UID import + coupled rollback |
| `python3 -B -m unittest discover -s ops/c2 -p 'test_*.py'` (final, also run by ops profile) | exit0,133/133,0 SKIP |
| `node scripts/ci/run-checks.mjs ops` | exit0; Python133 + Node185/185,0 SKIP |
| `node scripts/ci/run-checks.mjs go` | exit0; full test/race/vet/staticcheck/integration staticcheck/govulncheck/build; READY2CPU qualification; Node C2/guard357/357,0 SKIP |
| `node scripts/ci/run-db-integration.mjs` | exit0; disposable loopback PG17, migrations/roles/RLS/security/parity/recovery/provider/real Go+Node READY publication integration; resource cleanup PASS |
| `node scripts/ci/run-checks.mjs security` | exit0; source policy and synthetic backup guard PASS |
| `node scripts/revalidation/verify-part16.mjs` | exit0; static boundaries PASS |
| Python compile/Node syntax, Markdown links, bounded source/privacy and exact scope | PASS; no production credentials read |
| `git diff --check` | exit0 |

Go READY qualification remained5000ms (shared full-size client ~2537ms; core ~2519ms in this local run). This is local timing, not production RCA or C2 acceptance. Convergence SLA5s and HTTP budgets remain unchanged. The existing deliberate duplicate-ZIP fixture emits its expected Python UserWarning; it is not a skipped test.

## Exact source scope

1. `ops/c2/publisher-promotion.py` — descriptor custody/fetch; close cleanup scan iterator.
2. `ops/c2/test_publisher_promotion.py` — fixed-boundary mocks updated, ten new FD/custody regressions.
3. `ops/c2/root_bundle_integration.py` — mandatory actual different-UID Linux qualification and coupled transaction.
4. `ops/c2/fixtures/bundle-root/Dockerfile` — minimal isolated root test image.
5. `scripts/ci/run-root-bundle-integration.mjs` — bounded mandatory root sandbox runner and cleanup.
6. `.github/workflows/ci.yml` — one mandatory step within Go Quality.
7. `scripts/ops/sync-promotion-local-poc.py` — preserve existing LocalHost override compatibility by forwarding explicit pass_fds.
8. `ops/c2/README.md` — transport, mandatory proof and future pin upgrade warning.
9. This report.

Go/SQL/ingest/READY/HMAC/FIFO/observer algorithm/frontend/dependencies/production config are unchanged. Historical reports are unchanged. The clean full-stack archive is independently checked for safe members and source/report byte equality; archive path and SHA256 are provided in the review handoff (not embedded recursively into the archive itself).

## Independent review and future deployment handoff

This source candidate does not upgrade the installed executor. After review, a **separate** Owner-approved task must independently verify and update both linked exact SHA256 pins:

- `producerFiles['ops/c2/publisher-promotion.py']`;
- `runtimeFiles['/usr/local/libexec/aktau-sync-promotion/publisher-promotion.py']`.

Replace the root-controlled executor only via reviewed no-clobber/backup/inode/hash/readback procedure, preserve existing workflow pin if its producer bytes remain unchanged, reader/ledger, prior release and rollback. Do not migrate only one pin, manufacture approval or reuse the failed artifact/release identity. Build a new authenticated manual artifact from future reviewed exact-main+CI9; normal independent provenance and all root admission checks still apply. AUTO DEPLOY stays disabled.

Residual deployment risk: real VPS runuser/Git/kernel versions and installed executor/policy require separate compatibility/readback checks. Local root proof establishes the Linux FD boundary, not live authorization, installation, readiness or a production C2 PASS. Until that later approved task, production stays as historically reported and acceptance remains unverified.

STOP for independent Code Review before merge or deployment.
