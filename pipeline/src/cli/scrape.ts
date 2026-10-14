import 'dotenv/config'
import { resolve } from 'node:path'
import { sourcesDir } from '../paths.js'
import { writeSourceFile } from '../source-file.js'
import { STORE_CODES, type SourceFile, type StoreCode } from '../types.js'
import { DANA_SCOPE_ROOTS, scrapeDana } from '../scrapers/dana.js'
import { FIXPRICE_SCOPE_ALIASES, loadFixPriceFromHar, scrapeFixPrice } from '../scrapers/fixprice.js'
import { DINA_SCOPE_ROOTS, scrapeDina } from '../scrapers/dina.js'
import { defaultDinaScopePath, readDinaScope } from '../mapping/dina-scope.js'
import { assertCompleteScrape, resolveDinaBatchPages } from '../scrape-policy.js'

// По умолчанию скрапим только категории публикуемого scope; SCRAPE_ALL=1 — весь каталог
const all = process.env.SCRAPE_ALL === '1'

export type Scraper = () => Promise<SourceFile>
const SCRAPERS: Partial<Record<StoreCode, Scraper>> = {
  // Набор категорий из pnpm scope:dina → батч-обход; файла нет, он битый/пустой или устарел → прежний обход по корням
  DINA: () => {
    if (all) {
      console.log('[DINA] mode: full (SCRAPE_ALL)')
      return scrapeDina({})
    }
    const ids = readDinaScope(defaultDinaScopePath())
    if (!ids) {
      console.log('[DINA] mode: legacy roots (scope file missing, empty or stale)')
      return scrapeDina({ scopeRoots: DINA_SCOPE_ROOTS })
    }
    const batchPages = resolveDinaBatchPages()
    console.log(`[DINA] mode: batch (${ids.length} categories from dina-scope-categories.json, ${batchPages} pages per request)`)
    return scrapeDina({ categoryIds: ids, batchPages })
  },
  DANA: () => scrapeDana(all ? {} : { roots: DANA_SCOPE_ROOTS }),
  FIX_PRICE: () => process.env.FIXPRICE_HAR ? Promise.resolve(loadFixPriceFromHar(process.env.FIXPRICE_HAR)) : scrapeFixPrice(all ? {} : { aliases: FIXPRICE_SCOPE_ALIASES }),
}

const code = process.argv[2] as StoreCode
const scraper = STORE_CODES.includes(code) ? SCRAPERS[code] : undefined
if (!scraper) { console.error(`usage: scrape <${Object.keys(SCRAPERS).join('|')}>`); process.exit(2) }
const file = await scraper()
const out = resolve(sourcesDir(), `${code.toLowerCase()}.json`)
// Частично упавший узкий скрап (Dina батчами, Fix Price по алиасу) не перезаписывает прежний файл
try {
  assertCompleteScrape(file, { all })
} catch (err) {
  console.error(`[${code}] ${(err as Error).message}`)
  process.exit(1)
}
writeSourceFile(out, file)
const withImage = file.products.filter((p) => p.imageUrl).length
console.log(`[${code}] ${file.products.length} products, images ${withImage}, errors ${file.errorCount} → ${out}`)
