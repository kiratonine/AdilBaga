import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderPage } from '../../test/render'
import { TabBar } from './TabBar'

const current = () => screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page')

describe('TabBar', () => {
  it('is a labelled navigation with three tabs of the current language', () => {
    renderPage(<TabBar />, '/kk/dashboard')
    const nav = screen.getByRole('navigation', { name: 'Негізгі навигация' })
    expect(nav).toHaveAttribute('data-testid', 'tab-bar')
    expect(within(nav).getByTestId('tab-catalog')).toHaveAttribute('href', '/kk/catalog')
    expect(within(nav).getByTestId('tab-search')).toHaveAttribute('href', '/kk/search')
    expect(within(nav).getByTestId('tab-dashboard')).toHaveAttribute('href', '/kk/dashboard')
    // Подписи видимые, не только иконки
    expect(within(nav).getByTestId('tab-search')).toHaveTextContent('Іздеу')
  })

  it.each([
    ['/ru/catalog', 'tab-catalog'],
    ['/ru/collections/milk', 'tab-catalog'],
    ['/ru/products/p1', 'tab-catalog'],
    ['/ru/search?q=молоко', 'tab-search'],
    ['/ru/dashboard', 'tab-dashboard'],
  ])('marks the active tab on %s', (url, testId) => {
    renderPage(<TabBar />, url)
    expect(current()).toEqual([screen.getByTestId(testId)])
    expect(screen.getByTestId(testId)).toHaveClass('text-ink')
  })

  it('has no active tab on other pages', () => {
    renderPage(<TabBar />, '/ru/unknown')
    expect(current()).toEqual([])
  })
})
