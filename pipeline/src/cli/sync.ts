import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { qualityReport } from '../agent/bundle.js'
import { readDictionary } from '../mapping/dictionary.js'
import { publishCategories } from '../mapping/scope.js'
import { mappingDir, sourcesDir, syncOutDir } from '../paths.js'
import { readSourceFile } from '../source-file.js'
import { assertFresh, buildSyncBundle } from '../sync/sync.js'
import { STORE_CODES, type StoreCode } from '../types.js'

// Пока ANVAR не подключён (Phase B), обязательны три сети; список меняется через env без правки кода
const required = (process.env.SYNC_STORES ?? 'DINA,DANA,FIX_PRICE').split(',').map((s) => s.trim()) as StoreCode[]
if (!required.every((s) => STORE_CODES.includes(s))) throw new Error(`SYNC_STORES invalid: ${required.join(',')}`)
const maxAge = Number(process.env.SYNC_MAX_SOURCE_AGE_HOURS ?? 36)

const files = required.map((s) => readSourceFile(resolve(sourcesDir(), `${s.toLowerCase()}.json`)))
assertFresh(files, required, new Date(), maxAge)
const dict = readDictionary(resolve(mappingDir(), 'dictionary.json'))
const { bundle, unmapped } = buildSyncBundle(files, dict, new Date().toISOString(), publishCategories())

const outDir = syncOutDir()
mkdirSync(outDir, { recursive: true })
writeFileSync(resolve(outDir, 'bundle.json'), JSON.stringify(bundle), 'utf8')
writeFileSync(resolve(outDir, 'unmapped.json'), JSON.stringify(unmapped, null, 2), 'utf8')
console.log(qualityReport(bundle))
console.log(`[sync] unmapped: ${unmapped.length} → ${resolve(outDir, 'unmapped.json')}`)
