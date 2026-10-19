// Local HTTPS Bot API simulation only. Never use real Telegram credentials/network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { once } from 'node:events';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { createTelegramNotifier } from './telegram-notifier.mjs';
import { main, runMonitor } from './monitor-go-production.mjs';
import { validateState } from './monitor-state.mjs';
import { renderUnits } from './render-monitor-units.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const env = { PATH: path.dirname(process.execPath)+':'+process.env.PATH, HOME: process.env.HOME };
async function fixture(t) {
  assert.notEqual(process.geteuid(),0);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aktau-telegram-'));fs.chmodSync(dir,0o700);
  const state=path.join(dir,'state');fs.mkdirSync(state,{mode:0o700});
  const key=path.join(dir,'tls.key'),cert=path.join(dir,'tls.pem');
  execFileSync('openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-days','1','-subj','/CN=localhost',
    '-addext','subjectAltName=IP:127.0.0.1','-keyout',key,'-out',cert],{env,stdio:'ignore',timeout:10000});
  fs.chmodSync(key,0o600);fs.chmodSync(cert,0o600);
  const token='123456789:'+ 'S'.repeat(35),admin='123456789',ca=fs.readFileSync(cert),sockets=new Set(),children=new Set();
  let accepted;const f={state,dir,token,admin,posts:0,mode:'ok',utc:100000,healthy:true,outputs:[],attempts:[]};
  const file=path.join(dir,'receipts.json');f.receipts=()=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[];
  const server=https.createServer({key:fs.readFileSync(key),cert:ca},(req,res)=>{
    assert.equal(req.method,'POST');assert.equal(req.url,'/bot'+token+'/sendMessage');f.posts++;
    let raw='';req.on('data',b=>{raw+=b;if(raw.length>1024)req.destroy()});req.on('end',()=>{
      const body=JSON.parse(raw);assert.equal(body.chat_id,admin);assert.deepEqual(Object.keys(body).sort(),['chat_id','text']);
      if(f.mode==='reject'){res.writeHead(429);res.end();return;}
      const s=JSON.parse(fs.readFileSync(path.join(state,'state.json')));
      f.attempts.push(s.pending.attempts===1&&s.pending.manualReconciliation===true);
      const rows=[...f.receipts(),{type:body.text.split(' ')[0]}],fd=fs.openSync(file+'.pending','wx',0o600);
      try{fs.writeFileSync(fd,JSON.stringify(rows));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
      fs.renameSync(file+'.pending',file);const dfd=fs.openSync(dir,fs.constants.O_DIRECTORY|fs.constants.O_RDONLY);try{fs.fsyncSync(dfd)}finally{fs.closeSync(dfd)}
      accepted?.();accepted=null;
      if(f.mode==='lost'){req.socket.destroy();return;}if(f.mode==='hold')return;
      res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,result:{message_id:rows.length,chat:{id:Number(admin),type:'private'}}}));
    });
  });
  server.on('tlsClientError',()=>{});server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s))});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base='https://127.0.0.1:'+server.address().port;
  t.after(async()=>{for(const c of children)if(c.exitCode===null&&c.signalCode===null){c.kill('SIGKILL');await once(c,'exit')}
    for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true})});
  const child=path.join(dir,'cycle.mjs');fs.writeFileSync(child,`
import fs from 'node:fs';import https from 'node:https';import assert from 'node:assert/strict';
import {runMonitor} from ${JSON.stringify(new URL('./monitor-go-production.mjs',import.meta.url).href)};
import {createTelegramNotifier} from ${JSON.stringify(new URL('./telegram-notifier.mjs',import.meta.url).href)};
const notify=createTelegramNotifier({token:process.env.FIXTURE_TOKEN,admin:process.env.FIXTURE_ADMIN},{request:(u,o,c)=>{
 assert.equal(new URL(u).origin,'https://api.telegram.org');assert.equal(o.rejectUnauthorized,true);
 return https.request(process.env.FIXTURE_BASE+new URL(u).pathname,{...o,...(process.env.FIXTURE_TRUST==='yes'?{ca:fs.readFileSync(process.env.FIXTURE_CA)}:{})},c);
}});
const check=()=>process.env.FIXTURE_HEALTHY==='yes'?{outcome:'PASS',requests:5,records:['live','ready','categories','products','dashboard'].map(endpoint=>({endpoint,outcome:'PASS',schemaClass:'valid',statusClass:'2xx'}))}:{outcome:'FAIL'};
process.stdout.write(JSON.stringify(await runMonitor({directory:process.env.FIXTURE_STATE,notify,check,now:()=>Number(process.env.FIXTURE_UTC)})));
`,{mode:0o600});
  const childEnv=(trust=true)=>({...env,FIXTURE_TOKEN:token,FIXTURE_ADMIN:admin,FIXTURE_BASE:base,FIXTURE_CA:cert,FIXTURE_TRUST:trust?'yes':'no',
    FIXTURE_STATE:state,FIXTURE_HEALTHY:f.healthy?'yes':'no',FIXTURE_UTC:String(f.utc)});
  f.run=(trust=true)=>new Promise((resolve,reject)=>{const c=execFile(process.execPath,[child],{env:childEnv(trust),timeout:10000,maxBuffer:4096},(err,stdout,stderr)=>{
    children.delete(c);if(err)return reject(Error('fixture_process'));assert.equal(stderr,'');f.outputs.push(stdout);resolve(JSON.parse(stdout))});children.add(c)});
  f.spawn=()=>{const c=spawn(process.execPath,[child],{env:childEnv(),stdio:['ignore','pipe','pipe']});children.add(c);return c};
  f.accepted=()=>new Promise(r=>{accepted=r});return f;
}
test('Telegram real TLS + independent processes: one incident, repeated failure, one recovery, private state', {timeout:20000},async t=>{
  const f=await fixture(t);assert.equal((await f.run()).outcome,'OK');f.healthy=false;
  assert.equal((await f.run()).outcome,'DEGRADED');assert.equal((await f.run()).outcome,'INCIDENT');assert.equal((await f.run()).outcome,'INCIDENT');
  f.healthy=true;assert.equal((await f.run()).outcome,'RECOVERED');assert.equal((await f.run()).outcome,'OK');
  assert.equal(f.posts,2);assert.deepEqual(f.receipts().map(r=>r.type),['ALERT','RECOVERED']);assert.ok(f.attempts.every(Boolean));
  const state=fs.readFileSync(path.join(f.state,'state.json'),'utf8');for(const secret of [f.token,f.admin,'api.telegram.org','chat_id'])assert.ok(!state.includes(secret)&&f.outputs.every(x=>!x.includes(secret)));
  assert.equal(fs.statSync(f.state).mode&0o777,0o700);assert.equal(fs.statSync(path.join(f.state,'state.json')).mode&0o777,0o600);
});
for(const mode of ['lost','reject','untrusted'])test('Telegram '+mode+' requires durable manual reconciliation across restart/mode switch',{timeout:20000},async t=>{
  const f=await fixture(t);f.healthy=false;await f.run();f.mode=mode==='untrusted'?'ok':mode;
  assert.equal((await f.run(mode!=='untrusted')).reason,'delivery_reconciliation_required');const posts=f.posts;
  const before=fs.readFileSync(path.join(f.state,'state.json'),'utf8');assert.equal(JSON.parse(before).pending.manualReconciliation,true);
  f.mode='ok';f.utc+=120000;f.healthy=true;assert.equal((await f.run()).reason,'delivery_reconciliation_required');assert.equal(f.posts,posts);
  const r=await runMonitor({directory:f.state,check:()=>assert.fail('unexpected probe'),notify:()=>assert.fail('mode switch retry'),now:()=>f.utc});
  assert.equal(r.reason,'delivery_reconciliation_required');assert.equal(fs.readFileSync(path.join(f.state,'state.json'),'utf8'),before);
  assert.equal(f.receipts().length,mode==='lost'?1:0);
});
test('Telegram crash after accepted send retains lock and reconciliation marker, zero resend',{timeout:15000},async t=>{
  const f=await fixture(t);f.healthy=false;await f.run();f.mode='hold';const accepted=f.accepted(),child=f.spawn();await accepted;
  assert.equal((await f.run()).outcome,'BLOCKED');child.kill('SIGTERM');await once(child,'exit');
  assert.ok(fs.existsSync(path.join(f.state,'monitor.lock')));assert.equal((await f.run()).outcome,'BLOCKED');assert.equal(f.posts,1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.state,'state.json'))).pending.manualReconciliation,true);
});
test('Telegram actual5000ms timeout after receipt never retries next invocation',{timeout:15000},async t=>{
  const f=await fixture(t);f.healthy=false;await f.run();f.mode='hold';
  assert.equal((await f.run()).reason,'delivery_reconciliation_required');assert.equal(f.receipts().length,1);
  f.utc+=120000;f.mode='ok';assert.equal((await f.run()).reason,'delivery_reconciliation_required');assert.equal(f.posts,1);
});
test('explicit Telegram mode fails closed before state/network; no fallback on unknown mode',async()=>{
  for(const values of [{AKTAU_MONITOR_DELIVERY:'telegram'},{AKTAU_MONITOR_DELIVERY:'other'}]){
    let out;assert.equal(await main(['--run'],values,s=>{out=s}),2);assert.equal(JSON.parse(out).reason,'delivery_not_configured');
  }
  await main([],new Proxy({},{get(){assert.fail('offline config read')}}),()=>{});
});
test('Telegram reconciliation latch cannot be malformed or unattempted',()=>{
  const state={version:1,phase:'INCIDENT',failures:2,lastUTC:100000,pending:{id:'a'.repeat(32),type:'incident_opened',atUTC:100000,nextAttemptUTC:160000,attempts:1,manualReconciliation:true}};
  assert.doesNotThrow(()=>validateState(state));
  for(const v of [false,null,'true',1])assert.throws(()=>validateState({...state,pending:{...state.pending,manualReconciliation:v}}));
  assert.throws(()=>validateState({...state,pending:{...state.pending,attempts:0,nextAttemptUTC:100000}}));
});
test('switching an already attempted legacy pending event to Telegram never resends',async t=>{
  const f=await fixture(t),bad=()=>({outcome:'FAIL'});
  await runMonitor({directory:f.state,check:bad,notify:()=>false,now:()=>100000});
  await runMonitor({directory:f.state,check:bad,notify:()=>false,now:()=>100000});
  const notify=createTelegramNotifier({token:f.token,admin:f.admin},{request:()=>assert.fail('mode switch send')});
  assert.equal((await runMonitor({directory:f.state,notify,check:()=>assert.fail('probe'),now:()=>200000})).reason,'delivery_reconciliation_required');
});
test('Telegram env selection is explicit and both inactive templates pass systemd verification',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aktau-telegram-units-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const units=path.join(dir,'etc/systemd/system');fs.mkdirSync(units,{recursive:true});fs.mkdirSync(path.join(dir,'usr/bin'),{recursive:true});
  fs.copyFileSync(process.execPath,path.join(dir,'usr/bin/node'));fs.chmodSync(path.join(dir,'usr/bin/node'),0o555);
  for(const name of ['basic','sysinit','shutdown','network-online','timers'])fs.writeFileSync(path.join(units,name+'.target'),'[Unit]\nDescription=Fixture target\nDefaultDependencies=no\n');
  const p={user:'monitor-fixture',node:'/usr/bin/node',source:'/opt/aktau-monitor/releases/'+'a'.repeat(40)};
  for(const delivery of ['https','telegram']){
    const rendered=renderUnits({...p,delivery});assert.match(rendered['aktau-go-monitor.service'],new RegExp('EnvironmentFile=/etc/aktau-monitor/'+(delivery==='telegram'?'telegram':'receiver')+'\\.env'));
    for(const [name,value]of Object.entries(rendered))fs.writeFileSync(path.join(units,name),value);
    execFileSync('systemd-analyze',['verify','--root='+dir,'--man=no','aktau-go-monitor.service','aktau-go-monitor.timer'],{env,stdio:['ignore','pipe','pipe'],timeout:10000});
  }
  assert.throws(()=>renderUnits({...p,delivery:'../../secret'}));
});
