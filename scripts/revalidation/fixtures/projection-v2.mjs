// Synthetic protocol fixture, never a PostgreSQL/production attestation.
import { createHash } from 'node:crypto';
export const fixtureAttempt = 'a'.repeat(32);
export const fixtureS0 = '11111111-1111-1111-1111-111111111111';
export const fixtureS1 = '22222222-2222-2222-2222-222222222222';
export function projectionPair(attemptId = fixtureAttempt) {
  const state = (after) => {
    const body = { dashboardAt: `2026-10-${after ? '17' : '16'}T12:00:00.123Z`, topEight: ['p-b', 'p-a'], witnessId: 'p-a',
      candidates: (after ? ['p-a'] : ['p-b', 'p-a']).map(id => ({ id, slug: 'milk', snapshotAt: `2026-10-${after ? '17' : '16'}T11:00:00.123Z`,
        topEightIndex: id === 'p-a' ? 1 : 0, categoryIndex: id === 'p-a' ? 1 : 0, sitemapIndex: id === 'p-a' ? 1 : 0 })),
      categoryPages: [{ slug: 'milk', productIds: ['p-b', 'p-a'] }], sitemap: { categorySlugs: ['milk'], productCount: 2, truncated: false } };
    return { version: 2, phase: after ? 'after-commit' : 'before-canonical-mutation', attemptId,
      snapshotId: after ? fixtureS1 : fixtureS0, previousSnapshotId: after ? fixtureS0 : null,
      provenance: { kind: 'sealed-repository-projection', evidenceId: `${attemptId}-${after ? 'after' : 'before'}`,
        canonicalStateId: createHash('sha256').update(JSON.stringify(body)).digest('hex'), sourceSha: 'b'.repeat(40), frontendSha: 'c'.repeat(40),
        semantics: 'go-next-c2-v2', snapshotStatus: 'published', consistentRead: true }, body };
  };
  return { version: 2, attemptId, before: state(false), after: state(true) };
}
