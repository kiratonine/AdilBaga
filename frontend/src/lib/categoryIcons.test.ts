import { describe, expect, it } from 'vitest'
import { categoryIcon } from './categoryIcons'

describe('categoryIcon', () => {
  it('gives a known category its own icon', () => {
    expect(categoryIcon('milk')).toBe('milk')
    expect(categoryIcon('eggs')).toBe('egg')
    expect(categoryIcon('groats')).toBe('wheat')
  })

  it('falls back to a basket for an unknown slug', () => {
    expect(categoryIcon('other')).toBe('basket')
    expect(categoryIcon('toString')).toBe('basket')
  })
})
