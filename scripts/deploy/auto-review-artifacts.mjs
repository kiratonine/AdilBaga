import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {check} from '../ci/check-source.mjs';
const root=resolve(import.meta.dirname,'../..');
function run(command,args,cwd=root){
  const r=spawnSync(command,args,{cwd,maxBuffer:32<<20,timeout:120000});
  assert.equal(r.status,0,'artifact_operation_failed');return r.stdout;
}
const files=run('git',['ls-files','-z','--modified','--others','--exclude-standard']).toString().split('\0').filter(Boolean);
assert.ok(files.length>0);
for(const path of files){check(path,readFileSync(join(root,path)));assert.ok(path.startsWith('scripts/deploy/')||path==='scripts/create-clean-archive.mjs'||path==='.github/workflows/deploy-production.yml'||path.startsWith('docs/production/AUTO_DEPLOY')||path==='docs/production/reports/AUTO_DEPLOY_CI_CD_REPORT.md','unexpected patch scope');}
const output=join(root,'artifacts');mkdirSync(output,{recursive:true});
const chunks=[run('git',['diff','--binary','HEAD'])];
const added=run('git',['ls-files','-z','--others','--exclude-standard']).toString().split('\0').filter(Boolean);
for(const path of added){
  const r=spawnSync('git',['diff','--no-index','--binary','--','/dev/null',path],{cwd:root,maxBuffer:8<<20});
  assert.equal(r.status,1);chunks.push(r.stdout);
}
const patch=join(output,'production-auto-deploy-source.patch');writeFileSync(patch,Buffer.concat(chunks));
const tmp=mkdtempSync(join(tmpdir(),'adilbaga-patch-proof-'));
try{
  writeFileSync(join(tmp,'baseline.tar'),run('git',['archive','HEAD']));
  run('tar',['-xf',join(tmp,'baseline.tar'),'-C',tmp]);
  run('git',['apply','--check',patch],tmp);
  run('git',['apply',patch],tmp);
  for(const path of files)assert.ok(readFileSync(join(tmp,path)).equals(readFileSync(join(root,path))),'patch byte mismatch');
}finally{rmSync(tmp,{recursive:true,force:true});}
const archive=join(output,'production-auto-deploy-review.tar.gz');
const names=run('tar',['-tzf',archive]).toString().trim().split('\n');
assert.equal(new Set(names).size,names.length);
const types=run('tar',['-tvzf',archive]).toString().trim().split('\n');
assert.equal(types.length,names.length);assert.ok(types.every(t=>t.startsWith('-')));
for(const path of names){
  check(path,Buffer.alloc(0));
  assert.ok(!/(?:^|\/)(?:TODO|__pycache__|tmp|temp)(?:\/|$)/.test(path));
  assert.ok(!/\.(?:tar|tar\.gz|pyc|log|db|sqlite)$/.test(path));
  const bytes=run('tar',['-xOzf',archive,'--',path]);check(path,bytes);
  assert.ok(bytes.equals(readFileSync(join(root,path))),'archive source byte mismatch');
}
for(const path of files)assert.ok(names.includes(path),'review source omitted');
console.log(`Review PASS: patch applies to exact baseline and matches ${files.length} changed/new files; archive ${names.length} safe regular members; source/report byte-match and bounded secret scan`);
