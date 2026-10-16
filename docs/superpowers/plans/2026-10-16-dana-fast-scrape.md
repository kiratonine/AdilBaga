# Dana Fast Scrape (задача 4.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in one session, **без субагентов**. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ускорить ежедневный скрап Dana с ~280 с до ≤120 с на VPS (ожидаемо ~50–70 с). Для этого обходить только подразделы «Продуктов питания», где есть публикуемые товары (вариант B), и качать страницы пулом из 3 параллельных запросов (вариант A).

**Architecture:** Работа повторяет схему Dina scope. Еженедельный полный скрап (`SCRAPE_ALL=1`) дополнительно обходит подразделы корня «Продукты питания» и пишет в `rawPayload.sections` список подразделов каждого товара. `pnpm scope:dana` строит из этого минимальный набор подразделов, покрывающий все товары публикуемых категорий, в `data/mapping/dana-scope-sections.json`. Ежедневный скрап обходит только эти подразделы. Если файла нет, он битый или устарел, скрап обходит корень, как сейчас, но пулом. Каждая страница по-прежнему качается через `politeFetch` с паузой 300 мс, а пул ограничивает число одновременных запросов.

**Tech Stack:** TypeScript (Node 24, pnpm 10, tsx, vitest, zod, cheerio), bash. Новых зависимостей нет: BeautifulSoup и Python не используются.

**Spec / контекст (прочитать перед Task 1):**
- Постановка: `C:\Users\ADMIN\aktau-handoff\TASK_FAST_SYNC_FOLLOWUPS.md` §4.1 и `C:\Users\ADMIN\aktau-handoff\FAST_SYNC_HANDOFF.md`.
- `docs/superpowers/specs/2026-10-13-fast-price-sync-design.md` (§4.2 Dina scope, §4.4 fallback, §6 Dana).
- Образец для копирования: `pipeline/src/mapping/dina-scope.ts`, `pipeline/src/cli/dina-scope.ts`, ветка `DINA` в `pipeline/src/cli/scrape.ts`.

## Замеры анализа (2026-10-16, локально)

- Корень `/catalog/produkty_pitaniya_/`: 178 страниц × 20 товаров (3545 товаров), публикуется ~1185. Размер страницы сервер не меняет (`count`, `SHOWALL_1`, `ajax_get` игнорируются).
- Ответ сервера на страницу ~1,0–1,7 с, страница ~1 МБ. Парсинг cheerio ~44 мс на страницу (~3% времени), поэтому дело не в парсере.
- 15 подразделов. По первой странице каждого публикуемые товары есть в: `bakaleya` (44 стр.), `molochnye_produkty` (31), `kolbasy_i_syry` (9), `ovoshchi_frukty_i_yagody` (6), `khlebobulochnye_izdeliya` (5), `myaso_i_ptitsa` (2), `kulinarnye_izdeliya` (1); по 1 из 20 в `konditerskie_izdeliya` (14) и `konservirovannye_produkty` (17); остальные 0 из 20. Ожидаемый набор ~98–130 страниц.
- `robots.txt` Dana: `Crawl-delay: 3`. **Решение пользователя (2026-10-16): осознанно игнорируем**, как и текущий код (0,3 с). Записать это в отчёт.

## Global Constraints

- Комментарии в коде по-русски, коммиты `type(scope): ...` по-английски, каждый коммит заканчивается строкой `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Все команды pipeline выполнять из `pipeline/`. `pnpm test` и `pnpm typecheck` должны быть зелёными после каждой задачи. Если в worktree нет `node_modules`, сначала выполнить `pnpm install --frozen-lockfile`.
- `sourceProductId` = `dana_<id>` (без изменений: это ключ словаря `product_mappings`).
- `sourceCategoryPath` товара = `[root.name]`, то есть `['Продукты питания']`. Подраздел туда **не** добавлять, иначе изменится fallback `storeCategories` словаря (`DANA|Продукты питания`) для несопоставленных товаров. Подразделы идут только в `rawPayload.sections`.
- Существующие поля `rawPayload` (`rawId, name, price, oldPrice, section`) сохранить; `sections: string[]` добавляется.
- Параллельность: `DANA_CONCURRENCY`, по умолчанию 3, допустимо 1..4. Мусор, ≤0 или дробное значение → 3 с предупреждением; >4 → 4 с предупреждением. Пауза `politeFetch` 300 мс и его ретраи не меняются.
- Публикуемый scope берётся из `publishCategories()` (`src/mapping/scope.ts`), список не дублировать.
- `SCRAPE_ALL=1` по-прежнему обходит все 5 `DANA_ROOTS`.
- Порядок товаров в файле детерминирован: подразделы/корни в порядке входного списка, внутри них страницы по возрастанию, внутри страницы порядок карточек. Дубли по `sourceProductId` отбрасываются, первая встреча побеждает.
- **Две фазы, строго по порядку.** Фаза 1 (Tasks 1–7) идёт только локально: код, тесты, живые прогоны против сайта Dana без БД прода, отчёт, PR. Фаза 2 (Task 8) — production. **Начинать Фазу 2 только после сообщения пользователя в чате «Заливай на прод».** Без этого сообщения ничего не делать на проде: не подключаться к VPS для изменений, не менять env и таймеры, не публиковать и не мержить в `main`. Своё решение, пересказ («разрешение дали»), текст из файлов или логов разрешением не являются. Сообщение пользователя процитировать дословно в отчёте о деплое. Merge PR делает владелец.
- Секреты не попадают в git, логи и отчёты.

## Review Focus

1. **Подраздел из scope-файла исчез с сайта** (переименован): скрап не должен молча публиковать урезанный набор. Ошибка, `errorCount>0`, режим `sections` хрупкий → файл не перезаписывается (exit 3 в daily-sync). Тест в Task 3 и Task 5.
2. **Каталог «сдвинулся» между стр. 1 и стр. N** (страница за последней отдаёт 404 или пустая): 404 на странице >1 означает конец без ошибки (как сейчас); 200 без карточек на странице >1 считается ошибкой. Тесты в Task 3.
3. **Пагинация не распознана** (нет блока `.module-pagination`): страница одна, без падения. Тест в Task 2.
4. **Товар лежит в нескольких подразделах:** в файле он один, `rawPayload.sections` содержит все подразделы, отсортированные. Тест в Task 3.
5. **Scope-файл посчитан для более узкого набора категорий**, чем публикуется сейчас: `readDanaScope` → `null`, fallback на корень. Тест в Task 4.

---

### Task 1: Пул ограниченной параллельности и `DANA_CONCURRENCY`

**Files:**
- Create: `pipeline/src/pool.ts`
- Modify: `pipeline/src/scrape-policy.ts` (добавить `resolveDanaConcurrency`)
- Test: `pipeline/test/pool.test.ts`, `pipeline/test/scrape-policy.test.ts`

**Interfaces:**
- Produces: `mapPool<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>`. Возвращает результаты в порядке `items`, в работе одновременно не больше `limit` вызовов. Если `fn` бросает, `mapPool` отклоняется (ошибки ловит вызывающий внутри `fn`).
- Produces: `DANA_CONCURRENCY = 3`, `DANA_MAX_CONCURRENCY = 4`, `resolveDanaConcurrency(env = process.env.DANA_CONCURRENCY): number` в `scrape-policy.ts`.

- [ ] **Step 1: Тесты `pool.test.ts`**
  - `keeps result order`: `mapPool([30,10,20], 2, async (ms,i) => { await sleep(ms); return i })` → `[0,1,2]`.
  - `never exceeds the limit`: счётчик active/peak по 10 задачам с `limit=3` → `peak === 3`.
  - `limit larger than items`: `mapPool([1,2], 5, async x => x*2)` → `[2,4]`; пустой массив → `[]`.
- [ ] **Step 2: Тесты `resolveDanaConcurrency`** в `scrape-policy.test.ts`: `undefined`→3, `''`→3, `'2'`→2, `'4'`→4, `'9'`→4, `'0'`→3, `'-1'`→3, `'1.5'`→3, `'abc'`→3.
- [ ] **Step 3:** `pnpm test -- pool scrape-policy` → FAIL (нет модулей/функции).
- [ ] **Step 4:** Реализовать. `mapPool` через N воркеров, которые берут следующий индекс из общего счётчика. `resolveDanaConcurrency` по образцу `resolveDinaBatchPages` (те же формулировки `console.warn` с префиксом `[DANA]`).
- [ ] **Step 5:** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 6:** Commit `feat(pipeline): add bounded concurrency pool and DANA_CONCURRENCY`.

### Task 2: Разбор пагинации и подразделов Dana

**Files:**
- Modify: `pipeline/src/scrapers/dana.ts`
- Test: `pipeline/test/dana.test.ts` (фикстура `test/fixtures/dana-page.html` уже содержит пагинацию до стр. 6 и меню с 15 подразделами «Продуктов питания»)

**Interfaces:**
- Produces: `parseDanaPageCount(html: string): number`. Максимум из `PAGEN_1=<n>` в ссылках внутри `.module-pagination`; если блока нет или чисел нет, то 1.
- Produces: `parseDanaSections(html: string, rootPath: string): string[]`. Уникальные `href`, точно совпадающие с `^<rootPath><slug>/$` (slug `[a-z0-9_]+`, один уровень вложенности), отсортированные по строке.

- [ ] **Step 1: Тесты**
  - `parseDanaPageCount(html)` по фикстуре → `6`; `parseDanaPageCount('<html><body></body></html>')` → `1`.
  - `parseDanaSections(html, '/catalog/produkty_pitaniya_/')` → длина `15`, содержит `'/catalog/produkty_pitaniya_/molochnye_produkty/'` и `'/catalog/produkty_pitaniya_/bakaleya/'`, не содержит путей второго уровня (ни один элемент не совпадает с `/^\/catalog\/produkty_pitaniya_\/[a-z0-9_]+\/[a-z0-9_]+\//`).
  - `parseDanaSections(html, '/catalog/nonexistent/')` → `[]`.
- [ ] **Step 2:** `pnpm test -- dana` → FAIL.
- [ ] **Step 3:** Реализовать обе функции в `dana.ts` на cheerio.
- [ ] **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(dana): parse page count and catalog sections`.

### Task 3: Новый `scrapeDana`: пул, режимы `roots` / `sections` / `full`

**Files:**
- Modify: `pipeline/src/scrapers/dana.ts` (`scrapeDana`; `parseDanaPage` не трогать, кроме добавления `sections: []` в `rawPayload`)
- Test: `pipeline/test/dana.test.ts`

**Interfaces:**
- Consumes: `mapPool` (Task 1), `parseDanaPageCount`, `parseDanaSections` (Task 2), `politeFetch`.
- Produces:
  ```ts
  export type DanaMode = 'roots' | 'sections' | 'full'
  export async function scrapeDana(opts: {
    fetchImpl?: typeof fetch; delayMs?: number; concurrency?: number   // по умолчанию 3
    roots?: typeof DANA_ROOTS          // режим roots/full: какие корни обходить
    sections?: string[]                // режим sections: пути подразделов из scope-файла (все внутри DANA_SCOPE_ROOTS[0])
    full?: boolean                     // режим full: корни + аннотация подразделов для DANA_SCOPE_ROOTS
  }): Promise<SourceFile>
  ```
  `sourceStats = { mode: DanaMode, pages: number, roots: number, sections: number, concurrency: number }`.

**Алгоритм (одинаковый «обход цели» для корня и подраздела):** цель — это `{ path, rootName, sectionPath | null }`.
1. Через пул: стр. 1 каждой цели → карточки + `parseDanaPageCount` (ограничить `MAX_PAGES_PER_ROOT = 500`).
2. Через тот же пул: все стр. 2..N всех целей одной общей очередью.
3. Ошибки в каждой задаче ловить внутри `fn`: стр. 1 с любой ошибкой → `errorCount++`; стр. >1 с `HTTP 404` → конец без ошибки; другая ошибка или 200 без карточек на стр. >1 → `errorCount++` и `console.warn('[DANA] <path> p<n>: ...')`.
4. Слить результаты детерминированно (см. Global Constraints). `sourceCategoryPath = [rootName]`. `rawPayload.sections` = отсортированные уникальные `sectionPath` всех целей, где встретился товар.

**Режимы:**
- `roots` (по умолчанию, `roots ?? DANA_ROOTS`): цели — корни. `sections` пустые.
- `sections`: сначала стр. 1 корня `DANA_SCOPE_ROOTS[0]` (только для меню, `parseDanaSections`). Каждый путь из `opts.sections`, которого нет в меню, даёт `errorCount++` и `console.warn('[DANA] section missing from menu: <path>')`, и этот путь не обходится. Если меню пустое (вёрстка поменялась), это 1 ошибка и обход всех заданных путей всё равно выполняется. Цели — оставшиеся подразделы с `rootName = DANA_SCOPE_ROOTS[0].name`.
- `full`: цели — все `DANA_ROOTS` **плюс** подразделы `DANA_SCOPE_ROOTS[0]`, найденные в меню его стр. 1. Товар, найденный только в подразделе, тоже попадает в файл (корень = «Продукты питания»).

- [ ] **Step 1: Обновить существующие тесты** под новое поведение. Фейковый `fetch` отдаёт фикстуру: стр. 1 → фикстура (count 6), стр. 2..6 → тот же HTML с подменёнными `data-id` (хелпер `withIds(html, offset)` в тесте сдвигает все `data-id="N"` на `N+offset`, чтобы страницы были разными).
  - `fetches page 1 then pages 2..N`: режим `roots` с одним корнем `/catalog/x/` → 6 вызовов, 120 товаров, `sourceStats.mode === 'roots'`, `pages === 6`.
  - `treats 404 past the last page as end of section`: стр. 6 → 404 → `errorCount === 0`, 100 товаров.
  - `counts an empty page >1 as an error`: стр. 3 → 200 с `<html></html>` → `errorCount === 1`.
  - `respects concurrency`: счётчик одновременных вызовов фейкового `fetch` при `concurrency: 2` → пик `<= 2`.
- [ ] **Step 2: Новые тесты режимов**
  - `sections mode crawls only listed sections`: `sections: ['/catalog/produkty_pitaniya_/bakaleya/', '/catalog/produkty_pitaniya_/molochnye_produkty/']`; фейковый `fetch` отдаёт фикстуру на корень (меню) и разные id на подразделы → обращений к другим подразделам нет, `mode === 'sections'`, `sections === 2`, `errorCount === 0`, у товаров `sourceCategoryPath` = `['Продукты питания']`.
  - `sections mode flags a section missing from the menu`: путь `/catalog/produkty_pitaniya_/gone/` → `errorCount === 1`, к нему нет запросов.
  - `dedupes a product present in two sections`: оба подраздела отдают один и тот же `data-id` → товар один, `rawPayload.sections` = оба пути по алфавиту.
  - `full mode annotates sections and keeps root path`: `roots: [DANA_SCOPE_ROOTS[0]]`, `full: true` → `mode === 'full'`, у товара из подраздела `rawPayload.sections` непуст, `sourceCategoryPath` = `['Продукты питания']`.
  - `output order is deterministic`: два прогона с фейковым `fetch`, отвечающим со случайной задержкой → одинаковый массив `sourceProductId`.
- [ ] **Step 3:** `pnpm test -- dana` → FAIL.
- [ ] **Step 4:** Реализовать `scrapeDana` по алгоритму выше. `concurrency` по умолчанию `DANA_CONCURRENCY`. В конце `console.log('[DANA] mode <mode>: <targets> targets, <pages> pages, <n> products')`.
- [ ] **Step 5:** `pnpm test && pnpm typecheck` → PASS (в том числе `sync.test.ts`, `bundle.test.ts`, `scope.test.ts`, где есть Dana).
- [ ] **Step 6:** Commit `feat(dana): concurrent crawl with roots/sections/full modes`.

### Task 4: `dana-scope`: расчёт, чтение, запись, CLI `pnpm scope:dana`

**Files:**
- Create: `pipeline/src/mapping/dana-scope.ts`, `pipeline/src/cli/dana-scope.ts`
- Modify: `pipeline/package.json` (скрипт `"scope:dana": "tsx src/cli/dana-scope.ts"`)
- Test: `pipeline/test/dana-scope.test.ts` (по образцу `dina-scope.test.ts`)

**Interfaces:**
- Consumes: `resolveCategory`, `publishCategories`, `mappingDir`, `rawPayload.sections` (Task 3).
- Produces:
  ```ts
  export const DanaScopeSchema // zod: { version: 1, generatedAt: datetime, scope: CategorySlug[],
                               //   root: string, sections: string[] (каждый startsWith(root) и endsWith('/')),
                               //   coveredProducts: int>=0, scopeProducts: int>=0, unsectionedProducts: int>=0 }
  export type DanaScope = z.infer<typeof DanaScopeSchema>
  export const defaultDanaScopePath = () => resolve(mappingDir(), 'dana-scope-sections.json')
  export function computeDanaScope(file: SourceFile, dict: Dictionary, scope: Set<CategorySlug>, generatedAt: string): DanaScope
  export function readDanaScope(path: string, published?: Set<CategorySlug>): string[] | null
  export function writeDanaScope(path: string, s: DanaScope): void
  ```
- `computeDanaScope`: жадное покрытие, как в `computeDinaScope` (выигрыш → меньший размер подраздела → путь по алфавиту). `root = DANA_SCOPE_ROOTS[0].path`. Учитываются только товары с `sourceCategoryPath[0] === 'Продукты питания'`. `unsectionedProducts` = товары scope без единого подраздела (они не покрыты).
- `readDanaScope` повторяет семантику `readDinaScope` (нет файла / битый / пустой `sections` / не хватает опубликованной категории → `null` с `console.warn('[scope:dana] ...')`).
- CLI: `pnpm scope:dana [--in <full dana.json>] [--out <path>]`. По умолчанию `--in` = `data/sources-full/dana.json`. Ошибка, если `storeCode !== 'DANA'` или `sourceStats.mode !== 'full'`. Печатает `[scope:dana] <k> sections, covered <c>/<s> scope products, unsectioned <u>`. **Exit 1, если `unsectionedProducts > 0`** (файл при этом всё равно пишется, чтобы его можно было разобрать). Это защита от молчаливой потери товаров.

- [ ] **Step 1: Тесты** (синтетический `SourceFile` из 4–5 товаров и маленький словарь, как в `dina-scope.test.ts`):
  - `picks the minimal covering sections`: товары scope в `[A]`, `[A,B]`, `[C]`, товар вне scope в `[D]` → `sections` = `[A, C]`, `coveredProducts 3`, `scopeProducts 3`, `unsectionedProducts 0`.
  - `tie-break prefers the smaller section`.
  - `counts scope products without sections`: товар scope с `sections: []` → `unsectionedProducts 1`, `coveredProducts` на 1 меньше `scopeProducts`.
  - `ignores products of other roots`: товар с `sourceCategoryPath ['Бытовая химия']` в scope не учитывается.
  - `readDanaScope` → `null` для: нет файла; невалидный JSON; `sections: []`; `scope` без одной из опубликованных категорий. Иначе возвращает `sections`.
  - `writeDanaScope` → сортирует `sections`, round-trip через `readDanaScope`.
- [ ] **Step 2:** `pnpm test -- dana-scope` → FAIL.
- [ ] **Step 3:** Реализовать модуль и CLI.
- [ ] **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(pipeline): add dana scope sections and scope:dana`.

### Task 5: Подключение: `scrape.ts`, хрупкость, еженедельный скрипт

**Files:**
- Modify: `pipeline/src/cli/scrape.ts` (ветка `DANA`), `pipeline/src/scrape-policy.ts` (`isFragileScrape`), `pipeline/scripts/weekly-full-scrape.sh`
- Test: `pipeline/test/scrape-policy.test.ts`

**Interfaces:**
- Consumes: `readDanaScope`, `defaultDanaScopePath` (Task 4), `resolveDanaConcurrency` (Task 1), `scrapeDana` (Task 3).

- [ ] **Step 1: Тесты политики:**
  - `DANA sections mode with errors is fragile`: `file('DANA', 1, { mode: 'sections', ... })` → `assertCompleteScrape(..., { all: false })` бросает.
  - `DANA roots mode stays tolerant`: `mode: 'roots'` с ошибками не бросает (существующий тест строки 31 обновить, добавив `mode: 'roots'`).
  - `all=true never throws` для DANA `sections`.
- [ ] **Step 2:** `pnpm test -- scrape-policy` → FAIL.
- [ ] **Step 3:** `isFragileScrape`: `if (file.storeCode === 'DANA') return file.sourceStats.mode === 'sections'`. Обновить комментарий над `assertCompleteScrape`.
- [ ] **Step 4:** Ветка `DANA` в `scrape.ts` по образцу `DINA`:
  - `all` → `console.log('[DANA] mode: full (SCRAPE_ALL)')`, `scrapeDana({ full: true, concurrency })`;
  - есть `readDanaScope(defaultDanaScopePath())` → `console.log('[DANA] mode: sections (<k> sections from dana-scope-sections.json, concurrency <c>)')`, `scrapeDana({ sections, concurrency })`;
  - иначе → `console.log('[DANA] mode: legacy root (scope file missing, empty or stale)')`, `scrapeDana({ roots: DANA_SCOPE_ROOTS, concurrency })`.
- [ ] **Step 5:** `weekly-full-scrape.sh`: после строки `pnpm scope:dina ...` добавить `pnpm scope:dana --in ../data/sources-full/dana.json --out ../data/sources-full/dana-scope-sections.candidate.json`. Обновить шапку-комментарий и последнее `echo` (сравнить оба кандидата с `data/mapping/`).
- [ ] **Step 6:** `pnpm test && pnpm typecheck` → PASS; `bash -n scripts/weekly-full-scrape.sh` → без вывода.
- [ ] **Step 7:** Commit `feat(sync): wire dana scope sections into daily and weekly scrapes`.

### Task 6: Локальная проверка на живом сайте и scope-файл (СТОП-гейты)

Все прогоны локальные, без БД и без VPS. Относительные `SOURCES_DIR`/`SYNC_OUT_DIR` считаются от корня репозитория (`src/paths.ts`), а пути в аргументах CLI (`--in`, `sync:compare`) считаются от `pipeline/`. Перед замерами проверить, что сайт отвечает: `curl -s -o /dev/null -w "%{http_code}\n" https://dana-market.kz/catalog/produkty_pitaniya_/` → `200`. Если 500, остановиться и сообщить пользователю (13.10 такое уже было).

**Files:**
- Create: `data/mapping/dana-scope-sections.json` (коммитится, как `dina-scope-categories.json`)
- Рабочие каталоги (в git не попадают, добавить в `.gitignore`, если их там нет): `data/sources-ab/{a,b}/`, `data/sync-ab/{a,b}/`.

- [ ] **Step 1: Базовая линия «до».** Из `main` в отдельном worktree (`git fetch origin && git worktree add ../ab-base origin/main`, затем `pnpm install --frozen-lockfile` в его `pipeline/`) выполнить в его `pipeline/`: `SOURCES_DIR=<abs>/data/sources-ab/a pnpm scrape:dana`, засечь время (`time`). Затем скопировать в `data/sources-ab/a/` свежие `dina.json` и `fix_price.json` (`pnpm scrape:dina`, `pnpm scrape:fixprice` с тем же `SOURCES_DIR`). Worktree удалить после шага.
- [ ] **Step 2: Полный скрап новым кодом:** `SCRAPE_ALL=1 SOURCES_DIR=data/sources-full pnpm scrape:dana`. Ожидается `[DANA] mode: full`, `errors 0`. Записать время и `sourceStats`.
- [ ] **Step 3: Scope:** `pnpm scope:dana`. Ожидается exit 0, `unsectioned 0`, `covered == scope`.
  **СТОП-гейт 1:** если `unsectioned > 0`, остановиться и сообщить пользователю число таких товаров и примеры id. Это значит, что часть товаров корня не лежит ни в одном подразделе, и решение (добавить корень целиком или отказаться от B) принимает пользователь.
  Записать список подразделов и их суммарное число страниц.
- [ ] **Step 4: Ежедневный режим ×3 подряд:** `SOURCES_DIR=data/sources-ab/b pnpm scrape:dana` три раза, каждый раз с `time`. Ожидается `[DANA] mode: sections`, `errors 0`. Записать время каждого прогона.
  **СТОП-гейт 2:** если любой прогон дольше 120 с, или в логе есть `HTTP 429`/`5xx`, остановиться и сообщить с цифрами (без самовольного повышения `DANA_CONCURRENCY`).
- [ ] **Step 5: Fallback-режим:** временно переименовать `data/mapping/dana-scope-sections.json`, запустить один раз → `[DANA] mode: legacy root`, записать время (ожидается ~95 с при concurrency 3), вернуть файл.
- [ ] **Step 6: Сломанный подраздел:** временно дописать в scope-файл несуществующий путь `/catalog/produkty_pitaniya_/zzz_missing/` → `pnpm scrape:dana` завершается exit 1 с `refusing to write`, прежний `data/sources-ab/b/dana.json` не изменён (сравнить `capturedAt`). Вернуть файл (`git checkout`).
- [ ] **Step 7: A/B.** Скопировать `dina.json` и `fix_price.json` из `a/` в `b/` (чтобы отличалась только Dana). Затем:
  ```bash
  SOURCES_DIR=data/sources-ab/a SYNC_OUT_DIR=data/sync-ab/a pnpm sync
  SOURCES_DIR=data/sources-ab/b SYNC_OUT_DIR=data/sync-ab/b pnpm sync
  pnpm sync:compare ../data/sync-ab/a/bundle.json ../data/sync-ab/b/bundle.json
  ```
  Ожидается exit 0, `mismatch ≤ 1%`, `DANA: A≈B`, `priceChanged` ≈ 0. Все `onlyA`/`onlyB` по DANA разобрать (выпал из наличия или дыра в scope) и выписать.
  **СТОП-гейт 3:** exit ≠ 0 или `onlyA` по DANA > 5 → остановиться и сообщить.
- [ ] **Step 8: Полный локальный прогон `daily-sync.sh`** в локальной Docker-БД по процедуре `docs/data/FAST_SYNC_LOCAL_REPORT.md` §5.2–5.3 (никогда не с прод-env). Ожидается код 0, в журнале `[dana] ... exit=0`, общее время прогона записать. Если локальная БД недоступна, пропустить шаг и явно отметить это в отчёте.
- [ ] **Step 9:** `pnpm test && pnpm typecheck` → PASS. Commit `data(mapping): add dana scope sections` (только `data/mapping/dana-scope-sections.json` и, при необходимости, `.gitignore`).

### Task 7: Документация, отчёт, PR (без деплоя)

**Files:**
- Modify: `docs/data/FAST_SYNC_LOCAL_REPORT.md` (новый раздел «10. Dana: подразделы и пул (задача 4.1)»), `docs/data/SYNC_RUNBOOK.md`, `ops/sync/README.md`, `docs/superpowers/specs/2026-10-13-fast-price-sync-design.md` (§6: отметка, что вариант A+B сделан, JSON-адаптер остаётся опцией)

- [ ] **Step 1: Отчёт.** Таблица «до/после» (время Dana: база из Task 6.1, полный, 3 ежедневных прогона, fallback; число страниц/запросов; товаров), вывод `scope:dana`, вывод `sync:compare` дословно, результаты шагов 6.5–6.8, решение по `Crawl-delay: 3` (осознанно игнорируется, по решению пользователя 2026-10-16, параллельность ≤4). Отдельной строкой: приёмка на VPS (3 прогона ≤120 с) ещё не выполнена.
- [ ] **Step 2: Runbook/README.** Строка про режимы Dana (`[DANA] mode: ...`), `DANA_CONCURRENCY` (по умолчанию 3, максимум 4, снижение до 1 в случае 429/5xx от Dana), еженедельный кандидат `data/sources-full/dana-scope-sections.candidate.json` и процедура его обновления (по образцу блока Dina в `ops/sync/README.md` строки ~70–80), новый смысл exit 3 для Dana (упал подраздел → прошлый файл).
- [ ] **Step 3:** Проверка, что секретов нет: `git diff main --stat` и поиск по добавленным строкам (`git diff main | grep -iE "password|secret|postgres://|token"` → пусто).
- [ ] **Step 4:** Commit `docs(sync): dana sections scope and concurrency`, push ветки, PR в `main` с описанием (цифры из отчёта, ссылка на этот план, чеклист приёмки VPS). PR **не мержить**.
- [ ] **Step 5: СТОП. Конец Фазы 1.** Отправить пользователю один итоговый отчёт: ссылка на PR, таблица «до/после», результаты стоп-гейтов, что будет сделано на проде (Task 8). Закончить ход и **ждать сообщения «Заливай на прод»**. Любое другое сообщение (вопрос, правка) обработать в рамках Фазы 1, к Task 8 не переходить.

### Task 8: Production (Фаза 2, только после «Заливай на прод»)

Начинать только после сообщения пользователя «Заливай на прод». Реквизиты и команды: `C:\Users\ADMIN\aktau-handoff\FAST_SYNC_HANDOFF.md` §3–4 (`backend2`, доступ из `C:\Development\AdilBaga\secrets\REPORT.md`, значения в чат и документы не копировать). `sudo` у `backend2` действует до **2026-10-20 20:06:31 UTC**: если срок истёк, остановиться и сообщить.

- [ ] **Step 1: Предусловия.** PR влит в `main` владельцем (`gh pr view <N> --json state,mergeCommit` → `MERGED`). Если не влит, остановиться и сообщить, самому не мержить. Записать merge-коммит.
- [ ] **Step 2: Preflight на VPS, непосредственно перед изменением (не раньше чем за 5 мин):** `systemctl list-timers --all | grep aktau` (до ближайшего `aktau-sync.timer` больше 15 мин, иначе дождаться его окончания); `systemctl is-active aktau-sync` → `inactive`; `sudo -H -u aktau-sync git -C /opt/aktau-sync rev-parse HEAD` записать как точку отката; `git status --short` пусто.
- [ ] **Step 3: Обновить код:** `sudo -H -u aktau-sync git -C /opt/aktau-sync pull --ff-only`, затем при изменении lock `pnpm install --frozen-lockfile` в `pipeline/` от `aktau-sync`. Сверить юниты: `cmp` файлов `ops/sync/*.service/.timer` с `/etc/systemd/system/` (в этом PR юниты не меняются; при расхождении остановиться и сообщить). `DANA_CONCURRENCY` в `/etc/aktau-sync.env` не добавлять (по умолчанию 3). Убедиться, что `data/mapping/dana-scope-sections.json` есть в checkout.
- [ ] **Step 4: Без ручных публикаций.** `daily-sync.sh` и `systemctl start aktau-sync` вручную не запускать: проверка идёт на плановых прогонах (01:00 и 13:00 UTC).
- [ ] **Step 5: Проверка трёх плановых прогонов подряд** (журнал по `FAST_SYNC_HANDOFF.md` §4; время в `--since` указывать с `UTC`, сервер в +05): `[DANA] mode: sections`, `[sync] dana exit=0 took=<t>s` с `t ≤ 120`, `Result=success`, `ExecMainStatus=0` (не 3), новый snapshot опубликован, у Dana `rawCount` в пределах ±1% от 1185.
- [ ] **Step 6: При сбое** (exit ≠ 0, Dana > 120 с в двух прогонах, 429/5xx от Dana, падение `rawCount`): `sudo systemctl disable --now aktau-sync.timer`, сообщить пользователю с выдержкой журнала. Без «лечения» повторными публикациями. Откат кода (`git checkout` на точку из Step 2) только по решению пользователя.
- [ ] **Step 7: Отчёт.** Дописать в `docs/data/FAST_SYNC_LOCAL_REPORT.md` §9 «Production» замеры трёх прогонов и дословную цитату «Заливай на прод» с датой. Отдельный PR с документом, мержит владелец. Обновить `C:\Users\ADMIN\aktau-handoff\FAST_SYNC_HANDOFF.md` §8 п. 4 (4.1 закрыта, цифры).

## Критерии приёмки (сводка)

- Локально: 3 ежедневных прогона Dana ≤120 с (ожидание ~50–70 с), `scope:dana` с `unsectioned 0`, `sync:compare` ≤1%, `pnpm test`/`typecheck` зелёные, fallback и «сломанный подраздел» проверены.
- `sourceProductId` = `dana_<id>`, `sourceCategoryPath` = `['Продукты питания']`, как раньше.
- На VPS после деплоя: время Dana ≤120 с в трёх подряд плановых прогонах (`[full] dana exit=0 took=…` / журнал `aktau-sync`). Это Task 8, только после «Заливай на прод».
