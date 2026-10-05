import type { Cluster } from '../agent/match.js'

const isolate = (cl: Cluster): Cluster[] => cl.members.map((m) => ({ ...cl, members: [m] }))

/**
 * Что уходит на сайт: pending-матч между сетями не публикуется объединённым, пока не получит approved.
 * Словарь не меняется — группа хранится целиком, одобрение делается в overrides (approve).
 */
export function isolateForPublish(clusters: Cluster[]): Cluster[] {
  return clusters.flatMap((cl) => (cl.review === 'pending' && cl.members.length > 1 ? isolate(cl) : [cl]))
}
