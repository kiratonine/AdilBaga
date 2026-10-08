import { describe, expect, it } from 'vitest'
import { securityHeaders } from './security-headers'

describe('production security headers', () => {
  it('allows only necessary sources and configured API origin', () => {
    const headers = Object.fromEntries(securityHeaders('https://api.example.invalid/base').map(({ key, value }) => [key, value]))
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('no-referrer')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['Permissions-Policy']).toContain('geolocation=()')
    expect(headers).not.toHaveProperty('Strict-Transport-Security')
    const policy = headers['Content-Security-Policy']
    for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "font-src 'self'", "connect-src 'self' https://api.example.invalid"]) expect(policy).toContain(directive)
    for (const origin of ['backend.dinamarket.kz', 'dana-market.kz', 'fix-price.kz', 'a.tile.openstreetmap.org', 'b.tile.openstreetmap.org', 'c.tile.openstreetmap.org']) expect(policy).toContain(`https://${origin}`)
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
