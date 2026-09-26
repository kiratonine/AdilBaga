import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configuredGeminiKeys, GEMINI_TIMEOUT_MS, GeminiNlpParser, requestGeminiWithFailover } from '../src/voice/nlp/gemini-nlp-parser';
import { NlpService } from '../src/voice/nlp/nlp.service';
import { FallbackNlpParser } from '../src/voice/nlp/fallback-nlp-parser';
import type { NlpParseInput } from '../src/voice/voice-types';

const keys = ['fake-key1', 'fake-key2', 'fake-key3'];
const parsed = { intent: 'cheapest', category: 'milk', filters: {} };
const success = () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(parsed) }] } }] });

for (const winner of [0, 1, 2]) {
  test(`key${winner + 1} success stops the ordered failover chain`, async () => {
    const calls: string[] = [];
    const signals: (AbortSignal | null | undefined)[] = [];
    const request: typeof fetch = async (_url, init) => {
      calls.push(new Headers(init?.headers).get('x-goog-api-key') ?? '');
      signals.push(init?.signal);
      assert.equal(init?.body, 'same NLP body');
      return calls.length === winner + 1 ? success() : new Response('', { status: 429 });
    };
    assert.deepEqual(await requestGeminiWithFailover(keys, 'https://example.invalid', 'same NLP body', request), parsed);
    assert.deepEqual(calls, keys.slice(0, winner + 1));
    assert.ok(signals.every((signal) => signal === signals[0]));
    assert.ok(!JSON.stringify(parsed).includes('fake-key'));
  });
}

test('all keys fail with sanitized error and NlpService retains deterministic fallback', async () => {
  const calls: string[] = [];
  const request: typeof fetch = async (_url, init) => {
    const key = new Headers(init?.headers).get('x-goog-api-key') ?? '';
    calls.push(key);
    throw new Error(`untrusted provider error containing ${key}`);
  };
  class FailedGemini extends GeminiNlpParser {
    override isConfigured(): boolean { return true; }
    override parse(): Promise<unknown> {
      return requestGeminiWithFailover(keys, 'https://example.invalid', '{}', request);
    }
  }
  const gemini = new FailedGemini();
  await assert.rejects(gemini.parse(), { message: 'Gemini request failed' });
  assert.deepEqual(calls, keys);
  const context: NlpParseInput = {
    text: 'найди самое дешёвое молоко',
    categories: [{ id: 'milk', slug: 'milk', name: 'Молоко' }],
    schemas: [{ category: 'milk', filters: [] }],
  };
  assert.deepEqual(await new NlpService(gemini, new FallbackNlpParser()).parse(context), parsed);
  // Every request starts again with key1; no sticky selection.
  assert.deepEqual(calls, [...keys, ...keys]);
});

test('key2-only configuration, empty keys and duplicates preserve first order', async () => {
  assert.deepEqual(configuredGeminiKeys({ GEMINI_API_KEY: ' ', GEMINI_API_KEY2: keys[1] }), [keys[1]]);
  const onlyKey2Request: typeof fetch = async (_url, init) => {
    assert.equal(new Headers(init?.headers).get('x-goog-api-key'), keys[1]);
    return success();
  };
  assert.deepEqual(await requestGeminiWithFailover(configuredGeminiKeys({ GEMINI_API_KEY2: keys[1] }), 'https://example.invalid', '{}', onlyKey2Request), parsed);
  const saved = keys.map((_, i) => process.env[['GEMINI_API_KEY', 'GEMINI_API_KEY2', 'GEMINI_API_KEY3'][i]!]);
  try {
    process.env.GEMINI_API_KEY = '';
    process.env.GEMINI_API_KEY2 = keys[1];
    process.env.GEMINI_API_KEY3 = '';
    assert.equal(new GeminiNlpParser().isConfigured(), true);
  } finally {
    ['GEMINI_API_KEY', 'GEMINI_API_KEY2', 'GEMINI_API_KEY3'].forEach((name, i) => {
      if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i];
    });
  }
  const calls: string[] = [];
  const request: typeof fetch = async (_url, init) => {
    calls.push(new Headers(init?.headers).get('x-goog-api-key') ?? '');
    return calls.length === 1 ? new Response('', { status: 503 }) : success();
  };
  assert.deepEqual(await requestGeminiWithFailover(['', keys[1]!, keys[1]!, keys[2]!], 'https://example.invalid', '{}', request), parsed);
  assert.deepEqual(calls, [keys[1], keys[2]]);
});

test('malformed body, missing text and invalid JSON fail over without exposing provider body', async () => {
  let calls = 0;
  const request: typeof fetch = async () => {
    calls++;
    if (calls === 1) return new Response('not a provider JSON body');
    if (calls === 2) return Response.json({ candidates: [] });
    return Response.json({ candidates: [{ content: { parts: [{ text: 'not JSON fake-key3' }] } }] });
  };
  await assert.rejects(requestGeminiWithFailover(keys, 'https://example.invalid', '{}', request), { message: 'Gemini request failed' });
  assert.equal(calls, 3);
});

test('one overall deadline stops a hung first attempt rather than starting two more budgets', async () => {
  assert.equal(GEMINI_TIMEOUT_MS, 8_000);
  let calls = 0;
  const request: typeof fetch = async (_url, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
    });
  };
  // Keep event loop alive: AbortSignal.timeout uses an unref timer.
  const keepAlive = setTimeout(() => {}, 1_000);
  try {
    await assert.rejects(requestGeminiWithFailover(keys, 'https://example.invalid', '{}', request, 20), { message: 'Gemini request failed' });
    assert.equal(calls, 1);
  } finally { clearTimeout(keepAlive); }
});
