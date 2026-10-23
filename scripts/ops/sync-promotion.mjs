// Trusted main-only operator/CI client. SSH bytes do not authorize root actions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {sshOptions} from '../deploy/auto-transport.mjs';
const repo='kiratonine/AdilBaga',shaPattern=/^[a-f0-9]{40}$/;
const CI=['Contracts','Go Quality','Nest Reference','Frontend','Pipeline Quality','Security','PostgreSQL Integration','Ephemeral Staging','CI Gate'];
function run(name,args,options={}) {
  const r=spawnSync(name,args,{timeout:300000,maxBuffer:256<<20,stdio:['ignore','pipe','pipe'],...options});
  assert.equal(r.status,0,'bounded_operation_failed');return r.stdout;
}
async function api(p) {
  assert.ok(process.env.GITHUB_TOKEN,'github_context_missing');
  const r=await fetch('https://api.github.com/repos/'+repo+'/'+p,{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,
    Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(10000)});
  assert.equal(r.status,200);assert.ok(Number(r.headers.get('content-length')??0)<=2<<20);
  const raw=await r.text();assert.ok(Buffer.byteLength(raw)<=2<<20);return JSON.parse(raw);
}
export function validateCI(sha,ci,jobs,main) {
  assert.match(sha,shaPattern);assert.equal(sha,main);assert.equal(ci.head_sha,sha);
  assert.equal(ci.repository?.full_name,repo);assert.equal(ci.head_repository?.full_name,repo);
  assert.equal(ci.event,'push');assert.equal(ci.head_branch,'main');assert.equal(ci.status,'completed');
  assert.equal(ci.conclusion,'success');assert.equal(ci.path,'.github/workflows/ci.yml');
  assert.ok(Number.isSafeInteger(ci.id)&&ci.id>0&&Number.isSafeInteger(ci.run_attempt)&&ci.run_attempt>0);
  assert.equal(jobs.length,9);assert.deepEqual(jobs.map(x=>x.name).sort(),[...CI].sort());
  assert.ok(jobs.every(x=>x.status==='completed'&&x.conclusion==='success'));
}
export function connection(env,key,hosts) {
  const args=sshOptions({DEPLOY_HOST:env.PROMOTE_HOST,DEPLOY_PORT:env.PROMOTE_PORT,DEPLOY_USER:env.PROMOTE_USER},key,hosts);
  assert.equal(args.at(-1),'sudo -n /usr/local/sbin/adilbaga-deploy');
  return [...args.slice(0,-1),'sudo -n /usr/local/sbin/aktau-sync-promote'];
}
export function parseRootReply(status,raw) {
  const value=JSON.parse(raw);assert.equal(JSON.stringify(value)+'\n',raw.toString());
  if(status!==0) {
    const allowed=new Set(['main_drift','active_runtime','operator_actor_active','pending_promotion_recovery',
      'pending_c2_recovery','active_attempt','old_closure_drift','unapproved_source_drift','dirty_publisher',
      'protected_delta','unexpected_base','replayed_release','producer_source_changed','github_archive_digest',
      'insufficient_memory_capacity','trusted_authorization_unavailable','command_cleanup_unverified']);
    const error=Error('root_rejection');error.safeClass=value?.status==='BLOCKED'&&allowed.has(value.errorClass)?value.errorClass:'root_rejection';throw error;
  }
  return value;
}
function remote(request,archive=Buffer.alloc(0)) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aktau-sync-ssh-'));
  try {
    assert.ok(process.env.PROMOTE_SSH_KEY&&process.env.PROMOTE_KNOWN_HOSTS);
    const key=path.join(dir,'key'),hosts=path.join(dir,'known-hosts');
    fs.writeFileSync(key,process.env.PROMOTE_SSH_KEY,{mode:0o600});fs.writeFileSync(hosts,process.env.PROMOTE_KNOWN_HOSTS,{mode:0o600});
    const r=spawnSync('ssh',connection(process.env,key,hosts),{input:Buffer.concat([Buffer.from(JSON.stringify(request)+'\n'),archive]),
      env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8'},timeout:360000,maxBuffer:16384});
    if(r.error){const error=Error('remote_reconciliation_required');error.safeClass='remote_reconciliation_required';throw error}
    return parseRootReply(r.status,r.stdout);
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
}
function emit(values) {
  assert.ok(process.env.GITHUB_OUTPUT);
  for(const [key,value] of Object.entries(values)) {
    assert.match(String(value),/^[a-zA-Z0-9_-]+$/);
    fs.appendFileSync(process.env.GITHUB_OUTPUT,key+'='+value+'\n');
  }
}
function diffRelevant(base,sha) {
  assert.match(base,shaPattern);assert.match(sha,shaPattern);
  // The SAME source-defined relevance function is used by root-side admission.
  const names=run('git',['--no-replace-objects','diff','--name-only',base,sha]).toString().trim().split('\n').filter(Boolean);
  const script='import importlib.util,json,sys;s=importlib.util.spec_from_file_location("p","ops/c2/publisher-promotion.py");p=importlib.util.module_from_spec(s);s.loader.exec_module(p);print("true" if p.relevant(json.load(sys.stdin)) else "false")';
  return run('python3',['-B','-c',script],{input:JSON.stringify(names)}).toString().trim()==='true';
}
async function gate() {
  assert.equal(process.env.GITHUB_REPOSITORY,repo);assert.equal(process.env.GITHUB_REF,'refs/heads/main');
  const e=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH));
  const manual=process.env.GITHUB_EVENT_NAME==='workflow_dispatch';
  assert.ok(manual||process.env.GITHUB_EVENT_NAME==='workflow_run');
  const sha=manual?e.inputs?.sha:e.workflow_run?.head_sha;
  const id=manual?e.inputs?.ci_run:e.workflow_run?.id;
  assert.match(String(id),/^[1-9][0-9]{0,15}$/);
  const buildOnly=manual&&e.inputs?.mode==='build-only';
  const ci=await api('actions/runs/'+id),jobs=(await api('actions/runs/'+id+'/jobs?per_page=100')).jobs;
  validateCI(sha,ci,jobs,(await api('git/ref/heads/main')).object.sha);
  assert.equal(run('git',['rev-parse','HEAD']).toString().trim(),sha);
  let eligible=buildOnly;
  if(!buildOnly) {
    assert.equal(process.env.SYNC_C2_PROMOTION_ENABLED,'true');
    if(!manual) {
      const commit=await api('git/commits/'+sha);assert.ok(commit.parents?.length);
      if(!diffRelevant(commit.parents[0].sha,sha)) {
        emit({eligible:'false',sha,ci_run:String(ci.id),ci_attempt:String(ci.run_attempt),kind:'promote'});
        console.log('NO_RELEVANT_PUSH_CHANGE');return;
      }
    }
    const status=remote({version:1,operation:'status'});assert.match(status.publisher?.sha,shaPattern);
    // Fetch only public source objects on the runner, never the VPS.
    run('git',['fetch','--no-tags','origin',status.publisher.sha]);
    eligible=status.publisher.sha===sha?!status.authorityAligned:diffRelevant(status.publisher.sha,sha);
  }
  emit({eligible:String(eligible),sha,ci_run:String(ci.id),ci_attempt:String(ci.run_attempt),kind:buildOnly?'build-only':'promote'});
  console.log(eligible?'BUILD_ELIGIBLE':'NO_RELEVANT_RUNTIME_CHANGE');
}
async function promote() {
  assert.equal(process.env.GITHUB_REPOSITORY,repo);assert.equal(process.env.GITHUB_REF,'refs/heads/main');
  const e=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH));
  const manual=process.env.GITHUB_EVENT_NAME==='workflow_dispatch';
  assert.ok(manual||process.env.GITHUB_EVENT_NAME==='workflow_run');
  const build=await api('actions/runs/'+(manual?e.inputs?.build_run:e.workflow_run?.id));
  assert.equal(build.path,'.github/workflows/sync-publisher-build.yml');assert.equal(build.head_branch,'main');
  assert.equal(build.status,'completed');assert.equal(build.conclusion,'success');
  assert.ok(['workflow_run','workflow_dispatch'].includes(build.event));
  assert.equal(build.repository?.full_name,repo);assert.equal(build.head_repository?.full_name,repo);
  const producerJobs=(await api('actions/runs/'+build.id+'/jobs?per_page=100')).jobs;
  const buildJob=producerJobs.find(j=>j.name==='Build immutable sync + C2');
  if(buildJob?.conclusion==='skipped'){console.log('NO_RELEVANT_RUNTIME_CHANGE');return}
  assert.equal(buildJob?.conclusion,'success');
  const sha=build.head_sha;assert.match(sha,shaPattern);assert.equal((await api('git/ref/heads/main')).object.sha,sha);
  const arts=(await api('actions/runs/'+build.id+'/artifacts?per_page=100')).artifacts;
  const expected='aktau-sync-c2-'+sha+'-'+build.id+'-'+build.run_attempt;
  const matches=arts.filter(a=>a.name===expected);assert.equal(matches.length,1);
  const a=matches[0];assert.equal(a.expired,false);assert.ok(a.size_in_bytes>0&&a.size_in_bytes<=256<<20);
  if(manual)assert.equal(String(a.id),e.inputs?.artifact_id);
  // gh handles the authenticated artifact download redirect; no token in argv.
  const zip=run('gh',['api','repos/'+repo+'/actions/artifacts/'+a.id+'/zip'],{env:{PATH:process.env.PATH,HOME:process.env.HOME,GH_TOKEN:process.env.GITHUB_TOKEN}});
  const script='import importlib.util,json,sys;s=importlib.util.spec_from_file_location("p","ops/c2/publisher-promotion.py");p=importlib.util.module_from_spec(s);s.loader.exec_module(p);v=p.unpack_zip(sys.stdin.buffer.read());m=p.validate_package(v,"'+sha+'");print(json.dumps({k:m[k] for k in ["kind","ciRunId"]}))';
  const manifest=JSON.parse(run('python3',['-B','-c',script],{input:zip,maxBuffer:16384}));
  if(manifest.kind==='build-only'){console.log('BUILD_ONLY_NO_PROMOTION');return}
  assert.equal(manifest.kind,'promote');assert.equal(process.env.SYNC_C2_PROMOTION_ENABLED,'true');
  const ci=await api('actions/runs/'+manifest.ciRunId);
  validateCI(sha,ci,(await api('actions/runs/'+ci.id+'/jobs?per_page=100')).jobs,sha);
  const result=remote({version:1,operation:'promote',sourceSha:sha,artifactId:a.id,buildRunId:build.id,ciRunId:ci.id,size:zip.length},zip);
  assert.ok(['NO_OP','C2_CONFIG_SOURCE_ALIGNED'].includes(result.status));
  console.log(result.status);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try{assert.equal(process.argv.length,3);if(process.argv[2]==='gate')await gate();else if(process.argv[2]==='promote')await promote();else throw Error()}
  catch(error){console.error(JSON.stringify({status:'BLOCKED_SYNC_C2_PROMOTION',errorClass:error?.safeClass??'client_admission'}));process.exitCode=1}
}
