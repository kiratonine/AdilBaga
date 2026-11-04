"""Root enrollment boundary qualification; all authority here is disposable fixture data."""
import importlib.util
from pathlib import Path
import tempfile,unittest,os,json,io,tarfile,datetime
HERE=Path(__file__).parent
spec=importlib.util.spec_from_file_location('bootstrap_promotion',HERE/'publisher-promotion.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
class EnrollmentFixture:
 def __init__(self):
  self.temp=tempfile.TemporaryDirectory(prefix='pr86-enrollment-');self.root=Path(self.temp.name);self.root.chmod(0o700);self.fs=p.Filesystem(self.root)
  for path in [p.BASE+'/capsules',p.BASE+'/state',p.BASE+'/releases/build-100-1',str(Path(p.POLICY).parent),p.PUBLISHER+'/pipeline']:
   self.fs.path(path).mkdir(parents=True,exist_ok=True,mode=0o700)
  self.target=self.fs.path(p.PUBLISHER+'/pipeline');self.target.chmod(0o775)
  data=b'public synthetic OLD';inv=p.canonical({'version':1,'entries':[{'path':'package.json','type':'file','mode':0o444,'size':len(data),'sha256':p.digest(data)}]});out=io.BytesIO()
  with tarfile.open(fileobj=out,mode='w',format=tarfile.USTAR_FORMAT) as t:
   for name,raw in [('inventory.json',inv),('blob/0',data)]:
    m=tarfile.TarInfo(name);m.mode=0o444;m.size=len(raw);t.addfile(m,io.BytesIO(raw))
  gen=p.digest(inv);p.PipelineStore(self.fs).install(out.getvalue(),gen,'baseline',lambda *a:None)
  old=(HERE/'fixtures/pair-upgrade/policy-before.json').read_bytes();old=old.replace(b'fca92db4cda0d94d25f6b7afbe314cb9bac94fff024f619eb94a24a365330670',b'd69c667212b2a6c8a25081ccdc90f798024e850784262976e06e45ce13f45118');assert p.digest(old)=='2bf672f1626252f107447552493ad982999d3d7f444f000394a7006d952ddb8b'
  self.policy=p.parse(old);self.policy['version']=2;self.policy['runtimeFiles'][p.ROOT+'/bin/pnpm']='a'*64;self.policy['runtimeFiles']['/etc/systemd/system/aktau-sync-dependencies.service']='a'*64
  self.policy['pipelineContract']={'id':p.PIPELINE_CONTRACT,'oldSourceSha':p.PIPELINE_OLD_SOURCE,'oldTreeSha1':p.PIPELINE_OLD_TREE,'newTreeSha1':p.PIPELINE_NEW_TREE,'oldPackageBlobSha1':p.PIPELINE_OLD_PACKAGE,'newPackageBlobSha1':p.PIPELINE_NEW_PACKAGE,'oldLockBlobSha1':p.PIPELINE_OLD_LOCK,'newLockBlobSha1':p.PIPELINE_NEW_LOCK,'contractsOldLockBlobSha1':p.CONTRACTS_OLD_LOCK,'contractsNewLockBlobSha1':p.CONTRACTS_NEW_LOCK,'nodeSha256':p.PIPELINE_NODE,'pnpmTarSha256':p.PIPELINE_PNPM,'baselineInputInventorySha256':'a'*64,'baselineRuntimeInventorySha256':gen}
  p.validate_policy(self.policy);self.fs.write(p.POLICY,p.canonical(self.policy),0o644)
  self.approval={'version':1,'purpose':'pr86-baseline-enrollment','sourceSha':p.PIPELINE_OLD_SOURCE,'pipelineTreeSha1':p.PIPELINE_OLD_TREE,'packageBlobSha1':p.PIPELINE_OLD_PACKAGE,'lockBlobSha1':p.PIPELINE_OLD_LOCK,'legacyInputInventorySha256':'a'*64,'oldRuntimeInventorySha256':gen,'nodeSha256':p.PIPELINE_NODE,'pnpmTarSha256':p.PIPELINE_PNPM,'oldExecutorSha256':'d69c667212b2a6c8a25081ccdc90f798024e850784262976e06e45ce13f45118','oldPolicySha256':p.digest(old),'newPolicySha256':p.digest(p.canonical(self.policy)),'approvalId':'c'*32,'reviewedRootBundleSha256':'b'*64,'notBefore':'2026-11-04T00:00:00.000Z','expiresAt':'2026-11-04T01:00:00.000Z'}
  self.approvalPath='/etc/aktau-sync-promotion/pr86-baseline-approval.json';self.fs.write(self.approvalPath,p.canonical(self.approval));ah=p.digest(p.canonical(self.approval));self.prefix=p.BASE+'/state/pr86-baseline-'
  self.fs.write(self.prefix+'consumed-'+self.approval['approvalId']+'.json',p.canonical({'version':1,'approvalSha256':ah,'usedAt':int(datetime.datetime(2026,11,4,0,30,tzinfo=datetime.timezone.utc).timestamp()*1000)}))
  self.legacyPath=p.BASE+'/releases/build-100-1/receipt.json';legacy={'version':1,'identity':'build-100-1','directory':p.BASE+'/releases/build-100-1','phase':'committed','newPublisher':{'sha':p.PIPELINE_OLD_SOURCE,'branch':'HEAD'},'targets':{path:{'oldHash':'a'*64,'newHash':'b'*64} for path in [*p.FILES.values(),*p.RECORDS]}}
  self.fs.write(self.legacyPath,p.canonical(legacy));self.receipt={'version':1,'approvalSha256':ah,'policySha256':self.approval['newPolicySha256'],'outcome':'BASELINE_ENROLLED','generation':gen,'targetParentIdentity':list(p.stamp(os.lstat(self.target.parent)))[:6],'underlyingTargetIdentity':list(p.stamp(os.lstat(self.target)))[:6],'legacyReleaseIdentity':'build-100-1','legacyReceiptName':'receipt.json','legacyReceiptSha256':p.digest(p.canonical(legacy))};self.receiptPath=self.prefix+'enrolled-'+self.approval['approvalId']+'.json';self.fs.write(self.receiptPath,p.canonical(self.receipt))
 def valid(self):return p._enrolled_underlying_target(p,self.fs,os.stat(self.target),os.stat(self.target.parent))
 def close(self):self.temp.cleanup()
class EnrolledUnderlyingTargetTests(unittest.TestCase):
 def setUp(self):self.f=EnrollmentFixture()
 def tearDown(self):self.f.close()
 def test_exact_consuming_enrollment_allows_bound_0775(self):
  self.assertEqual(p.require_enrollment(p,self.f.fs,self.f.policy),self.f.receipt)
  self.assertTrue(self.f.valid())
 def test_missing_approval_does_not_allow_group_write(self):
  self.f.fs.path(self.f.approvalPath).unlink();self.assertFalse(self.f.valid())
 def test_tampered_authorization_is_rejected(self):
  a={**self.f.approval,'reviewedRootBundleSha256':'d'*64};self.f.fs.write(self.f.approvalPath,p.canonical(a),replace=True);self.assertFalse(self.f.valid())
 def test_foreign_inode_does_not_match_root_receipt(self):
  self.f.target.rename(self.f.target.with_name('retained'));self.f.target.mkdir(mode=0o775);self.f.target.chmod(0o775);self.assertFalse(self.f.valid())
 def test_parent_identity_change_is_rejected(self):
  before=os.stat(self.f.target.parent).st_mode & 0o777
  changed=0o700 if before!=0o700 else 0o755
  self.f.target.parent.chmod(changed)
  self.assertNotEqual(os.stat(self.f.target.parent).st_mode & 0o777,before)
  self.assertFalse(self.f.valid())
 def test_other_writable_modes_are_not_accepted(self):
  for mode in [0o777,0o770,0o757,0o1775]:
   self.f.target.chmod(mode);self.assertFalse(self.f.valid())
 def test_wrong_consumption_digest_rejected(self):
  q=self.f.prefix+'consumed-'+self.f.approval['approvalId']+'.json';self.f.fs.write(q,p.canonical({'version':1,'approvalSha256':'d'*64,'usedAt':1793752200000}),replace=True);self.assertFalse(self.f.valid())
 def test_changed_sealed_graph_rejected(self):
  q=self.f.fs.path(p.BASE+'/capsules/'+self.f.receipt['generation']+'/pipeline/package.json');q.chmod(0o644);q.write_bytes(b'foreign');self.assertFalse(self.f.valid())


# This module is a new unqualified source candidate, never a production approval.
import types,sys,copy
from unittest.mock import patch
bspec=importlib.util.spec_from_file_location('bootstrap_candidate',HERE/'pr86-root-bootstrap.py')
b=importlib.util.module_from_spec(bspec);sys.modules[bspec.name]=b;bspec.loader.exec_module(b)
class BootstrapAuthorityTests(unittest.TestCase):
 def setUp(self):self.f=EnrollmentFixture()
 def tearDown(self):self.f.close()
 def check(self,a=None,now=1793752200000):
  return b.authority(p,p.canonical(a or self.f.approval),self.f.policy,'b'*64,now)
 def test_exact_record_in_time(self):self.assertEqual(self.check()[0],self.f.approval)
 def test_no_self_approval_or_extra_fields(self):
  for extra in [{'approved':True},{'fixtureOnly':False},{'override':True}]:
   with self.subTest(extra=extra),self.assertRaises(b.Blocked):self.check({**self.f.approval,**extra})
 def test_each_exact_tuple_field_bound(self):
  variable={'approvalId','notBefore','expiresAt'}
  for key,value in self.f.approval.items():
   if key in variable:continue
   with self.subTest(key=key),self.assertRaises(b.Blocked):self.check({**self.f.approval,key:False if key=='version' else 'foreign'})
 def test_future_expired_and_boundary(self):
  for now in [1793750399999,1793754000000,1793754000001]:
   with self.subTest(now=now),self.assertRaises(b.Blocked):self.check(now=now)
 def test_window_never_exceeds_one_hour(self):
  with self.assertRaises(b.Blocked):self.check({**self.f.approval,'expiresAt':'2026-11-04T01:00:00.001Z'})
 def test_duplicate_json_rejected(self):
  with self.assertRaisesRegex(b.Blocked,'duplicate_key'):b.parse(b'{"version":1,"version":1}')
 def test_boolean_clock_is_not_timestamp(self):
  with self.assertRaises(b.Blocked):self.check(now=True)
class BootstrapFilesystemTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='bootstrap-fixed-files-');self.root=Path(self.temp.name);self.root.chmod(0o700);self.fs=b.Files(self.root)
  (self.root/'fixed').mkdir(mode=0o700)
 def tearDown(self):self.temp.cleanup()
 def test_real_publish_and_cas_remove(self):
  old=self.fs.create('/fixed/live',b'old',0o644);new=self.fs.create('/fixed/stage',b'new',0o644)
  st=self.fs.publish('/fixed/stage','/fixed/live',new,old,0o644,b.digest(b'new'))
  self.assertEqual(self.fs.read('/fixed/live',0o644)[0],b'new');self.assertFalse(self.fs.exists('/fixed/stage'))
  self.fs.remove('/fixed/live',st,b.digest(b'new'));self.assertFalse(self.fs.exists('/fixed/live'))
 def test_existing_destination_never_clobbered(self):
  self.fs.create('/fixed/live',b'foreign');st=self.fs.create('/fixed/stage',b'new')
  with self.assertRaisesRegex(b.Blocked,'no_clobber'):self.fs.publish('/fixed/stage','/fixed/live',st,None,0o600,b.digest(b'new'))
  self.assertEqual(self.fs.read('/fixed/live')[0],b'foreign')
 def test_foreign_stage_same_digest_rejected(self):
  st=self.fs.create('/fixed/stage',b'new');(self.root/'fixed/stage').rename(self.root/'fixed/retained')
  self.fs.create('/fixed/stage',b'new')
  with self.assertRaisesRegex(b.Blocked,'staged_cas'):self.fs.publish('/fixed/stage','/fixed/live',st,None,0o600,b.digest(b'new'))
  self.assertFalse(self.fs.exists('/fixed/live'));self.assertEqual(self.fs.read('/fixed/stage')[0],b'new')
 def test_target_same_inode_tamper_with_restored_mtime_rejected(self):
  old=self.fs.create('/fixed/live',b'old');new=self.fs.create('/fixed/stage',b'new');q=self.root/'fixed/live';saved=q.stat();q.write_bytes(b'bad');os.utime(q,ns=(saved.st_atime_ns,saved.st_mtime_ns))
  with self.assertRaisesRegex(b.Blocked,'target_cas'):self.fs.publish('/fixed/stage','/fixed/live',new,old,0o600,b.digest(b'new'))
  self.assertEqual(q.read_bytes(),b'bad')
 def test_symlink_not_followed(self):
  q=self.root/'fixed/foreign';q.write_bytes(b'foreign');(self.root/'fixed/stage').symlink_to('foreign')
  with self.assertRaises(OSError):self.fs.read('/fixed/stage')
  self.assertEqual(q.read_bytes(),b'foreign')
 def test_hardlink_rejected(self):
  self.fs.create('/fixed/a',b'one');os.link(self.root/'fixed/a',self.root/'fixed/b')
  with self.assertRaisesRegex(b.Blocked,'root_file_custody'):self.fs.read('/fixed/a')
 def test_writable_parent_rejected(self):
  (self.root/'fixed').chmod(0o775)
  with self.assertRaisesRegex(b.Blocked,'root_parent_custody'):self.fs.create('/fixed/new',b'x')
  self.assertFalse(self.fs.exists('/fixed/new'))
 def test_parent_replacement_detected(self):
  with self.assertRaisesRegex(b.Blocked,'parent_replaced'):
   with self.fs.directory('/fixed'):
    (self.root/'fixed').rename(self.root/'held');(self.root/'fixed').mkdir(mode=0o700)
  self.assertTrue((self.root/'held').is_dir())
 def test_enospc_preserves_unknown_partial_file(self):
  import errno
  with patch.object(b.os,'write',side_effect=OSError(errno.ENOSPC,'fixture')):
   with self.assertRaises(OSError):self.fs.create('/fixed/new',b'x')
  self.assertTrue(self.fs.exists('/fixed/new'))
  with self.assertRaises(FileExistsError):self.fs.create('/fixed/new',b'x')
 def test_partial_writes_complete(self):
  original=b.os.write
  with patch.object(b.os,'write',side_effect=lambda fd,data:original(fd,data[:1])):self.fs.create('/fixed/file',b'abcdef')
  self.assertEqual(self.fs.read('/fixed/file')[0],b'abcdef')
 def test_directory_fsync_error_is_not_success(self):
  original=b.os.fsync
  def fail(fd):
   if __import__('stat').S_ISDIR(os.fstat(fd).st_mode):raise OSError('fixture_fsync')
   return original(fd)
  with patch.object(b.os,'fsync',side_effect=fail):
   with self.assertRaises(OSError):self.fs.create('/fixed/retained',b'public')
  self.assertTrue(self.fs.exists('/fixed/retained'))


class TransactionFixture:
 """Real file operations; platform/mount/systemd explicitly modelled, not qualified."""
 def __init__(self):
  self.base=EnrollmentFixture();self.root=self.base.root;self.fs=b.Files(self.root)
  (self.root/'run').mkdir(mode=0o755)
  for name in [self.base.receiptPath,self.base.prefix+'consumed-'+self.base.approval['approvalId']+'.json']:
   self.base.fs.path(name).unlink()
  old_policy=(HERE/'fixtures/pair-upgrade/policy-before.json').read_bytes().replace(b'fca92db4cda0d94d25f6b7afbe314cb9bac94fff024f619eb94a24a365330670',b'd69c667212b2a6c8a25081ccdc90f798024e850784262976e06e45ce13f45118')
  executor=''.join(json.loads((HERE/'fixtures/pair-upgrade/executor-after.json').read_text())).encode()
  assert len(executor)==59455 and b.digest(executor)==b.OLD_EXECUTOR and b.digest(old_policy)==b.OLD_POLICY
  self.files={name:(b'new fixture '+name.encode()) for name in b.TARGETS};self.files['policy.json']=p.canonical(self.base.policy)
  self.old={}
  for name,(target,mode) in b.TARGETS.items():
   self.fs.path(target).parent.mkdir(parents=True,exist_ok=True,mode=0o700)
   if name in ['pipeline-pnpm','aktau-sync-dependencies.service']:continue
   raw=executor if name=='publisher-promotion.py' else old_policy if name=='policy.json' else b'old fixture '+name.encode()
   self.fs.path(target).unlink(missing_ok=True);self.fs.create(target,raw,mode);self.old[target]=raw
  self.fs.path(p.INTERLOCK).parent.mkdir(parents=True,exist_ok=True,mode=0o700)
  # Remove only this test's known synthetic generation, never a live or
  # foreign resource. The actual bootstrap starts with an empty namespace.
  import shutil
  own=self.base.fs.path(p.BASE+'/capsules/'+self.base.receipt['generation'])
  for directory,dirs,files in os.walk(own):os.chmod(directory,0o700)
  shutil.rmtree(own)
  value=b'public synthetic OLD';inv=p.canonical({'version':1,'entries':[{'path':'package.json','type':'file','mode':0o444,'size':len(value),'sha256':p.digest(value)}]});out=io.BytesIO()
  with tarfile.open(fileobj=out,mode='w',format=tarfile.USTAR_FORMAT) as tar:
   for name,raw in [('inventory.json',inv),('blob/0',value)]:
    m=tarfile.TarInfo(name);m.mode=0o444;m.size=len(raw);tar.addfile(m,io.BytesIO(raw))
  self.files['old-runtime.tar']=out.getvalue()
  self.bundle=types.SimpleNamespace(approval=self.base.approval,approval_raw=p.canonical(self.base.approval),policy=self.base.policy,hash='b'*64,files=self.files,raw_inventory={})
  self.bundle.verify_source=lambda:None
  self.platform=ModelBootstrapPlatform(self)
 def engine(self,fault=lambda _:None):return b.Transaction(p,self.fs,self.bundle,self.platform,fault)
 def close(self):self.base.close()
class ModelBootstrapPlatform:
 def __init__(self,f):self.f=f;self.store_fs=f.base.fs
 def preflight(self,_):return {'fixture':True}
 def raw_input(self,*_,**kw):return None if kw.get('retain') is not None else 'a'*64
 def selection(self,*_):return p.canonical({'version':1,'contract':p.CONTRACT,'sourceSha':p.PIPELINE_OLD_SOURCE,'pipelineTreeSha1':p.PIPELINE_OLD_TREE,'inventorySha256':self.f.base.receipt['generation'],'descriptorSha256':'a'*64,'releaseIdentity':'fixture','provenanceKind':'legacy-installed-attested'})
 def enrollment(self,*_):return self.f.base.receipt
 def prepare_mount(self,*_):return {'mountId':1,'namespace':'mnt:[1]','rootIdentity':[1,2,3,4,5,6],'generation':self.f.base.receipt['generation'],'stage':p.BASE+'/mounts/pr86-baseline'}
 def attach_mount(self,*_):pass
 def attest(self,*_):
  value={'fixtureOnly':True};st=self.f.fs.create(p.PIPELINE_MOUNT_RECORD,b.canonical(value),0o444);return {'value':value,'identity':st}
 def reload(self):pass
 def verify(self,*_):pass
 def recovery_preflight(self,*_):pass
 def detach_bootstrap_mount(self,*_):pass
 def remove_bootstrap_records(self,_,j):
  if self.f.fs.exists(p.PIPELINE_MOUNT_RECORD):
   raw,st=self.f.fs.read(p.PIPELINE_MOUNT_RECORD,0o444);self.f.fs.remove(p.PIPELINE_MOUNT_RECORD,st,b.digest(raw))
  if self.f.fs.exists(p.PIPELINE_SELECTION):
   raw,st=self.f.fs.read(p.PIPELINE_SELECTION,0o644);self.f.fs.remove(p.PIPELINE_SELECTION,st,b.digest(raw))
 def verify_rolled_back(self,*_):
  for target,raw in self.f.old.items():assert self.f.fs.read(target)[0]==raw
class BootstrapTransactionModelTests(unittest.TestCase):
 def setUp(self):self.f=TransactionFixture()
 def tearDown(self):self.f.close()
 def test_filesystem_transaction_and_explicit_coupled_root_rollback(self):
  engine=self.f.engine();result=engine.apply(now=1793752200000)
  self.assertEqual(result,'PR86_BASELINE_ENROLLED_ROOT_PAIR_VERIFIED');self.assertFalse(self.f.fs.exists(p.INTERLOCK))
  receipt=b.parse(self.f.fs.read(engine.directory+'/receipt.json')[0]);self.assertEqual(receipt['phase'],'committed')
  self.assertEqual(engine.recover(receipt,deliberate=True),'PR86_BOOTSTRAP_ROLLED_BACK_INACTIVE_RESOURCES_RETAINED')
  self.assertFalse(self.f.fs.exists(p.INTERLOCK));self.assertTrue(self.f.fs.exists(engine.directory+'/rollback.json'))
 def test_injected_stop_before_live_replacement_preserves_root_files(self):
  before=self.f.fs.path(b.POLICY).read_bytes()
  with self.assertRaises(b.Blocked):
   self.f.engine(lambda phase: (_ for _ in ()).throw(b.Blocked('fixture_stop')) if phase=='backed_up' else None).apply(now=1793752200000)
  self.assertEqual(self.f.fs.path(b.POLICY).read_bytes(),before);self.assertTrue(self.f.fs.exists(p.INTERLOCK))


class BootstrapCrashModelTests(unittest.TestCase):
 def test_each_durable_post_backup_phase_rolls_back_model_platform(self):
  for phase in ['backed_up','raw_retaining','raw_retained','generation','staged','root_files','selection','enrolled','mount_prepared','mounted','reloaded','verified','committed']:
   with self.subTest(phase=phase):
    f=TransactionFixture()
    try:
     def crash(at):
      if at==phase:raise b.Blocked('fixture_crash')
     with self.assertRaisesRegex(b.Blocked,'fixture_crash'):f.engine(crash).apply(now=1793752200000)
     j=b.parse(f.fs.read(p.INTERLOCK)[0]);self.assertEqual(j['phase'],phase)
     self.assertEqual(f.engine().recover(j),'PR86_BOOTSTRAP_ROLLED_BACK_INACTIVE_RESOURCES_RETAINED')
     for target,raw in f.old.items():self.assertEqual(f.fs.read(target)[0],raw)
    finally:f.close()
 def test_real_sigkill_at_live_root_write_keeps_recoverable_journal(self):
  import signal
  f=TransactionFixture()
  try:
   pid=os.fork()
   if pid==0:
    try:
     f.engine(lambda phase:os.kill(os.getpid(),signal.SIGKILL) if phase=='root_files' else None).apply(now=1793752200000)
    finally:os._exit(97)
   _,status=os.waitpid(pid,0);self.assertTrue(os.WIFSIGNALED(status));self.assertEqual(os.WTERMSIG(status),signal.SIGKILL)
   j=b.parse(f.fs.read(p.INTERLOCK)[0]);self.assertEqual(j['phase'],'root_files')
   self.assertEqual(f.engine().recover(j),'PR86_BOOTSTRAP_ROLLED_BACK_INACTIVE_RESOURCES_RETAINED')
  finally:f.close()
 def test_unknown_target_or_backup_blocks_before_recovery_writes(self):
  for change in ['target','backup']:
   with self.subTest(change=change):
    f=TransactionFixture()
    try:
     with self.assertRaises(b.Blocked):f.engine(lambda phase:(_ for _ in ()).throw(b.Blocked('fixture_crash')) if phase=='root_files' else None).apply(now=1793752200000)
     raw=f.fs.read(p.INTERLOCK)[0];j=b.parse(raw);r=j['targets']['publisher-promotion.py']
     q=f.fs.path(r['target'] if change=='target' else r['backup']);data=q.read_bytes();mode=q.stat().st_mode&0o777
     q.rename(q.with_name('unknown-retained'));q.write_bytes(data if change=='target' else b'corrupt');q.chmod(mode)
     before={target:f.fs.path(target).read_bytes() for target in f.old}
     with self.assertRaises(b.Blocked):f.engine().recover(j)
     self.assertEqual(f.fs.read(p.INTERLOCK)[0],raw)
     self.assertEqual({target:f.fs.path(target).read_bytes() for target in f.old},before)
     self.assertTrue(q.with_name('unknown-retained').exists())
    finally:f.close()
 def test_pre_backup_crash_is_blocked_and_preserves_unknown_resources(self):
  f=TransactionFixture()
  try:
   with self.assertRaises(b.Blocked):f.engine(lambda phase:(_ for _ in ()).throw(b.Blocked('fixture_crash')) if phase=='directories' else None).apply(now=1793752200000)
   raw=f.fs.read(p.INTERLOCK)[0]
   with self.assertRaisesRegex(b.Blocked,'backup_not_registered'):f.engine().recover(b.parse(raw))
   self.assertEqual(f.fs.read(p.INTERLOCK)[0],raw)
   for target,data in f.old.items():self.assertEqual(f.fs.read(target)[0],data)
  finally:f.close()


class BootstrapPublicSourceTests(unittest.TestCase):
 def setUp(self):
  import base64,hashlib
  self.sha='e'*40;self.manifest={'sourceSha':self.sha,'ciRunId':123}
  self.files={name:(HERE.parent.parent/path).read_bytes() for name,path in {**b.SOURCE_PATHS,'pr86-root-bootstrap.py':'ops/c2/pr86-root-bootstrap.py'}.items()}
  producers={path:(HERE.parent.parent/path).read_bytes() for path in ['.github/workflows/sync-publisher-build.yml','scripts/ops/build-sync-promotion.py']}
  self.files['policy.json']=b.canonical({'producerFiles':{path:b.digest(raw) for path,raw in producers.items()}})
  ci={'head_sha':self.sha,'event':'push','head_branch':'main','repository':{'full_name':'kiratonine/AdilBaga'},'head_repository':{'full_name':'kiratonine/AdilBaga'},'path':'.github/workflows/ci.yml','conclusion':'success','status':'completed','run_attempt':1}
  names=['Frontend','Pipeline Quality','Nest Reference','Security','Go Quality','Contracts','PostgreSQL Integration','Ephemeral Staging','CI Gate']
  self.api={'git/ref/heads/main':{'object':{'sha':self.sha}},'actions/runs/123':ci,'actions/runs/123/jobs?per_page=100':{'jobs':[{'name':n,'status':'completed','conclusion':'success'} for n in names]}}
  for name,path in {**b.SOURCE_PATHS,'pr86-root-bootstrap.py':'ops/c2/pr86-root-bootstrap.py'}.items():
   raw=self.files[name];self.api['contents/'+path+'?ref='+self.sha]={'type':'file','encoding':'base64','content':base64.b64encode(raw).decode(),'sha':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()}
  for path,raw in producers.items():self.api['contents/'+path+'?ref='+self.sha]={'type':'file','encoding':'base64','content':base64.b64encode(raw).decode(),'sha':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()}
 def verify(self):return b.verify_public_source(self.manifest,self.files,lambda path:self.api[path])
 def test_exact_source_and_nine_jobs(self):self.assertEqual(self.verify(),(self.sha,123))
 def test_main_drift(self):
  self.api['git/ref/heads/main']['object']['sha']='f'*40
  with self.assertRaisesRegex(b.Blocked,'source_ci_identity'):self.verify()
 def test_ci_identity_mutations(self):
  original=copy.deepcopy(self.api['actions/runs/123'])
  for key,value in [('event','pull_request'),('head_branch','feature'),('head_sha','f'*40),('run_attempt',True),('conclusion','failure'),('path','other.yml'),('repository',{'full_name':'foreign/repo'})]:
   with self.subTest(key=key):
    self.api['actions/runs/123']={**original,key:value}
    with self.assertRaisesRegex(b.Blocked,'source_ci_identity'):self.verify()
 def test_missing_skipped_or_pending_jobs(self):
  key='actions/runs/123/jobs?per_page=100';original=copy.deepcopy(self.api[key]['jobs'])
  for mutation in ['missing','skipped','pending']:
   with self.subTest(mutation=mutation):
    self.api[key]['jobs']=copy.deepcopy(original)
    if mutation=='missing':self.api[key]['jobs'].pop()
    else:self.api[key]['jobs'][0]['conclusion']=mutation
    with self.assertRaisesRegex(b.Blocked,'source_ci_identity'):self.verify()
 def test_content_and_git_blob_identity(self):
  key='contents/ops/c2/pr86-root-bootstrap.py?ref='+self.sha
  self.api[key]['sha']='f'*40
  with self.assertRaisesRegex(b.Blocked,'source_digest'):self.verify()
 def test_producer_policy_pin(self):
  policy=b.parse(self.files['policy.json']);policy['producerFiles']['scripts/ops/build-sync-promotion.py']='f'*64;self.files['policy.json']=b.canonical(policy)
  with self.assertRaisesRegex(b.Blocked,'producer_pin'):self.verify()
 def test_unavailable_authority_never_yields_success(self):
  with self.assertRaises(OSError):b.verify_public_source(self.manifest,self.files,lambda _:(_ for _ in ()).throw(OSError('fixture_unavailable')))
class BootstrapImportBoundaryTests(unittest.TestCase):
 def test_source_authority_failure_occurs_before_runtime_exec(self):
  f=EnrollmentFixture()
  try:
   fs=b.Files(f.root);files={name:b'public fixture' for name in b.INPUT_FILES};files['policy.json']=b.canonical(f.policy);files['pr86-root-bootstrap.py']=(HERE/'pr86-root-bootstrap.py').read_bytes()
   manifest={'version':1,'contract':b.CONTRACT,'sourceSha':'e'*40,'ciRunId':123,'files':{name:b.digest(raw) for name,raw in files.items()}}
   approval={**f.approval,'reviewedRootBundleSha256':b.digest(b.canonical(manifest))}
   fs.path(b.INPUT).mkdir(mode=0o700);fs.create(b.INPUT+'/bundle.json',b.canonical(manifest),0o400)
   for name,raw in files.items():fs.create(b.INPUT+'/'+name,raw,0o400)
   fs.path(b.SELF).parent.mkdir(parents=True,exist_ok=True,mode=0o700);fs.create(b.SELF,files['pr86-root-bootstrap.py'],0o755)
   fs.path(b.APPROVAL).unlink();fs.create(b.APPROVAL,b.canonical(approval),0o600)
   with patch.object(b.time,'time_ns',return_value=1793752200000000000),patch.object(b,'verify_public_source',side_effect=b.Blocked('fixture_source_unavailable')) as check,patch('builtins.exec',side_effect=AssertionError('unapproved_runtime_executed')) as execute:
    with self.assertRaisesRegex(b.Blocked,'fixture_source_unavailable'):b.load_fixed_bundle(fs)
    check.assert_called_once();execute.assert_not_called()
  finally:f.close()


class BootstrapUnderlyingRollbackTests(unittest.TestCase):
 def test_real_verifier_rejects_underlying_drift_before_rollback_success(self):
  f=TransactionFixture()
  try:
   platform=object.__new__(b.Platform);platform.fs=f.fs;platform.lineage=lambda _:None
   platform.mounts=types.SimpleNamespace(inspect=lambda:{'state':'absent'})
   platform.raw_input=__import__('unittest.mock',fromlist=['Mock']).Mock(side_effect=b.Blocked('raw_file_changed'))
   snapshot={'snapshot':{'invariants':{}}}
   with self.assertRaisesRegex(b.Blocked,'raw_file_changed'):platform.verify_rolled_back(f.bundle,snapshot)
   platform.raw_input.assert_called_once_with(f.bundle.raw_inventory,retain=None)
  finally:f.close()


class BootstrapUnderlyingDetachTests(unittest.TestCase):
 def test_detach_checks_actual_bytes_before_caller_can_restore_root_pair(self):
  platform=object.__new__(b.Platform);expected=[1,2,3,4,5,6]
  platform.fs=types.SimpleNamespace(exists=lambda _:False)
  platform.mounts=types.SimpleNamespace(inspect=lambda:{'state':'absent'},underlying_identity=lambda:expected)
  platform.raw_input=__import__('unittest.mock',fromlist=['Mock']).Mock(side_effect=b.Blocked('raw_file_changed'))
  bundle=types.SimpleNamespace(raw_inventory={'fixture':True})
  with self.assertRaisesRegex(b.Blocked,'raw_file_changed'):platform.detach_bootstrap_mount(bundle,{'snapshot':{'underlyingTargetIdentity':expected}})
  platform.raw_input.assert_called_once_with(bundle.raw_inventory,retain=None)
 def test_stable_actual_bytes_positive_control(self):
  platform=object.__new__(b.Platform);expected=[1,2,3,4,5,6]
  platform.fs=types.SimpleNamespace(exists=lambda _:False)
  platform.mounts=types.SimpleNamespace(inspect=lambda:{'state':'absent'},underlying_identity=lambda:expected)
  platform.raw_input=__import__('unittest.mock',fromlist=['Mock']).Mock(return_value='a'*64)
  bundle=types.SimpleNamespace(raw_inventory={'fixture':True})
  platform.detach_bootstrap_mount(bundle,{'snapshot':{'underlyingTargetIdentity':expected}})
  platform.raw_input.assert_called_once_with(bundle.raw_inventory,retain=None)


class BootstrapIdleAdmissionTests(unittest.TestCase):
 def test_real_preflight_rejects_actor_before_snapshot_or_mutation(self):
  from unittest.mock import Mock
  f=TransactionFixture()
  try:
   platform=object.__new__(b.Platform);platform.p=p;platform.fs=f.fs
   platform.host=types.SimpleNamespace(runtime_wiring=Mock(),idle=Mock(side_effect=p.Blocked('active_runtime')))
   with self.assertRaisesRegex(p.Blocked,'active_runtime'):platform.preflight(f.bundle)
   platform.host.idle.assert_called_once_with()
   self.assertFalse(f.fs.exists(p.INTERLOCK))
  finally:f.close()


class BootstrapOrphanAdmissionTests(unittest.TestCase):
 def test_foreign_root_stage_rejected_before_approval_consumed(self):
  f=TransactionFixture()
  try:
   target=b.TARGETS['publisher-promotion.py'][0];stage=str(Path(target).parent/('.pr86-'+f.bundle.approval['approvalId']+'-'+Path(target).name))
   f.fs.create(stage,b'foreign marker',0o600)
   with self.assertRaisesRegex(b.Blocked,'unknown_bootstrap_state'):f.engine().verify(now=1793752200000)
   self.assertEqual(f.fs.read(stage)[0],b'foreign marker')
   self.assertFalse(f.fs.exists(b.BASE+'/state/pr86-baseline-consumed-'+f.bundle.approval['approvalId']+'.json'))
  finally:f.close()
 def test_foreign_mount_stage_rejected_before_approval_consumed(self):
  f=TransactionFixture()
  try:
   f.fs.path(b.BASE+'/mounts').mkdir(mode=0o700);f.fs.mkdir(b.BASE+'/mounts/pr86-baseline')
   with self.assertRaisesRegex(b.Blocked,'unknown_bootstrap_state'):f.engine().verify(now=1793752200000)
   self.assertTrue(f.fs.exists(b.BASE+'/mounts/pr86-baseline'));self.assertFalse(f.fs.exists(p.INTERLOCK))
  finally:f.close()


class BootstrapPackageMetadataTests(unittest.TestCase):
 def test_pretty_npm_json_is_authenticated_data_not_transport_json(self):
  self.assertEqual(b.old_runtime_package(b'{\n  "name": "zod",\n  "version": "3.25.76"\n}\n','zod','3.25.76')['version'],'3.25.76')
 def test_duplicate_metadata_fields_rejected(self):
  with self.assertRaises(b.Blocked):b.old_runtime_package(b'{"name":"zod","name":"zod","version":"3.25.76"}','zod','3.25.76')
 def test_non_utf8_malformed_and_oversized_metadata_rejected(self):
  for raw in [b'\xff',b'{broken',b' '*65537,'{"name":"zod","version":"3.25.76"}'.encode('utf-16')]:
   with self.subTest(length=len(raw)),self.assertRaises(b.Blocked):b.old_runtime_package(raw,'zod','3.25.76')
 def test_wrong_metadata_role_or_version_rejected(self):
  for name,version in [('zod','4.0.0'),('foreign','3.25.76')]:
   with self.subTest(name=name),self.assertRaises(b.Blocked):b.old_runtime_package(json.dumps({'name':name,'version':version}).encode(),'zod','3.25.76')
if __name__=='__main__':unittest.main()


class BootstrapMountRecoveryIdentityTests(unittest.TestCase):
 def test_same_generation_foreign_mount_is_not_detached(self):
  from unittest.mock import Mock
  platform=b.Platform.__new__(b.Platform);platform.p=p;platform.fs=types.SimpleNamespace(exists=lambda _:False)
  observed={'state':'mounted','mountId':99,'namespace':11,'rootIdentity':[1,2,3,4,5,6],'generation':'a'*64}
  platform.mounts=types.SimpleNamespace(inspect=lambda:observed,_unmount=Mock(),underlying_identity=lambda:[])
  bundle=types.SimpleNamespace(approval={'oldRuntimeInventorySha256':'a'*64},raw_inventory={})
  journal={'mount':{'mountId':88,'namespace':11,'rootIdentity':[1,2,3,4,5,6],'generation':'a'*64,'stage':p.BASE+'/mounts/pr86-baseline'},'snapshot':{'underlyingTargetIdentity':[]}}
  platform.raw_input=Mock()
  with self.assertRaisesRegex(b.Blocked,'unknown_bootstrap_mount'):platform.detach_bootstrap_mount(bundle,journal)
  platform.mounts._unmount.assert_not_called();platform.raw_input.assert_not_called()


class BootstrapPartialRawRecoveryTests(unittest.TestCase):
 def test_unregistered_partial_raw_capture_preserves_interlock_and_root(self):
  f=TransactionFixture()
  try:
   def stop(phase):
    if phase=='root_files':raise b.Blocked('fixture_stop')
   with self.assertRaisesRegex(b.Blocked,'fixture_stop'):f.engine(stop).apply(now=1793752200000)
   raw_path=f.engine().directory+'/raw';f.fs.mkdir(raw_path);f.fs.create(raw_path+'/foreign',b'preserve',0o400)
   journal=f.fs.read(p.INTERLOCK)[0];root_before=f.fs.read(b.ROOT+'/publisher-promotion.py',0o755)[0]
   with self.assertRaisesRegex(b.Blocked,'unknown_raw_capture'):f.engine().recover(b.parse(journal))
   self.assertEqual(f.fs.read(p.INTERLOCK)[0],journal);self.assertEqual(f.fs.read(b.ROOT+'/publisher-promotion.py',0o755)[0],root_before)
   self.assertEqual(f.fs.read(raw_path+'/foreign',0o400)[0],b'preserve')
  finally:f.close()

class BootstrapCommittedForeignRecoveryTests(unittest.TestCase):
 def test_deliberate_unknown_target_installs_interlock_before_reconciliation(self):
  f=TransactionFixture()
  try:
   engine=f.engine();engine.apply(now=1793752200000);receipt=b.parse(f.fs.read(engine.directory+'/receipt.json')[0])
   target=b.ROOT+'/publisher-promotion.py';original=f.fs.path(target);raw=original.read_bytes();original.rename(original.with_name('retained-foreign-test'));f.fs.create(target,raw,0o755)
   with self.assertRaisesRegex(b.Blocked,'foreign_target_inode'):f.engine().recover(receipt,deliberate=True)
   self.assertTrue(f.fs.exists(p.INTERLOCK));self.assertEqual(f.fs.read(target,0o755)[0],raw)
  finally:f.close()

class BootstrapUnknownControlRecordTests(unittest.TestCase):
 def test_unknown_attestation_is_rejected_before_detach(self):
  from unittest.mock import Mock
  f=TransactionFixture()
  try:
   engine=f.engine();engine.apply(now=1793752200000);receipt=b.parse(f.fs.read(engine.directory+'/receipt.json')[0])
   if f.fs.exists(p.PIPELINE_MOUNT_RECORD):
    old,st=f.fs.read(p.PIPELINE_MOUNT_RECORD,0o444);f.fs.remove(p.PIPELINE_MOUNT_RECORD,st,b.digest(old))
   f.fs.create(p.PIPELINE_MOUNT_RECORD,b.canonical({'foreign':True}),0o444)
   detach=Mock();f.platform.detach_bootstrap_mount=detach
   with self.assertRaises(b.Blocked):f.engine().recover(receipt,deliberate=True)
   detach.assert_not_called();self.assertTrue(f.fs.exists(p.INTERLOCK));self.assertEqual(f.fs.read(p.PIPELINE_MOUNT_RECORD,0o444)[0],b.canonical({'foreign':True}))
  finally:f.close()

class EnrolledUnderlyingInputTests(unittest.TestCase):
 def setUp(self):
  self.f=EnrollmentFixture();f=self.f;target=f.target/'package.json';target.write_bytes(b'{"public":"old"}\n');target.chmod(0o664)
  self.row=['package.json',list(p.stamp(os.lstat(target))),p.digest(target.read_bytes())]
  raw=p.canonical({'version':1,'kind':'legacy-input-observed-not-authorized','sourceSha':p.PIPELINE_OLD_SOURCE,'pipelineTreeSha1':p.PIPELINE_OLD_TREE,'rootIdentity':list(p.stamp(os.lstat(f.target))),'entries':[self.row]})
  path=p.BASE+'/pr86-bootstrap-input/old-input-inventory.json';f.fs.path(path).parent.mkdir(mode=0o700);f.fs.write(path,raw,0o400)
  f.policy['pipelineContract']['baselineInputInventorySha256']=p.digest(raw);f.fs.write(p.POLICY,p.canonical(f.policy),0o644,replace=True)
  f.approval['legacyInputInventorySha256']=p.digest(raw);f.approval['newPolicySha256']=p.digest(p.canonical(f.policy));f.fs.write(f.approvalPath,p.canonical(f.approval),replace=True)
  ah=p.digest(p.canonical(f.approval));f.fs.write(f.prefix+'consumed-'+f.approval['approvalId']+'.json',p.canonical({'version':1,'approvalSha256':ah,'usedAt':1793752200000}),replace=True)
  f.receipt.update(approvalSha256=ah,policySha256=f.approval['newPolicySha256']);f.fs.write(f.receiptPath,p.canonical(f.receipt),replace=True)
 def tearDown(self):self.f.close()
 def inputs(self,sha=None,root=None):return p._enrolled_underlying_inputs(p,self.f.fs,{'sourceSha':sha or p.PIPELINE_OLD_SOURCE,'pipelineTreeSha1':p.PIPELINE_OLD_TREE,'inventorySha256':self.f.receipt['generation']},root or self.f.receipt['underlyingTargetIdentity'])
 def test_exact_consumed_old_inputs_are_bound(self):self.assertEqual(self.inputs(),{'package.json':self.row})
 def test_invalid_source_identity_has_no_exception(self):self.assertEqual(self.inputs(sha='invalid'),{})
 def test_exact_new_tree_can_read_unchanged_bound_old_files(self):
  self.assertEqual(p._enrolled_underlying_inputs(p,self.f.fs,{'sourceSha':'e'*40,'pipelineTreeSha1':p.PIPELINE_NEW_TREE,'inventorySha256':'b'*64},self.f.receipt['underlyingTargetIdentity']),{'package.json':self.row})
 def test_other_pipeline_tree_has_no_exception(self):
  self.assertEqual(p._enrolled_underlying_inputs(p,self.f.fs,{'sourceSha':'e'*40,'pipelineTreeSha1':'e'*40,'inventorySha256':'b'*64},self.f.receipt['underlyingTargetIdentity']),{})
 def test_foreign_underlying_root_has_no_exception(self):
  root=self.f.receipt['underlyingTargetIdentity'].copy();root[1]+=1;self.assertEqual(self.inputs(root=root),{})
 def test_missing_consumption_has_no_exception(self):
  self.f.fs.path(self.f.prefix+'consumed-'+self.f.approval['approvalId']+'.json').unlink();self.assertEqual(self.inputs(),{})
 def test_modified_raw_bytes_have_no_exception(self):
  path=p.BASE+'/pr86-bootstrap-input/old-input-inventory.json';self.f.fs.write(path,b'{}\n',0o400,replace=True);self.assertEqual(self.inputs(),{})
 def test_missing_root_input_has_no_exception(self):
  self.f.fs.path(p.BASE+'/pr86-bootstrap-input/old-input-inventory.json').unlink();self.assertEqual(self.inputs(),{})

 def test_unbound_selected_generation_has_no_exception(self):
  self.assertEqual(p._enrolled_underlying_inputs(p,self.f.fs,{'sourceSha':p.PIPELINE_OLD_SOURCE,'pipelineTreeSha1':p.PIPELINE_OLD_TREE,'inventorySha256':'b'*64},self.f.receipt['underlyingTargetIdentity']),{})

class BootstrapEnrollmentRecordRecoveryTests(unittest.TestCase):
 def test_foreign_enrollment_inode_blocks_before_detach(self):
  from unittest.mock import Mock
  f=TransactionFixture()
  try:
   engine=f.engine();engine.apply(now=1793752200000);receipt=b.parse(f.fs.read(engine.directory+'/receipt.json')[0]);path=b.BASE+'/state/pr86-baseline-enrolled-'+engine.id+'.json'
   original=f.fs.path(path);raw=original.read_bytes();original.rename(original.with_name('retained-enrollment-test'));f.fs.create(path,raw)
   detach=Mock();f.platform.detach_bootstrap_mount=detach
   with self.assertRaisesRegex(b.Blocked,'changed_bootstrap_enrollment'):f.engine().recover(receipt,deliberate=True)
   detach.assert_not_called();self.assertTrue(f.fs.exists(p.INTERLOCK));self.assertEqual(f.fs.read(path)[0],raw)
  finally:f.close()

class BootstrapRecoveryIdleTests(unittest.TestCase):
 def test_unknown_active_actor_blocks_before_any_recovery_mutation(self):
  from unittest.mock import Mock
  platform=b.Platform.__new__(b.Platform);platform.p=p;platform.fs=types.SimpleNamespace(exists=lambda _:False)
  platform.store_fs=types.SimpleNamespace(read=lambda *a:p.canonical({'identity':'legacy'}));platform.host=types.SimpleNamespace(idle=Mock(side_effect=b.Blocked('fixture_actor_active')),publisher=lambda:{'sha':b.OLD_SOURCE})
  platform.lineage=Mock();bundle=types.SimpleNamespace(approval={'oldRuntimeInventorySha256':'a'*64});journal={'snapshot':{'legacyReleaseIdentity':'legacy','invariants':{}},'mountStageIdentity':None}
  with self.assertRaisesRegex(b.Blocked,'fixture_actor_active'):platform.recovery_preflight(bundle,journal)
  platform.host.idle.assert_called_once();platform.lineage.assert_not_called()

class BootstrapPinnedFdCleanupTests(unittest.TestCase):
 def test_failed_read_write_and_parent_cas_close_all_pins_preserve_files(self):
  import errno
  with tempfile.TemporaryDirectory(prefix='bootstrap-owned-fd-') as tmp:
   root=Path(tmp);root.chmod(0o700);fs=b.Files(root);(root/'fixed').mkdir(mode=0o700);fs.create('/fixed/original',b'public original')
   before=set(os.listdir('/proc/self/fd'));(root/'fixed/link').symlink_to('original')
   with self.assertRaises(OSError):fs.read('/fixed/link')
   self.assertEqual(set(os.listdir('/proc/self/fd')),before);self.assertEqual(fs.read('/fixed/original')[0],b'public original')
   with patch.object(b.os,'write',side_effect=OSError(errno.EIO,'fixture_write_eio')):
    with self.assertRaises(OSError):fs.create('/fixed/partial',b'public')
   self.assertEqual(set(os.listdir('/proc/self/fd')),before);self.assertTrue(fs.exists('/fixed/partial'))
   with self.assertRaisesRegex(b.Blocked,'parent_replaced'):
    with fs.directory('/fixed'):
     (root/'fixed').rename(root/'held');(root/'fixed').mkdir(mode=0o700)
   self.assertEqual(set(os.listdir('/proc/self/fd')),before);self.assertEqual((root/'held/original').read_bytes(),b'public original')
