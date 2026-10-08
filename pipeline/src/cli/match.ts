import 'dotenv/config'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildBlocks } from '../agent/block.js'
import { buildBundle, qualityReport } from '../agent/bundle.js'
import type { ClassifiedProduct } from '../agent/classify.js'
import { createGemini } from '../agent/gemini.js'
import { countFailures } from '../agent/llm-stats.js'
import { matchBlock, type Cluster } from '../agent/match.js'
import { buildDictionary, writeDictionary } from '../mapping/dictionary.js'
import { isolateForPublish } from '../mapping/publish.js'
import { filterClustersByScope, publishCategories } from '../mapping/scope.js'
import type { SourceFile } from '../types.js'

const DATA = resolve(import.meta.dirname, '../../../data')
const { sources, items } = JSON.parse(readFileSync(resolve(DATA, 'agent/classified.json'), 'utf8')) as { sources: Omit<SourceFile, 'products'>[]; items: ClassifiedProduct[] }
const stats = countFailures(createGemini({ cacheDir: resolve(DATA, 'agent/cache') }))
const llm = stats.llm
const blocks = buildBlocks(items)
const clusters: Cluster[] = []
for (const [i, block] of blocks.entries()) {
  clusters.push(...(await matchBlock(block, llm)))
  if (i % 200 === 0) console.log(`[match] block ${i}/${blocks.length}`)
}
if (stats.calls() > 0 && stats.failures() / stats.calls() > 0.02) {
  console.error(`[match] LLM failures ${stats.failures()}/${stats.calls()} (>2%) — bundle не записан; повторите запуск, кэш сохранит готовое`)
  process.exit(1)
}
// Словарь строится из ВСЕХ кластеров (чтобы набор можно было расширить без LLM), на сайт идёт только выбранный scope
const fullBundle = buildBundle(clusters, sources, new Date().toISOString())
const bundle = buildBundle(isolateForPublish(filterClustersByScope(clusters, publishCategories())), sources, fullBundle.generatedAt)
writeFileSync(resolve(DATA, 'agent/bundle.json'), JSON.stringify(bundle), 'utf8')
const report = qualityReport(bundle)
writeFileSync(resolve(DATA, 'agent/report.md'), report, 'utf8')
console.log(report)
writeDictionary(resolve(DATA, 'mapping/dictionary.json'), buildDictionary(fullBundle))
console.log(`[match] dictionary → ${resolve(DATA, 'mapping/dictionary.json')}`)
