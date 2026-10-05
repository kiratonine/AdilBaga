import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { catalogApi } from '../api/catalogApi'
import type { StoreLocationDto } from '../api/types'
import dashboardMock from '../mocks/dashboard.json'
import { renderPage } from '../test/render'
import { DashboardPage } from './DashboardPage'

// Leaflet в jsdom не рисуется — карту проверяет E2E, здесь только какие точки ей переданы
vi.mock('../components/dashboard/StoreMap', () => ({
  default: ({ locations }: { locations: StoreLocationDto[] }) => (
    <div data-testid="store-map">{locations.map((l) => l.storeCode).join(',')}</div>
  ),
}))

describe('DashboardPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows summary cards from the dashboard', async () => {
    renderPage(<DashboardPage />, '/ru/dashboard')
    expect(await screen.findByRole('heading', { level: 1, name: 'Аналитика цен' })).toBeInTheDocument()

    const cards = (await screen.findAllByTestId('summary-card')).map((card) =>
      [...card.children].map((el) => el.textContent).join(' | '),
    )
    expect(cards).toEqual([
      'Товаров отслеживается | 30',
      'Сетей | 3',
      'Сопоставлено между сетями | 27 | 90% каталога',
      'Дата снимка цен | 24.09.2026',
    ])
  })

  it('lists price spreads in backend order with links to products', async () => {
    renderPage(<DashboardPage />, '/ru/dashboard')
    const rows = await screen.findAllByTestId('price-spread')
    expect(rows).toHaveLength(10)

    const first = rows[0]
    expect(within(first).getByRole('link', { name: 'Молоко Lactel безлактозное 1% 900 мл' })).toHaveAttribute(
      'href',
      '/ru/products/p0a1f000-0000-4000-8000-000000000005',
    )
    expect(first.textContent?.replace(/\s/g, ' ')).toMatch(/880 ₸ – 1 180 ₸$/)
    // Проценты и полосу убрали по просьбе пользователя — только цены
    expect(first.textContent).not.toMatch(/%\s*$|разница/)
  })

  it('groups store points by chain next to the map', async () => {
    renderPage(<DashboardPage />, '/ru/dashboard')
    const groups = await screen.findAllByTestId('store-group')
    expect(groups.map((g) => g.querySelector('p')?.textContent)).toEqual([
      'Dina Market· 3 точки',
      'Dana Market· 3 точки',
      'Fix Price· 2 точки',
    ])
    expect(within(groups[2]).getByText('15-й микрорайон, 21')).toBeInTheDocument()
    expect(await screen.findByTestId('store-map')).toHaveTextContent('DINA,DINA,DINA,DANA,DANA,DANA,FIX_PRICE,FIX_PRICE')
  })

  it('shows the basket price per chain, the best complete one first', async () => {
    renderPage(<DashboardPage />, '/ru/dashboard')
    const baskets = await screen.findAllByTestId('basket')
    const text = (el: HTMLElement) => el.textContent?.replace(/\s/g, ' ')
    expect(baskets.map((b) => text(within(b).getByTestId('basket-total')))).toEqual(['1 880 ₸', '2 070 ₸', '2 110 ₸'])
    expect(baskets[0]).toHaveAttribute('data-best', 'true')
    expect(baskets[0]).toHaveTextContent('Dina Market')
    expect(baskets[0]).toHaveTextContent('Выгоднее всего')
    expect(text(baskets[1])).toContain('дороже на 190 ₸')
    expect(baskets[2]).not.toHaveAttribute('data-best')
    expect(text(baskets[2])).toContain('дороже на 230 ₸')
  })

  it('opens the basket contents with links to products', async () => {
    renderPage(<DashboardPage />, '/ru/dashboard')
    const [dina] = await screen.findAllByTestId('basket')
    await userEvent.click(within(dina).getByText('Состав корзины'))
    expect(within(dina).getByRole('link', { name: /Молоко/ })).toHaveAttribute('href', expect.stringMatching(/^\/ru\/products\//))
    expect(within(dina).getAllByRole('link')).toHaveLength(3)
  })

  it('shows the chain basket next to its store points', async () => {
    renderPage(<DashboardPage />, '/ru/dashboard')
    const lines = await screen.findAllByTestId('store-basket')
    expect(lines.map((l) => l.textContent?.replace(/\s/g, ' '))).toEqual([
      'Корзина: 1 880 ₸',
      'Корзина: 2 110 ₸',
      'Корзина: 2 070 ₸',
    ])
  })

  const item = (categorySlug: string, price: number | null) => ({
    categorySlug,
    categoryName: categorySlug,
    productId: price === null ? null : `${categorySlug}-id`,
    name: price === null ? null : categorySlug,
    price,
  })

  it('marks an incomplete basket and never picks it as the best', async () => {
    // В моках все корзины полные — неполную подставляем сами
    vi.spyOn(catalogApi, 'getDashboard').mockResolvedValue({
      ...dashboardMock,
      baskets: [
        { storeCode: 'DINA', storeName: 'Dina Market', total: 1880, items: [item('milk', 570), item('sugar', 480), item('oil', 830)] },
        { storeCode: 'DANA', storeName: 'Dana Market', total: 2110, items: [item('milk', 610), item('sugar', 520), item('oil', 980)] },
        { storeCode: 'FIX_PRICE', storeName: 'Fix Price', total: 1300, items: [item('milk', 560), item('sugar', null), item('oil', 740)] },
      ],
    } as never)
    renderPage(<DashboardPage />, '/ru/dashboard')

    const baskets = await screen.findAllByTestId('basket')
    const fix = baskets[2]
    expect(baskets[0]).toHaveAttribute('data-best', 'true')
    expect(fix).not.toHaveAttribute('data-best')
    expect(fix).toHaveTextContent('Нет 1 из 3 позиций')
    await userEvent.click(within(fix).getByText('Состав корзины'))
    expect(within(fix).getByText('нет в сети')).toBeInTheDocument()
    expect(screen.getAllByTestId('store-basket')[2].textContent?.replace(/\s/g, ' ')).toBe('Корзина: 1 300 ₸ · неполная')
  })

  it('shows "no data" instead of 0 ₸ when nothing was found in a chain', async () => {
    // Реальный ответ бэка (PART_05_REPORT.md): у DINA нет ни одной позиции, total = 0
    vi.spyOn(catalogApi, 'getDashboard').mockResolvedValue({
      ...dashboardMock,
      baskets: [
        { storeCode: 'DINA', storeName: 'Dina Market', total: 0, items: [item('milk', null), item('sugar', null), item('oil', null)] },
        { storeCode: 'DANA', storeName: 'Dana Market', total: 2155, items: [item('milk', 752), item('sugar', 483), item('oil', 920)] },
        { storeCode: 'FIX_PRICE', storeName: 'Fix Price', total: 2050, items: [item('milk', 650), item('sugar', 580), item('oil', 820)] },
      ],
    } as never)
    renderPage(<DashboardPage />, '/ru/dashboard')

    const baskets = await screen.findAllByTestId('basket')
    expect(baskets.map((b) => within(b).getByTestId('basket-total').textContent?.replace(/\s/g, ' '))).toEqual([
      '2 050 ₸',
      '2 155 ₸',
      'Нет данных',
    ])
    expect(baskets[0]).toHaveAttribute('data-best', 'true')
    expect(baskets[2]).not.toHaveTextContent('0 ₸')
    expect(within(baskets[2]).queryByText('Состав корзины')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('store-basket')[0]).toHaveTextContent('Корзина: нет данных')
  })

  it('hides the basket block when the backend sends no baskets', async () => {
    const { baskets: _, ...withoutBaskets } = dashboardMock
    vi.spyOn(catalogApi, 'getDashboard').mockResolvedValue(withoutBaskets as never)
    renderPage(<DashboardPage />, '/ru/dashboard')
    expect(await screen.findAllByTestId('summary-card')).toHaveLength(4)
    expect(screen.queryByTestId('basket')).not.toBeInTheDocument()
    expect(screen.queryByTestId('store-basket')).not.toBeInTheDocument()
  })

  it('shows a page-shaped skeleton while loading', async () => {
    renderPage(<DashboardPage />, '/ru/dashboard')
    expect(within(screen.getByTestId('loading-state')).getByTestId('dashboard-skeleton')).toBeInTheDocument()
    expect(await screen.findAllByTestId('summary-card')).toHaveLength(4)
  })
})
