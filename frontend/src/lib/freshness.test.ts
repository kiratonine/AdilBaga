import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isPriceStale, usePriceStale } from './freshness'

const now = new Date('2026-10-08T12:00:00Z')

describe('isPriceStale', () => {
  it('fresh within 36h', () => expect(isPriceStale('2026-10-07T01:00:00Z', now)).toBe(false))
  it('stale after 36h', () => expect(isPriceStale('2026-10-06T23:59:00Z', now)).toBe(true))
  it('not stale when snapshot is in the future', () => expect(isPriceStale('2026-10-09T00:00:00Z', now)).toBe(false))
  it('invalid date is not stale', () => expect(isPriceStale('', now)).toBe(false))
})

describe('usePriceStale', () => {
  afterEach(() => vi.useRealTimers())

  it('is false on the first render and turns true after mount for old snapshots (no hydration mismatch)', () => {
    vi.useFakeTimers({ toFake: ['Date'], now })
    const renders: boolean[] = []
    renderHook(() => {
      const stale = usePriceStale('2026-10-01T00:00:00Z')
      renders.push(stale)
      return stale
    })
    expect(renders[0]).toBe(false)
    expect(renders.at(-1)).toBe(true)
  })

  it('stays false for fresh snapshots', () => {
    vi.useFakeTimers({ toFake: ['Date'], now })
    const { result } = renderHook(() => usePriceStale('2026-10-08T00:00:00Z'))
    expect(result.current).toBe(false)
  })
})
