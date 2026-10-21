// Disposable PG17 / Go-test executable only. Never production authority.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import assert from 'node:assert/strict';import {spawn,execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';import {createHash} from 'node:crypto';import http from 'node:http';
import {createLocalGoProjectionProvider,providerBeforeBaseline} from '../projection-provider.mjs';
import {prepareBeforeV2} from '../c2-manifest.mjs';import {calibrateClock,openReceiver} from '../fifo-adapter.mjs';
import {openReadyRelay} from '../c2-production-supervisor.mjs';import {fixtureBody} from './c2-manifest.mjs';
const execute=promisify(execFile),[testBinary,directory,raw]=process.argv.slice(2),config=JSON.parse(raw),a=config.authority;
assert.ok(directory.startsWith(path.join(os.tmpdir(),'c2r-')));assert.equal(fs.lstatSync(directory).uid,process.geteuid());
assert.equal(fs.lstatSync(directory).mode&0o777,0o700);
const provider=createLocalGoProjectionProvider(config.provider),before=await provider.beforeReady(a.attemptId);
assert.ok(before);const baseline=providerBeforeBaseline(provider,before),prepared=prepareBeforeV2(before);assert.equal(prepared.status,'ready');
const fifo=path.join(directory,'event.fifo');execFileSync('mkfifo',['-m','600',fifo]);
const receiver=openReceiver({fifo,attemptId:a.attemptId,before,provider,calibration:calibrateClock(path.join(config.provider.directory,'relayprobe'))});
let publishedResolve;const published=new Promise(r=>{publishedResolve=r});
let control='';process.stdin.on('data',chunk=>{control+=chunk;while(control.includes('\n')){const i=control.indexOf('\n'),message=JSON.parse(control.slice(0,i));control=control.slice(i+1);
  if(message.published)publishedResolve(message.published);if(message.exclude)receiver.close();
}});
let requests=0,rendering;
const server=http.createServer(async(req,res)=>{
  try{
    requests++;assert.equal(req.method,'GET');const target=prepared.targets.find(t=>t.path===req.url);assert.ok(target);
    rendering??=(async()=>{const s1=await published;const r=await execute(path.join(config.provider.directory,'fixture'),[s1,before.snapshotId,prepared.witness.id,prepared.witness.slug],{env:{C2_PROJECTION_DATABASE_URL:config.provider.databaseURL},timeout:10000,maxBuffer:16384});const state=JSON.parse(r.stdout);assert.equal(state.SnapshotID,s1);assert.equal(state.Body.candidates.length,1);assert.equal(state.Body.candidates[0].id,prepared.witness.id);return state.Body})();
    const body=await rendering,product=body.candidates[0];res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
    res.end(fixtureBody({...target,after:['catalog','dashboard','sitemap'].includes(target.name)?body.dashboardAt:product.snapshotAt,productAfter:product.snapshotAt}));
  }catch{res.writeHead(500);res.end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const get=p=>new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port:server.address().port,path:p,timeout:1000,agent:false},res=>{let text='';res.on('data',b=>{text+=b;if(Buffer.byteLength(text)>2<<20)req.destroy()});res.on('end',()=>resolve({status:res.statusCode,text,headers:res.headers}))});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('fixture_timeout')))});
// FIFO is open before either READY or Stage. The same receiver owns capture.
const observing=receiver.observe({get,waitMs:10000});
// Go race test helper only: retain race detection without its default1s
// post-exit sleep obscuring the bounded real-child cleanup result.
const child=spawn(testBinary,['-test.run=^TestReadyHelperProcess$'],{env:{GORACE:'atexit_sleep_ms=0',PART32_TEST_HELPER:'1',PART32_TEST_SOCKET:path.join(directory,'ready.sock'),PART32_TEST_ATTEMPT:a.attemptId},stdio:['pipe','pipe','ignore']});
let consumed=0;
const relay=await openReadyRelay({child,attemptId:a.attemptId,respond(request,peer){
  assert.equal(peer.pid,process.ppid);assert.equal(peer.uid,process.geteuid());assert.equal(++consumed,1);
  const digest=v=>createHash('sha256').update(JSON.stringify(v)+'\n').digest('hex');
  return{version:1,status:'READY',attemptId:a.attemptId,nonce:request.nonce,s0:baseline,projectionSha256:digest(before),witnessSha256:digest(prepared.witness),sourceSha:a.sourceSha,frontendSha:a.frontendSha,deploymentId:a.deploymentId,confirmedAt:a.confirmedAt,bootId:a.bootId,expiresAt:a.expiresAt};
}});
process.stdout.write(JSON.stringify({pid:child.pid,fifo,s0:baseline.snapshotId})+'\n');
try{
  const result=await observing;
  process.stdout.write(JSON.stringify({acceptance:result.acceptance,requests,consumed,fixtureOnly:provider.fixtureOnly,baselineNotDashboard:baseline.publishedAt!==before.body.dashboardAt})+'\n');
}finally{receiver.close();assert.equal(await relay.close(),true);await new Promise(r=>server.close(r));process.stdin.destroy()}
