import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { navigation } from '../../test/navigation'
import { renderPage } from '../../test/render'
import { Header } from './Header'
import { Main, SkipLink } from './Main'
import { SEARCH_DEBOUNCE_MS } from './SearchBox'

const languageGroup = () => screen.getByRole('group', { name: /Язык интерфейса|Интерфейс тілі/ })

describe('Header', () => {
  it('links to the catalog and the dashboard of the current language', () => {
    renderPage(<Header />, '/kk/catalog')
    expect(screen.getByTestId('nav-catalog')).toHaveAttribute('href', '/kk/catalog')
    expect(screen.getByTestId('nav-catalog')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-dashboard')).toHaveAttribute('href', '/kk/dashboard')
    expect(screen.getByTestId('nav-dashboard')).toHaveTextContent('Талдау')
    expect(screen.getByRole('link', { name: 'Adil Bağa' })).toHaveAttribute('href', '/kk/catalog')
  })

  it('marks the catalog active on category and product pages too', () => {
    renderPage(<Header />, '/ru/products/p1')
    expect(screen.getByTestId('nav-catalog')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-dashboard')).not.toHaveAttribute('aria-current')
  })

  it('focuses the search field after an in-app move to /search without a query, not on first load', () => {
    renderPage(<Header />, '/ru/search')
    const input = screen.getByTestId('search-input')
    expect(input).not.toHaveFocus()

    act(() => navigation.setUrl('/ru/catalog'))
    act(() => navigation.setUrl('/ru/search'))
    expect(input).toHaveFocus()
  })

  it('does not steal focus when arriving at /search with a query', () => {
    renderPage(<Header />, '/ru/catalog')
    act(() => navigation.setUrl('/ru/search?q=хлеб'))
    expect(screen.getByTestId('search-input')).not.toHaveFocus()
  })

  it('submits search to /<lang>/search?q=', async () => {
    renderPage(<Header />, '/ru/catalog')
    await userEvent.type(screen.getByTestId('search-input'), 'молоко{Enter}')
    expect(navigation.history).toEqual([{ method: 'push', url: `/ru/search?q=${encodeURIComponent('молоко')}` }])
  })

  it('searches while typing on the search page, keeping the sort', async () => {
    renderPage(<Header />, '/ru/search?q=хлеб&sort=price_desc')
    const input = screen.getByTestId('search-input')
    expect(input).toHaveValue('хлеб')

    await userEvent.clear(input)
    await userEvent.type(input, 'сахар')
    await act(() => new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 50)))

    const last = navigation.history.at(-1)
    expect(last?.method).toBe('replace')
    const url = new URL(last!.url, 'http://x')
    expect(url.pathname).toBe('/ru/search')
    expect(url.searchParams.get('q')).toBe('сахар')
    expect(url.searchParams.get('sort')).toBe('price_desc')
  })

  it('switches language by linking to the same page under the other prefix', async () => {
    renderPage(<Header />, '/ru/collections/milk')
    const group = languageGroup()
    expect(within(group).getByRole('link', { name: 'Рус' })).toHaveAttribute('aria-current', 'true')
    const kk = within(group).getByRole('link', { name: 'Қаз' })
    expect(kk).toHaveAttribute('href', '/kk/collections/milk')
    expect(kk).toHaveAttribute('hreflang', 'kk')

    await userEvent.click(kk)
    expect(document.cookie).toContain('lang=kk')
  })

  it('carries filters over to the other language', async () => {
    window.history.replaceState(null, '', '/ru/collections/milk?volumeMl=1000')
    renderPage(<Header />, '/ru/collections/milk?volumeMl=1000')
    await userEvent.click(within(languageGroup()).getByRole('link', { name: 'Қаз' }))
    expect(navigation.history.at(-1)).toEqual({ method: 'push', url: '/kk/collections/milk?volumeMl=1000' })
    window.history.replaceState(null, '', '/')
  })

  it('has a skip link to the main content', () => {
    renderPage(
      <>
        <SkipLink />
        <Main>content</Main>
      </>,
    )
    expect(screen.getByRole('link', { name: 'Перейти к содержимому' })).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  })
})
