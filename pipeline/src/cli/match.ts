import 'dotenv/config'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildBlocks } from '../agent/block.js'
import { buildBundle, qualityReport } from '../agent/bundle.js'
import type { ClassifiedProduct } from '../agent/classify.js'
import { createGemini } from '../agent/gemini.js'
import { matchBlock, type Cluster } from '../agent/match.js'
import { buildDictionary, writeDictionary } from '../mapping/dictionary.js'
import type { SourceFile } from '../types.js'

const DATA = resolve(import.meta.dirname, '../../../data')
const { sources, items } = JSON.parse(readFileSync(resolve(DATA, 'agent/classified.json'), 'utf8')) as { sources: Omit<SourceFile, 'products'>[]; items: ClassifiedProduct[] }
const llm = createGemini({ cacheDir: resolve(DATA, 'agent/cache') })
const blocks = buildBlocks(items)
const clusters: Cluster[] = []
for (const [i, block] of blocks.entries()) {
  clusters.push(...(await matchBlock(block, llm)))
  if (i % 200 === 0) console.log(`[match] block ${i}/${blocks.length}`)
}
const bundle = buildBundle(clusters, sources, new Date().toISOString())
writeFileSync(resolve(DATA, 'agent/bundle.json'), JSON.stringify(bundle), 'utf8')
const report = qualityReport(bundle)
writeFileSync(resolve(DATA, 'agent/report.md'), report, 'utf8')
console.log(report)
writeDictionary(resolve(DATA, 'mapping/dictionary.json'), buildDictionary(bundle))
console.log(`[match] dictionary → ${resolve(DATA, 'mapping/dictionary.json')}`)
