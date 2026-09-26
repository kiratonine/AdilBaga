// Генерирует фикстуры в src/mocks/ по подтверждённому контракту
// (docs/context/05_FRONTEND_ANSWERS_FROM_BACKEND_1.md). Опциональные поля
// (inStock, location.id, доп. поля priceSpreads) намеренно не генерируем —
// UI не должен от них зависеть.
// Запуск: node scripts/generate-mocks.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'mocks')
const SNAPSHOT_AT = '2026-09-24T00:00:00.000Z'

const STORES = {
  DINA: 'Dina Market',
  DANA: 'Dana Market',
  FIX_PRICE: 'Fix Price',
}

const categories = [
  { id: 'c0a1f000-0000-4000-8000-000000000001', slug: 'milk', name: 'Молоко' },
  { id: 'c0a1f000-0000-4000-8000-000000000002', slug: 'bread', name: 'Хлеб' },
  { id: 'c0a1f000-0000-4000-8000-000000000003', slug: 'eggs', name: 'Яйца' },
  { id: 'c0a1f000-0000-4000-8000-000000000004', slug: 'sugar', name: 'Сахар' },
  { id: 'c0a1f000-0000-4000-8000-000000000005', slug: 'oil', name: 'Масло растительное' },
]

// options — примитивные значения; подписи и единицы собирает фронт по ключу
const filters = {
  milk: [
    { key: 'volumeMl', label: 'Объём', type: 'multi-select', options: [500, 900, 1000, 2000] },
    { key: 'fatPercent', label: 'Жирность', type: 'multi-select', options: [1, 2.5, 3.2, 6] },
    { key: 'lactoseFree', label: 'Без лактозы', type: 'boolean' },
  ],
  bread: [
    { key: 'weightGrams', label: 'Вес', type: 'multi-select', options: [300, 450, 600] },
    { key: 'breadType', label: 'Вид', type: 'multi-select', options: ['Пшеничный', 'Ржаной', 'Бородинский'] },
    { key: 'sliced', label: 'Нарезанный', type: 'boolean' },
  ],
  eggs: [
    { key: 'count', label: 'Количество', type: 'multi-select', options: [10, 20, 30] },
    { key: 'grade', label: 'Категория', type: 'multi-select', options: ['C0', 'C1', 'C2'] },
  ],
  sugar: [
    { key: 'weightGrams', label: 'Вес', type: 'multi-select', options: [1000, 2000, 5000] },
    { key: 'form', label: 'Вид', type: 'multi-select', options: ['Песок', 'Рафинад'] },
  ],
  oil: [
    { key: 'volumeMl', label: 'Объём', type: 'multi-select', options: [500, 1000, 3000, 5000] },
    { key: 'oilType', label: 'Вид', type: 'multi-select', options: ['Подсолнечное', 'Оливковое'] },
    { key: 'refined', label: 'Рафинированное', type: 'boolean' },
  ],
}

// [name, brand, attributes, базовая цена, магазины, скидка у первого магазина]
const raw = {
  milk: [
    ['Молоко FoodMaster 3,2% 1 л', 'FoodMaster', { volumeMl: 1000, fatPercent: 3.2, lactoseFree: false }, 570, ['DINA', 'DANA', 'FIX_PRICE'], true],
    ['Молоко FoodMaster 2,5% 1 л', 'FoodMaster', { volumeMl: 1000, fatPercent: 2.5, lactoseFree: false }, 545, ['DINA', 'DANA', 'FIX_PRICE']],
    ['Молоко FoodMaster 6% 1 л', 'FoodMaster', { volumeMl: 1000, fatPercent: 6, lactoseFree: false }, 690, ['DINA', 'DANA']],
    ['Молоко Lactel 3,2% 900 мл', 'Lactel', { volumeMl: 900, fatPercent: 3.2, lactoseFree: false }, 620, ['DANA', 'DINA']],
    ['Молоко Lactel безлактозное 1% 900 мл', 'Lactel', { volumeMl: 900, fatPercent: 1, lactoseFree: true }, 880, ['DANA', 'DINA', 'FIX_PRICE']],
    ['Молоко Адал 2,5% 1 л', 'Адал', { volumeMl: 1000, fatPercent: 2.5, lactoseFree: false }, 510, ['DINA', 'DANA', 'FIX_PRICE'], true],
    ['Молоко Адал 3,2% 2 л', 'Адал', { volumeMl: 2000, fatPercent: 3.2, lactoseFree: false }, 980, ['DINA', 'DANA']],
    ['Молоко Emil 1% 500 мл', 'Emil', { volumeMl: 500, fatPercent: 1, lactoseFree: false }, 290, ['FIX_PRICE', 'DINA']],
    ['Молоко Emil 3,2% 500 мл', 'Emil', { volumeMl: 500, fatPercent: 3.2, lactoseFree: false }, 320, ['FIX_PRICE']],
    ['Молоко Моё 2,5% 900 мл', 'Моё', { volumeMl: 900, fatPercent: 2.5, lactoseFree: false }, 560, ['DANA', 'FIX_PRICE']],
  ],
  bread: [
    ['Хлеб пшеничный формовой 450 г', 'Актау нан', { weightGrams: 450, breadType: 'Пшеничный', sliced: false }, 150, ['DINA', 'DANA', 'FIX_PRICE']],
    ['Хлеб пшеничный нарезной 450 г', 'Актау нан', { weightGrams: 450, breadType: 'Пшеничный', sliced: true }, 175, ['DINA', 'DANA']],
    ['Хлеб ржаной 300 г', 'Каспий нан', { weightGrams: 300, breadType: 'Ржаной', sliced: false }, 190, ['DANA', 'DINA']],
    ['Хлеб Бородинский нарезка 300 г', 'Каспий нан', { weightGrams: 300, breadType: 'Бородинский', sliced: true }, 260, ['DANA', 'DINA', 'FIX_PRICE'], true],
    ['Батон нарезной 600 г', 'Актау нан', { weightGrams: 600, breadType: 'Пшеничный', sliced: true }, 230, ['DINA', 'FIX_PRICE']],
    ['Хлеб ржано-пшеничный 600 г', 'Мангистау нан', { weightGrams: 600, breadType: 'Ржаной', sliced: false }, 240, ['DINA']],
  ],
  eggs: [
    ['Яйца куриные С1 10 шт', 'Айс', { count: 10, grade: 'C1' }, 620, ['DINA', 'DANA', 'FIX_PRICE']],
    ['Яйца куриные С0 10 шт', 'Айс', { count: 10, grade: 'C0' }, 720, ['DINA', 'DANA']],
    ['Яйца куриные С2 30 шт', 'Жас Канат', { count: 30, grade: 'C2' }, 1590, ['DANA', 'DINA'], true],
    ['Яйца куриные С1 20 шт', 'Жас Канат', { count: 20, grade: 'C1' }, 1190, ['DINA', 'FIX_PRICE']],
    ['Яйца куриные С0 30 шт', 'Айс', { count: 30, grade: 'C0' }, 2150, ['DANA']],
  ],
  sugar: [
    ['Сахар-песок 1 кг', 'Коксу', { weightGrams: 1000, form: 'Песок' }, 480, ['DINA', 'DANA', 'FIX_PRICE']],
    ['Сахар-песок 5 кг', 'Коксу', { weightGrams: 5000, form: 'Песок' }, 2250, ['DINA', 'DANA'], true],
    ['Сахар-песок 2 кг', 'Тараз', { weightGrams: 2000, form: 'Песок' }, 930, ['DANA', 'FIX_PRICE']],
    ['Сахар рафинад 1 кг', 'Тараз', { weightGrams: 1000, form: 'Рафинад' }, 690, ['DINA', 'DANA', 'FIX_PRICE']],
  ],
  oil: [
    ['Масло подсолнечное рафинированное Шедевр 1 л', 'Шедевр', { volumeMl: 1000, oilType: 'Подсолнечное', refined: true }, 890, ['DINA', 'DANA', 'FIX_PRICE'], true],
    ['Масло подсолнечное рафинированное Шедевр 5 л', 'Шедевр', { volumeMl: 5000, oilType: 'Подсолнечное', refined: true }, 4150, ['DINA', 'DANA']],
    ['Масло подсолнечное нерафинированное Алтын 1 л', 'Алтын', { volumeMl: 1000, oilType: 'Подсолнечное', refined: false }, 820, ['DANA', 'DINA']],
    ['Масло подсолнечное Алтын 3 л', 'Алтын', { volumeMl: 3000, oilType: 'Подсолнечное', refined: true }, 2390, ['DINA', 'FIX_PRICE']],
    ['Масло оливковое Borges Extra Virgin 500 мл', 'Borges', { volumeMl: 500, oilType: 'Оливковое', refined: false }, 3490, ['DANA', 'DINA', 'FIX_PRICE']],
  ],
}

// Детерминированные наценки: разброс цен между сетями 3–30%
const markups = [0, 0.06, 0.13, 0.21, 0.09, 0.17, 0.04, 0.28]
const round10 = (n) => Math.round(n / 10) * 10

let seq = 0
const products = []
for (const [slug, items] of Object.entries(raw)) {
  const category = categories.find((c) => c.slug === slug)
  for (const [name, brand, attributes, base, stores, discounted] of items) {
    seq += 1
    const id = `p0a1f000-0000-4000-8000-${String(seq).padStart(12, '0')}`
    const offers = stores
      .map((storeCode, i) => {
        const price = i === 0 ? base : round10(base * (1 + markups[(seq + i) % markups.length] + i * 0.03))
        return {
          storeCode,
          storeName: STORES[storeCode],
          price,
          oldPrice: i === 0 && discounted ? round10(price * 1.15) : null,
        }
      })
      .sort((a, b) => a.price - b.price)
    products.push({
      id,
      name,
      brand,
      category: { slug: category.slug, name: category.name },
      // Картинок в моках нет — проверяем fallback. Одна битая ссылка — для проверки onError.
      imageUrl: seq === 3 ? 'https://example.invalid/broken.jpg' : null,
      attributes,
      minPrice: offers[0].price,
      offers,
      snapshotAt: SNAPSHOT_AT,
    })
  }
}

const priceSpreads = products
  .filter((p) => p.offers.length > 1)
  .map((p) => {
    const min = p.offers[0]
    const max = p.offers[p.offers.length - 1]
    return {
      productId: p.id,
      name: p.name,
      minPrice: min.price,
      maxPrice: max.price,
      differencePercent: Math.round(((max.price - min.price) / min.price) * 1000) / 10,
    }
  })
  .sort((a, b) => b.differencePercent - a.differencePercent)
  .slice(0, 10)

const locations = [
  ['DINA', 'Dina Market 5 мкр', '5-й микрорайон, 30', 43.6555, 51.1603],
  ['DINA', 'Dina Market 12 мкр', '12-й микрорайон, 7', 43.6703, 51.1745],
  ['DINA', 'Dina Market 27 мкр', '27-й микрорайон, 1А', 43.6862, 51.1561],
  ['DANA', 'Dana Market 3 мкр', '3-й микрорайон, 4', 43.6441, 51.1552],
  ['DANA', 'Dana Market 14 мкр', '14-й микрорайон, 55', 43.6612, 51.1839],
  ['DANA', 'Dana Market 32Б мкр', '32Б микрорайон, 12', 43.6958, 51.1702],
  ['FIX_PRICE', 'Fix Price Актау Сити', 'ТРЦ «Актау Сити», 9-й микрорайон', 43.6508, 51.1681],
  ['FIX_PRICE', 'Fix Price 15 мкр', '15-й микрорайон, 21', 43.6687, 51.1602],
].map(([storeCode, name, address, latitude, longitude]) => ({
  storeCode,
  storeName: STORES[storeCode],
  name,
  address,
  latitude,
  longitude,
}))

// Аналитическая корзина Stage 5: те же три точные позиции, что в Backend contract.
// Состав в проде задаёт бэк (docs/context/08_FRONTEND_ANSWERS_BASKET.md).
const basketRules = [
  ['milk', 'Молочные продукты', 'volumeMl', 1000],
  ['sugar', 'Сахар и соль', 'weightGrams', 1000],
  ['oil', 'Растительные масла', 'volumeMl', 1000],
]

const baskets = Object.entries(STORES).map(([storeCode, storeName]) => {
  const items = basketRules.map(([slug, categoryName, attributeKey, attributeValue]) => {
    const best = products
      .filter((p) => p.category.slug === slug && p.attributes[attributeKey] === attributeValue)
      .flatMap((p) => p.offers.filter((o) => o.storeCode === storeCode && o.price > 0).map((o) => ({ product: p, price: o.price })))
      .sort((a, b) => a.price - b.price)[0]
    return {
      categorySlug: slug,
      categoryName,
      productId: best?.product.id ?? null,
      name: best?.product.name ?? null,
      price: best?.price ?? null,
    }
  })
  return { storeCode, storeName, total: items.reduce((sum, i) => sum + (i.price ?? 0), 0), items }
})

const dashboard = {
  summary: {
    canonicalProducts: products.length,
    stores: Object.keys(STORES).length,
    matchedAcrossStores: products.filter((p) => p.offers.length > 1).length,
    snapshotAt: SNAPSHOT_AT,
  },
  priceSpreads,
  locations,
  baskets,
}

const write = (file, data) => writeFileSync(join(outDir, file), JSON.stringify(data, null, 2) + '\n')
mkdirSync(outDir, { recursive: true })
write('categories.json', categories)
write(
  'filters.json',
  Object.fromEntries(Object.entries(filters).map(([category, list]) => [category, { category, filters: list }])),
)
write('products.json', products)
write('dashboard.json', dashboard)
console.log(`mocks: ${categories.length} categories, ${products.length} products, ${locations.length} locations`)
