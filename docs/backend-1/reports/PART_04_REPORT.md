# Backend 1 — Part 04 report

## A. Baseline

Продолжено в `feat/backend-1` с незакоммиченными подготовительными изменениями первого запуска. Тогда baseline `rtk pnpm build` и `rtk pnpm test` прошли (15/15 fixture-тестов). Сохранены все исправления Part 03: `GEMINI_MODEL`, structured Gemini output, изоляция тестов от live providers, intent merge, iOS numeric-string coordinates, `ValidationPipe` transform и voice flow. Эти файлы не переписывались.

## B. Backend 2 inspection and blocker history

История: первый запуск Part 04 остановился по §8/§51 из-за отсутствия `DATABASE_URL`; Backend 2 тогда имел только локальную Docker DB. Этот блокер **RESOLVED**: пользователь добавил в локальный `backend/.env` Supabase `DATABASE_URL` и `DIRECT_URL`; read-only Prisma-запросы подтвердили подключение и данные. Значения переменных не выводились, `.env` не менялся.

После `rtk git fetch origin` актуальный `origin/feat/backend-2` — **`71faec45cb18470d32e1e7b37afe3f344b6c958d`**. Diff от ранее просмотренной версии `153b098`: Prisma `directUrl`, DB verify script, db scripts, изменение seed. Schema/package/verify script изучены; seed/scripts/package Backend 2 не копировались. Runtime-модели остаются `Category`, `CanonicalProduct`, `Offer`, `Store`, `StoreLocation`. Merge/rebase/pull не делались. Пересекающиеся package/lock/tsconfig/AGENTS/NestJS файлы Backend 1 не заменялись.

## C. Integration approach

`backend/prisma/schema.prisma` обновлена до точной текущей Backend 2 версии; SHA-256 обоих файлов: `f2717eb51a27063d4bbb699092ec4b4d12dafe7ed1c03c5006c6878c6ed058f5`. Prisma CLI/Client 5.22.0 через pnpm; `rtk pnpm prisma generate` PASS. `.env.example` содержит только безопасные `DATABASE_URL=`/`DIRECT_URL=` и Gemini/Upstash placeholders. Миграции не создавались; `migrate`, `db push`, seed, parsers/import не запускались; `package-lock.json` не добавлялся.

Normal runtime использует PostgreSQL. Только явный `DATA_SOURCE=fixture` выбирает fixture repositories; `pnpm test` задаёт его самостоятельно. Ошибка DB connection прерывает startup, silent fixture fallback нет.

## D. Real adapters

- `backend/src/database/prisma.service.ts`: общий Prisma Client, connect/disconnect lifecycle.
- `backend/src/database/prisma-category.repository.ts`: реальные категории и валидированный `filterSchema`; stale options убираются пересечением с доступными товарами. `brand` берётся из `CanonicalProduct.brand`.
- `backend/src/database/prisma-product.repository.ts`: canonical products + category/offers/store, category/search/sort/pagination; repeated filter OR, разные keys AND; brand отдельно от attributes.
- `backend/src/database/prisma-store-location.repository.ts`: real Store/StoreLocation по store code.
- `backend/src/database/prisma-dashboard.repository.ts`: public product counts/spreads и реальные locations.
- `backend/src/database/prisma-mappers.ts`: scalar JSON attributes, mapping в прежний DTO и общий `normalizeProduct`. Usable offer = `inStock=true` и `price>0`; zero-usable товары исключены, `minPrice=0` не публикуется, `snapshotAt` = max usable offer timestamp.
- `backend/src/app.module.ts`, `backend/package.json`: DI PostgreSQL по умолчанию, fixture tests явно; controllers/services/voice DTO не менялись.

## E. Real dataset

Read-only Supabase: **Category 6**, **CanonicalProduct 121**, **Offer 243**, **Store 3**, **StoreLocation 12**. Slugs `bread`, `eggs`, `milk`, `oil`, `other`, `sugar`. Counts 121/243/3/12 совпали с заявленными Backend 2 snapshot-метриками. `matchedAcrossStores=3`; max `Offer.snapshotAt=2026-09-24T08:36:00.550Z`; zero-offer products 0; non-positive prices 0; `inStock=false` 0; invalid coordinate ranges 0. Данные не изменялись.

Есть data-quality drift Backend 2: `milk.brand=FoodMaster`, `oil.brand=Шедевр`, `eggs.packageCount` в schema не встречаются в текущих товарах. Адаптер показывает только разрешённые schema options, реально присутствующие в DB; у `milk` это `volumeMl=[500,900,1000]`, `fatPercent=[1.5,2.5,3.2,6,8.5]`, `brand=[Nemoloko,Петропавловское,Рогачевъ]`; у `eggs` фильтров нет. Атрибуты вне schema не добавлены как фильтры. Это предмет согласования с Backend 2, не blocker выбранного demo path.

## F. Public API verification (real DB)

Временный сервер с локальным `.env` на `127.0.0.1:31804` остановлен после smoke. `GET /api/categories` — HTTP 200, 6 категорий. `/api/categories/milk/filters` и `/api/categories/eggs/filters` — 200, реальные options/пустой eggs list. `/api/products` — 200, 121 товар: все `minPrice>0`, offers price ASC, global cheapest-first, ISO snapshot. Milk category — 19; case-insensitive `search=nemoloko` — 3; `brand=Nemoloko` — 3; repeated brand params — 5 (OR); `brand=Nemoloko&volumeMl=1000&fatPercent=3.2` — 1 (AND). `sort=price_desc&limit=3` — 200 и корректный порядок. Stale `brand=FoodMaster` — structured HTTP 400.

`GET /api/products/a5afdfb4-c803-4cd9-b25c-8b3d334bbda5` — 200: реальный Nemoloko, `minPrice=650`, offers `[650,995]`, прежние category/brand/image/attributes/snapshot fields. `GET /api/dashboard` — 200: summary `121/3/3`, snapshot `2026-09-24T08:36:00.550Z`, 12 real Aktau locations, sorted spreads `53.08%, 53.08%, 13.26%`. CORS `Access-Control-Allow-Origin: *`. Real dashboard/voice не содержат demo-address strings. API path/DTO не менялись.

## G. Voice verification (real DB)

Direct `POST /api/voice/start` с iOS-строками координат и «найди самое дешёвое молоко один литр 3.2 процента» — HTTP 201 `result`, `mode=single`: Nemoloko 1 л 3.2%, **650 ₸, Fix Price**, ближайший адрес **г. Актау, 12 микрорайон, 16**, **1011 м**; speech сообщает этот результат. Clarification: «найди самое дешёвое молоко» → HTTP 201 `needs_clarification`, missing `volumeMl/fatPercent`; `/api/voice/continue` с «один литр, 3.2 процента» → HTTP 201 `mode=single` и тот же товар/адрес; повторный continue с использованной session → 404. `search` → HTTP 201 `mode=list`, 3 варианта с ценами `[650,798,804]` (TOP-3). No-result 500 мл + 3.2% → `result`, `items=[]`.

Независимый read-only запрос четырёх Fix Price StoreLocation и Haversine подтвердил тот же адрес/1011 м. Gemini только распознавал структуру; товар/цена/магазин определялись NestJS/repositories.

## H. External integration status

LIVE GEMINI: **PASS** — прямой вызов `GeminiNlpParser.parse` с реальными категориями/schema вернул structured `{intent:cheapest,category:milk,filters:{volumeMl:1000,fatPercent:3.2}}`, не fallback. LIVE UPSTASH: **PASS** — live clarification и отдельные SET/GET/DEL на временном voice-session ключе. Секреты не выводились.

## I. iPhone status

Post-DB DIRECT: **PASS**; CLARIFICATION: **PASS**; LOCK SCREEN: **PASS**; SPEECH: **PASS**; NOTIFICATION: **PASS**. До Part 04 baseline отмечал PASS с fixtures, но на демонстрационном iPhone после переключения на Supabase нужны direct + clarification, один с lock screen. Пользователь решил отложить проверку Shortcut. Временный localhost-сервер 31804 остановлен; Shortcut нужен доступный телефону Backend URL.

## J. Frontend integration

API/DTO/CORS сохранены, `VITE_API_BASE_URL + /api/...` остаётся контрактом. Все реальные backend endpoints для web проверены; сам Frontend на финальном URL/рендеринг реальных данных **NOT RUN**. Deploy не выполнялся.

## K. Validation

- Branch/status и `rtk git fetch origin` — PASS; актуальный Backend 2 SHA выше. Exact schema SHA-256 — PASS.
- `rtk pnpm prisma generate` — PASS; read-only Prisma connection/count/aggregate — PASS.
- `rtk pnpm build` — PASS; `rtk pnpm test` — PASS, **15/15 fixture-based**.
- `rtk curl` categories/filters/products/dashboard/direct voice — HTTP 200/201; Node fetch assertions для category/search/sort/repeated filters/detail/dashboard/clarification/search/no-result — PASS.
- Live Gemini/Upstash, real StoreLocation/Haversine — PASS, см. G/H.
- Post-DB iPhone/Frontend/deploy/full rehearsal — **NOT RUN**.

`rtk proxy` применялся для `node --env-file`, `sha256sum`, `tar` и shell passthrough без специализированной RTK-команды. Поддерживаемые git/pnpm/curl операции выполнены через RTK; значения secrets не выводились.

## L. Deployment readiness

Из `backend/`: `pnpm install`, `pnpm db:generate`, `pnpm build`, `pnpm start:prod` при platform env. Локально на Node 20: `node --env-file=.env dist/src/main.js`. Нужны `DATABASE_URL`, `DIRECT_URL` (schema/generate), `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.1-flash-lite`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, опционально `PORT`. `.env.example` содержит placeholders; parser config не нужен. Deploy не выполнялся.

## M. Remaining issues

Post-DB iPhone sanity, final Backend URL, Frontend → final Backend → Supabase и полный demo rehearsal требуют подтверждения команды. Backend 2 filter-schema drift описан в E; выбранный Nemoloko 1 л/3.2% path работает. Код не закоммичен/не слит с Backend 2; при финальной командной интеграции нужно сохранить Backend 1 pnpm/NestJS/voice и Backend 2 schema/migrations/dataset.

## N. Clean archive

`rtk pnpm archive:clean` — PASS, `artifacts/backend-1-part-04-review.tar.gz` (55 файлов). `rtk proxy tar -tzf` — PASS: все Prisma adapters/schema, source/tests/docs/report/lockfile включены; `.git`, `TODO`, реальные `.env*` кроме `.env.example`, credentials/private keys, `node_modules`, `dist/build`, cache/logs/test artifacts и `artifacts` отсутствуют. Archive не включает себя.

## O. Status

BLOCKED — real-DB backend implementation/smoke прошли; обязательный post-DB iPhone/manual final demo gate ещё не подтверждён. Остановлено для external review; полную готовность demo не объявлять без ручной проверки.
