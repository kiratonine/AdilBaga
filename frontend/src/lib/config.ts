export type ApiEnv = {
  mode?: string
  publicBaseUrl?: string
  serverBaseUrl?: string
  nodeEnv?: string
  enableTestMocks?: string
}

/** Errors name the setting, never its potentially credentialed value. */
export function httpUrl(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required`)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} must be an HTTP(S) URL`)
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${name} must be an HTTP(S) URL without credentials`)
  }
  return url.toString().replace(/\/+$/, '')
}

export function validateApiConfig(env: ApiEnv) {
  if (env.mode !== 'http' && env.mode !== 'mock') {
    throw new Error('NEXT_PUBLIC_API_MODE must be explicitly http or mock')
  }
  if (env.mode === 'mock') {
    if (env.nodeEnv === 'production' && env.enableTestMocks !== '1') {
      throw new Error('Production requires HTTP; test mocks require NEXT_PUBLIC_ENABLE_TEST_MOCKS=1')
    }
    return { mode: 'mock' as const }
  }
  const publicBaseUrl = httpUrl(env.publicBaseUrl, 'NEXT_PUBLIC_API_BASE_URL')
  const serverBaseUrl = env.serverBaseUrl === undefined
    ? publicBaseUrl
    : httpUrl(env.serverBaseUrl, 'API_BASE_URL')
  return { mode: 'http' as const, publicBaseUrl, serverBaseUrl }
}

export function siteUrl(value: string | undefined, nodeEnv?: string): URL {
  // Development/tests may use a local origin; production must explicitly supply one.
  if (!value && nodeEnv !== 'production') return new URL('http://localhost:3000')
  return new URL(httpUrl(value, 'NEXT_PUBLIC_SITE_URL'))
}
