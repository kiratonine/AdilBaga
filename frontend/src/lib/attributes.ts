import type { TFunction } from 'i18next'
import type { AttributeValue } from '../api/types'

// Бэк отдаёт голые значения (500, 3.2, true). Единицы выводим по смысловому
// суффиксу ключа — это не хардкод категорий: какие фильтры показать, решает бэк.
type Unit = 'volume' | 'weight' | 'percent' | 'pieces'

const UNIT_BY_SUFFIX: [RegExp, Unit][] = [
  [/Ml$/, 'volume'],
  [/Grams$/, 'weight'],
  [/Percent$/, 'percent'],
  [/^count$|Count$/, 'pieces'],
]

const numberFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
const num = (n: number) => numberFormatter.format(n)

export function unitOf(key: string): Unit | undefined {
  return UNIT_BY_SUFFIX.find(([pattern]) => pattern.test(key))?.[1]
}

/** volumeMl=1000 → «1 л», weightGrams=450 → «450 г», fatPercent=3.2 → «3,2%», sliced=true → «Да» */
export function formatAttributeValue(key: string, value: AttributeValue, t: TFunction): string {
  if (typeof value === 'boolean') return t(value ? 'attr.yes' : 'attr.no')
  if (typeof value === 'string') return value

  switch (unitOf(key)) {
    case 'volume':
      return value >= 1000 ? `${num(value / 1000)} ${t('units.l')}` : `${num(value)} ${t('units.ml')}`
    case 'weight':
      return value >= 1000 ? `${num(value / 1000)} ${t('units.kg')}` : `${num(value)} ${t('units.g')}`
    case 'percent':
      return `${num(value)}%`
    case 'pieces':
      return `${num(value)} ${t('units.pcs')}`
    default:
      return num(value)
  }
}
