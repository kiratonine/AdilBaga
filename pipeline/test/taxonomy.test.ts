import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CATEGORIES, isCategorySlug } from '../src/agent/taxonomy.js'
import { readDictionary } from '../src/mapping/dictionary.js'
import { DEFAULT_PUBLISH_CATEGORIES, publishCategories } from '../src/mapping/scope.js'
import { assertServableSchema, buildTaxonomyMigration, filterSchemaFor } from '../src/mapping/taxonomy-sql.js'

const sql = readFileSync(new URL('../../backend/prisma/migrations/20261006000000_catalog_taxonomy/migration.sql', import.meta.url), 'utf8')
const dict = readDictionary(fileURLToPath(new URL('../../data/mapping/dictionary.json', import.meta.url)))

type Row = { id: string; slug: string; name: string; schema: { filters: { key: string; label: string; type: string; options?: (string | number)[] }[] } }
const unquote = (s: string) => s.replaceAll("''", "'")
const rows: Row[] = [...sql.matchAll(/^ \('((?:[^']|'')*)','((?:[^']|'')*)','((?:[^']|'')*)','((?:[^']|'')*)'\),?$/gm)]
  .map((m) => ({ id: unquote(m[1]!), slug: unquote(m[2]!), name: unquote(m[3]!), schema: JSON.parse(unquote(m[4]!)) }))

describe('taxonomy', () => {
  it('keeps legacy slugs used by dashboard baskets', () => {
    for (const s of ['milk', 'bread', 'eggs', 'sugar', 'oil', 'other']) expect(isCategorySlug(s)).toBe(true)
  })
  it('migration contains exactly the 9 published categories, no legacy other and no salt', () => {
    expect(rows.map((r) => r.slug).sort()).toEqual([...DEFAULT_PUBLISH_CATEGORIES].sort())
    expect(rows.map((r) => r.id).sort()).toEqual(rows.map((r) => `cat-${r.slug}`).sort())
    expect(sql).not.toContain("'other'")
    expect(sql).not.toContain("'salt'")
    for (const r of rows) expect(r.name).toBe(CATEGORIES.find((c) => c.slug === r.slug)!.name)
  })
  it('migration updates name and filterSchema of existing rows and keeps their ids (no DO NOTHING)', () => {
    expect(sql).toContain('ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, "filterSchema" = EXCLUDED."filterSchema";')
    expect(sql).not.toMatch(/DO NOTHING/i)
    expect(sql).not.toMatch(/SET[^;]*\bid\s*=/i)
    expect(sql).not.toMatch(/DELETE|DROP|TRUNCATE/i)
  })
  it('every multi-select in the migration has non-empty primitive options (the API drops it otherwise)', () => {
    for (const r of rows) {
      assertServableSchema(r.slug, r.schema)
      for (const f of r.schema.filters) expect(f.type).toBe('multi-select')
    }
  })
  it('the guard really catches multi-select without options, with empty options and with non-primitive options', () => {
    const f = (options?: unknown) => ({ filters: [{ key: 'volumeMl', type: 'multi-select', options }] })
    expect(() => assertServableSchema('x', f())).toThrow(/without options/)
    expect(() => assertServableSchema('x', f([]))).toThrow(/without options/)
    expect(() => assertServableSchema('x', f([{ a: 1 }]))).toThrow(/primitives/)
    expect(() => assertServableSchema('x', f([1, 1]))).toThrow(/duplicate/)
    expect(() => assertServableSchema('x', { filters: [{ key: 'flag', type: 'boolean' }] })).not.toThrow()
  })
  it('migration filters are the taxonomy filters for which the reviewed dictionary has values, options come from the dictionary', () => {
    for (const r of rows) {
      const expected = filterSchemaFor(dict, r.slug as (typeof DEFAULT_PUBLISH_CATEGORIES)[number])
      expect(r.schema).toEqual(expected)
      const declared = CATEGORIES.find((c) => c.slug === r.slug)!.filters.map((f) => f.key)
      for (const f of r.schema.filters) expect(declared).toContain(f.key)
    }
    expect(rows.find((r) => r.slug === 'vegetables')!.schema.filters).toEqual([])
    for (const slug of ['dairy', 'meat', 'groats']) expect(rows.find((r) => r.slug === slug)!.schema.filters.length).toBeGreaterThan(0)
  })
  it('committed migration is exactly what `pnpm taxonomy:sql` generates from the committed dictionary', () => {
    expect(sql).toBe(buildTaxonomyMigration(dict))
  })
  it('committed dictionary has no non-positive size/fat attributes, and no filter option is 0', () => {
    for (const [id, c] of Object.entries(dict.canonicals as Record<string, { attributes: Record<string, number> }>))
      for (const k of ['volumeMl', 'weightGrams', 'packageCount', 'fatPercent'])
        if (c.attributes[k] !== undefined) expect(c.attributes[k], `${id}.${k}`).toBeGreaterThan(0)
    for (const r of rows) for (const f of r.schema.filters) expect((f.options ?? []) as unknown[], `${r.slug}.${f.key}`).not.toContain(0)
  })
  it('slugs are unique and kebab-case', () => {
    const slugs = CATEGORIES.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) expect(s).toMatch(/^[a-z]+(-[a-z]+)*$/)
  })
  it('PUBLISH_CATEGORIES rejects slugs that have no row in the migration', () => {
    expect(() => publishCategories('milk,fish')).toThrow(/migration/)
    expect(publishCategories('milk,eggs')).toEqual(new Set(['milk', 'eggs']))
  })
})
