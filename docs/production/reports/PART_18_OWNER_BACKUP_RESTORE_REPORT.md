# Part18 — Owner Backup Restore Drill and HMAC Evidence Reconciliation

Status: **BLOCKED**.

**Owner Backup Restore Drill: PASS** after Owner unlocked the existing GPG
context and authorized resumption. The earlier decrypt_failed is preserved below
as historical evidence, now RESOLVED. Independent restore/checksum/count checks
passed; full production fingerprint parity is not claimed. Overall **BLOCKED**
applies to still-incomplete HMAC C1 evidence, not the completed local restore.

## 1. Provenance and scope

Date: 2026-10-14. Existing native-WSL worktree, branch
`feat/part-18-hmac-acceptance`. HEAD and fresh origin/main:
`c8e7bb74e2e5cb31d1d1e460ed57c6456d0d8f5f`.
`git fetch origin --prune` exited0. Initial state already contained the reviewed
FRONTEND_REVALIDATION.md documentation clarification and two untracked HMAC
reports. All preserved; this task creates only this report in the repository.

Read project AGENTS rules and existing
[backup/restore tooling](../../../ops/postgres/README.md), guard.mjs,
restore-test.sh and pg-run.mjs; reviewed
[HMAC preparation](PART_18_STAGE_C_HMAC_PREP_REPORT.md),
[C1 report](PART_18_STAGE_C_HMAC_PRODUCTION_REPORT.md) and
[revalidation contract](../FRONTEND_REVALIDATION.md).

## 2. Initial owner artifact verification — historical; key/decrypt state superseded by section7

Encrypted artifact: `app-public-20261014T132815Z-OWXbgt99-owner.dump.gpg`.
Adjacent JSON exists and parses. No absolute private path or recipient material
is reproduced here.

| Check | Actual result |
| --- | --- |
| Encrypted bytes | **2402108**, exact expected size PASS |
| Independently computed ciphertext SHA256 | `30597cbe3d42651a76f24f2e659c286aaad2a6f8f1c9bca4c73ba0a0da0585d1`, PASS |
| Metadata plaintext SHA256 | `f3b605a7ba1efc7f164867b4e707a92f4f5fa1173f2a2e903c525fef2acb9c1a`, matches Owner expectation |
| Independently computed plaintext SHA256 | **NOT AVAILABLE**, decryption failed |
| Artifact/metadata permissions | 0644; enclosing private directory0700. No permission change made |
| Standard existing GPG keyring | Directory0700, matching secret-key listing exit0; no key import or key-material output |
| Actual key usability | NOT PROVEN; bounded batch decryption failed |

Metadata agreement is not a decrypted checksum proof. A matching secret-key
listing is not proof of accessible private material or unlocked passphrase.
The exact decryption cause was not classified from raw GPG stderr; no assumption
that the key is missing, corrupt or merely locked is made.

## 3. Initial independent drill outcome — historical, superseded by section7

A minimal temporary operator helper outside Git used an explicitly cleaned
environment with no production DSNs or credentials. It first attempted GPG
decryption into process memory, bounded30s, before any Docker mutation. Raw
GPG stderr, key identifiers and plaintext were not emitted. This prerequisite
returned nonzero; helper exited1 with only `decrypt_failed`.

The intended later steps were the unchanged restore-test.sh, new owned
loopback-only PG17/database part11_*, documented local NOLOGIN reader/writer
prerequisites and count/history checks. **None ran**. No existing containers or
files were deleted or altered. No plaintext dump file was created by the helper.
The existing restore script itself was not invoked or modified.

| Gate | Result |
| --- | --- |
| Decrypt | BLOCKED |
| Decrypted checksum/custom-format validation | NOT RUN |
| New disposable PG17 readiness/restore --exit-on-error | NOT RUN |
| Ten public table counts/schema/security verification | NOT RUN |
| Snapshots/source runs/migration history | NOT RUN |
| Original row fingerprints comparison | NOT RUN; no reference fingerprints supplied |

Even after successful restore, absence of original fingerprints would limit
the conclusion to archive checksum, restore exit0 and available structural/count
controls, not independently verified full production data parity.

## 4. Backend2 external handoff — historical reconciliation; restore disposition superseded by section7

The following describes evidence available at the initial failed attempt.
Decryption/restore conclusions in this section are superseded by section7;
the unresolved HMAC evidence gaps remain current as summarized in section8.

Owner relayed Backend2 evidence: backup creation2026-10-14 13:28UTC, public
schema, ten tables, snapshots3 including the current snapshot from2026-10-13.
Backend2 reports its own restore --exit-on-error exit0 and counts matching
production. Its streaming re-encryption reportedly preserved the plaintext
checksum and targets the Owner key. Independent ciphertext/metadata checks here
agree; independent decryption/restore do **not** yet confirm those data claims.
No individual table-count baseline or original fingerprints were provided.

Backend2 separately reports one signed request from its VPS sync identity at
**2026-10-14 13:48:04UTC**, returning **204**. The reported server-local time was
18:48:04UTC+5. Response body and Cache-Control were not retained. This is external
reported evidence, not an AI-observed request or correlated HTTP transcript.

The existing C1 report correctly records zero POST performed by THIS agent.
Backend2's separate request does not contradict that ledger. Previous reports
remain unchanged; no retry or new HMAC POST was issued for reconciliation.

| C1 evidence | Disposition |
| --- | --- |
| Signed delivery returning204 | Backend2-reported, not independently observed |
| Empty response body | MISSING; Backend2 explicitly did not preserve it |
| Cache-Control:no-store | MISSING; Backend2 explicitly did not preserve it |
| Current Vercel Ready/domain alias/deployment SHA | **PENDING OWNER**, no authorized Dashboard evidence |
| Applied Production secret name/scope | **PENDING OWNER**; no values read |
| Exact deployed code for reported request | Not independently correlated to timestamp/deployment |
| Current sync/timer safety | Backend2 reports disabled timers and empty apply confirmation; not inspected or changed here |
| C2 actual publish → notification → cache convergence | NOT PROVEN by signed204; separate authorized observation required |

The automatic GET405 no-store exception remains the approved documentation
clarification; it does not supply missing POST outcome headers. No new production
POST is authorized by this task.

## 5. Initial executed checks and next action — historical, superseded by sections7–8

| Command/check | Exit/result |
| --- | --- |
| RTK Git status/branch/HEAD and fetch/main | 0; exact baseline above |
| Node metadata/stat/ciphertext hash verification | 0; expected size and hashes PASS |
| `gpg --batch --with-colons --list-secret-keys` with matching recipient held privately | 0; matching listing present, only safe booleans emitted |
| `docker version` server metadata | 0; Docker29.1.3, no container action |
| `pg_restore --version` | 0; PostgreSQL17.10 tools available |
| Outside-Git operator prerequisite invocation | **1**, sanitized decrypt_failed, container not created |
| Final Markdown links/scope/diff-check/bounded report scan and prior-report byte-match | PASS |

Historical Owner action (completed; no longer required): identify the intended existing BACKUP_GPG_HOME or unlock the
existing key through trusted local GPG/pinentry context and confirm readiness.
Never send the passphrase/key to chat. No key import or security weakening is
authorized. Repeat the bounded local drill only after this clarification.

For C1 reconciliation, Owner read-only Vercel metadata can close Ready/alias/env
scope gaps. Missing historical body/header proof must remain explicitly missing;
do not infer it from status204. Any future POST needs separate authorization.
No claim of Part16 C1/C2 acceptance or production launch readiness is made.

## 6. Initial-attempt safety — historical; resumption safety recorded in sections7–8

No production POST, SSH changes/access, SQL, writes, ingestion, snapshot publish,
deployment, systemd action, provider/Redis operation or Backend2 pipeline/schema
change. Automatic CI/CD stays FROZEN. No secrets or plaintext placed in Git/report.
No commit/push/PR/merge. Prior reports and runtime code preserved byte-identical.
STOP for Owner clarification and external review.

## 7. Owner-authorized resumption — independent restore PASS

Owner confirmed manual decryption/checksum PASS and explicitly identified the
existing standard protected GPG home. The same temporary outside-Git operator
helper was resumed without changing restore tooling, safeguards or credentials.
Batch decrypt now exited0. The previous cause remains unclassified; success
after Owner action is recorded without asserting a specific pinentry defect.

### Target isolation and unchanged restore path

New owned container: `aktau-owner-restore-a6f2eb1ff3`, postgres:17-alpine;
server PostgreSQL17.11, host pg_restore17.10. Database `part11_owner_20261014`.
Dynamic host bind was checked as literal127.0.0.1 only. The generated random
local password stayed in process environment, never production credentials.
Final TCP pg_isready plus TCP SELECT1 passed within the bounded readiness budget.

Local prerequisite roles `aktau_api_reader` and `aktau_ingest_writer` were created
NOLOGIN; no production LOGIN, password or ACL was copied. Archive TOC includes
SCHEMA public. Before restore, the helper proved the task-owned fresh database
identity and empty public relations/functions/types, then removed only this empty
schema with **DROP SCHEMA public RESTRICT** (no CASCADE). Absence was checked.
This avoids the known fresh-target duplicate public schema without modifying
the backup or restore script. No pre-existing resource was touched.

`bash ops/postgres/restore-test.sh` then exited **0**, reporting
`restore_checksum_and_exit_zero:PASS`. Its decrypt, adjacent metadata checksum,
custom format and pg_restore --no-owner --no-acl --exit-on-error all passed.
The script's existing EXIT plaintext cleanup was retained. The helper's separate
format precheck used plaintext in process memory only and zeroed its dump buffer;
no new retained plaintext dump artifact was created.

Ciphertext size/hash and metadata expected hash were rechecked after the drill:
unchanged. Independently computed decrypted SHA256 equals
`f3b605a7ba1efc7f164867b4e707a92f4f5fa1173f2a2e903c525fef2acb9c1a`.

### Actual restored data and structural controls

| Public table | Restored count |
| --- | ---: |
| stores | 3 |
| store_locations | 15 |
| categories | 10 |
| canonical_products | 3570 |
| raw_products | 7471 |
| product_mappings | 7471 |
| offers | 7471 |
| snapshots | 3 |
| source_runs | 9 |
| _prisma_migrations | 4 |

Exactly10 public tables. All3 snapshots published; all9 SourceRuns succeeded.
Latest published snapshot prefix **cefa9f11**, published timestamp present,
latest snapshot offers **3256**. These agree with the supplied snapshots3/latest
snapshot external handoff; individual table counts above are independently
observed restored values, not an invented production comparison baseline.

All4 migrations successfully finished and not rolled back. Names and stored
checksums match independently SHA256-hashed checked-in migration.sql bytes:

- 20260923000000_init
- 20261004000000_rls_runtime_access
- 20261005000000_snapshot_history
- 20261006000000_catalog_taxonomy

RLS **10 / FORCE0**, including _prisma_migrations;23 policies, reader6/writer17.
Policy table counts: canonical_products4, categories2, offers3,
product_mappings2, raw_products2, snapshots4, source_runs3, store_locations1,
stores2. _prisma_migrations has RLS with no policies; not altered.
Restored schema contains25 constraints and32 indexes; invalid indexes0 and
unvalidated constraints0. Orphan offer snapshot/canonical references0;
orphan SourceRun snapshot references0. Referenced policy roles are NOLOGIN.

No source data fingerprint set was supplied. Therefore this PASS establishes
successful recovery of the exact checksum-verified archive and the available
count/history/schema controls, **not full independently verified production
row-fingerprint parity or current production state**. Cluster ACL/password/owner
parity is also not claimed; no-owner/no-acl intentionally does not restore them.

### Additional actual commands/results

| Check | Exit/result |
| --- | --- |
| Same outside-Git helper resumed | 0; decrypt/checksum/custom-format/restore PASS |
| Existing restore-test.sh, clean local env | 0; guarded loopback restore PASS |
| Local docker exec psql count/history/schema controls | 0; results above |
| Local docker exec psql migration/RLS/policy/orphan checks | 0; results above |
| Node checked-in migration SHA256 and input recheck | 0; all4 match; ciphertext/metadata unchanged |
| Final diff/links/bounded scan/prior-report byte-match | PASS |

Owned PG17 container is retained for review, running with loopback binding only;
no existing file or container was deleted. No additional application smoke or
production access was performed. Any later removal is limited to this named owned
resource and requires a separate operator decision.

## 8. Current next safe step and unchanged HMAC disposition

Restore blocker RESOLVED. Owner decryption action is external evidence; the
successful checksum/restore and SQL controls above are independent agent evidence.
No further decryption/passphrase action is needed for this completed drill.

HMAC remains as section4: Backend2-reported204 alone lacks empty-body/no-store
proof and deployment correlation. Vercel Ready/alias/applied Production secret
scope remain **PENDING OWNER**. New HMAC POST is not authorized or performed.
Next safe step is read-only Owner metadata confirmation and external review of
the residual evidence gaps; any further acceptance POST requires fresh explicit
authorization. C2 publish/cache convergence is still separate.

Only this existing report was updated in this resumption. Prior HMAC/Part18
reports, FRONTEND_REVALIDATION.md and all runtime/tooling remain unchanged.
No production writes, POST, apply, SSH mutation, deployment, systemd action,
ingestion or snapshot publication. No commit/push/PR/merge. STOP for review.
