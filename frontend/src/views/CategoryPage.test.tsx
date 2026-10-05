import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import CategoryRoute from '../app/[lang]/(site)/collections/[slug]/page'
import { getNextOffset, PAGE_SIZE } from '../api/queries'
import type { ProductCardDto } from '../api/types'
import { navigation } from '../test/navigation'
import { renderPage } from '../test/render'
import { CategoryPage } from './CategoryPage'

const cardNames = () =>
  screen.getAllByTestId('product-card').map((card) => within(card).getByRole('link').textContent)

describe('CategoryPage', () => {
  it('shows category products sorted by price ascending', async () => {
    renderPage(<CategoryPage slug="milk" />, '/ru/collections/milk')
    expect(await screen.findByRole('heading', { level: 1, name: 'Молоко' })).toBeInTheDocument()
    expect(await screen.findAllByTestId('product-card')).toHaveLength(10)
    expect(cardNames()[0]).toBe('Молоко Emil 1% 500 мл')
    expect(screen.getByRole('link', { name: 'Каталог' })).toHaveAttribute('href', '/ru/catalog')
    // Пришли извне — «Назад» ведёт в каталог
    expect(screen.getByRole('link', { name: 'Назад' })).toHaveAttribute('href', '/ru/catalog')
  })

  it('shows a page-shaped skeleton while the filter schema loads', async () => {
    renderPage(<CategoryPage slug="milk" />, '/ru/collections/milk')
    expect(within(screen.getByTestId('loading-state')).getByTestId('category-page-skeleton')).toBeInTheDocument()
    await screen.findAllByTestId('product-card')
  })

  it('applies a filter and keeps it in the URL without a server round trip', async () => {
    renderPage(<CategoryPage slug="milk" />, '/ru/collections/milk')
    await screen.findAllByTestId('product-card')
    await userEvent.click(within(screen.getByTestId('filter-volumeMl')).getByRole('button', { name: /^500/ }))

    expect(navigation.history).toEqual([{ method: 'replace', url: '/ru/collections/milk?volumeMl=500' }])
    await screen.findByText('Молоко Emil 3,2% 500 мл')
    await expect.poll(() => screen.getAllByTestId('product-card')).toHaveLength(2)
  })

  it('filters sheet applies filters at once, resets them and closes on "show"', async () => {
    renderPage(<CategoryPage slug="milk" />, '/ru/collections/milk')
    await screen.findAllByTestId('product-card')
    const sheet = screen.getByTestId('filters-sheet')
    // Закрытая шторка пуста: в DOM только фильтры сайдбара
    expect(within(sheet).queryByTestId('filter-volumeMl')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('filters-toggle'))
    expect(sheet).toHaveAttribute('open')
    await userEvent.click(within(within(sheet).getByTestId('filter-volumeMl')).getByRole('button', { name: /^500/ }))
    expect(navigation.url).toBe('/ru/collections/milk?volumeMl=500')
    expect(screen.getByTestId('filters-toggle')).toHaveTextContent('Фильтры· 1')

    await userEvent.click(within(sheet).getByRole('button', { name: 'Сбросить' }))
    expect(navigation.url).toBe('/ru/collections/milk')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Показать' }))
    expect(sheet).not.toHaveAttribute('open')
  })

  it('mobile sort chip opens a sheet; picking an option sorts and closes it', async () => {
    renderPage(<CategoryPage slug="milk" />, '/ru/collections/milk')
    await screen.findAllByTestId('product-card')
    const chip = screen.getByTestId('sort-chip')
    expect(chip).toHaveTextContent('Сначала дешёвые')

    await userEvent.click(chip)
    const sheet = screen.getByTestId('sort-sheet')
    expect(sheet).toHaveAttribute('open')
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Сначала дорогие' }))
    expect(navigation.url).toBe('/ru/collections/milk?sort=price_desc')
    expect(sheet).not.toHaveAttribute('open')
    expect(screen.getByTestId('sort-chip')).toHaveTextContent('Сначала дорогие')
  })

  it('reads filters and sort from the URL', async () => {
    renderPage(<CategoryPage slug="milk" />, '/ru/collections/milk?volumeMl=1000&sort=price_desc')
    expect(await screen.findByTestId('sort-select')).toHaveValue('price_desc')
    await screen.findAllByTestId('product-card')
    expect(cardNames()).toEqual([
      'Молоко FoodMaster 6% 1 л',
      'Молоко FoodMaster 3,2% 1 л',
      'Молоко FoodMaster 2,5% 1 л',
      'Молоко Адал 2,5% 1 л',
    ])
  })

  it('shows an empty state and resets filters', async () => {
    renderPage(<CategoryPage slug="milk" />, '/ru/collections/milk?volumeMl=500&lactoseFree=true')
    const empty = await screen.findByTestId('empty-state')
    expect(empty).toHaveTextContent('С такими фильтрами товаров нет')

    await userEvent.click(within(empty).getByRole('button', { name: 'Сбросить фильтры' }))
    expect(navigation.url).toBe('/ru/collections/milk')
    expect(await screen.findAllByTestId('product-card')).toHaveLength(10)
  })

  it('shows not found for an unknown category', async () => {
    renderPage(<CategoryPage slug="nope" />, '/ru/collections/nope')
    expect(await screen.findByText('Такой страницы нет')).toBeInTheDocument()
  })
})

describe('/[lang]/collections/[slug] route', () => {
  const route = (slug: string, searchParams: Record<string, string | string[]> = {}) =>
    CategoryRoute({ params: Promise.resolve({ lang: 'ru', slug }), searchParams: Promise.resolve(searchParams) })

  it('renders filtered products from the server without a loading state', async () => {
    const page = await route('milk', { volumeMl: '500', sort: 'price_desc' })
    renderPage(page, '/ru/collections/milk?volumeMl=500&sort=price_desc')
    // Сразу, без ожидания: данные в кэше с сервера, ключ запроса совпал с клиентским
    expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Молоко')
    expect(cardNames()).toEqual(['Молоко Emil 3,2% 500 мл', 'Молоко Emil 1% 500 мл'])
  })

  it('is a 404 for an unknown category', async () => {
    await expect(route('nope')).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('getNextOffset', () => {
  const page = (n: number) => Array.from({ length: n }, () => ({}) as ProductCardDto)

  it('requests the next offset after a full page', () => {
    expect(getNextOffset(page(PAGE_SIZE), [page(PAGE_SIZE)])).toBe(PAGE_SIZE)
  })

  it('stops after a short page', () => {
    expect(getNextOffset(page(3), [page(PAGE_SIZE), page(3)])).toBeUndefined()
  })
})
