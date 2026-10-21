// Go test executable only: actual child/socket/peer, explicitly synthetic trust.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
import {openReadyRelay} from '../c2-production-supervisor.mjs';
const [binary,directory,raw]=process.argv.slice(2),a=JSON.parse(raw);
assert.ok(directory.startsWith(path.join(os.tmpdir(),'c2r-')));
assert.equal(fs.lstatSync(directory).mode&0o777,0o700);assert.equal(fs.lstatSync(directory).uid,process.geteuid());
let peerMatched=false;
// Race-instrumented Go test subprocess only: suppress Go's default1s exit
// sleep, not any race detection, to measure the real bounded cleanup.
const child=spawn(binary,['-test.run=^TestReadyHelperProcess$'],{env:{GORACE:'atexit_sleep_ms=0',PART32_TEST_HELPER:'1',PART32_TEST_SOCKET:path.join(directory,'ready.sock'),PART32_TEST_ATTEMPT:a.attemptId},stdio:['pipe','pipe','ignore']});
const relay=await openReadyRelay({child,attemptId:a.attemptId,respond(request,peer){
  assert.equal(peer.pid,process.ppid);assert.equal(peer.uid,process.geteuid());assert.equal(peer.gid,process.getegid());peerMatched=true;
  return{version:1,status:'READY',attemptId:a.attemptId,nonce:request.nonce,s0:{snapshotId:'bbbbbbbb-0000-4000-8000-000000000000',publishedAt:'2026-10-21T00:00:00.000Z'},projectionSha256:'d'.repeat(64),witnessSha256:'e'.repeat(64),sourceSha:a.sourceSha,frontendSha:a.frontendSha,deploymentId:a.deploymentId,confirmedAt:a.confirmedAt,bootId:a.bootId,expiresAt:a.expiresAt};
}});
process.stdout.write(JSON.stringify({pid:child.pid})+'\n');
try{
  assert.equal(await relay.delivered,true);assert.equal(relay.live(),true);
  // Test-only parent barrier, not another Unix frame or arbitrary sleep.
  const close=await new Promise(r=>process.stdin.once('data',r));
  assert.equal(close.toString(),'CLOSE\n');
  process.stdout.write(JSON.stringify({delivered:true,peerMatched})+'\n');
}finally{assert.equal(await relay.close(),true)}
