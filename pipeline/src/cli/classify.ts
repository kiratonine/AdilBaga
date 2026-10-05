import 'dotenv/config'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readSourceFile } from '../source-file.js'
import { STORE_CODES } from '../types.js'
import { classifyBatch, type ClassifiedProduct } from '../agent/classify.js'
import { createGemini } from '../agent/gemini.js'

const DATA = resolve(import.meta.dirname, '../../../data')
const BATCH = 40
const llm = createGemini({ cacheDir: resolve(DATA, 'agent/cache') })
const files = STORE_CODES.map((c) => resolve(DATA, 'sources', `${c.toLowerCase()}.json`)).filter(existsSync).map(readSourceFile)
const items = files.flatMap((f) => f.products.map((product) => ({ storeCode: f.storeCode, product })))
const out: ClassifiedProduct[] = []
for (let i = 0; i < items.length; i += BATCH) {
  out.push(...(await classifyBatch(items.slice(i, i + BATCH), llm)))
  if ((i / BATCH) % 20 === 0) console.log(`[classify] ${Math.min(i + BATCH, items.length)}/${items.length}`)
}
mkdirSync(resolve(DATA, 'agent'), { recursive: true })
writeFileSync(resolve(DATA, 'agent/classified.json'), JSON.stringify({ sources: files.map(({ products, ...meta }) => meta), items: out }), 'utf8')
const fallbacks = out.filter((c) => c.flags.includes('llm_fallback')).length
console.log(`[classify] done: ${out.length} items, fallbacks ${fallbacks}, size conflicts ${out.filter((c) => c.flags.includes('size_conflict')).length}`)
if (fallbacks / out.length > 0.05) { console.error('[classify] >5% fallbacks — проверьте ключи/модель, повторите (кэш сохранит готовое)'); process.exit(1) }
