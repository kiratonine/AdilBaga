# Production Part 08 — Snapshots / ingestion / history / freshness

Status: **READY_FOR_EXTERNAL_REVIEW**

Scope: combined roadmap Parts 08+09. This is an uncommitted local candidate,
not authorization to migrate production or publish a production snapshot.

## Baseline and boundaries

- Branch: `integrate/full-stack`.
- Initial clean HEAD and fetched origin: `ad5136cab9cc1d4f61ff5dd7d66df627b71e6788`.
- Parent: `8e0c53010b1ef6977b2148fb79caa32ed62ee2f3`.
- Initial fetch/prune, branch/status/SHA checks and diff-check: PASS.
- Go: 1.27.1 linux/amd64; Docker: 29.1.3.
- **No production connection, query, backup, migration, role/login creation,
  ingestion or publication occurred.** Existing private application backup was
  restored only into owned loopback-bound `postgres:17-alpine` containers.
- No store-site, Gemini or Upstash request was made. No parser, normalization,
  matching, public API, frontend, voice/provider or pool-policy rewrite.
- No commit, push, merge, tag, deploy, scheduler or Part10 work.

## Original STOP finding — history preserved, resolved in this continuation

The explicit local regression command was:

```text
go test -count=1 -tags=integration ./tests/integration \
  -run '^Test(ProductionClone|LocalCloneParity|LocalVoiceParity|VoiceDiagnosticPrivacy)$' -v
```

It exited **1**. `TestProductionClone`, `TestLocalCloneParity` and
`TestVoiceDiagnosticPrivacy` passed. All nine `TestLocalVoiceParity` subtests
passed: direct cheapest, direct search, numeric-string coordinates,
clarification/continue, category-only, intent-only, missing-one, empty-result,
and errors. Its final assertion failed:

```text
voice_parity_test.go:68: runtime logs leaked voice state
```

The assertion scans the whole serialized log for `43.6`, `51.1`, voice phrase
sentinels and `sessionId`. The failing sentinel/log field was not retained by
this existing harness. **An actual privacy leak has not been established**, and
the failure must not be declared PASS or silently suppressed. No voice/logging
source or assertion was hot-edited. Per Part08 §34, remaining implementation and
validation stopped at this mandatory privacy/regression failure. Review must
resolve the exact cause before this candidate can finish its remaining gates.
The owner subsequently authorized the two targeted review fixes below; no
runtime privacy leakage was established and no runtime logging was changed.

An earlier HTTP harness attempt ran before the `/mnt/d` Nest process was ready
and returned a transport failure. Native-WSL copies of compiled Nest runtime and
Prisma client, without `.env`, subsequently passed explicit readiness and the
full HTTP comparisons below. This environment/startup issue is separate from
the final privacy assertion failure.

## Approved DB contract implemented

New third migration:
`20261005000000_snapshot_history`.

SHA-256:
`82a460310d62080758cfba9054782a64d67716c788a9d5f1cfceabc7a0a57a12`.

- `SnapshotStatus`: building / validating / published / failed.
- `SourceRunStatus`: pending / succeeded / failed.
- Snapshot publication consistency check; source counts nonnegative.
- RawProduct and Offer require `snapshotId` and reference Snapshot.
- Raw uniqueness: `(snapshotId,storeId,sourceProductId)` and `(id,snapshotId)`.
- Composite Offer→Raw FK enforces matching snapshot identity.
- SourceRun uniqueness: `(snapshotId,storeId)`.
- Latest/history/source-run and snapshot-scoped offer indexes are included.
- No extra Offer uniqueness: existing one-to-many Raw→Offer semantics retained.
- Global CanonicalProduct IDs stay stable; there is no canonical-per-snapshot
  table or destructive generic down migration.

Populated backfill creates one published baseline from existing min/max offer
capture timestamps, plus per-store SourceRun capture/count metadata. Empty DB
creates no fabricated published catalog. Only new snapshot references are
written to existing raw/offer rows; no existing ID, price or capture timestamp
is intentionally rewritten.

Old init migration, RLS migration, reader bootstrap and reader rollback hashes
were rechecked and exactly match the four reviewed hashes in Part08. No old
migration/security artifact was edited.

## Runtime and one-shot ingestion

Go resolves one latest published snapshot for each product/filter operation and
uses a read-only repeatable-read view across its bounded queries. Dashboard
remains a single SQL aggregate over current-snapshot usable offers. NestJS has
the corresponding minimal repository-level repeatable-read snapshot selection.
No current-request historical offer fallback or indefinitely cached pointer.

`cmd/ingest` accepts `--bundle <file>`; default is dry-run, `--apply` is explicit.
Required: `APP_ENV`, separate `INGEST_DATABASE_URL`, and explicitly chosen
`INGEST_MAX_STORE_DROP_PERCENT` in 0..100. Production apply additionally requires
`INGEST_PRODUCTION_APPLY_CONFIRM=1`; this flag is **not owner approval** and was
never used against production. The CLI rejects owner/API/non-restricted writer
credentials; it does not use runtime `DATABASE_URL` as a fallback.

Prepared bundle contract is legacy version `1.0` with `generatedAt`,
`rawProducts`, `canonicalProducts` and each group's `members[].rawProduct` plus
match method/confidence/review status. Optional `sourceRuns` supplies all three
store capture times/counts. Without it, generatedAt is explicitly labelled
`legacy-generatedAt`, not claimed as independently measured store capture time.
Matcher IDs, supplied offers/minPrice/summary and arbitrary diagnostic metadata
are not trusted. The internal file limit is 64 MiB, not a new public API bound.

Identity continuity uses prior published `(storeCode,sourceProductId)` mappings.
Ambiguous merge/split fails; genuinely new groups receive opaque random IDs.
Dedicated PostgreSQL advisory locking fails fast. Snapshot/raw/source staging
does not update canonical metadata. Canonical metadata, mappings, derived offers
and publication are committed together; abandoned/quality-failed candidates
remain unpublished/failed. Offers use source capture time, not publication time.

Internal-only latest/recent snapshots, chronological published price history,
successful published-source freshness and caller-age `IsStale` are implemented.
No public history/freshness routes or frozen DTO changes.

## External-review fixes and continuation

Continuation fetch/prune and branch/SHA checks passed: local HEAD and origin
remain `ad5136cab9cc1d4f61ff5dd7d66df627b71e6788`. The known uncommitted candidate
was preserved; no reset/restore of source, restart of the Part, or unknown change.

1. Voice privacy harness now uses exact high-entropy coordinate values, a unique
   harmless marker in fallback-understood phrases, actual candidate clarification
   session IDs, and exact submitted texts/IDs. It rejects sensitive content even
   inside serialized payloads. Failure diagnostics are only `coordinate_lat`,
   `coordinate_lon`, `voice_text`, or `session_id`, never the matched value or log.
   The negative proof detects all four classes; safe timestamp/metadata containing
   the old short sentinels no longer causes a false positive. Existing semantic
   comparisons and real clarification session checks were retained.
2. `SourceFreshness` first resolves the latest published snapshot by
   `publishedAt DESC, id DESC`, then reads only that snapshot's succeeded source
   runs. The explicit local publication regression sets all three N+1 captures
   to **N minus 24 hours**, with N+1 published later. The returned freshness equals
   N+1 exactly, not the historically maximum capture. N captures are September 26;
   N+1 captures are September 25, while its publication is October 4 (UTC).
   Abandoned/failed snapshots still do not advance freshness.

The exact no-flake command passed:

```text
go test -count=5 -tags=integration ./tests/integration \
  -run '^Test(LocalVoiceParity|VoicePrivacyProof)$' -v
```

Result: **10 top-level executions / 45 semantic subtests PASS**, no failures or
flake. A further N+1 Voice run passed all nine subtests and the exact privacy proof.
The revised explicit snapshot integration passed **5 top-level / 16 subtests**.

Local harness setup findings were not hidden: the new security test initially
counted RLS on `_prisma_migrations` as an app table. Read-only diagnostics proved
all 9 app tables/17 writer grants/17 writer policies/6 reader policies exact;
the test was corrected to the explicit nine-table scope. A fixture run in a
shared test cluster hit the existing bootstrap's intentional refusal of another
activated reader membership. The full suite was rerun in an isolated cluster,
without relaxing bootstrap guards. An import side-effect in a private orchestration
helper caused a setup guard to refuse already-existing local resources; only
private local-resource metadata was recovered, without DB mutation or repo edits.
These were harness/environment findings, not accepted failing security assertions.

## Local evidence

| Gate | Actual result |
| --- | --- |
| Fresh PG17 SQL migration1/2/3 | PASS; zero baseline snapshots/runs before seed |
| Fresh Prisma CLI deploy/status/seed | PASS; 3 recorded migrations, clean status, 1 published fixture snapshot, 3 runs, 863 offers |
| Private populated backup restore + migration | PASS, restore/migration exit 0 |
| Existing 7-table counts | Unchanged: stores 3, locations 15, categories 6, raw 863, canonical 849, mappings 863, offers 863 |
| Populated backfill | 1 baseline published snapshot / 3 SourceRuns |
| Writer bootstrap | PASS locally; provisioning occurred before LOGIN activation |
| Restricted CLI dry-run | PASS on seeded fresh + populated clones; row counts/snapshot counts unchanged; 849 reused / 0 new IDs, 14 cross-store groups |
| Prepared bundle unit tests | PASS, including real 863/849 bundle and scalar/coverage/confidence/identity checks |
| Explicit local snapshot integration | PASS, final revised suite 5 top-level tests / 16 subtests |
| Canonical continuity / new identity | PASS; existing mappings retain IDs; two historical-only 8.5%-milk groups replaced by genuinely new local-only source identities |
| Staging + advisory lock | PASS; current product/dashboard/filter output unchanged while validating; second connection fails within 1s |
| Atomic publication / rollback | PASS; local trigger-injected offer failure rolls back canonical metadata/mappings/offers; failed snapshot retained; later N+1 visible without reader restart |
| History/freshness | PASS; two published versions/price entries; later-published/older-captured N+1 returned exactly; abandoned and five quality-failed candidates do not advance freshness |
| Failure safety | PASS: missing source, count drop, unknown category, merge, split, abandoned run, publication fault; malformed price/capture covered offline |
| Current history isolation | PASS; removed products return not-found and historical 8.5 filter option disappears; current dashboard/products stay consistent |
| Old Nest→snapshot-aware Nest baseline HTTP | PASS: 849 products × all 3 sorts, 6 filter schemas, detail, all 10 search cases and dashboard |
| Go↔snapshot-aware Nest baseline HTTP | PASS, same complete scope |
| Go↔Nest historical/current HTTP | PASS on two independent local N+1 scenarios, including all 849 products and dashboard |
| Repository clone/parity regression | PASS: session policy, categories, all-product 3-sort parity, filter/detail/search checks |
| Deterministic Voice regression | Original privacy assertion FAIL preserved above; corrected exact-value proof PASS, count=5 without flake; N+1 parity/privacy PASS |
| Go unit / race / vet / staticcheck normal+integration / govulncheck | Final full-package gates PASS; no vulnerabilities found |
| Go mod tidy/verify | PASS; no dependency/lockfile change |
| API build | PASS, binary emitted only outside repo |
| Ingest build/execution | PASS; `go build -o <private-temp>/ingest ./cmd/ingest`; API build also emits binary only outside repo |
| Prisma format/validate/generate, Nest build | PASS; generated Prisma client 5.22.0 |
| Nest deterministic tests | PASS 25/25, no skips |
| Contracts lint/offline suite | Final PASS, 12 tests; 10 HTTP-profile tests explicitly skipped offline |
| Full negative reader/writer matrix, writer guarded rollback | PASS; dedicated local profile 1 top-level / 5 subtests; all 9-table data/history fingerprints and reader ACL unchanged after access-only rollback |
| Constraint-negative / migration fingerprint matrix | PASS; INSERT6 capabilities, snapshot-scoped uniqueness/composite FK/checks; all seven original full-row fingerprints equal before/after migration3, excluding only added snapshotId |
| Query plans | PASS on baseline and N+1: 11 catalog/history/discovery/offer cases + bounded one-query dashboard; writer freshness/identity plans also reviewed |
| Physical pool | PASS; four distinct held connections with/without startup parameters, enforced session read-only + 5s timeout; failed initialization not acquirable |
| Frozen reader/creator lifecycle | PASS on fresh and restored pre-migration3 states, using immutable baseline source; reader 85 subtests ×2, creator-anchor 49 subtests ×2; see profile scope below |
| Current snapshot fixture integration | PASS, 8 top-level / 26 subtests, independent opt-in/live profiles explicitly skipped and separately tested locally |
| Fixture HTTP/contracts | Nest fixture 22 PASS / 0 skipped; Go SQL fixture and Go N+1 clone GET profiles each 18 PASS / 4 voice-only skipped; no production profile executed |
| Outage/abuse/privacy | PASS, explicit uncached voice/httpapi/redis/gemini regression packages plus full unit/race suite; no provider calls |
| Docker API image/runtime/up-down-recovery regression | PASS; UID10001, compiler absent, read-only+tmpfs, healthy/GET/Voice/REST clarification+consumed404, DBdown live200/ready503, recovery same PID, clean SIGTERM exit0 in 406ms |

The exact snapshot integration used restricted local `part08_writer` and
`part08_api`, with a separately explicit loopback-only admin URL for temporary
fault injection. Its committed destructive guard rejects nonlocal hosts,
fallbacks, mismatched credentials/databases and any database other than the
dedicated `part08` target; it never reads runtime `DATABASE_URL`.

## RLS / least privilege candidate

Snapshots and SourceRuns have RLS enabled, no FORCE. Reader gets only snapshots
SELECT as its additional table/policy: six reader tables total; raw/mappings/
SourceRuns remain outside its grants. Writer is separate hardened NOLOGIN,
non-owner/non-admin/non-bypass, with public USAGE and exactly 17 table grants:
stores/categories SELECT; snapshots/source_runs SELECT+INSERT+UPDATE; raw
SELECT+INSERT; canonical SELECT+INSERT+UPDATE; mappings/offers SELECT+INSERT.
No locations write, DELETE, DDL, role-management or grant options.

Forward bootstrap and guarded access-only rollback are new files. Existing
reader/security artifacts remain frozen. Full writer-negative/rollback proofs
now passed locally; this does **not** authorize these SQL files on production.

The current snapshot security suite verifies exact safe LOGIN/group attributes,
sole non-admin/non-SET membership, reader SELECT6/private3 denial, all reader DML
and DDL/role-management denials, writer SELECT8/INSERT6/UPDATE3 and forbidden
DELETE/store/category/location updates/DDL/role-management. Successful INSERTs
are rolled back; duplicate raw/source identity, cross-snapshot Offer→Raw FK,
missing publishedAt, negative source counts, and deletion of a referenced snapshot
are rejected by explicit SQLSTATE. Its guarded rollback removes only the known
local writer LOGIN, then executes the exact access-only artifact; reader policy6,
reader ACLs and all nine-table data/history fingerprints remain exact.

The original reader/creator lifecycle profiles deliberately exercise the frozen
**seven-table pre-snapshot state** and old forward/rollback security artifacts.
They ran from a byte-identical immutable `HEAD` source copy, on separate fresh
and restored local PG17 clusters, including non-superuser CREATEROLE ownership
and the exact creator admin-only anchor. They are not claimed as executions of
the new snapshot-aware repository against a seven-table schema. New runtime
reader/security/repository/physical-pool profiles ran against the migrated
nine-table clone/current candidate independently. No legacy security expectation
or reviewed SQL was weakened to make a snapshot-unaware lifecycle pass.

Plan review: current-snapshot offer and latest-publication indexes are used on
N+1; small/attribute-filtered sequential scans at this dataset size are justified.
No speculative index/extension change. Writer freshness baseline plan returned
3 rows in 0.242ms; identity continuity returned 863 rows in 1.471ms. Default,
category, search, dynamic-filter, price-desc, name, detail, discovery, offers,
latest and price-history plans were exercised locally only. Positive price
history contents are independently asserted in the publication integration.

## Changed files

```text
backend-go/cmd/ingest/main.go
backend-go/internal/ingestion/bundle.go
backend-go/internal/ingestion/bundle_test.go
backend-go/internal/ingestion/ingestor.go
backend-go/internal/ingestion/ingestor_integration_test.go
backend-go/internal/ingestion/plan.go
backend-go/internal/postgres/categories.go
backend-go/internal/postgres/dashboard.go
backend-go/internal/postgres/freshness.go
backend-go/internal/postgres/freshness_test.go
backend-go/internal/postgres/plans_test.go
backend-go/internal/postgres/products.go
backend-go/internal/postgres/snapshots.go
backend-go/tests/fixtures/catalog.sql
backend-go/tests/integration/catalog_test.go
backend-go/tests/integration/security_test.go
backend-go/tests/integration/smoke_test.go
backend-go/tests/integration/voice_parity_test.go
backend-go/tests/integration/snapshot_security_test.go
backend/prisma/schema.prisma
backend/prisma/seed.ts
backend/prisma/migrations/20261005000000_snapshot_history/migration.sql
backend/prisma/security/aktau_ingest_writer_role.sql
backend/prisma/security/rollback_aktau_ingest_writer_access.sql
backend/src/database/prisma-category.repository.ts
backend/src/database/prisma-product.repository.ts
backend/src/database/prisma-snapshot.ts
scripts/create-clean-archive.mjs
docs/production/reports/PART_08_REPORT.md
```

Protected-source diff is empty for frontend, contracts, frozen API document,
Go pool/voice/Gemini/Redis, Nest voice/DTOs/modules and final dataset. Prior
reviewed migrations/security hashes are unchanged. `git diff --check`: PASS.

## Cleanup and review artifact

Owned Part08 local API processes were stopped. Only the three snapshot-test PG17
containers/anonymous volumes and two task-owned lifecycle containers/named volumes
were removed after label/token checks. The runtime network/stub/container were
also removed; no other resources were deleted.
Existing private backup was preserved outside repo. Private test evidence and
disposable-only credentials remain outside repo; no credentials are in this report.

Permanent target: `production-part-08`.
Archive: `artifacts/production-part-08-review.tar.gz`.
Archive verification: **PASS**, 352 files, three allowed `.env.example` files;
every archived file (including this report) byte-matches current source. No real
env, DB dump/backup, dependency/build/test/temp artifact, private disposable
credential, known key pattern, private key or ELF/executable artifact was found.
Archive hygiene is separate from the completed local mandatory gate evidence above.

## Future production rollout — DOCUMENT ONLY

After external PASS: owner immutable commit → separately approved fresh private
production backup/PRE audit → migration/backfill verification → writer group
verification → snapshot-aware Nest traffic owner → exact API parity → private
writer LOGIN → dry-run → separate authorization for first N+1 publish →
history/freshness/current API and POST audit. This execution did not start that
sequence. After history exists, old non-snapshot-aware Nest is not a safe rollback
target; removing writer access must not drop history or rewrite Prisma history.

Remaining implementation blockers: **none found in the completed local gates**.
Production rollout remains unexecuted and requires external PASS plus separate
owner authorization. No production compatibility/apply claim is made from local
backup-clone validation. Physical Siri remains owner validation, not part of this
local snapshot migration batch. No Part10 work was started.
