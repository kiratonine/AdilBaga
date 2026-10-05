import { describe, expect, it } from 'vitest'
import { extractFat, extractSize, normalizeText } from '../src/agent/units.js'

describe('units', () => {
  it.each([
    ['Молоко FoodMaster 3,2% 1 л', { volumeMl: 1000 }],
    ['Молоко 0,5л', { volumeMl: 500 }],
    ['Масло подсолнечное 900 мл', { volumeMl: 900 }],
    ['Сахар 1кг', { weightGrams: 1000 }],
    ['Крупа манная 700 г', { weightGrams: 700 }],
    ['Яйцо С1 10 шт', { packageCount: 10 }],
    ['Вода 6х1.5 л', { volumeMl: 1500, packageCount: 6 }],
    ['Хлеб Бородинский', {}],
  ])('%s', (name, size) => expect(extractSize(name)).toEqual(size))
  it('fat percent with comma decimals', () => {
    expect(extractFat('Кефир 2,5%')).toBe(2.5)
    expect(extractFat('Сок 100%')).toBeNull()
  })
  it('normalizes ё, quotes and spaces', () => {
    expect(normalizeText('  Сахар «АНВАР»  ёлка ')).toBe('сахар анвар елка')
  })
})
