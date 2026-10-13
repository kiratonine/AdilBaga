import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { Bundle } from '../agent/bundle.js'
import { compareBundles } from '../sync/compare.js'

// pnpm sync:compare <a.json> <b.json> [--max-mismatch 0.01]
const USAGE = 'usage: pnpm sync:compare <a.json> <b.json> [--max-mismatch 0.01]'
const fail = (msg: string): never => { console.error(`[sync:compare] ${msg}`); process.exit(2) }

const { values, positionals } = (() => {
  try { return parseArgs({ allowPositionals: true, options: { 'max-mismatch': { type: 'string', default: '0.01' } } }) }
  catch (e) { return fail(`${(e as Error).message}\n${USAGE}`) }
})()
if (positionals.length !== 2) fail(USAGE)
const max = Number(values['max-mismatch'])
if (!Number.isFinite(max) || max < 0) fail(`--max-mismatch must be a non-negative number, got "${values['max-mismatch']}"`)

function readBundle(path: string): Bundle {
  const file = resolve(path)
  let parsed: unknown
  try { parsed = JSON.parse(readFileSync(file, 'utf8')) }
  catch (e) { return fail(`cannot read ${file}: ${(e as Error).message}`) }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as Bundle).rawProducts)) return fail(`${file} is not a sync bundle (no rawProducts array)`)
  return parsed as Bundle
}

const d = compareBundles(readBundle(positionals[0]!), readBundle(positionals[1]!))
console.log(`[sync:compare] A=${d.a} B=${d.b} onlyA=${d.onlyA.length} onlyB=${d.onlyB.length} priceChanged=${d.priceChanged.length} mismatch=${(d.mismatchRatio * 100).toFixed(2)}% (max ${(max * 100).toFixed(2)}%)`)
for (const [store, c] of Object.entries(d.perStore).sort(([x], [y]) => x.localeCompare(y))) console.log(`  ${store}: A=${c.a} B=${c.b}`)
if (d.onlyA.length) console.log(`onlyA (first 20): ${d.onlyA.slice(0, 20).join(', ')}`)
if (d.onlyB.length) console.log(`onlyB (first 20): ${d.onlyB.slice(0, 20).join(', ')}`)
if (d.mismatchRatio > max) {
  console.error(`[sync:compare] mismatch ${d.mismatchRatio} exceeds ${max}`)
  process.exit(1)
}
