import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eventCandidate,verifyCI,mandatory,repository} from './auto-gate.mjs';
import * as transport from './auto-transport.mjs';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const {sshOptions,runtimeChanged}=transport;
const sha='a'.repeat(40);
function fixture(){
  const r={id:42,workflow_id:7,event:'push',head_sha:sha,head_branch:'main',status:'completed',conclusion:'success',
    run_attempt:2,repository:{full_name:repository},head_repository:{full_name:repository}};
  return {event:{repository:{full_name:repository},workflow_run:r},run:r,
    workflow:{id:7,path:'.github/workflows/ci.yml',name:'CI',state:'active'},
    jobs:mandatory.map(name=>({name,status:'completed',conclusion:'success',head_sha:sha,run_attempt:2}))};
}
test('disabled by absent/false/nonexact flag',()=>{
  for(const value of [undefined,'false','TRUE','1']) assert.equal(eventCandidate(fixture().event,'workflow_run',value).status,'DISABLED');
});
test('only exact push-main CI may be eligible',()=>{
  const f=fixture(),c=eventCandidate(f.event,'workflow_run','true');
  assert.equal(verifyCI(c,f.run,f.workflow,f.jobs,sha).status,'ELIGIBLE');
});
for(const [field,value] of [['event','pull_request'],['head_branch','feature'],['conclusion','failure'],['conclusion','cancelled'],['status','in_progress']])
  test(`reject event ${field}/${value}`,()=>{
    const f=fixture(); f.run[field]=value;
    assert.equal(eventCandidate(f.event,'workflow_run','true').status,'REJECTED_EVENT');
  });
test('fork/source repository mismatch',()=>{
  const f=fixture();f.run.head_repository.full_name='fork/project';
  assert.equal(eventCandidate(f.event,'workflow_run','true').status,'REJECTED_EVENT');
});
test('manual dry-run cannot select production',()=>{
  assert.equal(eventCandidate({repository:{full_name:repository},inputs:{mode:'dry-run'}},'workflow_dispatch','true','refs/heads/main').status,'REJECTED_EVENT');
});
test('manual deploy exact inputs and main only',()=>{
  const e={repository:{full_name:repository},inputs:{mode:'deploy',sha,ci_run:'42'}};
  assert.equal(eventCandidate(e,'workflow_dispatch','true','refs/heads/main').sha,sha);
  assert.equal(eventCandidate(e,'workflow_dispatch','true','refs/heads/feature').status,'REJECTED_EVENT');
  e.inputs.sha='latest';assert.throws(()=>eventCandidate(e,'workflow_dispatch','true','refs/heads/main'));
});
test('fresh main mismatch is SKIPPED_STALE',()=>{
  const f=fixture();assert.equal(verifyCI({sha,run:42},f.run,f.workflow,f.jobs,'b'.repeat(40)).status,'SKIPPED_STALE');
});
for(const problem of ['missing','skip','failed','duplicate','different_sha','old_attempt','fake_workflow','other_repository'])
  test(`CI rejects ${problem}`,()=>{
    const f=fixture();
    if(problem==='missing')f.jobs.pop();
    if(problem==='skip')f.jobs[0].conclusion='skipped';
    if(problem==='failed')f.jobs[0].conclusion='failure';
    if(problem==='duplicate')f.jobs[0].name='CI Gate';
    if(problem==='different_sha')f.jobs[0].head_sha='b'.repeat(40);
    if(problem==='old_attempt')f.jobs[0].run_attempt=1;
    if(problem==='fake_workflow')f.workflow.path='.github/workflows/fake.yml';
    if(problem==='other_repository')f.run.repository.full_name='other/repo';
    assert.throws(()=>verifyCI({sha,run:42},f.run,f.workflow,f.jobs,sha));
  });
test('SSH strict identity, no forwarding or caller shell',()=>{
  const env={DEPLOY_HOST:'unit.invalid',DEPLOY_USER:'deploy_ci',DEPLOY_PORT:'22'};
  const args=sshOptions(env,'/tmp/synthetic_identity','/tmp/synthetic_hosts');
  assert.ok(args.includes('StrictHostKeyChecking=yes') && args.includes('ForwardAgent=no'));
  assert.equal(args.at(-1),'sudo -n /usr/local/sbin/adilbaga-deploy');
  for(const field of ['DEPLOY_HOST','DEPLOY_USER','DEPLOY_PORT'])assert.throws(()=>sshOptions({...env,[field]:'x; arbitrary'},'key','hosts'));
  assert.throws(()=>sshOptions({...env,DEPLOY_USER:'root'},'key','hosts'));
});
test('documentation/frontend/integration-only changes do not rebuild runtime',()=>{
  assert.equal(runtimeChanged(['docs/report.md','frontend/src/app.tsx','backend-go/tests/integration/test.go','backend-go/README.md']),false);
  for(const path of ['backend-go/Dockerfile','backend-go/.dockerignore','backend-go/go.mod','backend-go/go.sum',
    'backend-go/cmd/api/main.go','backend-go/internal/voice/service.go'])assert.equal(runtimeChanged([path]),true);
});

const active='438ecdfa3d386a186dcd8b73c3c10aef5e79dc82';
const reviewed='b75af8b2f290b96736d473c18e9aaf8746efe6d4';
const tooling={
  'contracts/package.json':['ee97d962531376e81a0b9175d8eef2aaa36a7c9c','48a7866b9084cbc25b2dafc1089713eb555e0a38'],
  'contracts/pnpm-lock.yaml':['5ec3371eba46c18660421d89949aa0ebf890d534','4a631ef27450ce85b818e4fe02705b9bcd224c13'],
};

// All Git/SSH responses here are synthetic OS fixtures; no network, repository
// writes or reliance on historical objects in a shallow CI checkout.
function fixtureGit(args,{old=active,next=reviewed,paths=Object.keys(tooling),change={},fail=false,mode='100644'}={}) {
  const a=args.filter(x=>x!=='--no-replace-objects');
  const ok=stdout=>({status:0,stdout:Buffer.from(stdout),stderr:Buffer.alloc(0)});
  if(fail)return {status:128,stdout:Buffer.alloc(0),stderr:Buffer.from('synthetic failure')};
  if(a[0]==='rev-parse') {
    const ref=a.at(-1).replace(/\^\{commit\}$/,'');
    return [old,next].includes(ref)?ok(ref+'\n'):{status:128,stdout:Buffer.alloc(0)};
  }
  if(a[0]==='diff') {
    if(a.at(-1)==='backend-go')return ok('backend-go/internal/httpapi/server.go\n');
    return ok(paths.length?paths.join(a.includes('-z')?'\0':'\n')+(a.includes('-z')?'\0':'\n'):'');
  }
  if(a[0]==='ls-tree') {
    const path=a.at(-1),ref=a[a.indexOf('--')-1],key=ref+':'+path;
    if(change[key]==='missing')return ok('');
    const hash=change[key]??tooling[path]?.[ref===old?0:1];
    return hash?ok(mode+' blob '+hash+'\t'+path+'\0'):ok('');
  }
  throw Error('unexpected synthetic Git operation');
}
function withGit(options,run) {
  const original=childProcess.spawnSync,calls=[];
  childProcess.spawnSync=(command,args,limits)=>{
    assert.equal(command,'git');assert.ok(args.includes('--no-replace-objects'));
    assert.equal(limits.timeout,10000);assert.equal(limits.maxBuffer,1<<20);
    calls.push(args);
    if(options.failAt===calls.length)return {status:null,stdout:Buffer.alloc(0),error:Error('synthetic timeout')};
    if(options.corruptAt===calls.length)return {status:0,stdout:Buffer.from('malformed Git output')};
    return fixtureGit(args,options);
  };
  syncBuiltinESMExports();
  try{return run(calls);}finally{childProcess.spawnSync=original;syncBuiltinESMExports();}
}

function plannerFixture(problem='none') {
  const dir=mkdtempSync(join(tmpdir(),'p1-transport-plan-'));
  try {
    const build=join(dir,'release-artifact');mkdirSync(build);
    const raw=Buffer.from('synthetic archive; not a Docker image');
    const m={sha:reviewed,size:raw.length,archive:createHash('sha256').update(raw).digest('hex'),
      provenance:{repository,ciWorkflow:'.github/workflows/ci.yml',ciRunId:42,ciAttempt:2,
        buildWorkflow:'.github/workflows/deploy-production.yml',buildRunId:43,buildAttempt:1}};
    const f=fixture();f.run.head_sha=reviewed;f.jobs.forEach(j=>j.head_sha=reviewed);
    const metadata={ci:{id:42,run_attempt:2,head_sha:reviewed},
      run:{id:43,workflow_id:8,event:'workflow_dispatch',head_branch:'main',head_sha:reviewed,
        status:'completed',conclusion:'success',run_attempt:1,repository:{full_name:repository},head_repository:{full_name:repository}},
      workflow:{id:8,path:'.github/workflows/deploy-production.yml',state:'active'},
      artifact:{id:99,name:`adilbaga-api-${reviewed}-43-1`,expired:false,workflow_run:{id:43,head_sha:reviewed}}};
    writeFileSync(join(build,'image.tar'),raw);writeFileSync(join(build,'manifest.json'),JSON.stringify(m));
    if(problem==='artifact-corrupt')writeFileSync(join(build,'image.tar'),Buffer.from('corrupt'));
    writeFileSync(join(dir,'artifact-metadata.json'),JSON.stringify(metadata));
    writeFileSync(join(dir,'adilbaga-build-path'),build);
    writeFileSync(join(dir,'event.json'),JSON.stringify({inputs:{mode:problem==='read-only-event-mismatch'?'deploy':'plan'}}));
    const replies={
      'actions/runs/42':f.run,'actions/workflows/7':f.workflow,
      'actions/runs/42/attempts/2/jobs?per_page=100':{total_count:f.jobs.length,jobs:f.jobs},
      'git/ref/heads/main':{object:{sha:reviewed}},
    };
    const program=`
import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
import assert from 'node:assert/strict';
const active=${JSON.stringify(active)},reviewed=${JSON.stringify(reviewed)},tooling=${JSON.stringify(tooling)};
const fixtureGit=${fixtureGit.toString()},replies=${JSON.stringify(replies)};
let ssh=0;
const problem=${JSON.stringify(problem)};
cp.spawnSync=(command,args)=>{
  if(command==='git'){
    if(problem==='git-missing')return {status:128,stdout:Buffer.alloc(0),stderr:Buffer.from('private-canary.invalid')};
    if(problem==='protected-delta'&&args.includes('diff')&&args.at(-1)!=='backend-go')
      return fixtureGit(args,{paths:[...Object.keys(tooling),'contracts/openapi.yaml']});
    const value=fixtureGit(args);
    if(args.includes('diff')&&args.at(-1)!=='backend-go')console.log('SYNTHETIC_PROTECTED_DIFF_RETURNED');
    return value;
  }
  assert.equal(command,'ssh');ssh++;assert.equal(ssh,1);
  if(problem==='ssh-auth')return {status:255,stdout:Buffer.alloc(0),stderr:Buffer.from('Permission denied (publickey). private-canary.invalid')};
  if(problem==='ssh-host-key')return {status:255,stdout:Buffer.alloc(0),stderr:Buffer.from('Host key verification failed. private-canary.invalid')};
  if(problem==='ssh-timeout')return {status:null,error:Object.assign(Error('private-canary.invalid'),{code:'ETIMEDOUT'}),stdout:Buffer.alloc(0),stderr:Buffer.alloc(0)};
  if(problem==='broker-json')return {status:0,stdout:Buffer.from('private-canary.invalid'),stderr:Buffer.alloc(0)};
  if(problem==='ssh-unknown')return {status:255,stdout:Buffer.alloc(0),stderr:Buffer.from('private-canary.invalid')};
  if(problem==='ssh-key-parse')return {status:255,stdout:Buffer.alloc(0),stderr:Buffer.from('Load key "private-canary.invalid": error in libcrypto; Permission denied (publickey).')};
  if(problem==='ssh-peer-close')return {status:255,stdout:Buffer.alloc(0),stderr:Buffer.from('Connection closed by private-canary.invalid port 22')};
  if(problem==='ssh-client-missing')return {status:null,error:Object.assign(Error('private-canary.invalid'),{code:'ENOENT'}),stdout:Buffer.alloc(0),stderr:Buffer.alloc(0)};
  if(problem==='ssh-output-limit')return {status:null,error:Object.assign(Error('private-canary.invalid'),{code:'ENOBUFS'}),stdout:Buffer.alloc(0),stderr:Buffer.alloc(0)};
  if(problem==='ssh-negotiation')return {status:255,stdout:Buffer.alloc(0),stderr:Buffer.from('Unable to negotiate with private-canary.invalid: no matching host key type found')};
  if(problem==='broker-blocked')return {status:1,stdout:Buffer.from(JSON.stringify({status:'BLOCKED_BROKER'})),stderr:Buffer.alloc(0)};
  if(problem==='broker-extra')return {status:1,stdout:Buffer.from(JSON.stringify({status:'BLOCKED_BROKER',secret:'private-canary.invalid'})),stderr:Buffer.alloc(0)};
  if(problem==='ssh-status-canary')return {status:'private-canary.invalid',stdout:Buffer.alloc(0),stderr:Buffer.alloc(0)};
  return {status:0,stdout:Buffer.from(JSON.stringify({active,available:true}))};
};syncBuiltinESMExports();
globalThis.fetch=async url=>{
  const prefix='https://api.github.com/repos/kiratonine/AdilBaga/';
  assert.ok(url.startsWith(prefix));const key=url.slice(prefix.length);
  if(problem==='ci-error')throw Error('private-canary.invalid');
  assert.ok(Object.hasOwn(replies,key));return {ok:true,json:async()=>replies[key]};
};
process.argv[1]=${JSON.stringify(new URL('./auto-transport.mjs',import.meta.url).pathname)};
if(problem.startsWith('read-only'))process.argv[2]='plan';
await import(${JSON.stringify(new URL('./auto-transport.mjs',import.meta.url).href)});
process.on('exit',()=>console.log('SYNTHETIC_SSH_CALLS='+ssh));
`;
    const r=childProcess.spawnSync(process.execPath,['--input-type=module','-e',program],{timeout:15000,encoding:'utf8',
      env:{PATH:process.env.PATH,HOME:process.env.HOME,RUNNER_TEMP:dir,GITHUB_OUTPUT:problem==='output-error'?dir:join(dir,'output'),
        GITHUB_EVENT_PATH:join(dir,'event.json'),
        AUTO_DEPLOY_ENABLED:problem.startsWith('read-only')&&problem!=='read-only-flag-true'?'false':'true',
        GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',
        DEPLOY_MODE:problem.startsWith('read-only')?'plan':'deploy',
        DEPLOY_PHASE:problem.startsWith('read-only')?'submit':'plan',RELEASE_SHA:reviewed,CI_RUN:'42',GITHUB_TOKEN:'synthetic',
        DEPLOY_HOST:'unit.invalid',DEPLOY_USER:'deploy_ci',DEPLOY_PORT:'22',
        DEPLOY_SSH_KEY:problem==='ssh-config-missing'?'':'synthetic',DEPLOY_KNOWN_HOSTS:'synthetic'}});
    if(problem!=='none'&&problem!=='read-only') {
      assert.equal(r.status,1);
      const expected={'ssh-auth':'SSH_STATUS SSH_AUTH_FAILED','ssh-host-key':'SSH_STATUS HOST_KEY_REJECTED',
        'ssh-timeout':'SSH_STATUS SSH_CONNECT_FAILED','broker-json':'SSH_STATUS BROKER_STATUS_REJECTED',
        'ssh-unknown':'SSH_STATUS UNKNOWN','git-missing':'COMPATIBILITY PROTECTED_DELTA',
        'ci-error':'CI CI_INELIGIBLE','output-error':'OUTPUT OUTPUT_WRITE_FAILED',
        'artifact-corrupt':'ARTIFACT ARTIFACT_INVALID','ssh-config-missing':'SSH_CONFIG INVALID_INPUT',
        'protected-delta':'COMPATIBILITY PROTECTED_DELTA',
        'ssh-key-parse':'SSH_STATUS SSH_KEY_REJECTED','ssh-peer-close':'SSH_STATUS SSH_PEER_CLOSED',
        'ssh-client-missing':'SSH_STATUS SSH_CLIENT_UNAVAILABLE','ssh-output-limit':'SSH_STATUS SSH_OUTPUT_LIMIT',
        'ssh-negotiation':'SSH_STATUS SSH_NEGOTIATION_FAILED','broker-blocked':'SSH_STATUS BROKER_STATUS_REJECTED',
        'broker-extra':'SSH_STATUS UNKNOWN','ssh-status-canary':'SSH_STATUS UNKNOWN',
        'read-only-event-mismatch':'ADMISSION INVALID_INPUT','read-only-flag-true':'ADMISSION INVALID_INPUT'}[problem];
      assert.match(r.stderr,new RegExp('P1_PLAN_'+expected));
      assert.match(r.stderr,/BLOCKED_TRANSPORT_OR_ROLLOUT/);
      assert.ok(!r.stderr.includes('private-canary.invalid')&&!r.stdout.includes('private-canary.invalid'));
      if(problem==='broker-blocked')assert.match(r.stderr,/P1_SSH_EXIT 1\n/);
      if(problem==='ssh-status-canary')assert.match(r.stderr,/P1_SSH_EXIT UNAVAILABLE\n/);
      assert.match(r.stdout,new RegExp('SYNTHETIC_SSH_CALLS='+(['ci-error','artifact-corrupt','ssh-config-missing','read-only-event-mismatch','read-only-flag-true'].includes(problem)?0:1)));
      return;
    }
    assert.match(r.stdout,/SYNTHETIC_PROTECTED_DIFF_RETURNED/);
    assert.equal(r.status,0,r.stdout+r.stderr);
    assert.match(r.stdout,/PLAN_VERIFIED/);assert.match(r.stdout,/SYNTHETIC_SSH_CALLS=1/);
    assert.equal(readFileSync(join(dir,'output'),'utf8'),'changed=true\n');
  } finally {rmSync(dir,{recursive:true,force:true});}
}
test('real transport plan accepts reviewed tooling pair after artifact/CI checks (synthetic OS)',()=>plannerFixture());
for(const problem of ['ssh-auth','ssh-host-key','ssh-timeout','broker-json','ssh-unknown','git-missing','ci-error','output-error',
  'artifact-corrupt','ssh-config-missing','protected-delta','read-only-event-mismatch','read-only-flag-true',
  'ssh-key-parse','ssh-peer-close','ssh-client-missing','ssh-output-limit','ssh-negotiation','broker-blocked',
  'broker-extra','ssh-status-canary'])
  test(`planner emits finite redacted ${problem} stage without retry/submit`,()=>plannerFixture(problem));
test('read-only CLI stays nonmutating even with DEPLOY_PHASE=submit and activation false',()=>plannerFixture('read-only'));
test('runner diagnostic job is main-only, Environment-controlled and cannot run submit/build',()=>{
  const workflow=readFileSync(new URL('../../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
  const job=workflow.split('\n  plan_only:\n')[1];assert.ok(job);
  assert.match(job,/needs: offline/);
  assert.match(job,/github\.ref == 'refs\/heads\/main'/);
  assert.match(job,/inputs\.mode == 'plan'/);
  assert.match(job,/vars\.AUTO_DEPLOY_ENABLED != 'true'/);
  assert.match(job,/environment: production/);
  assert.match(job,/with: \{ref: main, fetch-depth: 0, persist-credentials: false\}/);
  assert.equal([...job.matchAll(/run: node scripts\/deploy\/auto-transport\.mjs(.*)/g)].length,1);
  assert.match(job,/run: node scripts\/deploy\/auto-transport\.mjs plan\n/);
  assert.ok(!/DEPLOY_MODE: deploy|operation.*submit|auto-build\.mjs build|docker|variable set/.test(job));
  const rollout=workflow.split('\n  rollout:\n')[1].split('\n  # Separately reviewed')[0];
  assert.match(rollout,/if: steps\.plan\.outputs\.changed == 'true'/);
  assert.match(rollout,/name: Approved broker transport and bounded rollout/);
});

test('compatibility guard validates all four Git blobs and uses no-renames/NUL paths',()=>withGit({},calls=>{
  transport.verifyCompatibility(active,reviewed);
  const diff=calls.find(a=>a.includes('diff'));
  assert.ok(diff.includes('--no-renames')&&diff.includes('-z'));
  assert.deepEqual(diff.slice(diff.indexOf('--')+1),['backend/prisma','contracts','deploy/compose.production.yml']);
  assert.equal(calls.filter(a=>a.includes('ls-tree')).length,4);
}));
test('future verified main with identical tooling blobs is not pinned to an obsolete candidate SHA',()=>{
  const next='c'.repeat(40);
  withGit({next},()=>transport.verifyCompatibility(active,next));
  assert.equal(runtimeChanged(['backend-go/internal/httpapi/server.go','docs/report.md']),true);
});
test('unchanged protected objects remain admissible without any tooling exception',()=>withGit({paths:[]},calls=>{
  transport.verifyCompatibility(active,reviewed);
  assert.equal(calls.filter(a=>a.includes('ls-tree')).length,0);
}));
for(const path of ['contracts/openapi.yaml','contracts/examples/products.json','contracts/other.json',
  'contracts/package.json.extra','backend/prisma/schema.prisma','backend/prisma/migrations/new.sql','deploy/compose.production.yml'])
  test(`compatibility rejects extra protected change ${path}`,()=>withGit({paths:[...Object.keys(tooling),path]},()=>{
    assert.throws(()=>transport.verifyCompatibility(active,reviewed));
  }));
for(const path of Object.keys(tooling))for(const ref of [active,reviewed])for(const hash of ['0'.repeat(40),'missing'])
  test(`compatibility rejects ${path} ${ref===active?'old':'new'} ${hash==='missing'?'missing':'modified'} blob`,()=>{
    withGit({change:{[ref+':'+path]:hash}},()=>assert.throws(()=>transport.verifyCompatibility(active,reviewed)));
  });
for(const paths of [['contracts/package.json'],['contracts/pnpm-lock.yaml'],
  ['contracts/package.json','contracts/package.json'],['contracts/package.json','contracts/renamed-lock.yaml']])
  test(`compatibility rejects incomplete/duplicate/rename path set ${paths.join(',')}`,()=>withGit({paths},()=>{
    assert.throws(()=>transport.verifyCompatibility(active,reviewed));
  }));
test('same tooling pair with a different active commit is not an approved exception',()=>{
  const old='d'.repeat(40);withGit({old},()=>assert.throws(()=>transport.verifyCompatibility(old,reviewed)));
});
for(const ref of ['main','--all','abc','A'.repeat(40),'f'.repeat(40)])
  test(`compatibility rejects malformed/unknown candidate ${ref}`,()=>withGit({},()=>{
    assert.throws(()=>transport.verifyCompatibility(active,ref));
  }));
test('Git failure is fail-closed even if there appear to be no changed protected files',()=>withGit({fail:true,paths:[]},()=>{
  assert.throws(()=>transport.verifyCompatibility(active,reviewed));
}));
for(let failAt=1;failAt<=7;failAt++)test(`Git timeout/failure at operation ${failAt} blocks`,()=>withGit({failAt},()=>{
  assert.throws(()=>transport.verifyCompatibility(active,reviewed));
}));
for(const corruptAt of [1,3,4])test(`malformed Git output at operation ${corruptAt} blocks`,()=>withGit({corruptAt},()=>{
  assert.throws(()=>transport.verifyCompatibility(active,reviewed));
}));
for(const mode of ['120000','100755','160000'])test(`tooling Git mode ${mode} is not the reviewed regular file`,()=>withGit({mode},()=>{
  assert.throws(()=>transport.verifyCompatibility(active,reviewed));
}));
