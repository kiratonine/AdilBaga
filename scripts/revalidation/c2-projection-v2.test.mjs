import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest, prepareBeforeV2 } from './c2-manifest.mjs';
import { projectionPair } from './fixtures/projection-v2.mjs';
import { fixtureBody } from './fixtures/c2-manifest.mjs';
import { createEventSource, captureBefore, verdictCapture, LIMITS } from './production-observer.mjs';
import { createSyntheticProjectionProvider } from './projection-provider.mjs';
import * as providerModule from './projection-provider.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openAttemptLedger } from './c2-production-supervisor.mjs';

test('site-content provenance binds the same policy without frontend placeholders', () => {
  const pair=projectionPair();
  for(const p of [pair.before,pair.after]) {
    delete p.provenance.frontendSha;
    Object.assign(p.provenance,{evidencePolicy:'site-content-verification',policyVersion:2,policySha256:'d'.repeat(64)});
  }
  assert.equal(buildManifest({version:2,attemptId:pair.before.attemptId,...pair}).status,'ready');
  pair.after.provenance.policySha256='e'.repeat(64);
  assert.equal(buildManifest({version:2,attemptId:pair.before.attemptId,...pair}).status,'inconclusive');
});

test('production factory rejects caller-manufactured authority before any execution', () => {
  assert.equal(typeof providerModule.createProductionProjectionProvider, 'function');
  assert.throws(() => providerModule.createProductionProjectionProvider({ production: true,
    fixtureOnly: false, approved: true, binary: '/tmp/unapproved', sourceSha: 'a'.repeat(40) }));
});

// Separate Node process: mocked OS metadata/exec only; no root files, DSN or
// privileged resources created. No test hook is exported by the production code.
const credentialUsers = [
  ['direct', 'aktau_api_runtime', true],
  ['pooler', 'aktau_api_runtime.abcdefghijklmnopqrst', true],
  ['encoded_direct', 'aktau%5Fapi_runtime', true],
  ['encoded_pooler', 'aktau_api_runtime%2Eabcdefghijklmnopqrst', true],
  ['ingest', 'aktau_ingest_runtime.abcdefghijklmnopqrst', false],
  ['postgres', 'postgres.abcdefghijklmnopqrst', false],
  ['extra_suffix', 'aktau_api_runtime.abcdefghijklmnopqrst.x', false],
  ['short', 'aktau_api_runtime.SHORT', false],
  ['ref19', 'aktau_api_runtime.abcdefghijklmnopqrs', false],
  ['ref21', 'aktau_api_runtime.abcdefghijklmnopqrstu', false],
  ['uppercase_ref', 'aktau_api_runtime.Abcdefghijklmnopqrst', false],
  ['uppercase_role', 'Aktau_api_runtime.abcdefghijklmnopqrst', false],
  ['ref_punctuation', 'aktau_api_runtime.abcdefghijklmnopqrs_', false],
  ['malformed_percent', 'aktau_api_runtime%ZZ', false],
  ['incomplete_percent', 'aktau_api_runtime%', false],
  ['malformed_utf8', 'aktau_api_runtime.%C3%28', false],
  ['double_encoding', 'aktau_api_runtime%252Eabcdefghijklmnopqrst', false],
  ['encoded_suffix', 'aktau_api_runtime.abcdefghijklmnopqrst%2Ex', false],
  ['encoded_newline', 'aktau_api_runtime%0A', false],
  ['encoded_return', 'aktau_api_runtime%0D', false],
  ['encoded_separator', 'aktau_api_runtime%E2%80%A8', false],
].map(([name, user, accepted]) => ({ scenario: `credential_${name}`, user, accepted }));
for (const scenario of ['valid', 'unapproved', 'wrong_digest', 'wrong_source', 'missing', 'symlink', 'writable_acl_mask', 'replace_before_exec', 'wrong_alias',
  'before_frontend_drift', 'before_deployment_drift', 'before_confirmation_drift', 'stable_identity', 'after_frontend_drift', 'after_deployment_drift',
  'pinned_valid', 'pinned_old_owner_confirmation', 'pinned_wrong_hash', 'pinned_config_drift', 'pinned_future_owner',
  'site_valid','site_wrong_hash','site_policy_drift','site_wrong_source','site_mixed','site_bad_matrix',
  ...credentialUsers.map(c => c.scenario)]) {
  test(`production authority OS mock: ${scenario}`, () => {
    const child = String.raw`
      import fs from 'node:fs'; import cp from 'node:child_process';
      import { syncBuiltinESMExports } from 'node:module';
      import { promisify } from 'node:util'; import { createHash } from 'node:crypto';
      import assert from 'node:assert/strict';
      const scenario = process.argv[1], uid = process.geteuid();
      const credentialCase = JSON.parse(process.argv[2]);
      const { projectionPair } = await import('./scripts/revalidation/fixtures/projection-v2.mjs');
      const bytes = Buffer.from([127,69,76,70,1,2,3]);
      const digest = createHash('sha256').update(bytes).digest('hex');
      const approval = { version:1, approved: scenario !== 'unapproved', sourceSha:'b'.repeat(40), binarySha256:scenario==='wrong_digest'?'0'.repeat(64):digest, clockSha256:digest, buildId:'reviewed-build', platform:'linux/amd64' };
      const deployment = { version:1, attemptId:'a'.repeat(32), stage:'before', alias:scenario==='wrong_alias'?'elsewhere.invalid':'aktau.market', deploymentId:'dpl_test', frontendSha:'c'.repeat(40), ready:true, target:'Production', confirmedAt:Date.now(), optInInactive:false, legitimatePublication:true };
      const frontend = { version:1, evidence:'owner-pinned-configuration', alias:'aktau.market', deploymentId:'dpl_test', frontendSha:'c'.repeat(40), ownerConfirmedAt:Date.now()-(scenario==='pinned_old_owner_confirmation'?86400000:1000) };
      if(scenario==='pinned_future_owner')frontend.ownerConfirmedAt=Date.now()+60000;
      if(scenario.startsWith('pinned_')){
        delete deployment.ready;delete deployment.target;delete deployment.confirmedAt;
        Object.assign(deployment,{version:2,identityEvidence:'owner-pinned-configuration',configurationSha256:createHash('sha256').update(JSON.stringify(frontend)+'\n').digest('hex'),checkedAt:Date.now()});
        if(scenario==='pinned_wrong_hash')deployment.configurationSha256='0'.repeat(64);
      }
      if(scenario.startsWith('site_')){
        for(const key of Object.keys(frontend))delete frontend[key];
        Object.assign(frontend,{version:2,evidence:'site-content-verification',origin:'https://aktau.market',representations:['product_ru','product_kk','sitemap','catalog','dashboard','category']});
        for(const key of Object.keys(deployment))delete deployment[key];
        Object.assign(deployment,{version:3,attemptId:'a'.repeat(32),stage:'before',origin:'https://aktau.market',optInInactive:false,legitimatePublication:true,identityEvidence:'site-content-verification',policyVersion:2,policySha256:createHash('sha256').update(JSON.stringify(frontend)+'\n').digest('hex'),checkedAt:Date.now()});
        if(scenario==='site_wrong_hash')deployment.policySha256='0'.repeat(64);
        if(scenario==='site_bad_matrix')frontend.representations=['dashboard'];
        if(scenario==='site_mixed')deployment.deploymentId='dpl_fake';
      }
      let executions=0, serial=90000; const files=new Map();
      const original={ lstatSync:fs.lstatSync, openSync:fs.openSync, fstatSync:fs.fstatSync, readFileSync:fs.readFileSync, closeSync:fs.closeSync };
      const targeted = p => typeof p==='string' && (p.startsWith('/etc/aktau-c2')||p.startsWith('/usr/local/libexec/aktau-c2')||p.startsWith('/var/lib/aktau-sync'));
      const stats=(p,dir=false)=>({ uid:p.endsWith('reader.dsn')?uid:0, mode:dir?0o40755:p.endsWith('reader.dsn')?0o100600:0o100555, size:p.endsWith('reader.dsn')?100:1000, nlink:1, isDirectory:()=>dir, isFile:()=>!dir, isSymbolicLink:()=>false });
      fs.lstatSync=(p,...args)=>{
        if(targeted(p)||['/etc','/usr','/usr/local','/usr/local/libexec','/var','/var/lib','/'].includes(p)) {
          const s=stats(p,true); if(scenario==='writable_acl_mask'&&p==='/usr/local/libexec')s.mode|=0o020; return s;
        } return original.lstatSync(p,...args);
      };
      fs.openSync=(p,...args)=>{if(!targeted(p))return original.openSync(p,...args);if(scenario==='missing')throw Error('ENOENT');if(scenario==='symlink'&&p.endsWith('c2projection'))throw Error('ELOOP');files.set(++serial,p);return serial};
      fs.fstatSync=(fd,...args)=>files.has(fd)?stats(files.get(fd)):original.fstatSync(fd,...args);
      let binaryReads=0, deploymentReads=0;
      fs.readFileSync=(fd,...args)=>{
        if(!files.has(fd))return original.readFileSync(fd,...args);
        const p=files.get(fd); if(p.endsWith('authorization.json'))return Buffer.from(JSON.stringify(approval)+'\n');
        if(p.endsWith('deployment.json')){
          if(++deploymentReads===2){
            if(scenario==='site_policy_drift')deployment.policySha256='e'.repeat(64);
            if(scenario==='before_frontend_drift')deployment.frontendSha='d'.repeat(40);
            if(scenario==='before_deployment_drift')deployment.deploymentId='dpl_other';
            if(scenario==='before_confirmation_drift')deployment.confirmedAt--;
          }
          return Buffer.from(JSON.stringify(deployment)+'\n');
        }
        if(p.endsWith('frontend.json')){if(scenario==='pinned_config_drift')frontend.deploymentId='dpl_changed';return Buffer.from(JSON.stringify(frontend)+'\n')}
        if(p.endsWith('reader.dsn'))return 'postgres://'+(credentialCase?.user??'aktau_api_runtime')+':synthetic-only@fixture.invalid:5432/test';
        if(p.endsWith('c2projection')&&scenario==='replace_before_exec'&&++binaryReads>1)return Buffer.from('replaced');
        return bytes;
      };
      fs.closeSync=(fd,...args)=>files.has(fd)?files.delete(fd):original.closeSync(fd,...args);
      const fake=()=>{};fake[promisify.custom]=async(file,args,options)=>{
        executions++;assert.equal(options.shell,undefined);assert.equal(options.env.APP_ENV,'production');
        assert.ok(options.timeout<=10000);assert.ok(options.maxBuffer<=65536);
        if(credentialCase)assert.equal(options.env.C2_PROJECTION_DATABASE_URL,
          'postgres://'+credentialCase.user+':synthetic-only@fixture.invalid:5432/test');
        const p=projectionPair().before;
        p.provenance.frontendSha=deployment.frontendSha;
        if(scenario.startsWith('site_')){delete p.provenance.frontendSha;Object.assign(p.provenance,{evidencePolicy:'site-content-verification',policyVersion:2,policySha256:deployment.policySha256});assert.ok(!args.includes('-frontend-sha'));assert.ok(args.includes('-policy-sha256'))}
        if(scenario==='wrong_source'||scenario==='site_wrong_source')p.provenance.sourceSha='d'.repeat(40);
        p.provenance.canonicalStateId=createHash('sha256').update(JSON.stringify(p.body)).digest('hex');
        return {stdout:JSON.stringify(p)+'\n'};
      };cp.execFile=fake;syncBuiltinESMExports();
      const api=await import('./scripts/revalidation/projection-provider.mjs');
      let before=null, provider, initial;
      try{
        provider=api.createProductionProjectionProvider();assert.ok(api.isProductionProvider(provider));
        if(scenario.startsWith('before_')||scenario.startsWith('after_')||scenario==='stable_identity'||scenario==='site_policy_drift')initial=api.productionIdentity(provider,'a'.repeat(32),'before');
        before=await provider.before('a'.repeat(32));
      }catch{}
      if(scenario.startsWith('after_')){
        assert.ok(before);
        deployment.stage='after';deployment.optInInactive=true;deployment.confirmedAt=Date.now();
        if(scenario==='after_frontend_drift')deployment.frontendSha='d'.repeat(40);
        if(scenario==='after_deployment_drift')deployment.deploymentId='dpl_other';
        assert.throws(()=>api.productionIdentity(provider,'a'.repeat(32),'after'),/deployment/);
      }else if(scenario==='valid'||scenario==='stable_identity'||scenario==='site_valid'||['pinned_valid','pinned_old_owner_confirmation'].includes(scenario)||credentialCase?.accepted){
        assert.ok(before);assert.equal(executions,1);
        if(scenario.startsWith('pinned_')){
          const identity=api.productionBeforeIdentity(provider,before);
          assert.equal(identity.identityEvidence,'owner-pinned-configuration');
          assert.equal(identity.ownerConfirmedAt,frontend.ownerConfirmedAt);
          assert.equal(identity.confirmedAt,deployment.checkedAt);
          assert.notEqual(identity.confirmedAt,identity.ownerConfirmedAt);
          deployment.stage='after';deployment.optInInactive=true;deployment.checkedAt=Date.now();
          assert.equal(api.productionIdentity(provider,'a'.repeat(32),'after').identityEvidence,'owner-pinned-configuration');
        }
        if(scenario==='stable_identity'){
          assert.equal(before.provenance.frontendSha,initial.frontendSha);
          assert.equal(api.productionBeforeIdentity(provider,before),initial);
          assert.throws(()=>api.productionBeforeIdentity(provider,structuredClone(before)),/deployment/);
          deployment.stage='after';deployment.optInInactive=true;deployment.confirmedAt=Date.now();
          assert.equal(api.productionIdentity(provider,'a'.repeat(32),'after').deploymentId,initial.deploymentId);
        }
        const { createEventSource } = await import('./scripts/revalidation/production-observer.mjs');
        const source=createEventSource({now:()=>0});source.begin('a'.repeat(32));source.accept204(204,{status:204});
        const r=await source.capture(before,{provider,get:()=>assert.fail('custom production transport must not execute')});
        assert.equal(r.request_count,0);
        // A manually manufactured event cannot admit default production GET.
        const source2=createEventSource({now:()=>0});source2.begin('a'.repeat(32));source2.accept204(204,{status:204});
        assert.equal((await source2.capture(before,{provider})).request_count,0);
      }else{assert.equal(before,null);assert.equal(executions,['wrong_source','site_wrong_source'].includes(scenario)?1:0)}
      assert.equal(api.isProductionProvider({fixtureOnly:false}),false);
    `;
    execFileSync(process.execPath, ['--input-type=module', '-e', child, scenario,
      JSON.stringify(credentialUsers.find(c => c.scenario === scenario) ?? null)], { cwd: new URL('../../', import.meta.url),
      env: { PATH: '/usr/bin:/bin' }, timeout: 5000, maxBuffer: 4096 });
  });
}

const invalid = p => { const r = buildManifest(p); assert.equal(r.status, 'inconclusive'); assert.equal(r.manifest, undefined); return r };
test('P1 BEFORE duplicate non-null sitemap positions -> INCONCLUSIVE', () => {
  const p = projectionPair();
  p.before.body.candidates.find(c => c.id === 'p-b').sitemapIndex = 1;
  invalid(p);
});
test('P1 BEFORE non-witness Top8 candidate with null index -> INCONCLUSIVE', () => {
  const p = projectionPair();
  p.before.body.candidates.find(c => c.id === 'p-b').topEightIndex = null;
  invalid(p);
});
test('v2 JSON compatible, compact exact six paths and distinct product/dashboard timestamps', () => {
  const pair = projectionPair(), original = structuredClone(pair), built = buildManifest(pair);
  assert.equal(built.status, 'ready'); assert.equal(built.manifest.fixtureOnly, true);
  assert.equal(built.manifest.targets.length, 6);
  assert.equal(built.manifest.targets[0].productId, 'p-a');
  assert.notEqual(built.manifest.targets[0].before, built.manifest.targets[4].before);
  assert.deepEqual(built, buildManifest(JSON.parse(JSON.stringify(pair)))); assert.deepEqual(pair, original);
});
for (const [label, mutate] of [
  ['wrong version', p => { p.before.version = 1 }],
  ['wrong attempt', p => { p.after.attemptId = 'd'.repeat(32) }],
  ['wrong snapshot chain', p => { p.after.previousSnapshotId = p.after.snapshotId }],
  ['intervening snapshot', p => { p.after.previousSnapshotId = '33333333-3333-3333-3333-333333333333' }],
  ['same snapshot', p => { p.after.snapshotId = p.before.snapshotId }],
  ['source SHA', p => { p.after.provenance.sourceSha = 'd'.repeat(40) }],
  ['frontend SHA', p => { p.after.provenance.frontendSha = 'd'.repeat(40) }],
  ['canonical hash', p => { p.after.provenance.canonicalStateId = p.before.provenance.canonicalStateId }],
  ['evidence identity', p => { p.after.provenance.evidenceId = p.before.provenance.evidenceId }],
  ['provenance extra field', p => { p.after.provenance.exclusiveWindow = true }],
  ['unsealed', p => { p.after.provenance.kind = 'fixture' }],
  ['wrong BEFORE witness', p => { p.before.body.witnessId = 'p-b' }],
  ['different AFTER witness', p => { p.after.body.witnessId = 'p-b' }],
  ['missing witness', p => { p.before.body.witnessId = null }],
  ['AFTER different candidate', p => { p.after.body.candidates[0].id = 'p-b' }],
  ['category moved', p => { p.after.body.candidates[0].slug = 'bread' }],
  ['lost top8', p => { p.after.body.candidates[0].topEightIndex = null }],
  ['lost category', p => { p.after.body.candidates[0].categoryIndex = null }],
  ['lost sitemap', p => { p.after.body.candidates[0].sitemapIndex = null }],
  ['sitemap outside count', p => { p.after.body.sitemap.productCount = 1 }],
  ['sitemap category missing', p => { p.after.body.sitemap.categorySlugs = [] }],
  ['wrong position', p => { p.after.body.candidates[0].categoryIndex = 0 }],
  ['timestamp precision', p => { p.after.body.candidates[0].snapshotAt = '2026-10-17T11:00:00Z' }],
  ['timestamp malformed', p => { p.after.body.candidates[0].snapshotAt = '2026-02-30T11:00:00.123Z' }],
  ['unchanged product', p => { p.after.body.candidates[0].snapshotAt = p.before.body.candidates[0].snapshotAt }],
  ['unchanged dashboard', p => { p.after.body.dashboardAt = p.before.body.dashboardAt }],
  ['candidate duplicated', p => { p.after.body.candidates.push(p.after.body.candidates[0]) }],
  ['nonenumerable', p => { Object.defineProperty(p.after.body.candidates[0], 'hidden', { value: true }) }],
  ['symbol', p => { p.after.body[Symbol('unknown')] = true }],
  ['array symbol', p => { p.after.body.topEight[Symbol('unknown')] = true }],
  ['inherited array item', p => { delete p.after.body.topEight[0] }],
]) test(`v2 ${label} -> INCONCLUSIVE`, () => { const p = projectionPair(); mutate(p); invalid(p) });
test('BEFORE choice cannot switch to eligible AFTER alternative', () => {
  const p = projectionPair(); p.after.body.candidates[0].sitemapIndex = null;
  assert.equal(prepareBeforeV2(p.before).witness.id, 'p-a'); invalid(p);
});

// Deterministic virtual monotonic clock shared by all six target schedules.
function clock() {
  let time = 0, queued = false; const timers = [];
  const sleep = ms => new Promise(resolve => {
    timers.push({ at: time + ms, resolve });
    if (!queued) { queued = true; setImmediate(function pump() {
      queued = false; time = Math.min(...timers.map(t => t.at));
      for (const t of [...timers]) if (t.at <= time) { timers.splice(timers.indexOf(t), 1); t.resolve() }
      if (timers.length) { queued = true; setImmediate(pump) }
    }) }
  });
  return { now: () => time, set: v => { time = v }, sleep };
}
async function capture({ provider = createSyntheticProjectionProvider(), response, interval = 0 } = {}) {
  const p = projectionPair(), before = await provider.before(p.attemptId);
  assert.ok(before);
  const c = clock(), source = createEventSource({ now: c.now, utc: () => Date.parse('2026-10-17T00:00:00.000Z') });
  source.begin(p.attemptId); c.set(interval);
  const receipt = { version: 1, snapshotId: p.after.snapshotId, attemptId: p.attemptId, status: 204,
    startMono: '1000000', endMono: '2000000', bootId: 'synthetic', errorClass: 'none' };
  source.accept204(204, receipt);
  const manifest = buildManifest(p).manifest;
  let calls = 0; const paths = new Map();
  const captured = await source.capture(before, { sleep: c.sleep, get: async (path, timeout, bytes) => {
    calls++; paths.set(path, (paths.get(path) ?? 0) + 1);
    assert.ok(timeout <= LIMITS.timeoutMs && bytes <= LIMITS.sitemapBytes);
    const t = manifest.targets.find(t => t.path === path);
    return response ? response(t, c.now() - interval) : { status: 200, text: fixtureBody(t), headers: { date: 'safe', 'set-cookie': 'private' } };
  } });
  return { p, before, captured, c, calls, paths, provider, receipt };
}
test('BEFORE S0 -> HTTP capture -> trusted synthetic AFTER S1 -> PASS, no second GET window', async () => {
  const r = await capture(); assert.equal(r.captured.acceptance, 'capture_complete');
  assert.equal(r.calls, 6); assert.ok(Object.isFrozen(r.captured.events[0].markers));
  assert.ok(r.captured.events.every(e => e.bodySha256.length === 64 && e.class === 'changed' && e.fresh === undefined));
  assert.ok(!JSON.stringify(r.captured).includes('private'));
  r.receipt.snapshotId = 'tampered'; assert.equal(r.captured.event.receipt.snapshotId, r.p.after.snapshotId);
  assert.throws(() => { r.captured.events[0].markers[0] = 'mutated' }, TypeError);
  assert.throws(() => { r.captured.events[0].headers.date = 'mutated' }, TypeError);
  const verdict = await r.provider.after(r.captured, r.before);
  assert.equal(verdict.acceptance, 'PASS'); assert.equal(r.calls, 6);
  assert.equal(verdict.events, r.captured.events);
});
test('serialized/cloned capture cannot import trusted evidence', async () => {
  const r = await capture();
  for (const fake of [structuredClone(r.captured), JSON.parse(JSON.stringify(r.captured))]) {
    assert.equal((await r.provider.after(fake, r.before)).acceptance, 'INCONCLUSIVE');
    assert.equal(verdictCapture(fake, r.before, r.p.after).reason, 'untrusted_capture');
  }
});
test('changed body != qualified AFTER is INCONCLUSIVE', async () => {
  const r = await capture({ response: t => ({ status: 200, headers: {}, text: fixtureBody({ ...t, after: '2026-10-18T12:00:00.123Z', productAfter: '2026-10-18T11:00:00.123Z' }) }) });
  assert.equal((await r.provider.after(r.captured, r.before)).acceptance, 'INCONCLUSIVE');
});
test('stale after SLA -> FAIL only after qualified AFTER; 21 GET and 2 sitemap maximum', async () => {
  const r = await capture({ response: t => ({ status: 200, headers: {}, text: fixtureBody(t, false) }) });
  assert.equal(r.calls, 21); assert.equal(r.paths.get('/sitemap.xml'), 2);
  assert.equal((await r.provider.after(r.captured, r.before)).acceptance, 'FAIL');
  r.p.after.body.candidates[0].snapshotAt = r.p.before.body.candidates[0].snapshotAt;
  assert.equal(verdictCapture(r.captured, r.before, r.p.after).acceptance, 'INCONCLUSIVE');
});
for (const [label, mutate] of [
  ['witness', p => { p.body.witnessId = 'p-b' }],
  ['snapshot', p => { p.snapshotId = '33333333-3333-3333-3333-333333333333' }],
  ['SHA', p => { p.provenance.sourceSha = 'd'.repeat(40) }],
  ['attempt', p => { p.attemptId = 'd'.repeat(32) }],
]) test(`retrospective wrong ${label} is INCONCLUSIVE`, async () => {
  const r = await capture(); mutate(r.p.after);
  assert.equal(verdictCapture(r.captured, r.before, r.p.after).acceptance, 'INCONCLUSIVE');
});
test('AFTER beyond event.end+60s -> after_late, original clock not reset', async () => {
  const r = await capture(); r.c.set(60001);
  assert.equal((await r.provider.after(r.captured, r.before)).reason, 'after_late');
});
for (const [label, response] of [
  ['timeout', () => { throw Error('timeout') }], ['non200', () => ({ status: 503, text: '', headers: {} })],
  ['redirect', () => ({ status: 302, text: '', headers: {} })], ['missing marker', () => ({ status: 200, text: 'no marker', headers: {} })],
  ['oversized', () => ({ status: 200, text: 'x'.repeat(LIMITS.sitemapBytes + 1), headers: {} })],
]) test(`capture ${label} cannot PASS/FAIL`, async () => {
  const r = await capture({ response }); assert.equal(r.captured.acceptance, 'capture_failed');
  assert.equal((await r.provider.after(r.captured, r.before)).acceptance, 'INCONCLUSIVE');
  assert.ok(r.calls <= 6);
});
test('fixtureOnly without synthetic transport and untrusted event admit 0 GET', async () => {
  const p = projectionPair(), now = () => 0, source = createEventSource({ now });
  source.begin(p.attemptId); source.accept204(204);
  assert.equal((await source.capture(p.before)).request_count, 0);
  let calls = 0;
  const r = await captureBefore({ before: p.before, event: { now }, publicationId: p.attemptId }, { now, get: () => { calls++ } });
  assert.equal(r.request_count, 0); assert.equal(calls, 0);
});
test('uncertainty consumes original5s acceptance (not an independent clock)', async () => {
  const r = await capture({ interval: 2000, response: (t, time) => ({ status: 200, headers: {}, text: fixtureBody(t, t.name === 'sitemap' || time > 3000) }) });
  assert.equal(r.captured.clock_uncertainty_ms, 2000);
  assert.equal((await r.provider.after(r.captured, r.before)).acceptance, 'INCONCLUSIVE');
});
for (const scenario of ['invalid_json', 'oversized', 'timeout']) test(`fixed execFile synthetic provider ${scenario} -> no trusted projection`, async () => {
  assert.equal(await createSyntheticProjectionProvider({ scenario }).before('a'.repeat(32)), null);
});
for (const scenario of ['invalid_json', 'oversized', 'timeout']) test(`AFTER fixed execFile ${scenario} -> INCONCLUSIVE without additional GET`, async () => {
  const r = await capture({ provider: createSyntheticProjectionProvider({ scenario, failurePhase: 'after' }) });
  const verdict = await r.provider.after(r.captured, r.before);
  assert.equal(verdict.acceptance, 'INCONCLUSIVE'); assert.equal(verdict.reason, 'after_unavailable'); assert.equal(r.calls, 6);
});
for (const [scenario, reason] of [
  ['unchanged', 'unchanged_marker'], ['wrong_previous', 'snapshot_chain'], ['wrong_witness', 'unqualified_after'],
  ['wrong_sha', 'after_unavailable'], ['wrong_attempt', 'after_unavailable'], ['wrong_snapshot', 'event_mismatch'],
  ['unqualified', 'unqualified_after'], ['bad_hash', 'after_unavailable'],
]) test(`trusted AFTER ${scenario} cannot qualify even late stale samples`, async () => {
  const r = await capture({ provider: createSyntheticProjectionProvider({ scenario, failurePhase: 'after' }),
    response: t => ({ status: 200, headers: {}, text: fixtureBody(t, false) }) });
  const verdict = await r.provider.after(r.captured, r.before);
  assert.equal(verdict.acceptance, 'INCONCLUSIVE'); assert.equal(verdict.reason, reason); assert.equal(r.calls, 21);
});
test('AFTER cannot be requested twice for the same capture', async () => {
  const r = await capture(); assert.equal((await r.provider.after(r.captured, r.before)).acceptance, 'PASS');
  assert.equal((await r.provider.after(r.captured, r.before)).reason, 'after_already_requested'); assert.equal(r.calls, 6);
});
test('same event cannot restart capture or request another HTTP window', async () => {
  const p = projectionPair(), now = () => 0, source = createEventSource({ now });
  source.begin(p.attemptId); source.accept204(204);
  let calls = 0;
  const get = async path => { calls++; const t = buildManifest(p).manifest.targets.find(t => t.path === path);
    return { status: 200, headers: {}, text: fixtureBody(t) } };
  await source.capture(p.before, { get });
  assert.equal((await source.capture(p.before, { get })).reason, 'capture_already_started'); assert.equal(calls, 6);
});

// Synthetic XML only; exact RU/KK witness locs plus unrelated catalog entries.
function currentSizedSitemap(target) {
  const base = fixtureBody(target);
  const entry = '<url><loc>https://aktau.market/ru/products/unrelated</loc><lastmod>2026-10-17T11:00:00.123Z</lastmod></url>';
  const count = Math.ceil((4252947 - Buffer.byteLength(base)) / entry.length);
  return base.replace('</urlset>', entry.repeat(count) + '</urlset>');
}
test('current-size XML over4.25MB captures all RU/KK markers and qualifies only against AFTER', async () => {
  const r = await capture({ response: t => {
    const text = t.name === 'sitemap' ? currentSizedSitemap(t) : fixtureBody(t);
    if (t.name === 'sitemap') assert.ok(Buffer.byteLength(text) >= 4252947)
    return { status: 200, text, headers: {} };
  } });
  assert.equal(r.captured.acceptance, 'capture_complete');
  assert.equal(r.captured.events.find(e => e.target === 'sitemap').markers.length, 8);
  assert.equal((await r.provider.after(r.captured, r.before)).acceptance, 'PASS');
  assert.equal(r.calls, 6);
});
for (const [failureClass, response] of [
  ['oversized_body', () => ({ status: 200, text: 'x'.repeat(LIMITS.sitemapBytes + 1), headers: {} })],
  ['timeout', () => { throw Error('timeout') }],
  ['redirect', () => ({ status: 302, text: '', headers: {} })],
  ['non200', () => ({ status: 503, text: '', headers: {} })],
  ['missing_marker', () => ({ status: 200, text: '<urlset/>', headers: {} })],
  ['transport', () => { throw Error('private-provider-payload') }],
]) test(`sitemap ${failureClass} survives trusted verdict as bounded diagnostics only`, async () => {
  const r = await capture({ response: t => t.name === 'sitemap' ? response() : { status: 200, text: fixtureBody(t), headers: {} } });
  assert.equal(r.captured.acceptance, 'capture_failed');
  const verdict = await r.provider.after(r.captured, r.before);
  assert.equal(verdict.acceptance, 'INCONCLUSIVE'); assert.equal(verdict.reason, 'capture_failed');
  assert.equal(verdict.failedTarget, 'sitemap'); assert.equal(verdict.failureClass, failureClass);
  assert.deepEqual(verdict.events, []); assert.deepEqual(verdict.results, []);
  assert.ok(!JSON.stringify(verdict).includes('private-provider-payload'));
  assert.ok(!JSON.stringify(verdict).includes('<urlset'));
  assert.ok(r.calls <= 6);
  const fake = structuredClone(r.captured);
  const untrusted = verdictCapture(fake, r.before, r.p.after);
  assert.equal(untrusted.reason, 'untrusted_capture'); assert.equal(untrusted.failedTarget, undefined);
});

test('capture failure diagnostics persist and reopen in existing ledger without changing series semantics', async t => {
  const r = await capture({ response: target => {
    if (target.name === 'sitemap') throw Error('timeout');
    return { status: 200, text: fixtureBody(target), headers: {} };
  } });
  const verdict = await r.provider.after(r.captured, r.before);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c2-capture-ledger-')); fs.chmodSync(dir, 0o700);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ledger = openAttemptLedger(dir);
  ledger.prepare(); ledger.transition('armed'); ledger.transition('event_consumed'); ledger.transition('inconclusive', verdict);
  assert.equal(ledger.series(), 0); ledger.close();
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'attempts.json')))[0];
  assert.equal(saved.evidence.failedTarget, 'sitemap'); assert.equal(saved.evidence.failureClass, 'timeout');
  const reopened = openAttemptLedger(dir); assert.equal(reopened.series(), 0);
  reopened.prepare(); reopened.transition('inconclusive', { acceptance: 'INCONCLUSIVE' }); reopened.close();
});
