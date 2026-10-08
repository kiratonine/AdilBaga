import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readDictionary } from '../mapping/dictionary.js'
import { buildTaxonomyMigration } from '../mapping/taxonomy-sql.js'

const ROOT = resolve(import.meta.dirname, '../../..')
const target = resolve(ROOT, 'backend/prisma/migrations/20261006000000_catalog_taxonomy/migration.sql')
writeFileSync(target, buildTaxonomyMigration(readDictionary(resolve(ROOT, 'data/mapping/dictionary.json'))), 'utf8')
console.log(`[taxonomy:sql] ${target}`)
