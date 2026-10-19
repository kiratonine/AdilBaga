import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createVerifier } from './verify-go-production.mjs';
import { openState } from './monitor-state.mjs';
import { runMonitor, createNotifier, main } from './monitor-go-production.mjs';

const healthy = () => ({ outcome: 'PASS', requests: 5, records: ['live','ready','categories','products','dashboard'].map(endpoint => ({ endpoint, outcome: 'PASS', schemaClass: 'valid', statusClass: '2xx' })) });
const bad = () => ({ outcome: 'BLOCKED', reason: 'PRIVATE_SENTINEL', records: [] });
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aktau-monitor-test-')); fs.chmodSync(dir, 0o700);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let time = 100000, fail = false, sends = [];
  const run = (check = healthy, extra = {}) => runMonitor({ directory: dir, check, now: () => time,
    notify: async message => { sends.push(message); return !fail; }, ...extra });
  return { dir, run, sends, advance: () => { time += 60000 }, failing: v => { fail = v } };
}
test('default/offline/invalid args do not inspect env, write state or network', async () => {
  const out = []; const env = new Proxy({}, { get() { assert.fail('env read') } });
  const req = mock.method(https, 'request', () => assert.fail('network'));
  try { for (const args of [[], ['--offline'], ['--unknown']]) await main(args, env, x => out.push(x)); }
  finally { req.mock.restore() }
  assert.ok(out.every(s => !s.includes('PRIVATE')));
});
test('two failures open incident, restart dedupe, then recovery exactly once', async t => {
  const f = fixture(t);
  assert.equal((await f.run()).outcome, 'OK');
  assert.equal((await f.run(bad)).outcome, 'DEGRADED');
  assert.equal((await f.run(bad)).outcome, 'INCIDENT');
  assert.equal((await f.run(bad)).outcome, 'INCIDENT'); assert.equal(f.sends.length, 1);
  assert.equal((await f.run()).outcome, 'RECOVERED');
  assert.equal((await f.run()).outcome, 'OK'); assert.equal(f.sends.length, 2);
  assert.deepEqual(f.sends.map(x => x.type), ['incident_opened', 'incident_recovered']);
});
test('zero-success-ever and a single failure followed by success', async t => {
  const f = fixture(t); assert.equal((await f.run(bad)).outcome, 'DEGRADED');
  assert.equal((await f.run()).outcome, 'OK'); assert.equal(f.sends.length, 0);
  await f.run(bad); await f.run(bad); assert.equal(f.sends[0].type, 'incident_opened');
});
test('pending delivery survives restart, cooldown, bounded attempts and recovery ordering', async t => {
  const f = fixture(t); f.failing(true); await f.run(bad); assert.equal((await f.run(bad)).outcome, 'PENDING');
  let probes = 0; const check = () => { probes++; return healthy() };
  assert.equal((await f.run(check)).reason, 'delivery_cooldown'); assert.equal(probes, 0); assert.equal(f.sends.length, 1);
  f.advance(); f.failing(false); assert.equal((await f.run(check)).reason, 'pending_delivered'); assert.equal(probes, 0);
  assert.equal(f.sends[0].id, f.sends[1].id); await f.run();
  assert.equal(f.sends.at(-1).type, 'incident_recovered');
});
test('three failed sends stop further attempts, no automatic flood', async t => {
  const f = fixture(t); f.failing(true); await f.run(bad); await f.run(bad);
  f.advance(); await f.run(); f.advance(); await f.run(); f.advance();
  assert.equal((await f.run()).reason, 'delivery_exhausted'); assert.equal(f.sends.length, 3);
});
test('partial/fabricated PASS and thrown checker are not healthy', async t => {
  const f = fixture(t);
  const partial = await f.run(() => ({ outcome: 'PASS' }));
  assert.equal(partial.outcome, 'DEGRADED'); assert.equal(partial.reason, 'probe_unavailable');
  assert.equal((await f.run(() => { throw Error('PRIVATE_SENTINEL') })).outcome, 'INCIDENT');
});
test('exact existing verifier reuse with synthetic transport', async t => {
  const f = fixture(t); let count = 0;
  const check = createVerifier({ get: async () => { count++; return { status: 403, type: 'text/html', text: 'PRIVATE_SENTINEL' } } });
  assert.equal((await f.run(check)).outcome, 'DEGRADED'); assert.equal(count, 1);
});
test('overlapping invocations fail closed before second probe', async t => {
  const f = fixture(t); let release; const waiting = new Promise(r => { release = r });
  const first = f.run(async () => { await waiting; return healthy() });
  assert.equal((await f.run(() => assert.fail('second probe'))).reason, 'state_unavailable');
  release(); assert.equal((await first).outcome, 'OK');
});
for (const kind of ['corrupt', 'symlink', 'mode', 'hardlink', 'pending']) test('reject unsafe state: ' + kind, async t => {
  const f = fixture(t), file = path.join(f.dir, 'state.json');
  if (kind === 'symlink') fs.symlinkSync('/does/not/exist', file);
  else if (kind === 'pending') fs.writeFileSync(path.join(f.dir, '.pending-interrupted'), '', { mode: 0o600 });
  else { fs.writeFileSync(file, 'corrupt PRIVATE_SENTINEL', { mode: kind === 'mode' ? 0o644 : 0o600 }); if (kind === 'hardlink') fs.linkSync(file, file + '.copy'); }
  const result = await f.run(() => assert.fail('unsafe probe')); assert.equal(result.outcome, 'BLOCKED');
  assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));
});
test('symlink directory and unsafe directory permissions rejected', async t => {
  const f = fixture(t), alias = f.dir + '-alias'; fs.symlinkSync(f.dir, alias); t.after(() => fs.unlinkSync(alias));
  assert.throws(() => openState(alias)); fs.chmodSync(f.dir, 0o755); assert.throws(() => openState(f.dir));
});
test('atomic-write interruption retains durable pending and crash interlock', async t => {
  const f = fixture(t); await f.run(bad);
  const storeFactory = d => openState(d, { ...fs, renameSync() { throw Error('PRIVATE_SENTINEL') } });
  const result = await f.run(bad, { storeFactory }); assert.equal(result.outcome, 'BLOCKED'); assert.equal(f.sends.length, 0);
  assert.ok(fs.existsSync(path.join(f.dir, 'monitor.lock')));
  assert.equal((await f.run()).outcome, 'BLOCKED');
});
test('partial writes complete and file/directory durability errors prevent sends', async t => {
  const f = fixture(t);
  const io = { ...fs, writeSync(fd, bytes, offset, length) { return fs.writeSync(fd, bytes, offset, Math.min(3, length)); } };
  assert.equal((await f.run(bad, { storeFactory: d => openState(d, io) })).outcome, 'DEGRADED');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir, 'state.json'))).failures, 1);
  const failing = { ...fs, fsyncSync() { throw Error('PRIVATE_SENTINEL'); } };
  assert.equal((await f.run(bad, { storeFactory: d => openState(d, failing) })).outcome, 'BLOCKED');
  assert.equal(f.sends.length, 0); assert.ok(fs.existsSync(path.join(f.dir, 'monitor.lock')));
});
test('foreign ancestor ownership is rejected before opening any files', async t => {
  const f = fixture(t); let opens = 0;
  const io = { ...fs, lstatSync(p) { const s = fs.lstatSync(p); if (p === path.dirname(f.dir)) s.uid = process.geteuid() + 123; return s; }, openSync() { opens++; assert.fail('unsafe open'); } };
  assert.throws(() => openState(f.dir, io)); assert.equal(opens, 0);
});
test('persist attempt before send; crash-like send throw retains same event', async t => {
  const f = fixture(t); await f.run(bad);
  const result = await f.run(bad, { notify: async () => { const s = JSON.parse(fs.readFileSync(path.join(f.dir, 'state.json'))); assert.equal(s.pending.attempts, 1); throw Error('PRIVATE_SENTINEL') } });
  assert.equal(result.outcome, 'PENDING'); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
test('clock rollback blocks before probe/delivery; no freshness from snapshotAt', async t => {
  const f = fixture(t); await f.run();
  assert.equal((await f.run(() => assert.fail('clock'), { now: () => 1 })).reason, 'clock_discontinuity');
  assert.ok(!fs.readFileSync(path.join(f.dir, 'state.json'), 'utf8').includes('snapshotAt'));
});
test('signal cancellation does not send or record healthy outcome', async t => {
  const f = fixture(t), controller = new AbortController();
  const result = await f.run(() => { controller.abort(); return healthy() }, { signal: controller.signal });
  assert.equal(result.outcome, 'BLOCKED'); assert.equal(f.sends.length, 0);
});
test('state/output/payload privacy and bounded private permissions', async t => {
  const f = fixture(t); await f.run(bad); const result = await f.run(bad);
  const bytes = fs.readFileSync(path.join(f.dir, 'state.json'), 'utf8');
  assert.ok(!bytes.includes('PRIVATE_SENTINEL')); assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));
  assert.equal(fs.statSync(path.join(f.dir, 'state.json')).mode & 0o777, 0o600);
  assert.ok(bytes.length < 2048); assert.ok(JSON.stringify(result).length < 512);
});
for (const url of ['http://alerts.example.invalid/', 'https://user:password@alerts.example.invalid/', 'https://alerts.example.invalid/?q=private', 'https://alerts.example.invalid/#private', 'https://alerts.example.invalid/?', 'https://alerts.example.invalid/#', 'not-url']) test('receiver URL rejected: ' + url.split(':')[0], () => {
  assert.throws(() => createNotifier({ url, token: 'synthetic-token-123456' }));
});
test('missing delivery config blocks --run without state or GET', async () => {
  let output = ''; assert.equal(await main(['--run'], {}, x => { output = x }), 2);
  assert.equal(JSON.parse(output).reason, 'delivery_not_configured');
});
test('token trailing line terminator is rejected during config validation', () => {
  assert.throws(() => createNotifier({ url: 'https://alerts.example.invalid/', token: 'a'.repeat(16) + '\n' }));
});
test('private state must not be placed in the source checkout even with mocked0700', () => {
  const directory = path.resolve(import.meta.dirname, '../..'); let opens = 0;
  const io = { ...fs, lstatSync: () => ({ isDirectory: () => true, isSymbolicLink: () => false, uid: process.geteuid(), mode: 0o700 }), openSync() { opens++; throw Error('unexpected write boundary'); } };
  assert.throws(() => openState(directory, io)); assert.equal(opens, 0);
});
test('actual CLI exit codes and stderr are bounded with synthetic missing config', () => {
  const file = path.join(import.meta.dirname, 'monitor-go-production.mjs');
  for (const [args, exit] of [[[],0],[['--offline'],0],[['--run'],2],[['--unknown'],2]]) {
    const r = spawnSync(process.execPath, [file, ...args], { env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 2000 });
    assert.equal(r.status, exit); assert.equal(r.stderr, ''); assert.ok(r.stdout.length < 512);
  }
});
test('source is manual only, reuses verifier, has no timer/service activation', () => {
  const monitor = fs.readFileSync(new URL('./monitor-go-production.mjs', import.meta.url), 'utf8');
  const state = fs.readFileSync(new URL('./monitor-state.mjs', import.meta.url), 'utf8');
  assert.match(monitor, /import \{ createVerifier \} from '\.\/verify-go-production\.mjs'/);
  assert.match(monitor, /check = \(\) => createVerifier\(\)\(\)/);
  assert.ok(!/setInterval|systemctl|crontab|spawn\(|execFile|https\.get|\/api\/products/.test(monitor + state));
  const release = fs.readFileSync(new URL('./check-go-release.mjs', import.meta.url), 'utf8');
  assert.ok(!/fetch\(|https\.request|docker.*load/.test(release));
});
test('process termination leaves interlock, no stale-lock auto repair', async t => {
  const f = fixture(t);
  const source = `import {openState} from ${JSON.stringify(new URL('./monitor-state.mjs', import.meta.url).href)}; openState(process.argv[1]); process.stdout.write('armed\\n'); setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ['--input-type=module','-e',source,f.dir], { stdio: ['ignore','pipe','pipe'] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  await once(child.stdout, 'data'); child.kill('SIGTERM'); await once(child, 'exit');
  assert.ok(fs.existsSync(path.join(f.dir, 'monitor.lock')));
  assert.equal((await f.run(() => assert.fail('crash probe'))).outcome, 'BLOCKED');
});
test('loopback integration: existing verifier, durable state and real HTTP delivery framing', async t => {
  const f = fixture(t), messages = []; let unavailable = false, gets = 0;
  const data = name => JSON.parse(fs.readFileSync(new URL(`../../contracts/examples/${name}.json`, import.meta.url)));
  const server = http.createServer((req, res) => {
    if (req.method === 'POST') { let body = ''; req.on('data', b => { body += b }); req.on('end', () => { messages.push({ body: JSON.parse(body), id: req.headers['idempotency-key'] }); res.writeHead(204); res.end(); }); return; }
    gets++; res.setHeader('content-type', 'application/json');
    if (unavailable) { res.writeHead(503); res.end('{}'); return; }
    const value = { '/health/live': { status: 'ok' }, '/health/ready': { status: 'ready' }, '/api/categories': data('categories'), '/api/products?limit=1': data('products').slice(0,1), '/api/dashboard': data('dashboard') }[req.url];
    res.end(JSON.stringify(value));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = 'http://127.0.0.1:' + server.address().port;
  const check = () => createVerifier({ get: async (url, options) => {
    const target = new URL(url); assert.equal(target.origin, 'https://api.aktau.market');
    const response = await fetch(base + target.pathname + target.search, { redirect: 'error', signal: AbortSignal.timeout(options.milliseconds) });
    return { status: response.status, type: response.headers.get('content-type'), text: await response.text() };
  } })();
  const notify = createNotifier({ url: 'https://alerts.example.invalid/', token: 'synthetic-token-123456' }, { request: (_url, options, callback) => http.request(base, options, callback) });
  assert.equal((await f.run(check, { notify })).outcome, 'OK'); unavailable = true;
  assert.equal((await f.run(check, { notify })).outcome, 'DEGRADED');
  assert.equal((await f.run(check, { notify })).outcome, 'INCIDENT'); unavailable = false;
  assert.equal((await f.run(check, { notify })).outcome, 'RECOVERED');
  assert.equal(gets, 12); assert.deepEqual(messages.map(m => m.body.type), ['incident_opened','incident_recovered']);
  assert.notEqual(messages[0].id, messages[1].id);
});
for (const kind of ['success', 'redirect', 'timeout', 'error', 'shutdown']) test('HTTPS notification ' + kind, async () => {
  let calls = 0, body, destroyed = false;
  const request = (url, options, callback) => {
    calls++; assert.equal(options.rejectUnauthorized, true); assert.equal(options.agent, false);
    assert.equal(options.method, 'POST'); assert.equal(options.headers['Idempotency-Key'], 'a'.repeat(32));
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token-123456');
    const req = new EventEmitter(); req.destroy = () => { destroyed = true }; req.end = b => {
      body = b; if (kind === 'timeout' || kind === 'shutdown') return;
      queueMicrotask(() => { if (kind === 'error') req.emit('error', Error('PRIVATE_SENTINEL')); else { const res = new EventEmitter(); res.statusCode = kind === 'redirect' ? 302 : 204; res.destroy = () => {}; callback(res) } });
    }; return req;
  };
  const notifier = createNotifier({ url: 'https://alerts.example.invalid/events', token: 'synthetic-token-123456' }, { request, timeoutMs: 5 });
  const c = new AbortController(); const pending = notifier({ type: 'incident_opened', atUTC: 100000, id: 'a'.repeat(32), PRIVATE_SENTINEL: 'not sent' }, c.signal);
  if (kind === 'shutdown') c.abort();
  assert.equal(await pending, kind === 'success'); assert.equal(calls, 1);
  assert.ok(!body.includes('PRIVATE_SENTINEL')); assert.ok(body.length < 256);
  assert.deepEqual(Object.keys(JSON.parse(body)).sort(), ['category','timestamp','type']);
  if (kind === 'timeout' || kind === 'shutdown') assert.equal(destroyed, true);
});
