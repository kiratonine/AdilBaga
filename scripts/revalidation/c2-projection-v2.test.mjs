import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest, prepareBeforeV2 } from './c2-manifest.mjs';
import { projectionPair } from './fixtures/projection-v2.mjs';
import { fixtureBody } from './fixtures/c2-manifest.mjs';
import { createEventSource, captureBefore, verdictCapture, LIMITS } from './production-observer.mjs';
import { createSyntheticProjectionProvider } from './projection-provider.mjs';

const invalid = p => { const r = buildManifest(p); assert.equal(r.status, 'inconclusive'); assert.equal(r.manifest, undefined); return r };
test('P1 BEFORE duplicate non-null sitemap positions -> INCONCLUSIVE', () => {
  const p = projectionPair();
  p.before.body.candidates.find(c => c.id === 'p-b').sitemapIndex = 1;
  invalid(p);
});
test('P1 BEFORE non-witness Top8 candidate with null index -> INCONCLUSIVE', () => {
  const p = projectionPair();
  p.before.body.candidates.find(c => c.id === 'p-b').topEightIndex = null;
  invalid(p);
});
test('v2 JSON compatible, compact exact six paths and distinct product/dashboard timestamps', () => {
  const pair = projectionPair(), original = structuredClone(pair), built = buildManifest(pair);
  assert.equal(built.status, 'ready'); assert.equal(built.manifest.fixtureOnly, true);
  assert.equal(built.manifest.targets.length, 6);
  assert.equal(built.manifest.targets[0].productId, 'p-a');
  assert.notEqual(built.manifest.targets[0].before, built.manifest.targets[4].before);
  assert.deepEqual(built, buildManifest(JSON.parse(JSON.stringify(pair)))); assert.deepEqual(pair, original);
});
for (const [label, mutate] of [
  ['wrong version', p => { p.before.version = 1 }],
  ['wrong attempt', p => { p.after.attemptId = 'd'.repeat(32) }],
  ['wrong snapshot chain', p => { p.after.previousSnapshotId = p.after.snapshotId }],
  ['intervening snapshot', p => { p.after.previousSnapshotId = '33333333-3333-3333-3333-333333333333' }],
  ['same snapshot', p => { p.after.snapshotId = p.before.snapshotId }],
  ['source SHA', p => { p.after.provenance.sourceSha = 'd'.repeat(40) }],
  ['frontend SHA', p => { p.after.provenance.frontendSha = 'd'.repeat(40) }],
  ['canonical hash', p => { p.after.provenance.canonicalStateId = p.before.provenance.canonicalStateId }],
  ['evidence identity', p => { p.after.provenance.evidenceId = p.before.provenance.evidenceId }],
  ['provenance extra field', p => { p.after.provenance.exclusiveWindow = true }],
  ['unsealed', p => { p.after.provenance.kind = 'fixture' }],
  ['wrong BEFORE witness', p => { p.before.body.witnessId = 'p-b' }],
  ['different AFTER witness', p => { p.after.body.witnessId = 'p-b' }],
  ['missing witness', p => { p.before.body.witnessId = null }],
  ['AFTER different candidate', p => { p.after.body.candidates[0].id = 'p-b' }],
  ['category moved', p => { p.after.body.candidates[0].slug = 'bread' }],
  ['lost top8', p => { p.after.body.candidates[0].topEightIndex = null }],
  ['lost category', p => { p.after.body.candidates[0].categoryIndex = null }],
  ['lost sitemap', p => { p.after.body.candidates[0].sitemapIndex = null }],
  ['sitemap outside count', p => { p.after.body.sitemap.productCount = 1 }],
  ['sitemap category missing', p => { p.after.body.sitemap.categorySlugs = [] }],
  ['wrong position', p => { p.after.body.candidates[0].categoryIndex = 0 }],
  ['timestamp precision', p => { p.after.body.candidates[0].snapshotAt = '2026-10-17T11:00:00Z' }],
  ['timestamp malformed', p => { p.after.body.candidates[0].snapshotAt = '2026-02-30T11:00:00.123Z' }],
  ['unchanged product', p => { p.after.body.candidates[0].snapshotAt = p.before.body.candidates[0].snapshotAt }],
  ['unchanged dashboard', p => { p.after.body.dashboardAt = p.before.body.dashboardAt }],
  ['candidate duplicated', p => { p.after.body.candidates.push(p.after.body.candidates[0]) }],
  ['nonenumerable', p => { Object.defineProperty(p.after.body.candidates[0], 'hidden', { value: true }) }],
  ['symbol', p => { p.after.body[Symbol('unknown')] = true }],
  ['array symbol', p => { p.after.body.topEight[Symbol('unknown')] = true }],
  ['inherited array item', p => { delete p.after.body.topEight[0] }],
]) test(`v2 ${label} -> INCONCLUSIVE`, () => { const p = projectionPair(); mutate(p); invalid(p) });
test('BEFORE choice cannot switch to eligible AFTER alternative', () => {
  const p = projectionPair(); p.after.body.candidates[0].sitemapIndex = null;
  assert.equal(prepareBeforeV2(p.before).witness.id, 'p-a'); invalid(p);
});

// Deterministic virtual monotonic clock shared by all six target schedules.
function clock() {
  let time = 0, queued = false; const timers = [];
  const sleep = ms => new Promise(resolve => {
    timers.push({ at: time + ms, resolve });
    if (!queued) { queued = true; setImmediate(function pump() {
      queued = false; time = Math.min(...timers.map(t => t.at));
      for (const t of [...timers]) if (t.at <= time) { timers.splice(timers.indexOf(t), 1); t.resolve() }
      if (timers.length) { queued = true; setImmediate(pump) }
    }) }
  });
  return { now: () => time, set: v => { time = v }, sleep };
}
async function capture({ provider = createSyntheticProjectionProvider(), response, interval = 0 } = {}) {
  const p = projectionPair(), before = await provider.before(p.attemptId);
  assert.ok(before);
  const c = clock(), source = createEventSource({ now: c.now, utc: () => Date.parse('2026-10-17T00:00:00.000Z') });
  source.begin(p.attemptId); c.set(interval);
  const receipt = { version: 1, snapshotId: p.after.snapshotId, attemptId: p.attemptId, status: 204,
    startMono: '1000000', endMono: '2000000', bootId: 'synthetic', errorClass: 'none' };
  source.accept204(204, receipt);
  const manifest = buildManifest(p).manifest;
  let calls = 0; const paths = new Map();
  const captured = await source.capture(before, { sleep: c.sleep, get: async (path, timeout, bytes) => {
    calls++; paths.set(path, (paths.get(path) ?? 0) + 1);
    assert.ok(timeout <= LIMITS.timeoutMs && bytes <= LIMITS.sitemapBytes);
    const t = manifest.targets.find(t => t.path === path);
    return response ? response(t, c.now() - interval) : { status: 200, text: fixtureBody(t), headers: { date: 'safe', 'set-cookie': 'private' } };
  } });
  return { p, before, captured, c, calls, paths, provider, receipt };
}
test('BEFORE S0 -> HTTP capture -> trusted synthetic AFTER S1 -> PASS, no second GET window', async () => {
  const r = await capture(); assert.equal(r.captured.acceptance, 'capture_complete');
  assert.equal(r.calls, 6); assert.ok(Object.isFrozen(r.captured.events[0].markers));
  assert.ok(r.captured.events.every(e => e.bodySha256.length === 64 && e.class === 'changed' && e.fresh === undefined));
  assert.ok(!JSON.stringify(r.captured).includes('private'));
  r.receipt.snapshotId = 'tampered'; assert.equal(r.captured.event.receipt.snapshotId, r.p.after.snapshotId);
  assert.throws(() => { r.captured.events[0].markers[0] = 'mutated' }, TypeError);
  assert.throws(() => { r.captured.events[0].headers.date = 'mutated' }, TypeError);
  const verdict = await r.provider.after(r.captured, r.before);
  assert.equal(verdict.acceptance, 'PASS'); assert.equal(r.calls, 6);
  assert.equal(verdict.events, r.captured.events);
});
test('serialized/cloned capture cannot import trusted evidence', async () => {
  const r = await capture();
  for (const fake of [structuredClone(r.captured), JSON.parse(JSON.stringify(r.captured))]) {
    assert.equal((await r.provider.after(fake, r.before)).acceptance, 'INCONCLUSIVE');
    assert.equal(verdictCapture(fake, r.before, r.p.after).reason, 'untrusted_capture');
  }
});
test('changed body != qualified AFTER is INCONCLUSIVE', async () => {
  const r = await capture({ response: t => ({ status: 200, headers: {}, text: fixtureBody({ ...t, after: '2026-10-18T12:00:00.123Z', productAfter: '2026-10-18T11:00:00.123Z' }) }) });
  assert.equal((await r.provider.after(r.captured, r.before)).acceptance, 'INCONCLUSIVE');
});
test('stale after SLA -> FAIL only after qualified AFTER; 21 GET and 2 sitemap maximum', async () => {
  const r = await capture({ response: t => ({ status: 200, headers: {}, text: fixtureBody(t, false) }) });
  assert.equal(r.calls, 21); assert.equal(r.paths.get('/sitemap.xml'), 2);
  assert.equal((await r.provider.after(r.captured, r.before)).acceptance, 'FAIL');
  r.p.after.body.candidates[0].snapshotAt = r.p.before.body.candidates[0].snapshotAt;
  assert.equal(verdictCapture(r.captured, r.before, r.p.after).acceptance, 'INCONCLUSIVE');
});
for (const [label, mutate] of [
  ['witness', p => { p.body.witnessId = 'p-b' }],
  ['snapshot', p => { p.snapshotId = '33333333-3333-3333-3333-333333333333' }],
  ['SHA', p => { p.provenance.sourceSha = 'd'.repeat(40) }],
  ['attempt', p => { p.attemptId = 'd'.repeat(32) }],
]) test(`retrospective wrong ${label} is INCONCLUSIVE`, async () => {
  const r = await capture(); mutate(r.p.after);
  assert.equal(verdictCapture(r.captured, r.before, r.p.after).acceptance, 'INCONCLUSIVE');
});
test('AFTER beyond event.end+60s -> after_late, original clock not reset', async () => {
  const r = await capture(); r.c.set(60001);
  assert.equal((await r.provider.after(r.captured, r.before)).reason, 'after_late');
});
for (const [label, response] of [
  ['timeout', () => { throw Error('timeout') }], ['non200', () => ({ status: 503, text: '', headers: {} })],
  ['redirect', () => ({ status: 302, text: '', headers: {} })], ['missing marker', () => ({ status: 200, text: 'no marker', headers: {} })],
  ['oversized', () => ({ status: 200, text: 'x'.repeat(LIMITS.sitemapBytes + 1), headers: {} })],
]) test(`capture ${label} cannot PASS/FAIL`, async () => {
  const r = await capture({ response }); assert.equal(r.captured.acceptance, 'capture_failed');
  assert.equal((await r.provider.after(r.captured, r.before)).acceptance, 'INCONCLUSIVE');
  assert.ok(r.calls <= 6);
});
test('fixtureOnly without synthetic transport and untrusted event admit 0 GET', async () => {
  const p = projectionPair(), now = () => 0, source = createEventSource({ now });
  source.begin(p.attemptId); source.accept204(204);
  assert.equal((await source.capture(p.before)).request_count, 0);
  let calls = 0;
  const r = await captureBefore({ before: p.before, event: { now }, publicationId: p.attemptId }, { now, get: () => { calls++ } });
  assert.equal(r.request_count, 0); assert.equal(calls, 0);
});
test('uncertainty consumes original5s acceptance (not an independent clock)', async () => {
  const r = await capture({ interval: 2000, response: (t, time) => ({ status: 200, headers: {}, text: fixtureBody(t, t.name === 'sitemap' || time > 3000) }) });
  assert.equal(r.captured.clock_uncertainty_ms, 2000);
  assert.equal((await r.provider.after(r.captured, r.before)).acceptance, 'INCONCLUSIVE');
});
for (const scenario of ['invalid_json', 'oversized', 'timeout']) test(`fixed execFile synthetic provider ${scenario} -> no trusted projection`, async () => {
  assert.equal(await createSyntheticProjectionProvider({ scenario }).before('a'.repeat(32)), null);
});
for (const scenario of ['invalid_json', 'oversized', 'timeout']) test(`AFTER fixed execFile ${scenario} -> INCONCLUSIVE without additional GET`, async () => {
  const r = await capture({ provider: createSyntheticProjectionProvider({ scenario, failurePhase: 'after' }) });
  const verdict = await r.provider.after(r.captured, r.before);
  assert.equal(verdict.acceptance, 'INCONCLUSIVE'); assert.equal(verdict.reason, 'after_unavailable'); assert.equal(r.calls, 6);
});
for (const [scenario, reason] of [
  ['unchanged', 'unchanged_marker'], ['wrong_previous', 'snapshot_chain'], ['wrong_witness', 'unqualified_after'],
  ['wrong_sha', 'after_unavailable'], ['wrong_attempt', 'after_unavailable'], ['wrong_snapshot', 'event_mismatch'],
  ['unqualified', 'unqualified_after'], ['bad_hash', 'after_unavailable'],
]) test(`trusted AFTER ${scenario} cannot qualify even late stale samples`, async () => {
  const r = await capture({ provider: createSyntheticProjectionProvider({ scenario, failurePhase: 'after' }),
    response: t => ({ status: 200, headers: {}, text: fixtureBody(t, false) }) });
  const verdict = await r.provider.after(r.captured, r.before);
  assert.equal(verdict.acceptance, 'INCONCLUSIVE'); assert.equal(verdict.reason, reason); assert.equal(r.calls, 21);
});
test('AFTER cannot be requested twice for the same capture', async () => {
  const r = await capture(); assert.equal((await r.provider.after(r.captured, r.before)).acceptance, 'PASS');
  assert.equal((await r.provider.after(r.captured, r.before)).reason, 'after_already_requested'); assert.equal(r.calls, 6);
});
test('same event cannot restart capture or request another HTTP window', async () => {
  const p = projectionPair(), now = () => 0, source = createEventSource({ now });
  source.begin(p.attemptId); source.accept204(204);
  let calls = 0;
  const get = async path => { calls++; const t = buildManifest(p).manifest.targets.find(t => t.path === path);
    return { status: 200, headers: {}, text: fixtureBody(t) } };
  await source.capture(p.before, { get });
  assert.equal((await source.capture(p.before, { get })).reason, 'capture_already_started'); assert.equal(calls, 6);
});
