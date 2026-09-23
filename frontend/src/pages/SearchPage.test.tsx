import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'

const cardNames = () =>
  screen.getAllByTestId('product-card').map((card) => within(card).getByRole('link').textContent)

const searchOf = (search: string) => new URLSearchParams(search).get('q')

describe('SearchPage', () => {
  it('finds products across categories', async () => {
    renderApp('/search?q=сахар')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Поиск: «сахар»')
    expect(await screen.findAllByTestId('product-card')).toHaveLength(4)
    expect(screen.getByTestId('search-input')).toHaveValue('сахар')
  })

  it('keeps the query when sorting', async () => {
    const { router } = renderApp('/search?q=сахар')
    await screen.findAllByTestId('product-card')
    await userEvent.selectOptions(screen.getByTestId('sort-select'), 'name_asc')

    const params = new URLSearchParams(router.state.location.search)
    expect(params.get('q')).toBe('сахар')
    expect(params.get('sort')).toBe('name_asc')
    await expect.poll(cardNames).toEqual([
      'Сахар рафинад 1 кг',
      'Сахар-песок 1 кг',
      'Сахар-песок 2 кг',
      'Сахар-песок 5 кг',
    ])
  })

  it('shows an empty state when nothing matches', async () => {
    renderApp('/search?q=ананас')
    expect(await screen.findByTestId('empty-state')).toHaveTextContent('По запросу «ананас» ничего не нашлось')
  })

  it('asks for a query when it is empty', () => {
    renderApp('/search')
    expect(screen.getByTestId('empty-state')).toHaveTextContent('Что ищем?')
    expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument()
  })

  it('searches while typing, after a pause', async () => {
    const { router } = renderApp('/')
    await userEvent.type(screen.getByTestId('search-input'), 'хлеб')
    expect(router.state.location.pathname).toBe('/')

    await expect.poll(() => router.state.location.pathname).toBe('/search')
    expect(searchOf(router.state.location.search)).toBe('хлеб')
    expect(await screen.findAllByTestId('product-card')).toHaveLength(5)

    // На странице поиска уточнение запроса заменяет запись в истории, а не добавляет новую
    await userEvent.type(screen.getByTestId('search-input'), ' ржаной')
    await expect.poll(() => searchOf(router.state.location.search)).toBe('хлеб ржаной')
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('does not search live for a single character', async () => {
    const { router } = renderApp('/')
    await userEvent.type(screen.getByTestId('search-input'), 'м')
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(router.state.location.pathname).toBe('/')
  })
})
