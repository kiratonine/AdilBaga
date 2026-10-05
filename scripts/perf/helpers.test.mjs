import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fake, token } from './fake-upstash.mjs';
import { image, owned, loopback, backupInputs, intervalSampler } from './helpers.mjs';
import { classify } from './diagnose-restore.mjs';
import { readFileSync } from 'node:fs';

test('versioned mapping audit fixes all non-float fields and exact float bytes', () => {
  const sql = readFileSync(new URL('./product-mappings-audit.sql', import.meta.url), 'utf8');
  assert.match(sql, /json_build_array\(id, "rawProductId", "canonicalProductId",/);
  assert.match(sql, /"matchMethod"::text, "reviewStatus"::text/);
  assert.match(sql, /to_char\("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.US'\)/);
  assert.match(sql, /encode\(float8send\("matchConfidence"\), 'hex'\)/);
  assert.equal((sql.match(/ORDER BY id COLLATE "C"/g) ?? []).length, 3);
  for (const name of ['nonFloatFieldsFingerprint','matchConfidenceBinaryFingerprint','fullCanonicalFingerprint','pm-audit-v1']) assert.ok(sql.includes(name));
  assert.doesNotMatch(sql, /round\s*\(|matchConfidence"::text|UPDATE|DELETE|INSERT/);
});

test('restore diagnosis exposes bounded class and known object only, not SQL or secrets', () => {
  const result = classify('pg_restore: from TOC entry 7; 2615 2200 SCHEMA public owner\nERROR: schema "public" already exists\nCommand was: PRIVATE_SQL_MARKER\nprivate-url-password-marker');
  assert.deepEqual(result, { outcome: 'duplicate_object', object: { kind: 'SCHEMA', name: 'public' } });
  const privateResult = classify('ERROR: relation "unapproved_sensitive_name" does not exist; PRIVATE_SQL_MARKER');
  assert.deepEqual(privateResult, { outcome: 'missing_relation' });
  for (const raw of ['unknown private error','function "unapproved_sensitive_name" does not exist','connection refused private host']) {
    assert.ok(!JSON.stringify(classify(raw)).includes('private'));
  }
});

test('targets, ownership, missing input and exact image fail closed', () => {
  assert.equal(image, 'grafana/k6:2.3.0');
  assert.equal(owned('adilbaga-part13-123456abcdef-api'), 'adilbaga-part13-123456abcdef-api');
  for (const n of ['unrelated', 'adilbaga-part13-../api']) assert.throws(() => owned(n));
  for (const h of ['example.neon.tech', '8.8.8.8', '[::]']) assert.throws(() => loopback(`postgres://postgres:dummy@${h}:5432/part11_perf`));
  assert.throws(() => loopback('postgres://postgres:dummy@127.0.0.1:5432/part11_perf?host=external'));
  assert.throws(() => backupInputs({}));
});
test('sampling exceptions stay bounded and propagate only after owner cleanup', async () => {
  let ticks = 0, aborted = false, cleaned = false;
  const sampler = intervalSampler(() => { ticks++; throw Error('private diagnostic value'); }, () => { aborted = true; }, 5);
  await new Promise(resolve => setTimeout(resolve, 30));
  sampler.stop(); cleaned = true;
  assert.equal(ticks, 1); assert.equal(aborted, true); assert.equal(cleaned, true);
  assert.equal(sampler.error, 'sampling_failed');
  assert.throws(() => { if (cleaned && sampler.error) throw Error(sampler.error); }, /sampling_failed/);
});
test('fake exact SET EX600/GET/DEL, auth/body, bounded map and TTL', async t => {
  let time = 0; const server = fake({ now: () => time, capacity: 1 });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const command = async (c, auth = token) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}`, { method: 'POST', headers: { Authorization: `Bearer ${auth}` }, body: JSON.stringify(c) });
    return [r.status, (await r.json()).result];
  };
  const key = 'voice-session:v1:' + 'a'.repeat(64), key2 = 'voice-session:v1:' + 'b'.repeat(64);
  assert.deepEqual(await command(['SET', key, '{}', 'EX', 600]), [200, 'OK']);
  assert.deepEqual(await command(['GET', key]), [200, '{}']);
  assert.equal((await command(['SET', key2, '{}', 'EX', 600]))[0], 503);
  assert.equal((await command(['GET', key], 'wrong'))[0], 403);
  assert.equal((await command(['SET', key, '{}', 'EX', 1]))[0], 400);
  assert.equal((await command(['FLUSHALL', key]))[0], 400);
  assert.equal((await command(['GET', 'raw-public-session']))[0], 400);
  time = 600_001; assert.deepEqual(await command(['GET', key]), [200, null]);
  assert.deepEqual(await command(['SET', key2, '{}', 'EX', 600]), [200, 'OK']);
  assert.deepEqual(await command(['DEL', key2]), [200, 1]);
  assert.deepEqual(await command(['GET', key2]), [200, null]);
  const big = await fetch(`http://127.0.0.1:${server.address().port}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: 'x'.repeat((1 << 20) + 1) });
  assert.equal(big.status, 413);
});
