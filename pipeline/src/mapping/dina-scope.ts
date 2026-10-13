import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import { isCategorySlug, type CategorySlug } from '../agent/taxonomy.js'
import { mappingDir } from '../paths.js'
import type { SourceFile, SourceProduct } from '../types.js'
import { resolveCategory, type Dictionary } from './dictionary.js'
import { publishCategories } from './scope.js'

/**
 * Минимальный набор category_id Dina, покрывающий все товары публикуемого scope (spec §4.2).
 * Ежедневный прогон обходит только эти категории батчами; файл генерирует `pnpm scope:dina` из полного скрапа.
 */
export const DinaScopeSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  scope: z.array(z.string().refine(isCategorySlug, 'unknown category').transform((s) => s as CategorySlug)),
  // Только числовые id: их подставляет в GraphQL buildBatchQuery
  categoryIds: z.array(z.string().regex(/^\d+$/)),
  coveredProducts: z.number().int().nonnegative(),
  scopeProducts: z.number().int().nonnegative(),
})
export type DinaScope = z.infer<typeof DinaScopeSchema>

export const defaultDinaScopePath = () => resolve(mappingDir(), 'dina-scope-categories.json')

/** id категорий Dina из сырого ответа API (rawPayload.categories[].id) */
function dinaCategoryIds(product: SourceProduct): string[] {
  const raw = product.rawPayload.categories
  if (!Array.isArray(raw)) return []
  const ids = new Set<string>()
  for (const c of raw) {
    const id = (c as { id?: unknown } | null)?.id
    if (id !== undefined && id !== null && String(id) !== '') ids.add(String(id))
  }
  return [...ids]
}

const byNumber = (a: string, b: string) => Number(a) - Number(b) || a.localeCompare(b)

/** Жадное покрытие множества: детерминированно, при равенстве — меньшая категория, затем меньший id */
export function computeDinaScope(file: SourceFile, dict: Dictionary, scope: Set<CategorySlug>, generatedAt: string): DinaScope {
  const size = new Map<string, number>()
  const uncovered = new Map<string, string[]>()
  let scopeProducts = 0
  for (const product of file.products) {
    const cats = dinaCategoryIds(product)
    for (const c of cats) size.set(c, (size.get(c) ?? 0) + 1)
    // То же правило категории, что в buildSyncBundle → набор покрывает ровно то, что публикует сайт
    if (!scope.has(resolveCategory(dict, 'DINA', product).category)) continue
    scopeProducts++
    if (cats.length > 0) uncovered.set(product.sourceProductId, cats)
  }
  let coveredProducts = 0
  const categoryIds: string[] = []
  while (uncovered.size > 0) {
    const gain = new Map<string, number>()
    for (const cats of uncovered.values()) for (const c of cats) gain.set(c, (gain.get(c) ?? 0) + 1)
    const best = [...gain.entries()].sort((x, y) => y[1] - x[1] || size.get(x[0])! - size.get(y[0])! || byNumber(x[0], y[0]))[0]![0]
    categoryIds.push(best)
    for (const [id, cats] of uncovered) if (cats.includes(best)) { uncovered.delete(id); coveredProducts++ }
  }
  return { version: 1, generatedAt, scope: [...scope].sort(), categoryIds: categoryIds.sort(byNumber), coveredProducts, scopeProducts }
}

/**
 * null — файла нет, он битый, пустой или посчитан для более узкого scope, чем публикуемый сейчас:
 * тогда скрапер откатывается на обход по DINA_SCOPE_ROOTS. Устаревший набор молча терял бы товары
 * новых опубликованных категорий.
 */
export function readDinaScope(path: string, published: Set<CategorySlug> = publishCategories()): string[] | null {
  if (!existsSync(path)) return null
  let parsed: DinaScope
  try {
    parsed = DinaScopeSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  } catch (err) {
    console.warn(`[scope:dina] ${path} is invalid, falling back to scope roots: ${(err as Error).message}`)
    return null
  }
  if (parsed.categoryIds.length === 0) {
    console.warn(`[scope:dina] ${path} has no categoryIds, falling back to scope roots`)
    return null
  }
  const stored = new Set<string>(parsed.scope)
  const missing = [...published].filter((slug) => !stored.has(slug))
  if (missing.length > 0) {
    console.warn(`[scope:dina] ${path} was computed without published categories ${missing.join(', ')}; falling back to scope roots (run pnpm scope:dina)`)
    return null
  }
  return parsed.categoryIds
}

/** Атомарная запись, id отсортированы численно — стабильный diff в git */
export function writeDinaScope(path: string, s: DinaScope): void {
  const v = DinaScopeSchema.parse({ ...s, categoryIds: [...s.categoryIds].sort(byNumber) })
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(`${path}.tmp`, `${JSON.stringify(v, null, 2)}\n`, 'utf8')
  renameSync(`${path}.tmp`, path)
}
