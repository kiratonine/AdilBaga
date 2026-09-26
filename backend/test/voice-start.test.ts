import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import type { FilterSchemaDto } from '../src/contracts/catalog';
import { createApp } from '../src/create-app';
import { nearestStore } from '../src/location/nearest-store';
import { FallbackNlpParser } from '../src/voice/nlp/fallback-nlp-parser';
import { GeminiNlpParser } from '../src/voice/nlp/gemini-nlp-parser';
import { NlpService } from '../src/voice/nlp/nlp.service';
import { validateNlpResult } from '../src/voice/nlp/validate-nlp-result';
import { MemoryVoiceSessionRepository } from '../src/voice/sessions/memory-voice-session.repository';
import { mergeVoiceSession } from '../src/voice/voice-state';
import type { NlpParseInput, VoiceSession } from '../src/voice/voice-types';

// HTTP tests use the deterministic parser and in-memory sessions, regardless of developer env.
process.env.GEMINI_API_KEY = '';
process.env.GEMINI_API_KEY2 = '';
process.env.GEMINI_API_KEY3 = '';
process.env.UPSTASH_REDIS_REST_URL = '';
process.env.UPSTASH_REDIS_REST_TOKEN = '';

let app: INestApplication;
let baseUrl: string;
const milkSchema: FilterSchemaDto = {
  category: 'milk',
  filters: [
    { key: 'volumeMl', label: 'Объём', type: 'multi-select', options: [500, 1000] },
    { key: 'fatPercent', label: 'Жирность', type: 'multi-select', options: [2.5, 3.2] },
  ],
};
const context: NlpParseInput = {
  text: '',
  categories: [{ id: 'fixture', slug: 'milk', name: 'Молоко' }],
  schemas: [milkSchema],
};

before(async () => {
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await app?.close();
});

async function post(path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('structured NLP validation rejects untrusted values', () => {
  const valid = { intent: 'cheapest', category: 'milk', filters: { volumeMl: 1000, fatPercent: 3.2 } };
  assert.deepEqual(validateNlpResult(valid, context), valid);
  for (const invalid of [
    { ...valid, intent: 'compare' },
    { ...valid, category: 'phones' },
    { ...valid, filters: { volumeMl: -999 } },
    { ...valid, filters: { fatPercent: 'banana' } },
    { ...valid, filters: { unknownFilter: true } },
    { ...valid, price: 1 },
  ]) assert.equal(validateNlpResult(invalid, context), null);
});

test('fallback parses approved demo vocabulary and invalid provider output falls back', async () => {
  const fallback = new FallbackNlpParser();
  assert.deepEqual(fallback.parse({ ...context, text: 'найди самое дешёвое молоко' }), {
    intent: 'cheapest', category: 'milk', filters: {},
  });
  assert.deepEqual(fallback.parse({ ...context, currentCategory: 'milk', text: 'один литр, 3.2 процента' }), {
    intent: null, category: null, filters: { volumeMl: 1000, fatPercent: 3.2 },
  });
  assert.deepEqual(fallback.parse({ ...context, text: 'покажи цены на молоко' }), {
    intent: 'search', category: 'milk', filters: {},
  });
  assert.deepEqual(fallback.parse({ ...context, currentCategory: 'milk', text: '500 мл и 6%' }).filters,
    { volumeMl: 500 });

  class InvalidGemini extends GeminiNlpParser {
    override isConfigured(): boolean { return true; }
    override async parse(): Promise<unknown> { return { intent: 'wrong', category: 'milk', filters: {} }; }
  }
  const nlp = new NlpService(new InvalidGemini(), fallback);
  assert.deepEqual(await nlp.parse({ ...context, text: 'найди самое дешёвое молоко' }), {
    intent: 'cheapest', category: 'milk', filters: {},
  });
});

test('session merge keeps known values and coordinates; memory sessions expire', async () => {
  const previous: VoiceSession = {
    intent: 'cheapest', category: 'milk', filters: { volumeMl: null, fatPercent: null },
    latitude: 43.6, longitude: 51.1,
  };
  const merged = mergeVoiceSession(previous, {
    intent: null, category: null, filters: { volumeMl: 1000, fatPercent: 3.2 },
  }, [milkSchema]);
  assert.deepEqual(merged, {
    intent: 'cheapest', category: 'milk', filters: { volumeMl: 1000, fatPercent: 3.2 },
    latitude: 43.6, longitude: 51.1,
  });
  assert.deepEqual(mergeVoiceSession(merged, { intent: null, category: null, filters: {} }, [milkSchema]),
    merged);
  const changed = mergeVoiceSession(merged, { intent: null, category: 'bread', filters: {} }, [
    milkSchema, { category: 'bread', filters: [] },
  ]);
  assert.equal(changed.category, 'bread');
  assert.deepEqual(changed.filters, {});
  const memory = new MemoryVoiceSessionRepository();
  await memory.set('expired', previous, 0);
  assert.equal(await memory.get('expired'), null);
});

test('nearest store picks the closest location', () => {
  const first = {
    storeCode: 'DINA' as const, storeName: 'Dina', name: 'near', address: 'near',
    latitude: 43.6, longitude: 51.1
  };
  const second = { ...first, name: 'far', latitude: 43.7 };
  const nearest = nearestStore(43.6, 51.1, [second, first]);
  assert.equal(nearest?.location.name, 'near');
  assert.equal(nearest?.distanceMeters, 0);
});

test('HTTP direct cheapest result is selected by repository price and offer', async () => {
  const response = await post('/api/voice/start', {
    text: 'найди самое дешёвое молоко один литр 3.2 процента',
    latitude: 43.6, longitude: 51.1,
  });
  assert.equal(response.status, 201);
  const body = response.body as {
    status: string; mode: string; speech: string; items: Array<{
      price: number; store: string; address: string | null; distanceMeters: number | null;
    }>
  };
  assert.equal(body.status, 'result');
  assert.equal(body.mode, 'single');
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0]?.price, 570);
  assert.equal(body.items[0]?.store, 'Dina');
  assert.ok(body.items[0]?.address);
  assert.ok((body.items[0]?.distanceMeters ?? 0) > 0);
  assert.match(body.speech, /570 тенге/u);
});

test('HTTP clarification → continue → result keeps session context and deletes it', async () => {
  const start = await post('/api/voice/start', {
    text: 'найди самое дешёвое молоко', latitude: 43.6, longitude: 51.1,
  });
  assert.equal(start.status, 201);
  const clarification = start.body as { status: string; sessionId: string; missingFields: string[] };
  assert.equal(clarification.status, 'needs_clarification');
  assert.deepEqual(clarification.missingFields, ['volumeMl', 'fatPercent']);
  assert.match(clarification.sessionId, /^[0-9a-f-]{36}$/u);
  const continued = await post('/api/voice/continue', {
    sessionId: clarification.sessionId, text: 'один литр, 3.2 процента',
  });
  assert.equal(continued.status, 201);
  const result = continued.body as {
    status: string; mode: string; items: Array<{
      price: number; store: string; distanceMeters: number | null;
    }>
  };
  assert.equal(result.status, 'result');
  assert.equal(result.mode, 'single');
  assert.equal(result.items[0]?.price, 570);
  assert.equal(result.items[0]?.store, 'Dina');
  assert.ok((result.items[0]?.distanceMeters ?? 0) > 0);
  assert.equal((await post('/api/voice/continue', {
    sessionId: clarification.sessionId, text: 'ещё',
  })).status, 404);
});

test('HTTP search has at most three ordered results; no match is a normal result', async () => {
  const search = await post('/api/voice/start', {
    text: 'покажи цены на молоко один литр 3.2 процента', latitude: 43.6, longitude: 51.1,
  });
  assert.equal(search.status, 201);
  const result = search.body as { status: string; mode: string; items: Array<{ price: number }> };
  assert.equal(result.status, 'result');
  assert.equal(result.mode, 'list');
  assert.ok(result.items.length <= 3);
  assert.deepEqual(result.items.map((item) => item.price), [570]);

  const empty = await post('/api/voice/start', {
    text: 'найди самое дешёвое молоко 500 мл 3.2%', latitude: 43.6, longitude: 51.1,
  });
  assert.equal(empty.status, 201);
  assert.deepEqual((empty.body as { items: unknown[] }).items, []);
});

test('HTTP invalid DTOs and unknown session return structured client errors', async () => {
  assert.equal((await post('/api/voice/start', { text: ' ', latitude: 'bad', longitude: 51.1 })).status, 400);
  assert.equal((await post('/api/voice/continue', { sessionId: ' ', text: '' })).status, 400);
  const unknown = await post('/api/voice/continue', { sessionId: 'missing', text: 'один литр' });
  assert.equal(unknown.status, 404);
  assert.equal((unknown.body as { statusCode: number }).statusCode, 404);
});

test('HTTP voice start accepts numeric coordinates serialized as strings', async () => {
  const response = await fetch(`${baseUrl}/api/voice/start`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      text: 'найди самое дешёвое молоко один литр 3.2 процента',
      latitude: '43.63737292051049',
      longitude: '51.16286925956555',
    }),
  });

  assert.equal(response.status, 201);

  const body = await response.json() as {
    status: string;
  };

  assert.equal(body.status, 'result');
});
