import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { navigation } from '../test/navigation'
import { hasInAppHistory, resetInAppHistory, useTrackInAppNavigation } from './inAppHistory'

describe('inAppHistory', () => {
  afterEach(() => resetInAppHistory())

  it('counts a move to another page, but not the entry page or a language switch', () => {
    navigation.setUrl('/ru/products/p1')
    renderHook(() => useTrackInAppNavigation())
    expect(hasInAppHistory()).toBe(false)

    act(() => navigation.setUrl('/kk/products/p1'))
    expect(hasInAppHistory()).toBe(false)

    act(() => navigation.setUrl('/kk/collections/milk'))
    expect(hasInAppHistory()).toBe(true)
  })
})
