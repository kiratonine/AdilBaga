import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StoreLocationDto } from '../api/types'
import { renderApp } from '../test/render'

// Leaflet в jsdom не рисуется — карту проверяет E2E, здесь только какие точки ей переданы
vi.mock('../components/dashboard/StoreMap', () => ({
  default: ({ locations }: { locations: StoreLocationDto[] }) => (
    <div data-testid="store-map">{locations.map((l) => l.storeCode).join(',')}</div>
  ),
}))

describe('DashboardPage', () => {
  it('shows summary cards from the dashboard', async () => {
    renderApp('/dashboard')
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
    renderApp('/dashboard')
    const rows = await screen.findAllByTestId('price-spread')
    expect(rows).toHaveLength(10)

    const first = rows[0]
    expect(within(first).getByRole('link', { name: 'Молоко Lactel безлактозное 1% 900 мл' })).toHaveAttribute(
      'href',
      '/products/p0a1f000-0000-4000-8000-000000000005',
    )
    expect(first.textContent?.replace(/\s/g, ' ')).toMatch(/880 ₸ – 1 180 ₸$/)
    // Проценты и полосу убрали по просьбе пользователя — только цены
    expect(first.textContent).not.toMatch(/%\s*$|разница/)
  })

  it('groups store points by chain next to the map', async () => {
    renderApp('/dashboard')
    const groups = await screen.findAllByTestId('store-group')
    expect(groups.map((g) => g.querySelector('p')?.textContent)).toEqual([
      'Dina Market· 3 точки',
      'Dana Market· 3 точки',
      'Fix Price· 2 точки',
    ])
    expect(within(groups[2]).getByText('15-й микрорайон, 21')).toBeInTheDocument()
    expect(await screen.findByTestId('store-map')).toHaveTextContent('DINA,DINA,DINA,DANA,DANA,DANA,FIX_PRICE,FIX_PRICE')
  })

  it('is reachable from the header', async () => {
    const { router } = renderApp('/catalog')
    ;(await screen.findByTestId('nav-dashboard')).click()
    expect(await screen.findByRole('heading', { level: 1, name: 'Аналитика цен' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/dashboard')
  })
})
