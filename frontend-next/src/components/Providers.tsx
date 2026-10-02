'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { createQueryClient } from '../api/queryClient'
import { getI18n, type Language } from '../i18n'

export function Providers({ lang, children }: { lang: Language; children: ReactNode }) {
  // Свой QueryClient на каждый запрос (SSR) и один на всю жизнь вкладки
  const [queryClient] = useState(createQueryClient)
  // Смена языка = переход на другой префикс URL: layout перерисуется с новым lang и другим экземпляром
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={getI18n(lang)}>{children}</I18nextProvider>
    </QueryClientProvider>
  )
}
