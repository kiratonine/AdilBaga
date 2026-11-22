# Aktau Market — исправление пути brand-фильтра после HTTP 503

Base — `2db076d4ba21edc93cbaf04ace5db037d2785d15`, актуальный origin/main после PR #143. Ветка — `fix/brand-filter-snapshot-diagnostics`. Exact PR HEAD, ссылки и результат Hosted CI фиксируются в `ci-evidence.md` и `MANIFEST.json` review-архива после завершения CI. Это позволяет приложить результат проверки к неизменному коммиту.

RCA принят со статусом `INSUFFICIENT_EVIDENCE / RCA_REVIEW_PASS`. Исходный production 503 локализован до loopback GET во время перебора brand-вариантов. Стадию и причину того запроса установить по сохранённым данным невозможно. FIX сокращает подтверждённую повторную работу и при следующем 503 показывает фазу и доступный класс ошибки. Основание — локальный RCA-отчёт, исходный release report и зафиксированный исходный код. [PR #143](https://github.com/kiratonine/AdilBaga/pull/143)

## Изменение

- `catalog.ProductCatalogRepository.ListProductsWithFilters(ctx, category, build)` получает эффективную схему фильтров и передаёт её синхронному callback. HTTP вызывает существующий `parseProductQuery` с этой схемой. PostgreSQL-слой получает типизированный `ProductQuery`. Он использует ту же схему для проверки и выполняет выборку продуктов и offers в одном `REPEATABLE READ READ ONLY` snapshot. Callback только парсит данные в памяти. Транзакция закрывается до сериализации DTO.
- `ListProducts(ctx, ProductQuery)` продолжает сам загружать и проверять эффективную схему при прямом вызове с фильтрами. Обычный публичный GET пропускает discovery. Отдельный endpoint схемы, исходные brand в DTO, Title Case options, legacy URL, OR/AND, типы фильтров, сортировка и деньги сохранены. SQL выборки товаров и discovery совпадает побайтово с базой.
- `WithExactBrandFilters` остаётся на пути Voice в `cmd/api/main.go`. В общем пуле проверены одновременно 4 запроса каталога и 4 Voice. Каталог вернул все три написания, Voice — только товар с переданным точным написанием. Существующий staging подтвердил Voice parity, в том числе clarification/continue.
- Публикация нового snapshot и изменение canonical brand между discovery и products в disposable интеграции сохраняют старый бренд, цену, offers и snapshotAt для текущего запроса. Следующий запрос видит обновлённый набор допустимых опций. При 400, пустой странице, отмене и ошибках соединение возвращается в пул либо pgx утилизирует разорванное соединение. После fault-серии каталог возвращает 200 с товарами.

### Диагностика

На `GET /api/products` middleware создаёт состояние запроса. Трассировщики pgxpool/pgx наблюдают acquire и обозначенные вызовы SQL до преобразования ошибки в `databaseError`. Гистограммы `catalog_db|stage|reason` остаются внутри действующего Registry. Каждый label принадлежит конечному набору. Стадии включают `pool_acquire`, `snapshot`, `metadata`, `discovery`, `products`, `offers`. При ошибке без наблюдавшейся DB-фазы журнал использует `unknown`. Для 503 добавляется одно предупреждение `catalog_request_503` с `request_id`, шаблоном `/api/products`, `stage`, `reason_class` и длительностью фазы `duration_ms`. Обычный access log сохраняет свои поля, включая длительность запроса и `request_deadline` или `request_canceled`.

| Источник | Класс в диагностике и публичный результат |
| --- | --- |
| 57014 с известным сообщением PostgreSQL о statement timeout | `statement_timeout`. Прежний 503. |
| 57014 с известным сообщением PostgreSQL об отмене сервером | `sql_cancel`. Прежний 503. Класс не устанавливает субъекта отмены. |
| 57014 с иной формулировкой или локализацией | `sql_cancel_unknown`. Прежний 503. |
| Истёк контекст HTTP при acquire | `pool_wait_deadline`, стадия `pool_acquire`. Прежний 503. Acquire включает получение или инициализацию соединения. |
| Истёк контекст HTTP в SQL | `request_deadline` с фазой SQL. Прежний 503. |
| Клиент отменил запрос | `client_cancel` в метрике фазы, `request_canceled` в access log. В подтверждённом пути отмены ответ не записывается. |
| Ошибка подключения или независимая ошибка БД | `db_unavailable` или `other` до обезличивания. Публичный статус определяется прежним mapping. Проверенный отказ в правах вернул обезличенный 500. |

Классификация проверяет только тип, SQLSTATE и два точных известных текста PostgreSQL для 57014. В журнал и метрики попадают фиксированные классы. Значения SQL, аргументы, сообщение драйвера, DSN, query, бренд, заголовки и IP не передаются. Request ID сохраняется только в логе через существующую проверку заголовка. Ошибки acquire, которые возвращает BeginTx, сохраняют первую наблюдавшуюся причину. Конкурентный тест сопоставляет один 503-event с каждым из 16 request IDs, проверяет отсутствие переданного brand и отличает наблюдавшуюся ошибку SQL от generic request deadline.

Disposable fault injection зафиксировал четыре 503 с прежним JSON. Lock на offers дал `discovery/statement_timeout` за 5 001 мс. `pg_cancel_backend` дал `discovery/sql_cancel` за 3 мс. Внешний дедлайн тестового HTTP-контекста дал `discovery/request_deadline` за 748 мс. Четыре занятых слота исчерпали штатный 15-секундный бюджет и дали `pool_acquire/pool_wait_deadline` за 15 014 мс. Отмена клиента и независимая ошибка БД сохранили свои прежние outcomes. Тест проверил отсутствие синтетических маркеров query и заголовка в ответах и логах. Отменённое соединение освобождается асинхронно в pgx. Тест ждёт наблюдаемого освобождения слота и завершает серию успешным 200.

## Измерения

Disposable PostgreSQL 17.12 на loopback, 5 619 синтетических товаров, 64 472 offers в 8 snapshots. Оба Go HTTP Router, Go 1.27.4, pgx v5.11.0, read-only роль и runtime identity guard. Четыре соединения, SQL 5 с, HTTP 15 с. Cold означает новый пустой пул, буферы БД могли быть прогреты. Warm открывает четыре соединения заранее. В A/B сериях менялся порядок ревизий. Тестовый rate limit позволяет измерять БД без 429. Проверены Baraka, Dekmy и 3 Желания в dairy, groats и tea-coffee в трёх регистрах.

Тёплый ответ с товарами и динамическим фильтром использует **2 → 1** acquire/транзакции и **2 → 1** discovery. Число команд драйвера сокращается **12 → 7**, включая BEGIN/ROLLBACK. Четыре вызова policy/identity initialization при новом соединении учтены отдельно. У нефильтрованного запроса **1 → 1** транзакция, **0 → 0** discovery, **5 → 5** команд.

| Серия | HTTP p50 / p95 / max, база → FIX, мс | p95 суммы acquire на запрос, база → FIX, мс | p95 длительности отдельной транзакции, база → FIX, мс |
| --- | --- | --- | --- |
| Cold filtered, 1 воркер | 109,30 / 193,69 / 193,69 → 49,65 / 71,59 / 71,59 | 29,31 → 8,28 | 76,13 → 61,69 |
| Cold filtered, 3 воркера | 56,45 / 85,97 / 85,97 → 45,39 / 67,71 / 67,71 | 10,80 → 10,45 | 37,24 → 58,92 |
| Cold filtered, 8 воркеров | 94,12 / 118,26 / 134,34 → 51,62 / 79,25 / 84,54 | 63,65 → 48,54 | 38,94 → 42,15 |
| Warm filtered, 1 воркер | 35,37 / 69,19 / 77,77 → 21,04 / 39,57 / 52,92 | 0,007 → 0,035 | 35,96 → 38,04 |
| Warm filtered, 3 воркера | 40,65 / 77,06 / 83,65 → 22,28 / 39,52 / 48,15 | 0,007 → 0,039 | 40,38 → 38,14 |
| Warm filtered, 8 воркеров | 89,87 / 123,03 / 139,49 → 54,63 / 70,25 / 79,38 | 59,31 → 36,61 | 40,42 → 42,36 |
| Warm unfiltered, 8 воркеров | 25,75 / 36,09 / 39,04 → 27,73 / 36,40 / 52,37 | 16,06 → 16,26 | 20,67 → 22,42 |
| Warm mixed, filtered, 4+4 | 118,04 / 163,20 / 170,67 → 28,72 / 60,10 / 67,96 | 92,86 → 6,32 | 43,00 → 55,02 |
| Warm mixed, Voice, 4+4 | 223,85 / 247,05 / 258,38 → 211,59 / 245,14 / 248,52 | 76,06 → 56,58 | 95,70 → 106,63 |

Все запросы benchmark завершились со штатными 200/201, SQL errors, 429 и 503 отсутствуют. В warm filtered 216 запросов на каждый уровень параллелизма и ревизию. Cold — пять запусков на комбинацию. В смешанной волне — по четыре одновременно запроса каждого маршрута. Полные значения, включая warm unfiltered 1/3 и метрику каждого acquire, в `performance.csv`. При росте конкуренции одна транзакция может удерживать соединение дольше. Для filtered суммарное ожидание пула при 8 воркерах и HTTP p95 снизились. У unfiltered p95 близки, максимум одного короткого прогона на FIX выше. Измерение синтетическое, не гарантирует latency на Supabase.

В повторе с чередованием порядка ревизий warm unfiltered при восьми воркерах дал p95/max 34,13/161,37 → 31,38/36,80 мс на 288 запросах на ревизию. В повторе 4+4 у каталога p95/max 162,00/182,29 → 53,17/77,25 мс, у Voice 262,87/276,50 → 251,48/272,44 мс, по 144 запроса каждого маршрута на ревизию. Это показывает вариативность одиночного максимума и отсутствие устойчивой регрессии p95 в измеренных сериях. Подробности в `performance-tail-repeat.csv`.

В 36 парах `EXPLAIN (ANALYZE, BUFFERS)` совпали структуры узлов, типы соединений и выбранные индексы. Для filtered custom медиана planning/execution 1,481/2,696 → 1,560/3,077 мс, для generic 1,437/6,317 → 1,560/6,958 мс. У custom discovery медиана execution 11,493 → 12,298 мс за вызов, а HTTP вызывает его один раз вместо двух. Текст SQL совпадает. Эти различия отражают локальную вариативность замеров. Исходные production plans и нагрузка во время инцидента неизвестны.

## Локальные проверки

| Команда или проверка | Результат |
| --- | --- |
| `go test -count=1 ./internal/httpapi ./internal/postgres ./internal/middleware ./internal/observability` | PASS |
| `go test -count=1 -race ./internal/httpapi ./internal/postgres ./internal/middleware ./internal/observability` | PASS |
| `node scripts/ci/run-checks.mjs go` | PASS. Форматирование, модуль, unit/race, vet, staticcheck с integration tag, govulncheck, build. |
| `node scripts/ci/run-db-integration.mjs` | PASS. Disposable PostgreSQL 17, `TestDeterministicCatalog` с snapshot, brand, concurrent Voice, fault, возвратом слотов; штатные проверки roles/RLS/snapshots. |
| `node scripts/ci/run-ephemeral-staging.mjs` | PASS. Frozen GET и записанный v1 parity, `TestLocalVoiceParity`, Playwright 14 passed / 6 fixture/device skips, Docker DB outage и восстановление. |
| A/B benchmark HTTP и PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` | PASS. Одинаковые SQL, принудительный custom/generic на disposable PG17. |
| `git diff --check` | PASS. |

Запуск на native Linux worktree в `/tmp`, Node 24.10.0, pnpm 10.32.1, Go 1.27.4. RTK использован для Git и запуска скриптов. `rtk proxy` сохранял полный вывод проверок для подтверждения результатов.

## Условия будущего выпуска

Нужны отдельное разрешение Owner и независимый code review. При разрешённом выпуске проверить exact-main CI, неизменяемый API-образ, rollback, роль и collation, затем провести короткий loopback smoke, Voice и RU/KK. Для первого 5xx сохранить request ID, стадию, класс и длительность перед заменой контейнера. Длинную матрицу регистров оставить в disposable staging. В этом FIX таймауты, размеры пула, API-контракт, PostgreSQL schema/данные, настройки и исходники Frontend/Voice не менялись. VPS, реальный Gemini/Redis и Siri на этой фазе не проверялись.

## Файлы

- Внутренний интерфейс и HTTP — `backend-go/internal/catalog/models.go`, `backend-go/internal/httpapi/{catalog,server}.go`.
- Snapshot и SQL-фазы — `backend-go/internal/postgres/{categories,products,repository,snapshots,metrics}.go`.
- Request-scoped диагностика — `backend-go/internal/middleware/http.go`, `backend-go/internal/observability/catalog.go`.
- Тесты — `backend-go/internal/httpapi/{catalog,product_discovery}_test.go`, `backend-go/internal/middleware/catalog_test.go`, `backend-go/internal/postgres/catalog_metrics_test.go`, `backend-go/tests/integration/{brand_filter,catalog,product_snapshot}_test.go`.
- Отчёт — `docs/production/reports/BRAND_FILTER_HTTP503_FIX_REPORT.md`.
