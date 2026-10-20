import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {check,shaPattern} from './auto-gate.mjs';
import {verifyDownloaded} from './auto-build.mjs';

export function manualRelease(env) {
  assert.equal(env.AUTO_DEPLOY_ENABLED,'true','deployment disabled');
  assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch','explicit release required');
  assert.equal(env.GITHUB_REF,'refs/heads/main');
  assert.equal(env.DEPLOY_MODE,'deploy');
}

export function runtimeChanged(paths) {
  return paths.some(p=>['backend-go/Dockerfile','backend-go/.dockerignore','backend-go/go.mod','backend-go/go.sum'].includes(p)
    || p.startsWith('backend-go/cmd/') || p.startsWith('backend-go/internal/'));
}

const protectedPaths=['backend/prisma','contracts','deploy/compose.production.yml'];
const toolingActive='438ecdfa3d386a186dcd8b73c3c10aef5e79dc82';
const toolingBlobs=[
  ['contracts/package.json','ee97d962531376e81a0b9175d8eef2aaa36a7c9c','48a7866b9084cbc25b2dafc1089713eb555e0a38'],
  ['contracts/pnpm-lock.yaml','5ec3371eba46c18660421d89949aa0ebf890d534','4a631ef27450ce85b818e4fe02705b9bcd224c13'],
];
function compatibilityGit(args) {
  const r=spawnSync('git',['--no-replace-objects',...args],{timeout:10000,maxBuffer:1<<20,
    env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8',
      GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_LAZY_FETCH:'1'},
    stdio:['ignore','pipe','pipe']});
  assert.equal(r.status,0,'compatibility Git failed');
  assert.ok(Buffer.isBuffer(r.stdout),'compatibility Git output missing');
  return r.stdout.toString('utf8');
}
// Call only with the broker-read active SHA and the CI/artifact-verified main SHA.
// No working-tree proof, caller-controlled exception or fixed future main SHA.
export function verifyCompatibility(active,candidate) {
  for(const ref of [active,candidate]) {
    assert.match(ref,shaPattern);
    assert.equal(compatibilityGit(['rev-parse','--verify',`${ref}^{commit}`]),ref+'\n','unverified commit');
  }
  const diff=compatibilityGit(['diff','--name-only','--no-renames','--no-ext-diff','--no-textconv','-z',
    active,candidate,'--',...protectedPaths]);
  if(diff==='')return;
  assert.equal(active,toolingActive,'incompatible active release');
  assert.equal(diff.split('\0').sort().join('\0'),['',...toolingBlobs.map(([path])=>path)].sort().join('\0'),
    'incompatible DB/compose/contract delta');
  for(const [path,oldBlob,newBlob] of toolingBlobs) {
    for(const [ref,blob] of [[active,oldBlob],[candidate,newBlob]]) {
      assert.equal(compatibilityGit(['ls-tree','-z',ref,'--',path]),`100644 blob ${blob}\t${path}\0`,
        'unreviewed tooling object');
    }
  }
}

export function sshOptions(env,key,hosts) {
  assert.match(env.DEPLOY_HOST,/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/);
  assert.match(env.DEPLOY_USER,/^[a-z_][a-z0-9_-]{0,31}$/); assert.notEqual(env.DEPLOY_USER,'root');
  assert.match(env.DEPLOY_PORT,/^[0-9]{1,5}$/); assert.ok(+env.DEPLOY_PORT>0 && +env.DEPLOY_PORT<=65535);
  return ['-T','-p',env.DEPLOY_PORT,'-i',key,'-o','BatchMode=yes','-o','IdentitiesOnly=yes',
    '-o','StrictHostKeyChecking=yes','-o',`UserKnownHostsFile=${hosts}`,'-o','ForwardAgent=no',
    '-o','ConnectTimeout=10','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=3',
    `${env.DEPLOY_USER}@${env.DEPLOY_HOST}`,'sudo -n /usr/local/sbin/adilbaga-deploy'];
}
async function main() {
  manualRelease(process.env);
  const sha=process.env.RELEASE_SHA; assert.match(sha,shaPattern);
  const result=await check({sha,run:Number(process.env.CI_RUN)});
  if(result.status!=='ELIGIBLE'){console.log(result.status);return;}
  const build=readFileSync(join(process.env.RUNNER_TEMP,'adilbaga-build-path'),'utf8');
  assert.equal(build,join(process.env.RUNNER_TEMP,'release-artifact'),'fixed downloaded artifact path');
  const metadata=JSON.parse(readFileSync(join(process.env.RUNNER_TEMP,'artifact-metadata.json'),'utf8'));
  const manifest=verifyDownloaded(build,metadata);assert.equal(manifest.sha,sha);
  assert.equal(manifest.provenance.ciRunId,Number(process.env.CI_RUN));
  const dir=mkdtempSync(join(process.env.RUNNER_TEMP,'adilbaga-ssh-'));
  try {
    assert.ok(process.env.DEPLOY_SSH_KEY && process.env.DEPLOY_KNOWN_HOSTS,'missing SSH configuration');
    const key=join(dir,'identity'),hosts=join(dir,'hosts');
    writeFileSync(key,process.env.DEPLOY_SSH_KEY,{mode:0o600});
    writeFileSync(hosts,process.env.DEPLOY_KNOWN_HOSTS,{mode:0o600});
    const args=sshOptions(process.env,key,hosts);
    const childEnv={PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8'};
    const call=(input,timeout=30000)=>{
      const r=spawnSync('ssh',args,{input,env:childEnv,timeout,maxBuffer:1<<20});
      assert.equal(r.status,0,'SSH_OR_BROKER_FAILED'); return JSON.parse(r.stdout);
    };
    const pre=call(JSON.stringify({operation:'status'})+'\n');
    if(pre.active===sha){console.log('NO_OP');return;}
    assert.match(pre.active,shaPattern); assert.equal(pre.available,true);
    verifyCompatibility(pre.active,sha);
    const runtime=spawnSync('git',['diff','--name-only',pre.active,sha,'--','backend-go'],{timeout:10000,maxBuffer:1<<20});
    assert.equal(runtime.status,0);
    if(!runtimeChanged(runtime.stdout.toString().trim().split('\n'))){console.log('NO_RUNTIME_CHANGE');return;}
    if(process.env.DEPLOY_PHASE==='plan'){
      assert.ok(process.env.GITHUB_OUTPUT);
      appendFileSync(process.env.GITHUB_OUTPUT,'changed=true\n');console.log('PLAN_VERIFIED');return;
    }
    const fresh=await check({sha,run:Number(process.env.CI_RUN)});
    if(fresh.status!=='ELIGIBLE'){console.log(fresh.status);return;}
    const receipt=call(Buffer.concat([Buffer.from(JSON.stringify({operation:'submit',manifest})+'\n'),readFileSync(join(build,'image.tar'))]),180000);
    assert.ok(['ACCEPTED','NO_OP','SKIPPED_STALE'].includes(receipt.status));
    if(receipt.status!=='ACCEPTED'){console.log(receipt.status);return;}
    const end=Date.now()+1200000;
    while(Date.now()<end){
      await new Promise(r=>setTimeout(r,10000));
      const state=call(JSON.stringify({operation:'result',sha})+'\n');
      if(state.status==='RUNNING')continue;
      console.log(state.status);
      assert.equal(state.status,'DEPLOYED','rollout did not pass');return;
    }
    // Worker is detached and owns its bounded compensation; SSH loss does not kill it.
    throw Error('bounded receipt wait expired');
  } finally {rmSync(dir,{recursive:true,force:true});}
}
if(process.argv[1]?.endsWith('/auto-transport.mjs')) main().catch(()=>{console.error('BLOCKED_TRANSPORT_OR_ROLLOUT');process.exitCode=1;});
