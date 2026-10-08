import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { SourceFileSchema, type SourceFile } from './types.js'

function validate(input: unknown): SourceFile {
  const file = SourceFileSchema.parse(input)
  if (file.products.length === 0) throw new Error(`${file.storeCode}: no products — refusing to write`)
  const seen = new Set<string>()
  for (const p of file.products) {
    if (seen.has(p.sourceProductId)) throw new Error(`${file.storeCode}: duplicate sourceProductId ${p.sourceProductId}`)
    seen.add(p.sourceProductId)
  }
  return file
}

/** Атомарная запись: при падении посередине старый файл остаётся целым */
export function writeSourceFile(path: string, file: SourceFile): void {
  const valid = validate(file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(`${path}.tmp`, JSON.stringify(valid, null, 2), 'utf8')
  renameSync(`${path}.tmp`, path)
}

export function readSourceFile(path: string): SourceFile {
  return validate(JSON.parse(readFileSync(path, 'utf8')))
}
