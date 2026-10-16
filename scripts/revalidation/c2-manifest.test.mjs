import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest } from './c2-manifest.mjs';
import { createEventSource, validatePlan, marker } from './production-observer.mjs';
import { fixtureBody } from './fixtures/c2-manifest.mjs';

// Synthetic two-state projections, never a source for public measurement.
function input() {
  const attemptId = 'a'.repeat(32), beforeSnapshotId = '11111111-1111-1111-1111-111111111111', afterSnapshotId = '22222222-2222-2222-2222-222222222222';
  const state = (phase, snapshotId, day) => ({ snapshotId, attemptId,
    provenance: { kind: 'fixture', evidenceId: `evidence-${day}`, phase, canonicalStateId: `state-${day}`,
      sourceSha: 'b'.repeat(40), frontendSha: 'c'.repeat(40), semantics: 'go-next-c2-v1', snapshotStatus: 'published', consistentRead: true, exclusiveWindow: true },
    dashboardAt: `2026-10-${day}T12:00:00.123Z`, topEight: ['p-b', 'p-a'],
    products: ['p-b', 'p-a'].map(id => ({ id, slug: 'milk', snapshotAt: `2026-10-${day}T11:00:00.123Z` })),
    categoryPages: [{ slug: 'milk', productIds: ['p-b', 'p-a'] }], sitemap: { categorySlugs: ['milk'], productIds: ['p-b', 'p-a'] } });
  return { version: 1, attemptId, beforeSnapshotId, afterSnapshotId,
    before: state('before-canonical-mutation', beforeSnapshotId, '15'), after: state('after-commit', afterSnapshotId, '16') };
}
const inconclusive = data => { const r = buildManifest(data); assert.equal(r.status, 'inconclusive'); assert.equal(r.manifest, undefined); return r };
for (const [label, select] of [
  ['projection', x => x.after], ['provenance', x => x.after.provenance], ['product', x => x.after.products[0]],
]) {
  for (const extra of ['hidden', Symbol('extra')]) test(`${label}: unknown ${String(extra)} property rejected`, () => {
    const data = input(); Object.defineProperty(select(data), extra, { value: true, enumerable: false });
    inconclusive(data);
  });
  test(`${label}: own accessor rejected without invoking it`, () => {
    const data = input(), object = select(data), key = Object.keys(object)[0]; let reads = 0;
    Object.defineProperty(object, key, { get() { reads++; return 'untrusted' }, enumerable: true });
    inconclusive(data); assert.equal(reads, 0);
  });
}
for (const [label, select] of [
  ['topEight', x => x.after.topEight], ['products', x => x.after.products], ['categoryPages', x => x.after.categoryPages],
  ['category productIds', x => x.after.categoryPages[0].productIds], ['sitemap categorySlugs', x => x.after.sitemap.categorySlugs],
  ['sitemap productIds', x => x.after.sitemap.productIds],
]) {
  for (const extra of ['hidden', Symbol('extra')]) test(`${label}: extra ${String(extra)} array property rejected`, () => {
    const data = input(); Object.defineProperty(select(data), extra, { value: true, enumerable: false });
    inconclusive(data);
  });
  test(`${label}: inherited element is not an own element`, () => {
    const data = input(), array = select(data), parent = Object.create(Array.prototype);
    Object.defineProperty(parent, '0', { value: array[0], enumerable: true });
    delete array[0]; Object.setPrototypeOf(array, parent); inconclusive(data);
  });
  test(`${label}: non-enumerable index rejected`, () => {
    const data = input(); Object.defineProperty(select(data), '0', { enumerable: false }); inconclusive(data);
  });
  test(`${label}: accessor index rejected without invoking it`, () => {
    const data = input(); let reads = 0;
    Object.defineProperty(select(data), '0', { get() { reads++; return 'untrusted' }, enumerable: true });
    inconclusive(data); assert.equal(reads, 0);
  });
}
test('ordinary plain objects and JSON arrays retain exactly the same output', () => {
  const data = input(); assert.deepEqual(buildManifest(JSON.parse(JSON.stringify(data))), buildManifest(data));
  assert.equal(buildManifest(data).status, 'ready');
});
test('two projections: six targets, independent product/dashboard markers, eight exact sitemap locs', () => {
  const data = input(), untouched = structuredClone(data), result = buildManifest(data);
  assert.equal(result.status, 'ready'); assert.equal(result.manifest.fixtureOnly, true);
  assert.equal(result.manifest.snapshotId, data.afterSnapshotId); assert.equal(result.manifest.attemptId, data.attemptId);
  assert.deepEqual(result.manifest.targets.map(t => [t.name, t.path]), [
    ['product_ru', '/ru/products/p-a'], ['product_kk', '/kk/products/p-a'], ['sitemap', '/sitemap.xml'],
    ['catalog', '/ru/catalog'], ['dashboard', '/ru/dashboard'], ['category', '/ru/collections/milk']]);
  let clock = 0; const now = () => clock, source = createEventSource({ now });
  source.begin(data.attemptId); clock = 1; const event = source.accept204(204);
  assert.doesNotThrow(() => validatePlan({ event, publicationId: data.attemptId, targets: result.manifest.targets }));
  for (const t of result.manifest.targets) {
    for (const fresh of [false, true]) {
      const stamp = fresh ? t.after : t.before, product = fresh ? t.productAfter : t.productBefore;
      assert.deepEqual(marker(fixtureBody(t, fresh), t), t.name === 'sitemap' ? [...Array(6).fill(stamp), product, product]
        : t.name === 'catalog' ? [stamp, product] : [stamp]);
    }
  }
  assert.notEqual(result.manifest.targets[2].after, result.manifest.targets[0].after);
  assert.deepEqual(data, untouched); // builder never edits caller projections
  data.after.products[1].snapshotAt = data.before.products[1].snapshotAt;
  assert.equal(result.manifest.targets[0].after, untouched.after.products[1].snapshotAt);
  assert.throws(() => { result.manifest.targets[0].after = 'corrupt' }, TypeError);
});
test('price/rank/tie reordering is not recomputed with JS locale; stable selection by ASCII ID', () => {
  const data = input(); data.after.topEight.reverse(); data.after.categoryPages[0].productIds.reverse();
  assert.equal(buildManifest(data).manifest.targets[0].productId, 'p-a');
});
for (const [label, mutate] of [
  ['absent before', x => { delete x.before }],
  ['retroactive before canonical view', x => { x.before.provenance.phase = 'after-commit' }],
  ['missing custody evidence', x => { delete x.before.provenance.evidenceId }],
  ['same evidence reused', x => { x.after.provenance.evidenceId = x.before.provenance.evidenceId }],
  ['same mutable state reused', x => { x.after.provenance.canonicalStateId = x.before.provenance.canonicalStateId }],
  ['cached frontend as oracle', x => { x.after.provenance.kind = 'frontend-cache' }],
  ['unknown source semantics', x => { x.after.provenance.semantics = 'unknown' }],
  ['nonpublished after', x => { x.after.provenance.snapshotStatus = 'validating' }],
  ['unqualified read', x => { x.after.provenance.consistentRead = false }],
  ['concurrent publication', x => { x.after.provenance.exclusiveWindow = false }],
  ['deployment transition', x => { x.after.provenance.frontendSha = 'd'.repeat(40) }],
  ['source transition', x => { x.after.provenance.sourceSha = 'd'.repeat(40) }],
  ['wrong snapshot', x => { x.after.snapshotId = x.beforeSnapshotId }],
  ['same snapshot', x => { x.afterSnapshotId = x.beforeSnapshotId }],
  ['wrong attempt', x => { x.after.attemptId = 'd'.repeat(32) }],
  ['invalid attempt', x => { x.attemptId += '\n' }],
  ['no dashboard delta', x => { x.after.dashboardAt = x.before.dashboardAt }],
  ['reversed dashboard', x => { x.after.dashboardAt = '2026-10-14T12:00:00.123Z' }],
  ['no product delta/reused captures', x => { x.after.products.forEach(p => { p.snapshotAt = x.before.products[0].snapshotAt }) }],
  ['all products moved category', x => { x.after.products.forEach(p => { p.slug = 'bread' }) }],
  ['all dropped category first page', x => { x.after.categoryPages[0].productIds = [] }],
  ['no sitemap product membership', x => { x.after.sitemap.productIds = [] }],
  ['no sitemap category membership', x => { x.before.sitemap.categorySlugs = [] }],
  ['rank outside top8', x => { x.after.topEight = []; x.after.products = [] }],
  ['duplicate candidate', x => { x.after.products[1] = structuredClone(x.after.products[0]) }],
  ['unknown candidate', x => { x.after.topEight[0] = 'unknown' }],
  ['duplicate rank', x => { x.after.topEight[1] = x.after.topEight[0] }],
  ['duplicate page', x => { x.after.categoryPages.push(structuredClone(x.after.categoryPages[0])) }],
  ['duplicate sitemap entry', x => { x.after.sitemap.productIds.push('p-a') }],
  ['unapproved key/captures', x => { x.after.captures = {} }],
  ['null projection', x => { x.before = null }],
  ['sparse membership', x => { delete x.after.sitemap.productIds[0] }],
  ['product newer than dashboard usable maximum', x => { x.after.products[0].snapshotAt = '2026-10-16T13:00:00.123Z' }],
]) test(label + ' => INCONCLUSIVE, no manifest/GET authority', () => { const data = input(); mutate(data); inconclusive(data) });
for (const timestamp of ['2026-10-16T11:00:00Z', '2026-10-16T11:00:00.123456Z', '2026-02-30T11:00:00.123Z', '2026-10-16T13:00:00.123+02:00', '2026-10-16T11:00:00.123Z\n']) {
  test('exact public timestamp rejects ' + JSON.stringify(timestamp), () => {
    const data = input(); data.after.products[0].snapshotAt = timestamp; inconclusive(data);
  });
}
test('sitemap cap cannot be inferred from catalog/category visibility', () => {
  const data = input(); data.after.sitemap.productIds = Array.from({ length: 5000 }, (_, i) => `other-${i}`);
  inconclusive(data); data.after.sitemap.productIds.push('p-a'); inconclusive(data);
});
test('select next qualified witness without inventing missing membership', () => {
  const data = input(); data.after.sitemap.productIds = ['p-b'];
  assert.equal(buildManifest(data).manifest.targets[0].productId, 'p-b');
});
test('no input, corrupt accessor or oversized collections => bounded sanitized inconclusive', () => {
  inconclusive(undefined);
  const data = input(); Object.defineProperty(data.before, 'dashboardAt', { get() { throw Error('untrusted source payload') } });
  assert.equal(JSON.stringify(inconclusive(data)).includes('untrusted'), false);
  const oversized = input(); oversized.after.categoryPages[0].productIds = Array(25).fill('p-a'); inconclusive(oversized);
});
test('invalid projections, absent event and expired original window admit zero measurement GET', async () => {
  let calls = 0, clock = 0; const now = () => clock;
  const get = async () => { calls++; throw Error('must not call transport') };
  const source = createEventSource({ now });
  const data = input(); source.begin(data.attemptId); clock = 1; source.accept204(204);
  for (const invalid of [undefined, { ...data, before: null }, { ...data, afterSnapshotId: data.beforeSnapshotId }]) {
    const result = buildManifest(invalid);
    const observation = await source.observe({ publicationId: data.attemptId, targets: result.manifest?.targets }, { get });
    assert.equal(observation.acceptance, 'INCONCLUSIVE'); assert.equal(observation.request_count, 0);
  }
  const manifest = buildManifest(data).manifest;
  const unarmed = createEventSource({ now });
  assert.equal((await unarmed.observe({ publicationId: data.attemptId, targets: manifest.targets }, { get })).request_count, 0);
  clock = 5001;
  assert.equal((await source.observe({ publicationId: data.attemptId, targets: manifest.targets }, { get })).request_count, 0);
  assert.equal(calls, 0);
});
