import { describe, it, expect } from 'vitest'
import { buildBatchQuery, parseBatchResponse } from '../src/scrapers/dina-batch.js'

describe('buildBatchQuery', () => {
  it('builds aliased document', () => {
    const q = buildBatchQuery([{ categoryId: '7', page: 1 }, { categoryId: '7', page: 2 }], '28', 24)
    expect(q).toContain('p0: products(shop_id: 28, _page: 1, _limit: 24, category_id: 7)')
    expect(q).toContain('p1: products(shop_id: 28, _page: 2, _limit: 24, category_id: 7)')
    expect(q).toContain('pageInfo { total }')
  })

  it('rejects non-numeric category id', () => {
    expect(() => buildBatchQuery([{ categoryId: '7) { x }', page: 1 }], '28', 24)).toThrow(/invalid category id/)
  })
})

describe('parseBatchResponse', () => {
  const a = { id: 'a' }
  const b = { id: 'b' }

  it('parses successful aliases in order', () => {
    const body = { data: { p0: { pageInfo: { total: 3 }, edges: [a] }, p1: { pageInfo: { total: 3 }, edges: [b] } } }
    expect(parseBatchResponse(body, 2)).toEqual([
      { ok: true, total: 3, edges: [a] },
      { ok: true, total: 3, edges: [b] },
    ])
  })

  it('keeps successful aliases on partial failure', () => {
    const body = {
      data: { p0: { pageInfo: { total: 3 }, edges: [a] }, p1: null },
      errors: [{ message: 'boom', path: ['p1'] }],
    }
    expect(parseBatchResponse(body, 2)).toEqual([
      { ok: true, total: 3, edges: [a] },
      { ok: false, error: 'boom' },
    ])
  })

  it('marks alias listed in errors path as failed even if data present', () => {
    const body = {
      data: { p0: { pageInfo: { total: 1 }, edges: [a] }, p1: { pageInfo: { total: 1 }, edges: [b] } },
      errors: [{ message: 'bad', path: ['p0', 'edges'] }],
    }
    const r = parseBatchResponse(body, 2)
    expect(r[0]).toEqual({ ok: false, error: 'bad' })
    expect(r[1]!.ok).toBe(true)
  })

  it('marks missing alias as failed', () => {
    const r = parseBatchResponse({ data: { p0: { pageInfo: { total: 1 }, edges: [a] } } }, 2)
    expect(r[0]!.ok).toBe(true)
    expect(r[1]!.ok).toBe(false)
  })

  it('fails all when there is no data', () => {
    expect(parseBatchResponse({ errors: [{ message: 'down' }] }, 2)).toEqual([
      { ok: false, error: 'down' },
      { ok: false, error: 'down' },
    ])
  })
})
