import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { openReadyRelay } from './c2-production-supervisor.mjs';

const attemptId='a'.repeat(32),nonce='b'.repeat(32);
const request={version:1,attemptId,nonce};
const peer={pid:42,uid:1000,gid:1000,executableSha256:'c'.repeat(64),rootControlled:true,bootId:'11111111-1111-1111-1111-111111111111'};
function fixture(){
  const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.exitCode=null;child.signalCode=null;
  child.stdin.on('end',()=>{if(child.exitCode===null&&child.signalCode===null){child.exitCode=0;child.emit('exit',0);child.emit('close',0)}});
  child.kill=signal=>{child.signalCode=signal;queueMicrotask(()=>{child.emit('exit',null);child.emit('close',null)});return true};
  return child;
}
function send(child,value){child.stdout.write(typeof value==='string'?value:JSON.stringify(value)+'\n')}
async function listening(child,respond){
  const starting=openReadyRelay({child,attemptId,respond});send(child,{state:'listening'});return starting;
}
const tick=()=>new Promise(r=>setImmediate(r));

test('one canonical request, durable responder before answer, delivered then close',async()=>{
  const c=fixture(),order=[];
  c.stdin.on('data',b=>{order.push('answer');assert.deepEqual(JSON.parse(b),{version:1,status:'READY'});send(c,{state:'delivered'})});
  const server=await listening(c,(req,p)=>{order.push('durable_consumption');assert.deepEqual(req,request);assert.deepEqual(p,peer);return{version:1,status:'READY'}});
  send(c,{state:'request',request,peer});assert.equal(await server.delivered,true);assert.equal(server.live(),true);
  assert.deepEqual(order,['durable_consumption','answer']);await server.close();assert.equal(server.live(),false);
});
for(const kind of ['extra_request_key','wrong_attempt','wrong_nonce_type','nonce_newline','nonce_object','unknown_peer_key','unsafe_peer_number','duplicate_key','oversized','out_of_order','null','array']){
  test(`reject malformed/unrelated child frame: ${kind}`,async()=>{
    const c=fixture();let called=0;const s=await listening(c,()=>{called++;assert.fail('invalid frame reached responder')});
    const frame=structuredClone({state:'request',request,peer});
    if(kind==='extra_request_key')frame.request.extra=true;
    if(kind==='wrong_attempt')frame.request.attemptId='d'.repeat(32);
    if(kind==='wrong_nonce_type')frame.request.nonce=1;
    if(kind==='nonce_newline')frame.request.nonce+='\n';
    if(kind==='nonce_object')frame.request.nonce={toString:'not_a_function'};
    if(kind==='unknown_peer_key')frame.peer.extra=true;
    if(kind==='unsafe_peer_number')frame.peer.pid=Number.MAX_SAFE_INTEGER+1;
    if(kind==='duplicate_key')send(c,JSON.stringify(frame).replace('"version":1','"version":1,"version":1')+'\n');
    else if(kind==='oversized')send(c,'x'.repeat(8193));
    else if(kind==='out_of_order')send(c,{state:'delivered'});
    else if(kind==='null')send(c,null);
    else if(kind==='array')send(c,[]);
    else send(c,frame);
    assert.equal(await s.delivered,false);assert.equal(s.live(),false);assert.equal(called,0);await s.close();
  });
}
test('responder failure/crash/cancellation never yields a delivered authorization',async()=>{
  for(const kind of ['response_failure','crash','cancel']){
    const c=fixture(),s=await listening(c,()=>{throw Error('synthetic')});
    if(kind==='response_failure')send(c,{state:'request',request,peer});
    if(kind==='crash'){c.exitCode=1;c.emit('exit',1)}
    if(kind==='cancel')await s.close();
    assert.equal(await s.delivered,false);assert.equal(s.live(),false);await s.close();
  }
});
test('startup timeout is bounded; no retry or alternate child',async()=>{
  const c=fixture(),start=performance.now();await assert.rejects(openReadyRelay({child:c,attemptId,respond:()=>{}}),/ready_relay/);
  assert.ok(performance.now()-start<2500);assert.equal(c.signalCode,'SIGTERM');
});
test('second request cannot consume a second nonce',async()=>{
  const c=fixture();let calls=0;const s=await listening(c,()=>{calls++;return{version:1,status:'READY'}});
  send(c,{state:'request',request,peer});send(c,{state:'request',request,peer});await tick();
  assert.equal(await s.delivered,false);assert.ok(calls<=1);await s.close();
});
