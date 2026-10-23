# Ежедневное обновление цен (`pnpm sync`)

Решение команды от 2026-10-06 (SCRUM-7, Phase A2): регулярное обновление не использует LLM.

## 1. Что делает

```text
scrape:dina ┐
scrape:dana ├─ параллельно, фоном  →  data/sources/*.json
scrape:fixprice ┘   (упавшая сеть не перезаписывает свой файл)
pnpm sync (словарь data/mapping/dictionary.json) →  data/sync/bundle.json + data/sync/unmapped.json
go run ./cmd/ingest -bundle data/sync/bundle.json [-apply]   →  новый snapshot (staging, quality gates, атомарный publish)
```

- Скраперы идут параллельно, весь прогон занимает около 4 минут (замер 2026-10-13): критический путь — HTML-скрапер Dana (после задачи 4.1 локально ~70–75 с вместо ~280 с; приёмка на VPS ещё не выполнена), Dina и Fix Price — по ~22 с. Каждая строка вывода помечена сетью (`[dina]`, `[dana]`, `[fixprice]`), итог сети — `[sync] <сеть> exit=<код> took=<N>s`.
- Dina скрапится батчами: один GraphQL-запрос содержит до 20 страниц (`DINA_BATCH_PAGES`, максимум 20: больше 20, ноль или мусор — 20 с предупреждением; `1` возвращает прежнее поведение «страница = запрос»), и только по категориям из `data/mapping/dina-scope-categories.json`. Нет файла, он пуст или посчитан без какой-то из публикуемых сейчас категорий — обход по `DINA_SCOPE_ROOTS`. Выбранный режим — строка `[DINA] mode: ...` в журнале.
- Dana качает страницы пулом из `DANA_CONCURRENCY` запросов (по умолчанию 3, максимум 4; мусор, ноль или дробное — 3, больше 4 — 4, с предупреждением `[DANA]`; при `HTTP 429/5xx` от Dana снизить до `1` в env-файле). Обходит только подразделы «Продуктов питания» из `data/mapping/dana-scope-sections.json` (`pnpm scope:dana`). Нет файла, он пуст или посчитан без какой-то из публикуемых категорий — обход корня тем же пулом. Режим — строка `[DANA] mode: sections|legacy root|full` в журнале. `Crawl-delay: 3` из `robots.txt` Dana осознанно игнорируется (решение владельца 2026-10-16), пауза 0,3 с на запрос остаётся.
- Fix Price обходит только `FIXPRICE_SCOPE_ALIASES` (сейчас `produkty-i-napitki`).
- Узкий скрап Dina (батчи) и Fix Price (по алиасу) с хотя бы одной ошибкой страницы файл не пишет и падает: одна ошибка там теряет целую категорию или остаток каталога. Dana по подразделам (`[DANA] mode: sections`) ведёт себя так же: упавший или исчезнувший с сайта подраздел не даёт записать урезанный файл. `SCRAPE_ALL=1`, обход Dina по корням и обход корня Dana терпят отдельные ошибки, как раньше.
- `SCRAPE_ALL=1` включает полный каталог (используется только еженедельным прогоном, §5).
- Если сеть упала, а её прошлый удачный файл не старше лимита, публикуется он; прогон завершается кодом 3 (см. §4). Если упали все три сети, sync и ingest не запускаются.

- Известный товар (есть в `dictionary.json`) попадает в свою карточку: название, бренд, категория, атрибуты берутся из словаря, цена и картинка — из сегодняшнего файла.
- Неизвестный товар публикуется одиночной карточкой с `reviewStatus=pending`, категория берётся по `storeCategories` (иначе `other`). Он попадает в `data/sync/unmapped.json`.
- Товары словаря, которых сегодня нет у магазина, просто не получают офферов в этом snapshot.
- `sync` отказывается работать на устаревших (по умолчанию старше 36 ч, `SYNC_MAX_SOURCE_AGE_HOURS`) или отсутствующих файлах источников; список обязательных сетей — `SYNC_STORES` (по умолчанию `DINA,DANA,FIX_PRICE`).
- `sync` и всё, что он импортирует, не вызывают LLM и не требуют `GEMINI_API_KEY*` (проверяется тестом).

## 2. Запуск вручную

```bash
export APP_ENV=development INGEST_MAX_STORE_DROP_PERCENT=10 INGEST_DATABASE_URL=<строка подключения роли ingest>
bash pipeline/scripts/daily-sync.sh
```

В production дополнительно `APP_ENV=production` и `INGEST_PRODUCTION_APPLY_CONFIRM=1` (только по решению владельца). Скрипт сначала скрапит три сети параллельно (упавший скрапер сам не останавливает скрипт), затем публикует: `pnpm sync`, dry-run, `-apply`. Ошибка на этапе публикации (`set -e` действует только здесь) останавливает скрипт с кодом 1. Коды выхода 0/1/3 — в §4 и `ops/sync/README.md`.

## 3. Расписание (SCRUM-8)

Два таймера `systemd`, юниты лежат в `ops/sync/`; установка и обновление кода на VPS — `ops/sync/README.md`.

| Таймер / юнит | Когда | Что делает | Лимит |
|---|---|---|---|
| `aktau-sync.timer` → `aktau-sync.service` | 06:00 и 18:00 по Актау (UTC+5 → `01:00` и `13:00` UTC) | `daily-sync.sh`: узкий параллельный скрап, sync, ingest с публикацией | `TimeoutStartSec=20min` |
| `aktau-sync-full.timer` → `aktau-sync-full.service` | воскресенье 22:00 UTC (понедельник 03:00 по Актау), `Persistent=true` | `weekly-full-scrape.sh`: полный скрап, `scope:dina`, `scope:dana`, `sync` (упавший scope-шаг не пропускает `sync`, но даёт код 1 и строку `[full] failed scope steps: ...`); **без ingest и публикации** | `TimeoutStartSec=2h` |

Файлы: `aktau-sync.service`, `aktau-sync.timer`, `aktau-sync-full.service`, `aktau-sync-full.timer`, `aktau-sync.env.example`.

`User=` — отдельный пользователь, файл env с правами `600`. Одновременный запуск двух ingest исключён advisory lock в `cmd/ingest`.

## 4. Если упало

Смотрите `failureCode` в JSON-выводе `cmd/ingest`:

| Код / симптом | Что значит и что делать |
|---|---|
| `required_source_missing` | в bundle нет ни одного товара обязательной сети. Упавший скрапер к этому больше не приводит: берётся прошлый удачный файл (exit 3), пустой файл не записывается вовсе. Нет source-файла или он старше лимита — `sync` останавливается ещё раньше (`source file missing` / `source file is stale`, строка ниже). Значит, сеть выпала из bundle иначе: `SYNC_STORES` без неё или ни один её товар не попал в публикуемые категории — проверить env и source-файл сети |
| `store_count_drop` | товаров сети стало заметно меньше (порог `INGEST_MAX_STORE_DROP_PERCENT`) — проверить источник, не публиковать |
| `canonical_merge_conflict` | словарь меняли (объединили карточки) — запустить `cmd/ingest` с `-recluster` |
| ошибка `sync` или ingest (exit 1) | snapshot не публикуется, на сайте остаются прошлые цены. Падение одного скрапера сюда не относится: оно даёт exit 3 (следующая строка) |
| exit 3 — stale stores | snapshot **опубликован**, но сети из строки `[sync] stale stores: <список>` взяты из прошлого удачного файла; юнит в статусе `failed` намеренно. Смотрите `journalctl -u aktau-sync`, ищите `[<сеть>]` с причиной падения скрапера. Цены такой сети устаревают, и через `SYNC_MAX_SOURCE_AGE_HOURS` (36 ч) `sync` откажется их публиковать (`... source file is stale`) — до этого срока скрапер надо починить |
| `all scrapers failed, nothing to publish` (exit 1) | упали все три скрапера, ничего не опубликовано — сначала проверить сеть и доступность VPS в целом |
| `FIX_PRICE: scope alias ... not in category menu` | магазин переименовал или убрал категорию из `FIXPRICE_SCOPE_ALIASES` — скрапер упал намеренно, чтобы не публиковать 0 товаров. Найти новое имя в `category/menu` и поправить `FIXPRICE_SCOPE_ALIASES` в `pipeline/src/scrapers/fixprice.ts` |
| `[sync] <сеть> timed out after Ns, treating as failed` | скрапер не уложился в `SCRAPE_TIMEOUT_SEC` (по умолчанию 720 с) и был убит (`exit=124`, при игнорировании сигнала — `137`). Сеть берётся из прошлого удачного файла: exit 3, сеть в `[sync] stale stores`. Обычно сайт магазина тормозит или лежит; повторяется — смотреть журнал `[<сеть>]` выше и при необходимости временно поднять лимит в `/etc/aktau-sync.env` (должен оставаться заметно меньше `TimeoutStartSec`) |
| `<СЕТЬ>: scoped scrape finished with N error(s) ... keeping previous file` | узкий скрап Dina (батчи), Dana (подразделы) или Fix Price (алиас) получил ошибки страниц и намеренно не перезаписал свой файл. Сеть берётся из прошлого удачного файла: exit 3, сеть в `[sync] stale stores`. Разовое — дождаться следующего прогона; повторяется — разобрать ошибки `[dina]`/`[fixprice]` в журнале выше этой строки |
| `DINA: too many page errors` | более 10 ошибок страниц за прогон (ответ с `errors` в одном из алиасов батча тоже считается). Повторить запуск; если повторяется — `DINA_BATCH_PAGES=1` в env-файле как временный откат на «страница = запрос», затем разобрать формат ответа |
| `... source file missing` / `... source file is stale` | source-файла обязательной сети нет или он старше `SYNC_MAX_SOURCE_AGE_HOURS`: удачного скрапа сети давно не было или файл удалили — перезапустить соответствующий `pnpm scrape:*` и разобрать, почему он падает |

## 5. Еженедельный полный прогон и новые товары

`aktau-sync-full` (`weekly-full-scrape.sh`) раз в неделю скрапит каталог целиком (`SCRAPE_ALL=1`) и ничего не публикует. Он пишет в отдельные каталоги, чтобы не затереть узкие ежедневные файлы:

- `data/sources-full/*.json` — полные source-файлы;
- `data/sources-full/dina-scope-categories.candidate.json` — кандидат нового набора категорий Dina (результат `pnpm scope:dina`, минимальное покрытие товаров, попадающих по словарю в публикуемые категории);
- `data/sync-full/unmapped.json` — товары вне словаря по полному каталогу.

Упавший скрапер, `scope:dina` или `sync` дают ненулевой код и `failed` у юнита; ничего не публикуется в любом случае.

**Ручной коммит набора категорий.** Кандидат сам не применяется: изменение набора должно быть осознанным. После воскресного прогона — через обычный PR:

```bash
# 1. На машине разработчика, в checkout репозитория на свежем main: забрать кандидат с VPS
git switch -c data/refresh-dina-scope
scp <vps>:/opt/aktau-sync/data/sources-full/dina-scope-categories.candidate.json data/mapping/dina-scope-categories.json
git diff data/mapping/dina-scope-categories.json          # просмотреть изменения набора
git add data/mapping/dina-scope-categories.json && git commit -m "data(mapping): refresh dina scope categories"
git push -u origin HEAD                                    # дальше — PR и мерж в main

# 2. После мержа — exact-main CI и согласованный publisher/C2 promotion.
# Не выполнять git pull или менять root sourceSha вручную.
# См. docs/production/BACKEND2_SYNC_C2_AUTOMATED_PROMOTION_HANDOFF.md.
```

Не коммитьте прямо в `/opt/aktau-sync`: локальный коммит создаёт source authority drift.
Publisher и весь immutable C2 kit обновляются одной проверяемой транзакцией.

Новые категории в диффе значат, что в магазине появились товары в категориях вне старого набора: до коммита ежедневный прогон их не видит. Разрастание набора в разы тоже повод разобраться, прежде чем коммитить.

**Новые товары.** `data/sync/unmapped.json` (ежедневный) и `data/sync-full/unmapped.json` (еженедельный, полный каталог) — товары, которых нет в словаре. До их обработки они видны на сайте одиночными карточками. Раз в неделю их обработку запускает `agent:new` (Task 18 плана; выбор агента за Денисом).
