import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { navigation } from '../test/navigation'
import { renderPage } from '../test/render'
import { SearchPage } from './SearchPage'

const cardNames = () =>
  screen.getAllByTestId('product-card').map((card) => within(card).getByRole('link').textContent)

const searchUrl = (lang: string, q: string) => `/${lang}/search?q=${encodeURIComponent(q)}`

describe('SearchPage', () => {
  it('finds products across categories', async () => {
    renderPage(<SearchPage />, searchUrl('ru', 'сахар'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Поиск: «сахар»')
    expect(within(screen.getByTestId('loading-state')).getAllByTestId('product-card-skeleton')).toHaveLength(8)
    expect(await screen.findAllByTestId('product-card')).toHaveLength(4)
  })

  it('keeps the query when sorting', async () => {
    renderPage(<SearchPage />, searchUrl('ru', 'сахар'))
    await screen.findAllByTestId('product-card')
    await userEvent.selectOptions(screen.getByTestId('sort-select'), 'name_asc')

    expect(navigation.history.map((entry) => entry.method)).toEqual(['replace'])
    const params = new URLSearchParams(navigation.url.split('?')[1])
    expect(params.get('q')).toBe('сахар')
    expect(params.get('sort')).toBe('name_asc')
    await expect.poll(cardNames).toEqual([
      'Сахар рафинад 1 кг',
      'Сахар-песок 1 кг',
      'Сахар-песок 2 кг',
      'Сахар-песок 5 кг',
    ])
  })

  it('shows an empty state with a link to the catalog when nothing matches', async () => {
    renderPage(<SearchPage />, searchUrl('kk', 'ананас'))
    const empty = await screen.findByTestId('empty-state')
    expect(empty).toHaveTextContent('ананас')
    expect(within(empty).getByRole('link')).toHaveAttribute('href', '/kk/catalog')
  })

  it('asks for a query when it is empty', () => {
    renderPage(<SearchPage />, '/ru/search')
    expect(screen.getByTestId('empty-state')).toHaveTextContent('Что ищем?')
    expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument()
  })
})
