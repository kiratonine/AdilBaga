import { describe, expect, it } from 'vitest'
import { analyticsIds, analyticsPage } from './analytics'

describe('analytics public config and privacy boundary', () => {
  it('validates the two independent IDs only', () => {
    expect(analyticsIds()).toEqual({ ga: undefined, metrika: undefined })
    expect(analyticsIds('G-TEST123456', '12345678')).toEqual({ ga: 'G-TEST123456', metrika: 12345678 })
    for (const bad of ['', 'G-ABC', 'G-TEST123456\n', '<script>', 'G-TEST123456?x=1', ' G-TEST123456', 'G-' + 'A'.repeat(21)]) expect(analyticsIds(bad).ga).toBeUndefined()
    for (const bad of ['', '0', '-1', '01', '1.5', '123\n', '1234567890123', '1;alert(1)']) expect(analyticsIds(undefined, bad).metrika).toBeUndefined()
    expect(analyticsIds('<script>', '12345678').metrika).toBe(12345678)
    expect(analyticsIds('G-TEST123456', 'bad').ga).toBe('G-TEST123456')
  })
  it('only canonical HTTPS origin and bounded public RU/KK paths qualify', () => {
    const site = 'https://aktau.market'
    for (const pathname of ['/ru/catalog', '/kk/dashboard', '/ru/search', '/kk/products/p-123', '/ru/collections/milk']) {
      expect(analyticsPage(site, site, pathname)).toBe(site + pathname)
    }
    for (const origin of ['http://localhost:3100', 'http://127.0.0.1:3100', 'https://preview.vercel.app', 'https://other.invalid']) expect(analyticsPage(site, origin, '/ru/catalog')).toBeUndefined()
    expect(analyticsPage('https://preview.vercel.app', 'https://preview.vercel.app', '/ru/catalog')).toBeUndefined()
    expect(analyticsPage('http://localhost:3100', 'http://localhost:3100', '/ru/catalog')).toBeUndefined()
    for (const pathname of ['/ru/search?q=private', '/ru/catalog#private', '/ru/catalog\n', '//other.invalid', '/internal/revalidate', '/ru/private/token', '/ru/products/%3Fprivate', '/ru/products/' + 'p'.repeat(129)]) expect(analyticsPage(site, site, pathname)).toBeUndefined()
    expect(analyticsPage('invalid', site, '/ru/catalog')).toBeUndefined()
  })
})
