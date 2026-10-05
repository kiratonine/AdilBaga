import { describe, expect, it } from 'vitest'
import { countFailures } from '../src/agent/llm-stats.js'

describe('llm stats', () => {
  it('counts calls and failures while passing results and errors through', async () => {
    let n = 0
    const stats = countFailures(async () => { if (++n === 2) throw new Error('quota'); return { ok: n } })
    expect(await stats.llm('a', {})).toEqual({ ok: 1 })
    await expect(stats.llm('b', {})).rejects.toThrow('quota')
    expect(await stats.llm('c', {})).toEqual({ ok: 3 })
    expect(stats.calls()).toBe(3)
    expect(stats.failures()).toBe(1)
  })
})
