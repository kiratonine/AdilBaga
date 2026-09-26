# Backend 1 — Part 02 report

## A. Baseline / repository inspection

Работа выполнена в `feat/backend-1`; remote `origin` — `https://github.com/kiratonine/AdilBaga.git`. На старте в рабочем дереве уже было изменение `.gitignore` (`AGENTS.md` в ignore); оно не тронуто. Существовали Part 01 Nest bootstrap, voice POC, typed contracts, три repository interfaces, fixtures и Node HTTP test. До изменений `rtk pnpm build` и `rtk pnpm test` прошли (1 тест).

## B. Implemented

Добавлены API категорий, фильтров, каталога, карточки и dashboard поверх fixture repositories. Query-параметры проверяются до передачи в `ProductQuery`. `minPrice` пересчитывается из offers, offers сортируются. Dashboard вычисляется из fixture-товаров; добавлены две явно демонстрационные точки. Haversine возвращает метры. Для отдельного Frontend origin включён простой CORS. Voice POC Part 01 сохранён.

## C. Changed files

- `backend/src/catalog/product-card.ts` — общая нормализация карточки и offers.
- `backend/src/catalog/product-query.ts` — проверка и разбор query, включая динамические значения.
- `backend/src/catalog/products.service.ts`, `backend/src/catalog/products.controller.ts` — каталог и detail API.
- `backend/src/categories/categories.service.ts`, `backend/src/categories/categories.controller.ts` — категории и filter schema API.
- `backend/src/dashboard/dashboard.service.ts`, `backend/src/dashboard/dashboard.controller.ts` — dashboard API.
- `backend/src/location/haversine.ts` — чистая функция расстояния.
- `backend/src/fixtures/repositories.ts` — fixture query, dashboard-агрегаты и демо-точки; несуществующий fixture image URL заменён на `null`.
- `backend/src/app.module.ts`, `backend/src/create-app.ts` — wiring маршрутов и CORS.
- `backend/package.json` — Node test runner запускает все скомпилированные test files.
- `backend/test/catalog.test.ts` — сфокусированные HTTP и Haversine проверки.
- `scripts/create-clean-archive.mjs` — имя Part 02 review archive.
- `docs/backend-1/reports/PART_02_REPORT.md` — этот отчёт.

## D. API behavior

- `GET /api/categories` → массив `CategoryDto`; без query-параметров.
- `GET /api/categories/:slug/filters` → `FilterSchemaDto`; неизвестный slug → 404. Сейчас доступен `milk` с реальными для fixture options `volumeMl: [500,1000]`, `fatPercent: [2.5,3.2]`.
- `GET /api/products` → `ProductCardDto[]`; query: `category`, `search`, `sort`, `limit`, `offset` и верхнеуровневые ключи фильтров категории. Например `?category=milk&volumeMl=500&volumeMl=1000&fatPercent=3.2`. Повтор одного ключа означает OR, разные ключи — AND. Неизвестный sort, неверная пагинация, неизвестный ключ/значение фильтра и динамический фильтр без category → 400. Пустой результат → 200 `[]`.
- `GET /api/products/:id` → один `ProductCardDto`; неизвестный id → 404.
- `GET /api/dashboard` → `DashboardDto` с `summary`, `priceSpreads`, `locations`.
- `POST /api/voice/start` — прежний mock result без изменения контракта.

## E. Product behavior

Default sort — `price_asc`; также работают `price_desc`, `name_asc` (русская locale/string сортировка). Поиск обрезает пробелы и ищет имя без учёта регистра. Пустой search не фильтрует. `limit > 0`, `offset >= 0`, только целые значения; без limit возвращается весь малый fixture-набор. Числовые фильтры приводятся к числам и сверяются с options; непредусмотренные значения не подменяются. Список и detail применяют один `normalizeProduct`: `minPrice` — минимальная цена offers, сами offers — по возрастанию. Nullable `brand`, `imageUrl`, `oldPrice` сохранены. Fixture prices/date не являются живыми ценами.

## F. Dashboard

На текущих fixtures: `canonicalProducts=2`, `stores=2` уникальные сети в демо-точках, `matchedAcrossStores=2` товара с offers минимум двух разных сетей. `snapshotAt` — максимальная ISO-дата среди fixture-товаров. Для товаров с межсетевыми offers: `differencePercent=((maxPrice-minPrice)/minPrice)*100`, округление до двух знаков. Spreads отсортированы: `8.77%`, `7.69%`. Две точки Dina/Dana около Актау имеют явно демонстрационные, не проверенные адреса и координаты. Backend 2 позже предоставляет настоящие StoreLocation.

## G. Haversine

`backend/src/location/haversine.ts`, результат в метрах. Тест: одинаковые координаты → `0`; пара `(43.6,51.1)` и `(43.61,51.1)` → конечное расстояние в диапазоне 1100–1125 м.

## H. Validation

- До изменений: `rtk pnpm build` — PASS; `rtk pnpm test` — PASS, 1 voice test.
- После изменений: `rtk pnpm build` — PASS. Первый `rtk pnpm test` — FAIL, только ошибочное ожидание теста для `name_asc`/`offset=1`; исправлено ожидание согласно русской сортировке. После исправления и финальной правки fixtures: `rtk pnpm build` — PASS; `rtk pnpm test` — PASS, 7/7 тестов, включая прежний voice test.
- `rtk pnpm start` — PASS; сервер слушал `0.0.0.0:3000`.
- Реальные `rtk curl -i` к `/api/categories`, `/api/categories/milk/filters`, `/api/products?category=milk`, `/api/products?category=milk&volumeMl=1000&sort=price_asc`, `/api/products/2358a413-8c03-4e59-baad-7675045b97bb`, `/api/dashboard` — HTTP 200. Каталог вернул цены 390/570 по возрастанию, фильтр `volumeMl=1000` вернул один товар, dashboard вернул 2/2/2 и spreads 8.77/7.69.
- `rtk curl -i` с неверным `volumeMl=bad` — HTTP 400 JSON. `POST /api/voice/start` — HTTP 201 mock result. После последней fixture-правки повторные curl для `volumeMl=500` и dashboard — HTTP 200; изображение теперь `null`.
- `rtk git diff --check` — PASS для tracked diff. `.gitignore` оставлен как был до Part 02.
- `rtk pnpm archive:clean` и `rtk proxy tar -tzf artifacts/backend-1-part-02-review.tar.gz` — PASS; состав проверен. `rtk proxy` использован, поскольку у RTK нет специализированного tar listing.

## I. Integration impact

Frontend может получать готовые карточки, фильтры, агрегаты и точки по согласованным путям; CORS разрешает запросы с другого origin. Frontend не нужно считать `minPrice` или сортировать offers. DTO и пути не менялись. В текущей checkout нет Frontend-кода для проверки его сериализации query; контракт повторных параметров описан выше. Backend 2 schema, migrations, parsers, import и matching не изменялись; Part 04 сможет заменить fixture-адаптеры через существующие интерфейсы.

## J. Remaining issues

Данные по-прежнему демонстрационные: цены, дата и координаты/адреса точек не проверены как реальные. Настоящая БД и verified StoreLocation потребуются для финальной интеграции. В текущем fixture-наборе только `milk` и две сети.

## K. Clean archive

Команда из `backend/`: `rtk pnpm archive:clean`. Файл: `artifacts/backend-1-part-02-review.tar.gz`. Полный listing через `rtk proxy tar -tzf` проверен: исходники, tests, docs, lockfile и archive script включены; `.git/`, `TODO/`, `.env`/credentials, `node_modules/`, `dist/`, build/test artifacts и `artifacts/` отсутствуют.

## L. Status

READY_FOR_EXTERNAL_REVIEW
