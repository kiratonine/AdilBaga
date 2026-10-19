// LOCAL ONLY. Every network transport below is pinned to an owned loopback server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { once } from 'node:events';
import { spawn, spawnSync, execFileSync, execFile } from 'node:child_process';
import { mandatory } from '../deploy/auto-gate.mjs';
import { runMonitor, createNotifier } from './monitor-go-production.mjs';
import { createVerifier } from './verify-go-production.mjs';
import { renderUnits, writeUnits, main as renderMain } from './render-monitor-units.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const cleanEnv = { PATH: path.dirname(process.execPath) + ':' + process.env.PATH, HOME: process.env.HOME };
function owned(t, prefix = 'aktau-monitor-lifecycle-') {
  assert.notEqual(process.geteuid(), 0);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); fs.chmodSync(dir, 0o700);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir;
}
test('Security executes ops unconditionally and preserves exact nine-job identity', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  const names = [...workflow.matchAll(/^    name: (.+)$/gm)].map(m => m[1]);
  assert.deepEqual([...names].sort(), [...mandatory].sort());
  const security = workflow.slice(workflow.indexOf('  security:'), workflow.indexOf('  postgres:'));
  assert.match(security, /^      - run: node scripts\/ci\/run-checks\.mjs ops$/m);
  assert.ok(!/continue-on-error|if:/.test(security));
  assert.match(security, /node-version: '24\.10\.0'/);
});
test('actual ops CI subprocess propagates broken suite failure (isolated miniature root)', t => {
  const dir = owned(t, 'aktau-ops-ci-');
  fs.mkdirSync(path.join(dir, 'scripts/ci'), { recursive: true }); fs.mkdirSync(path.join(dir, 'scripts/ops'));
  for (const file of ['run-checks.mjs', 'common.mjs']) fs.copyFileSync(path.join(root, 'scripts/ci', file), path.join(dir, 'scripts/ci', file));
  const names = ['verify-go-production.test.mjs','monitor-go-production.test.mjs','check-go-release.test.mjs','monitor-lifecycle.test.mjs','telegram-notifier.test.mjs','telegram-lifecycle.test.mjs'];
  for (const name of names) fs.writeFileSync(path.join(dir, 'scripts/ops', name), "import {test} from 'node:test'; test('synthetic positive',()=>{});\n");
  const invoke = () => spawnSync(process.execPath, [path.join(dir, 'scripts/ci/run-checks.mjs'), 'ops'], { cwd: dir, env: cleanEnv, encoding: 'utf8', timeout: 20000, maxBuffer: 65536 });
  assert.equal(invoke().status, 0, 'positive control must execute the ops branch');
  fs.writeFileSync(path.join(dir, 'scripts/ops/monitor-go-production.test.mjs'), "import {test} from 'node:test'; import assert from 'node:assert/strict'; test('synthetic negative',()=>assert.fail('EXPECTED_FIXTURE_FAILURE'));\n");
  const result = invoke(); assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /EXPECTED_FIXTURE_FAILURE/);
});

// Test-only transport: fixed approved verifier requests are redirected ONLY to
// this test's owned loopback TLS fixture. Production request code is unchanged.
function loopbackTransport(base, ca) {
  assert.equal(new URL(base).hostname, '127.0.0.1');
  return (url, { cap, milliseconds }) => new Promise((resolve, reject) => {
    const target = new URL(url); assert.equal(target.origin, 'https://api.aktau.market');
    let request, timer;
    timer = setTimeout(() => { request.destroy(); reject(Error('fixture_timeout')); }, milliseconds);
    request = https.get(base + target.pathname + target.search, { ca, agent: false, rejectUnauthorized: true }, response => {
      let count = 0; const chunks = [];
      response.on('data', chunk => { count += chunk.length; if (count > cap) { response.destroy(); clearTimeout(timer); reject(Error('fixture_limit')); } else chunks.push(chunk); });
      response.on('error', () => { clearTimeout(timer); reject(Error('fixture_transport')); });
      response.on('end', () => { clearTimeout(timer); resolve({ status: response.statusCode, type: response.headers['content-type'], text: Buffer.concat(chunks).toString('utf8') }); });
    });
    request.on('error', () => { clearTimeout(timer); reject(Error('fixture_transport')); });
  });
}
async function tlsFixture(t) {
  assert.notEqual(process.geteuid(), 0);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aktau-monitor-tls-')); fs.chmodSync(dir, 0o700);
  const children = new Set(), sockets = new Set(); let server;
  t.after(async () => {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await once(child, 'exit'); }
    for (const socket of sockets) socket.destroy();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const key = path.join(dir, 'fixture.key'), cert = path.join(dir, 'fixture.pem'), state = path.join(dir, 'state');
  fs.mkdirSync(state, { mode: 0o700 });
  execFileSync('openssl', ['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-days','1',
    '-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout',key,'-out',cert],
  { env: cleanEnv, stdio: 'ignore', timeout: 10000 });
  fs.chmodSync(key, 0o600); fs.chmodSync(cert, 0o600);
  assert.equal(fs.statSync(key).uid, process.geteuid()); assert.equal(fs.statSync(key).mode & 0o777, 0o600);
  const token = 'synthetic-lifecycle-token-12345', ca = fs.readFileSync(cert), receipt = path.join(dir, 'receipts.json');
  let accepted;
  const f = { dir, state, ca, token, mode: 'normal', apiHealthy: true, utc: 100000,
    gets: 0, posts: 0, duplicates: 0, unauthorized: 0, attemptChecks: [], outputs: [] };
  const persist = next => {
    const file = receipt + '.pending', fd = fs.openSync(file, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(next)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(file, receipt); const dfd = fs.openSync(dir, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
    try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); }
  };
  const data = name => JSON.parse(fs.readFileSync(path.join(root, 'contracts/examples', name + '.json')));
  const products = data('products').slice(0,1); products[0].name = 'PRIVATE_PRODUCT_SENTINEL';
  const bodies = { '/health/live': { status: 'ok' }, '/health/ready': { status: 'ready' },
    '/api/categories': data('categories'), '/api/products?limit=1': products, '/api/dashboard': data('dashboard') };
  server = https.createServer({ key: fs.readFileSync(key), cert: ca }, (req, res) => {
    if (req.method === 'GET' && Object.hasOwn(bodies, req.url)) {
      f.gets++; res.setHeader('content-type', 'application/json'); res.statusCode = f.apiHealthy ? 200 : 503;
      res.end(JSON.stringify(f.apiHealthy ? bodies[req.url] : {})); return;
    }
    if (req.method !== 'POST' || req.url !== '/alerts') { res.writeHead(404); res.end(); return; }
    f.posts++;
    if (req.headers.authorization !== 'Bearer ' + token) { f.unauthorized++; res.writeHead(401); res.end(); return; }
    if (f.mode === 'reject') { res.writeHead(503); res.end(); return; }
    let body = ''; req.on('data', b => { body += b; if (body.length > 1024) req.destroy(); });
    req.on('end', () => {
      let value; try { value = JSON.parse(body); } catch { res.writeHead(400); res.end(); return; }
      const id = req.headers['idempotency-key'];
      if (!/^[a-f0-9]{32}$/.test(id ?? '') || id.length !== 32 || value.category !== 'go_api_unavailable'
        || !['incident_opened','incident_recovered'].includes(value.type)
        || Object.keys(value).sort().join() !== 'category,timestamp,type') { res.writeHead(400); res.end(); return; }
      if (fs.existsSync(path.join(state, 'state.json'))) {
        const s = JSON.parse(fs.readFileSync(path.join(state, 'state.json')));
        f.attemptChecks.push(s.pending?.id === id && s.pending.attempts >= 1);
      }
      const rows = fs.existsSync(receipt) ? JSON.parse(fs.readFileSync(receipt)) : [];
      const prior = rows.find(r => r.id === id);
      if (prior && ['type','timestamp','category'].some(k => prior[k] !== value[k])) { res.writeHead(409); res.end(); return; }
      if (prior) f.duplicates++; else persist([...rows, { id, ...value }]);
      accepted?.(); accepted = null;
      if (f.mode === 'lost') req.socket.destroy();
      else if (f.mode !== 'hold') { res.writeHead(204); res.end(); }
    });
  });
  server.on('tlsClientError', () => {}); // Expected untrusted-certificate negative; no raw TLS error output.
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  f.base = 'https://127.0.0.1:' + server.address().port;
  f.notifier = (trusted = true, timeoutMs = 5000, credential = token) => createNotifier({ url: f.base + '/alerts', token: credential },
    trusted ? { timeoutMs, request: (url, options, callback) => https.request(url, { ...options, ca }, callback) } : { timeoutMs });
  f.waitAccepted = () => new Promise(resolve => { accepted = resolve; });
  f.receipts = () => fs.existsSync(receipt) ? JSON.parse(fs.readFileSync(receipt)) : [];
  const childFile = path.join(dir, 'cycle.mjs');
  fs.writeFileSync(childFile, `import assert from 'node:assert/strict'; import fs from 'node:fs'; import https from 'node:https';
import {runMonitor,createNotifier} from ${JSON.stringify(new URL('./monitor-go-production.mjs', import.meta.url).href)};
import {createVerifier} from ${JSON.stringify(new URL('./verify-go-production.mjs', import.meta.url).href)};
const base=process.env.FIXTURE_BASE,ca=fs.readFileSync(process.env.FIXTURE_CA);
const get=(${loopbackTransport.toString()})(base,ca);
const notify=createNotifier({url:base+'/alerts',token:process.env.FIXTURE_TOKEN},{request:(u,o,c)=>https.request(u,{...o,ca},c)});
const result=await runMonitor({directory:process.env.FIXTURE_STATE,check:()=>createVerifier({get})(),notify,now:()=>Number(process.env.FIXTURE_UTC)});
process.stdout.write(JSON.stringify(result));\n`, { mode: 0o600 });
  const childEnv = () => ({ ...cleanEnv, FIXTURE_BASE: f.base, FIXTURE_CA: cert, FIXTURE_TOKEN: token, FIXTURE_STATE: state, FIXTURE_UTC: String(f.utc) });
  f.run = async () => {
    const { stdout, stderr } = await new Promise((resolve, reject) => {
      const child = execFile(process.execPath, [childFile], { env: childEnv(), timeout: 10000, maxBuffer: 8192 }, (error, stdout, stderr) => {
        children.delete(child); if (error) reject(error); else resolve({ stdout, stderr });
      }); children.add(child);
    });
    assert.equal(stderr, ''); f.outputs.push(stdout); return JSON.parse(stdout);
  };
  f.spawn = () => { const child = spawn(process.execPath, [childFile], { env: childEnv(), stdio: ['ignore','pipe','pipe'] }); children.add(child); return child; };
  return f;
}

test('real HTTPS, independent processes: healthy→degraded→incident→recovery; durable authenticated dedup', { timeout: 30000 }, async t => {
  const f = await tlsFixture(t);
  assert.equal((await f.run()).outcome, 'OK'); f.apiHealthy = false;
  assert.equal((await f.run()).outcome, 'DEGRADED'); assert.equal((await f.run()).outcome, 'INCIDENT');
  assert.equal((await f.run()).outcome, 'INCIDENT'); assert.equal(f.receipts().length, 1);
  f.apiHealthy = true; assert.equal((await f.run()).outcome, 'RECOVERED'); assert.equal((await f.run()).outcome, 'OK');
  assert.deepEqual(f.receipts().map(r => r.type), ['incident_opened','incident_recovered']);
  assert.equal(f.posts, 2); assert.ok(f.attemptChecks.every(Boolean));
  const state = fs.readFileSync(path.join(f.state, 'state.json'), 'utf8');
  for (const sentinel of [f.token, f.base, 'Authorization', 'PRIVATE_PRODUCT_SENTINEL']) assert.ok(!state.includes(sentinel) && f.outputs.every(s => !s.includes(sentinel)));
  assert.equal(fs.statSync(f.state).mode & 0o777, 0o700); assert.equal(fs.statSync(path.join(f.state, 'state.json')).mode & 0o777, 0o600);
});
test('native HTTPS rejects untrusted TLS and wrong bearer before durable acceptance', { timeout: 15000 }, async t => {
  const f = await tlsFixture(t), event = { id: 'a'.repeat(32), type: 'incident_opened', atUTC: 100000 };
  assert.equal(await f.notifier(false)(event), false); assert.equal(f.posts, 0);
  assert.equal(await f.notifier(true, 5000, 'wrong-synthetic-token')(event), false); assert.equal(f.unauthorized, 1);
  assert.equal(f.receipts().length, 0);
});
test('lost reply AFTER durable acceptance: pending restart + same ID, receiver dedup, ordered recovery', { timeout: 20000 }, async t => {
  const f = await tlsFixture(t); f.apiHealthy = false; await f.run(); f.mode = 'lost';
  assert.equal((await f.run()).outcome, 'PENDING'); assert.equal(f.receipts().length, 1);
  const id = f.receipts()[0].id, gets = f.gets, posts = f.posts;
  assert.equal((await f.run()).reason, 'delivery_cooldown'); assert.equal(f.posts, posts); assert.equal(f.gets, gets);
  f.mode = 'normal'; f.utc += 60000; assert.equal((await f.run()).outcome, 'DELIVERED');
  assert.equal(f.receipts().length, 1); assert.equal(f.receipts()[0].id, id); assert.equal(f.duplicates, 1); assert.equal(f.gets, gets);
  f.apiHealthy = true; assert.equal((await f.run()).outcome, 'RECOVERED'); assert.equal(f.receipts().length, 2);
});
test('non2xx exhaustion stops probes/delivery; availability alone cannot reset reconciliation STOP', { timeout: 20000 }, async t => {
  const f = await tlsFixture(t); f.mode = 'reject'; f.apiHealthy = false; await f.run(); await f.run();
  f.utc += 60000; await f.run(); f.utc += 60000; await f.run(); const posts = f.posts, gets = f.gets;
  f.utc += 60000; f.mode = 'normal'; f.apiHealthy = true;
  assert.equal((await f.run()).reason, 'delivery_exhausted'); assert.equal(f.posts, posts); assert.equal(f.gets, gets); assert.equal(f.receipts().length, 0);
});
test('real TLS timeout is ambiguous acceptance, retained locally, no transport retry', { timeout: 15000 }, async t => {
  const f = await tlsFixture(t); f.mode = 'hold';
  const accepted = f.waitAccepted(), response = f.notifier(true)({ id: 'c'.repeat(32), type: 'incident_opened', atUTC: 100000 });
  await accepted; assert.equal(await response, false); // Real unchanged5000ms deadline, not a short handshake race.
  assert.equal(f.posts, 1); assert.equal(f.receipts().length, 1);
});
test('SIGTERM after durable receiver acceptance retains crash lock; next process makes0 GET/POST', { timeout: 15000 }, async t => {
  const f = await tlsFixture(t); f.apiHealthy = false; await f.run(); f.mode = 'hold';
  const accepted = f.waitAccepted(), child = f.spawn(); await accepted;
  const activeGets = f.gets, activePosts = f.posts;
  assert.equal((await f.run()).outcome, 'BLOCKED'); assert.equal(child.exitCode, null);
  assert.equal(f.gets, activeGets); assert.equal(f.posts, activePosts);
  child.kill('SIGTERM'); await once(child, 'exit');
  assert.ok(fs.existsSync(path.join(f.state, 'monitor.lock'))); assert.equal(f.receipts().length, 1);
  const pending = JSON.parse(fs.readFileSync(path.join(f.state, 'state.json'))).pending; assert.equal(pending.attempts, 1);
  const gets = f.gets, posts = f.posts; assert.equal((await f.run()).outcome, 'BLOCKED'); assert.equal(f.gets, gets); assert.equal(f.posts, posts);
});

test('inactive units render privately and systemd-analyze verifies expanded syntax, no installation', t => {
  const dir = owned(t, 'aktau-monitor-units-');
  const parameters = { user: 'monitor-fixture', node: '/usr/bin/node', source: '/opt/aktau-monitor/releases/' + 'a'.repeat(40) };
  writeUnits(dir, parameters);
  const service = fs.readFileSync(path.join(dir, 'aktau-go-monitor.service'), 'utf8'), timer = fs.readFileSync(path.join(dir, 'aktau-go-monitor.timer'), 'utf8');
  assert.match(service, /^User=monitor-fixture$/m); assert.match(service, /^TimeoutStartSec=70s$/m);
  assert.match(service, /^KillMode=control-group$/m); assert.match(service, /^NoNewPrivileges=yes$/m);
  assert.match(service, /^ProtectSystem=strict$/m); assert.match(service, /^Restart=no$/m);
  assert.match(timer, /^Persistent=false$/m); assert.match(timer, /^OnUnitInactiveSec=5min$/m);
  assert.ok(!/\/[a-z]*\/?sh |sudo |curl |systemctl |enable/.test(service));
  assert.ok(!/@[A-Z_]+@/.test(service));
  for (const name of fs.readdirSync(dir)) assert.equal(fs.statSync(path.join(dir, name)).mode & 0o777, 0o600);
  // A synthetic filesystem avoids assuming /usr/bin/node exists on NVM-only
  // WSL, or reading real host env/service files. No chroot/service is started.
  const virtual = path.join(dir, 'root'), units = path.join(virtual, 'etc/systemd/system');
  fs.mkdirSync(units, { recursive: true }); fs.mkdirSync(path.join(virtual, 'usr/bin'), { recursive: true });
  fs.copyFileSync(process.execPath, path.join(virtual, 'usr/bin/node')); fs.chmodSync(path.join(virtual, 'usr/bin/node'), 0o555);
  for (const [name, text] of Object.entries(renderUnits(parameters))) fs.writeFileSync(path.join(units, name), text);
  for (const name of ['basic','sysinit','shutdown','network-online','timers']) fs.writeFileSync(path.join(units, name + '.target'), '[Unit]\nDescription=Synthetic local verification target\nDefaultDependencies=no\n');
  execFileSync('systemd-analyze', ['verify','--root=' + virtual,'--man=no','aktau-go-monitor.service','aktau-go-monitor.timer'],
    { env: cleanEnv, timeout: 10000, maxBuffer: 16384, stdio: ['ignore','pipe','pipe'] });
  // This validates syntax/dependencies, not actual sandbox/user provisioning.
  assert.throws(() => writeUnits(dir, parameters));
});
for (const change of [
  { user: 'root' }, { user: 'operator\nUser=root' }, { user: 'operator;command' },
  { node: '/home/operator/node' }, { node: '/usr/bin/node%u/node' }, { node: '/usr/bin/../bin/node' },
  { source: '/opt/aktau-monitor/releases/' + 'a'.repeat(39) }, { source: '/opt/aktau-monitor/releases/' + 'a'.repeat(40) + '\nExecStart=unsafe' },
]) test('unit renderer rejects unsafe parameter ' + Object.keys(change)[0], () => {
  assert.throws(() => renderUnits({ user: 'nobody', node: '/usr/bin/node', source: '/opt/aktau-monitor/releases/' + 'a'.repeat(40), ...change }));
});
test('renderer refuses symlink/nonprivate output and default remains write-free', t => {
  const dir = owned(t, 'aktau-monitor-units-'), link = dir + '-link';
  const p = { user: 'nobody', node: '/usr/bin/node', source: '/opt/aktau-monitor/releases/' + 'a'.repeat(40) };
  fs.symlinkSync(dir, link); t.after(() => fs.unlinkSync(link)); assert.throws(() => writeUnits(link, p));
  fs.chmodSync(dir, 0o755); assert.throws(() => writeUnits(dir, p));
  let output; assert.equal(renderMain([], s => { output = s }), 0); assert.equal(JSON.parse(output).installed, false);
  assert.deepEqual(fs.readdirSync(dir), []);
});
