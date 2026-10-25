"""Real filesystem installer tests; business/GitHub authority is explicitly modeled."""
import base64
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m

m = load('helper_installer', HERE / 'install-root-executor-helper.py')
pair = load('helper_installer_fixture', HERE / 'test_root_executor_pair_upgrade.py')
RAW = (HERE / 'root-executor-pair-upgrade.py').read_bytes()
assert len(RAW) == m.HELPER_SIZE and m.digest(RAW) == m.HELPER_HASH

class Fixture:
    def __init__(self):
        self.f = pair.Fixture(); self.fs = m.Filesystem(self.f.root)
        self.checks = self.f.engine().checks
    def path(self, path): return self.fs.path(path)
    def engine(self, fault=None): return m.Installer(self.fs, self.checks, lambda: RAW, fault)
    def close(self): self.f.close()
    def protected(self): return self.engine().snapshot()

class HelperInstallerTests(unittest.TestCase):
    def setUp(self): self.f = Fixture(); self.addCleanup(self.f.close)
    def test_success_readback_exact_hash_mode_and_protected_state(self):
        before = self.f.protected()
        self.assertEqual(self.f.engine().run('install'), 'HELPER_INSTALLED_NOT_EXECUTED')
        self.assertEqual(self.f.path(m.TARGET).read_bytes(), RAW)
        self.assertFalse(self.f.path(m.STAGE).exists())
        st = self.f.path(m.TARGET).stat()
        self.assertEqual((stat.S_IMODE(st.st_mode), st.st_nlink), (0o755, 1))
        self.assertEqual(stat.S_IMODE(self.f.path(m.BACKUP).stat().st_mode), 0o700)
        for p in [m.INTENT, m.COPY, m.RECEIPT]: self.assertEqual(stat.S_IMODE(self.f.path(p).stat().st_mode), 0o600)
        self.assertEqual(self.f.engine().run('readback'), 'HELPER_INSTALL_READBACK_VERIFIED')
        self.assertEqual(self.f.protected(), before)

    def test_existing_target_never_overwritten_even_matching(self):
        for raw in [RAW, b'foreign']:
            self.f.f.write(m.TARGET, raw, 0o755); st = self.f.path(m.TARGET).stat()
            with self.assertRaises(m.Blocked): self.f.engine().run('install')
            self.assertEqual(self.f.path(m.TARGET).read_bytes(), raw); self.assertEqual(self.f.path(m.TARGET).stat().st_ino, st.st_ino)
            self.assertFalse(self.f.path(m.BACKUP).exists()); self.f.path(m.TARGET).unlink()

    def test_wrong_size_sha_and_type_reject_before_namespace(self):
        for raw in [RAW[:-1], RAW+b'x', b'x'*len(RAW), None, RAW.decode()]:
            g = self.f.engine(); g.source = lambda: raw
            with self.assertRaises(m.Blocked): g.run('install')
            self.assertFalse(self.f.path(m.BACKUP).exists())

    def test_all_three_locks_busy_missing_wrong_mode_and_contents(self):
        for path, mode in m.LOCKS:
            with self.subTest(path=path):
                fd = os.open(self.f.path(path), os.O_RDONLY)
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    with self.assertRaises(BlockingIOError): self.f.engine().run('install')
                finally: os.close(fd)
                self.f.path(path).chmod(0o666)
                with self.assertRaises(m.Blocked): self.f.engine().run('install')
                self.f.path(path).chmod(mode); self.f.path(path).write_bytes(b'x')
                with self.assertRaises(m.Blocked): self.f.engine().run('install')
                self.f.path(path).write_bytes(b'')
                self.f.path(path).unlink()
                with self.assertRaises(FileNotFoundError): self.f.engine().run('install')
                self.f.f.write(path, b'', mode)
        self.assertFalse(self.f.path(m.BACKUP).exists())

    def test_symlink_hardlink_writable_parent_xattr_and_actual_acl(self):
        parent = self.f.path(m.ROOT)
        parent.chmod(0o777)
        with self.assertRaises(m.Blocked): self.f.engine().run('install')
        parent.chmod(0o755)
        os.setxattr(parent, 'user.foreign', b'x')
        with self.assertRaises(m.Blocked): self.f.engine().run('install')
        os.removexattr(parent, 'user.foreign')
        # Linux POSIX ACL xattr: named uid grants read, mask read; actual filesystem, no mocks.
        import struct
        acl = struct.pack('<I', 2) + b''.join(struct.pack('<HHI', tag, perm, uid) for tag, perm, uid in
            [(1,7,0xffffffff),(2,4,1999),(4,5,0xffffffff),(16,5,0xffffffff),(32,5,0xffffffff)])
        os.setxattr(parent, 'system.posix_acl_access', acl)
        with self.assertRaises(m.Blocked): self.f.engine().run('install')
        os.removexattr(parent, 'system.posix_acl_access')
        target = self.f.path(m.TARGET); target.symlink_to('/missing')
        with self.assertRaises(m.Blocked): self.f.engine().run('install')
        target.unlink()
        lock = self.f.path(m.LOCKS[0][0]); os.link(lock, lock.with_name('alias'))
        with self.assertRaises(m.Blocked): self.f.engine().run('install')
        self.assertFalse(self.f.path(m.BACKUP).exists())

    def test_ancestor_symlink_rejected(self):
        parent = self.f.path(m.ROOT); aside = parent.with_name('foreign')
        parent.rename(aside); parent.symlink_to(aside)
        with self.assertRaises(OSError): self.f.engine().run('install')
        self.assertFalse(self.f.path(m.BACKUP).exists())

    def test_foreign_stage_inode_same_bytes_blocks_publication(self):
        def swap(at):
            if at == 'staged':
                target = self.f.path(m.STAGE); temp = target.with_name('foreign')
                temp.write_bytes(RAW); temp.chmod(0o755); os.replace(temp, target)
        with self.assertRaises(m.Blocked): self.f.engine(swap).run('install')
        self.assertFalse(self.f.path(m.TARGET).exists())
        with self.assertRaises(m.Blocked): self.f.engine().run('rollback-install')
        self.assertTrue(self.f.path(m.STAGE).exists())

    def test_stage_fd_swap_after_open_is_rejected(self):
        def swap(at):
            if at == 'before_link':
                target = self.f.path(m.STAGE); temp = target.with_name('foreign')
                temp.write_bytes(RAW); temp.chmod(0o755); os.replace(temp, target)
        with self.assertRaises(m.Blocked): self.f.engine(swap).run('install')
        self.assertFalse(self.f.path(m.TARGET).exists())

    def test_final_race_no_clobber(self):
        def race(at):
            if at == 'before_link': self.f.f.write(m.TARGET, b'foreign', 0o755)
        with self.assertRaises(FileExistsError): self.f.engine(race).run('install')
        self.assertEqual(self.f.path(m.TARGET).read_bytes(), b'foreign')
        with self.assertRaises(m.Blocked): self.f.engine().run('rollback-install')

    def test_parent_swap_and_protected_drift_before_publish(self):
        for mode in ['parent','policy']:
            with self.subTest(mode=mode):
                f = Fixture()
                try:
                    def change(at):
                        if at == 'staged':
                            if mode == 'parent':
                                parent = f.path(m.ROOT); parent.rename(parent.with_name('aside')); parent.mkdir()
                            else: f.path(m.POLICY).write_bytes(b'changed')
                    with self.assertRaises((m.Blocked, OSError)): f.engine(change).run('install')
                    self.assertFalse(f.path(m.TARGET).exists())
                finally: f.close()

    def test_sigkill_registered_and_unregistered_states(self):
        events = {'mkdir_unregistered':False, 'intent':False, 'copy_unregistered':False, 'stage_unregistered':False,
                  'staged':True, 'link_unregistered':False, 'linked':True, 'stage_unlinked':True, 'committed':True}
        for event, recoverable in events.items():
            with self.subTest(event=event):
                f = Fixture()
                try:
                    before = f.protected(); pid = os.fork()
                    if pid == 0:
                        try: f.engine(lambda at: os.kill(os.getpid(), signal.SIGKILL) if at == event else None).run('install')
                        finally: os._exit(93)
                    _, status = os.waitpid(pid, 0)
                    self.assertTrue(os.WIFSIGNALED(status)); self.assertEqual(os.WTERMSIG(status), signal.SIGKILL)
                    self.assertEqual(f.protected(), before)
                    with self.assertRaises(m.Blocked): f.engine().run('install')
                    if recoverable:
                        self.assertEqual(f.engine().run('rollback-install'), 'HELPER_INSTALL_ROLLED_BACK')
                        self.assertFalse(f.path(m.TARGET).exists()); self.assertFalse(f.path(m.STAGE).exists())
                    else:
                        with self.assertRaises((m.Blocked, OSError)): f.engine().run('rollback-install')
                        self.assertTrue(f.path(m.BACKUP).exists())
                    self.assertEqual(f.protected(), before)
                finally: f.close()

    def test_interrupted_rollback_reenters_only_registered_removals(self):
        for event in ['rollback_intent','rollback_stage_unlinked','rollback_target_unlinked','rolled_back']:
            with self.subTest(event=event):
                f = Fixture()
                try:
                    def interrupt(at):
                        if at == 'linked': raise RuntimeError('stopped after registered link')
                    with self.assertRaises(RuntimeError): f.engine(interrupt).run('install')
                    pid = os.fork()
                    if pid == 0:
                        try: f.engine(lambda at: os.kill(os.getpid(), signal.SIGKILL) if at == event else None).run('rollback-install')
                        finally: os._exit(93)
                    _, status = os.waitpid(pid, 0); self.assertEqual(os.WTERMSIG(status), signal.SIGKILL)
                    if event == 'rolled_back':
                        with self.assertRaises(m.Blocked): f.engine().run('rollback-install')
                    else: self.assertEqual(f.engine().run('rollback-install'), 'HELPER_INSTALL_ROLLED_BACK')
                    self.assertFalse(f.path(m.TARGET).exists()); self.assertTrue(f.path(m.RECEIPT).exists())
                finally: f.close()

    def test_rollback_preserves_receipt_copy_and_blocks_reinstall(self):
        before = self.f.protected(); self.f.engine().run('install')
        self.assertEqual(self.f.engine().run('rollback-install'), 'HELPER_INSTALL_ROLLED_BACK')
        self.assertFalse(self.f.path(m.TARGET).exists()); self.assertTrue(self.f.path(m.INTENT).exists())
        self.assertEqual(self.f.path(m.COPY).read_bytes(), RAW); self.assertTrue(self.f.path(m.RECEIPT).exists())
        self.assertEqual(self.f.protected(), before)
        with self.assertRaises(m.Blocked): self.f.engine().run('install')

    def test_foreign_final_copy_and_intent_inodes_block_rollback(self):
        for path in [m.TARGET, m.COPY, m.INTENT]:
            with self.subTest(path=path):
                f = Fixture()
                try:
                    f.engine().run('install'); old = f.path(path); temp = old.with_name('other')
                    temp.write_bytes(old.read_bytes()); temp.chmod(stat.S_IMODE(old.stat().st_mode)); os.replace(temp, old)
                    with self.assertRaises(m.Blocked): f.engine().run('rollback-install')
                    self.assertTrue(f.path(m.TARGET).exists()); self.assertTrue(f.path(m.RECEIPT).exists())
                finally: f.close()

    def test_unknown_backup_file_and_truncated_receipt_block_cleanup(self):
        for mutation in ['unknown','truncated','extra']:
            f = Fixture()
            try:
                f.engine().run('install')
                if mutation == 'unknown': (f.path(m.BACKUP)/'foreign').write_bytes(b'x')
                elif mutation == 'truncated':
                    path = f.path(m.RECEIPT); path.write_bytes(path.read_bytes()+b'{')
                else:
                    path = f.path(m.INTENT); v=json.loads(path.read_bytes());v['extra']=True;path.write_bytes(m.canonical(v))
                with self.assertRaises(m.Blocked): f.engine().run('rollback-install')
                self.assertTrue(f.path(m.TARGET).exists()); self.assertTrue(f.path(m.RECEIPT).exists())
            finally: f.close()

    def test_unlink_inode_race_preserves_foreign_target(self):
        self.f.engine().run('install')
        def race(at):
            if at == 'before_unlink':
                path = self.f.path(m.TARGET); temp = path.with_name('foreign')
                temp.write_bytes(b'foreign'); temp.chmod(0o755); os.replace(temp, path)
        with self.assertRaises(m.Blocked): self.f.engine(race).run('rollback-install')
        self.assertEqual(self.f.path(m.TARGET).read_bytes(), b'foreign')

    def test_cancellation_and_write_failure_release_locks_preserve_partial(self):
        for exception in [KeyboardInterrupt, OSError]:
            f=Fixture()
            try:
                def fault(at):
                    if at == 'staged': raise exception()
                with self.assertRaises(exception): f.engine(fault).run('install')
                self.assertTrue(f.path(m.RECEIPT).exists())
                self.assertEqual(f.engine().run('rollback-install'), 'HELPER_INSTALL_ROLLED_BACK')
            finally: f.close()

    def test_ledger_append_between_windows_allowed_but_rewrite_blocks(self):
        self.f.engine().run('install'); ledger=self.f.fs.path('/fixture/ledger.json')
        ledger.write_bytes(b'[{"attemptId":"synthetic1"}]\n')
        self.assertEqual(self.f.engine().run('readback'), 'HELPER_INSTALL_READBACK_VERIFIED')
        self.assertEqual(self.f.engine().run('rollback-install'), 'HELPER_INSTALL_ROLLED_BACK')
        f=Fixture()
        try:
            history=f.fs.path('/fixture/ledger.json');history.write_bytes(b'[{"attemptId":"original"}]\n')
            f.engine().run('install');history.write_bytes(b'[{"attemptId":"rewritten"}]\n')
            with self.assertRaises(m.Blocked):f.engine().run('readback')
            with self.assertRaises(m.Blocked):f.engine().run('rollback-install')
            self.assertTrue(f.path(m.TARGET).exists())
        finally:f.close()

    def test_pair_upgrade_or_unknown_namespace_blocks_install_and_rollback(self):
        for path in m.ABSENT + [m.ROOT+'/.root-executor-pair-upgrade.py.install-foreign']:
            f=Fixture()
            try:
                f.f.write(path,b'foreign',0o600)
                with self.assertRaises(m.Blocked): f.engine().run('install')
                self.assertFalse(f.path(m.TARGET).exists());self.assertFalse(f.path(m.BACKUP).exists())
            finally:f.close()
        self.f.engine().run('install');self.f.f.write(m.PAIR_JOURNAL,b'foreign',0o600)
        with self.assertRaises(m.Blocked):self.f.engine().run('rollback-install')
        self.assertTrue(self.f.path(m.TARGET).exists())

    def test_fsync_failure_preserves_orphan_and_blocks_retry(self):
        with patch.object(m.os,'fsync',side_effect=OSError('synthetic fsync')):
            with self.assertRaises(OSError):self.f.engine().run('install')
        self.assertTrue(self.f.path(m.BACKUP).exists())
        with self.assertRaises(m.Blocked):self.f.engine().run('install')
        with self.assertRaises((m.Blocked,OSError)):self.f.engine().run('rollback-install')

    def test_backup_swap_unknown_file_or_retained_drift_before_publication(self):
        for mode in ['directory','unknown','copy']:
            f=Fixture()
            try:
                def fault(at):
                    if at=='staged':
                        if mode=='directory':
                            path=f.path(m.BACKUP);path.rename(path.with_name('foreign'));path.mkdir(mode=0o700)
                        elif mode=='unknown':(f.path(m.BACKUP)/'unexpected').write_bytes(b'x')
                        else:f.path(m.COPY).write_bytes(b'x'*len(RAW))
                with self.assertRaises((m.Blocked,OSError)):f.engine(fault).run('install')
                self.assertFalse(f.path(m.TARGET).exists())
            finally:f.close()

    def test_partial_stage_write_sigkill_preserves_unknown_orphan(self):
        before=self.f.protected();pid=os.fork()
        if pid==0:
            original=os.write
            def write(fd,raw):
                if os.readlink('/proc/self/fd/'+str(fd))==str(self.f.path(m.STAGE)):
                    original(fd,raw[:128]);os.kill(os.getpid(),signal.SIGKILL)
                return original(fd,raw)
            try:
                with patch.object(m.os,'write',side_effect=write):self.f.engine().run('install')
            finally:os._exit(93)
        _,status=os.waitpid(pid,0);self.assertEqual(os.WTERMSIG(status),signal.SIGKILL)
        self.assertFalse(self.f.path(m.TARGET).exists());self.assertEqual(self.f.path(m.STAGE).stat().st_size,128)
        with self.assertRaises((m.Blocked,OSError)):self.f.engine().run('rollback-install')
        self.assertEqual(self.f.protected(),before);self.assertTrue(self.f.path(m.STAGE).exists())

    def test_short_writes_loop_and_torn_receipt_is_preserved(self):
        original=os.write
        with patch.object(m.os,'write',side_effect=lambda fd,raw:original(fd,raw[:17])):
            self.f.engine().run('install')
        self.assertEqual(self.f.path(m.TARGET).read_bytes(),RAW)
        self.f.engine().run('rollback-install')
        f=Fixture()
        try:
            pid=os.fork()
            if pid==0:
                def write(fd,raw):
                    if os.readlink('/proc/self/fd/'+str(fd))==str(f.path(m.RECEIPT)) and b'committed' in raw:
                        original(fd,raw[:31]);os.kill(os.getpid(),signal.SIGKILL)
                    return original(fd,raw)
                try:
                    with patch.object(m.os,'write',side_effect=write):f.engine().run('install')
                finally:os._exit(93)
            _,status=os.waitpid(pid,0);self.assertEqual(os.WTERMSIG(status),signal.SIGKILL)
            receipt=f.path(m.RECEIPT).read_bytes()
            with self.assertRaises(m.Blocked):f.engine().run('rollback-install')
            self.assertEqual(f.path(m.RECEIPT).read_bytes(),receipt);self.assertTrue(f.path(m.TARGET).exists())
        finally:f.close()

    def test_no_fd_leaks_success_rejection_and_rollback(self):
        before=set(os.listdir('/proc/self/fd'))
        self.f.engine().run('install')
        with self.assertRaises(m.Blocked):self.f.engine().run('install')
        self.f.engine().run('readback');self.f.engine().run('rollback-install')
        self.assertEqual(set(os.listdir('/proc/self/fd')),before)

    def test_cli_has_no_path_uid_fixture_source_or_unsafe_mode_override(self):
        for option in ['--verify','--apply','--recover','--rollback','--sandbox','--source','--path','--uid']:
            r=subprocess.run([sys.executable,'-I','-B',str(HERE/'install-root-executor-helper.py'),option],capture_output=True,text=True,timeout=3)
            self.assertEqual(r.returncode,1);self.assertEqual(json.loads(r.stdout)['status'],'BLOCKED')
            self.assertEqual(r.stderr,'')
        import types
        with patch.object(m.sys,'argv',['reviewed-installer','--install']), \
             patch.object(m.sys,'flags',types.SimpleNamespace(isolated=True)), \
             patch.object(m.sys,'dont_write_bytecode',True), \
             patch.object(m.os,'umask') as mask, \
             patch.object(m,'Filesystem',side_effect=m.Blocked('synthetic_fs_boundary')):
            with self.assertRaisesRegex(m.Blocked,'synthetic_fs_boundary'):m.main()
            mask.assert_called_once_with(0o077)

    def test_independent_source_metadata_ci_and_sha_fail_closed(self):
        names=['Contracts','Go Quality','Nest Reference','Frontend','Pipeline Quality','Security','PostgreSQL Integration','Ephemeral Staging','CI Gate']
        ci={'id':m.CI,'head_sha':m.SOURCE,'repository':{'full_name':'kiratonine/AdilBaga'},'head_repository':{'full_name':'kiratonine/AdilBaga'},
            'event':'push','head_branch':'main','path':'.github/workflows/ci.yml','status':'completed','conclusion':'success'}
        jobs={'jobs':[{'name':n,'status':'completed','conclusion':'success'} for n in names]}
        source={'type':'file','encoding':'base64','path':'ops/c2/root-executor-pair-upgrade.py','size':len(RAW),
                'sha':'cc002eb4d3eaa26865ebcf3439fbe1a0139fd1e3','content':base64.b64encode(RAW).decode()}
        def api(path):return jobs if path.endswith('jobs?per_page=100') else ci if path.startswith('actions/') else source
        self.assertEqual(m.source_verified(api),RAW)
        for obj,key,value in [(ci,'head_sha','0'*40),(ci,'event','pull_request'),(ci,'head_branch','other'),(ci,'conclusion','failure'),
                              (source,'size',True),(source,'content','!'),(source,'content',base64.b64encode(b'x'*len(RAW)).decode()),
                              (source,'sha','0'*40),(source,'path','other')]:
            old=obj[key];obj[key]=value
            with self.assertRaises(m.Blocked):m.source_verified(api)
            obj[key]=old
        jobs['jobs'][0]['conclusion']='skipped'
        with self.assertRaises(m.Blocked):m.source_verified(api)
        with self.assertRaises(OSError):m.source_verified(lambda _:(_ for _ in ()).throw(OSError('offline')))

if __name__=='__main__':unittest.main()
