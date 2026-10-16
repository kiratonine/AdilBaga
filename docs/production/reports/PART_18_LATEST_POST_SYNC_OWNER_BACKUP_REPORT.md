# Part18 — Latest Post-Sync Owner Backup Verification

Status: **BLOCKED**.

**Current verification summary:** GPG decrypt PASS; independent plaintext
SHA256 PASS; PostgreSQL17 restore exit0 PASS; counts10/10 PASS. Legacy default
MD5 matches9/10: product_mappings remains a historical/default fingerprint
**FAIL**. The separate extra_float_digits=0 diagnostic matches its reference,
but does not replace that FAIL. Binary-safe production parity **NOT VERIFIED**:
the LOCAL pm-audit-v1 values below lack an independent matching source reference
for this recovery point. **Overall strict gate remains BLOCKED.**

The initial BATCH_DECRYPT_FAILED and first-attempt NOT RUN results below are
historical, superseded only by the documented Owner-authorized resumption.
They are retained unchanged, not rewritten as PASS. No new production observation,
latest live snapshot or subsequent sync status is asserted by this summary.

## Provenance and isolation

Date:2026-10-15. Fresh origin/main:
**308dc43ce2c10c4c76c2a24ea3de2c3ebd7c3481**.
Created a separate clean native-WSL worktree and branch
**audit/part18-owner-backup-20261015** at that exact SHA. Initial tree clean.
The previous HMAC worktree, its branch/files and older containers were untouched.
Read Owner project rules, existing
[backup/restore guidance](../../../ops/postgres/README.md), guard/restore script
and [recent recovery report](PART_18_POST_PUBLISH_OWNER_RESTORE_REPORT.md).

## Input checks — PASS

Artifact: `app-public-20261015T150411Z-FKLJbaJL.dump.gpg`, adjacent JSON and
fingerprints.txt in the designated private Owner directory. Absolute private
paths, key material, recipients and raw metadata contents are omitted.

| Check | Actual result |
| --- | --- |
| Exact input files | All3 exist, regular, not symlinks |
| Path resolution | Canonical paths equal specified paths; checked private ancestors are directories, not symlinks |
| Encrypted bytes | **4316794**, exact expected size PASS |
| Independently computed ciphertext SHA256 | `48dd1c287fdf6731a16f959611354d64d1b29c5a1846ca72bb9414d88a62e753`, PASS |
| JSON plaintext SHA256 | `762540773537489e8e7c254a08ec58ef36e207d443e1538a47ad98a8d40732a8`, matches supplied expectation |
| Independent decrypted checksum | NOT AVAILABLE; batch decrypt failed |
| Input directory / ciphertext permissions | 0755 /0644; files remain in the Owner private hierarchy; no permission change performed |
| Existing Owner GPG home | Existing standard context, directory0700; no key import/change |
| Supplied count/MD5 records |10 unique fixed-allowlist records parsed as data |

JSON.parse only; fingerprints were read as table/count/hash records, not executed.
The fixed allowlist is stores/store_locations/categories/canonical_products/
raw_products/product_mappings/offers/snapshots/source_runs/_prisma_migrations.
Duplicate/incomplete references are rejected; no arbitrary SQL identifier allowed.

## Execution and STOP

An outside-Git temporary preflight used a clean environment with no production
DSN/provider context. Existing GPG batch decrypt to process stdout was bounded30s;
raw stderr/partial plaintext were not printed. It returned nonzero, producing only
**batch_decrypt_failed**, helper exit1. Cause not classified; no assumption that
the key is missing/corrupt or that passphrase alone is the cause.

No retry, passphrase request, key import or security bypass. No plaintext dump
file was written by this preflight. No new container/database created; unchanged
ops/postgres/restore-test.sh was **NOT RUN**. Older restores were not reused.

| Required verification | Result |
| --- | --- |
| Decrypt / actual plaintext checksum / custom-format validation | BLOCKED / NOT RUN / NOT RUN |
| New loopback PG17 / restore --exit-on-error | NOT RUN |
| Snapshot43d8bd41-b3f0-4857-9e00-3b2c95638f78, reported published2026-10-15 15:00:54.813UTC | NOT VERIFIED; Owner/Backend2-reported identity only |
| Counts and MD5 for all10 tables | NOT RUN; reference parsing is not comparison |
| product_mappings default versus extra_float_digits0 comparison | NOT RUN; no forced setting-based PASS |
| Snapshot/SourceRun history, migration checksums, RLS/policies, indexes/constraints, orphans | NOT RUN |
| Unchanged pm-audit-v1 three LOCAL hashes | NOT RUN; no matching production reference claimed |

## Actual commands and final checks

- RTK fetch origin --prune, worktree inventory, fresh branch/worktree creation,
  clean status and HEAD check: exit0, exact baseline above.
- Source/rules/restore/recovery-document reads: exit0; no source modifications.
- Outside-Git Node preflight: **exit1** after inputs PASS, batch decrypt failure.
- git diff --check, Markdown links, scope and bounded secret scan: PASS.
- Only this new report is present in Git status; tracked source and previous
  reports are unchanged. No private input or helper is placed in the repository.

## Next safe step and limitations

Owner may unlock the existing local GPG context through trusted pinentry and
confirm readiness; never send passphrase/private key in chat. Resume only after
confirmation, with a new owned loopback PG17 and unchanged restore safeguards.
Then record default aggregate results and the separately authorized transaction-
local extra_float_digits0 comparison, preserving both. Run unchanged pm-audit-v1
as LOCAL evidence; do not substitute older hashes or claim independent production
parity without a matching reference tied to this recovery point.

No production SSH/SQL/POST, sync/systemctl/deploy/migrations, restore, rollback,
commit/push/PR/merge or runtime/tooling changes. No old backup/container deletion.
STOP for independent Code Review and Owner decryption-context action.

## Owner-authorized resumption — 2026-10-15

**Decrypt/restore PASS; counts10/10 PASS; default legacy MD5 gate9/10, FAIL.**
**Overall BLOCKED** pending independent review/reference for product_mappings.
Earlier batch-decrypt failure remains historical above, now RESOLVED. The
diagnostic0 match below does not replace the default FAIL or certify production
parity. Owner reported successful interactive decrypt; the following checks were
executed independently after that confirmation.

### Immutable source, rechecked inputs and isolated restore

Same branch audit/part18-owner-backup-20261015 and HEAD
308dc43ce2c10c4c76c2a24ea3de2c3ebd7c3481. Initial status only this untracked report.
Same three exact regular nonsymlink files were rechecked and parsed as data.
Encrypted4316794 bytes and ciphertext SHA256 from the initial table still match.
Batch decrypt through the existing Owner context now PASS. Independent plaintext
SHA256 equals **762540773537489e8e7c254a08ec58ef36e207d443e1538a47ad98a8d40732a8**;
pg_restore --list confirms valid custom format. No passphrase request/key import.

New owned container **aktau-latest-restore-8731a05fc3**, ownership label
aktau.latest-restore=20261015; PostgreSQL17.11, database **part11_latest_20261015**,
actual sole host bind **127.0.0.1:32772**. Final TCP readiness and SELECT1 passed.
Only generated local credentials were used, never production DSNs. Older
containers/worktrees were neither connected to nor changed.

Documented NOLOGIN reader/writer prerequisites created locally. Archive contains
SCHEMA public: after proving owned fresh DB identity and no public relations/
functions/types, only the empty target public schema was dropped RESTRICT,
without CASCADE; absence verified. Unchanged **ops/postgres/restore-test.sh
exited0**, restore_checksum_and_exit_zero:PASS, preserving --no-owner --no-acl
--exit-on-error, checksum and custom-format guards. Existing EXIT plaintext
cleanup retained; no plaintext dump placed in Git or retained by the helper.

### Counts and exact aggregate fingerprints

All subsequent SQL ran in **BEGIN READ ONLY / ROLLBACK** with connection-only
default_transaction_read_only=on and statement_timeout=5000. Actual read_only=on.
Fixed10-table allowlist; exact expression:
md5(string_agg(t::text, chr(10) order by t::text)). References unchanged.

| Table | Reference/restored count | Count | Default MD5 |
| --- | ---: | --- | --- |
| stores | 3 | PASS | MATCH |
| store_locations | 15 | PASS | MATCH |
| categories | 10 | PASS | MATCH |
| canonical_products | 3683 | PASS | MATCH |
| raw_products | 14075 | PASS | MATCH |
| product_mappings | 14075 | PASS | **FAIL** |
| offers | 14075 | PASS | MATCH |
| snapshots | 5 | PASS | MATCH |
| source_runs | 15 | PASS | MATCH |
| _prisma_migrations | 4 | PASS | MATCH |

product_mappings reference: **887c1394e99e78be8ac7401729f3f7b9**.
Original local default extra_float_digits=**1** aggregate:
**7eae8ae5fcb347590520fee167e04ca0**, reference_match=false.
Separate READ ONLY transaction with **SET LOCAL extra_float_digits=0**:
**887c1394e99e78be8ac7401729f3f7b9**, reference_match=true, diagnostic only.
Afterward default1 remains. TimeZone UTC, DateStyle ISO, MDY; database collation
en_US.utf8. No global/session-persistent config change, rounding, expression
variation or reference rewrite. Source-session0 is previously documented behavior,
not an independently inspected current production session by this agent.

### Local history/security/structure — PASS

Exactly5 snapshot **records**; statuses separately observed: published5, others0.
Expected latest **43d8bd41-b3f0-4857-9e00-3b2c95638f78**, publishedAt stored
2026-10-15 15:00:54.813 in timestamp-without-time-zone, offers3292. Previous
1bbda89e… exists, published, offers3312; prior cefa9f11…,62c0bfeb… and baseline
exist published with3256,3352,863 offers respectively.

SourceRuns15, succeeded15;3 distinct stores per snapshot, missing finished/captured
timestamps0, aggregate errorCount0. Source productCount sums match observed
per-snapshot offer counts. Duplicate snapshot/store groups0, negative counts0.

Four successful/non-rolled-back migrations and all stored checksums match exact
checked-in migration.sql SHA256:20260923000000_init,
20261004000000_rls_runtime_access,20261005000000_snapshot_history,
20261006000000_catalog_taxonomy. No Prisma command was run.

RLS10/FORCE0 (includes restored _prisma_migrations);23 exact permissive policy
tuples match reviewed reader6/writer17 expectations. Constraints25, all validated,
expected final names; indexes32, all valid/ready, expected final names.
Definitions/uniqueness inspected against migrations, no DDL. All checked orphan
counts0: source→snapshot/store, raw→snapshot/store, mapping→raw/canonical,
offer→snapshot/canonical/store/composite raw-snapshot, canonical→category,
location→store. Snapshot status/publishedAt inconsistencies0.
This does not verify production role memberships/ACLs/passwords: no-owner/no-acl
deliberately excludes them; restored policy metadata is not runtime access proof.

### Unchanged pm-audit-v1 — LOCAL evidence only

Confirmed exactly7 expected product_mappings fields/types, all NOT NULL.
Executed unchanged [audit SQL](../../../scripts/perf/product-mappings-audit.sql)
in READ ONLY transaction, source SHA256
2724732f7020dc0877ca6148b2a5bc3aab0de3f2dc008945b0db3f816bb8ad74.

| LOCAL pm-audit-v1 result | Value |
| --- | --- |
| count | 14075 |
| nonFloatFieldsFingerprint | bd3d46dd92de26bae4fce9602c2297bb |
| matchConfidenceBinaryFingerprint | e0b84a02e818dd38915efe4c5c50cb7a |
| fullCanonicalFingerprint | 2180e033d40e56a404105a011068390e |

No independent matching production reference for this latest recovery point was
supplied. Earlier10783-row audit cannot be reused. Need Backend2/Owner evidence
from the same recovery state using unchanged pm-audit-v1 plus count/script identity
and capture/session provenance before equivalent binary-safe parity acceptance.
Separately created backup/reference/audit captures do not imply a shared MVCC
snapshot. Default MD5 mismatch remains FAIL; diagnostic match is not forced PASS.

### Actual execution results and final safety checks

| Check | Exit/result |
| --- | --- |
| Repeated input/batch preflight | 0; size/hashes/decrypt/custom format PASS |
| New local restore through unchanged restore-test.sh | **0**, PASS |
| Default10-table queries / separate0 diagnostic | SQL exit0; counts10/10, default hashes9/10 |
| First restore helper overall | 1 after restore/counts/history controls; optional lc_collate setting lookup unavailable in PG17 |
| Follow-up read-only integrity helper, no restore rerun | **0**; history/schema/security and pm-audit checks completed |
| Metadata cause check | lc_collate GUC absent; collation read from pg_database, no config change |
| Final diff-check/links/scope/bounded scan/history preservation | PASS |

Only this existing report appended; initial BLOCKED history retained exactly.
No other report/source/runtime/schema/migration/tooling or input modification.
New owned loopback container retained for review; older containers untouched.
No production SSH/SQL/POST, ingest/systemctl/timer/deploy/rollback, commit/push/
PR/merge. STOP with **BLOCKED** for independent Code Review of the default
fingerprint discrepancy and missing matching latest binary-safe source reference.
