# Sync/C2 trusted publisher promotion — Owner report

Date: 2026-10-23. Source base: `cbba99f244975e123f3f8405693df39fe38aeee5`.
Branch: `feat/sync-c2-trusted-publisher-promotion`.
Current execution status: implementation and validation in progress; not DONE.

## Authority and production baseline

Owner approved the complete task and independently confirmed Backend2's existing
public identity. Authenticated personal login used the unlocked existing agent;
private key/passphrase never requested, copied or printed; forwarding disabled.
Backend2 UID1001; runtime aktau-sync UID999/GID987.
Changed exactly `/etc/sudoers.d/90-backend2-temporary`: `PASSWD:` to `NOPASSWD:`.
Root:root0440 and NOTAFTER20270120200631Z preserved. Backup directory:
`/var/backups/aktau-backend2-access-20261023T140347Z-62337f91` (root-private).
visudo before/staged/after PASS, sshd syntax before/after PASS; no reload required.
Separate Backend2 login + `sudo -n id -u` returned0; Owner fallback PASS.
Existing journald audit active. Full sudo is **Owner-delegated Backend2 production
administration** and can alter root trust; human review is not independent of it.
No CI principal has been granted this sudo rule.

Pre-install publisher clean: `deploy/dina-weight-sync-part32`
at `fd2b9a3eec417f739299e3d1ccc1d3d6b09860fd`; root C2 authority/closure bb1842b.
API image revision `b4f4b889a046ee59d3730f3a2c45e0f1d49b93ac`, healthy.
Prior custodian failed/not_armed: not a qualified measurement.
No new sync, scrape, apply, snapshot, HMAC or observer was initiated.

## Source implementation

Separate immutable build/promotion workflows; root independently authenticates
GitHub artifact digest, source/main/CI/workflow/run/attempt and pinned producer
bytes before activating uploaded bytes. Build job has no SSH credentials.
Root policy pins six fixed executor/wrapper/drop-in files, source producer bytes
and the exact fd-to-main bridge. No self-updating executor from uploader input.
Actual source tree and provider ELF global are checked; Go1.27.3/Node24.18 pinned.
Full 12-file C2 closure plus two root records and publisher form one transaction.
Shared original-runtime gates, exclusive promotion/controller locks, durable
intent-before-mkdir, backups, interlock, coupled rollback and replay protection.
Reader, ledger, site policy, HMAC and publication semantics are unchanged.
Dedicated CI service identity must have only zero-argument promotion permission.
No API auto-deploy, Release/tag or producer secret in artifact is introduced.
See the standalone [Backend2 handoff](../BACKEND2_SYNC_C2_AUTOMATED_PROMOTION_HANDOFF.md).

## Fail-first and local evidence

An actual subprocess-descendant timeout regression initially failed: the direct
child exited while a descendant retained output pipes. Group cleanup was corrected;
the same test then passed. A real initial Go ELF inspection also exposed that
Go1.27.3 trimpath build metadata omits ldflags; source is now verified from the
bounded actual ELF Go string global, never inferred from manifest/labels.
The initial ELF fixture negative at the unused string-table zero byte was corrected
to alter the actual symbol name; it was a test-fixture error, not a production claim.

Disposable Git/Go/filesystem E2E: PASS for complete promotion and coupled rollback,
12-file closure, reader inode and ledger preservation; fixtureOnly true,
productionAuthority false, HTTPRequests0, publications0.
Final full command results and hosted/VPS evidence are appended below.

## Initial public artifact

Off-VPS fd2b9a3 rebuild, kind=initial, no invented CI IDs:
TAR size172134400; SHA256
`aa0d431ca52b15cdb9074cb901676534baf319e0b47c57c4f8697d9ed533eb25`.
Node: `41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c`.
Provider: `6dcb4132edae63953867a6380839637c74da9c13f0f8784bbf1cadf2517864eb`.
Ingest: `f4c2cea4a216d60d0180ef92a7bc52b3907271de7129e8d9609a7e35ea012aca`.
The root-only initial admin path is separate from CI's restricted request protocol.
Initial rollback would preserve the exact old fd publisher/bb authority baseline,
not claim aligned C2. Future aligned releases roll back publisher and complete kit.

## Completion gates

Pending final tests, protected PR/merge, exact-main CI, hosted immutable build,
root tool/wrapper installation, independent initial package admission and readback,
restricted CI identity/configuration, and actual no-change status proof.
Production convergence is NOT VERIFIED here; only actual ledger may establish N/3.
`AUTO_DEPLOY_ENABLED` remains false; no current API/frontend/DB changes authorized.

## Final local source gate

All following final commands exited0 unless explicitly marked otherwise:

- `python3 -B -m unittest discover -s ops/c2 -p 'test_*.py'`: 122 PASS, 0 SKIP.
- `python3 -B -m unittest discover -s pipeline/scripts -p test_c2_ingest_launch.py`: 23 PASS.
- `C2_LOCAL_PROBE=<owned Go1.27.3 relayprobe> node --test scripts/revalidation/*.test.mjs scripts/ci/guard.test.mjs`: 357/357, 0 SKIP.
- `node scripts/ci/run-checks.mjs ops`: PASS; Python121/121 at that checkpoint,
  Node184/184, 0 SKIP. The subsequently added dependency-boundary regression is in
  the final Python122 suite above.
- `node scripts/ci/run-checks.mjs security`: PASS, synthetic backup1/1 PASS.
- `node scripts/revalidation/verify-part16.mjs`: PASS (static, not production).
- Go1.27.3 `go test -count=1 ./internal/revalidation ./cmd/c2projection ./cmd/ingest`: all3 packages PASS.
- `node scripts/ci/run-db-integration.mjs`: full disposable PG17 profile PASS,
  cleanup PASS, including actual restricted-role and BEFORE/READY publication tests.
  First attempt failed to start pnpm because the constrained PATH omitted its
  native WSL installation; repeated with the existing pnpm directory and passed.
- Disposable promotion E2E: final PASS, real Git/import/build metadata/full rollback.
  The added dependency guard initially rejected the current Vite-only bridge;
  exact old/new package and lock blobs now admit only that reviewed tooling delta.
  Unknown dependency changes remain blocked; the regression exercises real Host admission.
- Python AST syntax, JS `node --check`, shell `bash -n`: PASS.
- actionlint1.7.7 on both new workflows, shellcheck disabled: PASS.
- Markdown local links14/14; bounded privacy scan20 files0 findings; diff-check PASS.

The disposable OS models do not grant production authority or prove live READY.
No source test has been represented as a production C2 PASS.
