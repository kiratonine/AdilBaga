# SCRUM-7 — переход к деплою на прод

Статус: zero-size blocker (`sugar.weightGrams = 0`) закрыт на `feat/scrum-7-data`; после зелёного hosted `CI Gate` на финальном HEAD SCRUM-7 = READY FOR MERGE. Этот документ — порядок перехода от merge к production rollout.

Ничего из раздела 2+ в рамках исправления **не выполнялось**: production не затронут.

## 1. Gate перед merge

- [ ] Финальный HEAD `feat/scrum-7-data` — hosted CI: Go Quality, Contracts, Frontend, Nest Reference, Security, Pipeline Quality, PostgreSQL Integration, Ephemeral Staging, `CI Gate` — все PASS на exact HEAD.
- [ ] `sugar.weightGrams` options не содержат `0` (migration + тест `taxonomy.test.ts`).
- [ ] Reviewer (Backend 1 / Denis) выдал финальное разрешение на merge.

## 2. Merge и пост-merge

1. Снять Draft с PR #4, merge в `integrate/full-stack`.
2. Дождаться зелёного CI на merged `integrate/full-stack`.
3. Backend 1 post-merge patch: current-snapshot `/api/categories`, dashboard label «Сахар».
4. Полный integrated rebaseline.

## 3. Подготовка прод-окружения (до любых записей в прод)

- Backup прод-БД (snapshot + проверка восстановления).
- Миграция `20261006000000_catalog_taxonomy` — применяется через `prisma migrate deploy`; upsert по `slug`, существующие `id` категорий не меняются; 9 public categories, без `other`/`salt`.
- Ingest-роль: создать отдельный ingest LOGIN с минимальными grants (только таблицы каталога/снапшотов); не переиспользовать admin/app роли. Секреты — только через secret store, не в репозиторий.
- Проверить network perimeter (Phase A, `85419bd`) — доступ ingest к БД только с разрешённых адресов.

## 4. Порядок rollout

1. **Migration** на проде → проверить: `SELECT slug, "filterSchema" FROM "Category"` — 9 строк, `sugar.weightGrams` без `0`.
2. **Ingest dry-run** (`PUBLISH_CATEGORIES` = 9 public slugs): сверить counts canonical/offers/matching с `CURRENT STATE` из `SCRUM-7_REPORT.md`; расхождения — остановка и разбор.
3. **Ingest apply**: только после просмотра dry-run.
4. **Smoke на проде**:
   - `GET /api/categories` — 9 категорий;
   - `GET /api/categories/<slug>/filters` для всех 9 → 200, options непустые (кроме `vegetables`, где фильтров нет), `0` отсутствует;
   - `GET /api/products?category=sugar&weightGrams=<первый/последний option>` → 200, непусто, значения совпадают;
   - dashboard: label «Сахар».
5. Наблюдение 24 ч: логи ошибок, latency `/api/products`, свежесть snapshot.

## 5. Rollback

- Snapshot-based: публикация нового snapshot не удаляет предыдущий — откат = перевод current на предыдущий snapshot.
- Миграция только upsert категорий; при необходимости откатывается восстановлением `filterSchema` из backup.
- Критерии отката: 5xx на каталоге, пустые категории, option `0` или stale options в фильтрах.

## 6. Известные ограничения (приняты для v1)

- `filterSchema.options` — статический allowlist из committed dictionary; новый brand/size появится в фильтре после обновления taxonomy (`pnpm taxonomy:sql`) и новой миграции.
- Runtime schema redesign / snapshot-scoped schema — после первого стабильного прод-rollout.

## 7. НЕ делать

- Не расширять 9-category scope, не запускать `agent:new`, не начинать Anvar.
- Не перегенерировать dictionary целиком через LLM.
- Не менять Backend 1 runtime вне согласованного post-merge patch.
