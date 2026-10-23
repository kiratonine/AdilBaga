#!/usr/bin/python3
"""Owner-delegated sync/C2 release protocol. No DB, publication or general exec.

The SSH principal can supply bytes, NOT approval. Root independently obtains
GitHub producer/CI/digest evidence over HTTPS and enforces a root-installed
workflow/build-tool policy. Local initial reconciliation needs a different,
root-only, exact-byte single-use authorization. No secret is read by this tool.
"""
import contextlib
import datetime
import fcntl
import hashlib
import io
import json
import os
import pathlib
import pwd
import re
import selectors
import signal
import stat
import struct
import subprocess
import sys
import time
import urllib.request
import zipfile
import tarfile

REPOSITORY = 'kiratonine/AdilBaga'
BUILD_WORKFLOW = '.github/workflows/sync-publisher-build.yml'
CI_JOBS = ('Contracts', 'Go Quality', 'Nest Reference', 'Frontend', 'Pipeline Quality',
           'Security', 'PostgreSQL Integration', 'Ephemeral Staging', 'CI Gate')
BASE = '/var/lib/aktau-sync-promotion'
POLICY = '/etc/aktau-sync-promotion/policy.json'
INITIAL = '/etc/aktau-sync-promotion/initial-approval.json'
ROOT = '/usr/local/libexec/aktau-sync-promotion'
LOCK = BASE + '/runtime.lock'
INTERLOCK = BASE + '/interlock.json'
PUBLISHER = '/opt/aktau-sync'
KIT = '/usr/local/libexec/aktau-c2'
NODE = '/usr/local/lib/nodejs/node-v24.18.0-linux-x64/bin/node'
FILES = {'node': NODE, 'entry.mjs': '/usr/local/libexec/aktau-c2-operator.mjs',
         'custodian.py': '/usr/local/libexec/aktau-c2-custodian.py',
         'ingest': '/usr/local/libexec/aktau-c2-ingest',
         **{n: KIT + '/' + n for n in ('c2projection', 'relayprobe', 'c2-production-supervisor.mjs',
            'projection-provider.mjs', 'fifo-adapter.mjs', 'production-observer.mjs', 'c2-manifest.mjs', 'source-manifest.json')}}
RUNTIME_FILES = (ROOT + '/publisher-promotion.py', ROOT + '/promotion-runtime-gate.py',
                 '/usr/local/sbin/aktau-sync-promote',
                 '/etc/systemd/system/aktau-sync.service.d/40-promotion-lock.conf',
                 '/etc/systemd/system/aktau-sync-full.service.d/40-promotion-lock.conf',
                 '/etc/systemd/system/aktau-c2-custodian.service.d/40-promotion-lock.conf')
AUTH = '/etc/aktau-c2/authorization.json'
AUTO = '/etc/aktau-c2/automatic.json'
SITE = '/etc/aktau-c2/frontend.json'
RECORDS = (AUTH, AUTO)
MAX_ARCHIVE = 256 << 20
MAX_TAR = 256 << 20
SHA = re.compile(r'[a-f0-9]{40}\Z')
HEX = re.compile(r'[a-f0-9]{64}\Z')
RECIPE = 'CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-X main.sourceSHA=<sourceSha>" ./cmd/c2projection; CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath ./internal/revalidation/testdata/relayprobe'


class Blocked(Exception):
    pass


def need(ok, code='invalid_evidence'):
    if not ok:
        raise Blocked(code)


def canonical(value):
    return (json.dumps(value, separators=(',', ':'), ensure_ascii=False, allow_nan=False) + '\n').encode()


def parse(raw):
    def pairs(values):
        out = {}
        for key, value in values:
            need(key not in out, 'duplicate_key')
            out[key] = value
        return out
    try:
        value = json.loads(raw, object_pairs_hook=pairs,
                           parse_constant=lambda _: need(False, 'nonfinite_json'))
        need(canonical(value) == raw, 'noncanonical_json')
        return value
    except (ValueError, UnicodeError, TypeError):
        raise Blocked('invalid_json') from None


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def reply(value):
    sys.stdout.buffer.write(canonical(value))
    sys.stdout.buffer.flush()


def positive(n):
    return type(n) is int and 0 < n <= 9007199254740991


def relevant(paths):
    for p in paths:
        if p.endswith(('.md', '.test.ts', '.spec.ts', '_test.go', '.test.mjs')) or '/test/' in p or '/tests/' in p \
                or '/__tests__/' in p or pathlib.PurePosixPath(p).name.startswith('test_'):
            continue
        if p.startswith(('pipeline/src/', 'pipeline/scripts/', 'data/mapping/', 'ops/c2/')):
            return True
        if p in ['pipeline/package.json', 'pipeline/pnpm-lock.yaml', 'backend-go/go.mod', 'backend-go/go.sum']:
            return True
        if p in source_paths().values(): return True
        if p.startswith(('ops/sync/', 'backend-go/cmd/ingest/',
                         'backend-go/cmd/c2projection/', 'backend-go/internal/ingestion/',
                         'backend-go/internal/revalidation/', 'backend-go/internal/config/')):
            return True
        if p.startswith('backend-go/internal/postgres/') and pathlib.PurePosixPath(p).name not in (
                'dashboard.go', 'products.go', 'categories.go'):
            return True
    return False


def verify_release(*, sha, main, artifact, build, workflow, ci, jobs, now):
    need(type(sha) is str and SHA.fullmatch(sha) and sha == main, 'main_drift')
    for r in [build, ci]:
        need(r.get('repository', {}).get('full_name') == REPOSITORY
             and r.get('head_repository', {}).get('full_name') == REPOSITORY
             and r.get('head_sha') == sha and r.get('head_branch') == 'main'
             and r.get('status') == 'completed' and r.get('conclusion') == 'success'
             and positive(r.get('id')) and positive(r.get('run_attempt')), 'producer_identity')
    need(ci.get('event') == 'push' and ci.get('path') == '.github/workflows/ci.yml', 'ci_identity')
    need(build.get('event') in ['workflow_run', 'workflow_dispatch'] and build.get('path') == BUILD_WORKFLOW
         and workflow.get('path') == BUILD_WORKFLOW and workflow.get('id') == build.get('workflow_id')
         and workflow.get('state') == 'active', 'workflow_identity')
    need(len(jobs) == 9 and {j.get('name') for j in jobs} == set(CI_JOBS)
         and all(j.get('status') == 'completed' and j.get('conclusion') == 'success' for j in jobs), 'ci_jobs')
    need(positive(artifact.get('id')) and artifact.get('expired') is False
         and artifact.get('workflow_run', {}).get('id') == build['id']
         and artifact.get('workflow_run', {}).get('head_sha') == sha
         and artifact.get('name') == f"aktau-sync-c2-{sha}-{build['id']}-{build['run_attempt']}"
         and type(artifact.get('size_in_bytes')) is int and 0 < artifact['size_in_bytes'] <= MAX_ARCHIVE
         and type(artifact.get('digest')) is str and re.fullmatch(r'sha256:[a-f0-9]{64}', artifact['digest']), 'artifact_identity')
    try:
        expiry = datetime.datetime.fromisoformat(artifact['expires_at'].replace('Z', '+00:00')).timestamp()
    except (ValueError, KeyError, TypeError):
        raise Blocked('artifact_expiry') from None
    need(now < expiry, 'artifact_expired')
    return sha


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise Blocked('github_redirect')


def github(path, cap=1 << 20):
    need(type(path) is str and not path.startswith('/') and '..' not in path, 'metadata_path')
    req = urllib.request.Request('https://api.github.com/repos/' + REPOSITORY + '/' + path,
        headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'AdilBaga-Sync-Promotion/1',
                 'X-GitHub-Api-Version': '2022-11-28'})
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect()).open(req, timeout=8) as r:
            need(r.status == 200 and 'application/json' in r.headers.get('Content-Type', ''), 'metadata_status')
            raw = r.read(cap + 1)
            need(len(raw) <= cap, 'metadata_capacity')
            return json.loads(raw)
    except Blocked:
        raise
    except Exception:
        raise Blocked('trusted_authorization_unavailable') from None


def unpack_zip(raw, resource_guard=None):
    need(0 < len(raw) <= MAX_ARCHIVE, 'zip_capacity')
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            entries = z.infolist()
            need(len(entries) == 1 and entries[0].filename == 'promotion.tar'
                 and not entries[0].is_dir() and stat.S_IFMT(entries[0].external_attr >> 16) in (0, stat.S_IFREG)
                 and not entries[0].flag_bits & 1 and 0 < entries[0].file_size <= MAX_TAR, 'zip_inventory')
            if resource_guard: resource_guard(3 * entries[0].file_size + (64 << 20))
            return unpack_tar(z.read(entries[0]))
    except (zipfile.BadZipFile, RuntimeError):
        raise Blocked('zip_invalid') from None


def unpack_tar(raw):
    need(0 < len(raw) <= MAX_TAR, 'tar_capacity')
    try:
        with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as tar:
            members = tar.getmembers()
            allowed = set(FILES) | {'source.bundle', 'promotion.json'}
            need(len(members) == len(allowed) and {m.name for m in members} == allowed, 'tar_inventory')
            out = {}
            for m in members:
                need(m.isfile() and m.name in allowed and not m.pax_headers
                     and m.mode in (0o444, 0o555) and 0 < m.size <= (16384 if m.name == 'promotion.json' else 256 << 20), 'tar_member')
                out[m.name] = tar.extractfile(m).read(m.size + 1)
                need(len(out[m.name]) == m.size, 'tar_size')
            return out
    except tarfile.TarError:
        raise Blocked('tar_invalid') from None


def validate_package(contents, sha):
    need(set(contents) == set(FILES) | {'source.bundle', 'promotion.json'}, 'package_inventory')
    m = parse(contents['promotion.json'])
    need(type(m) is dict and set(m) == {'version', 'kind', 'sourceSha', 'sourceTree', 'goVersion', 'nodeVersion',
         'recipe', 'ciRunId', 'ciAttempt', 'buildRunId', 'buildAttempt', 'files', 'sourceBundleSha256'}
         and type(m['version']) is int and m['version'] == 1 and m['kind'] in ['initial', 'build-only', 'promote'] and m['sourceSha'] == sha
         and type(m['sourceTree']) is str and SHA.fullmatch(m['sourceTree'])
         and m['goVersion'] == 'go1.27.3' and m['nodeVersion'] == 'v24.18.0' and m['recipe'] == RECIPE
         and type(m['files']) is dict and set(m['files']) == set(FILES), 'package_schema')
    for name in FILES:
        need(type(m['files'][name]) is str and HEX.fullmatch(m['files'][name])
             and digest(contents[name]) == m['files'][name], 'closure_digest')
    need(digest(contents['source.bundle']) == m['sourceBundleSha256'], 'source_bundle_digest')
    need(all(type(m[k]) is int and (m[k] == 0 if m['kind'] == 'initial' else positive(m[k]))
             for k in ['ciRunId', 'ciAttempt', 'buildRunId', 'buildAttempt']), 'package_producer_types')
    need(parse(contents['source-manifest.json']) == {'sourceSha': sha, 'recipe': RECIPE, 'nodeMajor': 24}, 'source_manifest')
    for name in ['node', 'ingest', 'c2projection', 'relayprobe']:
        b = contents[name]
        need(len(b) >= 64 and b[:6] == b'\x7fELF\x02\x01' and b[18:20] == b'\x3e\x00', 'elf_platform')
    return m


def embedded_source(raw):
    """Read the real Go string global, not an uploader label or -m flag text.

    Go1.27.3 trimpath omits ldflags from build-info. The reviewed unstripped
    linux/amd64 recipe retains ELF symtab; Go stringStruct is {pointer,length}.
    Bounds-check every table/segment and reject missing/ambiguous globals.
    No uploaded executable is run to inspect this value.
    """
    need(64 <= len(raw) <= 64 << 20 and raw[:6] == b'\x7fELF\x02\x01'
         and raw[18:20] == b'\x3e\x00', 'source_elf')
    def part(offset, size):
        need(type(offset) is int and type(size) is int and 0 <= offset <= len(raw)
             and 0 <= size <= len(raw) - offset, 'elf_bounds')
        return raw[offset:offset + size]
    phoff, shoff = struct.unpack_from('<QQ', raw, 32)
    phsize, phnum, shsize, shnum = struct.unpack_from('<HHHH', raw, 54)
    need(phsize == 56 and 0 < phnum <= 128 and shsize == 64 and 0 < shnum <= 1024, 'elf_tables')
    sections = [struct.unpack('<IIQQQQIIQQ', part(shoff + i * shsize, shsize)) for i in range(shnum)]
    globals_found = []
    for section in sections:
        if section[1] != 2: continue  # SHT_SYMTAB; no dynamic symbol guessing
        need(section[9] == 24 and section[5] % 24 == 0 and section[6] < shnum, 'elf_symbols')
        names = sections[section[6]]
        need(names[1] == 3, 'elf_strings')
        strings = part(names[4], names[5])
        symtab = part(section[4], section[5])
        for at in range(0, len(symtab), 24):
            name, info, _, _, value, size = struct.unpack_from('<IBBHQQ', symtab, at)
            need(name < len(strings), 'elf_symbol_name')
            end = strings.find(b'\0', name); need(end >= name, 'elf_symbol_name')
            if strings[name:end] == b'main.sourceSHA':
                need(info & 15 == 1 and size == 16, 'go_string_global')
                globals_found.append(value)
    need(len(globals_found) == 1, 'source_global_missing_or_ambiguous')
    segments = [struct.unpack('<IIQQQQQQ', part(phoff + i * phsize, phsize)) for i in range(phnum)]
    def virtual(address, size):
        matches = [s[2] + address - s[3] for s in segments
                   if s[0] == 1 and s[3] <= address and address + size <= s[3] + s[5]]
        need(len(matches) == 1, 'elf_address')
        return part(matches[0], size)
    pointer, length = struct.unpack('<QQ', virtual(globals_found[0], 16))
    need(length == 40, 'source_global_length')
    try: source = virtual(pointer, length).decode('ascii')
    except UnicodeError: raise Blocked('source_global_encoding') from None
    need(SHA.fullmatch(source), 'source_global_value')
    return source


def command(argv, timeout=15, cap=1 << 20, pass_fds=()):
    """Fixed argv from source only. Bounded/reaped process group; no stderr logs."""
    child = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL, start_new_session=True, pass_fds=pass_fds,
                             env={'PATH': '/usr/local/go/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8',
                                  'GOTOOLCHAIN': 'local', 'GIT_OPTIONAL_LOCKS': '0',
                                  'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null',
                                  'GIT_NO_REPLACE_OBJECTS': '1', 'GIT_NO_LAZY_FETCH': '1'})
    end = time.monotonic() + timeout
    data = bytearray()
    completed = False
    try:
        with selectors.DefaultSelector() as sel:
            sel.register(child.stdout, selectors.EVENT_READ)
            while True:
                remaining = end - time.monotonic()
                need(remaining > 0 and sel.select(remaining), 'command_deadline')
                chunk = os.read(child.stdout.fileno(), min(65536, cap + 1 - len(data)))
                if not chunk:
                    break
                data.extend(chunk)
                need(len(data) <= cap, 'command_capacity')
        need(child.wait(timeout=max(.001, end - time.monotonic())) == 0, 'command_failed')
        completed = True
        return bytes(data)
    finally:
        try:
            # Leader exit is NOT proof that its pipe-holding descendants died.
            # Root can signal the fixed runuser/Git group at either UID.
            unexpected = completed and group_active(child.pid)
            if not completed or unexpected:
                for sig, grace in [(signal.SIGTERM, 1), (signal.SIGKILL, 2)]:
                    try: os.killpg(child.pid, sig)
                    except ProcessLookupError: pass
                    until = time.monotonic() + grace
                    while time.monotonic() < until:
                        child.poll()
                        if not group_active(child.pid): break
                        time.sleep(.01)
                    if not group_active(child.pid): break
                need(not group_active(child.pid), 'command_cleanup_unverified')
                child.wait(timeout=1)
                need(not unexpected, 'unexpected_command_descendant')
        finally:
            child.stdout.close()


def group_active(pgid):
    try: os.killpg(pgid, 0)
    except ProcessLookupError: return False
    # Only kernel state/pgrp, never cmdline/environ. Reaped/zombie children do
    # not mutate a checkout; a surviving D-state child remains an interlock.
    for entry in os.scandir('/proc'):
        if not entry.name.isdigit(): continue
        try:
            fields = pathlib.Path(entry.path, 'stat').read_text().rsplit(') ', 1)[1].split()
        except FileNotFoundError: continue
        if int(fields[2]) == pgid and fields[0] != 'Z': return True
    return False


def stamp(s):
    return (s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)


class Filesystem:
    """Tests map fixed paths into an owned 0700 sandbox; CLI has no override."""
    def __init__(self, sandbox=None):
        self.sandbox = pathlib.Path(sandbox) if sandbox else None
        self.uid, self.gid = (os.geteuid(), os.getegid()) if sandbox else (0, 0)
        if sandbox:
            s = os.lstat(sandbox)
            need(stat.S_ISDIR(s.st_mode) and s.st_uid == self.uid and stat.S_IMODE(s.st_mode) == 0o700)
        else:
            need(os.getuid() == os.geteuid() == 0, 'root_required')

    def path(self, p):
        need(p.startswith('/') and '..' not in pathlib.PurePosixPath(p).parts, 'fixed_path')
        return self.sandbox / p[1:] if self.sandbox else pathlib.Path(p)

    def directory(self, p):
        fd = os.open(self.sandbox or '/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            for part in pathlib.PurePosixPath(p).parts[1:]:
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
                os.close(fd); fd = child
                s = os.fstat(fd)
                need((s.st_uid, s.st_gid) == (self.uid, self.gid) and not s.st_mode & 0o022, 'root_directory')
            return fd
        except BaseException:
            os.close(fd)
            raise

    def read(self, p, cap=1 << 20):
        with contextlib.ExitStack() as stack:
            d = self.directory(os.path.dirname(p)); stack.callback(os.close, d)
            fd = os.open(os.path.basename(p), os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW, dir_fd=d)
            stack.callback(os.close, fd)
            s = os.fstat(fd)
            need(stat.S_ISREG(s.st_mode) and (s.st_uid, s.st_gid) == (self.uid, self.gid)
                 and s.st_nlink == 1 and not s.st_mode & 0o022 and 0 < s.st_size <= cap, 'root_file')
            data = bytearray()
            while chunk := os.read(fd, min(65536, cap + 1 - len(data))):
                data.extend(chunk); need(len(data) <= cap, 'file_capacity')
            need(stamp(os.fstat(fd)) == stamp(s) == stamp(os.stat(os.path.basename(p), dir_fd=d, follow_symlinks=False))
                 and len(data) == s.st_size, 'file_changed')
            return bytes(data)

    def write(self, p, raw, mode=0o600, replace=False):
        need(type(raw) is bytes and len(raw) <= MAX_TAR, 'write_capacity')
        d = self.directory(os.path.dirname(p)); name = os.path.basename(p)
        temp = '.' + name + '.' + os.urandom(16).hex() + '.pending'
        try:
            if replace:
                self.read(p, MAX_TAR)
            else:
                need(not os.path.lexists(self.path(p)), 'no_clobber')
            fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode, dir_fd=d)
            try:
                os.fchmod(fd, mode)
                at = 0
                while at < len(raw):
                    n = os.write(fd, raw[at:]); need(n > 0, 'short_write'); at += n
                os.fsync(fd)
            finally:
                os.close(fd)
            if not replace:
                # Hardlink is an atomic no-clobber publication, followed by
                # unlink of our temporary link; resulting file is single-link.
                os.link(temp, name, src_dir_fd=d, dst_dir_fd=d, follow_symlinks=False)
                os.unlink(temp, dir_fd=d)
            else:
                os.rename(temp, name, src_dir_fd=d, dst_dir_fd=d)
            os.fsync(d)
        finally:
            os.close(d)

    def mkdir(self, p, mode=0o700):
        d = self.directory(os.path.dirname(p))
        try:
            os.mkdir(os.path.basename(p), mode, dir_fd=d)
            os.fsync(d)
        finally:
            os.close(d)

    def remove_owned(self, p, raw):
        need(self.read(p) == raw, 'interlock_changed')
        d = self.directory(os.path.dirname(p))
        try:
            os.unlink(os.path.basename(p), dir_fd=d); os.fsync(d)
        finally:
            os.close(d)


class Host:
    def __init__(self, fs):
        self.fs = fs

    def git(self, args):
        return command(['/usr/sbin/runuser', '-u', 'aktau-sync', '--', '/usr/bin/git', '--no-replace-objects',
                        '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null',
                        '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-C', PUBLISHER] + args,
                       timeout=20, cap=2 << 20).decode()

    def publisher(self):
        need(self.git(['status', '--porcelain=v1', '--untracked-files=all']) == '', 'dirty_publisher')
        sha = self.git(['rev-parse', 'HEAD']).strip(); need(SHA.fullmatch(sha), 'publisher_sha')
        branch = self.git(['rev-parse', '--abbrev-ref', 'HEAD']).strip()
        need(branch == 'HEAD' or re.fullmatch(r'[A-Za-z0-9_/.-]{1,160}', branch), 'publisher_branch')
        return {'sha': sha, 'branch': branch}

    def runtime_wiring(self, policy):
        for path, expected in policy['runtimeFiles'].items():
            need(digest(self.fs.read(path)) == expected, 'runtime_guard_drift')
        for unit, role in [('aktau-sync.service', 'daily'), ('aktau-sync-full.service', 'weekly'),
                           ('aktau-c2-custodian.service', 'c2')]:
            raw = command(['/usr/bin/systemctl', 'show', unit, '--property=ExecStart', '--value'], cap=8192).decode()
            expected = '/usr/bin/python3 -I -B ' + ROOT + '/promotion-runtime-gate.py ' + role
            need(raw.count('argv[]=') == 1 and 'argv[]=' + expected + ' ;' in raw, 'runtime_guard_not_loaded')

    def check_release(self, manifest, initial=False):
        ref = 'git/ref/heads/deploy/dina-weight-sync-part32' if initial else 'git/ref/heads/main'
        need(github(ref)['object']['sha'] == manifest['sourceSha'], 'main_drift')

    def verify_old_closure(self, policy, initial=False):
        old = self.publisher()['sha']; a = parse(self.fs.read(AUTH)); p = parse(self.fs.read(AUTO))
        site = self.fs.read(SITE)
        need(type(p) is dict and set(p) == {'version', 'enabled', 'sourceSha', 'sitePolicySha256', 'files'}
             and type(p['version']) is int and p['version'] == 2 and p['enabled'] is True
             and p['sitePolicySha256'] == digest(site) and type(p['files']) is dict
             and set(p['files']) == set(FILES.values()), 'old_automatic_authority')
        need(type(a) is dict and set(a) == {'version', 'approved', 'sourceSha', 'binarySha256', 'clockSha256', 'buildId', 'platform'}
             and type(a['version']) is int and a['version'] == 1 and a['approved'] is True
             and a['platform'] == 'linux/amd64' and a['sourceSha'] == p['sourceSha']
             and a['binarySha256'] == p['files'][FILES['c2projection']]
             and a['clockSha256'] == p['files'][FILES['relayprobe']], 'old_provider_authority')
        allowed = [old]
        if initial and old == policy['initialBridge']['publisherSha']:
            allowed.append(policy['initialBridge']['ancestorSha'])
        need(p['sourceSha'] in allowed, 'unapproved_source_drift')
        for target, expected in p['files'].items():
            need(type(expected) is str and HEX.fullmatch(expected)
                 and digest(self.fs.read(target, 256 << 20)) == expected, 'old_closure_drift')
        need(parse(self.fs.read(FILES['source-manifest.json'])) == {
            'sourceSha': p['sourceSha'], 'recipe': RECIPE, 'nodeMajor': 24}, 'old_manifest_authority')
        self.fs.read('/usr/local/go/bin/go', 64 << 20)
        need(command(['/usr/local/go/bin/go', 'version']) == b'go version go1.27.3 linux/amd64\n', 'unsupported_go')
        info = command(['/usr/local/go/bin/go', 'version', '-m', FILES['c2projection']]).decode()
        need(info.splitlines()[0].endswith(': go1.27.3')
             and embedded_source(self.fs.read(FILES['c2projection'], 64 << 20)) == p['sourceSha'], 'old_linked_source_mismatch')
        return p['sourceSha'] == old

    def idle(self):
        for unit in ['aktau-sync.service', 'aktau-sync-full.service', 'aktau-c2-custodian.service']:
            state = command(['/usr/bin/systemctl', 'show', unit, '--property=ActiveState', '--value']).strip()
            need(state in [b'inactive', b'failed'], 'active_runtime')
        for p in ['/etc/aktau-c2/ready.json', '/etc/aktau-c2/deployment.json',
                  '/var/lib/aktau-sync/c2/ledger/operator.lock']:
            need(not os.path.lexists(p), 'active_attempt')
        j = parse(self.fs.read('/var/lib/aktau-c2-custodian/current.json'))
        need(j.get('phase') == 'completed', 'pending_c2_recovery')
        account = pwd.getpwnam('aktau-sync')
        probe = subprocess.run(['/usr/bin/pgrep', '-u', str(account.pw_uid)], stdin=subprocess.DEVNULL,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=2)
        need(probe.returncode == 1, 'operator_actor_active')

    def invariants(self):
        # Read metadata only on reader; never its bytes/hash. Ledger bytes are
        # preserved locally, hashed for equality, and never emitted or copied.
        account = pwd.getpwnam('aktau-sync'); out = {}
        for p, mode in [('/var/lib/aktau-sync/c2', 0o700), ('/var/lib/aktau-sync/c2/reader.dsn', 0o600),
                        ('/var/lib/aktau-sync/c2/ledger', 0o700)]:
            s = os.lstat(p)
            need((s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode)) == (account.pw_uid, account.pw_gid, mode)
                 and not stat.S_ISLNK(s.st_mode), 'reader_ledger_custody')
            out[p] = (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode)
        p = '/var/lib/aktau-sync/c2/ledger/attempts.json'
        fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            s = os.fstat(fd)
            need(stat.S_ISREG(s.st_mode) and s.st_nlink == 1 and s.st_size <= 4 << 20
                 and (s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode)) == (account.pw_uid, account.pw_gid, 0o600), 'ledger_custody')
            raw = os.read(fd, (4 << 20) + 1); need(len(raw) == s.st_size, 'ledger_capacity')
            # Reuse the installed, hash-approved C2 ledger validator rather
            # than introducing a second verdict/series algorithm here.
            import importlib.util
            approved = parse(self.fs.read(AUTO))['files'][FILES['custodian.py']]
            need(digest(self.fs.read(FILES['custodian.py'])) == approved, 'ledger_codec_authority')
            spec = importlib.util.spec_from_file_location('_approved_c2_ledger', FILES['custodian.py'])
            codec = importlib.util.module_from_spec(spec); spec.loader.exec_module(codec)
            entries = codec.node_ledger_json(raw)
            if entries: codec.ledger_verdict(entries, entries[-1].get('attemptId'))
            out[p] = (s.st_dev, s.st_ino, s.st_mode, digest(raw))
        finally:
            os.close(fd)
        return out

    def import_source(self, bundle, manifest, policy):
        # Source bundle was authenticated independently BEFORE Git reads it.
        # Only public source goes through this user-owned Git object store.
        self.git(['fetch', '--no-tags', bundle, manifest['sourceSha']])
        sha = manifest['sourceSha']
        need(self.git(['rev-parse', sha + '^{tree}']).strip() == manifest['sourceTree'], 'source_tree')
        for name, source in source_paths().items():
            raw = self.git(['show', sha + ':' + source]).encode()
            need(digest(raw) == manifest['files'][name], 'source_blob_mismatch')
        old = self.publisher()['sha']
        if old != sha:
            changed_paths = self.git(['diff', '--name-only', '--no-renames', old, sha]).splitlines()
            need(relevant(changed_paths), 'no_runtime_change')
            common = self.git(['merge-base', old, sha]).strip()
            bridge = policy['initialBridge']
            need(common == old or (old == bridge['publisherSha'] and common == bridge['ancestorSha']), 'unexpected_base')
            changed = self.git(['diff', '--name-only', '--no-renames', old, sha, '--', 'backend/prisma',
                                'contracts', 'deploy/compose.production.yml'])
            need(changed == '', 'protected_delta')
            # The current bridge differs only in reviewed Vite test tooling;
            # runtime dependencies/scripts are byte-identical. No general
            # dependency deployment is inferred from a source checkout switch.
            for path, known in PIPELINE_TOOLING_BRIDGE.items():
                old_blob = self.git(['rev-parse', old + ':' + path]).strip()
                new_blob = self.git(['rev-parse', sha + ':' + path]).strip()
                need(old_blob == new_blob or (old_blob, new_blob) == known, 'dependency_provisioning_required')
            # Do not lose Dina/SCRUM-19 when bridging its cherry-picked branch.
            if common != old:
                for path, blob in bridge['requiredBlobs'].items():
                    need(self.git(['rev-parse', old + ':' + path]).strip() == blob, 'unexpected_bridge_source')
                    need(SHA.fullmatch(self.git(['rev-parse', sha + ':' + path]).strip()), 'required_fix_lost')
                # A later reviewed Dina fix is legitimate: preserve the merged
                # PR69 history, not forever freeze the scraper to today's blob.
                self.git(['merge-base', '--is-ancestor', '3d85bf9b5a7c0dc784f4868d1bd04ebb958a6c2d', sha])

    def switch(self, publisher):
        sha, branch = publisher['sha'], publisher['branch']
        if branch == 'HEAD': self.git(['checkout', '--detach', sha])
        else:
            need(self.git(['rev-parse', 'refs/heads/' + branch]).strip() == sha, 'rollback_ref_changed')
            self.git(['checkout', branch])
        need(self.publisher() == publisher, 'switch_readback')

    def binaries(self, contents, manifest, directory):
        need(manifest['files']['node'] == digest(self.fs.read(NODE, 256 << 20)), 'unsupported_node')
        need(command(['/usr/local/go/bin/go', 'version']).decode() == 'go version go1.27.3 linux/amd64\n', 'unsupported_go')
        for name, package in [('c2projection', 'cmd/c2projection'), ('relayprobe', 'internal/revalidation/testdata/relayprobe'), ('ingest', 'cmd/ingest')]:
            path = str(self.fs.path(directory + '/' + name))
            info = command(['/usr/local/go/bin/go', 'version', '-m', path]).decode()
            need(info.splitlines()[0].endswith(': go1.27.3') and '\tpath\tadilbaga/backend-go/' + package + '\n' in info
                 and '\tbuild\tGOOS=linux\n' in info and '\tbuild\tGOARCH=amd64\n' in info
                 and '\tbuild\tCGO_ENABLED=0\n' in info, 'binary_provenance')
            if name == 'c2projection':
                need(embedded_source(contents[name]) == manifest['sourceSha'], 'linked_source_mismatch')


def source_paths():
    return {'entry.mjs': 'scripts/revalidation/c2-operator-entry.mjs', 'custodian.py': 'ops/c2/auto-custodian.py',
            **{n: 'scripts/revalidation/' + n for n in FILES if n.endswith('.mjs') and n != 'entry.mjs'}}


PIPELINE_TOOLING_BRIDGE = {
    'pipeline/package.json': ('6cd013f62351ed2a349c0fd1cf96d5f01cda16b2', '3049257eb2898eb4c279a296f3bd56f1a52e883b'),
    'pipeline/pnpm-lock.yaml': ('7521af962056f2e9de08b366de03371731f7c64d', 'cfee18d88a435e550c0ed3f074fb8ccd4704cdfe'),
}


class Transaction:
    def __init__(self, fs, host, fault=None):
        self.fs, self.host = fs, host
        self.fault = fault or (lambda _: None)

    def journal(self, value):
        raw = canonical(value)
        self.fs.write(INTERLOCK, raw, 0o644, replace=os.path.lexists(self.fs.path(INTERLOCK)))
        self.fault(value['phase'])

    def inventory(self):
        d = self.fs.directory(BASE + '/releases')
        try:
            names = os.listdir(d); need(len(names) <= 1000, 'release_inventory_capacity')
            for name in names:
                need(re.fullmatch(r'[a-z0-9_-]{1,80}', name), 'unknown_release_stage')
                path = BASE + '/releases/' + name
                child = self.fs.directory(path)
                try:
                    entries = set(os.listdir(child))
                    need(entries <= set(FILES) | {'source.bundle', 'promotion.json', 'backup', 'receipt.json', 'rollback.json'}, 'unknown_release_resource')
                    terminal = 'rollback.json' if 'rollback.json' in entries else 'receipt.json'
                    need(terminal in entries, 'orphan_release_stage')
                    record = parse(self.fs.read(path + '/' + terminal, 65536))
                    need(record.get('identity') == name and record.get('directory') == path
                         and record.get('phase') == ('rolled_back' if terminal == 'rollback.json' else 'committed')
                         and set(record.get('targets', {})) == set(FILES.values()) | set(RECORDS), 'unknown_release_receipt')
                    b = self.fs.directory(path + '/backup')
                    try: need(set(os.listdir(b)) == {str(i) for i in range(len(FILES) + len(RECORDS))}, 'unknown_backup_resource')
                    finally: os.close(b)
                finally: os.close(child)
        finally: os.close(d)

    def aligned(self, sha, manifest):
        a = parse(self.fs.read(AUTH)); p = parse(self.fs.read(AUTO))
        return (a.get('sourceSha') == p.get('sourceSha') == sha
                and a.get('binarySha256') == manifest['files']['c2projection']
                and a.get('clockSha256') == manifest['files']['relayprobe']
                and p.get('files') == {target: manifest['files'][name] for name, target in FILES.items()}
                and all(digest(self.fs.read(target, 256 << 20)) == manifest['files'][name] for name, target in FILES.items()))

    def promote(self, contents, manifest, policy, identity):
        need(type(identity) is str and re.fullmatch(r'[a-z0-9_-]{1,80}', identity), 'release_identity')
        need(not os.path.lexists(self.fs.path(INTERLOCK)), 'pending_promotion_recovery')
        self.inventory()
        self.host.idle(); old = self.host.publisher()
        self.host.runtime_wiring(policy)
        self.host.verify_old_closure(policy, initial=identity.startswith('initial-'))
        invariant = self.host.invariants()
        if old['sha'] == manifest['sourceSha'] and self.aligned(old['sha'], manifest):
            return 'NO_OP'
        directory = BASE + '/releases/' + identity
        need(not os.path.lexists(self.fs.path(directory)), 'replayed_release')
        site = self.fs.read(SITE); site_value = parse(site)
        need(site_value == {'version': 2, 'evidence': 'site-content-verification', 'origin': 'https://aktau.market',
             'representations': ['product_ru', 'product_kk', 'sitemap', 'catalog', 'dashboard', 'category']}, 'site_policy_changed')
        authority = {'version': 1, 'approved': True, 'sourceSha': manifest['sourceSha'],
                     'binarySha256': manifest['files']['c2projection'], 'clockSha256': manifest['files']['relayprobe'],
                     'buildId': identity, 'platform': 'linux/amd64'}
        automatic = {'version': 2, 'enabled': True, 'sourceSha': manifest['sourceSha'], 'sitePolicySha256': digest(site),
                     'files': {target: manifest['files'][name] for name, target in FILES.items()}}
        updates = {target: contents[name] for name, target in FILES.items()}
        updates.update({AUTH: canonical(authority), AUTO: canonical(automatic)})
        available = os.statvfs(self.fs.path(BASE))
        required = sum(len(v) for v in contents.values()) + sum(os.lstat(self.fs.path(p)).st_size for p in updates) + (64 << 20)
        need(available.f_bavail * available.f_frsize >= required, 'insufficient_disk_capacity')
        # Durable intent precedes mkdir. All old bytes are backed up before
        # candidate subprocesses; a normal validation rejection can prove and
        # restore the unchanged baseline without blocking ordinary publication.
        j = {'version': 1, 'identity': identity, 'phase': 'intent', 'directory': directory,
             'oldPublisher': old, 'newPublisher': {'sha': manifest['sourceSha'], 'branch': 'HEAD'},
             'invariants': json.loads(canonical(invariant)), 'targets': {}}
        self.journal(j)
        try:
            self.fs.mkdir(directory, 0o755)
            self.fault('stage_created')
            self.fs.mkdir(directory + '/backup')
            for i, (target, data) in enumerate(updates.items()):
                old_bytes = self.fs.read(target, 256 << 20)
                st = os.lstat(self.fs.path(target))
                backup = directory + '/backup/' + str(i)
                self.fs.write(backup, old_bytes, 0o600)
                j['targets'][target] = {'backup': backup, 'oldHash': digest(old_bytes), 'newHash': digest(data),
                                        'oldMode': stat.S_IMODE(st.st_mode), 'oldIdentity': list(stamp(st))}
            j['phase'] = 'backed_up'; self.journal(j)
            for name, data in contents.items():
                self.fs.write(directory + '/' + name, data, 0o444)
            j['phase'] = 'candidate_staged'; self.journal(j)
            self.host.import_source(str(self.fs.path(directory + '/source.bundle')), manifest, policy)
            self.host.binaries(contents, manifest, directory)
            j['phase'] = 'prepared'; self.journal(j)
            # Exclusive runtime+controller locks remain held throughout. A new
            # scheduled unit may now be "activating" while waiting at its
            # verified shared gate; it cannot execute source or mutate ledger.
            # Do not mistake that benign waiter for an active old publisher.
            self.host.runtime_wiring(policy)
            self.host.check_release(manifest, initial=identity.startswith('initial-'))
            need(self.host.publisher() == old, 'mid_promotion_head')
            need(self.host.invariants() == invariant and self.fs.read(SITE) == site, 'state_changed')
            for target, r in j['targets'].items():
                need(digest(self.fs.read(target, 256 << 20)) == r['oldHash'], 'live_file_changed')
            j['phase'] = 'switching'; self.journal(j)
            if old['sha'] != manifest['sourceSha']:
                self.host.switch(j['newPublisher'])
            else:
                j['newPublisher'] = old
            j['phase'] = 'publisher'; self.journal(j)
            for i, (target, data) in enumerate(updates.items()):
                r = j['targets'][target]
                need(list(stamp(os.lstat(self.fs.path(target)))) == r['oldIdentity'], 'live_identity_changed')
                if r['oldHash'] != r['newHash']:
                    mode = 0o555 if target in [FILES[n] for n in ['node', 'ingest', 'c2projection', 'relayprobe']] else 0o644 if target in RECORDS else 0o444
                    self.fs.write(target, data, mode, replace=True)
                j['phase'] = 'file_' + str(i); self.journal(j)
            need(self.host.publisher() == j['newPublisher'] and self.aligned(manifest['sourceSha'], manifest)
                 and self.host.invariants() == invariant and self.fs.read(SITE) == site, 'postflight_mismatch')
            j['phase'] = 'committed'; self.journal(j)
            self.fs.write(directory + '/receipt.json', canonical(j))
            last = BASE + '/state/last.json'
            self.fs.write(last, canonical({'identity': identity}), 0o600,
                          replace=os.path.lexists(self.fs.path(last)))
            self.fs.remove_owned(INTERLOCK, canonical(j))
            return 'C2_CONFIG_SOURCE_ALIGNED'
        except Exception as error:
            if len(j['targets']) != len(updates) or (type(error) is Blocked and str(error) == 'command_cleanup_unverified'):
                raise  # never race rollback with a still-live Git child
            self.rollback(j, invariant)
            raise

    def rollback(self, j, invariant=None):
        need(type(j) is dict and set(j) == {'version', 'identity', 'phase', 'directory', 'oldPublisher', 'newPublisher', 'invariants', 'targets'}
             and type(j['version']) is int and j['version'] == 1
             and re.fullmatch(r'[a-z0-9_-]{1,80}', j['identity'])
             and j['directory'] == BASE + '/releases/' + j['identity']
             and set(j.get('targets', {})) == set(FILES.values()) | set(RECORDS), 'unknown_transaction')
        # Caller holds both exclusive locks; no source program can run behind
        # the verified shared gate, including a scheduled waiter in activating.
        current = self.host.publisher()
        need(current in [j['oldPublisher'], j['newPublisher']], 'unknown_publisher')
        need(json.loads(canonical(self.host.invariants())) == j['invariants'], 'rollback_state_changed')
        old_data = {}
        for i, (target, r) in enumerate(j['targets'].items()):
            need(type(r) is dict and set(r) == {'backup', 'oldHash', 'newHash', 'oldMode', 'oldIdentity'}
                 and r['backup'] == j['directory'] + '/backup/' + str(i)
                 and all(type(r[k]) is str and HEX.fullmatch(r[k]) for k in ['oldHash', 'newHash'])
                 and type(r['oldIdentity']) is list and len(r['oldIdentity']) == 9
                 and all(type(v) is int and v >= 0 for v in r['oldIdentity'])
                 and type(r['oldMode']) is int and r['oldMode'] in [0o444, 0o555, 0o644, 0o755], 'unknown_backup')
            data = self.fs.read(r['backup'], 256 << 20)
            need(digest(data) == r['oldHash'] and digest(self.fs.read(target, 256 << 20)) in [r['oldHash'], r['newHash']], 'unknown_partial_state')
            old_data[target] = data
        if current != j['oldPublisher']:
            self.host.switch(j['oldPublisher'])
        for target, data in old_data.items():
            if self.fs.read(target, 256 << 20) != data:
                self.fs.write(target, data, j['targets'][target]['oldMode'], replace=True)
        need(self.host.publisher() == j['oldPublisher'], 'rollback_publisher')
        need(json.loads(canonical(self.host.invariants())) == j['invariants'], 'rollback_state_changed')
        j['phase'] = 'rolled_back'; self.journal(j)
        self.fs.write(j['directory'] + '/rollback.json', canonical(j))
        self.fs.remove_owned(INTERLOCK, canonical(j))
        return 'ROLLED_BACK_PUBLISHER_AND_AUTHORITY'

    def rollback_last(self, policy):
        """Root-only deliberate rollback; preserve all newer terminal ledger data.

        This is distinct from crash recovery, which must match the interrupted
        transaction's original invariants. No DB or ledger history is rewound.
        """
        need(not os.path.lexists(self.fs.path(INTERLOCK)), 'pending_promotion_recovery')
        self.inventory(); self.host.idle(); self.host.runtime_wiring(policy)
        self.host.verify_old_closure(policy)
        last = parse(self.fs.read(BASE + '/state/last.json'))
        need(type(last) is dict and set(last) == {'identity'}
             and type(last['identity']) is str and re.fullmatch(r'[a-z0-9_-]{1,80}', last['identity']), 'last_release')
        directory = BASE + '/releases/' + last['identity']
        need(not os.path.lexists(self.fs.path(directory + '/rollback.json')), 'already_rolled_back')
        j = parse(self.fs.read(directory + '/receipt.json', 65536))
        need(j.get('phase') == 'committed' and j.get('identity') == last['identity']
             and self.host.publisher() == j.get('newPublisher'), 'not_current_release')
        for target, r in j['targets'].items():
            need(digest(self.fs.read(target, 256 << 20)) == r['newHash'], 'unknown_partial_state')
        j['invariants'] = json.loads(canonical(self.host.invariants()))
        self.journal(j)
        return self.rollback(j)


def admission(fs, request, raw):
    policy = parse(fs.read(POLICY))
    validate_policy(policy)
    sha = request.get('sourceSha'); need(type(sha) is str and SHA.fullmatch(sha), 'requested_sha')
    artifact = github('actions/artifacts/' + str(request['artifactId']))
    build = github('actions/runs/' + str(request['buildRunId']))
    workflow = github('actions/workflows/' + str(build['workflow_id']))
    ci = github('actions/runs/' + str(request['ciRunId']))
    jobs = github('actions/runs/' + str(ci['id']) + '/jobs?per_page=100')['jobs']
    main = github('git/ref/heads/main')['object']['sha']
    verify_release(sha=sha, main=main, artifact=artifact, build=build, workflow=workflow, ci=ci, jobs=jobs, now=time.time())
    build_jobs = github('actions/runs/' + str(build['id']) + '/jobs?per_page=100')['jobs']
    producers = [j for j in build_jobs if j.get('name') == 'Build immutable sync + C2']
    need(len(producers) == 1 and producers[0].get('conclusion') == 'success'
         and any(s.get('name') == 'Upload immutable sync + C2 artifact' and s.get('conclusion') == 'success'
                 for s in producers[0].get('steps', [])), 'build_job_not_successful')
    need(request['artifactId'] == artifact['id'] and request['buildRunId'] == build['id'] and request['ciRunId'] == ci['id'], 'request_identity')
    # Uploader cannot authorize its own bytes: this digest came over independent
    # authenticated HTTPS from GitHub's immutable artifact metadata.
    need(len(raw) == artifact['size_in_bytes'] and 'sha256:' + digest(raw) == artifact['digest'], 'github_archive_digest')
    import base64
    for path, wanted in policy['producerFiles'].items():
        item = github('contents/' + path + '?ref=' + sha)
        need(item.get('encoding') == 'base64' and digest(base64.b64decode(item['content'], validate=False)) == wanted, 'producer_source_changed')
    contents = unpack_zip(raw, resource_guard=memory_guard); manifest = validate_package(contents, sha)
    need(manifest['kind'] == 'promote', 'build_only_not_authorized')
    need((manifest['ciRunId'], manifest['ciAttempt'], manifest['buildRunId'], manifest['buildAttempt'])
         == (ci['id'], ci['run_attempt'], build['id'], build['run_attempt']), 'manifest_producer')
    commit = github('git/commits/' + sha)
    need(commit['tree']['sha'] == manifest['sourceTree'], 'github_tree')
    if build['event'] == 'workflow_run':
        need(commit.get('parents'), 'unknown_push_base')
        diff = github('compare/' + commit['parents'][0]['sha'] + '...' + sha)
        need(len(diff.get('files', [])) < 300 and relevant([f['filename'] for f in diff.get('files', [])]), 'irrelevant_push')
    return contents, manifest, policy, 'build-' + str(build['id']) + '-' + str(build['run_attempt'])


def validate_policy(policy):
    names = {BUILD_WORKFLOW, 'scripts/ops/build-sync-promotion.py', 'ops/c2/publisher-promotion.py'}
    need(type(policy) is dict and set(policy) == {'version', 'enabled', 'repository', 'buildWorkflow', 'producerFiles', 'runtimeFiles', 'initialBridge'}
         and type(policy['version']) is int and policy['version'] == 1 and policy['enabled'] is True
         and policy['repository'] == REPOSITORY and policy['buildWorkflow'] == BUILD_WORKFLOW
         and type(policy['producerFiles']) is dict and set(policy['producerFiles']) == names
         and all(type(v) is str and HEX.fullmatch(v) for v in policy['producerFiles'].values())
         and type(policy['runtimeFiles']) is dict and set(policy['runtimeFiles']) == set(RUNTIME_FILES)
         and all(type(v) is str and HEX.fullmatch(v) for v in policy['runtimeFiles'].values())
         and policy['runtimeFiles'][ROOT + '/publisher-promotion.py'] == policy['producerFiles']['ops/c2/publisher-promotion.py'], 'promotion_policy')
    b = policy['initialBridge']
    need(type(b) is dict and set(b) == {'publisherSha', 'ancestorSha', 'requiredBlobs'}
         and b['publisherSha'] == 'fd2b9a3eec417f739299e3d1ccc1d3d6b09860fd'
         and b['ancestorSha'] == 'bb1842bfc3ad25e74840072482801a8656ec7679'
         and b['requiredBlobs'] == {
             'pipeline/src/scrapers/dina.ts': '1daba18219e4841fd8c901182ee7edee5cc7dd05',
             'pipeline/test/dina.test.ts': 'b5b1afd4d84826232f6fc3c0f3497947f6912cd0'}, 'initial_bridge_policy')


def initial_reviewed(fs, host):
    """Root admin CLI only; never exposed by the restricted SSH request parser."""
    approval = parse(fs.read(INITIAL)); policy = parse(fs.read(POLICY)); validate_policy(policy)
    need(type(approval) is dict and set(approval) == {'version', 'kind', 'sourceSha', 'archiveSha256', 'archiveSize',
         'authorizationId', 'approvedBy', 'approvedAt', 'expiresAt'}
         and type(approval['version']) is int and approval['version'] == 1
         and approval['kind'] == 'owner-delegated-initial'
         and approval['sourceSha'] == policy['initialBridge']['publisherSha']
         and approval['sourceSha'] == host.publisher()['sha']
         and type(approval['authorizationId']) is str and re.fullmatch(r'[a-f0-9]{32}', approval['authorizationId'])
         and type(approval['approvedBy']) is str and re.fullmatch(r'owner:[A-Za-z0-9_-]{1,64}', approval['approvedBy'])
         and type(approval['approvedAt']) is int and type(approval['expiresAt']) is int
         and approval['approvedAt'] <= time.time() < approval['expiresAt']
         and 0 < approval['expiresAt'] - approval['approvedAt'] <= 14400, 'initial_authority')
    candidate = fs.path(BASE + '/reviewed/promotion.tar').lstat()
    need(stat.S_ISREG(candidate.st_mode) and 0 < candidate.st_size <= MAX_TAR, 'initial_archive_capacity')
    memory_guard(4 * candidate.st_size + (64 << 20))
    raw = fs.read(BASE + '/reviewed/promotion.tar', MAX_TAR)
    need(type(approval['archiveSize']) is int and len(raw) == approval['archiveSize']
         and digest(raw) == approval['archiveSha256'], 'initial_archive_digest')
    contents = unpack_tar(raw); manifest = validate_package(contents, approval['sourceSha'])
    need(manifest['kind'] == 'initial' and all(type(manifest[k]) is int and manifest[k] == 0 for k in ['ciRunId', 'ciAttempt', 'buildRunId', 'buildAttempt']), 'initial_not_ci_build')
    # One initial administrator authorization; durable no-clobber receipt is
    # deliberately never removed or recycled after failure or rollback.
    fs.write(BASE + '/state/initial-' + approval['authorizationId'] + '.used', canonical({'version': 1, 'used': True}))
    return Transaction(fs, host).promote(contents, manifest, policy, 'initial-' + approval['authorizationId'])


@contextlib.contextmanager
def promotion_locks(fs):
    held = []
    try:
        for path, mode in [(LOCK, 0o644), ('/var/lib/aktau-c2-custodian/controller.lock', 0o600)]:
            d = fs.directory(os.path.dirname(path))
            try: fd = os.open(os.path.basename(path), os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=d)
            finally: os.close(d)
            held.append(fd)
            st = os.fstat(fd)
            need(stat.S_ISREG(st.st_mode) and (st.st_uid, st.st_gid) == (fs.uid, fs.gid)
                 and st.st_nlink == 1 and stat.S_IMODE(st.st_mode) == mode, 'promotion_lock')
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        for fd in reversed(held): os.close(fd)


def memory_guard(required):
    try:
        fields = dict(line.split(':', 1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
        available = int(fields['MemAvailable'].split()[0]) * 1024
    except (KeyError, ValueError, OSError):
        raise Blocked('memory_capacity_unverified') from None
    need(available >= required, 'insufficient_memory_capacity')


def _serve(fs):
    # No path/env/sandbox/command overrides accepted by the SSH entry.
    need(len(sys.argv) == 1 or sys.argv[1:] in [['--initial-reviewed'], ['--rollback-interrupted'], ['--rollback-last']], 'fixed_entry')
    host = Host(fs)
    def deadline(*_): raise Blocked('operator_deadline')
    signal.signal(signal.SIGALRM, deadline); signal.alarm(300)
    for sig in [signal.SIGTERM, signal.SIGINT, signal.SIGHUP]:
        signal.signal(sig, lambda *_: (_ for _ in ()).throw(Blocked('operator_cancelled')))
    if sys.argv[1:] == ['--initial-reviewed']:
        with promotion_locks(fs):
            reply({'status': initial_reviewed(fs, host)})
        return
    if sys.argv[1:] == ['--rollback-interrupted']:
        with promotion_locks(fs):
            j = parse(fs.read(INTERLOCK, 65536))
            reply({'status': Transaction(fs, host).rollback(j)})
        return
    if sys.argv[1:] == ['--rollback-last']:
        policy = parse(fs.read(POLICY)); validate_policy(policy)
        with promotion_locks(fs):
            reply({'status': Transaction(fs, host).rollback_last(policy)})
        return
    raw = sys.stdin.buffer.readline(16385)
    need(len(raw) <= 16384 and raw.endswith(b'\n'), 'request_capacity')
    r = parse(raw)
    need(type(r) is dict and r.get('version') == 1 and type(r.get('version')) is int, 'request_version')
    if r == {'version': 1, 'operation': 'status'}:
        need(not os.path.lexists(fs.path(INTERLOCK)), 'pending_promotion_recovery')
        policy = parse(fs.read(POLICY)); validate_policy(policy)
        Transaction(fs, host).inventory(); host.runtime_wiring(policy)
        p = host.publisher(); aligned = host.verify_old_closure(policy, initial=True)
        reply({'publisher': p, 'authorityAligned': aligned})
        return
    need(set(r) == {'version', 'operation', 'sourceSha', 'artifactId', 'buildRunId', 'ciRunId', 'size'}
         and r['operation'] == 'promote' and all(positive(r[k]) for k in ['artifactId', 'buildRunId', 'ciRunId', 'size'])
         and r['size'] <= MAX_ARCHIVE, 'request_schema')
    # Reject nonexistent/mismatched archives before allocating a large body.
    a = github('actions/artifacts/' + str(r['artifactId']))
    need(a.get('size_in_bytes') == r['size'] and a.get('expired') is False
         and a.get('workflow_run', {}).get('id') == r['buildRunId']
         and a.get('workflow_run', {}).get('head_sha') == r['sourceSha'], 'transfer_artifact_identity')
    memory_guard(4 * r['size'] + (64 << 20))
    data = sys.stdin.buffer.read(r['size'] + 1); need(len(data) == r['size'], 'transfer_size')
    contents, manifest, policy, release_id = admission(fs, r, data)
    # Transfer/verification happens before exclusive runtime lock. No slow build
    # or arbitrary provider process runs while the existing schedule is blocked.
    with promotion_locks(fs):
        need(github('git/ref/heads/main')['object']['sha'] == manifest['sourceSha'], 'main_drift')
        reply({'status': Transaction(fs, host).promote(contents, manifest, policy, release_id)})


def main():
    fs = Filesystem()
    d = fs.directory(BASE + '/state')
    try: fd = os.open('ingress.lock', os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=d)
    finally: os.close(d)
    try:
        st = os.fstat(fd)
        need(stat.S_ISREG(st.st_mode) and (st.st_uid, st.st_gid) == (0, 0)
             and st.st_nlink == 1 and stat.S_IMODE(st.st_mode) == 0o600, 'ingress_lock')
        # Includes status/initial admin operations. A compromised limited key
        # cannot allocate N simultaneous bounded archive buffers as root.
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        _serve(fs)
    finally: os.close(fd)


if __name__ == '__main__':
    try:
        main()
    except BaseException as e:
        code = str(e) if type(e) is Blocked and re.fullmatch(r'[a-z_]{1,80}', str(e)) else 'operation_failed'
        reply({'status': 'BLOCKED', 'errorClass': code})
        sys.exit(1)
