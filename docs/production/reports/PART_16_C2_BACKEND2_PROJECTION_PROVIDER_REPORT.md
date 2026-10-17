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
