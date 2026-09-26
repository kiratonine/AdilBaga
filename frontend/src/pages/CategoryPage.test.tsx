import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { getNextOffset, PAGE_SIZE } from '../api/queries'
import type { ProductCardDto } from '../api/types'
import { renderApp } from '../test/render'

const cardNames = () =>
  screen.getAllByTestId('product-card').map((card) => within(card).getByRole('link').textContent)

describe('CategoryPage', () => {
  it('shows category products sorted by price ascending', async () => {
    renderApp('/collections/milk')
    expect(await screen.findByRole('heading', { level: 1, name: 'Молоко' })).toBeInTheDocument()
    expect(await screen.findAllByTestId('product-card')).toHaveLength(10)
    expect(cardNames()[0]).toBe('Молоко Emil 1% 500 мл')
  })

  it('applies a filter and keeps it in the URL', async () => {
    const { router } = renderApp('/collections/milk')
    await screen.findAllByTestId('product-card')
    await userEvent.click(within(screen.getByTestId('filter-volumeMl')).getByRole('button', { name: /^500/ }))

    expect(router.state.location.search).toBe('?volumeMl=500')
    await screen.findByText('Молоко Emil 3,2% 500 мл')
    await expect.poll(() => screen.getAllByTestId('product-card')).toHaveLength(2)
  })

  it('reads filters and sort from the URL', async () => {
    renderApp('/collections/milk?volumeMl=1000&sort=price_desc')
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
    const { router } = renderApp('/collections/milk?volumeMl=500&lactoseFree=true')
    const empty = await screen.findByTestId('empty-state')
    expect(empty).toHaveTextContent('С такими фильтрами товаров нет')

    await userEvent.click(within(empty).getByRole('button', { name: 'Сбросить фильтры' }))
    expect(router.state.location.search).toBe('')
    expect(await screen.findAllByTestId('product-card')).toHaveLength(10)
  })

  it('shows not found for an unknown category', async () => {
    renderApp('/collections/nope')
    expect(await screen.findByText('Такой страницы нет')).toBeInTheDocument()
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
