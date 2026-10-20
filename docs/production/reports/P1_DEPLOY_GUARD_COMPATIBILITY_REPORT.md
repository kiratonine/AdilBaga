# P1 — Pinned Deployment Compatibility Guard

2026-10-20. **READY_FOR_EXTERNAL_REVIEW — source only. Production NOT DEPLOYED by this task.**

## Scope and immutable preflight

- Fresh main/base: `b75af8b2f290b96736d473c18e9aaf8746efe6d4`.
- New native WSL worktree `/home/denis/tmp/aktau-p1-deploy-compatibility-guard`; branch `feat/p1-deploy-compatibility-guard`. Other worktrees and their uncommitted reports were preserved.
- [Exact-main CI39441256304](https://github.com/kiratonine/AdilBaga/actions/runs/39441256304): push/main, attempt1, exact SHA, nine completed SUCCESS jobs independently rechecked. This is baseline evidence, not the new PR's CI result.
- The accepted production audit was read from the separate audit worktree; it is not tracked in main and was not copied or changed. Its active API438ecdfa… and missing broker/settings observations remain **historical evidence**, not new production observations.
- Scope: [auto-transport.mjs](../../../scripts/deploy/auto-transport.mjs), [auto-gate.test.mjs](../../../scripts/deploy/auto-gate.test.mjs), precise documentation in [AUTO_DEPLOY_SETUP.md](../AUTO_DEPLOY_SETUP.md), and this new source-follow-up report. Existing historical reports, Go, SQL/DB/schema, contracts, workflow, broker, frontend, ops, HMAC and C2 source are unchanged.

Independent `git diff --name-status --no-renames` from active `438ecdfa3d386a186dcd8b73c3c10aef5e79dc82` to reviewed b75af8b2… found **only** the two tooling paths under the existing protected enumeration. Real `git ls-tree` independently confirmed:

| Path | Active438ecdfa… object | Reviewed candidate object |
| --- | --- | --- |
| contracts/package.json | ee97d962531376e81a0b9175d8eef2aaa36a7c9c | 48a7866b9084cbc25b2dafc1089713eb555e0a38 |
| contracts/pnpm-lock.yaml | 5ec3371eba46c18660421d89949aa0ebf890d534 | 4a631ef27450ce85b818e4fe02705b9bcd224c13 |
| contracts/openapi.yaml | 0339280f3065d7ad73d3f483335721751500e8c6 | same |
| deploy/compose.production.yml | 9d569f390c897466b262342d98a4fd4ccf7ec1f2 | same |

All are100644 regular blobs. `backend/prisma` and contract examples have no diff. Package changes remain only the reviewed ajv8.17.1→8.20.0 and yaml2.8.1→2.9.1 dependency update with corresponding lockfile bytes. No dependency was modified by this task.

## Minimal behavior change

Previously, any nonempty protected diff blocked this valid tooling pair. Transport now invokes one testable `verifyCompatibility(active,candidate)` at the same planning boundary:

1. Both refs must be exact lowercase40hex commit IDs resolving to those same commit objects. Git replacement objects/global configuration and lazy object fetch are disabled for these checks; each Git command has a10s timeout and1MiB output cap.
2. One authoritative production enumeration still covers **all** `backend/prisma`, `contracts`, and `deploy/compose.production.yml`. Diff uses NUL delimiters and `--no-renames --no-ext-diff --no-textconv`.
3. Empty protected diff retains ordinary behavior. Otherwise **active must equal438ecdfa…**, and the entire path set must be **both and only** package.json + pnpm-lock.yaml. Neither a single-file exception nor a directory/global exclusion is accepted.
4. Re-read all four pinned objects from the two commit trees. Exact mode/type/hash/path output must match the reviewed100644 blobs. Missing, renamed, deleted, symlink/executable/submodule objects or any changed pin fail closed.
5. Candidate SHA is **not** pinned to b75af8b2…: the caller retains fresh-main/exact CI/immutable artifact verification, supporting a future reviewed merge with identical tooling blobs. No new env flag, bypass argument, approval field or mutable working-tree proof exists.

Runtime-change classification, NO_OP, NO_RUNTIME_CHANGE, SKIPPED_STALE, repeated freshness check, artifact authenticity, restricted SSH/root approval, broker compensation and workflow activation are unchanged. Guard acceptance is not runtime compatibility proof, independent authorization, production readiness or a deployment.

## Fail-first and tests actually executed

Node24.10.0, Go1.27.2, GOTOOLCHAIN=local; required RTK wrappers. No production network/DB/SSH or secrets. GitHub read-only source/CI metadata only.

| Command / evidence | Actual result |
| --- | --- |
| Before fix: `node --test --test-name-pattern='real transport plan accepts' scripts/deploy/auto-gate.test.mjs` | **exit1: 1 FAIL, 0 SKIP**, reproduced twice before source fix. Actual transport entrypoint reached the original protected diff after synthetic CI/artifact/status checks and returned BLOCKED instead of PLAN_VERIFIED. This was not a missing-export failure. |
| `node --check scripts/deploy/auto-transport.mjs` and `node --check scripts/deploy/auto-gate.test.mjs` | **exit0 each**, syntax PASS. |
| `node --test scripts/deploy/auto-gate.test.mjs scripts/deploy/verify-part15.test.mjs` | **exit0, 95/95 PASS, 0 SKIP**:64 gate tests (43 added) +31 Part15. Same entrypoint fixture now returns PLAN_VERIFIED with exactly one **mocked** SSH status call, no submit. |
| Real local Git-object invocation of `verifyCompatibility(438ecdfa…, b75af8b2…)` | **exit0 PASS**, no OS mocks; unchanged-object case accepted; unknown commit rejected. No working-tree or production proof claimed. |
| `PYTHONPATH=scripts/deploy python3 -B -m unittest discover -s scripts/deploy -p 'auto_*_test.py'` | **exit0, 47/47 PASS, 0 SKIP**, including missing/wrong independent approval, immutable artifact/sealing and rollback regressions. Local cold HTTP4524ms, not a production measurement. |
| `node scripts/deploy/verify-auto-deploy.mjs` and `node scripts/deploy/verify-part15.mjs` | **exit0 each**, static deployment boundaries PASS. |
| `node scripts/ci/run-checks.mjs go` | **exit0 PASS**: format/module checks, full unit/race, vet, staticcheck default/integration tags, govulncheck (no vulnerabilities), API/ingest local builds. No local DB integration execution claimed. |
| `node scripts/ci/run-checks.mjs ops` | **exit0, 177/177 PASS, 0 SKIP**. |
| `node scripts/ci/run-checks.mjs security` | **exit0 PASS**, bounded source/workflow/privacy policy and synthetic backup guard. |
| `node scripts/revalidation/verify-part16.mjs` | **exit0 PASS**, static C2 boundaries only. |
| `git diff --check` / source-preservation checks | **exit0**, Go/DB/contracts/frontend/ops/C2/workflow bytes unchanged. |

Added tests cover extra OpenAPI/examples/arbitrary contracts/Prisma/compose changes, incomplete/duplicate/rename path sets, each wrong/missing old/new blob, different active release, malformed/unknown candidate, failure/timeout at all seven Git operations, malformed Git output, wrong file modes, no-protected-change behavior, and a future candidate retaining the reviewed blobs. Existing stale-main/CI/artifact/root-approval rejection tests remain intact.

Git/SSH/HTTP in the entrypoint test are explicitly synthetic OS/provider fixtures; no real SSH or approval is used. This keeps tests deterministic in shallow CI checkouts. Separately, the real local Git invocation confirms the approved historical objects. The test seam does not add an injectable production policy or operator override.

## Publication, archive and operational limits

One small source commit/push and a new **Draft PR into main** are authorized by the TASK; PR52 remains merged and is not reused. At report freeze, new-head hosted CI is **pending publication**, not PASS. Final handoff supplies the actual commit/PR/run and must verify all nine exact-head jobs SUCCESS. The baseline CI above is not substituted for it.

A new clean full-stack archive is generated using `scripts/create-clean-archive.mjs`; final handoff includes its unique path/SHA256 and safe-member/all-file exact-Git-tree byte-match results. No prior archive is reused. Report-only link/scope/privacy checks accompany final handoff.

Operational blockers remain: reviewed broker/root custody and restricted CI deployment identity are not established; deployment configuration and independent per-artifact root authorization must be supplied through the separate administrative process. These are the accepted prior audit findings, **not refreshed VPS checks**. This source correction cannot install broker, approve an image, enable AUTO_DEPLOY_ENABLED or deploy.

After independent review/merge: select **new exact main + new successful push-main CI**, verify/install approved broker and dedicated deployment settings, create one immutable build-only artifact, obtain genuine independent approval, then perform a separately gated release/readback. No artificial sync/publication, C2/Part32 activation, DB operation, service change, manual Docker deploy or reboot occurred here. Cold-Supabase RCA remains unproved; Production P1 acceptance remains open. **STOP for independent Code Review.**
