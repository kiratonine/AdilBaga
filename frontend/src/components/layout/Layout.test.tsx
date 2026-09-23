import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { setLanguage } from '../../i18n'
import { renderApp } from '../../test/render'

describe('Layout', () => {
  afterEach(() => setLanguage('ru'))

  it('shows top price spreads on the home page with the snapshot date', async () => {
    renderApp('/')
    const cards = await screen.findAllByTestId('product-card', {}, { timeout: 3000 })
    expect(cards).toHaveLength(8)
    expect(within(cards[0]).getByRole('link')).toHaveTextContent('Молоко Lactel безлактозное 1% 900 мл')
    expect(within(cards[0]).getByTestId('snapshot-date')).toHaveTextContent('Цена на 24.09.2026')
    expect(document.body.textContent).not.toMatch(/реальном времени/i)
  })

  it('lists categories from the API', async () => {
    renderApp('/')
    expect(await screen.findAllByTestId('category-card')).toHaveLength(5)
  })

  it('submits search to /search?q=', async () => {
    const { router } = renderApp('/')
    await userEvent.type(screen.getByTestId('search-input'), 'молоко{Enter}')
    expect(router.state.location.pathname).toBe('/search')
    expect(new URLSearchParams(router.state.location.search).get('q')).toBe('молоко')
  })

  it('switches interface language to Kazakh', async () => {
    renderApp('/')
    const group = screen.getByRole('group', { name: 'Язык интерфейса' })
    await userEvent.click(within(group).getByRole('button', { name: 'Қаз' }))
    expect(await screen.findByText('Талдау')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('kk')
  })
})
