import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type LlmCall = (prompt: string, schema: object) => Promise<unknown>
const KEYS = ['GEMINI_API_KEY', 'GEMINI_API_KEY2', 'GEMINI_API_KEY3'] as const

/** Failover по ключам как в backend/src/voice/nlp/gemini-nlp-parser.ts + дисковый кэш для воспроизводимости и экономии */
export function createGemini(opts: { cacheDir?: string; fetchImpl?: typeof fetch } = {}): LlmCall {
  const keys = [...new Set(KEYS.map((k) => process.env[k]?.trim()).filter((k): k is string => !!k))]
  if (!keys.length) throw new Error('GEMINI_API_KEY is not set')
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  const doFetch = opts.fetchImpl ?? fetch
  if (opts.cacheDir) mkdirSync(opts.cacheDir, { recursive: true })
  return async (prompt, schema) => {
    const hash = createHash('sha256').update(model).update(prompt).update(JSON.stringify(schema)).digest('hex')
    const cached = opts.cacheDir && join(opts.cacheDir, `${hash}.json`)
    if (cached && existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'))
    const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseJsonSchema: schema } })
    for (const key of keys) {
      try {
        const res = await doFetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body, signal: AbortSignal.timeout(60_000) })
        if (!res.ok) continue
        const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
        const text = json.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === 'string')?.text
        if (!text) continue
        const parsed: unknown = JSON.parse(text)
        if (cached) writeFileSync(cached, JSON.stringify(parsed), 'utf8')
        return parsed
      } catch { /* следующий ключ */ }
    }
    throw new Error('Gemini request failed on all keys')
  }
}
