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

  expect(errors).toEqual([])
})
