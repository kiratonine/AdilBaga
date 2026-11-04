#!/usr/bin/python3
"""One PR86 baseline/root transition. No approval creation or package installer.

Production accepts only fixed root-owned inputs and the independently issued
baseline record. Filesystem/authority injection exists in Python tests only.
"""
import base64
import contextlib
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import sys
import time
import tarfile
import io
import types
import urllib.request

ROOT='/usr/local/libexec/aktau-sync-promotion'
BASE='/var/lib/aktau-sync-promotion'
INPUT=BASE+'/pr86-bootstrap-input'
SELF=ROOT+'/pr86-root-bootstrap.py'
APPROVAL='/etc/aktau-sync-promotion/pr86-baseline-approval.json'
POLICY='/etc/aktau-sync-promotion/policy.json'
OLD_EXECUTOR='d69c667212b2a6c8a25081ccdc90f798024e850784262976e06e45ce13f45118'
OLD_POLICY='2bf672f1626252f107447552493ad982999d3d7f444f000394a7006d952ddb8b'
OLD_SOURCE='b2012c5b8c05de8a7667bf942daf9d7232f3a7b6'
CONTRACT='pr86-root-bootstrap-v1'
LOCKS=[(BASE+'/state/ingress.lock',0o600),(BASE+'/runtime.lock',0o644),('/var/lib/aktau-c2-custodian/controller.lock',0o600)]
TARGETS={
 'publisher-promotion.py':(ROOT+'/publisher-promotion.py',0o755),
 'promotion-runtime-gate.py':(ROOT+'/promotion-runtime-gate.py',0o755),
 'sync-promotion-entry.sh':('/usr/local/sbin/aktau-sync-promote',0o755),
 'promotion-daily.conf':('/etc/systemd/system/aktau-sync.service.d/40-promotion-lock.conf',0o644),
 'promotion-weekly.conf':('/etc/systemd/system/aktau-sync-full.service.d/40-promotion-lock.conf',0o644),
 'promotion-custodian.conf':('/etc/systemd/system/aktau-c2-custodian.service.d/40-promotion-lock.conf',0o644),
 'pipeline-pnpm':(ROOT+'/bin/pnpm',0o755),
 'aktau-sync-dependencies.service':('/etc/systemd/system/aktau-sync-dependencies.service',0o644),
 'policy.json':(POLICY,0o644)}
SOURCE_PATHS={name:'ops/c2/'+name for name in TARGETS if name!='policy.json'}
INPUT_FILES=set(TARGETS)|{'pr86-root-bootstrap.py','old-input-inventory.json','old-runtime.tar','pnpm.tgz','provenance.json'}
NEW_DIRS=[BASE+'/capsules',BASE+'/mounts',ROOT+'/bin','/run/aktau-sync-promotion']
PHASES={'intent','directories','backed_up','raw_retaining','raw_retained','generation','staged','root_files','selection','enrolled','mount_prepared','mounted','reloaded','verified','committed','rollback','rolled_back'}
HEX=re.compile('[a-f0-9]{64}');ID=re.compile('[a-f0-9]{32}')
class Blocked(Exception):pass

def need(value,code):
 if not value:raise Blocked(code)
def digest(raw):return hashlib.sha256(raw).hexdigest()
def canonical(value):return (json.dumps(value,ensure_ascii=False,allow_nan=False,separators=(',',':'))+'\n').encode()
def parse(raw):
 def pairs(items):
  out={}
  for k,v in items:need(k not in out,'duplicate_key');out[k]=v
  return out
 try:return json.loads(raw,object_pairs_hook=pairs,parse_constant=lambda _:need(False,'invalid_json'))
 except (ValueError,UnicodeError,TypeError):raise Blocked('invalid_json') from None

def millis(text):
 need(type(text)is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z',text),'approval_time')
 try:dt=datetime.datetime.fromisoformat(text.replace('Z','+00:00'));return int(dt.timestamp())*1000+dt.microsecond//1000
 except ValueError:raise Blocked('approval_time') from None

def authority(p,raw,policy,bundle_hash,now=None):
 a=parse(raw);c=policy['pipelineContract']
 fixed={'version':1,'purpose':'pr86-baseline-enrollment','sourceSha':OLD_SOURCE,'pipelineTreeSha1':p.PIPELINE_OLD_TREE,
  'packageBlobSha1':p.PIPELINE_OLD_PACKAGE,'lockBlobSha1':p.PIPELINE_OLD_LOCK,
  'legacyInputInventorySha256':c['baselineInputInventorySha256'],'oldRuntimeInventorySha256':c['baselineRuntimeInventorySha256'],
  'nodeSha256':p.PIPELINE_NODE,'pnpmTarSha256':p.PIPELINE_PNPM,'oldExecutorSha256':OLD_EXECUTOR,
  'oldPolicySha256':OLD_POLICY,'reviewedRootBundleSha256':bundle_hash,'newPolicySha256':digest(canonical(policy))}
 need(type(a)is dict and set(a)==set(fixed)|{'approvalId','notBefore','expiresAt'} and type(a['version'])is int
  and all(a[k]==v for k,v in fixed.items()) and type(a['approvalId'])is str and ID.fullmatch(a['approvalId']),'baseline_authority')
 begin,end=millis(a['notBefore']),millis(a['expiresAt']);need(0<end-begin<=3600000,'approval_time')
 if now is not None:need(type(now)is int and begin<=now<end,'approval_expired_or_future')
 return a,begin,end

class Files:
 """Fixed-purpose root custody; sandbox is constructor-only test plumbing."""
 def __init__(self,sandbox=None):
  self.sandbox=Path(sandbox) if sandbox else None;self.uid,self.gid=(os.getuid(),os.getgid()) if sandbox else (0,0)
  if sandbox:need(stat.S_IMODE(os.lstat(sandbox).st_mode)==0o700,'sandbox_custody')
  else:need(os.getuid()==os.geteuid()==0,'root_required')
 def path(self,path):
  need(type(path)is str and path.startswith('/') and str(Path(path))==path and '..' not in Path(path).parts,'fixed_path')
  return self.sandbox/path[1:] if self.sandbox else Path(path)
 @contextlib.contextmanager
 def directory(self,path):
  with contextlib.ExitStack() as stack:
   fd=os.open(self.sandbox or '/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC);stack.callback(os.close,fd);pins=[]
   initial=os.fstat(fd);need((initial.st_uid,initial.st_gid)==(self.uid,self.gid) and not initial.st_mode&0o022 and not os.listxattr(fd),'root_parent_custody')
   for part in Path(path).parts[1:]:
    parent=fd;fd=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=parent);stack.callback(os.close,fd)
    st=os.fstat(fd);need((st.st_uid,st.st_gid)==(self.uid,self.gid) and not st.st_mode&0o022 and not os.listxattr(fd),'root_parent_custody');pins.append((parent,part,fd,identity(st)[:5]))
   yield fd
   for parent,name,held,expected in pins:need(identity(os.fstat(held))[:5]==identity(os.stat(name,dir_fd=parent,follow_symlinks=False))[:5]==expected,'parent_replaced')
 def read(self,path,mode=None,cap=512<<10):
  with self.directory(str(Path(path).parent)) as parent:
   fd=os.open(Path(path).name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=parent)
   try:
    st=os.fstat(fd);need(stat.S_ISREG(st.st_mode) and (st.st_uid,st.st_gid,st.st_nlink)==(self.uid,self.gid,1)
     and not st.st_mode&0o022 and not os.listxattr(fd) and 0<=st.st_size<=cap and (mode is None or stat.S_IMODE(st.st_mode)==mode),'root_file_custody')
    out=bytearray()
    while chunk:=os.read(fd,min(65536,cap+1-len(out))):out.extend(chunk);need(len(out)<=cap,'file_capacity')
    need(identity(st)==identity(os.fstat(fd))==identity(os.stat(Path(path).name,dir_fd=parent,follow_symlinks=False)) and len(out)==st.st_size,'file_changed')
    return bytes(out),identity(st)
   finally:os.close(fd)
 def exists(self,path):return os.path.lexists(self.path(path))
 def create(self,path,raw,mode=0o600):
  need(type(raw)is bytes and 0<=len(raw)<=96<<20,'write_capacity')
  with self.directory(str(Path(path).parent)) as d:
   fd=os.open(Path(path).name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,0o600,dir_fd=d)
   try:
    at=0
    while at<len(raw):n=os.write(fd,raw[at:]);need(n>0,'short_write');at+=n
    os.fchmod(fd,mode);os.fsync(fd);st=identity(os.fstat(fd))
   finally:os.close(fd)
   os.fsync(d)
  check,actual=self.read(path,mode,96<<20);need(check==raw and actual==st,'create_readback');return st
 def mkdir(self,path,mode=0o700):
  with self.directory(str(Path(path).parent)) as d:
   os.mkdir(Path(path).name,mode,dir_fd=d);fd=os.open(Path(path).name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=d)
   try:os.fchmod(fd,mode);os.fsync(fd);st=identity(os.fstat(fd))
   finally:os.close(fd)
   os.fsync(d)
  return st
 def publish(self,source,target,source_stamp,target_stamp,mode,new_hash):
  need(Path(source).parent==Path(target).parent,'same_parent')
  with self.directory(str(Path(target).parent)) as d,contextlib.ExitStack() as stack:
   sf=os.open(Path(source).name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=d);stack.callback(os.close,sf)
   raw,st=self.read(source,mode,96<<20);need(st==source_stamp and digest(raw)==new_hash and identity(os.fstat(sf))==st,'staged_cas')
   tf=None
   if target_stamp is None:need(not self.exists(target),'no_clobber')
   else:
    tf=os.open(Path(target).name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=d);stack.callback(os.close,tf)
    need(identity(os.fstat(tf))==target_stamp,'target_cas')
   need(identity(os.fstat(sf))==identity(os.stat(Path(source).name,dir_fd=d,follow_symlinks=False))==st,'staged_replaced')
   if tf is not None:need(identity(os.fstat(tf))==identity(os.stat(Path(target).name,dir_fd=d,follow_symlinks=False)),'target_replaced')
   if target_stamp is None:
    os.link(Path(source).name,Path(target).name,src_dir_fd=d,dst_dir_fd=d,follow_symlinks=False);os.unlink(Path(source).name,dir_fd=d)
   else:os.rename(Path(source).name,Path(target).name,src_dir_fd=d,dst_dir_fd=d)
   os.fsync(d)
   check,out=self.read(target,mode,96<<20);need(check==raw and core(out)==core(st),'publish_readback');return out
 def remove(self,path,expected,expected_hash):
  with self.directory(str(Path(path).parent)) as d:
   raw,st=self.read(path,None,96<<20);need(core(st)==core(expected) and digest(raw)==expected_hash,'remove_cas')
   os.unlink(Path(path).name,dir_fd=d);os.fsync(d);need(not self.exists(path),'remove_readback')

def identity(s):return [s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_gid,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def core(s):return s[:8]

def old_runtime_package(raw,name,version):
 # Public npm metadata uses ordinary UTF8 JSON formatting. Canonical wire
 # records still use publisher.parse; their validation is not relaxed here.
 need(type(raw)is bytes and 0<len(raw)<=65536,'old_runtime_package')
 try:document=parse(raw.decode('utf-8'))
 except UnicodeError:raise Blocked('old_runtime_package') from None
 need(type(document)is dict and document.get('name')==name and document.get('version')==version,'old_runtime_package')
 return document

class Bundle:
 def __init__(self,p,manifest,files,approval_raw):
  need(type(manifest)is dict and set(manifest)=={'version','contract','sourceSha','ciRunId','files'}
   and type(manifest['version'])is int and manifest['version']==1 and manifest['contract']==CONTRACT
   and type(manifest['sourceSha'])is str and re.fullmatch('[a-f0-9]{40}',manifest['sourceSha'])
   and type(manifest['ciRunId'])is int and manifest['ciRunId']>0 and set(files)==INPUT_FILES and set(manifest['files'])==INPUT_FILES,'bundle_schema')
  need(all(type(manifest['files'][n])is str and HEX.fullmatch(manifest['files'][n]) and digest(files[n])==manifest['files'][n] for n in files),'bundle_digest')
  self.p,self.manifest,self.files=p,manifest,files;self.hash=digest(canonical(manifest));self.policy=p.parse(files['policy.json']);p.validate_policy(self.policy);need(self.policy['version']==2 and files['policy.json']==canonical(self.policy),'policy_v2')
  self.approval_raw=approval_raw;self.approval,_,_=authority(p,approval_raw,self.policy,self.hash)
  need(digest(files['old-input-inventory.json'])==self.approval['legacyInputInventorySha256'],'input_inventory_hash')
  self.raw_inventory=p.parse(files['old-input-inventory.json']);need(self.raw_inventory.get('kind')=='legacy-input-observed-not-authorized'
   and self.raw_inventory.get('sourceSha')==OLD_SOURCE and self.raw_inventory.get('pipelineTreeSha1')==p.PIPELINE_OLD_TREE,'input_inventory_schema')
  inv,blobs=p.pipeline_capsule(files['old-runtime.tar']);need(digest(p.canonical(inv))==self.approval['oldRuntimeInventorySha256'],'runtime_inventory_hash')
  self.inventory,self.blobs=inv,blobs
  need(digest(files['pnpm.tgz'])==p.PIPELINE_PNPM,'pnpm_distribution_hash')
  need(self.policy['producerFiles']['ops/c2/publisher-promotion.py']==digest(files['publisher-promotion.py']),'executor_policy_pin')
  for name,(target,_) in TARGETS.items():
   if name!='policy.json':need(self.policy['runtimeFiles'][target]==digest(files[name]),'runtime_policy_pin')
  raw={r[0]:r for r in self.raw_inventory['entries']};norm={r['path']:r for r in inv['entries']};need(len(raw)==len(self.raw_inventory['entries']) and len(raw)<=8192,'input_inventory_schema')
  for name,version,path in [('zod','3.25.76','node_modules/zod/package.json'),('undici','7.30.0','node_modules/.pnpm/undici@7.30.0/node_modules/undici/package.json'),('tsx','4.23.15','node_modules/tsx/package.json'),('esbuild','0.28.2','node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/package.json')]:
   old_runtime_package(p.pipeline_blob(path,inv['entries'],blobs),name,version)
  self.verify_pnpm(inv,blobs)

  for path,row in norm.items():
   if path=='node_modules/.aktau-pnpm' or path.startswith('node_modules/.aktau-pnpm/'):continue
   need(path in raw,'runtime_unproven_path');before=raw[path];st=before[1]
   if row['type']=='file':need(stat.S_ISREG(st[2]) and row['sha256']==before[2] and row['size']==st[6] and row['mode']==(0o555 if st[2]&0o111 else 0o444),'runtime_changed_bytes')
   elif row['type']=='symlink':need(stat.S_ISLNK(st[2]) and row['target']==before[2],'runtime_changed_link')
   else:need(stat.S_ISDIR(st[2]),'runtime_changed_type')
  for path in set(raw)-set(norm):need(path in ['node_modules/.vite','node_modules/.vite-temp'] or path.startswith(('node_modules/.vite/','node_modules/.vite-temp/')),'runtime_unapproved_omission')
  proof=p.parse(files['provenance.json']);need(type(proof)is dict and type(proof.get('version'))is int and proof['version']==1 and proof.get('kind')=='legacy-installed-attested'
   and proof.get('inputInventorySha256')==self.approval['legacyInputInventorySha256'] and proof.get('runtimeInventorySha256')==self.approval['oldRuntimeInventorySha256']
   and type(proof.get('byteDiff'))is list and type(proof.get('packageOrigins'))is list,'legacy_provenance')

 def verify_pnpm(self,inv,blobs):
  expected={};directories={''}
  with tarfile.open(fileobj=io.BytesIO(self.files['pnpm.tgz']),mode='r:gz') as tar:
   for member in tar:
    need(member.name.startswith('package/') and (member.isfile() or member.isdir()),'pnpm_member')
    name=member.name[8:].rstrip('/')
    if not name:continue
    self.p.pipeline_path(name)
    if member.isdir():directories.add(name)
    else:
     need(name not in expected and member.size<=16<<20,'pnpm_member');raw=tar.extractfile(member).read(member.size+1);need(len(raw)==member.size,'pnpm_member')
     expected[name]=(digest(raw),len(raw),0o555 if member.mode&0o111 else 0o444)
    parent=str(Path(name).parent)
    while parent!='.':directories.add(parent);parent=str(Path(parent).parent)
  prefix='node_modules/.aktau-pnpm';actual={r['path'][len(prefix):].lstrip('/'):r for r in inv['entries'] if r['path']==prefix or r['path'].startswith(prefix+'/')}
  need(set(actual)==set(expected)|directories,'pnpm_inventory')
  for name,row in actual.items():
   if name in expected:need(row['type']=='file' and (row['sha256'],row['size'],row['mode'])==expected[name],'pnpm_runtime_bytes')
   else:need(row['type']=='dir' and row['mode']==0o555,'pnpm_directory')

 def verify_source(self):
  # GitHub immutable object bytes were verified before importing the runtime.
  # Recheck mutable main at the final pre-write boundary, without refetching
  # identical content objects and exhausting the public GitHub rate budget.
  if getattr(self,'_source_proof',None)!=(self.manifest['sourceSha'],self.manifest['ciRunId']):
   verify_public_source(self.manifest,self.files,self.p.github)
   self._source_proof=(self.manifest['sourceSha'],self.manifest['ciRunId'])
  need(self.p.github('git/ref/heads/main')['object']['sha']==self.manifest['sourceSha'],'main_drift')

class Transaction:
 """Fixed root files plus OLD selection. No source/C2 publication is performed."""
 def __init__(self,p,fs,bundle,platform,fault=lambda _:None):
  self.p,self.fs,self.b,self.platform,self.fault=p,fs,bundle,platform,fault;self.j=None;self.jstamp=None
  self.id=bundle.approval['approvalId'];self.directory=BASE+'/pr86-bootstrap-'+self.id
 def save(self,phase):
  need(phase in PHASES,'phase');self.j['phase']=phase;self.validate(self.j);raw=canonical(self.j);need(len(raw)<=512<<10,'journal_capacity')
  temp=self.p.INTERLOCK+'.pr86.pending';st=self.fs.create(temp,raw)
  self.jstamp=self.fs.publish(temp,self.p.INTERLOCK,st,self.jstamp,0o600,digest(raw));self.fault(phase)
 def verify(self,now=None):
  now=time.time_ns()//1000000 if now is None else now;authority(self.p,self.b.approval_raw,self.b.policy,self.b.hash,now)
  self.b.verify_source();need(not self.fs.exists(self.p.INTERLOCK) and not self.fs.exists(self.directory),'unknown_bootstrap_state')
  consumed=BASE+'/state/pr86-baseline-consumed-'+self.id+'.json';need(not self.fs.exists(consumed),'approval_used')
  need(not self.fs.exists(self.p.PIPELINE_SELECTION) and not self.fs.exists(self.p.PIPELINE_MOUNT_RECORD),'existing_pipeline_selection')
  need(digest(self.fs.read(ROOT+'/publisher-promotion.py',0o755)[0])==OLD_EXECUTOR and digest(self.fs.read(POLICY,0o644)[0])==OLD_POLICY,'old_root_drift')
  for path in [ROOT+'/bin/pnpm','/etc/systemd/system/aktau-sync-dependencies.service']:need(not self.fs.exists(path),'existing_target')
  # Fixed root namespaces are inventoried before consuming any authority.
  # A different attempt's unregistered stage is never adopted or cleaned up.
  with self.fs.directory(BASE) as directory:
   names=os.listdir(directory);need(len(names)<=8192,'resource_capacity')
   need(not any(re.fullmatch('pr86-bootstrap-[a-f0-9]{32}',name) for name in names),'unknown_bootstrap_state')
  for directory in [BASE+'/capsules',BASE+'/mounts']:
   if self.fs.exists(directory):
    with self.fs.directory(directory) as fd:need(not os.listdir(fd),'unknown_bootstrap_state')
  for directory in {str(Path(path).parent) for path,_ in TARGETS.values()}:
   if not self.fs.exists(directory):continue
   with self.fs.directory(directory) as fd:
    names=os.listdir(fd);need(len(names)<=8192,'resource_capacity')
    need(not any(re.fullmatch(r'[.]pr86-[a-f0-9]{32}-[a-zA-Z0-9_.-]+',name) for name in names),'unknown_bootstrap_state')
  snapshot=self.platform.preflight(self.b);self.platform.raw_input(self.b.raw_inventory,retain=None)
  return snapshot
 def apply(self,now=None):
  p=self.p;now=time.time_ns()//1000000 if now is None else now;snapshot=self.verify(now)
  resources={}
  for name,(target,mode) in TARGETS.items():
   present=self.fs.exists(target);old,st=self.fs.read(target,None) if present else (None,None)
   resources[name]={'target':target,'mode':mode,'oldHash':digest(old) if old else None,'oldMode':stat.S_IMODE(st[2]) if st else None,'oldIdentity':st,
    'backup':self.directory+'/'+name+'.old','backupIdentity':None,'newHash':digest(self.b.files[name]),'stage':str(Path(target).parent/('.pr86-'+self.id+'-'+Path(target).name)),
    'newIdentity':None,'restoreIdentity':None,'restore':str(Path(target).parent/('.pr86-'+self.id+'-'+Path(target).name+'.restore'))}
  consumed=canonical({'version':1,'approvalSha256':digest(self.b.approval_raw),'usedAt':now});self.fs.create(BASE+'/state/pr86-baseline-consumed-'+self.id+'.json',consumed)
  self.j={'version':1,'contract':CONTRACT,'approvalId':self.id,'approvalSha256':digest(self.b.approval_raw),'bundleSha256':self.b.hash,'phase':'intent','snapshot':snapshot,'targets':resources,
   'directories':{},'generation':None,'rawCapture':None,'selection':None,'enrolled':None,'mount':None,'mountStageIdentity':None,'attestation':None,'bootId':Path('/proc/sys/kernel/random/boot_id').read_text().strip()}
  self.save('intent')
  self.j['directories'][self.directory]=self.fs.mkdir(self.directory)
  for path in NEW_DIRS:
   if not self.fs.exists(path):self.j['directories'][path]=self.fs.mkdir(path,0o755 if path.endswith('/bin') or path.startswith('/run/') else 0o700)
   else:
    with self.fs.directory(path) as fd:
     if path.endswith(('/capsules','/mounts')):need(not os.listdir(fd),'occupied_namespace')
  self.save('directories')
  for name,r in resources.items():
   if r['oldIdentity'] is not None:
    raw,st=self.fs.read(r['target'],r['oldMode']);need(st==r['oldIdentity'] and digest(raw)==r['oldHash'],'backup_cas');r['backupIdentity']=self.fs.create(r['backup'],raw,0o400)
  self.save('backed_up');self.save('raw_retaining');self.j['rawCapture']=self.platform.raw_input(self.b.raw_inventory,retain=self.directory);self.check_raw_capture(self.j);self.save('raw_retained')
  gen=self.b.approval['oldRuntimeInventorySha256'];p.PipelineStore(self.platform.store_fs).install(self.b.files['old-runtime.tar'],gen,'pr86-'+self.id,lambda *args:self.fault('generation_write'))
  self.j['generation']=gen;self.save('generation')
  for name,r in resources.items():
   if r['oldHash']!=r['newHash']:r['newIdentity']=self.fs.create(r['stage'],self.b.files[name],r['mode'])
  self.save('staged')
  for name,r in resources.items():
   if r['newIdentity'] is not None:
    r['newIdentity']=self.fs.publish(r['stage'],r['target'],r['newIdentity'],r['oldIdentity'],r['mode'],r['newHash']);self.save('root_files')
  raw_selection=self.platform.selection(self.b,self.j);p.selection(p,raw_selection)
  self.j['selection']=self.fs.create(p.PIPELINE_SELECTION,raw_selection,0o644);self.save('selection')
  receipt=self.platform.enrollment(self.b,self.j);self.j['enrolled']=self.fs.create(BASE+'/state/pr86-baseline-enrolled-'+self.id+'.json',canonical(receipt));p.require_enrollment(p,self.platform.store_fs,self.b.policy);self.save('enrolled')
  self.j['mount']=self.platform.prepare_mount(gen,self);self.save('mount_prepared');self.platform.attach_mount(self.j['mount']);self.save('mounted')
  self.j['attestation']=self.platform.attest(raw_selection);self.platform.reload();self.save('reloaded')
  self.platform.verify(self.b,self.j);self.save('verified');self.save('committed')
  terminal=canonical(self.j);self.fs.create(self.directory+'/receipt.json',terminal);self.fs.remove(p.INTERLOCK,self.jstamp,digest(terminal));return 'PR86_BASELINE_ENROLLED_ROOT_PAIR_VERIFIED'
 def validate(self,j):
  need(type(j)is dict and set(j)=={'version','contract','approvalId','approvalSha256','bundleSha256','phase','snapshot','targets','directories','generation','rawCapture','selection','enrolled','mount','mountStageIdentity','attestation','bootId'}
   and type(j['version'])is int and j['version']==1 and j['contract']==CONTRACT and j['approvalId']==self.id
   and j['approvalSha256']==digest(self.b.approval_raw) and j['bundleSha256']==self.b.hash and j['phase'] in PHASES
   and set(j['targets'])==set(TARGETS) and set(j['directories'])<=set(NEW_DIRS)|{self.directory},'journal_schema')
  for name,r in j['targets'].items():
   target,mode=TARGETS[name]
   need(set(r)=={'target','mode','oldHash','oldMode','oldIdentity','backup','backupIdentity','newHash','stage','newIdentity','restoreIdentity','restore'}
    and r['target']==target and r['mode']==mode and r['newHash']==digest(self.b.files[name])
    and r['backup']==self.directory+'/'+name+'.old' and r['stage']==str(Path(target).parent/('.pr86-'+self.id+'-'+Path(target).name))
    and r['restore']==r['stage']+'.restore','journal_target')
   for key in ['oldIdentity','backupIdentity','newIdentity','restoreIdentity']:
    value=r[key];need(value is None or type(value)is list and len(value)==9 and all(type(x)is int and x>=0 for x in value),'journal_identity')
   need((r['oldIdentity'] is None)==(r['oldHash'] is None)==(r['oldMode'] is None),'journal_old_target')
   if r['oldHash'] is not None:need(type(r['oldHash'])is str and HEX.fullmatch(r['oldHash']) and r['oldMode'] in [0o644,0o755],'journal_old_target')
  need(j['targets']['publisher-promotion.py']['oldHash']==OLD_EXECUTOR and j['targets']['policy.json']['oldHash']==OLD_POLICY,'journal_old_root')
  if j['generation'] is not None:need(j['generation']==self.b.approval['oldRuntimeInventorySha256'],'journal_generation')
  for path,stamp in j['directories'].items():need(type(stamp)is list and len(stamp)==9 and all(type(x)is int and x>=0 for x in stamp),'journal_directory')
  capture=j['rawCapture']
  if capture is not None:
   need(type(capture)is dict and set(capture)=={'directoryIdentity','sealIdentity','sealSha256'} and type(capture['sealSha256'])is str and HEX.fullmatch(capture['sealSha256']),'journal_raw_capture')
   for key,length in [('directoryIdentity',5),('sealIdentity',9)]:need(type(capture[key])is list and len(capture[key])==length and all(type(x)is int and x>=0 for x in capture[key]),'journal_raw_identity')
  stage=j['mountStageIdentity'];need(stage is None or type(stage)is list and len(stage)==6 and all(type(x)is int and x>=0 for x in stage),'journal_mount_stage')
  mount=j['mount']
  if mount is not None:
   need(type(mount)is dict and set(mount)=={'mountId','namespace','rootIdentity','generation','stage'} and mount['stage']==BASE+'/mounts/pr86-baseline' and mount['generation']==self.b.approval['oldRuntimeInventorySha256'] and type(mount['mountId'])is int and mount['mountId']>0 and type(mount['namespace'])is str and re.fullmatch(r'mnt:\[[1-9][0-9]*\]',mount['namespace']) and type(mount['rootIdentity'])is list and len(mount['rootIdentity'])==6 and all(type(x)is int and x>=0 for x in mount['rootIdentity']),'journal_mount')
  return j
 def check_raw_capture(self,j):
  path=self.directory+'/raw';record=j['rawCapture']
  if not self.fs.exists(path):need(record is None,'missing_raw_capture');return
  need(type(record)is dict and set(record)=={'directoryIdentity','sealIdentity','sealSha256'},'unknown_raw_capture')
  with self.fs.directory(path) as fd:
   need(identity(os.fstat(fd))[:5]==record['directoryIdentity'],'raw_capture_directory_changed')
   raw,st=self.fs.read(path+'/seal.json',0o400,2<<20);need(core(st)==core(record['sealIdentity']) and digest(raw)==record['sealSha256'],'raw_capture_seal_changed')
   seal=parse(raw);need(type(seal)is dict and set(seal)=={'version','inputInventorySha256','directoryIdentity','files'} and type(seal['version'])is int and seal['version']==1 and seal['inputInventorySha256']==digest(canonical(self.b.raw_inventory)) and seal['directoryIdentity']==record['directoryIdentity'],'raw_capture_seal')
   expected=[row for row in self.b.raw_inventory['entries'] if stat.S_ISREG(row[1][2])]
   need(type(seal['files'])is list and len(seal['files'])==len(expected) and set(os.listdir(fd))=={'seal.json',*[str(i) for i in range(len(expected))]},'raw_capture_members')
   for number,(row,item) in enumerate(zip(expected,seal['files'])):
    need(type(item)is dict and set(item)=={'path','file','sha256','identity'} and item['path']==row[0] and item['file']==str(number) and item['sha256']==row[2] and type(item['identity'])is list and len(item['identity'])==9 and all(type(x)is int and x>=0 for x in item['identity']),'raw_capture_inventory')
    data,actual=self.fs.read(path+'/'+str(number),0o400,16<<20);need(core(actual)==core(item['identity']) and digest(data)==row[2] and len(data)==row[1][6],'raw_capture_file_changed')
 def check_control_records(self,j,allow_missing=False):
  enrolled=BASE+'/state/pr86-baseline-enrolled-'+self.id+'.json'
  if self.fs.exists(enrolled):
   need(j['enrolled'] is not None,'unknown_bootstrap_enrollment');raw,observed=self.fs.read(enrolled,0o600)
   need(core(observed)==core(j['enrolled']) and raw==canonical(self.platform.enrollment(self.b,j)),'changed_bootstrap_enrollment')
  else:need(j['enrolled'] is None,'missing_bootstrap_enrollment')
  for path,record,mode in [(self.p.PIPELINE_SELECTION,j['selection'],0o644),(self.p.PIPELINE_MOUNT_RECORD,j['attestation'],0o444)]:
   if not self.fs.exists(path):need(record is None or allow_missing,'missing_bootstrap_control');continue
   need(record is not None,'unknown_bootstrap_control');raw,observed=self.fs.read(path,mode)
   if path==self.p.PIPELINE_SELECTION:need(core(observed)==core(record) and raw==self.platform.selection(self.b,j),'changed_bootstrap_control')
   else:need(type(record)is dict and set(record)=={'value','identity'} and core(observed)==core(record['identity']) and raw==canonical(record['value']),'changed_bootstrap_control')
 def recover(self,j,deliberate=False):
  p=self.p;self.j=self.validate(j);recovery_phase=j['phase']
  consumed=parse(self.fs.read(BASE+'/state/pr86-baseline-consumed-'+self.id+'.json',0o600)[0]);_,begin,end=authority(p,self.b.approval_raw,self.b.policy,self.b.hash)
  need(type(consumed)is dict and set(consumed)=={'version','approvalSha256','usedAt'} and type(consumed['version'])is int and consumed['version']==1
   and consumed['approvalSha256']==digest(self.b.approval_raw) and type(consumed['usedAt'])is int and begin<=consumed['usedAt']<end,'consumed_authority')
  if self.fs.exists(p.INTERLOCK):
   raw,self.jstamp=self.fs.read(p.INTERLOCK,0o600);need(parse(raw)==j,'journal_changed')
  else:
   need(deliberate and j['phase']=='committed','missing_interlock');self.jstamp=None;self.save('rollback')
  self.check_raw_capture(j);self.check_control_records(j,allow_missing=recovery_phase=='rollback');self.platform.recovery_preflight(self.b,j)
  # Unknown stages, parents or static replacement inodes are never inferred
  # from a matching checksum. Keep interlock/resources for reconciliation.
  for path,expected in j['directories'].items():
   need(identity(os.lstat(self.fs.path(path)))[:5]==expected[:5],'bootstrap_directory_changed')
  for r in j['targets'].values():
   if self.fs.exists(r['stage']):
    raw,st=self.fs.read(r['stage'],r['mode']);need(r['newIdentity'] is not None and core(st)==core(r['newIdentity']) and digest(raw)==r['newHash'],'unknown_staging_inode')
   if r['oldIdentity'] is not None:
    need(r['backupIdentity'] is not None,'backup_not_registered');raw,st=self.fs.read(r['backup'],0o400)
    need(core(st)==core(r['backupIdentity']) and digest(raw)==r['oldHash'],'backup_changed')
   if self.fs.exists(r['target']):
    raw,st=self.fs.read(r['target'],None)
    old_ok=r['oldIdentity'] is not None and core(st)==core(r['oldIdentity']) and digest(raw)==r['oldHash']
    new_ok=r['newIdentity'] is not None and core(st)==core(r['newIdentity']) and digest(raw)==r['newHash']
    restored=r['restoreIdentity'] is not None and core(st)==core(r['restoreIdentity']) and digest(raw)==r['oldHash']
    need(old_ok or new_ok or restored,'foreign_target_inode')
   else:need(r['oldIdentity'] is None,'missing_old_target')
  self.save('rollback');self.platform.detach_bootstrap_mount(self.b,j)
  # Preserve consumed/enrolled audit, captured raw bytes, generations and every
  # old release. Remove only known live selector/attestation roles.
  self.platform.remove_bootstrap_records(self.b,j)
  for name,r in reversed(list(j['targets'].items())):
   if not self.fs.exists(r['target']):continue
   raw,current=self.fs.read(r['target'],None)
   if r['oldIdentity'] is not None and digest(raw)==r['oldHash'] and (core(current)==core(r['oldIdentity']) or r['restoreIdentity'] is not None and core(current)==core(r['restoreIdentity'])):continue
   need(r['newIdentity'] is not None and core(current)==core(r['newIdentity']) and digest(raw)==r['newHash'],'target_restore_cas')
   if r['oldIdentity'] is None:self.fs.remove(r['target'],current,r['newHash'])
   else:
    old,_=self.fs.read(r['backup'],0o400)
    if r['restoreIdentity'] is None:
     need(not self.fs.exists(r['restore']),'unknown_restore_inode');r['restoreIdentity']=self.fs.create(r['restore'],old,r['oldMode']);self.save('rollback')
    r['restoreIdentity']=self.fs.publish(r['restore'],r['target'],r['restoreIdentity'],current,r['oldMode'],r['oldHash']);self.save('rollback')
  self.platform.reload();self.platform.verify_rolled_back(self.b,j)
  self.save('rolled_back');raw=canonical(self.j)
  path=self.directory+'/rollback.json'
  if self.fs.exists(path):need(self.fs.read(path,0o600)[0]==raw,'rollback_receipt_changed')
  else:self.fs.create(path,raw)
  self.fs.remove(p.INTERLOCK,self.jstamp,digest(raw));return 'PR86_BOOTSTRAP_ROLLED_BACK_INACTIVE_RESOURCES_RETAINED'

class Platform:
 """Real fixed-path backend. Tests model authority, never expose CLI overrides."""
 def __init__(self,p,fs,bundle):
  self.p,self.fs,self.b=p,fs,bundle;self.store_fs=p.Filesystem(fs.sandbox);self.host=p.TrackedHost(p,self.store_fs)
  self.mounts=p.LinuxMounts(p,self.store_fs)
 def preflight(self,bundle):
  p=self.p;old=p.parse(self.fs.read(POLICY,0o644)[0]);need(old['version']==1,'old_policy_version')
  self.host.runtime_wiring(old);self.host.idle();need(self.host.publisher()['sha']==OLD_SOURCE,'old_publisher_source')
  p.Transaction(self.store_fs,self.host).inventory();self.host.verify_old_closure(old);self.host.invariants()
  for path,expected in [('pipeline',p.PIPELINE_OLD_TREE),('pipeline/package.json',p.PIPELINE_OLD_PACKAGE),('pipeline/pnpm-lock.yaml',p.PIPELINE_OLD_LOCK)]:
   need(self.host.git(['rev-parse',OLD_SOURCE+':'+path]).strip()==expected,'old_git_identity')
  expected_paths=set()
  for row in self.host.git(['ls-tree','-rz',OLD_SOURCE,'--','pipeline']).split('\0'):
   if not row:continue
   meta,path=row.split('\t');mode,kind,obj=meta.split();relative=path[9:];need(kind=='blob' and mode in ['100644','100755'],'old_source_type')
   raw=p.pipeline_blob(relative,bundle.inventory['entries'],bundle.blobs)
   need(hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==obj,'old_source_blob')
   expected_paths.add(relative)
  need({r['path'] for r in bundle.inventory['entries'] if r['type']!='dir' and not r['path'].startswith('node_modules/')}==expected_paths,'old_source_inventory')
  self.retained_backups()

  p.memory_guard((6*96+128)<<20)
  last=p.parse(self.store_fs.read(BASE+'/state/last.json',16384));need(type(last)is dict and set(last)=={'identity'} and type(last['identity'])is str and re.fullmatch('[a-z0-9_-]{1,80}',last['identity']),'legacy_last')
  directory=BASE+'/releases/'+last['identity'];terminal='rollback.json' if self.fs.exists(directory+'/rollback.json') else 'receipt.json'
  receipt_raw=self.store_fs.read(directory+'/'+terminal,65536);receipt=p.parse(receipt_raw);side='oldPublisher' if terminal=='rollback.json' else 'newPublisher'
  need(receipt.get('version')==1 and type(receipt.get('version'))is int and receipt.get('phase')==('rolled_back' if terminal=='rollback.json' else 'committed') and receipt[side]['sha']==OLD_SOURCE,'legacy_receipt')
  need(self.mounts.inspect()['state']=='absent','already_mounted')
  snapshot={'legacyReleaseIdentity':last['identity'],'legacyReceiptName':terminal,'legacyReceiptSha256':digest(receipt_raw),
   'targetParentIdentity':self.mounts.parent_identity(),'underlyingTargetIdentity':self.mounts.underlying_identity(),
   'invariants':self.invariants(),'oldPolicy':old}
  self.capacity(bundle);return snapshot
 def retained_backups(self):
  result={};p=self.p
  with self.fs.directory(BASE+'/releases') as fd:names=os.listdir(fd)
  need(len(names)<=1000,'release_capacity')
  for name in names:
   need(re.fullmatch('[a-z0-9_-]{1,80}',name),'release_name');directory=BASE+'/releases/'+name
   terminal='rollback.json' if self.fs.exists(directory+'/rollback.json') else 'receipt.json';raw=self.store_fs.read(directory+'/'+terminal,65536);receipt=p.parse(raw)
   need(receipt.get('phase')==('rolled_back' if terminal=='rollback.json' else 'committed') and set(receipt.get('targets',{}))==set(p.FILES.values())|set(p.RECORDS),'retained_receipt')
   result[directory+'/'+terminal]=digest(raw)
   for target,item in receipt['targets'].items():
    backup=item['backup'];need(type(backup)is str and str(Path(backup).parent)==directory+'/backup' and re.fullmatch('[0-9]+',Path(backup).name),'retained_backup_path')
    content=self.store_fs.read(backup,p.MAX_TAR);need(digest(content)==item['oldHash'],'retained_backup_digest');result[backup]=digest(content)
  return result
 def invariants(self):
  p=self.p;stable={}
  for path in [*p.FILES.values(),*p.RECORDS]:
   raw=self.store_fs.read(path,p.MAX_TAR);st=os.lstat(self.fs.path(path));stable[path]={'sha256':digest(raw),'identity':identity(st)}
  reader='/var/lib/aktau-sync/c2/reader.dsn';st=os.lstat(self.fs.path(reader));need(stat.S_ISREG(st.st_mode) and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600 and not os.listxattr(self.fs.path(reader)),'reader_custody');stable[reader]={'identity':identity(st)}
  ledger='/var/lib/aktau-sync/c2/ledger/attempts.json';fd=os.open(self.fs.path(ledger),os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
  try:
   st=os.fstat(fd);need(stat.S_ISREG(st.st_mode) and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600 and st.st_size<=4<<20,'ledger_custody');raw=os.read(fd,(4<<20)+1);need(len(raw)==st.st_size and identity(st)==identity(os.fstat(fd)),'ledger_changed');entries=p.parse(raw);need(type(entries)is list and len(entries)<=2048,'ledger_capacity')
  finally:os.close(fd)
  # Host.invariants validates the independently hash-pinned ledger codec. Only
  # per-entry hashes persist; never copy a reader DSN or ledger event payload.
  self.host.invariants()
  return {'stable':stable,'backups':self.retained_backups(),'ledger':{'owner':[st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode)],'entries':[digest(p.canonical(e)) for e in entries]}}
 def lineage(self,before):
  current=self.invariants();need(current['stable']==before['stable'] and current['backups']==before['backups'] and current['ledger']['owner']==before['ledger']['owner']
   and current['ledger']['entries'][:len(before['ledger']['entries'])]==before['ledger']['entries'],'protected_state_changed')
 def capacity(self,b):
  plans={BASE+'/state':[512<<10]*4,BASE+'/capsules':[r.get('size',0) for r in b.inventory['entries']],BASE:[r[1][6] for r in b.raw_inventory['entries'] if stat.S_ISREG(r[1][2])]}
  for name,(target,_) in TARGETS.items():plans.setdefault(str(Path(target).parent),[]).extend([len(b.files[name])]*3)
  plans.setdefault(str(Path(self.p.PIPELINE_SELECTION).parent),[]).extend([16384]*3);plans.setdefault(str(Path(self.p.PIPELINE_MOUNT_RECORD).parent),[]).extend([16384]*3)
  totals={}
  for original,sizes in plans.items():
   path=original
   while not self.fs.exists(path):path=str(Path(path).parent)
   with self.fs.directory(path) as fd:
    st=os.fstat(fd);v=os.fstatvfs(fd);need(v.f_frsize>0 and v.f_bavail>=0 and v.f_favail>=0,'capacity_unavailable');block=v.f_frsize
    charge=sum(((n+block-1)//block)*block for n in sizes)+(len(b.inventory['entries'])+8192)*block
    item=totals.setdefault(st.st_dev,{'bytes':0,'inodes':0,'available':v.f_bavail*block,'freeInodes':v.f_favail});item['bytes']+=charge;item['inodes']+=len(sizes)+8192;item['available']=min(item['available'],v.f_bavail*block);item['freeInodes']=min(item['freeInodes'],v.f_favail)
  for item in totals.values():need(item['available']>=item['bytes']+(64<<20) and item['freeInodes']>=item['inodes']+256,'insufficient_capacity')
 def raw_input(self,expected,retain=None):
  p=self.p;need(type(expected)is dict and set(expected)=={'version','kind','sourceSha','pipelineTreeSha1','rootIdentity','entries'} and type(expected['version'])is int and expected['version']==1,'raw_inventory_schema')
  need(type(expected['rootIdentity'])is list and len(expected['rootIdentity'])==9 and all(type(x)is int and x>=0 for x in expected['rootIdentity']),'raw_root_identity')
  rows=expected['entries'];need(type(rows)is list and 0<len(rows)<=8192,'raw_inventory_capacity');lookup={};previous=b''
  for row in rows:
   need(type(row)is list and len(row)==3 and type(row[0])is str,'raw_inventory_entry');path=p.pipeline_path(row[0]);need(path.encode()>previous,'raw_inventory_order');previous=path.encode()
   need(type(row[1])is list and len(row[1])==9 and all(type(x)is int and x>=0 for x in row[1]),'raw_identity');lookup[path]=row
   need(not any(part in ['.env','.npmrc','.pnpmfile.cjs','reader.dsn'] or part.startswith('.env.') and part!='.env.example' for part in Path(path).parts),'private_input_name')
  buffers={};seen=set();logical=0;rootpath=self.fs.path(p.PUBLISHER+'/pipeline')
  with contextlib.ExitStack() as stack:
   fd=os.open(self.fs.sandbox or '/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC);stack.callback(os.close,fd);pins=[];logical_path=''
   actor=(self.fs.uid,self.fs.gid) if self.fs.sandbox else (p.pwd.getpwnam('aktau-sync').pw_uid,p.pwd.getpwnam('aktau-sync').pw_gid)
   need(actor[0]>0 or self.fs.sandbox,'operator_uid')
   for part in (p.PUBLISHER+'/pipeline').strip('/').split('/'):
    parent=fd;fd=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=parent);stack.callback(os.close,fd);st=os.fstat(fd);logical_path+='/'+part
    owners=[(self.fs.uid,self.fs.gid),actor] if logical_path in [p.PUBLISHER,p.PUBLISHER+'/pipeline'] else [(self.fs.uid,self.fs.gid)]
    writable=logical_path==p.PUBLISHER+'/pipeline' and identity(st)==expected['rootIdentity'] and stat.S_IMODE(st.st_mode)==0o775
    need((st.st_uid,st.st_gid) in owners and (not st.st_mode&0o022 or writable) and not os.listxattr(fd),'raw_parent_custody');pins.append((parent,part,fd,identity(st)))
   need(identity(os.fstat(fd))==expected['rootIdentity'],'raw_root_changed')
   def walk(parent,relative):
    nonlocal logical
    before=identity(os.fstat(parent));names=sorted(os.listdir(parent));need(len(names)<=8192,'raw_directory_capacity')
    for name in names:
     path=relative+'/'+name if relative else name;need(path in lookup,'unknown_raw_path');row=lookup[path];st=os.stat(name,dir_fd=parent,follow_symlinks=False)
     need(identity(st)==row[1] and (st.st_uid,st.st_gid) in [(self.fs.uid,self.fs.gid),actor],'raw_entry_changed');seen.add(path)
     if stat.S_ISDIR(st.st_mode):
      need(row[2] is None and not os.listxattr('/proc/self/fd/'+str(parent)+'/'+name,follow_symlinks=False),'raw_directory')
      child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=parent)
      try:need(identity(os.fstat(child))==row[1],'raw_directory_changed');walk(child,path)
      finally:os.close(child)
     elif stat.S_ISREG(st.st_mode):
      need(0<=st.st_size<=16<<20 and not st.st_mode&0o7000 and type(row[2])is str and HEX.fullmatch(row[2]),'raw_file')
      child=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=parent)
      try:
       need(not os.listxattr(child) and identity(os.fstat(child))==row[1],'raw_file_custody');data=bytearray()
       while chunk:=os.read(child,65536):data.extend(chunk);logical+=len(chunk);need(logical<=90<<20,'raw_logical_capacity')
       need(len(data)==st.st_size and digest(data)==row[2] and identity(os.fstat(child))==row[1],'raw_file_changed')
       if retain is not None:buffers[path]=bytes(data)
      finally:os.close(child)
     elif stat.S_ISLNK(st.st_mode):need(os.readlink(name,dir_fd=parent)==row[2] and not os.listxattr('/proc/self/fd/'+str(parent)+'/'+name,follow_symlinks=False),'raw_link_changed')
     else:raise Blocked('raw_special_file')
     need(identity(os.stat(name,dir_fd=parent,follow_symlinks=False))==row[1],'raw_name_changed')
    need(identity(os.fstat(parent))==before and sorted(os.listdir(parent))==names,'raw_directory_changed')
   walk(fd,'');need(seen==set(lookup),'missing_raw_path')
   for parent,name,held,original in pins:need(identity(os.fstat(held))==identity(os.stat(name,dir_fd=parent,follow_symlinks=False))==original,'raw_parent_changed')
  if retain is not None:
   directory=retain+'/raw';created=self.fs.mkdir(directory);index=[]
   for number,(path,data) in enumerate(sorted(buffers.items())):
    filename=str(number);st=self.fs.create(directory+'/'+filename,data,0o400);index.append({'path':path,'file':filename,'sha256':digest(data),'identity':st})
   seal=canonical({'version':1,'inputInventorySha256':digest(canonical(expected)),'directoryIdentity':created[:5],'files':index});seal_identity=self.fs.create(directory+'/seal.json',seal,0o400)
   return {'directoryIdentity':created[:5],'sealIdentity':seal_identity,'sealSha256':digest(seal)}
  return digest(canonical(expected))
 def selection(self,b,j):
  return self.p.canonical({'version':1,'contract':self.p.CONTRACT,'sourceSha':OLD_SOURCE,'pipelineTreeSha1':self.p.PIPELINE_OLD_TREE,'inventorySha256':b.approval['oldRuntimeInventorySha256'],'descriptorSha256':digest(b.files['provenance.json']),'releaseIdentity':'pr86-'+b.approval['approvalId'],'provenanceKind':'legacy-installed-attested'})
 def enrollment(self,b,j):
  s=j['snapshot'];return {'version':1,'approvalSha256':digest(b.approval_raw),'policySha256':digest(canonical(b.policy)),'outcome':'BASELINE_ENROLLED','generation':b.approval['oldRuntimeInventorySha256'],**{k:s[k] for k in ['targetParentIdentity','underlyingTargetIdentity','legacyReleaseIdentity','legacyReceiptName','legacyReceiptSha256']}}
 def prepare_mount(self,gen,engine):
  def register(st):
   engine.j['mountStageIdentity']=st;engine.save('enrolled');engine.fault('mount_directory_registered')
  return self.mounts.prepare(gen,'pr86-baseline',register)
 def attach_mount(self,prepared):self.mounts.attach(prepared)
 def attest(self,raw):
  value=self.p.emit_attestation(self.p,self.store_fs,self.mounts,raw,[digest(raw)]);return {'value':value,'identity':identity(os.lstat(self.fs.path(self.p.PIPELINE_MOUNT_RECORD)))}
 def reload(self):self.p.command(['/usr/bin/systemctl','daemon-reload'],timeout=20)
 def verify(self,b,j):
  self.lineage(j['snapshot']['invariants']);self.host.runtime_wiring(b.policy);need(self.host.publisher()['sha']==OLD_SOURCE,'publisher_changed');self.p.require_enrollment(self.p,self.store_fs,b.policy)
  need(self.mounts.generation()==b.approval['oldRuntimeInventorySha256'],'baseline_mount');self.host.verify_old_closure(b.policy)
 def recovery_preflight(self,b,j):
  self.host.idle()
  last=self.p.parse(self.store_fs.read(BASE+'/state/last.json',16384));need(last=={'identity':j['snapshot']['legacyReleaseIdentity']},'legacy_history_changed')
  generation=b.approval['oldRuntimeInventorySha256'];capsules=BASE+'/capsules'
  if self.fs.exists(capsules):
   with self.fs.directory(capsules) as fd:need(set(os.listdir(fd))<= {generation},'unknown_bootstrap_generation')
   if self.fs.exists(capsules+'/'+generation):
    need(j['generation']==generation,'unregistered_bootstrap_generation');self.p.PipelineStore(self.store_fs).verify(generation)
  stage=BASE+'/mounts/pr86-baseline'
  if self.fs.exists(BASE+'/mounts'):
   with self.fs.directory(BASE+'/mounts') as fd:need(set(os.listdir(fd))<= {'pr86-baseline'},'unknown_bootstrap_mount_stage')
  if self.fs.exists(stage):
   need(j['mountStageIdentity'] is not None,'unknown_bootstrap_mount_stage')
   record=self.mounts._record(stage)
   if record is None:
    need(identity(os.lstat(self.fs.path(stage)))[:6]==j['mountStageIdentity'] and not os.listdir(self.fs.path(stage)),'changed_bootstrap_mount_stage')
   else:need(j['mount'] is not None and record=={k:j['mount'][k] for k in ['mountId','namespace','rootIdentity']},'unknown_bootstrap_mount_stage')
  else:need(j['mountStageIdentity'] is None,'missing_bootstrap_mount_stage')
  need(self.host.publisher()['sha']==OLD_SOURCE,'publisher_already_promoted');self.lineage(j['snapshot']['invariants'])
 def detach_bootstrap_mount(self,b,j):
  current=self.mounts.inspect()
  if current['state']=='mounted':
   need(j['mount'] is not None and current['generation']==b.approval['oldRuntimeInventorySha256'] and all(current[k]==j['mount'][k] for k in ['mountId','namespace','rootIdentity']),'unknown_bootstrap_mount');self.mounts._unmount(self.p.PUBLISHER+'/pipeline')
  stage=BASE+'/mounts/pr86-baseline'
  staged=self.mounts._record(stage) if self.fs.exists(stage) else None
  if staged is not None:
   need(j['mount'] is not None and staged=={k:j['mount'][k] for k in ['mountId','namespace','rootIdentity']},'unknown_bootstrap_mount_stage');self.mounts._unmount(stage)
  need(self.mounts.underlying_identity()==j['snapshot']['underlyingTargetIdentity'],'underlying_changed')
  # Existing actor-writable bytes must still be the approved actual OLD,
  # before removing records or restoring any legacy root execution path.
  self.raw_input(b.raw_inventory,retain=None)
 def remove_bootstrap_records(self,b,j):
  if self.fs.exists(self.p.PIPELINE_MOUNT_RECORD):
   need(j['attestation'] is not None,'unknown_attestation');raw,st=self.fs.read(self.p.PIPELINE_MOUNT_RECORD,0o444);need(parse(raw)==j['attestation']['value'],'changed_attestation');self.fs.remove(self.p.PIPELINE_MOUNT_RECORD,st,digest(raw))
  if self.fs.exists(self.p.PIPELINE_SELECTION):
   raw,st=self.fs.read(self.p.PIPELINE_SELECTION,0o644);need(j['selection'] is not None and core(st)==core(j['selection']) and raw==self.selection(b,j),'selection_changed');self.fs.remove(self.p.PIPELINE_SELECTION,st,digest(raw))
 def verify_rolled_back(self,b,j):
  need(digest(self.fs.read(ROOT+'/publisher-promotion.py',0o755)[0])==OLD_EXECUTOR and digest(self.fs.read(POLICY,0o644)[0])==OLD_POLICY,'old_pair_not_restored');self.lineage(j['snapshot']['invariants']);need(self.mounts.inspect()['state']=='absent','rollback_mount_remaining');self.raw_input(b.raw_inventory,retain=None)

class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args):raise Blocked('source_redirect')

def github(path):
 need(type(path)is str and not path.startswith('/') and '..' not in path,'metadata_path')
 request=urllib.request.Request('https://api.github.com/repos/kiratonine/AdilBaga/'+path,headers={'Accept':'application/vnd.github+json','User-Agent':'Aktau-PR86-Root-Bootstrap/1','X-GitHub-Api-Version':'2022-11-28'})
 try:
  with urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect()).open(request,timeout=8) as r:
   need(r.status==200 and 'application/json' in r.headers.get('Content-Type',''),'source_status');raw=r.read((2<<20)+1);need(len(raw)<=2<<20,'source_capacity');return json.loads(raw)
 except Blocked:raise
 except Exception:raise Blocked('source_authority_unavailable') from None

def verify_public_source(manifest,files,api=github):
 sha=manifest['sourceSha'];ci=api('actions/runs/'+str(manifest['ciRunId']));jobs=api('actions/runs/'+str(manifest['ciRunId'])+'/jobs?per_page=100')['jobs']
 need(api('git/ref/heads/main')['object']['sha']==sha and ci.get('head_sha')==sha and ci.get('event')=='push' and ci.get('head_branch')=='main'
  and ci.get('repository',{}).get('full_name')=='kiratonine/AdilBaga' and ci.get('head_repository',{}).get('full_name')=='kiratonine/AdilBaga'
  and ci.get('path')=='.github/workflows/ci.yml' and ci.get('conclusion')=='success' and ci.get('status')=='completed'
  and type(ci.get('run_attempt'))is int and ci['run_attempt']>0 and len(jobs)==9
  and {j.get('name') for j in jobs}=={'Frontend','Pipeline Quality','Nest Reference','Security','Go Quality','Contracts','PostgreSQL Integration','Ephemeral Staging','CI Gate'}
  and all(j.get('conclusion')=='success' and j.get('status')=='completed' for j in jobs),'source_ci_identity')
 for name,path in {**SOURCE_PATHS,'pr86-root-bootstrap.py':'ops/c2/pr86-root-bootstrap.py'}.items():
  info=api('contents/'+path+'?ref='+sha);need(info.get('type')=='file' and info.get('encoding')=='base64','source_encoding');raw=base64.b64decode(info['content'])
  need(raw==files[name] and hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==info['sha'],'source_digest')
 policy=parse(files['policy.json'])
 for path in ['.github/workflows/sync-publisher-build.yml','scripts/ops/build-sync-promotion.py']:
  info=api('contents/'+path+'?ref='+sha);need(info.get('type')=='file' and info.get('encoding')=='base64','producer_encoding');raw=base64.b64decode(info['content'])
  need(digest(raw)==policy['producerFiles'][path] and hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==info['sha'],'producer_pin')
 return sha,manifest['ciRunId']

def load_fixed_bundle(fs,recovery=False):
 """Authenticate complete record AND GitHub bytes before executing new code."""
 manifest_raw,_=fs.read(INPUT+'/bundle.json',0o400,16384);manifest=parse(manifest_raw)
 need(type(manifest)is dict and set(manifest)=={'version','contract','sourceSha','ciRunId','files'} and type(manifest['version'])is int and manifest['version']==1
  and manifest['contract']==CONTRACT and type(manifest['sourceSha'])is str and re.fullmatch('[a-f0-9]{40}',manifest['sourceSha'])
  and type(manifest['ciRunId'])is int and manifest['ciRunId']>0 and type(manifest['files'])is dict and set(manifest['files'])==INPUT_FILES,'bundle_schema')
 approval_raw,_=fs.read(APPROVAL,0o600,16384)
 with fs.directory(INPUT) as fd:need(set(os.listdir(fd))==INPUT_FILES|{'bundle.json'},'unexpected_bundle_member')
 # Small policy data is validated before reading a large capsule or importing
 # any repository code. No uploader/fixture flag supplies this authorization.
 policy_raw,_=fs.read(INPUT+'/policy.json',0o400,16384);policy=parse(policy_raw)
 constants=types.SimpleNamespace(PIPELINE_OLD_TREE='2ed1c1c6d6fef504b08829f4193a0b60681bd3a7',PIPELINE_OLD_PACKAGE='3049257eb2898eb4c279a296f3bd56f1a52e883b',PIPELINE_OLD_LOCK='cfee18d88a435e550c0ed3f074fb8ccd4704cdfe',PIPELINE_NODE='41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c',PIPELINE_PNPM='9b943b94bc8f55efb993aad8e44b538e6b091e60a9e4a944dcde869855f233e3')
 a,begin,end=authority(constants,approval_raw,policy,digest(canonical(manifest)),None if recovery else time.time_ns()//1000000)
 if recovery:
  consumed=parse(fs.read(BASE+'/state/pr86-baseline-consumed-'+a['approvalId']+'.json',0o600,16384)[0])
  need(type(consumed)is dict and set(consumed)=={'version','approvalSha256','usedAt'} and type(consumed['version'])is int and consumed['version']==1
   and consumed['approvalSha256']==digest(approval_raw) and type(consumed['usedAt'])is int and begin<=consumed['usedAt']<end,'consumed_authority')
 files={}
 for name in INPUT_FILES:
  cap=96<<20 if name=='old-runtime.tar' else 32<<20 if name=='pnpm.tgz' else 2<<20
  raw,_=fs.read(INPUT+'/'+name,0o400,cap);need(type(manifest['files'][name])is str and HEX.fullmatch(manifest['files'][name]) and digest(raw)==manifest['files'][name],'bundle_digest');files[name]=raw
 own,_=fs.read(SELF,0o755,512<<10);need(own==files['pr86-root-bootstrap.py'],'installed_bootstrap_digest')
 proof=None if recovery else verify_public_source(manifest,files)
 module=types.ModuleType('_root_approved_pr86_promotion');module.__file__=INPUT+'/publisher-promotion.py';sys.modules[module.__name__]=module
 exec(compile(files['publisher-promotion.py'],module.__file__,'exec'),module.__dict__)
 bundle=Bundle(module,manifest,files,approval_raw)
 if proof is not None:bundle._source_proof=proof
 return module,bundle

@contextlib.contextmanager
def locks(fs):
 with contextlib.ExitStack() as stack:
  for path,mode in LOCKS:
   d=stack.enter_context(fs.directory(str(Path(path).parent)));fd=os.open(Path(path).name,os.O_RDWR|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=d);stack.callback(os.close,fd)
   st=os.fstat(fd);need(stat.S_ISREG(st.st_mode) and (st.st_uid,st.st_gid,st.st_nlink,stat.S_IMODE(st.st_mode),st.st_size)==(fs.uid,fs.gid,1,mode,0) and not os.listxattr(fd),'lock_custody')
   try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
   except BlockingIOError:raise Blocked('writer_busy') from None
   need(identity(os.fstat(fd))==identity(os.stat(Path(path).name,dir_fd=d,follow_symlinks=False)),'lock_replaced')
  yield

def main():
 need(sys.argv[1:] in [['--verify'],['--apply'],['--recover'],['--rollback']],'fixed_entry')
 def deadline(*_):raise Blocked('operator_deadline')
 signal.signal(signal.SIGALRM,deadline);signal.alarm(300)
 for sig in [signal.SIGTERM,signal.SIGHUP,signal.SIGINT]:signal.signal(sig,lambda *_:(_ for _ in ()).throw(Blocked('operator_cancelled')))
 fs=Files();p,b=load_fixed_bundle(fs,sys.argv[1] in ['--recover','--rollback']);platform=Platform(p,fs,b);engine=Transaction(p,fs,b,platform)
 with locks(fs):
  if sys.argv[1]=='--verify':engine.verify();result='PR86_ROOT_BOOTSTRAP_READY'
  elif sys.argv[1]=='--apply':result=engine.apply()
  elif sys.argv[1]=='--recover':
   raw,_=fs.read(p.INTERLOCK,0o600,512<<10);result=engine.recover(parse(raw))
  else:
   raw,_=fs.read(engine.directory+'/receipt.json',0o600,512<<10);result=engine.recover(parse(raw),deliberate=True)
 print(canonical({'status':result}).decode(),end='')

if __name__=='__main__':
 try:main()
 except BaseException as e:
  code=str(e) if isinstance(e,Blocked) and re.fullmatch('[a-z_]{1,80}',str(e)) else 'operation_failed'
  print(canonical({'status':'BLOCKED','errorClass':code}).decode(),end='');sys.exit(1)
