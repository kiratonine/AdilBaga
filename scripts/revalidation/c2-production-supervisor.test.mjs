import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mock } from 'node:test';
import { openAttemptLedger } from './c2-production-supervisor.mjs';
import { execFileSync } from 'node:child_process';

for (const scenario of ['frontendSha', 'deploymentId', 'confirmedAt', 'stable']) {
  test(`isolated supervisor BEFORE attestation: ${scenario}`, () => {
    const script = String.raw`
      import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import cp from 'node:child_process';
      import https from 'node:https';import {EventEmitter} from 'node:events';import {syncBuiltinESMExports} from 'node:module';
      import {promisify} from 'node:util';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
      const scenario=process.argv[1],uid=process.geteuid();assert.notEqual(uid,0);
      const dir=fs.mkdtempSync(path.join(os.tmpdir(),'c2-supervisor-'));fs.chmodSync(dir,0o700);
      fs.mkdirSync(path.join(dir,'ledger'),{mode:0o700});
      const {projectionPair}=await import('./scripts/revalidation/fixtures/projection-v2.mjs');
      const {fixtureBody}=await import('./scripts/revalidation/fixtures/c2-manifest.mjs');
      const {buildManifest}=await import('./scripts/revalidation/c2-manifest.mjs');
      const boot=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();
      const bytes=Buffer.from([127,69,76,70,1]),digest=createHash('sha256').update(bytes).digest('hex');
      const approval={version:1,approved:true,sourceSha:'b'.repeat(40),binarySha256:digest,clockSha256:digest,buildId:'test',platform:'linux/amd64'};
      const deployment={version:1,attemptId:null,stage:'before',alias:'aktau.market',deploymentId:'dpl_test',frontendSha:'c'.repeat(40),ready:true,target:'Production',confirmedAt:Date.now(),optInInactive:false,legitimatePublication:true};
      const original={};for(const k of ['lstatSync','openSync','fstatSync','readFileSync','closeSync','readSync','renameSync','unlinkSync','readdirSync','existsSync'])original[k]=fs[k];
      const base='/var/lib/aktau-sync/c2',map=p=>typeof p==='string'&&p.startsWith(base)?dir+p.slice(base.length):p;
      const root=p=>typeof p==='string'&&(p.startsWith('/etc/aktau-c2')||p.startsWith('/usr/local/libexec/aktau-c2')||p.endsWith('/reader.dsn'));
      const stats=(p,d=false)=>({uid:p.endsWith('reader.dsn')?uid:0,mode:d?0o40755:p.endsWith('reader.dsn')?0o100600:0o100555,size:1000,nlink:1,isDirectory:()=>d,isFile:()=>!d,isSymbolicLink:()=>false});
      let serial=90000,reads=0,readerOpens=0,gets=0,fifoFD=null,fifo=null,pair=null,manifest=null,sent=false,goBefore=0;
      const files=new Map();
      fs.lstatSync=(p,...a)=>{
        if(root(p)||['/etc','/usr','/usr/local','/usr/local/libexec','/var','/var/lib','/var/lib/aktau-sync'].includes(p))return stats(p,true);
        return original.lstatSync(map(p),...a);
      };
      fs.openSync=(p,...a)=>{if(root(p)){files.set(++serial,p);return serial}const fd=original.openSync(map(p),...a);if(typeof p==='string'&&p.endsWith('/event.fifo')){readerOpens++;fifoFD=fd}return fd};
      fs.fstatSync=(fd,...a)=>files.has(fd)?stats(files.get(fd)):original.fstatSync(fd,...a);
      fs.closeSync=(fd,...a)=>files.has(fd)?files.delete(fd):original.closeSync(fd,...a);
      fs.readFileSync=(fd,...a)=>{
        if(!files.has(fd))return original.readFileSync(map(fd),...a);
        const p=files.get(fd);if(p.endsWith('authorization.json'))return Buffer.from(JSON.stringify(approval)+'\n');
        if(p.endsWith('deployment.json')){
          if(++reads===2&&scenario!=='stable'){
            if(scenario==='frontendSha')deployment.frontendSha='d'.repeat(40);
            if(scenario==='deploymentId')deployment.deploymentId='dpl_drift';
            if(scenario==='confirmedAt')deployment.confirmedAt--;
          }return Buffer.from(JSON.stringify(deployment)+'\n');
        }
        if(p.endsWith('reader.dsn'))return 'postgres://aktau_api_runtime:synthetic@fixture.invalid:5432/test';return bytes;
      };
      fs.renameSync=(a,b)=>original.renameSync(map(a),map(b));
      for(const k of ['unlinkSync','readdirSync','existsSync'])fs[k]=(p,...a)=>original[k](map(p),...a);
      fs.readSync=(fd,...a)=>{
        if(fd===fifoFD&&!sent){sent=true;const end=process.hrtime.bigint()-1000000n;
          const event={version:1,snapshotId:pair.after.snapshotId,attemptId:deployment.attemptId,status:204,startMono:(end-1000000n).toString(),endMono:end.toString(),bootId:boot,errorClass:'none'};
          const w=original.openSync(fifo,fs.constants.O_WRONLY|fs.constants.O_NONBLOCK);fs.writeSync(w,JSON.stringify(event)+'\n');original.closeSync(w);
        }return original.readSync(fd,...a);
      };
      const fake=()=>{};fake[promisify.custom]=async(file,args)=>{
        if(args[0]==='clock')return{stdout:JSON.stringify({bootId:boot,monoNs:process.hrtime.bigint().toString()})};
        const phase=args[args.indexOf('-phase')+1];if(phase==='before')goBefore++;
        const p=structuredClone(phase==='before'?pair.before:pair.after);p.provenance.frontendSha=deployment.frontendSha;
        p.provenance.canonicalStateId=createHash('sha256').update(JSON.stringify(p.body)).digest('hex');return{stdout:JSON.stringify(p)+'\n'};
      };cp.execFile=fake;
      https.request=(opts,callback)=>{gets++;assert.equal(opts.method,'GET');const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{
        const res=new EventEmitter();res.statusCode=200;res.headers={};res.destroy=()=>{};callback(res);
        res.emit('data',Buffer.from(fixtureBody(manifest.targets.find(t=>t.path===opts.path))));res.emit('end');
      });return req};syncBuiltinESMExports();
      try{
        const {prepareObservation}=await import('./scripts/revalidation/c2-production-supervisor.mjs');
        const session=await prepareObservation();deployment.attemptId=session.attemptId;pair=projectionPair(session.attemptId);manifest=buildManifest(pair).manifest;
        const run=path.join(dir,session.attemptId);fs.mkdirSync(run,{mode:0o700});fifo=path.join(run,'event.fifo');cp.execFileSync('mkfifo',['-m','600',fifo]);
        const provisional=await session.observe();assert.equal(provisional.acceptance,'INCONCLUSIVE');
        deployment.stage='after';deployment.confirmedAt=Date.now();deployment.optInInactive=true;
        const final=session.finalize();const records=JSON.parse(original.readFileSync(path.join(dir,'ledger','attempts.json'),'utf8'));
        if(scenario==='stable'){
          assert.equal(goBefore,1);assert.equal(readerOpens,1);assert.equal(gets,6);assert.equal(final.acceptance,'PASS');assert.equal(final.qualifiedPassCount,1);
          assert.ok(records[0].transitions.includes('armed'));assert.ok(records[0].transitions.includes('event_consumed'));
        }else{
          assert.equal(reads>=2,true);assert.equal(goBefore,0);assert.equal(readerOpens,0);assert.equal(gets,0);assert.equal(final.acceptance,'INCONCLUSIVE');assert.equal(final.qualifiedPassCount,0);
          assert.deepEqual(records[0].transitions,['prepared','inconclusive']);
        }
      }finally{fs.rmSync(dir,{recursive:true})}
    `;
    execFileSync(process.execPath, ['--input-type=module', '-e', script, scenario], {
      cwd: new URL('../../', import.meta.url), env: { PATH: '/usr/bin:/bin' }, timeout: 10000, maxBuffer: 4096,
    });
  });
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c2-ledger-')); fs.chmodSync(dir, 0o700);
  t.after(() => fs.rmSync(dir, { recursive: true })); return dir;
}
test('durable chronological PASS / INCONCLUSIVE / FAIL series, unique attempts across restart', t => {
  const dir = fixture(t), ids = new Set();
  for (const [verdict, expected] of [['PASS', 1], ['INCONCLUSIVE', 1], ['PASS', 2], ['FAIL', 0], ['PASS', 1], ['PASS', 2], ['PASS', 3]]) {
    const l = openAttemptLedger(dir), attemptId = l.prepare();
    assert.match(attemptId, /^[a-f0-9]{32}$/); assert.ok(!ids.has(attemptId)); ids.add(attemptId);
    l.transition('armed'); l.transition('event_consumed', { status: 204 });
    l.transition(verdict === 'INCONCLUSIVE' ? 'inconclusive' : 'completed', { acceptance: verdict });
    assert.equal(l.series(), expected); l.close();
  }
  const stored = JSON.parse(fs.readFileSync(path.join(dir, 'attempts.json')));
  assert.equal(stored.length, 7); assert.equal(stored[3].verdict, 'FAIL');
  assert.equal(stored[0].history[2].evidence.status, 204);
  assert.equal(fs.statSync(path.join(dir, 'attempts.json')).mode & 0o777, 0o600);
});
test('lock contention / crash after consumed never re-arms or counts imported PASS', t => {
  const dir = fixture(t), l = openAttemptLedger(dir); l.prepare(); l.transition('armed'); l.transition('event_consumed');
  l.checkpoint({ acceptance: 'PASS', request_count: 6 });
  assert.throws(() => openAttemptLedger(dir), /EEXIST/); assert.throws(() => l.close(), /incomplete/);
  assert.equal(l.series(), 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'attempts.json')))[0].checkpoints[0].evidence.request_count, 6);
});
test('corrupted journal and incomplete pending file fail closed leaving interlock', t => {
  for (const kind of ['corrupt', 'pending']) {
    const dir = fixture(t);
    fs.writeFileSync(path.join(dir, kind === 'corrupt' ? 'attempts.json' : 'state.pending'), kind === 'corrupt' ? '{' : '', { mode: 0o600 });
    assert.throws(() => openAttemptLedger(dir)); assert.ok(fs.existsSync(path.join(dir, 'operator.lock')));
  }
});
test('file and parent fsync failures cannot return success', t => {
  for (const nth of [1, 2, 3, 4]) {
    const dir = fixture(t); let n = 0; const original = fs.fsyncSync;
    try {
      mock.method(fs, 'fsyncSync', fd => { if (++n === nth) throw Error('sync_failure'); return original(fd) });
      assert.throws(() => { const l = openAttemptLedger(dir); l.prepare() }, /sync_failure/);
      assert.ok(fs.existsSync(path.join(dir, 'operator.lock')));
    } finally { mock.restoreAll() }
  }
});
test('partial writes complete before fsync; zero writes fail closed', t => {
  const original = fs.writeSync;
  for (const zero of [false, true]) {
    const dir = fixture(t), l = openAttemptLedger(dir);
    try {
      mock.method(fs, 'writeSync', (fd, b, o, length) => zero ? 0 : original(fd, b, o, Math.min(3, length)));
      if (zero) assert.throws(() => l.prepare(), /ledger_write/);
      else { l.prepare(); l.transition('inconclusive'); l.close(); assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'attempts.json'))).length, 1) }
    } finally { mock.restoreAll() }
  }
});
test('wrong file mode and invalid transitions rejected', t => {
  const dir = fixture(t), l = openAttemptLedger(dir); l.prepare();
  assert.throws(() => l.transition('completed', { acceptance: 'PASS' }), /attempt_state/);
  l.transition('inconclusive'); l.close();
  const file = path.join(dir, 'attempts.json');
  fs.chmodSync(file, 0o644); assert.throws(() => openAttemptLedger(dir), /ledger_corrupt/);
});
test('symlink journal and forged completed PASS rejected on recovery', t => {
  for (const kind of ['symlink', 'forged']) {
    const dir = fixture(t), file = path.join(dir, 'attempts.json');
    if (kind === 'symlink') {
      const target = path.join(dir, 'other'); fs.writeFileSync(target, '[]', { mode: 0o600 }); fs.symlinkSync(target, file);
    } else fs.writeFileSync(file, JSON.stringify([{ attemptId: 'a'.repeat(32), state: 'completed', verdict: 'PASS', transitions: ['prepared', 'completed'] }]), { mode: 0o600 });
    assert.throws(() => openAttemptLedger(dir)); assert.ok(fs.existsSync(path.join(dir, 'operator.lock')));
  }
});

test('supervisor cannot arm a caller-supplied provider or accept imported evidence', async () => {
  const api = await import('./c2-production-supervisor.mjs');
  await assert.rejects(api.prepareObservation({ provider: { production: true }, before: {}, attemptId: 'a'.repeat(32) }));
});
