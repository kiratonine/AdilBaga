# Отчёт: фаза L плана «Price Freshness Fix»

- **План:** `docs/superpowers/plans/2026-10-08-price-freshness-fix.md` (лежит в соседнем worktree `site-bug-analysis-82bcc1`, в этой ветке файла нет)
- **Ветка / PR:** `claude/price-freshness-phase-l-7b2a2d` → [PR #19](https://github.com/kiratonine/AdilBaga/pull/19), **не смержен**
- **Worktree:** `C:\Development\AdilBaga\.claude\worktrees\price-freshness-phase-l-7b2a2d`
- **Исполнитель:** Claude Sonnet 5.5, скилл `superpowers:executing-plans`, дата 2026-10-08
- **Статус:** фаза L (Tasks 1–5) выполнена. Фаза P (Tasks 6–8, prod) **не начиналась** и ждёт фразу пользователя «заливай на прод».
- **Prod не затронут.** Единственное обращение к prod — чтение через Supabase MCP (`select`) для построения локальной baseline (см. раздел 4).

## 1. Коммиты ветки (относительно `main`)

| Коммит | Что |
|---|---|
| `7b33e68` | `fix(pipeline)`: Dina падает, если shop 28 не в Актау |
| `b99541b` | `feat(frontend)`: предупреждение, если snapshot старше 36 ч |
| `e1a2ede` | `ops(sync)`: systemd service + timer, env-пример, README, правки `SYNC_RUNBOOK.md` и `deploy/README.md` |
| `aa74d88` | `feat(pipeline)`: скрап Dina/Dana только по категориям scope (**вне плана**, по просьбе пользователя) |
| `d8412f9` | `ops(sync)`: `FIXPRICE_CITY_ID`/`FIXPRICE_COUNTRY_ID` в env-пример (**вне плана**, найден пробел при самоанализе) |

Файлы, не попавшие в коммиты (все в `.gitignore`): `data/sources/*.json`, `data/sync/*`, `data/agent/prod_catalog.sql`, `data/agent/prod_baseline.sql`.
Этот отчёт тоже не закоммичен.

## 2. Task 1 — guard магазина Dina

- `pipeline/src/scrapers/dina.ts`: экспорт `assertAktauShop(shops, shopId)`; `scrapeDina` до загрузки категорий запрашивает `{ shops { id name city { name } } }` и вызывает guard; в `sourceStats` добавлен `shopCity: 'Актау'`.
- Тесты `pipeline/test/dina.test.ts`: `accepts Aktau shop`, `rejects non-Aktau shop`, `rejects missing shop`; `fakeFetch` отвечает на `shops {`; тест обхода проверяет `shopCity`.
- RED→GREEN соблюдён: до реализации упало 4 теста (в т.ч. 3 новых и обход), после — все проходят.
- Запрос `shops` проверен вживую на `backend.dinamarket.kz` (возвращает магазины с городами Актау/Актобе).

## 3. Task 2 — индикатор устаревания

- Новый `frontend/src/lib/freshness.ts`: `STALE_AFTER_HOURS = 36`, `isPriceStale(snapshotAt, now)`. Невалидная дата и дата в будущем → `false`.
- `ProductPage.tsx` и `ProductCard.tsx`: `<p data-testid="price-stale">` под датой snapshot, только если `isPriceStale`. Ключ `card.priceStale` добавлен в `ru.json` и `kk.json`.
- Тесты: `freshness.test.ts` (4 кейса из плана), по два кейса в `ProductPage.test.tsx` и один в `ProductCard.test.tsx` (с `vi.useFakeTimers({ toFake: ['Date'] })`).
- Побочный эффект, который стоит иметь в виду: моки (`src/mocks/*.json`) имеют `snapshotAt: 2026-09-24`, поэтому в mock-режиме при реальной дате строка устаревания теперь видна. Существующие тесты это не ломает (проверено, 209/209).

## 4. Task 3 — systemd

- Созданы `ops/sync/aktau-sync.service`, `aktau-sync.timer` (`OnCalendar=*-*-* 01,13:00:00 UTC`, `Persistent=true`), `aktau-sync.env.example`, `README.md`.
- `SYNC_RUNBOOK.md §3` теперь ссылается на `ops/sync/` вместо примера; в `deploy/README.md` добавлена одна строка.
- `systemd-analyze verify` в контейнере `debian:12`: синтаксических ошибок нет. Были только предупреждения о правах файлов (executable/world-writable) — артефакт монтирования из Windows.
- **Пробел, найденный при самоанализе и исправленный в `d8412f9`:** план перечислял в env-примере только 7 переменных, но `scrape:fixprice` требует `FIXPRICE_CITY_ID` (иначе бросает ошибку), а `pipeline/.env` на VPS нет. Без исправления каждый запуск таймера падал бы на Fix Price. Добавлены `FIXPRICE_CITY_ID=1594` и `FIXPRICE_COUNTRY_ID=3` (значения из `docs/data/FIXPRICE_SOURCE.md`).
- **Не проверено:** реальная установка на VPS (это Task 8, фаза P).

## 5. Task 4 — свежие цены на локальной БД

### 5.1 Что пошло не по плану (важно для проверки)

1. **Дамп каталога.** План: попросить у пользователя `SUPABASE_DIRECT_URL` и сделать `pg_dump`. Я сначала взял готовый `data/agent/prod_catalog.sql` из главного checkout (от 05.10) — это **ошибка**: дамп содержал старую baseline (849 карточек, snapshot `baseline-internal-v1`), а в prod 3 083 карточки. Результат: dry-run ingest падал с `ingestion_validation_failed` (по коду `resolve` — `canonical_merge_conflict`; с флагом `-recluster` проходил, но создавал 2 570 новых ID вместо переиспользования — тест бессмыслен).
2. Пользователь отказался передавать пароль и выбрал вариант «через Supabase MCP». Я прочитал из prod **только** идентичности последнего опубликованного snapshot `62c0bfeb-dcbe-432f-abf9-c108e6fdb9a5`: `(store, sourceProductId, canonicalProductId, category)` для 3 352 raw-товаров / 3 083 карточек, и собрал `data/agent/prod_baseline.sql`. Названия карточек в локальной БД — заглушки (= id), цены офферов = 1. Ingest использует из baseline только идентичности, поэтому для проверки ID-стабильности этого достаточно, **но локальные названия/цены baseline-snapshot нерепрезентативны**.
3. **Моя ошибка при выгрузке:** первая версия кодировала магазин `left(code,1)`, из-за чего DINA и DANA оба стали `D` (в локальной БД было DINA 3278, DANA 0). Исправлено перевыгрузкой с кодами `I/A/F`; после этого счётчики локальной БД: DINA 1995, DANA 1283, FIX_PRICE 74 = 3 352, как в prod.
4. **Скрап ограничен scope** (вне плана, по прямой просьбе пользователя «нужны только социально-значимые категории»), см. раздел 6.
5. **Два параллельных прогона sync.** Пользователь остановил первый прогон, но процесс остался жив; позже в логе оказались два результата Dina. Я нашёл и принудительно завершил все процессы `daily-sync`/`scrape.ts` этого worktree и перезапустил один чистый прогон. Параллельный ingest не успел запуститься (проверено по процессам до ingest).

### 5.2 Результат

Источники (`capturedAt` 2026-10-08 ~14:12–14:20 UTC, `errorCount` 0 у всех):

| Магазин | Скрапнуто | В bundle (после фильтра sync) | В prod, snapshot 06.10 |
|---|---|---|---|
| DINA | 6 364 | 2 024 | 1 995 |
| DANA | 3 536 | 1 234 | 1 283 |
| FIX_PRICE | 5 891 | 74 | 74 |

Ingest (после исправления baseline):
- dry-run без `-recluster`: `reused 2986`, `new 89`, `merged 0`, `split 0`, `canonicalCount 3075`, без `failureCode`.
- `-apply` (dev, с локальным `FRONTEND_REVALIDATE_URL=http://127.0.0.1:3100/internal/revalidate` и случайным одноразовым секретом): успех, новый snapshot `5baab257-9b6e-4260-b26b-f0eb17441e6d`, `frontend_revalidation: degraded` (ожидаемо, локально никто не слушает).
- SQL-проверка 1: категории нового snapshot ровно `groats 1165, dairy 1037, bread 287, milk 176, vegetables 135, meat 111, oil 103, sugar 54, eggs 7` (9 категорий scope, всего 3 075 карточек).
- SQL-проверка 2, «Лук красный» (`9bc98981-…`): **DINA 820 ₸, DANA 275 ₸**.
  - 820 = 0.82 ₸/г × 1000 по API Dina для shop 28 (цифра из диагностики плана, повторно мной по live API не проверялась).
  - 275 = цена на странице Dana (цифра из диагностики плана, повторно не сверялась с живым сайтом).

## 6. Изменение вне плана: скрап по scope

По просьбе пользователя (скрапить не весь каталог). Реализация:
- `DINA_SCOPE_ROOTS` (15 корневых категорий из 26) в `dina.ts`; `scrapeDina({ scopeRoots })` фильтрует стартовую очередь и не добавляет найденные подкатегории, если корень товара не в списке; пустой результат фильтра → ошибка `no categories left after scope filter`.
- `DANA_SCOPE_ROOTS = DANA_ROOTS.slice(0, 1)` (только «Продукты питания»).
- CLI `scrape.ts`: по умолчанию scope, `SCRAPE_ALL=1` — полный обход. Функции `scrapeDina()`/`scrapeDana()` без опций ведут себя как раньше (поэтому старые тесты не менялись).
- Новые тесты: `dina scope roots` (2 кейса).
- Список корней получен из `data/mapping/dictionary.json` + прошлых `data/sources/*.json`: все корни, где есть хотя бы один товар scope. Включены и корни с 1–3 товарами scope («Чай», «Торты и пироги», «Заморозка», «Консервация»), чтобы не потерять хвост.
- **Fix Price не ограничивался** (5 891 скрапнуто → 74 в scope): алиасы категорий меню неизвестны, обход небольшой.
- Эффект: Dina 6 364 против 10 695 при полном обходе — примерно вдвое меньше, не втрое. Фильтр грубый (по корням).

## 7. Task 5 — локальная проверка сайта и PR

- Go API на тестовой БД: `GET /api/products/9bc98981-…` → «Лук красный», `snapshotAt 2026-10-08T14:16:10Z`, DANA 275 / DINA 820. **Путь в плане (`/api/v1/products/...`) устарел**, реальный — `/api/products/{id}` (`backend-go/internal/httpapi/server.go:56`). Роль `api_local` подошла, запасная `postgres` не понадобилась.
- Frontend (`pnpm dev -p 3100`, `NEXT_PUBLIC_API_MODE=http`): страница показывает «Лук красный», Dana 275 ₸ («Дешевле всего»), Dina 820 ₸ («дороже на 545 ₸»), «Цена на 08.10.2026», `price-stale` отсутствует. Проверено через DOM в встроенном браузере (скриншот не делался).
- Тесты (все запущены мной, вывод прочитан): pipeline `101/101` + `pnpm typecheck` чисто; frontend `209/209`, `next build` exit 0, `tsc --noEmit` exit 0; `go test ./...` — все пакеты `ok`. (Первое `tsc` до сборки падало на `PageProps`/`LayoutProps` — это генерируемые Next типы, после `next build` ошибок нет.)
- Локальные API/frontend остановлены (порты 8080/3100 свободны). Контейнер `adilbaga-ingest-test` оставлен.
- PR #19 создан, `main` не изменялся, merge не выполнялся. Состояние CI на момент отчёта: Contracts, Security, Vercel — pass; Frontend, Go Quality, Pipeline Quality, Nest Reference, PostgreSQL Integration — ещё pending, **итог CI не дождан**.

## 8. Побочные действия на машине пользователя

- Запущен Docker Desktop (был выключен).
- Скачан образ `debian:12` (для `systemd-analyze`).
- Создан контейнер `adilbaga-ingest-test` на `127.0.0.1:55432` (пароль `local-only-pass`, только локально), роль `api_local`.
- `pnpm install --frozen-lockfile` в `pipeline/` и `frontend/` этого worktree.
- Завершены процессы node/bash/cmd этого worktree (фильтр по пути worktree).

## 9. Известные риски и непроверенное (на что смотреть ревьюеру)

1. **Dana: 1 283 → 1 234 (−49, −3,8 %)** в сравнении с prod. Порог `INGEST_MAX_STORE_DROP_PERCENT=10` не превышен, но причину падения я не исследовал (реальные изменения ассортимента или потеря товаров из-за парсинга/scope-фильтра sync). Стоит сравнить `sourceProductId`, пропавшие из bundle, с baseline.
2. **Dina: приращение 1 995 → 2 024 (+29)** — тоже не разбиралось; вероятно, новые позиции или сдвиг маппинга; 89 новых карточек в целом.
3. **Грубый фильтр Dina по корням:** новая категория scope в корне, которого нет в `DINA_SCOPE_ROOTS`, молча не попадёт в скрап. Список жёстко задан в коде и устареет вместе со словарём.
4. **Проверка города Dina** — по строке `city.name === 'Актау'`. Если Dina переименует город/сменит язык, guard начнёт падать (безопасно: старый snapshot остаётся), но sync остановится.
5. **Цены 820/275** подтверждены мной только по БД/API нашего сайта; сверка с живым dinamarket.kz (API shop 28) и dana-market.kz в этой сессии **не повторялась**, опираюсь на диагностику плана.
6. **Локальная baseline неполная** (заглушки имён и цен); проверена стабильность ID и счётчики, но не контент карточек. Ингест в prod должен быть повторён с реальной prod-БД в фазе P.
7. **Revalidation** проверена только на уровне «клиент сконфигурирован, локально degraded»; реальный вызов `aktau.market/internal/revalidate` не делался.
8. **Таймер на VPS** не устанавливался; прогон `daily-sync.sh` на VPS (Node, pnpm, Go, права `aktau-sync` на `/opt/adilbaga/data`) не проверен. Скрипт при `set -e` останавливается на первой ошибке — на деле именно так я и увидел падение ingest.
9. **Финальное ревью:** отдельного ревьюера (субагента) не было — план запрещает субагентов; я сделал самопроверку диффа (`git diff main`). Это слабее независимого ревью; данный отчёт передаётся другому агенту именно для этого.
10. **Неисследованное:** ESLint/линтеры фронта и Go (`golangci-lint`) отдельно не запускались; их результат — в CI PR #19.

## 10. Как проверить (команды для ревьюера)

```bash
cd C:/Development/AdilBaga/.claude/worktrees/price-freshness-phase-l-7b2a2d
git log --oneline main..HEAD
git diff main --stat
(cd pipeline && pnpm test && pnpm typecheck)
(cd frontend && pnpm test)                      # tsc/build требуют env, см. раздел 7
(cd backend-go && go test ./...)
gh pr checks 19
# локальный результат (контейнер должен быть запущен)
docker exec adilbaga-ingest-test psql -U postgres -c "select st.code, o.price from offers o join stores st on st.id=o.\"storeId\" where o.\"canonicalProductId\"='9bc98981-9029-45b0-a57e-2c993c83bc11' and o.\"snapshotId\"='5baab257-9b6e-4260-b26b-f0eb17441e6d'"
```

Ключевые файлы: `pipeline/src/scrapers/dina.ts`, `pipeline/src/scrapers/dana.ts`, `pipeline/src/cli/scrape.ts`, `pipeline/test/dina.test.ts`, `frontend/src/lib/freshness.ts`, `frontend/src/views/ProductPage.tsx`, `frontend/src/components/product/ProductCard.tsx`, `frontend/src/i18n/{ru,kk}.json`, `ops/sync/*`.

## 11. Что осталось (фаза P, только по команде «заливай на прод»)

Task 6 — merge PR после зелёного CI; Task 7 — sync в prod (нужны `INGEST_DATABASE_URL` prod ingest-роли и `REVALIDATE_HMAC_SECRET` от пользователя) и повторные SQL-проверки; Task 8 — инструкция владельцу по установке таймера на VPS (учесть `FIXPRICE_*` в `/etc/aktau-sync.env`).

## 12. Правки по ревью (коммит `2454e6d`)

Запрос пришёл из сессии-ревьюера (cross-session message); обе правки в пределах фазы L, prod не затрагивался.

1. **systemd (`ops/sync/aktau-sync.service`):** добавлены `Environment=PATH=/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin`, `HOME=/var/lib/aktau-sync`, `GOCACHE=/var/cache/aktau-sync/go`, `StateDirectory=aktau-sync`, `CacheDirectory=aktau-sync`. В `ops/sync/README.md` (требования на VPS) указано, что Go ожидается в `/usr/local/go/bin`, иначе правится `PATH` в юните. `systemd-analyze verify` в `debian:12`: ошибок нет (отфильтрованы только известные предупреждения о правах файлов с Windows-монтирования).
2. **Hydration (`frontend/src/lib/freshness.ts`):** добавлен хук `usePriceStale(snapshotAt)`: `useState(false)` + `useEffect`, который ставит `isPriceStale(snapshotAt)`. На сервере и при первом клиентском рендере возвращает `false`. `ProductPage.tsx` (`Offers`) и `ProductCard.tsx` используют хук вместо вызова `isPriceStale` при рендере.
   - TDD: сначала два теста хука в `freshness.test.ts` (первый рендер `false`, после монтирования `true` для старого snapshot; `false` для свежего) — RED (`usePriceStale is not a function`), затем реализация — GREEN.
   - `ProductCard.test.tsx`: строку `price-stale` ждём через `findByTestId`; `ProductPage.test.tsx` уже ждал её через `findByTestId`. Тесты чистой `isPriceStale` сохранены.

### Результаты проверки после правок

| Проверка | Результат |
|---|---|
| `pipeline`: `pnpm test` / `pnpm typecheck` | 101/101, typecheck чисто |
| `frontend`: `pnpm test` | 38 файлов, 211/211 |
| `frontend`: `pnpm build` (с `NEXT_PUBLIC_API_*`) / `pnpm tsc --noEmit` | exit 0 / exit 0 |
| `backend-go`: `go test ./...` | все пакеты `ok` |
| `systemd-analyze verify` (debian:12) | без ошибок |
| Локально: Go API (`api_local`) + frontend `:3100`, страница лука | Dana 275 ₸ («Дешевле всего»), Dina 820 ₸, «Цена на 08.10.2026», `price-stale` отсутствует; в консоли браузера ошибок гидрации нет (были только отказы HMR-вебсокета от ранее остановленного dev-сервера) |
| API и frontend после проверки | остановлены, порты 8080/3100 свободны |
| CI PR #19 после пуша `2454e6d` | Contracts, Frontend, Go Quality, Nest Reference, Pipeline Quality, PostgreSQL Integration, Security, Vercel, Vercel Preview Comments, Ephemeral Staging — все `pass` |

PR #19 **не смержен**. Фаза P не выполнялась и ждёт фразу пользователя «заливай на прод».

Замечание: в разделе 9 пункты 1–2 (пропажа товаров Dana/Dina) закрыты ревьюером: пропавшие позиции отсутствуют у самих магазинов, фильтр scope их не отрезал.
