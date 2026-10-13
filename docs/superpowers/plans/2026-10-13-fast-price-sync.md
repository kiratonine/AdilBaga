# Fast Price Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ежедневный автоматический sync цен на проде за ~1–1,5 мин вместо ~20: узкий скрап по scope, GraphQL-батчинг Dina, параллельный запуск, fallback на последний удачный файл, systemd-таймеры на VPS.

**Architecture:** Меняется только `pipeline/` (скраперы, CLI, shell-скрипты) и `ops/sync/` (systemd). Go ingest, схема БД, фронт не меняются. Работа идёт в три фазы: **A** — код (Tasks 1–8), **B** — локальная проверка с отчётом и СТОПом (Task 9), **C** — прод, только после явной команды владельца «заливай на прод» (Task 10).

**Tech Stack:** TypeScript (Node 24, pnpm 10, tsx, vitest, zod), bash, systemd, Go 1.27 (`backend-go/cmd/ingest`, без изменений), Docker (локальная Postgres 17).

**Spec:** `docs/superpowers/specs/2026-10-13-fast-price-sync-design.md` — прочитать целиком перед Task 1.

## Global Constraints

- Язык комментариев и сообщений коммитов — как в репозитории (комментарии по-русски, коммиты `type(scope): ...` по-английски). Каждый коммит заканчивается строкой `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Команды pipeline запускать из `pipeline/`: `pnpm test`, `pnpm typecheck`. Оба должны быть зелёными после каждой задачи (их же гоняет CI `scripts/ci/run-checks.mjs pipeline`).
- Sync не использует LLM и `GEMINI_API_KEY*` (существующий тест это проверяет — не ломать).
- Вежливость к магазинам: `politeFetch` с паузой по умолчанию 300 мс сохраняется; батч Dina — `DINA_BATCH_PAGES = 20` алиасов на запрос (не больше).
- Размер страницы Dina = 24 (сервер режет), Fix Price = 28 (фактический максимум API).
- `FIXPRICE_SCOPE_ALIASES = ['produkty-i-napitki']`.
- `SCRAPE_ALL=1` сохраняет прежнее полное поведение всех скраперов.
- Публикуемый scope — `publishCategories()` из `src/mapping/scope.ts` (по умолчанию `DEFAULT_PUBLISH_CATEGORIES`), не дублировать список.
- Порог свежести источника — существующий `SYNC_MAX_SOURCE_AGE_HOURS` (по умолчанию 36).
- Расписание: ежедневный `aktau-sync.timer` 01:00 и 13:00 UTC (не менять); еженедельный `aktau-sync-full.timer` — `Sun *-*-* 22:00:00 UTC`.
- Никаких секретов в git, логах, отчётах и аргументах командной строки. `.env`-файлы не коммитить.
- Dana JSON-адаптер (spec §6) — ВНЕ этого плана.
- Ничего не делать на проде (VPS, Supabase-запись, merge в `main`) до Task 10 и явной команды владельца.

## Review Focus

1. Dina отвечает `200` с `data` и `errors` одновременно (часть алиасов упала) — удачные алиасы должны пойти в результат, упавшие — в `errorCount`; это закрывает тест в Task 3.
2. Категория Dina с `pageInfo.total = 0` или `edges: []` на первой странице — не должна порождать запросов за страницами 2+ (Task 4).
3. Fix Price переименовал/удалил алиас из `FIXPRICE_SCOPE_ALIASES` — скрапер обязан упасть, а не записать файл без продуктов (Task 2).
4. Упал один скрапер, а файл этой сети на диске старше 36 ч — `sync` должен отказать, snapshot не публикуется, скрипт завершается с ненулевым кодом (тест в Task 1 + сценарий в Task 9).
5. `data/mapping/dina-scope-categories.json` отсутствует или пуст — ежедневный скрап Dina работает по-старому (`DINA_SCOPE_ROOTS`), а не падает и не скрапит ноль категорий (Task 5).

---

## Phase A — код

### Task 1: Каталоги источников и вывода через env + тесты свежести

**Files:**
- Create: `pipeline/src/paths.ts`
- Modify: `pipeline/src/cli/scrape.ts` (строка с `resolve(import.meta.dirname, '../../../data/sources', ...)`)
- Modify: `pipeline/src/cli/sync.ts` (константа `DATA` и пути `sources`, `sync/bundle.json`, `sync/unmapped.json`)
- Modify: `.gitignore` (добавить `data/sources-full/` и `data/sync-full/` рядом с `data/sources/`)
- Test: `pipeline/test/paths.test.ts`, `pipeline/test/sync.test.ts`

**Interfaces:**
- Produces:
  - `REPO_ROOT: string` — абсолютный путь корня репозитория.
  - `sourcesDir(env?: string): string` — `env ?? process.env.SOURCES_DIR`; пусто → `<repo>/data/sources`; относительный путь резолвится от корня репозитория; абсолютный — как есть.
  - `syncOutDir(env?: string): string` — то же для `SYNC_OUT_DIR`, по умолчанию `<repo>/data/sync`.
  - `mappingDir(): string` — `<repo>/data/mapping`.

- [ ] **Step 1: Тесты `paths.test.ts`**: `sourcesDir(undefined)` оканчивается на `data/sources` (через `path.sep`-независимую проверку `.replaceAll('\\','/')`); `sourcesDir('data/sources-full')` === `resolve(REPO_ROOT, 'data/sources-full')`; абсолютный путь возвращается без изменений; `syncOutDir(undefined)` оканчивается на `data/sync`.
- [ ] **Step 2: Тесты в `sync.test.ts`** (новый `describe('assertFresh after a failed scrape')`): `now = 2026-10-07T06:00Z`; файл DINA с `capturedAt` = now−1 ч, DANA = now−20 ч, FIX_PRICE = now−1 ч, `maxAge = 36` → не бросает; DANA = now−40 ч → бросает `/DANA: source file is stale/`.
- [ ] **Step 3: Запустить** `pnpm test -- paths sync` → paths FAIL (модуля нет), assertFresh-тесты PASS (поведение уже есть — фиксируем его).
- [ ] **Step 4: Реализовать `src/paths.ts`** и перевести `cli/scrape.ts` на `resolve(sourcesDir(), \`${code.toLowerCase()}.json\`)`, `cli/sync.ts` — на `sourcesDir()`, `syncOutDir()` (создавать каталог `mkdirSync(..., { recursive: true })`) и `mappingDir()` для `dictionary.json`.
- [ ] **Step 5: Проверить** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 6: Commit** `feat(pipeline): configurable sources and sync output dirs`.

### Task 2: Fix Price — только алиасы scope, страница 28

**Files:**
- Modify: `pipeline/src/scrapers/fixprice.ts`
- Modify: `pipeline/src/cli/scrape.ts` (вызов `scrapeFixPrice`)
- Test: `pipeline/test/fixprice.test.ts`

**Interfaces:**
- Produces:
  - `export const FIXPRICE_SCOPE_ALIASES: readonly string[] = ['produkty-i-napitki']`
  - `scrapeFixPrice(opts: { fetchImpl?: typeof fetch; delayMs?: number; aliases?: readonly string[] } = {}): Promise<SourceFile>` — без `aliases` обходит всё меню (как сейчас); с `aliases` — только их.
  - `sourceStats`: `{ mode: 'api', categories: <число обойдённых алиасов>, scoped: boolean }`.

- [ ] **Step 1: Тесты** с фейковым `fetchImpl` (паттерн как `fakeFetch` в `dina.test.ts`; меню — `[{alias:'produkty-i-napitki'},{alias:'dlya-doma'}]`; ответ товаров — массив из фикстуры, заголовок `x-count`):
  - `walks only scope aliases`: `aliases: FIXPRICE_SCOPE_ALIASES` → ни один запрос не содержит `/product/in/dlya-doma`; `sourceStats.scoped === true`.
  - `uses page size 28 and stops by x-count`: `x-count: 30`, первая страница — 28 товаров, вторая — 2 → ровно 2 запроса к `/product/in/produkty-i-napitki`, в URL `limit=28`.
  - `fails when a scope alias is missing from the menu`: меню без `produkty-i-napitki` → `rejects.toThrow(/scope alias produkty-i-napitki not in category menu/)`.
  - `walks the whole menu without aliases`: запросы к обоим алиасам.
- [ ] **Step 2: Запустить** `pnpm test -- fixprice` → новые тесты FAIL.
- [ ] **Step 3: Реализовать**: `PAGE = 28`; остановка цикла страниц, когда `list.length < PAGE` или `page * PAGE >= Number(res.headers.get('x-count'))` (если заголовок есть); проверка алиасов против `menu` до первого запроса товаров. В `cli/scrape.ts`: `FIX_PRICE: ... scrapeFixPrice(all ? {} : { aliases: FIXPRICE_SCOPE_ALIASES })` (ветка `FIXPRICE_HAR` без изменений).
- [ ] **Step 4: Проверить** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(pipeline): scrape only scope categories of Fix Price`.

### Task 3: Dina — сборка и разбор GraphQL-батча

**Files:**
- Create: `pipeline/src/scrapers/dina-batch.ts`
- Modify: `pipeline/src/scrapers/dina.ts` (вынести список полей товара в `export const DINA_PRODUCT_FIELDS`, использовать его в `QUERY`)
- Test: `pipeline/test/dina-batch.test.ts`

**Interfaces:**
- Consumes: `DinaItem`, `DINA_PRODUCT_FIELDS` из `dina.ts`.
- Produces:
  - `export type PageRequest = { categoryId: string; page: number }`
  - `export type PageResult = { ok: true; total: number; edges: DinaItem[] } | { ok: false; error: string }`
  - `buildBatchQuery(reqs: PageRequest[], shopId: string, pageSize: number): string` — документ `{ p0: products(shop_id: <shopId>, _page: <page>, _limit: <pageSize>, category_id: <categoryId>) { pageInfo { total } edges { <DINA_PRODUCT_FIELDS> } } p1: ... }`. `categoryId` вставляется только после проверки `/^\d+$/` (иначе `throw new Error('DINA: invalid category id ...')`) — защита от инъекции в документ.
  - `parseBatchResponse(body: unknown, count: number): PageResult[]` — результат `i` соответствует алиасу `p<i>`. Алиас с `null`/отсутствующий в `data` или указанный в `errors[].path[0]` → `{ ok: false }`. Нет `data` вообще → все `{ ok: false }` с текстом первой ошибки.

- [ ] **Step 1: Тесты**:
  - `builds aliased document`: 2 запроса → строка содержит `p0: products(shop_id: 28, _page: 1, _limit: 24, category_id: 7)` и `p1: products(shop_id: 28, _page: 2, _limit: 24, category_id: 7)`.
  - `rejects non-numeric category id`: `categoryId: '7) { x }'` → throw `/invalid category id/`.
  - `parses successful aliases in order`: `{ data: { p0: {pageInfo:{total:3}, edges:[a]}, p1: {pageInfo:{total:3}, edges:[b]} } }` → `[{ok:true,total:3,edges:[a]}, {ok:true,total:3,edges:[b]}]`.
  - `partial failure` (Review Focus 1): `{ data: { p0: {...}, p1: null }, errors: [{ message: 'boom', path: ['p1'] }] }` → `[ok:true, {ok:false, error:'boom'}]`.
  - `no data`: `{ errors: [{ message: 'down' }] }`, count 2 → два `{ok:false,error:'down'}`.
- [ ] **Step 2: Запустить** `pnpm test -- dina-batch` → FAIL.
- [ ] **Step 3: Реализовать** `dina-batch.ts`.
- [ ] **Step 4: Проверить** `pnpm test && pnpm typecheck` → PASS (существующие `dina.test.ts` тоже).
- [ ] **Step 5: Commit** `feat(pipeline): dina graphql alias batching helpers`.

### Task 4: Dina — двухпроходный батч-обход заданных категорий

**Files:**
- Modify: `pipeline/src/scrapers/dina.ts`
- Test: `pipeline/test/dina.test.ts`

**Interfaces:**
- Consumes: `buildBatchQuery`, `parseBatchResponse`, `PageRequest` (Task 3).
- Produces:
  - `export const DINA_BATCH_PAGES = 20`
  - `scrapeDina(opts)` получает новые опции `categoryIds?: readonly string[]` и `batchPages?: number` (по умолчанию `DINA_BATCH_PAGES`). Если `categoryIds` задан и не пуст — новый режим; иначе прежний (корни/подкатегории) без изменений.
  - `sourceStats` нового режима: `{ shopId, shopCity: 'Актау', mode: 'batch', categories: categoryIds.length, pages, requests, scoped: true }`.

Алгоритм нового режима (после существующего `assertAktauShop`):
1. Проход 1: `PageRequest{categoryId, page: 1}` для каждой категории, нарезка по `batchPages`, один `politeFetch` POST на кусок с телом `{ query: buildBatchQuery(...) }`.
2. Для каждой удачной категории `pages = ceil(total / 24)`; если `total === 0` или `edges.length < 24` — категория закончена.
3. Проход 2: все оставшиеся пары `(categoryId, 2..pages)` одним списком, нарезка по `batchPages`.
4. Каждый `{ok:false}` и каждый упавший HTTP-запрос — `errorCount++` с `console.warn`; при `errorCount > 10` — `throw new Error('DINA: too many page errors, aborting')`. Если упала страница 1 категории, её страницы 2+ не запрашиваются.
5. Товары через `mapDinaItem`, дедупликация по `sourceProductId`.

- [ ] **Step 1: Тесты** (новый `describe('dina batch mode')`, отдельный фейковый сервер, который разбирает алиасы из `body.query` регэкспом `/p(\d+): products\(shop_id: \d+, _page: (\d+), _limit: \d+, category_id: (\d+)\)/g` и отвечает по таблице `{categoryId → товары}`):
  - `fetches first pages of all categories in one request`: 3 категории по ≤24 товара, `batchPages: 20` → ровно 1 запрос товаров; продукты — объединение без дублей.
  - `requests remaining pages in mixed batches`: категория A — 60 товаров (3 страницы), B — 30 (2 страницы), `batchPages: 2` → проход 1: 1 запрос; проход 2: 3 оставшиеся страницы → 2 запроса; итого 3 запроса товаров; `sourceStats.requests === 3`, `pages === 5`.
  - `skips empty categories` (Review Focus 2): категория с `total: 0, edges: []` → её страница 2 никогда не запрашивается.
  - `counts partial alias failures`: сервер отвечает `p1: null` + `errors[path=p1]` → `file.errorCount === 1`, товары остальных категорий на месте.
  - `aborts after more than 10 page errors`: все алиасы падают для 11 категорий, `batchPages: 20` → `rejects.toThrow(/too many page errors/)`.
  - `keeps legacy mode without categoryIds`: существующие тесты `dina.test.ts` проходят без изменений.
- [ ] **Step 2: Запустить** `pnpm test -- dina` → новые FAIL.
- [ ] **Step 3: Реализовать** режим в `scrapeDina` (отдельной внутренней функцией `scrapeDinaBatch`, чтобы не раздувать старый цикл).
- [ ] **Step 4: Проверить** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(pipeline): batched dina scrape of explicit categories`.

### Task 5: Набор категорий Dina по словарю + CLI + подключение в scrape

**Files:**
- Create: `pipeline/src/mapping/dina-scope.ts`
- Create: `pipeline/src/cli/dina-scope.ts`
- Modify: `pipeline/package.json` (скрипт `"scope:dina": "tsx src/cli/dina-scope.ts"`)
- Modify: `pipeline/src/cli/scrape.ts` (ветка `DINA`)
- Test: `pipeline/test/dina-scope.test.ts`

**Interfaces:**
- Consumes: `SourceFile`, `Dictionary`, `identity`, `storeCategoryKey`, `publishCategories`, `mappingDir()` (Task 1), `scrapeDina({ categoryIds })` (Task 4).
- Produces:
  - `export const DinaScopeSchema` (zod) и `type DinaScope = { version: 1; generatedAt: string; scope: CategorySlug[]; categoryIds: string[]; coveredProducts: number; scopeProducts: number }`
  - `computeDinaScope(file: SourceFile, dict: Dictionary, scope: Set<CategorySlug>, generatedAt: string): DinaScope`
  - `readDinaScope(path: string): string[] | null` — `null`, если файла нет, он не парсится схемой или `categoryIds` пуст (с `console.warn` в двух последних случаях).
  - `writeDinaScope(path: string, s: DinaScope): void` — атомарно (`.tmp` + `rename`), `categoryIds` отсортированы численно, JSON с отступом 2 и `\n` в конце.
  - Путь по умолчанию: `resolve(mappingDir(), 'dina-scope-categories.json')`.

Определение «товар в scope» — та же логика, что в `buildSyncBundle`: категория канонической карточки словаря (`dict.canonicals[dict.products[identity('DINA', id)]].category`), иначе `dict.storeCategories[storeCategoryKey('DINA', product.sourceCategoryPath)]`, иначе `'other'`.

Покрытие (жадно, детерминированно):

```text
size[c]      = число товаров ВСЕГО файла, у которых c ∈ rawPayload.categories[].id
uncovered    = id товаров в scope, у которых есть хотя бы одна категория
пока uncovered не пуст:
  c* = argmax по c: |{p ∈ uncovered : c ∈ cats(p)}|; при равенстве — меньший size[c]; затем меньший Number(c)
  добавить c*, убрать покрытые товары
coveredProducts = покрытые; scopeProducts = все товары в scope (включая без категорий)
```

- [ ] **Step 1: Тесты**:
  - `covers every scope product with a minimal set`: 4 товара в scope (milk) в категориях `{10,11}`, `{10}`, `{12}`, `{12,13}`, плюс 3 товара вне scope в категории `11` → `categoryIds` = `['10','12']`, `coveredProducts = scopeProducts = 4`.
  - `prefers the smaller category on ties`: товар в scope в категориях `{20, 21}`, `size[20] = 50`, `size[21] = 2` → `['21']`.
  - `uses storeCategories for unmapped products`: товар без записи в `dict.products`, `storeCategories['DINA|Молоко'] = 'milk'` → учитывается.
  - `counts uncategorized scope products but cannot cover them`: товар в scope с `categories: []` → `scopeProducts` больше `coveredProducts` на 1.
  - `readDinaScope returns null for missing, invalid or empty file` (Review Focus 5): три случая во временном каталоге (`mkdtempSync`).
  - `write/read roundtrip sorts ids numerically`: `['100','9']` → в файле `["9","100"]`.
- [ ] **Step 2: Запустить** `pnpm test -- dina-scope` → FAIL.
- [ ] **Step 3: Реализовать `mapping/dina-scope.ts`.**
- [ ] **Step 4: Реализовать CLI `cli/dina-scope.ts`**: аргументы `[--in <path>] [--out <path>]`; по умолчанию `--in resolve(REPO_ROOT, 'data/sources-full/dina.json')`, `--out` — путь по умолчанию выше. Печатает `[scope:dina] N categories, covered X/Y scope products → <out>`; если `X < Y` — `console.warn` с числом непокрытых (не ошибка). Входной файл должен быть полным: если `sourceStats.scoped === true` или `sourceStats.mode === 'batch'` — `throw new Error('scope:dina needs a full Dina scrape (SCRAPE_ALL=1)')`.
- [ ] **Step 5: Подключить в `cli/scrape.ts`**: `DINA: () => { if (all) return scrapeDina({}); const ids = readDinaScope(<путь по умолчанию>); return ids ? scrapeDina({ categoryIds: ids, batchPages: Number(process.env.DINA_BATCH_PAGES ?? DINA_BATCH_PAGES) }) : scrapeDina({ scopeRoots: DINA_SCOPE_ROOTS }) }`.
- [ ] **Step 6: Проверить** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 7: Commit** `feat(pipeline): dina scope categories derived from the dictionary`. Файл `data/mapping/dina-scope-categories.json` в этой задаче НЕ создаётся — его генерирует Task 9 из реального полного скрапа.

### Task 6: Сравнение двух bundle (`sync:compare`)

**Files:**
- Create: `pipeline/src/sync/compare.ts`
- Create: `pipeline/src/cli/compare.ts`
- Modify: `pipeline/package.json` (`"sync:compare": "tsx src/cli/compare.ts"`)
- Test: `pipeline/test/compare.test.ts`

**Interfaces:**
- Consumes: `Bundle` из `src/agent/bundle.ts`.
- Produces:
  - `type BundleDiff = { a: number; b: number; onlyA: string[]; onlyB: string[]; priceChanged: { id: string; a: number; b: number }[]; mismatchRatio: number; perStore: Record<string, { a: number; b: number }> }`
  - `compareBundles(a: Bundle, b: Bundle): BundleDiff` — идентичность `storeCode:sourceProductId` по `rawProducts`; `mismatchRatio = (onlyA.length + onlyB.length) / max(a, 1)`.
  - CLI: `pnpm sync:compare <a.json> <b.json> [--max-mismatch 0.01]` печатает сводку (счётчики по сетям, первые 20 id из `onlyA`/`onlyB`, число изменённых цен) и выходит с кодом 1, если `mismatchRatio > max`.

- [ ] **Step 1: Тесты**: одинаковые bundle → `mismatchRatio 0`, пустые списки; в B нет одного из 200 товаров → `onlyA` = `['DINA:x']`, `mismatchRatio 0.005`; цена изменилась 500→520 → в `priceChanged`, на `mismatchRatio` не влияет; `perStore` считает по сетям.
- [ ] **Step 2: Запустить** → FAIL. **Step 3: Реализовать.** **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(pipeline): compare two sync bundles`.

### Task 7: Скрипты — параллельный ежедневный sync и еженедельный полный скрап

**Files:**
- Modify: `pipeline/scripts/daily-sync.sh`
- Create: `pipeline/scripts/weekly-full-scrape.sh`

**Interfaces:**
- Consumes: `SOURCES_DIR`, `SYNC_OUT_DIR` (Task 1), `scope:dina --in/--out` (Task 5).
- Produces (коды выхода `daily-sync.sh`, на них опирается Task 9 и runbook):
  - `0` — все три скрапера удачны, snapshot опубликован;
  - `1` — ошибка `sync`/ingest или упали все три скрапера (snapshot не опубликован);
  - `3` — snapshot опубликован, но хотя бы одна сеть взята из прошлого удачного файла (в журнале строка `[sync] stale stores: <list>`).

`daily-sync.sh`:
- `set -uo pipefail` (без `-e` на этапе скрапа), `cd "$(dirname "$0")/.."`.
- Запуск трёх скраперов фоном: для каждой сети `pnpm scrape:<s> 2>&1 | sed -u "s/^/[<s>] /"` в подоболочке; запомнить PID; дождаться каждого `wait $pid`, записать код и длительность (`$SECONDS` на старте/финише) строкой `[sync] <s> exit=<code> took=<sec>s`.
- Все три с ненулевым кодом → `[sync] all scrapers failed, nothing to publish`, `exit 1`.
- Дальше `set -e`: `pnpm sync`, затем как сейчас `go run ./cmd/ingest -bundle ../data/sync/bundle.json` и `... -apply` (путь bundle строить из `${SYNC_OUT_DIR:-data/sync}` относительно корня репозитория).
- В конце: если были упавшие сети → `[sync] stale stores: ...`, `exit 3`; иначе печать общего времени и `exit 0`.

`weekly-full-scrape.sh`:
- `set -euo pipefail`; `export SCRAPE_ALL=1 SOURCES_DIR=data/sources-full SYNC_OUT_DIR=data/sync-full`.
- Три скрапера параллельно (тот же приём; здесь любой упавший → `exit 1` после ожидания всех).
- `pnpm scope:dina --in ../data/sources-full/dina.json --out ../data/sources-full/dina-scope-categories.candidate.json`.
- `SYNC_MAX_SOURCE_AGE_HOURS=36 pnpm sync` (пишет `data/sync-full/unmapped.json`). Ingest НЕ запускается.
- Печать: `[full] candidate written; compare with data/mapping/dina-scope-categories.json and commit manually`.

- [ ] **Step 1: Переписать `daily-sync.sh`** по описанию; обновить шапку-комментарий (нужные env, коды выхода).
- [ ] **Step 2: Создать `weekly-full-scrape.sh`.**
- [ ] **Step 3: Синтаксис и линт**: `bash -n pipeline/scripts/daily-sync.sh && bash -n pipeline/scripts/weekly-full-scrape.sh` → без вывода; `docker run --rm -v "$PWD/pipeline/scripts:/s" koalaman/shellcheck:stable /s/daily-sync.sh /s/weekly-full-scrape.sh` → без ошибок (warnings исправить или обосновать `# shellcheck disable=` с комментарием).
- [ ] **Step 4: Проверить сценарий без сети и БД**: `PATH` с фейковым `pnpm`, который для `scrape:dana` выходит с 1, для остальных — 0, а для `sync` — 0; фейковый `go`, выходящий с 0 (скрипт-заглушки во временном каталоге). Ожидание: в выводе `[sync] dana exit=1`, `[sync] stale stores: dana`, код выхода 3. Второй прогон: все `scrape:*` выходят с 1 → код 1, `sync` не вызывался. Команды прогона записать в описание коммита.
- [ ] **Step 5: Commit** `feat(pipeline): parallel daily sync with last-good fallback, weekly full scrape`.

### Task 8: systemd-юниты и документация

**Files:**
- Modify: `ops/sync/aktau-sync.service` (`TimeoutStartSec=20min`; `SuccessExitStatus` НЕ добавлять — код 3 должен давать `failed`, чтобы проблема была видна)
- Create: `ops/sync/aktau-sync-full.service` (копия ежедневного юнита: `ExecStart=/usr/bin/bash pipeline/scripts/weekly-full-scrape.sh`, `TimeoutStartSec=2h`, `Description=Aktau Market weekly full catalog scrape (no publish)`)
- Create: `ops/sync/aktau-sync-full.timer` (`OnCalendar=Sun *-*-* 22:00:00 UTC`, `Persistent=true`)
- Modify: `ops/sync/README.md` (установка обоих таймеров; коды выхода 0/1/3; где кандидат набора категорий; как обновить код на VPS: `sudo -u aktau-sync git -C /opt/adilbaga pull --ff-only` + `pnpm install --frozen-lockfile` в `pipeline/`)
- Modify: `docs/data/SYNC_RUNBOOK.md` (§1 новая схема с параллельным скрапом и батчами; §3 два таймера; §4 строки «exit 3 — stale stores», «scope alias ... not in category menu», «DINA: too many page errors»; §5 еженедельный полный прогон и ручной коммит `dina-scope-categories.json`)

- [ ] **Step 1: Внести изменения в юниты и доки.**
- [ ] **Step 2: Проверить юниты** на синтаксис: `docker run --rm -v "$PWD/ops/sync:/u" debian:13 bash -c 'apt-get -qq update >/dev/null && apt-get -qq install -y systemd >/dev/null && systemd-analyze verify --man=no /u/aktau-sync.service /u/aktau-sync.timer /u/aktau-sync-full.service /u/aktau-sync-full.timer'` → допустимы только предупреждения об отсутствующем пользователе/пути `/opt/adilbaga`, без синтаксических ошибок.
- [ ] **Step 3: `pnpm test && pnpm typecheck`** в `pipeline/` → PASS (регрессия).
- [ ] **Step 4: Commit** `ops(sync): weekly full scrape timer, faster daily unit, runbook`.

---

## Phase B — локальная проверка (СТОП в конце)

### Task 9: Полный локальный прогон, сравнение, ingest в локальную БД, отчёт

Ничего не трогает прод. Требует Docker, Go, pnpm на машине разработчика. Запускать из корня worktree. Прод-БД не используется.

**Files:**
- Create: `data/mapping/dina-scope-categories.json` (сгенерированный, коммитится)
- Create: `docs/data/FAST_SYNC_LOCAL_REPORT.md` (отчёт)

- [ ] **Step 1: Окружение.** `pipeline/.env` с `FIXPRICE_CITY_ID=1594`, `FIXPRICE_COUNTRY_ID=3` (не коммитится; если файла нет — создать). `cd pipeline && pnpm install`.
- [ ] **Step 2: Полный скрап (база для сравнения).** `SCRAPE_ALL=1 SOURCES_DIR=data/sources-full` — запустить `pnpm scrape:dina`, `pnpm scrape:fixprice`, `pnpm scrape:dana` (последовательно, засечь время каждого через `time`). Если Dana падает (сайт отдавал 500 на 2026-10-13) — зафиксировать в отчёте и скопировать последний удачный `dana.json` из основной копии репозитория `C:\Development\AdilBaga\data\sources\dana.json` в `data/sources-full/` и `data/sources/`, отметив его `capturedAt`. Если он старше 36 ч, запускать дальнейшие `pnpm sync` с `SYNC_MAX_SOURCE_AGE_HOURS=9999` ТОЛЬКО локально и написать об этом в отчёте.
- [ ] **Step 3: Набор категорий Dina.** `pnpm scope:dina` → `data/mapping/dina-scope-categories.json`. Ожидание: порядка 50 категорий (spec §4.2), покрытие X/Y с X ≥ 99% Y. Иначе — СТОП, разобрать, написать в отчёт.
- [ ] **Step 4: Bundle A (полный).** `SOURCES_DIR=data/sources-full SYNC_OUT_DIR=data/sync-full pnpm sync` → `data/sync-full/bundle.json`.
- [ ] **Step 5: Узкий ежедневный скрап (новый код).** Без `SCRAPE_ALL` и без `SOURCES_DIR`: из `pipeline/` запустить `time (pnpm scrape:dina & pnpm scrape:fixprice & pnpm scrape:dana & wait)`, время каждой сети взять из вывода `[...] N products`-строк и `time`. Убедиться, что Dina шла в режиме батча: в `data/sources/dina.json` `sourceStats.mode === 'batch'`. Затем `pnpm sync` → bundle B `data/sync/bundle.json`.
- [ ] **Step 6: Сравнение.** `pnpm sync:compare ../data/sync-full/bundle.json ../data/sync/bundle.json` → код 0, `mismatchRatio ≤ 0.01`. Иначе — СТОП, разобрать причину (например, товары вне набора категорий), исправить, повторить.
- [ ] **Step 7: Локальная БД.** Docker должен быть запущен. Дамп `data/agent/prod_catalog.sql` есть в основной копии (`C:\Development\AdilBaga\data\agent\prod_catalog.sql`, 2026-10-05) — скопировать в `data/agent/` worktree. `bash backend-go/scripts/local-ingest-db.sh` → печатает `INGEST_DATABASE_URL=...` для `127.0.0.1:55432`. Если ingest ниже упадёт с `canonical_merge_conflict` из-за старого дампа — спросить владельца про свежий дамп (нужен owner-доступ к Supabase, см. Task 10 Step 1, пункт 4), не обходить гейт.
- [ ] **Step 8: Полный ежедневный скрипт против локальной БД.** `APP_ENV=development INGEST_MAX_STORE_DROP_PERCENT=10 INGEST_DATABASE_URL=<из шага 7> FRONTEND_REVALIDATE_URL=http://127.0.0.1:9/internal/revalidate REVALIDATE_HMAC_SECRET=<случайная локальная строка ≥ 32 символов, напр. $(openssl rand -hex 32)> bash pipeline/scripts/daily-sync.sh; echo "exit=$?"`. Ожидание: dry-run и `-apply` успешны, в JSON-сводке `"applied":true`, в stderr `frontend_revalidation` с `outcome_class=degraded` (недоступный локальный URL — это норма: `PublishThenNotify` не считает сбой уведомления ошибкой). Записать общее время и время каждой сети.
- [ ] **Step 9: Проверка в локальной БД.** `docker exec adilbaga-ingest-test psql -U postgres -c "select status, \"publishedAt\", \"qualityReport\"->>'rawCount' from snapshots order by \"createdAt\" desc limit 2"` → новый snapshot `published`; `rawCount` в пределах ±10% от прод-snapshot `cefa9f11…` (3 256).
- [ ] **Step 10: Сценарий падения одной сети.** Повторить шаг 8 с `FIXPRICE_CITY_ID=` (пустой) → в журнале `[sync] fixprice exit=1`, `[sync] stale stores: fixprice`, код 3, новый snapshot опубликован, `source_runs.capturedAt` у FIX_PRICE = время прошлого удачного скрапа.
- [ ] **Step 11: Отчёт** `docs/data/FAST_SYNC_LOCAL_REPORT.md`: время каждой сети было/стало, общее время, число запросов (из `sourceStats`), результат `sync:compare`, покрытие `scope:dina`, результат ingest и сценария падения, все отклонения от плана. Без секретов и строк подключения.
- [ ] **Step 12: Остановить локальную БД** `docker rm -f adilbaga-ingest-test`. `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 13: Commit** `chore(data): dina scope categories and fast sync local report`.
- [ ] **Step 14: Push и PR (без merge).** `git push -u origin <ветка>`; `gh pr create --base main` с кратким описанием и ссылкой на отчёт; в конце описания — `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Дождаться зелёного CI.
- [ ] **Step 15: СТОП.** Сообщить владельцу: ссылка на PR, таблица времени из отчёта, отклонения. Явно написать: «Для выкладки на прод напишите „заливай на прод“». Не переходить к Task 10 без этой фразы (или явного эквивалента).

---

## Phase C — прод (только после команды владельца)

### Task 10: Запрос доступов и выкладка

- [ ] **Step 1: Сначала — запрос доступов (ничего не выполнять до ответа).** Отправить владельцу ровно этот список, отметив, что уже есть в сессии (например, `gh` авторизован, Supabase MCP только для чтения):
  1. **Merge PR в `main`** — одобрение владельца (branch protection, `docs/production/GITHUB_BRANCH_PROTECTION.md`). Merge делает владелец или агент по его явному разрешению.
  2. **SSH к VPS**: хост, порт, пользователь с `sudo` (не root), способ аутентификации (ключ уже в агенте/`~/.ssh/config` или владелец выполняет команды сам и присылает вывод). Отпечаток хоста — от владельца, не из `ssh-keyscan`.
  3. **`INGEST_DATABASE_URL`** — строка подключения LOGIN-роли, которая состоит ТОЛЬКО в `aktau_ingest_writer` (`WITH INHERIT TRUE, SET FALSE`, без владения объектами; это проверяет `cmd/ingest`). Если такой роли на Supabase ещё нет — нужен owner-доступ к Supabase (SQL editor или `SUPABASE_DIRECT_URL`) однократно, чтобы создать её по образцу `backend-go/scripts/local-ingest-db.sh` (`CREATE ROLE ... LOGIN PASSWORD ...; GRANT aktau_ingest_writer TO ... WITH INHERIT TRUE, SET FALSE`). Пароль генерирует и вписывает в `/etc/aktau-sync.env` владелец (или агент через `sudoedit` без вывода значения).
  4. **`REVALIDATE_HMAC_SECRET`** — тот же секрет, что в env фронтенда на Vercel (`docs/production/FRONTEND_REVALIDATION.md`), и подтверждение `FRONTEND_REVALIDATE_URL=https://aktau.market/internal/revalidate`.
  5. **Решение владельца `INGEST_PRODUCTION_APPLY_CONFIRM=1`** — явное «да» на автоматическую публикацию в production (SYNC_RUNBOOK §2).
  6. (Опционально) свежий дамп прод-каталога для повторной локальной проверки — если в Task 9 был `canonical_merge_conflict`.
  Секреты не просить вставлять в чат, если владелец может вписать их сам в `/etc/aktau-sync.env` через `sudoedit`; если присылает в чат — не повторять значения в ответах, логах и коммитах.
- [ ] **Step 2: Merge** PR (после одобрения), убедиться, что CI на `main` зелёный (`gh run list --branch main --limit 3`).
- [ ] **Step 3: Проверка VPS (только чтение)**: `systemctl list-timers --all | grep aktau`; наличие `/opt/adilbaga` (git checkout), `node`, `pnpm`, `/usr/local/go/bin/go`; пользователь `aktau-sync`; права на `/opt/adilbaga/data`. Сообщить, чего не хватает, и ставить недостающее только по `ops/sync/README.md`.
- [ ] **Step 4: Код на VPS**: checkout/`git pull --ff-only` в `/opt/adilbaga` на коммит из `main`; `pnpm install --frozen-lockfile` в `pipeline/`; владелец данных — `aktau-sync`.
- [ ] **Step 5: Env**: `/etc/aktau-sync.env` по `ops/sync/aktau-sync.env.example` (права `600`, владелец `aktau-sync`), значения из Step 1. Не печатать файл.
- [ ] **Step 6: Юниты**: скопировать 4 файла из `ops/sync/` в `/etc/systemd/system/`, `sudo systemctl daemon-reload`.
- [ ] **Step 7: Первый ручной прогон**: `sudo systemctl start aktau-sync`; `journalctl -u aktau-sync -n 200 --no-pager` → строки `[sync] <s> exit=0 took=…`, сводка ingest `"applied":true`. Через Supabase MCP (только чтение): последний `snapshots` — `published`, `createdAt` = сейчас, `qualityReport.rawCount` в пределах ±10% от 3 256, `failureCode` пуст; `source_runs.capturedAt` трёх сетей свежие (у Dana — допустимо старое, если сайт лежит; тогда `exit 3`).
- [ ] **Step 8: Сайт**: открыть `https://aktau.market/ru/catalog` и карточку товара — нет предупреждения «цены старше 36 ч» (кроме Dana, если она упала).
- [ ] **Step 9: Включить таймеры**: `sudo systemctl enable --now aktau-sync.timer aktau-sync-full.timer`; `systemctl list-timers | grep aktau` → ближайшие 01:00/13:00 UTC и воскресенье 22:00 UTC.
- [ ] **Step 10: Отчёт владельцу**: время прогона на VPS, id snapshot, ближайшие запуски таймеров, что проверить завтра (`journalctl -u aktau-sync --since today`). Дописать раздел «Production» в `docs/data/FAST_SYNC_LOCAL_REPORT.md` (без секретов, хоста и строк подключения), commit `docs(data): fast sync production rollout`, PR.
