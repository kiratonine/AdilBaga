import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGemini } from '../src/agent/gemini.js'

const ok = (payload: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 })
const limited = (retryAfter?: string) => new Response('{}', { status: 429, headers: retryAfter ? { 'retry-after': retryAfter } : {} })

const saved = { ...process.env }
beforeEach(() => { process.env.GEMINI_API_KEY = 'k1'; delete process.env.GEMINI_API_KEY2; delete process.env.GEMINI_API_KEY3 })
afterEach(() => { process.env = { ...saved } })

function setup(responses: (() => Response)[], extra: Parameters<typeof createGemini>[0] = {}) {
  const calls: { key: string }[] = []
  const sleeps: number[] = []
  let i = 0
  const fetchImpl = (async (_u: string, init: RequestInit) => {
    calls.push({ key: (init.headers as Record<string, string>)['x-goog-api-key']! })
    return responses[Math.min(i++, responses.length - 1)]!()
  }) as unknown as typeof fetch
  const llm = createGemini({ fetchImpl, sleepImpl: async (ms) => { sleeps.push(ms) }, minIntervalMs: 0, ...extra })
  return { llm, calls, sleeps }
}

describe('gemini', () => {
  it('waits Retry-After on 429 and retries the same key', async () => {
    const { llm, calls, sleeps } = setup([() => limited('7'), () => ok({ a: 1 })])
    expect(await llm('p', {})).toEqual({ a: 1 })
    expect(calls.map((c) => c.key)).toEqual(['k1', 'k1'])
    expect(sleeps).toContain(7000)
  })
  it('uses exponential backoff when Retry-After is missing', async () => {
    const { llm, sleeps } = setup([() => limited(), () => limited(), () => ok({ a: 1 })], { backoffBaseMs: 1000 })
    await llm('p', {})
    expect(sleeps.filter((s) => s > 0)).toEqual([1000, 2000])
  })
  it('switches to the next key after retries on one key are exhausted', async () => {
    process.env.GEMINI_API_KEY2 = 'k2'
    const { llm, calls } = setup([() => limited('1'), () => limited('1'), () => ok({ a: 1 })], { maxRetries: 1 })
    expect(await llm('p', {})).toEqual({ a: 1 })
    expect(calls.map((c) => c.key)).toEqual(['k1', 'k1', 'k2'])
  })
  it('throws when every key stays rate limited', async () => {
    const { llm } = setup([() => limited('1')], { maxRetries: 1 })
    await expect(llm('p', {})).rejects.toThrow(/failed on all keys/)
  })
  it('uses every numbered GEMINI_API_KEY variable, not only the first three', async () => {
    process.env.GEMINI_API_KEY2 = 'k2'; process.env.GEMINI_API_KEY3 = 'k3'; process.env.GEMINI_API_KEY4 = 'k4'
    const { llm, calls } = setup([() => limited('1'), () => limited('1'), () => limited('1'), () => ok({ a: 1 })], { maxRetries: 0 })
    expect(await llm('p', {})).toEqual({ a: 1 })
    expect(calls.map((c) => c.key)).toEqual(['k1', 'k2', 'k3', 'k4'])
  })
  it('puts an exhausted key on cooldown and starts the next calls with the next key', async () => {
    process.env.GEMINI_API_KEY2 = 'k2'
    const { llm, calls } = setup([() => limited('1'), () => limited('1'), () => ok({ a: 1 }), () => ok({ b: 2 })], { maxRetries: 1, cooldownMs: 60_000 })
    expect(await llm('first', {})).toEqual({ a: 1 })
    expect(await llm('second', {})).toEqual({ b: 2 })
    expect(calls.map((c) => c.key)).toEqual(['k1', 'k1', 'k2', 'k2'])
  })
  it('spaces requests by minIntervalMs', async () => {
    const { llm, sleeps } = setup([() => ok({ a: 1 })], { minIntervalMs: 5000 })
    await llm('one', {})
    await llm('two', {})
    expect(sleeps.some((s) => s > 0 && s <= 5000)).toBe(true)
  })
  it('serves repeated prompts from the disk cache without calling the api or sleeping', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'gem-'))
    const { llm, calls, sleeps } = setup([() => ok({ a: 1 })], { cacheDir, minIntervalMs: 5000 })
    await llm('same', {})
    await llm('same', {})
    expect(calls).toHaveLength(1)
    expect(sleeps.filter((s) => s > 0)).toHaveLength(0)
  })
})
