#!/usr/bin/env python3
"""Scheduled dry-run/apply pair. No provisioning, approval creation or arming.

Only an existing independent READY record can select the fixed immutable ELF.
Go's unchanged private IPC remains the sole READY/S0 authority. Missing/bad C2
state selects the original publication path with C2 stripped, never a fake PASS.
"""
import contextlib
import datetime as dt
import hashlib
import json
import os
import re
import selectors
import stat
import subprocess
import sys
import time

READY = '/etc/aktau-c2/ready.json'
AUTH = '/etc/aktau-c2/authorization.json'
INGEST = '/usr/local/libexec/aktau-c2-ingest'
GO = '/usr/local/go/bin/go'
FIELDS = ('version', 'attemptId', 'sourceSha', 'frontendSha', 'deploymentId',
          'confirmedAt', 'bootId', 'operatorUid', 'operatorGid', 'supervisorPid',
          'supervisorStartTicks', 'nodeExecutable', 'nodeSha256', 'commandSha256',
          'supervisorSha256', 'ingestSha256', 'relaySha256', 'expiresAt')


def require(ok):
    if not ok:
        raise ValueError('not_armed')


def canonical(v):
    return (json.dumps(v, separators=(',', ':'), ensure_ascii=False) + '\n').encode()


def identity(s):
    return (s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid, s.st_nlink,
            s.st_size, s.st_mtime_ns, s.st_ctime_ns)


@contextlib.contextmanager
def root_file(path, limit, mode=None):
    """Pinned no-follow root ancestry, bounded regular single-linked file."""
    parent = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    fd = None
    try:
        for name in path.strip('/').split('/')[:-1]:
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
            os.close(parent)
            parent = child
            s = os.fstat(parent)
            require(s.st_uid == 0 and not s.st_mode & 0o022)
        fd = os.open(path.split('/')[-1], os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
        s = os.fstat(fd)
        require(stat.S_ISREG(s.st_mode) and s.st_uid == 0 and s.st_nlink == 1
                and not s.st_mode & 0o022 and 0 < s.st_size <= limit
                and (mode is None or stat.S_IMODE(s.st_mode) == mode))
        yield fd, identity(s)
    finally:
        if fd is not None:
            os.close(fd)
        os.close(parent)


def read_pinned(fd, expected):
    data = os.pread(fd, expected[6] + 1, 0)
    require(len(data) == expected[6] and identity(os.fstat(fd)) == expected)
    return data


def record(raw):
    a = json.loads(raw)
    require(type(a) is dict and tuple(a) == FIELDS and canonical(a) == raw)
    require(type(a['version']) is int and a['version'] == 1
            and type(a['operatorUid']) is int and a['operatorUid'] == os.geteuid() > 0
            and type(a['operatorGid']) is int and a['operatorGid'] == os.getegid()
            and type(a['supervisorPid']) is int and a['supervisorPid'] > 0)
    for name, length in [('attemptId', 32), ('sourceSha', 40), ('frontendSha', 40),
                         *[(k, 64) for k in ('nodeSha256', 'commandSha256', 'supervisorSha256', 'ingestSha256', 'relaySha256')]]:
        require(type(a[name]) is str and re.fullmatch('[0-9a-f]{'+str(length)+'}', a[name]))
    require(type(a['bootId']) is str and re.fullmatch('[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}', a['bootId']))
    require(type(a['deploymentId']) is str and re.fullmatch('dpl_[a-zA-Z0-9]{1,80}', a['deploymentId']))
    require(type(a['supervisorStartTicks']) is str and re.fullmatch('[1-9][0-9]{0,19}', a['supervisorStartTicks']))
    require(type(a['nodeExecutable']) is str and re.fullmatch('/[a-zA-Z0-9_./-]{1,255}', a['nodeExecutable'])
            and os.path.normpath(a['nodeExecutable']) == a['nodeExecutable'])
    times = []
    for key in ('confirmedAt', 'expiresAt'):
        v = a[key]
        require(type(v) is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z', v))
        t = dt.datetime.fromisoformat(v.replace('Z', '+00:00'))
        require(t.isoformat(timespec='milliseconds').replace('+00:00', 'Z') == v)
        times.append(t)
    now = dt.datetime.now(dt.timezone.utc)
    require(times[0] <= now < times[1] and dt.timedelta() < times[1]-times[0] <= dt.timedelta(minutes=35))
    with open('/proc/sys/kernel/random/boot_id', encoding='ascii') as f:
        require(f.read().strip() == a['bootId'])
    return a


def scope(a, raw):
    """One scheduled pair, not proof of READY. Unknown/partial claims persist."""
    path = '/var/lib/aktau-sync/c2/' + a['attemptId']
    parent = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        for name in path.strip('/').split('/'):
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
            os.close(parent)
            parent = child
            s = os.fstat(parent)
            require(s.st_uid in (0, os.geteuid()) and not s.st_mode & 0o022)
        s = os.fstat(parent)
        require(s.st_uid == a['operatorUid'] and s.st_gid == a['operatorGid'] and stat.S_IMODE(s.st_mode) == 0o700)
        linked = os.stat(path, follow_symlinks=False)
        require((s.st_dev, s.st_ino) == (linked.st_dev, linked.st_ino))
        fd = os.open('publisher.claim', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=parent)
        try:
            data = canonical({'version': 1, 'attemptId': a['attemptId'], 'authoritySha256': hashlib.sha256(raw).hexdigest()})
            require(os.write(fd, data) == len(data))
            os.fsync(fd)
            own = os.fstat(fd)
            linked_claim = os.stat('publisher.claim', dir_fd=parent, follow_symlinks=False)
            require(stat.S_ISREG(own.st_mode) and own.st_uid == a['operatorUid']
                    and own.st_gid == a['operatorGid'] and own.st_nlink == 1
                    and stat.S_IMODE(own.st_mode) == 0o600
                    and (own.st_dev, own.st_ino) == (linked_claim.st_dev, linked_claim.st_ino))
        finally:
            os.close(fd)
        os.fsync(parent)
        linked = os.stat(path, follow_symlinks=False)
        require((s.st_dev, s.st_ino) == (linked.st_dev, linked.st_ino))
    finally:
        os.close(parent)


class Candidate:
    def __init__(self, fd, pinned, raw, approved):
        self.fd, self.pinned, self.raw, self.approved = fd, pinned, raw, approved

    def variables(self):
        require(identity(os.fstat(self.fd)) == self.pinned)
        with root_file(READY, 4096) as (fd, s):
            require(read_pinned(fd, s) == self.raw)
        with root_file(AUTH, 16384) as (fd, s):
            require(read_pinned(fd, s) == self.approved)
        a = record(self.raw)
        return {'C2_EVENT_FIFO': '/var/lib/aktau-sync/c2/'+a['attemptId']+'/event.fifo',
                'C2_EVENT_ATTEMPT_ID': a['attemptId']}


def inspect_output(argv, fds):
    """Bound inspection only, not the business ingest lifetime. No descendants."""
    p = subprocess.Popen(argv, env={'GOTOOLCHAIN': 'local'}, stdin=subprocess.DEVNULL,
                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, pass_fds=fds)
    try:
        deadline = time.monotonic() + 1
        data = bytearray()
        with selectors.DefaultSelector() as selected:
            selected.register(p.stdout, selectors.EVENT_READ)
            while True:
                remaining = deadline - time.monotonic()
                require(remaining > 0 and selected.select(remaining))
                block = os.read(p.stdout.fileno(), 32769-len(data))
                if not block:
                    break
                data.extend(block)
                require(len(data) <= 32768)
        require(p.wait(timeout=max(0.001, deadline-time.monotonic())) == 0)
        return bytes(data)
    finally:
        if p.poll() is None:
            p.kill()
        p.wait(timeout=1)
        p.stdout.close()


def admit(stack):
    with root_file(READY, 4096) as (fd, s):
        raw = read_pinned(fd, s)
    a = record(raw)
    with root_file(AUTH, 16384) as (fd, s):
        approved = read_pinned(fd, s)
    auth = json.loads(approved)
    require(type(auth) is dict and set(auth) == {'version', 'approved', 'sourceSha', 'binarySha256', 'clockSha256', 'buildId', 'platform'}
            and canonical(auth) == approved and type(auth['version']) is int and auth['version'] == 1 and auth['approved'] is True
            and auth['sourceSha'] == a['sourceSha'] and auth['clockSha256'] == a['relaySha256']
            and type(auth['binarySha256']) is str and re.fullmatch('[0-9a-f]{64}', auth['binarySha256'])
            and type(auth['buildId']) is str and re.fullmatch('[a-zA-Z0-9_-]{1,80}', auth['buildId'])
            and auth['platform'] == 'linux/amd64')
    fd, pinned = stack.enter_context(root_file(INGEST, 64 << 20, 0o555))
    data = read_pinned(fd, pinned)
    require(data[:6] == b'\x7fELF\x02\x01' and data[18:20] == b'\x3e\x00'
            and hashlib.sha256(data).hexdigest() == a['ingestSha256'])
    # Inspect, never execute, the candidate. Fixed root-controlled Go tool, no
    # caller executable/argv override. Descriptor survives pathname replacement.
    gofd, _ = stack.enter_context(root_file(GO, 64 << 20))
    for args, expected in [(['version'], 'go version go1.27.3 linux/amd64\n'),
                           (['version', '-m', '/proc/self/fd/'+str(fd)], '/proc/self/fd/'+str(fd)+': go1.27.3\n')]:
        output = inspect_output(['/proc/self/fd/'+str(gofd), *args], (fd, gofd))
        require(len(output) <= 32768 and output.decode('utf8').splitlines(keepends=True)[0] == expected)
    c = Candidate(fd, pinned, raw, approved)
    c.variables()  # stable independent state before creating own per-attempt claim
    scope(a, raw)
    return c


def run_pair(bundle):
    env = {k: v for k, v in os.environ.items() if not k.startswith('C2_')}
    env['GOTOOLCHAIN'] = 'local'  # no unnoticed toolchain download on a sync host
    with contextlib.ExitStack() as stack:
        try:
            candidate = admit(stack)
        except Exception:
            candidate = None
        print(json.dumps({'message': 'c2_launch', 'outcome_class': 'immutable_candidate' if candidate else 'not_armed'}), file=sys.stderr)
        for apply in (False, True):
            variables = {}
            try:
                if candidate:
                    variables = candidate.variables()
            except Exception:
                candidate = None
            argv = ['go', 'run', './cmd/ingest'] if candidate is None else ['/proc/self/fd/'+str(candidate.fd)]
            argv += ['-bundle', bundle] + (['-apply'] if apply else [])
            child_env = {**env, **(variables if apply else {})}
            p = subprocess.run(argv, env=child_env, pass_fds=(candidate.fd,) if candidate else (), check=False)
            if p.returncode:
                return p.returncode if p.returncode > 0 else 128-p.returncode
    return 0


if __name__ == '__main__':
    try:
        require(len(sys.argv) == 2 and sys.platform == 'linux')
        sys.exit(run_pair(sys.argv[1]))
    except Exception:
        print('{"message":"ingest_launch_failed"}', file=sys.stderr)
        sys.exit(1)
