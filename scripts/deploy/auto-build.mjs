import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {check,shaPattern} from './auto-gate.mjs';
export function run(command,args,options={}) {
  const r=spawnSync(command,args,{maxBuffer:32<<20,timeout:1200000,...options});
  assert.equal(r.status,0,'bounded_operation_failed'); return r.stdout;
}
export async function build() {
  const sha=process.env.RELEASE_SHA; assert.match(sha,shaPattern);
  const gate=await check({sha,run:Number(process.env.CI_RUN)});
  if(gate.status!=='ELIGIBLE') {console.log(gate.status); return;}
  assert.equal(run('git',['rev-parse','HEAD']).toString().trim(),sha);
  assert.equal(run('git',['status','--porcelain']).length,0,'dirty_checkout');
  const dir=mkdtempSync(join(process.env.RUNNER_TEMP,'adilbaga-build-'));
  writeFileSync(join(dir,'source.tar'),run('git',['archive',sha,'backend-go']));
  run('tar',['-xf',join(dir,'source.tar'),'-C',dir]);
  rmSync(join(dir,'source.tar'));
  const tag=`adilbaga-api:${sha}`;
  run('docker',['build','--pull','--platform','linux/amd64','--label',`org.opencontainers.image.revision=${sha}`,'-t',tag,join(dir,'backend-go')]);
  const image=JSON.parse(run('docker',['image','inspect',tag]))[0];
  const cid=run('docker',['create',tag]).toString().trim();
  try {run('docker',['cp',`${cid}:/usr/local/bin/api`,join(dir,'api')]);}
  finally {run('docker',['rm',cid]);}
  const {createHash}=await import('node:crypto');
  const digest=b=>createHash('sha256').update(b).digest('hex');
  const m={sha,revision:image.Config.Labels['org.opencontainers.image.revision'],os:image.Os,arch:image.Architecture,
    user:image.Config.User,entrypoint:image.Config.Entrypoint,rootfs:image.RootFS.Layers,binary:digest(readFileSync(join(dir,'api')))};
  assert.equal(m.revision,sha); assert.equal(m.os,'linux'); assert.equal(m.arch,'amd64');
  assert.equal(m.user,'10001:10001'); assert.deepEqual(m.entrypoint,['/usr/local/bin/api']);
  run('docker',['save','--output',join(dir,'image.tar'),tag]);
  m.archive=digest(readFileSync(join(dir,'image.tar'))); m.size=readFileSync(join(dir,'image.tar')).length;
  writeFileSync(join(dir,'manifest.json'),JSON.stringify(m));
  writeFileSync(join(process.env.RUNNER_TEMP,'adilbaga-build-path'),dir,{mode:0o600});
  console.log('IMMUTABLE_BUILD_PASS');
}
if(process.argv[1]?.endsWith('/auto-build.mjs')) build().catch(()=>{console.error('BLOCKED_BUILD');process.exitCode=1;});
