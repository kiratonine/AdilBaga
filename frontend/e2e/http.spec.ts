import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import type { CategoryDto, DashboardDto, FilterSchemaDto, ProductCardDto } from '../src/api/types.ts'

// Прогон против живого бэка: E2E_API=http PW_CHANNEL=chrome pnpm test:e2e
// Данные заранее неизвестны, поэтому ожидания берём из того же API, что и UI.
const API = `${(process.env.VITE_API_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/api`
const PAGE_SIZE = 24

async function api<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(`${API}${path}`)
  expect(response.ok(), `${path} → ${response.status()}`).toBe(true)
  return response.json() as Promise<T>
}

function trackConsoleErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  return errors
}

// Цены форматирует Intl (пробелы, ₸) — сравниваем только цифры
const digits = (value: number) => new RegExp(`^\\D*${String(value).split('').join('\\D*')}\\D*$`)

async function expectCards(page: Page, count: number) {
  if (count === 0) await expect(page.getByTestId('empty-state')).toBeVisible()
  else await expect(page.getByTestId('product-card')).toHaveCount(Math.min(count, PAGE_SIZE))
}

async function openFilters(page: Page) {
  // На мобильном панель фильтров открывается кнопкой
  const toggle = page.getByRole('button', { name: /^Фильтры/ })
  if (await toggle.isVisible()) await toggle.click()
}

const minPrice = (scope: Page | Locator) => scope.getByTestId('min-price').first()

test('home: categories and price spreads from the API', async ({ page, request }) => {
  const errors = trackConsoleErrors(page)
  const categories = await api<CategoryDto[]>(request, '/categories')
  const dashboard = await api<DashboardDto>(request, '/dashboard')

  await page.goto('/')
  await expect(page.getByTestId('category-card')).toHaveCount(categories.length)
  await expect(page.getByTestId('product-card')).toHaveCount(Math.min(dashboard.priceSpreads.length, 8))
  expect(errors).toEqual([])
})

test('category: list, filter and min price match the API', async ({ page, request }) => {
  const errors = trackConsoleErrors(page)
  const [category] = await api<CategoryDto[]>(request, '/categories')
  const products = await api<ProductCardDto[]>(request, `/products?category=${category.slug}&limit=${PAGE_SIZE}`)

  await page.goto('/')
  await page.getByTestId('category-card').filter({ hasText: category.name }).click()
  await expect(page).toHaveURL(new RegExp(`/collections/${category.slug}$`))
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
  await openFilters(page)
  await page.getByTestId(`filter-${filter.key}`).getByRole('button').first().click()
  await expect(page).toHaveURL(new RegExp(`${filter.key}=${encodeURIComponent(value)}`))
  await expectCards(page, filtered.length)
  expect(errors).toEqual([])
})

test('search while typing matches the API', async ({ page, request }) => {
  const errors = trackConsoleErrors(page)
  const [product] = await api<ProductCardDto[]>(request, '/products?limit=1')
  const query = product.name.split(/\s+/)[0].toLocaleLowerCase('ru')
  const found = await api<ProductCardDto[]>(request, `/products?search=${encodeURIComponent(query)}&limit=${PAGE_SIZE}`)

  await page.goto('/')
  await page.getByTestId('search-input').pressSequentially(query)
  await expect(page).toHaveURL(/\/search\?q=/)
  await expectCards(page, found.length)
  expect(errors).toEqual([])
})

test('product page shows the API card', async ({ page, request }) => {
  const errors = trackConsoleErrors(page)
  const [product] = await api<ProductCardDto[]>(request, '/products?limit=1')

  await page.goto(`/products/${product.id}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(product.name)
  await expect(minPrice(page)).toHaveText(digits(product.minPrice))
  await expect(page.getByTestId('offer-list').getByRole('listitem')).toHaveCount(product.offers.length)
  await expect(page.getByRole('link', { name: product.category.name })).toHaveAttribute(
    'href',
    `/collections/${product.category.slug}`,
  )
  expect(errors).toEqual([])
})

test('unknown product is a 404 page', async ({ page }) => {
  await page.goto('/products/does-not-exist')
  await expect(page.getByText('Такой страницы нет')).toBeVisible()
})

test('dashboard: summary, spreads and markers match the API', async ({ page, request }) => {
  const errors = trackConsoleErrors(page)
  const dashboard = await api<DashboardDto>(request, '/dashboard')

  await page.goto('/dashboard')
  await expect(page.getByTestId('summary-card')).toHaveCount(4)
  await expect(page.getByTestId('price-spread')).toHaveCount(dashboard.priceSpreads.length)
  await expect(page.getByTestId('store-map').locator('path.store-marker')).toHaveCount(dashboard.locations.length)
  expect(errors).toEqual([])
})
