#!/usr/bin/env bash
# Ежедневное обновление цен: адаптеры → словарь → cmd/ingest. Без LLM.
# Нужные env: APP_ENV, INGEST_DATABASE_URL, INGEST_MAX_STORE_DROP_PERCENT (+ INGEST_PRODUCTION_APPLY_CONFIRM=1 в production).
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm scrape:dina
pnpm scrape:dana
pnpm scrape:fixprice
pnpm sync
cd ../backend-go
go run ./cmd/ingest -bundle ../data/sync/bundle.json            # dry-run: quality gates без записи
go run ./cmd/ingest -bundle ../data/sync/bundle.json -apply
