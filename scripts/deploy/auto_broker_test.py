import copy
import hashlib
import unittest
import tempfile
import pathlib
import os
import fcntl
import io
import tarfile
import json
import time
import types
import contextlib
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import patch
from auto_broker import Blocked, Host, rollout, ready, http, validate_manifest, verify_image, replace_release, receive_archive, write_result, authorization, approved_archive

SHA = 'a' * 40


def manifest():
    return dict(sha=SHA, revision=SHA, os='linux', arch='amd64', user='10001:10001',
                entrypoint=['/usr/local/bin/api'], rootfs=['sha256:' + 'b' * 64],
                binary='c' * 64, archive='d' * 64, size=100)


@contextlib.contextmanager
def approved_fixture(tags=None):
    # Real local fds/modes/memfd; only UID ownership and /tmp's ancestor mode
    # are simulated. This is NOT deployed-host ACL evidence or a real approval.
    with tempfile.TemporaryDirectory() as d:
        root = pathlib.Path(d)
        (root / 'authorizations').mkdir(mode=0o700)
        archive = root / 'synthetic.tar'
        content = json.dumps([{'RepoTags': tags or ['adilbaga-api:' + SHA]}]).encode()
        with tarfile.open(archive, 'w') as saved:
            entry = tarfile.TarInfo('manifest.json')
            entry.size = len(content)
            saved.addfile(entry, io.BytesIO(content))
        os.chmod(archive, 0o600)
        m = manifest()
        m.update(archive=hashlib.sha256(archive.read_bytes()).hexdigest(), size=archive.stat().st_size)
        m['provenance'] = dict(repository='kiratonine/AdilBaga', ciWorkflow='.github/workflows/ci.yml',
                               ciRunId=42, ciAttempt=2, buildWorkflow='.github/workflows/deploy-production.yml',
                               buildRunId=43, buildAttempt=1,
                               artifactIdentity=dict(id=99, name='adilbaga-api-' + SHA + '-43-1'))
        record = dict(schemaVersion=1, environment='production', releaseSha=SHA,
                      archiveSha256=m['archive'], archiveSize=m['size'], approved=True,
                      approvedBy='owner:synthetic', approvedAt=int(time.time())-1,
                      expiresAt=int(time.time())+3600, authorizationId='f'*32, **m['provenance'])
        record_path = root / 'authorizations' / (SHA + '.json')
        record_path.write_text(json.dumps(record))
        os.chmod(record_path, 0o600)
        control = {'bad_owner': None}
        real_fstat = os.fstat
        def synthetic_root(fd):
            s = real_fstat(fd)
            values = {k: getattr(s, k) for k in dir(s) if k.startswith('st_')}
            target = os.readlink('/proc/self/fd/' + str(fd))
            values['st_uid'] = 1001 if target == control['bad_owner'] else 0
            if target == '/tmp': values['st_mode'] = (s.st_mode & ~0o777) | 0o755
            return types.SimpleNamespace(**values)
        with patch('auto_broker.STATE', root), patch('auto_broker.os.fstat', synthetic_root):
            yield m, archive, record, record_path, control


class FakeHost:
    def __init__(self, fail=None):
        self.prior = 'adilbaga-api:' + 'e' * 40
        self.fail = fail
        self.calls = []
        self.active = False

    def step(self, name):
        self.calls.append(name)
        if self.fail == name:
            raise Blocked('synthetic_failure')

    def preflight(self): self.step('preflight')
    def identity(self, *_): self.step('identity')
    def recheck_authorization(self): self.step('reauthorize')
    def fresh_main(self, *_):
        self.step('fresh_main')
        return self.fail != 'stale'
    def stop(self):
        self.active = False
        self.step('stop')
    def activate(self, *_): self.step('activate')
    def local(self): self.step('local')
    def open(self):
        self.step('open')
        self.active = True
    def public(self): self.step('public')
    def observe(self): self.step('observe')
    def rollback(self):
        self.active = False
        self.step('rollback')
        self.active = True


class BrokerTests(unittest.TestCase):
    def test_unapproved_self_consistent_archive_never_reaches_docker(self):
        # The compromised restricted principal controls BOTH these matching values.
        with tempfile.TemporaryDirectory() as d:
            archive = pathlib.Path(d) / 'image.tar'
            content = json.dumps([{'RepoTags': ['adilbaga-api:' + SHA]}]).encode()
            with tarfile.open(archive, 'w') as saved:
                entry = tarfile.TarInfo('manifest.json')
                entry.size = len(content)
                saved.addfile(entry, io.BytesIO(content))
            m = manifest()
            m['archive'] = hashlib.sha256(archive.read_bytes()).hexdigest()
            m['size'] = archive.stat().st_size
            with patch('auto_broker.STATE', pathlib.Path(d)), \
                 patch('auto_broker.command', side_effect=AssertionError('unapproved Docker access')) as run:
                with self.assertRaises(Blocked): Host().identity(m, archive)
                run.assert_not_called()

    def test_manifest(self): validate_manifest(manifest())

    def test_manifest_rejects_all_identity_mismatches(self):
        for key in ['sha', 'revision', 'os', 'arch', 'user', 'entrypoint', 'rootfs', 'binary', 'archive', 'size']:
            with self.subTest(key=key):
                m = manifest()
                m[key] = [] if key in ['entrypoint', 'rootfs'] else -1 if key == 'size' else 'wrong'
                with self.assertRaises(Blocked): validate_manifest(m)

    def test_portable_identity_does_not_compare_docker_id(self):
        m = manifest()
        image = dict(Id='unrelated-store-identifier', Os='linux', Architecture='amd64',
                     Config=dict(Labels={'org.opencontainers.image.revision': SHA}, User=m['user'],
                                 Entrypoint=m['entrypoint'], Env=['PATH=/usr/bin']), RootFS={'Layers':m['rootfs']})
        verify_image(m, image, m['binary'])
        for path in ['binary', 'layers', 'user', 'env']:
            i = copy.deepcopy(image)
            b = m['binary']
            if path == 'binary': b = 'e' * 64
            if path == 'layers': i['RootFS']['Layers'] = []
            if path == 'user': i['Config']['User'] = '0:0'
            if path == 'env': i['Config']['Env'] += ['TOKEN=synthetic']
            with self.assertRaises(Blocked): verify_image(m, i, b)

    def test_success_order(self):
        host = FakeHost()
        self.assertEqual(rollout(host, manifest(), None), 'DEPLOYED')
        self.assertEqual(host.calls, ['preflight', 'fresh_main', 'identity', 'reauthorize', 'fresh_main', 'stop', 'activate', 'local', 'open', 'public', 'observe'])

    def test_noop(self):
        host = FakeHost()
        host.prior = 'adilbaga-api:' + SHA
        self.assertEqual(rollout(host, manifest(), None), 'NO_OP')
        self.assertEqual(host.calls, ['preflight'])

    def test_stale(self):
        host = FakeHost('stale')
        self.assertEqual(rollout(host, manifest(), None), 'SKIPPED_STALE')
        self.assertNotIn('stop', host.calls)

    def test_checksum_identity_failure_never_cuts_over(self):
        host = FakeHost('identity')
        with self.assertRaises(Blocked): rollout(host, manifest(), None)
        self.assertNotIn('stop', host.calls)

    def test_cutover_failures_compensate_once(self):
        for stage in ['stop', 'activate', 'local', 'open', 'public', 'observe']:
            with self.subTest(stage=stage):
                host = FakeHost(stage)
                self.assertEqual(rollout(host, manifest(), None), 'BLOCKED_ROLLED_BACK')
                self.assertEqual(host.calls.count('rollback'), 1)

    def test_rollback_failure_keeps_tunnel_closed(self):
        host = FakeHost('public')
        def broken():
            host.active = True
            raise Blocked('rollback_failure')
        host.rollback = broken
        self.assertEqual(rollout(host, manifest(), None), 'BLOCKED_ROLLBACK_FAILED')
        self.assertFalse(host.active)

    def test_unexpected_exception_also_compensates(self):
        host = FakeHost()
        def fail(): raise RuntimeError('private body never emitted')
        host.local = fail
        self.assertEqual(rollout(host, manifest(), None), 'BLOCKED_ROLLED_BACK')

    def test_cold_readiness_and_bounded_timeout(self):
        clock = [0.]
        attempts = [0]
        def pause(value): clock[0] += value
        def probe():
            attempts[0] += 1
            if attempts[0] < 3: raise Blocked('cold503')
        ready(lambda:clock[0], pause, probe)
        self.assertEqual(attempts[0], 3)
        def unavailable(): raise Blocked('503')
        with self.assertRaisesRegex(Blocked, 'persistent_readiness'):
            ready(lambda:clock[0], pause, unavailable)
        self.assertLessEqual(clock[0], 31)

    def test_real_probe_timeout_allows_healthy_cold_handler(self):
        # Exercise ready's real HTTP call boundary, not its no-argument probe seam.
        for latency in [4.5, 5.0]:
            with self.subTest(latency=latency):
                clock, calls = [0.0], []
                def pause(value): clock[0] += value
                def get(url, *, timeout):
                    self.assertEqual(url, 'http://127.0.0.1:8080/health/ready')
                    calls.append(timeout)
                    clock[0] += min(latency, timeout)
                    if timeout < latency:
                        raise Blocked('http_transport_or_json')
                    return {'status': 'ready'}, {}
                with patch('auto_broker.http', get):
                    ready(lambda: clock[0], pause)
                self.assertEqual(calls, [7])
                self.assertEqual(clock[0], latency)

    def test_readiness_total_budget_and_persistent_failures(self):
        for reason, latency in [('http_status', 0.0), ('http_transport_or_json', 10.0)]:
            with self.subTest(reason=reason):
                clock, calls = [0.0], []
                def pause(value):
                    self.assertGreaterEqual(value, 0)
                    self.assertLessEqual(value, min(0.5, 30-clock[0]))
                    clock[0] += value
                def get(url, *, timeout):
                    self.assertGreater(timeout, 0)
                    self.assertLessEqual(timeout, min(7, 30-clock[0]))
                    calls.append(timeout)
                    clock[0] += min(latency, timeout)
                    raise Blocked(reason)
                with patch('auto_broker.http', get), self.assertRaisesRegex(Blocked, '^persistent_readiness$'):
                    ready(lambda: clock[0], pause)
                self.assertTrue(calls)
                self.assertEqual(clock[0], 30)

    def test_last_probe_never_exceeds_remaining_fraction(self):
        clock, calls = [0.0], []
        def now():
            value = clock[0]
            if value == 0: clock[0] = 29.95
            return value
        def get(url, *, timeout):
            calls.append(timeout)
            self.assertLessEqual(timeout, 30-clock[0])
            clock[0] += timeout
            raise Blocked('http_transport_or_json')
        with patch('auto_broker.http', get), self.assertRaisesRegex(Blocked, '^persistent_readiness$'):
            ready(now, lambda value: None)
        self.assertEqual(len(calls), 1)
        self.assertAlmostEqual(calls[0], 0.05)
        self.assertEqual(clock[0], 30)

    def test_late_success_is_not_readiness(self):
        clock = [0.0]
        def get(*_, **kwargs):
            clock[0] = 30.001
            return {'status': 'ready'}, {}
        with patch('auto_broker.http', get), self.assertRaisesRegex(Blocked, '^persistent_readiness$'):
            ready(lambda: clock[0], lambda _: None)

    def test_no_probe_starts_after_deadline(self):
        with patch('auto_broker.http') as get, self.assertRaisesRegex(Blocked, '^persistent_readiness$'):
            ready(iter([0.0, 29.9, 30.1]).__next__, lambda _: None)
        get.assert_not_called()

    def test_readiness_interrupt_does_not_retry_and_compensates_once(self):
        host = FakeHost()
        host.activate = lambda *_: ready(lambda: 0.0, lambda _: self.fail('cancelled probe retried'))
        with patch('auto_broker.http', side_effect=KeyboardInterrupt()) as get:
            self.assertEqual(rollout(host, manifest(), None), 'BLOCKED_ROLLED_BACK')
        self.assertEqual(get.call_count, 1)
        self.assertEqual(host.calls.count('rollback'), 1)

    def test_persistent_readiness_retains_single_compensation(self):
        clock = [0.0]
        host = FakeHost()
        def pause(value): clock[0] += value
        host.activate = lambda *_: ready(lambda: clock[0], pause)
        with patch('auto_broker.http', side_effect=Blocked('http_status')):
            self.assertEqual(rollout(host, manifest(), None), 'BLOCKED_ROLLED_BACK')
        self.assertEqual(clock[0], 30)
        self.assertEqual(host.calls.count('rollback'), 1)
        self.assertNotIn('open', host.calls)

    def test_local_loopback_cold_http(self):
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_GET(self):
                time.sleep(4.5)
                body = b'{"status":"ready"}'
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        with HTTPServer(('127.0.0.1', 0), Handler) as server:
            thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': 0.05})
            thread.start()
            calls = []
            def get(url, *, timeout):
                calls.append(timeout)
                return http('http://127.0.0.1:' + str(server.server_port) + '/health/ready', timeout=timeout)
            try:
                start = time.monotonic()
                with patch('auto_broker.http', get), patch('auto_broker.urllib.request.getproxies', return_value={}):
                    ready()
                elapsed = time.monotonic()-start
                print('local_cold_http_duration_ms=' + str(round(elapsed*1000)))
                self.assertGreaterEqual(elapsed, 4.5)
                self.assertLess(elapsed, 7)
                self.assertEqual(calls, [7])
            finally:
                server.shutdown()
                thread.join(timeout=2)
                self.assertFalse(thread.is_alive())

    def test_atomic_release_preserves_exact_reference_and_mode(self):
        with tempfile.TemporaryDirectory() as d:
            path = pathlib.Path(d)/'release.env'
            path.write_bytes(b'API_IMAGE=adilbaga-api:' + b'e'*40 + b'\n')
            os.chmod(path, 0o600)
            with patch('auto_broker.RELEASE', path):
                new = b'API_IMAGE=adilbaga-api:' + b'a'*40 + b'\n'
                replace_release(new)
                self.assertEqual(path.read_bytes(), new)
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
                with self.assertRaises(Blocked): replace_release(b'API_IMAGE=latest\n')

    def test_real_host_rollback_order_without_docker_or_network(self):
        host = Host()
        host.old = b'API_IMAGE=adilbaga-api:' + b'e'*40 + b'\n'
        calls = []
        for name in ['stop', 'unchanged', 'hardening', 'local', 'open', 'public']:
            setattr(host, name, lambda name=name: calls.append(name))
        with patch('auto_broker.replace_release', lambda raw: calls.append(('restore',raw))), \
             patch('auto_broker.recreate', lambda: calls.append('recreate')), \
             patch('auto_broker.ready', lambda: calls.append('ready')):
            host.rollback()
        self.assertEqual(calls, ['stop',('restore',host.old),'recreate','ready','unchanged','hardening','local','open','public'])

    def test_flock_exclusion_and_release(self):
        with tempfile.TemporaryDirectory() as d:
            path = pathlib.Path(d)/'lock'
            with open(path, 'w') as a, open(path, 'r') as b:
                fcntl.flock(a, fcntl.LOCK_EX|fcntl.LOCK_NB)
                with self.assertRaises(BlockingIOError): fcntl.flock(b, fcntl.LOCK_EX|fcntl.LOCK_NB)
                fcntl.flock(a, fcntl.LOCK_UN)
                fcntl.flock(b, fcntl.LOCK_EX|fcntl.LOCK_NB)

    def test_readiness_voice_redis_cors_security_failures_rollback(self):
        for reason in ['persistent_readiness','voice_price','session_ttl','session_deleted','cors_allowed',
                       'http_content_type','measured_peer','runtime_hardening','command_timeout_or_start']:
            with self.subTest(reason=reason):
                host=FakeHost()
                def fail(reason=reason): raise Blocked(reason)
                host.local=fail
                self.assertEqual(rollout(host,manifest(),None),'BLOCKED_ROLLED_BACK')

    def test_process_interrupt_during_cutover_compensates(self):
        host=FakeHost()
        def interrupted(*_): raise KeyboardInterrupt()
        host.activate=interrupted
        self.assertEqual(rollout(host,manifest(),None),'BLOCKED_ROLLED_BACK')

    def test_transfer_integrity_before_load_and_interruption_cleanup(self):
        data=b'not a real Docker image: synthetic transport bytes'
        m=manifest()
        m['size']=len(data)
        m['archive']=hashlib.sha256(data).hexdigest()
        with tempfile.TemporaryDirectory() as d:
            path=pathlib.Path(d)/'image.tar'
            receive_archive(io.BytesIO(data),m,path)
            self.assertEqual(path.read_bytes(),data)
            path.unlink()
            for body in [data[:-1], data+b'extra', b'x'*len(data)]:
                with self.assertRaises(Blocked): receive_archive(io.BytesIO(body),m,path)
                self.assertFalse(path.exists())

    def test_save_cannot_overwrite_previous_image_tag(self):
        with approved_fixture(['adilbaga-api:' + SHA, 'adilbaga-api:' + 'e'*40]) as (m,path,*_):
            with patch('auto_broker.command') as run:
                with self.assertRaisesRegex(Blocked,'save_tag_allowlist'): Host().identity(m,path)
                run.assert_not_called()

    def assert_preload_rejected(self, m, path):
        host = Host()
        host.prior = 'adilbaga-api:' + 'e'*40
        host.preflight = lambda: None
        host.fresh_main = lambda *_: True
        with patch('auto_broker.command') as command, patch.object(host, 'stop') as stop, \
             patch.object(host, 'activate') as activate, patch('auto_broker.replace_release') as release:
            with self.assertRaises((Blocked, OSError)): rollout(host, m, path)
            command.assert_not_called()
            stop.assert_not_called()
            activate.assert_not_called()
            release.assert_not_called()

    def test_authorization_wrong_bound_fields_rejected_before_all_sinks(self):
        mutations = dict(repository='other/repo', environment='staging', releaseSha='b'*40,
                         ciWorkflow='.github/workflows/other.yml', ciRunId=41, ciAttempt=3,
                         buildWorkflow='.github/workflows/other.yml', buildRunId=44, buildAttempt=2,
                         artifactIdentity={'id':100,'name':'wrong'}, archiveSha256='a'*64,
                         archiveSize=1, approved=False, approvedBy='uploader', authorizationId='../x',
                         approvedAt=int(time.time())+60, expiresAt=int(time.time())-1, schemaVersion=True)
        for key, value in mutations.items():
            with self.subTest(key=key), approved_fixture() as (m,path,a,record,_):
                a[key] = value
                record.write_text(json.dumps(a))
                self.assert_preload_rejected(m,path)

    def test_missing_corrupt_duplicate_oversized_or_unreadable_approval(self):
        for kind in ['missing','corrupt','duplicate','oversized','unreadable']:
            with self.subTest(kind=kind), approved_fixture() as (m,path,a,record,_):
                if kind == 'missing': record.unlink()
                if kind == 'corrupt': record.write_bytes(b'{')
                if kind == 'duplicate': record.write_text(json.dumps(a)[:-1]+',"approved":true}')
                if kind == 'oversized': record.write_bytes(b' '*16385)
                if kind == 'unreadable':
                    with patch('auto_broker.root_bytes',side_effect=PermissionError()):
                        self.assert_preload_rejected(m,path)
                    continue
                self.assert_preload_rejected(m,path)

    def test_record_filesystem_trust_is_not_uploader_authority(self):
        for kind in ['record_symlink','parent_symlink','record_mode','parent_writable','ancestor_writable',
                     'record_owner','parent_owner','ancestor_owner','archive_symlink','archive_mode']:
            with self.subTest(kind=kind), approved_fixture() as (m,path,a,record,control):
                parent=record.parent
                if kind == 'record_symlink':
                    copy=record.with_suffix('.copy');record.rename(copy);record.symlink_to(copy)
                if kind == 'parent_symlink':
                    copy=parent.with_name('moved');parent.rename(copy);parent.symlink_to(copy)
                if kind == 'record_mode': os.chmod(record,0o644)
                if kind == 'parent_writable': os.chmod(parent,0o777)
                if kind == 'ancestor_writable': os.chmod(parent.parent,0o777)
                if kind == 'record_owner': control['bad_owner']=str(record)
                if kind == 'parent_owner': control['bad_owner']=str(parent)
                if kind == 'ancestor_owner': control['bad_owner']=str(parent.parent)
                if kind == 'archive_symlink':
                    copy=path.with_suffix('.copy');path.rename(copy);path.symlink_to(copy)
                if kind == 'archive_mode': os.chmod(path,0o644)
                self.assert_preload_rejected(m,path)

    def test_forged_manifest_and_resaved_archive_cannot_reauthorize_themselves(self):
        for kind in ['bytes','size','provenance','auth_path']:
            with self.subTest(kind=kind), approved_fixture() as (m,path,a,record,_):
                if kind == 'bytes':
                    path.write_bytes(path.read_bytes()+b'changed')
                    m.update(archive=hashlib.sha256(path.read_bytes()).hexdigest(),size=path.stat().st_size)
                if kind == 'size': path.write_bytes(path.read_bytes()[:-1])
                if kind == 'provenance': m['provenance']['buildAttempt']=9
                if kind == 'auth_path': m['authorizationPath']=str(record)
                self.assert_preload_rejected(m,path)

    def test_archive_replacement_or_mutation_after_verification_is_rejected(self):
        for replacement in [False,True]:
            with self.subTest(replacement=replacement), approved_fixture() as (m,path,*_):
                with approved_archive(m,path) as (fd,raw,a,identity):
                    data=path.read_bytes()
                    if replacement: path.unlink()
                    path.write_bytes(data if replacement else data+b'x')
                    os.chmod(path,0o600)
                    with patch('auto_broker.command') as run:
                        with self.assertRaisesRegex(Blocked,'archive_changed_before_load'):
                            Host()._load_approved(m,path,fd,raw,a,identity)
                        run.assert_not_called()

    def test_approval_replaced_after_verification_rejects_before_load(self):
        with approved_fixture() as (m,path,a,record,_):
            with approved_archive(m,path) as (fd,raw,a,identity):
                a['authorizationId']='b'*32
                record.write_text(json.dumps(a))
                with patch('auto_broker.command') as run:
                    with self.assertRaisesRegex(Blocked,'authorization_changed'):
                        Host()._load_approved(m,path,fd,raw,a,identity)
                    run.assert_not_called()

    def test_sealed_archive_descriptor_survives_real_child_fd_handoff(self):
        with approved_fixture() as (m,path,*_):
            with approved_archive(m,path) as (fd,*_):
                result=subprocess.run(['python3','-B','-c',
                    'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())',
                    '/proc/self/fd/'+str(fd)],pass_fds=(fd,),capture_output=True,text=True,timeout=5,
                    env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'})
                self.assertEqual(result.returncode,0)
                self.assertEqual(result.stdout.strip(),m['archive'])

    def test_exact_approved_bytes_are_sealed_and_consumed_once(self):
        with approved_fixture() as (m,path,a,record,_):
            image=dict(Os='linux',Architecture='amd64',Config=dict(User=m['user'],Entrypoint=m['entrypoint'],
                Labels={'org.opencontainers.image.revision':SHA},Env=['PATH=/usr/bin']),RootFS={'Layers':m['rootfs']})
            m['binary']=hashlib.sha256(b'synthetic executable').hexdigest()
            calls=[]
            def command(args,*_,**kwargs):
                calls.append(args[:2])
                if args[:2]==['docker','load']:
                    fd=kwargs['pass_fds'][0]
                    with self.assertRaises(OSError): os.write(fd,b'forged')
                    self.assertEqual(hashlib.sha256(os.pread(fd,m['size'],0)).hexdigest(),m['archive'])
                    self.assertEqual(args[-1],'/proc/self/fd/'+str(fd))
                if args[:2]==['docker','create']: return b'c'*64
                if args[:2]==['docker','cp']: pathlib.Path(args[-1]).write_bytes(b'synthetic executable')
                return b''
            with patch('auto_broker.command',command),patch('auto_broker.inspect',return_value=image):
                host=Host()
                host.prior='adilbaga-api:'+'e'*40
                host.preflight=lambda: None
                host.fresh_main=lambda *_: True
                cutover=[]
                for name in ['stop','activate','local','open','public','observe']:
                    setattr(host,name,lambda *_,name=name: cutover.append(name))
                self.assertEqual(rollout(host,m,path),'DEPLOYED')
                self.assertEqual(cutover,['stop','activate','local','open','public','observe'])
            self.assertEqual(calls,[['docker','load'],['docker','create'],['docker','cp'],['docker','rm']])
            self.assertTrue((record.parent/(a['authorizationId']+'.used')).exists())
            with patch('auto_broker.command') as run:
                with self.assertRaises(Blocked): Host().identity(m,path)
                run.assert_not_called()
            record.write_text(record.read_text()+' ')
            with self.assertRaisesRegex(Blocked,'authorization_changed_before_cutover'): host.recheck_authorization()

    def test_stale_before_load_and_authorization_failure_never_roll_back(self):
        host=FakeHost('stale')
        self.assertEqual(rollout(host,manifest(),None),'SKIPPED_STALE')
        self.assertEqual(host.calls,['preflight','fresh_main'])
        host=FakeHost('reauthorize')
        with self.assertRaises(Blocked): rollout(host,manifest(),None)
        self.assertNotIn('stop',host.calls)
        self.assertNotIn('rollback',host.calls)
        host=FakeHost()
        answers=iter([True,False])
        host.fresh_main=lambda *_: next(answers)
        self.assertEqual(rollout(host,manifest(),None),'SKIPPED_STALE')
        self.assertNotIn('stop',host.calls)

    def test_node_immutable_producer_and_download_regressions(self):
        # Keep support/tests inside the approved seven-file scope. No network,
        # credentials, Docker or external artifact is used by this Node harness.
        program = r"""
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,symlinkSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {validateProducer,verifyDownloaded,artifactMetadata,artifactName,gateCandidate} from './scripts/deploy/auto-build.mjs';
import {manualRelease} from './scripts/deploy/auto-transport.mjs';
const sha='a'.repeat(40),raw=Buffer.from('synthetic saved archive'),hash=createHash('sha256').update(raw).digest('hex');
const run={id:43,workflow_id:7,event:'workflow_dispatch',head_branch:'main',head_sha:sha,status:'completed',
 conclusion:'success',run_attempt:1,repository:{full_name:'kiratonine/AdilBaga'},head_repository:{full_name:'kiratonine/AdilBaga'}};
const workflow={id:7,path:'.github/workflows/deploy-production.yml',state:'active'};
const artifact={id:99,name:artifactName(sha,43,1),expired:false,workflow_run:{id:43,head_sha:sha}};
const ci={id:42,run_attempt:2,head_sha:sha};
const m={sha,size:raw.length,archive:hash,provenance:{repository:'kiratonine/AdilBaga',ciWorkflow:'.github/workflows/ci.yml',
 ciRunId:42,ciAttempt:2,buildWorkflow:workflow.path,buildRunId:43,buildAttempt:1}};
validateProducer(m,run,workflow,artifact,ci);
for(const [object,key,bad] of [[run,'event','push'],[run,'head_sha','b'.repeat(40)],[run,'conclusion','failure'],
 [run,'run_attempt',2],[workflow,'path','other'],[workflow,'id',8],[artifact,'expired',true],
 [artifact,'name','reused-name'],[ci,'id',41],[ci,'run_attempt',1],[ci,'head_sha','b'.repeat(40)]]) {
 const good=object[key];object[key]=bad;assert.throws(()=>validateProducer(m,run,workflow,artifact,ci));object[key]=good;
}
for(const object of [run.repository,run.head_repository]) {
 const good=object.full_name;object.full_name='fork/repo';assert.throws(()=>validateProducer(m,run,workflow,artifact,ci));object.full_name=good;
}
const dir=mkdtempSync(join(tmpdir(),'security01-node-test-'));
try {
 writeFileSync(join(dir,'manifest.json'),JSON.stringify(m));writeFileSync(join(dir,'image.tar'),raw);
 assert.deepEqual(verifyDownloaded(dir,{run,workflow,artifact,ci}).provenance.artifactIdentity,{id:99,name:artifact.name});
 writeFileSync(join(dir,'image.tar'),Buffer.concat([raw,Buffer.from('resaved')]));
 assert.throws(()=>verifyDownloaded(dir,{run,workflow,artifact,ci}));
 rmSync(join(dir,'image.tar'));symlinkSync(join(dir,'manifest.json'),join(dir,'image.tar'));
 assert.throws(()=>verifyDownloaded(dir,{run,workflow,artifact,ci}));
} finally {rmSync(dir,{recursive:true});}
const release={AUTO_DEPLOY_ENABLED:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',DEPLOY_MODE:'deploy'};
manualRelease(release);
for(const [key,value] of [['AUTO_DEPLOY_ENABLED',undefined],['AUTO_DEPLOY_ENABLED','false'],['GITHUB_EVENT_NAME','workflow_run'],
 ['GITHUB_REF','refs/heads/feature'],['DEPLOY_MODE','build'],['DEPLOY_MODE','dry-run']])assert.throws(()=>manualRelease({...release,[key]:value}));
const event={repository:{full_name:'kiratonine/AdilBaga'},inputs:{mode:'build',sha,ci_run:'42'}};
assert.equal(gateCandidate(event,{...release,AUTO_DEPLOY_ENABLED:'false'}).status,'VERIFY_CI');
assert.equal(gateCandidate({...event,inputs:{...event.inputs,mode:'deploy'}},{...release,AUTO_DEPLOY_ENABLED:'false'}).status,'DISABLED');
assert.equal(gateCandidate(event,{...release,GITHUB_REF:'refs/heads/feature'}).status,'REJECTED_EVENT');
let calls=[];const env={RELEASE_SHA:sha,RELEASE_ARTIFACT_ID:'99',CI_RUN:'42'};
const get=async p=>{calls.push(p);return {'actions/artifacts/99':artifact,'actions/runs/43':run,
 'actions/workflows/7':workflow,'actions/runs/42':ci}[p];};
assert.equal((await artifactMetadata(env,get)).artifact.id,99);assert.equal(calls.length,4);
await assert.rejects(artifactMetadata({...env,RELEASE_ARTIFACT_ID:'../x'},get));
await assert.rejects(artifactMetadata(env,async()=>{throw Error('offline');}));
const yaml=readFileSync('.github/workflows/deploy-production.yml','utf8');
const build=yaml.split('  build_only:')[1].split('  rollout:')[0];
assert.ok(!/secrets\.|environment:|auto-transport/.test(build));
const rollout=yaml.split('  rollout:')[1];assert.ok(rollout.includes("inputs.mode == 'deploy'"));
assert.ok(rollout.includes("vars.AUTO_DEPLOY_ENABLED == 'true'"));
assert.ok(!rollout.includes('auto-build.mjs build'));assert.ok(rollout.includes('artifact-ids:'));
const broker=readFileSync('scripts/deploy/auto_broker.py','utf8');
assert.ok(!broker.includes("operation == 'authorize'"));
console.log('offline producer/download/manual release assertions PASS');
"""
        result = subprocess.run(['node','--input-type=module','-e',program],
                                cwd=pathlib.Path(__file__).resolve().parents[2], capture_output=True,
                                text=True, timeout=30, env={'PATH':os.environ['PATH'], 'HOME':os.environ['HOME']})
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

    def test_observed_5xx_runs_existing_single_compensation(self):
        for status in [500, 502, 503, 504, 501, 599]:
            with self.subTest(status=status):
                host=FakeHost()
                observer=Host()
                observer.unchanged=lambda: None
                observer.hardening=lambda: None
                host.observe=observer.observe
                def run(args, **_):
                    if args[0]=='systemctl': return b'active\n'
                    return json.dumps({'level':'INFO','status':status}).encode()
                with patch('auto_broker.command',run), patch('auto_broker.http'), \
                     patch('auto_broker.inspect',return_value={'State':{'StartedAt':'synthetic'}}):
                    self.assertEqual(rollout(host,manifest(),None),'BLOCKED_ROLLED_BACK')
                self.assertEqual(host.calls.count('rollback'),1)

    def test_observed_2xx_4xx_and_non_http_metadata_remain_successful(self):
        statuses=[200,201,204,400,403,404,429,499]
        raw=b'\n'.join(json.dumps({'level':'INFO','status':s}).encode() for s in statuses)
        raw+=b'\n'+json.dumps({'level':'INFO','operation':'synthetic'}).encode()
        host=Host()
        host.unchanged=lambda: None
        host.hardening=lambda: None
        def run(args, **_): return b'active\n' if args[0]=='systemctl' else raw
        with patch('auto_broker.command',run), patch('auto_broker.http'), \
             patch('auto_broker.inspect',return_value={'State':{'StartedAt':'synthetic'}}), \
             patch('auto_broker.time.monotonic',side_effect=[0,600]):
            host.observe()

    def test_journal_fsyncs_file_before_replace_then_directory(self):
        with tempfile.TemporaryDirectory() as d:
            path=pathlib.Path(d)/'synthetic.json'
            real_sync, real_replace=os.fsync,os.replace
            for status in ['RUNNING','DEPLOYED','BLOCKED_ROLLED_BACK','BLOCKED_ROLLBACK_FAILED']:
                with self.subTest(status=status):
                    calls=[]
                    def sync(fd):
                        if pathlib.Path('/proc/self/fd/'+str(fd)).resolve()==path.parent:
                            calls.append('directory_fsync')
                        else:
                            calls.append('file_fsync')
                            # flush has already made complete bytes visible to another descriptor.
                            self.assertEqual(json.loads(path.with_suffix('.next').read_text()),{'status':status})
                        real_sync(fd)
                    def replace(src,dst):
                        calls.append('replace')
                        self.assertEqual(calls,['file_fsync','replace'])
                        real_replace(src,dst)
                    with patch('auto_broker.os.fsync',sync),patch('auto_broker.os.replace',replace):
                        write_result(path,status)
                    self.assertEqual(calls,['file_fsync','replace','directory_fsync'])
                    self.assertEqual(json.loads(path.read_text()),{'status':status})
                    self.assertEqual(path.stat().st_mode & 0o777,0o600)
                    self.assertFalse(path.with_suffix('.next').exists())

    def test_journal_file_fsync_failure_preserves_previous_status(self):
        with tempfile.TemporaryDirectory() as d:
            path=pathlib.Path(d)/'synthetic.json'
            write_result(path,'RUNNING')
            with patch('auto_broker.os.fsync',side_effect=OSError('synthetic disk failure')), \
                 patch('auto_broker.os.replace') as replace:
                with self.assertRaises(OSError): write_result(path,'DEPLOYED')
                replace.assert_not_called()
            self.assertEqual(json.loads(path.read_text()),{'status':'RUNNING'})
            self.assertFalse(path.with_suffix('.next').exists())

    def test_journal_directory_fsync_failure_is_not_acknowledged(self):
        with tempfile.TemporaryDirectory() as d:
            path=pathlib.Path(d)/'synthetic.json'
            real_sync=os.fsync
            count=[0]
            def sync(fd):
                count[0]+=1
                if count[0]==2: raise OSError('synthetic directory sync failure')
                real_sync(fd)
            with patch('auto_broker.os.fsync',sync):
                with self.assertRaises(OSError): write_result(path,'RUNNING')
            self.assertEqual(count[0],2)


if __name__ == '__main__': unittest.main()
