import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observeConvergence } from './cache-observer.mjs';

async function scenario(steps, initial = 0) {
  let clock = initial, calls = 0, sleeps = 0;
  const timeouts = [];
  const result = await observeConvergence({ target: { name: 'synthetic', path: '/local', isFresh: t => t === 'revision2' },
    acceptedAt: 0, now: () => clock, sleep: async ms => { clock += ms; sleeps++ }, get: async (_path, timeout) => {
      timeouts.push(timeout);
      const step = steps[Math.min(calls++, steps.length - 1)];
      clock += step.ms ?? 0;
      if (step.error) throw Error('untrusted_transport_details');
      return { text: step.text, headers: { etag: step.etag ?? 'same', 'x-nextjs-cache': step.cache ?? 'HIT' } };
    } });
  return { result, calls, sleeps, timeouts };
}
test('full GET marker, not ETag, determines freshness', async () => {
  const {result, calls} = await scenario([{text:'revision1', etag:'changed',ms:10},{text:'revision2',etag:'changed',ms:20}]);
  assert.equal(result.eventual_freshness,'PASS'); assert.equal(calls,2);
  assert.equal(result.first_response_fresh,false); assert.equal(result.stale_response_count,1);
  assert.equal(result.first_response_elapsed_ms,10); assert.equal(result.elapsed_ms,130);
});
test('fresh first response does not sleep', async () => {
  const {result,sleeps} = await scenario([{text:'revision2',ms:50}]);
  assert.equal(result.eventual_freshness,'PASS'); assert.equal(sleeps,0); assert.equal(result.request_count,1);
});
test('late fresh complete body fails shared deadline', async () => {
  const {result} = await scenario([{text:'revision2',ms:5001}]);
  assert.equal(result.eventual_freshness,'FAIL'); assert.equal(result.elapsed_ms,5001);
});
test('persistent stale is bounded and shrinking timeout is passed', async () => {
  const {result,calls,timeouts} = await scenario([{text:'revision1',ms:1000}]);
  assert.equal(result.eventual_freshness,'FAIL'); assert.ok(calls<=5);
  assert.equal(timeouts[0],5000); assert.ok(timeouts.at(-1)<timeouts[0]);
});
test('operation failure stops without retry or raw error disclosure', async () => {
  const {result,calls,sleeps} = await scenario([{error:true}]);
  assert.equal(calls,1); assert.equal(sleeps,0); assert.equal(result.eventual_freshness,'FAIL');
  assert.equal(result.failure_class,'local_http_operation_failed');
  assert.ok(!JSON.stringify(result).includes('untrusted_transport_details'));
});
test('expired event cannot start a fresh per-path budget', async () => {
  const {result,calls} = await scenario([{text:'revision2'}],5001);
  assert.equal(calls,0); assert.equal(result.eventual_freshness,'FAIL');
});
