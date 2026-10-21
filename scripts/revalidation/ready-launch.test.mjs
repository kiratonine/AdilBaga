import {test} from 'node:test';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {dropProductionSupervisorPrivileges} from './projection-provider.mjs';

test('ordinary unprivileged caller cannot perform admin bootstrap or supply account override',()=>{
  assert.notEqual(process.geteuid(),0);
  assert.throws(()=>dropProductionSupervisorPrivileges(),/launch_authority/);
  assert.throws(()=>dropProductionSupervisorPrivileges({uid:1}),/launch_authority/);
});
for(const scenario of ['valid_system_uid','bad_approval','bad_custody','bad_account','missing_account','dumpable','capabilities']){
  test(`isolated admin-bootstrap OS model: ${scenario}`,()=>{
    const script=String.raw`
      import fs from 'node:fs';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
      import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
      const {dropProductionSupervisorPrivileges}=await import('./scripts/revalidation/projection-provider.mjs');
      const scenario=process.argv[1],bytes=Buffer.from([127,69,76,70,1]),digest=createHash('sha256').update(bytes).digest('hex');
      const approval={version:1,approved:scenario!=='bad_approval',sourceSha:'a'.repeat(40),binarySha256:digest,clockSha256:digest,buildId:'synthetic',platform:'linux/amd64'};
      const originalRead=fs.readFileSync,files=new Map();let serial=10000,uid=0,gid=0,calls=[];
      fs.lstatSync=()=>({uid:0,mode:0o40755,isDirectory:()=>true,isSymbolicLink:()=>false});
      fs.openSync=p=>{files.set(++serial,p);return serial};fs.closeSync=fd=>files.delete(fd);
      fs.fstatSync=fd=>({uid:scenario==='bad_custody'?1000:0,mode:0o100555,size:1000,nlink:1,isFile:()=>true});
      fs.readFileSync=(p,...args)=>files.has(p)?(files.get(p).endsWith('authorization.json')?Buffer.from(JSON.stringify(approval)+'\n'):bytes):p==='/proc/self/status'?'CapEff:\t0000000000000000\nCapPrm:\t'+(scenario==='capabilities'?'0000000000000001':'0000000000000000')+'\nCapInh:\t0000000000000000\n':originalRead(p,...args);
      fs.statSync=()=>({uid:scenario==='dumpable'?997:0});
      cp.execFileSync=(file,args,options)=>{assert.equal(file,'/usr/local/libexec/aktau-c2/relayprobe');assert.deepEqual(args,['operator']);assert.deepEqual(options.env,{});calls.push('lookup');if(scenario==='missing_account')throw Error('synthetic_missing');return Buffer.from(JSON.stringify({uid:scenario==='bad_account'?0:997,gid:123})+'\n')};
      process.getuid=process.geteuid=()=>uid;process.getgid=process.getegid=()=>gid;
      process.setgroups=groups=>{assert.deepEqual(groups,[]);calls.push('groups')};
      process.setgid=v=>{gid=v;calls.push('gid')};process.setuid=v=>{uid=v;calls.push('uid')};
      syncBuiltinESMExports();
      if(scenario==='valid_system_uid'){
        assert.deepEqual(dropProductionSupervisorPrivileges(),{state:'NON_ROOT_PROTECTED'});assert.equal(uid,997);assert.equal(gid,123);
        assert.deepEqual(calls,['lookup','groups','gid','uid']);
        assert.throws(()=>dropProductionSupervisorPrivileges(),/launch_authority/);
      }else{
        assert.throws(()=>dropProductionSupervisorPrivileges());
        if(['bad_approval','bad_custody','bad_account','missing_account'].includes(scenario))assert.equal(uid,0);
        else{assert.equal(uid,997);assert.deepEqual(calls,['lookup','groups','gid','uid'])}
      }
    `;
    execFileSync(process.execPath,['--input-type=module','-e',script,scenario],{cwd:new URL('../../',import.meta.url),env:{PATH:'/usr/bin:/bin'},timeout:5000,maxBuffer:4096});
  });
}
