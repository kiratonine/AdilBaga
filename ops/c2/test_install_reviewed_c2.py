import hashlib
import importlib.util
import json
import os
import pathlib
import tempfile
import unittest
import contextlib
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('installer', pathlib.Path(__file__).with_name('install-reviewed-c2.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class InstallTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='aktau-c2-install-test-')
        self.root = pathlib.Path(self.temp.name)
        self.root.chmod(0o700)
        for p in ['/etc/aktau-c2-install', m.BUNDLE, '/usr/local/libexec', '/var/lib/aktau-sync']:
            (self.root / p.lstrip('/')).mkdir(parents=True, exist_ok=True, mode=0o755)
        elf = bytearray(64)
        elf[:6] = b'\x7fELF\x02\x01'
        elf[18:20] = b'\x3e\x00'
        self.files = {name: bytes(elf) if name in m.FILES[:2] else b'// synthetic reviewed module\n' for name in m.FILES}
        self.files['source-manifest.json'] = m.canonical({'sourceSha': 'a' * 40, 'recipe': m.RECIPE, 'nodeMajor': 24})
        for name, data in self.files.items():
            p = self.root / m.BUNDLE.lstrip('/') / name
            p.write_bytes(data)
            p.chmod(0o600)
        self.a = {'version': 1, 'authorization': {'version': 1, 'approved': True, 'sourceSha': 'a' * 40,
                  'binarySha256': self.digest(self.files['c2projection']), 'clockSha256': self.digest(self.files['relayprobe']),
                  'buildId': 'synthetic-local-only', 'platform': 'linux/amd64'},
                  'files': {name: self.digest(data) for name, data in self.files.items()},
                  'operatorUid': max(os.geteuid(), 1000), 'recipe': m.RECIPE, 'nodeMajor': 24}
        self.approval = self.root / m.APPROVAL.lstrip('/')
        self.save()
        self.installer = m.Installer(str(self.root))
        # OS account is mocked only inside this disposable sandbox; no host
        # account or real chown is required by the nonroot CI profile.
        self.account = patch.object(m.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=os.geteuid(), pw_gid=os.getegid()))
        self.account.start()
        self.addCleanup(self.account.stop)

    def tearDown(self):
        self.temp.cleanup()

    @staticmethod
    def digest(data):
        return hashlib.sha256(data).hexdigest()

    def save(self):
        self.approval.write_bytes(m.canonical(self.a))
        self.approval.chmod(0o600)

    def test_actual_install_then_exact_rollback(self):
        self.assertEqual(self.installer.install(), 'C2_PROVISIONED_INACTIVE')
        for name, data in self.files.items():
            p = self.root / m.TARGETS[0].lstrip('/') / name
            self.assertEqual(p.read_bytes(), data)
            self.assertEqual(p.stat().st_mode & 0o777, 0o555 if name in m.FILES[:2] else 0o444)
        self.assertEqual(self.installer.rollback(), 'ROLLED_BACK_OWN_INACTIVE_RESOURCES')
        self.assertTrue(all(not (self.root / p.lstrip('/')).exists() for p in m.TARGETS))

    def test_existing_target_never_clobbered(self):
        target = self.root / m.TARGETS[0].lstrip('/')
        target.mkdir()
        with self.assertRaises(ValueError):
            self.installer.install()
        self.assertTrue(target.is_dir())

    def test_wrong_sha_elf_or_platform(self):
        for mutate in [lambda: self.a['files'].__setitem__('c2projection', 'f' * 64),
                       lambda: self.a['authorization'].__setitem__('platform', 'linux/arm64'),
                       lambda: self.a['authorization'].__setitem__('sourceSha', 'short'),
                       lambda: self.a.__setitem__('recipe', 'unreviewed recipe')]:
            original = json.loads(json.dumps(self.a))
            mutate()
            self.save()
            with self.assertRaises(ValueError):
                self.installer.admission()
            self.a = original
        p = self.root / m.BUNDLE.lstrip('/') / 'c2projection'
        p.write_bytes(b'not ELF')
        self.a['files']['c2projection'] = self.digest(b'not ELF')
        self.a['authorization']['binarySha256'] = self.digest(b'not ELF')
        self.save()
        with self.assertRaises(ValueError):
            self.installer.admission()

    def test_approval_symlink_hardlink_and_acl_mask(self):
        for mode in (0o644, 0o620):
            self.approval.chmod(mode)
            with self.assertRaises(ValueError):
                self.installer.admission()
        self.approval.chmod(0o600)
        extra = self.approval.with_name('extra')
        os.link(self.approval, extra)
        with self.assertRaises(ValueError):
            self.installer.admission()
        extra.unlink()
        self.approval.rename(extra)
        self.approval.symlink_to(extra)
        with self.assertRaises(OSError):
            self.installer.admission()

    def test_unsafe_ancestor_and_wrong_uid(self):
        p = self.approval.parent
        p.chmod(0o777)
        with self.assertRaises(ValueError):
            self.installer.admission()
        p.chmod(0o755)
        self.installer.uid += 1
        with self.assertRaises(ValueError):
            self.installer.admission()

    def test_extra_keys_forged_deployment_and_stray_bundle(self):
        self.a['deployment'] = {'ready': True}
        self.save()
        with self.assertRaises(ValueError):
            self.installer.admission()
        del self.a['deployment']
        self.save()
        (self.root / m.BUNDLE.lstrip('/') / 'stray').touch()
        with self.assertRaises(ValueError):
            self.installer.admission()

    def test_partial_write_loop_and_fsync_failure(self):
        original = os.write
        with patch.object(m.os, 'write', side_effect=lambda fd, data: original(fd, data[:7])):
            self.assertEqual(self.installer.install(), 'C2_PROVISIONED_INACTIVE')
        self.installer.rollback()
        with patch.object(m.os, 'fsync', side_effect=OSError('synthetic failure')):
            with self.assertRaises(OSError):
                self.installer.install()

    def test_crash_before_and_after_atomic_publish_rollback(self):
        for point in ('before_rename', 'after_rename'):
            def fault(p):
                if p == point:
                    raise RuntimeError('synthetic crash')
            with self.assertRaises(RuntimeError):
                m.Installer(str(self.root), fault).install()
            self.assertEqual(self.installer.rollback(), 'ROLLED_BACK_OWN_INACTIVE_RESOURCES')

    def test_live_or_tampered_tree_rollback_fails_closed(self):
        self.installer.install()
        p = self.root / m.TARGETS[2].lstrip('/') / 'reader.dsn'
        p.write_text('synthetic-not-a-credential')
        with self.assertRaises(ValueError):
            self.installer.rollback()
        self.assertTrue((self.root / m.TARGETS[0].lstrip('/')).exists())
        p.unlink()
        self.installer.rollback()

    def test_bundle_replacement_after_admission_cannot_swap_installed_bytes(self):
        original = self.installer.admission
        def admission():
            result = original()
            (self.root / m.BUNDLE.lstrip('/') / 'relayprobe').write_bytes(b'tampered')
            return result
        self.installer.admission = admission
        self.installer.install()
        self.assertEqual((self.root / m.TARGETS[0].lstrip('/') / 'relayprobe').read_bytes(), self.files['relayprobe'])

    def test_stale_source_manifest_against_independent_approval(self):
        self.a['authorization']['sourceSha'] = 'b' * 40
        self.save()
        with self.assertRaises(ValueError):
            self.installer.admission()

    def test_interrupted_binary_write_rolls_back_only_owned_stage(self):
        original = self.installer.write
        def write(fd, data):
            if data == self.files['c2projection']:
                os.write(fd, data[:7])
                raise OSError('synthetic interrupted write')
            return original(fd, data)
        self.installer.write = write
        with self.assertRaises(OSError):
            self.installer.install()
        self.installer.write = original
        self.assertEqual(self.installer.rollback(), 'ROLLED_BACK_OWN_INACTIVE_RESOURCES')

    def test_bundle_links_and_write_mask_fail_before_publication(self):
        p = self.root / m.BUNDLE.lstrip('/') / 'relayprobe'
        p.chmod(0o620)
        with self.assertRaises(ValueError):
            self.installer.install()
        p.chmod(0o600)
        alias = self.root / 'alias'
        os.link(p, alias)
        with self.assertRaises(ValueError):
            self.installer.install()
        alias.unlink()
        p.rename(alias)
        p.symlink_to(alias)
        with self.assertRaises(OSError):
            self.installer.install()
        self.assertTrue(all(not (self.root / t.lstrip('/')).exists() for t in m.TARGETS))

    def test_torn_receipt_never_guesses_rollback_ownership(self):
        self.installer.install()
        p = self.root / m.RECEIPT.lstrip('/')
        p.write_bytes(p.read_bytes() + b'{"partial":')
        with self.assertRaises(ValueError):
            self.installer.rollback()
        self.assertTrue(all((self.root / t.lstrip('/')).exists() for t in m.TARGETS))

    def test_parent_symlink_rejected(self):
        p = self.root / 'usr/local/libexec'
        p.rename(self.root / 'original')
        p.symlink_to(self.root / 'original')
        with self.assertRaises(OSError):
            self.installer.install()

    def resources(self):
        """Snapshot sandbox metadata/bytes without following links."""
        result = {}
        for p in self.root.rglob('*'):
            s = p.lstat()
            data = os.readlink(p) if p.is_symlink() else p.read_bytes() if p.is_file() else None
            result[str(p.relative_to(self.root))] = (s.st_ino, s.st_mode, data)
        return result

    def assert_rollback_blocked_without_deletion(self):
        before = self.resources()
        with self.assertRaises(ValueError):
            self.installer.rollback()
        self.assertEqual(self.resources(), before, 'ambiguous resources and receipt must be preserved')

    def crash_after_mkdir_before_intent(self, ordinal):
        original = os.mkdir
        seen = 0
        def mkdir(name, *args, **kwargs):
            nonlocal seen
            original(name, *args, **kwargs)
            if isinstance(name, str) and name.startswith('.aktau-c2-stage-'):
                seen += 1
                if seen == ordinal:
                    raise RuntimeError('synthetic crash after mkdir before intent')
        with patch.object(m.os, 'mkdir', side_effect=mkdir):
            with self.assertRaises(RuntimeError):
                self.installer.install()
        self.assertEqual(seen, ordinal)
        self.assert_rollback_blocked_without_deletion()
        before = self.resources()
        with self.assertRaises((ValueError, FileExistsError)):
            self.installer.install()
        self.assertEqual(self.resources(), before)

    def test_crash_after_first_mkdir_before_intent_blocks_rollback(self):
        self.crash_after_mkdir_before_intent(1)

    def test_crash_after_second_mkdir_before_intent_blocks_rollback(self):
        self.crash_after_mkdir_before_intent(2)

    def test_crash_after_third_mkdir_before_intent_blocks_rollback(self):
        self.crash_after_mkdir_before_intent(3)

    def partial_receipt(self):
        def fault(point):
            if point == 'before_rename':
                raise RuntimeError('synthetic recorded partial install')
        with self.assertRaises(RuntimeError):
            m.Installer(str(self.root), fault).install()

    def test_orphan_in_unrecorded_parent_with_partial_receipt_blocks_all_deletion(self):
        self.partial_receipt()
        third_parent = self.root / pathlib.Path(m.TARGETS[2]).parent.as_posix().lstrip('/')
        (third_parent / ('.aktau-c2-stage-' + 'f' * 32)).mkdir()
        self.assert_rollback_blocked_without_deletion()

    def test_unknown_target_in_unrecorded_parent_blocks_all_deletion(self):
        self.partial_receipt()
        (self.root / m.TARGETS[2].lstrip('/')).mkdir()
        self.assert_rollback_blocked_without_deletion()

    def test_install_rejects_orphan_without_receipt_in_each_parent(self):
        for target in m.TARGETS:
            with self.subTest(target=target):
                parent = self.root / pathlib.Path(target).parent.as_posix().lstrip('/')
                orphan = parent / ('.aktau-c2-stage-' + 'e' * 32)
                orphan.mkdir()
                before = self.resources()
                with self.assertRaises(ValueError):
                    self.installer.install()
                self.assertEqual(self.resources(), before)
                orphan.rmdir()

    def test_unknown_stage_name_or_symlink_is_not_ignored(self):
        self.installer.install()
        parent = self.root / pathlib.Path(m.TARGETS[1]).parent.as_posix().lstrip('/')
        orphan = parent / '.aktau-c2-stage-not-a-valid-token'
        orphan.symlink_to('missing-target')
        self.assert_rollback_blocked_without_deletion()

    def test_duplicate_intent_and_incomplete_complete_marker_are_ambiguous(self):
        self.partial_receipt()
        p = self.root / m.RECEIPT.lstrip('/')
        raw = p.read_bytes()
        intent = raw.splitlines(keepends=True)[1]
        p.write_bytes(raw + intent)
        self.assert_rollback_blocked_without_deletion()
        p.write_bytes(raw + m.canonical({'complete': True}))
        self.assert_rollback_blocked_without_deletion()

    def test_header_only_receipt_without_resources_rolls_back_normally(self):
        _, _, digest = self.installer.admission()
        receipt = self.root / m.RECEIPT.lstrip('/')
        receipt.write_bytes(m.canonical({'version': 1, 'approvalHash': digest}))
        receipt.chmod(0o600)
        self.assertEqual(self.installer.rollback(), 'ROLLED_BACK_OWN_INACTIVE_RESOURCES')
        self.assertFalse(receipt.exists())

    def test_boolean_header_or_numeric_complete_marker_is_ambiguous(self):
        self.installer.install()
        receipt = self.root / m.RECEIPT.lstrip('/')
        raw = receipt.read_bytes()
        records = [json.loads(line) for line in raw.splitlines()]
        records[0]['version'] = True
        receipt.write_bytes(b''.join(m.canonical(record) for record in records))
        self.assert_rollback_blocked_without_deletion()
        records[0]['version'] = 1
        records[-1]['complete'] = 1
        receipt.write_bytes(b''.join(m.canonical(record) for record in records))
        self.assert_rollback_blocked_without_deletion()

    @contextlib.contextmanager
    def delegated(self):
        parent = self.root / 'var/lib/aktau-sync'
        self.a['operatorUid'] = 42001
        self.save()
        virtual = {parent.stat().st_ino: (42001, 42002)}
        original = os.fstat
        def fstat(fd):
            st = original(fd)
            if st.st_ino in virtual:
                values = list(st)
                values[4], values[5] = virtual[st.st_ino]
                return os.stat_result(values)
            return st
        with patch.object(m.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=42001, pw_gid=42002)) as account:
            with patch.object(m.os, 'fstat', side_effect=fstat):
                yield parent, virtual
            self.assertTrue(all(call.args == ('aktau-sync',) for call in account.call_args_list))

    def test_delegated_parent_install_rollback_preserves_parent_and_sibling(self):
        with self.delegated() as (parent, _):
            sibling = parent / 'unrelated-state'
            sibling.write_bytes(b'preserve unrelated operator data')
            before = parent.stat()
            self.assertEqual(self.installer.install(), 'C2_PROVISIONED_INACTIVE')
            self.assertEqual(self.installer.rollback(), 'ROLLED_BACK_OWN_INACTIVE_RESOURCES')
            after = parent.stat()
            self.assertEqual((before.st_ino, before.st_uid, before.st_gid, before.st_mode),
                             (after.st_ino, after.st_uid, after.st_gid, after.st_mode))
            self.assertEqual(list(parent.iterdir()), [sibling])
            self.assertEqual(sibling.read_bytes(), b'preserve unrelated operator data')

    def test_delegated_bad_uid_gid_mode_and_approval_block_before_writes(self):
        with self.delegated() as (parent, virtual):
            ino = parent.stat().st_ino
            for uid, gid in [(42003, 42002), (42001, 42003)]:
                virtual[ino] = (uid, gid)
                before = self.resources()
                with self.assertRaises(ValueError):
                    self.installer.install()
                self.assertEqual(self.resources(), before)
            virtual[ino] = (42001, 42002)
            for mode in [0o700, 0o750, 0o775, 0o1777]:
                parent.chmod(mode)
                before = self.resources()
                with self.assertRaises(ValueError):
                    self.installer.install()
                self.assertEqual(self.resources(), before)
            parent.chmod(0o755)
            self.a['operatorUid'] = 42004
            self.save()
            before = self.resources()
            with self.assertRaises(ValueError):
                self.installer.install()
            self.assertEqual(self.resources(), before)

    def test_delegated_symlink_and_non_directory_rejected(self):
        with self.delegated() as (parent, _):
            original = parent.with_name('original-parent')
            parent.rename(original)
            parent.symlink_to(original)
            with self.assertRaises(OSError):
                self.installer.install()
            parent.unlink()
            parent.write_bytes(b'not a directory')
            with self.assertRaises(OSError):
                self.installer.install()

    def test_delegated_parent_replaced_after_inventory_blocks_before_receipt(self):
        with self.delegated() as (parent, virtual):
            original_inventory = self.installer.inventory
            snapshot = None
            def inventory(*args, **kwargs):
                nonlocal snapshot
                original_inventory(*args, **kwargs)
                parent.rename(parent.with_name('old-parent'))
                parent.mkdir(mode=0o755)
                virtual[parent.stat().st_ino] = (42001, 42002)
                snapshot = self.resources()
            self.installer.inventory = inventory
            with self.assertRaises(ValueError):
                self.installer.install()
            self.assertIsNotNone(snapshot)
            self.assertEqual(self.resources(), snapshot)

    def test_delegated_parent_mode_drift_after_inventory_blocks_before_receipt(self):
        with self.delegated() as (parent, _):
            original_inventory = self.installer.inventory
            snapshot = None
            def inventory(*args, **kwargs):
                nonlocal snapshot
                original_inventory(*args, **kwargs)
                parent.chmod(0o750)
                snapshot = self.resources()
            self.installer.inventory = inventory
            with self.assertRaises(ValueError):
                self.installer.install()
            self.assertIsNotNone(snapshot)
            self.assertEqual(self.resources(), snapshot)

    def test_delegated_rollback_parent_inode_replacement_is_blocked(self):
        with self.delegated() as (parent, virtual):
            self.installer.install()
            old = parent.with_name('old-parent')
            parent.rename(old)
            parent.mkdir(mode=0o755)
            virtual[parent.stat().st_ino] = (42001, 42002)
            (old / 'c2').rename(parent / 'c2')
            self.assert_rollback_blocked_without_deletion()

    def test_delegated_target_and_ledger_modes_and_live_state_fail_closed(self):
        with self.delegated() as (parent, _):
            self.installer.install()
            target = parent / 'c2'
            for p in (target, target / 'ledger'):
                p.chmod(0o755)
                self.assert_rollback_blocked_without_deletion()
                p.chmod(0o700)
            private = target / 'reader.dsn'
            private.write_bytes(b'synthetic only')
            self.assert_rollback_blocked_without_deletion()
            private.unlink()
            (target / 'ledger' / 'active-state').write_bytes(b'synthetic only')
            self.assert_rollback_blocked_without_deletion()

    def test_delegated_crash_orphan_and_registered_stage_controls(self):
        with self.delegated():
            self.crash_after_mkdir_before_intent(3)

    def test_delegated_first_target_crash_orphan_is_preserved(self):
        with self.delegated():
            self.crash_after_mkdir_before_intent(1)

    def test_delegated_second_target_crash_orphan_is_preserved(self):
        with self.delegated():
            self.crash_after_mkdir_before_intent(2)

    def test_delegated_registered_partial_stage_can_roll_back(self):
        with self.delegated():
            count = 0
            def fault(point):
                nonlocal count
                if point == 'before_rename':
                    count += 1
                    if count == 3:
                        raise RuntimeError('synthetic third-stage crash')
            with self.assertRaises(RuntimeError):
                m.Installer(str(self.root), fault).install()
            self.assertEqual(self.installer.rollback(), 'ROLLED_BACK_OWN_INACTIVE_RESOURCES')

    def test_delegation_cannot_weaken_root_only_paths(self):
        with self.delegated() as (_, virtual):
            for relative in ['var', 'var/lib', 'etc', 'etc/aktau-c2-install', m.APPROVAL.lstrip('/'),
                             'var/lib/aktau-c2-install', m.BUNDLE.lstrip('/'), 'usr/local/libexec']:
                p = self.root / relative
                virtual[p.stat().st_ino] = (42001, 42002)
                before = self.resources()
                with self.assertRaises(ValueError):
                    self.installer.install()
                self.assertEqual(self.resources(), before)
                del virtual[p.stat().st_ino]

    def test_general_directory_and_receipt_are_never_delegated(self):
        with self.delegated() as (_, virtual):
            with self.assertRaises(ValueError):
                self.installer.directory('/var/lib/aktau-sync')
            self.installer.install()
            receipt = self.root / m.RECEIPT.lstrip('/')
            virtual[receipt.stat().st_ino] = (42001, 42002)
            self.assert_rollback_blocked_without_deletion()

    def test_delegated_wrong_target_and_ledger_owner_or_group_blocks_rollback(self):
        with self.delegated() as (parent, virtual):
            self.installer.install()
            for p in [parent / 'c2', parent / 'c2/ledger']:
                for owner in [(os.geteuid() + 100, os.getegid()), (os.geteuid(), os.getegid() + 100)]:
                    virtual[p.stat().st_ino] = owner
                    self.assert_rollback_blocked_without_deletion()
                del virtual[p.stat().st_ino]

    def test_delegated_ledger_replacement_after_validation_blocks_all_deletion(self):
        with self.delegated() as (parent, _):
            self.installer.install()
            original = self.installer.inventory
            calls = 0
            snapshot = None
            def inventory(*args, **kwargs):
                nonlocal calls, snapshot
                original(*args, **kwargs)
                calls += 1
                if calls == 2:
                    ledger = parent / 'c2/ledger'
                    ledger.rename(parent / 'c2/original-ledger')
                    ledger.mkdir(mode=0o700)
                    snapshot = self.resources()
            self.installer.inventory = inventory
            with self.assertRaises(ValueError):
                self.installer.rollback()
            self.assertIsNotNone(snapshot)
            self.assertEqual(self.resources(), snapshot)

    def test_delegated_invalid_os_gid_and_env_path_override_fail_closed(self):
        with self.delegated() as (parent, _):
            with patch.object(m.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=42001, pw_gid=-1)):
                before = self.resources()
                with self.assertRaises(ValueError):
                    self.installer.install()
                self.assertEqual(self.resources(), before)
            with patch.dict(os.environ, {'C2_PARENT': '/tmp/not-a-target', 'C2_OPERATOR_UID': '0'}):
                self.installer.install()
                self.assertTrue((parent / 'c2').is_dir())
                self.installer.rollback()

    def test_delegated_parent_replaced_between_open_and_fstat(self):
        with self.delegated() as (parent, virtual):
            original = os.open
            snapshot = None
            def opened(name, *args, **kwargs):
                nonlocal snapshot
                fd = original(name, *args, **kwargs)
                if name == 'aktau-sync':
                    parent.rename(parent.with_name('old-parent'))
                    parent.mkdir(mode=0o755)
                    virtual[parent.stat().st_ino] = (42001, 42002)
                    snapshot = self.resources()
                return fd
            with patch.object(m.os, 'open', side_effect=opened):
                with self.assertRaises(ValueError):
                    self.installer.install()
            self.assertIsNotNone(snapshot)
            self.assertEqual(self.resources(), snapshot)

    def test_delegated_target_replaced_between_stat_and_open_blocks_all_deletion(self):
        with self.delegated() as (parent, _):
            self.installer.install()
            original = os.open
            snapshot = None
            def opened(name, *args, **kwargs):
                nonlocal snapshot
                if name == 'c2':
                    (parent / 'c2').rename(parent / 'original-c2')
                    (parent / 'c2').mkdir(mode=0o700)
                    (parent / 'c2/ledger').mkdir(mode=0o700)
                    snapshot = self.resources()
                return original(name, *args, **kwargs)
            with patch.object(m.os, 'open', side_effect=opened):
                with self.assertRaises(ValueError):
                    self.installer.rollback()
            self.assertIsNotNone(snapshot)
            self.assertEqual(self.resources(), snapshot)

    def test_delegated_rollback_parent_uid_gid_and_mode_drift_preserves_everything(self):
        with self.delegated() as (parent, virtual):
            self.installer.install()
            ino = parent.stat().st_ino
            for owner in [(42003, 42002), (42001, 42003)]:
                virtual[ino] = owner
                self.assert_rollback_blocked_without_deletion()
            virtual[ino] = (42001, 42002)
            parent.chmod(0o750)
            self.assert_rollback_blocked_without_deletion()
if __name__ == '__main__':
    unittest.main()
