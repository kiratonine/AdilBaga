import { describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { formatAttributeValue } from './attributes'

const t = i18n.getFixedT('ru')
const f = (key: string, value: string | number | boolean) => formatAttributeValue(key, value, t).replace(/ /g, ' ')

describe('formatAttributeValue', () => {
  it('adds units by semantic key suffix', () => {
    expect(f('volumeMl', 500)).toBe('500 мл')
    expect(f('volumeMl', 1000)).toBe('1 л')
    expect(f('volumeMl', 1500)).toBe('1,5 л')
    expect(f('weightGrams', 450)).toBe('450 г')
    expect(f('weightGrams', 5000)).toBe('5 кг')
    expect(f('fatPercent', 3.2)).toBe('3,2%')
    expect(f('count', 10)).toBe('10 шт')
  })

  it('leaves unknown numbers and strings as is', () => {
    expect(f('shelfLifeDays', 7)).toBe('7')
    expect(f('breadType', 'Ржаной')).toBe('Ржаной')
  })

  it('translates booleans', () => {
    expect(f('sliced', true)).toBe('Да')
    expect(formatAttributeValue('sliced', false, i18n.getFixedT('kk'))).toBe('Жоқ')
  })
})
