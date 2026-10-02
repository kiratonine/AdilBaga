import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { setI18n } from 'react-i18next'
import { afterEach, vi } from 'vitest'
import { getI18n } from '../i18n'
import { navigation } from './navigation'

vi.mock('next/navigation', async () => (await import('./navigation')).mockNextNavigation())

// Компоненты без Providers (юнит-тесты карточек, фильтров) получают русский экземпляр
setI18n(getI18n('ru'))

afterEach(() => {
  cleanup()
  navigation.reset()
})
