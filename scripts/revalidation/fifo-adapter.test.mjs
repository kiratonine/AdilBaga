import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { calibrateClock, openReceiver } from './fifo-adapter.mjs';
import { fixtureManifest, fixtureBody } from './fixtures/c2-manifest.mjs';

// Explicit local test binary only. Missing PoC binary is a failure, not a skip.
const probe = process.env.C2_LOCAL_PROBE;
assert.ok(probe && path.isAbsolute(probe), 'build local relayprobe and set C2_LOCAL_PROBE');
const exec = promisify(execFile), dirs = [];
const snapshotId = '11111111-1111-4111-8111-111111111111';
const calibration = calibrateClock(probe);
console.log(JSON.stringify({ clock_probe: 'PASS', samples: calibration.samples,
  offset_lower_ns: calibration.lower.toString(), offset_upper_ns: calibration.upper.toString(),
  bound_width_ns: (calibration.upper - calibration.lower).toString(), precision_assumed_zero: false }));
const env = { PATH: '/usr/local/bin:/usr/bin:/bin' };
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c2-fifo-test-')); dirs.push(dir); fs.chmodSync(dir, 0o700);
  const fifo = path.join(dir, 'event'); execFileSync('mkfifo', ['-m', '600', fifo], { env });
  const attemptId = randomBytes(16).toString('hex');
  return { dir, fifo, snapshotId, attemptId, calibration, manifest: fixtureManifest(snapshotId, attemptId) };
}
after(() => { for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true }) });
function getter(config, counts) {
  return async p => { counts.n++; return { status: 200, headers: {}, text: fixtureBody(config.manifest.targets.find(t => t.path === p)) } };
}
function event(config, overrides = {}) {
  const end = process.hrtime.bigint() - 10_000_000n;
  return { version: 1, snapshotId, attemptId: config.attemptId, status: 204, startMono: (end - 1_000_000n).toString(),
    endMono: end.toString(), bootId: calibration.bootId, errorClass: 'none', ...overrides };
}
function write(config, value) {
  const fd = fs.openSync(config.fifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW);
  try { fs.writeSync(fd, typeof value === 'string' ? value : JSON.stringify(value) + '\n') } finally { fs.closeSync(fd) }
}
for (const status of [200, 204, 401, 0]) test(`real Go HTTP → FIFO → Node status${status}`, async () => {
  const config = setup(), counts = { n: 0 }, receiver = openReceiver(config);
  const observing = receiver.observe({ get: getter(config, counts), waitMs: 8000 });
  const child = await exec(probe, ['notify', String(status), config.fifo, snapshotId, config.attemptId], { env, timeout: 10000, maxBuffer: 2048 });
  const summary = JSON.parse(child.stdout), result = await observing;
  assert.equal(summary.published, true); assert.equal(summary.requests, 1); assert.equal(summary.relay, 'sent');
  assert.equal(summary.outcome, status === 200 || status === 204 ? 'success' : 'degraded');
  assert.equal(result.acceptance, status === 204 ? 'PASS' : 'INCONCLUSIVE');
  assert.equal(counts.n, status === 204 ? 6 : 0);
  if (status === 0) assert.equal(summary.errorClass, 'timeout');
});
test('no reader / crashed receiver does not change publication/notification', async () => {
  const c = setup(); const receiver = openReceiver(c); receiver.close();
  const child = await exec(probe, ['notify', '204', c.fifo, snapshotId, c.attemptId], { env, timeout: 2000, maxBuffer: 2048 });
  const summary = JSON.parse(child.stdout);
  assert.equal(summary.published, true); assert.equal(summary.outcome, 'success'); assert.equal(summary.requests, 1); assert.equal(summary.relay, 'skipped');
});
for (const [name, overrides, reason] of [
  ['bad bootId', { bootId: '22222222-2222-4222-8222-222222222222' }, 'boot_mismatch'],
  ['wrong snapshot', { snapshotId: '22222222-2222-4222-8222-222222222222' }, 'unrelated_event'],
  ['wrong attempt', { attemptId: '0'.repeat(32) }, 'unrelated_event'],
  ['delayed relay', () => ({ startMono: (process.hrtime.bigint() - 7_000_000_000n).toString(), endMono: (process.hrtime.bigint() - 6_000_000_000n).toString() }), 'event_expired_or_unordered'],
  ['unordered', () => ({ startMono: (process.hrtime.bigint() + 1_000_000_000n).toString() }), 'event_expired_or_unordered'],
]) test(`${name} fails closed with0 GET`, async () => {
  const c = setup(), counts = { n: 0 }, receiver = openReceiver(c);
  const observing = receiver.observe({ get: getter(c, counts) }); write(c, event(c, typeof overrides === 'function' ? overrides() : overrides));
  const r = await observing; assert.equal(r.acceptance, 'INCONCLUSIVE'); assert.equal(r.reason, reason); assert.equal(counts.n, 0);
});
test('duplicate receipt cannot start another observation', async () => {
  const c = setup(); const counts = { n: 0 }; const receipt = event(c);
  for (let i = 0; i < 2; i++) {
    const receiver = openReceiver(c), observing = receiver.observe({ get: getter(c, counts) }); write(c, receipt);
    const r = await observing; assert.equal(r.acceptance, i ? 'INCONCLUSIVE' : 'PASS');
    if (i) assert.equal(r.reason, 'duplicate_or_capacity');
  }
  assert.equal(counts.n, 6);
});
for (const mode of ['partial', 'duplicate JSON field', 'oversized', 'unknown metadata']) test(`${mode}: integrity rejection0 GET`, async () => {
  const c = setup(), receiver = openReceiver(c), counts = { n: 0 };
  const observing = receiver.observe({ get: getter(c, counts) });
  const receipt = event(c); let raw = JSON.stringify(receipt) + '\n';
  if (mode === 'partial') raw = raw.slice(0, -1);
  if (mode === 'duplicate JSON field') raw = raw.replace('"version":1', '"version":1,"version":1');
  if (mode === 'oversized') raw = 'x'.repeat(4097);
  if (mode === 'unknown metadata') raw = JSON.stringify({ ...receipt, extra: true }) + '\n';
  write(c, raw); const r = await observing;
  assert.equal(r.acceptance, 'INCONCLUSIVE'); assert.equal(counts.n, 0);
});
test('missing reader event, fake calibration and unchanged witness do not perform GET', async () => {
  const c = setup(), counts = { n: 0 };
  const missing = await openReceiver(c).observe({ get: getter(c, counts), waitMs: 20 });
  assert.equal(missing.reason, 'event_missing');
  const fake = await openReceiver({ ...c, calibration: { ...calibration } }).observe({ get: getter(c, counts) });
  assert.equal(fake.reason, 'clock_unverified');
  c.manifest.targets[0].after = c.manifest.targets[0].before;
  const receiver = openReceiver(c), observing = receiver.observe({ get: getter(c, counts) }); write(c, event(c));
  assert.equal((await observing).acceptance, 'INCONCLUSIVE'); assert.equal(counts.n, 0);
});
test('unsafe FIFO type, symlink and permissions rejected', () => {
  const c = setup(); const regular = path.join(c.dir, 'regular'); fs.writeFileSync(regular, 'untouched', { mode: 0o600 });
  assert.throws(() => openReceiver({ ...c, fifo: regular }), /unsafe_fifo/);
  const link = path.join(c.dir, 'link'); fs.symlinkSync(c.fifo, link);
  assert.throws(() => openReceiver({ ...c, fifo: link }), /unsafe_fifo/);
  fs.chmodSync(c.fifo, 0o666); assert.throws(() => openReceiver(c), /unsafe_fifo/);
  fs.chmodSync(c.fifo, 0o600); fs.chmodSync(c.dir, 0o755); assert.throws(() => openReceiver(c), /unsafe_fifo/);
  assert.equal(fs.readFileSync(regular, 'utf8'), 'untouched');
});
test('captures alone lack product membership and cannot form a qualified manifest', async () => {
  const c = setup(), counts = { n: 0 };
  const captures = { DINA: c.manifest.targets[0].before, DANA: c.manifest.targets[0].after };
  // Same per-store captures, two possible memberships, two different maxima.
  // No price/rank inference or production witness can be derived from this map.
  const forMembership = stores => stores.map(s => captures[s]).sort().at(-1);
  assert.notEqual(forMembership(['DINA']), forMembership(['DINA', 'DANA']));
  c.manifest = { snapshotId, attemptId: c.attemptId, captures };
  const receiver = openReceiver(c), observing = receiver.observe({ get: getter(c, counts) }); write(c, event(c));
  const r = await observing; assert.equal(r.acceptance, 'INCONCLUSIVE'); assert.equal(counts.n, 0);
});
test('manifest tied to another snapshot never performs GET', async () => {
  const c = setup(), counts = { n: 0 }; c.manifest.snapshotId = '22222222-2222-4222-8222-222222222222';
  const receiver = openReceiver(c), observing = receiver.observe({ get: getter(c, counts) }); write(c, event(c));
  const r = await observing; assert.equal(r.reason, 'manifest_unverified'); assert.equal(counts.n, 0);
});
test('synthetic fixture manifest cannot accidentally select default public transport', async () => {
  const c = setup(), receiver = openReceiver(c), observing = receiver.observe(); write(c, event(c));
  const r = await observing;
  assert.equal(r.acceptance, 'INCONCLUSIVE'); assert.equal(r.reason, 'fixture_transport_required'); assert.equal(r.request_count, 0);
});
test('real-clock adapter observation preserves total cap21 and sitemap cap2', async () => {
  const c = setup(), counts = new Map(), receiver = openReceiver(c);
  const observing = receiver.observe({ get: async p => {
    counts.set(p, (counts.get(p) ?? 0) + 1);
    return { status: 200, headers: {}, text: fixtureBody(c.manifest.targets.find(t => t.path === p), false) };
  } });
  write(c, event(c)); const r = await observing;
  assert.equal(r.acceptance, 'FAIL'); assert.equal(r.request_count, 21);
  assert.equal([...counts.values()].reduce((a, b) => a + b, 0), 21); assert.equal(counts.get('/sitemap.xml'), 2);
  assert.ok(r.events.every(e => e.end_elapsed_ms + e.elapsed_uncertainty_ms <= 20000));
});
