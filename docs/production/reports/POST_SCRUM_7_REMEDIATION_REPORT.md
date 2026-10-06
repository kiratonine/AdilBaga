# Post-SCRUM-7 owner remediation — C–H

Status: **READY_FOR_INFRASTRUCTURE_PENDING_HARNESS_CI**.

Previous blocker: **EXACT_GET_HTTP_PARITY_ASSERTION_FAILED** (gate F) — **RESOLVED** by the externally authorized, Product-only equal-price offer comparator correction and three complete HTTP parity reruns. Hosted CI for the new uncommitted harness candidate remains **NOT RUN**; this status is the explicitly requested remediation-stage status, not authorization to provision infrastructure or deploy.

Previous blocker **ROTATED_CREDENTIAL_FRESH_AUTHENTICATION_FAILED** is **RESOLVED** by independently repeated fresh authentication. C and encrypted backup/restore are PASS. Restricted runtime/API validation was NOT RUN at the earlier credential/backup continuation; that interim state is preserved below, followed by the latest Gate F evidence.

Latest update: **RESTRICTED_API_CREDENTIAL_UNAVAILABLE is RESOLVED**. Restricted identity, physical Go session policy and backup/restore evidence remain PASS. The initial raw HTTP assertion failure and investigation are retained as history below. The final “External-review harness correction” section records tie evidence, regression tests, HTTP3/3, repeated repository parity and unchanged READ-ONLY POST audit. No runtime/business defect was established; no runtime or production repair occurred.

Date: 2026-10-07. Production provider: **Supabase**, the existing application project. No Neon access or provider migration. Stop for external review; no further production writes are authorized by this result.

## Previous BLOCKED run — preserved history

The following sections through “Safety and changes” describe the previous attempt only, not the current continuation.

### Git and historical evidence

- Branch: `integrate/full-stack`.
- HEAD = fetched `origin/integrate/full-stack` = `3a763609b0220364755ff3a1945cbdd4a007cadc`.
- The only pre-existing working-tree change was the known untracked `POST_SCRUM_7_REMEDIATION_PRECHECK.md`; it was preserved unchanged. Runtime, tests, contracts and harness were not changed.
- Accepted CI evidence remains run `37508068559`, all nine mandatory jobs including CI Gate success, as recorded in PRECHECK. CI was not rerun in this continuation.
- PRECHECK remains `READY_FOR_OWNER_REMEDIATION`. Its earlier successful counts/security observations are historical evidence, **not** a fresh post-rotation audit.
- Owner reports separate manual owner/admin and ingest password rotations. Those management actions were not independently observed. The supplied external Backend2 handoff/history remains attributed; this task did not replay rollout operations.

## C. Fresh credential verification — FAIL

Credentials were read privately from existing local configuration, never placed in command arguments or printed. Target classification privately matched the same Supabase application project. No transaction-pooler connection was attempted: owner and ingest verification used the configured session-pooler connections on port5432.

Each check started a separate `psql` process/new client connection, not an existing authenticated application session. Connection timeout8s and overall process deadline18s were imposed. TLS was required; inherited libpq routing variables were not used. The planned transaction was explicitly READ ONLY with bounded statement/lock timeouts; authentication failed before its metadata SELECT could run.

| Available credential candidate | Intended SQL identity | Fresh outcome |
| --- | --- | --- |
| Owner candidate from local `backend/.env` `DIRECT_URL` | `postgres` | **authentication_rejected** |
| Ingest candidate from local `backend/.env` `INGEST_DATABASE_URL` | `aktau_ingest_runtime` | **authentication_rejected** |
| Distinct operator owner candidate from private `part11-backup.env` `BACKUP_DATABASE_URL` | `postgres` | **authentication_rejected** |

These are authentication rejections, not network/TLS timeouts. No write probe or privileged repair was attempted. Private comparison confirmed that the two backend-configured password values differ, and that the backup operator password differs from the backend owner candidate. This is not proof that any rejected candidate is the correctly entered newly rotated secret.

The distinct operator candidate was checked once as a possible retained prior owner credential. Its rejection proves only that this available candidate did not authenticate through that endpoint now. Without a verified new credential and complete private pre-rotation credential provenance, this report does **not** claim comprehensive old-credential revocation. No separately identified prior ingest credential was tested. Existing server-side authenticated sessions may survive rotation; none was inventoried or terminated here.

No successful actual `current_user`/`session_user`, membership or fresh application-state observation was obtained. The blocker does **not** establish that the owner's manual rotation failed; available local connection configuration requires correction/verification.

## D–H gate disposition

| Gate | Actual result |
| --- | --- |
| D. Fresh current-state encrypted backup | **NOT RUN** — C failed; no new artifact/checksum or backup write |
| GPG recipient/private-key custody and direct-endpoint availability proof | **NOT RUN** — not inferred from earlier Part11 evidence |
| E. Disposable PG17 restore and current counts/fingerprints/security/history comparison | **NOT RUN** — no fresh verified backup |
| F. Restricted `aktau_api_runtime` physical pool/SELECT6/private3 and Go↔Nest GET verification | **NOT RUN** — no fallback to owner/ingest; no local API process launched |
| G. Fresh `_prisma_migrations` RLS investigation | **NOT RUN** — no authenticated fresh operator connection |
| H. Final infrastructure readiness | **BLOCKED** — mandatory C–G evidence missing |

The required current baseline remains an acceptance target, not newly verified here: stores3, store_locations15, categories10, canonical_products3425, raw_products4215, product_mappings4215, offers4215, snapshots2, source_runs6, Prisma migrations4; latest snapshot offers3352, all six SourceRuns succeeded, visible usable categories9.

Historical PRECHECK observed `_prisma_migrations` owner `postgres`, RLS=true/FORCE=false/policies0, with no runtime SELECT. Checked-in application security migrations do not establish the actor or intent of that extra RLS setting. This continuation obtained no new evidence on it and makes no future migration-functionality claim. No automatic rollback, RLS disablement, policy repair or Prisma-history reconciliation is recommended.

## Exact owner action to unblock

1. Privately verify/correct the newly rotated **same Supabase project** owner connection configuration and `aktau_ingest_runtime` connection configuration. Use the Supabase Connect parameters, correct pooler-qualified username where applicable, and correctly URL-encoded password. Update only private local configuration; do not share secrets in chat, Git or this report. Current available owner/ingest candidates both fail fresh authentication.
2. Set explicit private `BACKUP_DATABASE_URL` to the verified new operator credential. Prefer the actual direct Connect endpoint. Port6543 transaction pooler is prohibited for backup. If direct connectivity fails due IPv4/network, retain sanitized evidence before using the same project's port5432 session pooler. The existing backup password currently differs from the backend owner candidate and also fails authentication; no runtime-URL fallback was used.
3. Ensure the existing separate `aktau_api_runtime` credential is available privately for F; do not copy owner or ingest credentials into API runtime configuration. It was not evaluated in this blocked run.
4. Retain any old credentials only privately if bounded revocation checks are required. Verify fresh new authentication before treating old rejection as complete rotation acceptance. Then resume C–H, including custody, fresh backup/restore, restricted GET-only verification and read-only RLS investigation.

## Safety and changes

No successful production SQL query, catalog/data write, password rotation, role/grant/policy change, migration, history edit, ingestion/dry-run/apply, new snapshot, backup creation, deployment, Voice/Gemini/Upstash request, scheduler, VPS/domain/Cloudflare or Railway action occurred. Production authentication attempts were the only production operations in this continuation.

Only this report was added; existing PRECHECK/history were preserved. No `.env` modification, secret/URL/host/password disclosure, runtime change, commit or push. Stop for external review.

---

## Credential/backup continuation — preserved interim C–H evidence

### Immutable source and boundaries

Fresh fetch/prune PASS. Branch `integrate/full-stack`; HEAD = origin = `3a763609b0220364755ff3a1945cbdd4a007cadc`. Only the two known untracked remediation reports existed at continuation preflight. Accepted hosted CI evidence from PRECHECK is unchanged; no new hosted run is claimed.

All credentials were reloaded from CURRENT private configuration; no cached value or connection string reconstructed from the previous report was used. Supabase application project identity matched privately. `DATABASE_URL` was not modified or used for these operator checks; its Prisma-specific `pgbouncer=true` compatibility is not an authentication defect. No Neon access/migration occurred.

### C. Credential verification — PASS; previous blocker resolved

Three independent fresh `psql` processes/connections, TLS required, connect timeout8s/process deadline18s, explicitly READ ONLY transaction with statement timeout5s/lock timeout2s:

| Variable | Actual current_user | Actual session_user | Actual server port / database | Result |
| --- | --- | --- | --- | --- |
| DIRECT_URL | postgres | postgres | 5432 / postgres | PASS |
| INGEST_DATABASE_URL | aktau_ingest_runtime | aktau_ingest_runtime | 5432 / postgres | PASS |
| BACKUP_DATABASE_URL | postgres | postgres | 5432 / postgres | PASS |

These independently obtained results resolve the previous authentication blocker. Owner management rotation actions themselves remain externally reported. **Old credential revocation not independently testable**: no separately retained, verified prior secrets were recovered or requested. That limitation does not block remediation. No write probes or session termination occurred.

### D. Fresh encrypted current-state backup — PASS

Used unchanged `ops/postgres/backup.sh`, explicit BACKUP_DATABASE_URL only, same Supabase project, no runtime URL fallback. Transaction pooler was not used.

Documented session-pooler fallback: current backup configuration is port5432 session pooler. A bounded probe of the same project's standard direct endpoint found IPv6 DNS available, **no IPv4 DNS address**, and TCP outcome **network_unreachable** from this WSL environment. No direct connection was falsely claimed. The permitted session fallback authenticated as postgres.

Existing recipient/private-key custody was verified by successful GnuPG decryption of the existing recovery artifact to `/dev/null`, using the existing recoverable secret-key recipient. No key was generated/rotated/exported. Guard PASS: private backup directory outside repo0700, GPG home outside repo0700; resulting ciphertext/metadata files0600. Tracing remained off; secrets stayed in private process environment, not argv/output. Older recovery points were retained.

Safe generated artifact metadata:

- Timestamp: `2026-10-06T20:13:41.318Z` (UTC; local calendar date2026-10-07).
- Encrypted filename: `app-public-20261006T201341Z-rS242XxH.dump.gpg`.
- Encrypted bytes: **1450090**.
- Plaintext SHA256: `38b7b658addf550a7ecaf266966bd9cc54b517098bfd59b76958ea22b75ab468`.
- Tools: pg_dump17.10 / pg_restore17.10.
- Encryption and adjacent checksum metadata creation: **PASS**.
- No plaintext dump retained; backup staging cleanup verified. Ciphertext and custody remain outside the repo; no absolute private path is recorded here.

This portable public-schema backup contains current application/history data. It is not a cluster-global role/password/ACL backup and does not include Supabase-managed schemas. Separate security metadata was read for comparison.

### E. Fresh disposable restore — PASS

New task-labelled `postgres:17-alpine`, random disposable credentials unrelated to production, random host port bound **only127.0.0.1**, guard-compatible `part11_*` database. Readiness required bounded final TCP `SELECT 1` success.

Reviewed local preparation verified target identity and empty public relations/functions/types, then `DROP SCHEMA public` **without CASCADE**, followed by public namespace absence proof. Only local NOLOGIN reader/writer policy-role prerequisites were created before restore. Production credentials were never passed to Docker.

Unchanged `ops/postgres/restore-test.sh`: decrypt **PASS**, plaintext SHA256 **PASS**, custom-format validation **PASS**, `pg_restore --no-owner --no-acl --exit-on-error` **exit0**. No errors ignored and no production repair.

| Table | Fresh Supabase PRE | Restored local |
| --- | ---: | ---: |
| stores | 3 | 3 |
| store_locations | 15 | 15 |
| categories | 10 | 10 |
| canonical_products | 3425 | 3425 |
| raw_products | 4215 | 4215 |
| product_mappings | 4215 | 4215 |
| offers | 4215 | 4215 |
| snapshots | 2 | 2 |
| source_runs | 6 | 6 |
| _prisma_migrations | 4 | 4 |

Fresh PRE versus local comparison: all columns/types/defaults/nullability, enum labels/order, constraint definitions, index definitions, RLS/FORCE flags and policy definitions **equal**. App **RLS9/FORCE0**; including migration table **RLS10/FORCE0**. Exactly23 application policies, reader6/writer17, no extra policy. Full snapshot and SourceRun records equal; both snapshots published, all six SourceRuns succeeded/errorCount0. Latest snapshot offers3352; latest per-store SourceRun productCounts DINA1995/DANA1283/FIX_PRICE74; baseline564/279/20 retained.

Latest snapshot `62c0bfeb-dcbe-432f-abf9-c108e6fdb9a5`; previous `baseline-internal-v1`. Both publication/history records exactly preserved. All four successful migration names/checksums matched checked-in bytes and local restore:

1. `20260923000000_init`.
2. `20261004000000_rls_runtime_access`.
3. `20261005000000_snapshot_history`.
4. `20261006000000_catalog_taxonomy`.

Nine current usable category slugs in SQL: bread/dairy/eggs/groats/meat/milk/oil/sugar/vegetables. Legacy `other` still exists in DB but lacks a current usable offer. No `salt` category. Sugar name **Сахар**; its persisted weightGrams discovery options contain neither numeric0 nor string"0". These are DB/restore observations, **not** HTTP parity.

Field-complete deterministic row fingerprints compared over all ten tables (stable id ordering `COLLATE "C"`, UTC session). For non-mapping tables, row JSONB serialization and per-row MD5 aggregation follow the existing performance-audit approach with explicit newline aggregate delimiter:

```sql
md5(coalesce(string_agg(md5(to_jsonb(t)::text), E'\n'
  ORDER BY id COLLATE "C"), ''))
```

All these fresh PRE/local hashes matched:

| Table | Fingerprint |
| --- | --- |
| stores | 48e9c6cad3ceebae9da40421bd5d7fba |
| store_locations | d1db2e83762b8c6206cf75cce5bfe9af |
| categories | 42624be639fd116c8cb06483d544372e |
| canonical_products | 67856313c5b00da1e1a5b9b509d49cea |
| raw_products | ff780942a09a123409843ec38be62129 |
| offers | a69097a809b3c0117b4a9577e82d3aab |
| snapshots | c832ea7347f4d86a17c2ad2f2cfb3e3a |
| source_runs | dd130862b9b3b5ec42f156e1c55552a9 |
| _prisma_migrations | d5ea812e6ff8cbaa154c4912a45d1ce5 |

Product mappings used **unchanged approved `scripts/perf/product-mappings-audit.sql`**, `pm-audit-v1`, count4215: explicit non-float fields plus exact `float8send` confidence bytes, no rounding or legacy hash fitting. All three matched:

- nonFloatFieldsFingerprint: `04f162d894c1a9d9b6e1fe6e0fc6522e`.
- matchConfidenceBinaryFingerprint: `1cf2c021ad183e79f3a1a280577b3830`.
- fullCanonicalFingerprint: `1e7b066850f29207ee117619d48b6582`.

Expected no-owner/no-acl limitations were handled locally, not misclassified as data loss. Reconstructed reviewed reader SELECT6/public USAGE and writer SELECT8/INSERT6/UPDATE3/public USAGE only on the disposable clone. Reader metadata proved SELECT6 allowed/private3 plus Prisma table denied/no public CREATE. No runtime LOGIN was recreated. Local restricted Go smoke is **NOT RUN**, because F lacks the required existing production credential.

Disposable container and its owned volume were removed after verification. No old recovery point or unrelated resource was removed. Initial Docker setup attempts rejected a pipe-based local env-file input before creating a container; switching the disposable password to inherited private env resolved that local harness issue. Restore safeguards/scripts were not changed.

### F. Restricted runtime/API — BLOCKED, NOT RUN

CURRENT `backend/.env` contains owner DATABASE_URL/DIRECT_URL and the ingest URL, **not** a separate `aktau_api_runtime` connection. Existing private operator configs and checked historical private stores yielded no identifiable Supabase API credential. This establishes unavailability to this session, not that the role/credential does not exist elsewhere.

Owner metadata confirms current API role still LOGIN/INHERIT, no superuser/createdb/createrole/replication/bypassrls; sole parent `aktau_api_reader`, ADMIN=false/INHERIT=true/SET=false. Ingest has the corresponding sole writer parent and flags. These observations **do not substitute** for authenticating the actual restricted API credential or proving the physical Go pool session policy.

No owner/ingest/fixture fallback was used. No Go/Nest process was started against production. Restricted current_user/session_user, physical pool policy, direct SELECT/private denial, real GET endpoints/search/filter/sort/pagination/detail/dashboard/sugar labels and Go↔Nest read parity are therefore **NOT RUN**. Public product count was not equated with global canonical3425.

Owner subsequently confirmed that the API credential **was not entered** into private configuration. This resolves the availability question, not gate F.

**Exact owner action:** privately make the existing separate Supabase `aktau_api_runtime` credential available in an explicit API-only connection config (for example variable `API_DATABASE_URL`, private file0600/directory0700). Provide only its file path/variable name, never its value. Do not recreate the role, broaden grants or place owner/ingest credentials into API configuration. If the existing password is unavailable, a separate reviewed/authorized API password rotation is required; this task does not authorize that repair. Resume F only after a fresh restricted authentication PASS.

### G. Migration-history RLS — partial read-only investigation

Fresh metadata reconfirmed `_prisma_migrations` ownerpostgres, RLS=true/FORCE=false/policies0. Authenticated current owner is postgres and its SELECT of migration history succeeded; all four recorded migration checksums match immutable checked-in sources. Checked-in RLS migrations explicitly target the nine application tables, not the migration-history table.

For this table, owner identity plus FORCE=false is compatible with owner RLS bypass; the observed RLS does not by itself prevent that identity reading the history. This is a metadata compatibility finding, **not** execution of a future Prisma migration or proof of every future DDL permission. No deploy/resolve/rerun or write probe was performed. Full migration-path privilege review remains deferred with the blocked continuation.

Administrative/platform history establishing actor/time/intent was not available in this read-only verification. Platform/operator hardening is possible but **not established**. No RLS change is recommended automatically, and uncertain provenance alone is not designated an infrastructure blocker. Any future security/history change requires a separate reviewed scope.

### POST audit and unresolved risks

Fresh Supabase owner READ ONLY POST audit after backup/restore matched PRE byte-for-byte in the captured canonical JSON: table counts/fingerprints, mapping binary-safe audit, migrations, full snapshot/source histories, columns/enums/constraints/indexes/RLS/policies, category metadata, role flags/memberships and table ACL inventory **unchanged**. This is not a post-GET audit: GET verification has not happened yet. No claim is made about uncollected cluster-global/managed ACLs.

Current final status remains **BLOCKED solely by unavailable restricted API credential and consequently unexecuted mandatory F checks**; it is not READY_FOR_INFRASTRUCTURE. New credentials/backup/restore are genuine PASS. Old revocation proof and platform RLS causation are explicitly limited, not inferred. Independent off-host backup/key escrow remains future operational custody work.

No production migration, catalog write, role/grant/policy/password change, ingestion, dry-run/apply, new snapshot, scheduler, Voice/Gemini/Upstash call, deployment, VPS/domain/Cloudflare or Railway action. Production operations were authentication, read-only SELECT/metadata audits and logical backup reads only. Local disposable prerequisites/ACL reconstruction did not affect production. No runtime/API/contract changes, `.env` changes, commit or push. Only this same report was updated; PRECHECK remains unchanged. Stop for external review.

---

## Gate F resumption — restricted credential available

Immutable baseline rechecked by fresh fetch/prune: branch `integrate/full-stack`, HEAD=origin=`3a763609b0220364755ff3a1945cbdd4a007cadc`. Only the two known remediation reports were untracked. Prior C/backup/restore evidence remains preserved; those gates were not unnecessarily repeated.

### Fresh restricted authentication / least privilege — PASS

Loaded current `AKTAU_API_RUNTIME_DATABASE_URL` from the owner-supplied private API-only configuration. Initially its actual file permissions were0644, contrary to the reported0600; corrected **only that file's permissions to0600**, without changing contents. Its directory is0700. No connection value or absolute private path is recorded here.

Fresh independent TLS `psql` connection: `current_user=session_user=aktau_api_runtime`, server port5432; privately confirmed the same Supabase application project. Sole parent `aktau_api_reader`; ADMIN=false/INHERIT=true/SET=false. LOGIN/INHERIT true, superuser/createdb/createrole/replication/bypassrls false.

Actual SELECT succeeded on all six runtime tables: stores/store_locations/categories/canonical_products/offers/snapshots. Privilege metadata proved private3 (raw_products/product_mappings/source_runs) and all other public application/migration-table SELECT denied, all checked DML/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN denied, public schema CREATE denied. No production DML/DDL denial probe or SET ROLE attempt.

Committed `OpenProductionReadOnly` was exercised through an ephemeral operator driver outside the repo. Four concurrently acquired physical connections had **four distinct backend sessions**, actual restricted identities, `default_transaction_read_only=on`, `statement_timeout=5s`; production identity guard **PASS**. No pool/repository source was changed.

### Immutable local Go/Nest against Supabase — readiness PASS

Exported the committed backend sources through `git archive HEAD` outside the repo. Go API build **PASS**; Nest `pnpm build` **PASS**. Credential supplied only through child process environment: Go DATABASE_URL; Nest DATABASE_URL/DIRECT_URL. Original `backend/.env` untouched. PostgreSQL runtime explicit, no fixture data fallback.

Two initial bounded Nest bootstrap attempts using dependencies on `/mnt/d` did not reach listening within the60s readiness budget. Used a native-WSL copy of the same installed dependencies, **byte comparison `diff -qr --no-dereference` PASS**, with no dependency/config/source/timeout change. Native startup then passed with the same budget. This supports a filesystem-environment startup issue, not a source defect.

Go ran APP_ENV=production (including production DB identity validation). Unused Voice provider configuration was deliberately inert, not real provider credentials; no Voice/provider behavior is claimed. Nest was a local restricted read-only reference, DATA_SOURCE=postgres. Only loopback clients were used; no deployment/cutover.

Go `/health/live` and `/health/ready`200; Nest GET readiness **PASS**. Both real `/api/categories` returned **9**, excluded other, retained sugar name **Сахар**. Both sugar discovery responses excluded numeric/string0. Both dashboards returned all three sugar basket items with slug `sugar` and categoryName **Сахар**. No Voice/start/continue, Gemini, Upstash or ingest invocation.

Fresh SQL public usable set = **3083**, derived from distinct canonical IDs with usable offers in latest published snapshot, not global canonical3425 or all latest offers3352.

### Full repository↔Nest reference parity — PASS

Unchanged committed `TestLiveReadOnlyParity`, explicit restricted LIVE_DATABASE_URL/read-only confirmation and loopback Nest reference: **PASS,448.50s**.

- All **3083 products** through bounded100-item pages for price_asc/price_desc/name_asc, exact product-ID order and semantic DTO equality.
- Category order, filter discovery for all9 categories, category/dynamic filter matching, product detail, offers price ASC/minPrice/usable-offer invariants/snapshot timestamps and bounded SQL roundtrips passed.
- All10 search cases passed: milk152; percent3083; underscore3083; backslash64; milk-percent155; milk-underscore155; escaped-percent919; escaped-underscore0; absent-literal0; injection-shaped0.
- Existing comparator normalizes equal-price offer tie ordering and equivalent timestamps, as explicitly documented in committed `smoke_test.go`. This is genuine repository/reference semantic evidence, **not** an all-Go-HTTP exact-array comparison.

### Full Go↔Nest GET HTTP profile — FAIL; no hot-fix

Unchanged `TestHTTPParity`: **FAIL,50.12s**, `HTTP DTO/order mismatch at /api/products` (`http_parity_test.go:97`). Do not replace this result with the successful repository suite or claim the full HTTP profile passed. Later cases in that profile were not all executed.

Bounded GET-only diagnostics with the same immutable processes:

- First500 price_asc products matched exact JSON.
- A subsequent page scan observed mismatch at **offset1700**, JSON path **`/42/offers/0/storeCode`**. Responses became equal after the existing contract-compatible offer-order/timestamp canonicalization; no field values, product names or sensitive payloads were printed.
- A fresh follow-up of **only offset1700** did not reproduce the raw mismatch. Its diagnostic console label incorrectly said “all3083”; that label is **not** full-scan evidence and is explicitly rejected here. This follow-up checked only that one page.
- Exact full `/api/dashboard` Go↔Nest JSON parity **PASS** in the diagnostic runs.

Frozen contract requires usable offers ordered **price ASC**, without a secondary store order for price ties. Together with the successful full semantic comparator, the observed offer-store ordering difference is consistent with an unspecified tie-order assertion issue; it is **not** proof of a price/minPrice/product-set regression. However, an offer-only/price-tie causal proof was not separately captured for that intermittent page, and no unqualified runtime-correctness claim is made from the diagnosis.

**STOP for review:** the existing exact HTTP gate failed. Do not auto-edit Go/Nest SQL, contracts, tests or comparator; review whether this is a harness-only tie-order normalization issue or a wire behavior requiring separately approved remediation. No runtime defect was established or repaired. F remains incomplete until its failed HTTP gate is resolved/reviewed; status is not READY_FOR_INFRASTRUCTURE.

### G. Read-only migration-path investigation — metadata compatibility PASS

Fresh operator connection confirmed current_user=session_user=postgres, migration table ownerpostgres, RLS=true/FORCE=false/policies0; actual owner SELECT succeeded. Effective owner SELECT/INSERT/UPDATE/DELETE privileges, public USAGE/CREATE and ownership of public application tables all **true by metadata**. No write/DDL probe, deploy/resolve/history edit or migration rerun.

This proves the current owner path is compatible with migration-table owner RLS bypass and relevant existing ownership/privileges. It does **not** prove execution of an arbitrary future migration. Checked-in application security migrations do not explicitly enable RLS on `_prisma_migrations`.

Read-only system catalog inspection found enabled `ensure_rls` DDL event trigger pointing to `public.rls_auto_enable`, whose function contains automatic RLS enabling; it does not explicitly name `_prisma_migrations`. This is consistent with automated public-table hardening but **does not establish historical actor/time/intent**. Administrative history was unavailable; causation remains uncertain. No disabling RLS, new policy, privilege change or automatic rollback is proposed. This uncertainty alone is not the infrastructure blocker.

### POST / safety / remaining action

Fresh READ-ONLY owner PRE/POST captured counts, all10 table fingerprints (including binary-safe mappings), current snapshot offer/public-usable totals, RLS/owners/policies, roles/memberships and public table/schema ACL inventory. Comparison **PASS, unchanged**, and counts/fingerprints matched the verified restored backup. No uncollected password or platform history invariance is claimed.

All owned local API processes were terminated after each run. Only temporary exported sources/build/dependency copies and operator drivers were used; repository runtime/tests/contracts/harness remain unchanged. No production migration, catalog/security write, ingestion, new snapshot, scheduler, provider/session write, deploy, VPS/domain/Cloudflare, commit or push. Earlier fresh encrypted backup remains outside repo; no plaintext retained or old recovery point deleted.

Current status: **BLOCKED — EXACT_GET_HTTP_PARITY_ASSERTION_FAILED**. API credential/configuration blocker is resolved. Required next action is external review of the recorded HTTP assertion/offer-order finding, not credential fallback or ad-hoc production repair. No further production writes authorized.

Final hygiene: `git diff --check` **PASS**; bounded report scan against current configured credential values/decoded passwords/hosts and absolute private-path/DSN patterns **PASS**; report LF/trailing whitespace check **PASS**. Protected backend/Go/frontend/contracts/scripts/ops diff against HEAD is empty. Temporary operator driver and immutable export/dependency/build workspace removed; encrypted recovery artifact and private audit evidence retained outside repo. No commit/push.

---

## External-review harness correction — final Gate F evidence

### Immutable baseline and authorization

Fresh `git fetch origin --prune` PASS. Branch `integrate/full-stack`; HEAD = origin = **`3a763609b0220364755ff3a1945cbdd4a007cadc`**. The two known untracked remediation reports were preserved. External review authorized only a test-harness correction; runtime/business behavior, SQL, NestJS, DTOs, OpenAPI, API_V1_CONTRACT, migrations and production security/data were not changed.

The BLOCKED results in earlier sections are historical attempts, not hidden or rewritten PASS. Accepted baseline CI evidence remains historical; hosted CI for this new harness patch is **NOT RUN** and is required before treating the candidate as CI-accepted.

### READ-ONLY tie-order causal evidence — PASS

Fresh restricted SQL on the latest published snapshot found **2 canonical products / 2 equal-price usable-offer groups**. The price_asc item at the previously observed offset1700/index42 has **exactly2 usable offers**, and both belong to an equal-price tie. This is structural evidence only: no product names, raw payloads, prices or credentials were emitted. With exactly two tied offers, the recorded storeCode-order mismatch at that item cannot represent ordering between different prices.

Immutable Go and Nest both order offers by price ASC only; neither defines a secondary order. Frozen v1 likewise defines no secondary store order for equal prices. The original raw DeepEqual demanded an array order stronger than that contract. Together with the earlier normalized equality and three full strict-field reruns below, this supports the unspecified tie-order harness diagnosis; no runtime/business defect was established.

### Exact, narrow harness change

Only tracked source changed: `backend-go/tests/integration/http_parity_test.go`.

- Successful Product list/detail responses alone use the new comparator. Product array order remains exact; products are never sorted for comparison.
- Each side independently validates offers price ASC **before** normalization; any decreasing price fails.
- A copied offers array is stably ordered by price ASC, then storeCode ASC. Because original price order was already validated, only equal-price tie ordering can change. Input responses are not mutated.
- Complete Offer objects and every Product field remain DeepEqual, including storeName, oldPrice, nulls and exact timestamp strings. No timestamp normalization or unordered-set comparison.
- Categories, filters, dashboard and the existing error-envelope assertions remain unchanged. No generic permissive JSON normalizer was introduced.

Synthetic comparator suite **PASS7/7**: reverse DINA/DANA equal-price order accepted; descending different prices rejected on either side; storeName and oldPrice changes rejected; equivalent-but-different timestamp strings rejected; product-array reordering rejected. Every case also proves inputs unchanged. Focused race test, integration-package vet and pinned integration staticcheck **PASS**; gofmt and diff whitespace check **PASS**. No full unrelated runtime matrix was claimed or rerun for this harness-only patch.

### Full GET-only reruns — PASS

Runtime sources exported from immutable HEAD; only the candidate HTTP test file was copied into the test workspace. Go build and Nest build **PASS**. Native-WSL dependencies were byte-compared with the installed repository dependencies, **PASS**, without source/config/timeouts/dependency changes. Same immutable Go/Nest API processes used the restricted API credential in process environment only; no backend .env modification or owner/ingest/fixture fallback.

| Fresh test process | Actual result | Elapsed |
| --- | --- | --- |
| TestHTTPParity run1 | PASS | 588.69s |
| TestHTTPParity run2 | PASS | 598.15s |
| TestHTTPParity run3 | PASS | 616.34s |
| TestLiveReadOnlyParity repeat | PASS | 455.71s |

Each HTTP run covered all **3083 usable public products** through bounded100-item pages for **price_asc, price_desc, name_asc** with exact Product ID/order/fields; all9 categories and filter discovery; category/dynamic filter requests and detail; all10 search cases; full dashboard exact comparison; malformed query400 and missing product/category404 envelope checks. All search populations repeated consistently: 152 / 3083 / 3083 / 64 / 155 / 155 / 919 / 0 / 0 / 0. Dashboard sugar slug/name remains `sugar` / **Сахар**. No intermittent offer-order failure or different-price/semantic/product-order/timestamp mismatch occurred.

The existing committed repository suite was repeated independently, unmodified: all3083 products ×3sorts, filters/detail, all10 search cases and physical read-only pool/invariant checks **PASS**. This supplements, rather than substitutes for, the three full HTTP passes.

### READ-ONLY POST audit — PASS, unchanged

Fresh owner audit used an explicitly READ ONLY repeatable-read transaction. PRE and POST canonical evidence matched exactly: all10 counts/fingerprints (binary-safe complete mapping fingerprints included), latest published snapshot/current usable set, RLS/FORCE/ownership/policies, reader/writer/runtime role flags and memberships, public table/schema ACL inventory. PRE also matched the prior verified restore's counts/fingerprints and the prior Gate F security baseline.

Final counts: stores3; store_locations15; categories10; canonical_products3425; raw_products4215; product_mappings4215; offers4215; snapshots2; source_runs6; Prisma migrations4. Latest published snapshot unchanged: `62c0bfeb-dcbe-432f-abf9-c108e6fdb9a5`; latest offers3352; usable public products3083. Snapshot/source-run/migration histories are included in the unchanged complete-row fingerprints. No uncollected platform history/password-state invariance is claimed.

Previous credential rotation, encrypted backup/restore, least-privilege/physical-session proof and migration-history RLS investigation remain preserved. Old credential revocation was not independently testable; historical RLS actor/intent remains uncertain; neither was silently converted into verified evidence. No automatic RLS/history change or rollback is proposed.

### Safety / review disposition

No production write, migration, role/grant/policy/password change, catalog mutation, ingestion, new snapshot, Voice, Gemini, Upstash/session write, scheduler, deploy, VPS/domain/Cloudflare, commit or push. All owned local API processes and temporary source/build/dependency workspace were cleaned up; private audit evidence and encrypted recovery points remain outside Git. No credential, endpoint or absolute private path is recorded here.

Final hygiene: `git diff --check`, bounded secret/config-value scan and report LF/whitespace check **PASS**. Protected runtime/contracts/scripts/ops are unchanged; this candidate consists of the one HTTP harness file and this updated existing report, with the pre-existing PRECHECK preserved.

Final status: **READY_FOR_INFRASTRUCTURE_PENDING_HARNESS_CI**. Stop for external review and subsequent hosted harness CI evidence; no further production writes or infrastructure actions are authorized by this report.
