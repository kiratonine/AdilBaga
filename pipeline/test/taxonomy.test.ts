import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATEGORIES, isCategorySlug } from '../src/agent/taxonomy.js'

const sql = readFileSync(new URL('../../backend/prisma/migrations/20261006000000_catalog_taxonomy/migration.sql', import.meta.url), 'utf8')

describe('taxonomy', () => {
  it('keeps legacy slugs used by dashboard baskets', () => {
    for (const s of ['milk', 'bread', 'eggs', 'sugar', 'oil', 'other']) expect(isCategorySlug(s)).toBe(true)
  })
  it('migration inserts every taxonomy slug', () => {
    for (const c of CATEGORIES) expect(sql).toContain(`'${c.slug}'`)
  })
  it('slugs are unique and kebab-case', () => {
    const slugs = CATEGORIES.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) expect(s).toMatch(/^[a-z]+(-[a-z]+)*$/)
  })
})
