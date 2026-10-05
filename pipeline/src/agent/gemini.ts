import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sleep } from '../http.js'

export type LlmCall = (prompt: string, schema: object) => Promise<unknown>
const KEYS = ['GEMINI_API_KEY', 'GEMINI_API_KEY2', 'GEMINI_API_KEY3'] as const
const MAX_WAIT_MS = 120_000

export type GeminiOptions = {
  cacheDir?: string
  fetchImpl?: typeof fetch
  sleepImpl?: (ms: number) => Promise<void>
  /** Минимальный интервал между запросами к API; по умолчанию GEMINI_MIN_INTERVAL_MS или 4000 мс (free-уровень ≈ 15 RPM) */
  minIntervalMs?: number
  /** Сколько раз повторить запрос на одном ключе при 429/5xx, прежде чем перейти к следующему */
  maxRetries?: number
  backoffBaseMs?: number
}

/** Секунды из Retry-After → мс; без заголовка — экспоненциальный backoff */
function waitMs(res: Response, attempt: number, base: number): number {
  const sec = Number(res.headers.get('retry-after'))
  const ms = Number.isFinite(sec) && sec > 0 ? sec * 1000 : base * 2 ** attempt
  return Math.min(ms, MAX_WAIT_MS)
}

/**
 * Failover по ключам как в backend/src/voice/nlp/gemini-nlp-parser.ts + дисковый кэш для воспроизводимости и экономии.
 * Запросы разносятся по времени (throttle), на 429/5xx — повтор с паузой на том же ключе, затем следующий ключ.
 */
export function createGemini(opts: GeminiOptions = {}): LlmCall {
  const keys = [...new Set(KEYS.map((k) => process.env[k]?.trim()).filter((k): k is string => !!k))]
  if (!keys.length) throw new Error('GEMINI_API_KEY is not set')
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  const doFetch = opts.fetchImpl ?? fetch
  const pause = opts.sleepImpl ?? sleep
  const minInterval = opts.minIntervalMs ?? Number(process.env.GEMINI_MIN_INTERVAL_MS ?? 4000)
  const maxRetries = opts.maxRetries ?? 4
  const backoffBase = opts.backoffBaseMs ?? 2000
  if (opts.cacheDir) mkdirSync(opts.cacheDir, { recursive: true })

  let lastStart = 0
  const throttle = async () => {
    const wait = lastStart + minInterval - Date.now()
    if (wait > 0) await pause(wait)
    lastStart = Date.now()
  }

  return async (prompt, schema) => {
    const hash = createHash('sha256').update(model).update(prompt).update(JSON.stringify(schema)).digest('hex')
    const cached = opts.cacheDir && join(opts.cacheDir, `${hash}.json`)
    if (cached && existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'))
    const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseJsonSchema: schema } })
    for (const key of keys) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await throttle()
          const res = await doFetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body, signal: AbortSignal.timeout(60_000) })
          if (res.status === 429 || res.status >= 500) {
            if (attempt < maxRetries) await pause(waitMs(res, attempt, backoffBase))
            continue
          }
          if (!res.ok) break // 400/403 и т.п. — ключ не поможет повтором, пробуем следующий
          const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
          const text = json.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === 'string')?.text
          if (!text) break
          const parsed: unknown = JSON.parse(text)
          if (cached) writeFileSync(cached, JSON.stringify(parsed), 'utf8')
          return parsed
        } catch { break /* сеть/невалидный JSON — следующий ключ */ }
      }
    }
    throw new Error('Gemini request failed on all keys')
  }
}
