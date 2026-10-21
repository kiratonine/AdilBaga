import { describe, expect, it } from 'vitest'
import type { CategorySlug } from '../src/agent/taxonomy.js'
import { MILK_FAT_OPTIONS, refineCategory } from '../src/mapping/milk.js'

const cases: [string, number | undefined, CategorySlug][] = [
  ['Молоко Петропавловское 3.2% 0.9 л', 3.2, 'milk'],
  ['Молоко топленое 6.5% 350 мл', 6.5, 'milk'],
  ['Мол/пр Milkово 3,2% ф/п 0,9л /10', 3.2, 'milk'],
  ['Молоко МОЁ ДЕТСКОЕ 0.95 л', undefined, 'milk'],
  ['Сливки President 35.1%, 1л', 35.1, 'dairy'],
  ['Сливки сухие ASYL 32% 420 г', 32, 'dairy'],
  ['Сгущенка Лакомка 8.5% 900 г', 8.5, 'dairy'],
  ['Сгущенные сливки 380 г', undefined, 'dairy'],
  ['Молоко концентрированное Фермерское 7.2% 300 г', 7.2, 'dairy'],
  ['Молоко Глубокое 8.6% 300 г', 8.6, 'dairy'], // концентрированное без слова → по жирности ≥ 7
  ['Коктейль молочный Parmalat Капучино 1,5% 500 мл', 1.5, 'dairy'],
  ['Кілегей 20% 200 г', 20, 'dairy'],
  ['Қоюландырылған сүт 8.5% 380 г', 8.5, 'dairy'],
  ['Напиток овсяный Nemoloko Light 1 л', undefined, 'drinks'],
  ['Напиток соевый Alpro кокос 1 л', undefined, 'drinks'],
  ['Молоко кокосовое Aroy-D 19% 1 л', 19, 'drinks'], // растительное проверяется раньше правила жирности
  ['Кокосовое молоко Чим-Чим 400 мл', undefined, 'drinks'],
]

describe('refineCategory', () => {
  it.each(cases)('%s → %s', (name, fat, expected) => expect(refineCategory('milk', name, fat)).toBe(expected))
  it('does not touch other categories', () => {
    expect(refineCategory('dairy', 'Сливки Домик в деревне 20% 200 г', 20)).toBe('dairy')
    expect(refineCategory('sweets', 'Молоко сгущенное 8.5% 380 г', 8.5)).toBe('sweets')
  })
  it('exposes the curated fat allowlist', () => {
    expect([...MILK_FAT_OPTIONS]).toEqual([1.5, 2.5, 3.2, 6])
  })
})
