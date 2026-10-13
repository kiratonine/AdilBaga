import { DINA_BATCH_PAGES } from './scrapers/dina.js'
import type { SourceFile } from './types.js'

/**
 * Узкий ежедневный скрап, где одна ошибка теряет крупный кусок scope:
 * Dina батчами (упавший алиас — вся категория, упавший HTTP-батч — до 20 страниц)
 * и Fix Price по единственному алиасу (ошибка на странице N — весь остаток каталога).
 */
function isFragileScrape(file: SourceFile): boolean {
  if (file.storeCode === 'DINA') return file.sourceStats.mode === 'batch'
  if (file.storeCode === 'FIX_PRICE') return file.sourceStats.scoped === true
  return false
}

/**
 * Частично упавший узкий скрап не записываем: прежний файл остаётся, daily-sync.sh уходит
 * в fallback (exit 3, stale stores), а не публикует урезанный набор и не ловит store_count_drop.
 * Dana, SCRAPE_ALL=1 и прежний обход Dina по корням сохраняют терпимость к ошибкам.
 */
export function assertCompleteScrape(file: SourceFile, opts: { all: boolean }): void {
  if (opts.all || file.errorCount === 0 || !isFragileScrape(file)) return
  throw new Error(
    `${file.storeCode}: scoped scrape finished with ${file.errorCount} error(s) (${file.products.length} products collected) — refusing to write, keeping previous file`,
  )
}

/** DINA_BATCH_PAGES из env: пусто → 20; мусор, ≤0, дробное → 20; больше 20 → 20 (это максимум) */
export function resolveDinaBatchPages(env: string | undefined = process.env.DINA_BATCH_PAGES): number {
  const raw = env?.trim()
  if (!raw) return DINA_BATCH_PAGES
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) {
    console.warn(`[DINA] DINA_BATCH_PAGES=${raw} is not a positive integer, using ${DINA_BATCH_PAGES}`)
    return DINA_BATCH_PAGES
  }
  if (n > DINA_BATCH_PAGES) {
    console.warn(`[DINA] DINA_BATCH_PAGES=${raw} exceeds the maximum ${DINA_BATCH_PAGES}, using ${DINA_BATCH_PAGES}`)
    return DINA_BATCH_PAGES
  }
  return n
}
