import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

const root = new URL('../', import.meta.url);
const spec = parse(readFileSync(new URL('openapi.yaml', root), 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'urn:aktau-market:contract', components: spec.components });
const validators = new Map();
function validate(schema, value) {
  const key = JSON.stringify(schema);
  if (!validators.has(key)) validators.set(key, ajv.compile(schema));
  const validator = validators.get(key);
  // Schema paths only: never print request/response bodies or session payloads.
  assert.ok(validator(value), ajv.errorsText(validator.errors));
}
const ref = (name) => ({ $ref: `urn:aktau-market:contract#/components/schemas/${name}` });
const examples = {
  categories: 'Categories', filters: 'FilterSchema', products: 'Products',
  product: 'ProductCard', dashboard: 'Dashboard',
  'voice-start-result': 'VoiceResponse', 'voice-clarification': 'VoiceResponse',
};
function example(name) {
  return JSON.parse(readFileSync(new URL(`examples/${name}.json`, root), 'utf8'));
}

test('OpenAPI scope, pagination and required baskets are frozen', () => {
  assert.match(spec.openapi, /^3\.1\./);
  assert.equal(spec.info.version, '1.0.0');
  assert.deepEqual(Object.keys(spec.paths).sort(), [
    '/api/categories', '/api/categories/{slug}/filters', '/api/dashboard',
    '/api/products', '/api/products/{id}', '/api/voice/continue', '/api/voice/start',
  ]);
  const parameters = spec.paths['/api/products'].get.parameters;
  assert.deepEqual(parameters.find((p) => p.name === 'limit').schema,
    { type: 'integer', minimum: 1, maximum: 100, default: 24 });
  const offset = parameters.find((p) => p.name === 'offset').schema;
  assert.deepEqual(offset,
    { type: 'integer', minimum: 0, maximum: 9007199254740991, default: 0 });
  validate(offset, Number.MAX_SAFE_INTEGER);
  assert.throws(() => validate(offset, 9007199254740992));
  assert.ok(spec.components.schemas.Dashboard.required.includes('baskets'));
  assert.ok(spec.paths['/api/products'].get['x-dynamic-filters']);
  assert.equal(Object.values(spec.paths).reduce((count, path) => count + Object.keys(path).length, 0), 7);
  for (const path of ['/api/voice/start', '/api/voice/continue']) {
    assert.equal(spec.paths[path].post.responses['201'].content['application/json'].schema.$ref,
      '#/components/schemas/VoiceResponse');
  }
});

for (const [name, schema] of Object.entries(examples)) {
  test(`stable fixture example: ${name}`, () => validate(ref(schema), example(name)));
}
test('multi-select requires nonempty options; boolean does not require options', () => {
  const filter = example('filters').filters[0];
  validate(ref('FilterDefinition'), filter);
  const { options, ...missingOptions } = filter;
  assert.throws(() => validate(ref('FilterDefinition'), missingOptions));
  assert.throws(() => validate(ref('FilterDefinition'), { ...filter, options: [] }));
  validate(ref('FilterDefinition'), { key: 'lactoseFree', label: 'Без лактозы', type: 'boolean' });
});
test('schema rejects missing baskets, invalid stores and oversized voice results', () => {
  const dashboard = example('dashboard');
  delete dashboard.baskets;
  assert.throws(() => validate(ref('Dashboard'), dashboard));
  const product = example('product');
  product.offers[0].storeCode = 'UNKNOWN';
  assert.throws(() => validate(ref('ProductCard'), product));
  const result = example('voice-start-result');
  result.items = Array(2).fill(result.items[0]);
  assert.throws(() => validate(ref('VoiceResponse'), result));
  result.mode = 'list';
  result.items = Array(4).fill(result.items[0]);
  assert.throws(() => validate(ref('VoiceResponse'), result));
});
test('coordinate strings, opaque sessions and compatible error envelopes', () => {
  validate(ref('VoiceStartRequest'), { text: 'молоко', latitude: '43.6', longitude: '51.1' });
  validate(ref('VoiceContinueRequest'), { sessionId: 'opaque-session', text: 'литр' });
  for (const statusCode of [400, 404, 429, 500, 503]) {
    validate(ref('ApiError'), { statusCode, message: 'Compatible error', error: 'Error' });
    validate(ref('ApiError'), { statusCode, message: ['Validation error'] });
  }
});
test('clients tolerate unknown additive response properties', () => {
  validate(ref('ProductCard'), { ...example('product'), futureAdditive: 'ignored' });
});

const base = process.env.CONTRACT_API_BASE_URL;
const profile = process.env.CONTRACT_PROFILE ?? 'live';
if (process.env.CONTRACT_PROFILE && !base) throw new Error('CONTRACT_API_BASE_URL is required for HTTP profiles');
if (!['fixture', 'live'].includes(profile)) throw new Error('Unknown contract profile');
if (base) {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use a credential-free HTTP origin as CONTRACT_API_BASE_URL');
  }
}
const httpTest = (name, fn) => test(`${profile} HTTP: ${name}`, { skip: !base }, fn);
async function request(path, status = 200, options = {}) {
  if (profile === 'live' && options.method && options.method !== 'GET') {
    throw new Error('Live contract profile is GET-only');
  }
  const response = await fetch(`${base.replace(/\/+$/, '')}${path}`, {
    ...options, signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, status, `${options.method ?? 'GET'} ${path.split('?')[0]} status`);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  const body = await response.json();
  if (status >= 400) {
    validate(ref('ApiError'), body);
    assert.equal(body.statusCode, status);
    for (const key of ['stack', 'token', 'password', 'requestId', 'code']) assert.equal(Object.hasOwn(body, key), false);
  }
  return body;
}
const getProducts = async (query = '') => {
  const body = await request(`/api/products${query ? `?${query}` : ''}`);
  validate(ref('Products'), body);
  for (const product of body) {
    assert.equal(product.minPrice, Math.min(...product.offers.map((o) => o.price)));
    assert.ok(product.minPrice > 0);
    for (let i = 1; i < product.offers.length; i++) assert.ok(product.offers[i - 1].price <= product.offers[i].price);
  }
  return body;
};
const sorted = (products, sort = 'price_asc') => {
  for (let i = 1; i < products.length; i++) {
    const a = products[i - 1], b = products[i];
    const delta = sort === 'name_asc' ? a.name.localeCompare(b.name, 'ru')
      : (a.minPrice - b.minPrice) * (sort === 'price_desc' ? -1 : 1);
    assert.ok(delta < 0 || (delta === 0 && a.id.localeCompare(b.id) <= 0), 'stable sort');
  }
};
let categories, dashboard, firstPage;
before(async () => {
  if (!base) return;
  categories = await request('/api/categories');
  dashboard = await request('/api/dashboard');
  firstPage = await getProducts();
});

httpTest('categories and every discovered filter schema', async () => {
  validate(ref('Categories'), categories);
  assert.deepEqual(categories.map((c) => c.slug), categories.map((c) => c.slug).sort());
  assert.ok(categories.length > 0);
  for (const category of categories) {
    const schema = await request(`/api/categories/${encodeURIComponent(category.slug)}/filters`);
    validate(ref('FilterSchema'), schema);
    assert.equal(schema.category, category.slug);
  }
  if (profile === 'fixture') {
    assert.deepEqual(categories, example('categories'));
    assert.deepEqual(await request('/api/categories/milk/filters'), example('filters'));
  }
});
httpTest('default page, limit=100, offset and all sorts', async () => {
  assert.ok(firstPage.length <= 24);
  sorted(firstPage);
  const hundred = await getProducts('limit=100');
  assert.ok(hundred.length <= 100);
  assert.deepEqual(firstPage, hundred.slice(0, 24));
  assert.deepEqual(await getProducts('limit=24&offset=1'), hundred.slice(1, 25));
  for (const sort of ['price_asc', 'price_desc', 'name_asc']) sorted(await getProducts(`sort=${sort}&limit=100`), sort);
  if (profile === 'fixture') assert.deepEqual(firstPage, example('products'));
});
httpTest('detail, search, category and opaque not-found IDs', async () => {
  assert.ok(firstPage.length > 0);
  const product = firstPage[0];
  const detail = await request(`/api/products/${encodeURIComponent(product.id)}`);
  validate(ref('ProductCard'), detail);
  assert.deepEqual(detail, product);
  const term = product.name.split(/\s+/)[0];
  const search = await getProducts(`search=${encodeURIComponent(` ${term.toLocaleUpperCase('ru')} `)}&limit=100`);
  assert.ok(search.some((p) => p.id === product.id));
  assert.ok(search.every((p) => p.name.toLocaleLowerCase('ru').includes(term.toLocaleLowerCase('ru'))));
  assert.ok((await getProducts(`category=${encodeURIComponent(product.category.slug)}`)).every((p) => p.category.slug === product.category.slug));
  assert.deepEqual(await getProducts('category=unknown-category-contract'), []);
  await request('/api/products/opaque-unknown-product-contract', 404);
  await request('/api/categories/unknown-category-contract/filters', 404);
  if (profile === 'fixture') assert.deepEqual(await request(`/api/products/${example('product').id}`), example('product'));
});
httpTest('discovered dynamic filters: repeated OR, cross-key AND, brand outside attributes', async () => {
  let exercised = 0;
  for (const category of categories) {
    const schema = await request(`/api/categories/${encodeURIComponent(category.slug)}/filters`);
    const available = schema.filters.filter((f) => f.options?.length);
    const categoryProducts = await getProducts(new URLSearchParams({ category: category.slug, limit: '100' }).toString());
    for (const definition of available) {
      const known = categoryProducts.find((p) => definition.options.includes(definition.key === 'brand' ? p.brand : p.attributes[definition.key]));
      const value = known && (definition.key === 'brand' ? known.brand : known.attributes[definition.key]);
      const values = known ? [value, ...definition.options.filter((v) => v !== value).slice(0, 1)] : definition.options.slice(0, 2);
      const query = new URLSearchParams({ category: category.slug, limit: '100' });
      for (const value of values) query.append(definition.key, String(value));
      const products = await getProducts(query.toString());
      if (known) assert.ok(products.some((p) => p.id === known.id), 'known matching product is not silently dropped');
      for (const product of products) assert.ok(values.includes(definition.key === 'brand' ? product.brand : product.attributes[definition.key]));
      const second = available.find((f) => f.key !== definition.key);
      if (second) {
        query.append(second.key, String(second.options[0]));
        for (const product of await getProducts(query.toString())) {
          assert.ok(values.includes(definition.key === 'brand' ? product.brand : product.attributes[definition.key]));
          assert.equal(second.key === 'brand' ? product.brand : product.attributes[second.key], second.options[0]);
        }
      }
      const invalid = new URLSearchParams({ category: category.slug, [definition.key]: '__invalid_contract_option__' });
      await request(`/api/products?${invalid}`, 400);
      exercised++;
    }
  }
  assert.ok(exercised > 0, 'real options exercised');
});
httpTest('400 query envelope and scalar/repeated validation', async () => {
  for (const query of ['limit=101', 'limit=0', 'limit=1.5', 'offset=-1', 'offset=9007199254740992', 'sort=invalid',
    'limit=1&limit=2', 'category=milk&category=milk', 'search=a&search=b',
    'sort=price_asc&sort=price_desc', 'offset=0&offset=1',
    'category=milk&unknownFilter=1', 'volumeMl=1000']) await request(`/api/products?${query}`, 400);
});
httpTest('dashboard baskets/nullability/totals and ordered spreads', async () => {
  validate(ref('Dashboard'), dashboard);
  for (const basket of dashboard.baskets) {
    assert.equal(basket.total, basket.items.reduce((sum, item) => sum + (item.price ?? 0), 0));
    for (const item of basket.items) {
      if (item.price === null) assert.deepEqual([item.productId, item.name], [null, null]);
      else assert.ok(typeof item.productId === 'string' && typeof item.name === 'string' && item.price > 0);
    }
  }
  for (const spread of dashboard.priceSpreads) {
    assert.equal(spread.differencePercent, Math.round((spread.maxPrice - spread.minPrice) / spread.minPrice * 10000) / 100);
  }
  for (let i = 1; i < dashboard.priceSpreads.length; i++) {
    const a = dashboard.priceSpreads[i - 1], b = dashboard.priceSpreads[i];
    assert.ok(a.differencePercent > b.differencePercent || (a.differencePercent === b.differencePercent && a.productId.localeCompare(b.productId) <= 0));
  }
  if (profile === 'fixture') assert.deepEqual(dashboard, example('dashboard'));
  console.log(`safe summary: categories=${categories.length}, page=${firstPage.length}, canonical=${dashboard.summary.canonicalProducts}, stores=${dashboard.summary.stores}, locations=${dashboard.locations.length}, baskets=${dashboard.baskets.length}`);
});

const fixtureVoice = (name, fn) => test(`fixture voice HTTP: ${name}`, { skip: !base || profile !== 'fixture' }, fn);
async function voice(path, body, status = 201) {
  const result = await request(`/api/voice/${path}`, status, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (status === 201) validate(ref('VoiceResponse'), result);
  return result;
}
fixtureVoice('direct single and numeric JSON coordinate strings', async () => {
  const text = 'самое дешевое молоко 1 литр 3.2%';
  const numeric = await voice('start', { text, latitude: 43.6, longitude: 51.1 });
  assert.equal(numeric.status, 'result');
  assert.equal(numeric.mode, 'single');
  assert.equal(numeric.items.length, 1);
  assert.equal(numeric.items[0].price, 570);
  assert.deepEqual(await voice('start', { text, latitude: '43.6', longitude: '51.1' }), numeric);
});
fixtureVoice('clarification, continue and deleted/unknown opaque session', async () => {
  const start = await voice('start', { text: 'самое дешевое молоко', latitude: 43.6, longitude: 51.1 });
  assert.equal(start.status, 'needs_clarification');
  assert.deepEqual(start.missingFields, ['volumeMl', 'fatPercent']);
  const result = await voice('continue', { sessionId: start.sessionId, text: '1 литр 3.2%' });
  assert.equal(result.status, 'result');
  assert.equal(result.mode, 'single');
  assert.equal(result.items[0].price, 570);
  await voice('continue', { sessionId: start.sessionId, text: '1 литр' }, 404);
  await voice('continue', { sessionId: 'opaque-unknown-session', text: 'литр' }, 404);
});
fixtureVoice('list bounded to three and zero matches remain a result', async () => {
  const list = await voice('start', { text: 'найди молоко 1 литр 3.2%', latitude: 43.6, longitude: 51.1 });
  assert.equal(list.mode, 'list');
  assert.ok(list.items.length <= 3);
  const empty = await voice('start', { text: 'самое дешевое молоко 500 мл 3.2%', latitude: 43.6, longitude: 51.1 });
  assert.equal(empty.status, 'result');
  assert.deepEqual(empty.items, []);
});
fixtureVoice('invalid DTOs preserve compatible 400 envelope', async () => {
  for (const body of [
    { text: ' ', latitude: 43.6, longitude: 51.1 },
    { text: 'молоко', latitude: 91, longitude: 51.1 },
    { text: 'молоко', latitude: 'invalid', longitude: 51.1 },
    { text: 'молоко', latitude: 43.6, longitude: 181 },
    { text: 'молоко', latitude: 43.6, longitude: 51.1, unknown: true },
  ]) await voice('start', body, 400);
  await voice('continue', { sessionId: ' ', text: 'литр' }, 400);
});
