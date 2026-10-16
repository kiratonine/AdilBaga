// LOCAL ONLY: mutable synthetic HTTP API + a real Next production server.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { observeConvergence } from './cache-observer.mjs';
import { marker, createEventSource } from './production-observer.mjs';
const root = resolve(import.meta.dirname, '../..');
const frontend = join(root, 'frontend');
const fixture = name => JSON.parse(readFileSync(join(frontend, `src/mocks/${name}.json`)));
const products = fixture('products'), categories = fixture('categories'), filters = fixture('filters'), dashboard = fixture('dashboard');
// Each LOCAL run gets fresh fetch keys and ISR IDs, without deleting Next cache.
const namespace = '/part16-' + randomUUID();
const ids = new Map(products.map(p => [p.id, p.id + namespace.slice(1)]));
for (const product of products) product.id = ids.get(product.id);
for (const spread of dashboard.priceSpreads) spread.productId = ids.get(spread.productId);
const secret = 'part16-synthetic-test-secret-00000000';
const stamp = '2026-10-08T00:00:00.000Z';
let revision = 0;
let detailCalls = 0;
const api = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:18090');
  if (url.pathname.startsWith(namespace + '/')) url.pathname = url.pathname.slice(namespace.length);
  let result;
  if (url.pathname === '/api/categories') result = categories;
  else if (url.pathname === '/api/dashboard') {
    result = structuredClone(dashboard);
    if (revision) result.summary.snapshotAt = stamp;
  } else if (/^\/api\/categories\/[^/]+\/filters$/.test(url.pathname)) result = filters[url.pathname.split('/')[3]];
  else if (url.pathname.startsWith('/api/products')) {
    if (url.pathname !== '/api/products') detailCalls++;
    const all = structuredClone(products);
    if (revision) for (const product of all) { product.name = 'PART16_FRESH_' + product.name; product.snapshotAt = stamp }
    result = url.pathname === '/api/products' ? all.slice(Number(url.searchParams.get('offset') ?? 0), Number(url.searchParams.get('offset') ?? 0) + Number(url.searchParams.get('limit') ?? 24))
      : all.find(p => p.id === url.pathname.split('/')[3]);
  }
  response.setHeader('Content-Type', 'application/json');
  response.statusCode = result ? 200 : 404;
  response.end(JSON.stringify(result ?? {}));
});
await new Promise((resolve, reject) => { api.once('error', reject); api.listen(18090, '127.0.0.1', resolve) });
const env = Object.fromEntries(['PATH','HOME','TMPDIR'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
Object.assign(env, { NODE_ENV: 'production', NEXT_PUBLIC_API_MODE: 'http', NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:18090', API_BASE_URL: 'http://127.0.0.1:18090' + namespace, NEXT_PUBLIC_SITE_URL: 'http://localhost:3100', REVALIDATE_HMAC_SECRET: secret });
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3150'], { cwd: frontend, env, stdio: 'ignore' });
async function get(path, timeoutMs = 10000) {
  const response = await fetch('http://127.0.0.1:3150' + path, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) }); assert.equal(response.status, 200);
  const text = await response.text();
  const headers = Object.fromEntries(['cache-control','etag','age','vary','x-nextjs-cache','x-vercel-cache','cf-cache-status']
    .map(name => [name,response.headers.get(name)]));
  return { text, cacheStatus: response.headers.get('x-nextjs-cache'), headers };
}
async function notify() {
  const eventSource = createEventSource();
  const body = '{"event":"snapshot_published"}';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = 'v1=' + createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex');
  eventSource.begin(namespace.slice(1));
  const response = await fetch('http://127.0.0.1:3150/internal/revalidate', { method: 'POST', body, redirect: 'error',
    headers: { 'X-Adilbaga-Timestamp': timestamp, 'X-Adilbaga-Signature': signature }, signal: AbortSignal.timeout(5000) });
  const acceptedAt = performance.now();
  assert.equal(response.status,204); assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(await response.text(),'');
  eventSource.accept204(response.status);
  return { acceptedAt, eventSource };
}
// One shared deadline starts at signed204, not a fresh budget per path or poll.
async function converge(target, acceptedAt) {
  const observation = await observeConvergence({ target, acceptedAt, get, detailCalls: () => detailCalls });
  console.log(JSON.stringify(observation));
  return observation.eventual_freshness === 'PASS';
}
try {
  const deadline = Date.now() + 30000;
  while (true) {
    try { await get('/robots.txt'); break } catch { if (Date.now() > deadline || next.exitCode !== null) throw new Error('local_next_not_ready'); await new Promise(r => setTimeout(r, 200)) }
  }
  const productFresh = text => text.includes('PART16_FRESH_');
  const snapshotFresh = text => text.includes(stamp);
  const sitemapFresh = text => {
    const snapshots = [...text.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(match => match[1]);
    return snapshots.length > 0 && snapshots.every(snapshot => snapshot === stamp);
  };
  const targets = [
    { name: 'product_ru', path: '/ru/products/' + products[0].id, isFresh: productFresh },
    { name: 'product_kk', path: '/kk/products/' + products[0].id, isFresh: productFresh },
    { name: 'sitemap', path: '/sitemap.xml', isFresh: sitemapFresh },
    { name: 'catalog', path: '/ru/catalog', isFresh: productFresh },
    { name: 'dashboard', path: '/ru/dashboard', isFresh: snapshotFresh },
    { name: 'category', path: '/ru/collections/milk', isFresh: productFresh },
  ];
  // Validate the production observer's structural oracle on actual Next output,
  // not just synthetic hand-written Flight records. The sitemap's local site URL
  // differs deliberately from the fixed production origin.
  const beforeMarkers = new Map();
  for (const target of targets) {
    const localPredicate = target.isFresh;
    target.isFresh = text => {
      const representation = target.name === 'sitemap' ? text.replaceAll('http://localhost:3100', 'https://aktau.market') : text;
      const revision = marker(representation, { ...target, productId: products[0].id, slug: 'milk' });
      return localPredicate(text) && revision.every(value => value === stamp);
    };
  }
  for (const target of targets) {
    const baseline = await get(target.path);
    assert.ok(!target.isFresh(baseline.text), 'baseline must lack revised data');
    const representation = target.name === 'sitemap' ? baseline.text.replaceAll('http://localhost:3100', 'https://aktau.market') : baseline.text;
    beforeMarkers.set(target.name, marker(representation, { ...target, productId: products[0].id, slug: 'milk' }));
  }
  revision = 1;
  for (const target of targets) {
    const warm = await get(target.path);
    assert.ok(!target.isFresh(warm.text), 'warm stale precondition required');
    console.log(JSON.stringify({ target: target.name, phase: 'warm_precondition',
      cache_status: warm.cacheStatus, fresh: false, detail_api_fetch_count: detailCalls }));
  }
  const endpoint = 'http://127.0.0.1:3150/internal/revalidate';
  const unsupported = await fetch(endpoint, { redirect: 'error', signal: AbortSignal.timeout(5000) });
  assert.equal(unsupported.status,405); assert.equal(await unsupported.text(),'');
  // Automatic GET405 is explicitly exempt from the POST no-store requirement.
  const denied = await fetch(endpoint, { method: 'POST', body: '{}', redirect: 'error', signal: AbortSignal.timeout(5000) });
  assert.equal(denied.status,401); assert.equal(denied.headers.get('cache-control'),'no-store'); assert.equal(await denied.text(),'');
  const { acceptedAt, eventSource } = await notify();
  const outcomes = await Promise.all(targets.map(target => converge(target, acceptedAt)));
  assert.ok(outcomes.every(Boolean), 'all required paths must converge within shared5000ms deadline');
  const manifest = { publicationId: namespace.slice(1), targets: targets.map(t => ({ name: t.name, path: t.path,
    productId: products[0].id, slug: 'milk', before: beforeMarkers.get(t.name)[0], after: stamp,
    productBefore: beforeMarkers.get(t.name).at(-1), productAfter: stamp })) };
  const operator = await eventSource.observe(manifest, { get: async (path, timeout) => {
    const response = await get(path, timeout);
    return { ...response, status: 200, text: path === '/sitemap.xml' ? response.text.replaceAll('http://localhost:3100', 'https://aktau.market') : response.text };
  } });
  assert.equal(operator.acceptance, 'PASS', 'same-event operator hook must pass all six real representations');
  console.log(JSON.stringify({ phase: 'local_operator_integration', acceptance: operator.acceptance, request_count: operator.request_count,
    event_interval_ms: operator.clock_uncertainty_ms, paths: operator.results.map(r => ({ target: r.target, acceptance: r.acceptance, elapsed_ms: r.first_fresh_ms })) }));
  // HEAD is an observational probe AFTER GET convergence, never a freshness oracle.
  const head = await fetch('http://127.0.0.1:3150' + targets[0].path, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(5000) });
  assert.equal(head.status,200); assert.equal(await head.text(),'');
  console.log(JSON.stringify({ target:'product_ru', phase:'post_get_head_observation', etag:head.headers.get('etag'),
    cache_status:head.headers.get('x-nextjs-cache'), cache_control:head.headers.get('cache-control'), body_freshness:'NOT_PROVABLE_FROM_HEAD' }));
  console.log('Part16 LOCAL HTTP cache smoke PASS: GET405/auth401/signed204/productRU+KK/sitemap/catalog/dashboard/category within5000ms; synthetic only, not first-response guarantee');
} finally {
  next.kill('SIGTERM');
  await new Promise(resolve => { if (next.exitCode !== null || next.signalCode !== null) resolve(); else { const timer = setTimeout(() => { next.kill('SIGKILL'); resolve() }, 5000); next.once('exit', () => { clearTimeout(timer); resolve() }) } });
  api.closeAllConnections();
  await new Promise(resolve => api.close(resolve));
}
