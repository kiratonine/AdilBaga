import { isAbsolute, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT, mappingDir, sourcesDir, syncOutDir } from '../src/paths.js'

const norm = (p: string) => p.replaceAll('\\', '/')

describe('paths', () => {
  it('sourcesDir defaults to data/sources', () => {
    expect(norm(sourcesDir(undefined))).toMatch(/\/data\/sources$/)
    expect(norm(sourcesDir(''))).toMatch(/\/data\/sources$/)
  })
  it('relative sourcesDir resolves from the repo root', () => {
    expect(sourcesDir('data/sources-full')).toBe(resolve(REPO_ROOT, 'data/sources-full'))
  })
  it('absolute sourcesDir is returned as is', () => {
    const abs = resolve(REPO_ROOT, '..', 'elsewhere', 'src')
    expect(isAbsolute(abs)).toBe(true)
    expect(sourcesDir(abs)).toBe(abs)
  })
  it('syncOutDir defaults to data/sync and honours overrides', () => {
    expect(norm(syncOutDir(undefined))).toMatch(/\/data\/sync$/)
    expect(syncOutDir('data/sync-full')).toBe(resolve(REPO_ROOT, 'data/sync-full'))
  })
  it('mappingDir is data/mapping', () => {
    expect(norm(mappingDir())).toMatch(/\/data\/mapping$/)
  })
})
