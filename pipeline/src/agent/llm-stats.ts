import type { LlmCall } from './gemini.js'

/** Обёртка над LlmCall: считает вызовы и сбои, чтобы разовый прогон не опубликовал результат, посчитанный в основном «вхолостую» */
export function countFailures(llm: LlmCall) {
  let calls = 0, failures = 0
  const wrapped: LlmCall = async (prompt, schema) => {
    calls++
    try { return await llm(prompt, schema) } catch (err) { failures++; throw err }
  }
  return { llm: wrapped, calls: () => calls, failures: () => failures }
}
