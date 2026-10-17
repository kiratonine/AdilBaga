# Part 16 — C2 Projection Provider (Backend 2), локальный кандидат

> Append-only. Новые записи добавляются в конец, существующие не редактируются.

## 2026-10-17 — кандидат v2, до Code Review

**Основа:** `main` @ `61eccfb957237781a8b5c14110f4a73de4952e83`. Без commit/push/merge/deploy.
**Контракт:** `C2_BACKEND2_PROJECTION_SCHEMA_V2.md` (схема JSON v2, CLI, ACL) + `C2_BACKEND2_PROJECTION_CONTRACT_V2.md` (двухфазная схема, бюджет).
**Статус:** локально реализовано и проверено. Production не затрагивался, C2 остаётся **OPEN**.

### Изменённые и новые файлы

| Файл | Что |
|---|---|
| `backend-go/internal/postgres/c2projection.go` (новый) | `C2Project`: одна RepeatableRead read-only транзакция, ACL-проверка, цепочка snapshot, dashboard, категории, обход sitemap одним запросом, страницы категорий, выбор witness |
| `backend-go/cmd/c2projection/main.go` (новый) | One-shot CLI `before`/`after`, строгий разбор аргументов, коды выхода 0–4, один вызов записи stdout |
| `backend-go/cmd/c2projection/main_test.go` (новый) | Unit: аргументы, окружение, недоступная БД, хеш `canonicalStateId`, порядок ключей |
| `backend-go/cmd/c2projection/main_integration_test.go` (новый, `-tags=integration`) | E2E на эфемерной PG17 через `run()` |
| `scripts/ci/postgres.mjs` | + база `part16_c2` в списке эфемерных БД (миграции и проверка цепочки как у остальных) |
| `scripts/ci/run-db-integration.mjs` | + шаг `TestLocalC2Projection` (с `-race`) после создания `aktau_api_runtime` |

**Не менялись:** `internal/postgres/*.go` (кроме нового файла), `pool.go`, `internal/ingestion/*`, `internal/revalidation/*`, `cmd/ingest/*`, `cmd/api/*`, схема БД, миграции, REST, DTO, Next, HMAC, `daily-sync.sh`, systemd.

### Как переиспользуется существующий SQL

- Цепочка: `ListRecentPublishedSnapshots(ctx, 2)` без изменений.
- Dashboard: `GetDashboard` (`dashboardSQL`) без изменений. Внутри RR-транзакции его `current_snapshot` совпадает с уже проверенным latest.
- Категории: константа `listCategoriesSQL` без изменений.
- Sitemap и страницы категорий: `SELECT <cols> FROM (productBaseSQL + sortSQL(price_asc) + " LIMIT $5 OFFSET $6") c2_projection`. Внутренний текст побайтно тот же, что выполняет `products()` для `ListProducts`; offers не загружаются.
  - Sitemap: `$1='' $2='' $3='{}' $4='' $5=5001 $6=0`, колонки `id,slug,snapshot_at,min_price`. Ровно 5001 строка → `productCount=5000`, `truncated=true`, а строка с индексом 5000 не считается членом sitemap.
  - Страница категории: `$1=slug`, `LIMIT 24 OFFSET 0`, только `id`.
- `snapshotAt` форматируется `t.UTC().Format("2006-01-02T15:04:05.000Z")`, как `productWire` в `httpapi/catalog.go`. Integration-тест сверяет значение с `GetProductByID`.

### Бюджет запросов (структурный)

| Фаза | Запросы |
|---|---|
| before | ACL 1 + цепочка 1 + dashboard 1 + категории 1 + sitemap 1 + страницы категорий ≤ 8 (различные slug кандидатов) = **≤ 13** |
| after | ACL 1 + цепочка 1 + dashboard 1 + категории 1 + sitemap 1 + страница категории 1 = **6** |

Измерено локально (PG17 в Docker на Windows-хосте): BEFORE по 5013 товарам — **70.8 ms**. Это ориентир, не обещание для VPS.

### Read-only identity (P1-1)

1. `OpenProductionReadOnly` (при `APP_ENV=production`) или `OpenReadOnly` (test/development), `pool.go` не менялся.
2. `pool.Acquire` + `Ping`: lazy pool проверяет `AfterConnect` (read-only сессия; в production — `productionIdentitySQL`). Ошибка → exit 3.
3. Первый запрос в транзакции — `c2ReadOnlyACLSQL`: `transaction_read_only='on'`, нет `CREATE` на БД и схемы, нет `INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES` на таблицы (включая column-level), нет `UPDATE` на sequence. Учитываются прямые, `PUBLIC` и унаследованные права. `false` → exit 3.

**Mutation check:** при подмене ACL-запроса на `SELECT true OR …` integration-тест падает на первом отрицательном случае (`direct INSERT accepted: exit 0`). После проверки код восстановлен.

### Отличия от текста схемы v2 (уточнения, не изменения контракта)

- `candidates[].slug` / `snapshotAt` / `sitemapIndex` = `null` означает, что товара нет среди первых 5001 строк обхода sitemap, в том числе если его вообще нет в snapshot. Отдельного запроса для товаров за границей нет: такой кандидат всё равно не может быть witness. `categoryIndex` тогда тоже `null`.
- `previousSnapshotId = null`, если предшественника нет или его id не UUID (например, исторический `baseline-internal-v1`). Для AFTER предшественник обязан быть UUID и равен `-previous`, иначе exit 4.
- BEFORE без опубликованного UUID-snapshot → exit 4.
- В AFTER `categoryPages[0].slug` — это `-slug` из BEFORE, а `candidates[0].slug` — фактический slug в S1. Расхождение не ошибка провайдера, его ловит verdict.
- Вывод отклоняется (exit 1), если любой id или slug не проходит regex схемы, если в обходе дубль id или нарушен порядок `min_price`, а также если `dashboardAt` не в формате `.SSSZ`.

### Проверки (локально, Windows, Go 1.27.2)

| Проверка | Результат |
|---|---|
| `gofmt -l .` | пусто |
| `go mod tidy` + `git diff --exit-code go.mod go.sum` | без изменений |
| `go vet ./...`, `go vet -tags=integration ./...`, `GOOS=linux go vet ./...` | PASS |
| `go test -count=1 ./...` | PASS |
| `staticcheck ./...` и `-tags=integration` с `GOOS=linux` (как в CI) | PASS |
| `go tool govulncheck ./...` | No vulnerabilities found |
| `go build ./cmd/c2projection` | PASS |
| `TestLocalC2Projection` на эфемерной PG17 (`postgres:17-alpine`, миграции из `backend/prisma/migrations`, `aktau_api_reader` + `aktau_api_runtime` как в CI) | PASS (1.10 s) |

**Не выполнено локально:** `go test -race` (на Windows нет cgo; в CI шаг запускается с `-race`). Полный `node scripts/ci/run-db-integration.mjs` локально не запускался: миграции применены напрямую через `psql`, а не `prisma migrate deploy`. Остальные integration-шаги CI не затронуты.

### Покрытие `TestLocalC2Projection`

Положительные случаи:
- BEFORE по S0, пока S1 ещё `validating`: Top-8 = `p12…p05`, witness `p05` (минимальный id), индексы 7/4/4, `productCount=12`, детерминированный `canonicalStateId`;
- AFTER после публикации S1 и мутации canonical masters: цепочка `[S1,S0]`, ровно один кандидат (закреплённый witness), новые `dashboardAt` и `snapshotAt`, `canonicalStateId` ≠ BEFORE;
- отсутствующий witness (`ghost`) → exit 0, все поля `null`, замены нет.

Отрицательные случаи, все с пустым stdout:

| Случай | Код |
|---|---|
| пустая история | 4 |
| AFTER до COMMIT S1 | 4 |
| неверный `-snapshot` | 4 |
| неверный `-previous` | 4 |
| промежуточная публикация S2 | 4 |
| прямой INSERT | 3 |
| UPDATE для PUBLIC | 3 |
| column UPDATE | 3 |
| sequence UPDATE | 3 |
| CREATE на схему | 3 |
| CREATE на базу | 3 |
| membership `WITH SET TRUE` | 3 |
| суперпользователь в production (identity) | 3 |
| суперпользователь вне production (ACL) | 3 |
| недоступная БД (unit) | 3 |
| невалидные аргументы и окружение (unit, 19 + 7 случаев) | 2 |

После снятия grants провайдер снова допускается.

Граница sitemap: S2 с 5001 более дешёвым товаром → `productCount=5000`, `truncated=true`, ни один кандидат не получает `sitemapIndex`, `witnessId=null`.

### Что дальше

- Code Review этого кандидата (Backend 1 / независимый).
- Совместный локальный PoC: настоящие `Stage`/`Publish` S1 (как `ingestor_integration_test.go`) → AFTER → Node verdict на одной версии исходников. Synthetic provider в Node заменяется production-disabled адаптером к этому CLI (зона Backend 1).
- Production (роль/DSN, запуск провайдера и observer, хранение evidence) — только с отдельного разрешения Owner.

## 2026-10-17 — Owner-approved P1 JSON16KiB / P2 semantics correction

**READY_FOR_EXTERNAL_REVIEW для узкой source correction.** Production C2 OPEN;
полный общий DB integration runner не прошёл из-за существующего allowlist
guard (подробности ниже). Его PASS не заявляется. Исторические результаты выше
сохранены без изменений.

После fetch origin --prune (exit0) фактический
origin/feat/part16-c2-projection-provider совпал с разрешённым SHA
**2fbe48dfdd5264700c1fcd0ee2a17a841418572e**. Созданы отдельный native-WSL
worktree и ветка **fix/part16-c2-provider-json16k** от этого exact SHA. Исходная
ветка Backend2 и другие worktrees не изменены. Начальный worktree был чистым.
Использованы только корневые AGENTS instructions.

### P1: точный предел с завершающим LF

В document() изменено только условие размера:

```go
if err != nil || len(out)+1 >= 16<<10 {
```

Успешный stdout — один неизменённый JSON плюс один LF, суммарно **строго меньше
16384 байт**. Превышение возвращает nil/error без усечения. Существующий emit()
при этой ошибке возвращает exit1 до единственного stdout.Write; эта логика не
изменялась. canonicalStateId по-прежнему SHA256 исходных байтов embedded body.

Регрессия добавлена **до** правки условия. Старая реализация приняла bounded
BEFORE с8 категориями,24 уникальными product IDs длиной128 в каждой категории:
**29484 байта включая LF**. Негативный subtest упал, команда exit1. Малый вариант
с той же структурой и короткими ID успешно сериализовался: **4404 байта с LF**.
После исправления oversized-вариант возвращает nil/error. Малый вариант проходит;
проверены размер повторно сериализованного JSON+LF, единственный LF, embedded
body, canonicalStateId и прежний порядок/формат успешного envelope.

### P2: null не является доказательством отсутствия товара

slug/snapshotAt/sitemapIndex=null могут означать отсутствие товара либо отсутствие
в доступной bounded sitemap projection, а не обязательно отсутствие в snapshot.
Провайдер читает максимум5001 строку, sitemap включает первые5000. Для строки
на позиции5000 slug/snapshotAt могут быть известны, но sitemapIndex остаётся null;
за пределами прочитанного подмножества эти данные вообще не устанавливаются.
Кандидат без подтверждённого sitemap membership не становится witness:
fail-closed, без выбора замены в AFTER. Это уточнение существующей семантики;
SQL, JSON v2, выбор witness, chain, ACL/privileges не менялись.

### Фактические проверки

WSL, Go1.27.2 из уже установленного toolchain; Node24.10.0 для локального CI
runner. Чистое process environment, без production DSN/provider settings.

| Команда / проверка | Фактический результат |
| --- | --- |
| go test -count=1 ./cmd/c2projection -run '^TestDocumentSizeLimit$' -v, до исправления | exit1; small PASS, oversized FAIL: старый код принял29484 bytes с LF |
| gofmt -w cmd/c2projection/main.go cmd/c2projection/main_test.go | exit0 |
| gofmt -l . | exit0, пустой вывод |
| go test -count=1 ./cmd/c2projection | exit0 PASS |
| go test -count=1 ./... | exit0 PASS |
| go test -race -count=1 ./... | exit0 PASS |
| go vet ./... | exit0 PASS |
| node scripts/ci/run-db-integration.mjs | **exit1 FAIL**: existing scripts/ci/common.mjs localURL rejects part16_c2; ни один Go integration шаг этого runner не достигнут |
| go test -count=1 -race -tags=integration ./cmd/c2projection -run '^TestLocalC2Projection$' -v, отдельный ephemeral PG17 профиль | exit0 PASS; test3.28s / package4.301s; BEFORE по5013 продуктам278.983436ms — один локальный замер, не production benchmark |

Общий runner создал собственную loopback PG17, применил Prisma migrations в
пяти предыдущих disposable БД, создал part16_c2, затем остановился **до** её
миграций: allowlist в common.mjs не содержит part16_c2, хотя postgres.mjs
включает эту БД. Его finally удалил только собственный container/volume. Guard
не ослаблялся и не исправлялся в этом scope. Этот отдельный integration-harness
вопрос требует Backend2 review перед заявлением полного CI DB-profile PASS.

Для выполнения существующего C2 test создан другой owned disposable
postgres:17-alpine, bind только127.0.0.1 со случайным портом. Четыре существующих
migration.sql применены без изменений непосредственно psql, как в историческом
Backend2 local test; Prisma migration-history parity этим способом не заявляется.
Bootstrap reader и runtime membership взяты из существующего профиля. Запущен
неизменённый TestLocalC2Projection с его C2_DISPOSABLE_CONFIRM/loopback guard,
положительными проекциями, цепочкой, отрицательными ACL/identity cases и sitemap
границей5000. Контейнер и его собственный volume удалены после exit0. Другие
контейнеры не трогались. Это не замена результата FAIL общего runner и не
совместный Go/Node production-provider PoC.

Точный scope: backend-go/cmd/c2projection/main.go,
backend-go/cmd/c2projection/main_test.go и этот append-only report. Никаких
изменений repository SQL, ingestion/Notify/HMAC, schema/migrations, API,
scheduler, production config или чужой ветки. Production SSH/SQL/HTTP, deploy,
commit/push/PR/merge не выполнялись.

Clean review artifact: **adilbaga-c2-provider-json16k-fix-20261017.tar.gz**,
штатный target full-stack. STOP для независимого Code Review; production и
полный общий DB runner не объявляются PASS.

## 2026-10-17 — CI database allowlist correction and PR preparation

**READY_FOR_EXTERNAL_REVIEW. Полный локальный DB integration profile — PASS.**
Предыдущий FAIL сохранён выше как историческое evidence, не переписан.
Совместный Go/Node PoC ещё **НЕ ВЫПОЛНЯЛСЯ**; production C2 остаётся OPEN.

Owner/Backend2 разрешили эту точечную correction и commit/push/отдельный PR
только после полного локального test gate. Работа продолжена в существующем
worktree, ветка fix/part16-c2-provider-json16k. Fetch exit0; HEAD и исходная
origin/feat/part16-c2-projection-provider совпали с
2fbe48dfdd5264700c1fcd0ee2a17a841418572e. origin/main:
61eccfb957237781a8b5c14110f4a73de4952e83. Чужие worktrees не изменялись.

### Regression-first и минимальный diff

До изменения regex добавлены два теста. `node --test scripts/ci/guard.test.mjs`
дал exit1:5 PASS,1 FAIL. Позитивный тест воспроизвёл отказ part16_c2; все старые
базы и отрицательные случаи продолжали вести себя ожидаемо.

В common.mjs добавлена **только** альтернатива16_c2 в anchored database allowlist:

```js
/^\/part(?:04_fixture|04_security|08|10_security|11_recovery|16_c2)$/
```

Проверки protocol, loopback host, port, username, password, exact sslmode/query
и hash остались побайтно прежними. Позитивный тест покрывает все шесть разрешённых
имён. Отрицательный — part16_c2x, произвольное имя, remote host, localhost,
изменённый пароль, дополнительные query params и отсутствие port. Старые guard
assertions не ослаблены. postgres.mjs и run-db-integration.mjs не изменены.
JSON16KiB condition, byte/framing/hash tests и P2 null clarification сохранены.

### Реально выполненный test gate

Чистое process environment: WSL, Node24.10.0, Go1.27.2, Docker PG17. Ни один
production DSN, provider secret или существующий контейнер не использовался.

| Команда | Exit / результат |
| --- | --- |
| node --test scripts/ci/guard.test.mjs, после correction | 0;6/6 PASS,0 SKIP |
| node scripts/ci/run-db-integration.mjs | **0; полный профиль PASS**, включая cleanup |
| node scripts/ci/run-checks.mjs security | 0; source/workflow policy и synthetic backup guard PASS |
| go test -count=1 ./cmd/c2projection | 0 PASS |
| go test -count=1 ./... | 0 PASS |
| go test -race -count=1 ./... | 0 PASS |
| go vet ./... | 0 PASS |
| git diff --check | 0 PASS |

Полный runner сам создал новую owned postgres:17-alpine с loopback binding и
случайным портом. Frozen Nest install, Prisma migrate deploy и проверка цепочки
четырёх migrations выполнены для part04_fixture, part04_security, part08,
part10_security, part11_recovery и part16_c2. Все семь существующих Go integration
invocations завершились PASS с -race:

1. Destructive target guard, deterministic catalog, bootstrap fail-closed.
2. Production identity.
3. C2 projection: BEFORE/AFTER, chain, ACL/identity denials, sitemap boundary.
4. Ingestion transaction batch atomicity на disposable fixture only.
5. Snapshot security на disposable fixture only.
6. Physical pool policy, clone plans и observability selection.
7. Clone restricted security.

C2 test2.86s / package3.882s; BEFORE по5013 продуктам200.062054ms — только
один локальный диагностический замер, не performance/SLA claim. Никакие тесты
не пропускались и assertions/runner не подменялись. Штатный finally сообщил
PG cleanup PASS и удалил только созданный им container/anonymous volumes.
Таким образом прежний allowlist blocker закрыт полным runner, а не ручной заменой.

### Exact correction / publication scope

Пять файлов относительно исходного Backend2 SHA:

- backend-go/cmd/c2projection/main.go — approved JSON16KiB condition.
- backend-go/cmd/c2projection/main_test.go — approved size/framing/hash regressions.
- scripts/ci/common.mjs — только точное имя part16_c2 в allowlist.
- scripts/ci/guard.test.mjs — positive/negative regressions.
- docs/production/reports/PART_16_C2_BACKEND2_PROJECTION_PROVIDER_REPORT.md — append-only.

PR base main включает исходный Backend2 provider commit плюс эти corrections;
его исходные новые Go provider/CLI/integration и два DB-runner wiring файла
остаются без дополнительных изменений. PR35/PR38, frontend, HMAC, Notify,
ingest runtime, public API, scheduler, PostgreSQL roles/SQL/schema/migrations и
production не изменялись. Полный совместный Go provider/Node observer PoC и
любые production действия требуют отдельного review/разрешения.

Разрешённое publication: отдельный PR fix/part16-c2-provider-json16k -> main,
без merge/deploy. Точный новый commit SHA и PR URL передаются в итоговом handoff;
этот report не объявляет будущий Hosted CI PASS на основании локальных тестов.
Новый clean artifact: **adilbaga-c2-provider-ci-guard-fix-20261017.tar.gz**,
штатный target full-stack. STOP после publication/artifact для Code Review.
