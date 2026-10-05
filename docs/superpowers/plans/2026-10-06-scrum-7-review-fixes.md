# SCRUM-7: исправления по ревью Дениса (B1–B4, CI, категории) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Отвечай пользователю на русском.

**Goal:** Закрыть замечания внешнего ревью Дениса (2026-10-06) в ветке `feat/scrum-7-data`, прогнать полный локальный цикл, обновить отчёт и открыть **новый Draft PR в `integrate/full-stack`**. После этого STOP для ревью.

**Architecture:** Исправления делаются в офлайн-пакете `pipeline/`: словарь, правила публикации, sync. В миграции таксономии — только данные. API Go (Backend1) **не менять**. Если без изменения API не обойтись — описать предложение и остановиться (Task 2).

**Tech Stack:** Node 24, pnpm 10.32.1, vitest, zod; Go 1.27.1; Docker `postgres:17-alpine` (тестовая БД); GitHub Actions.

**Контекст (прочитать перед стартом):**
- `docs/data/SCRUM-7_REPORT.md` — что сделано и метрики.
- `docs/data/SCRUM-7_HANDOFF_AGENT.md` — устройство ветки, блокеры B1–B6.
- `docs/superpowers/plans/2026-10-05-scrum-7-anvar-full-catalog.md` — исходный план (Phase A/A2).
- `docs/data/SYNC_RUNBOOK.md`, `backend-go/scripts/local-ingest-db.sh`.

## Решения владельца (Денис, 2026-10-06) — обязательны

1. **Охват публикации:** `milk, dairy, eggs, bread, meat, vegetables, groats, sugar, oil`. Полный словарь (21k товаров) сохраняется, но весь каталог не публикуется.
2. **Pending:** вариант (б). Любой кросс-сетевой матч со статусом `pending` публикуется **отдельными карточками**, пока не получит `approved`. Ложные объединения недопустимы.
3. **B2:** сначала разделить в словаре несовместимые группы «весовой vs штучный» и ложные группы. Исключать variable-weight из spreads — только дополнительно.
4. **Quality thresholds пока НЕ фиксировать.** Сначала B1/B2/B3, затем новый полный локальный прогон и новые метрики; пороги согласуем после.
5. **`agent:new` и Анвар (Phase B)** — отложены до первого стабильного production N+1.
6. **Production НЕ трогать.** Никакого ingest LOGIN в Supabase, dry-run или apply в проде — только после merge и отдельного одобрения владельца.

## Global Constraints

- Ветка `feat/scrum-7-data`. **Не `main`. Не merge. Не production apply.**
- LLM не вызывать. Все правки словаря детерминированы и проходят ревью в git.
- Формат `sourceProductId` у адаптеров не менять: на нём держится словарь.
- Go API (`backend-go/internal/postgres/*`, `httpapi/*`) и OpenAPI-контракт не менять без STOP и одобрения Дениса/Backend1.
- Имя required check **`CI Gate`** не менять.
- Не коммитить `pipeline/.env`, `data/sources/`, `data/agent/`, `data/sync/`, `*.har`, дампы.
- Файлы `data/sources/*.json` и `data/agent/classified.json` есть только локально на этой машине (их нет в git). Они нужны для Task 3 и 5.

## Review Focus

1. Pending-пара после sync всё равно оказалась в одной карточке → тест в Task 4 и SQL-проверка в Task 7.
2. Соль снова попала в корзину «сахар» → тест в Task 3 и проверка корзины в Task 7.
3. Весовой товар Dina (цена за кг) склеен со штучным товаром Dana/Fix Price → тест в Task 5 и топ spreads в Task 7.
4. Фронт получает категории с пустыми страницами → Task 2.
5. CI Gate проходит, хотя pipeline-тесты упали (джоба Pipeline Quality не попала в `needs`) → Task 1.

---

### Task 0: Подготовка ветки

- [ ] **Step 1.** Закоммитить этот план первым коммитом:
  `git add docs/superpowers/plans/2026-10-06-scrum-7-review-fixes.md && git commit -m "docs(plan): SCRUM-7 review fixes plan"`
- [ ] **Step 2.** `git fetch origin` и проверить, что в `origin/integrate/full-stack` уже есть **Part14** от Дениса: `git log origin/integrate/full-stack --oneline -15`, искать коммит про Part 14 / Cloudflare / network perimeter. **Если Part14 ещё нет — STOP, сообщить пользователю и ждать.**
- [ ] **Step 3.** `git merge --no-edit origin/integrate/full-stack`. При конфликтах — STOP и описать их.
- [ ] **Step 4.** Базовая проверка: `cd pipeline && pnpm test && pnpm typecheck`, `cd backend-go && go test ./... && go vet ./... && gofmt -l .` (вывод пустой). Всё должно быть зелёным до начала правок.

### Task 1: CI — джоба Pipeline Quality

**Files:** Modify `.github/workflows/ci.yml`; при необходимости `scripts/ci/run-checks.mjs`.

- [ ] **Step 1.** Прочитать `.github/workflows/ci.yml` и `scripts/ci/run-checks.mjs`. Остальные джобы запускают проверки через `node scripts/ci/run-checks.mjs <name>`. Если в скрипте есть реестр проверок, добавить в него `pipeline` с командами ниже; если такого реестра нет, использовать прямые `run`.
- [ ] **Step 2.** Добавить джобу по образцу `frontend` (те же pinned-версии `actions/checkout` и `actions/setup-node`, `persist-credentials: false`, `node-version: '24.10.0'`, corepack с `pnpm@10.32.1`):
  ```yaml
  pipeline:
    name: Pipeline Quality
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      # checkout / setup-node / corepack — скопировать из джобы frontend без изменений
      - run: pnpm install --frozen-lockfile
        working-directory: pipeline
      - run: pnpm test
        working-directory: pipeline
      - run: pnpm typecheck
        working-directory: pipeline
  ```
- [ ] **Step 3.** В джобе `gate` (`name: CI Gate`, имя не менять):
  - в `needs:` добавить `pipeline`;
  - в проверке `Object.keys(jobs).length!==7` заменить **7 на 8**. Иначе гейт упадёт даже при зелёных джобах.
- [ ] **Step 4.** Проверить YAML: `node -e "require('yaml')"` может не быть, поэтому лучше `npx --yes yaml-lint .github/workflows/ci.yml` или разбор через `npx --yes js-yaml`. Отдельно убедиться, что `pipeline/pnpm-lock.yaml` закоммичен и `pnpm install --frozen-lockfile` проходит локально.
- [ ] **Step 5.** Commit: `ci: add Pipeline Quality job to CI Gate`.

### Task 2: Категории — фронт не должен получить 22 категории с пустыми страницами

**Проблема.** Миграция `backend/prisma/migrations/20261006000000_catalog_taxonomy/migration.sql` вставляет 22 строки в `public.categories`. Go `ListCategories` (`backend-go/internal/postgres/categories.go:12`) отдаёт **все** строки (`SELECT id,slug,name FROM public.categories`), поэтому `PUBLISH_CATEGORIES` это не ограничивает.

**Минимальное совместимое решение без изменения API:**
- [ ] **Step 1.** Изменить миграцию: вставлять/обновлять **только слаги охвата** (`milk, dairy, eggs, bread, meat, vegetables, groats, sugar, oil`). Убрать строки `fish, sausages, canned, sauces, sweets, tea-coffee, drinks, frozen, baby, household, hygiene, home`, а также вставку `other`. Миграция ещё не применялась в production, поэтому её можно править.
  - Ingest требует строку в `categories` только для категорий, реально присутствующих в bundle, а bundle уже фильтруется по `PUBLISH_CATEGORIES`. Словарь и таксономия в коде (`pipeline/src/agent/taxonomy.ts`) при этом остаются полными: им строка в БД не нужна.
  - В той же миграции: `UPDATE public.categories SET name='Сахар' WHERE slug='sugar'` (см. Task 3).
- [ ] **Step 2.** Тест `pipeline/test/taxonomy.test.ts`: заменить «migration inserts every taxonomy slug» на два теста:
  - миграция содержит **каждый** слаг из `DEFAULT_PUBLISH_CATEGORIES` (`pipeline/src/mapping/scope.ts`);
  - миграция **не содержит** ни одного слага вне охвата (кроме легаси `other`, которого в миграции быть не должно вообще).
- [ ] **Step 3.** Защита от рассинхрона: в `pipeline/src/cli/sync.ts` и `cli/match.ts` при старте падать с понятной ошибкой, если в `PUBLISH_CATEGORIES` есть слаг, которого нет в миграции. Проще всего — общий список в `scope.ts` и тест, сверяющий его с SQL.
- [ ] **Step 4. Оставшаяся дыра — STOP-пункт.** В production уже есть легаси-категория `other`: её создал baseline, на неё ссылаются старые canonical. После публикации нового snapshot `other` будет пустой, но `/api/categories` её отдаст. Удалить строку нельзя: FK `canonical_products.categoryId ON DELETE CASCADE` удалит историю baseline. **API не менять.** Записать в отчёт и в описание PR предложение для Backend1:
  > Предложение: `ListCategories` возвращает только категории, у которых есть `inStock` оффер с `price>0` в текущем published snapshot (тот же `EXISTS`, что уже используется в `discoverySQL`, `categories.go:69-74`). Это изменение семантики API v1, нужно одобрение Backend1/Дениса. До этого `other` в production будет пустой страницей.

  На тестовой БД проверить фактический список `/api/categories` после прогона (Task 7) и записать его в отчёт.
- [ ] **Step 5.** Commit: `fix(data): taxonomy migration inserts only published categories`.

### Task 3: B1 — соль не должна попадать в корзину «сахар»

**Причина.** Категория `sugar` = «Сахар и соль»; слот корзины `dashboard.go:26` берёт самый дешёвый товар категории `sugar` с `weightGrams=1000`, и это оказалась соль.

**Решение без изменения Go:** вынести соль в новый слаг `salt` («Соль»). Он **не входит** в охват публикации, поэтому строка в БД ему не нужна.

- [ ] **Step 1. Тест** `pipeline/test/salt.test.ts`:
  - после применения правок словаря ни одна карточка `sugar` не имеет названия, подходящего под `/\b(соль|соли|тұз)\b/i`, если в названии нет слова «сахар»;
  - соляные карточки получают категорию `salt`;
  - `salt` есть в `CATEGORIES` и отсутствует в `DEFAULT_PUBLISH_CATEGORIES`.
  Тест работает на маленькой фикстуре словаря, а не на реальном файле.
- [ ] **Step 2.** `pipeline/src/agent/taxonomy.ts`: добавить `{ slug: 'salt', name: 'Соль', filters: [size('weightGrams','Вес')] }`; у `sugar` сменить название на «Сахар».
- [ ] **Step 3.** Механизм правок словаря (переиспользуется в Task 5) — `pipeline/src/mapping/overrides.ts`:
  - тип `Overrides = { version: 1; moveCategory: { key: string; to: CategorySlug; reason: string }[]; split: { key: string; ids?: string[]; reason: string }[] }`;
  - `applyOverrides(dict, overrides): Dictionary` — идемпотентно; `split` выносит указанные id (или всех участников) в отдельные карточки с ключом `canonicalKey([id])`, тем же названием, брендом, категорией и атрибутами, `method:'deterministic'`, `confidence:1`, `review:'approved'`;
  - CLI `pnpm dict:apply` читает `data/mapping/overrides.json` (**коммитится в git**, каждая правка с `reason`) и перезаписывает `dictionary.json` через `writeDictionary`.
  - Тесты: идемпотентность (двойное применение даёт тот же файл); после `split` каждый id указывает на существующую карточку; неизвестный ключ в overrides — ошибка.
- [ ] **Step 4.** Сгенерировать `moveCategory` для соли одноразовым скриптом (не коммитить): взять карточки `sugar` из словаря, `productType` из локального `data/agent/classified.json` (тип содержит «соль») плюс regex по названию. Список записать в `overrides.json`, глазами просмотреть 100% записей (их немного) и удалить ложные.
- [ ] **Step 5.** `pnpm dict:apply`, `pnpm test`, commit: `fix(data): move salt out of sugar category (B1)`.

### Task 4: B3 — pending-матчи публикуются отдельными карточками

- [ ] **Step 1. Тест** `pipeline/test/publish.test.ts` для новой функции `isolateForPublish(clusters: Cluster[]): Cluster[]` (`pipeline/src/mapping/publish.ts`):
  - кластер из 2+ участников с `review:'pending'` превращается в N одиночных кластеров;
  - у каждого из них `review:'pending'`, `method` и `confidence` исходные, а название и атрибуты карточки те же;
  - `approved`-кластеры не меняются;
  - одиночные кластеры не меняются.
- [ ] **Step 2.** Применить `isolateForPublish` в **обоих** путях публикации: `pipeline/src/cli/match.ts` (bundle агента) и `pipeline/src/sync/sync.ts` (`buildSyncBundle`, перед `buildBundle`).
  - **Словарь не менять:** pending-группа хранится целиком, чтобы после ревью её можно было одобрить сменой `review` на `approved` в overrides.
  - Добавить в `Overrides` раздел `approve: { key, reason }[]`.
- [ ] **Step 3.** Тест в `sync.test.ts`: известная pending-группа после `buildSyncBundle` даёт отдельные карточки, у каждой ровно один магазин.
- [ ] **Step 4.** Учесть для Task 7: на тестовой БД pending-пары раньше публиковались объединёнными. Первый ingest после изменения пройдёт только с `-recluster` (split), а следующий `sync` — уже в строгом режиме с `newCanonicalCount: 0`.
- [ ] **Step 5.** Commit: `fix(pipeline): publish pending cross-store matches as separate cards (B3)`.

### Task 5: B2 — разделить «весовой vs штучный» и ложные группы

- [ ] **Step 1. Признак весового товара** — `isVariableWeight(storeCode, product: SourceProduct): boolean` в `pipeline/src/mapping/weight.ts`:
  - Dina: `rawPayload.price_type === 'weight' || rawPayload.isWeightProduct === true` (см. `scrapers/dina.ts:38`);
  - Dana и Fix Price: сначала **исследовать** локальные `data/sources/dana.json` и `fix_price.json` — есть ли признак цены за кг (поле, «за кг»/«/кг» в названии или цене). Найденное правило и примеры записать в отчёт. Если признака нет — `false`.
  - Тест на фикстурах.
- [ ] **Step 2. Правило публикации (guard):** в `isolateForPublish` (Task 4) дополнительно — если в группе есть хотя бы один весовой и хотя бы один штучный участник, весовые выносятся в отдельные карточки. Тест: Dina весовые «Огурцы» (за кг) + Dana «Огурцы 1 шт» → две карточки. Группа из двух весовых товаров разных сетей (обе цены за кг) остаётся объединённой.
- [ ] **Step 3. Правка словаря:** одноразовый скрипт находит такие смешанные группы по локальным `data/sources/*.json` и пишет `split` в `overrides.json` с `reason: "weight-vs-piece"`. `pnpm dict:apply`.
- [ ] **Step 4. Ложные группы:** на тестовой БД после Task 7 Step 3 (или по bundle) выгрузить **топ-100 по `differencePercent`** из `/api/dashboard` `priceSpreads` (или SQL `spreads`) с названиями всех участников. Пройти глазами. Каждую ложную группу (разные товары, разный вес/фасовка, как Colgate или Kinder 3,5 кг из отчёта) записать в `overrides.json` как `split` с `reason`. Повторять, пока в топ-100 не останется ложных.
- [ ] **Step 5.** Дополнительное исключение variable-weight из spreads в Go **не делать**: после Step 2–3 весовые товары не попадают в кросс-сетевые группы со штучными, поэтому в spreads их не будет. Если Денис захочет отдельный фильтр в `dashboard.go` — это изменение Backend1, предложить в PR.
- [ ] **Step 6.** `pnpm test`, commit: `fix(data): split weight-vs-piece and false canonical groups (B2)`.

### Task 6: B4 — ручная сверка цен

- [ ] **Step 1.** Для каждой сети выбрать 3 случайных товара из опубликованного охвата (из `data/sync/bundle.json`).
- [ ] **Step 2.** Открыть `sourceUrl` во встроенном браузере (built-in browser; для Fix Price — с городом Актау; для Dina — магазин Актау, 33 мкр) и сравнить цену на сайте с ценой в bundle. Для весовых Dina учесть приведение к цене за кг.
- [ ] **Step 3.** Таблицу из 9 строк (сеть, товар, цена сайта, цена в bundle, совпало/нет, время) записать в `docs/data/SCRUM-7_REPORT.md`. При расхождении — STOP и выяснить причину до продолжения.

### Task 7: Полный локальный прогон и проверки

- [ ] **Step 1.** `cd pipeline && pnpm test && pnpm typecheck`; `cd backend-go && go test ./... && go vet ./... && gofmt -l .` (пусто).
- [ ] **Step 2.** Тестовая БД с нуля: `bash backend-go/scripts/local-ingest-db.sh` (применяет миграции, включая исправленную taxonomy).
- [ ] **Step 3.** Свежие данные и bundle: `pnpm scrape:dina && pnpm scrape:dana && pnpm scrape:fixprice && pnpm sync`.
  - Ingest: dry-run с `-recluster` → `-apply`.
  - Затем повторный `pnpm sync` и строгий dry-run без `-recluster`: ожидается `newCanonicalCount: 0`.
- [ ] **Step 4.** Поднять Go API на тестовой БД (по `backend-go/README.md`), смоук `/api/categories`, `/api/products?category=milk`, `/api/dashboard` (200, непустые данные). Список категорий записать в отчёт (Task 2 Step 4).
- [ ] **Step 5. Pending isolation (SQL на тестовой БД):** в текущем snapshot нет canonical, у которого офферы из 2+ сетей и хотя бы один маппинг `reviewStatus='pending'`. Ожидаемо — 0 строк.
- [ ] **Step 6. Корзина «сахар»:** в `/api/dashboard` `baskets[].items` со слотом `sugar` у каждой сети — сахар (не соль) весом 1 кг.
- [ ] **Step 7. Top spreads:** топ-20 `priceSpreads` глазами — нет весовых против штучных и нет ложных групп.
- [ ] **Step 8.** Собрать новые метрики (как в отчёте §3) из вывода `pnpm sync` (отчёт качества) и SQL по тестовой БД. **Пороги не фиксировать** (решение 4).

### Task 8: Отчёт, push, Draft PR, STOP

- [ ] **Step 1.** Обновить `docs/data/SCRUM-7_REPORT.md`: решения владельца, что исправлено (B1–B4, CI, категории), новые метрики, сверка цен, список `/api/categories`, предложение по `other` (Task 2 Step 4), что осталось (пороги, `agent:new`, Анвар, production).
- [ ] **Step 2.** Обновить `SCRUM-7_HANDOFF_AGENT.md` и `SCRUM-7_HANDOFF_DENIS.md`: B1–B4 закрыты, B5 ждёт метрик, B6 — после merge.
- [ ] **Step 3.** Commit и `git push origin feat/scrum-7-data`.
- [ ] **Step 4. Новый Draft PR** `feat/scrum-7-data → integrate/full-stack` (**base НЕ main**). `gh` на этой машине может быть не авторизован (`gh auth status`):
  - если авторизован — `gh pr create --draft --base integrate/full-stack --head feat/scrum-7-data ...`;
  - если нет — дать пользователю ссылку `https://github.com/kiratonine/AdilBaga/pull/new/feat/scrum-7-data`, готовые заголовок и описание и инструкцию выбрать `base: integrate/full-stack` и «Create draft pull request»; после создания проверить через `https://api.github.com/repos/kiratonine/AdilBaga/pulls`, что base — `integrate/full-stack`, а `draft: true`.
  В описании PR: ссылки на отчёт и handoff, список исправлений, предложение по `/api/categories` (`other`), явное «Не мержить. Не production apply».
- [ ] **Step 5. STOP.** Сообщить пользователю итог и ждать ревью Дениса. Production, merge, `agent:new`, Анвар — не трогать.
