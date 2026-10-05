import type { Cluster } from '../agent/match.js'
import { isCategorySlug, type CategorySlug } from '../agent/taxonomy.js'

/**
 * Что публикуем на сайт: социально значимые продукты питания (docs/00_TECHNICAL_SPEC.md, 04_BACKEND_2_SCOPE.md §23).
 * Словарь хранит все категории, поэтому набор можно расширить без повторного прогона LLM — через env PUBLISH_CATEGORIES.
 */
export const DEFAULT_PUBLISH_CATEGORIES: readonly CategorySlug[] = ['milk', 'dairy', 'eggs', 'bread', 'meat', 'vegetables', 'groats', 'sugar', 'oil']

export function publishCategories(env: string | undefined = process.env.PUBLISH_CATEGORIES): Set<CategorySlug> {
  if (!env?.trim()) return new Set(DEFAULT_PUBLISH_CATEGORIES)
  const out = new Set<CategorySlug>()
  for (const raw of env.split(',')) {
    const slug = raw.trim()
    if (!isCategorySlug(slug)) throw new Error(`PUBLISH_CATEGORIES: unknown category ${slug}`)
    out.add(slug)
  }
  return out
}

export const filterClustersByScope = (clusters: Cluster[], scope: Set<CategorySlug>): Cluster[] =>
  clusters.filter((c) => c.members.every((m) => scope.has(m.category)))
