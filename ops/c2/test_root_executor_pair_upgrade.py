"""Real filesystem pair transaction regressions; business/GitHub authority is modeled."""
import contextlib
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import stat
import struct
import subprocess
import time
import types
import tempfile
import unittest
from unittest.mock import patch

HERE=Path(__file__).parent
sp=importlib.util.spec_from_file_location('pair_promotion',HERE/'publisher-promotion.py')
promotion=importlib.util.module_from_spec(sp);sp.loader.exec_module(promotion)
SOURCE='8cff133be30a8c31f4d5e06d297dcf9af5e97847'
EXEC='/usr/local/libexec/aktau-sync-promotion/publisher-promotion.py'
POLICY='/etc/aktau-sync-promotion/policy.json'
OLD='fca92db4cda0d94d25f6b7afbe314cb9bac94fff024f619eb94a24a365330670'
NEW='d69c667212b2a6c8a25081ccdc90f798024e850784262976e06e45ce13f45118'


def digest(b):return hashlib.sha256(b).hexdigest()
def old_source():
    """Strict public reverse patch + fixed digest; no Git/network in root sandbox."""
    original=(HERE/'publisher-promotion.py').read_text().splitlines(keepends=True)
    lines=json.loads((HERE/'fixtures/pair-upgrade/executor-before.json').read_text())
    result=[];index=0;at=0
    while at<len(lines):
        if not lines[at].startswith('@@ '):at+=1;continue
        first=int(re.match(r'@@ -(\d+)',lines[at])[1])-1
        result+=original[index:first];index=first;at+=1
        while at<len(lines) and not lines[at].startswith('@@ '):
            line=lines[at];at+=1
            if line[:1] in [' ','-']:
                assert original[index]==line[1:];index+=1
            if line[:1] in [' ','+']:result.append(line[1:])
    result+=original[index:];raw=''.join(result).encode();assert digest(raw)==OLD and len(raw)==56173
    return raw


_CACHED=None
def module():
    global _CACHED
    if _CACHED is not None:return _CACHED
    path=HERE/'root-executor-pair-upgrade.py'
    if not path.exists():return None
    spec=importlib.util.spec_from_file_location('pair_upgrade',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);_CACHED=m;return m


class Fixture:
    def __init__(self):
        self.temp=tempfile.TemporaryDirectory(prefix='pair-upgrade-');self.root=Path(self.temp.name);self.root.chmod(0o700)
        self.fs=promotion.Filesystem(self.root);self.new=(HERE/'publisher-promotion.py').read_bytes();assert digest(self.new)==NEW
        self.old=old_source();self.policy=(HERE/'fixtures/pair-upgrade/policy-before.json').read_bytes()
        self.write(EXEC,self.old,0o755);self.write(POLICY,self.policy,0o644)
        self.m=module()
        if self.m:
            for path,mode in self.m.LOCKS:self.write(path,b'',mode)
            self.fs.path('/var/backups').mkdir(parents=True)
        self.busy=False;self.fail_post=False
        self.protected=[]
        for i in range(12):
            path='/fixture/closure/file'+str(i);self.write(path,('immutable'+str(i)).encode(),0o444);self.protected.append(path)
        for stage in ['committed','rolled_back']:
            for i in range(14):
                path='/fixture/releases/'+stage+'/backup/'+str(i);self.write(path,('backup'+str(i)).encode(),0o600);self.protected.append(path)
        self.write('/fixture/reader.dsn',b'NOT_A_REAL_DSN',0o600)
        self.write('/fixture/ledger.json',b'[]\n',0o600)
    def write(self,path,raw,mode):
        p=self.fs.path(path);p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw);p.chmod(mode)
    def close(self):self.temp.cleanup()
    def pair(self):return tuple(digest(self.fs.path(p).read_bytes()) for p in [EXEC,POLICY])
    def unsafe_apply(self):
        # Existing single-file primitive, NOT an invented missing-function failure.
        self.fs.write(EXEC,self.new,0o755,replace=True)
        os.kill(os.getpid(),signal.SIGKILL)
    def engine(self,fault=None):
        m=module();f=self
        class Checks:
            validate_policy=staticmethod(promotion.validate_policy)
            def snapshot(self,policy):
                if f.busy:raise m.Blocked('active_runtime')
                static={}
                for path in f.protected:
                    st=os.lstat(f.fs.path(path));static[path]=[list(promotion.stamp(st)),digest(f.fs.path(path).read_bytes())]
                static['reader']=list(promotion.stamp(os.lstat(f.fs.path('/fixture/reader.dsn'))))
                raw=f.fs.path('/fixture/ledger.json').read_bytes()
                entries=json.loads(raw);st=list(promotion.stamp(os.lstat(f.fs.path('/fixture/ledger.json'))))
                return {'stable':static,'ledger':{'stamp':st,'sha256':digest(raw),'entries':[digest(m.canonical(v)) for v in entries]}}
        return m.Upgrade(m.Filesystem(self.root),Checks(),lambda:self.new,fault)


class PairTests(unittest.TestCase):
    def setUp(self):self.f=Fixture();self.addCleanup(self.f.close)
    def test_sigkill_between_two_renames_recovers_original_pair(self):
        baseline=self.f.pair();implementation=module()
        child=os.fork()
        if child==0:
            try:
                if implementation is None:self.f.unsafe_apply()
                else:self.f.engine(lambda stage:os.kill(os.getpid(),signal.SIGKILL) if stage=='executor_renamed' else None).run('apply')
            finally:os._exit(93)
        _,status=os.waitpid(child,0);self.assertEqual(os.WTERMSIG(status),signal.SIGKILL)
        self.assertNotEqual(self.f.pair(),baseline,'real rename must have happened')
        if implementation is not None:self.f.engine().run('recover')
        self.assertEqual(self.f.pair(),baseline,'legacy two independent writes leave an unrecoverable mixed pair')

    def test_verify_apply_receipt_rollback_and_no_second_apply(self):
        m=module();baseline=self.f.pair();g=self.f.engine();state=g.checks.snapshot({})
        self.assertEqual(g.run('verify'),'ROOT_EXECUTOR_PAIR_UPGRADE_READY')
        self.assertFalse(self.f.fs.path(m.JOURNAL).exists())
        self.assertEqual(self.f.engine().run('apply'),'ROOT_EXECUTOR_PAIR_VERIFIED')
        self.assertEqual(self.f.pair(),(m.NEW,m.NEW_POLICY))
        self.assertEqual(self.f.engine().run('verify'),'ROOT_EXECUTOR_PAIR_VERIFIED')
        self.assertEqual(self.f.engine().checks.snapshot({}),state)
        old=json.loads(self.f.policy);new=json.loads(self.f.fs.path(POLICY).read_bytes())
        old['producerFiles']['ops/c2/publisher-promotion.py']=m.NEW;old['runtimeFiles'][EXEC]=m.NEW
        self.assertEqual(old,new);self.assertEqual(new['producerFiles'][promotion.BUILD_WORKFLOW],m.WORKFLOW)
        for path,mode in [(EXEC,0o755),(POLICY,0o644),(m.BACKUP,0o700),(m.JOURNAL,0o600)]:
            self.assertEqual(stat.S_IMODE(os.lstat(self.f.fs.path(path)).st_mode),mode)
        self.assertEqual(self.f.fs.path(m.BACKUP+'/executor.old').read_bytes(),self.f.old)
        self.assertEqual(self.f.fs.path(m.BACKUP+'/policy.old').read_bytes(),self.f.policy)
        with self.assertRaises(m.Blocked):self.f.engine().run('apply')
        self.assertEqual(self.f.engine().run('rollback'),'ROOT_EXECUTOR_PAIR_ROLLED_BACK')
        self.assertEqual(self.f.pair(),baseline);self.assertEqual(self.f.engine().checks.snapshot({}),state)
        with self.assertRaises(m.Blocked):self.f.engine().run('apply')
        self.assertEqual(self.f.engine().run('recover'),'ROOT_EXECUTOR_PAIR_ROLLED_BACK')

    def test_all_durable_crash_points_and_both_rename_gaps(self):
        events=['intent','backup_directory','backup_executor','backup_policy','backup_complete',
                'stage_executor','stage_policy','prepared','executor_renamed','executor_replaced',
                'policy_renamed','pair_replaced','receipt','verified']
        for event in events:
            with self.subTest(event=event):
                f=Fixture()
                try:
                    baseline=f.pair();state=f.engine().checks.snapshot({});pid=os.fork()
                    if pid==0:
                        try:f.engine(lambda at:os.kill(os.getpid(),signal.SIGKILL) if at==event else None).run('apply')
                        finally:os._exit(94)
                    _,status=os.waitpid(pid,0);self.assertTrue(os.WIFSIGNALED(status));self.assertEqual(os.WTERMSIG(status),signal.SIGKILL)
                    result=f.engine().run('recover')
                    self.assertEqual(result,'ROOT_EXECUTOR_PAIR_VERIFIED' if event=='verified' else 'ROOT_EXECUTOR_PAIR_ROLLED_BACK')
                    self.assertEqual(f.pair(),(module().NEW,module().NEW_POLICY) if event=='verified' else baseline)
                    self.assertEqual(f.engine().checks.snapshot({}),state)
                finally:f.close()

    def test_crash_during_explicit_rollback_recovers(self):
        for event in ['restore_executor','restore_policy','rollback_policy_renamed','rollback_policy_replaced',
                      'rollback_executor_renamed','rollback_executor_replaced','rolled_back']:
            with self.subTest(event=event):
                f=Fixture()
                try:
                    old=f.pair();f.engine().run('apply');pid=os.fork()
                    if pid==0:
                        try:f.engine(lambda at:os.kill(os.getpid(),signal.SIGKILL) if at==event else None).run('rollback')
                        finally:os._exit(94)
                    _,status=os.waitpid(pid,0);self.assertTrue(os.WIFSIGNALED(status));self.assertEqual(os.WTERMSIG(status),signal.SIGKILL)
                    self.assertEqual(f.engine().run('recover'),'ROOT_EXECUTOR_PAIR_ROLLED_BACK');self.assertEqual(f.pair(),old)
                finally:f.close()

    def test_unregistered_resource_crash_blocks_and_preserves(self):
        for event in ['backup_executor_unregistered','backup_policy_unregistered','stage_executor_unregistered','stage_policy_unregistered','receipt_unregistered']:
            with self.subTest(event=event):
                f=Fixture()
                try:
                    pid=os.fork()
                    if pid==0:
                        try:f.engine(lambda at:os.kill(os.getpid(),signal.SIGKILL) if at==event else None).run('apply')
                        finally:os._exit(94)
                    os.waitpid(pid,0);before=f.pair();journal=f.fs.path(module().JOURNAL).read_bytes()
                    with self.assertRaises(module().Blocked):f.engine().run('recover')
                    self.assertEqual(f.pair(),before);self.assertEqual(f.fs.path(module().JOURNAL).read_bytes(),journal)
                finally:f.close()

    def test_source_digest_length_and_old_state_reject_before_journal(self):
        m=module()
        for raw in [self.f.new[:-1],self.f.new+b'x',b'x'*len(self.f.new)]:
            g=self.f.engine();g.source=lambda:raw
            with self.assertRaises(m.Blocked):g.run('apply')
            self.assertFalse(self.f.fs.path(m.JOURNAL).exists())
        self.f.fs.path(EXEC).write_bytes(b'x'*len(self.f.old))
        with self.assertRaises(m.Blocked):self.f.engine().run('apply')
        self.assertFalse(self.f.fs.path(m.JOURNAL).exists())

    def test_third_policy_field_is_not_accepted(self):
        m=module();value=json.loads(self.f.policy);value['enabled']=False
        with self.assertRaises(m.Blocked):m.candidate(m.canonical(value),promotion.validate_policy)
        value=json.loads(self.f.policy);value['unexpected']='third-field'
        with self.assertRaises(m.Blocked):m.candidate(m.canonical(value),promotion.validate_policy)

    def test_stale_inode_at_prepared_rejects_before_live_replacement(self):
        baseline=self.f.pair();m=module()
        def swap(at):
            if at=='prepared':
                path=self.f.fs.path(POLICY);other=path.with_name('replacement');other.write_bytes(path.read_bytes());other.chmod(0o644);os.replace(other,path)
        with self.assertRaises(m.Blocked):self.f.engine(swap).run('apply')
        self.assertEqual(self.f.pair(),baseline)
        with self.assertRaises(m.Blocked):self.f.engine().run('recover')

    def test_symlink_hardlink_and_wrong_mode_reject(self):
        for mutation in ['symlink','hardlink','mode']:
            with self.subTest(mutation=mutation):
                f=Fixture()
                try:
                    path=f.fs.path(POLICY)
                    if mutation=='symlink':path.rename(path.with_name('outside'));path.symlink_to(path.with_name('outside'))
                    if mutation=='hardlink':os.link(path,path.with_name('alias'))
                    if mutation=='mode':path.chmod(0o664)
                    with self.assertRaises((module().Blocked,OSError)):f.engine().run('apply')
                    self.assertFalse(f.fs.path(module().JOURNAL).exists())
                finally:f.close()

    def test_writable_ancestor_and_directory_swap_reject(self):
        m=module();parent=self.f.fs.path(POLICY).parent;parent.chmod(0o777)
        with self.assertRaises(m.Blocked):self.f.engine().run('apply')
        parent.chmod(0o755)
        g=self.f.engine()
        with self.assertRaises(m.Blocked):
            with g.fs.directory(str(Path(POLICY).parent)):
                moved=parent.with_name('old-parent');parent.rename(moved);parent.mkdir();parent.chmod(0o755)

    def test_file_xattr_and_posix_acl_surprise(self):
        for attr in ['user.pair-test','system.posix_acl_access']:
            with self.subTest(attr=attr):
                f=Fixture()
                try:
                    value=b'unexpected'
                    if attr.startswith('system.'):
                        value=struct.pack('<I',2)+b''.join(struct.pack('<HHI',tag,perm,uid) for tag,perm,uid in [(1,7,0xffffffff),(2,4,1999),(4,5,0xffffffff),(16,5,0xffffffff),(32,5,0xffffffff)])
                    os.setxattr(f.fs.path(EXEC),attr,value)
                    with self.assertRaises(module().Blocked):f.engine().run('apply')
                    self.assertFalse(f.fs.path(module().JOURNAL).exists())
                finally:f.close()

    def test_all_three_existing_locks_contend_and_close(self):
        for path,_ in module().LOCKS:
            fd=os.open(self.f.fs.path(path),os.O_RDONLY)
            try:
                fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
                with self.assertRaises(BlockingIOError):self.f.engine().run('apply')
                self.assertFalse(self.f.fs.path(module().JOURNAL).exists())
            finally:os.close(fd)
        self.f.busy=True
        with self.assertRaises(module().Blocked):self.f.engine().run('apply')
        self.assertFalse(self.f.fs.path(module().JOURNAL).exists())

    def test_orphan_backup_and_unknown_temp_block_new_install(self):
        for kind in ['backup','temp','journal_pending']:
            f=Fixture()
            try:
                m=module()
                if kind=='backup':f.fs.path(m.BACKUP).mkdir(mode=0o700)
                elif kind=='temp':f.write(str(Path(POLICY).parent/'.policy.json.pair-unknown.pending'),b'foreign',0o600)
                else:f.write(m.PENDING,b'foreign',0o600)
                baseline=f.pair()
                with self.assertRaises(m.Blocked):f.engine().run('apply')
                self.assertEqual(f.pair(),baseline);self.assertFalse(f.fs.path(m.JOURNAL).exists())
            finally:f.close()

    def stopped(self,event='prepared'):
        def stop(at):
            if at==event:raise module().Blocked('test_stop')
        with self.assertRaises(module().Blocked):self.f.engine(stop).run('apply')

    def test_missing_tampered_backups_and_corrupt_journal_preserved(self):
        for mutation in ['missing','tamper','journal','extra-key','unknown-phase','unknown-backup']:
            f=Fixture()
            try:
                def stop(at):
                    if at=='executor_replaced':raise module().Blocked('stop')
                with self.assertRaises(module().Blocked):f.engine(stop).run('apply')
                m=module();path=f.fs.path(m.BACKUP+'/policy.old')
                if mutation=='missing':path.unlink()
                if mutation=='tamper':path.write_bytes(b'tampered')
                if mutation=='unknown-backup':f.write(m.BACKUP+'/foreign',b'foreign',0o600)
                journal=f.fs.path(m.JOURNAL)
                if mutation=='journal':journal.write_bytes(b'{broken')
                if mutation in ['extra-key','unknown-phase']:
                    j=json.loads(journal.read_bytes())
                    if mutation=='extra-key':j['extra']=True
                    else:j['phase']='guess_and_continue'
                    journal.write_bytes(m.canonical(j))
                before=f.pair();jbefore=journal.read_bytes()
                with self.assertRaises((m.Blocked,OSError)):f.engine().run('recover')
                self.assertEqual(f.pair(),before);self.assertEqual(journal.read_bytes(),jbefore)
            finally:f.close()

    def test_unknown_mixed_or_new_inode_even_same_digest_blocks(self):
        self.stopped();m=module();g=self.f.engine();g.load()
        # Valid registered staged inode, but policy moved first: not a legitimate phase.
        g.fs.rename(m.RESOURCES['new_policy'][0],POLICY,0o644,g.j['resources']['new_policy']['stamp'],
                    g.j['original']['policy']['stamp'],m.NEW_POLICY,m.OLD_POLICY)
        before=self.f.pair()
        with self.assertRaisesRegex(m.Blocked,'unknown_mixed_pair'):self.f.engine().run('recover')
        self.assertEqual(self.f.pair(),before);self.assertTrue(self.f.fs.path(m.JOURNAL).exists())

    def test_fresh_ledger_and_append_after_crash_not_historically_frozen(self):
        f=self.f;m=module();f.write('/fixture/ledger.json',m.canonical([{'verdict':'INCONCLUSIVE'}]),0o600)
        self.stopped('executor_replaced')
        ledger=f.fs.path('/fixture/ledger.json');new=ledger.with_name('new-ledger')
        new.write_bytes(m.canonical([{'verdict':'INCONCLUSIVE'},{'verdict':'INCONCLUSIVE'}]));new.chmod(0o600);os.replace(new,ledger)
        inode=ledger.stat().st_ino;raw=ledger.read_bytes()
        self.assertEqual(f.engine().run('recover'),'ROOT_EXECUTOR_PAIR_ROLLED_BACK')
        self.assertEqual((ledger.stat().st_ino,ledger.read_bytes()),(inode,raw))

    def test_historical_ledger_rewrite_or_reader_metadata_change_blocks(self):
        for target in ['ledger','reader']:
            f=Fixture()
            try:
                f.write('/fixture/ledger.json',module().canonical([{'verdict':'INCONCLUSIVE'}]),0o600)
                def stop(at):
                    if at=='executor_replaced':raise module().Blocked('stop')
                with self.assertRaises(module().Blocked):f.engine(stop).run('apply')
                path=f.fs.path('/fixture/ledger.json' if target=='ledger' else '/fixture/reader.dsn')
                path.write_bytes(module().canonical([{'verdict':'FAKE_PASS'}]) if target=='ledger' else b'not-read-but-metadata-changed')
                before=f.pair()
                with self.assertRaises(module().Blocked):f.engine().run('recover')
                self.assertEqual(f.pair(),before)
            finally:f.close()

    def test_partial_writes_loop_and_zero_write_fail_closed(self):
        original=os.write;m=module()
        with patch.object(m.os,'write',side_effect=lambda fd,b:original(fd,b[:17])):
            self.assertEqual(self.f.engine().run('apply'),'ROOT_EXECUTOR_PAIR_VERIFIED')
        self.assertEqual(self.f.pair(),(m.NEW,m.NEW_POLICY))
        f=Fixture()
        try:
            baseline=f.pair()
            with patch.object(m.os,'write',return_value=0),self.assertRaises(m.Blocked):f.engine().run('apply')
            self.assertEqual(f.pair(),baseline)
            with self.assertRaises(m.Blocked):f.engine().run('apply')
        finally:f.close()

    def test_directory_fsync_failure_after_rename_is_reconciled(self):
        m=module();original=os.fsync;armed=False;fired=False
        parent=os.lstat(self.f.fs.path(EXEC).parent).st_ino
        def fault(at):
            nonlocal armed
            if at=='prepared':armed=True
        def sync(fd):
            nonlocal fired
            if armed and not fired and os.fstat(fd).st_ino==parent:
                fired=True;raise OSError('simulated_fsync_failure')
            return original(fd)
        baseline=self.f.pair()
        with patch.object(m.os,'fsync',side_effect=sync),self.assertRaises(OSError):self.f.engine(fault).run('apply')
        self.assertTrue(fired);self.assertEqual(self.f.engine().run('recover'),'ROOT_EXECUTOR_PAIR_ROLLED_BACK');self.assertEqual(self.f.pair(),baseline)

    def test_space_cancellation_and_cleanup_no_fd_leak(self):
        m=module();count=len(os.listdir('/proc/self/fd'))
        for mode in ['verify','apply']:
            with patch.object(m.os,'fstatvfs',return_value=types.SimpleNamespace(f_bavail=0,f_frsize=4096)),self.assertRaises(m.Blocked):self.f.engine().run(mode)
        with patch.object(m.os,'fstatvfs',return_value=types.SimpleNamespace(f_bavail=1<<30,f_frsize=4096,f_flag=os.ST_RDONLY)),self.assertRaises(m.Blocked):self.f.engine().run('verify')
        self.assertFalse(self.f.fs.path(m.JOURNAL).exists());self.assertEqual(len(os.listdir('/proc/self/fd')),count)
        with self.assertRaises(KeyboardInterrupt):self.f.engine(lambda at:(_ for _ in ()).throw(KeyboardInterrupt()) if at=='prepared' else None).run('apply')
        self.assertEqual(len(os.listdir('/proc/self/fd')),count)
        self.assertEqual(self.f.engine().run('recover'),'ROOT_EXECUTOR_PAIR_ROLLED_BACK');self.assertEqual(len(os.listdir('/proc/self/fd')),count)

    def test_cli_no_path_uid_env_or_promotion_override(self):
        for args in [[],['--apply','/tmp/override'],['--sandbox','/tmp'],['--initial-reviewed'],['--promote']]:
            r=subprocess.run(['/usr/bin/python3','-B',str(HERE/'root-executor-pair-upgrade.py'),*args],capture_output=True)
            self.assertEqual(r.returncode,1);v=json.loads(r.stdout);self.assertEqual(v['status'],'BLOCKED');self.assertNotIn(b'/tmp/override',r.stdout)

    def test_policy_changed_after_executor_replace_never_auto_rolls_back_unknown(self):
        m=module();f=self.f
        def corrupt(at):
            if at=='executor_replaced':f.fs.path(POLICY).write_bytes(b'unknown-root-policy')
        with self.assertRaises(m.Blocked):f.engine(corrupt).run('apply')
        before=f.pair();raw=f.fs.path(m.JOURNAL).read_bytes()
        with self.assertRaises(m.Blocked):f.engine().run('recover')
        self.assertEqual(f.pair(),before);self.assertEqual(f.fs.path(m.JOURNAL).read_bytes(),raw)

    def test_live_window_protected_change_does_not_qualify_success(self):
        m=module();f=self.f
        def mutate(at):
            if at=='prepared':
                path=f.fs.path(f.protected[0]);path.chmod(0o600);path.write_bytes(b'foreign-change');path.chmod(0o444)
        with self.assertRaisesRegex(m.Blocked,'protected_window_changed'):f.engine(mutate).run('apply')
        self.assertEqual(f.pair(),(m.OLD,m.OLD_POLICY));self.assertNotEqual(json.loads(f.fs.path(m.JOURNAL).read_bytes())['phase'],'verified')

    def test_fresh_target_parent_cas_before_rename(self):
        m=module();fs=self.f.engine().fs;src=str(Path(POLICY).parent/'.test-stage')
        raw=self.f.policy;self.f.write(src,raw,0o644);_,before=fs.read(POLICY,0o644);_,stage=fs.read(src,0o644)
        original=os.fstat;swapped=False;parent=self.f.fs.path(POLICY).parent
        def status(fd):
            nonlocal swapped
            st=original(fd)
            if not swapped and stat.S_ISREG(st.st_mode) and st.st_ino==before[1]:
                swapped=True;parent.rename(parent.with_name('old-policy-parent'));parent.mkdir()
            return st
        with patch.object(m.os,'fstat',side_effect=status),self.assertRaises((m.Blocked,OSError)):
            fs.rename(src,POLICY,0o644,stage,before,m.OLD_POLICY,m.OLD_POLICY)
        self.assertTrue(swapped)
        self.assertEqual((parent.with_name('old-policy-parent')/Path(POLICY).name).read_bytes(),raw)

    def test_first_backup_directory_gap_blocks_without_adoption(self):
        m=module();fs=self.f.engine().fs;original=fs.mkdir
        def gap(path):original(path);raise OSError('crash_after_mkdir_before_journal')
        g=self.f.engine();g.fs=fs
        with patch.object(fs,'mkdir',side_effect=gap),self.assertRaises(OSError):g.run('apply')
        raw=self.f.fs.path(m.JOURNAL).read_bytes();pair=self.f.pair()
        with self.assertRaisesRegex(m.Blocked,'unregistered_backup_directory'):self.f.engine().run('recover')
        self.assertEqual(self.f.pair(),pair);self.assertEqual(self.f.fs.path(m.JOURNAL).read_bytes(),raw)

    def test_target_hash_cas_not_just_metadata(self):
        m=module();fs=self.f.engine().fs;src=str(Path(POLICY).parent/'.hash-cas-stage')
        new=m.candidate(self.f.policy,promotion.validate_policy);self.f.write(src,new,0o644)
        _,st=fs.read(src,0o644);_,old=fs.read(POLICY,0o644)
        with self.assertRaisesRegex(m.Blocked,'inode_hash_cas'):
            fs.rename(src,POLICY,0o644,st,old,m.NEW_POLICY,'f'*64)
        self.assertEqual(self.f.pair(),(m.OLD,m.OLD_POLICY));self.assertTrue(self.f.fs.path(src).exists())

    def test_journal_link_swap_never_unlinks_foreign_pending(self):
        m=module();original=os.link;f=self.f;swapped=False
        def link(*a,**kw):
            nonlocal swapped
            value=original(*a,**kw)
            if not swapped:
                swapped=True;p=f.fs.path(m.PENDING);p.rename(p.with_name(p.name+'.displaced'));p.write_bytes(b'FOREIGN_MUST_BE_PRESERVED');p.chmod(0o600)
            return value
        baseline=f.pair()
        with patch.object(m.os,'link',side_effect=link),self.assertRaisesRegex(m.Blocked,'journal_link_changed'):f.engine().run('apply')
        self.assertEqual(f.fs.path(m.PENDING).read_bytes(),b'FOREIGN_MUST_BE_PRESERVED');self.assertEqual(f.pair(),baseline)

    def test_nonempty_lock_and_directory_xattr_reject(self):
        m=module();first=m.LOCKS[0][0];self.f.fs.path(first).write_bytes(b'foreign')
        with self.assertRaisesRegex(m.Blocked,'lock_contents'):self.f.engine().run('apply')
        self.f.fs.path(first).write_bytes(b'');os.setxattr(self.f.fs.path(POLICY).parent,'user.pair-surprise',b'x')
        with self.assertRaises(m.Blocked):self.f.engine().run('apply')
        self.assertFalse(self.f.fs.path(m.JOURNAL).exists())

    def test_backup_fsync_failure_retains_unknown_resource_for_manual_reconciliation(self):
        m=module();original=os.fsync;fired=False
        def sync(fd):
            nonlocal fired
            if not fired and os.readlink('/proc/self/fd/'+str(fd)).endswith('/executor.old'):
                fired=True;raise OSError('backup_fsync_failed')
            return original(fd)
        baseline=self.f.pair()
        with patch.object(m.os,'fsync',side_effect=sync),self.assertRaises(OSError):self.f.engine().run('apply')
        self.assertTrue(fired);self.assertEqual(self.f.pair(),baseline)
        self.assertTrue(self.f.fs.path(m.BACKUP+'/executor.old').exists())
        with self.assertRaises(m.Blocked):self.f.engine().run('recover')


class SourceTests(unittest.TestCase):
    def api(self):
        m=module();ci={'id':m.CI,'head_sha':m.SOURCE,'repository':{'full_name':'kiratonine/AdilBaga'},
            'head_repository':{'full_name':'kiratonine/AdilBaga'},'event':'push','head_branch':'main','path':'.github/workflows/ci.yml','status':'completed','conclusion':'success'}
        names=['Contracts','Go Quality','Nest Reference','Frontend','Pipeline Quality','Security','PostgreSQL Integration','Ephemeral Staging','CI Gate']
        replies={'actions/runs/'+str(m.CI):ci,'actions/runs/'+str(m.CI)+'/jobs?per_page=100':{'jobs':[{'name':n,'status':'completed','conclusion':'success'} for n in names]}}
        import base64
        for path in ['ops/c2/publisher-promotion.py','.github/workflows/sync-publisher-build.yml','scripts/ops/build-sync-promotion.py']:
            raw=(HERE.parents[1]/path).read_bytes();replies['contents/'+path+'?ref='+m.SOURCE]={'path':path,'type':'file','size':len(raw),'encoding':'base64','content':base64.b64encode(raw).decode()}
        return replies
    def test_real_reviewed_bytes_through_fixed_factory(self):
        m=module();responses=self.api();calls=[]
        def api(path):calls.append(path);return responses[path]
        self.assertEqual(m.source_verified(api),(HERE/'publisher-promotion.py').read_bytes());self.assertEqual(len(calls),5)
    def test_ci_source_metadata_digest_encoding_and_unavailable_authority(self):
        m=module()
        for kind in ['sha','repo','head-repo','branch','event','workflow','ci-id','status','skipped','duplicate-jobs','bad-size','bad-content','bad-encoding','wrong-path','builder','workflow-source','unavailable']:
            with self.subTest(kind=kind):
                r=self.api();ci=r['actions/runs/'+str(m.CI)];item=r['contents/ops/c2/publisher-promotion.py?ref='+m.SOURCE]
                if kind=='sha':ci['head_sha']='f'*40
                if kind=='repo':ci['repository']['full_name']='other/repo'
                if kind=='head-repo':ci['head_repository']['full_name']='other/repo'
                if kind=='workflow':ci['path']='unapproved.yml'
                if kind=='ci-id':ci['id']+=1
                if kind=='branch':ci['head_branch']='feature'
                if kind=='event':ci['event']='pull_request'
                if kind=='status':ci['status']='in_progress'
                if kind=='skipped':r['actions/runs/'+str(m.CI)+'/jobs?per_page=100']['jobs'][0]['conclusion']='skipped'
                if kind=='duplicate-jobs':r['actions/runs/'+str(m.CI)+'/jobs?per_page=100']['jobs'][0]['name']='CI Gate'
                if kind=='bad-size':item['size']+=1
                if kind=='bad-content':item['content']='eA=='
                if kind=='bad-encoding':item['content']='%%%'
                if kind=='wrong-path':item['path']='unreviewed.py'
                if kind in ['builder','workflow-source']:
                    name='scripts/ops/build-sync-promotion.py' if kind=='builder' else '.github/workflows/sync-publisher-build.yml'
                    r['contents/'+name+'?ref='+m.SOURCE]['content']='eA=='
                def api(path):
                    if kind=='unavailable':raise TimeoutError('SECRET_SHOULD_NOT_BE_LOGGED')
                    return r[path]
                with self.assertRaises((m.Blocked,TimeoutError)):m.source_verified(api)


if __name__=='__main__':unittest.main(verbosity=2)
