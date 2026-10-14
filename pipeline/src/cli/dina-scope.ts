import 'dotenv/config'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readDictionary } from '../mapping/dictionary.js'
import { computeDinaScope, defaultDinaScopePath, writeDinaScope } from '../mapping/dina-scope.js'
import { publishCategories } from '../mapping/scope.js'
import { mappingDir, REPO_ROOT } from '../paths.js'
import { readSourceFile } from '../source-file.js'

// pnpm scope:dina [--in <полный dina.json>] [--out <dina-scope-categories.json>]
const { values } = parseArgs({ options: { in: { type: 'string' }, out: { type: 'string' } } })
const input = values.in ? resolve(values.in) : resolve(REPO_ROOT, 'data/sources-full/dina.json')
const out = values.out ? resolve(values.out) : defaultDinaScopePath()

const file = readSourceFile(input)
if (file.storeCode !== 'DINA') throw new Error(`scope:dina expects a DINA source file, got ${file.storeCode}`)
// Набор считается по всему каталогу: из урезанного скрапа выпали бы товары scope в чужих категориях
if (file.sourceStats.scoped === true || file.sourceStats.mode === 'batch') throw new Error('scope:dina needs a full Dina scrape (SCRAPE_ALL=1)')

const dict = readDictionary(resolve(mappingDir(), 'dictionary.json'))
const scope = computeDinaScope(file, dict, publishCategories(), new Date().toISOString())
writeDinaScope(out, scope)
console.log(`[scope:dina] ${scope.categoryIds.length} categories, covered ${scope.coveredProducts}/${scope.scopeProducts} scope products → ${out}`)
const missed = scope.scopeProducts - scope.coveredProducts
if (missed > 0) console.warn(`[scope:dina] ${missed} scope products have no Dina category and are not covered`)
