import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import type { CategoryDto, DashboardDto, FilterSchemaDto, ProductCardDto } from '../src/api/types'
import { formatPrice } from '../src/lib/format'

// No fixture IDs/counts/prices: all expectations come from the real read-only API.
const API = `${process.env.NEXT_PUBLIC_API_BASE_URL!.replace(/\/+$/, '')}/api`
const PAGE_SIZE = 24

async function api<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(`${API}${path}`)
  expect(response.status(), path).toBe(200)
  return response.json() as Promise<T>
}

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function expectProducts(page: Page, products: ProductCardDto[]) {
  const cards = page.getByTestId('product-card')
  await expect(cards).toHaveCount(products.length)
  if (!products.length) await expect(page.getByTestId('empty-state')).toBeVisible()
  for (let i = 0; i < products.length; i++) {
    await expect(cards.nth(i).getByRole('link')).toHaveAttribute('href', `/ru/products/${products[i].id}`)
    await expect(cards.nth(i).getByTestId('min-price')).toHaveText(formatPrice(products[i].minPrice))
  }
}

test('catalog categories and top price spreads match live API', async ({ page, request }) => {
  const errors = collectErrors(page)
  const [categories, dashboard] = await Promise.all([
    api<CategoryDto[]>(request, '/categories'), api<DashboardDto>(request, '/dashboard'),
  ])
  expect(categories.length).toBeGreaterThan(0)
  expect((await page.goto('/ru/catalog'))?.status()).toBe(200)
  await expect(page.getByTestId('category-card')).toHaveCount(categories.length)
  for (const category of categories) {
    await expect(page.getByTestId('category-card').filter({ hasText: category.name })).toHaveAttribute('href', `/ru/collections/${category.slug}`)
  }
  const deals = await Promise.all(dashboard.priceSpreads.slice(0, 8).map((spread) => api<ProductCardDto>(request, `/products/${spread.productId}`)))
  await expectProducts(page, deals)
  expect(errors).toEqual([])
})

test('category first page, dynamic filter, URL and sorting match live API', async ({ page, request, isMobile }) => {
  const errors = collectErrors(page)
  const categories = await api<CategoryDto[]>(request, '/categories')
  // Choose an actual supported filter with an option present in actual products.
  let chosen: { category: CategoryDto; schema: FilterSchemaDto; key: string; value: string; index: number } | undefined
  for (const category of categories) {
    const schema = await api<FilterSchemaDto>(request, `/categories/${category.slug}/filters`)
    for (const filter of schema.filters) {
      if (filter.type !== 'multi-select' || !filter.options?.length) continue
      for (let index = 0; index < filter.options.length; index++) {
        const value = String(filter.options[index])
        const query = new URLSearchParams({ category: category.slug, [filter.key]: value, limit: '1' })
        if ((await api<ProductCardDto[]>(request, `/products?${query}`)).length) {
          chosen = { category, schema, key: filter.key, value, index }
          break
        }
      }
      if (chosen) break
    }
    if (chosen) break
  }
  expect(chosen, 'live schema must contain a usable dynamic filter').toBeDefined()
  const { category, key, value, index } = chosen!
  const initial = await api<ProductCardDto[]>(request, `/products?category=${category.slug}&limit=${PAGE_SIZE}&offset=0&sort=price_asc`)
  expect((await page.goto(`/ru/collections/${category.slug}`))?.status()).toBe(200)
  await expectProducts(page, initial)
  if (isMobile) await page.getByTestId('filters-toggle').click()
  const scope = isMobile ? page.getByTestId('filters-sheet') : page
  await scope.getByTestId(`filter-${key}`).getByRole('button').nth(index).click()
  await expect.poll(() => new URL(page.url()).searchParams.get(key)).toBe(value)
  if (isMobile) await scope.getByRole('button', { name: 'Показать', exact: true }).click()
  const query = new URLSearchParams({ category: category.slug, [key]: value, limit: String(PAGE_SIZE), offset: '0', sort: 'price_asc' })
  await expectProducts(page, await api<ProductCardDto[]>(request, `/products?${query}`))
  if (isMobile) {
    await page.getByTestId('sort-chip').click()
    await page.getByTestId('sort-sheet').getByRole('radio', { name: 'Сначала дорогие' }).check()
  } else await page.getByTestId('sort-select').selectOption('price_desc')
  await expect.poll(() => new URL(page.url()).searchParams.get('sort')).toBe('price_desc')
  query.set('sort', 'price_desc')
  await expectProducts(page, await api<ProductCardDto[]>(request, `/products?${query}`))
  expect(errors).toEqual([])
})

test('search from header matches real products', async ({ page, request }) => {
  const errors = collectErrors(page)
  const [product] = await api<ProductCardDto[]>(request, '/products?limit=1')
  expect(product).toBeDefined()
  const query = product.name.split(/\s+/)[0].toLocaleLowerCase('ru')
  const products = await api<ProductCardDto[]>(request, `/products?search=${encodeURIComponent(query)}&limit=${PAGE_SIZE}&offset=0&sort=price_asc`)
  await page.goto('/ru/catalog', { waitUntil: 'networkidle' })
  await page.getByTestId('search-input').fill(query)
  await expect.poll(() => new URL(page.url()).pathname).toBe('/ru/search')
  await expectProducts(page, products)
  expect(errors).toEqual([])
})

test('real product, SSR metadata and JSON-LD match API in both languages', async ({ page, request }) => {
  const errors = collectErrors(page)
  const [product] = await api<ProductCardDto[]>(request, '/products?limit=1')
  for (const lang of ['ru', 'kk']) {
    const path = `/${lang}/products/${product.id}`
    const response = await request.get(path)
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain(product.name)
    expect(html).toContain(`<html lang="${lang}"`)
    expect(html).toContain('<title>')
    expect(html).toContain('<meta name="description"')
    expect(html).toContain('rel="canonical"')
    for (const language of ['ru', 'kk', 'x-default']) expect(html).toContain(`hrefLang="${language}"`)
    expect(html).toContain('<meta property="og:')
    const data = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((match) => JSON.parse(match[1]))
    expect(data.find((node) => node['@type'] === 'Product')).toMatchObject({
      name: product.name, offers: { '@type': 'AggregateOffer', lowPrice: product.minPrice, offerCount: product.offers.length },
    })
    expect(data.find((node) => node['@type'] === 'BreadcrumbList')).toBeDefined()
  }
  expect((await page.goto(`/ru/products/${product.id}`))?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(product.name)
  await expect(page.getByTestId('min-price')).toHaveText(formatPrice(product.minPrice))
  await expect(page.getByTestId('offer-list').getByRole('listitem')).toHaveCount(Math.min(product.offers.length, 5))
  await expect(page.getByRole('navigation', { name: 'Навигация' }).getByRole('link', { name: product.category.name })).toHaveAttribute('href', `/ru/collections/${product.category.slug}`)
  expect(errors).toEqual([])
})

test('dashboard summary, spreads, baskets and map use real API', async ({ page, request }) => {
  const errors = collectErrors(page)
  const dashboard = await api<DashboardDto>(request, '/dashboard')
  expect((await page.goto('/ru/dashboard'))?.status()).toBe(200)
  await expect(page.getByTestId('summary-card')).toHaveCount(4)
  await expect(page.getByTestId('summary-card').nth(0)).toContainText(String(dashboard.summary.canonicalProducts))
  await expect(page.getByTestId('summary-card').nth(1)).toContainText(String(dashboard.summary.stores))
  await expect(page.getByTestId('summary-card').nth(2)).toContainText(String(dashboard.summary.matchedAcrossStores))
  const spreads = page.getByTestId('price-spread')
  await expect(spreads).toHaveCount(dashboard.priceSpreads.length)
  for (let i = 0; i < dashboard.priceSpreads.length; i++) {
    await expect(spreads.nth(i)).toContainText(dashboard.priceSpreads[i].name)
    await expect(spreads.nth(i)).toContainText(formatPrice(dashboard.priceSpreads[i].minPrice))
  }
  await expect(page.getByTestId('store-map').locator('path.store-marker')).toHaveCount(dashboard.locations.length)
  for (const location of dashboard.locations) await expect(page.getByTestId('store-list')).toContainText(location.address)
  const baskets = dashboard.baskets ?? []
  await expect(page.getByTestId('basket')).toHaveCount(baskets.length)
  for (const basket of baskets) {
    const card = page.getByTestId('basket').filter({ hasText: basket.storeName })
    await expect(card.getByTestId('basket-total')).toHaveText(basket.items.every((item) => item.price === null) ? 'Нет данных' : formatPrice(basket.total))
  }
  await expect(page.getByTestId('store-map').locator('.basket-label')).toHaveCount(dashboard.locations.filter((location) => baskets.some((basket) => basket.storeCode === location.storeCode)).length)
  expect(errors).toEqual([])
})

test('unknown product/category are real HTTP 404, sitemap and robots use real data', async ({ request }) => {
  for (const path of ['/ru/products/00000000-0000-4000-8000-000000000000', '/ru/collections/unknown-category-part01']) {
    const response = await request.get(path)
    expect(response.status()).toBe(404)
    expect(await response.text()).toContain('noindex')
  }
  const [product] = await api<ProductCardDto[]>(request, '/products?limit=1')
  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.status()).toBe(200)
  const xml = await sitemap.text()
  for (const lang of ['ru', 'kk']) expect(xml).toContain(`/${lang}/products/${product.id}</loc>`)
  expect(xml).not.toContain('/search')
  expect(xml).toContain('hreflang="x-default"')
  expect(await (await request.get('/robots.txt')).text()).toContain('/sitemap.xml')
})
