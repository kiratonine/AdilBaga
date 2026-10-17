// @vitest-environment-options {"url":"https://aktau.market/ru/catalog"}
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogApi } from '../api/catalogApi'
import { Analytics } from '../components/analytics/Analytics'
import { navigation } from '../test/navigation'
import { renderPage } from '../test/render'
import { CategoryPage } from './CategoryPage'
import { ProductPage } from './ProductPage'
import { SearchPage } from './SearchPage'

const productId = 'p0a1f000-0000-4000-8000-000000000001'
const events = (name: string) => (window.dataLayer ?? []).map(a => Array.from(a)).filter(a => a[0] === 'event' && a[1] === name)

describe('real UI + confirmed DTO pilot analytics integration', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://aktau.market')
    vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-TEST123456')
    vi.stubEnv('NEXT_PUBLIC_YANDEX_METRIKA_ID', '12345678')
    delete window.__aktauPageviews; delete window.dataLayer; delete window.gtag; delete window.ym
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

  it('real loaded product and actual offers expansion emit once; no store-click event exists', async () => {
    const milk = await catalogApi.getProduct(productId)
    vi.spyOn(catalogApi, 'getProduct').mockResolvedValue({ ...milk, offers: Array.from({ length: 7 }, () => milk.offers[0]) })
    renderPage(<><ProductPage id={productId} /><Analytics /></>, `/ru/products/${productId}`)
    expect(events('view_item')).toHaveLength(0)
    await screen.findByTestId('offer-list')
    expect(events('view_item')).toHaveLength(1)
    await userEvent.click(screen.getByTestId('show-all-offers'))
    expect(events('offers_expand')).toHaveLength(1)
    expect(within(screen.getByTestId('offer-list')).getAllByRole('listitem')).toHaveLength(7)
    expect(events('store_offer_click')).toHaveLength(0)
  })
  it('product API error never emits view_item', async () => {
    vi.spyOn(catalogApi, 'getProduct').mockRejectedValue(new Error('synthetic unavailable'))
    renderPage(<><ProductPage id={productId} /><Analytics /></>, `/ru/products/${productId}`)
    await screen.findByTestId('error-state')
    expect(events('view_item')).toHaveLength(0)
  })
  it('URL/hydration filters/sort are not actions; real filter/reset/sort are', async () => {
    renderPage(<><CategoryPage slug="milk" /><Analytics /></>, '/ru/collections/milk?volumeMl=1000&sort=name_asc')
    await screen.findAllByTestId('product-card')
    expect(events('category_view')).toHaveLength(1)
    expect(events('filter_apply')).toHaveLength(0)
    expect(events('sort_change')).toHaveLength(0)
    await userEvent.click(within(screen.getByTestId('filter-volumeMl')).getByRole('button', { name: /^500/ }))
    expect(events('filter_apply')).toHaveLength(1)
    await userEvent.selectOptions(screen.getByTestId('sort-select'), 'price_desc')
    expect(events('sort_change')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
    expect(events('filter_reset')).toHaveLength(1)
    act(() => navigation.setUrl('/ru/collections/milk?volumeMl=1000&sort=name_asc'))
    expect(events('filter_apply')).toHaveLength(1)
    expect(events('sort_change')).toHaveLength(1)
  })
  it('successful empty search settles; a search error never emits no-results', async () => {
    renderPage(<><SearchPage /><Analytics /></>, '/ru/search?q=ананас')
    await screen.findByTestId('empty-state')
    await expect.poll(() => events('search_no_results').length, { timeout: 2000 }).toBe(1)
    expect(JSON.stringify(window.dataLayer)).not.toContain('ананас')
    vi.spyOn(catalogApi, 'getProducts').mockRejectedValue(new Error('synthetic unavailable'))
    act(() => navigation.setUrl('/ru/search?q=private'))
    await screen.findByTestId('error-state')
    expect(events('search_no_results')).toHaveLength(1)
  })
})
