import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATEGORIES, isCategorySlug } from '../src/agent/taxonomy.js'
import { DEFAULT_PUBLISH_CATEGORIES, publishCategories } from '../src/mapping/scope.js'

const sql = readFileSync(new URL('../../backend/prisma/migrations/20261006000000_catalog_taxonomy/migration.sql', import.meta.url), 'utf8')

describe('taxonomy', () => {
  it('keeps legacy slugs used by dashboard baskets', () => {
    for (const s of ['milk', 'bread', 'eggs', 'sugar', 'oil', 'other']) expect(isCategorySlug(s)).toBe(true)
  })
  it('migration inserts every published category', () => {
    for (const slug of DEFAULT_PUBLISH_CATEGORIES) expect(sql).toContain(`('cat-${slug}','${slug}'`)
  })
  it('migration contains no category outside the publish scope (incl. legacy other)', () => {
    const slugs = [...sql.matchAll(/\('cat-[a-z-]+','([a-z-]+)'/g)].map((m) => m[1])
    expect(slugs.sort()).toEqual([...DEFAULT_PUBLISH_CATEGORIES].sort())
    expect(sql).not.toContain("'other'")
    expect(sql).toContain("SET name = 'Сахар' WHERE slug = 'sugar'")
  })
  it('PUBLISH_CATEGORIES rejects slugs that have no row in the migration', () => {
    expect(() => publishCategories('milk,fish')).toThrow(/migration/)
    expect(publishCategories('milk,eggs')).toEqual(new Set(['milk', 'eggs']))
  })
  it('slugs are unique and kebab-case', () => {
    const slugs = CATEGORIES.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) expect(s).toMatch(/^[a-z]+(-[a-z]+)*$/)
  })
})
