export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'

export type PoliteOptions = { delayMs?: number; retries?: number; timeoutMs?: number; fetchImpl?: typeof fetch }

/** Один запрос за раз, пауза перед каждым, ретраи с backoff на сеть/5xx/429. 4xx (кроме 429) — сразу ошибка. */
export async function politeFetch(url: string, init: RequestInit = {}, opts: PoliteOptions = {}): Promise<Response> {
  const { delayMs = 300, retries = 3, timeoutMs = 30_000, fetchImpl = fetch } = opts
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    await sleep(attempt === 0 ? delayMs : delayMs * 2 ** attempt)
    try {
      const res = await fetchImpl(url, {
        ...init,
        headers: { 'user-agent': USER_AGENT, 'accept-language': 'ru-RU,ru;q=0.9', ...init.headers },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.ok) return res
      if (res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status} ${url}`)
      lastError = new Error(`HTTP ${res.status} ${url}`)
    } catch (err) {
      if (err instanceof Error && /^HTTP 4/.test(err.message)) throw err
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`request failed ${url}`)
}
