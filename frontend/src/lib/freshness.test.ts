import { describe, expect, it } from 'vitest'
import { isPriceStale } from './freshness'

const now = new Date('2026-10-08T12:00:00Z')

describe('isPriceStale', () => {
  it('fresh within 36h', () => expect(isPriceStale('2026-10-07T01:00:00Z', now)).toBe(false))
  it('stale after 36h', () => expect(isPriceStale('2026-10-06T23:59:00Z', now)).toBe(true))
  it('not stale when snapshot is in the future', () => expect(isPriceStale('2026-10-09T00:00:00Z', now)).toBe(false))
  it('invalid date is not stale', () => expect(isPriceStale('', now)).toBe(false))
})
