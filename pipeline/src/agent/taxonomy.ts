const size = (key: 'volumeMl' | 'weightGrams', label: string) => ({ key, label, type: 'multi-select' as const })
const brand = { key: 'brand', label: 'Бренд', type: 'multi-select' as const }

export const CATEGORIES = [
  { slug: 'milk', name: 'Молоко и сливки', filters: [size('volumeMl', 'Объём'), { key: 'fatPercent', label: 'Жирность', type: 'multi-select' }, brand] },
  { slug: 'dairy', name: 'Кисломолочные продукты и сыры', filters: [{ key: 'fatPercent', label: 'Жирность', type: 'multi-select' }, brand] },
  { slug: 'eggs', name: 'Яйца', filters: [{ key: 'packageCount', label: 'Количество', type: 'multi-select' }] },
  { slug: 'bread', name: 'Хлеб и выпечка', filters: [size('weightGrams', 'Вес'), brand] },
  { slug: 'meat', name: 'Мясо и птица', filters: [brand] },
  { slug: 'fish', name: 'Рыба и морепродукты', filters: [brand] },
  { slug: 'sausages', name: 'Колбасы и деликатесы', filters: [brand] },
  { slug: 'vegetables', name: 'Овощи, фрукты, зелень', filters: [] },
  { slug: 'groats', name: 'Крупы, макароны, мука', filters: [size('weightGrams', 'Вес'), brand] },
  { slug: 'sugar', name: 'Сахар и соль', filters: [size('weightGrams', 'Вес')] },
  { slug: 'oil', name: 'Растительные масла', filters: [size('volumeMl', 'Объём'), brand] },
  { slug: 'canned', name: 'Консервы', filters: [brand] },
  { slug: 'sauces', name: 'Соусы и специи', filters: [brand] },
  { slug: 'sweets', name: 'Сладости и снеки', filters: [brand] },
  { slug: 'tea-coffee', name: 'Чай и кофе', filters: [brand] },
  { slug: 'drinks', name: 'Напитки и вода', filters: [size('volumeMl', 'Объём'), brand] },
  { slug: 'frozen', name: 'Замороженные продукты', filters: [brand] },
  { slug: 'baby', name: 'Детские товары', filters: [brand] },
  { slug: 'household', name: 'Бытовая химия', filters: [brand] },
  { slug: 'hygiene', name: 'Гигиена и косметика', filters: [brand] },
  { slug: 'home', name: 'Товары для дома', filters: [] },
  { slug: 'other', name: 'Прочие товары', filters: [] },
] as const

export type CategorySlug = (typeof CATEGORIES)[number]['slug']
const SLUGS = new Set<string>(CATEGORIES.map((c) => c.slug))
export const isCategorySlug = (s: string): s is CategorySlug => SLUGS.has(s)
