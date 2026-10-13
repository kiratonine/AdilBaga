# Регулярный sync цен (systemd)

Два таймера:

- `aktau-sync.timer` запускает `pipeline/scripts/daily-sync.sh` дважды в день: 06:00 и 18:00 по Актау (`01:00` и `13:00` UTC). Три скрапера идут параллельно, затем sync по словарю и ingest с публикацией snapshot. Занимает около 4 минут (замер 2026-10-13): критический путь — HTML-скрапер Dana (~3,7 мин, не менялся; переход на JSON-адаптер — следующая задача, spec §6), Dina и Fix Price — по ~22 с. Лимит юнита `TimeoutStartSec=20min`.
- `aktau-sync-full.timer` запускает `pipeline/scripts/weekly-full-scrape.sh` раз в неделю: воскресенье 22:00 UTC (понедельник 03:00 по Актау). Это полный скрап каталога (`SCRAPE_ALL=1`) **без публикации**: ingest не запускается. Лимит `TimeoutStartSec=2h`.

Ingestion не входит в API-релиз (`deploy/`) и ставится отдельно.

## Коды выхода ежедневного прогона

| Код | Значение | Статус юнита |
|---|---|---|
| `0` | все три скрапера удачны, snapshot опубликован | `SUCCESS` |
| `1` | ошибка sync/ingest или упали все три скрапера; snapshot не опубликован, на сайте остаются прошлые цены | `failed` |
| `3` | snapshot опубликован, но хотя бы одна сеть взята из прошлого удачного файла (не старше `SYNC_MAX_SOURCE_AGE_HOURS`, 36 ч); в журнале строка `[sync] stale stores: <список>` | `failed` |

Код `3` намеренно даёт `failed` (в юните нет `SuccessExitStatus`), чтобы проблема со скрапером была видна, хотя сайт обновился.

Еженедельный прогон: `0` — всё удачно, любой ненулевой код — упал скрапер, `scope:dina` или `sync`.

## Требования на VPS

- checkout репозитория в `/opt/adilbaga`, Node + pnpm (`pnpm install --frozen-lockfile` в `pipeline/`), Go (ожидается в `/usr/local/go/bin`, иначе поправьте `PATH` в юнитах; `Node` и `pnpm` должны быть в `/usr/local/bin` или `/usr/bin`);
- системный пользователь `aktau-sync` с доступом на чтение/запись в `/opt/adilbaga/data` (и на чтение репозитория; запись в `.git` нужна для обновления кода, см. ниже);
- без `GEMINI_API_KEY*` — sync не использует LLM.

## Установка

```bash
sudo cp ops/sync/aktau-sync.service ops/sync/aktau-sync.timer \
        ops/sync/aktau-sync-full.service ops/sync/aktau-sync-full.timer /etc/systemd/system/
sudo install -m 600 -o aktau-sync ops/sync/aktau-sync.env.example /etc/aktau-sync.env
sudoedit /etc/aktau-sync.env     # заполнить INGEST_DATABASE_URL и REVALIDATE_HMAC_SECRET; FIXPRICE_* уже заданы
sudo systemctl daemon-reload
sudo systemctl enable --now aktau-sync.timer aktau-sync-full.timer
```

Еженедельный юнит читает тот же `/etc/aktau-sync.env`, но ему нужны только `FIXPRICE_*` (скрапер Fix Price); `INGEST_*` и `REVALIDATE_*` он не использует.

## Обновление кода на VPS

```bash
sudo -u aktau-sync git -C /opt/adilbaga pull --ff-only
cd /opt/adilbaga/pipeline && sudo -u aktau-sync pnpm install --frozen-lockfile
```

`pnpm install` нужен только если менялись `package.json` / `pnpm-lock.yaml`, но безопасно запускать всегда. После обновления юнитов из `ops/sync/` скопируйте их заново и выполните `sudo systemctl daemon-reload`.

## Эксплуатация

```bash
systemctl list-timers 'aktau-sync*'      # ближайшие запуски обоих таймеров
sudo systemctl start aktau-sync          # ручной запуск ежедневного прогона
sudo systemctl start aktau-sync-full     # ручной запуск полного скрапа (долгий, без публикации)
journalctl -u aktau-sync -n 200          # логи ежедневного прогона
journalctl -u aktau-sync-full -n 200     # логи полного скрапа
systemctl status aktau-sync              # status=0/SUCCESS или failed
```

В журнале каждая строка скрапера помечена сетью (`[dina]`, `[dana]`, `[fixprice]`), а итог сети — строкой `[sync] <сеть> exit=<код> took=<N>s` (`[full] ...` в еженедельном прогоне).

## Результат полного скрапа

Полный прогон пишет в отдельные каталоги и не затирает узкие ежедневные файлы:

- `data/sources-full/*.json` — полные source-файлы сетей;
- `data/sources-full/dina-scope-categories.candidate.json` — **кандидат** нового набора категорий Dina (его пересчитывает `pnpm scope:dina`);
- `data/sync-full/unmapped.json` — товары вне словаря для еженедельной обработки новых товаров.

Кандидат не применяется автоматически. Набор категорий меняется осознанно, вручную, через обычный PR:

```bash
# 1. На машине разработчика, в checkout репозитория на свежем main: забрать кандидат с VPS
git switch -c data/refresh-dina-scope
scp <vps>:/opt/adilbaga/data/sources-full/dina-scope-categories.candidate.json data/mapping/dina-scope-categories.json
git diff data/mapping/dina-scope-categories.json          # просмотреть изменения набора
git add data/mapping/dina-scope-categories.json && git commit -m "data(mapping): refresh dina scope categories"
git push -u origin HEAD                                    # дальше — PR и мерж в main

# 2. После мержа — на VPS
sudo -u aktau-sync git -C /opt/adilbaga pull --ff-only
```

Не коммитьте прямо в `/opt/adilbaga`: локальный коммит на VPS ломает `git pull --ff-only`, а у пользователя `aktau-sync` нет прав на push.

Разбор ошибок — `docs/data/SYNC_RUNBOOK.md §4`, еженедельный прогон — `§5`.
