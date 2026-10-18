import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,lstatSync,appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {check,shaPattern,api,eventCandidate,repository} from './auto-gate.mjs';
const workflowPath='.github/workflows/deploy-production.yml';
const digest=b=>createHash('sha256').update(b).digest('hex');
const positive=n=>assert.ok(Number.isSafeInteger(n) && n>0,'invalid producer identity');
export function artifactName(sha,run,attempt) {
  assert.match(sha,shaPattern);positive(run);positive(attempt);
  return `adilbaga-api-${sha}-${run}-${attempt}`;
}
export function validateProducer(m,run,workflow,artifact,ci) {
  const p=m.provenance;assert.ok(p,'missing producer');
  assert.equal(p.repository,repository);assert.equal(p.ciWorkflow,'.github/workflows/ci.yml');
  assert.equal(p.ciRunId,ci.id);assert.equal(p.ciAttempt,ci.run_attempt);
  assert.equal(ci.head_sha,m.sha);
  assert.equal(run.repository?.full_name,repository);assert.equal(run.head_repository?.full_name,repository);
  assert.equal(run.event,'workflow_dispatch');assert.equal(run.head_branch,'main');
  assert.equal(run.head_sha,m.sha);assert.equal(run.status,'completed');assert.equal(run.conclusion,'success');
  assert.equal(p.buildWorkflow,workflowPath);assert.equal(workflow.path,workflowPath);
  assert.equal(workflow.id,run.workflow_id);assert.equal(workflow.state,'active');
  assert.equal(p.buildRunId,run.id);assert.equal(p.buildAttempt,run.run_attempt);
  assert.equal(artifact.expired,false);assert.equal(artifact.workflow_run?.id,run.id);
  assert.equal(artifact.workflow_run?.head_sha,m.sha);positive(artifact.id);
  assert.equal(artifact.name,artifactName(m.sha,run.id,run.run_attempt));
}
function boundedJSON(path,limit=16384) {
  const s=lstatSync(path);assert.ok(s.isFile() && !s.isSymbolicLink() && s.size<=limit,'invalid metadata');
  return JSON.parse(readFileSync(path,'utf8'));
}
export function verifyDownloaded(dir,metadata) {
  const m=boundedJSON(join(dir,'manifest.json'));
  validateProducer(m,metadata.run,metadata.workflow,metadata.artifact,metadata.ci);
  const path=join(dir,'image.tar'),s=lstatSync(path);
  assert.ok(s.isFile() && !s.isSymbolicLink() && s.size>0 && s.size<=(256<<20),'invalid archive');
  assert.equal(m.size,s.size);assert.equal(digest(readFileSync(path)),m.archive,'archive changed after build');
  m.provenance.artifactIdentity={id:metadata.artifact.id,name:metadata.artifact.name};
  return m;
}
export async function artifactMetadata(env=process.env,get=api) {
  assert.match(env.RELEASE_SHA,shaPattern);assert.match(env.RELEASE_ARTIFACT_ID,/^[1-9][0-9]{0,15}$/);
  const artifact=await get(`actions/artifacts/${env.RELEASE_ARTIFACT_ID}`);positive(artifact.id);
  assert.equal(String(artifact.id),env.RELEASE_ARTIFACT_ID);
  positive(artifact.workflow_run?.id);
  const run=await get(`actions/runs/${artifact.workflow_run.id}`);
  const workflow=await get(`actions/workflows/${run.workflow_id}`);
  const ci=await get(`actions/runs/${env.CI_RUN}`);
  // Validate identity before invoking the pinned downloader, not only afterward.
  const m={sha:env.RELEASE_SHA,provenance:{repository,ciWorkflow:'.github/workflows/ci.yml',
    ciRunId:Number(env.CI_RUN),ciAttempt:ci.run_attempt,buildWorkflow:workflowPath,
    buildRunId:run.id,buildAttempt:run.run_attempt}};
  validateProducer(m,run,workflow,artifact,ci);
  return {run:{id:run.id,workflow_id:run.workflow_id,event:run.event,head_branch:run.head_branch,
    head_sha:run.head_sha,status:run.status,conclusion:run.conclusion,run_attempt:run.run_attempt,
    repository:{full_name:run.repository.full_name},head_repository:{full_name:run.head_repository.full_name}},
    workflow:{id:workflow.id,path:workflow.path,state:workflow.state},
    artifact:{id:artifact.id,name:artifact.name,expired:artifact.expired,
      workflow_run:{id:artifact.workflow_run.id,head_sha:artifact.workflow_run.head_sha}},
    ci:{id:ci.id,run_attempt:ci.run_attempt,head_sha:ci.head_sha}};
}
export function run(command,args,options={}) {
  const r=spawnSync(command,args,{maxBuffer:32<<20,timeout:1200000,...options});
  assert.equal(r.status,0,'bounded_operation_failed'); return r.stdout;
}
export async function build() {
  assert.equal(process.env.GITHUB_EVENT_NAME,'workflow_dispatch');
  assert.equal(process.env.GITHUB_REF,'refs/heads/main');
  assert.equal(boundedJSON(process.env.GITHUB_EVENT_PATH,1<<20).inputs?.mode,'build');
  assert.ok(!process.env.DEPLOY_SSH_KEY && !process.env.DEPLOY_KNOWN_HOSTS,'build must not receive SSH secrets');
  const sha=process.env.RELEASE_SHA; assert.match(sha,shaPattern);
  const gate=await check({sha,run:Number(process.env.CI_RUN)});
  if(gate.status!=='ELIGIBLE') {console.log(gate.status); return;}
  assert.equal(run('git',['rev-parse','HEAD']).toString().trim(),sha);
  assert.equal(run('git',['status','--porcelain']).length,0,'dirty_checkout');
  const dir=mkdtempSync(join(process.env.RUNNER_TEMP,'adilbaga-build-'));
  const ci=await api(`actions/runs/${process.env.CI_RUN}`);
  positive(ci.run_attempt);
  const buildRunId=Number(process.env.GITHUB_RUN_ID),buildAttempt=Number(process.env.GITHUB_RUN_ATTEMPT);
  artifactName(sha,buildRunId,buildAttempt);
  writeFileSync(join(dir,'source.tar'),run('git',['archive',sha,'backend-go']));
  run('tar',['-xf',join(dir,'source.tar'),'-C',dir]);
  rmSync(join(dir,'source.tar'));
  const tag=`adilbaga-api:${sha}`;
  run('docker',['build','--pull','--platform','linux/amd64','--label',`org.opencontainers.image.revision=${sha}`,'-t',tag,join(dir,'backend-go')]);
  const image=JSON.parse(run('docker',['image','inspect',tag]))[0];
  const cid=run('docker',['create',tag]).toString().trim();
  try {run('docker',['cp',`${cid}:/usr/local/bin/api`,join(dir,'api')]);}
  finally {run('docker',['rm',cid]);}
  const m={sha,revision:image.Config.Labels['org.opencontainers.image.revision'],os:image.Os,arch:image.Architecture,
    user:image.Config.User,entrypoint:image.Config.Entrypoint,rootfs:image.RootFS.Layers,binary:digest(readFileSync(join(dir,'api')))};
  assert.equal(m.revision,sha); assert.equal(m.os,'linux'); assert.equal(m.arch,'amd64');
  assert.equal(m.user,'10001:10001'); assert.deepEqual(m.entrypoint,['/usr/local/bin/api']);
  run('docker',['save','--output',join(dir,'image.tar'),tag]);
  m.archive=digest(readFileSync(join(dir,'image.tar'))); m.size=readFileSync(join(dir,'image.tar')).length;
  assert.ok(m.size>0 && m.size<=(256<<20),'archive size');
  m.provenance={repository,ciWorkflow:'.github/workflows/ci.yml',ciRunId:Number(process.env.CI_RUN),
    ciAttempt:ci.run_attempt,buildWorkflow:workflowPath,buildRunId,buildAttempt};
  writeFileSync(join(dir,'manifest.json'),JSON.stringify(m));
  appendFileSync(process.env.GITHUB_OUTPUT,`path=${dir}\nname=${artifactName(sha,buildRunId,buildAttempt)}\n`);
  console.log('IMMUTABLE_BUILD_PASS');
}
export function gateCandidate(event,env) {
  const manualBuild=env.GITHUB_EVENT_NAME==='workflow_dispatch' && event.inputs?.mode==='build';
  const normalized=manualBuild ? {...event,inputs:{...event.inputs,mode:'deploy'}} : event;
  return eventCandidate(normalized,env.GITHUB_EVENT_NAME,
    manualBuild?'true':env.AUTO_DEPLOY_ENABLED,env.GITHUB_REF);
}
export async function phase(mode) {
  if(mode==='gate') {
    const event=boundedJSON(process.env.GITHUB_EVENT_PATH,1<<20);
    const c=gateCandidate(event,process.env);
    const result=c.status==='VERIFY_CI'?await check(c):c;
    appendFileSync(process.env.GITHUB_OUTPUT,`eligible=${result.status==='ELIGIBLE'}\nsha=${result.sha??''}\nrun=${result.run??''}\n`);
    console.log(result.status);return;
  }
  if(mode==='build')return build();
  if(mode==='artifact') {
    const metadata=await artifactMetadata();
    writeFileSync(join(process.env.RUNNER_TEMP,'artifact-metadata.json'),JSON.stringify(metadata),{mode:0o600});
    appendFileSync(process.env.GITHUB_OUTPUT,`artifact_id=${metadata.artifact.id}\nbuild_run=${metadata.run.id}\n`);
    return;
  }
  if(mode==='verify-download') {
    const dir=join(process.env.RUNNER_TEMP,'release-artifact');
    const metadata=boundedJSON(join(process.env.RUNNER_TEMP,'artifact-metadata.json'));
    const m=verifyDownloaded(dir,metadata);
    writeFileSync(join(dir,'manifest.json'),JSON.stringify(m),{mode:0o600});
    writeFileSync(join(process.env.RUNNER_TEMP,'adilbaga-build-path'),dir,{mode:0o600});
    console.log('EXACT_ARCHIVED_BYTES_VERIFIED_NOT_OWNER_APPROVAL');return;
  }
  throw Error('invalid build phase');
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  phase(process.argv[2]).catch(()=>{console.error('BLOCKED_BUILD_OR_ARTIFACT');process.exitCode=1;});
