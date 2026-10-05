import type { Cluster } from '../agent/match.js'
import { isVariableWeight } from './weight.js'

const isolate = (cl: Cluster): Cluster[] => cl.members.map((m) => ({ ...cl, members: [m] }))

/**
 * Что уходит на сайт: pending-матч между сетями не публикуется объединённым, пока не получит approved.
 * Словарь не меняется — группа хранится целиком, одобрение делается в overrides (approve).
 */
export function isolateForPublish(clusters: Cluster[]): Cluster[] {
  return clusters.flatMap((cl) => {
    if (cl.members.length < 2) return [cl]
    if (cl.review === 'pending') return isolate(cl)
    // Цена за кг нельзя сравнивать с ценой за штуку: весовые выносятся отдельно, пока в группе есть штучные
    const weighed = cl.members.filter((m) => isVariableWeight(m.storeCode, m.product))
    if (weighed.length === 0 || weighed.length === cl.members.length) return [cl]
    return [{ ...cl, members: cl.members.filter((m) => !weighed.includes(m)) }, ...isolate({ ...cl, members: weighed })]
  })
}
