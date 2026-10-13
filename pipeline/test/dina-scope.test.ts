import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CategorySlug } from '../src/agent/taxonomy.js'
import type { Dictionary } from '../src/mapping/dictionary.js'
import { computeDinaScope, defaultDinaScopePath, readDinaScope, writeDinaScope, type DinaScope } from '../src/mapping/dina-scope.js'
import { publishCategories } from '../src/mapping/scope.js'
import type { SourceFile, SourceProduct } from '../src/types.js'

const at = '2026-10-13T06:00:00.000Z'
const scope = new Set<CategorySlug>(['milk'])

const product = (id: string, cats: string[], path: string[] = []): SourceProduct => ({
  sourceProductId: id, name: `Товар ${id}`, price: 100, oldPrice: null, imageUrl: null, sourceUrl: null, brand: null,
  sourceCategoryPath: path, rawPayload: { id, categories: cats.map((c) => ({ id: c, name: `Кат ${c}` })) },
})
const file = (products: SourceProduct[]): SourceFile =>
  ({ storeCode: 'DINA', city: 'Aktau', capturedAt: at, errorCount: 0, sourceStats: {}, products })

// Словарь: перечисленные товары Dina — молоко (карточка c_milk), остальные без записи → 'other'
const dict = (milkIds: string[], storeCategories: Record<string, CategorySlug> = {}): Dictionary => ({
  version: 1, generatedAt: at,
  canonicals: { c_milk: { name: 'Молоко', brand: null, category: 'milk', attributes: {}, method: 'deterministic', confidence: 1, review: 'approved' } },
  products: Object.fromEntries(milkIds.map((id) => [`DINA:${id}`, 'c_milk'])),
  storeCategories,
})

describe('computeDinaScope', () => {
  it('covers every scope product with a minimal set', () => {
    const f = file([
      product('1', ['10', '11']), product('2', ['10']), product('3', ['12']), product('4', ['12', '13']),
      product('5', ['11']), product('6', ['11']), product('7', ['11']),
    ])
    const s = computeDinaScope(f, dict(['1', '2', '3', '4']), scope, at)
    expect(s.categoryIds).toEqual(['10', '12'])
    expect(s.coveredProducts).toBe(4)
    expect(s.scopeProducts).toBe(4)
    expect(s).toMatchObject({ version: 1, generatedAt: at, scope: ['milk'] })
  })

  it('prefers the smaller category on ties', () => {
    const others = Array.from({ length: 49 }, (_, i) => product(`o${i}`, ['20']))
    const f = file([product('1', ['20', '21']), ...others, product('x', ['21'])])
    const s = computeDinaScope(f, dict(['1']), scope, at)
    expect(s.categoryIds).toEqual(['21'])
  })

  it('uses storeCategories for unmapped products', () => {
    const f = file([product('1', ['30'], ['Молоко']), product('2', ['31'], ['Бытовая химия'])])
    const s = computeDinaScope(f, dict([], { 'DINA|Молоко': 'milk' }), scope, at)
    expect(s.categoryIds).toEqual(['30'])
    expect(s.scopeProducts).toBe(1)
  })

  it('counts uncategorized scope products but cannot cover them', () => {
    const f = file([product('1', ['40']), product('2', [])])
    const s = computeDinaScope(f, dict(['1', '2']), scope, at)
    expect(s.categoryIds).toEqual(['40'])
    expect(s.scopeProducts).toBe(s.coveredProducts + 1)
  })
})

describe('readDinaScope / writeDinaScope', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('readDinaScope returns null for missing, invalid or empty file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dina-scope-'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readDinaScope(join(dir, 'missing.json'))).toBeNull()
    expect(warn).not.toHaveBeenCalled()

    const invalid = join(dir, 'invalid.json')
    writeFileSync(invalid, '{"version": 2, "categoryIds": "10"}', 'utf8')
    expect(readDinaScope(invalid)).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)

    const empty = join(dir, 'empty.json')
    writeFileSync(empty, JSON.stringify({ version: 1, generatedAt: at, scope: ['milk'], categoryIds: [], coveredProducts: 0, scopeProducts: 0 }), 'utf8')
    expect(readDinaScope(empty)).toBeNull()
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('write/read roundtrip sorts ids numerically', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dina-scope-')), 'nested', 'scope.json')
    const s: DinaScope = { version: 1, generatedAt: at, scope: ['milk'], categoryIds: ['100', '9'], coveredProducts: 2, scopeProducts: 2 }
    writeDinaScope(path, s)
    const text = readFileSync(path, 'utf8')
    expect(text.endsWith('}\n')).toBe(true)
    expect(JSON.parse(text).categoryIds).toEqual(['9', '100'])
    expect(text).toContain('\n  "version": 1')
    expect(readDinaScope(path, scope)).toEqual(['9', '100'])
  })

  it('readDinaScope returns null when the published scope is not covered by the stored scope', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dina-scope-')), 'scope.json')
    writeDinaScope(path, { version: 1, generatedAt: at, scope: ['milk'], categoryIds: ['1'], coveredProducts: 1, scopeProducts: 1 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readDinaScope(path, new Set<CategorySlug>(['milk', 'bread']))).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/bread/))
    // Узкий опубликованный набор (env сужает) — файл годится
    expect(readDinaScope(path, new Set<CategorySlug>(['milk']))).toEqual(['1'])
  })

  it('committed dina-scope-categories.json covers the default published scope', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ids = readDinaScope(defaultDinaScopePath(), publishCategories(''))
    expect(ids).not.toBeNull()
    expect(ids!.length).toBeGreaterThan(0)
    expect(warn).not.toHaveBeenCalled()
  })
})
