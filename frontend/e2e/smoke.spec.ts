import { expect, test } from '@playwright/test'

test('layout renders with snapshot date and categories', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))

  await page.goto('/')
  await expect(page.getByTestId('snapshot-date')).toHaveText('Цены актуальны на 24.09.2026')
  await expect(page.getByTestId('category-card')).toHaveCount(5)

  await page.getByTestId('search-input').fill('молоко')
  await page.getByTestId('search-input').press('Enter')
  await expect(page).toHaveURL(/\/search\?q=/)

  expect(errors).toEqual([])
})
