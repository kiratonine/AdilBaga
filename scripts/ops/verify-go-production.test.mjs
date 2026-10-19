import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { createVerifier, main } from './verify-go-production.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`../../contracts/examples/${name}.json`, import.meta.url)));
const bodies = [{ status: 'ok' }, { status: 'ready' }, fixture('categories'), fixture('products').slice(0, 1), fixture('dashboard')];
const reply = data => ({ status: 200, type: 'application/json; charset=utf-8', text: JSON.stringify(data) });
function harness(change = () => {}, timing = () => 0) {
  const calls = []; let index = 0;
  const verify = createVerifier({ now: timing, get: async (url, options) => {
    const i = index++; calls.push({ url, ...options });
    const response = reply(structuredClone(bodies[i])); await change(response, i, options); return response;
  } });
  return { calls, verify };
}
test('default/offline/invalid args never network and never echo inputs', async () => {
  const get = mock.method(https, 'get', () => assert.fail('network'));
  try {
    for (const args of [[], ['--offline'], ['--live', 'secret@example.test'], ['--url=private']]) {
      let out = ''; await main(args, s => { out += s }); assert.ok(!out.includes('secret@example')); assert.ok(Buffer.byteLength(out) < 1024);
    }
    assert.equal(get.mock.callCount(), 0);
  } finally { get.mock.restore(); }
});
test('real contract fixtures, exact sequential targets/caps and one-shot', async () => {
  const h = harness(); const result = await h.verify();
  assert.equal(result.outcome, 'PASS'); assert.equal(result.requests, 5);
  assert.deepEqual(h.calls.map(c => c.url), ['/health/live', '/health/ready', '/api/categories', '/api/products?limit=1', '/api/dashboard'].map(p => 'https://api.aktau.market' + p));
  assert.deepEqual(h.calls.map(c => c.cap), [65536, 65536, 1048576, 1048576, 1048576]);
  assert.ok(h.calls.every(c => c.milliseconds === 8000));
  assert.equal((await h.verify()).reason, 'already_used'); assert.equal(h.calls.length, 5);
  assert.equal((await harness().verify()).outcome, 'PASS');
  assert.equal(result.records[4].snapshotAt, bodies[4].summary.snapshotAt);
});
for (const [name, change, reason, outcome] of [
  ['redirect', r => { r.status = 302 }, 'redirect', 'BLOCKED'],
  ['WAF 403', r => { r.status = 403; r.text = '<html>1010 secret</html>' }, 'access_blocked', 'BLOCKED'],
  ['service error', r => { r.status = 503 }, 'http_status', 'BLOCKED'],
  ['HTML challenge200', r => { r.type = 'text/html' }, 'content_type', 'FAIL'],
  ['invalid JSON', r => { r.text = '{secret' }, 'invalid_json', 'FAIL'],
  ['wrong DTO', r => { r.text = '{}' }, 'schema', 'FAIL'],
  ['oversize', r => { r.text = 'x'.repeat(65537) }, 'body_limit', 'BLOCKED'],
  ['raw exception', () => { throw Error('secret@example.test 51.123 token=secret') }, 'transport', 'BLOCKED'],
]) test(name + ' stops after one attempt', async () => {
  const h = harness(change); const result = await h.verify(); assert.equal(result.outcome, outcome); assert.equal(result.reason, reason); assert.equal(h.calls.length, 1);
  assert.ok(!JSON.stringify(result).includes('secret'));
});
for (const i of [1, 2, 3, 4]) test('wrong DTO at target ' + i, async () => {
  const h = harness((r, n) => { if (i === n) r.text = JSON.stringify({ unexpected: 'private' }); });
  assert.equal((await h.verify()).outcome, 'FAIL'); assert.equal(h.calls.length, i + 1);
});
test('privacy: body/headers/location/IDs not retained', async () => {
  const h = harness((r, i) => { r.headers = { cookie: 'PRIVATE_SENTINEL' }; if (i === 2) r.text = JSON.stringify([{ id: 'PRIVATE_SENTINEL', name: 'PRIVATE_SENTINEL', slug: 'PRIVATE_SENTINEL' }]); });
  const result = await h.verify(); assert.equal(result.outcome, 'PASS');
  assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL')); assert.ok(JSON.stringify(result).length < 4096);
});
test('absolute per-call timer and shared deadline reject late success', async () => {
  let time = 0;
  let h = harness(() => { time += 8001 }, () => time);
  assert.equal((await h.verify()).reason, 'timeout'); assert.equal(h.calls.length, 1);
  time = 0; h = harness(() => { time += 50001 }, () => time);
  assert.equal((await h.verify()).reason, 'global_deadline'); assert.equal(h.calls.length, 1);
});

// Exercise actual HTTPS adapter with synthetic streams only; no socket is opened.
for (const kind of ['partial', 'oversize', 'invalid_length', 'bad_utf8', 'redirect', 'timeout']) test('HTTPS transport ' + kind, async () => {
  let requests = 0, destroyed = 0;
  const mocked = mock.method(https, 'get', (url, options, callback) => {
    requests++; assert.equal(url, 'https://api.aktau.market/health/live');
    assert.equal(options.agent, false); assert.deepEqual(options.headers, { Accept: 'application/json', 'User-Agent': 'AktauMarket-Operator-Verifier/1.0' });
    const req = new EventEmitter(); req.destroy = () => { destroyed++ };
    if (kind !== 'timeout') setImmediate(() => {
      const res = new EventEmitter(); res.destroy = () => { destroyed++ }; res.complete = true;
      res.statusCode = kind === 'redirect' ? 302 : 200;
      res.headers = { 'content-type': 'application/json', ...(kind === 'invalid_length' ? { 'content-length': '999999' } : {}) };
      callback(res);
      if (kind === 'partial') res.emit('aborted');
      if (kind === 'oversize') res.emit('data', Buffer.alloc(65537));
      if (kind === 'bad_utf8') { res.emit('data', Buffer.from([255])); res.emit('end'); }
    });
    return req;
  });
  // Controlled timers only for the timeout case: exercise the real cancellation callback.
  let timerMock;
  if (kind === 'timeout') {
    const original = globalThis.setTimeout;
    timerMock = mock.method(globalThis, 'setTimeout', (fn, ms) => { assert.equal(ms, 8000); return original(fn, 1) });
  }
  try {
    const result = await createVerifier()(); assert.equal(requests, 1); assert.notEqual(result.outcome, 'PASS'); assert.ok(destroyed > 0);
    assert.equal(result.reason, { partial: 'partial_body', oversize: 'body_limit', invalid_length: 'body_limit', bad_utf8: 'invalid_json', redirect: 'redirect', timeout: 'timeout' }[kind]);
  } finally { mocked.mock.restore(); timerMock?.mock.restore(); }
});
