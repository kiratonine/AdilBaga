import { describe, expect, it } from 'vitest'
import { securityHeaders } from './security-headers'

describe('production security headers', () => {
  it('keeps the original policy byte-identical for absent or invalid IDs', () => {
    const original = securityHeaders('https://api.example.invalid')
    expect(securityHeaders('https://api.example.invalid', false, { ga: '<script>', metrika: '-1' })).toEqual(original)
    expect(original[0].value).not.toMatch(/google|yandex/)
  })
  it('permits exact origins only for the validated provider, leaving other headers intact', () => {
    const base = securityHeaders('https://api.example.invalid')
    for (const [settings, enabled, disabled] of [
      [{ ga: 'G-TEST123456' }, ['https://www.googletagmanager.com', 'https://www.google-analytics.com', 'https://region1.google-analytics.com'], ['https://mc.yandex.ru']],
      [{ metrika: '12345678' }, ['https://mc.yandex.ru'], ['https://www.googletagmanager.com', 'https://www.google-analytics.com']],
      [{ ga: 'G-TEST123456', metrika: '12345678' }, ['https://www.googletagmanager.com', 'https://mc.yandex.ru'], []],
    ] as const) {
      const headers = securityHeaders('https://api.example.invalid', false, settings)
      const policy = headers[0].value
      for (const origin of enabled) expect(policy).toContain(origin)
      for (const origin of disabled) expect(policy).not.toContain(origin)
      expect(headers.slice(1)).toEqual(base.slice(1))
      expect(policy).not.toMatch(/unsafe-eval|\*|frame-src|child-src|https: /)
      expect(policy).toContain("frame-ancestors 'none'")
      expect(policy).toContain('https://api.example.invalid')
      expect(policy).toContain('https://tile.openstreetmap.org')
      const scripts = policy.split('; ').find(p => p.startsWith('script-src'))!
      expect(scripts).not.toContain('google-analytics.com')
      const connect = policy.split('; ').find(p => p.startsWith('connect-src'))!
      expect(connect).not.toContain('googletagmanager.com')
    }
  })
  it('allows only necessary sources and configured API origin', () => {
    const headers = Object.fromEntries(securityHeaders('https://api.example.invalid/base').map(({ key, value }) => [key, value]))
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('no-referrer')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['Permissions-Policy']).toContain('geolocation=()')
    expect(headers).not.toHaveProperty('Strict-Transport-Security')
    const policy = headers['Content-Security-Policy']
    for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "font-src 'self'", "connect-src 'self' https://api.example.invalid"]) expect(policy).toContain(directive)
    for (const origin of ['backend.dinamarket.kz', 'dana-market.kz', 'fix-price.kz', 'img.fix-price.com', 'img.fix-price.kz', 'tile.openstreetmap.org']) expect(policy).toContain(`https://${origin}`)
    const images = policy.split('; ').find((directive) => directive.startsWith('img-src '))?.split(' ')
    expect(images).toContain('https://tile.openstreetmap.org')
    for (const obsolete of ['a', 'b', 'c']) expect(policy).not.toContain(`https://${obsolete}.tile.openstreetmap.org`)
    for (const forbidden of ['unsafe-eval', '*', 'http:', '/base', 'https://example.invalid']) expect(policy).not.toContain(forbidden)
  })
  it('keeps broken fixture image origin test-only', () => {
    expect(securityHeaders(undefined, true)[0].value).toContain('https://example.invalid')
    expect(securityHeaders()[0].value).not.toContain('https://example.invalid')
  })
  it('rejects credentials without echoing them', () => {
    expect(() => securityHeaders('https://user:privatecredential@api.example.invalid')).toThrow('without credentials')
  })
})
