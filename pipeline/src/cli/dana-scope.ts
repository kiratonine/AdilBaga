import 'dotenv/config'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readDictionary } from '../mapping/dictionary.js'
import { computeDanaScope, defaultDanaScopePath, writeDanaScope } from '../mapping/dana-scope.js'
import { publishCategories } from '../mapping/scope.js'
import { mappingDir, REPO_ROOT } from '../paths.js'
import { readSourceFile } from '../source-file.js'

// pnpm scope:dana [--in <полный dana.json>] [--out <dana-scope-sections.json>]
const { values } = parseArgs({ options: { in: { type: 'string' }, out: { type: 'string' } } })
const input = values.in ? resolve(values.in) : resolve(REPO_ROOT, 'data/sources-full/dana.json')
const out = values.out ? resolve(values.out) : defaultDanaScopePath()

const file = readSourceFile(input)
if (file.storeCode !== 'DANA') throw new Error(`scope:dana expects a DANA source file, got ${file.storeCode}`)
// Набор считается по полному скрапу с аннотацией подразделов (SCRAPE_ALL=1)
if (file.sourceStats.mode !== 'full') throw new Error('scope:dana needs a full Dana scrape (SCRAPE_ALL=1)')

const dict = readDictionary(resolve(mappingDir(), 'dictionary.json'))
const scope = computeDanaScope(file, dict, publishCategories(), new Date().toISOString())
writeDanaScope(out, scope)
console.log(`[scope:dana] ${scope.sections.length} sections, covered ${scope.coveredProducts}/${scope.scopeProducts} scope products, unsectioned ${scope.unsectionedProducts} → ${out}`)
// Товары scope без подраздела не покрыты набором: молча терять их нельзя
if (scope.unsectionedProducts > 0) {
  console.error(`[scope:dana] ${scope.unsectionedProducts} scope products have no section and are not covered`)
  process.exit(1)
}
