import fcntl
import importlib.util
import os
import pathlib
import stat
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('runtime_gate', pathlib.Path(__file__).with_name('promotion-runtime-gate.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class RuntimeGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='promotion-runtime-fixture-'); self.addCleanup(self.temp.cleanup)
        self.base = pathlib.Path(self.temp.name); (self.base/'runtime.lock').touch(mode=0o644)
        real_lstat, real_fstat = os.lstat, os.fstat
        def trusted_parent(p):
            s = real_lstat(p)
            return SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=0) if stat.S_ISDIR(s.st_mode) else s
        def trusted_lock(fd):
            s = real_fstat(fd)
            return SimpleNamespace(st_mode=s.st_mode, st_uid=0, st_nlink=s.st_nlink)
        for ctx in [patch.object(m,'BASE',str(self.base)), patch.object(m.pathlib.Path,'lstat',trusted_parent),
                    patch.object(m.os,'fstat',side_effect=trusted_lock),
                    patch.object(m.pwd,'getpwnam',return_value=SimpleNamespace(pw_uid=os.geteuid()))]:
            ctx.start(); self.addCleanup(ctx.stop)

    def test_real_kernel_shared_lock_excludes_exclusive_promotion(self):
        fd = m.acquire('daily')
        other = os.open(self.base/'runtime.lock',os.O_RDWR)
        try:
            with self.assertRaises(BlockingIOError): fcntl.flock(other,fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertTrue(os.get_inheritable(fd))
        finally: os.close(fd)
        fcntl.flock(other,fcntl.LOCK_EX | fcntl.LOCK_NB); os.close(other)

    def test_busy_promotion_wait_is_bounded_without_starting_business(self):
        held = os.open(self.base/'runtime.lock',os.O_RDWR)
        fcntl.flock(held,fcntl.LOCK_EX)
        try:
            with patch.object(m.time,'monotonic',side_effect=[0,121]), patch.object(m.os,'execv',side_effect=AssertionError('no execution')):
                with self.assertRaisesRegex(ValueError,'promotion_busy'): m.acquire('daily')
        finally: os.close(held)

    def test_crash_interlock_blocks_source_execution(self):
        (self.base/'interlock.json').write_bytes(b'root-controlled pending promotion fixture')
        with patch.object(m.os,'execv',side_effect=AssertionError('must not exec')):
            with self.assertRaisesRegex(ValueError,'reconciliation_required'): m.acquire('weekly')

    def test_foreign_role_identity_symlink_hardlink_and_mode_rejected(self):
        with self.assertRaises(ValueError): m.acquire('shell')
        with patch.object(m.pwd,'getpwnam',return_value=SimpleNamespace(pw_uid=os.geteuid()+1)):
            with self.assertRaisesRegex(ValueError,'identity'): m.acquire('daily')
        (self.base/'runtime.lock').chmod(0o666)
        with self.assertRaisesRegex(ValueError,'runtime_lock'): m.acquire('daily')
        (self.base/'runtime.lock').chmod(0o644)
        os.link(self.base/'runtime.lock',self.base/'alias')
        with self.assertRaisesRegex(ValueError,'runtime_lock'): m.acquire('daily')
        (self.base/'alias').unlink()
        (self.base/'runtime.lock').rename(self.base/'saved')
        (self.base/'runtime.lock').symlink_to(self.base/'saved')
        with self.assertRaises(OSError): m.acquire('daily')

    def test_unsafe_ancestor_denied_before_open(self):
        with patch.object(m.pathlib.Path,'lstat',return_value=SimpleNamespace(st_mode=stat.S_IFDIR|0o777,st_uid=0)),patch.object(m.os,'open',side_effect=AssertionError('must not open')):
            with self.assertRaisesRegex(ValueError,'custody'): m.acquire('daily')

    def test_fixed_commands_preserve_existing_scripts_notify_and_no_publish(self):
        self.assertEqual(m.COMMANDS, {'daily':['/usr/bin/bash','pipeline/scripts/daily-sync.sh'],
                                    'weekly':['/usr/bin/bash','pipeline/scripts/weekly-full-scrape.sh'],
                                    'c2':['/usr/bin/python3','-I','-B','/usr/local/libexec/aktau-c2-custodian.py']})
        for name in ['promotion-daily.conf','promotion-weekly.conf','promotion-custodian.conf']:
            data = pathlib.Path(__file__).with_name(name).read_text()
            self.assertNotIn('OnCalendar',data); self.assertNotIn('EnvironmentFile',data)
            self.assertIn('ExecStart=\nExecStart=/usr/bin/python3 -I -B',data)


if __name__ == '__main__': unittest.main()
