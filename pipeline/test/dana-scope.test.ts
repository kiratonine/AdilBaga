import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CategorySlug } from '../src/agent/taxonomy.js'
import type { Dictionary } from '../src/mapping/dictionary.js'
import { computeDanaScope, readDanaScope, writeDanaScope, type DanaScope } from '../src/mapping/dana-scope.js'
import type { SourceFile, SourceProduct } from '../src/types.js'

const at = '2026-10-16T06:00:00.000Z'
const scope = new Set<CategorySlug>(['milk'])
const ROOT = '/catalog/produkty_pitaniya_/'
const A = `${ROOT}a/`, B = `${ROOT}b/`, C = `${ROOT}c/`, D = `${ROOT}d/`

const product = (id: string, sections: string[], path: string[] = ['Продукты питания']): SourceProduct => ({
  sourceProductId: `dana_${id}`, name: `Товар ${id}`, price: 100, oldPrice: null, imageUrl: null, sourceUrl: null, brand: null,
  sourceCategoryPath: path, rawPayload: { rawId: id, sections },
})
const file = (products: SourceProduct[]): SourceFile =>
  ({ storeCode: 'DANA', city: 'Aktau', capturedAt: at, errorCount: 0, sourceStats: { mode: 'full' }, products })

// Перечисленные товары Dana — молоко, остальные без записи → 'other'
const dict = (milkIds: string[]): Dictionary => ({
  version: 1, generatedAt: at,
  canonicals: { c_milk: { name: 'Молоко', brand: null, category: 'milk', attributes: {}, method: 'deterministic', confidence: 1, review: 'approved' } },
  products: Object.fromEntries(milkIds.map((id) => [`DANA:dana_${id}`, 'c_milk'])),
  storeCategories: {},
})

describe('computeDanaScope', () => {
  it('picks the minimal covering sections', () => {
    const f = file([product('1', [A]), product('2', [A, B]), product('3', [C]), product('4', [D])])
    const s = computeDanaScope(f, dict(['1', '2', '3']), scope, at)
    expect(s.sections).toEqual([A, C])
    expect(s).toMatchObject({ version: 1, generatedAt: at, scope: ['milk'], root: ROOT, coveredProducts: 3, scopeProducts: 3, unsectionedProducts: 0 })
  })

  it('prefers the smaller section on ties', () => {
    const others = Array.from({ length: 5 }, (_, i) => product(`o${i}`, [A]))
    const f = file([product('1', [A, B]), ...others])
    expect(computeDanaScope(f, dict(['1']), scope, at).sections).toEqual([B])
  })

  it('counts scope products without sections as unsectioned and uncovered', () => {
    const f = file([product('1', [A]), product('2', [])])
    const s = computeDanaScope(f, dict(['1', '2']), scope, at)
    expect(s.sections).toEqual([A])
    expect(s.unsectionedProducts).toBe(1)
    expect(s.coveredProducts).toBe(s.scopeProducts - 1)
  })

  it('ignores products of other roots', () => {
    const f = file([product('1', [A]), product('2', [B], ['Бытовая химия'])])
    const s = computeDanaScope(f, dict(['1', '2']), scope, at)
    expect(s.sections).toEqual([A])
    expect(s.scopeProducts).toBe(1)
  })
})

describe('readDanaScope / writeDanaScope', () => {
  afterEach(() => { vi.restoreAllMocks() })
  const base = (): DanaScope => ({ version: 1, generatedAt: at, scope: ['milk'], root: ROOT, sections: [B, A], coveredProducts: 2, scopeProducts: 2, unsectionedProducts: 0 })

  it('returns null for missing, invalid or empty file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dana-scope-'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readDanaScope(join(dir, 'missing.json'))).toBeNull()
    expect(warn).not.toHaveBeenCalled()

    const broken = join(dir, 'broken.json')
    writeFileSync(broken, '{not json', 'utf8')
    expect(readDanaScope(broken)).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)

    const empty = join(dir, 'empty.json')
    writeFileSync(empty, JSON.stringify({ ...base(), sections: [] }), 'utf8')
    expect(readDanaScope(empty)).toBeNull()
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('write sorts sections and round-trips through read', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dana-scope-')), 'nested', 'scope.json')
    writeDanaScope(path, base())
    const text = readFileSync(path, 'utf8')
    expect(text.endsWith('}\n')).toBe(true)
    expect(JSON.parse(text).sections).toEqual([A, B])
    expect(readDanaScope(path, scope)).toEqual([A, B])
  })

  it('returns null when a published category is missing from the stored scope', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dana-scope-')), 'scope.json')
    writeDanaScope(path, base())
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readDanaScope(path, new Set<CategorySlug>(['milk', 'bread']))).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/bread/))
    expect(readDanaScope(path, new Set<CategorySlug>(['milk']))).toEqual([A, B])
  })

  it('rejects sections outside the root', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dana-scope-')), 'scope.json')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeFileSync(path, JSON.stringify({ ...base(), sections: ['/catalog/other/x/'] }), 'utf8')
    expect(readDanaScope(path, scope)).toBeNull()
  })
})
