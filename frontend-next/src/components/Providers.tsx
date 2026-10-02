'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { createQueryClient } from '../api/queryClient'
import '../i18n'

export function Providers({ children }: { children: ReactNode }) {
  // Свой QueryClient на каждый запрос (SSR) и один на всю жизнь вкладки
  const [queryClient] = useState(createQueryClient)
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
