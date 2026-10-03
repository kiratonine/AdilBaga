# Aktau Market — Production Roadmap

> Рабочее название репозитория пока может оставаться `AdilBaga`. Публичный домен перед запуском: `https://aktau.market`.
> Финальное название бренда фиксируется до публичной индексации и финального production deploy.
>
> Цель этого roadmap — не «улучшить hackathon MVP», а построить production-систему, которую можно безопасно открыть реальным пользователям.

---

## 0. Главные production-принципы

### 0.1. Никаких demo/runtime fallback'ов

В production runtime не должно быть:

- fixture/mock repository;
- `DATA_SOURCE=fixture`;
- memory fallback вместо Redis;
- тестовых API URL;
- hardcoded localhost;
- demo-only seed при старте приложения;
- автоматического «продолжить работу» при критически отсутствующей production dependency.

Test fixtures и mocks **остаются в тестах** — это нормально и обязательно. Но production binary / production build не должен использовать их как источник реальных данных.

### 0.2. Security не является отдельной последней задачей

Базовые требования безопасности внедряются с первого Go commit:

- strict config validation;
- allowlist CORS;
- HTTP timeouts;
- body/query limits;
- rate limiting;
- parameterized SQL;
- secret isolation;
- structured errors;
- non-root containers/processes;
- health/readiness;
- logs без secrets, координат и полного voice-текста;
- graceful shutdown;
- dependency scanning;
- production-only configuration validation.

Поздний Security Review — это **аудит уже защищённой системы**, а не момент, когда защита появляется впервые.

### 0.3. Никакого big-bang rewrite

NestJS backend остаётся рабочим reference implementation до момента полного Go parity.

Новый Go backend создаётся рядом:

```text
backend/        # текущий NestJS, временно reference
backend-go/     # новый production backend
frontend-next/  # текущий Next.js до финального переключения
```

После полного parity и production cutover:

```text
frontend-next/ -> frontend/
backend-go/    -> backend/
старый NestJS архивируется/удаляется
```

### 0.4. API contract важнее языка backend

Next.js не должен знать, что backend переписан с NestJS на Go.

Go сохраняет существующий public contract до отдельного согласованного API v2.

### 0.5. Production data обновляются атомарно

Нельзя обновлять live-каталог по одной строке во время parser run.

Правильная модель:

```text
current published snapshot N
        ↓
строится snapshot N+1
        ↓
normalization
        ↓
matching
        ↓
quality gates
        ↓
PASS
        ↓
atomic publish N+1
```

Если импорт N+1 сломан, пользователи продолжают видеть последний хороший snapshot N.

---

# Target production architecture

```text
                          ┌─────────────────────┐
                          │   Cloudflare        │
                          │ DNS / WAF / DDoS    │
                          └─────────┬───────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              │                                           │
      https://aktau.market                      https://api.aktau.market
              │                                           │
        Next.js frontend                           Cloudflare Tunnel
     SSR / ISR / SEO / i18n                              │
              │                                    Go API service
              │                                           │
              └────────────── HTTP API ───────────────────┤
                                                          │
                         ┌────────────────────────────────┼─────────────────┐
                         │                                │                 │
                    Supabase/Postgres                Upstash Redis       Gemini
                         │                          voice/rate state        NLP
                         │
                  published snapshot
                         ▲
                         │
                  Go ingestion worker
                         │
          Dana / Dina / Fix Price / future sources
```

Runtime public API не должен зависеть от сайтов магазинов.

---

# Target repository structure

```text
/
├── frontend/                         # Next.js App Router после cutover
│
├── backend-go/
│   ├── cmd/
│   │   ├── api/
│   │   │   └── main.go
│   │   ├── ingest/
│   │   │   └── main.go
│   │   └── migrate/
│   │
│   ├── internal/
│   │   ├── config/
│   │   ├── httpapi/
│   │   ├── middleware/
│   │   ├── catalog/
│   │   ├── categories/
│   │   ├── dashboard/
│   │   ├── voice/
│   │   ├── location/
│   │   ├── gemini/
│   │   ├── redis/
│   │   ├── postgres/
│   │   ├── ingestion/
│   │   ├── normalization/
│   │   ├── matching/
│   │   ├── snapshots/
│   │   └── observability/
│   │
│   ├── migrations/
│   ├── tests/
│   │   ├── contract/
│   │   ├── integration/
│   │   └── fixtures/
│   │
│   ├── Dockerfile
│   ├── go.mod
│   └── go.sum
│
├── contracts/
│   ├── openapi.yaml
│   └── examples/
│
├── deploy/
│   ├── compose.production.yml
│   ├── cloudflared/
│   └── systemd/
│
├── docs/
└── README.md
```

---

# PART 00 — Production baseline и branch cleanup

## Цель

Получить одну понятную базовую точку перед production-разработкой.

## Сначала проверить

- `main` — финальная hackathon версия backend;
- `feat/frontend` — актуальный Next.js frontend;
- diff/divergence обеих веток;
- live Supabase schema;
- текущие production/development secrets;
- все внешние integrations.

## Что сделать

1. Сделать backup `main`.
2. Создать новую integration branch:

```text
prod/integration
```

3. Аккуратно интегрировать изменения `feat/frontend`.
4. Пока сохранить оба frontend:
   - старый Vite;
   - новый `frontend-next`.
5. Поднять текущий NestJS API и прогнать Next frontend в HTTP mode.
6. Зафиксировать baseline API responses.
7. Проверить Git history на secrets.
8. Ротировать перед production:
   - Supabase password/credentials;
   - Gemini API keys;
   - Upstash credentials;
   - Cloudflare tokens;
   - любые старые deploy tokens.

## Production acceptance

- рабочая интеграционная ветка;
- ни одного секрета в Git;
- Next frontend работает с реальным NestJS API;
- current DB backup создан;
- current schema dump сохранён;
- baseline тесты зелёные.

## Не делать

- Go-код;
- новую DB schema;
- production deploy.

---

# PART 01 — Завершение Next.js migration

## Цель

Сделать новый Next frontend единственным frontend проекта до переписывания backend.

## Основные пути

```text
frontend-next/**
docs/context/08_NEXTJS_MIGRATION_PLAN.md
docs/context/06_FRONTEND_WORKLOG.md
```

После PASS:

```text
frontend-next/ -> frontend/
старый frontend/ удалить отдельным commit
```

## Обязательные production-изменения

### Runtime mock mode

Production build должен fail-fast, если:

```text
NEXT_PUBLIC_API_MODE != http
```

Mock adapter можно оставить только для tests/dev.

### Env

Production:

```env
NEXT_PUBLIC_API_MODE=http
NEXT_PUBLIC_API_BASE_URL=https://api.aktau.market
NEXT_PUBLIC_SITE_URL=https://aktau.market
API_BASE_URL=<server-side API URL>
```

Никакого localhost fallback в production.

### SEO

Перед индексацией финально проверить:

- canonical;
- hreflang ru/kk;
- sitemap;
- robots;
- Product JSON-LD;
- AggregateOffer;
- OG;
- site name;
- favicon;
- `NEXT_PUBLIC_SITE_URL`.

### Brand

Не делать массовый rename прямо сейчас, если финальное название ещё не выбрано.

Но **до первой публичной индексации `aktau.market`** заменить:

- `Adil Bağa`;
- metadata;
- JSON-LD Organization/WebSite;
- OG;
- favicon/logo;
- email/contact;
- Siri display name, если меняется.

## Production improvement

Убрать жёсткую зависимость `next build` от доступности backend API.

Цель:

```text
frontend deployment
не должен ломаться только потому,
что API недоступен несколько секунд во время build
```

Для server data использовать Next runtime caching / ISR и tagged revalidation.

## Tests

```bash
cd frontend-next
pnpm typecheck
pnpm lint
pnpm test
pnpm build
PW_CHANNEL=chrome pnpm test:e2e
```

Плюс E2E против реального NestJS API.

## Done

Только после этого Go backend получает Next frontend как контрактного consumer.

---

# PART 02 — API Contract Freeze + OpenAPI

## Цель

Зафиксировать контракт до rewrite.

## Создать

```text
contracts/openapi.yaml
contracts/examples/categories.json
contracts/examples/filters.json
contracts/examples/products.json
contracts/examples/product.json
contracts/examples/dashboard.json
contracts/examples/voice-start-result.json
contracts/examples/voice-clarification.json
```

## Public API v1

Сохранить:

```text
GET  /api/categories
GET  /api/categories/:slug/filters
GET  /api/products
GET  /api/products/:id
GET  /api/dashboard

POST /api/voice/start
POST /api/voice/continue
```

## Зафиксировать

- query params;
- repeated dynamic filter params;
- pagination semantics;
- sort enum;
- DTO nullability;
- 400/404/429/500/503 error shape;
- max limits;
- Content-Type;
- cache headers;
- voice clarification;
- snapshot date semantics.

## Contract tests

Один и тот же black-box suite должен запускаться против:

```text
API_BASE_URL=http://nestjs...
API_BASE_URL=http://go...
```

И сравнивать семантику, а не внутреннюю реализацию.

## Важное изменение production v1

Ввести максимальный `limit`.

Например:

```text
default = 24
max = 100
```

Без неограниченных public queries.

---

# PART 03 — Go production foundation

## Цель

Создать production-ready Go service ещё до первого business endpoint.

## Рекомендуемый стек

```text
Go
net/http + chi
pgx / pgxpool
go-redis
slog JSON
OpenAPI contract
```

Не использовать тяжёлый ORM без реальной необходимости.

## Создать

```text
backend-go/cmd/api/main.go
backend-go/internal/config/
backend-go/internal/httpapi/
backend-go/internal/middleware/
backend-go/internal/observability/
backend-go/Dockerfile
```

## Обязательные свойства HTTP server

С первого дня:

- `ReadHeaderTimeout`;
- request timeout;
- write timeout;
- idle timeout;
- max headers;
- max request body;
- graceful shutdown;
- panic recovery;
- request ID;
- structured access log;
- trusted proxy policy;
- deterministic JSON error responses.

## Config validation

При старте валидировать обязательные env.

Production API **не стартует**, если отсутствует обязательная dependency/config.

Никакого:

```text
Redis отсутствует → memory fallback
```

Если voice включён, Redis обязателен.

## Health endpoints

```text
GET /health/live
GET /health/ready
```

`live`:

```text
процесс жив
```

`ready`:

```text
DB доступна
critical config загружен
service может принимать traffic
```

Gemini не должен делать readiness красным при кратковременном внешнем outage.

## Docker

Multi-stage build.

Runtime:

- non-root user;
- минимальный image;
- read-only filesystem где возможно;
- никакого compiler/toolchain внутри runtime image;
- healthcheck;
- no secrets baked into image.

## Tests

```bash
go test ./...
go test -race ./...
go vet ./...
govulncheck ./...
```

Добавить `staticcheck`/`golangci-lint` в CI.

---

# PART 04 — PostgreSQL production layer

## Цель

Подключить Go к текущей Supabase без изменения public behavior.

## Нельзя

- создавать новую БД;
- автоматически `DROP/CREATE`;
- применять неизвестную migration на production;
- переписывать current data.

## Сначала

1. `pg_dump --schema-only`.
2. backup данных.
3. сверка live schema с Prisma schema.
4. список indexes/constraints.
5. EXPLAIN текущих ключевых запросов.

## Production DB roles

Разделить credentials:

### API role

Только необходимый runtime read access.

Public Go API в текущей архитектуре почти не должен писать в PostgreSQL.

### Ingestion role

INSERT/UPDATE для ingestion/snapshot pipeline.

### Migration role

DDL rights.

Используется только вручную/CI deployment procedure, не runtime API.

## Go repository

Все SQL только parameterized.

Никаких конкатенаций пользовательского текста в SQL.

Dynamic filter keys:

```text
только allowlist из category filter schema
```

## Перенести SQL-side

Текущий NestJS часть работы делает в памяти.

В Go production перенести в PostgreSQL:

- category filter;
- search;
- dynamic attributes filter;
- sort;
- pagination;
- min price;
- offer ordering.

## Search

Проверить `EXPLAIN ANALYZE`.

При необходимости:

- `pg_trgm`;
- GIN/GiST для search;
- GIN/index strategy для `attributes JSONB`;
- composite indexes по реально используемым запросам.

Индексы добавлять по query plan, не «на всякий случай».

---

# PART 05 — Catalog API parity

## Цель

Перенести read API с NestJS на Go без frontend changes.

## Реализовать

```text
GET /api/categories
GET /api/categories/:slug/filters
GET /api/products
GET /api/products/:id
```

## Validation

Строго проверять:

- slug;
- sort;
- limit;
- offset;
- search length;
- dynamic filters;
- repeated params;
- booleans;
- numeric options.

## Предлагаемые input limits

Настроить и затем откалибровать:

```text
search <= 200 chars
limit <= 100
filter count <= разумного лимита schema
URL/query size ограничивается reverse proxy + app
```

## Cache semantics

Так как данные snapshot-based:

```text
categories / filters:
длинный public cache TTL + ETag

products / product:
короткий TTL + ETag/snapshot version
```

Не кэшировать ошибочные 5xx.

## Contract parity

Для fixed fixtures / staging DB:

```text
NestJS response
vs
Go response
```

должны совпадать по contract.

---

# PART 06 — Dashboard production rewrite

## Цель

Убрать полное пересчитывание каталога в памяти на каждый dashboard request.

## Реализовать

```text
GET /api/dashboard
```

## Перенести вычисления

В SQL / precomputed snapshot analytics:

- canonical product count;
- store count;
- matched-across-stores;
- snapshotAt;
- price spreads;
- baskets;
- locations.

## Рекомендуемый подход

После publication snapshot считать dashboard aggregates один раз и хранить:

```text
snapshot analytics
```

или использовать SQL view/materialized view, если это проще.

Не выполнять полный scan всех DTO в Go на каждый HTTP request.

## Cache

Dashboard хорошо подходит под cache:

```text
ETag = snapshot version
Cache-Control
```

---

# PART 07 — Voice: Gemini + Redis + geolocation

## Цель

Перенести voice flow без потери hackathon-функциональности и закрыть abuse risk.

## Сохранить

```text
POST /api/voice/start
POST /api/voice/continue

cheapest -> TOP 1
search   -> TOP 3

Redis TTL ~10 min
Haversine nearest store
clarification flow
```

## Gemini

Сохранить structured output.

Gemini:

```text
только text -> intent/category/filters
```

НЕ:

```text
выбирает цену
выбирает магазин
делает SQL business decision
```

## API key failover

Классифицировать ошибки.

Failover на следующий key:

```text
429
5xx
network timeout/error
```

Не бессмысленно прогонять все keys при:

```text
400 malformed request
```

401/403:

```text
key/config incident
→ sanitized log + alert
```

## Общий timeout

Один общий deadline для всей цепочки.

## Redis

Production:

```text
Upstash недоступен
→ voice session endpoint отдаёт controlled 503
```

Никакого in-memory fallback.

## Privacy

Не логировать:

- полный voice text;
- precise coordinates;
- session payload;
- API keys.

Допустимо логировать:

```text
intent
category
status
latency
provider status class
```

без персональных данных.

## Abuse protection

Voice endpoint дорогой — обязательно:

- Cloudflare rate limit;
- server-side rate limit;
- max text length;
- request body limit;
- provider timeout;
- concurrency limit.

---

# PART 08 — Production snapshot / ingestion architecture

## Цель

Отказаться от hackathon-модели «один snapshot навсегда».

## До автоматизации источников

Для каждого магазина проверить:

- разрешённый способ получения данных;
- Terms/API availability;
- rate limits;
- city context;
- стабильный source identifier.

Production scraper не должен строиться на обходе anti-bot, чужих cookies или хрупкой browser session.

При возможности использовать официальный API/feed/партнёрский канал.

## Новые сущности

Спроектировать migration после review:

```text
Snapshot
IngestionRun
SourceRun / StoreSyncStatus
```

Пример:

```text
Snapshot
- id
- status: building | validating | published | failed
- startedAt
- publishedAt
- sourceStats
- qualityReport
```

RawProduct / Offer должны быть привязаны к snapshot/version.

## Pipeline

```text
acquire
→ raw staging
→ normalize
→ candidate generation
→ matching
→ quality audit
→ build aggregates
→ publish
```

## Publication gates

Перед publish:

- expected stores present;
- product count within reasonable delta;
- missing prices;
- duplicate source IDs;
- impossible prices;
- category drift;
- match confidence;
- image coverage;
- location count;
- basket validity;
- parser error rate.

## Failure policy

Если quality gate FAIL:

```text
snapshot N+1 = failed
snapshot N остаётся published
```

Никогда не заменять хороший live snapshot неполным импортом.

## Scheduler

На начальном масштабе не нужен Kafka/queue.

Достаточно:

```text
cmd/ingest
+
systemd timer / cron
+
PostgreSQL advisory lock
```

Одновременно может выполняться только один ingestion run.

---

# PART 09 — History и freshness

## Цель

Сделать цену production-данными, а не только текущим snapshot.

## Реализовать

- история offer price;
- published snapshot history;
- `lastSuccessfulSync` по source;
- stale source detection;
- отображение актуальности пользователю.

## API

Не ломать v1 без необходимости.

Новые данные добавлять additive.

## Frontend

Пользователь должен понимать:

```text
цена актуальна на ...
```

Если конкретный source устарел, это должно быть видно.

---

# PART 10 — Security baseline review

> Это повторная проверка. Базовая security уже должна существовать с Part 03.

## App security

Проверить:

- strict CORS allowlist;
- method allowlist;
- Content-Type validation;
- body limits;
- query limits;
- HTTP timeouts;
- safe errors;
- no stack trace;
- panic recovery;
- SQL parameters;
- Redis key constraints;
- request IDs;
- rate limits;
- no secrets in logs;
- dependency vulnerabilities.

## CORS

Production allowlist:

```text
https://aktau.market
https://www.aktau.market   # только если реально используем
```

Preview domains не разрешать wildcard'ом в production API.

## Next security headers

Добавить/проверить:

- Content-Security-Policy;
- X-Content-Type-Options;
- Referrer-Policy;
- Permissions-Policy;
- frame protection;
- HSTS только после окончательной проверки HTTPS.

## Database

- least privilege roles;
- TLS;
- никаких owner credentials в runtime;
- connection pool limits;
- statement/query timeout;
- slow query logging/metrics.

## Supply chain

CI:

```text
govulncheck
dependency audit
secret scanning
SAST
container image scan
```

Enable Dependabot/Renovate по выбранной политике.

---

# PART 11 — Observability, backups, recovery

## Цель

Уметь понять, что сломалось, ещё до жалобы пользователя.

## Logs

JSON structured logs:

```text
timestamp
level
request_id
route
method
status
duration_ms
error_code
```

Не писать PII/secrets.

## Metrics

Минимум:

- requests/sec;
- latency p50/p95/p99;
- 4xx/5xx;
- DB pool;
- DB query duration;
- Redis failures;
- Gemini call status/latency;
- ingestion duration;
- ingestion failures;
- published snapshot age;
- data freshness per source.

## Alerts

Минимум:

```text
API unavailable
5xx spike
DB unavailable
ingestion failed
snapshot too old
Gemini sustained failure
disk > threshold
memory pressure
certificate/domain problem
```

## Backups

Нельзя считать managed DB единственной копией.

Минимум:

- scheduled encrypted logical backup;
- off-server storage;
- retention policy;
- restore test.

Пример retention:

```text
7 daily
4 weekly
несколько monthly
```

Главное не количество, а проверенный restore.

## Runbooks

Создать:

```text
docs/runbooks/api-down.md
docs/runbooks/db-down.md
docs/runbooks/redis-down.md
docs/runbooks/ingestion-failed.md
docs/runbooks/rollback.md
docs/runbooks/secret-rotation.md
```

---

# PART 12 — CI/CD и staging

## Цель

Ни одна непроверенная версия не попадает на production.

## Git flow

```text
feature/*
    ↓ PR
prod/integration
    ↓ staging
main
    ↓ production
```

Или более простой trunk-based flow, но production deploy только после gates.

## Go CI

```bash
gofmt check
go vet ./...
go test ./...
go test -race ./...
staticcheck ./...
govulncheck ./...
go build ./cmd/api
go build ./cmd/ingest
```

## Frontend CI

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

## DB CI

На fresh PostgreSQL container:

```text
apply all migrations
seed test fixture
run integration tests
```

Migration down/up strategy отдельно проверить.

## Staging

Production migrations никогда не тестировать впервые на production.

Минимум:

- отдельная staging DB;
- staging Redis;
- staging API;
- staging frontend.

Если бюджет ограничен, DB migration tests минимум идут на disposable PostgreSQL в CI, но для schema/data-changing release отдельный staging environment крайне желателен.

---

# PART 13 — Performance и load testing

## Цель

Измерить систему, а не предполагать.

## Инструмент

Например:

```text
k6
```

## Сценарии

- categories;
- product list;
- search;
- category + filters;
- product detail;
- dashboard;
- voice start;
- voice clarification.

## Проверять

- p50/p95/p99;
- RPS;
- memory;
- CPU;
- DB connections;
- slow queries;
- error rate;
- behavior при Redis/Gemini outage.

## Начальный capacity test

Для первого запуска достаточно проверить запас относительно ожидаемой нагрузки.

Например:

```text
read API: десятки concurrent users / десятки RPS
voice: отдельный низкий concurrency profile
```

После первого реального traffic обновить targets по метрикам.

Не обещать arbitrary «1000 RPS», пока это не измерено.

---

# PART 14 — Cloudflare + network perimeter

## Рекомендация

Cloudflare использовать с первого production deploy.

## Домен

```text
aktau.market      -> frontend
api.aktau.market  -> Go backend
```

## Рекомендуемый вариант для API origin

Cloudflare Tunnel:

```text
Cloudflare
    ↓
encrypted outbound tunnel
    ↓
cloudflared on VPS
    ↓
Go API on localhost/private Docker network
```

Плюсы:

- origin API не нужно выставлять в Internet;
- не нужно открывать public 80/443 для API;
- реальный origin IP не участвует в обычном web traffic;
- WAF/DDoS/rate-limit проходят до origin.

## Cloudflare настройки

- proxied DNS;
- WAF Free Managed Ruleset;
- DDoS protection;
- rate limiting для API;
- Bot/security rules по наблюдаемому traffic;
- no cache для voice POST;
- аккуратные cache rules только для безопасных GET;
- DNSSEC;
- HTTPS only.

Если Tunnel не используется:

```text
Cloudflare proxy
+
Full (strict) TLS
+
origin firewall
```

и запрет прямого публичного доступа к origin.

---

# PART 15 — Production deployment

## Backend

Deployment unit:

```text
immutable Docker image by commit SHA
```

Не билдить production source вручную на сервере.

## VPS

На сервере:

```text
Docker/Container runtime
cloudflared
Go API container
ingestion worker/timer
```

Supabase и Upstash остаются внешними.

## Deploy sequence

```text
CI green
→ build immutable image
→ push image
→ backup / migration precheck
→ migration (если есть)
→ deploy new API
→ readiness PASS
→ smoke tests
→ switch traffic
→ monitor
```

## Rollback

Должен существовать до первого deploy:

```text
previous image SHA
+
compatible DB migration strategy
```

---

# PART 16 — Frontend revalidation после snapshot publish

## Цель

После успешного обновления цен SEO/ISR-страницы не должны ждать случайный час.

## Сделать

После atomic snapshot publish ingestion service вызывает защищённый Next endpoint:

```text
POST /internal/revalidate
```

или аналогичный production-safe mechanism.

Запрос:

- подписан shared secret/HMAC;
- недоступен как открытая public action;
- инвалидирует tags/catalog/dashboard/products.

Не делать public unauthenticated revalidate endpoint.

---

# PART 17 — Domain / brand rename

## Когда

После технического production readiness, но **до Search Console / Яндекс Вебмастер и публичной индексации**.

## Домен

```text
https://aktau.market
```

## Заменить бренд централизованно

Не делать `search/replace` по всему repo вручную.

Вынести:

```text
SITE_NAME
SITE_URL
API_URL
organization metadata
contact info
```

в понятные configuration/constants.

## Проверить

- Header/logo;
- footer;
- title;
- metadata;
- canonical;
- Open Graph;
- JSON-LD;
- sitemap;
- robots;
- Siri notification/speech;
- README;
- GitHub About;
- Cloudflare;
- production env;
- Search Console;
- Yandex Webmaster.

---

# PART 18 — Final production gate

Production launch разрешён только если:

```text
[ ] Next frontend — единственный frontend
[ ] Go backend полностью покрывает API v1
[ ] NestJS contract parity PASS
[ ] production runtime не содержит fixture/mock fallback
[ ] Supabase roles разделены
[ ] Upstash обязателен для voice
[ ] recurring ingestion работает
[ ] failed ingestion не ломает current snapshot
[ ] CORS strict
[ ] app + Cloudflare rate limits
[ ] request/body/query limits
[ ] HTTP timeouts
[ ] Cloudflare/WAF/DDoS
[ ] origin закрыт через Tunnel/Firewall
[ ] secrets rotated
[ ] CI security gates PASS
[ ] migrations tested
[ ] backups работают
[ ] restore протестирован
[ ] monitoring/alerts работают
[ ] load test PASS
[ ] staging E2E PASS
[ ] production smoke PASS
[ ] rollback проверен
[ ] privacy/terms/contact pages готовы
[ ] brand/domain полностью заменены
```

---

# PART 19 — Cutover NestJS → Go

## Нельзя

```text
удалить NestJS
→ затем начать проверять Go
```

## Правильно

```text
NestJS production/reference
          +
Go staging/shadow
          ↓
contract parity
          ↓
E2E parity
          ↓
load/security tests
          ↓
малый traffic/canary
          ↓
100% Go
          ↓
наблюдение
          ↓
NestJS decommission
```

Старый backend удалить только после стабильного периода и сохранённого rollback artifact.

---

# Production API security policy

## Public GET endpoints

Могут быть анонимными.

Защита:

- Cloudflare;
- cache;
- rate limit;
- bounded queries;
- input validation;
- SQL parameters.

## Voice endpoints

Анонимные, но дорогие.

Защита строже:

- edge rate limit;
- application rate limit;
- Redis counter;
- max body;
- max text;
- timeout;
- concurrency cap;
- provider budget.

Не прятать «секретный API key» в Siri Shortcut и не считать это authentication — пользователь может его извлечь.

---

# Privacy

Проект обрабатывает геолокацию для nearest store.

Production policy:

- latitude/longitude не сохранять в PostgreSQL;
- не писать exact coordinates в logs;
- Redis session TTL короткий;
- session удалять после successful completion;
- документировать обработку геолокации в Privacy Policy;
- не хранить voice text без явной продуктовой причины.

---

# Рекомендуемая инфраструктура первого запуска

## Если Next остаётся на Vercel/другом managed frontend hosting

VPS нужен только для:

```text
Go API
cloudflared
ingestion worker
```

Начальная конфигурация:

```text
2 vCPU
4 GB RAM
40–80 GB NVMe
1 Gbps network
static IPv4
Ubuntu 24.04 LTS
```

Это оптимальная стартовая точка по цене/запасу, потому что:

- PostgreSQL вынесен в Supabase;
- Redis вынесен в Upstash;
- frontend SSR вынесен отдельно;
- Go API сам по себе лёгкий.

Не рекомендуется для production:

```text
1 vCPU / 1 GB RAM
```

Парсинг, Docker, cloudflared и spikes легко съедят весь запас.

## Если Next.js тоже будет на этом же VPS

Лучше:

```text
4 vCPU
8 GB RAM
80 GB NVMe
```

---

# Что делать первым

Строгий порядок:

```text
Part 00  production baseline
Part 01  закончить Next migration
Part 02  freeze/OpenAPI contract
Part 03  Go foundation
Part 04  PostgreSQL layer
Part 05  catalog API
Part 06  dashboard
Part 07  voice
Part 08  ingestion/snapshots
Part 09  history/freshness
Part 10  security review
Part 11  observability/backups
Part 12  CI/CD + staging
Part 13  load tests
Part 14  Cloudflare/network
Part 15  deploy
Part 16  revalidation
Part 17  rename/domain
Part 18  launch gate
Part 19  Go cutover/decommission NestJS
```

---

# Что НЕ делать сейчас

- не переписывать сразу parsers + API + DB schema + frontend одновременно;
- не удалять NestJS до Go parity;
- не менять public DTO в процессе rewrite без versioning;
- не запускать recurring parser прямо в live tables;
- не оставлять Memory Redis fallback;
- не хранить production secrets в `.env` в Git;
- не открывать Supabase service/owner credentials public runtime;
- не включать wildcard CORS;
- не использовать Cloudflare Flexible SSL;
- не открывать API origin напрямую, если используем Tunnel;
- не включать HSTS до полного подтверждения HTTPS/subdomains;
- не делать production migration без backup и staging test;
- не считать «есть unit tests» заменой E2E, security и load testing.

---

# Production v1

Первая production версия должна уметь:

- работать на Next.js + Go;
- регулярно и безопасно обновлять данные;
- сохранять последний хороший snapshot при ошибке source;
- сравнивать цены;
- искать и фильтровать;
- показывать dashboard;
- обслуживать Siri voice flow;
- иметь history/freshness foundation;
- переживать внешний Gemini/Redis/source outage контролируемо;
- быть защищённой Cloudflare + application limits;
- иметь backup/restore;
- быть наблюдаемой;
- иметь rollback.

---

# После запуска

Только после реального traffic и метрик:

- расширять сети;
- добавлять новые категории;
- улучшать matching;
- подключать Android voice channels;
- добавлять price alerts;
- расширять history analytics;
- оптимизировать cache/indexes по реальным query metrics;
- добавлять дополнительные instances API, если одна машина становится bottleneck.

Сначала измеряем production traffic, затем масштабируем.
