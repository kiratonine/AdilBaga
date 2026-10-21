import type { CategorySlug } from '../agent/taxonomy.js'

/** Допустимые значения фильтра «Жирность» в категории «Молоко» (курированный список, SCRUM-19) */
export const MILK_FAT_OPTIONS: readonly number[] = [1.5, 2.5, 3.2, 6]

/** Концентрированное молоко без слова в названии отличается жирностью: питьевое молоко не бывает жирнее ~6.5% */
const CONCENTRATED_FAT_MIN = 7

// Без \b: он не работает с кириллицей
const PLANT_BASED = /(кокос|соев|овсян|рисов|миндал|гречнев|nemoloko|немолоко|alpro|альпро)/i
const NOT_DRINKING = /(сливк|сгущ|концентр|коктейл|сухое|сухие|кілегей|қоюланд)/i

/**
 * SCRUM-19: в `milk` остаётся только питьевое молоко. Сливки, сгущёнка, концентрированное и сухое молоко,
 * коктейли → `dairy`; растительные напитки → `drinks`. Правило детерминированное и применяется при каждом sync,
 * поэтому `dictionary.json` не переписывается. Остальные категории возвращаются без изменений.
 */
export function refineCategory(category: CategorySlug, name: string, fatPercent?: number): CategorySlug {
  if (category !== 'milk') return category
  if (PLANT_BASED.test(name)) return 'drinks'
  if (NOT_DRINKING.test(name)) return 'dairy'
  if (fatPercent !== undefined && fatPercent >= CONCENTRATED_FAT_MIN) return 'dairy'
  return 'milk'
}
