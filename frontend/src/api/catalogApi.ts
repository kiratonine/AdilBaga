import { createHttpAdapter } from './httpAdapter'
import { createMockAdapter } from './mockAdapter'
import type { CatalogApi } from './types'

// VITE_API_MODE=mock|http, VITE_API_BASE_URL=http://localhost:3000
const mode = import.meta.env.VITE_API_MODE ?? 'mock'

export const catalogApi: CatalogApi =
  mode === 'http' ? createHttpAdapter(import.meta.env.VITE_API_BASE_URL ?? '') : createMockAdapter()
