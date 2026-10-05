import { buildBundle, type Bundle } from '../agent/bundle.js'
import type { Attributes, ClassifiedProduct } from '../agent/classify.js'
import type { Cluster } from '../agent/match.js'
import type { CategorySlug } from '../agent/taxonomy.js'
import { extractFat, extractSize } from '../agent/units.js'
import { identity, storeCategoryKey, type Dictionary } from '../mapping/dictionary.js'
import { isolateForPublish } from '../mapping/publish.js'
import { filterClustersByScope } from '../mapping/scope.js'
import type { SourceFile, StoreCode } from '../types.js'

export type Unmapped = { storeCode: StoreCode; sourceProductId: string; name: string; price: number
  sourceCategoryPath: string[]; guessedCategory: CategorySlug }

export function assertFresh(files: SourceFile[], required: StoreCode[], now: Date, maxAgeHours: number): void {
  for (const store of required) {
    const file = files.find((f) => f.storeCode === store)
    if (!file) throw new Error(`${store}: source file missing — run pnpm scrape:${store.toLowerCase().replace('_', '')}`)
    const ageHours = (now.getTime() - Date.parse(file.capturedAt)) / 3_600_000
    if (ageHours > maxAgeHours) throw new Error(`${store}: source file is stale (${Math.round(ageHours)} h old)`)
  }
}

/** scope — какие категории публикуем; без него публикуется всё, что есть в словаре */
export function buildSyncBundle(files: SourceFile[], dict: Dictionary, generatedAt: string, scope?: Set<CategorySlug>): { bundle: Bundle; unmapped: Unmapped[] } {
  const known = new Map<string, ClassifiedProduct[]>()
  const clusters: Cluster[] = []
  const unmapped: Unmapped[] = []
  for (const file of files) {
    for (const product of file.products) {
      const key = dict.products[identity(file.storeCode, product.sourceProductId)]
      const card = key ? dict.canonicals[key] : undefined
      if (key && card) {
        // Все участники несут данные карточки из словаря → buildBundle выдаст то же название/бренд/атрибуты
        known.set(key, [...(known.get(key) ?? []), { storeCode: file.storeCode, product, category: card.category,
          productType: 'dictionary', brand: card.brand, attributes: card.attributes as Attributes, displayName: card.name, flags: [] }])
        continue
      }
      const guessed = dict.storeCategories[storeCategoryKey(file.storeCode, product.sourceCategoryPath)] ?? 'other'
      if (scope && !scope.has(guessed)) continue
      const fat = extractFat(product.name)
      unmapped.push({ storeCode: file.storeCode, sourceProductId: product.sourceProductId, name: product.name,
        price: product.price, sourceCategoryPath: product.sourceCategoryPath, guessedCategory: guessed })
      clusters.push({ method: 'deterministic', confidence: 1, review: 'pending', members: [{ storeCode: file.storeCode, product,
        category: guessed, productType: 'unmapped', brand: product.brand,
        attributes: { ...extractSize(product.name), ...(fat !== null ? { fatPercent: fat } : {}) }, displayName: product.name, flags: ['unmapped'] }] })
    }
  }
  for (const key of [...known.keys()].sort()) {
    const card = dict.canonicals[key]!
    clusters.push({ members: known.get(key)!, method: card.method, confidence: card.confidence, review: card.review })
  }
  const sources = files.map(({ products: _products, ...meta }) => meta)
  return { bundle: buildBundle(isolateForPublish(scope ? filterClustersByScope(clusters, scope) : clusters), sources, generatedAt), unmapped }
}
