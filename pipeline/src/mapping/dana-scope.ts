import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import { isCategorySlug, type CategorySlug } from '../agent/taxonomy.js'
import { mappingDir } from '../paths.js'
import { DANA_SCOPE_ROOTS, DANA_SECTION_RE } from '../scrapers/dana.js'
import type { SourceFile, SourceProduct } from '../types.js'
import { resolveCategory, type Dictionary } from './dictionary.js'
import { publishCategories } from './scope.js'

/**
 * Минимальный набор подразделов «Продуктов питания» Dana, покрывающий все товары публикуемого scope.
 * Ежедневный прогон обходит только эти подразделы; файл генерирует `pnpm scope:dana` из полного скрапа.
 */
export const DanaScopeSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  scope: z.array(z.string().refine(isCategorySlug, 'unknown category').transform((s) => s as CategorySlug)),
  root: z.string(),
  sections: z.array(z.string()),
  coveredProducts: z.number().int().nonnegative(),
  scopeProducts: z.number().int().nonnegative(),
  unsectionedProducts: z.number().int().nonnegative(),
}).superRefine((v, ctx) => {
  for (const s of v.sections) {
    if (!DANA_SECTION_RE.test(s) || s === v.root) ctx.addIssue({ code: 'custom', message: `section ${s} is outside root ${v.root}`, path: ['sections'] })
  }
})
export type DanaScope = z.infer<typeof DanaScopeSchema>

export const defaultDanaScopePath = () => resolve(mappingDir(), 'dana-scope-sections.json')

/** Подразделы товара из полного скрапа (rawPayload.sections) */
function danaSections(product: SourceProduct): string[] {
  const raw = product.rawPayload.sections
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string' && s !== '') : []
}

const ROOT = DANA_SCOPE_ROOTS[0]!

/** Жадное покрытие множества: детерминированно, при равенстве — меньший подраздел, затем путь по алфавиту */
export function computeDanaScope(file: SourceFile, dict: Dictionary, scope: Set<CategorySlug>, generatedAt: string): DanaScope {
  const size = new Map<string, number>()
  const uncovered = new Map<string, string[]>()
  let scopeProducts = 0, unsectionedProducts = 0
  for (const product of file.products) {
    if (product.sourceCategoryPath[0] !== ROOT.name) continue
    const secs = danaSections(product)
    for (const s of secs) size.set(s, (size.get(s) ?? 0) + 1)
    // То же правило категории, что в buildSyncBundle → набор покрывает ровно то, что публикует сайт
    if (!scope.has(resolveCategory(dict, 'DANA', product).category)) continue
    scopeProducts++
    if (secs.length > 0) uncovered.set(product.sourceProductId, secs)
    else unsectionedProducts++
  }
  let coveredProducts = 0
  const sections: string[] = []
  while (uncovered.size > 0) {
    const gain = new Map<string, number>()
    for (const secs of uncovered.values()) for (const s of secs) gain.set(s, (gain.get(s) ?? 0) + 1)
    const best = [...gain.entries()].sort((x, y) => y[1] - x[1] || size.get(x[0])! - size.get(y[0])! || x[0].localeCompare(y[0]))[0]![0]
    sections.push(best)
    for (const [id, secs] of uncovered) if (secs.includes(best)) { uncovered.delete(id); coveredProducts++ }
  }
  return { version: 1, generatedAt, scope: [...scope].sort(), root: ROOT.path, sections: sections.sort(), coveredProducts, scopeProducts, unsectionedProducts }
}

/**
 * null — файла нет, он битый, пустой или посчитан для более узкого scope, чем публикуемый сейчас:
 * тогда скрапер откатывается на обход корня. Устаревший набор молча терял бы товары новых категорий.
 */
export function readDanaScope(path: string, published: Set<CategorySlug> = publishCategories()): string[] | null {
  if (!existsSync(path)) return null
  let parsed: DanaScope
  try {
    parsed = DanaScopeSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  } catch (err) {
    console.warn(`[scope:dana] ${path} is invalid, falling back to the root: ${(err as Error).message}`)
    return null
  }
  if (parsed.sections.length === 0) {
    console.warn(`[scope:dana] ${path} has no sections, falling back to the root`)
    return null
  }
  const stored = new Set<string>(parsed.scope)
  const missing = [...published].filter((slug) => !stored.has(slug))
  if (missing.length > 0) {
    console.warn(`[scope:dana] ${path} was computed without published categories ${missing.join(', ')}; falling back to the root (run pnpm scope:dana)`)
    return null
  }
  return parsed.sections
}

/** Атомарная запись, подразделы отсортированы — стабильный diff в git */
export function writeDanaScope(path: string, s: DanaScope): void {
  const v = DanaScopeSchema.parse({ ...s, sections: [...s.sections].sort() })
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(`${path}.tmp`, `${JSON.stringify(v, null, 2)}\n`, 'utf8')
  renameSync(`${path}.tmp`, path)
}
