import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import type { CategoryDto, DashboardDto, FilterSchemaDto, ProductCardDto } from '../src/api/types'

// Прогон против живого бэка: E2E_API=http PW_CHANNEL=chrome pnpm test:e2e
// Данные заранее неизвестны, поэтому ожидания берём из того же API, что и UI.
const API = `${(process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/api`
const PAGE_SIZE = 24
const TOP_DEALS = 8

async function api<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(`${API}${path}`)
  expect(response.ok(), `${path} → ${response.status()}`).toBe(true)
  return response.json() as Promise<T>
}

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

// Цены форматирует Intl (пробелы, ₸) — сравниваем только цифры
const digits = (value: number) => new RegExp(`^\\D*${String(value).split('').join('\\D*')}\\D*$`)

async function expectCards(page: Page, count: number) {
  if (count === 0) await expect(page.getByTestId('empty-state')).toBeVisible()
  else await expect(page.getByTestId('product-card')).toHaveCount(Math.min(count, PAGE_SIZE))
}

const minPrice = (scope: Page | Locator) => scope.getByTestId('min-price').first()

test('catalog: categories and price spreads from the API', async ({ page, request }) => {
  const errors = trackErrors(page)
  const categories = await api<CategoryDto[]>(request, '/categories')
  const dashboard = await api<DashboardDto>(request, '/dashboard')

  await page.goto('/ru/catalog')
  await expect(page.getByTestId('category-card')).toHaveCount(categories.length)
  await expect(page.getByTestId('product-card')).toHaveCount(Math.min(dashboard.priceSpreads.length, TOP_DEALS))
  expect(errors).toEqual([])
})

test('category: list, filter and min price match the API', async ({ page, request, isMobile }) => {
  const errors = trackErrors(page)
  const [category] = await api<CategoryDto[]>(request, '/categories')
  const products = await api<ProductCardDto[]>(request, `/products?category=${category.slug}&limit=${PAGE_SIZE}`)

  await page.goto('/ru/catalog')
  await page.getByTestId('category-card').filter({ hasText: category.name }).click()
  await expect(page).toHaveURL(new RegExp(`/ru/collections/${category.slug}$`))
  await expectCards(page, products.length)
  if (products.length > 0) await expect(minPrice(page)).toHaveText(digits(products[0].minPrice))

  const schema = await api<FilterSchemaDto>(request, `/categories/${category.slug}/filters`)
  const filter = schema.filters.find((f) => f.type === 'multi-select' && (f.options?.length ?? 0) > 0)
  test.skip(!filter || filter.type !== 'multi-select', 'в schema нет multi-select с options')
  if (!filter || filter.type !== 'multi-select') return

  const value = String(filter.options![0])
  const filtered = await api<ProductCardDto[]>(
    request,
    `/products?category=${category.slug}&${filter.key}=${encodeURIComponent(value)}&limit=${PAGE_SIZE}`,
  )
  // На мобильном фильтры — в шторке, с lg — колонка слева
  const sheet = page.getByTestId('filters-sheet')
  if (isMobile) await page.getByTestId('filters-toggle').click()
  await (isMobile ? sheet : page).getByTestId(`filter-${filter.key}`).getByRole('button').first().click()
  await expect(page).toHaveURL(new RegExp(`${filter.key}=${encodeURIComponent(value)}`))
  if (isMobile) await sheet.getByRole('button', { name: 'Показать' }).click()
  await expectCards(page, filtered.length)
  expect(errors).toEqual([])
})

test('search while typing matches the API', async ({ page, request }) => {
  const errors = trackErrors(page)
  const [product] = await api<ProductCardDto[]>(request, '/products?limit=1')
  const query = product.name.split(/\s+/)[0].toLocaleLowerCase('ru')
  const found = await api<ProductCardDto[]>(request, `/products?search=${encodeURIComponent(query)}&limit=${PAGE_SIZE}`)

  // Статичная страница видна до гидрации — ждём, пока поле начнёт работать
  await page.goto('/ru/catalog', { waitUntil: 'networkidle' })
  await page.getByTestId('search-input').pressSequentially(query)
  await expect(page).toHaveURL(/\/ru\/search\?q=/)
  await expectCards(page, found.length)
  expect(errors).toEqual([])
})

test('product page: server HTML and the page show the API card', async ({ page, request }) => {
  const errors = trackErrors(page)
  const [product] = await api<ProductCardDto[]>(request, '/products?limit=1')

  // Название и цена есть в HTML без JS — для поисковиков
  const html = await (await request.get(`/ru/products/${product.id}`)).text()
  expect(html).toContain('application/ld+json')
  expect(html).toContain(`href="/ru/collections/${product.category.slug}"`)

  await page.goto(`/ru/products/${product.id}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(product.name)
  await expect(minPrice(page)).toHaveText(digits(product.minPrice))
  await expect(page.getByTestId('offer-list').getByRole('listitem')).toHaveCount(product.offers.length)
  await expect(
    page.getByRole('navigation', { name: 'Навигация' }).getByRole('link', { name: product.category.name }),
  ).toHaveAttribute('href', `/ru/collections/${product.category.slug}`)
  expect(errors).toEqual([])
})

test('unknown product is a 404 page', async ({ page }) => {
  const response = await page.goto('/ru/products/does-not-exist')
  expect(response?.status()).toBe(404)
  await expect(page.getByText('Такой страницы нет')).toBeVisible()
})

test('dashboard: summary, spreads and markers match the API', async ({ page, request }) => {
  const errors = trackErrors(page)
  const dashboard = await api<DashboardDto>(request, '/dashboard')

  await page.goto('/ru/dashboard')
  await expect(page.getByTestId('summary-card')).toHaveCount(4)
  await expect(page.getByTestId('price-spread')).toHaveCount(dashboard.priceSpreads.length)
  await expect(page.getByTestId('store-map').locator('path.store-marker')).toHaveCount(dashboard.locations.length)
  expect(errors).toEqual([])
})

test('dashboard: basket per chain and its total at every store point', async ({ page, request }) => {
  const dashboard = await api<DashboardDto>(request, '/dashboard')
  test.skip(!dashboard.baskets?.length, 'бэк не отдаёт baskets')
  const baskets = dashboard.baskets ?? []

  await page.goto('/ru/dashboard')
  await expect(page.getByTestId('basket')).toHaveCount(baskets.length)
  // Пустая корзина (все позиции null) показывается как «Нет данных», а не 0 ₸
  for (const basket of baskets) {
    const card = page.getByTestId('basket').filter({ hasText: basket.storeName })
    const empty = basket.items.every((i) => i.price === null)
    await expect(card.getByTestId('basket-total')).toHaveText(empty ? 'Нет данных' : digits(basket.total))
  }
  const withBasket = dashboard.locations.filter((l) => baskets.some((b) => b.storeCode === l.storeCode))
  await expect(page.getByTestId('store-map').locator('.basket-label')).toHaveCount(withBasket.length)
})
