# Go backend — local-only production candidate

This is a separate Go service beside `backend/`, with frozen v1 catalog,
dashboard and Voice business parity implemented. NestJS remains the reference
until a separately reviewed cutover. Backend is currently local-only: Railway is
retired; the future VPS and production domains are not provisioned. Health routes
are operational and intentionally outside the frozen OpenAPI.

Part 04 added internal read-only catalog repositories and received external PASS
after reviewed production security apply. The original clone failure and its
remediation history are preserved in the report.
See [PostgreSQL layer](../docs/production/POSTGRES_LAYER.md) and
[Part 04 report](../docs/production/reports/PART_04_REPORT.md). No deploy or traffic
ownership is implied by parity. Historical Part03/04 commands below are scoped
local profiles, not authorization for production mutations.

## Configuration and local run

Go 1.27.1, Docker and RTK are required. With the owner's WSL installation:

```bash
export PATH=/usr/local/go/bin:$PATH
export GOTOOLCHAIN=local
cd backend-go
```

Configuration is read from the process environment, not automatically from .env.
Do not load the NestJS production env into this foundation. Use only disposable
local PostgreSQL in Part 03; do not connect to Supabase.

| Variable | Contract |
| --- | --- |
| APP_ENV | Required: development, test or production |
| DATABASE_URL | Required postgres/postgresql URL; nonempty valid UTF-8 hostname and valid pgx options; errors never echo its value |
| CORS_ALLOWED_ORIGINS | Required comma-separated exact http/https origins; no wildcard, credentials, path/query/fragment; production requires HTTPS and non-localhost/non-loopback |
| PORT | Default 8080, range 1..65535 |
| TRUSTED_PROXY_CIDRS | Optional CIDRs; default empty, all forwarding headers ignored |
| LOG_LEVEL | debug/info/warn/error; default info, including startup logs |
| RATE_LIMIT_RPS | Positive finite number; default 20 |
| RATE_LIMIT_BURST | Positive integer; default 40 |

`.env.example` contains safe placeholders only. Set DATABASE_URL privately to the
disposable local database URL (never print it), then:

```bash
APP_ENV=development CORS_ALLOWED_ORIGINS=http://localhost:3100 \
  rtk proxy go run ./cmd/api
```

Missing/invalid configuration fails startup. Pool creation is lazy: temporary DB
outage does not terminate the process. Pool max 4/min 0, connect timeout 2s;
`OpenReadOnly` forces `default_transaction_read_only=on` and a 5s statement
timeout. Production also validates the restricted `aktau_api_runtime` identity
on every physical connection; business reads use snapshot-aware repositories.
Read-only session defaults are defense-in-depth, not a replacement for a
least-privilege role: a privileged credential could explicitly override them.

## Part 04 integration profiles (explicit, local-first)

No second migration history. The destructive fixture profile uses the
existing Prisma migration and `tests/fixtures/catalog.sql` INSERT-only data in
a dedicated disposable `part04_fixture` database. Set `TEST_DATABASE_URL` and
`TEST_API_DATABASE_URL` privately, both targeting the same loopback database.
The second URL must use local `part04_api_login`: INHERIT login with only
`aktau_api_reader` membership, no ownership/admin/BYPASSRLS. The fixture profile
requires the local operator to prepare existing init + group bootstrap using
`backend/prisma/security/aktau_api_reader_role.sql` + security migration
`20261004000000_rls_runtime_access` BEFORE creating the private disposable LOGIN
and group membership. The tests require that prepared, empty seven-table schema
and insert fixtures; they do not bootstrap an activated reader. Bootstrap and
migration independently reject pre-existing memberships/direct/default ACLs.
Fixtures are cleared locally on
completion; non-local targets are refused before connection/setup. Tests never
consult runtime DATABASE_URL or backend/.env.

```bash
rtk proxy go test -tags=integration ./...
```

`SMOKE_DATABASE_URL` explicitly selects a loopback production clone for read-only
smoke/local EXPLAIN ANALYZE; no production dump becomes a committed fixture.
`REFERENCE_API_BASE_URL` can explicitly select a loopback NestJS pointed at the
same local clone for complete paginated local HTTP parity. Future live smoke
requires separate `LIVE_DATABASE_URL`, `LIVE_READONLY_CONFIRM=1` and reference
GET API. **Phase A is live audit-only: do not run live repositories with the owner
credential as least-privilege evidence. Production apply and live parity await
separate Phase B approval.** No live DDL/grants/role creation/write tests allowed.

The separate destructive rollout profile requires `SECURITY_DATABASE_URL` and
`SECURITY_API_DATABASE_URL`, set privately to an isolated loopback
`part04_security` database and `part04_api_login` respectively. Effective pgx
host/port/database and all fallback hosts are checked before connection. Start
with uniformly RLS0 (fresh init) or RLS7 (restored clone), FORCE0/policies0/reader
absent, existing managed ACLs and fixture or restored data. Use two isolated clusters to avoid cluster-global role dependencies
between the clean migration-built DB and production clone.

```bash
rtk proxy go test -count=1 -tags=integration ./tests/integration \
  -run '^TestReaderRolloutLifecycle$' -v
```

This proves migration/rollback guards, restricted repository access and a complete
forward → explicit LOGIN removal → rollback → forward → rollback cycle, ending
at RLS7/FORCE0/policies0/reader absent with exact original count/managed ACL
baseline. Fresh init intentionally transitions RLS0→RLS7; rollback never disables
RLS. Existing unsafe flags/membership/ownership, direct/default ACLs, FORCE/policy/
mixed-state guards and real atomic lock-timeout refusal are tested independently.
The rollback SQL is operator-only, not an automatic Prisma/runtime action.
Database CONNECT comes from the audited existing PUBLIC ACL, not a new grant.
See POSTGRES_LAYER.md for the future, separately authorized Phase B runbook.

## HTTP behavior and security

- `/health/live`: 200 `{"status":"ok"}`, without DB access.
- `/health/ready`: Ping with 2s deadline; 200 `{"status":"ready"}` or 503
  `{"status":"not_ready"}`, never DB details. Readiness recovers without restart.
- Health responses: application/json, Cache-Control: no-store.
- Application errors: `{statusCode, message, error}`; JSON 404/405/413/414/429/500/503.
- Request ID: safe inbound characters A-Z/a-z/0-9/._-, max 64; otherwise crypto-random;
  returned in X-Request-ID and included in logs.
- JSON slog access metadata: request_id/method/path/status/duration_ms/client_ip.
  No raw query, body, authorization/cookies, env dump, panic value or stack.
- Proxy resolution defaults to RemoteAddr. Only configured trusted immediate peers
  permit validated CF-Connecting-IP or X-Forwarded-For. XFF is walked right-to-left
  to the first untrusted hop; malformed input falls back to peer.
- Exact CORS allowlist, unknown Origin → JSON 403, Vary: Origin, no credentials.
  Preflight GET/POST/OPTIONS and Accept/Content-Type/X-Request-ID → 204.
  **CORS is not authentication.**
- Instance-local rate limiting, resolved client-IP key; health and OPTIONS exempt.
  Hard cap 8192 clients, idle TTL 10 minutes, lazy cleanup at minute intervals.
  At capacity new clients receive 429; active clients are not evicted/reset.
  This is defense-in-depth, not distributed/edge or voice-specific abuse control.
- Max body 1 MiB including unknown-length/chunked bodies, URI 16 KiB;
  bounded body pre-read before routing.
- ReadHeader 5s, Read 15s, Write 20s, Idle 60s, MaxHeaderBytes 64 KiB.
  Request context deadline 15s; handlers must honor cancellation.
- SIGINT/SIGTERM → stop accepting, graceful shutdown ≤10s, pool Close, clean exit.

## Reproducible quality gates

```bash
rtk proxy gofmt -w cmd internal tests
rtk proxy gofmt -l .                    # must print nothing
rtk proxy go mod tidy
rtk proxy go mod verify
rtk proxy go test ./...
rtk proxy go test -race ./...
rtk proxy go vet ./...
rtk proxy go tool staticcheck ./...
rtk proxy go tool govulncheck ./...
```

Tools are pinned by go.mod tool directives and go.sum: staticcheck v0.8.1,
govulncheck v1.8.0. x/text is explicitly selected at fixed v0.39.0 for
GO-2026-5970; pgx remains v5.11.0. No replace/suppression or automatic Go install.
Unit config/pool-validation cases do not call a DB; the outage test Pings only
unavailable loopback port 1. Runtime integration smoke below uses disposable PG17.

## Docker smoke (local only)

From repository root:

```bash
rtk proxy docker build -t adilbaga-part03-api:review backend-go
```

Image: Go 1.27.1 Alpine build, CGO disabled/trimpath; minimal Alpine 3.24 runtime
with CA certificates, UID/GID 10001, no compiler/toolchain. Healthcheck probes live.

First confirm the names below do not belong to pre-existing resources. Export
`PART03_DB_PASSWORD` privately with a disposable-only value; do not print it.
The following creates only local resources and no application schema/data:

```bash
rtk proxy docker network create --driver bridge adilbaga-part03
rtk proxy docker volume create adilbaga-part03-data
rtk proxy docker run -d --name adilbaga-part03-postgres \
  --network adilbaga-part03 \
  -e POSTGRES_USER=part03 -e POSTGRES_DB=part03 \
  -e POSTGRES_PASSWORD="$PART03_DB_PASSWORD" \
  -v adilbaga-part03-data:/var/lib/postgresql/data postgres:17-alpine
# Wait for pg_isready exit 0 before probing API readiness.
rtk proxy docker exec adilbaga-part03-postgres pg_isready -U part03 -d part03
rtk proxy docker run -d --name adilbaga-part03-api --network adilbaga-part03 \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop=ALL --security-opt=no-new-privileges \
  -p 127.0.0.1:18080:8080 \
  -e APP_ENV=production -e PORT=8080 \
  -e CORS_ALLOWED_ORIGINS=https://aktau.market \
  -e DATABASE_URL="postgres://part03:$PART03_DB_PASSWORD@adilbaga-part03-postgres:5432/part03?sslmode=disable" \
  adilbaga-part03-api:review
```

Use an isolated user-defined bridge: in this smoke environment Docker's internal
network left the requested host port unpublished (Ports=null).
DB has no published port; API is localhost-only.
Use raw RTK proxy when JSON or
exact exit codes are needed for assertions. Never dump docker inspect Env or logs
that might contain configuration values.

Check Docker health=healthy; live/ready=200; UID from `docker exec ... id -u` is
10001; `go`, `gcc`, `cc` and `/usr/local/go` are absent. Confirm categories JSON
404 and POST live JSON 405. Then stop **only** this disposable DB:

```bash
rtk proxy docker stop --time 10 adilbaga-part03-postgres
rtk curl http://127.0.0.1:18080/health/live   # 200
rtk curl http://127.0.0.1:18080/health/ready  # 503/status=not_ready
rtk proxy docker start adilbaga-part03-postgres
# Wait until ready returns 200; API ID/StartedAt must not change, RestartCount=0.
rtk curl http://127.0.0.1:18080/health/ready
rtk proxy docker stop --time 12 adilbaga-part03-api
# Expect clean exit 0 within 10s; inspect only State.ExitCode.
```

Finally remove only resources you created, after confirming ownership:

```bash
rtk proxy docker rm -v adilbaga-part03-api adilbaga-part03-postgres
rtk proxy docker volume rm adilbaga-part03-data
rtk proxy docker network rm adilbaga-part03
unset PART03_DB_PASSWORD
```

No application migrations, SQL, seed or production DB access are required.
Review evidence is in `docs/production/reports/PART_03_REPORT.md`; no deploy or
traffic cutover is implied by foundation acceptance.
