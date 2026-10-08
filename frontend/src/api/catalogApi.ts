import { createHttpAdapter } from './httpAdapter'
import { createMockAdapter } from './mockAdapter'
import type { CatalogApi } from './types'
import { validateApiConfig, type ApiEnv } from '../lib/config'

export function createCatalogApi(env: ApiEnv, isServer: boolean): CatalogApi {
  const config = validateApiConfig({ ...env, nodeEnv: env.nodeEnv ?? process.env.NODE_ENV })
  if (config.mode === 'mock') return createMockAdapter()
  return createHttpAdapter(isServer ? config.serverBaseUrl : config.publicBaseUrl, isServer)
}

// NEXT_PUBLIC_* Next подставляет при сборке — только при прямом обращении к process.env.NAME
export const catalogApi: CatalogApi = createCatalogApi(
  {
    mode: process.env.NEXT_PUBLIC_API_MODE,
    publicBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
    serverBaseUrl: process.env.API_BASE_URL,
    nodeEnv: process.env.NODE_ENV,
    enableTestMocks: process.env.NEXT_PUBLIC_ENABLE_TEST_MOCKS,
  },
  typeof window === 'undefined',
)
