import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { getI18n, isLanguage } from '../i18n'
import { navigation } from './navigation'

/**
 * Рендерит страницу так, как её видит пользователь на `url`: язык — из префикса,
 * данные — из моков API (без ретраев), next/navigation — подмена из navigation.ts
 */
export function renderPage(ui: ReactNode, url = '/ru') {
  navigation.setUrl(url)
  const prefix = url.split('/')[1]
  const lang = isLanguage(prefix) ? prefix : 'ru'
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={getI18n(lang)}>{ui}</I18nextProvider>
    </QueryClientProvider>,
  )
}
