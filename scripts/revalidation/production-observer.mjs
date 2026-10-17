// Preparation only: importing this module performs no I/O. No POST/HEAD capability.
import https from 'node:https';
import { createHash } from 'node:crypto';
import { prepareBeforeV2, buildManifest } from './c2-manifest.mjs';
import { sameSyntheticCustody } from './projection-provider.mjs';

export const LIMITS = Object.freeze({ acceptanceMs: 5000, endMs: 20000,
  timeoutMs: 4000, maxRequests: 21, bodyBytes: 2 * 1024 * 1024,
  sitemapBytes: 4 * 1024 * 1024, offsets: [0, 2500, 7500, 15000] });
const names = ['product_ru', 'product_kk', 'sitemap', 'catalog', 'dashboard', 'category'];
const safeHeaders = ['date', 'cache-control', 'etag', 'age', 'vary', 'x-nextjs-cache', 'x-vercel-cache', 'cf-cache-status', 'x-vercel-id'];
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
const fail = code => { throw new Error(code) };
const capturedEvents = new WeakSet();
const captures = new WeakMap();
const captureStarted = new WeakSet();
export const deepFreeze = value => {
  if (value && typeof value === 'object') { for (const v of Object.values(value)) deepFreeze(v); Object.freeze(value) }
  return value;
};

// Hook for an EXISTING authorized notifier invocation, not another sender.
// begin immediately before its request; accept only after its verified 204.
// The event lies within [request start, response receipt]; no clock precision is
// invented. Delayed manifests consume the SAME event window. No network here.
export function createEventSource({ now = () => performance.now(), utc = () => Date.now() } = {}) {
  let started = null, event = null, publicationId = null;
  return {
    begin(id) {
      if (started !== null) fail('event_already_started');
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) fail('unverified_publication');
      publicationId = id; started = now();
    },
    accept204(status, receipt = null) {
      if (started === null || event || status !== 204) fail('unverified_event');
      const end = now(); if (end < started) fail('clock_uncertainty');
      event = Object.freeze({ start: started, end, receivedUTC: utc(), now, publicationId,
        receipt: receipt === null ? null : deepFreeze(structuredClone(receipt)) });
      capturedEvents.add(event);
      return event;
    },
    observe(manifest, dependencies = {}) {
      return observeProduction({ event, targets: manifest?.targets, publicationId: manifest?.publicationId }, { ...dependencies, now });
    },
    capture(before, dependencies = {}) {
      return captureBefore({ event, before, publicationId }, { ...dependencies, now });
    },
  };
}

// Decode JSON, never execute scripts. Match the actual dehydrated query key/data,
// not an arbitrary ISO date elsewhere in HTML (metadata, build or another query).
export function hydratedQueries(html) {
  let flight = '';
  for (const match of html.matchAll(/<script[^>]*>self\.__next_f\.push\((.*?)\)<\/script>/gs)) {
    try { const chunk = JSON.parse(match[1]); if (chunk[0] === 1 && typeof chunk[1] === 'string') flight += chunk[1] } catch { /* non-JSON is not executable evidence */ }
  }
  const queries = [];
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.queryKey) && value.state && Object.hasOwn(value.state, 'data')) queries.push(value);
    for (const child of Object.values(value)) visit(child);
  };
  for (const line of flight.split('\n')) {
    const match = line.match(/^[0-9a-f]+:([\[{].*)$/);
    if (match) { try { visit(JSON.parse(match[1])) } catch { /* unsupported Flight record: fail closed if target missing */ } }
  }
  return queries;
}

export function marker(body, target) {
  if (target.name === 'sitemap') {
    // Eight exact locs prove only the selected matrix entries, not all sitemap.
    return sitemapPaths(target).map(path => {
      const entry = [...body.matchAll(/<url>([\s\S]*?)<\/url>/g)]
        .filter(m => m[1].includes(`<loc>https://aktau.market${path}</loc>`));
      if (entry.length !== 1) fail('missing_marker');
      const stamp = entry[0][1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
      if (!iso(stamp)) fail('missing_marker');
      return stamp;
    });
  }
  const queries = hydratedQueries(body);
  let candidates;
  if (target.name.startsWith('product_')) {
    candidates = queries.filter(q => q.queryKey.length === 2 && q.queryKey[0] === 'product' && q.queryKey[1] === target.productId)
      .map(q => q.state.data?.id === target.productId ? q.state.data.snapshotAt : undefined);
  } else if (target.name === 'category') {
    candidates = queries.filter(q => q.queryKey[0] === 'products' && q.queryKey[1]?.category === target.slug)
      .flatMap(q => q.state.data?.pages?.flat() ?? []).filter(p => p.id === target.productId).map(p => p.snapshotAt);
  } else {
    candidates = queries.filter(q => q.queryKey.length === 1 && q.queryKey[0] === 'dashboard').map(q => q.state.data?.summary?.snapshotAt);
  }
  if (!candidates?.length || candidates.some(v => !iso(v)) || new Set(candidates).size !== 1) fail('missing_marker');
  if (target.name === 'catalog') {
    const dashboard = queries.find(q => q.queryKey.length === 1 && q.queryKey[0] === 'dashboard')?.state.data;
    if (!dashboard?.priceSpreads?.slice(0, 8).some(p => p.productId === target.productId)) fail('missing_marker');
    const product = marker(body, { name: 'product_ru', productId: target.productId });
    return [candidates[0], ...product];
  }
  return [candidates[0]];
}

function sitemapPaths(target) {
  return ['catalog', 'dashboard', `collections/${target.slug}`, `products/${target.productId}`]
    .flatMap(p => [`/ru/${p}`, `/kk/${p}`]);
}
export function expected(target, phase) {
  const stamp = target[phase], product = target[`product${phase === 'before' ? 'Before' : 'After'}`];
  return target.name === 'catalog' ? [stamp, product] : target.name === 'sitemap' ? [stamp, stamp, stamp, stamp, stamp, stamp, product, product] : [stamp];
}

export function validatePlan(plan, capture = false) {
  const local = plan?.event && capturedEvents.has(plan.event);
  if (local && plan.publicationId !== plan.event.publicationId) fail('unverified_publication');
  // A typed UTC string / claimed uncertainty is not an independently verified
  // event source. No cross-process clock relay is approved in this candidate.
  if (!local) fail('unverified_event_clock');
  if (!Array.isArray(plan.targets) || plan.targets.length !== 6 || names.some(n => plan.targets.filter(t => t.name === n).length !== 1)) fail('invalid_matrix');
  for (const t of plan.targets) {
    if (!iso(t.before) || (!capture && (!iso(t.after) || t.before === t.after))) fail('invalid_revision_manifest');
    const id = t.productId;
    const idOK = typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
    const expected = t.name === 'product_ru' ? idOK && `/ru/products/${id}` : t.name === 'product_kk' ? idOK && `/kk/products/${id}`
      : t.name === 'sitemap' ? '/sitemap.xml' : t.name === 'catalog' ? '/ru/catalog' : t.name === 'dashboard' ? '/ru/dashboard'
      : idOK && typeof t.slug === 'string' && /^[a-z0-9-]{1,64}$/.test(t.slug) && `/ru/collections/${t.slug}`;
    if (!expected || t.path !== expected) fail('invalid_path');
    if (['catalog', 'sitemap'].includes(t.name) && (!idOK || !iso(t.productBefore) || (!capture && (!iso(t.productAfter) || t.productBefore === t.productAfter)))) fail('invalid_revision_manifest');
    if (t.name === 'sitemap' && (typeof t.slug !== 'string' || !/^[a-z0-9-]{1,64}$/.test(t.slug))) fail('invalid_revision_manifest');
  }
}

// Native HTTPS does not inherit HTTP_PROXY/HTTPS_PROXY, cookie jars or credentials.
// Fixed origin, fixed method, certificate verification on; redirects are responses.
export function publicGet(path, timeoutMs, maxBytes, request = https.request) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error, value) => { if (done) return; done = true; clearTimeout(timer); error ? reject(new Error(error)) : resolve(value) };
    const req = request({ hostname: 'aktau.market', port: 443, path, method: 'GET', agent: false,
      rejectUnauthorized: true, headers: { Accept: path === '/sitemap.xml' ? 'application/xml' : 'text/html', 'Accept-Encoding': 'identity', 'User-Agent': 'AktauMarket-C2-Observer/1.0' } }, res => {
      if (res.statusCode !== 200) { finish(null, { status: res.statusCode, text: '', headers: {} }); res.destroy(); return }
      if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') { finish('encoded_body'); res.destroy(); return }
      const chunks = []; let size = 0;
      res.on('data', chunk => { size += chunk.length; if (size > maxBytes) { finish('oversized_body'); res.destroy() } else chunks.push(chunk) });
      res.on('end', () => finish(null, { status: res.statusCode, text: Buffer.concat(chunks).toString('utf8'), headers: Object.fromEntries(safeHeaders.filter(h => res.headers[h] !== undefined).map(h => [h, String(res.headers[h]).slice(0, 512)])) }));
      res.on('error', () => finish('transport'));
      res.on('aborted', () => finish('transport'));
    });
    const timer = setTimeout(() => { finish('timeout'); req.destroy() }, timeoutMs);
    req.on('error', () => finish('transport')); req.end();
  });
}

// No CLI/autorun. Operator must supply an approved event + verified before/after
// manifest from the six ACTUAL representations before explicitly invoking this.
export function observeProduction(plan, dependencies = {}) { return observe(plan, dependencies, false) }
async function observe(plan, { get = publicGet, now = () => performance.now(), sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}, capture = false) {
  const inconclusive = reason => ({ acceptance: 'INCONCLUSIVE', reason, request_count: 0, results: [], events: [] });
  try { validatePlan(plan, capture) } catch (e) { return inconclusive(e.message) }
  if (capture && get === publicGet) return inconclusive('fixture_transport_required');
  const startMono = now();
  if (plan.event.now !== now) return inconclusive('unverified_event_clock');
  const startUTC = plan.event.receivedUTC + startMono - plan.event.end;
  const uncertainty = plan.event.end - plan.event.start;
  const origin = startMono - plan.event.end;
  if (origin < 0 || origin + uncertainty >= LIMITS.acceptanceMs) return inconclusive('event_window_unavailable');
  let count = 0, stopped = false;
  const elapsed = () => origin + now() - startMono;
  const events = [];
  const results = await Promise.all(plan.targets.map(async target => {
    let stale = 0, firstFresh = null, failure = null, lastStart = -Infinity;
    // Sitemap twice inside acceptance only. Catalog has three samples to keep
    // total at 4+4+2+3+4+4=21, while avoiding repeated sitemap pagination.
    const offsets = target.name === 'sitemap' ? [0, 2500] : target.name === 'catalog' ? [0, 2500, 7500] : LIMITS.offsets;
    for (const offset of offsets) {
      const pause = Math.max(offset, lastStart + 2500) - elapsed(); if (pause > 0) await sleep(pause);
      if (stopped || elapsed() + uncertainty >= LIMITS.endMs || count >= LIMITS.maxRequests) break;
      if (target.name === 'sitemap' && elapsed() + uncertainty >= LIMITS.acceptanceMs) break;
      const begin = elapsed(), requestStart = new Date(startUTC + now() - startMono).toISOString(); count++;
      lastStart = begin;
      // Requests inside acceptance cannot use diagnostic time to claim timely PASS.
      const boundary = begin + uncertainty < LIMITS.acceptanceMs ? LIMITS.acceptanceMs - uncertainty : LIMITS.endMs - uncertainty;
      const timeout = Math.max(1, Math.min(LIMITS.timeoutMs, Math.floor(boundary - begin)));
      let status = null, headers = {}, fresh = false, error = null, markers = [], bodySha256 = null;
      try {
        const response = await get(target.path, timeout, target.name === 'sitemap' ? LIMITS.sitemapBytes : LIMITS.bodyBytes);
        status = response.status;
        headers = Object.fromEntries(safeHeaders.filter(h => response.headers?.[h] !== undefined).map(h => [h, String(response.headers[h]).slice(0, 512)]));
        if (status !== 200) fail(status >= 300 && status < 400 ? 'redirect' : 'non200');
        if (Buffer.byteLength(response.text) > (target.name === 'sitemap' ? LIMITS.sitemapBytes : LIMITS.bodyBytes)) fail('oversized_body');
        const revision = marker(response.text, target);
        markers = [...revision]; bodySha256 = createHash('sha256').update(response.text).digest('hex');
        const known = capture || revision.every((v, i) => v === expected(target, 'before')[i] || v === expected(target, 'after')[i]);
        if (!known) fail('unexpected_revision');
        fresh = capture ? !revision.every((v, i) => v === expected(target, 'before')[i])
          : revision.every((v, i) => v === expected(target, 'after')[i]);
        if (!fresh) stale++;
      } catch (e) {
        const allowed = ['timeout', 'redirect', 'non200', 'oversized_body', 'missing_marker', 'unexpected_revision', 'encoded_body'];
        failure = error = allowed.includes(e.message) ? e.message : 'transport'; stopped = true;
      }
      const end = elapsed();
      if (fresh) firstFresh = end;
      events.push({ target: target.name, path: target.path, request_start_utc: requestStart, request_end_utc: new Date(startUTC + now() - startMono).toISOString(), start_elapsed_ms: begin, end_elapsed_ms: end, elapsed_uncertainty_ms: uncertainty, duration_ms: end - begin, status, headers, error,
        ...(capture ? { markers, bodySha256, class: error ? 'error' : fresh ? 'changed' : 'stale' } : { fresh }) });
      if (fresh || failure) break;
    }
    // Elapsed is measured from the latest possible accepted204 (event.end).
    // Only stale GET started strictly after that boundary+5s proves violation.
    // First fresh observed later may merely reflect a gap in polling.
    const provedLate = events.some(e => e.target === target.name && !e.error && !e.fresh && e.start_elapsed_ms > LIMITS.acceptanceMs);
    return { target: target.name, first_response: events.find(e => e.target === target.name) ?? null, first_fresh_ms: firstFresh, stale_count: stale, failure,
      acceptance: provedLate ? 'FAIL' : firstFresh !== null && firstFresh + uncertainty <= LIMITS.acceptanceMs && !failure ? 'PASS' : 'INCONCLUSIVE' };
  }));
  return { acceptance: capture ? (stopped ? 'capture_failed' : 'capture_complete') : results.some(r => r.acceptance === 'FAIL') ? 'FAIL' : results.every(r => r.acceptance === 'PASS') && !stopped ? 'PASS' : 'INCONCLUSIVE', request_count: count, clock_uncertainty_ms: uncertainty, results: capture ? [] : results, events };
}

// In-process evidence only. Cloned independently of caller inputs/HTTP objects;
// serializing and reading it back cannot mint another trusted capture.
export async function captureBefore(plan, dependencies = {}) {
  const prepared = prepareBeforeV2(plan?.before);
  if (prepared.status !== 'ready') return { acceptance: 'INCONCLUSIVE', reason: 'unqualified_before', request_count: 0 };
  if (plan?.event && capturedEvents.has(plan.event)) {
    if (captureStarted.has(plan.event)) return { acceptance: 'INCONCLUSIVE', reason: 'capture_already_started', request_count: 0 };
    captureStarted.add(plan.event);
  }
  const before = structuredClone(plan.before);
  const result = await observe({ ...plan, targets: prepared.targets }, dependencies, true);
  if (!result.acceptance.startsWith('capture_')) return result;
  const token = deepFreeze(structuredClone({ ...result, before, event: {
    start: plan.event.start, end: plan.event.end, receivedUTC: plan.event.receivedUTC, receipt: plan.event.receipt,
  } }));
  captures.set(token, { before: token.before, event: plan.event, completedAt: plan.event.now() });
  return token;
}

export function captureTiming(capture) {
  const s = captures.get(capture);
  return s ? Object.freeze({ ageMs: s.event.now() - s.event.end, completedAt: s.completedAt,
    eventEnd: s.event.end, now: s.event.now(), receipt: capture.event.receipt }) : null;
}

// Pure retrospective classification of already recorded samples; never GET.
// Caller must additionally establish provider custody (projection-provider).
export function verdictCapture(capture, before, after) {
  const inconclusive = reason => ({ acceptance: 'INCONCLUSIVE', reason, request_count: capture?.request_count ?? 0, results: [], events: [] });
  const stored = captures.get(capture);
  if (!stored || JSON.stringify(before) !== JSON.stringify(stored.before)) return inconclusive('untrusted_capture');
  if (!sameSyntheticCustody(before, after)) return inconclusive('untrusted_projection');
  if (capture.acceptance !== 'capture_complete') return inconclusive('capture_failed');
  const event = stored.event, receipt = event.receipt;
  if (!receipt || receipt.status !== 204 || receipt.attemptId !== before.attemptId || receipt.snapshotId !== after?.snapshotId
    || receipt.attemptId !== after?.attemptId) return inconclusive('event_mismatch');
  const built = buildManifest({ version: 2, attemptId: before.attemptId, before, after });
  if (built.status !== 'ready') return inconclusive(built.reason);
  const results = built.manifest.targets.map(t => {
    const samples = capture.events.filter(e => e.target === t.name);
    const fresh = samples.find(e => !e.error && JSON.stringify(e.markers) === JSON.stringify(expected(t, 'after')));
    const unexpected = samples.some(e => e.class === 'changed' && JSON.stringify(e.markers) !== JSON.stringify(expected(t, 'after')));
    const error = samples.some(e => e.error) || !samples.length || unexpected;
    const late = samples.some(e => !e.error && e.class === 'stale' && e.start_elapsed_ms > LIMITS.acceptanceMs);
    return { target: t.name, first_response: samples[0] ?? null, first_fresh_ms: fresh?.end_elapsed_ms ?? null,
      stale_count: samples.filter(e => e.class === 'stale').length,
      acceptance: error ? 'INCONCLUSIVE' : late ? 'FAIL' : fresh && fresh.end_elapsed_ms + fresh.elapsed_uncertainty_ms <= LIMITS.acceptanceMs ? 'PASS' : 'INCONCLUSIVE' };
  });
  return deepFreeze({ acceptance: results.every(r => r.acceptance === 'PASS') ? 'PASS' : results.some(r => r.acceptance === 'FAIL') ? 'FAIL' : 'INCONCLUSIVE',
    request_count: capture.request_count, results, events: capture.events, event: capture.event,
    clock_uncertainty_ms: capture.clock_uncertainty_ms, before: before.provenance, after: after.provenance });
}
