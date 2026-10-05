import 'dotenv/config'
import { resolve } from 'node:path'
import { writeSourceFile } from '../source-file.js'
import { STORE_CODES, type SourceFile, type StoreCode } from '../types.js'
import { scrapeDina } from '../scrapers/dina.js'

export type Scraper = () => Promise<SourceFile>
const SCRAPERS: Partial<Record<StoreCode, Scraper>> = { DINA: () => scrapeDina() }

const code = process.argv[2] as StoreCode
const scraper = STORE_CODES.includes(code) ? SCRAPERS[code] : undefined
if (!scraper) { console.error(`usage: scrape <${Object.keys(SCRAPERS).join('|')}>`); process.exit(2) }
const file = await scraper()
const out = resolve(import.meta.dirname, '../../../data/sources', `${code.toLowerCase()}.json`)
writeSourceFile(out, file)
const withImage = file.products.filter((p) => p.imageUrl).length
console.log(`[${code}] ${file.products.length} products, images ${withImage}, errors ${file.errorCount} → ${out}`)
