import { expect, test } from '@playwright/test'

// e2e старого фронта переносятся в сессии Next 5
test('/ redirects to the catalog in the language from Accept-Language or the cookie', async ({ request }) => {
  const toRu = await request.get('/', { maxRedirects: 0, headers: { 'accept-language': 'ru-RU,ru;q=0.9' } })
  expect(toRu.status()).toBe(307)
  expect(toRu.headers().location).toMatch(/\/ru\/catalog$/)

  const toKk = await request.get('/', { maxRedirects: 0, headers: { 'accept-language': 'kk-KZ,kk' } })
  expect(toKk.headers().location).toMatch(/\/kk\/catalog$/)

  const remembered = await request.get('/', { maxRedirects: 0, headers: { 'accept-language': 'ru', cookie: 'lang=kk' } })
  expect(remembered.headers().location).toMatch(/\/kk\/catalog$/)
})

test('the language root is a permanent redirect to the catalog (no landing)', async ({ request }) => {
  const response = await request.get('/kk', { maxRedirects: 0 })
  expect(response.status()).toBe(308)
  expect(response.headers().location).toMatch(/\/kk\/catalog$/)
})

test('old URLs without a language prefix redirect permanently', async ({ request }) => {
  const response = await request.get('/collections/milk?sort=price_desc', { maxRedirects: 0 })
  expect(response.status()).toBe(308)
  expect(response.headers().location).toMatch(/\/ru\/collections\/milk\?sort=price_desc$/)
})

test('server HTML of the catalog already contains categories and product cards with prices', async ({ request }) => {
  const html = await (await request.get('/kk/catalog')).text()
  expect(html).toContain('<html lang="kk"')
  expect(html).toContain('<title>Каталог — Adil Bağa</title>')
  expect(html).toContain('href="/kk/collections/')
  expect(html).toContain('data-testid="product-card"')
  expect(html).toMatch(/data-testid="min-price"[^>]*>\d[\d\s]*₸/)
  expect(html).toContain('href="/kk/products/')
})

test('catalog hydrates without console errors; language switch keeps the page', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/ru/catalog', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Где сегодня выгоднее')
  await expect(page.getByTestId('product-card').first()).toBeVisible()

  await page.getByRole('group', { name: 'Язык интерфейса' }).getByRole('link', { name: 'Қаз' }).click()
  await expect(page).toHaveURL(/\/kk\/catalog$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Бүгін қай жерде тиімдірек')
  expect((await page.context().cookies()).find((c) => c.name === 'lang')?.value).toBe('kk')
  expect(errors).toEqual([])
})

test('unknown pages show 404 with the site header in the right language', async ({ page }) => {
  const response = await page.goto('/kk/nope')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Мұндай бет жоқ')
  await expect(page.getByTestId('nav-dashboard')).toHaveAttribute('href', '/kk/dashboard')
})
