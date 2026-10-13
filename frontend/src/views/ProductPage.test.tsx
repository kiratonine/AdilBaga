import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { catalogApi } from '../api/catalogApi'
import ProductRoute from '../app/[lang]/(site)/products/[id]/page'
import { resetInAppHistory } from '../lib/inAppHistory'
import { renderPage } from '../test/render'
import { ProductPage } from './ProductPage'

const MILK_ID = 'p0a1f000-0000-4000-8000-000000000001'

describe('ProductPage', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('warns that prices may have changed when the snapshot is older than 36h', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-08T12:00:00Z') })
    renderPage(<ProductPage id={MILK_ID} />, `/ru/products/${MILK_ID}`)
    expect(await screen.findByTestId('price-stale')).toHaveTextContent('Цены могли измениться — обновляем данные')
    vi.useRealTimers()
  })

  it('does not warn when the snapshot is fresh', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-24T12:00:00Z') })
    renderPage(<ProductPage id={MILK_ID} />, `/ru/products/${MILK_ID}`)
    await screen.findByTestId('snapshot-date')
    expect(screen.queryByTestId('price-stale')).toBeNull()
    vi.useRealTimers()
  })

  it('shows the product with offers sorted by price and the cheapest highlighted', async () => {
    renderPage(<ProductPage id={MILK_ID} />, `/ru/products/${MILK_ID}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Молоко FoodMaster 3,2% 1 л' })).toBeInTheDocument()
    expect(screen.getByTestId('min-price')).toHaveTextContent('570')
    expect(screen.getByText(/дешевле, чем в Fix Price/)).toHaveTextContent(/^На 150\s₸ дешевле, чем в Fix Price$/)

    const offers = within(screen.getByTestId('offer-list')).getAllByRole('listitem')
    expect(offers.map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^Dina Market.*570/),
      expect.stringMatching(/^Dana Market.*дороже на 90.*660/),
      expect.stringMatching(/^Fix Price.*дороже на 150.*720/),
    ])
    expect(offers[0]).toHaveAttribute('data-best')
    expect(offers[1]).not.toHaveAttribute('data-best')
    expect(screen.getByTestId('snapshot-date')).toHaveTextContent('Цена на 24.09.2026')
  })

  it('marks every store with its colour dot and the cheapest with a badge', async () => {
    renderPage(<ProductPage id={MILK_ID} />, `/ru/products/${MILK_ID}`)
    const offers = within(await screen.findByTestId('offer-list')).getAllByRole('listitem')
    expect(offers.every((li) => li.querySelector('[data-store-dot]'))).toBe(true)
    expect(within(offers[0]).getByText('Дешевле всего')).toBeInTheDocument()
    expect(screen.queryByTestId('show-all-offers')).not.toBeInTheDocument()
  })

  it('shows five offers and reveals the rest with «Показать все N»', async () => {
    const milk = await catalogApi.getProduct(MILK_ID)
    const offers = Array.from({ length: 7 }, (_, i) => ({ ...milk.offers[0], storeName: `Сеть ${i + 1}`, price: 500 + i * 10, oldPrice: null }))
    vi.spyOn(catalogApi, 'getProduct').mockResolvedValue({ ...milk, offers, minPrice: 500 })
    renderPage(<ProductPage id={MILK_ID} />, `/ru/products/${MILK_ID}`)

    const list = await screen.findByTestId('offer-list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
    await userEvent.click(screen.getByTestId('show-all-offers'))
    const all = within(list).getAllByRole('listitem')
    expect(all).toHaveLength(7)
    expect(all[6]).toHaveTextContent(/Сеть 7.*дороже на 60/)
    expect(screen.queryByTestId('show-all-offers')).not.toBeInTheDocument()
    expect(all[5]).toHaveFocus()
  })

  it('shows a single offer without green, with the «only in this store» badge', async () => {
    const milk = await catalogApi.getProduct(MILK_ID)
    vi.spyOn(catalogApi, 'getProduct').mockResolvedValue({ ...milk, offers: [milk.offers[0]], minPrice: milk.offers[0].price })
    renderPage(<ProductPage id={MILK_ID} />, `/ru/products/${MILK_ID}`)

    const [offer] = within(await screen.findByTestId('offer-list')).getAllByRole('listitem')
    expect(offer).not.toHaveAttribute('data-best')
    expect(within(offer).getByText('Только в этой сети')).toBeInTheDocument()
    expect(screen.getByText('Цена')).toBeInTheDocument()
    expect(screen.queryByText('Дешевле всего')).not.toBeInTheDocument()
  })

  it('shows a page-shaped skeleton while loading', async () => {
    renderPage(<ProductPage id={MILK_ID} />, `/ru/products/${MILK_ID}`)
    expect(within(screen.getByTestId('loading-state')).getByTestId('product-page-skeleton')).toBeInTheDocument()
    await screen.findByTestId('offer-list')
  })

  it('labels attributes from the category filter schema', async () => {
    renderPage(<ProductPage id={MILK_ID} />, `/ru/products/${MILK_ID}`)
    const attributes = await screen.findByTestId('product-attributes')
    const rows = within(attributes)
      .getAllByRole('term')
      .map((dt) => `${dt.textContent}: ${dt.nextElementSibling?.textContent}`.replace(/\s/g, ' '))
    expect(rows).toEqual(['Объём: 1 л', 'Жирность: 3,2%', 'Без лактозы: Нет'])
  })

  it('links back to the category in the current language', async () => {
    renderPage(<ProductPage id={MILK_ID} />, `/kk/products/${MILK_ID}`)
    const crumbs = await screen.findByRole('navigation')
    const links = within(crumbs).getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', '/kk/catalog')
    expect(links[1]).toHaveAttribute('href', '/kk/collections/milk')
    expect(links[1]).toHaveTextContent('Молоко')
  })

  it('shows not found for an unknown product', async () => {
    renderPage(<ProductPage id="nope" />, '/ru/products/nope')
    expect(await screen.findByRole('heading', { level: 1, name: 'Такой страницы нет' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Перейти в каталог' })).toHaveAttribute('href', '/ru/catalog')
  })
})

describe('ProductPage back link', () => {
  const back = vi.mocked(useRouter().back)
  afterEach(() => {
    resetInAppHistory()
    back.mockClear()
  })

  it('leads to the product category when the visitor came from outside the site', async () => {
    renderPage(<ProductPage id={MILK_ID} />, `/kk/products/${MILK_ID}`)
    const link = await screen.findByRole('link', { name: 'Артқа' })
    expect(link).toHaveAttribute('href', '/kk/collections/milk')
    await userEvent.click(link)
    expect(back).not.toHaveBeenCalled()
  })

  it('steps back in history after navigating within the site, keeping the previous page as it was', async () => {
    resetInAppHistory(true)
    renderPage(<ProductPage id={MILK_ID} />, `/ru/products/${MILK_ID}`)
    await userEvent.click(await screen.findByRole('link', { name: 'Назад' }))
    expect(back).toHaveBeenCalledOnce()
  })
})

describe('/[lang]/products/[id] route', () => {
  const route = (id: string) => ProductRoute({ params: Promise.resolve({ lang: 'ru', id }), searchParams: Promise.resolve({}) })

  it('renders the product and its attributes from the server without a loading state', async () => {
    renderPage(await route(MILK_ID), `/ru/products/${MILK_ID}`)
    expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Молоко FoodMaster 3,2% 1 л')
    expect(screen.getByTestId('min-price')).toHaveTextContent('570')
    expect(screen.getByTestId('product-attributes')).toBeInTheDocument()
  })

  it('is a 404 for an unknown product', async () => {
    await expect(route('nope')).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
