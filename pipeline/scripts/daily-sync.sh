#!/usr/bin/env bash
# Ежедневное обновление цен: три скрапера параллельно → словарь → cmd/ingest. Без LLM.
# Нужные env: APP_ENV, INGEST_DATABASE_URL, INGEST_MAX_STORE_DROP_PERCENT (+ INGEST_PRODUCTION_APPLY_CONFIRM=1 в production).
# Необязательные env:
#   SOURCES_DIR  — каталог source-файлов сетей (по умолчанию data/sources);
#   SYNC_OUT_DIR — каталог bundle.json/unmapped.json (по умолчанию data/sync);
#     относительные пути считаются от корня репозитория, абсолютные остаются как есть;
#   SYNC_MAX_SOURCE_AGE_HOURS — сколько часов можно публиковать прошлый удачный файл упавшей сети (по умолчанию 36).
# Упавший скрапер не перезаписывает свой source-файл, поэтому sync берёт прошлый удачный (если он не старше лимита).
# Коды выхода:
#   0 — все три скрапера удачны, snapshot опубликован;
#   1 — ошибка sync/ingest или упали все три скрапера (snapshot не опубликован);
#   3 — snapshot опубликован, но хотя бы одна сеть взята из прошлого удачного файла
#       (в журнале строка "[sync] stale stores: <list>").

# Без -e на этапе скрапа: упавший скрапер не должен останавливать скрипт до pnpm sync
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT/pipeline" || exit 1

# Абсолютный путь к bundle: ниже скрипт переходит в backend-go
SYNC_OUT="${SYNC_OUT_DIR:-data/sync}"
case "$SYNC_OUT" in
  /*) ;;
  *) SYNC_OUT="$REPO_ROOT/$SYNC_OUT" ;;
esac
BUNDLE="$SYNC_OUT/bundle.json"

STORES=(dina dana fixprice)
started=$SECONDS

# Скраперы фоном; каждая строка вывода помечена сетью, итог сети подоболочка печатает сама в момент завершения
pids=()
for s in "${STORES[@]}"; do
  (
    t0=$SECONDS
    pnpm "scrape:$s" 2>&1 | sed -u "s/^/[$s] /"
    code=$?
    echo "[sync] $s exit=$code took=$((SECONDS - t0))s"
    exit "$code"
  ) &
  pids+=("$!")
done

failed=()
for i in "${!STORES[@]}"; do
  if ! wait "${pids[$i]}"; then
    failed+=("${STORES[$i]}")
  fi
done

if [ "${#failed[@]}" -eq "${#STORES[@]}" ]; then
  echo "[sync] all scrapers failed, nothing to publish"
  exit 1
fi

# Публикация: любая ошибка → код 1 (ненулевой код pnpm/go не должен совпасть с кодом 3)
set -e
trap 'echo "[sync] publish step failed" >&2; exit 1' ERR

pnpm sync
cd "$REPO_ROOT/backend-go"
go run ./cmd/ingest -bundle "$BUNDLE"            # dry-run: quality gates без записи
go run ./cmd/ingest -bundle "$BUNDLE" -apply

trap - ERR
echo "[sync] done in $((SECONDS - started))s"

if [ "${#failed[@]}" -gt 0 ]; then
  echo "[sync] stale stores: ${failed[*]}"
  exit 3
fi
exit 0
