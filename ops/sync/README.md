# Регулярный sync цен (systemd)

Два таймера:

- `aktau-sync.timer` запускает `pipeline/scripts/daily-sync.sh` дважды в день: 06:00 и 18:00 по Актау (`01:00` и `13:00` UTC). Три скрапера идут параллельно, затем sync по словарю и ingest с публикацией snapshot. Занимает около 4 минут (замер 2026-10-13): критический путь — HTML-скрапер Dana (~3,7 мин, не менялся; переход на JSON-адаптер — следующая задача, spec §6), Dina и Fix Price — по ~22 с. Лимит юнита `TimeoutStartSec=20min`; каждый скрапер дополнительно ограничен `SCRAPE_TIMEOUT_SEC` (по умолчанию 720 с): зависший скрапер убивается и считается упавшим (сеть берётся из прошлого файла, exit 3), остальные сети публикуются.
- `aktau-sync-full.timer` запускает `pipeline/scripts/weekly-full-scrape.sh` раз в неделю: воскресенье 22:00 UTC (понедельник 03:00 по Актау). Это полный скрап каталога (`SCRAPE_ALL=1`) **без публикации**: ingest не запускается. Лимит `TimeoutStartSec=2h`.

Ingestion не входит в API-релиз (`deploy/`) и ставится отдельно.

## Состояние sync-VPS — 2026-10-23

Read-only readback `/opt/aktau-sync` под пользователем `aktau-sync` подтвердил:

| Назначение | Ветка | Exact HEAD |
|---|---|---|
| Текущий publisher, clean | `deploy/dina-weight-sync-part32` (есть на origin) | `fd2b9a3eec417f739299e3d1ccc1d3d6b09860fd` |
| Предыдущая локальная rollback-точка | `deploy/part32-site-bb1842bfc3ad` | `bb1842bfc3ad25e74840072482801a8656ec7679` |
| Исторический SCRUM-19 checkout, не текущий | `deploy/scrum19-sync` | `28cc3fc2c25c434e166874e8f5b08e48d0e3b6df` |

Это датированное evidence, не автоматический выбор ветки для будущего deploy.
Перед любой операцией заново проверять branch, полный HEAD и status. Локальный
`main` на VPS не является текущим publisher; слепой `pull` недопустим. Существующие
deploy/rollback-ветки не удалять; новая deploy-ветка для этой сверки не нужна.

VPS reflog фиксирует checkout с `deploy/part32-c2-auto-ff567dd` на
`deploy/part32-site-bb1842bfc3ad` **2026-10-22 01:31:15 UTC**. Это соответствует
Owner-authorized PR #63 rollout из operational appendix
[Part32 report](../../docs/production/reports/PART_32_C2_BEFORE_STAGE_INTEGRATION_REPORT.md),
а не свидетельствует о несанкционированном вмешательстве. Reflog сам по себе не
доказывает личность физического оператора. Переход на текущую Dina-ветку записан
**2026-10-23 10:48:46 UTC**.

Current `fd2b9a3` — `bb1842b` плюс Dina weight-price fix. GitHub PR #69 merged;
main на момент сверки — `3d85bf9b5a7c0dc784f4868d1bd04ebb958a6c2d`, CI
[39938645374](https://github.com/kiratonine/AdilBaga/actions/runs/39938645374) —
9/9 SUCCESS. Git blob обоих Dina-файлов совпадает между current publisher и main:
`pipeline/src/scrapers/dina.ts` — `1daba18219e4841fd8c901182ee7edee5cc7dd05`,
`pipeline/test/dina.test.ts` — `b5b1afd4d84826232f6fc3c0f3497947f6912cd0`.
Другой commit SHA не означает потери исправления и не требует checkout main.
Возврат к предыдущему коду потеряет Dina fix; наличие rollback-ref не разрешает
его применение без отдельной оценки. Backend2-reported публикация snapshot
`caedadfb-a455-46d4-9d38-4e92d6357ed8` 23 октября 10:53 UTC здесь не повторялась
и независимо через БД не проверялась.

**Отдельная эксплуатационная проблема — `C2_SOURCE_AUTHORITY_DRIFT`.**
Read-only сравнение root-controlled `automatic.json.sourceSha` с реальным
publisher HEAD вернуло **MISMATCH** (содержимое trust records не публиковалось).
На момент проверки `aktau-c2-custodian.service`: failed, Result=exit-code,
ExecMainStatus=1; оба sync oneshot: inactive, Result=success, ExecMainStatus=0,
таймеры daily/weekly доступны. Последний найденный `c2_launch`:
**2026-10-23 10:52:34 UTC, `not_armed`**. Это не C2 PASS; точная причина exit1
этой сверкой не устанавливалась, и ledger/convergence acceptance не проверялись.
Owner/Backend1 должны отдельно выполнить reviewed exact-source C2 authority
reconciliation для действующего Dina publisher, не откатывая исправление Dina
и не подменяя root trust records. Эта документационная сверка не выполняет такую
операцию и не запускает повторную публикацию.

## Коды выхода ежедневного прогона

| Код | Значение | Статус юнита |
|---|---|---|
| `0` | все три скрапера удачны, snapshot опубликован | `SUCCESS` |
| `1` | ошибка sync/ingest или упали все три скрапера; snapshot не опубликован, на сайте остаются прошлые цены | `failed` |
| `3` | snapshot опубликован, но хотя бы одна сеть взята из прошлого удачного файла (не старше `SYNC_MAX_SOURCE_AGE_HOURS`, 36 ч); в журнале строка `[sync] stale stores: <список>` | `failed` |

Код `3` намеренно даёт `failed` (в юните нет `SuccessExitStatus`), чтобы проблема со скрапером была видна, хотя сайт обновился.

Еженедельный прогон: `0` — всё удачно, любой ненулевой код — упал скрапер (тогда `scope` и `sync` не запускаются), `scope:dina`/`scope:dana` или `sync`. Упавший scope-шаг `sync` не пропускает: `unmapped.json` обновляется, а в конце в журнале `[full] failed scope steps: <список>` и код 1.

## Требования на VPS

- checkout репозитория в `/opt/aktau-sync`, Node + pnpm (`pnpm install --frozen-lockfile` в `pipeline/`), Go (ожидается в `/usr/local/go/bin`, иначе поправьте `PATH` в юнитах; `Node` и `pnpm` должны быть в `/usr/local/bin` или `/usr/bin`);
- системный пользователь `aktau-sync` с доступом на чтение/запись в `/opt/aktau-sync/data` (и на чтение репозитория; запись в `.git` нужна для обновления кода, см. ниже);
- без `GEMINI_API_KEY*` — sync не использует LLM;
- каталог `/opt/aktau-sync` отдельный: на production-VPS `/opt/adilbaga` занят `compose.production.yml` боевого Go API, туда sync не кладётся и API не затрагивается;
- у production-VPS нет IPv6, поэтому `INGEST_DATABASE_URL` указывает на Supabase **session pooler** (порт 5432; логин вида `aktau_ingest_runtime.<project_ref>`), а не на прямой хост `db.<project_ref>.supabase.co` (только IPv6). Порт 6543 (transaction pooler) не использовать.

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

Новый протокол согласованного promotion описан в
[Backend2 handoff](../../docs/production/BACKEND2_SYNC_C2_AUTOMATED_PROMOTION_HANDOFF.md).
Датированная сверка выше сохраняется как история; актуальный результат установки
следует брать из handoff и [Owner report](../../docs/production/reports/SYNC_C2_PROMOTION_OWNER_REPORT.md).
Source-кандидат добавляет отдельные build/promotion workflows, root executor и
shared/exclusive runtime gate. Готовность source не означает готовность установки.
`AUTO_DEPLOY_ENABLED` не используется и остаётся `false`.
Publisher automation управляется только `SYNC_C2_PROMOTION_ENABLED`.
Frontend/docs/API-only push не должен переключать publisher.
Source/kit alignment не является C2 convergence PASS.

Сначала только readback (без fetch/pull/checkout и без запуска sync):

```bash
sudo -n -u aktau-sync -H git --no-optional-locks -C /opt/aktau-sync rev-parse --abbrev-ref HEAD
sudo -n -u aktau-sync -H git --no-optional-locks -C /opt/aktau-sync rev-parse HEAD
sudo -n -u aktau-sync -H git --no-optional-locks -C /opt/aktau-sync status --porcelain=v1
```

Сопоставить фактический HEAD с отдельно утверждённым целевым полным commit SHA
и GitHub ref; проверить clean checkout и отсутствие активного daily/weekly sync.
До возможного переключения сохранить и проверить существующую rollback-точку
и совместимость SCRUM-19/C2. При неожиданной ветке, dirty tree или authority drift
остановиться: не делать автоматический checkout/merge/pull main, reset или clean.
Само переключение выполняется только по отдельному exact-source rollout plan;
этот раздел не является готовым автоматическим переключателем.

`pnpm install --frozen-lockfile` в `pipeline/` под `aktau-sync` нужен после
одобренного обновления зависимостей, не для read-only сверки. Обновление юнитов и
`daemon-reload` также требуют отдельного разрешения; текущая сверка их не меняет.

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
- `data/sources-full/dana-scope-sections.candidate.json` — **кандидат** набора подразделов Dana (`pnpm scope:dana`; завершается с кодом 1, если у товаров scope нет подраздела, тогда еженедельный прогон падает, а кандидат всё равно записан для разбора);
- `data/sync-full/unmapped.json` — товары вне словаря для еженедельной обработки новых товаров.

Кандидат не применяется автоматически. Набор категорий меняется осознанно, вручную, через обычный PR:

```bash
# 1. На машине разработчика, в checkout репозитория на свежем main: забрать кандидат с VPS
git switch -c data/refresh-dina-scope
scp <vps>:/opt/aktau-sync/data/sources-full/dina-scope-categories.candidate.json data/mapping/dina-scope-categories.json
git diff data/mapping/dina-scope-categories.json          # просмотреть изменения набора
git add data/mapping/dina-scope-categories.json && git commit -m "data(mapping): refresh dina scope categories"
git push -u origin HEAD                                    # дальше — PR и мерж в main

# 2. После мержа — выполнить readback и exact-source admission из раздела
# «Обновление кода на VPS», не переключать publisher автоматически.
```

Кандидат Dana обновляется так же: `scp <vps>:/opt/aktau-sync/data/sources-full/dana-scope-sections.candidate.json data/mapping/dana-scope-sections.json`, ветка `data/refresh-dana-scope`, коммит `data(mapping): refresh dana scope sections`, PR и мерж в `main`, затем отдельный exact-source rollout после readback, не слепой pull на VPS.

Режимы Dana в журнале: `[DANA] mode: sections` (штатный, ~70 с), `legacy root` (нет или устарел scope-файл, ~80 с), `full` (еженедельный). `DANA_CONCURRENCY` по умолчанию 3, максимум 4; при 429/5xx от Dana поставить `1` в `/etc/aktau-sync.env`. Если подраздел пропал с сайта или упал, скрап Dana завершается с ошибкой, прежний файл остаётся, юнит получает exit 3 (stale `dana`).

Не коммитьте прямо в `/opt/aktau-sync`: локальный коммит создаёт неутверждённый source drift, а у пользователя `aktau-sync` нет прав на push.

Разбор ошибок — `docs/data/SYNC_RUNBOOK.md §4`, еженедельный прогон — `§5`.

## Part32: установленный launcher и отдельная C2 authority

`daily-sync.sh` delegates its unchanged dry-run then apply pair to
`pipeline/scripts/c2-ingest-launch.py`. Ordinary unarmed execution still uses
`go run ./cmd/ingest`; all inherited `C2_*` variables are stripped. Stale-source
exit3, all-source failure, quality/dry-run/apply failures and publication behavior
are preserved. No retry, additional publication, timer or scraper is introduced.
The explicit `GOTOOLCHAIN=local` means a future checkout update requires an
already installed Go1.27.3; it must not silently fetch a new toolchain on the VPS.

C2 selection is opt-in through the existing independently installed root records,
not through user env values. It uses only the approved fixed immutable ingest
ELF and the existing private BEFORE/READY protocol; see
[C2 custody and prerequisites](../c2/README.md#scheduled-immutable-ingest-candidate-review-required-not-activation).
The launcher was deployed during the Owner-authorized Part32 rollout; the dated
publisher readback is above. This does not imply that every later source SHA is
approved for immutable C2. Ordinary `not_armed` publication is fail-open ingestion,
**not C2_PASS**, and does not qualify any convergence acceptance measurement.
Every future source switch must reconcile the publisher HEAD with the separately
approved C2 source authority, immutable artifacts and process-bound READY.
Never edit the root source pin, authorization, hashes, installed ELF or READY merely
to make a new checkout appear trusted. Preserve SCRUM-19/Dina and the known rollback;
checkout/toolchain/namespace/systemd changes require their own approval.

On C2 authority loss after an immutable dry-run, the launcher repeats the
**complete ordinary read-only dry-run/apply pair**, never ordinary apply alone.
Only a proven pre-exec failure can also select that fallback. Once any apply
program starts, no fallback or second apply is allowed, including nonzero,
uncertain wait or cancellation. SIGTERM/SIGINT preserve143/130 CLI status;
the existing scheduled script still maps publish-step failure to1. SCRUM-19,
source-stale exit3, bundle arguments and the root trust/Go1.27.3 gates are unchanged.
