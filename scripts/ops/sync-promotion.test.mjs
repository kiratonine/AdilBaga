import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {connection,validateCI,parseRootReply} from './sync-promotion.mjs';
const sha='a'.repeat(40);
const ci={id:1,run_attempt:1,repository:{full_name:'kiratonine/AdilBaga'},head_repository:{full_name:'kiratonine/AdilBaga'},
  head_sha:sha,head_branch:'main',event:'push',status:'completed',conclusion:'success',path:'.github/workflows/ci.yml'};
const jobs=['Contracts','Go Quality','Nest Reference','Frontend','Pipeline Quality','Security','PostgreSQL Integration','Ephemeral Staging','CI Gate'].map(name=>({name,status:'completed',conclusion:'success'}));
test('exact main / nine successful current CI jobs only',()=>{
  assert.doesNotThrow(()=>validateCI(sha,ci,jobs,sha));
  for(const change of [{event:'pull_request'},{head_branch:'other'},{head_sha:'b'.repeat(40)},
    {conclusion:'skipped'},{status:'in_progress'},{path:'.github/workflows/other.yml'},{id:true},{run_attempt:true},
    {repository:{full_name:'other/repo'}}])assert.throws(()=>validateCI(sha,{...ci,...change},jobs,sha));
  assert.throws(()=>validateCI(sha,ci,jobs,'b'.repeat(40)));
  assert.throws(()=>validateCI(sha,ci,jobs.slice(1),sha));
  assert.throws(()=>validateCI(sha,ci,[...jobs.slice(1),jobs[1]],sha));
  assert.throws(()=>validateCI(sha,ci,[{...jobs[0],conclusion:'failure'},...jobs.slice(1)],sha));
});
test('fixed restricted SSH command, strict authenticated known_hosts, no root or injected target',()=>{
  const env={PROMOTE_HOST:'example.invalid',PROMOTE_PORT:'22',PROMOTE_USER:'aktau-promote'};
  const args=connection(env,'/private/identity','/private/hosts');
  assert.equal(args.at(-1),'sudo -n /usr/local/sbin/aktau-sync-promote');
  for(const option of ['BatchMode=yes','IdentitiesOnly=yes','StrictHostKeyChecking=yes','ForwardAgent=no'])assert.ok(args.includes(option));
  for(const change of [{PROMOTE_USER:'root'},{PROMOTE_USER:'user;id'},{PROMOTE_HOST:'host;id'},{PROMOTE_PORT:'0'},{PROMOTE_PORT:'22;id'}])assert.throws(()=>connection({...env,...change},'/key','/hosts'));
});
test('root protocol uses exactly compact JSON/LF and finite safe rejection classes',()=>{
  assert.deepEqual(parseRootReply(0,Buffer.from('{"status":"NO_OP"}\n')),{status:'NO_OP'});
  for(const raw of ['{"status": "NO_OP"}\n','{"status":"NO_OP"}\n{}\n','raw provider log','{"status":"NO_OP"}'])assert.throws(()=>parseRootReply(0,Buffer.from(raw)));
  assert.throws(()=>parseRootReply(1,Buffer.from('{"status":"BLOCKED","errorClass":"active_runtime"}\n')),e=>e.safeClass==='active_runtime');
  assert.throws(()=>parseRootReply(1,Buffer.from('{"status":"BLOCKED","errorClass":"private_provider_payload"}\n')),e=>e.safeClass==='root_rejection'&&!e.message.includes('private_provider_payload'));
});
test('separate workflows: immutable build has no production credential environment',()=>{
  const b=fs.readFileSync('.github/workflows/sync-publisher-build.yml','utf8');
  const p=fs.readFileSync('.github/workflows/sync-publisher-promote.yml','utf8');
  const builder=b.slice(b.indexOf('\n  build:'));
  assert.ok(!builder.includes('secrets.')&&!builder.includes('PROMOTE_SSH_KEY'));
  assert.ok(b.includes("mode:")&&b.includes('options: [build-only, promote]'));
  assert.ok(p.includes('workflows: [Build sync publisher artifact]'));
  for(const text of [b,p]){
    assert.ok(!/AUTO_DEPLOY_ENABLED|pull_request_target|contents: write|actions: write/.test(text));
    assert.ok(text.includes('cancel-in-progress: false'));
    assert.ok(text.includes('environment: sync-publisher'));
    for(const ref of text.matchAll(/uses:\s+[^@\s]+@([^\s]+)/g))assert.match(ref[1],/^[a-f0-9]{40}$/);
  }
});
