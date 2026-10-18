import { describe, expect, it } from 'vitest'
import { getI18n } from '../i18n'
import { categoryName, filterLabel } from './dataLabels'

describe('dataLabels', () => {
  const ru = getI18n('ru').t
  const kk = getI18n('kk').t

  it('translates known categories and filters to Kazakh', () => {
    expect(categoryName(kk, { slug: 'dairy', name: 'Кисломолочные продукты и сыры' })).toBe(
      'Ашыған сүт өнімдері және ірімшіктер',
    )
    expect(filterLabel(kk, { key: 'fatPercent', label: 'Жирность' })).toBe('Майлылығы')
  })

  it('keeps the backend text in Russian and for unknown slugs/keys', () => {
    expect(categoryName(ru, { slug: 'dairy', name: 'Кисломолочные продукты и сыры' })).toBe(
      'Кисломолочные продукты и сыры',
    )
    expect(filterLabel(ru, { key: 'fatPercent', label: 'Жирность' })).toBe('Жирность')
    expect(categoryName(kk, { slug: 'new-one', name: 'Чай' })).toBe('Чай')
    expect(filterLabel(kk, { key: 'newKey', label: 'Новое' })).toBe('Новое')
  })
})
