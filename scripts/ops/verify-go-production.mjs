// Operator-only, one-shot verifier. No ambient proxy, cookies, credentials or discovery.
import https from 'node:https';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const origin = 'https://api.aktau.market';
const targets = Object.freeze([
  ['live', '/health/live', 65536], ['ready', '/health/ready', 65536],
  ['categories', '/api/categories', 1048576], ['products', '/api/products?limit=1', 1048576],
  ['dashboard', '/api/dashboard', 1048576],
].map(Object.freeze));
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const strings = (v, keys) => object(v) && keys.every(k => typeof v[k] === 'string');
const finite = v => typeof v === 'number' && Number.isFinite(v);
const stamp = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v) && Number.isFinite(Date.parse(v));
const category = v => strings(v, ['slug', 'name']);
const nullable = v => v === null || typeof v === 'string';
const store = v => strings(v, ['storeCode', 'storeName']) && ['DINA', 'DANA', 'FIX_PRICE'].includes(v.storeCode);
function product(v) {
  return strings(v, ['id', 'name']) && nullable(v.brand) && nullable(v.imageUrl) && category(v.category)
    && object(v.attributes) && Object.values(v.attributes).every(x => x === null || ['string', 'boolean'].includes(typeof x) || finite(x))
    && finite(v.minPrice) && v.minPrice > 0 && stamp(v.snapshotAt) && Array.isArray(v.offers) && v.offers.length > 0
    && v.offers.every(o => store(o) && finite(o.price) && o.price > 0 && (o.oldPrice === null || finite(o.oldPrice)));
}
function schema(id, v) {
  if (id === 'live' || id === 'ready') return object(v) && v.status === (id === 'live' ? 'ok' : 'ready');
  if (id === 'categories') return Array.isArray(v) && v.every(x => strings(x, ['id', 'slug', 'name']));
  if (id === 'products') return Array.isArray(v) && v.length <= 1 && v.every(product);
  return object(v) && object(v.summary) && ['canonicalProducts', 'stores', 'matchedAcrossStores'].every(k => Number.isInteger(v.summary[k]))
    && stamp(v.summary.snapshotAt) && Array.isArray(v.priceSpreads) && v.priceSpreads.every(x => strings(x, ['productId', 'name']) && ['minPrice', 'maxPrice', 'differencePercent'].every(k => finite(x[k])))
    && Array.isArray(v.locations) && v.locations.every(x => store(x) && strings(x, ['name', 'address']) && finite(x.latitude) && finite(x.longitude))
    && Array.isArray(v.baskets) && v.baskets.every(x => store(x) && finite(x.total) && Array.isArray(x.items)
      && x.items.every(i => strings(i, ['categorySlug', 'categoryName']) && nullable(i.productId) && nullable(i.name) && (i.price === null || finite(i.price))));
}
class Stop extends Error { constructor(reason) { super(reason); this.reason = reason; } }

// Absolute timer covers connect, headers and the complete bounded body, not idle time.
function request(url, { milliseconds, cap }) {
  return new Promise((resolve, reject) => {
    let settled = false, req, res, timer;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) { res?.destroy(); req?.destroy(); reject(error); } else resolve(value);
    };
    timer = setTimeout(() => finish(new Stop('timeout')), milliseconds);
    req = https.get(url, { agent: false, headers: { Accept: 'application/json', 'User-Agent': 'AktauMarket-Operator-Verifier/1.0' } }, response => {
      res = response;
      const status = res.statusCode;
      // No redirect following and no error/challenge body collection.
      if (status !== 200) { res.destroy(); finish(null, { status, type: '', text: '' }); return; }
      const type = res.headers['content-type'] ?? '';
      if (!/^application\/json(?:\s*;|$)/i.test(type)) { res.destroy(); finish(null, { status, type, text: '' }); return; }
      const length = res.headers['content-length'];
      if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > cap)) { finish(new Stop('body_limit')); return; }
      let size = 0; const chunks = [];
      res.on('data', chunk => { size += chunk.length; if (size > cap) finish(new Stop('body_limit')); else chunks.push(chunk); });
      res.on('aborted', () => finish(new Stop('partial_body')));
      res.on('error', () => finish(new Stop('transport')));
      res.on('end', () => {
        if (!res.complete || (length !== undefined && size !== Number(length))) { finish(new Stop('partial_body')); return; }
        try { finish(null, { status, type, text: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)) }); }
        catch { finish(new Stop('invalid_json')); }
      });
    });
    req.on('error', () => finish(new Stop('transport')));
  });
}

// Injection is for offline tests only. CLI never accepts URLs, headers or transport overrides.
export function createVerifier({ get = request, now = () => performance.now(), utc = () => new Date().toISOString() } = {}) {
  let used = false;
  return async function verify() {
    if (used) return { outcome: 'BLOCKED', reason: 'already_used', requests: 0, records: [] };
    used = true; const end = now() + 50000, records = [];
    for (const [endpoint, path, cap] of targets) {
      const start = now(), remaining = end - start;
      if (remaining <= 0) return { outcome: 'BLOCKED', reason: 'global_deadline', requests: records.length, records };
      const row = { observedAtUTC: utc(), endpoint, statusClass: 'none', latencyMs: 0, schemaClass: 'not_checked', outcome: 'BLOCKED', reason: 'transport' };
      try {
        const value = await get(origin + path, { milliseconds: Math.min(8000, remaining), cap });
        row.latencyMs = Math.max(0, Math.round(now() - start));
        if (now() >= end) throw new Stop('global_deadline');
        if (now() - start >= Math.min(8000, remaining)) throw new Stop('timeout');
        if (!Number.isInteger(value.status) || value.status < 100 || value.status > 599) throw new Stop('transport');
        row.statusClass = `${Math.floor(value.status / 100)}xx`;
        if (value.status !== 200) throw new Stop(value.status === 403 ? 'access_blocked' : value.status >= 300 && value.status < 400 ? 'redirect' : 'http_status');
        if (!/^application\/json(?:\s*;|$)/i.test(value.type)) throw new Stop('content_type');
        if (typeof value.text !== 'string' || Buffer.byteLength(value.text) > cap) throw new Stop('body_limit');
        let data; try { data = JSON.parse(value.text); } catch { throw new Stop('invalid_json'); }
        if (!schema(endpoint, data)) { row.schemaClass = 'invalid'; row.outcome = 'FAIL'; throw new Stop('schema'); }
        row.schemaClass = 'valid'; row.outcome = 'PASS'; row.reason = 'none';
        // Only the unambiguous dashboard summary publication timestamp is exposed.
        if (endpoint === 'dashboard') row.snapshotAt = data.summary.snapshotAt;
      } catch (error) {
        row.latencyMs = Math.max(0, Math.round(now() - start));
        row.reason = error instanceof Stop ? error.reason : 'transport';
        if (['invalid_json', 'content_type'].includes(row.reason)) { row.outcome = 'FAIL'; row.schemaClass = 'invalid'; }
      }
      records.push(row);
      if (row.outcome !== 'PASS') return { outcome: row.outcome, reason: row.reason, requests: records.length, records };
    }
    return { outcome: 'PASS', reason: 'none', requests: records.length, records };
  };
}

export async function main(args, write = line => process.stdout.write(line + '\n')) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--offline')) {
    write(JSON.stringify({ outcome: 'OFFLINE', requests: 0, endpoints: targets.map(t => t[0]), usage: '--live performs at most five fixed sequential GETs' })); return 0;
  }
  if (args.length !== 1 || args[0] !== '--live') { write(JSON.stringify({ outcome: 'BLOCKED', reason: 'arguments', requests: 0 })); return 2; }
  const result = await createVerifier()(); write(JSON.stringify(result)); return result.outcome === 'PASS' ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
