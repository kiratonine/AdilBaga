import { test, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { calibrateClock, openReceiver } from './fifo-adapter.mjs';
import { fixtureManifest, fixtureBody } from './fixtures/c2-manifest.mjs';
import { createSyntheticProjectionProvider } from './projection-provider.mjs';
import { projectionPair, fixtureS1 } from './fixtures/projection-v2.mjs';
import { buildManifest } from './c2-manifest.mjs';

for (const scenario of ['after_11s', 'after_70s', 'deadline', 'non204', 'reboot', 'refresh_failure', 'consume_failure', 'late_after']) {
  test(`production persistent FIFO virtual-clock OS mock: ${scenario}`, () => {
    const child = String.raw`
      import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
      import cp from 'node:child_process'; import https from 'node:https';
      import { EventEmitter } from 'node:events'; import { syncBuiltinESMExports } from 'node:module';
      import { promisify } from 'node:util'; import { createHash } from 'node:crypto'; import assert from 'node:assert/strict';
      const { projectionPair } = await import('./scripts/revalidation/fixtures/projection-v2.mjs');
      const { fixtureBody } = await import('./scripts/revalidation/fixtures/c2-manifest.mjs');
      const { buildManifest } = await import('./scripts/revalidation/c2-manifest.mjs');
      const scenario=process.argv[1], pair=projectionPair(), manifest=buildManifest(pair).manifest;
      const attemptId=pair.attemptId, uid=process.geteuid(), boot=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();
      const dir=fs.mkdtempSync(path.join(os.tmpdir(),'c2-persistent-'));fs.chmodSync(dir,0o700);
      const fifo=path.join(dir,'event');cp.execFileSync('mkfifo',['-m','600',fifo]);
      const bytes=Buffer.from([127,69,76,70,1]);const digest=createHash('sha256').update(bytes).digest('hex');
      const approval={version:1,approved:true,sourceSha:'b'.repeat(40),binarySha256:digest,clockSha256:digest,buildId:'test',platform:'linux/amd64'};
      const deployment={version:1,attemptId,stage:'before',alias:'aktau.market',deploymentId:'dpl_test',frontendSha:'c'.repeat(40),ready:true,target:'Production',confirmedAt:Date.now(),optInInactive:false,legitimatePublication:true};
      const original={lstat:fs.lstatSync,open:fs.openSync,stat:fs.fstatSync,read:fs.readFileSync,close:fs.closeSync,readSync:fs.readSync};
      let serial=90000, fifoOpens=0, fifoCloses=0, fifoFD=null, clockCalls=0, getCalls=0, committed=0, sent=false, now=1000000000n;
      const files=new Map(), root=p=>typeof p==='string'&&(p.startsWith('/etc/aktau-c2')||p.startsWith('/usr/local/libexec/aktau-c2')||p.startsWith('/var/lib/aktau-sync'));
      const stat=(p,dir=false)=>({uid:p.endsWith('reader.dsn')?uid:0,mode:dir?0o40755:p.endsWith('reader.dsn')?0o100600:0o100555,size:1000,nlink:1,isDirectory:()=>dir,isFile:()=>!dir,isSymbolicLink:()=>false});
      fs.lstatSync=(p,...a)=>root(p)||['/etc','/usr','/usr/local','/usr/local/libexec','/var','/var/lib'].includes(p)?stat(p,true):original.lstat(p,...a);
      fs.openSync=(p,...a)=>{if(root(p)){files.set(++serial,p);return serial}const fd=original.open(p,...a);if(p===fifo){fifoFD=fd;fifoOpens++}return fd};
      fs.fstatSync=(fd,...a)=>files.has(fd)?stat(files.get(fd)):original.stat(fd,...a);
      fs.readFileSync=(fd,...a)=>{if(!files.has(fd))return original.read(fd,...a);const p=files.get(fd);if(p.endsWith('authorization.json'))return Buffer.from(JSON.stringify(approval)+'\n');if(p.endsWith('deployment.json'))return Buffer.from(JSON.stringify(deployment)+'\n');if(p.endsWith('reader.dsn'))return 'postgres://aktau_api_runtime:synthetic@fixture.invalid:5432/test';return bytes};
      fs.closeSync=(fd,...a)=>{if(files.has(fd))return files.delete(fd);if(fd===fifoFD)fifoCloses++;return original.close(fd,...a)};
      const fake=()=>{};fake[promisify.custom]=async(file,args)=>{
        if(args[0]==='clock'){clockCalls++;if(scenario==='refresh_failure'&&clockCalls>5)throw Error('probe');return{stdout:JSON.stringify({bootId:boot,monoNs:now.toString()})}}
        const p=args[args.indexOf('-phase')+1]==='before'?pair.before:pair.after;
        if(scenario==='late_after'&&args[args.indexOf('-phase')+1]==='after')now+=42_000_000_000n;
        p.provenance.canonicalStateId=createHash('sha256').update(JSON.stringify(p.body)).digest('hex');return{stdout:JSON.stringify(p)+'\n'};
      };cp.execFile=fake;
      https.request=(options,callback)=>{
        assert.equal(options.method,'GET');assert.equal(options.hostname,'aktau.market');getCalls++;
        const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{
          const res=new EventEmitter();res.statusCode=200;res.headers={};res.destroy=()=>{};callback(res);
          res.emit('data',Buffer.from(fixtureBody(manifest.targets.find(t=>t.path===options.path))));res.emit('end');
        });return req;
      };syncBuiltinESMExports();
      const api=await import('./scripts/revalidation/projection-provider.mjs');
      const adapter=await import('./scripts/revalidation/fifo-adapter.mjs');
      const provider=api.createProductionProjectionProvider();const before=await provider.before(attemptId);assert.ok(before);
      const realMono=process.hrtime.bigint, timer=global.setTimeout;
      process.hrtime.bigint=()=>now;
      // Advance only FIFO wait sleeps. Existing HTTP request timeouts remain real.
      global.setTimeout=(fn,ms,...args)=>ms===10?setImmediate(()=>{now+=250000000n;fn(...args)}):timer(fn,ms,...args);
      const at=scenario==='after_11s'?11n:scenario==='late_after'?2060n:70n;
      fs.readSync=(fd,...a)=>{
        if(fd===fifoFD&&!sent&&scenario!=='deadline'&&now>=at*1000000000n){
          sent=true;const event={version:1,snapshotId:pair.after.snapshotId,attemptId,status:scenario==='non204'?200:204,startMono:(now-10000000n).toString(),endMono:(now-1000000n).toString(),bootId:scenario==='reboot'?'00000000-0000-0000-0000-000000000000':boot,errorClass:'none'};
          const writer=original.open(fifo,fs.constants.O_WRONLY|fs.constants.O_NONBLOCK);fs.writeSync(writer,JSON.stringify(event)+'\n');original.close(writer);
        }return original.readSync(fd,...a);
      };
      try{
        const calibration=await adapter.calibrateProductionClock(provider);
        const receiver=adapter.openPersistentReceiver({fifo,attemptId,calibration,before,provider});
        const result=await receiver.observe({onEvent:()=>{if(scenario==='consume_failure')throw Error('fsync_failure');committed++}});
        assert.equal(fifoOpens,1);assert.equal(fifoCloses,1);
        if(scenario==='after_11s'||scenario==='after_70s'){assert.equal(result.acceptance,'PASS');assert.equal(getCalls,6);assert.equal(committed,1);if(scenario==='after_70s')assert.ok(clockCalls>5)}
        else if(scenario==='late_after'){
          assert.equal(result.acceptance,'INCONCLUSIVE');assert.equal(result.reason,'supervision_expired');
          assert.equal(getCalls,6);assert.equal(committed,1);assert.ok(now>2101000000000n);
        }else{assert.equal(result.acceptance,'INCONCLUSIVE');assert.equal(getCalls,0)}
        if(scenario==='deadline')assert.ok(now<=2101250000000n);
      }finally{process.hrtime.bigint=realMono;global.setTimeout=timer;fs.rmSync(dir,{recursive:true})}
    `;
    execFileSync(process.execPath, ['--input-type=module', '-e', child, scenario], { cwd: new URL('../../', import.meta.url),
      env: { PATH: '/usr/bin:/bin' }, timeout: 15000, maxBuffer: 4096 });
  });
}

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
  return { dir, fifo, attemptId, calibration, manifest: fixtureManifest(snapshotId, attemptId) };
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
  const child = await exec(probe, ['notify', String(status), config.fifo, snapshotId], { env: { ...env, C2_EVENT_ATTEMPT_ID: config.attemptId }, timeout: 10000, maxBuffer: 2048 });
  const summary = JSON.parse(child.stdout), result = await observing;
  assert.equal(summary.published, true); assert.equal(summary.requests, 1); assert.equal(summary.relay, 'sent');
  assert.equal(summary.outcome, status === 200 || status === 204 ? 'success' : 'degraded');
  assert.equal(result.acceptance, status === 204 ? 'PASS' : 'INCONCLUSIVE');
  assert.equal(counts.n, status === 204 ? 6 : 0);
  if (status === 0) assert.equal(summary.errorClass, 'timeout');
});
test('no reader / crashed receiver does not change publication/notification', async () => {
  const c = setup(); const receiver = openReceiver(c); receiver.close();
  const child = await exec(probe, ['notify', '204', c.fifo, snapshotId], { env: { ...env, C2_EVENT_ATTEMPT_ID: c.attemptId }, timeout: 2000, maxBuffer: 2048 });
  const summary = JSON.parse(child.stdout);
  assert.equal(summary.published, true); assert.equal(summary.outcome, 'success'); assert.equal(summary.requests, 1); assert.equal(summary.relay, 'skipped');
});
for (const [name, overrides, reason] of [
  ['bad bootId', { bootId: '22222222-2222-4222-8222-222222222222' }, 'boot_mismatch'],
  ['wrong snapshot for manifest', { snapshotId: '22222222-2222-4222-8222-222222222222' }, 'manifest_unverified'],
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

for (const [name, value] of [
  ['absent', undefined], ['empty', ''], ['uppercase', 'A'.repeat(32)], ['nonhex', 'g'.repeat(32)],
  ['short', 'a'.repeat(31)], ['long', 'a'.repeat(33)], ['newline', 'a'.repeat(32) + '\n'],
]) test(`Go env attempt ${name}: publication success, trace skipped, one POST only`, async () => {
  const c = setup(), counts = { n: 0 }, receiver = openReceiver(c);
  const childEnv = { ...env }; if (value !== undefined) childEnv.C2_EVENT_ATTEMPT_ID = value;
  const child = await exec(probe, ['notify', '204', c.fifo, snapshotId], { env: childEnv, timeout: 2000, maxBuffer: 2048 });
  const summary = JSON.parse(child.stdout);
  assert.equal(summary.published, true); assert.equal(summary.outcome, 'success'); assert.equal(summary.requests, 1);
  assert.equal(summary.relay, 'skipped'); assert.equal(summary.status, 0); // no trace attached
  const r = await receiver.observe({ get: getter(c, counts), waitMs: 20 });
  assert.equal(r.reason, 'event_missing'); assert.equal(counts.n, 0);
});

test('pre-armed receiver learns actual Go snapshot from event, correlated by env attempt', async () => {
  const c = setup(), counts = { n: 0 };
  const actualSnapshot = '33333333-3333-4333-8333-333333333333';
  c.manifest = fixtureManifest(actualSnapshot, c.attemptId); // independent fixture reference
  assert.equal(Object.hasOwn(c, 'snapshotId'), false);
  const receiver = openReceiver(c), observing = receiver.observe({ get: getter(c, counts) });
  const child = await exec(probe, ['notify', '204', c.fifo, actualSnapshot], { env: { ...env, C2_EVENT_ATTEMPT_ID: c.attemptId }, timeout: 2000, maxBuffer: 2048 });
  const summary = JSON.parse(child.stdout), r = await observing;
  assert.equal(summary.requests, 1); assert.equal(summary.relay, 'sent'); assert.equal(r.acceptance, 'PASS'); assert.equal(counts.n, 6);
});

test('snapshot learned from valid event without independent manifest never admits GET', async () => {
  const c = setup(), counts = { n: 0 }; delete c.manifest;
  const receiver = openReceiver(c), observing = receiver.observe({ get: getter(c, counts) }); write(c, event(c));
  const r = await observing; assert.equal(r.reason, 'manifest_unverified'); assert.equal(counts.n, 0);
});

test('ancestor owned by another uid is rejected even when mode0755 is not group/world writable', () => {
  const c = setup(), ancestor = path.dirname(c.dir), original = fs.lstatSync;
  try {
    mock.method(fs, 'lstatSync', (p, ...args) => {
      const st = original(p, ...args);
      if (p === ancestor) { st.uid = process.geteuid() + 12345; st.mode = 0o40755 }
      return st;
    });
    assert.throws(() => openReceiver(c), /unsafe_fifo/);
  } finally { mock.restoreAll() }
});

for (const id of ['a'.repeat(32) + '\n', 'A'.repeat(32)]) test('invalid receiver attempt encoding => INCONCLUSIVE/0 GET', async () => {
  const c = setup(), counts = { n: 0 };
  const r = await openReceiver({ ...c, attemptId: id }).observe({ get: getter(c, counts) });
  assert.equal(r.reason, 'invalid_run'); assert.equal(counts.n, 0);
});

test('v2 real Go mock204 -> private FIFO -> BEFORE-only capture -> synthetic exec AFTER', async () => {
  const c = setup(), provider = createSyntheticProjectionProvider(), before = await provider.before(c.attemptId);
  const manifest = buildManifest(projectionPair(c.attemptId)).manifest;
  let calls = 0;
  const observing = openReceiver({ ...c, manifest: undefined, before, provider }).observe({ get: async p => {
    calls++; return { status: 200, headers: {}, text: fixtureBody(manifest.targets.find(t => t.path === p)) };
  } });
  const child = await exec(probe, ['notify', '204', c.fifo, fixtureS1], { env: { ...env, C2_EVENT_ATTEMPT_ID: c.attemptId }, timeout: 2000, maxBuffer: 2048 });
  const r = await observing;
  assert.equal(JSON.parse(child.stdout).requests, 1); assert.equal(r.acceptance, 'PASS'); assert.equal(calls, 6);
  assert.equal(r.event.receipt.snapshotId, fixtureS1);
  assert.ok(BigInt(r.event.receipt.endMono) >= BigInt(r.event.receipt.startMono));
  assert.ok(Object.isFrozen(r.event.receipt));
});

test('v2 fixture-only receiver has no default public transport', async () => {
  const c = setup(), provider = createSyntheticProjectionProvider(), before = await provider.before(c.attemptId);
  const observing = openReceiver({ ...c, before, provider }).observe(); write(c, event(c, { snapshotId: fixtureS1 }));
  const r = await observing; assert.equal(r.reason, 'fixture_transport_required'); assert.equal(r.request_count, 0);
});

test('v2 forged provider cannot substitute AFTER or admit GET', async () => {
  const c = setup(), real = createSyntheticProjectionProvider(), before = await real.before(c.attemptId);
  let calls = 0;
  const forged = { fixtureOnly: true, after: () => assert.fail('untrusted callback') };
  const observing = openReceiver({ ...c, before, provider: forged }).observe({ get: () => { calls++; assert.fail('no GET') } });
  write(c, event(c, { snapshotId: fixtureS1 }));
  assert.equal((await observing).reason, 'manifest_unverified'); assert.equal(calls, 0);
});
