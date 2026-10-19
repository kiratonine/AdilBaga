# Part25 — Recovery operator & C2 provisioning sprint

Status: **READY_FOR_EXTERNAL_REVIEW / SOURCE_READY**. Production Recovery:
**RECOVERY_BLOCKED_INPUT**. C2 kit: **C2_READY_FOR_APPROVAL**, not installed;
production trust/activation remains blocked. **C2 acceptance: 0/3 NOT_RUN**.

## Scope and baseline

Owner-approved Part25 source implementation, local disposable integration and
publication of a Draft PR only. Branch `feat/part25-recovery-c2-operator-kit`,
fresh base `00c2bd6e0faf61af52ce0590e57ba69acde2caf4` (PR48). Work performed
2026-10-19 UTC / 2026-10-20 local. No other worktree was modified. The complete
outside-Git Part24 report was read; its missing inputs/remote metadata are
historical evidence, not a new inventory result here.

Sources: [operator kit/runbook](../../../ops/c2/README.md),
[existing backup/restore safeguards](../../../ops/postgres/README.md),
[frozen C2 contract](../FRONTEND_REVALIDATION.md),
[C2 source evidence](PART_16_C2_CACHE_CONVERGENCE_REPORT.md),
[joint PoC](PART_16_C2_JOINT_INTEGRATION_REPORT.md),
[historical latest restore](PART_18_LATEST_POST_SYNC_OWNER_BACKUP_REPORT.md).

## Actual implementation (nine paths)

1. `scripts/ops/prepare-recovery-operator.mjs`: default no env/file/network/SQL
   access; explicit private-handle check; strict four-key non-evaluating parser;
   no inherited runtime DSN; bounded tool probes; fixed sanitized statuses.
2. `scripts/ops/prepare-recovery-operator.test.mjs`: missing/malformed inputs,
   unsafe permissions/links/source paths, substitution/multiline/duplicate,
   tools unavailable, no inherited fallback and no secret output.
3. `scripts/ops/c2-provisioning-plan.mjs`: pure default plan; explicit local
   bundle inspection binds Node bytes to a full immutable Git source SHA and
   computes public digests. Inspection is explicitly NOT approval.
4. `scripts/ops/c2-provisioning-plan.test.mjs`: pure-plan/manifest negative
   cases and invocation of the real Python sandbox installation suite.
5. `ops/c2/install-reviewed-c2.py`: Linux fixed-path root guard, independent
   root-controlled approval, exact bundle inventory/digests/platform/source
   manifest, root installer custody, pinned parent descriptors, no-follow/
   no-clobber atomic publication, short-write loops and file/directory fsync.
6. `ops/c2/test_install_reviewed_c2.py`: sandbox install/rollback, link/ACL-mask/
   ownership/digest/ELF/recipe/source drift, partial write, crash, torn receipt,
   existing target and live-state refusal, bundle replacement protection.
7. `ops/c2/README.md`: one private input procedure, bounded backup command
   packet, independent approval interface, exact inactive installation and
   own-resource rollback, pending BEFORE-before-mutation integration boundary.
8. `scripts/ci/run-checks.mjs`: adds the two new Node test files to existing ops
   profile (the Node wrapper requires the Python suite to succeed).
9. This consolidated report.

No dependencies, Go/SQL/API/Frontend/HMAC/ingest/supervisor algorithms or existing
backup/restore tools changed. Security already requires the ops profile in
`.github/workflows/ci.yml`; no workflow edit or tenth mandatory job. No change to
AUTO_DEPLOY_ENABLED. No generalized executable/path/credential override was added
to the production provider.

## Recovery result and limits

New CLI emits only READY/MISSING_OPERATOR_INPUT/INVALID_CUSTODY/BLOCKED. READY
means local configuration readiness, **not** remote role suitability or backup
success. It requires a dedicated explicit private file and separate owned 0700
storage/keyring, strict TLS URI and full recipient; does not `source` dotenv,
create a key/role, search secrets or use runtime/ingestion environment fallback.

The four allowed backup variables are absent from this execution context; no
actual approved operator handle was supplied. Therefore fresh source-role SQL,
backup, decrypt, local restore, ten-table counts/security/history inspection and
binary-safe parity of a fresh recovery point were **NOT_RUN**. No ciphertext or
new snapshot identity/age/hash is invented. Historical successful recovery
evidence is not promoted to current parity. The disposable PG17 integration
below is synthetic local evidence, not a fresh production restore.

**One next Owner input:** bind an already independently approved dedicated
read-only backup context into one outside-Git 0600 handle using the four-key
procedure in the kit, then run its `--check` command. Do not send secrets in
chat. Prove effective role privileges/READ ONLY/deadlines independently before
the bounded unchanged backup packet. Later restore must use fresh loopback PG17
and unchanged scripts, ten tables, migrations/RLS/policies/indexes/constraints/
orphans, restricted Go smoke and matching source `pm-audit-v1`. Missing matching
source reference means RESTORE_VERIFIED_SOURCE_PARITY_PENDING, not full PASS.

## C2 installation and trust model

An uploader manifest or CLI flag grants no authority. The installer accepts
only a separately administered root:root 0600 canonical approval at its fixed
trust path. It never creates approval inputs or sets approved=true on behalf of
the reviewer: the exact existing-provider attestation must already be present
inside the independently approved record. Root-controlled installer ancestry,
root-controlled staging bundle and no effective nonroot write are mandatory.
Binary content is read once, verified and retained for installation; no second
path read permits a caller to substitute verified bytes. ELF checks alone are
not build provenance: independent review must pin the actual artifacts/recipe.

All three target trees must be new. Only C2 binaries/five Node modules/source
manifest, copied independent authorization, and an empty private operator
namespace/ledger are created. No reader credential, Vercel deployment record,
publisher hook, FIFO attempt, service or timer is invented. Existing operator
identity is verified by the root guard; no accounts/privileges are granted.

Root receipt is fsynced before each atomic directory publication; short writes
loop and fsync failure blocks. The same guard can roll back only inode-pinned,
byte-verified own inactive trees or recorded partial private stages. It refuses
foreign/live files, changed approval, ledger activity and torn/ambiguous receipt.
There is no automatic deletion/retry over ambiguous state; independent manual
reconciliation is required after an unrecorded early interruption. No old tree,
key, backup or service is removed. Sandbox tests use current uid, not host-root
destinations, and cannot mint production custody.

**One independent approval packet:** reviewed full source SHA/build recipe and
ELF/Node/installer digests; exact independently verified Vercel READY Production
alias/deployment/frontend SHA; dedicated restricted reader proof; Backend2-owned
namespace/BEFORE-before-canonical-mutation integration authority. None of these
was manufactured or provisioned in production during this Part.

Current ingest stages canonical state before PublishThenNotify; adding BEFORE
only beside Publish is too late. The pending Backend2 hook must arm the trusted
observer before any canonical mutation, without blocking/slowing the legitimate
publisher. Source-only proposal is in the kit, not a pipeline modification.
Existing actual204/FIFO/AFTER/finalize private custody, stable deployment identity,
35-minute supervision, shared 5s SLA, <=20s diagnostics, <=21 GET/2 sitemap and
three-qualified-PASS semantics are unchanged. No genuine publication was measured.

## Tests and actual execution results

Node24.10.0 / Go1.27.2 explicitly selected; GOTOOLCHAIN=local. Reviewed local
relayprobe built and supplied as C2_LOCAL_PROBE. Initial new test invocation
exited **1** before implementation (missing modules); after implementation:

| Command | Result |
| --- | --- |
| `node --test scripts/ops/prepare-recovery-operator.test.mjs scripts/ops/c2-provisioning-plan.test.mjs` | exit0, 17/17 PASS, 0 SKIP |
| Python sandbox suite invoked by the Node wrapper (`python3 -B -m unittest discover -s ops/c2 -p 'test_*.py'`) | 15/15 PASS; no host root installation |
| `node scripts/ci/run-checks.mjs ops` | exit0, 177/177 PASS, 0 SKIP; all old 160 retained |
| `node --test scripts/revalidation/*.test.mjs scripts/ci/guard.test.mjs` | exit0, 286/286 PASS, 0 SKIP |
| `node scripts/revalidation/joint-poc.mjs` | exit0, 15/15 PASS; real Go CLI/FIFO/disposable PG17 + synthetic HTTP; PG cleanup PASS |
| `node scripts/ci/run-db-integration.mjs` | exit0; full disposable PG17 migrations/C2/Go restricted-security integration, owned cleanup PASS |
| `node --test scripts/deploy/auto-gate.test.mjs scripts/deploy/verify-part15.test.mjs` | exit0, 52/52 PASS (21+31), 0 SKIP |
| `python3 -B -m unittest discover -s scripts/deploy -p 'auto_*_test.py'` | exit0, 39/39 PASS |
| `go test -count=1 ./cmd/c2projection ./internal/revalidation ./internal/postgres` | exit0, all three packages PASS |
| `go test -race -count=1 ./cmd/c2projection ./internal/revalidation ./internal/postgres` | exit0, all three packages PASS |
| `go vet ./cmd/c2projection ./internal/revalidation ./internal/postgres` | exit0 |
| `node scripts/revalidation/verify-part16.mjs` | exit0; static boundaries only |
| `node scripts/deploy/verify-auto-deploy.mjs`; `node scripts/deploy/verify-part15.mjs` | both exit0; offline boundaries only |
| `node scripts/ci/run-checks.mjs security` | exit0, source/workflow policy + unchanged backup synthetic guards PASS |
| JS syntax on four new JS files and modified CI runner | exit0 |

No skipped test is counted as PASS. Local test results do not establish a
production backup, source parity, Vercel deployment identity or C2 convergence.

The reviewed recipe was also actually built locally (CGO_ENABLED=0,
GOOS=linux, GOARCH=amd64, trimpath; projection sourceSHA pinned to baseline).
Real ELF hashes: projection
`4d5ae69c9ccf05d33d673ee9b7606293fe0c1614f6473672774e4daa7d320936`;
relayprobe `74e83eac16c04123e2237a3f5226fc58ff579be0ade41335c95af3a4f8bcf012`.
Explicit bundle inspection passed 8/8 files, exact Node bytes from the immutable
Git object. The actual binaries and source bundle also passed real sandbox
install and exact rollback, exit0, using a clearly synthetic LOCAL authority
record. This is not independent production approval; ELF binaries stay outside
Git/review archive. No joint production integration is claimed.

Final `git diff --check`, exact nine-path scope, local Markdown links and bounded
source/privacy scan passed. Historical reports, migrations, workflows and all
out-of-scope runtime files were preserved byte-for-byte against the base. The
full-stack archive is generated by the unchanged repository script, validated
for regular unique safe members and source byte-match; its external SHA256 and
Draft PR/commit are supplied in the final handoff (not recursively embedded in
the archived report). Hosted CI is separate and is not predeclared successful.

## Safety / production accounting

This Part performed **0 production SSH/HTTP/SQL/Redis**, **0 backup/restore
attempts against production data**, **0 C2 observations**, **0 publications**,
**0 provisioning/activation writes** on VPS. Part24 metadata was not re-collected
as another audit. Telegram activation/receipt remains accepted without re-audit;
Go release, Backend2 services/data, Frontend and Vercel were untouched. No real
credential, private path, raw data/log, key identifier or backup is in this report.

Owner review target is source/installation safety, not production acceptance.
STOP after Draft PR and clean source artifact; no merge/deploy/activation implied.

## Append-only P1 correction — unregistered staging crash window

2026-10-19 UTC / 2026-10-20 local. Reviewed starting commit
`73dd2e34c158d57343da850b06b565f51d959dd5`, existing Draft PR #49. The previous
results above are preserved as historical evidence; their crash coverage missed
the interval after successful staging mkdir and before durable receipt intent.
In that interval the former rollback could remove the receipt, report success
and leave an orphan staging directory. The independent review finding was
reproduced locally; it is not a production incident observation.

**Fail-first:** eight new regression methods added before modifying installer
logic produced exit1, **23 tests / 8 failures** on the reviewed implementation.
Failures include crashes on targets one/two/three, orphan with partial receipt,
unrecorded target, install over orphan without a receipt, malformed reserved
stage names and ambiguous completion records. No assertion was weakened.

**Correction:** one shared read-only inventory guard pins/checks **all three**
fixed target parents, including parents absent from partial receipt intents.
Install rejects every reserved staging entry or existing target before creating
a receipt or staging resource. Rollback validates ordered, unique, exact typed
intents and a consistent completion marker; requires each recorded resource to
exist in exactly one final/stage location; rejects unknown reserved names,
unregistered targets, duplicate/ambiguous records and incomplete completion.
The entire inventory is checked before byte validation and again before the
first deletion, including the header-only receipt case. Unknown stages are not
adopted or removed based on their names. On uncertainty the operation is BLOCKED
and preserves receipt/resources for manual reconciliation.

Existing pinned directory descriptors, no-follow checks, root custody, approval
and content digests, inode/device verification, no-clobber rename, short-write
handling and file/directory fsync remain in place. A header-only receipt with
**no** resources in any parent can still roll back normally. No automatic
repair, orphan deletion, stale-lock bypass or overwrite path was added.

Scope is exactly **three files** relative to the reviewed commit:
`ops/c2/install-reviewed-c2.py`, `ops/c2/test_install_reviewed_c2.py`, and this
append-only report. Tests snapshot all sandbox resources and verify that blocked
rollback/install causes no deletion or byte/inode changes. Additional controls
cover normal rollback, malformed typed markers and clean header-only rollback.

| Repeated command / check | Actual result |
| --- | --- |
| `python3 -B -m unittest discover -s ops/c2 -p 'test_*.py'` | exit0; **25/25 PASS**, original 15 retained |
| `node scripts/ci/run-checks.mjs ops` | exit0; **177/177 PASS**, 0 SKIP; invokes the complete Python sandbox suite |
| `node --test scripts/revalidation/*.test.mjs scripts/ci/guard.test.mjs` with freshly built reviewed local relayprobe | exit0; **286/286 PASS**, 0 SKIP |
| `node scripts/revalidation/joint-poc.mjs` | exit0; **15/15 PASS**, 0 SKIP; real local Go/FIFO/PG17, owned PG cleanup PASS |
| `node scripts/ci/run-db-integration.mjs` | exit0; disposable PG17 migrations/C2/Go/restricted role regressions PASS; owned PG cleanup PASS |
| `node scripts/ci/run-checks.mjs security` | exit0; source/workflow policy and backup guards PASS |
| Focused Go `test -count=1`, `test -race -count=1`, `vet` on cmd/c2projection, internal/revalidation, internal/postgres | all exit0, all three packages PASS |
| Deployment Node gate/Part15 tests; Python auto deploy tests | exit0; **52/52** and **39/39 PASS** respectively |
| `node scripts/revalidation/verify-part16.mjs` | exit0; static boundaries only |
| Python AST, unchanged JS syntax, exact scope, report-prefix/link/privacy checks, `git diff --check` | PASS |

Local execution used Node24.10.0 / Go1.27.2, nonroot; all installation/crash tests
used disposable owned sandbox trees. No source contract, Go, Frontend, Backend2,
database, credential, workflow or deployment setting changed. No production
access, provisioning, publish, restore or C2 observation occurred. Production
Recovery remains RECOVERY_BLOCKED_INPUT and C2 remains C2_READY_FOR_APPROVAL,
acceptance **0/3 NOT_RUN**. These statuses are not closed by local regression PASS.

The correction is published to the same feature branch/PR only after local
gates. Exact commit, full hosted CI outcome and freshly regenerated safe archive
SHA256 are supplied in the final handoff; they are not inferred from an older
run or recursively embedded into the archived report. No merge or production
activation is authorized by this correction. STOP for independent repeat review.
