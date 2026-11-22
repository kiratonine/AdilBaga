# Aktau Market — case-insensitive brand filters

**Статус кандидата — READY_FOR_INDEPENDENT_CODE_REVIEW после exact-HEAD CI.** Тесты и объём изменений зафиксированы в этом отчёте. Финальный SHA, URL PR и результаты hosted jobs находятся во внешнем `ci-evidence.md` внутри review-пакета. Это позволяет добавить результаты GitHub без изменения уже проверенного HEAD.

## База и причина

Работа выполнена в отдельном native WSL worktree `/home/denis/tmp/aktau-brand-filter-case-insensitive`, ветка `fix/brand-filter-case-insensitive`. Fetch и push URL подтверждены отдельно как `https://github.com/kiratonine/AdilBaga.git`. Fresh base `52e58ecb6463c897055f7f6f72ada086dee5a723`. Корневой checkout Актау оставлен на прежнем коммите с имеющимися ignored и untracked файлами. Checkout Shymkent не использовался для изменения кода.

На исходном HEAD discovery сравнивал metadata `Category.filterSchema` и наблюдаемый JSONB с точным регистром. HTTP-парсер и репозиторий независимо проверяли те же точные варианты. SQL по `brand` сравнивал JSONB-строку со значением `CanonicalProduct.brand` с учётом регистра. Поэтому разные регистры попадали в разные опции, а значение из закладки или с другой капитализацией могло быть отклонено до чтения товаров.

## Поведение публичного каталога

- Filter schema использует только бренды, которые есть одновременно в metadata категории и среди позиций с in-stock, positive-price offer в последнем опубликованном snapshot. Go пересекает нормализованные ключи и сохраняет порядок первого вхождения в metadata. Пустые, состоящие только из whitespace, null и нестроковые варианты исключены.
- Отображаемые значения являются JSON-строками. `BARAKA`, `Baraka`, `baraka` дают `Baraka`. `3 ЖЕЛАНИЯ` и `3 желания` дают `3 Желания`. `DEKMY` и `Dekmy` дают `Dekmy`. `ARLA FOODS PUCK` даёт `Arla Foods Puck`.
- Сопоставление использует Unicode lowercase. Для отображения меняется первая буква каждого слова, в том числе после начальных цифр или знаков. Разделители, пунктуация, дефисы и смешение письменностей сохраняются. Целое слово приводится к lowercase перед капитализацией, поэтому `ÉCLAIR-DEKMY` отображается как `Éclair-dekmy`. Если title-case rune меняет ключ после обратного lower, сохраняется буква из ключа. Транслитерация, accent stripping, alias dictionary и substring match не используются. `Ёлка` и `Елка`, латинская и кириллическая `A`, `Actimel` и `Actimel Kids` имеют разные ключи.
- HTTP-парсер и PostgreSQL-репозиторий допускают отображаемое значение и прежний регистр из URL, если ключ есть среди допустимых в категории строк. Неизвестный бренд, неверный ключ, отсутствие категории и нестроковый JSON в repository API сохраняют ошибку 400 или `ErrInvalidQuery`. Повтор ключа означает OR, разные ключи означают AND. Сопоставление non-brand атрибутов остаётся типизированным и точным.
- В SQL ветка бренда проверяет `jsonb_typeof(option.value)='string'`, извлекает строку и сравнивает `lower` с Unicode collation `pg_catalog."pg_c_utf8"`. Обе стороны используют одинаковую collation. Параметры остаются JSONB data, символы `%` и `_` сравниваются буквально, значение NULL не совпадает. PostgreSQL 17 и Go сравнили результаты lower для реальных fixture-кейсов, включая `Ё`, accented Latin, mixed scripts и дополнительные Unicode примеры.
- DTO, offer gates, ограничения и сортировка unchanged. SQL выбирает исходный `p.brand` без преобразований. Frontend `toSearchParams` передаёт значения через `URLSearchParams.append`, поэтому новый label и legacy query проходят существующим протоколом. TypeScript, OpenAPI и fixture corpus не менялись.
- Voice использует тот же repository для проверки live vocabulary и SQL. В wiring Voice получает копию репозитория с прежним точным brand matching, включая обработку записанных вариантов и активных диалогов. Режим сохраняется при открытии repeatable-read snapshot. Голосовой pipeline, prompt, Redis, Gemini и session shape не менялись. Интеграционный тест проверил, что `BARAKA` в прежнем режиме возвращает только точное написание.

## Проверки

Node 24.10.0, pnpm 10.32.1, Go 1.27.4 из текущих manifest/CI, Docker local Unix socket. Tests запущены в worktree без production env. Перед bootstrap disposable PG17 wrapper проверил локальность daemon, точное имя и ID контейнера, CI label, отсутствие bind mount, loopback binding и совпадение PostgreSQL system identifier с обеих сторон loopback. Временная роль и база подтверждены. Все DDL/DML внутри approved runners относились к принадлежащим прогону контейнерам.

| Проверка | Результат |
| --- | --- |
| Pre-fix HTTP regression через `go test -count=1 -overlay=… ./internal/httpapi -run '^TestBrandQueryUsesOnlyStringOptions$'` | Ожидаемый FAIL (1). Overlay использовал исходный parser, который отклонял bookmarked variants. Код checkout при этом не менялся. |
| `cd backend-go && go test -count=1 ./internal/postgres ./internal/httpapi` | PASS (0), повтор после негативного прогона. |
| `cd backend-go && go test -count=1 -race ./internal/postgres ./internal/httpapi` | PASS (0). |
| `node scripts/ci/run-checks.mjs go` | PASS (0). Полные unit/race, vet, staticcheck с обоими tag профилями, govulncheck, сборка api/ingest/prune. Нет drift зависимостей. |
| `node scripts/ci/run-db-integration.mjs` | PASS (0). `TestDeterministicCatalog/case_insensitive_public_brand_filters` использует restricted API role и реальный HTTP Router. Проверены две категории, порядок и варианты, legacy URL, whitelist, invalid options, OR/AND, literal equality, DTO/min price/offers, sort/offset, предыдущий и building snapshots, пустые значения и Voice exact matching. Полный DB suite и cleanup прошли. |
| `node scripts/ci/run-ephemeral-staging.mjs` | PASS (0). Frozen HTTP parity, readiness burst, 23 local GET contract checks и 14 Playwright HTTP checks. Штатные SKIP: 4 fixture-Voice и 6 E2E cases. Read-only Docker API, outage/recovery и cleanup контейнеров прошли. |
| `git diff --check`, scope и source policy | PASS. В PR только изменения Go backend, regression tests и этот отчёт. |
| GitHub Actions | Все mandatory job conclusions для точного HEAD указаны во внешнем evidence. |
| Live production, ручной Voice/Siri, merge и release | NOT_RUN. |

Локальный staging собрал образ под фиксированным тестовым тегом `adilbaga-part12-api:review`, который использует унаследованный runner. Состояние этого тега до прогона отдельно не фиксировалось. Контейнеры и сеть созданного staging удалены.

Read-only audit обнаружил CI с PR в `main` и push только на `main` / legacy integration ref. Topic push и PR не подходят под release admission для успешного `push` в `main`. Manual dispatch не использовался. Workflows и release scripts не изменялись. Этап заканчивается на независимом review one PR.

## Изменённые файлы

```text
M	backend-go/cmd/api/main.go
A	backend-go/internal/catalog/brand.go
M	backend-go/internal/httpapi/catalog_test.go
M	backend-go/internal/httpapi/product_query.go
M	backend-go/internal/postgres/categories.go
M	backend-go/internal/postgres/products.go
M	backend-go/internal/postgres/repository.go
M	backend-go/internal/postgres/repository_test.go
M	backend-go/internal/postgres/snapshots.go
A	backend-go/tests/integration/brand_filter_test.go
M	backend-go/tests/integration/catalog_test.go
A	docs/production/reports/BRAND_FILTER_CASE_INSENSITIVE_FIX_REPORT.md
```

## Риски и выкладка

Регистронезависимое равенство применяется только к брендам в фильтре каталога. Существующие формат options, whitelist и подлинные значения карточек сохраняются. Сопоставление проверено на PostgreSQL 17, который используется integration runner. Deployment не выполнялся. Если после независимого review потребуется выкатка, это будет отдельное разрешение Owner и отдельный bounded smoke RU/KK каталога.
