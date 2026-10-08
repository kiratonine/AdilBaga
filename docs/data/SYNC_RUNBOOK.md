# Ежедневное обновление цен (`pnpm sync`)

Решение команды от 2026-10-06 (SCRUM-7, Phase A2): регулярное обновление не использует LLM.

## 1. Что делает

```text
scrape:dina / scrape:dana / scrape:fixprice   →  data/sources/*.json
pnpm sync (словарь data/mapping/dictionary.json) →  data/sync/bundle.json + data/sync/unmapped.json
go run ./cmd/ingest -bundle data/sync/bundle.json [-apply]   →  новый snapshot (staging, quality gates, атомарный publish)
```

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

В production дополнительно `APP_ENV=production` и `INGEST_PRODUCTION_APPLY_CONFIRM=1` (только по решению владельца). Скрипт сначала делает dry-run, затем `-apply`; `set -e` останавливает его на первой ошибке.

## 3. Расписание (SCRUM-8)

Юниты `systemd` на 06:00 и 18:00 по Актау (UTC+5 → `01:00` и `13:00` UTC) лежат в `ops/sync/` (`aktau-sync.service`, `aktau-sync.timer`, `aktau-sync.env.example`); установка — `ops/sync/README.md`.

`User=` — отдельный пользователь, файл env с правами `600`. Одновременный запуск двух ingest исключён advisory lock в `cmd/ingest`.

## 4. Если упало

Смотрите `failureCode` в JSON-выводе `cmd/ingest`:

| Код / симптом | Что значит и что делать |
|---|---|
| `required_source_missing` | в bundle нет товаров одной из сетей — скрапер сети упал или вернул пустой файл |
| `store_count_drop` | товаров сети стало заметно меньше (порог `INGEST_MAX_STORE_DROP_PERCENT`) — проверить источник, не публиковать |
| `canonical_merge_conflict` | словарь меняли (объединили карточки) — запустить `cmd/ingest` с `-recluster` |
| ошибка скрапера / `sync` | snapshot не публикуется, на сайте остаются вчерашние цены |
| `... source file is stale` | файл источника старше порога — перезапустить соответствующий `pnpm scrape:*` |

## 5. Новые товары

`data/sync/unmapped.json` — товары, которых нет в словаре. До их обработки они видны на сайте одиночными карточками. Раз в неделю их обработку запускает `agent:new` (Task 18 плана; выбор агента за Денисом).
