# Backend 1 Part 05 — аналитическая корзина Dashboard

## Основа и scope

- Ветка `integrate/full-stack`, baseline HEAD = `origin/integrate/full-stack` = `f6c23cc95be9f98506fff48548138c64b00935dc`; `rtk git fetch origin` выполнен, новых веток не подтягивали.
- На старте два документа контракта `docs/context/07_FRONTEND_QUESTIONS_BASKET.md` и `08_FRONTEND_ANSWERS_BASKET.md` были untracked; они сохранены без правок. Corepack автоматически добавил `packageManager` в `frontend/package.json`; убрана только эта служебная строка. Frontend source не менялся.
- Основной ТЗ исключает пользовательскую корзину; Part 05 и согласованный Frontend addendum разрешают только фиксированную аналитическую метрику. Никаких cart/checkout/API endpoints/DB entities/migrations не добавлено. Seed, parsers и pipeline не запускались.

## Контракт и реализация

`GET /api/dashboard` сохраняет `summary`, `priceSpreads`, `locations` и additive добавляет `baskets?: BasketDto[]`. Каждая корзина имеет `storeCode`, `storeName`, `total` и три `items` в порядке `milk` (`volumeMl === 1000`), `sugar` (`weightGrams === 1000`), `oil` (`volumeMl === 1000`). Item содержит `categorySlug`, `categoryName`, `productId`, `name`, `price`; отсутствие точного совпадения означает `null/null/null`, а `total` суммирует только найденные цены.

Изменены только Backend 1 Dashboard/контракт и тесты:

- `backend/src/contracts/catalog.ts` — additive DTO;
- `backend/src/dashboard/basket-config.ts` — единый фиксированный состав;
- `backend/src/dashboard/basket-calculator.ts` — чистый расчёт: exact category/attribute, минимальный положительный конечный offer **конкретной сети**, детерминированный порядок сетей;
- `backend/src/database/prisma-dashboard.repository.ts` — список реальных Store вместо `count`, общий calculator, остальные поля без смены логики;
- `backend/src/fixtures/repositories.ts` — тот же calculator с существующими fixture-товарами;
- `backend/test/dashboard-basket.test.ts`, `backend/test/catalog.test.ts` — pure и HTTP проверки;
- `scripts/create-clean-archive.mjs` — отдельный Part 05 архив без `frontend/**` (Frontend в этом этапе не менялся).

Controllers, Product/Offer DTO, voice, Gemini/Upstash, Prisma schema/migrations и Frontend-код не менялись. Рекомендации NestJS о repository boundary оставили контроллер тонким; Prisma `findMany(select)` заменил счётчик магазинов без нового SQL/BI слоя. Prisma CLI использован только для `generate`, не для DB writes.

## Проверки

Backend (`backend/`):

- `rtk pnpm install` — PASS.
- `rtk pnpm db:generate` — PASS, Prisma Client 5.22.0.
- `rtk pnpm build` — PASS.
- `rtk pnpm test` — PASS, **17/17** (включая 2 pure tests, HTTP dashboard и прежние catalog/voice/Haversine regression tests).
- `rtk git diff --check` — PASS.

Real PostgreSQL/Supabase: запущен новый build через `rtk proxy node --env-file=.env dist/src/main.js`, без `DATA_SOURCE=fixture`; `rtk curl -i http://127.0.0.1:3000/api/dashboard` вернул **200**. Первый `rtk curl` без `-i` попал в короткий startup-интервал и не подключился; повтор после готовности сервера успешен. Read-only сверка с `/api/products` отдельно подтвердила для каждого найденного item точные `category.slug` и атрибут, минимальный положительный offer нужной сети, `null` при отсутствии кандидата и сумму цен. Дополнительно проверены реальные `/api/categories` (6), `/api/categories/milk/filters` (3 фильтра), `/api/products` (121), `/api/products/:id` (200). Старые Dashboard-поля: 121 canonical product, 3 сети, 3 price spreads, 15 locations; без регрессии относительно Part 04. HTTP voice start/continue и остальные catalog scenarios покрыты существующими fixture-based regression tests; live Gemini/Upstash/iPhone в Part 05 не запускались.

| Сеть | Total | Найдено | Нет точной позиции |
| --- | ---: | --- | --- |
| DINA | 0 ₸ | — | milk, sugar, oil |
| DANA | 2 155 ₸ | milk 752 ₸; sugar 483 ₸; oil 920 ₸ | — |
| FIX_PRICE | 2 050 ₸ | milk 650 ₸; sugar 580 ₸; oil 820 ₸ | — |

`0 ₸` у DINA — только арифметическое поле API, **не стоимость полной корзины**: все три item имеют `productId/name/price = null`. Frontend должен показать «Нет данных» и не ранжировать неполную корзину. Никакого category fallback и изменения dataset не было.

## Integration impact, ограничения и review

- Frontend текущей ветки ещё не содержит UI/DTO для `baskets`; поле additive и не ломает прежний экран. После отдельной реализации Frontend должен показать полноту/суммы и связать карту по `storeCode`; Frontend checks и real HTTP E2E не запускались, так как `frontend/**` не менялся в этом этапе.
- Текущий snapshot не содержит exact basket positions у DINA. Это ограничение данных, а не ошибка расчёта; менять seed/normalization ради красивой суммы запрещено.
- Стартовое дерево не было полностью clean из-за двух предоставленных untracked contract docs. Они не удалялись и попадут в review archive как документы; commit/push/deploy не выполнялись.
- Clean archive: `artifacts/backend-1-part-05-review.tar.gz`; содержит Backend source/tests, docs и этот report, исключает Frontend source и служебные/секретные файлы. Проверка tar listing выполнена. `rtk proxy` использован для custom Node и tar без отдельной RTK-команды; поддерживаемые git/pnpm/curl выполнены через RTK.

**Status: READY_FOR_EXTERNAL_REVIEW** — Backend Part 05 готов; Frontend UI корзин остаётся отдельной работой.
