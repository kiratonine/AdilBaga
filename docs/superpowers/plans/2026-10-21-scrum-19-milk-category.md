# SCRUM-19: категория «Молоко» с 3–4 жирностями — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (или superpowers:subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Исполнитель — новый чат (Sonnet 5.5), без контекста анализа.** Всё нужное есть в этом файле. План состоит из двух частей:
> - **Часть A — только локально** (Tasks 1–5). Прод не трогать вообще: ни записи в Supabase, ни SSH на VPS, ни merge в `main`.
> - **СТОП-гейт.** После Task 5 выдать отчёт по шаблону (раздел «Шаблон отчёта») и остановиться. К части B переходить только когда пользователь в чате напишет дословно **«Заливай на прод»**. Любая другая формулировка («ок», «норм», «давай дальше») — не разрешение: переспросить.
> - **Часть B — прод** (Tasks 6–10).
>
> После каждой части пользователь переносит отчёт в чат анализа. Отчёт должен быть самодостаточным: команды, их вывод (сокращённый), цифры, отклонения от плана.

**Goal:** Оставить в категории `milk` только питьевое молоко (переименовать в «Молоко», фильтр «Жирность» = 1.5 / 2.5 / 3.2 / 6) и убрать фильтр жирности из «Кисломолочных продуктов и сыров».

**Architecture:** Одно детерминированное правило `refineCategory()` в pipeline переносит из `milk`:
- в `dairy` — сливки, сгущёнку, концентрированное и сухое молоко, молочные коктейли;
- в `drinks` — растительные напитки.

Правило применяется в `resolveCategory` (и для карточек словаря, и для новых unmapped-товаров) и в `filterSchemaFor`. `dictionary.json` не переписывается. Таксономия получает allowlist жирности для `milk` и теряет `fatPercent` у `dairy`. Новая сгенерированная data-only миграция обновляет `categories`, а уже применённая `20261006000000_catalog_taxonomy` не трогается. Go API и фронт не меняются, кроме kk-перевода названия.

**Tech Stack:** TypeScript (pipeline, vitest, pnpm 10.32.1), Prisma SQL migrations (Supabase Postgres 17), Go 1.27 (API и ingest, без изменений кода), Next.js i18n (`kk.json`), Docker (локальный PG17).

**Spec:** Jira [SCRUM-19](https://cryptonite.atlassian.net/browse/SCRUM-19) + решения пользователя от 2026-10-21 (раздел «Анализ и решения»).

## Анализ и решения

Прод на 2026-10-21 (Supabase project `yowrsuztaadurovqvxmv`, `https://api.aktau.market`):

| slug | название | товаров | «Жирность» в API сейчас |
|---|---|---|---|
| `milk` | Молоко и сливки | 205 | 26 значений: 1.4 … 60 |
| `dairy` | Кисломолочные продукты и сыры | 1257 | 75 значений: 0.1 … 82.5 |

- Молоко уже вынесено в отдельную категорию `milk`. Шумный фильтр в `dairy` дают сыры (17–80%), масло, спреды и маргарин (57–82.5%), йогурты (0.1–8.6%).
- У питьевого молока 93 из 113 товаров в наличии укладываются ровно в **1.5 / 2.5 / 3.2 / 6%**. Хвост в `milk` дают:
  - сливки (10–35.1%);
  - сгущёнка и концентрированное молоко (7–8.6%);
  - кокосовое молоко (19%, 60%);
  - Nemoloko, Alpro, молочные коктейли.
- Опции фильтра в Go — это `categories.filterSchema.options` ∩ значения у товаров в наличии текущего снапшота (`backend-go/internal/postgres/categories.go`, `filterSchemaAt`). Allowlist в схеме — достаточный рычаг, код Go не меняется.
- Категорию карточки на проде выставляет ingest из bundle, bundle строит sync на VPS (`/opt/aktau-sync`, systemd `aktau-sync`, 01:00 и 13:00 UTC). Источник — `dictionary.json` + `storeCategories`. В словаре 167 карточек `milk`, на проде 205. Поэтому нужно правило по названию, точечных `overrides` недостаточно.

Решения пользователя:
1. В «Молоке» остаётся только питьевое молоко, `milk` переименовывается в «Молоко». Сливки, сгущёнка, концентрированное и сухое молоко, коктейли уходят в `dairy`, растительные напитки — в `drinks`. `drinks` не публикуется, так что с сайта пропадут около 20 карточек.
2. Жирность в `milk` — курированный allowlist `[1.5, 2.5, 3.2, 6]`.
3. В `dairy` фильтр «Жирность» убрать, оставить «Бренд».

## Global Constraints

- Секреты: `C:\Development\AdilBaga\secrets\` не читать и не копировать, кроме `ACCESS.md`. Значения паролей и URL с паролями не печатать, не класть в argv, файлы и отчёт. Команды, которым нужен секрет, пользователь выполняет сам в своём терминале.
- Миграцию `backend/prisma/migrations/20261006000000_catalog_taxonomy/migration.sql` не менять ни на байт: она применена на проде.
- Новая миграция: `backend/prisma/migrations/20261021000000_scrum19_milk_taxonomy/migration.sql`. Генерируется `pnpm taxonomy:sql`, руками не правится, data-only (`INSERT … ON CONFLICT (slug) DO UPDATE`, без DDL и DELETE).
- `DEFAULT_PUBLISH_CATEGORIES` остаются те же 9 slug-ов. `dictionary.json` и `overrides.json` не меняются.
- Allowlist жирности `milk` — ровно `[1.5, 2.5, 3.2, 6]`. Название `milk` — ровно `Молоко`, kk — `Сүт`.
- Ветка: `feat/scrum-19-milk-category` от свежего `origin/main`. Первым коммитом скопировать этот план в `docs/superpowers/plans/2026-10-21-scrum-19-milk-category.md` ветки.
- Временные файлы (исходники скрапа, bundle, скрипты анализа) — только в scratchpad-каталоге сессии, не в репозитории.
- Часть B: каждый прод-шаг выполняется только после «Заливай на прод». Две пометки:
  - **[VPS]** — команды на VPS вводит **пользователь** сам в своей SSH-сессии. Агент к VPS не подключается и Terminal-панель для SSH не открывает. Он выдаёт команды одним блоком `bash` за раз, с ожидаемым результатом и критерием «стоп». Пользователь присылает вывод, агент проверяет его и только потом даёт следующий блок. Sudo у `backend2` продлён после 2026-10-20, срок проверяется в Task 6.
  - **[БД-владелец]** — команды с owner-доступом к Supabase (миграция, откат категорий) выполняет пользователь в своём терминале. Sudo на VPS не даёт доступа к БД, owner-пароль агенту не выдаётся.

## Review Focus

1. Новый unmapped-товар «Сливки …» из Dina-раздела «Молоко» (`storeCategories` → `milk`) должен уйти в `dairy`. Тест — Task 2 (`unmapped cream from a milk store section is published as dairy`).
2. Карточка словаря из нескольких магазинов не должна разъезжаться по категориям: категория считается по `card.name` один раз на карточку. Тест — Task 2 (`all members of a known card get the same refined category`).
3. Казахские названия («Кілегей 20%», «Қоюландырылған сүт») — это сливки и сгущёнка. Тест — Task 1.
4. Растительный напиток при `PUBLISH_CATEGORIES` должен тихо исчезнуть из bundle и не уронить ingest с `unknown_canonical_category` (строки `drinks` в `public.categories` нет). Тест — Task 2 (`plant drink is dropped by publish scope`), проверка — Task 4.
5. Уход около 20 карточек из публикации не должен превысить порог `store_count_drop` ingest-а. Проверка — Task 4, Step 6 (локальный переход «до → после» с прод-порогом) и Task 9.

---

# Часть A — локально

### Task 1: Правило `refineCategory`

**Files:**
- Create: `pipeline/src/mapping/milk.ts`
- Test: `pipeline/test/milk.test.ts`

**Interfaces:**
- Produces: `refineCategory(category: CategorySlug, name: string, fatPercent?: number): CategorySlug` и `MILK_FAT_OPTIONS: readonly number[] = [1.5, 2.5, 3.2, 6]`. Для категории, отличной от `'milk'`, возвращает её без изменений.

- [ ] **Step 1: Write the failing test** — табличный `it.each` на реальных названиях с прода:

```ts
const cases: [string, number | undefined, CategorySlug][] = [
  ['Молоко Петропавловское 3.2% 0.9 л', 3.2, 'milk'],
  ['Молоко топленое 6.5% 350 мл', 6.5, 'milk'],
  ['Мол/пр Milkово 3,2% ф/п 0,9л /10', 3.2, 'milk'],
  ['Молоко МОЁ ДЕТСКОЕ 0.95 л', undefined, 'milk'],
  ['Сливки President 35.1%, 1л', 35.1, 'dairy'],
  ['Сливки сухие ASYL 32% 420 г', 32, 'dairy'],
  ['Сгущенка Лакомка 8.5% 900 г', 8.5, 'dairy'],
  ['Сгущенные сливки 380 г', undefined, 'dairy'],
  ['Молоко концентрированное Фермерское 7.2% 300 г', 7.2, 'dairy'],
  ['Молоко Глубокое 8.6% 300 г', 8.6, 'dairy'],          // концентрированное без слова → по жирности ≥ 7
  ['Коктейль молочный Parmalat Капучино 1,5% 500 мл', 1.5, 'dairy'],
  ['Кілегей 20% 200 г', 20, 'dairy'],
  ['Қоюландырылған сүт 8.5% 380 г', 8.5, 'dairy'],
  ['Напиток овсяный Nemoloko Light 1 л', undefined, 'drinks'],
  ['Напиток соевый Alpro кокос 1 л', undefined, 'drinks'],
  ['Молоко кокосовое Aroy-D 19% 1 л', 19, 'drinks'],      // растительное проверяется раньше правила жирности
  ['Кокосовое молоко Чим-Чим 400 мл', undefined, 'drinks'],
]
it.each(cases)('%s → %s', (name, fat, expected) => expect(refineCategory('milk', name, fat)).toBe(expected))
it('does not touch other categories', () => {
  expect(refineCategory('dairy', 'Сливки Домик в деревне 20% 200 г', 20)).toBe('dairy')
  expect(refineCategory('sweets', 'Молоко сгущенное 8.5% 380 г', 8.5)).toBe('sweets')
})
```

- [ ] **Step 2: Run** `pnpm --dir pipeline exec vitest run test/milk.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `refineCategory` in `pipeline/src/mapping/milk.ts`.** Порядок проверок фиксирован:
  1. растительное → `'drinks'`;
  2. не питьевое → `'dairy'`;
  3. `fatPercent >= 7` → `'dairy'`;
  4. иначе `'milk'`.

  Регулярки регистронезависимые, без `\b` (он не работает с кириллицей):
  - растительное: `/(кокос|соев|овсян|рисов|миндал|гречнев|nemoloko|немолоко|alpro|альпро)/i`;
  - не питьевое: `/(сливк|сгущ|концентр|коктейл|сухое|сухие|кілегей|қоюланд)/i`.

  `CONCENTRATED_FAT_MIN = 7` и `MILK_FAT_OPTIONS` объявить в том же файле. Над функцией — короткий комментарий: SCRUM-19, `dictionary.json` не переписывается.

- [ ] **Step 4: Run** тот же тест. Expected: PASS.

- [ ] **Step 5: Commit** `git add pipeline/src/mapping/milk.ts pipeline/test/milk.test.ts && git commit -m "feat(pipeline): refine milk category to drinking milk only (SCRUM-19)"`

### Task 2: Применить правило в `resolveCategory` и sync

**Files:**
- Modify: `pipeline/src/mapping/dictionary.ts:25-39` (`ResolvedCategory`, `resolveCategory`)
- Modify: `pipeline/src/sync/sync.ts:30-34` (known-ветка берёт `category` из `resolveCategory`, а не `card.category`)
- Test: `pipeline/test/dictionary.test.ts:56-75`, `pipeline/test/sync.test.ts`

**Interfaces:**
- Consumes: `refineCategory` (Task 1).
- Produces: `resolveCategory(dict, store, product: Pick<SourceProduct, 'sourceProductId' | 'sourceCategoryPath' | 'name'>): ResolvedCategory`. Возвращаемая `category` уже уточнена:
  - для карточки — `refineCategory(card.category, card.name, card.attributes.fatPercent)`;
  - для fallback — `refineCategory(storeCategory, product.name, extractFat(product.name) ?? undefined)`.

  `card` возвращается без изменений.

- [ ] **Step 1: Write the failing tests**
  - `dictionary.test.ts`: в существующие вызовы `resolveCategory` добавить `name: 'Молоко FoodMaster 3.2% 1 л'` (ожидания не меняются). Новый `it('refines a milk store section by product name')`: `resolveCategory(d, 'DINA', { ...base, name: 'Сливки Простоквашино 20% 500 г' }).category === 'dairy'`.
  - `sync.test.ts`, новый `describe('SCRUM-19 milk refinement')` (фикстуры через `cp(...)` из `test/helpers.ts` и `buildDictionary(buildBundle(...))`, как в начале файла):
    - `known card named "Сливки …" in milk is published as dairy`: карточка `'Сливки Домик в деревне 20% 200 г'` с category `milk` в словаре → её группа в `bundle.canonicalProducts` имеет `category === 'dairy'`.
    - `all members of a known card get the same refined category`: карточка из DINA `'Молоко Савушкин 3.1% 1 л'` и DANA `'Сливки Савушкин 10% 1 л'` (одна группа) → у группы одна категория, равная `refineCategory('milk', <card.name>, <card fat>)`.
    - `unmapped cream from a milk store section is published as dairy`: товар DINA вне словаря, `sourceCategoryPath` совпадает с milk-разделом в `storeCategories`, имя `'Сливки Килегей 10% 320 г'` → `unmapped[0].guessedCategory === 'dairy'`, группа в bundle — `dairy`.
    - `plant drink is dropped by publish scope`: карточка `'Напиток овсяный Nemoloko 1 л'` (milk в словаре), `buildSyncBundle(files, dict, at, publishCategories(''))` → в bundle нет группы с этим названием и нет групп `category === 'drinks'`.

- [ ] **Step 2: Run** `pnpm --dir pipeline exec vitest run test/dictionary.test.ts test/sync.test.ts`. Expected: новые тесты FAIL, старые PASS.

- [ ] **Step 3: Implement.**
  - В `resolveCategory` расширить `Pick` полем `name` и применить `refineCategory` в обеих ветках.
  - В known-ветке `sync.ts` писать `category` из результата `resolveCategory`.
  - Вызовы в `dina-scope.ts:50` и `dana-scope.ts:51` передают полный `SourceProduct` — проверить, что tsc это принимает.
  - Если known-кластеры в `buildSyncBundle` не проходят через scope, добавить на выходе `filterClustersByScope` из `mapping/scope.ts`. Это пинает тест «plant drink is dropped».

- [ ] **Step 4: Run** `pnpm --dir pipeline test && pnpm --dir pipeline typecheck`. Expected: всё PASS, tsc без ошибок.

- [ ] **Step 5: Commit** `git commit -am "feat(pipeline): apply milk refinement when resolving categories (SCRUM-19)"`

### Task 3: Таксономия, новая миграция, kk-название

**Files:**
- Modify: `pipeline/src/agent/taxonomy.ts:5-6`
- Modify: `pipeline/src/mapping/taxonomy-sql.ts` (`filterSchemaFor`, `buildTaxonomyMigration`, экспорт пути)
- Modify: `pipeline/src/cli/taxonomy-sql.ts:7`
- Create (generated): `backend/prisma/migrations/20261021000000_scrum19_milk_taxonomy/migration.sql`
- Modify: `scripts/ci/postgres.mjs:50` (в ожидаемую цепочку миграций добавить `\n20261021000000_scrum19_milk_taxonomy`)
- Modify: `frontend/src/i18n/kk.json:69` (`"milk": "Сүт"`)
- Test: `pipeline/test/taxonomy.test.ts`

**Interfaces:**
- Consumes: `refineCategory`, `MILK_FAT_OPTIONS` (Task 1).
- Produces: в `taxonomy-sql.ts` — `export const TAXONOMY_MIGRATION = 'backend/prisma/migrations/20261021000000_scrum19_milk_taxonomy/migration.sql'` (путь от корня репо). У фильтра таксономии появляется необязательное поле `allow?: readonly (string | number)[]`.

- [ ] **Step 1: Write the failing tests** в `taxonomy.test.ts`:
  - `sql` читать из `TAXONOMY_MIGRATION` вместо захардкоженного `20261006…`.
  - `it('milk is drinking milk with a curated fat allowlist')`: в строке `milk` миграции `name === 'Молоко'` и `fatPercent.options` строго равен `[1.5, 2.5, 3.2, 6]`.
  - `it('dairy has no fat filter')`: у `dairy` нет `fatPercent`, есть `brand`.
  - `it('only milk and dairy rows differ from the applied SCRUM-7 migration')`: распарсить строки старого файла тем же regex `rows`. Для 7 остальных slug-ов `name` и `schema` равны, для `milk` и `dairy` — отличаются.
  - `it('applied SCRUM-7 migration is left untouched')`: старый файл по-прежнему содержит `'Молоко и сливки'` и `Catalog taxonomy for SCRUM-7`.
  - `it('filter options use the refined category')`: собрать `movedOnly` — бренды milk-карточек словаря с `refineCategory(...) !== 'milk'` минус бренды карточек, оставшихся в milk. Ожидания:
    - `movedOnly.size > 0`;
    - ни один бренд из `movedOnly` не входит в brand-опции `filterSchemaFor(dict,'milk')`;
    - бренды карточек, переехавших в `dairy`, входят в brand-опции `dairy`.
  - Существующий тест «committed migration is exactly what `pnpm taxonomy:sql` generates» остаётся, теперь он сверяет новый файл.

- [ ] **Step 2: Run** `pnpm --dir pipeline exec vitest run test/taxonomy.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `taxonomy.ts`: у `milk` — `name: 'Молоко'` и фильтр `{ key: 'fatPercent', label: 'Жирность', type: 'multi-select', allow: MILK_FAT_OPTIONS }`. У `dairy` фильтры — `[brand]`.
  - `filterSchemaFor`: карточки категории отбирать по `refineCategory(c.category, c.name, c.attributes.fatPercent) === slug`. Если у фильтра задан `allow`, значения пересекаются с ним, сортировка — через `compare`.
  - `buildTaxonomyMigration`: первая строка — `-- Catalog taxonomy (SCRUM-19: milk = drinking milk, dairy without fat). Data-only, idempotent, no DDL.`, остальное без изменений.
  - CLI пишет в `resolve(ROOT, TAXONOMY_MIGRATION)`, папку создаёт через `mkdirSync(dirname(target), { recursive: true })`.
  - Выполнить `pnpm --dir pipeline taxonomy:sql`, затем `git diff --stat -- backend/prisma/migrations/20261006000000_catalog_taxonomy`. Expected: пусто.
  - Поправить `scripts/ci/postgres.mjs` и `kk.json`.

- [ ] **Step 4: Run** `pnpm --dir pipeline test && pnpm --dir pipeline typecheck && pnpm --dir frontend test`. Expected: PASS.

- [ ] **Step 5: Commit** `git add -A pipeline backend/prisma/migrations/20261021000000_scrum19_milk_taxonomy scripts/ci/postgres.mjs frontend/src/i18n/kk.json && git commit -m "feat(taxonomy): milk fat allowlist, drop dairy fat filter, new migration (SCRUM-19)"`

### Task 4: Локальный end-to-end «до → после»

Цель — на свежих реальных данных и локальной БД повторить то, что произойдёт на проде, и снять цифры для отчёта. Всё в scratchpad (`$S` ниже), код не коммитится.

- [ ] **Step 1: Свежие исходники.** `SOURCES_DIR=$S/sources pnpm --dir pipeline scrape:dina` и `scrape:dana` (публичные сайты, ~1–4 мин каждый). Fix Price пропустить: локально нет `FIXPRICE_*`, а молочка почти вся в Dina и Dana. Expected: `$S/sources/dina.json` и `dana.json`.

- [ ] **Step 2: Bundle «до» и «после».**
  - `git worktree add $S/main origin/main`, затем `pnpm --dir $S/main/pipeline install --frozen-lockfile`.
  - Запустить с `SOURCES_DIR=$S/sources SYNC_STORES=DINA,DANA`:
    - в `$S/main` с `SYNC_OUT_DIR=$S/before` → `pnpm --dir pipeline sync`;
    - в ветке с `SYNC_OUT_DIR=$S/after` → `pnpm --dir pipeline sync`.
  - Expected: два `bundle.json`.

- [ ] **Step 3: Анализ разницы.** Node-скрипт `$S/diff.mjs` печатает:
  - (а) число групп по категориям до и после;
  - (б) distinct `fatPercent` у `milk` до и после, и долю групп milk с жирностью из `[1.5,2.5,3.2,6]`;
  - (в) названия групп, ушедших из `milk`, сгруппированные по новой категории;
  - (г) число групп `drinks` — expected 0.

  Критерии PASS:
  - ни одно название в `milk` «после» не матчится регулярками Task 1;
  - доля в allowlist ≥ 80%;
  - `dairy` выросла на число ушедших в неё групп.

  Также `pnpm --dir pipeline sync:compare $S/before/bundle.json $S/after/bundle.json` — приложить вывод (цены не должны меняться).

- [ ] **Step 4: Локальная БД в «старом» состоянии.**
  - `docker run -d --name scrum19-pg -p 127.0.0.1::5432 -e POSTGRES_PASSWORD=local-only postgres:17-alpine`, порт узнать через `docker port scrum19-pg 5432/tcp`.
  - Применить `backend/prisma/security/aktau_api_reader_role.sql` через `docker exec -i scrum19-pg psql -U postgres`.
  - В `$S/main/backend`: `pnpm install --frozen-lockfile`, затем `DATABASE_URL=… DIRECT_URL=… pnpm exec prisma migrate deploy`. Expected: 4 миграции.
  - Из `$S/main/backend-go`: `APP_ENV=development INGEST_DATABASE_URL=… INGEST_MAX_STORE_DROP_PERCENT=100 go run ./cmd/ingest -bundle $S/before/bundle.json -apply`. Expected: снапшот опубликован. Если требуются env revalidation, в development их можно не задавать; если ingest этого не позволяет — записать в отклонения.

- [ ] **Step 5: Миграция ветки.** Из ветки `backend/`: `pnpm exec prisma migrate deploy`. Expected: применена ровно `20261021000000_scrum19_milk_taxonomy`. Затем `SELECT slug,name,"filterSchema" FROM categories WHERE slug IN ('milk','dairy')` — у milk name «Молоко» и fat `[1.5,2.5,3.2,6]`, у dairy нет `fatPercent`.

- [ ] **Step 6: Ingest «после» с прод-порогом.** Из ветки `backend-go`: dry-run, затем `-apply` с `INGEST_MAX_STORE_DROP_PERCENT` из `ops/sync/aktau-sync.env.example`. Expected: dry-run без `store_count_drop` и `unknown_canonical_category`, apply публикует второй снапшот. Отчёт dry-run приложить.

- [ ] **Step 7: API.** `APP_ENV=development DATABASE_URL=… go run ./cmd/api` (порт 8080). Снять:
  - `curl /api/categories` — у milk «Молоко»;
  - `curl /api/categories/milk/filters` — fatPercent ⊆ `[1.5,2.5,3.2,6]`;
  - `curl /api/categories/dairy/filters` — без fatPercent;
  - запрос товаров `milk` с `fatPercent=3.2` (формат параметров — `backend-go/internal/httpapi/product_query.go`): непусто, все товары 3.2%.

- [ ] **Step 8: Визуально.**
  - `NEXT_PUBLIC_API_MODE=http NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8080 pnpm --dir frontend dev`.
  - В браузере открыть `/ru/collections/milk` (панель фильтров), `/ru/collections/dairy`, `/kk/catalog`.
  - Скриншоты сохранить в `$S/screens/`.
  - Expected: в «Молоке» 4 значения жирности и нет сливок, сгущёнки и Nemoloko; в dairy нет «Жирности»; на kk плитка «Сүт».

- [ ] **Step 9: Уборка.** `docker rm -f scrum19-pg`, `git worktree remove $S/main`, остановить API и frontend.

### Task 5: PR (draft), CI, отчёт и СТОП

- [ ] **Step 1:** `git push -u origin feat/scrum-19-milk-category`. Открыть **draft** PR в `main`:
  - заголовок: `SCRUM-19: Молоко = питьевое молоко, жирность 1.5/2.5/3.2/6, без жирности в dairy`;
  - в описании: таблица «до/после» из Task 4 и ссылка на этот план.
- [ ] **Step 2:** Дождаться hosted CI. Должны пройти все jobs, включая `PostgreSQL Integration` (цепочка миграций и Go-тест `ingestor_integration_test.go`) и `CI Gate`. Красный job → разобрать и починить в рамках части A.
- [ ] **Step 3:** Выдать отчёт части A по шаблону ниже и **остановиться**. Не мержить, не трогать прод. Ждать «Заливай на прод».

---

# СТОП-ГЕЙТ

Переход к части B — только после сообщения пользователя с текстом **«Заливай на прод»**. До этого допустимы лишь правки по замечаниям к части A (с обновлённым отчётом).

---

# Часть B — прод

Порядок важен: сначала миграция (имя и фильтры), затем код sync. В обратном порядке тоже безопасно, но так фильтры исправятся сразу. Шаги **[VPS]** агент не выполняет: даёт пользователю команды и разбирает присланный вывод. Шаги **[БД-владелец]** агент не выполняет: даёт точную команду и проверяет результат read-only через Supabase MCP.

### Task 6: Preflight

- [ ] **Step 1:** Подтвердить: PR зелёный на последнем HEAD, ревью есть (или пользователь явно разрешил без него). Сверить `git log origin/main..HEAD` с тем, что было в отчёте A.
- [ ] **Step 2 [VPS]:** дать пользователю блок команд (SSH он открывает сам через `CONNECT.cmd`): `sudo -l` — правило `90-backend2-temporary` активно. Срок записать в отчёт: `sudo cat /etc/sudoers.d/90-backend2-temporary` или то, что сообщит пользователь. Если до истечения меньше суток — предупредить пользователя до начала. Затем: `systemctl list-timers 'aktau-sync*'` (когда ближайший прогон) и `git -C /opt/aktau-sync rev-parse HEAD`. Отдельно спросить пользователя, готов ли он выполнить шаг **[БД-владелец]** в Task 7 и есть ли разрешение владельца на миграцию.
- [ ] **Step 3: Backup категорий (read-only).** Через Supabase MCP `execute_sql` (project `yowrsuztaadurovqvxmv`) выполнить `SELECT id,slug,name,"filterSchema" FROM public.categories ORDER BY slug`. Результат сохранить в `C:\Users\ADMIN\aktau-backups\scrum19-categories-before-<UTC-время>.json`. Там же записать `SELECT id,"createdAt" FROM snapshots ORDER BY "createdAt" DESC LIMIT 1` — текущий снапшот.

### Task 7: Merge и миграция

- [ ] **Step 1:** Снять draft и смержить PR в `main` (merge commit). Дождаться зелёного CI на `main`.
- [ ] **Step 2 [БД-владелец]:** из чистого checkout `main`, в `backend/`, с owner-URL в переменных окружения `DATABASE_URL` и `DIRECT_URL` своего терминала:
  - `pnpm install --frozen-lockfile`;
  - `pnpm exec prisma migrate status` — expected: pending ровно `20261021000000_scrum19_milk_taxonomy`; если pending что-то ещё — СТОП;
  - `pnpm exec prisma migrate deploy`.
- [ ] **Step 3: Проверка (агент, read-only).**
  - SQL: у milk `name='Молоко'`, fat-опции `[1.5,2.5,3.2,6]`; у dairy нет `fatPercent`; остальные 7 строк совпадают с backup.
  - `curl https://api.aktau.market/api/categories/milk/filters` и `/dairy/filters` — сразу должны показать новые фильтры (опции = схема ∩ текущий снапшот).
  - Название категории на сайте может обновиться только после ближайшей публикации (revalidation) — это нормально.

### Task 8: Обновление sync на VPS

- [ ] **Step 1 [VPS]:** перед изменениями проверить, что прогон `aktau-sync` сейчас не идёт (`systemctl is-active aktau-sync` → `inactive`). Затем:
  - `git -C /opt/aktau-sync rev-parse HEAD` — записать как точку отката;
  - `sudo -u aktau-sync git -C /opt/aktau-sync pull --ff-only`;
  - `cd /opt/aktau-sync/pipeline && sudo -u aktau-sync pnpm install --frozen-lockfile`.

  Юниты systemd не менялись, `daemon-reload` не нужен.
- [ ] **Step 2 [VPS]:** `git -C /opt/aktau-sync log -1 --oneline` — совпадает с merge-коммитом в `main`. `git -C /opt/aktau-sync status --porcelain` — пусто.

### Task 9: Первая публикация и smoke

- [ ] **Step 1:** Дождаться ближайшего планового прогона `aktau-sync` (01:00 или 13:00 UTC). Ручной запуск **[VPS]** `sudo systemctl start aktau-sync` — только если пользователь явно попросит.
- [ ] **Step 2 [VPS]:** `journalctl -u aktau-sync -n 200 --no-pager` и `systemctl status aktau-sync --no-pager`. Expected: exit `0` (или `3` только из-за stale-сети, не связанной с задачей); нет `store_count_drop`, `unknown_canonical_category`, ошибок ingest; новый снапшот опубликован.
- [ ] **Step 3: Smoke (агент, read-only).**
  - SQL: число карточек `milk` (expected около 115–130) и `dairy` (рост примерно на 70) в новом снапшоте.
  - Названия товаров `milk` в наличии не матчат регулярки Task 1.
  - API: `/api/categories` (milk = «Молоко»), filters для milk и dairy.
  - Сайт (built-in browser): `https://aktau.market/ru/collections/milk` — 4 значения жирности, нет сливок, сгущёнки и Nemoloko; `/ru/collections/dairy` — нет «Жирности»; `/kk/catalog` — «Сүт» (kk-строка придёт с ближайшим деплоем фронта из `main`; если фронт деплоится вручную — отметить как открытый пункт).
- [ ] **Step 4:** Следующий плановый прогон — повторная быстрая проверка `journalctl` и API. Подтверждает, что новые unmapped-товары не возвращают сливки в «Молоко».

### Task 10: Откат (только при проблеме) и финальный отчёт

- [ ] **Критерии отката:** 5xx на каталоге; пустая `milk` или `dairy`; ingest падает на `store_count_drop` или `unknown_canonical_category`; в «Молоке» снова сливки и сгущёнка после двух прогонов.
- [ ] **Откат категорий [БД-владелец]:** `UPDATE public.categories SET name=…, "filterSchema"=… WHERE slug IN ('milk','dairy')` значениями из backup Task 6. Строку в `_prisma_migrations` не удалять.
- [ ] **Откат sync [VPS]:** `sudo -u aktau-sync git -C /opt/aktau-sync checkout <точка отката>` (или revert-PR + `pull`). Следующая публикация вернёт категории карточек. Предыдущий снапшот не удаляется.
- [ ] **Финальный отчёт** по шаблону (часть B). Подготовить текст комментария в Jira SCRUM-19 («что сделано / как проверить»), но **не публиковать** без явного «да» пользователя.

---

## Шаблон отчёта

```markdown
# SCRUM-19 — отчёт, часть A|B
Ветка / PR / HEAD: …
## Выполнено
- Task N: … (коммит abc1234)
## Проверки
- pipeline test/typecheck: N passed (вывод хвостом)
- frontend test: …
- CI: ссылка, статус каждого job
## Цифры «до → после»
| | до | после |
| milk групп / товаров | … | … |
| milk жирность (distinct) | … | … |
| dairy групп | … | … |
| доля milk в allowlist | | …% |
Ушли из milk → dairy: N (5–10 примеров названий); → drinks: N (примеры)
## API / сайт
- /api/categories/milk/filters: fatPercent = […]
- /api/categories/dairy/filters: ключи = […]
- скриншоты: пути
## Ingest
- dry-run: (кратко), store_count_drop: нет/да
## Отклонения от плана и почему
## Открытые вопросы / что нужно от пользователя
## Секреты: не печатались (подтверждаю)
```
