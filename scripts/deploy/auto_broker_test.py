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
from unittest.mock import patch
from auto_broker import Blocked, Host, rollout, ready, validate_manifest, verify_image, replace_release, receive_archive, write_result

SHA = 'a' * 40


def manifest():
    return dict(sha=SHA, revision=SHA, os='linux', arch='amd64', user='10001:10001',
                entrypoint=['/usr/local/bin/api'], rootfs=['sha256:' + 'b' * 64],
                binary='c' * 64, archive='d' * 64, size=100)


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
        self.assertEqual(host.calls, ['preflight', 'identity', 'fresh_main', 'stop', 'activate', 'local', 'open', 'public', 'observe'])

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
        with tempfile.TemporaryDirectory() as d:
            path=pathlib.Path(d)/'image.tar'
            tags=['adilbaga-api:' + SHA, 'adilbaga-api:' + 'e'*40]
            raw=json.dumps([{'RepoTags':tags}]).encode()
            with tarfile.open(path,'w') as archive:
                entry=tarfile.TarInfo('manifest.json')
                entry.size=len(raw)
                archive.addfile(entry,io.BytesIO(raw))
            m=manifest()
            m['archive']=hashlib.sha256(path.read_bytes()).hexdigest()
            with patch('auto_broker.command') as run:
                with self.assertRaisesRegex(Blocked,'save_tag_allowlist'): Host().identity(m,path)
                run.assert_not_called()

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
