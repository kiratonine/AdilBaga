import { DINA_PRODUCT_FIELDS, type DinaItem } from './dina.js'

export type PageRequest = { categoryId: string; page: number }
export type PageResult = { ok: true; total: number; edges: DinaItem[] } | { ok: false; error: string }

/**
 * Один GraphQL-документ с алиасами p0..pN: несколько страниц каталога за один HTTP-запрос.
 * categoryId подставляется прямо в документ, поэтому допускаются только цифры (защита от инъекции).
 */
export function buildBatchQuery(reqs: PageRequest[], shopId: string, pageSize: number): string {
  const parts = reqs.map((r, i) => {
    if (!/^\d+$/.test(r.categoryId)) throw new Error(`DINA: invalid category id ${JSON.stringify(r.categoryId)}`)
    return `p${i}: products(shop_id: ${shopId}, _page: ${r.page}, _limit: ${pageSize}, category_id: ${r.categoryId}) { pageInfo { total } edges { ${DINA_PRODUCT_FIELDS} } }`
  })
  return `{ ${parts.join(' ')} }`
}

type GqlError = { message?: string; path?: unknown[] }
type AliasData = { pageInfo?: { total?: number }; edges?: DinaItem[] } | null | undefined

/**
 * Разбирает ответ батча: результат i соответствует алиасу p<i>.
 * Частичный отказ (data + errors) сохраняет успешные алиасы, упавшие помечаются { ok: false }.
 */
export function parseBatchResponse(body: unknown, count: number): PageResult[] {
  const b = (body ?? {}) as { data?: Record<string, AliasData> | null; errors?: GqlError[] }
  const errors = Array.isArray(b.errors) ? b.errors : []
  const firstMessage = errors.find((e) => e?.message)?.message
  const data = b.data
  if (!data || typeof data !== 'object') {
    return Array.from({ length: count }, () => ({ ok: false as const, error: firstMessage ?? 'DINA: empty graphql response' }))
  }
  return Array.from({ length: count }, (_, i): PageResult => {
    const alias = `p${i}`
    const err = errors.find((e) => e?.path?.[0] === alias)
    if (err) return { ok: false, error: err.message ?? `DINA: ${alias} failed` }
    const node = data[alias]
    if (!node) return { ok: false, error: firstMessage ?? `DINA: ${alias} missing in response` }
    return { ok: true, total: node.pageInfo?.total ?? -1, edges: node.edges ?? [] }
  })
}
