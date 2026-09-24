import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import type { DashboardDto, FilterSchemaDto, ProductCardDto } from '../src/contracts/catalog';
import { normalizeProduct } from '../src/catalog/product-card';
import { createApp } from '../src/create-app';
import { haversineMeters } from '../src/location/haversine';

// HTTP tests must never depend on live Gemini/Upstash developer credentials.
process.env.GEMINI_API_KEY = '';
process.env.UPSTASH_REDIS_REST_URL = '';
process.env.UPSTASH_REDIS_REST_TOKEN = '';

let app: INestApplication;
let baseUrl: string;

before(async () => {
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await app?.close();
});

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}${path}`);
  return { status: response.status, body: await response.json() };
}

test('categories and fixture-backed filter options', async () => {
  const categories = await get('/api/categories');
  assert.equal(categories.status, 200);
  assert.deepEqual(categories.body, [
    { id: 'bd82bf16-270e-4aa8-b78e-3981efb7eac2', slug: 'milk', name: 'Молоко' },
  ]);
  const schema = await get('/api/categories/milk/filters');
  assert.equal(schema.status, 200);
  assert.deepEqual((schema.body as FilterSchemaDto).filters.map((filter) => filter.options), [
    [500, 1000], [2.5, 3.2],
  ]);
  assert.equal((await get('/api/categories/unknown/filters')).status, 404);
});

test('products: default sorting, search, category, filters and pagination', async () => {
  const all = await get('/api/products');
  assert.equal(all.status, 200);
  const products = all.body as ProductCardDto[];
  assert.deepEqual(products.map((product) => product.minPrice), [390, 570]);
  assert.deepEqual(products[1]?.offers.map((offer) => offer.price), [570, 620]);
  assert.equal(products[1]?.category.slug, 'milk');
  assert.equal(products[1]?.snapshotAt, '2026-09-23T09:00:00.000Z');
  assert.deepEqual((await get('/api/products?category=missing')).body, []);
  assert.deepEqual((await get('/api/products?search=%20FOODMASTER%20')).body,
    [products[1]]);
  assert.deepEqual((await get('/api/products?category=milk&volumeMl=1000')).body,
    [products[1]]);
  assert.deepEqual((await get('/api/products?category=milk&volumeMl=500&volumeMl=1000')).body,
    products);
  assert.deepEqual((await get('/api/products?category=milk&volumeMl=500&volumeMl=1000&fatPercent=3.2')).body,
    [products[1]]);
  assert.deepEqual((await get('/api/products?sort=price_desc&limit=1&offset=0')).body,
    [products[1]]);
  assert.deepEqual((await get('/api/products?sort=name_asc&limit=1&offset=1')).body,
    [products[1]]);
});

test('product detail and invalid queries return documented errors', async () => {
  const detail = await get('/api/products/2358a413-8c03-4e59-baad-7675045b97bb');
  assert.equal(detail.status, 200);
  assert.equal((detail.body as ProductCardDto).minPrice, 570);
  assert.equal((await get('/api/products/unknown')).status, 404);
  for (const path of [
    '/api/products?sort=unknown',
    '/api/products?limit=0',
    '/api/products?offset=-1',
    '/api/products?category=milk&unknown=1',
    '/api/products?category=milk&volumeMl=oops',
    '/api/products?category=milk&volumeMl=750',
    '/api/products?volumeMl=1000',
  ]) {
    const response = await get(path);
    assert.equal(response.status, 400, path);
    assert.equal(typeof (response.body as { message?: unknown }).message, 'string');
  }
});

test('normalization recomputes stale price without mutating offers', () => {
  const original: ProductCardDto = {
    id: 'fixture', name: 'Fixture', brand: null, category: { slug: 'milk', name: 'Молоко' },
    imageUrl: null, attributes: {}, minPrice: 999,
    offers: [
      { storeCode: 'DANA', storeName: 'Dana', price: 620, oldPrice: null },
      { storeCode: 'DINA', storeName: 'Dina', price: 570, oldPrice: null },
    ],
    snapshotAt: '2026-09-23T09:00:00.000Z',
  };
  const result = normalizeProduct(original);
  assert.equal(result.minPrice, 570);
  assert.deepEqual(result.offers.map((offer) => offer.price), [570, 620]);
  assert.equal(original.offers[0]?.price, 620);
});

test('dashboard derives summary, sorted spreads and locations', async () => {
  const response = await get('/api/dashboard');
  assert.equal(response.status, 200);
  const dashboard = response.body as DashboardDto;
  assert.deepEqual(dashboard.summary, {
    canonicalProducts: 2, stores: 2, matchedAcrossStores: 2,
    snapshotAt: '2026-09-23T09:00:00.000Z',
  });
  assert.deepEqual(dashboard.priceSpreads.map((spread) => spread.differencePercent), [8.77, 7.69]);
  assert.equal(dashboard.locations.length, 2);
  assert.equal(dashboard.locations[0]?.storeCode, 'DINA');
});

test('Haversine returns plausible meters', () => {
  assert.equal(haversineMeters(43.6, 51.1, 43.6, 51.1), 0);
  const distance = haversineMeters(43.6, 51.1, 43.61, 51.1);
  assert.ok(Number.isFinite(distance) && distance > 1100 && distance < 1125);
});
