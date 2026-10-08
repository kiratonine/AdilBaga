import http from 'k6/http';
import { check, fail } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import exec from 'k6/execution';

const base = __ENV.API;
if (!/^http:\/\/adilbaga-part13-[a-f0-9]{12}-api:8080$/.test(base)) throw Error('owned API only');
const mode = __ENV.MODE || 'mixed', rate = Number(__ENV.RATE || 1), duration = __ENV.DURATION || '30s';
if (!['mixed', 'dashboard', 'products', 'search', 'filter', 'price_desc', 'name_asc', 'category', 'direct', 'clarification'].includes(mode)
  || ![1, 5, 10, 20, 40].includes(rate) || !/^\d+s$/.test(duration)
  || Number(duration.slice(0, -1)) < 1 || Number(duration.slice(0, -1)) > 300) throw Error('bounded profile only');
const endpoints = ['categories', 'products', 'search', 'filter', 'detail', 'dashboard', 'price_desc', 'name_asc', 'category', 'voice_start', 'voice_continue'];
const latency = new Trend('latency', true), errors = new Rate('unexpected'), five = new Counter('unexpected_5xx'), requests = new Counter('measured_requests');
const thresholds = { checks: ['rate>=0.99'], unexpected: ['rate<0.01'], unexpected_5xx: ['count==0'], dropped_iterations: ['count==0'] };
for (const e of endpoints) thresholds[`latency{endpoint:${e}}`] = ['max>=0'];
export const options = { scenarios: { load: { executor: 'constant-arrival-rate', rate,
  timeUnit: mode === 'clarification' ? '2s' : '1s', duration,
  preAllocatedVUs: mode === 'direct' || mode === 'clarification' ? 2 : 10,
  maxVUs: mode === 'direct' || mode === 'clarification' ? 4 : 40 } },
  systemTags: ['status', 'method', 'scenario'], summaryTrendStats: ['min', 'med', 'p(95)', 'p(99)', 'max'], thresholds };
function json(r) { try { return r.json(); } catch { return null; } }
function discover(path) { const r = http.get(base + path, { timeout: '10s' }); if (r.status !== 200 || !json(r)) fail('discovery_failed'); return json(r); }
export function setup() {
  const categories = discover('/api/categories'), products = discover('/api/products?limit=24');
  if (!products.length) fail('products_empty');
  let filter;
  for (const c of categories) {
    const schema = discover(`/api/categories/${encodeURIComponent(c.slug)}/filters`);
    for (const f of schema.filters) {
      if (f.type !== 'multi-select') continue;
      for (const value of f.options) {
        const query = `category=${encodeURIComponent(c.slug)}&${encodeURIComponent(f.key)}=${encodeURIComponent(value)}&limit=24`;
        if (discover('/api/products?' + query).length) { filter = query; break; }
      }
      if (filter) break;
    }
    if (filter) break;
  }
  if (!filter) fail('filter_unavailable');
  const milk = discover('/api/categories/milk/filters');
  const fats = milk.filters.find(f => f.key === 'fatPercent')?.options || [];
  const volumes = milk.filters.find(f => f.key === 'volumeMl')?.options || [];
  const volume = volumes.includes(1000) ? 1000 : volumes.includes(500) ? 500 : null;
  if (!fats.length || !volume) fail('voice_discovery_failed');
  const fields = `${volume === 1000 ? '1 литр' : '500 мл'} ${fats[0]}%`;
  return { filter, category: products[0].category.slug, id: products[0].id,
    search: products[0].name.split(/\s+/)[0].toLowerCase(), fields, page: products.length === 24 };
}
function request(endpoint, path, body, expected = 200) {
  const p = { tags: { endpoint }, timeout: '10s', headers: { 'Content-Type': 'application/json' } };
  const r = body ? http.post(base + path, JSON.stringify(body), p) : http.get(base + path, p);
  const b = json(r);
  const shape = endpoint === 'detail' ? b?.id : endpoint === 'dashboard' ? b?.summary && Array.isArray(b.baskets)
    : endpoint.startsWith('voice_') ? b?.status : Array.isArray(b) && b.length > 0;
  const ok = r.status === expected && Boolean(shape);
  check(r, { 'status/json/shape': () => ok }); errors.add(!ok, { endpoint }); five.add(Number(r.status >= 500), { endpoint });
  latency.add(r.timings.duration, { endpoint }); requests.add(1, { endpoint });
  return b;
}
export default function(data) {
  if (mode === 'direct' || mode === 'clarification') {
    const text = mode === 'direct' ? `${exec.scenario.iterationInTest % 2 ? 'найди' : 'самое дешёвое'} молоко ${data.fields} perfmarkerqzv81739` : 'самое дешёвое молоко perfmarkerqzv81739';
    const b = request('voice_start', '/api/voice/start', { text, latitude: 43.63798231415926, longitude: 51.16918027182818 }, 201);
    if (mode === 'clarification') {
      check(b, { clarification: v => v?.status === 'needs_clarification' && typeof v.sessionId === 'string' });
      if (!b?.sessionId) return;
      const result = request('voice_continue', '/api/voice/continue', { sessionId: b.sessionId, text: data.fields }, 201);
      check(result, { result: v => v?.status === 'result' });
    } else check(b, { result: v => v?.status === 'result' });
    return;
  }
  const n = exec.scenario.iterationInTest % 20;
  const endpoint = mode !== 'mixed' ? mode : n < 6 ? 'products' : n < 10 ? 'search' : n < 13 ? 'filter' : n < 16 ? 'detail' : n === 16 ? 'categories' : n < 19 ? 'dashboard' : exec.scenario.iterationInTest % 40 === 19 ? 'price_desc' : 'name_asc';
  const paths = { products: '/api/products?limit=24&offset=' + (data.page && exec.scenario.iterationInTest % 10 === 0 ? 24 : 0),
    search: '/api/products?limit=24&search=' + encodeURIComponent(data.search), filter: '/api/products?' + data.filter,
    detail: '/api/products/' + encodeURIComponent(data.id), categories: '/api/categories', dashboard: '/api/dashboard',
    price_desc: '/api/products?limit=24&sort=price_desc', name_asc: '/api/products?limit=24&sort=name_asc',
    category: '/api/products?limit=24&category=' + encodeURIComponent(data.category) };
  const b = request(endpoint, paths[endpoint]);
  if (endpoint === 'detail') check(b, { 'detail identity': v => v?.id === data.id });
}
export function handleSummary(data) { return { '/out/summary.json': JSON.stringify(data) }; }
