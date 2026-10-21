import contextlib
import datetime as dt
import hashlib
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('launch', Path(__file__).with_name('c2-ingest-launch.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class LaunchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='aktau-c2-launch-test-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        elf = bytearray(64)
        elf[:6] = b'\x7fELF\x02\x01'; elf[18:20] = b'\x3e\x00'
        now = dt.datetime.now(dt.timezone.utc)
        self.a = dict(zip(m.FIELDS, [1, 'a'*32, 'b'*40, 'c'*40, 'dpl_fixture',
            (now-dt.timedelta(seconds=1)).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
            '11111111-1111-1111-1111-111111111111', os.geteuid(), os.getegid(), 123, '456',
            '/usr/local/bin/node', 'd'*64, 'e'*64, 'f'*64, hashlib.sha256(elf).hexdigest(), '1'*64,
            (now+dt.timedelta(minutes=5)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')]))
        self.auth = dict(zip(('version','approved','sourceSha','binarySha256','clockSha256','buildId','platform'),
            [1, True, self.a['sourceSha'], '2'*64, self.a['relaySha256'], 'fixture-only', 'linux/amd64']))
        self.blobs = {m.READY:m.canonical(self.a), m.AUTH:m.canonical(self.auth), m.INGEST:bytes(elf), m.GO:b'fixed-go-inspector'}
        self.inspections = []

    @contextlib.contextmanager
    def files(self):
        paths = {k:self.root/str(i) for i,k in enumerate(self.blobs)}
        for k,p in paths.items(): p.write_bytes(self.blobs[k])
        @contextlib.contextmanager
        def pin(path, limit, mode=None):
            if path not in paths: raise FileNotFoundError()
            fd = os.open(paths[path], os.O_RDONLY)
            try: yield fd, m.identity(os.fstat(fd))
            finally: os.close(fd)
        def boot(path, *args, **kwargs):
            self.assertEqual(path, '/proc/sys/kernel/random/boot_id')
            return io.StringIO(self.a['bootId']+'\n')
        def inspect(argv, fds):
            self.inspections.append(argv)
            self.assertTrue(argv[0].startswith('/proc/self/fd/'))
            self.assertEqual(len(fds),2)
            raw = 'go version go1.27.3 linux/amd64\n' if argv[1:] == ['version'] else argv[-1]+': go1.27.3\n'
            return raw.encode()
        with patch.object(m,'root_file',side_effect=pin), patch('builtins.open',side_effect=boot), patch.object(m,'scope') as scope, patch.object(m,'inspect_output',side_effect=inspect):
            yield paths, scope

    def test_real_factory_boundary_selects_one_fixed_descriptor_and_scoped_claim(self):
        with self.files() as (_, scope), contextlib.ExitStack() as stack:
            c = m.admit(stack)
            self.assertEqual(os.pread(c.fd,64,0),self.blobs[m.INGEST])
            self.assertEqual(c.variables(), {'C2_EVENT_FIFO':'/var/lib/aktau-sync/c2/'+self.a['attemptId']+'/event.fifo','C2_EVENT_ATTEMPT_ID':self.a['attemptId']})
            scope.assert_called_once()
            self.assertEqual(len(self.inspections),2)

    def test_admission_negatives_never_claim_or_execute_candidate(self):
        for kind in ('wrong_digest','wrong_source','missing_binary','old_go','old_binary','go_timeout','go_failed','oversized_version','expired','wrong_boot','invalid_json','unapproved','extra_key','bool_uid'):
            with self.subTest(kind=kind):
                original = self.blobs.copy()
                if kind=='wrong_digest': self.blobs[m.INGEST] += b'changed'
                if kind=='wrong_source': self.blobs[m.AUTH]=m.canonical({**self.auth,'sourceSha':'f'*40})
                if kind=='missing_binary': del self.blobs[m.INGEST]
                if kind=='expired': self.blobs[m.READY]=m.canonical({**self.a,'expiresAt':'2020-01-01T00:00:00.000Z'})
                if kind=='wrong_boot': self.blobs[m.READY]=m.canonical({**self.a,'bootId':'22222222-2222-2222-2222-222222222222'})
                if kind=='invalid_json': self.blobs[m.READY]=self.blobs[m.READY]+b'{}'
                if kind=='unapproved': self.blobs[m.AUTH]=m.canonical({**self.auth,'approved':False})
                if kind=='extra_key': self.blobs[m.READY]=m.canonical({**self.a,'extra':True})
                if kind=='bool_uid': self.blobs[m.READY]=m.canonical({**self.a,'operatorUid':True})
                with self.files() as (_,scope), contextlib.ExitStack() as stack:
                    if kind=='go_timeout': m.inspect_output.side_effect=subprocess.TimeoutExpired('fixed-inspector',1)
                    if kind=='go_failed': m.inspect_output.side_effect=ValueError('inspect_failed')
                    if kind=='oversized_version': m.inspect_output.return_value=b'x'*32769;m.inspect_output.side_effect=None
                    if kind in ('old_go','old_binary'):
                        original_run=m.inspect_output.side_effect
                        m.inspect_output.side_effect=lambda args, fds: b'go version go1.27.2 linux/amd64\n' if kind=='old_go' or '-m' in args else original_run(args,fds)
                    with self.assertRaises(Exception): m.admit(stack)
                    scope.assert_not_called()
                self.blobs=original

    def test_fd_pinning_and_identity_expiry_after_dry_run(self):
        with self.files() as (paths,_),contextlib.ExitStack() as stack:
            c=m.admit(stack)
            self.assertIn('C2_EVENT_ATTEMPT_ID',c.variables())
            paths[m.READY].write_bytes(m.canonical({**self.a,'expiresAt':'2020-01-01T00:00:00.000Z'}))
            with self.assertRaises(ValueError):c.variables()
            paths[m.INGEST].rename(self.root/'retained')
            paths[m.INGEST].write_bytes(b'foreign')
            self.assertEqual(os.pread(c.fd,64,0),self.blobs[m.INGEST])
            with self.assertRaises(ValueError):c.variables()

    def test_pair_uses_same_immutable_fd_both_phases_and_only_apply_gets_scoped_env(self):
        calls=[]
        class C:
            fd=7
            def variables(self):return {'C2_EVENT_FIFO':'fixed','C2_EVENT_ATTEMPT_ID':'fresh'}
        def child(argv,**kw):calls.append((argv,kw));return SimpleNamespace(returncode=0)
        with patch.object(m,'admit',return_value=C()),patch.object(m.subprocess,'run',side_effect=child),patch.dict(m.os.environ,{'C2_EVENT_FIFO':'forged','C2_EVENT_ATTEMPT_ID':'forged','C2_INGEST_BINARY':'/evil'}):
            self.assertEqual(m.run_pair('fixture-bundle'),0)
        self.assertEqual([c[0][0] for c in calls],['/proc/self/fd/7']*2)
        self.assertNotIn('C2_EVENT_FIFO',calls[0][1]['env'])
        self.assertEqual(calls[1][1]['env']['C2_EVENT_ATTEMPT_ID'],'fresh')
        self.assertNotIn('C2_INGEST_BINARY',calls[1][1]['env'])

    def test_missing_dead_or_changed_observer_is_not_a_business_failure(self):
        for available in (False,True):
            calls=[]
            class C:
                fd=7
                def variables(self):raise ValueError('observer lost or expired')
            with patch.object(m,'admit',return_value=C() if available else None),patch.object(m.subprocess,'run',side_effect=lambda args,**kw:(calls.append((args,kw)) or SimpleNamespace(returncode=0))):
                self.assertEqual(m.run_pair('fixture'),0)
            self.assertEqual([c[0][:3] for c in calls],[['go','run','./cmd/ingest']]*2)
            self.assertTrue(all(not any(k.startswith('C2_') for k in c[1]['env']) for c in calls))

    def test_business_failure_status_preserved_and_apply_not_called_after_failed_dry_run(self):
        for statuses, expected, count in (([23],23,1),([0,17],17,2),([0,-15],143,2)):
            with patch.object(m,'admit',side_effect=ValueError()),patch.object(m.subprocess,'run',side_effect=[SimpleNamespace(returncode=x) for x in statuses]) as child:
                self.assertEqual(m.run_pair('fixture'),expected)
                self.assertEqual(child.call_count,count)

    def test_actual_ordinary_cli_strips_forged_opt_in_and_cannot_override_executable(self):
        fake=self.root/'go';log=self.root/'calls'
        fake.write_text('#!/bin/sh\nprintf "%s|%s|%s|%s\\n" "$*" "${C2_EVENT_FIFO-unset}" "${C2_EVENT_ATTEMPT_ID-unset}" "$GOTOOLCHAIN" >> "$TEST_LOG"\n')
        fake.chmod(0o700)
        result=subprocess.run(['python3','-B',str(Path(m.__file__)),'fixture-bundle'],
            env={**os.environ,'PATH':str(self.root)+':'+os.environ['PATH'],'TEST_LOG':str(log),'C2_EVENT_FIFO':'forged','C2_EVENT_ATTEMPT_ID':'forged','C2_INGEST_BINARY':'/evil'},capture_output=True)
        self.assertEqual(result.returncode,0)
        lines=log.read_text().splitlines();self.assertEqual(len(lines),2)
        self.assertIn('run ./cmd/ingest -bundle fixture-bundle|unset|unset|local',lines[0])
        self.assertIn(' -apply|unset|unset|local',lines[1])
        self.assertNotIn(b'forged',result.stderr)

    def test_real_inspection_child_output_timeout_nonzero_and_cleanup(self):
        self.assertEqual(m.inspect_output([sys.executable,'-c','print("bounded")'],()),b'bounded\n')
        for code in ('import sys;sys.exit(3)', 'print("x"*32769)', 'import time;time.sleep(10)'):
            started=m.time.monotonic()
            with self.assertRaises(Exception): m.inspect_output([sys.executable,'-c',code],())
            self.assertLess(m.time.monotonic()-started,2)

    @contextlib.contextmanager
    def namespace(self):
        path=self.root/'var/lib/aktau-sync/c2'/self.a['attemptId']
        path.mkdir(parents=True,mode=0o700)
        for p in path.parents:
            if p==self.root:break
            p.chmod(0o755)
        real_open,real_stat=os.open,os.stat
        def opened(p,*args,**kw):return real_open(str(self.root) if p=='/' else p,*args,**kw)
        def stated(p,*args,**kw):
            if isinstance(p,str) and p.startswith('/var/lib/aktau-sync/c2/'):
                p=str(self.root/p.lstrip('/'))
            return real_stat(p,*args,**kw)
        with patch.object(m.os,'open',side_effect=opened),patch.object(m.os,'stat',side_effect=stated):yield path

    def test_one_per_attempt_claim_is_durable_and_never_clobbered(self):
        with self.namespace() as path:
            m.scope(self.a,self.blobs[m.READY]);p=path/'publisher.claim';raw=p.read_bytes();before=p.stat()
            self.assertEqual(before.st_mode&0o777,0o600)
            with self.assertRaises(FileExistsError):m.scope(self.a,self.blobs[m.READY])
            self.assertEqual(p.read_bytes(),raw);self.assertEqual(p.stat().st_ino,before.st_ino)

    def test_orphan_partial_claim_and_unsafe_namespace_are_preserved(self):
        with self.namespace() as path:
            with patch.object(m.os,'write',return_value=0):
                with self.assertRaises(ValueError):m.scope(self.a,self.blobs[m.READY])
            p=path/'publisher.claim';self.assertTrue(p.exists());self.assertEqual(p.read_bytes(),b'')
            with self.assertRaises(FileExistsError):m.scope(self.a,self.blobs[m.READY])
            path.chmod(0o770)
            with self.assertRaises(ValueError):m.scope(self.a,self.blobs[m.READY])

    def test_root_file_rejects_real_unprivileged_file_and_symlink(self):
        p=self.root/'candidate';p.write_bytes(b'not-root-controlled');link=self.root/'link';link.symlink_to(p)
        for path in (p,link):
            with self.assertRaises((ValueError,OSError)):
                with m.root_file(str(path),4096): self.fail('unprivileged file accepted')


if __name__=='__main__':unittest.main()
