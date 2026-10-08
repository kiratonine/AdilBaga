import { z } from 'zod'
import type { ClassifiedProduct } from './classify.js'
import type { LlmCall } from './gemini.js'
import { normalizeText } from './units.js'

export type Cluster = { members: ClassifiedProduct[]; method: 'deterministic' | 'ai'; confidence: number; review: 'approved' | 'pending' }
const id = (c: ClassifiedProduct) => `${c.storeCode}:${c.product.sourceProductId}`
const single = (m: ClassifiedProduct): Cluster => ({ members: [m], method: 'deterministic', confidence: 1, review: 'approved' })

const Reply = z.object({ clusters: z.array(z.object({ ids: z.array(z.string()).min(1), confidence: z.number().min(0).max(1) })) })
const SCHEMA = { type: 'object', properties: { clusters: { type: 'array', items: { type: 'object', properties: {
  ids: { type: 'array', items: { type: 'string' } }, confidence: { type: 'number' } }, required: ['ids', 'confidence'] } } }, required: ['clusters'] }

function tokens(s: string) { return new Set(normalizeText(s).split(/[^a-zа-я0-9.]+/).filter(Boolean)) }
function similarity(a: string, b: string) {
  const x = tokens(a), y = tokens(b)
  const inter = [...x].filter((t) => y.has(t)).length
  return inter / Math.max(1, x.size + y.size - inter)
}

export function applyGuards(cluster: Cluster): Cluster[] {
  if (cluster.members.length < 2) return [cluster]
  const [anchor, ...rest] = cluster.members
  const kept: ClassifiedProduct[] = [anchor!]
  const ejected: ClassifiedProduct[] = []
  const sameShape = (x: ClassifiedProduct) =>
    (['volumeMl', 'weightGrams', 'packageCount', 'fatPercent'] as const).every((k) => anchor!.attributes[k] === x.attributes[k])
  // Сначала наиболее похожие на якорь — при конфликте одной сети побеждает самый похожий
  for (const m of [...rest].sort((p, q) => similarity(anchor!.product.name, q.product.name) - similarity(anchor!.product.name, p.product.name))) {
    if (!sameShape(m) || kept.some((k) => k.storeCode === m.storeCode)) ejected.push(m)
    else kept.push(m)
  }
  return [{ ...cluster, members: kept }, ...ejected.map(single)]
}

export async function matchBlock(block: ClassifiedProduct[], llm: LlmCall): Promise<Cluster[]> {
  if (new Set(block.map((b) => b.storeCode)).size < 2) return block.map(single)
  const byId = new Map(block.map((b) => [id(b), b]))
  const prompt = [
    'Сгруппируй одинаковые товары из разных магазинов Актау. Одинаковые = тот же производитель/бренд, тот же продукт, тот же вкус/вид, тот же размер и жирность.',
    'Разные магазины пишут названия по-разному (латиница/кириллица, сокращения) — это нормально. Если сомневаешься — не объединяй.',
    'Каждый id должен встретиться ровно в одном кластере; одиночные товары — кластер из одного id. confidence от 0 до 1. Верни строго JSON.',
    JSON.stringify(block.map((b) => ({ id: id(b), store: b.storeCode, name: b.product.name, brand: b.brand, attrs: b.attributes }))),
  ].join('\n')
  let reply: z.infer<typeof Reply> | null = null
  for (let attempt = 0; attempt < 2 && !reply; attempt++) {
    try { const p = Reply.safeParse(await llm(prompt, SCHEMA)); if (p.success) reply = p.data } catch { /* повтор */ }
  }
  if (!reply) return block.map(single)
  const used = new Set<string>()
  const out: Cluster[] = []
  for (const c of reply.clusters) {
    const members = c.ids.filter((x) => byId.has(x) && !used.has(x)).map((x) => byId.get(x)!)
    members.forEach((m) => used.add(id(m)))
    if (members.length === 0) continue
    if (members.length === 1 || c.confidence < 0.8) { out.push(...members.map(single)); continue }
    out.push(...applyGuards({ members, method: 'ai', confidence: c.confidence, review: c.confidence >= 0.95 ? 'approved' : 'pending' }))
  }
  for (const b of block) if (!used.has(id(b))) out.push(single(b))
  return out
}
