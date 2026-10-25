"""Mandatory disposable root qualification. No skip/sudo/host service or network."""
import importlib.util
import os
from pathlib import Path
import pwd
import signal
import stat
import tempfile
import unittest

HERE = Path(__file__).parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


pair = load('pair_root_tests', HERE / 'test_root_executor_pair_upgrade.py')
bundle = load('bundle_root_tests', HERE / 'root_bundle_integration.py')
installer = load('installer_root_tests', HERE / 'test_install_root_executor_helper.py')


class RootOwnershipTests(unittest.TestCase):
    def setUp(self):
        self.assertEqual(os.geteuid(), 0, 'mandatory root sandbox unavailable; no skip')
        self.actor = pwd.getpwnam('aktau-sync'); self.assertEqual(self.actor.pw_uid, 1999)
        self.f = pair.Fixture(); self.addCleanup(self.f.close)

    def test_wrong_file_owner_and_foreign_root_parent_reject(self):
        for path in [pair.EXEC, pair.POLICY]:
            with self.subTest(path=path):
                actual = self.f.fs.path(path); os.chown(actual, self.actor.pw_uid, self.actor.pw_gid)
                with self.assertRaises(pair.module().Blocked): self.f.engine().run('apply')
                os.chown(actual, 0, 0)
        parent = self.f.fs.path(pair.EXEC).parent; os.chown(parent, self.actor.pw_uid, self.actor.pw_gid)
        with self.assertRaises(pair.module().Blocked): self.f.engine().run('apply')
        self.assertFalse(self.f.fs.path(pair.module().JOURNAL).exists())

    def test_actual_operator_owned_reader_ledger_and_root_pair_preserved(self):
        m = pair.module(); baseline = self.f.pair()
        for name in ['reader.dsn', 'ledger.json']:
            os.chown(self.f.fs.path('/fixture/' + name), self.actor.pw_uid, self.actor.pw_gid)
        before = self.f.engine().checks.snapshot({})
        self.assertEqual(self.f.engine().run('apply'), 'ROOT_EXECUTOR_PAIR_VERIFIED')
        self.assertEqual(self.f.engine().checks.snapshot({}), before)
        self.assertEqual(self.f.engine().run('rollback'), 'ROOT_EXECUTOR_PAIR_ROLLED_BACK')
        self.assertEqual(self.f.pair(), baseline); self.assertEqual(self.f.engine().checks.snapshot({}), before)
        self.assertEqual(stat.S_IMODE(self.f.fs.path(m.BACKUP).stat().st_mode), 0o700)
        self.assertEqual(self.f.fs.path(m.BACKUP).stat().st_uid, 0)

    def test_real_operator_child_timeout_reaped_before_pair_recovery(self):
        with tempfile.TemporaryDirectory(prefix='pair-child-') as temp:
            base = Path(temp); base.chmod(0o755); actor = base/'actor'; actor.mkdir(mode=0o700)
            os.chown(actor, self.actor.pw_uid, self.actor.pw_gid); pidfile = actor/'child.pid'
            code = ('import os,time; p=os.fork(); '
                    'open('+repr(str(pidfile))+',"w").write(str(os.getpid())) if p==0 else None; time.sleep(60)')
            def fault(at):
                if at == 'executor_replaced':
                    pair.promotion.command(['/usr/sbin/runuser', '-u', 'aktau-sync', '--', '/usr/bin/python3', '-c', code], timeout=.3)
            baseline = self.f.pair()
            with self.assertRaisesRegex(pair.promotion.Blocked, 'command_deadline'): self.f.engine(fault).run('apply')
            pid = int(pidfile.read_text()); proc = Path('/proc')/str(pid)/'stat'
            self.assertTrue(not proc.exists() or proc.read_text().split()[2] == 'Z')
            self.assertEqual(self.f.engine().run('recover'), 'ROOT_EXECUTOR_PAIR_ROLLED_BACK'); self.assertEqual(self.f.pair(), baseline)


class RootHelperInstallerTests(unittest.TestCase):
    def setUp(self):
        self.assertEqual(os.getuid(), 0, 'root filesystem qualification required; no skip')
        self.actor = pwd.getpwnam('aktau-sync'); self.assertEqual(self.actor.pw_uid, 1999)
        self.f = installer.Fixture(); self.addCleanup(self.f.close)

    def test_root_custody_real_foreign_owner_rejects(self):
        m = installer.m
        for name in [m.EXECUTOR, m.ROOT, m.LOCKS[0][0]]:
            path = self.f.path(name); os.chown(path, self.actor.pw_uid, self.actor.pw_gid)
            with self.assertRaises(m.Blocked): self.f.engine().run('install')
            os.chown(path, 0, 0)
        self.assertFalse(self.f.path(m.BACKUP).exists())

    def test_install_root_namespace_denies_distinct_uid_and_preserves_reader(self):
        import subprocess
        m = installer.m
        reader = self.f.fs.path('/fixture/reader.dsn')
        ledger = self.f.fs.path('/fixture/ledger.json')
        for path in [reader, ledger]: os.chown(path, self.actor.pw_uid, self.actor.pw_gid)
        before = self.f.protected(); self.f.engine().run('install')
        self.assertEqual(self.f.path(m.TARGET).stat().st_uid, 0)
        self.assertEqual(self.f.path(m.BACKUP).stat().st_uid, 0)
        # Permit traversal of the synthetic outer namespace; root-private inner backup still denies.
        self.f.f.root.chmod(0o755)
        code = 'import os; os.open(' + repr(str(self.f.path(m.COPY))) + ', os.O_RDONLY)'
        r = subprocess.run(['/usr/sbin/runuser','-u','aktau-sync','--','/usr/bin/python3','-I','-B','-c',code],
                           capture_output=True, timeout=3)
        self.assertNotEqual(r.returncode, 0); self.assertIn(b'PermissionError',r.stderr)
        self.f.f.root.chmod(0o700)
        self.f.engine().run('rollback-install'); self.assertEqual(self.f.protected(), before)


if __name__ == '__main__':
    if os.getuid() != os.geteuid() or os.geteuid() != 0: raise SystemExit('root sandbox required; no skip')
    loader = unittest.defaultTestLoader
    suite = unittest.TestSuite([loader.loadTestsFromModule(bundle), loader.loadTestsFromModule(pair), loader.loadTestsFromTestCase(RootOwnershipTests),
                                loader.loadTestsFromModule(installer), loader.loadTestsFromTestCase(RootHelperInstallerTests)])
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() and not result.skipped else 1)
