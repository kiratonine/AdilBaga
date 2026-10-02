import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderPage } from '../test/render'
import { LandingPage } from './LandingPage'

describe('LandingPage', () => {
  it('tells what the project is about', () => {
    renderPage(<LandingPage />, '/ru')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Где продукты в Актау выгоднее')
    expect(screen.getByRole('heading', { level: 2, name: 'Чтобы сравнить цены, приходится открывать три сайта' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Спросите у Siri' })).toBeInTheDocument()
    expect(within(screen.getByTestId('landing-example')).getByText('Молоко 3,2%, 1 л')).toBeInTheDocument()
  })

  it('leads to the catalog and the dashboard of the same language', () => {
    renderPage(<LandingPage />, '/ru')
    for (const link of screen.getAllByRole('link', { name: /Открыть каталог/ })) expect(link).toHaveAttribute('href', '/ru/catalog')
    for (const link of screen.getAllByRole('link', { name: /Аналитика цен/ })) expect(link).toHaveAttribute('href', '/ru/dashboard')
  })

  it('is translated to Kazakh under /kk', () => {
    renderPage(<LandingPage />, '/kk')
    expect(screen.getByRole('heading', { level: 2, name: 'Siri-ден сұраңыз' })).toBeInTheDocument()
    expect(screen.getByTestId('siri-dialog')).toHaveTextContent('Сүтті қай жерден алған тиімді?')
    expect(within(screen.getByRole('group', { name: 'Интерфейс тілі' })).getByRole('link', { name: 'Қаз' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(screen.getAllByRole('link', { name: /каталог/i })[0]).toHaveAttribute('href', '/kk/catalog')
  })
})
