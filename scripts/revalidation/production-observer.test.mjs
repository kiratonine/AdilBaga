import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { marker, observeProduction, validatePlan, publicGet, createEventSource, LIMITS } from './production-observer.mjs';
import { isTrustedProductionEvent } from './fifo-adapter.mjs';
import { isProductionProvider, admitsProductionCapture } from './projection-provider.mjs';

test('public production toggles and imported FIFO receipt cannot mint authority', () => {
  const provider = { fixtureOnly: false, production: true }, before = {};
  const event = { status: 204, errorClass: 'none', provider, before };
  assert.equal(isProductionProvider(provider), false);
  assert.equal(admitsProductionCapture(provider, before), false);
  assert.equal(isTrustedProductionEvent(event, provider, before), false);
  assert.equal(isTrustedProductionEvent(structuredClone(event), provider, before), false);
});

const before = '2026-10-14T00:00:00.000Z', after = '2026-10-15T00:00:00.000Z';
const acceptedUTC = '2026-10-16T00:00:00.000Z';
function capture(configuration, now, beforeAccept = () => {}) {
  const source = createEventSource({ now, utc: () => Date.parse(acceptedUTC) });
  source.begin('mock-publication');
  beforeAccept();
  return { ...configuration, publicationId: 'mock-publication', event: source.accept204(204) };
}
const plan = () => ({ trusted204: true, acceptedUTC, clockEvidence: 'synthetic co-located clock only', clockUncertaintyMs: 0, targets: [
  { name: 'product_ru', path: '/ru/products/p1', productId: 'p1' },
  { name: 'product_kk', path: '/kk/products/p1', productId: 'p1' },
  { name: 'sitemap', path: '/sitemap.xml', productId: 'p1', slug: 'milk' }, { name: 'catalog', path: '/ru/catalog', productId: 'p1' },
  { name: 'dashboard', path: '/ru/dashboard' },
  { name: 'category', path: '/ru/collections/milk', slug: 'milk', productId: 'p1' },
].map(t => ({ ...t, before, after, productBefore: before, productAfter: after })) });
function body(target, stamp, productStamp = stamp) {
  if (target.name === 'sitemap') return '<urlset>' + ['catalog', 'dashboard', 'collections/milk', 'products/p1'].flatMap(p => ['ru', 'kk'].map(lang => `<url><loc>https://aktau.market/${lang}/${p}</loc><lastmod>${p.startsWith('products') ? productStamp : stamp}</lastmod></url>`)).join('') + '</urlset>';
  const queryKey = target.name.startsWith('product_') ? ['product', 'p1'] : target.name === 'category' ? ['products', { category: 'milk', sort: 'price_asc' }] : ['dashboard'];
  const data = target.name.startsWith('product_') ? { id: 'p1', snapshotAt: stamp } : target.name === 'category' ? { pages: [[{ id: 'p1', snapshotAt: stamp }]] } : { summary: { snapshotAt: stamp }, priceSpreads: [{ productId: 'p1' }] };
  const queries = [{ queryKey, state: { data } }];
  if (target.name === 'catalog') queries.push({ queryKey: ['product', 'p1'], state: { data: { id: 'p1', snapshotAt: productStamp } } });
  const flight = `a:${JSON.stringify({ state: { queries } })}\n`;
  return `<p>Unrelated future ISO: 2099-01-01T00:00:00.000Z</p><script>self.__next_f.push(${JSON.stringify([1, flight])})</script>`;
}
async function run(response, configuration = plan(), eventIntervalMs = 0) {
  let clock = 0, calls = 0;
  const timers = []; let queued = false;
  const sleep = ms => new Promise(resolve => {
    timers.push({ at: clock + ms, resolve });
    if (!queued) { queued = true; setImmediate(function pump() {
      queued = false; clock = Math.min(...timers.map(t => t.at));
      const ready = timers.filter(t => t.at <= clock);
      for (const t of ready) { timers.splice(timers.indexOf(t), 1); t.resolve() }
      if (timers.length) { queued = true; setImmediate(pump) }
    }) }
  });
  const byPath = new Map(configuration.targets.map(t => [t.path, t]));
  const now = () => clock;
  const result = await observeProduction(configuration.trusted204 ? capture(configuration, now, () => { clock = eventIntervalMs }) : configuration, { now,
    sleep, get: async (path, timeout, cap) => {
      calls++; assert.ok(timeout <= 4000 && cap <= LIMITS.sitemapBytes);
      return response(byPath.get(path), clock, calls);
    } });
  return { result, calls };
}
const ok = (target, stamp = after) => ({ status: 200, text: body(target, stamp), headers: { etag: 'changed', 'set-cookie': 'must-not-leak' } });

test('six actual query/loc marker kinds: unrelated ISO dates never act as revision', () => {
  for (const t of plan().targets) assert.ok(marker(body(t, before), t).every(v => v === before));
});
test('full six-path first response PASS, safe headers only', async () => {
  const { result, calls } = await run(t => ok(t));
  assert.equal(result.acceptance, 'PASS'); assert.equal(calls, 6);
  assert.ok(result.events.every(e => e.request_start_utc && e.request_end_utc && e.duration_ms === 0));
  assert.ok(!JSON.stringify(result).includes('must-not-leak'));
});
test('stale0/2500, actual change3000, first fresh observed7500 is INCONCLUSIVE', async () => {
  const { result, calls } = await run((t, time) => ok(t, t.name === 'sitemap' || time >= 3000 ? after : before));
  assert.equal(result.acceptance, 'INCONCLUSIVE');
  const product = result.results.find(r => r.target === 'product_ru');
  assert.equal(product.first_fresh_ms, 7500); assert.equal(product.stale_count, 2);
  assert.equal(product.acceptance, 'INCONCLUSIVE');
  assert.deepEqual(result.events.filter(e => e.target === 'product_ru').map(e => [e.start_elapsed_ms, e.fresh]), [[0, false], [2500, false], [7500, true]]);
  assert.ok(result.results.some(r => r.stale_count > 0)); assert.ok(calls <= 21);
});
test('stale GET definitely after latest accepted204+5s proves FAIL with event interval', async () => {
  const { result } = await run(t => ok(t, t.name === 'product_ru' ? before : after), plan(), 2000);
  assert.equal(result.clock_uncertainty_ms, 2000);
  const product = result.results.find(r => r.target === 'product_ru');
  assert.equal(product.acceptance, 'FAIL'); assert.equal(result.acceptance, 'FAIL');
  const late = result.events.find(e => e.target === 'product_ru' && e.start_elapsed_ms === 7500);
  assert.equal(late.fresh, false); assert.equal(late.error, null);
  // Absolute start9500 is beyond latest event2000+5000, not merely earliest0+5000.
  assert.ok(late.start_elapsed_ms + 2000 > 7000);
});
test('stale start beyond earliest+5s but within latest+5s is not proven FAIL', async () => {
  let clock = 0, calls = 0;
  const now = () => clock;
  const p = capture(plan(), now, () => { clock = 2000 });
  clock = 4500;
  const byPath = new Map(p.targets.map(t => [t.path, t]));
  const r = await observeProduction(p, { now, get: async path => {
    calls++; clock = 5100;
    if (calls > 2) throw Error('timeout');
    return ok(byPath.get(path), before);
  } });
  assert.equal(r.acceptance, 'INCONCLUSIVE');
  const ambiguous = r.events.find(e => e.start_elapsed_ms === 3100 && !e.error);
  assert.ok(ambiguous); assert.ok(ambiguous.start_elapsed_ms + r.clock_uncertainty_ms > 5000);
  assert.ok(ambiguous.start_elapsed_ms < 5000);
});
test('persistent stale is bounded, sitemap fetched twice and total cap21', async () => {
  let sitemap = 0;
  const { result, calls } = await run(t => { if (t.name === 'sitemap') sitemap++; return ok(t, before) });
  assert.equal(result.acceptance, 'FAIL'); assert.equal(sitemap, 2); assert.equal(calls, 21);
  assert.equal(result.results.find(r => r.target === 'sitemap').acceptance, 'INCONCLUSIVE');
});
for (const [name, response, expected] of [
  ['timeout', () => { throw Error('timeout') }, 'timeout'],
  ['redirect', () => ({ status: 302, text: '', headers: {} }), 'redirect'],
  ['oversized body', () => ({ status: 200, text: 'x'.repeat(LIMITS.bodyBytes + 1), headers: {} }), 'oversized_body'],
  ['missing marker', () => ({ status: 200, text: '<p>2026-10-15T00:00:00.000Z</p>', headers: {} }), 'missing_marker'],
  ['non200', () => ({ status: 503, text: '', headers: {} }), 'non200'],
  ['raw transport error', () => { throw Error('private-secret-provider-body') }, 'transport'],
]) test(`${name}: fail closed, no retry or raw logging`, async () => {
  const { result, calls } = await run(response);
  assert.equal(result.acceptance, 'INCONCLUSIVE'); assert.ok(calls <= 6);
  assert.ok(result.results.some(r => r.failure === expected));
  assert.ok(!JSON.stringify(result).includes('private-secret'));
});
test('clock uncertainty/future/expired event is INCONCLUSIVE before HTTP', async () => {
  const p = plan(); delete p.clockEvidence;
  assert.throws(() => validatePlan(p), /unverified_event_clock/);
  for (const offset of [-1, 5000]) {
    const result = await observeProduction(plan(), { now: () => 0, utc: () => Date.parse(acceptedUTC) + offset, get: () => assert.fail('no HTTP') });
    assert.equal(result.acceptance, 'INCONCLUSIVE'); assert.equal(result.request_count, 0);
  }
});
test('manifest requires distinct known revisions and exact fixed paths', () => {
  const p = capture(plan(), () => 0); p.targets[0].after = before; assert.throws(() => validatePlan(p), /invalid_revision/);
  const q = capture(plan(), () => 0); q.targets[0].path += '?cache-bust=1'; assert.throws(() => validatePlan(q), /invalid_path/);
});

test('sitemap first stale then fresh inside common5s window', async () => {
  let n = 0;
  const { result } = await run(t => t.name === 'sitemap' ? ok(t, ++n === 1 ? before : after) : ok(t));
  const sitemap = result.results.find(r => r.target === 'sitemap');
  assert.equal(result.acceptance, 'PASS'); assert.equal(n, 2);
  assert.equal(sitemap.stale_count, 1); assert.equal(sitemap.first_fresh_ms, 2500);
});
test('fresh dashboard with stale catalog product is not fresh catalog', async () => {
  const { result } = await run(t => t.name === 'catalog' ? { ...ok(t), text: body(t, after, before) } : ok(t));
  assert.equal(result.results.find(r => r.target === 'catalog').acceptance, 'FAIL');
  assert.equal(result.results.find(r => r.target === 'dashboard').acceptance, 'PASS');
});
test('unchanged selected product revision cannot be used as a witness', async () => {
  const p = plan(); p.targets.find(t => t.name === 'catalog').productAfter = before;
  const { result, calls } = await run(() => assert.fail('no HTTP'), p);
  assert.equal(result.acceptance, 'INCONCLUSIVE'); assert.equal(calls, 0);
});
test('no trusted accepted204 => no GET and INCONCLUSIVE', async () => {
  const p = plan(); p.trusted204 = false;
  const { result, calls } = await run(() => assert.fail('no HTTP'), p);
  assert.equal(result.acceptance, 'INCONCLUSIVE'); assert.equal(calls, 0);
});
test('UTC string and claimed zero clock uncertainty alone are not verified event evidence', async () => {
  const r = await observeProduction(plan(), { get: () => assert.fail('no unverified HTTP') });
  assert.equal(r.acceptance, 'INCONCLUSIVE'); assert.equal(r.reason, 'unverified_event_clock');
  assert.equal(r.request_count, 0);
});
test('uncertainty near deadline must not turn marginal fresh response into PASS', async () => {
  const p = plan(); p.clockUncertaintyMs = 50;
  const result = await observeProduction(p, { now: () => 0, utc: () => Date.parse(acceptedUTC) + 4970,
    get: () => assert.fail('uncertain expired window must not request') });
  assert.equal(result.acceptance, 'INCONCLUSIVE');
});
test('fresh in uncertain5s band is INCONCLUSIVE, not PASS or false FAIL', async () => {
  let clock = 0;
  const now = () => clock;
  const source = createEventSource({ now, utc: () => Date.parse(acceptedUTC) });
  source.begin('mock-publication'); clock = 200;
  const p = { ...plan(), publicationId: 'mock-publication', event: source.accept204(204) };
  clock = 4000;
  const r = await observeProduction(p, { now,
    get: async path => { clock = 5050; return ok(p.targets.find(t => t.path === path)) } });
  assert.equal(r.acceptance, 'INCONCLUSIVE');
  assert.ok(r.results.every(t => t.acceptance === 'INCONCLUSIVE'));
});
test('sitemap requires product lastmods too; missing or stale product is not fresh', async () => {
  const { result } = await run(t => t.name === 'sitemap' ? { ...ok(t), text: body(t, after, before) } : ok(t));
  const r = result.results.find(r => r.target === 'sitemap');
  assert.equal(r.acceptance, 'INCONCLUSIVE'); assert.equal(r.stale_count, 2);
});
test('operator hook captures actual notification interval without external clock accuracy claims', async () => {
  let clock = 100, calls = 0;
  const now = () => clock;
  const source = createEventSource({ now, utc: () => Date.parse(acceptedUTC) });
  assert.equal((await source.observe({ targets: plan().targets, publicationId: 'test-publication' }, { get: () => assert.fail('unarmed') })).acceptance, 'INCONCLUSIVE');
  source.begin('test-publication'); clock = 120; source.accept204(204);
  clock = 200; // metadata arrived later; event clock must NOT reset.
  const targets = plan().targets;
  const r = await source.observe({ targets, publicationId: 'test-publication' }, { get: async path => { calls++; return ok(targets.find(t => t.path === path)) } });
  assert.equal(r.acceptance, 'PASS'); assert.equal(r.clock_uncertainty_ms, 20); assert.equal(calls, 6);
  assert.ok(r.events.every(e => e.end_elapsed_ms === 80));
  clock = 5200;
  const expired = await source.observe({ targets, publicationId: 'test-publication' }, { get: () => assert.fail('no reset of window') });
  assert.equal(expired.acceptance, 'INCONCLUSIVE'); assert.equal(expired.request_count, 0);
});
test('operator hook requires real204 and missing after-manifest remains INCONCLUSIVE', async () => {
  const source = createEventSource({ now: () => 0, utc: () => Date.parse(acceptedUTC) });
  source.begin('test-publication'); assert.throws(() => source.accept204(503), /unverified_event/);
  source.accept204(204);
  const p = plan().targets; delete p[0].after;
  const r = await source.observe({ targets: p, publicationId: 'test-publication' }, { get: () => assert.fail('missing revision') });
  assert.equal(r.acceptance, 'INCONCLUSIVE'); assert.equal(r.request_count, 0);
  const mismatch = await source.observe({ targets: plan().targets, publicationId: 'unrelated-publication' }, { get: () => assert.fail('wrong event') });
  assert.equal(mismatch.acceptance, 'INCONCLUSIVE'); assert.equal(mismatch.reason, 'unverified_publication');
});

test('actual transport fixed GET/TLS, bounded streaming, no credentials/proxy/cookie or redirect follow', async () => {
  let calls = 0;
  function transport(status, chunks, headers = {}) {
    return (options, callback) => {
      calls++; assert.equal(options.method, 'GET'); assert.equal(options.hostname, 'aktau.market');
      assert.equal(options.rejectUnauthorized, true); assert.equal(options.agent, false);
      assert.equal(options.headers.Authorization, undefined); assert.equal(options.headers.Cookie, undefined);
      const req = new EventEmitter(); req.destroy = () => {};
      req.end = () => queueMicrotask(() => {
        const res = new EventEmitter(); let destroyed = false;
        res.statusCode = status; res.headers = headers; res.destroy = () => { destroyed = true };
        callback(res);
        for (const c of chunks) { if (!destroyed) res.emit('data', Buffer.from(c)) }
        if (!destroyed) res.emit('end');
      }); return req;
    };
  }
  await assert.rejects(publicGet('/ru/catalog', 100, 4, transport(200, ['abc', 'de'])), /oversized_body/);
  assert.equal((await publicGet('/ru/catalog', 100, 4, transport(302, [], { location: 'https://untrusted.invalid' }))).status, 302);
  assert.equal(calls, 2);
  const r = await publicGet('/ru/catalog', 100, 4, transport(200, ['ok'], { 'set-cookie': 'secret', etag: 'safe', date: 'Fri, 16 Oct 2026 00:00:00 GMT' }));
  assert.deepEqual(r.headers, { etag: 'safe', date: 'Fri, 16 Oct 2026 00:00:00 GMT' });
  const hanging = () => { const req = new EventEmitter(); req.end = () => {}; req.destroy = () => {}; return req };
  await assert.rejects(publicGet('/ru/catalog', 5, 4, hanging), /timeout/);
});
