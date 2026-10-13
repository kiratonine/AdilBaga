import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eventCandidate,verifyCI,mandatory,repository} from './auto-gate.mjs';
import {sshOptions,runtimeChanged} from './auto-transport.mjs';
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
