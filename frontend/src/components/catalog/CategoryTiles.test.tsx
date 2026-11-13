import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockCategories } from '../../mocks'
import { renderPage } from '../../test/render'
import { CategoryTiles } from './CategoryTiles'

describe('CategoryTiles', () => {
  it('puts the SZPT tile first when the section has groups', () => {
    renderPage(<CategoryTiles categories={mockCategories} szptGroup="rice" />, '/ru/catalog')
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', '/ru/szpt/rice')
    expect(links[0]).toHaveTextContent('СЗПТ')
    expect(screen.getByTestId('szpt-tile')).toBe(links[0])
    expect(links).toHaveLength(mockCategories.length + 1)
  })

  it('shows only categories without SZPT groups', () => {
    renderPage(<CategoryTiles categories={mockCategories} szptGroup={null} />, '/kk/catalog')
    expect(screen.queryByTestId('szpt-tile')).toBeNull()
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', `/kk/collections/${mockCategories[0].slug}`)
  })

  it('names the tile in Kazakh', () => {
    renderPage(<CategoryTiles categories={mockCategories} szptGroup="rice" />, '/kk/catalog')
    expect(screen.getByTestId('szpt-tile')).toHaveTextContent('ӘМАТ')
  })
})
