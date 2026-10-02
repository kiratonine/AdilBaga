import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { setI18n } from 'react-i18next'
import { afterEach, vi } from 'vitest'
import { getI18n } from '../i18n'
import { installHistory, navigation } from './navigation'

vi.mock('next/navigation', async () => (await import('./navigation')).mockNextNavigation())

installHistory()

// jsdom не реализует showModal/close у <dialog> — минимальная замена с событием close, как в браузере
// (часть тестов идёт в окружении node — там HTMLDialogElement нет)
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    if (!this.open) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}

// Компоненты без Providers (юнит-тесты карточек, фильтров) получают русский экземпляр
setI18n(getI18n('ru'))

afterEach(() => {
  cleanup()
  navigation.reset()
})
