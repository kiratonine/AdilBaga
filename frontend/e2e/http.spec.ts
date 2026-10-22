import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import type { CategoryDto, DashboardDto, FilterSchemaDto, ProductCardDto } from '../src/api/types'
import { formatPrice } from '../src/lib/format'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// No fixture IDs/counts/prices: all expectations come from the real read-only API.
const API = `${process.env.NEXT_PUBLIC_API_BASE_URL!.replace(/\/+$/, '')}/api`
const PAGE_SIZE = 24

// Живой API разрешает браузерные запросы только с https://aktau.market (CORS), localhost получает 403.
// HTML рендерит сервер Next (CORS не касается), а запросы браузера (фильтры, поиск, «Показать ещё»)
// Playwright пересылает сам — без заголовка Origin — и разрешает ответ для страницы
test.beforeEach(async ({ page }) => {
  await page.route(`${new URL(API).origin}/**`, async (route) => {
    const headers = { ...route.request().headers() }
    delete headers.origin
    delete headers.referer
    // Тест может закончиться, пока запрос в пути (например, «Показать» после фильтра) — это не ошибка
    const response = await route.fetch({ headers }).catch(() => null)
    if (!response) return route.abort().catch(() => {})
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } }).catch(() => {})
  })
})

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
  // Живой API отвечает ~1–1,5 с, плюс пересылка через Playwright — 5 с по умолчанию на телефоне не хватает
  await expect(cards).toHaveCount(products.length, { timeout: 15_000 })
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
    // См. комментарий в pages.spec.ts: шторка закрывается по выбору, результат проверяют URL и список ниже
    await page.getByTestId('sort-sheet').getByRole('radio', { name: 'Сначала дорогие' }).click()
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

// --- Длинные фильтры, шторка и казахские подписи на настоящих данных (в моках списки короткие) ---

type KkData = { data: { category: Record<string, string>; filter: Record<string, string> } }
const kk = (JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/kk.json'), 'utf8')) as KkData).data

async function liveSchemas(request: APIRequestContext) {
  const categories = await api<CategoryDto[]>(request, '/categories')
  return Promise.all(categories.map(async (category) => ({
    category, schema: await api<FilterSchemaDto>(request, `/categories/${category.slug}/filters`),
  })))
}

// Тесты ниже — data-agnostic: в CI http.spec идёт против Go API на маленькой синтетической фикстуре
// (backend-go/tests/fixtures/catalog.sql), локально — против живого api.aktau.market
const LIVE_PRODUCTION = new URL(API).hostname === 'api.aktau.market'

/** Категория и multi-select фильтр со строковыми значениями (бренды) и самым длинным списком (13+) */
async function longestTextFilter(request: APIRequestContext) {
  let best: { category: CategoryDto; key: string; options: string[] } | undefined
  for (const { category, schema } of await liveSchemas(request)) {
    for (const filter of schema.filters) {
      if (filter.type !== 'multi-select') continue
      const options = (filter.options ?? []).filter((o): o is string => typeof o === 'string')
      if (options.length > (best?.options.length ?? 0)) best = { category, key: filter.key, options }
    }
  }
  return best && best.options.length >= 13 ? best : undefined
}

/** Первая категория, где есть что показать в фильтрах */
async function categoryWithFilters(request: APIRequestContext) {
  const found = (await liveSchemas(request)).find(({ schema }) =>
    schema.filters.some((f) => f.type === 'boolean' || (f.options?.length ?? 0) > 0))
  return found?.category
}

test('long live filter: fixed-height scroll box, search finds and selects the last value', async ({ page, request, isMobile }) => {
  const errors = collectErrors(page)
  const long = await longestTextFilter(request)
  test.skip(!long, 'в данных нет фильтра с 13+ значениями (фикстура CI) — проверяется против живого API')
  const { category, key, options } = long!
  await page.goto(`/ru/collections/${category.slug}`)
  if (isMobile) await page.getByTestId('filters-toggle').click()
  const scope = isMobile ? page.getByTestId('filters-sheet') : page.getByRole('complementary', { name: 'Фильтры' })

  const box = scope.getByTestId(`filter-options-${key}`)
  await expect(box.getByRole('button')).toHaveCount(options.length)
  const size = await box.evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight }))
  expect(size.client).toBeLessThanOrEqual(260)
  expect(size.scroll).toBeGreaterThan(size.client)
  if (!isMobile) {
    // Каждая карточка фильтра — не выше поля поиска + ящика с прокруткой
    for (const card of await scope.locator('fieldset').all()) {
      expect((await card.boundingBox())!.height).toBeLessThanOrEqual(400)
    }
  }

  // Последнее значение изначально спрятано внизу прокрутки — поиск поднимает его наверх
  const target = options[options.length - 1]
  await scope.getByTestId(`filter-search-${key}`).fill(target.toLocaleUpperCase('ru'))
  const chip = box.getByRole('button', { name: target, exact: true })
  // Виден в ящике без его прокрутки (в шторке сам ящик может быть ниже — до него листают шторку)
  await chip.scrollIntoViewIfNeeded()
  expect(await box.evaluate((el) => el.scrollTop)).toBe(0)
  await expect(chip).toBeInViewport()
  await chip.click()
  await expect.poll(() => new URL(page.url()).searchParams.getAll(key)).toEqual([target])

  await scope.getByTestId(`filter-search-${key}`).fill('')
  await expect(box.getByRole('button')).toHaveCount(options.length)
  await expect(box.getByRole('button', { name: target, exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})

test('filters sheet on a phone shows the filters, not only its header and buttons', async ({ page, request, isMobile }) => {
  test.skip(!isMobile, 'шторка — только на мобильном')
  const category = await categoryWithFilters(request)
  test.skip(!category, 'нет категории с фильтрами')
  await page.goto(`/ru/collections/${category!.slug}`)
  await page.getByTestId('filters-toggle').click()
  const sheet = page.getByTestId('filters-sheet')
  // Баг iOS: тело шторки схлопывалось в ноль — фильтр обрезан прокруткой и не виден, хотя он в DOM
  const firstFilter = sheet.locator('fieldset').first()
  await expect(firstFilter).toBeInViewport()
  expect((await firstFilter.boundingBox())!.height).toBeGreaterThan(30)
  if (await longestTextFilter(request)) {
    // С длинными списками шторка вырастает почти до max-h (85dvh)
    expect((await sheet.boundingBox())!.height).toBeGreaterThan(page.viewportSize()!.height * 0.6)
  }
  await expect(sheet.getByRole('button', { name: 'Показать', exact: true })).toBeInViewport()
  await expect(sheet.getByRole('button', { name: 'Сбросить', exact: true })).toBeInViewport()
})

test('kk dictionary covers every live category and filter', async ({ request }) => {
  // Сверка словаря с боевыми данными; у синтетической фикстуры CI свои ключи — для них остаётся русский текст бэка
  test.skip(!LIVE_PRODUCTION, 'только против api.aktau.market')
  for (const { category, schema } of await liveSchemas(request)) {
    expect(kk.category[category.slug], `data.category.${category.slug} (${category.name})`).toBeTruthy()
    for (const filter of schema.filters) {
      expect(kk.filter[filter.key], `data.filter.${filter.key} (${filter.label})`).toBeTruthy()
    }
  }
})

test('kk pages show Kazakh category names and filter labels', async ({ page, request, isMobile }) => {
  test.skip(isMobile, 'подписи одинаковы, на desktop фильтры видны без шторки')
  test.setTimeout(120_000)
  const errors = collectErrors(page)
  const all = await liveSchemas(request)
  await page.goto('/kk/catalog')
  for (const { category } of all) {
    await expect(page.locator(`[data-testid="category-card"][href="/kk/collections/${category.slug}"]`))
      .toHaveText(kk.category[category.slug] ?? category.name)
  }
  for (const { category, schema } of all) {
    await page.goto(`/kk/collections/${category.slug}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(kk.category[category.slug] ?? category.name)
    const aside = page.getByRole('complementary', { name: 'Сүзгілер' })
    for (const filter of schema.filters) {
      if (filter.type === 'multi-select' && !filter.options?.length) continue
      await expect(aside.getByTestId(`filter-${filter.key}`).locator('legend')).toHaveText(kk.filter[filter.key] ?? filter.label)
    }
  }
  expect(errors).toEqual([])
})
