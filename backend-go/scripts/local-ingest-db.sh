#!/usr/bin/env bash
set -euo pipefail
# Тестовая БД для SCRUM-7: postgres:17 на loopback, схема и роли как в production.
# psql/pg_dump берутся из контейнера, на хосте они не нужны.
#
# Дамп каталога prod (делает человек с owner-доступом, файл НЕ коммитится, PII в этих таблицах нет):
#   docker run --rm postgres:17-alpine pg_dump "$SUPABASE_DIRECT_URL" --data-only --no-owner --disable-triggers \
#     -t public.stores -t public.store_locations -t public.categories -t public.snapshots -t public.source_runs \
#     -t public.raw_products -t public.canonical_products -t public.product_mappings -t public.offers > data/agent/prod_catalog.sql
# Без дампа (SKIP_DUMP=1) поднимается пустая схема — так можно проверить порядок миграций и ролей.
cd "$(dirname "$0")/../.."

NAME=adilbaga-ingest-test PORT=55432 PW=local-only-pass
M=backend/prisma/migrations SEC=backend/prisma/security
DUMP=data/agent/prod_catalog.sql

if [ "${SKIP_DUMP:-0}" != "1" ] && [ ! -s "$DUMP" ]; then
  echo "нет $DUMP — сделайте дамп (см. комментарий в начале скрипта) или запустите с SKIP_DUMP=1" >&2
  exit 1
fi

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD="$PW" -p 127.0.0.1:$PORT:5432 postgres:17-alpine >/dev/null
until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 2

# Файл подаётся через stdin, чтобы не зависеть от путей Windows внутри контейнера
run() { docker exec -i "$NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f - < "$1" >/dev/null; }

run $M/20260923000000_init/migration.sql
run $SEC/aktau_api_reader_role.sql        # группа читателя нужна ДО rls-миграции (README, Part 04)
run $M/20261004000000_rls_runtime_access/migration.sql
run $M/20261005000000_snapshot_history/migration.sql
run $SEC/aktau_ingest_writer_role.sql     # после snapshot_history, до LOGIN
if [ "${SKIP_DUMP:-0}" != "1" ]; then run "$DUMP"; fi
run $M/20261006000000_catalog_taxonomy/migration.sql
docker exec "$NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q \
  -c "CREATE ROLE ingest_local LOGIN PASSWORD '$PW' IN ROLE aktau_ingest_writer" >/dev/null

echo "INGEST_DATABASE_URL=postgresql://ingest_local:$PW@127.0.0.1:$PORT/postgres"
