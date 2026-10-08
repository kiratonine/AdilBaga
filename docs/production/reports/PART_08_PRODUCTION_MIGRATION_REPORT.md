# Production Part 08R — Production migration / baseline backfill

Status: **READY_FOR_EXTERNAL_REVIEW — PART08_PRODUCTION_MIGRATION_PASS**

Reviewed production migration/backfill, compatibility/parity, least-privilege security и clean archive gates PASS. Остановлено для external review.

## Immutable provenance

- Branch: `integrate/full-stack`.
- Fetch/prune PASS; clean working tree перед production access.
- HEAD = origin: `0b95cdc93fc5278fc86a8d305921f7130e8a6371`.
- Parent: `ad5136cab9cc1d4f61ff5dd7d66df627b71e6788`.
- Commit: `feat(data): add snapshot ingestion and history foundation`.
- Повторные immutable checks перед обоими production writes PASS.
- Перед созданием этого report: working tree clean, HEAD = origin, `git diff --check` PASS; protected source и все SQL hashes неизменны.

## Reviewed artifact SHA-256

| Artifact | SHA-256 |
| --- | --- |
| `20260923000000_init/migration.sql` | `a5515ab64d6f8307df96971eb9ee1f7f41d6873e877d591167bde6450e881a92` |
| `20261004000000_rls_runtime_access/migration.sql` | `aa5d016c002f9b9d7d1feb3de2b77bd667879466ec3e808f6452b620afe09e79` |
| `20261005000000_snapshot_history/migration.sql` | `82a460310d62080758cfba9054782a64d67716c788a9d5f1cfceabc7a0a57a12` |
| `aktau_api_reader_role.sql` | `bd09e6cbdbe0fb292e721573184cacadde7d339be68845df8ca5d8e1cfd10a0d` |
| `rollback_aktau_api_reader_access.sql` | `6d9d8bc377f985c37dc9e81252a0af79f80f5debe338cdb8544b3e4fa5f1a545` |
| `aktau_ingest_writer_role.sql` | `771683b11f9ff5715561e6c5212321e1e0c40b5db4fe8afb77aea33a715a4b08` |
| `rollback_aktau_ingest_writer_access.sql` | `277acbd51185188bfc30983e7b6af1741a36ee5a4dd42e288eeffbc9a703f709` |

## Fresh backup / restore — PASS

Свежие `public` schema-only и custom-format application backup созданы вне repository; directory 0700, files 0600. Hash/size и безопасные audit metadata сохранены privately. Production credentials не передавались в Docker.

Новый owned loopback-only `postgres:17-alpine` восстановлен через `pg_restore --no-owner --no-acl --exit-on-error`, exit 0. Для существующих RLS policies создан только локальный NOLOGIN placeholder reader. Семь counts, исходные row fingerprints, enums/columns/constraints/indexes и две Prisma migration records совпали с production.

Первичная JSON fingerprint-проверка `product_mappings` выявила различие представления: live `extra_float_digits=0`, local `1`. Остальные поля и бинарные `matchConfidence` совпали. При одинаковом представлении full-row fingerprints совпали; дополнительно все scalar floating-point binary fingerprints сверены с восстановленным backup. Это не изменение данных и не source fix.

Точный migration3 также выполнен на свежем restored local clone: исходные fingerprints сохранены; его catalog metadata использованы для полного сравнения новых production constraints/indexes/columns/enums.

Private backup сохранён. После проверок удалены только task-owned disposable container/anonymous volume, local API processes и generated Go binary.

## READ-ONLY PRE / lock-risk — PASS

Operator audits использовали явные `SET default_transaction_read_only=on`, `SET statement_timeout=5000`, `BEGIN READ ONLY`; фактические settings: on/on/5s.

- Принятая Part04/05/07 baseline: 7 app tables, RLS7/FORCE0, 5 точных reader SELECT policies.
- PRE columns/enums/constraints/indexes совпали с принятой Part04 schema.
- `snapshots`, `source_runs`, новые enums/columns и `aktau_ingest_writer` отсутствовали.
- Reader NOLOGIN / runtime LOGIN: safe flags, отсутствие ownership/direct runtime ACL/default ACL; exact PostgreSQL17 admin-only creator anchors сохранены.
- Runtime sole parent reader: ADMIN=false, INHERIT=true, SET=false. Reader SELECT5 + public USAGE, без grant option и DML/DDL.
- Full managed ACLs, включая grantors/MAINTAIN, schema/database/PUBLIC privileges зафиксированы privately.
- Prisma: ровно две successful rows с reviewed checksums; init steps=0, RLS steps=1. `migrate status` exit 1: pending **только** `20261005000000_snapshot_history`.
- Safe lock metadata: long transactions >5s отсутствовали; конфликтующих/waiting locks, требующих STOP, не было. Query text не извлекался, sessions не завершались, timeouts не повышались.

## Production migration / backfill — PASS

Из `backend/` выполнен `rtk pnpm exec prisma migrate deploy`: exit 0, применена только `20261005000000_snapshot_history`. Actual deploy command выполнен один раз; retries/resolve/manual repair отсутствовали.

Private wrapper invocation сначала остановился на legacy CLI entrypoint name collision до вызова deploy/production write; имя private entrypoint исправлено, immutable/PRE checks повторены. Reviewed repository source и SQL не редактировались.

После deploy: 9 app tables, RLS9/FORCE0, reader policies6; единственное новое reader access — snapshots SELECT. SourceRun reader access отсутствует. Prisma history: ровно 3 successful rows, steps 0/1/1, migration3 checksum reviewed; `migrate status` exit 0 / up to date, failed/rolled-back/extra rows нет.

| Table | PRE / restore | POST |
| --- | ---: | ---: |
| stores | 3 | 3 |
| store_locations | 15 | 15 |
| categories | 6 | 6 |
| raw_products | 863 | 863 |
| canonical_products | 849 | 849 |
| product_mappings | 863 | 863 |
| offers | 863 | 863 |
| snapshots | отсутствовала | 1 |
| source_runs | отсутствовала | 3 |

Baseline Snapshot: `baseline-internal-v1`, published, publishedAt non-null; startedAt = MIN прежних offers.snapshotAt, publishedAt = MAX. Все 863 RawProducts и 863 Offers связаны только с baseline, null snapshotId отсутствуют.

SourceRun: succeeded, по одной записи на сеть, baseline snapshot, errorCount=0; actual counts:

| Store | productCount |
| --- | ---: |
| DINA | 564 |
| DANA | 279 |
| FIX_PRICE | 20 |
| Total | 863 |

Для каждой сети productCount = actual raw count; capturedAt = MAX её offer.snapshotAt. Все original IDs/columns/prices/oldPrice/inStock/snapshotAt и canonical identity сохранены — full-row fingerprints плюс binary floating-point proof PASS.

Constraints/indexes полностью совпали с exact-artifact local clone, включая publication/count checks, SourceRun unique, обе RawProduct snapshot uniques, snapshot FKs, Offer composite raw/snapshot FK и snapshot/current indexes. Ad-hoc index/extension changes отсутствовали.

## Restricted runtime / compatibility / parity — PASS

Все локальные runtime/reference процессы использовали существующий restricted `aktau_api_runtime`, DATA_SOURCE=postgres, без fixtures/providers.

- Actual SELECT6 allowed: stores, store_locations, categories, canonical_products, offers, snapshots; counts корректны.
- Actual READ-ONLY SELECT raw_products/product_mappings/source_runs denied SQLSTATE42501, до и после writer bootstrap. DML/DDL/SET ROLE probes не выполнялись.
- Go committed pool initialization SET/SHOW enforce on/5s; live `session_policy` gate PASS. `/health/live` и `/health/ready` 200.
- Immutable parent NestJS source сверено с parent commit и rebuilt locally. 48 PRE/POST GET response hashes совпали: 849×3 sorts, 6 filters, category details, dashboard и listing. Это доказывает совместимость **только одного baseline snapshot**, не безопасность старого NestJS для будущего N+1.
- Current NestJS freshly built из immutable HEAD; generated client schema и runtime artifacts сверены. Private harness использовал реальный pnpm module resolution для generated client, без source/dependency changes.

| Committed gate | Result |
| --- | --- |
| `TestHTTPParity`: current snapshot-aware NestJS ↔ parent NestJS | PASS, 185.850s |
| `TestHTTPParity`: Go ↔ current NestJS | PASS, 187.675s |
| `TestLiveReadOnlyParity`: restricted Go pool/repositories ↔ current NestJS | PASS, 122.286s |
| Deterministic direct `POST /api/voice/start` | PASS, both 201/result/single/TOP1 |

Каждый full parity profile завершил все 849 товаров в price_asc/price_desc/name_asc, categories/filters, selected details и все 10 search cases; HTTP profiles дополнительно сравнили dynamic-filter/query-error semantics и dashboard.

Basket totals неизменны: DINA 2230, DANA 1963, FIX_PRICE 2050. Direct Voice decoded responses полностью совпали: product/name/price/store/address/distance/speech. Использованы synthetic coordinates и полностью заданная фраза; Gemini disabled, deterministic fallback, Redis session не создавалась. Координаты/voice text/session data в report не включены.

## Exact writer bootstrap / POST security — PASS

Только после всех migration/backfill/API/pool/Voice PASS повторно проверены отсутствие writer, policies6, exact reader state и immutable hashes. Exact `aktau_ingest_writer_role.sql` выполнен fail-fast: exit 0.

- Writer NOLOGIN/INHERIT, NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS.
- No ownership/default ACL/direct database privileges/grant options/schema CREATE.
- Только public USAGE и 17 exact table grants / 17 exact permissive RLS policies:
  stores SELECT; categories SELECT; snapshots/source_runs SELECT INSERT UPDATE; raw_products SELECT INSERT; canonical_products SELECT INSERT UPDATE; product_mappings/offers SELECT INSERT.
- Only reviewed PG17 creator anchor: postgres, grantor supabase_admin, ADMIN=true/INHERIT=false/SET=false. Writer runtime LOGIN/membership не создан; inheriting LOGIN descendants отсутствуют.
- Writer не получил store_locations access, DELETE/DDL/role-management permissions.
- Final fresh READ-ONLY POST: RLS9/FORCE0/policies23 = reader6 + writer17; reader flags/membership/access/ownership/PUBLIC and managed ACLs unchanged; original row/binary fingerprints unchanged; counts/history3/status0 PASS.

Production writes ограничились reviewed migration3 и exact writer bootstrap. Seed/parser/ingestion, N+1, writer password/LOGIN, rollback/bootstrap reader, Prisma resolve/dev/reset/db push, source hot-fix, deploy/cutover, commit/push не выполнялись. Backup — recovery artifact; generic down migration не заявляется.

## Review archive / final handoff

Permanent target: `production-part-08`.
Archive: `artifacts/production-part-08-review.tar.gz`.
Archive rebuild и verification PASS: 353 files, no real .env/credentials/DB dumps/backups/node_modules/build/test outputs/generated ignored files/Go binaries/temporary workspaces. Проверены actual private credential values и known key patterns; новый rollout report и исходный PART_08_REPORT.md byte-match archived copies. После финального status update архив пересобран и проверен повторно.

Part08 historical code-review report сохранён без изменений. Новый snapshot-aware traffic-owner deployment и первый production N+1 требуют отдельной авторизации; текущая проверка не является cutover. Следующий Part не начинался.
