# SCRUM-7 — передача работы ИИ-агенту (Phase A / A2)

Документ для ИИ-агента Дениса Андерсена. Цель: понять, что сделано в ветке `feat/scrum-7-data`, провести ревью, подготовить её к merge и закрыть блокеры перед загрузкой в production. Сводка для человека — `SCRUM-7_HANDOFF_DENIS.md`, отчёт с метриками — `SCRUM-7_REPORT.md`, план — `docs/superpowers/plans/2026-10-05-scrum-7-anvar-full-catalog.md`.

## 1. Контекст и правила (решения команды)

- **Jira:** SCRUM-7 (эпик SCRUM-5), город — только Актау.
- **LLM — только разовый этап разработки.** `agent:classify` и `agent:match` уже выполнены, результат лежит в `data/mapping/dictionary.json`. Регулярное обновление (`pnpm sync`) **не должно** вызывать LLM и требовать `GEMINI_API_KEY*`. Это закреплено тестом `sync code never touches the LLM`.
- **Источник истины для сопоставлений — словарь в git.** Ключ — `STORE:sourceProductId`. `sourceProductId` обязан быть стабильным между запусками; смена адаптера не должна менять формат id (`dana_<bitrixId>`, `fp_<id>`, id Dina).
- **Публикация** — только через Go `cmd/ingest`: staging → gates → атомарный publish, advisory lock. Prod-apply требует `INGEST_PRODUCTION_APPLY_CONFIRM=1` и **выполняется только владельцем** (Денисом).
- **Не коммитить:** `pipeline/.env`, `*.har`, `data/sources/`, `data/agent/`, `data/sync/`, дампы прода.

## 2. Состояние ветки

- **Ветка:** `feat/scrum-7-data`, ответвлена от `integrate/full-stack` (`75d57d1`). Содержит 25 коммитов (`ce84de3..a6b6ccb`), 65 файлов, +58k строк; из них ~5,5 МБ — словарь `data/mapping/dictionary.json`.
- **Ветка не запушена.** `origin/integrate/full-stack` ушёл вперёд на 3 коммита (`7b8c925` observability, `b9ef533` CI release gates, `5f59e04` perf baseline). `git merge-tree` показывает **0 конфликтов**.
- **Проверено 2026-10-06 на Windows:**
  - `cd pipeline && pnpm test` → 16 файлов, **68/68 PASS**;
  - `pnpm typecheck` → OK;
  - `cd backend-go && go test ./...` → все пакеты OK.

### Что внутри

| Компонент | Файлы |
|---|---|
| Контракт файла источника (zod, атомарная запись, отказ на 0 товаров и дубли id) | `pipeline/src/types.ts`, `source-file.ts`, `http.ts` |
| Адаптеры: Dina (GraphQL `shop_id=28`, обход по `category_id`), Dana (Bitrix HTML, `PAGEN_1`), Fix Price (`api.fix-price.kz`, `x-city: 1594`, `x-country: 3`; запасной вариант — HAR) | `pipeline/src/scrapers/*`, `docs/data/FIXPRICE_SOURCE.md` |
| Разовый LLM-этап: regex-атрибуты, таксономия (22 слага), классификация, блокировка кандидатов, кластеризация + guards | `pipeline/src/agent/*` |
| Миграция таксономии (data-only, идемпотентная) | `backend/prisma/migrations/20261006000000_catalog_taxonomy/` |
| Bundle v1.0 для Go + отчёт качества + Go-тест совместимости | `pipeline/src/agent/bundle.ts`, `backend-go/internal/ingestion/testdata/pipeline_bundle.json` |
| Словарь (строится из bundle; одна запись — одна строка) | `pipeline/src/mapping/dictionary.ts`, `data/mapping/dictionary.json` |
| Охват публикации (`PUBLISH_CATEGORIES`, по умолчанию 9 продуктовых слагов) | `pipeline/src/mapping/scope.ts` |
| Ежедневный sync без LLM + скрипт + runbook | `pipeline/src/sync/sync.ts`, `src/cli/sync.ts`, `scripts/daily-sync.sh`, `docs/data/SYNC_RUNBOOK.md` |
| Go: `resolve(..., recluster)` + флаг `cmd/ingest -recluster` (детерминированные merge/split карточек) | `backend-go/internal/ingestion/plan.go`, `ingestor.go`, `cmd/ingest/main.go` |
| Тестовая БД (postgres:17, схема и роли как в Supabase, «лёгкий» слепок прода) | `backend-go/scripts/local-ingest-db.sh`, `make-lite-baseline.mjs` |

### Как разметка получилась

- 21 494 товара классифицированы Gemini; 0,4% ушли в fallback `other`.
- 1 444 блока кандидатов размечены так: 319 — Gemini, 1 125 — Claude Sonnet. Все ответы проверены скриптом (каждый id ровно один раз, нет двух товаров одной сети в группе); выборка из 40 групп и пилотная пачка проверены вручную.
- Кэш LLM — `data/agent/cache` (не в git); `agent:match` из кэша воспроизводим за ~1 с.

## 3. Задачи для агента — по порядку

### 3.1. Подготовить ветку к ревью (можно сразу)
1. `git fetch && git merge origin/integrate/full-stack` в `feat/scrum-7-data` (конфликтов быть не должно), прогнать `pnpm test`, `pnpm typecheck`, `go test ./...`, `go vet ./...`, `gofmt -l .`.
2. Проверить, что новые CI release gates (`b9ef533`) проходят на ветке. Пакета `pipeline/` в CI, скорее всего, нет — добавить job `pnpm install --frozen-lockfile && pnpm test && pnpm typecheck` для `pipeline/`.
3. Push и **draft** PR `feat/scrum-7-data → integrate/full-stack`. Не мержить и не загружать в прод до закрытия пунктов 3.2.

### 3.2. Блокеры перед загрузкой в production

**[ЗАКРЫТ — слаг `salt`, 13 карточек перенесены через overrides] B1. Слот корзины «сахар» выбирает соль.**
- Причина: `backend-go/internal/postgres/dashboard.go:26` берёт самый дешёвый товар категории `sugar` с `weightGrams=1000`, а `sugar` = «Сахар и соль».
- Исправление: отдельный слаг `salt` в `pipeline/src/agent/taxonomy.ts` плюс новая data-миграция; соляные карточки перенести в `salt` в словаре (тип товара есть в `data/agent/classified.json`, поле `productType`), затем перегенерировать bundle.
- Тест: в корзине по слоту `sugar` — только сахар.

**[ЗАКРЫТ — guard весовой/штучный + разделение словаря (22 split)] B2. Выбросы в разбросе цен** (`dashboard.go:22`, CTE `spreads`).
- Причина 1: весовые товары Dina (`price_type=weight` / `isWeightProduct`, `pipeline/src/scrapers/dina.ts:38`) приводятся к цене за кг, а у Dana/Fix Price те же позиции могут продаваться поштучно.
- Причина 2: единичные ложные совпадения (Colgate, Kinder 3,5 кг).
- Исправление:
  - помечать весовые товары в `rawPayload` и не допускать их в кросс-сетевые группы (guard в `match.ts` / правка словаря) или исключать из `spreads`;
  - вручную пройти топ-100 разбросов на тестовой БД и разделить ложные группы в словаре;
  - после правки словаря запускать ingest с `-recluster`.

**[ЗАКРЫТ — вариант (б), `isolateForPublish`] B3. `pending`-сопоставления видны на сайте как подтверждённые.**
- ~290 маппингов с уверенностью 0.80–0.949 публикуются вместе с офферами (`ingestor.go:350` вставляет оффер для каждого участника), а SQL каталога и дашборда `reviewStatus` не учитывает.
- Нужно решение Дениса:
  - (а) ручное ревью ~290 пар с правкой словаря;
  - (б) публиковать `pending`-участников отдельными карточками до ревью — это изменение в `buildBundle`/`sync`, без смены API.
- Рекомендация — (б) сейчас, (а) постепенно.

**[ЗАКРЫТ — source/API-верификация контекста Актау: Dina `shop(id:28)` 5/5, Fix Price `x-city:1594` 3/3, Dana 3/3; отчёт §9. UI сайтов Dina и Fix Price оставался на другом городе] B4. Ручная сверка цен не выполнена.** Сверить по 3 цены на сеть с сайтами (Актау) и записать в отчёт.

**[РЕШЕНО — новые абсолютные пороги не вводятся; метрики отчёта §10 — review baseline; fail-closed проверки ingest и явный `INGEST_MAX_STORE_DROP_PERCENT=10` оператором; перечень проверок перед N+1 — отчёт §12] B5. Пороги quality gates для узкого охвата.** Пороги плана посчитаны на весь каталог. Для 9 продуктовых категорий их нужно согласовать с Денисом и записать в отчёт.

**[ОТЛОЖЕН — только владелец, после merge, интеграционного CI, ребейзлайна полного стека и явного разрешения; не создавать LOGIN и роли сейчас] B6. Учётка ingest для production PostgreSQL** (в старых документах «Supabase» — legacy-термин; актуальная цель — действующая production БД приложения, по актуальному состоянию Neon). Нужен LOGIN-пользователь, член `aktau_ingest_writer` без `SET`, не владелец таблиц: так требует проверка в `cmd/ingest/main.go`.
- Создаёт владелец: `backend/prisma/security/aktau_ingest_writer_role.sql`.
- Затем миграция `20261006000000_catalog_taxonomy` в Supabase, dry-run `cmd/ingest -recluster`, и `-apply` только после «ок» Дениса.

### 3.2.1. Approved Backend 1 post-merge integration tasks (не делать в SCRUM-7)

- `GET /api/categories` возвращает только категории с `inStock` оффером `price>0` в последнем published snapshot (Go + Nest reference + parity-тесты + OpenAPI/API_V1_CONTRACT). Фронт не меняется.
- Подпись слота корзины `sugar`: «Сахар и соль» → «Сахар» (`dashboard.go`, `backend/src/dashboard/basket-config.ts`, тесты, фикстуры фронта, документы с прежней подписью).
- `salt` не добавлять в production `categories`, пока он не входит в публикуемый охват.

### 3.2.2. CI (исправлено после ревью PR #4)

`scripts/ci/postgres.mjs`: точная цепочка миграций теперь из 4 (включая `20261006000000_catalog_taxonomy`); засеянные миграцией категории очищаются перед загрузкой INSERT-only фикстуры (`TRUNCATE categories CASCADE` в CI-хелпере `load` и в `catalog_test.go`). Проверка не ослаблена, подробности — отчёт §13.

### 3.3. Улучшения после прода (не блокируют)
- **Фильтр охвата по типу товара, а не по категории.** Сейчас в `bread` попадают торты, в `dairy` — пудинги. Нужно сохранить `productType` в `DictionaryCanonical` (`pipeline/src/mapping/dictionary.ts`) и вести белый список типов в `scope.ts`.
- **Картинки.** Покрытие в охвате 85,9%: у ~22% товаров Dina нет изображений в API. Можно брать картинку с карточки товара Dina или у другой сети в группе.
- **Task 17.** Проверить в DevTools, нет ли у Dana JSON API. Если есть — новый адаптер **с теми же id** `dana_<bitrixId>`.
- **Task 18 — `agent:new`.** Еженедельная обработка `data/sync/unmapped.json`; агента выбирает Денис. Контракт описан в плане.
- **Расписание `daily-sync.sh`.** systemd timer на сервере из SCRUM-8; примеры — в `SYNC_RUNBOOK.md`.
- **Phase B — Анвар** (Task 12–14 плана). Разведка API мобильного приложения через mitmproxy, затем `ANVAR` в enum, Go, OpenAPI и фронте.

## 4. Как проверить локально

```bash
git checkout feat/scrum-7-data
cd pipeline && pnpm install --frozen-lockfile && pnpm test && pnpm typecheck
cd ../backend-go && go test ./...
# тестовая БД + публикация (нужен Docker):
bash backend-go/scripts/local-ingest-db.sh
cd pipeline && pnpm scrape:dina && pnpm scrape:dana && pnpm scrape:fixprice && pnpm sync
cd ../backend-go && APP_ENV=development INGEST_MAX_STORE_DROP_PERCENT=10 INGEST_DATABASE_URL=<из скрипта> \
  go run ./cmd/ingest -bundle ../data/sync/bundle.json        # dry-run; -apply для записи
```

Ожидаемо на свежих данных: `unmapped` — единицы товаров, dry-run без `failureCode`, `reusedCanonicalCount` ≈ `canonicalCount`.

## 5. Чего не делать

- Не запускать `cmd/ingest -apply` в production без явного «ок» Дениса.
- Не перегенерировать словарь заново через LLM: правки делаются точечно, diff проходит ревью.
- Не менять формат `sourceProductId` у существующих адаптеров.
- Не вызывать LLM из `sync` и из всего, что он импортирует.
