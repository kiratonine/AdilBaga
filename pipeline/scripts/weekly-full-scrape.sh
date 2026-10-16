#!/usr/bin/env bash
# Еженедельный полный скрап (SCRAPE_ALL=1) без публикации: обновляет полные source-файлы,
# пересчитывает кандидаты наборов Dina (категории) и Dana (подразделы) и unmapped.json для разбора новых товаров. Ingest НЕ запускается.
# Пишет в data/sources-full/ и data/sync-full/, чтобы не затереть узкие ежедневные файлы.
# Env для БД не нужны. Результат: data/sources-full/dina-scope-categories.candidate.json и dana-scope-sections.candidate.json
# (сравнить с data/mapping/dina-scope-categories.json и dana-scope-sections.json, закоммитить вручную) и data/sync-full/unmapped.json.
# Коды выхода: 0 — всё удачно; ненулевой — упал скрапер (scope и sync не запускаются), scope-шаг или sync.
# Упавший scope-шаг не пропускает sync: unmapped.json обновляется всегда, а скрипт в конце выходит с кодом 1.
set -euo pipefail
cd "$(dirname "$0")/.."

export SCRAPE_ALL=1 SOURCES_DIR=data/sources-full SYNC_OUT_DIR=data/sync-full

STORES=(dina dana fixprice)
started=$SECONDS

# Скраперы параллельно, тем же приёмом, что в daily-sync.sh
pids=()
for s in "${STORES[@]}"; do
  (
    t0=$SECONDS
    code=0
    pnpm "scrape:$s" 2>&1 | sed -u "s/^/[$s] /" || code=$?
    echo "[full] $s exit=$code took=$((SECONDS - t0))s"
    exit "$code"
  ) &
  pids+=("$!")
done

# Ждём всех, и только потом решаем: любой упавший скрапер → exit 1
failed=()
for i in "${!STORES[@]}"; do
  if ! wait "${pids[$i]}"; then
    failed+=("${STORES[$i]}")
  fi
done
if [ "${#failed[@]}" -gt 0 ]; then
  echo "[full] failed scrapers: ${failed[*]}"
  exit 1
fi

# Падение scope-шага (например, у товаров Dana нет подраздела) не должно оставить unmapped.json без обновления
scope_failed=()
pnpm scope:dina --in ../data/sources-full/dina.json --out ../data/sources-full/dina-scope-categories.candidate.json || scope_failed+=(scope:dina)
pnpm scope:dana --in ../data/sources-full/dana.json --out ../data/sources-full/dana-scope-sections.candidate.json || scope_failed+=(scope:dana)
SYNC_MAX_SOURCE_AGE_HOURS=36 pnpm sync

echo "[full] done in $((SECONDS - started))s"
echo "[full] candidates written; compare with data/mapping/dina-scope-categories.json and dana-scope-sections.json, commit manually"

if [ "${#scope_failed[@]}" -gt 0 ]; then
  echo "[full] failed scope steps: ${scope_failed[*]} (see candidate files)"
  exit 1
fi
