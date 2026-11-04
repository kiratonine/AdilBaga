"""Synthetic release metadata and disposable filesystems only; no host writes."""
import copy
import errno
import hashlib
import importlib.util
import io
import json
import pathlib
import os
import tempfile
import signal
import subprocess
import sys
import tarfile
import unittest
import zipfile
import base64
import struct
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('promotion', pathlib.Path(__file__).with_name('publisher-promotion.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ProtocolTests(unittest.TestCase):
    def metadata(self):
        sha = 'a' * 40
        return dict(sha=sha, main=sha, now=2000,
                    artifact={'id': 7, 'name': f'aktau-sync-c2-{sha}-9-1', 'expired': False,
                              'expires_at': '2099-01-01T00:00:00Z', 'digest': 'sha256:' + 'd' * 64,
                              'size_in_bytes': 123, 'workflow_run': {'id': 9, 'head_sha': sha}},
                    build={'id': 9, 'run_attempt': 1, 'head_sha': sha, 'head_branch': 'main',
                           'event': 'workflow_dispatch', 'path': m.BUILD_WORKFLOW, 'workflow_id': 10,
                           'repository': {'full_name': m.REPOSITORY}, 'head_repository': {'full_name': m.REPOSITORY},
                           'status': 'completed', 'conclusion': 'success'},
                    workflow={'id': 10, 'path': m.BUILD_WORKFLOW, 'state': 'active'},
                    ci={'id': 8, 'run_attempt': 1, 'head_sha': sha, 'head_branch': 'main', 'event': 'push',
                        'path': '.github/workflows/ci.yml', 'status': 'completed', 'conclusion': 'success',
                        'repository': {'full_name': m.REPOSITORY}, 'head_repository': {'full_name': m.REPOSITORY}},
                    jobs=[{'name': n, 'status': 'completed', 'conclusion': 'success'} for n in m.CI_JOBS])

    def test_exact_main_successful_origin_build_and_ci(self):
        self.assertEqual(m.verify_release(**self.metadata()), 'a' * 40)

    def test_main_ci_producer_artifact_fail_closed(self):
        changes = [('main', None, 'b' * 40), ('build', 'event', 'pull_request'),
                   ('build', 'head_branch', 'feature'), ('build', 'head_sha', 'b' * 40),
                   ('build', 'conclusion', 'failure'), ('build', 'status', 'in_progress'),
                   ('build', 'run_attempt', True), ('build', 'path', '.github/workflows/other.yml'),
                   ('artifact', 'expired', True), ('artifact', 'id', True),
                   ('artifact', 'name', 'untrusted'), ('artifact', 'digest', 'sha256:invalid'),
                   ('artifact', 'expires_at', '1970-01-01T00:00:01Z'),
                   ('workflow', 'state', 'disabled_manually'), ('ci', 'event', 'pull_request'),
                   ('ci', 'conclusion', 'failure'), ('ci', 'path', '.github/workflows/other.yml')]
        for field, key, value in changes:
            with self.subTest(field=field, key=key, value=value):
                args = self.metadata()
                if key is None:
                    args[field] = value
                else:
                    args[field][key] = value
                with self.assertRaises(m.Blocked):
                    m.verify_release(**args)
        for field in ['ci', 'build']:
            args = self.metadata(); args[field]['repository']['full_name'] = 'attacker/repo'
            with self.assertRaises(m.Blocked): m.verify_release(**args)
        for change in ['missing', 'failed', 'duplicate']:
            args = self.metadata()
            if change == 'missing': args['jobs'].pop()
            elif change == 'failed': args['jobs'][0]['conclusion'] = 'skipped'
            else: args['jobs'][-1] = copy.deepcopy(args['jobs'][0])
            with self.assertRaises(m.Blocked): m.verify_release(**args)

    def test_runtime_relevance_excludes_unrelated_changes(self):
        for name in ['frontend/src/page.tsx', 'ops/sync/README.md', 'docs/report.md',
                     'backend-go/internal/postgres/dashboard.go', 'backend-go/cmd/api/main.go',
                     'pipeline/test/dina.test.ts', 'backend-go/internal/revalidation/client_test.go']:
            self.assertFalse(m.relevant([name]), name)
        for name in ['pipeline/src/scrapers/dina.ts', 'pipeline/pnpm-lock.yaml',
                     'pipeline/scripts/daily-sync.sh', 'backend-go/internal/revalidation/client.go',
                     'backend-go/cmd/c2projection/main.go', 'ops/c2/auto-custodian.py',
                     'data/mapping/dictionary.json']:
            self.assertTrue(m.relevant([name]), name)

    def test_canonical_json_rejects_duplicates_nonfinite_bool_and_extra_bytes(self):
        for raw in [b'{"x":1,"x":2}\n', b'{"x":NaN}\n', b'{}\n{}\n', b'{}', b'{ }\n']:
            with self.assertRaises(m.Blocked): m.parse(raw)
        self.assertEqual(m.parse(b'{"x":1}\n'), {'x': 1})

    def test_zip_inventory_and_tar_paths_types_and_capacity(self):
        for name, kind in [('../escape', 'file'), ('/absolute', 'file'), ('link', 'symlink'), ('link', 'hardlink')]:
            raw = io.BytesIO()
            with tarfile.open(fileobj=raw, mode='w') as tar:
                item = tarfile.TarInfo(name); item.size = 1
                if kind == 'symlink': item.type = tarfile.SYMTYPE; item.linkname = '/etc/passwd'; item.size = 0
                if kind == 'hardlink': item.type = tarfile.LNKTYPE; item.linkname = 'other'; item.size = 0
                tar.addfile(item, io.BytesIO(b'x') if item.isfile() else None)
            with self.assertRaises(m.Blocked): m.unpack_tar(raw.getvalue())
        for names in [['wrong'], ['promotion.tar', 'extra'], ['promotion.tar', 'promotion.tar']]:
            raw = io.BytesIO()
            with zipfile.ZipFile(raw, 'w') as z:
                for name in names: z.writestr(name, b'not a release')
            with self.assertRaises(m.Blocked): m.unpack_zip(raw.getvalue())

    def test_descendant_timeout_cleanup_when_direct_child_already_exited(self):
        # Fixture startup is not the command's timeout/cleanup assertion. Wait
        # for the real descendant and leader exit before starting that clock;
        # fixed .3s interpreter/fork assumptions race under Python3.13/load.
        import select
        import time
        with tempfile.TemporaryDirectory(prefix='promotion-owned-child-') as temp:
            pidfile = pathlib.Path(temp)/'pid'
            ready_read, ready_write = os.pipe2(os.O_CLOEXEC)
            source = ('import os,time,pathlib,sys\n'
                      'pid=os.fork()\n'
                      'if pid == 0:\n'
                      ' pathlib.Path(sys.argv[1]).write_text(str(os.getpid()))\n'
                      ' os.write(int(sys.argv[2]), b"R")\n'
                      ' time.sleep(20)\n'
                      'else:\n'
                      ' os._exit(0)\n')
            original_popen = subprocess.Popen
            def ready_process(*args, **kwargs):
                child = original_popen(*args, **kwargs)
                deadline = time.monotonic() + 5
                try:
                    self.assertTrue(select.select([ready_read], [], [], max(0, deadline-time.monotonic()))[0],
                                    'fixture descendant readiness deadline')
                    self.assertEqual(os.read(ready_read, 1), b'R')
                    self.assertTrue(pidfile.is_file(), 'ready must follow durable PID publication')
                    self.assertEqual(child.wait(timeout=max(.001, deadline-time.monotonic())), 0,
                                     'direct child must already have exited')
                    return child
                except BaseException:
                    # Popen failed its fixture handshake before command() can
                    # own cleanup. Reap exactly this new real process group.
                    try: os.killpg(child.pid, signal.SIGKILL)
                    except ProcessLookupError: pass
                    child.wait(timeout=2)
                    child.stdout.close()
                    raise
            pid = None
            try:
                with patch.object(m.subprocess, 'Popen', side_effect=ready_process):
                    with self.assertRaises(m.Blocked):
                        m.command([sys.executable,'-c',source,str(pidfile),str(ready_write)],
                                  timeout=.3, pass_fds=(ready_write,))
                pid = int(pidfile.read_text())
                state = pathlib.Path('/proc/'+str(pid)+'/stat')
                self.assertFalse(state.exists() and state.read_text().rsplit(') ',1)[1].split()[0] != 'Z',
                                 'owned descendant must not survive failed command')
            finally:
                os.close(ready_read); os.close(ready_write)
                if pid is None and pidfile.exists(): pid = int(pidfile.read_text())
                if pid is not None:
                    try: os.kill(pid,signal.SIGKILL)
                    except ProcessLookupError: pass

    def test_go_string_global_is_read_from_bounded_elf_not_build_labels(self):
        raw = bytearray(1024)
        raw[:6] = b'\x7fELF\x02\x01'; raw[18:20] = b'\x3e\x00'
        struct.pack_into('<QQ', raw, 32, 64, 128)
        struct.pack_into('<HHHH', raw, 54, 56, 1, 64, 2)
        struct.pack_into('<IIQQQQQQ', raw, 64, 1, 4, 0, 0x1000, 0, len(raw), len(raw), 4096)
        struct.pack_into('<IIQQQQIIQQ', raw, 128, 0, 2, 0, 0, 300, 24, 1, 0, 8, 24)
        names = b'\0main.sourceSHA\0'
        struct.pack_into('<IIQQQQIIQQ', raw, 192, 0, 3, 0, 0, 400, len(names), 0, 0, 1, 0)
        raw[400:400 + len(names)] = names
        struct.pack_into('<IBBHQQ', raw, 300, 1, 0x11, 0, 1, 0x1200, 16)
        struct.pack_into('<QQ', raw, 512, 0x1240, 40)
        raw[576:616] = b'a' * 40
        self.assertEqual(m.embedded_source(bytes(raw)), 'a' * 40)
        for at, data in [(512, struct.pack('<Q', 0xffffffffffffffff)),
                         (520, struct.pack('<Q', 41)), (576, b'Z'),
                         (401, b'X'), (32, struct.pack('<Q', 999999))]:
            changed = bytearray(raw); changed[at:at+len(data)] = data
            with self.subTest(at=at), self.assertRaises(m.Blocked): m.embedded_source(bytes(changed))
        with self.assertRaises(m.Blocked): m.embedded_source(bytes(raw[:600]))


class FixtureHost:
    """Explicit synthetic runtime authority; cannot mint production capability."""
    def __init__(self):
        self.current = {'sha': 'b' * 40, 'branch': 'deploy/fixture'}
        self.state = {'reader': [1, 2, 1000, 1000, 0o600], 'ledger': 'preserved-safe-fixture-hash'}
        self.active = False
        self.calls = []
        self.on_import = None

    def publisher(self): return dict(self.current)
    def idle(self): m.need(not self.active, 'active_runtime')
    def runtime_wiring(self, *args): pass
    def check_release(self, *args, **kwargs): pass
    def verify_old_closure(self, *args, **kwargs): return True
    def invariants(self): return copy.deepcopy(self.state)
    def import_source(self, *args):
        self.calls.append('import_verified_source')
        if self.on_import: self.on_import()
    def binaries(self, *args): self.calls.append('verify_real_boundary_model')
    def switch(self, value): self.calls.append('switch'); self.current = dict(value)


class TransactionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='c2-promotion-fixture-'); self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name); self.root.chmod(0o700)
        self.fs = m.Filesystem(self.root); self.host = FixtureHost()
        for path in [m.BASE + '/releases', m.BASE + '/state', *[os.path.dirname(x) for x in m.FILES.values()],
                     os.path.dirname(m.AUTH)]:
            self.fs.path(path).mkdir(parents=True, exist_ok=True, mode=0o755)
        self.old = {}
        for name, path in m.FILES.items():
            self.fs.write(path, ('old-' + name).encode(), 0o444); self.old[path] = self.fs.read(path)
        self.site = {'version': 2, 'evidence': 'site-content-verification', 'origin': 'https://aktau.market',
                     'representations': ['product_ru', 'product_kk', 'sitemap', 'catalog', 'dashboard', 'category']}
        self.fs.write(m.SITE, m.canonical(self.site), 0o644)
        for path in m.RECORDS:
            self.fs.write(path, m.canonical({'sourceSha': 'b' * 40}), 0o644); self.old[path] = self.fs.read(path)
        self.contents = {name: ('new-' + name).encode() for name in m.FILES}
        self.contents.update({'source.bundle': b'public-fixture-source', 'promotion.json': b'fixture'})
        self.manifest = {'sourceSha': 'a' * 40, 'files': {n: m.digest(self.contents[n]) for n in m.FILES}}
        self.policy = {}

    def transaction(self, fault=None): return m.Transaction(self.fs, self.host, fault)

    def test_source_divergence_never_aligned_then_full_transaction_aligns(self):
        self.assertFalse(self.transaction().aligned('a' * 40, self.manifest))
        before = self.host.invariants()
        self.assertEqual(self.transaction().promote(self.contents, self.manifest, self.policy, 'fixture-1'), 'C2_CONFIG_SOURCE_ALIGNED')
        self.assertTrue(self.transaction().aligned('a' * 40, self.manifest))
        self.assertEqual(self.host.publisher()['sha'], 'a' * 40)
        self.assertEqual(self.host.invariants(), before)
        self.assertFalse(self.fs.path(m.INTERLOCK).exists())
        self.assertTrue(self.fs.path(m.BASE + '/releases/fixture-1/receipt.json').exists())
        self.assertFalse(any('apply' in x or 'ready' in x for x in self.host.calls))

    def test_same_source_aligned_noop_and_replay_never_mutate(self):
        self.transaction().promote(self.contents, self.manifest, self.policy, 'fixture-1')
        calls = list(self.host.calls)
        self.assertEqual(self.transaction().promote(self.contents, self.manifest, self.policy, 'fixture-1'), 'NO_OP')
        self.assertEqual(self.host.calls, calls)
        self.host.current = {'sha': 'b' * 40, 'branch': 'deploy/fixture'}
        with self.assertRaises(m.Blocked): self.transaction().promote(self.contents, self.manifest, self.policy, 'fixture-1')

    def test_active_runtime_or_existing_recovery_blocks_before_writes(self):
        self.host.active = True
        with self.assertRaises(m.Blocked): self.transaction().promote(self.contents, self.manifest, self.policy, 'busy')
        self.assertFalse(self.fs.path(m.INTERLOCK).exists())
        self.host.active = False; self.fs.write(m.INTERLOCK, b'{"foreign":"do not delete"}\n', 0o644)
        with self.assertRaises(m.Blocked): self.transaction().promote(self.contents, self.manifest, self.policy, 'busy')
        self.assertEqual(self.fs.read(m.INTERLOCK), b'{"foreign":"do not delete"}\n')

    def test_mid_promotion_head_change_never_replaces_kit(self):
        self.host.on_import = lambda: self.host.current.update(sha='c' * 40)
        with self.assertRaises(m.Blocked): self.transaction().promote(self.contents, self.manifest, self.policy, 'changed')
        self.assertTrue(self.fs.path(m.INTERLOCK).exists())
        for p, data in self.old.items(): self.assertEqual(self.fs.read(p), data)

    def test_exception_after_each_live_phase_restores_both_and_preserves_backup(self):
        # One fresh test instance per fault; no cleanup of foreign/live resources.
        for phase in ['switching', 'publisher', *['file_' + str(i) for i in range(14)]]:
            with self.subTest(phase=phase):
                if self.fs.path(m.INTERLOCK).exists(): self.fail('prior fixture left interlock')
                def fault(at):
                    if at == phase: raise RuntimeError('synthetic failure')
                with self.assertRaises(RuntimeError): self.transaction(fault).promote(self.contents, self.manifest, self.policy, 'fault-' + phase)
                self.assertEqual(self.host.publisher(), {'sha': 'b' * 40, 'branch': 'deploy/fixture'})
                for p, data in self.old.items(): self.assertEqual(self.fs.read(p), data)
                self.assertFalse(self.fs.path(m.INTERLOCK).exists())

    def test_real_sigkill_each_durable_phase_interlocks_then_explicit_full_rollback(self):
        phases = ['intent', 'stage_created', 'backed_up', 'candidate_staged', 'prepared', 'switching', 'publisher', *['file_' + str(i) for i in range(14)]]
        for phase in phases:
            with self.subTest(phase=phase):
                child = os.fork()
                if child == 0:
                    def crash(at):
                        if at == phase: os.kill(os.getpid(), signal.SIGKILL)
                    try: self.transaction(crash).promote(self.contents, self.manifest, self.policy, 'crash-' + phase)
                    finally: os._exit(4)
                _, status = os.waitpid(child, 0)
                self.assertEqual(os.WTERMSIG(status), signal.SIGKILL)
                with self.assertRaises(m.Blocked): self.transaction().promote(self.contents, self.manifest, self.policy, 'blocked-' + phase)
                j = m.parse(self.fs.read(m.INTERLOCK))
                if phase in ['intent', 'stage_created']:
                    # No live change; unknown incomplete preparation is retained.
                    with self.assertRaises(m.Blocked): self.transaction().rollback(j)
                    self.fs.remove_owned(m.INTERLOCK, m.canonical(j))  # fixture-only reconciliation
                    if self.fs.path(j['directory']).exists():
                        os.rename(self.fs.path(j['directory']), self.root/('owned-forensic-'+phase))
                else:
                    self.host.current = j['newPublisher'] if phase == 'publisher' or phase.startswith('file_') else j['oldPublisher']
                    self.assertEqual(self.transaction().rollback(j), 'ROLLED_BACK_PUBLISHER_AND_AUTHORITY')
                    for p, data in self.old.items(): self.assertEqual(self.fs.read(p), data)

    def test_foreign_partial_target_preserves_every_resource_before_rollback(self):
        def crash(at):
            if at == 'publisher': raise KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt): self.transaction(crash).promote(self.contents, self.manifest, self.policy, 'foreign')
        target = next(iter(m.FILES.values())); self.fs.write(target, b'foreign changed data', 0o444, replace=True)
        before = {p: self.fs.read(p) for p in self.old}
        with self.assertRaises(m.Blocked): self.transaction().rollback(m.parse(self.fs.read(m.INTERLOCK)))
        self.assertEqual({p: self.fs.read(p) for p in self.old}, before)
        self.assertTrue(self.fs.path(m.INTERLOCK).exists())

    def test_orphan_stage_without_interlock_still_blocks_next_promotion(self):
        self.fs.mkdir(m.BASE+'/releases/orphan')
        with self.assertRaisesRegex(m.Blocked,'orphan_release_stage'):
            self.transaction().promote(self.contents,self.manifest,self.policy,'next')
        self.assertTrue(self.fs.path(m.BASE+'/releases/orphan').is_dir())
        self.assertFalse(self.fs.path(m.INTERLOCK).exists())

    def test_deliberate_last_release_rollback_preserves_new_terminal_ledger(self):
        self.transaction().promote(self.contents, self.manifest, self.policy, 'fixture-last')
        self.host.state['ledger'] = 'new-terminal-attempt-not-to-be-rewound'
        state = self.host.invariants()
        self.assertEqual(self.transaction().rollback_last(self.policy), 'ROLLED_BACK_PUBLISHER_AND_AUTHORITY')
        self.assertEqual(self.host.invariants(), state)
        self.assertEqual(self.host.publisher()['sha'], 'b' * 40)
        for path, raw in self.old.items(): self.assertEqual(self.fs.read(path), raw)
        with self.assertRaises(m.Blocked): self.transaction().rollback_last(self.policy)

    def test_crash_rollback_checks_ledger_before_any_deletion_or_live_write(self):
        self.transaction().promote(self.contents, self.manifest, self.policy, 'fixture-ledger')
        j = m.parse(self.fs.read(m.BASE+'/releases/fixture-ledger/receipt.json'))
        self.host.state['ledger'] = 'unexpected-new-ledger'
        before = {p: self.fs.read(p) for p in self.old}; current = self.host.publisher()
        with self.assertRaisesRegex(m.Blocked,'rollback_state_changed'): self.transaction().rollback(j)
        self.assertEqual({p: self.fs.read(p) for p in self.old}, before)
        self.assertEqual(self.host.publisher(), current)

    def test_symlink_hardlink_writable_and_unsafe_parent_rejected(self):
        path = m.BASE + '/state/bounded'; self.fs.write(path, b'fixture', 0o600)
        self.fs.path(path).chmod(0o666)
        with self.assertRaises(m.Blocked): self.fs.read(path)
        self.fs.path(path).chmod(0o600)
        os.link(self.fs.path(path), self.fs.path(path + '-alias'))
        with self.assertRaises(m.Blocked): self.fs.read(path)
        self.fs.path(path + '-alias').unlink()
        self.fs.path(path + '-link').symlink_to(self.fs.path(path))
        with self.assertRaises(OSError): self.fs.read(path + '-link')
        self.fs.path(m.BASE + '/state').chmod(0o777)
        with self.assertRaises(m.Blocked): self.fs.read(path)


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.meta = ProtocolTests.metadata(self)
        self.sha = 'a' * 40
        self.source = b'fixed trusted producer source\n'
        self.policy = {'version': 1, 'enabled': True, 'repository': m.REPOSITORY, 'buildWorkflow': m.BUILD_WORKFLOW,
                       'producerFiles': {n: m.digest(self.source) for n in [m.BUILD_WORKFLOW, 'scripts/ops/build-sync-promotion.py', 'ops/c2/publisher-promotion.py']},
                       'runtimeFiles': {n:m.digest(self.source) for n in m.RUNTIME_FILES},
                       'initialBridge': {'publisherSha': 'fd2b9a3eec417f739299e3d1ccc1d3d6b09860fd',
                                         'ancestorSha': 'bb1842bfc3ad25e74840072482801a8656ec7679',
                                         'requiredBlobs': {'pipeline/src/scrapers/dina.ts': '1daba18219e4841fd8c901182ee7edee5cc7dd05',
                                                           'pipeline/test/dina.test.ts': 'b5b1afd4d84826232f6fc3c0f3497947f6912cd0'}}}
        self.fs = SimpleNamespace(read=lambda path: m.canonical(self.policy) if path == m.POLICY else (_ for _ in ()).throw(AssertionError('no other reads permitted')))
        elf = bytearray(64); elf[:6] = b'\x7fELF\x02\x01'; elf[18:20] = b'\x3e\x00'
        self.contents = {n: bytes(elf) if n in ['node', 'ingest', 'relayprobe', 'c2projection'] else b'public fixture module\n' for n in m.FILES}
        self.contents['source-manifest.json'] = m.canonical({'sourceSha': self.sha, 'recipe': m.RECIPE, 'nodeMajor': 24})
        self.contents['source.bundle'] = b'fixture-not-executed-as-git'
        self.manifest = {'version': 1, 'kind': 'promote', 'sourceSha': self.sha, 'sourceTree': 'f' * 40,
                         'goVersion': 'go1.27.3', 'nodeVersion': 'v24.18.0', 'recipe': m.RECIPE,
                         'ciRunId': 8, 'ciAttempt': 1, 'buildRunId': 9, 'buildAttempt': 1,
                         'files': {n: m.digest(self.contents[n]) for n in m.FILES},
                         'sourceBundleSha256': m.digest(self.contents['source.bundle'])}
        self.request = {'version': 1, 'operation': 'promote', 'sourceSha': self.sha, 'ciRunId': 8,
                        'buildRunId': 9, 'artifactId': 7, 'size': 1}
        self.replies = {
            'actions/artifacts/7': self.meta['artifact'], 'actions/runs/9': self.meta['build'],
            'actions/workflows/10': self.meta['workflow'], 'actions/runs/8': self.meta['ci'],
            'actions/runs/8/jobs?per_page=100': {'jobs': self.meta['jobs']},
            'actions/runs/9/jobs?per_page=100': {'jobs': [{'name': 'Build immutable sync + C2', 'conclusion': 'success',
                'steps': [{'name': 'Upload immutable sync + C2 artifact', 'conclusion': 'success'}]}]},
            'git/ref/heads/main': {'object': {'sha': self.sha}},
            'git/commits/' + self.sha: {'tree': {'sha': 'f' * 40}, 'parents': [{'sha': 'b' * 40}]},
            'compare/' + 'b' * 40 + '...' + self.sha: {'files': [{'filename': 'pipeline/src/scrapers/dina.ts'}]}}
        for path in self.policy['producerFiles']:
            self.replies['contents/' + path + '?ref=' + self.sha] = {'encoding': 'base64', 'content': base64.b64encode(self.source).decode()}

    def archive(self):
        self.contents['promotion.json'] = m.canonical(self.manifest)
        raw = io.BytesIO()
        with tarfile.open(fileobj=raw, mode='w', format=tarfile.USTAR_FORMAT) as t:
            for name, data in self.contents.items():
                e = tarfile.TarInfo(name); e.size = len(data); e.mode = 0o444
                t.addfile(e, io.BytesIO(data))
        z = io.BytesIO()
        with zipfile.ZipFile(z, 'w') as f: f.writestr('promotion.tar', raw.getvalue())
        data = z.getvalue()
        self.replies['actions/artifacts/7'].update(size_in_bytes=len(data), digest='sha256:' + m.digest(data))
        self.request['size'] = len(data)
        return data

    def admit(self, raw):
        with patch.object(m, 'github', side_effect=lambda path: copy.deepcopy(self.replies[path])), patch.object(m.time, 'time', return_value=2000), patch.object(m,'memory_guard'):
            return m.admission(self.fs, self.request, raw)

    def test_actual_root_admission_uses_independent_digest_and_all_producer_pins(self):
        raw = self.archive(); contents, manifest, policy, identity = self.admit(raw)
        self.assertEqual(identity, 'build-9-1'); self.assertEqual(manifest, self.manifest)
        self.assertEqual(set(contents), set(m.FILES) | {'source.bundle', 'promotion.json'})
        self.assertEqual(policy, self.policy)

    def test_manual_workflow_requires_independently_updated_producer_pin(self):
        raw = self.archive()
        updated_workflow = b'reviewed manual-artifact workflow fixture\n'
        path = 'contents/' + m.BUILD_WORKFLOW + '?ref=' + self.sha
        self.replies[path]['content'] = base64.b64encode(updated_workflow).decode()
        with self.assertRaisesRegex(m.Blocked, 'producer_source_changed'):
            self.admit(raw)
        # Explicit synthetic independent admin policy model; never a host write.
        self.policy['producerFiles'][m.BUILD_WORKFLOW] = m.digest(updated_workflow)
        self.assertEqual(self.admit(raw)[3], 'build-9-1')
        self.manifest['kind'] = 'build-only'
        with self.assertRaisesRegex(m.Blocked, 'build_only_not_authorized'):
            self.admit(self.archive())

    def test_self_consistent_unapproved_zip_wrong_digest_or_unavailable_authority_rejected(self):
        raw = self.archive()
        with self.assertRaises(m.Blocked): self.admit(raw + b'changed')
        self.replies['actions/artifacts/7']['digest'] = 'sha256:' + '0' * 64
        with self.assertRaises(m.Blocked): self.admit(raw)
        with patch.object(m, 'github', side_effect=m.Blocked('trusted_authorization_unavailable')):
            with self.assertRaises(m.Blocked): m.admission(self.fs, self.request, raw)

    def test_source_approval_not_empty_boolean_bypass_or_unknown_producer(self):
        raw = self.archive()
        for change in [{'producerFiles': {}}, {'enabled': False}, {'version': True}, {'approved': True}]:
            original = self.policy; self.policy = {**original, **change}
            with self.assertRaises(m.Blocked): self.admit(raw)
            self.policy = original
        path = 'contents/scripts/ops/build-sync-promotion.py?ref=' + self.sha
        self.replies[path]['content'] = base64.b64encode(b'tampered producer').decode()
        with self.assertRaises(m.Blocked): self.admit(raw)

    def test_package_each_of_twelve_changed_even_with_valid_github_archive_digest(self):
        for name in m.FILES:
            with self.subTest(name=name):
                old = self.contents[name]; self.contents[name] += b'tamper'
                raw = self.archive()
                with self.assertRaises(m.Blocked): self.admit(raw)
                self.contents[name] = old

    def test_build_only_wrong_tree_wrong_identity_unsupported_toolchain_and_boolean_attempt(self):
        for field, value in [('kind', 'build-only'), ('sourceTree', 'e' * 40), ('sourceSha', 'b' * 40),
                             ('goVersion', 'go1.27.2'), ('nodeVersion', 'v20.0.0'), ('ciAttempt', True),
                             ('buildRunId', 8), ('buildAttempt', 2)]:
            with self.subTest(field=field):
                old = self.manifest[field]; self.manifest[field] = value; raw = self.archive()
                with self.assertRaises(m.Blocked): self.admit(raw)
                self.manifest[field] = old

    def test_automatic_frontend_or_docs_only_push_rejected_before_promotion(self):
        self.meta['build']['event'] = 'workflow_run'; raw = self.archive()
        for file in ['frontend/src/page.tsx', 'ops/sync/README.md', 'backend-go/internal/postgres/dashboard.go']:
            self.replies['compare/' + 'b' * 40 + '...' + self.sha]['files'] = [{'filename': file}]
            with self.assertRaises(m.Blocked): self.admit(raw)

    def test_real_git_boundary_blocks_unknown_dependencies_and_protected_delta(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        root = pathlib.Path(temp.name); root.chmod(0o700); fs = m.Filesystem(root)
        directory = m.BASE + '/releases/dependency-test'; fs.path(directory).mkdir(parents=True)
        fs.write(directory + '/source.bundle', b'public mocked transport fixture', 0o444)
        bundle = str(fs.path(directory + '/source.bundle')); host = m.Host(fs)
        old, new = 'b' * 40, 'a' * 40
        def git(args, *, pass_fds=()):
            if args[:1] == ['fetch']:
                self.assertEqual(len(pass_fds), 1); self.assertEqual(args[2], '/proc/self/fd/' + str(pass_fds[0])); return ''
            self.assertEqual(pass_fds, ())
            if args == ['rev-parse', new+'^{tree}']: return 'f'*40+'\n'
            if args == ['merge-base', old, new]: return old+'\n'
            if args[:1] == ['diff']: return 'pipeline/src/cli/sync.ts\n' if '--' not in args else ''
            if args[:1] == ['rev-parse']:
                sha, path = args[1].split(':',1)
                return m.PIPELINE_TOOLING_BRIDGE[path][0 if sha==old else 1]+'\n'
            raise AssertionError(args)
        manifest = {'sourceSha':new,'sourceTree':'f'*40,'sourceBundleSha256':m.digest(b'public mocked transport fixture')}
        with patch.object(host,'publisher',return_value={'sha':old}), patch.object(m,'source_paths',return_value={}):
            with patch.object(host,'git',side_effect=git): host.import_source(bundle,manifest,{'initialBridge':{}})
            def unknown(args, **kwargs):
                if args[:1] == ['rev-parse'] and ':pipeline/package.json' in args[1] and args[1].startswith(new): return 'c'*40+'\n'
                return git(args, **kwargs)
            with patch.object(host,'git',side_effect=unknown), self.assertRaisesRegex(m.Blocked,'dependency_provisioning_required'):
                host.import_source(bundle,manifest,{'initialBridge':{}})
            def protected(args, **kwargs):
                return 'contracts/openapi.yaml\n' if args[:1]==['diff'] and '--' in args else git(args, **kwargs)
            with patch.object(host,'git',side_effect=protected), self.assertRaisesRegex(m.Blocked,'protected_delta'):
                host.import_source(bundle,manifest,{'initialBridge':{}})


class BundleDescriptorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        root = pathlib.Path(self.temp.name); root.chmod(0o700); self.fs = m.Filesystem(root)
        self.directory = m.BASE + '/releases/unit-fd'; self.fs.path(self.directory).mkdir(parents=True)
        self.raw = b'public authenticated fixture bytes\n'; self.path = self.fs.path(self.directory+'/source.bundle')
        self.fs.write(self.directory+'/source.bundle', self.raw, 0o444)

    def opened(self, expected=None):
        return self.fs.source_bundle_fd(str(self.path), expected or m.digest(self.raw))

    def test_readonly_cloexec_digest_and_success_close(self):
        before = len(os.listdir('/proc/self/fd'))
        with self.opened() as fd:
            self.assertFalse(os.get_inheritable(fd)); self.assertEqual(os.read(fd, len(self.raw)), self.raw)
            with self.assertRaises(OSError): os.write(fd, b'bad')
        with self.assertRaises(OSError): os.fstat(fd)
        self.assertEqual(len(os.listdir('/proc/self/fd')), before)

    def test_digest_and_fixed_namespace_reject_without_fd_leak(self):
        before = len(os.listdir('/proc/self/fd'))
        for path, digest in [(str(self.path), '0'*64), ('/etc/other',m.digest(self.raw)),
                             (str(self.path.parent/'other'),m.digest(self.raw)),
                             (str(self.path.parent/'..'/'unit-fd'/'source.bundle'),m.digest(self.raw)),
                             (str(self.path),True)]:
            with self.subTest(path=path), self.assertRaises(m.Blocked):
                with self.fs.source_bundle_fd(path,digest): self.fail('admitted')
        self.assertEqual(len(os.listdir('/proc/self/fd')), before)

    def test_mode_link_empty_and_sparse_capacity_reject(self):
        for mode in [0o644,0o555,0o600,0o666]:
            self.path.chmod(mode)
            with self.assertRaises(m.Blocked):
                with self.opened(): self.fail('mode accepted')
        self.path.chmod(0o444); os.link(self.path,self.path.parent/'alias')
        with self.assertRaises(m.Blocked):
            with self.opened(): self.fail('hardlink accepted')
        (self.path.parent/'alias').unlink(); self.path.chmod(0o600)
        for size in [0,m.MAX_TAR+1]:
            os.truncate(self.path,size); self.path.chmod(0o444)
            with self.assertRaises(m.Blocked):
                with self.opened(): self.fail('size accepted')
            self.path.chmod(0o600)

    def test_symlink_and_fifo_never_block_or_follow(self):
        self.path.unlink(); self.path.symlink_to('/etc/passwd')
        with self.assertRaises(OSError):
            with self.opened(): self.fail('symlink accepted')
        self.path.unlink(); os.mkfifo(self.path,0o444)
        with self.assertRaises(m.Blocked):
            with self.opened(): self.fail('fifo accepted')

    def test_path_swap_during_hash_rejected(self):
        original = os.read; swapped = False
        def read(fd,n):
            nonlocal swapped
            data=original(fd,n)
            if not swapped:
                swapped=True; other=self.path.parent/'swapped'; other.write_bytes(self.raw); other.chmod(0o444); os.replace(other,self.path)
            return data
        with patch.object(m.os,'read',side_effect=read), self.assertRaises(m.Blocked):
            with self.opened(): self.fail('swapped path admitted')

    def test_postfetch_swap_rejected_and_descriptor_closed(self):
        with self.assertRaises(m.Blocked):
            with self.opened() as fd:
                self.path.rename(self.path.parent/'old'); self.path.write_bytes(self.raw); self.path.chmod(0o444)
        with self.assertRaises(OSError): os.fstat(fd)

    def test_same_inode_tamper_with_restored_mtime_rejected(self):
        original = self.path.stat()
        with self.assertRaises(m.Blocked):
            with self.opened() as fd:
                self.path.chmod(0o600); self.path.write_bytes(b'x'*len(self.raw)); self.path.chmod(0o444)
                os.utime(self.path, ns=(original.st_atime_ns, original.st_mtime_ns))
        with self.assertRaises(OSError): os.fstat(fd)

    def test_release_directory_swap_rejected(self):
        with self.assertRaises(m.Blocked):
            with self.opened() as fd:
                parent=self.path.parent; parent.rename(parent.with_name('old-release'))
                parent.mkdir(); self.path.write_bytes(self.raw); self.path.chmod(0o444)
        with self.assertRaises(OSError): os.fstat(fd)

    def test_failure_cancellation_and_unknown_cleanup_preserve_original_error(self):
        for error in [m.Blocked('command_failed'),m.Blocked('command_cleanup_unverified'),KeyboardInterrupt()]:
            with self.assertRaises(type(error)) as result:
                with self.opened() as fd: raise error
            self.assertIs(result.exception,error)
            with self.assertRaises(OSError): os.fstat(fd)

    def test_git_fd_only_for_single_fixed_fetch(self):
        host=m.Host(self.fs)
        for args,fds in [(['status'],(4,)),(['fetch','--no-tags','/tmp/other','a'*40],(4,)),
                         (['fetch','--no-tags','/proc/self/fd/4','a'*40],(4,5)),
                         (['fetch','--no-tags','/proc/self/fd/4','not-sha'],(4,))]:
            with patch.object(m,'command') as call,self.assertRaises(m.Blocked):host.git(args,pass_fds=fds)
            call.assert_not_called()


if __name__ == '__main__': unittest.main()


class PipelineCapsuleV2Tests(unittest.TestCase):
    def inventory(self, rows=None):
        return m.canonical({'version': 1, 'entries': rows if rows is not None else [
            {'path':'node_modules','type':'dir','mode':0o555},
            {'path':'node_modules/a','type':'file','mode':0o444,'size':1,'sha256':m.digest(b'a')},
            {'path':'node_modules/b','type':'symlink','target':'a'}]})

    def test_pr86_exact_pairs_and_inventory_positive(self):
        self.assertEqual(m.PIPELINE_NEW_TREE, '4f1294e3ec73fd477d85825588b8f382125fc1c6')
        self.assertEqual(len(m.pipeline_inventory(self.inventory())),3)

    def test_inventory_rejects_extra_keys_boolean_mode_traversal_and_links(self):
        for rows in [
            [{'path':'../escape','type':'dir','mode':0o555}],
            [{'path':'/absolute','type':'dir','mode':0o555}],
            [{'path':'a','type':'dir','mode':True}],
            [{'path':'a','type':'file','mode':0o444,'size':1,'sha256':'a'*64,'extra':1}],
            [{'path':'a','type':'symlink','target':'/etc/passwd'}],
            [{'path':'a','type':'symlink','target':'../escape'}],
            [{'path':'a','type':'symlink','target':'b'},{'path':'b','type':'symlink','target':'a'}],
            [{'path':'a','type':'symlink','target':'missing'}],
            [{'path':'a','type':'dir','mode':0o555},{'path':'a','type':'dir','mode':0o555}],
            [{'path':'pipeline.env','type':'file','mode':0o444,'size':0,'sha256':m.digest(b'')}],
        ]:
            with self.subTest(rows=rows),self.assertRaises(m.Blocked):m.pipeline_inventory(self.inventory(rows))

    def test_indexed_capsule_hash_types_and_no_archive_links(self):
        raw=io.BytesIO();inv=self.inventory()
        with tarfile.open(fileobj=raw,mode='w',format=tarfile.USTAR_FORMAT) as t:
            for name,data in [('inventory.json',inv),('blob/1',b'a')]:
                x=tarfile.TarInfo(name);x.mode=0o444;x.size=len(data);t.addfile(x,io.BytesIO(data))
        parsed=m.pipeline_capsule(raw.getvalue())
        self.assertEqual(parsed[0],m.parse(inv));self.assertEqual(parsed[1],{'node_modules/a':b'a'})
        changed=raw.getvalue().replace(b'a',b'b',1)
        with self.assertRaises(m.Blocked):m.pipeline_capsule(changed)

    def test_exact_protected_lock_exception_has_no_prefix_bypass(self):
        self.assertTrue(m.pipeline_contracts_delta(['contracts/pnpm-lock.yaml'],m.CONTRACTS_OLD_LOCK,m.CONTRACTS_NEW_LOCK))
        for paths,old,new in [(['contracts/openapi.yaml'],m.CONTRACTS_OLD_LOCK,m.CONTRACTS_NEW_LOCK),
                              (['contracts/pnpm-lock.yaml','backend/prisma/schema.prisma'],m.CONTRACTS_OLD_LOCK,m.CONTRACTS_NEW_LOCK),
                              (['contracts/pnpm-lock.yaml'],'a'*40,m.CONTRACTS_NEW_LOCK),
                              (['contracts/pnpm-lock.yaml'],m.CONTRACTS_OLD_LOCK,'b'*40)]:
            with self.subTest(paths=paths),self.assertRaises(m.Blocked):m.pipeline_contracts_delta(paths,old,new)


class PipelineStoreSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='pipeline-store-safety-');self.addCleanup(self.temp.cleanup)
        self.root=pathlib.Path(self.temp.name);self.root.chmod(0o700);self.fs=m.Filesystem(self.root)
        self.fs.path(m.BASE+'/capsules').mkdir(parents=True,mode=0o700)
        self.fs.path(m.BASE).chmod(0o700)
        self.fs.path(m.BASE+'/state').mkdir(mode=0o700)
        inv=PipelineCapsuleV2Tests().inventory();self.identity=m.digest(inv)
        raw=io.BytesIO()
        with tarfile.open(fileobj=raw,mode='w',format=tarfile.USTAR_FORMAT) as t:
            for name,data in [('inventory.json',inv),('blob/1',b'a')]:
                member=tarfile.TarInfo(name);member.mode=0o444;member.size=len(data);t.addfile(member,io.BytesIO(data))
        self.raw=raw.getvalue();self.store=m.PipelineStore(self.fs);self.journal=[]
    def register(self,event,path,identity):
        self.journal.append({'event':event,'path':path,'identity':identity})
        self.fs.write(m.BASE+'/state/test-intent.json',m.canonical(self.journal),replace=len(self.journal)>1)
    def test_real_filesystem_seal_and_inventory_tampering(self):
        self.store.install(self.raw,self.identity,'fixture',self.register)
        self.assertEqual(self.store.verify(self.identity)['inventorySha256'],self.identity)
        f=self.fs.path(self.store.location(self.identity)+'/pipeline/node_modules/a');f.chmod(0o644);f.write_bytes(b'b');f.chmod(0o444)
        with self.assertRaises(m.Blocked):self.store.verify(self.identity)
    def test_sigkill_after_mkdir_retains_intent_and_orphan_blocks_reinstall(self):
        pid=os.fork()
        if pid==0:
            def crash(event,path,identity):
                self.register(event,path,identity)
                if event=='generation_created':os.kill(os.getpid(),signal.SIGKILL)
            self.store.install(self.raw,self.identity,'fixture',crash);os._exit(9)
        _,status=os.waitpid(pid,0);self.assertEqual(os.WTERMSIG(status),signal.SIGKILL)
        slot=self.fs.path(self.store.location(self.identity))
        self.assertTrue(slot.is_dir());self.assertFalse((slot/'seal.json').exists())
        self.assertTrue(self.fs.path(m.BASE+'/state/pipeline-fixture.intent.json').is_file())
        before=m.stamp(os.lstat(slot))
        with self.assertRaisesRegex(m.Blocked,'pipeline_generation_exists'):
            self.store.install(self.raw,self.identity,'fixture',self.register)
        self.assertEqual(m.stamp(os.lstat(slot)),before)
        self.assertFalse(self.fs.path(m.PIPELINE_SELECTION).exists())
    def test_enospc_preserves_registered_partial_generation(self):
        original=os.write;injected=[]
        def full(fd,data):
            if os.readlink('/proc/self/fd/'+str(fd)).endswith('/pipeline/node_modules/a'):
                injected.append(True);raise OSError(errno.ENOSPC,'synthetic ENOSPC')
            return original(fd,data)
        with patch.object(os,'write',side_effect=full),self.assertRaises(OSError) as error:
            self.store.install(self.raw,self.identity,'fixture',self.register)
        self.assertEqual(error.exception.errno,errno.ENOSPC);self.assertEqual(injected,[True])
        slot=self.fs.path(self.store.location(self.identity))
        self.assertTrue(slot.is_dir());self.assertFalse((slot/'seal.json').exists())
        self.assertTrue(self.fs.path(m.BASE+'/state/pipeline-fixture.intent.json').is_file())
        partial=slot/'pipeline/node_modules/a';self.assertEqual(partial.read_bytes(),b'')
        before=m.stamp(os.lstat(partial))
        with self.assertRaises(m.Blocked):self.store.verify(self.identity)
        with self.assertRaises(m.Blocked):self.store.install(self.raw,self.identity,'second',self.register)
        self.assertEqual(m.stamp(os.lstat(partial)),before)
        self.assertFalse(self.fs.path(m.PIPELINE_SELECTION).exists())
    def test_historical_foreign_stage_cas_failure_remains_reproducible(self):
        # Frozen full OLD module, not dict(vars(m)) plus one old class. The
        # current file is merely a compression basis; a pinned pre-change full
        # digest MUST match before any historical source is executed.
        record=json.loads(pathlib.Path(__file__).with_name('fixtures').joinpath('pipeline-store-before.json').read_text())
        def frozen_module(fixture):
            pins={'store':'253a6f6cb839dffa41f6d39b6e0096bb7dff9f22ba6110d97056ca413420965e',
                  'test':'00fb6557bdafed44120883570272190bbf4080b0fcd8787ada1080bb347a3d5b'}
            for field,expected in pins.items():
                self.assertEqual(fixture[field+'Sha256'],expected,'historical fixture pin')
                self.assertEqual(hashlib.sha256(fixture[field+'Source'].encode()).hexdigest(),expected,
                                 'historical fixture digest')
            source=''.join(json.loads(pathlib.Path(__file__).with_name('fixtures').joinpath('pipeline-store-old-module.json').read_text()))
            self.assertEqual(hashlib.sha256(source.encode()).hexdigest(),
                             'ef30e25b620633895d8778654b860942afb02e65e3a54fa1e1865efacaffc026',
                             'historical full-module digest')
            old=ModuleType('frozen_pipeline_promotion_before');old.__file__='<frozen-old-publisher>'
            exec(compile(source,old.__file__,'exec'),old.__dict__)
            return old
        # Malformed fixture (including self-consistently edited metadata) is
        # rejected BEFORE exec; it cannot become historical negative evidence.
        for field in ['store','test']:
            changed=dict(record);changed[field+'Source']+='\n'
            changed[field+'Sha256']=hashlib.sha256(changed[field+'Source'].encode()).hexdigest()
            with self.subTest(corrupt=field),self.assertRaisesRegex(AssertionError,'historical fixture pin'):
                frozen_module(changed)
        old=frozen_module(record)
        self.assertIsNot(old,m);self.assertIsNot(old.PipelineStore,m.PipelineStore)
        self.assertIsNot(old.Filesystem,m.Filesystem);self.assertIsNot(old.Blocked,m.Blocked)
        self.assertIs(old.PipelineStore.install.__globals__,old.__dict__)
        self.assertIs(old.Filesystem.write.__globals__,old.__dict__)
        historical=unittest.TestCase();historical.fs=old.Filesystem(self.root)
        historical.store=old.PipelineStore(historical.fs);historical.raw=self.raw;historical.identity=self.identity
        def register(event,path,identity):
            self.journal.append({'event':event,'path':path,'identity':identity})
            historical.fs.write(old.BASE+'/state/test-intent.json',old.canonical(self.journal),replace=len(self.journal)>1)
        historical.register=register
        def run_original(binding):
            self.assertIs(binding,old,'historical binding must be the frozen OLD module')
            namespace={'m':binding,'os':os}
            exec(compile(record['testSource'],'<frozen-old-cas-assertion>','exec'),namespace)
            namespace['test_foreign_stage_inode_is_never_renamed_into_registered_capsule'](historical)
        with self.assertRaisesRegex(AssertionError,'historical binding must be the frozen OLD module'):
            run_original(m)
        with self.assertRaisesRegex(AssertionError,'foreign staging inode was moved before CAS rejection') as failure:
            run_original(old)
        self.assertEqual(str(failure.exception),
                         'False is not true : foreign staging inode was moved before CAS rejection')
        slot=historical.fs.path(historical.store.location(self.identity))
        self.assertEqual((slot/'foreign-owner-marker').read_bytes(),b'FOREIGN: preserve at original location')
        self.assertTrue(historical.fs.path(old.BASE+'/.pipeline-stage-fixture.retained-owned').is_dir())


class PipelineGenerationSafetyTests(unittest.TestCase):
    setUp = PipelineStoreSafetyTests.setUp
    register = PipelineStoreSafetyTests.register

    def slot(self): return self.fs.path(self.store.location(self.identity))
    def snapshot(self, path):
        return [(str(p.relative_to(path)),m.stamp(os.lstat(p)),p.read_bytes() if p.is_file() and not p.is_symlink() else None)
                for p in [path,*sorted(path.rglob('*'))]]
    def test_generation_is_created_at_final_name_never_renamed_or_selected(self):
        calls=[]
        with patch.object(os,'rename',side_effect=AssertionError('rename forbidden')),patch.object(os,'replace',side_effect=AssertionError('replace forbidden')):
            # The callback journal uses replace, so only the store gets the inert observer.
            def durable_observe(event,path,identity):
                calls.append(event)
                if event=='generation_created':
                    self.assertTrue(self.slot().is_dir())
                    with self.assertRaises(m.Blocked):self.store.verify(self.identity)
            self.store.install(self.raw,self.identity,'fixture',durable_observe)
        self.assertIn('generation_created',calls)
        self.assertFalse(self.fs.path(m.PIPELINE_SELECTION).exists())
        self.assertFalse(any(p.name.startswith('.pipeline-stage-') for p in self.fs.path(m.BASE).iterdir()))
        self.assertEqual(self.store.verify(self.identity)['inventorySha256'],self.identity)
    def test_existing_foreign_generation_is_untouched(self):
        self.slot().mkdir(mode=0o700);(self.slot()/'foreign').write_bytes(b'leave me')
        before=self.snapshot(self.slot())
        with self.assertRaises(m.Blocked):self.store.install(self.raw,self.identity,'fixture',self.register)
        self.assertEqual(self.snapshot(self.slot()),before)
    def test_successful_generation_cannot_be_automatically_reused(self):
        self.store.install(self.raw,self.identity,'fixture',self.register);before=self.snapshot(self.slot())
        with self.assertRaises(m.Blocked):self.store.install(self.raw,self.identity,'other',self.register)
        self.assertEqual(self.snapshot(self.slot()),before)
    def test_intent_is_durable_before_generation_mkdir(self):
        original=os.mkdir;seen=[]
        def checked(path,*args,**kwargs):
            if path==self.identity:
                state=self.fs.path(m.BASE+'/state/pipeline-fixture.intent.json')
                inv=m.parse(state.read_bytes());self.assertIn(self.store.location(self.identity),inv['resources'])
                self.assertIn(self.store.location(self.identity)+'/pipeline/node_modules/b',inv['resources']);seen.append(True)
            return original(path,*args,**kwargs)
        with patch.object(os,'mkdir',side_effect=checked):self.store.install(self.raw,self.identity,'fixture',self.register)
        self.assertEqual(seen,[True])
    def test_sigkill_after_generation_mkdir_retains_intent_and_blocks_reuse(self):
        pid=os.fork()
        if pid==0:
            def kill(event,path,identity):
                if event=='generation_created':os.kill(os.getpid(),signal.SIGKILL)
            self.store.install(self.raw,self.identity,'fixture',kill);os._exit(9)
        _,status=os.waitpid(pid,0);self.assertEqual(os.WTERMSIG(status),signal.SIGKILL)
        self.assertTrue(self.slot().is_dir());self.assertFalse((self.slot()/'seal.json').exists())
        self.assertTrue(self.fs.path(m.BASE+'/state/pipeline-fixture.intent.json').is_file())
        before=self.snapshot(self.slot())
        with self.assertRaises(m.Blocked):self.store.install(self.raw,self.identity,'second',self.register)
        self.assertEqual(self.snapshot(self.slot()),before)
        self.assertFalse(self.fs.path(m.PIPELINE_SELECTION).exists())
    def test_parent_replacement_is_rejected_before_any_graph_write(self):
        foreign=[]
        def replace(event,path,identity):
            self.register(event,path,identity)
            if event=='generation_created':
                parent=self.slot().parent;parent.rename(parent.with_name('retained-parent'));parent.mkdir(mode=0o700)
                (parent/'foreign').write_bytes(b'preserve');foreign.append(self.snapshot(parent))
        with self.assertRaises(m.Blocked):self.store.install(self.raw,self.identity,'fixture',replace)
        self.assertTrue(foreign);self.assertEqual(self.snapshot(self.slot().parent),foreign[0])
        self.assertFalse((self.slot().parent.with_name('retained-parent')/self.identity/'pipeline').exists())
    def test_generation_replacement_keeps_foreign_inode_untouched(self):
        foreign=[]
        def replace(event,path,identity):
            self.register(event,path,identity)
            if event=='generation_created':
                self.slot().rename(str(self.slot())+'.retained');self.slot().mkdir(mode=0o700)
                (self.slot()/'foreign').write_bytes(b'preserve');foreign.append(self.snapshot(self.slot()))
        with self.assertRaises(m.Blocked):self.store.install(self.raw,self.identity,'fixture',replace)
        self.assertTrue(foreign);self.assertEqual(self.snapshot(self.slot()),foreign[0])
    def test_unprivileged_graph_substitution_is_denied_without_mutation(self):
        self.assertNotEqual(os.geteuid(),0,'requires actual unprivileged test process; never treat root as unprivileged')
        # A fixture-only old selection is a sentinel, never installed by Store.
        selected=self.fs.path(m.PIPELINE_SELECTION);selected.parent.mkdir(parents=True)
        selected.write_bytes(b'old-selection-fixture\n');selected.chmod(0o644)
        selection=(m.stamp(os.lstat(selected)),selected.read_bytes());denied=[]
        def attempt(event,path,identity):
            self.register(event,path,identity)
            if event=='graph_ready':
                graph=self.slot()/'pipeline';before=self.snapshot(graph)
                directory=graph/'node_modules'
                with self.assertRaises(PermissionError) as error:
                    directory.rename(str(directory)+'.retained')
                self.assertEqual(error.exception.errno,errno.EACCES);denied.append(True)
                self.assertEqual(self.snapshot(graph),before)
                self.assertFalse(directory.with_name('node_modules.retained').exists())
                self.assertEqual((m.stamp(os.lstat(selected)),selected.read_bytes()),selection)
        self.store.install(self.raw,self.identity,'fixture',attempt)
        self.assertEqual(denied,[True])
        self.assertEqual(self.store.verify(self.identity)['inventorySha256'],self.identity)
        self.assertEqual((m.stamp(os.lstat(selected)),selected.read_bytes()),selection)

    def test_controlled_privileged_symlink_injection_is_executed_and_rejected(self):
        # Model privileged filesystem corruption with an explicit fixture-only
        # owner permission transition. No sudo/root/host paths; Store unchanged.
        target=self.root/'outside';target.mkdir();(target/'foreign').write_bytes(b'unchanged');before=self.snapshot(target)
        injected=[];restored=[]
        def substitute(event,path,identity):
            self.register(event,path,identity)
            if event=='graph_ready':
                graph=self.slot()/'pipeline';original=os.lstat(graph)
                self.assertEqual(original.st_mode & 0o777,0o555)
                graph.chmod(0o700)
                try:
                    directory=graph/'node_modules';directory.rename(str(directory)+'.retained')
                    directory.symlink_to(target,target_is_directory=True)
                    # Prove injection happened before allowing Store to run.
                    self.assertTrue(directory.is_symlink());self.assertEqual(os.readlink(directory),str(target))
                    self.assertTrue(directory.with_name('node_modules.retained').is_dir());injected.append(True)
                finally:
                    graph.chmod(0o555)
                    st=os.lstat(graph)
                    self.assertEqual((st.st_dev,st.st_ino,st.st_uid,st.st_gid,st.st_mode),
                                     (original.st_dev,original.st_ino,original.st_uid,original.st_gid,original.st_mode))
                    self.assertEqual(os.listxattr(graph),[]);restored.append(True)
        # Directory no-follow open returns ENOTDIR on Linux. Do not accept an
        # injector PermissionError or arbitrary OSError as a successful test.
        with self.assertRaises(OSError) as error:
            self.store.install(self.raw,self.identity,'fixture',substitute)
        self.assertEqual(error.exception.errno,errno.ENOTDIR)
        self.assertEqual(injected,[True]);self.assertEqual(restored,[True])
        self.assertEqual(self.snapshot(target),before);self.assertFalse((self.slot()/'seal.json').exists())
        with self.assertRaises(m.Blocked):self.store.verify(self.identity)
        preserved=self.snapshot(self.slot())
        with self.assertRaises(m.Blocked):self.store.install(self.raw,self.identity,'second',self.register)
        self.assertEqual(self.snapshot(self.slot()),preserved)
        self.assertFalse(self.fs.path(m.PIPELINE_SELECTION).exists())
    def test_preseal_corruption_blocks_seal(self):
        def corrupt(event,path,identity):
            self.register(event,path,identity)
            if event=='graph_ready':
                p=self.slot()/'pipeline/node_modules/a';p.chmod(0o644);p.write_bytes(b'b');p.chmod(0o444)
        with self.assertRaises(m.Blocked):self.store.install(self.raw,self.identity,'fixture',corrupt)
        self.assertFalse((self.slot()/'seal.json').exists())
    def test_corrupted_seal_and_partial_graph_are_never_accepted(self):
        self.store.install(self.raw,self.identity,'fixture',self.register)
        seal=self.slot()/'seal.json';seal.chmod(0o600);seal.write_bytes(b'{}\n');seal.chmod(0o400)
        with self.assertRaises(m.Blocked):self.store.verify(self.identity)
        before=self.snapshot(self.slot())
        with self.assertRaises(m.Blocked):self.store.install(self.raw,self.identity,'second',self.register)
        self.assertEqual(self.snapshot(self.slot()),before)
    def test_untrusted_parent_permissions_rejected_before_mutation(self):
        self.slot().parent.chmod(0o777)
        with self.assertRaises(m.Blocked):self.store.install(self.raw,self.identity,'fixture',self.register)
        self.assertFalse(self.slot().exists())
    def test_capsule_parent_symlink_rejected_before_mutation(self):
        parent=self.slot().parent;parent.rename(parent.with_name('real-capsules'));parent.symlink_to('real-capsules',target_is_directory=True)
        with self.assertRaises((m.Blocked,OSError)):self.store.install(self.raw,self.identity,'fixture',self.register)
        self.assertFalse(self.slot().exists())

    test_enospc_preserves_registered_partial_generation = PipelineStoreSafetyTests.test_enospc_preserves_registered_partial_generation

    def large_capsule(self):
        data=b'abcdefgh';inventory=m.canonical({'version':1,'entries':[
            {'path':'node_modules','type':'dir','mode':0o555},
            {'path':'node_modules/a','type':'file','mode':0o444,'size':len(data),'sha256':m.digest(data)},
            {'path':'node_modules/b','type':'symlink','target':'a'}]})
        raw=io.BytesIO()
        with tarfile.open(fileobj=raw,mode='w',format=tarfile.USTAR_FORMAT) as tar:
            for name,body in [('inventory.json',inventory),('blob/1',data)]:
                member=tarfile.TarInfo(name);member.mode=0o444;member.size=len(body);tar.addfile(member,io.BytesIO(body))
        self.raw=raw.getvalue();self.identity=m.digest(inventory)

    def test_partial_write_then_enospc_preserves_exact_partial_bytes(self):
        self.large_capsule();write=os.write;injected=[]
        def partial(fd,data):
            if os.readlink('/proc/self/fd/'+str(fd)).endswith('/pipeline/node_modules/a'):
                injected.append(len(data))
                if len(injected)==1:return write(fd,data[:2])
                raise OSError(errno.ENOSPC,'fixture partial write ENOSPC')
            return write(fd,data)
        with patch.object(os,'write',side_effect=partial),self.assertRaises(OSError) as error:
            self.store.install(self.raw,self.identity,'fixture',self.register)
        self.assertEqual(error.exception.errno,errno.ENOSPC);self.assertEqual(injected,[8,6])
        self.assertEqual((self.slot()/'pipeline/node_modules/a').read_bytes(),b'ab')
        before=self.snapshot(self.slot())
        with self.assertRaises(m.Blocked):self.store.verify(self.identity)
        with self.assertRaises(m.Blocked):self.store.install(self.raw,self.identity,'second',self.register)
        self.assertEqual(self.snapshot(self.slot()),before);self.assertFalse(self.fs.path(m.PIPELINE_SELECTION).exists())

    def test_short_writes_complete_and_zero_write_blocks(self):
        self.large_capsule();write=os.write;lengths=[]
        def short(fd,data):
            if os.readlink('/proc/self/fd/'+str(fd)).endswith('/pipeline/node_modules/a'):
                lengths.append(len(data));return write(fd,data[:1])
            return write(fd,data)
        with patch.object(os,'write',side_effect=short):self.store.install(self.raw,self.identity,'fixture',self.register)
        self.assertEqual(lengths,[8,7,6,5,4,3,2,1]);self.store.verify(self.identity)
        # A distinct owned fixture exercises the zero-progress path.
        f=PipelineStoreSafetyTests('test_real_filesystem_seal_and_inventory_tampering');f.setUp()
        try:
            injected=[]
            def zero(fd,data):
                if os.readlink('/proc/self/fd/'+str(fd)).endswith('/pipeline/node_modules/a'):
                    injected.append(True);return 0
                return write(fd,data)
            with patch.object(os,'write',side_effect=zero),self.assertRaisesRegex(m.Blocked,'pipeline_short_write'):
                f.store.install(f.raw,f.identity,'fixture',f.register)
            self.assertEqual(injected,[True]);slot=f.fs.path(f.store.location(f.identity))
            self.assertTrue(slot.exists());self.assertFalse((slot/'seal.json').exists())
            self.assertFalse(f.fs.path(m.PIPELINE_SELECTION).exists())
        finally:f.doCleanups()

    def test_fsync_failures_preserve_resources_and_never_select_or_reuse(self):
        # Error injection is specific to the actual FD's fixed sandbox path.
        # We claim failure propagation/no-selection, NOT durability after EIO.
        for fault in ['intent','state','graph_file','seal','generation_after_seal']:
            with self.subTest(fault=fault):
                f=PipelineStoreSafetyTests('test_real_filesystem_seal_and_inventory_tampering');f.setUp()
                try:
                    original=os.fsync;injected=[];slot=f.fs.path(f.store.location(f.identity))
                    intent=f.fs.path(m.BASE+'/state/pipeline-fixture.intent.json')
                    paths={'intent':str(intent),'state':str(intent.parent),'graph_file':str(slot/'pipeline/node_modules/a'),
                           'seal':str(slot/'seal.json'),'generation_after_seal':str(slot)}
                    def fail(fd):
                        path=os.readlink('/proc/self/fd/'+str(fd))
                        if path==paths[fault] and (fault!='generation_after_seal' or (slot/'seal.json').exists()):
                            injected.append(path);raise OSError(errno.EIO,'fixture fsync failure')
                        return original(fd)
                    with patch.object(os,'fsync',side_effect=fail),self.assertRaises(OSError) as error:
                        f.store.install(f.raw,f.identity,'fixture',f.register)
                    self.assertEqual(error.exception.errno,errno.EIO);self.assertEqual(len(injected),1)
                    self.assertTrue(intent.is_file());intent_before=(m.stamp(os.lstat(intent)),intent.read_bytes())
                    before=self.snapshot(slot) if slot.exists() else None
                    self.assertFalse(f.fs.path(m.PIPELINE_SELECTION).exists())
                    with self.assertRaises(m.Blocked):f.store.install(f.raw,f.identity,'fixture',f.register)
                    self.assertEqual((m.stamp(os.lstat(intent)),intent.read_bytes()),intent_before)
                    self.assertEqual(self.snapshot(slot) if slot.exists() else None,before)
                finally:f.doCleanups()

    def test_parent_and_intent_fsync_complete_before_mkdir(self):
        fsync=os.fsync;mkdir=os.mkdir;events=[]
        def sync(fd):
            path=os.readlink('/proc/self/fd/'+str(fd));result=fsync(fd);events.append(path);return result
        def create(name,*args,**kwargs):
            if name==self.identity:
                intent=str(self.fs.path(m.BASE+'/state/pipeline-fixture.intent.json'))
                self.assertIn(intent,events);self.assertIn(str(self.fs.path(m.BASE+'/state')),events)
                self.assertLess(events.index(intent),events.index(str(self.fs.path(m.BASE+'/state'))))
                events.append('GENERATION_MKDIR')
            return mkdir(name,*args,**kwargs)
        with patch.object(os,'fsync',side_effect=sync),patch.object(os,'mkdir',side_effect=create):
            self.store.install(self.raw,self.identity,'fixture',self.register)
        self.assertEqual(events.count('GENERATION_MKDIR'),1)

    def test_partial_generation_without_seal_is_preserved_and_unusable(self):
        self.slot().mkdir(mode=0o700);(self.slot()/'pipeline').mkdir(mode=0o700)
        (self.slot()/'pipeline/partial').write_bytes(b'partial foreign fixture')
        before=self.snapshot(self.slot())
        with self.assertRaises(m.Blocked):self.store.verify(self.identity)
        with self.assertRaises(m.Blocked):self.store.install(self.raw,self.identity,'fixture',self.register)
        self.assertEqual(self.snapshot(self.slot()),before);self.assertFalse(self.fs.path(m.PIPELINE_SELECTION).exists())

    def test_store_directory_lock_blocks_competing_writer_without_changes(self):
        import fcntl
        fd=os.open(self.slot().parent,os.O_RDONLY|os.O_DIRECTORY|os.O_CLOEXEC)
        try:
            fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            with self.assertRaisesRegex(m.Blocked,'pipeline_store_busy'):
                self.store.install(self.raw,self.identity,'fixture',self.register)
            self.assertFalse(self.slot().exists())
            self.assertEqual(list(self.fs.path(m.BASE+'/state').iterdir()),[])
        finally:os.close(fd)
