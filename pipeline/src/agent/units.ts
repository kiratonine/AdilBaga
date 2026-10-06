export type Size = { volumeMl?: number; weightGrams?: number; packageCount?: number }

export const normalizeText = (s: string) =>
  s.toLowerCase().replace(/ё/g, 'е').replace(/["'«»„“”]/g, ' ').replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ' ').trim()

const num = (v: string) => parseFloat(v.replace(',', '.'))

// JS \b не считает кириллицу «словом», поэтому конец единицы проверяем явным lookahead (?![а-яa-z])
export function extractSize(name: string): Size {
  const t = normalizeText(name)
  const size: Size = {}
  const multi = t.match(/(\d+)\s*[xх×*]\s*(\d+(?:\.\d+)?)\s*(л|мл|кг|г)(?![а-яa-z])/)
  if (multi) size.packageCount = parseInt(multi[1]!, 10)
  const l = t.match(/(\d+(?:\.\d+)?)\s*(?:л|l|литр\w*)(?![а-я])/)
  const ml = t.match(/(\d+(?:\.\d+)?)\s*(?:мл|ml)(?![а-яa-z])/)
  const kg = t.match(/(\d+(?:\.\d+)?)\s*(?:кг|kg)(?![а-яa-z])/)
  const g = t.match(/(\d+(?:\.\d+)?)\s*(?:г|гр|g)(?![а-я])/)
  const pcs = t.match(/(\d+)\s*(?:шт|штук)/)
  if (ml) size.volumeMl = Math.round(num(ml[1]!))
  else if (l && num(l[1]!) > 0 && num(l[1]!) < 50) size.volumeMl = Math.round(num(l[1]!) * 1000)
  if (kg && num(kg[1]!) > 0 && num(kg[1]!) < 50) size.weightGrams = Math.round(num(kg[1]!) * 1000)
  else if (g && !size.volumeMl) size.weightGrams = Math.round(num(g[1]!))
  if (pcs && !size.packageCount) size.packageCount = parseInt(pcs[1]!, 10)
  // после целочисленной нормализации размер <= 0 (напр. 0.3 г → 0) не публикуем
  for (const k of ['volumeMl', 'weightGrams', 'packageCount'] as const) if (size[k] !== undefined && !(size[k]! > 0)) delete size[k]
  return size
}

export function extractFat(name: string): number | null {
  const m = normalizeText(name).match(/(\d+(?:\.\d+)?)\s*%/)
  if (!m) return null
  const v = num(m[1]!)
  return v >= 0.1 && v < 100 ? v : null
}
