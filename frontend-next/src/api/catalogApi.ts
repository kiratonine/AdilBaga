import { createHttpAdapter } from './httpAdapter'
import { createMockAdapter } from './mockAdapter'
import type { CatalogApi } from './types'

type ApiEnv = {
  mode?: string
  /** Адрес API для браузера (публичный) */
  publicBaseUrl?: string
  /** Адрес API для сервера Next — внутренний, если API в той же сети. Не задан — берём публичный */
  serverBaseUrl?: string
}

export function createCatalogApi(env: ApiEnv, isServer: boolean): CatalogApi {
  if (env.mode !== 'http') return createMockAdapter()
  const baseUrl = isServer ? (env.serverBaseUrl ?? env.publicBaseUrl) : env.publicBaseUrl
  return createHttpAdapter(baseUrl ?? '')
}

// NEXT_PUBLIC_* Next подставляет при сборке — только при прямом обращении к process.env.NAME
export const catalogApi: CatalogApi = createCatalogApi(
  {
    mode: process.env.NEXT_PUBLIC_API_MODE,
    publicBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
    serverBaseUrl: process.env.API_BASE_URL,
  },
  typeof window === 'undefined',
)
