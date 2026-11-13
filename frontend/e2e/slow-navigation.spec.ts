import { expect, type Page, test } from '@playwright/test'

// Слабая сеть: ответ сервера на переход (RSC) приходит через SLOW мс. Пользователь не должен оставаться
// без отклика: на месте страницы сразу заглушка будущей — товар из списка с данными, остальное скелетоном
const SLOW = 2500
/** Отклик должен появиться заметно раньше, чем придёт ответ */
const FEEDBACK = 1000

async function slowNavigations(page: Page, path: RegExp) {
  await page.route('**/*', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (url.hostname !== 'localhost') return route.abort('blockedbyclient')
    if (path.test(url.pathname) && req.headers().rsc === '1') await new Promise((resolve) => setTimeout(resolve, SLOW))
    return route.continue()
  })
}

test('плитка категории: сразу шапка категории и скелетон, потом товары', async ({ page }) => {
  await slowNavigations(page, /\/collections\//)
  await page.goto('/ru/catalog', { waitUntil: 'networkidle' })
  const tile = page.getByTestId('category-card').first()
  const name = (await tile.textContent())!.trim()
  await tile.click()

  const preview = page.getByTestId('navigation-preview')
  await expect(preview).toBeVisible({ timeout: FEEDBACK })
  await expect(preview.getByRole('heading', { level: 1 })).toHaveText(name)
  await expect(preview.getByTestId('category-page-skeleton')).toBeVisible()

  await expect(page).toHaveURL(/\/ru\/collections\//, { timeout: SLOW + 5000 })
  await expect(page.getByTestId('product-card').first()).toBeVisible()
  await expect(preview).toHaveCount(0)
})

test('плитка СЗПТ: сразу шапка раздела, без промежуточного редиректа и пустого экрана', async ({ page }) => {
  const visited: string[] = []
  page.on('request', (req) => {
    if (req.headers().rsc === '1' && !req.headers()['next-router-prefetch']) visited.push(new URL(req.url()).pathname)
  })
  await slowNavigations(page, /\/szpt/)
  await page.goto('/ru/catalog', { waitUntil: 'networkidle' })
  await page.getByTestId('szpt-tile').click()

  const preview = page.getByTestId('navigation-preview')
  await expect(preview).toBeVisible({ timeout: FEEDBACK })
  await expect(preview.getByRole('heading', { level: 1 })).toHaveText('Социально значимые продукты')
  // Заглушка держится, пока не придёт сама группа: пустого экрана между ними нет
  await expect(page).toHaveURL(/\/ru\/szpt\/rice$/, { timeout: SLOW + 5000 })
  await expect(page.getByTestId('product-card').first()).toBeVisible()
  await expect(preview).toHaveCount(0)
  // Один переход сразу в группу: /szpt (только редирект) — это второй круг запросов на слабой сети
  expect(visited).toEqual(['/ru/szpt/rice'])
})

test('карточка товара из списка: сразу название и цена, потом настоящая страница', async ({ page }) => {
  await page.goto('/ru/collections/milk', { waitUntil: 'networkidle' })
  const card = page.getByTestId('product-card').first()
  const name = (await card.getByRole('heading', { level: 3 }).textContent())!.trim()
  const price = (await card.getByTestId('min-price').textContent())!.trim()
  await slowNavigations(page, /\/products\//)

  await card.getByRole('link').click()
  const preview = page.getByTestId('navigation-preview')
  await expect(preview).toBeVisible({ timeout: FEEDBACK })
  await expect(preview.getByRole('heading', { level: 1, name, includeHidden: true })).toBeVisible()
  await expect(preview.getByTestId('min-price')).toHaveText(price)

  // Пришла настоящая страница: заголовок доступен скринридеру, заглушки и загрузки нет
  await expect(page).toHaveURL(/\/ru\/products\//, { timeout: SLOW + 5000 })
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(preview).toHaveCount(0)
  await expect(page.getByTestId('loading-state')).toHaveCount(0)
})

test('«Назад» в браузере во время ожидания снимает заглушку и возвращает список', async ({ page }) => {
  await page.goto('/ru/catalog', { waitUntil: 'networkidle' })
  await page.getByTestId('category-card').first().click()
  // Ждём именно категорию: «Топ разброса» в каталоге — тоже product-card, без этого на медленном CI
  // тест кликал товар прямо в каталоге, и «Назад» уводил на about:blank
  await expect(page).toHaveURL(/\/ru\/collections\//)
  await expect(page.getByTestId('navigation-preview')).toHaveCount(0)
  await expect(page.getByTestId('product-card').first()).toBeVisible()
  await slowNavigations(page, /\/products\//)
  await page.getByTestId('product-card').first().getByRole('link').click()
  await expect(page.getByTestId('navigation-preview')).toBeVisible({ timeout: FEEDBACK })

  await page.goBack()
  await expect(page).toHaveURL(/\/ru\/catalog$/)
  await expect(page.getByTestId('navigation-preview')).toHaveCount(0)
  await expect(page.getByTestId('category-card').first()).toBeVisible()
})
