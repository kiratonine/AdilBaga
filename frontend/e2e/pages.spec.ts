import { expect, test, type Page } from '@playwright/test'

const MILK_ID = 'p0a1f000-0000-4000-8000-000000000001'

function collectErrors(page: Page) {
  const errors: string[] = []
  // Картинки моков — с внешних хостов, офлайн не грузятся; fallback картинки проверяют unit-тесты
  page.on('console', (msg) => msg.type() === 'error' && !msg.text().includes('ERR_NAME_NOT_RESOLVED') && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

test.describe('server HTML', () => {
  test('product page contains the name, prices, offers and attributes', async ({ request }) => {
    const response = await request.get(`/ru/products/${MILK_ID}`)
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain('<title>Молоко FoodMaster 3,2% 1 л — Adil Bağa</title>')
    expect(html).toMatch(/<h1[^>]*>Молоко FoodMaster 3,2% 1 л<\/h1>/)
    expect(html).toMatch(/data-testid="min-price"[^>]*>570\s₸/)
    expect(html).toContain('data-testid="offer-list"')
    expect(html).toContain('data-testid="product-attributes"')
    expect(html).toContain('href="/ru/collections/milk"')
    // Без стриминга: в HTML сразу контент, а не скелетон
    expect(html).not.toContain('data-testid="loading-state"')
  })

  test('category page contains the list filtered by the URL', async ({ request }) => {
    const html = await (await request.get('/kk/collections/milk?volumeMl=500&sort=price_desc')).text()
    expect(html).toContain('<html lang="kk"')
    expect(html).toContain('<title>Молоко — Adil Bağa</title>')
    expect(html.match(/data-testid="product-card"/g)).toHaveLength(2)
    expect(html.indexOf('Молоко Emil 3,2% 500 мл')).toBeLessThan(html.indexOf('Молоко Emil 1% 500 мл'))
    expect(html).toMatch(/value="price_desc" selected/)
  })

  test('dashboard contains the summary, baskets and price spreads', async ({ request }) => {
    const html = await (await request.get('/ru/dashboard')).text()
    expect(html).toContain('<title>Аналитика цен — Adil Bağa</title>')
    expect(html.match(/data-testid="summary-card"/g)).toHaveLength(4)
    expect(html.match(/data-testid="basket"/g)).toHaveLength(3)
    expect(html).toContain('href="/ru/products/')
  })

  test('search is a shell that is not indexed', async ({ request }) => {
    const html = await (await request.get('/ru/search?q=молоко')).text()
    expect(html).toContain('<meta name="robots" content="noindex, follow"/>')
  })

  test('unknown product and category answer 404', async ({ request }) => {
    expect((await request.get('/ru/products/nope')).status()).toBe(404)
    expect((await request.get('/kk/collections/nope')).status()).toBe(404)
  })
})

test('catalog → category → filter → product → back, without console errors', async ({ page, isMobile }) => {
  const errors = collectErrors(page)
  await page.goto('/ru/catalog')
  await page.getByTestId('category-card').filter({ hasText: 'Молоко' }).click()
  await expect(page).toHaveURL(/\/ru\/collections\/milk$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Молоко')
  await expect(page.getByTestId('product-card')).toHaveCount(10)

  // Фильтр меняет URL через history API — сервер Next страницу заново не строит
  const serverRenders: string[] = []
  page.on('request', (request) => request.url().includes('/ru/collections/milk') && serverRenders.push(request.url()))
  // На мобильном фильтры — в шторке, с lg — колонка слева
  const sheet = page.getByTestId('filters-sheet')
  if (isMobile) await page.getByTestId('filters-toggle').click()
  const filters = (isMobile ? sheet : page).getByTestId('filter-volumeMl')
  await filters.getByRole('button', { name: /^500/ }).click()
  await expect(page).toHaveURL(/\/ru\/collections\/milk\?volumeMl=500$/)
  if (isMobile) {
    await sheet.getByRole('button', { name: 'Показать' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('filters-toggle')).toContainText('· 1')
  }
  await expect(page.getByTestId('product-card')).toHaveCount(2)
  expect(serverRenders).toEqual([])

  await page.getByTestId('product-card').first().getByRole('link').click()
  await expect(page).toHaveURL(/\/ru\/products\//)
  await expect(page.getByTestId('offer-list')).toBeVisible()
  await page.getByRole('navigation', { name: 'Навигация' }).getByRole('link', { name: 'Молоко' }).click()
  await expect(page).toHaveURL(/\/ru\/collections\/milk$/)
  await expect(page.getByTestId('product-card')).toHaveCount(10)
  expect(errors).toEqual([])
})

test('search from the header and sort keep the query', async ({ page, isMobile }) => {
  const errors = collectErrors(page)
  // Статичная страница видна до гидрации — ждём, пока поле начнёт работать
  await page.goto('/kk/catalog', { waitUntil: 'networkidle' })
  await page.getByTestId('search-input').fill('сахар')
  await expect(page).toHaveURL(/\/kk\/search\?q=/)
  await expect(page.getByTestId('product-card')).toHaveCount(4)
  // Запрос известен серверу — он во вкладке
  await expect(page).toHaveTitle('Іздеу: «сахар» — Adil Bağa')

  // На мобильном сортировка — чип и шторка с вариантами
  if (isMobile) {
    await page.getByTestId('sort-chip').click()
    await page.getByTestId('sort-sheet').getByRole('radio', { name: 'Атауы бойынша' }).check()
    await expect(page.getByTestId('sort-sheet')).toBeHidden()
  } else {
    await page.getByTestId('sort-select').selectOption('name_asc')
  }
  await expect(page).toHaveURL(/q=%D1%81%D0%B0%D1%85%D0%B0%D1%80&sort=name_asc$/)
  await expect(page.getByTestId('product-card').first()).toContainText('Сахар рафинад 1 кг')
  expect(errors).toEqual([])
})

test('dashboard draws the store map in the browser', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/ru/dashboard')
  await expect(page.getByTestId('store-map')).toBeVisible()
  await expect(page.locator('path.store-marker')).toHaveCount(8)
  await expect(page.getByTestId('store-group')).toHaveCount(3)
  expect(errors).toEqual([])
})

test('"Back" on a product returns to the filtered category; opened directly, it leads to the category', async ({ page }) => {
  await page.goto('/ru/collections/milk?volumeMl=500')
  await expect(page.getByTestId('product-card')).toHaveCount(2)
  await page.getByTestId('product-card').first().getByRole('link').click()
  await expect(page).toHaveURL(/\/ru\/products\//)
  await page.getByRole('link', { name: 'Назад' }).click()
  await expect(page).toHaveURL(/\/ru\/collections\/milk\?volumeMl=500$/)
  await expect(page.getByTestId('product-card')).toHaveCount(2)

  await page.goto(`/kk/products/${MILK_ID}`)
  await page.getByRole('link', { name: 'Артқа' }).click()
  await expect(page).toHaveURL(/\/kk\/collections\/milk$/)
})
