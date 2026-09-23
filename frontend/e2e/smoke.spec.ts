import { expect, test, type Page } from '@playwright/test'

function trackConsoleErrors(page: Page) {
  const errors: string[] = []
  // Битая картинка в моках — ожидаемый 404, его проверяет fallback
  page.on('console', (msg) => msg.type() === 'error' && !msg.text().includes('ERR_NAME_NOT_RESOLVED') && errors.push(msg.text()))
  return errors
}

test('home shows categories and top price spreads', async ({ page }) => {
  const errors = trackConsoleErrors(page)

  await page.goto('/')
  await expect(page.getByTestId('category-card')).toHaveCount(5)
  await expect(page.getByTestId('product-card')).toHaveCount(8)
  await expect(page.getByTestId('snapshot-date').first()).toHaveText('Цена на 24.09.2026')

  await page.getByTestId('search-input').fill('молоко')
  await page.getByTestId('search-input').press('Enter')
  await expect(page).toHaveURL(/\/search\?q=/)

  expect(errors).toEqual([])
})

test('category: filter updates the list and min price is highlighted', async ({ page }) => {
  const errors = trackConsoleErrors(page)

  await page.goto('/')
  await page.getByTestId('category-card').filter({ hasText: 'Молоко' }).click()
  await expect(page).toHaveURL(/\/collections\/milk/)
  await expect(page.getByTestId('product-card')).toHaveCount(10)

  // На мобильном панель фильтров открывается кнопкой
  const toggle = page.getByRole('button', { name: 'Фильтры' })
  if (await toggle.isVisible()) await toggle.click()
  await page.getByTestId('filter-volumeMl').getByRole('button', { name: /^500/ }).click()

  await expect(page).toHaveURL(/volumeMl=500/)
  await expect(page.getByTestId('product-card')).toHaveCount(2)

  const first = page.getByTestId('product-card').first()
  await expect(first.getByTestId('min-price')).toHaveText(/290/)
  await expect(first.getByTestId('offer-list').locator('[data-best]')).toContainText(/290/)

  await first.getByRole('link').click()
  await expect(page).toHaveURL(/\/products\//)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Молоко Emil 1% 500 мл')

  expect(errors).toEqual([])
})

test('search while typing, then open a product', async ({ page }) => {
  const errors = trackConsoleErrors(page)

  await page.goto('/')
  await page.getByTestId('search-input').pressSequentially('сахар')
  await expect(page).toHaveURL(/\/search\?q=%D1%81%D0%B0%D1%85%D0%B0%D1%80$/)
  await expect(page.getByTestId('product-card')).toHaveCount(4)

  await page.getByTestId('product-card').first().getByRole('link').click()
  await expect(page).toHaveURL(/\/products\//)
  await expect(page.getByTestId('min-price')).toBeVisible()
  const offers = page.getByTestId('offer-list').getByRole('listitem')
  await expect(offers.first()).toHaveAttribute('data-best', 'true')
  await expect(page.getByTestId('product-attributes')).toContainText('Вес')

  // Назад — к тем же результатам поиска
  await page.goBack()
  await expect(page.getByTestId('search-input')).toHaveValue('сахар')
  await expect(page.getByTestId('product-card')).toHaveCount(4)

  expect(errors).toEqual([])
})

test('dashboard: summary, price spreads and store map', async ({ page }) => {
  const errors = trackConsoleErrors(page)

  await page.goto('/')
  await page.getByTestId('nav-dashboard').click()
  await expect(page).toHaveURL(/\/dashboard$/)

  await expect(page.getByTestId('summary-card')).toHaveCount(4)
  await expect(page.getByTestId('price-spread')).toHaveCount(10)
  await expect(page.getByTestId('store-map').locator('path.store-marker')).toHaveCount(8)
  await expect(page.getByTestId('store-group')).toHaveCount(3)

  // Маркер открывает подпись с сетью и адресом
  await page.getByTestId('store-map').locator('path.store-marker').first().click({ force: true })
  await expect(page.locator('.leaflet-popup-content')).toContainText('Dina Market')

  // Карта не перекрывает sticky-шапку при прокрутке
  await page.getByTestId('store-map').scrollIntoViewIfNeeded()
  await page.mouse.wheel(0, 200)
  await page.getByTestId('nav-dashboard').click()
  await expect(page).toHaveURL(/\/dashboard$/)

  await page.getByTestId('price-spread').first().getByRole('link').click()
  await expect(page).toHaveURL(/\/products\//)

  expect(errors).toEqual([])
})
