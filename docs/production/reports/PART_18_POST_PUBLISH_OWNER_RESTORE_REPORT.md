# Part18 — Post-Publish Owner Backup Verification

Status: **READY_FOR_EXTERNAL_REVIEW**.

**Current Recovery Integrity: PASS (equivalent binary-safe verification).**
Counts10/10, unaffected legacy fingerprints9/9 and product_mappings pm-audit-v1
fingerprints3/3 match. Production audit is Backend2-reported; local restore/audit
was independently executed. See section11 for the final reconciliation and
separate-capture limitations. This is not absolute transactional production parity.
Historical BLOCKED/decrypt and legacy MD5 FAIL evidence remains below for audit;
the legacy comparison was not rewritten as PASS. **HMAC C1/C2 remain open**;
this report's recovery acceptance is not final Part18 launch acceptance.

## 1. Provenance and isolation

Date: 2026-10-15. Existing worktree branch feat/part-18-hmac-acceptance.
Fresh fetch exited0; HEAD=origin/main=
**c8e7bb74e2e5cb31d1d1e460ed57c6456d0d8f5f**.
Existing frontend revalidation documentation and three untracked Owner/HMAC
reports preserved. Project rules, backup README/guard/restore script, previous
[Owner restore report](PART_18_OWNER_BACKUP_RESTORE_REPORT.md) and
[HMAC report](PART_18_STAGE_C_HMAC_PRODUCTION_REPORT.md) reviewed.
No old container was used or modified. Previous successful recovery remains
historical PASS for its own archive, not proof for this new archive.

## 2. Initial artifact and path checks — historical; decryption superseded by section7

Artifact: `app-public-20261014T155105Z-KcItpcHK.dump.gpg` with adjacent JSON
and fingerprints.txt, in the Owner-designated private input directory.
Absolute private paths, recipient identifiers and metadata source paths omitted.

| Check | Actual result |
| --- | --- |
| Three files exist, regular, not symlinks | PASS |
| Canonical paths equal supplied paths | PASS; no redirected input |
| Encrypted size | **3363472**, exact expected bytes PASS |
| Independently computed ciphertext SHA256 | `60e7656a0cae0991a0ae671bb18a8ef21829275939195cac509bce9b534849ff`, PASS |
| JSON plaintext SHA256 | `ccf70ac435706fd84c2fe85dcb652ede16c45c30179991e123241bbf216f8c32`, expected metadata value PASS |
| Independently computed decrypted SHA256 | NOT AVAILABLE; decryption failed |
| Input permissions | Three files0644, immediate directory0755, enclosing private ancestors0700; effective traversal restricted. No chmod performed |
| Existing Owner GPG context | Standard existing keyring directory0700; no import/change |

JSON was parsed with JSON.parse only; no command evaluation or shell sourcing.
fingerprints.txt was parsed as data only. Its10 allowlisted table records contain
table name, count and32-character lowercase MD5. Header/footer rows were not
executed or used as SQL. Duplicate/missing table records are rejected.

Initial parser expected table/hash only and safely stopped before decrypt;
inspection of token classes showed the actual table/count/hash representation.
The parser was corrected to read that existing format without altering the input
or fingerprint expression. The subsequent single decryption attempt failed.

## 3. Exact comparison plan and initial unavailable results — historical

The outside-Git temporary helper uses this fixed table allowlist only:
stores, store_locations, categories, canonical_products, raw_products,
product_mappings, offers, snapshots, source_runs, _prisma_migrations.
Identifiers never come from arbitrary metadata text.

For each allowed table, the required SQL is exactly:

```sql
SELECT md5(string_agg(t::text, chr(10) order by t::text))
FROM public."<fixed_allowlisted_table>" AS t;
```

No alternate serialization, collation, rounding, binary-float replacement or
expression search is permitted for this task. Restored count and MD5 must both
equal the supplied record; mismatch requires FAIL/STOP, not data repair.
**This SQL was not executed**, because decrypt prerequisite failed.

| Required table | Expected count explicitly provided by Owner | Restored count | Fingerprint comparison |
| --- | ---: | --- | --- |
| stores | Reference file available | NOT RUN | NOT RUN |
| store_locations | Reference file available | NOT RUN | NOT RUN |
| categories | Reference file available | NOT RUN | NOT RUN |
| canonical_products | 3666 | NOT RUN | NOT RUN |
| raw_products | Reference file available | NOT RUN | NOT RUN |
| product_mappings | Reference file available | NOT RUN | NOT RUN |
| offers | 10783 | NOT RUN | NOT RUN |
| snapshots | 4 records; published statuses checked separately | NOT RUN | NOT RUN |
| source_runs | 12 | NOT RUN | NOT RUN |
| _prisma_migrations | Reference file available | NOT RUN | NOT RUN |

New snapshot `1bbda89e-165d-4518-86a9-14af53a89c4a`, previous snapshot presence,
migration names/checksums/history, RLS/policies, constraints/indexes and orphan
references are **NOT CHECKED** on a restored instance in this task.
No counts from the older restore were substituted as current results.

## 4. Initial execution and STOP — historical, superseded by section7

Temporary helper outside Git used an explicitly clean local environment without
production DSNs. Before Docker operations it attempted existing GPG batch decrypt
to process memory, bounded30s; raw stderr/plaintext/key data were not emitted.
GPG returned nonzero, helper exited1 with the sanitized class **decrypt_failed**.
Cause not independently classified; no assumption of a missing/corrupt key or
wrong passphrase. A previous-day successful unlock does not prove present batch
availability for this artifact.

No new PostgreSQL container/database was created. Unchanged
ops/postgres/restore-test.sh was **NOT INVOKED**. Its guard/checksum/custom-format/
pg_restore --no-owner --no-acl --exit-on-error remain mandatory for the resumed
drill, with a fresh loopback PG17 and local NOLOGIN reader/writer prerequisites.
No existing backup/container/keyring file was deleted or changed. The helper did
not create a plaintext dump file.

| Command / check | Exit / result |
| --- | --- |
| RTK fetch/status/branch/HEAD/origin/main | 0; baseline above |
| Node lstat/realpath/permissions/size/crypto hash/JSON checks | 0; input PASS |
| Safe fingerprint token-shape inspection | 0;10 records recognized |
| Initial outside-Git parser invocation | 1; format guard, before decrypt |
| Corrected outside-Git invocation | 1; inputs PASS, then decrypt_failed |
| Fresh PG17 / restore / checksum of decrypted bytes / SQL checks | NOT RUN |
| Scope/diff-check/Markdown links/bounded scan/prior-report preservation | PASS |

## 5. Backend2 publish evidence and limits

Owner relays Backend2's first production sync on2026-10-14: snapshot
1bbda89e-165d-4518-86a9-14af53a89c4a, publishedAt15:47:52UTC, offers+3312 and
frontend_revalidation success. These are **REPORTED** production facts, not
independently inspected live data or C2 cache-convergence evidence.
No production SQL, HTTP POST, SSH, sync/apply, systemd/timer/deploy/rollback,
Backend2 changes or Git commit/push/PR/merge occurred. Auto-deploy stays FROZEN.

Only this report is new. The existing HMAC report receives a short append-only
external-evidence note, preserving the original agent0/2 POST ledger. All other
reports, runtime and restore tooling remain byte-identical.

## 6. Initial next Owner action — historical, completed before section7

Restore gate remains BLOCKED until this new artifact can be batch-decrypted
through the existing trusted local GPG context. Owner may locally unlock the
existing key using trusted pinentry or perform the unchanged restore script
manually with the protected context; never send passphrase/private key in chat.
Do not import a replacement key, weaken checks or decrypt into the repository.
After Owner confirmation, resume a new isolated loopback PG17 drill and the
exact10-table count/MD5 comparison. Any mismatch must STOP with FAIL.
No new production authorization is implied. STOP for Code Review/Owner action.

## 7. Owner-authorized continuation — restore PASS, fingerprint gate FAIL

Date:2026-10-15. Owner reports manual OWNER_DECRYPT_SHA256 PASS after unlocking
the existing GPG context and authorizes continuation of the stopped drill.
Same worktree/branch and exact source baseline from section1; Git status checked,
existing changes preserved. Previous successful restore containers were not used.
The existing outside-Git helper was resumed; restore script/guard/pg-run and
runtime/schema source were not modified.

### Decrypt, isolated target and restore

The helper rechecked all three regular nonsymlink input paths, exact encrypted
size/ciphertext SHA256, JSON plaintext hash and10 allowlisted count/hash records.
Batch decryption through the existing Owner GPG home now exited0.
Independent plaintext SHA256 matched
`ccf70ac435706fd84c2fe85dcb652ede16c45c30179991e123241bbf216f8c32`;
pg_restore --list confirmed custom format. No passphrase requested or key imported.

New task-owned container **aktau-postpublish-restore-bf47e4cb4f**, image
postgres:17-alpine, fresh database **part11_postpublish_20261015**. Random local
credentials were process-environment only; no production DSN was supplied.
The actual Docker host binding was checked as127.0.0.1 with a dynamic port.
Final TCP pg_isready and TCP SELECT1 passed within the bounded readiness window.

Only the documented local NOLOGIN aktau_api_reader/aktau_ingest_writer roles
were created. Because the archive TOC contains SCHEMA public, the helper first
proved this owned fresh target identity and no public relations/functions/types,
then executed **DROP SCHEMA public RESTRICT**, no CASCADE, and checked absence.
No old container/database/schema was touched.

Unchanged **ops/postgres/restore-test.sh exited0**, reporting
restore_checksum_and_exit_zero:PASS. Decrypt/checksum/custom-format and
pg_restore --no-owner --no-acl --exit-on-error all passed. Existing plaintext
temporary-file EXIT cleanup remained enabled. The separate precheck used
process memory only and zeroed its dump buffer. No retained plaintext dump added.

### Exact allowlisted comparison — independently observed

The SQL from section3 was executed without substitutions or alternate
serialization: md5(string_agg(t::text, chr(10) order by t::text)). Each table
identifier came only from the fixed allowlist. Comparisons use the supplied
fingerprints.txt parsed as data, never executable content.

| Table | Reference count | Restored count | Count match | Exact MD5 match |
| --- | ---: | ---: | --- | --- |
| stores | 3 | 3 | PASS | PASS |
| store_locations | 15 | 15 | PASS | PASS |
| categories | 10 | 10 | PASS | PASS |
| canonical_products | 3666 | 3666 | PASS | PASS |
| raw_products | 10783 | 10783 | PASS | PASS |
| product_mappings | 10783 | 10783 | PASS | **FAIL** |
| offers | 10783 | 10783 | PASS | PASS |
| snapshots | 4 | 4 | PASS | PASS |
| source_runs | 12 | 12 | PASS | PASS |
| _prisma_migrations | 4 | 4 | PASS | PASS |

**snapshots=4 is the number of records**, not a claim of four published statuses.
Published-status counts are a separate check and were **NOT RUN** after this
fingerprint failure. No inference about status distribution is made from row count.

After completing the10-table fingerprint comparison, the helper exited1 with
**fingerprint_mismatch**. The mismatch is not by itself proof of data loss or a
specific serialization cause. No alternate hash expression, rounding,
extra_float_digits/locale/timezone adjustment, input edit, row inspection or
second restore was attempted to force agreement.

### STOP disposition and checks not reached

Per Owner FAIL/STOP condition, no further SQL was executed. Explicit new/previous
snapshot ID/history checks, separate published statuses, migrations provenance,
RLS/policies, constraints/indexes and orphan-reference audits were **NOT RUN**.
The matching snapshots/_prisma_migrations fingerprints are evidence of equality
under this supplied aggregate only, not a substitute for those separate audits.
No historical result from the older backup is presented as current proof.

| Actual command / gate | Exit/result |
| --- | --- |
| Git branch/status and rules/tooling/report review | 0; existing branch preserved |
| Same temporary helper resumed | 1 overall; fingerprint gate FAIL |
| Batch GPG decrypt + independent SHA256 + pg_restore --list | 0; PASS |
| Fresh loopback target readiness and local prerequisites | 0; PASS |
| Existing restore-test.sh | **0**, checksum/custom-format/restore PASS |
|10 allowlisted COUNT and exact aggregate MD5 queries | SQL exit0; counts10/10, hashes9/10 match |
| Further structural/history/security SQL | NOT RUN after STOP |
| Scope/diff-check/Markdown links/bounded scan/previous-report preservation | PASS |

New owned container is retained for review, loopback-only. No prior container,
backup or keyring was deleted/changed. No production POST/SQL, SSH, sync/apply,
systemd/timer/deploy/rollback, Backend2/runtime/schema/tooling modification or
Git commit/push/PR/merge. Only this existing report changes in the repository.

## 8. Current next safe step

Decrypt blocker is RESOLVED; overall acceptance remains **BLOCKED** because the
required10/10 fingerprint gate returned **FAIL**. Request external review of the
product_mappings discrepancy and a separately bounded diagnostic scope. Preserve
the supplied fingerprints and backup unchanged. Do not independently normalize
hashes, repair data or infer a production defect. HMAC C1/C2 remains outside this
drill and no new production action is authorized. STOP for Code Review.

## 9. Separately authorized LOCAL read-only float diagnostic — 2026-10-15

**DIAGNOSTIC ONLY. Original fingerprint gate FAIL and overall BLOCKED remain.**
No restore rerun, data/reference edit or acceptance reinterpretation. The following
does not establish production parity or silently replace section7 results.

### Isolation and historical hypothesis

Inspected only the existing owned container
**aktau-postpublish-restore-bf47e4cb4f**: expected name, ownership label
aktau.postpublish-restore=20261015, image postgres:17-alpine, running.
Actual binding **127.0.0.1:32771**; no non-loopback PostgreSQL bind.
Before table queries, a READ ONLY transaction confirmed database
**part11_postpublish_20261015**, server port5432, transaction_read_only=on.
No connection to any other PostgreSQL instance. No credential/env dump emitted.

Read the historical [Part08 migration report](PART_08_PRODUCTION_MIGRATION_REPORT.md)
and [Part13 report](PART_13_REPORT.md), and the unchanged
[versioned audit SQL](../../../scripts/perf/product-mappings-audit.sql).
Part08 reports a production0/local1 extra_float_digits representation mismatch.
Part13 separately used a reviewed field-complete binary-safe proof for an older
archive. Neither historical result proves the current cause or current parity.

Reference product_mappings was read from existing fingerprints.txt strictly as
data: count **10783**, aggregate MD5 **db27de6ef8bb99383ce6930a3c9256b6**.
Reference file SHA256 remained identical before/after this diagnostic.

### Exact aggregate with two authorized transaction-local settings

Each test used a separate **BEGIN READ ONLY**, SET LOCAL extra_float_digits,
the exact unchanged aggregate, then ROLLBACK. Connections also specified
default_transaction_read_only=on and statement_timeout=5000 through local
PGOPTIONS; no global/server/role/database configuration was changed.

```sql
SELECT md5(string_agg(t::text, chr(10) order by t::text))
FROM public.product_mappings AS t;
```

| Actual extra_float_digits | transaction_read_only | Count | MD5 | Reference match |
| ---: | --- | ---: | --- | --- |
| 0 | on | 10783 | db27de6ef8bb99383ce6930a3c9256b6 | true |
| 1 | on | 10783 | 11c8b66395f795e2a3ee57dc316946c8 | false |

After transactions, a separate read-only connection still observed
extra_float_digits=**1**. No expression variant, float rounding or other setting
search was performed. The two values were the specifically authorized diagnostic
comparison, not a new acceptance baseline.

**Confirmed:** this restored dataset's exact textual aggregate changes with
extra_float_digits; its0 representation equals the supplied reference hash.
**Still a hypothesis:** Backend2's reference was produced at0 and the original
mismatch is entirely representational. Backend2's effective reference-session
setting and source-side field-complete equivalence have not been independently
confirmed. Matching at0 alone is not proof of production parity or absence of
all possible data differences. The original1 mismatch remains a recorded FAIL.

### Exact seven-field schema and unchanged binary-safe audit

Read-only pg_attribute metadata confirms exactly7 non-dropped columns, all NOT NULL:

| Field | PostgreSQL type |
| --- | --- |
| id | text |
| rawProductId | text |
| canonicalProductId | text |
| matchMethod | public MatchMethod enum |
| matchConfidence | double precision |
| reviewStatus | public ReviewStatus enum |
| createdAt | timestamp(3) without time zone |

Names, types and nullability match the checked-in initial migration. No extra
field is omitted. The existing product-mappings-audit.sql was read and executed
**byte-for-byte unchanged** inside a READ ONLY transaction with a local public/
pg_catalog search path. Its SQL SHA256 remained
**2724732f7020dc0877ca6148b2a5bc3aab0de3f2dc008945b0db3f816bb8ad74**.
It includes all six non-float fields and exact float8send bytes, ordered by id
COLLATE C, without rounded/text-normalized floating values.

| pm-audit-v1 output | Local restored result |
| --- | --- |
| count | 10783 |
| nonFloatFieldsFingerprint | d567d63da98b68b7a11a6352eadd9dc9 |
| matchConfidenceBinaryFingerprint | b9bef6b81fd98a1d0835699be14a407c |
| fullCanonicalFingerprint | 123fca5328ee2ae2565d0ed9fb19cd0a |

These are **local diagnostic fingerprints only**. There is no supplied current
Backend2 pm-audit-v1 reference to compare; binary-safe production parity is NOT
claimed. No row values, samples or float payload bytes were output.

### Required independent Backend2 evidence

For external review, request existing safe evidence or a separately authorized
read-only reference tied to this exact recovery point:

- Exact fingerprint SQL, effective extra_float_digits at reference capture,
  PostgreSQL version and relevant text settings (DateStyle, TimeZone, collation),
  plus assurance that fingerprints/counts and backup correspond to the same
  unchanged snapshot/state rather than different publication windows.
- Exact seven-column type/nullability metadata and count for product_mappings.
- Output of the **same unchanged pm-audit-v1 SQL** for the same source/recovery
  state: count and the three aggregate fingerprints only, no rows or secrets.
- External decision whether this evidence resolves the representation hypothesis;
  no normalization/rewrite of supplied fingerprints or automatic gate promotion.

This request is not authorization for this agent to contact production or cause
Backend2 work. Remaining snapshot-status/history/security audits from section7
stay NOT RUN; this narrow diagnostic did not extend to those gates.

### Commands, checks and safety

| Check | Exit/result |
| --- | --- |
| RTK Git status/branch and targeted source/report inspection | 0; existing scope preserved |
| Docker name/label/image/running/binding metadata | 0; owned target PASS |
| Outside-Git diagnostic invocation using docker exec psql -X -v ON_ERROR_STOP=1 | 0; all permitted local queries PASS |
| Separate READ ONLY transactions at0 and1 | 0; settings/hashes/matches above |
| Schema verification and unchanged audit SQL in READ ONLY | 0; seven-field/audit outputs above |
| Post-transaction setting/reference-file preservation | 0; default1 and reference unchanged |
| Final diff-check/links/scope/bounded scan/report-prefix and other-file preservation | PASS |

Only this report receives this append-only addition. Previous report bytes are
retained as its exact prefix; all other reports/docs/SQL/runtime/tooling unchanged.
No production SQL/POST, SSH, restore, sync/apply/systemd/deploy/rollback, row dump,
data mutation, global GUC change, commit/push/PR/merge. STOP for Code Review.

## 10. Separately authorized LOCAL read-only integrity/security gates — 2026-10-15

**Remaining LOCAL gates: PASS. Original fingerprint FAIL and overall BLOCKED
remain unchanged.** These results do not promote the diagnostic0 hash match
to production parity and do not replace any historical STOP outcome.

### Target and read-only enforcement

Revalidated only **aktau-postpublish-restore-bf47e4cb4f**, expected ownership label
aktau.postpublish-restore=20261015, postgres:17-alpine, running, actual bind
**127.0.0.1:32771**. Database **part11_postpublish_20261015**, server17.11,
server port5432. No other PostgreSQL instance contacted.

Every SQL batch used BEGIN READ ONLY / ROLLBACK. Connections also set
default_transaction_read_only=on and statement_timeout=5000 through local
PGOPTIONS; actual transaction_read_only=on verified before table inspection.
No writes, role/grant changes, security bootstrap, configuration change or restore.

Expected objects/semantics were derived from checked-in init, RLS,
snapshot_history and taxonomy migrations, reviewed reader/writer policy SQL,
[backup guidance](../../../ops/postgres/README.md), and historical Part08/13
reports. These SQL artifacts were **read only, never executed**.

### Snapshot records and SourceRun history

Exactly **4 snapshot records**. Independently grouping/inspecting statuses shows
**published4**, building0, validating0, failed0. This is a separate status
observation, not an inference from the record count.

| Snapshot | Actual status | Offers | SourceRuns | Source statuses | Source productCount sum |
| --- | --- | ---: | ---: | --- | ---: |
| baseline-internal-v1 | published | 863 | 3 | succeeded3 | 863 |
| 62c0bfeb-dcbe-432f-abf9-c108e6fdb9a5 | published | 3352 | 3 | succeeded3 | 3352 |
| cefa9f11-9d4c-4685-af24-a931fe0dea7a | published | 3256 | 3 | succeeded3 | 3256 |
| 1bbda89e-165d-4518-86a9-14af53a89c4a | published | 3312 | 3 | succeeded3 | 3312 |

New and previous snapshots both exist. New snapshot has the latest observed
publishedAt, stored **2026-10-14 15:47:52.182** in the timestamp-without-time-zone
column. No production timezone/state was independently inspected here.
All publishedAt values present; publication status/timestamp check violations0.

SourceRuns total **12**, succeeded12, failed0, pending0. Each snapshot has3
distinct store links; duplicate snapshot/store groups0, orphan snapshot/store
links0, negative product/error counts0. ErrorCount sum0 for all four groups;
all finishedAt and capturedAt present. Aggregated productCount matches the
observed per-snapshot offer totals above; no claim of per-row business matching.

### Prisma history — exact checked-in source match

Exactly4 rows; each finished_at non-null and rolled_back_at null. Stored checksum
equals independently computed SHA256 of the corresponding migration.sql:

| Migration | Stored/source SHA256 |
| --- | --- |
| 20260923000000_init | a5515ab64d6f8307df96971eb9ee1f7f41d6873e877d591167bde6450e881a92 |
| 20261004000000_rls_runtime_access | aa5d016c002f9b9d7d1feb3de2b77bd667879466ec3e808f6452b620afe09e79 |
| 20261005000000_snapshot_history | 82a460310d62080758cfba9054782a64d67716c788a9d5f1cfceabc7a0a57a12 |
| 20261006000000_catalog_taxonomy | e34498c4c4d2331eb4a2090702bbd6003bffaea4698d97c1cb27bdc36b7673fa |

Init has non-null historical logs metadata; no logs contents were read or printed.
Its successful completion state is confirmed, not inferred from logs absence.
No Prisma command, migration replay/resolve or history mutation performed.

### Restored RLS/policy and structural metadata

- All10 public tables have RLS enabled and FORCE false: **RLS10/FORCE0**.
  Nine application-table RLS flags agree with reviewed migrations. The additional
  _prisma_migrations RLS is the restored observation already documented earlier;
  its provenance/production intent is not inferred from migration source.
- Exactly **23 permissive policies**, reader6 and writer17. Exact table/name/
  command/role/USING/WITH CHECK tuples match the expected reader table list and
  reviewed writer CREATE POLICY statements. No unexpected policy; reader is
  SELECT-only on stores/store_locations/categories/canonical_products/offers/
  snapshots. _prisma_migrations has no policy. SQL was not applied.
- **25 constraints**:10 primary keys,12 foreign keys,3 checks. Exact expected
  name set matches the final migration composition, including removed legacy
  offers_rawProductId_fkey and the replacement composite snapshot/raw FK.
  All validated. Definitions inspected: cascade/restrict relationships, snapshot
  publication check and nonnegative source counts agree with migrations.
- **32 indexes**, expected final name set; all valid and ready, including
  primary/unique indexes and snapshot-aware indexes. Legacy raw store/source
  unique index absent; replacement snapshot/store/source and id/snapshot unique
  indexes present. Definitions/uniqueness inspected against declared fields;
  no index created, rebuilt or modified.

This is restored schema/policy metadata verification only. pg_restore
--no-owner/--no-acl does not recreate production ACLs, owners, passwords or
runtime LOGINs. **No effective production least-privilege or runtime/API parity
claim** follows from this local owner-read inspection.

### Referential-integrity controls

All following aggregate violation counts are **0**:

- SourceRun → snapshot/store orphans; duplicate snapshot/store; negative counts.
- RawProduct → snapshot/store orphans.
- ProductMapping → raw/canonical product orphans.
- Offer → snapshot/canonical/store orphans and rawProductId/snapshotId mismatch.
- CanonicalProduct → category orphans.
- StoreLocation → store orphans.
- Snapshot published-status/publishedAt inconsistency.

Only aggregate violations and schema/history metadata were output, no catalog
row dumps, source error text, secrets or credentials.

### Actual checks, limitations and current disposition

| Check | Exit/result |
| --- | --- |
| RTK status/branch/rules/report/source review and safe Docker metadata | 0; expected worktree/owned target |
| First outside-Git read-only helper | 1; snapshot query PASS, source-summary SQL had an invalid column reference; connection closed without writes |
| Corrected temporary helper, unchanged repository/tooling/schema | **0**, all authorized local gates PASS |
| Snapshot/SourceRun/history queries in READ ONLY | 0; observations above |
| Four source checksum comparisons and policy tuple comparisons | PASS |
| Constraint/index name/health and orphan queries | 0; PASS |
| Final diff-check/links/scope/bounded scan/append-only and previous-file preservation | PASS |

One optional source discovery used a nonexistent staging.go path (exit2);
actual checked-in migrations/policy artifacts supplied the expectations. Neither
this lookup nor the corrected local SELECT changed runtime or DB state.

The original product_mappings fingerprint gate remains **FAIL** and report
status remains **BLOCKED** pending independently reviewed Backend2 evidence.
Section9 matching at extra_float_digits0 stays diagnostic only. This addition
closes the previously unexecuted **local** history/schema/security checks, not
production fingerprint/API/ACL parity, HMAC C1/C2 or final launch acceptance.

Only this report appended. Prior bytes retained as exact prefix; other reports,
runtime, migrations, policy SQL, restore/audit tooling unchanged. No production
SQL/POST, SSH, new restore, sync/apply/systemd/timer/deploy/rollback, commit/push/
PR/merge. Container retained unchanged. STOP for Code Review.

## 11. Final recovery reconciliation — Backend2 production handoff, 2026-10-15

**Recovery Integrity: PASS (equivalent binary-safe verification).**
Owner states external Code Review accepted the local integrity/security gates
with limitations, and relays a separately authorized Backend2 production audit.
This section reconciles that new evidence; no SQL/network/SSH/restore was run
by this agent in this documentation-only step.

### Evidence attribution and exact comparison

**Backend2-reported production audit:**2026-10-15, exit0, snapshot
**1bbda89e-165d-4518-86a9-14af53a89c4a**, published, product_mappings count10783,
transaction_read_only=on, REPEATABLE READ, unchanged pm-audit-v1 script SHA256
verified. The supplied script identity corresponds to the checked-in audit used
locally; this agent did not observe the production execution or independently
read its session metadata.

**Independently executed local audit:** section9, restored archive already
verified by ciphertext/plaintext SHA256, custom format and unchanged restore exit0;
exact seven-field schema, count10783 and unchanged pm-audit-v1 SQL. Safe local
outputs were already recorded before this production handoff. This step compared
the three newly reported values against those recorded local values,3/3 equal.

| pm-audit-v1 fingerprint | Independently executed LOCAL | Backend2-reported PRODUCTION | Match |
| --- | --- | --- | --- |
| nonFloatFieldsFingerprint | d567d63da98b68b7a11a6352eadd9dc9 | d567d63da98b68b7a11a6352eadd9dc9 | PASS |
| matchConfidenceBinaryFingerprint | b9bef6b81fd98a1d0835699be14a407c | b9bef6b81fd98a1d0835699be14a407c | PASS |
| fullCanonicalFingerprint | 123fca5328ee2ae2565d0ed9fb19cd0a | 123fca5328ee2ae2565d0ed9fb19cd0a | PASS |

Recovery evidence summary:

- **10/10 counts PASS**, compared against supplied Backend2 reference records.
- **9/9 unaffected legacy fingerprints PASS** from the original restored audit;
  product_mappings is explicitly excluded from this9, not silently omitted.
- **3/3 product_mappings binary-safe fingerprints PASS**, complete non-float
  fields plus exact float8send encoding, as the equivalent verification.
- Local history/schema/security gates PASS in section10:4 snapshot records,
  independently observed4 published,12 succeeded SourceRuns,4 source-matching
  migrations, RLS10/FORCE0, policies23, constraints25, healthy indexes32,
  checked orphan/inconsistency counts0.

### Legacy FAIL and session provenance limitations remain

The historical top-level outcome was **BLOCKED**, with **FAIL — product_mappings
fingerprint mismatch**. Section7's legacy MD5 result is retained unchanged.
No original fingerprints.txt value, hash algorithm, backup or data was modified.

Production **extra_float_digits=0** is recorded as Owner/Backend2-reported
configuration/evidence, not an independently observed source session by this
agent. LOCAL **extra_float_digits=1** was independently observed as the restored
default; at1 the unchanged textual MD5 differed. The separately authorized
SET LOCAL0 diagnostic matched the legacy reference. This supports the float
serialization explanation but does not retroactively prove the effective
setting of the historical fingerprint-generation session. No assumption of a
shared historical session is made from current/reported production settings.

The equivalent binary-safe match supplies field-complete evidence without
depending on decimal float formatting. It does **not** erase the legacy FAIL
or certify exact reproduction of that historical session.

Backup and reference fingerprints were created **separately**, and Backend2's
production pm-audit-v1 was a later read-only transaction. REPEATABLE READ makes
that reported transaction internally consistent; it does not establish a shared
exported MVCC snapshot across those captures. The reported snapshot ID/count
and matching aggregate values support recovery integrity under the approved
equivalent method, **not absolute transactional parity** or a guarantee that no
intervening writes ever occurred. MD5 aggregate equality is also not a proof
against deliberate cryptographic collision. Production roles/ACLs/passwords and
runtime/API behavior are outside this no-owner/no-acl archive verification.

### HMAC next-stage readiness — not acceptance

Existing [HMAC production report](PART_18_STAGE_C_HMAC_PRODUCTION_REPORT.md)
was read but **not changed**. C1 and C2 are not promoted to PASS.

- Vercel Ready/alias/correct deployment/applied Production secret are already
  Owner-reported via Евнер; no new independent UI proof is claimed or required
  to be invented. Refresh deployment/source drift evidence before execution.
- Existing outside-Git operator has historical local18-scenario/race/vet PASS;
  no rerun or production execution was needed for this reconciliation.
- Still required: fresh explicit Owner authorization for controlled execution,
  fresh Backend2 no-publish coordination and safe identification/loading of the
  existing protected signing context without secret copying or disclosure.
- Then the bounded one-time C1 sequence may be considered: maximum2 sequential
  POST,≤5s each/≤15s shared;401 empty/no-store then signed204 empty/no-store only
  after first PASS; no retries. **Not authorized or performed by this task.**
- Backend2 standalone signed204 and post-COMMIT notification success remain two
  separate reported events without independently captured body/no-store proof.
  C2 still needs separately approved legitimate-publication cache-convergence
  observation; notification success alone is not that evidence.

Historical agent POST ledger remains **0/2**. Recovery Integrity PASS closes
this recovery verification scope only; it does not authorize HMAC, publish,
ingestion, deployment or broader Part18 completion.

### Documentation verification and safety

Git branch/status/HEAD reviewed; recorded baseline remains
c8e7bb74e2e5cb31d1d1e460ed57c6456d0d8f5f. New reported hashes were compared to
recorded local outputs with a bounded local Node check, exit0,3/3 match.
Final diff-check, Markdown links, scope and bounded report scan PASS. Only this
report changes: current status/summary corrected and this reconciliation appended;
the previous section1–10 body is byte-identical. Other reports/source unchanged.
No secret/config/backup/fingerprint/signing-script changes; no SSH, production
SQL/POST, local SQL, restore, apply/sync/systemd/timer/deploy/rollback or Git
commit/push/PR/merge. STOP for Code Review.
