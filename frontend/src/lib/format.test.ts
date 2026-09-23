import { describe, expect, it } from 'vitest'
import { formatDate, formatPrice } from './format'

describe('formatPrice', () => {
  it('groups thousands and appends tenge with non-breaking spaces', () => {
    expect(formatPrice(570)).toBe('570 ₸')
    expect(formatPrice(1590).replace(/\s/g, ' ')).toBe('1 590 ₸')
  })
})

describe('formatDate', () => {
  it('formats snapshot date in Aktau time', () => {
    expect(formatDate('2026-09-24T00:00:00.000Z')).toBe('24.09.2026')
    // 21:00 UTC — уже следующий день в Актау (UTC+5)
    expect(formatDate('2026-09-23T21:00:00.000Z')).toBe('24.09.2026')
  })
})
