import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { readDictionary } from '../mapping/dictionary.js'
import { buildTaxonomyMigration, TAXONOMY_MIGRATION } from '../mapping/taxonomy-sql.js'

const ROOT = resolve(import.meta.dirname, '../../..')
const target = resolve(ROOT, TAXONOMY_MIGRATION)
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, buildTaxonomyMigration(readDictionary(resolve(ROOT, 'data/mapping/dictionary.json'))), 'utf8')
console.log(`[taxonomy:sql] ${target}`)
