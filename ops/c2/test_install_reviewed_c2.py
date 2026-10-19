import hashlib
import importlib.util
import json
import os
import pathlib
import tempfile
import unittest
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


if __name__ == '__main__':
    unittest.main()
