import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { setLanguage } from '../i18n'
import { renderApp } from '../test/render'

describe('LandingPage', () => {
  afterEach(() => setLanguage('ru'))

  it('opens on / without the site header and tells what the project is about', () => {
    renderApp('/')
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Где продукты в Актау выгоднее')
    expect(screen.getByRole('heading', { level: 2, name: 'Чтобы сравнить цены, приходится открывать три сайта' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Спросите у Siri' })).toBeInTheDocument()
    expect(within(screen.getByTestId('landing-example')).getByText('Молоко 3,2%, 1 л')).toBeInTheDocument()
    expect(document.title).toBe('Adil Bağa — сравнение цен в Актау')
  })

  it('leads to the catalog and the dashboard', async () => {
    const { router } = renderApp('/')
    const main = screen.getByRole('main')
    expect(within(main).getAllByRole('link', { name: /Аналитика цен/ })[0]).toHaveAttribute('href', '/dashboard')

    await userEvent.click(within(main).getAllByRole('link', { name: /Открыть каталог/ })[0])
    expect(router.state.location.pathname).toBe('/catalog')
    expect(await screen.findAllByTestId('category-card')).toHaveLength(5)
  })

  it('is translated to Kazakh', async () => {
    renderApp('/')
    await userEvent.click(within(screen.getByRole('group', { name: 'Язык интерфейса' })).getByRole('button', { name: 'Қаз' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Siri-ден сұраңыз' })).toBeInTheDocument()
    expect(screen.getAllByTestId('siri-dialog')[0]).toHaveTextContent('Сүтті қай жерден алған тиімді?')
  })
})
