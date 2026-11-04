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
            if resource_guard: resource_guard(transfer_memory_budget(len(raw),entries[0].file_size))
            return unpack_tar(z.read(entries[0]))
    except (zipfile.BadZipFile, RuntimeError):
        raise Blocked('zip_invalid') from None


def unpack_tar(raw):
    need(0 < len(raw) <= MAX_TAR, 'tar_capacity')
    try:
        with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as tar:
            members = []
            for member in tar:
                members.append(member); need(len(members) <= 16, 'tar_inventory')
            names = [m.name for m in members]
            need(len(names) == len(set(names)) and 'promotion.json' in names, 'tar_inventory')
            out = {}
            allowed = set(FILES) | {'source.bundle','promotion.json','pipeline-runtime.tar','pipeline-runtime.json'}
            for m in members:
                cap = 16384 if m.name in ['promotion.json','pipeline-runtime.json'] else (PIPELINE_CAP if m.name == 'pipeline-runtime.tar' else MAX_TAR)
                need(m.isfile() and m.name in allowed and not m.pax_headers and m.mode in (0o444,0o555)
                     and 0 < m.size <= cap, 'tar_member')
                out[m.name] = tar.extractfile(m).read(m.size + 1)
                need(len(out[m.name]) == m.size, 'tar_size')
            manifest = parse(out['promotion.json']); version = manifest.get('version') if type(manifest) is dict else None
            need(type(version) is int and version in [1,2], 'package_version')
            need(set(out) == set(FILES) | {'source.bundle','promotion.json'} |
                 ({'pipeline-runtime.tar','pipeline-runtime.json'} if version == 2 else set()), 'tar_inventory')
            if version == 2:
                need(all(m.uid == m.gid == m.mtime == 0 and not m.uname and not m.gname for m in members), 'tar_metadata')
                end = 0
                for m in members:
                    need(m.offset == end and raw[end:end+512] == m.tobuf(format=tarfile.USTAR_FORMAT), 'tar_noncanonical')
                    data_end = end + 512 + m.size; end = ((data_end + 511)//512)*512
                    need(raw[data_end:end] == b'\0'*(end-data_end), 'tar_padding')
                expected_size = ((end + 1024 + 10239)//10240)*10240
                need(len(raw) == expected_size and raw[end:] == b'\0'*(len(raw)-end), 'tar_trailing')
            return out
    except tarfile.TarError:
        raise Blocked('tar_invalid') from None


def validate_package(contents, sha):
    need('promotion.json' in contents and len(contents['promotion.json']) <= 16384, 'package_inventory')
    m = parse(contents['promotion.json'])
    version = m.get('version') if type(m) is dict else None
    need(type(version) is int and version in [1,2], 'package_version')
    need(set(contents) == set(FILES) | {'source.bundle','promotion.json'} |
         ({'pipeline-runtime.tar','pipeline-runtime.json'} if version == 2 else set()), 'package_inventory')
    need(type(m) is dict and set(m) == {'version', 'kind', 'sourceSha', 'sourceTree', 'goVersion', 'nodeVersion',
         'recipe', 'ciRunId', 'ciAttempt', 'buildRunId', 'buildAttempt', 'files', 'sourceBundleSha256'} |
         ({'pipelineRuntime'} if version == 2 else set())
         and type(m['version']) is int and m['version'] == version and m['kind'] in ['initial', 'build-only', 'promote'] and m['sourceSha'] == sha
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
    if version == 2:
        need(m['kind'] != 'initial' and m['files']['node'] == PIPELINE_NODE, 'pipeline_node_identity')
        d = pipeline_descriptor(contents['pipeline-runtime.json'], contents['pipeline-runtime.tar'], sha)
        need(m['pipelineRuntime'] == {'descriptorSha256':digest(contents['pipeline-runtime.json']),
             'capsuleSha256':d['capsuleSha256'],'inventorySha256':d['inventorySha256']}, 'pipeline_manifest_hash')
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
    with os.scandir('/proc') as entries:
        for entry in entries:
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

    @contextlib.contextmanager
    def source_bundle_fd(self, bundle, expected):
        # Internal transaction path only; no CLI/env/request path or FD override.
        path = pathlib.Path(bundle)
        need(type(bundle) is str and path.is_absolute() and '..' not in path.parts
             and path.name == 'source.bundle' and str(path) == bundle
             and path.parent.parent == self.path(BASE + '/releases')
             and re.fullmatch(r'[a-z0-9_-]{1,80}', path.parent.name)
             and type(expected) is str and HEX.fullmatch(expected), 'bundle_fixed_path')
        directory = BASE + '/releases/' + path.parent.name
        with contextlib.ExitStack() as stack:
            d = self.directory(directory); stack.callback(os.close, d)
            ds = os.fstat(d)
            fd = os.open('source.bundle', os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=d)
            stack.callback(os.close, fd)
            original = os.fstat(fd)
            need(stat.S_ISREG(original.st_mode) and (original.st_uid, original.st_gid) == (self.uid, self.gid)
                 and stat.S_IMODE(original.st_mode) == 0o444 and original.st_nlink == 1
                 and 0 < original.st_size <= MAX_TAR
                 and fcntl.fcntl(fd, fcntl.F_GETFL) & os.O_ACCMODE == os.O_RDONLY, 'bundle_custody')

            def verify():
                need(stamp(os.fstat(fd)) == stamp(original)
                     == stamp(os.stat('source.bundle', dir_fd=d, follow_symlinks=False)), 'bundle_changed')
                current = self.directory(directory)
                try: need(stamp(os.fstat(current)) == stamp(ds) == stamp(os.fstat(d)), 'bundle_directory_changed')
                finally: os.close(current)
                os.lseek(fd, 0, os.SEEK_SET); h = hashlib.sha256(); size = 0
                while chunk := os.read(fd, 65536):
                    size += len(chunk); need(size <= MAX_TAR, 'bundle_capacity'); h.update(chunk)
                need(size == original.st_size and h.hexdigest() == expected, 'bundle_digest')
                need(stamp(os.fstat(fd)) == stamp(original)
                     == stamp(os.stat('source.bundle', dir_fd=d, follow_symlinks=False)), 'bundle_changed')
                current = self.directory(directory)
                try: need(stamp(os.fstat(current)) == stamp(ds) == stamp(os.fstat(d)), 'bundle_directory_changed')
                finally: os.close(current)
                os.lseek(fd, 0, os.SEEK_SET)

            verify()
            # On subprocess failure preserve the original cleanup/interlock error.
            # ExitStack still closes both root descriptors on every exception.
            yield fd
            verify()

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

    def git(self, args, *, pass_fds=()):
        need(type(pass_fds) is tuple and (not pass_fds or
             (len(pass_fds) == 1 and type(pass_fds[0]) is int and pass_fds[0] >= 3
              and len(args) == 4 and args[:2] == ['fetch', '--no-tags']
              and args[2] == '/proc/self/fd/' + str(pass_fds[0])
              and type(args[3]) is str and SHA.fullmatch(args[3]))), 'git_fd_invocation')
        return command(['/usr/sbin/runuser', '-u', 'aktau-sync', '--', '/usr/bin/git', '--no-replace-objects',
                        '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null',
                        '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-C', PUBLISHER] + args,
                       timeout=20, cap=2 << 20, pass_fds=pass_fds).decode()

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
        with self.fs.source_bundle_fd(bundle, manifest['sourceBundleSha256']) as fd:
            self.git(['fetch', '--no-tags', '/proc/self/fd/' + str(fd), manifest['sourceSha']], pass_fds=(fd,))
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
        need(manifest.get('version',1) == 1, 'artifact_v2_activation_disabled')
        need(not os.path.lexists(self.fs.path(PIPELINE_SELECTION)), 'dependency_history_unbound')
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
        need(not os.path.lexists(self.fs.path(PIPELINE_SELECTION)), 'dependency_history_unbound')
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
        need(not os.path.lexists(self.fs.path(PIPELINE_SELECTION)), 'dependency_history_unbound')
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
    if manifest['version']==2:
        need(policy['version']==2,'pipeline_policy_required')
        pipeline_runtime(fs,policy);require_enrollment(sys.modules[__name__],fs,policy)
        source_admission_v2(contents,manifest)
    elif policy['version']==2:
        raise Blocked('dependency_history_unbound')
    need((manifest['ciRunId'], manifest['ciAttempt'], manifest['buildRunId'], manifest['buildAttempt'])
         == (ci['id'], ci['run_attempt'], build['id'], build['run_attempt']), 'manifest_producer')
    commit = github('git/commits/' + sha)
    need(commit['tree']['sha'] == manifest['sourceTree'], 'github_tree')
    if build['event'] == 'workflow_run':
        need(commit.get('parents'), 'unknown_push_base')
        diff = github('compare/' + commit['parents'][0]['sha'] + '...' + sha)
        need(len(diff.get('files', [])) < 300 and relevant([f['filename'] for f in diff.get('files', [])]), 'irrelevant_push')
    if manifest['version']==2:
        manifest={**manifest,'_rootProvenance':{'version':1,'repository':REPOSITORY,'sourceSha':sha,
            'artifactId':artifact['id'],'zipSha256':digest(raw),'zipBytes':len(raw),'buildRunId':build['id'],
            'buildAttempt':build['run_attempt'],'ciRunId':ci['id'],'ciAttempt':ci['run_attempt']}}
    return contents, manifest, policy, 'build-' + str(build['id']) + '-' + str(build['run_attempt'])


def validate_policy(policy):
    names = {BUILD_WORKFLOW, 'scripts/ops/build-sync-promotion.py', 'ops/c2/publisher-promotion.py'}
    version=policy.get('version') if type(policy) is dict else None
    need(type(version) is int and version in [1,2], 'promotion_policy')
    runtime=set(RUNTIME_FILES) | ({ROOT+'/bin/pnpm','/etc/systemd/system/aktau-sync-dependencies.service'} if version==2 else set())
    need(type(policy) is dict and set(policy) == {'version', 'enabled', 'repository', 'buildWorkflow', 'producerFiles', 'runtimeFiles', 'initialBridge'} | ({'pipelineContract'} if version==2 else set())
         and type(policy['version']) is int and policy['version'] == version and policy['enabled'] is True
         and policy['repository'] == REPOSITORY and policy['buildWorkflow'] == BUILD_WORKFLOW
         and type(policy['producerFiles']) is dict and set(policy['producerFiles']) == names
         and all(type(v) is str and HEX.fullmatch(v) for v in policy['producerFiles'].values())
         and type(policy['runtimeFiles']) is dict and set(policy['runtimeFiles']) == runtime
         and all(type(v) is str and HEX.fullmatch(v) for v in policy['runtimeFiles'].values())
         and policy['runtimeFiles'][ROOT + '/publisher-promotion.py'] == policy['producerFiles']['ops/c2/publisher-promotion.py'], 'promotion_policy')
    b = policy['initialBridge']
    need(type(b) is dict and set(b) == {'publisherSha', 'ancestorSha', 'requiredBlobs'}
         and b['publisherSha'] == 'fd2b9a3eec417f739299e3d1ccc1d3d6b09860fd'
         and b['ancestorSha'] == 'bb1842bfc3ad25e74840072482801a8656ec7679'
         and b['requiredBlobs'] == {
             'pipeline/src/scrapers/dina.ts': '1daba18219e4841fd8c901182ee7edee5cc7dd05',
             'pipeline/test/dina.test.ts': 'b5b1afd4d84826232f6fc3c0f3497947f6912cd0'}, 'initial_bridge_policy')

    if version==2:
        c=policy['pipelineContract']
        fixed={'id':PIPELINE_CONTRACT,'oldSourceSha':PIPELINE_OLD_SOURCE,'oldTreeSha1':PIPELINE_OLD_TREE,
            'newTreeSha1':PIPELINE_NEW_TREE,'oldPackageBlobSha1':PIPELINE_OLD_PACKAGE,'newPackageBlobSha1':PIPELINE_NEW_PACKAGE,
            'oldLockBlobSha1':PIPELINE_OLD_LOCK,'newLockBlobSha1':PIPELINE_NEW_LOCK,'contractsOldLockBlobSha1':CONTRACTS_OLD_LOCK,
            'contractsNewLockBlobSha1':CONTRACTS_NEW_LOCK,'nodeSha256':PIPELINE_NODE,'pnpmTarSha256':PIPELINE_PNPM}
        need(type(c) is dict and set(c)==set(fixed)|{'baselineInputInventorySha256','baselineRuntimeInventorySha256'}
            and all(c[k]==v for k,v in fixed.items()) and all(type(c[k]) is str and HEX.fullmatch(c[k])
            for k in ['baselineInputInventorySha256','baselineRuntimeInventorySha256']), 'pipeline_policy_contract')


def pipeline_runtime(fs,policy):
    """Only compiled code inside this independently pinned root executable."""
    import types
    validate_policy(policy);need(policy['version']==2,'pipeline_policy_required')
    for path,h in policy['runtimeFiles'].items():need(digest(fs.read(path,1<<20))==h,'runtime_guard_drift')
    return types.SimpleNamespace(require_enrollment=require_enrollment,LinuxMounts=LinuxMounts,
        TrackedHost=TrackedHost,mount_committed=mount_committed,verify_parity=verify_parity)


def initial_reviewed(fs, host):
    """Root admin CLI only; never exposed by the restricted SSH request parser."""
    approval = parse(fs.read(INITIAL)); policy = parse(fs.read(POLICY)); validate_policy(policy)
    need(policy['version']==1,'initial_bridge_v1_only')
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
    memory_guard(transfer_memory_budget(candidate.st_size))
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


@contextlib.contextmanager
def pipeline_shared_lock(fs):
    """Read-only verifier exclusion; actors/C2 may retain their shared locks."""
    parent=fs.directory(BASE)
    try:fd=os.open('runtime.lock',os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=parent)
    finally:os.close(parent)
    try:
        st=os.fstat(fd)
        need(stat.S_ISREG(st.st_mode) and (st.st_uid,st.st_gid,st.st_nlink)==(fs.uid,fs.gid,1)
            and stat.S_IMODE(st.st_mode)==0o644,'promotion_lock')
        fcntl.flock(fd,fcntl.LOCK_SH|fcntl.LOCK_NB);yield
    finally:os.close(fd)


MEMORY_RESERVE = 64 << 20
DISK_RESERVE = 64 << 20


def _resource_integer(raw):
    need(type(raw) is str and re.fullmatch(r'[0-9]{1,20}\n?',raw) is not None,
         'memory_capacity_unverified')
    value=int(raw);need(0 <= value < 1 << 63,'memory_capacity_unverified');return value


def memory_guard(required):
    """Host headroom AND every visible ancestor of the process's cgroup v2.

    Unsupported/ambiguous controllers fail closed. Swap is never counted.
    Reserve is additional to the caller's conservative live-buffer bound.
    """
    need(type(required) is int and 0 < required <= 8 << 30,'memory_budget_invalid')
    try:
        fields=dict(line.split(':',1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
        field=fields['MemAvailable'].strip();need(re.fullmatch(r'[0-9]+ kB',field) is not None,'memory_capacity_unverified')
        available=_resource_integer(field[:-3])*1024
        membership=pathlib.Path('/proc/self/cgroup').read_text().splitlines()
        need(len(membership)==1 and membership[0].startswith('0::/'),'memory_capacity_unverified')
        suffix=membership[0][3:];parts=pathlib.PurePosixPath(suffix).parts
        need(parts and parts[0]=='/' and all(x not in ['.','..'] for x in parts[1:])
             and len(parts)<=65,'memory_capacity_unverified')
        mounts=[line.split() for line in pathlib.Path('/proc/self/mountinfo').read_text().splitlines()
                if ' - cgroup2 ' in line]
        need(len(mounts)==1 and mounts[0][3:5]==['/','/sys/fs/cgroup'],'memory_capacity_unverified')
        root=pathlib.Path('/sys/fs/cgroup');current=root.joinpath(*parts[1:])
        while True:
            try:
                limit=(current/'memory.max').read_text();used=_resource_integer((current/'memory.current').read_text())
            except FileNotFoundError:
                # The actual cgroup-v2 hierarchy root has no memory controller
                # limit/current interface. A cgroup namespace's non-root kernel
                # cgroup DOES expose them: never treat missing child files as max.
                need(current==root,'memory_capacity_unverified')
                for name in ['memory.max','memory.current']:
                    try:(root/name).read_text()
                    except FileNotFoundError:pass
                    else:raise Blocked('memory_capacity_unverified')
                need('memory' in (root/'cgroup.controllers').read_text().split()
                     and (root/'memory.stat').read_text().startswith('anon '),'memory_capacity_unverified')
                break
            if limit.strip()!='max':
                maximum=_resource_integer(limit);available=min(available,max(0,maximum-used))
            else:need(limit in ['max','max\n'],'memory_capacity_unverified')
            if current==root:break
            current=current.parent
    except (KeyError,ValueError,OSError,UnicodeError):
        raise Blocked('memory_capacity_unverified') from None
    need(available >= required+MEMORY_RESERVE,'insufficient_memory_capacity')


def transfer_memory_budget(zip_bytes,tar_bytes=MAX_TAR):
    need(type(zip_bytes) is int and 0 < zip_bytes <= MAX_ARCHIVE
         and type(tar_bytes) is int and 0 < tar_bytes <= MAX_TAR,'memory_budget_invalid')
    # Input/read-copy + ZIP decompression/TAR member buffers + capsule parsing,
    # materialization/verification copies + bounded inventory/Python overhead.
    return 2*zip_bytes+4*tar_bytes+4*PIPELINE_CAP+(128<<20)


def pipeline_disk_guard(fs,contents,updates,old_sizes,oldraw,newraw):
    try:return _pipeline_disk_guard(fs,contents,updates,old_sizes,oldraw,newraw)
    except (OSError,ValueError,KeyError,AttributeError,OverflowError):
        raise Blocked('disk_capacity_unverified') from None


def _pipeline_disk_guard(fs,contents,updates,old_sizes,oldraw,newraw):
    """Incremental peak reservation per real st_dev, before any release write.

    Existing old trees/backups already consume bavail: never count them as free.
    Include new retained bytes, generation, staged+rollback copies, Git/source,
    inode/block rounding, durable metadata, pending replacements and reserve.
    Same-device mounts use their minimum observed availability (quotas included).
    No disk cleanup, no public paths/budgets and no selection mutation.
    """
    need(type(contents) is dict and type(updates) is dict and type(old_sizes) is dict
         and set(updates)==set(FILES.values())|set(RECORDS) and set(old_sizes)==set(updates)
         and all(type(v) is bytes for v in contents.values())
         and all(type(v) is bytes for v in updates.values())
         and all(type(v) is int and 0<v<=MAX_TAR for v in old_sizes.values())
         and type(oldraw) is bytes and type(newraw) is bytes,'disk_budget_invalid')
    inv,_=pipeline_capsule(contents['pipeline-runtime.tar']);rows=inv['entries']
    plan={}
    def add(path, sizes, directories=0):
        need(type(directories) is int and directories>=0 and all(type(n) is int and 0<=n<=4*MAX_TAR for n in sizes),'disk_budget_invalid')
        slot=plan.setdefault(path,{'sizes':[],'directories':0});slot['sizes']+=sizes;slot['directories']+=directories
    payload=[len(contents[n]) for n in FILES]
    retained=payload+[len(contents[n]) for n in ['source.bundle','promotion.json','pipeline-runtime.tar','pipeline-runtime.json']]
    generation=[r['size'] if r['type']=='file' else len(r['target'].encode()) for r in rows if r['type']!='dir']
    # Indexed inventory, intent, seal; bounded journal/interlock/receipt high water
    # including both sides of atomic pending-file publication and rollback logs.
    add(BASE,[65536]*4,2)
    add(BASE+'/releases',retained+list(old_sizes.values())+[65536]*8+[16384]*4,4)
    add(BASE+'/capsules',generation+[2<<20]*3,sum(r['type']=='dir' for r in rows)+4)
    add(BASE+'/state',[2<<20]+[65536]*4+[16384]*4,4)
    add(BASE+'/mounts',[4096]*4,4)
    for t,data in updates.items():
        # New stage and possible rollback restore coexist conservatively. Current
        # file remains allocated until replace; it is already charged in bavail.
        add(os.path.dirname(t),[len(data),old_sizes[t]],2)
    add(os.path.dirname(PIPELINE_SELECTION),[len(oldraw),len(newraw),16384]*2,2)
    add(os.path.dirname(PIPELINE_MOUNT_RECORD),[16384]*4,2)
    # Source trees are independently bounded at source admission (both refs).
    # Git input pack + index/temporary pack, both new checkout and rollback tree.
    add(PUBLISHER,[MAX_TAR,MAX_TAR],8192*4)
    add(PUBLISHER+'/.git',[len(contents['source.bundle'])]*3+[64<<20],8192)
    # Unexpected subordinate mounts can redirect writes to an unbudgeted device.
    # All fixed writable mount roots must be represented; selected pipeline is
    # the sole intentional readonly descendant and is never written here.
    roots={str(fs.path(path)) for path in plan}
    permitted=roots|{str(fs.path(PUBLISHER+'/pipeline'))}
    for line in pathlib.Path('/proc/self/mountinfo').read_text().splitlines():
        fields=line.split();need(len(fields)>=10,'disk_capacity_unverified')
        mount=re.sub(r'\\([0-7]{3})',lambda x:chr(int(x.group(1),8)),fields[4])
        if any(mount.startswith(root+'/') for root in roots):
            need(mount in permitted,'disk_capacity_unverified')
    totals={}
    with contextlib.ExitStack() as stack:
        for path,item in plan.items():
            if path in [PUBLISHER,PUBLISHER+'/.git']:
                fd=fs.directory(os.path.dirname(PUBLISHER));stack.callback(os.close,fd)
                for part in ['aktau-sync']+(['.git'] if path.endswith('/.git') else []):
                    child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=fd)
                    stack.callback(os.close,child);fd=child;st=os.fstat(fd)
                    account=None if fs.sandbox else pwd.getpwnam('aktau-sync')
                    expected=(fs.uid,fs.gid) if account is None else (account.pw_uid,account.pw_gid)
                    need((st.st_uid,st.st_gid)==expected,'disk_capacity_unverified')
            else:fd=fs.directory(path);stack.callback(os.close,fd)
            st=os.fstat(fd);space=os.fstatvfs(fd)
            need(type(st.st_dev) is int and st.st_dev>=0 and stat.S_ISDIR(st.st_mode)
                 and type(space.f_frsize) is int and 512<=space.f_frsize<=1<<20
                 and space.f_frsize&(space.f_frsize-1)==0
                 and all(type(n) is int and n>=0 for n in [space.f_bavail,space.f_blocks,space.f_files,space.f_favail])
                 and space.f_bavail<=space.f_blocks and space.f_favail<=space.f_files,'disk_capacity_unverified')
            for target in [t for t in updates if os.path.dirname(t)==path]+([PIPELINE_SELECTION] if path==os.path.dirname(PIPELINE_SELECTION) else []):
                need(os.stat(fs.path(target),follow_symlinks=False).st_dev==st.st_dev,'disk_capacity_unverified')
            block=space.f_frsize
            amount=sum(((n+block-1)//block)*block for n in item['sizes'])+item['directories']*block
            total=totals.setdefault(st.st_dev,{'bytes':0,'inodes':0,'available':space.f_bavail*block,'freeInodes':space.f_favail})
            total['bytes']+=amount;total['inodes']+=len(item['sizes'])+item['directories']
            total['available']=min(total['available'],space.f_bavail*block);total['freeInodes']=min(total['freeInodes'],space.f_favail)
            need((os.stat(fs.path(path),follow_symlinks=False).st_dev,os.stat(fs.path(path),follow_symlinks=False).st_ino)
                 ==(st.st_dev,st.st_ino),'disk_capacity_unverified')
        for total in totals.values():
            need(total['available']>=total['bytes']+DISK_RESERVE and total['freeInodes']>=total['inodes']+256,'insufficient_disk_capacity')
    return totals


def _serve(fs):
    # No path/env/sandbox/command overrides accepted by the SSH entry.
    need(len(sys.argv) == 1 or sys.argv[1:] in [['--initial-reviewed'], ['--rollback-interrupted'], ['--rollback-last'], ['--mount-committed-pipeline'], ['--verify-source-runtime']], 'fixed_entry')
    host = Host(fs)
    def deadline(*_): raise Blocked('operator_deadline')
    signal.signal(signal.SIGALRM, deadline); signal.alarm(300)
    for sig in [signal.SIGTERM, signal.SIGINT, signal.SIGHUP]:
        signal.signal(sig, lambda *_: (_ for _ in ()).throw(Blocked('operator_cancelled')))
    if sys.argv[1:] in [['--mount-committed-pipeline'],['--verify-source-runtime']]:
        policy=parse(fs.read(POLICY));runtime=pipeline_runtime(fs,policy)
        with (pipeline_shared_lock(fs) if sys.argv[1]=='--verify-source-runtime' else promotion_locks(fs)):
            runtime.require_enrollment(sys.modules[__name__],fs,policy)
            anchor=systemd_host_namespace() if sys.argv[1]=='--mount-committed-pipeline' else None
            try:backend=runtime.LinuxMounts(sys.modules[__name__],fs,namespace_fd=anchor)
            finally:
                if anchor is not None:os.close(anchor)
            operator=runtime.TrackedHost(sys.modules[__name__],fs)
            if sys.argv[1]=='--mount-committed-pipeline':
                reply(runtime.mount_committed(sys.modules[__name__],fs,operator,backend))
            else:
                reply(runtime.verify_parity(sys.modules[__name__],fs,operator,backend))
        return
    if sys.argv[1:] == ['--initial-reviewed']:
        with promotion_locks(fs):
            reply({'status': initial_reviewed(fs, host)})
        return
    if sys.argv[1:] == ['--rollback-interrupted']:
        with promotion_locks(fs):
            j = parse(fs.read(INTERLOCK, 65536))
            if type(j.get('version')) is int and j['version']==2:
                policy=parse(fs.read(POLICY));runtime=pipeline_runtime(fs,policy)
                runtime.require_enrollment(sys.modules[__name__],fs,policy)
                reply({'status':TransactionV2(sys.modules[__name__],fs,runtime.TrackedHost(sys.modules[__name__],fs),
                    runtime.LinuxMounts(sys.modules[__name__],fs)).recover(j)})
            else:
                need(type(j.get('version')) is int and j['version']==1,'journal_version')
                reply({'status': Transaction(fs, host).rollback(j)})
        return
    if sys.argv[1:] == ['--rollback-last']:
        policy = parse(fs.read(POLICY)); validate_policy(policy)
        with promotion_locks(fs):
            if policy['version']==2:
                runtime=pipeline_runtime(fs,policy);runtime.require_enrollment(sys.modules[__name__],fs,policy)
                need(not os.path.lexists(fs.path(INTERLOCK)),'pending_promotion_recovery')
                last=parse(fs.read(BASE+'/state/last.json',16384))
                need(type(last) is dict and type(last.get('version')) is int and last['version']==2
                    and set(last)=={'version','identity'} and type(last['identity']) is str
                    and re.fullmatch(r'[a-z0-9_-]{1,80}',last['identity']),'dependency_history_unbound')
                directory=BASE+'/releases/'+last['identity']
                need(not os.path.lexists(fs.path(directory+'/rollback.json')),'not_current_release')
                j=parse(fs.read(directory+'/receipt.json',65536))
                need(j.get('phase')=='committed','not_current_release')
                reply({'status':TransactionV2(sys.modules[__name__],fs,runtime.TrackedHost(sys.modules[__name__],fs),
                    runtime.LinuxMounts(sys.modules[__name__],fs)).recover(j,deliberate=True)})
            else:
                reply({'status': Transaction(fs, host).rollback_last(policy)})
        return
    raw = sys.stdin.buffer.readline(16385)
    need(len(raw) <= 16384 and raw.endswith(b'\n'), 'request_capacity')
    r = parse(raw)
    need(type(r) is dict and r.get('version') == 1 and type(r.get('version')) is int, 'request_version')
    if r == {'version': 1, 'operation': 'status'}:
        need(not os.path.lexists(fs.path(INTERLOCK)), 'pending_promotion_recovery')
        policy = parse(fs.read(POLICY)); validate_policy(policy)
        if policy['version']==2:
            runtime=pipeline_runtime(fs,policy);runtime.require_enrollment(sys.modules[__name__],fs,policy)
            release_inventory_v2(sys.modules[__name__],fs)
            host.runtime_wiring(policy)
            operator=runtime.TrackedHost(sys.modules[__name__],fs);publisher=operator.publisher()
            aligned=operator.verify_old_closure(policy)
            selected=selection(sys.modules[__name__],fs.read(PIPELINE_SELECTION,16384))
            need(selected['sourceSha']==publisher['sha'],'pipeline_source_alignment')
            reply({'publisher':publisher,'authorityAligned':aligned,'pipelineContract':PIPELINE_CONTRACT})
        else:
            Transaction(fs, host).inventory(); host.runtime_wiring(policy)
            publisher = host.publisher(); aligned = host.verify_old_closure(policy, initial=True)
            reply({'publisher': publisher, 'authorityAligned': aligned})
        return
    need(set(r) == {'version', 'operation', 'sourceSha', 'artifactId', 'buildRunId', 'ciRunId', 'size'}
         and r['operation'] == 'promote' and all(positive(r[k]) for k in ['artifactId', 'buildRunId', 'ciRunId', 'size'])
         and r['size'] <= MAX_ARCHIVE, 'request_schema')
    # Reject nonexistent/mismatched archives before allocating a large body.
    a = github('actions/artifacts/' + str(r['artifactId']))
    need(a.get('size_in_bytes') == r['size'] and a.get('expired') is False
         and a.get('workflow_run', {}).get('id') == r['buildRunId']
         and a.get('workflow_run', {}).get('head_sha') == r['sourceSha'], 'transfer_artifact_identity')
    memory_guard(transfer_memory_budget(r['size']))
    data = sys.stdin.buffer.read(r['size'] + 1); need(len(data) == r['size'], 'transfer_size')
    contents, manifest, policy, release_id = admission(fs, r, data)
    # Transfer/verification happens before exclusive runtime lock. No slow build
    # or arbitrary provider process runs while the existing schedule is blocked.
    with promotion_locks(fs):
        need(github('git/ref/heads/main')['object']['sha'] == manifest['sourceSha'], 'main_drift')
        if manifest['version']==2:
            runtime=pipeline_runtime(fs,policy);runtime.require_enrollment(sys.modules[__name__],fs,policy)
            reply({'status':TransactionV2(sys.modules[__name__],fs,runtime.TrackedHost(sys.modules[__name__],fs),
                runtime.LinuxMounts(sys.modules[__name__],fs)).promote(contents,manifest,release_id)})
        else:
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


# Approved PR86-only offline capsule contract. No filesystem writes or authority
# can be minted by these parsers; production integration must enroll separately.
PIPELINE_OLD_SOURCE = 'b2012c5b8c05de8a7667bf942daf9d7232f3a7b6'
PIPELINE_OLD_TREE = '2ed1c1c6d6fef504b08829f4193a0b60681bd3a7'
PIPELINE_NEW_TREE = '4f1294e3ec73fd477d85825588b8f382125fc1c6'
PIPELINE_OLD_PACKAGE = '3049257eb2898eb4c279a296f3bd56f1a52e883b'
PIPELINE_NEW_PACKAGE = 'b4d13a331beb967c63c32c480fcccfc31dc545e1'
PIPELINE_OLD_LOCK = 'cfee18d88a435e550c0ed3f074fb8ccd4704cdfe'
PIPELINE_NEW_LOCK = 'bd94f3bb67624e36cc89b94585bae22065ec14c1'
CONTRACTS_OLD_LOCK = '4a631ef27450ce85b818e4fe02705b9bcd224c13'
CONTRACTS_NEW_LOCK = '504f5a4544438da6ea2e994b73932eae4eec5497'
PIPELINE_NODE = '41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c'
PIPELINE_PNPM = '9b943b94bc8f55efb993aad8e44b538e6b091e60a9e4a944dcde869855f233e3'
PIPELINE_CONTRACT = 'pr86-pipeline-v2'
PIPELINE_SELECTION = '/etc/aktau-sync-promotion/pipeline.json'
PIPELINE_MOUNT_RECORD = '/run/aktau-sync-promotion/pipeline-mount.json'
PIPELINE_CAP = 96 << 20
PIPELINE_CUSTODIAN = '14111fdd9ffb93cf25edb3a7f724198f14b4cd83d13f0a89ba6069aa46b4c3a0'


def pipeline_contracts_delta(paths, old, new):
    need(paths == ['contracts/pnpm-lock.yaml'] and old == CONTRACTS_OLD_LOCK
         and new == CONTRACTS_NEW_LOCK, 'protected_delta')
    return True


def pipeline_path(value):
    try:
        need(type(value) is str and 0 < len(value.encode('utf-8')) <= 512
             and not any(ord(c) < 32 or ord(c) == 127 for c in value)
             and '\\' not in value and not value.startswith('/')
             and all(p not in ['', '.', '..'] for p in value.split('/'))
             and len(value.split('/')) <= 32, 'pipeline_path')
    except UnicodeError:
        raise Blocked('pipeline_path') from None
    return value


def pipeline_inventory(raw):
    need(type(raw) is bytes and len(raw) <= 2 << 20, 'pipeline_inventory_capacity')
    inv = parse(raw)
    need(type(inv) is dict and list(inv) == ['version', 'entries']
         and type(inv['version']) is int and inv['version'] == 1
         and type(inv['entries']) is list and 0 < len(inv['entries']) <= 8192, 'pipeline_inventory_schema')
    rows = inv['entries']; nodes = {}; logical = 0; previous = b''
    for row in rows:
        need(type(row) is dict and type(row.get('path')) is str, 'pipeline_entry')
        path = pipeline_path(row['path']); key = path.encode()
        need(key > previous, 'pipeline_order'); previous = key
        name = path.rsplit('/', 1)[-1]
        need(name not in ['.env', '.npmrc', '.pnpmfile.cjs', 'reader.dsn']
             and not name.endswith('.env'), 'pipeline_private_file')
        if row.get('type') == 'dir':
            need(list(row) == ['path', 'type', 'mode'] and type(row['mode']) is int
                 and row['mode'] == 0o555, 'pipeline_dir')
        elif row.get('type') == 'file':
            need(list(row) == ['path', 'type', 'mode', 'size', 'sha256']
                 and type(row['mode']) is int and row['mode'] in [0o444, 0o555]
                 and type(row['size']) is int and 0 <= row['size'] <= 16 << 20
                 and type(row['sha256']) is str and HEX.fullmatch(row['sha256']), 'pipeline_file')
            logical += row['size']; need(logical <= 90 << 20, 'pipeline_logical_capacity')
        elif row.get('type') == 'symlink':
            target = row.get('target')
            need(list(row) == ['path', 'type', 'target'] and type(target) is str
                 and 0 < len(target.encode('utf-8')) <= 512 and not target.startswith('/')
                 and '\\' not in target and not any(ord(c) < 32 or ord(c) == 127 for c in target), 'pipeline_link')
        else:
            raise Blocked('pipeline_entry_type')
        parent = path.rpartition('/')[0]
        need(not parent or parent in nodes and nodes[parent]['type'] == 'dir', 'pipeline_parent')
        nodes[path] = row
    for row in rows:
        if row['type'] != 'symlink': continue
        pending = row['path'].split('/'); stack = []; hops = 0
        while pending:
            item = pending.pop(0)
            if item == '.': continue
            if item == '..':
                need(bool(stack), 'pipeline_link_escape'); stack.pop(); continue
            need(bool(item), 'pipeline_link')
            candidate = '/'.join(stack + [item]); node = nodes.get(candidate)
            need(node is not None, 'pipeline_link_dangling')
            if node['type'] == 'symlink':
                hops += 1; need(hops <= 32, 'pipeline_link_cycle')
                pending = node['target'].split('/') + pending
            else:
                need(not pending or node['type'] == 'dir', 'pipeline_link_parent'); stack.append(item)
        need(bool(stack), 'pipeline_link_root')
    return rows


def pipeline_capsule(raw):
    need(type(raw) is bytes and 0 < len(raw) <= PIPELINE_CAP, 'pipeline_capsule_capacity')
    try:
        with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as tar:
            first = tar.next()
            need(first is not None and first.name == 'inventory.json' and first.isfile()
                 and first.size <= 2 << 20 and not first.pax_headers, 'pipeline_capsule_inventory')
            inventory_raw = tar.extractfile(first).read((2 << 20) + 1)
            rows = pipeline_inventory(inventory_raw)
            expected = [('inventory.json', inventory_raw)]
            blobs = {}
            for i, row in enumerate(rows):
                if row['type'] != 'file': continue
                member = tar.next()
                need(member is not None and member.name == 'blob/' + str(i) and member.isfile()
                     and member.size == row['size'] and not member.pax_headers, 'pipeline_capsule_member')
                data = tar.extractfile(member).read(row['size'] + 1)
                need(len(data) == row['size'] and digest(data) == row['sha256'], 'pipeline_blob_digest')
                blobs[row['path']] = data; expected.append((member.name, data))
            need(tar.next() is None, 'pipeline_capsule_extra')
        canonical_tar = io.BytesIO()
        with tarfile.open(fileobj=canonical_tar, mode='w', format=tarfile.USTAR_FORMAT) as tar:
            for name, data in expected:
                item = tarfile.TarInfo(name); item.mode = 0o444; item.size = len(data)
                tar.addfile(item, io.BytesIO(data))
        need(canonical_tar.getvalue() == raw, 'pipeline_capsule_noncanonical')
        return parse(inventory_raw), blobs
    except (tarfile.TarError, KeyError, ValueError, UnicodeError, OSError):
        raise Blocked('pipeline_capsule_invalid') from None




def pipeline_read(fs, path, cap=16 << 20):
    """Empty public graph files are legal; all root control files retain read()."""
    d = fs.directory(os.path.dirname(path))
    try:
        fd = os.open(os.path.basename(path), os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=d)
        try:
            st = os.fstat(fd)
            need(stat.S_ISREG(st.st_mode) and (st.st_uid, st.st_gid, st.st_nlink) == (fs.uid, fs.gid, 1)
                 and stat.S_IMODE(st.st_mode) in [0o444, 0o555] and not os.listxattr(fd)
                 and 0 <= st.st_size <= cap, 'pipeline_custody')
            raw = bytearray()
            while data := os.read(fd, min(65536, cap + 1 - len(raw))):
                raw.extend(data); need(len(raw) <= cap, 'pipeline_capacity')
            need(stamp(st) == stamp(os.fstat(fd)) == stamp(os.stat(os.path.basename(path), dir_fd=d, follow_symlinks=False))
                 and len(raw) == st.st_size, 'pipeline_changed')
            return bytes(raw)
        finally: os.close(fd)
    finally: os.close(d)


def pipeline_blob(path, rows, blobs):
    nodes = {r['path']:r for r in rows}; pending = path.split('/'); stack = []; hops = 0
    while pending:
        name = pending.pop(0)
        if name == '.': continue
        if name == '..':
            need(bool(stack), 'pipeline_link_escape'); stack.pop(); continue
        node = nodes.get('/'.join(stack + [name])); need(node is not None, 'pipeline_runtime_missing')
        if node['type'] == 'symlink':
            hops += 1; need(hops <= 32, 'pipeline_link_cycle'); pending = node['target'].split('/') + pending
        else:
            need(not pending or node['type'] == 'dir', 'pipeline_runtime_path'); stack.append(name)
    key = '/'.join(stack); need(key in blobs, 'pipeline_runtime_file')
    return blobs[key]


def pipeline_descriptor(raw, capsule, sha):
    need(type(raw) is bytes and 0 < len(raw) <= 16384, 'pipeline_descriptor_capacity')
    d = parse(raw)
    fixed = {'version':1,'contract':PIPELINE_CONTRACT,'sourceSha':sha,'pipelineTreeSha1':PIPELINE_NEW_TREE,
             'packageBlobSha1':PIPELINE_NEW_PACKAGE,'lockBlobSha1':PIPELINE_NEW_LOCK,
             'nodeVersion':'v24.18.0','nodeSha256':PIPELINE_NODE,'pnpmVersion':'10.32.1',
             'pnpmTarSha256':PIPELINE_PNPM,'platform':'linux/amd64/glibc'}
    need(type(sha) is str and SHA.fullmatch(sha) and type(d) is dict
         and set(d) == set(fixed) | {'capsuleSha256','inventorySha256','capsuleBytes','logicalBytes','entryCount'}
         and type(d['version']) is int and all(d[k] == v for k,v in fixed.items()), 'pipeline_descriptor_schema')
    inv, blobs = pipeline_capsule(capsule); rows = inv['entries']
    for k,v in [('capsuleBytes',len(capsule)),('logicalBytes',sum(r.get('size',0) for r in rows)),('entryCount',len(rows))]:
        need(type(d[k]) is int and d[k] == v, 'pipeline_descriptor_counts')
    need(d['capsuleSha256'] == digest(capsule) and d['inventorySha256'] == digest(canonical(inv)), 'pipeline_descriptor_hash')
    for path, expected in [('package.json',PIPELINE_NEW_PACKAGE),('pnpm-lock.yaml',PIPELINE_NEW_LOCK)]:
        data = pipeline_blob(path,rows,blobs)
        need(hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest() == expected, 'pipeline_source_blob')
    for name, version in [('zod','4.6.7'),('undici','7.30.1'),('tsx','4.23.15'),('esbuild','0.28.2'),('.aktau-pnpm','10.32.1')]:
        try: package = json.loads(pipeline_blob(('node_modules/.pnpm/'+name+'@'+version+'/node_modules/'+name if name in ['undici','esbuild'] else 'node_modules/'+name)+'/package.json',rows,blobs))
        except (ValueError,UnicodeError): raise Blocked('pipeline_runtime_package') from None
        need(type(package) is dict and package.get('version') == version, 'pipeline_runtime_version')
    return d


def source_admission_v2(contents, manifest):
    """Offline inspection only, in an isolated object store; NEVER checkout.

    It does not authenticate GitHub or authorize activation. Production ingress
    verifies independent producer/CI/ZIP pins, strict policy v2 and enrollment.
    """
    import tempfile
    need(manifest.get('version') == 2, 'pipeline_source_version')
    bundle_input=contents['source.bundle'];header_end=bundle_input.find(b'\n\n',0,1<<20)+2
    need(header_end>1 and bundle_input[header_end:header_end+4]==b'PACK'
         and len(bundle_input)>=header_end+12,'source_capacity_unverified')
    pack_version,pack_count=struct.unpack('>II',bundle_input[header_end+4:header_end+12])
    need(pack_version in [2,3] and 0<pack_count<=1<<20,'source_disk_capacity')
    need(digest(contents['custodian.py'])==PIPELINE_CUSTODIAN,'pipeline_codec_scope')
    with tempfile.TemporaryDirectory(prefix='aktau-v2-source-') as temp:
        root = pathlib.Path(temp); repo = root/'objects.git'; bundle = root/'source.bundle'
        fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC)
        try:
            space=os.fstatvfs(fd)
            need(space.f_frsize>0 and space.f_bavail*space.f_frsize >=
                 3*len(bundle_input)+64*pack_count+DISK_RESERVE,'insufficient_disk_capacity')
        finally:os.close(fd)
        bundle.write_bytes(contents['source.bundle'])
        def git(args, cap=2 << 20):
            return command(['/usr/bin/git','--no-replace-objects','-c','core.hooksPath=/dev/null',
                            '-c','core.fsmonitor=false','-c','protocol.file.allow=always','-c','fetch.unpackLimit=0','-c','gc.auto=0',
                            '--git-dir='+str(repo), *args], timeout=20, cap=cap)
        command(['/usr/bin/git','init','--bare',str(repo)],timeout=20)
        sha = manifest['sourceSha']
        git(['fetch','--no-tags',str(bundle),sha])
        need(git(['rev-parse',sha+'^{tree}']).decode().strip() == manifest['sourceTree'], 'source_tree')
        git(['merge-base','--is-ancestor','49f6823768817b0390f215de42439cce523bf5d3',sha])
        for ref,tree,pkg,lock in [(sha,PIPELINE_NEW_TREE,PIPELINE_NEW_PACKAGE,PIPELINE_NEW_LOCK),
                                  (PIPELINE_OLD_SOURCE,PIPELINE_OLD_TREE,PIPELINE_OLD_PACKAGE,PIPELINE_OLD_LOCK)]:
            for path,expected in [('pipeline',tree),('pipeline/package.json',pkg),('pipeline/pnpm-lock.yaml',lock)]:
                need(git(['rev-parse',ref+':'+path]).decode().strip() == expected, 'pipeline_source_identity')
        protected = git(['diff','--name-only','--no-renames',PIPELINE_OLD_SOURCE,sha,'--',
                         'backend/prisma','contracts','deploy/compose.production.yml']).decode().splitlines()
        if protected:
            need(protected == ['contracts/pnpm-lock.yaml'], 'protected_delta')
            blobs = []
            for ref in [PIPELINE_OLD_SOURCE,sha]:
                row = git(['ls-tree',ref,'--','contracts/pnpm-lock.yaml']).decode().split()
                need(len(row) == 4 and row[:2] == ['100644','blob'] and row[3] == 'contracts/pnpm-lock.yaml','protected_delta')
                blobs.append(row[2])
            pipeline_contracts_delta(protected,*blobs)
        for ref in [sha,PIPELINE_OLD_SOURCE]:
            source_rows=git(['ls-tree','-rlz',ref]).split(b'\0');sizes=[];directories=set()
            for row in source_rows:
                if not row:continue
                meta,path=row.split(b'\t',1);mode,kind,obj,size=meta.split()
                need(len(path)<=512 and len(path.split(b'/'))<=32,'source_disk_capacity')
                pieces=path.split(b'/');directories.update(b'/'.join(pieces[:i]) for i in range(1,len(pieces)))
                need(kind==b'blob' and size.isdigit(),'source_capacity_unverified');sizes.append(int(size))
            need(len(sizes)<=8192 and len(directories)<=8192 and sum(sizes)<=MAX_TAR,'source_disk_capacity')
        inv, data = pipeline_capsule(contents['pipeline-runtime.tar']); rows = inv['entries']
        expected = set()
        for row in git(['ls-tree','-rz',sha,'--','pipeline']).split(b'\0'):
            if not row: continue
            meta,path = row.split(b'\t'); mode,kind,obj = meta.decode().split(); path = path.decode()[9:]
            need(kind == 'blob' and mode in ['100644','100755'], 'pipeline_tracked_type')
            raw = pipeline_blob(path,rows,data)
            need(hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest() == obj, 'pipeline_tracked_blob')
            node = next(r for r in rows if r['path'] == path)
            need(node['type'] == 'file' and node['mode'] == (0o555 if mode == '100755' else 0o444),'pipeline_tracked_mode')
            expected.add(path)
        need({r['path'] for r in rows if r['type'] != 'dir' and not r['path'].startswith('node_modules/')} == expected,
             'pipeline_tracked_inventory')
        for name,path in source_paths().items():
            need(digest(git(['show',sha+':'+path], cap=16 << 20)) == manifest['files'][name], 'source_blob_mismatch')
    return {'status':'ARTIFACT_V2_SOURCE_VALIDATED_NOT_AUTHORIZATION','sourceSha':sha,
            'pipelineTreeSha1':PIPELINE_NEW_TREE,'protectedPaths':protected}


class PipelineStore:
    """Unselected generations only; never rename, select, recover or remove.

    Root/admin are trusted. Ordinary writers are excluded by private parents.
    Pins detect corrupt/replaced paths; they are not a CAS against hostile root.
    The fixed directory flock serializes store writers, not the future release
    transaction. Existing ingress/runtime/controller locks remain unchanged.
    """
    def __init__(self, fs): self.fs = fs

    def location(self, identity):
        need(type(identity) is str and HEX.fullmatch(identity), 'pipeline_generation')
        return BASE + '/capsules/' + identity

    @staticmethod
    def _identity(st):
        return [st.st_dev, st.st_ino, st.st_uid, st.st_gid, st.st_mode]

    def _custody(self, fd, private=False):
        st = os.fstat(fd)
        need(stat.S_ISDIR(st.st_mode) and (st.st_uid, st.st_gid) == (self.fs.uid, self.fs.gid)
             and not st.st_mode & 0o022 and not os.listxattr(fd)
             and (not private or stat.S_IMODE(st.st_mode) == 0o700), 'pipeline_parent_custody')
        return self._identity(st)

    @contextlib.contextmanager
    def _namespace(self):
        # Pin every ancestor, not just the final component. No directory is
        # created here; unknown namespace state must be reconciled externally.
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
        with contextlib.ExitStack() as stack:
            root = os.open(self.fs.sandbox or '/', flags); stack.callback(os.close, root)
            pins = [(None, None, root, self._custody(root))]; dirs = {'/': root}
            for path in [BASE, BASE + '/capsules', BASE + '/state']:
                parent = root; current = ''
                for name in pathlib.PurePosixPath(path).parts[1:]:
                    current += '/' + name
                    if current not in dirs:
                        fd = os.open(name, flags, dir_fd=parent); stack.callback(os.close, fd)
                        private = current in [BASE + '/capsules', BASE + '/state']
                        pins.append((parent, name, fd, self._custody(fd, private)))
                        dirs[current] = fd
                    parent = dirs[current]
            def guard():
                for parent, name, fd, original in pins:
                    need(self._custody(fd) == original, 'pipeline_parent_changed')
                    if parent is not None:
                        need(self._identity(os.stat(name, dir_fd=parent, follow_symlinks=False)) == original,
                             'pipeline_parent_changed')
            guard()
            yield dirs, guard, stack
            guard()

    def _write(self, parent, name, raw, mode):
        # Only called with a pinned fixed namespace/graph parent. O_EXCL leaves
        # a partial own file on any failure; there is no cleanup or overwrite.
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                     mode, dir_fd=parent)
        try:
            os.fchmod(fd, mode); original = self._identity(os.fstat(fd)); at = 0
            while at < len(raw):
                n = os.write(fd, raw[at:]); need(n > 0, 'pipeline_short_write'); at += n
            os.fsync(fd)
            st = os.fstat(fd)
            need(stat.S_ISREG(st.st_mode) and (st.st_uid, st.st_gid, st.st_nlink) == (self.fs.uid, self.fs.gid, 1)
                 and self._identity(st) == original and not os.listxattr(fd)
                 and stamp(st) == stamp(os.stat(name, dir_fd=parent, follow_symlinks=False)), 'pipeline_file_changed')
        finally: os.close(fd)
        os.fsync(parent)
        return stamp(st)

    def _read(self, parent, name, cap, mode):
        fd = os.open(name, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
        try:
            st = os.fstat(fd)
            need(stat.S_ISREG(st.st_mode) and (st.st_uid, st.st_gid, st.st_nlink) == (self.fs.uid, self.fs.gid, 1)
                 and stat.S_IMODE(st.st_mode) == mode and not os.listxattr(fd)
                 and 0 <= st.st_size <= cap, 'pipeline_file_custody')
            data = bytearray()
            while chunk := os.read(fd, min(65536, cap + 1 - len(data))):
                data.extend(chunk); need(len(data) <= cap, 'pipeline_capacity')
            need(stamp(st) == stamp(os.fstat(fd)) == stamp(os.stat(name, dir_fd=parent, follow_symlinks=False))
                 and len(data) == st.st_size, 'pipeline_file_changed')
            return bytes(data), stamp(st)
        finally: os.close(fd)

    def _graph(self, graph, rows, guard):
        """Read through no-follow dirfds only, never through inventory symlinks."""
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
        with contextlib.ExitStack() as stack:
            dirs = {'': graph}; children = {'': set()}; observed = []
            root = os.fstat(graph)
            need(self._custody(graph) and stat.S_IMODE(root.st_mode) == 0o555, 'pipeline_root_mode')
            for row in rows:
                guard(); path = row['path']; parent, _, name = path.rpartition('/')
                d = dirs[parent]; children[parent].add(name)
                st = os.stat(name, dir_fd=d, follow_symlinks=False)
                need((st.st_uid, st.st_gid) == (self.fs.uid, self.fs.gid), 'pipeline_entry_custody')
                if row['type'] == 'dir':
                    fd = os.open(name, flags, dir_fd=d); stack.callback(os.close, fd)
                    need(self._custody(fd) == self._identity(st) and stat.S_IMODE(st.st_mode) == 0o555,
                         'pipeline_dir_drift')
                    dirs[path] = fd; children[path] = set()
                elif row['type'] == 'file':
                    raw, actual = self._read(d, name, 16 << 20, row['mode'])
                    need(actual == stamp(st) and len(raw) == row['size'] and digest(raw) == row['sha256'], 'pipeline_file_drift')
                else:
                    need(stat.S_ISLNK(st.st_mode) and st.st_nlink == 1
                         and not os.listxattr('/proc/self/fd/' + str(d) + '/' + name, follow_symlinks=False)
                         and os.readlink(name, dir_fd=d) == row['target']
                         and stamp(st) == stamp(os.stat(name, dir_fd=d, follow_symlinks=False)), 'pipeline_link_drift')
                observed.append([path, list(stamp(st))])
            for path, fd in dirs.items():
                need(set(os.listdir(fd)) == children[path], 'pipeline_inventory_drift')
                if path:
                    parent, _, name = path.rpartition('/')
                    need(stamp(os.fstat(fd)) == stamp(os.stat(name, dir_fd=dirs[parent], follow_symlinks=False)),
                         'pipeline_dir_changed')
            need(stamp(root) == stamp(os.fstat(graph)), 'pipeline_root_changed'); guard()
            return digest(canonical(observed))

    def _verify(self, generation, state, identity, guard):
        need(self._custody(generation, True), 'pipeline_generation_custody')
        need(set(os.listdir(generation)) == {'pipeline', 'inventory.json', 'seal.json'}, 'pipeline_slot')
        raw, _ = self._read(generation, 'inventory.json', 2 << 20, 0o400)
        need(digest(raw) == identity, 'pipeline_inventory_digest'); rows = pipeline_inventory(raw)
        sealraw, _ = self._read(generation, 'seal.json', 4096, 0o400); seal = parse(sealraw)
        need(type(seal) is dict and list(seal) == ['version','contract','inventorySha256','generationIdentity',
             'rootIdentity','graphIdentitySha256','intentName','intentSha256']
             and type(seal['version']) is int and seal['version'] == 1
             and seal['contract'] == PIPELINE_CONTRACT and seal['inventorySha256'] == identity
             and type(seal['intentName']) is str and re.fullmatch(r'pipeline-[a-z0-9_-]{1,80}\.intent\.json', seal['intentName'])
             and type(seal['intentSha256']) is str and HEX.fullmatch(seal['intentSha256'])
             and self._identity(os.fstat(generation)) == seal['generationIdentity'], 'pipeline_seal')
        intentraw, _ = self._read(state, seal['intentName'], 2 << 20, 0o400)
        need(digest(intentraw) == seal['intentSha256'], 'pipeline_intent_changed')
        intent = parse(intentraw)
        need(intent == self._intent(identity, seal['intentName'][9:-12], rows), 'pipeline_intent_schema')
        graph = os.open('pipeline', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=generation)
        try:
            need(self._identity(os.fstat(graph)) == seal['rootIdentity'], 'pipeline_root_identity')
            need(self._graph(graph, rows, guard) == seal['graphIdentitySha256'], 'pipeline_graph_identity')
            need(self._identity(os.stat('pipeline', dir_fd=generation, follow_symlinks=False)) == seal['rootIdentity'], 'pipeline_root_changed')
        finally: os.close(graph)
        guard(); return seal

    def _intent(self, identity, release_id, rows):
        slot = self.location(identity)
        return {'version':1, 'kind':'unselected-pipeline-generation', 'contract':PIPELINE_CONTRACT,
                'inventorySha256':identity, 'releaseId':release_id,
                'resources':[slot, slot + '/pipeline', *[slot + '/pipeline/' + r['path'] for r in rows],
                             slot + '/inventory.json', slot + '/seal.json']}

    def verify(self, identity):
        self.location(identity)
        try:
            with self._namespace() as (dirs, guard, stack):
                fd = os.open(identity, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                             dir_fd=dirs[BASE + '/capsules']); stack.callback(os.close, fd)
                original = self._identity(os.fstat(fd))
                def bound():
                    guard()
                    need(self._identity(os.stat(identity, dir_fd=dirs[BASE + '/capsules'], follow_symlinks=False))
                         == self._identity(os.fstat(fd)) == original, 'pipeline_generation_changed')
                bound(); return self._verify(fd, dirs[BASE + '/state'], identity, bound)
        except OSError:
            raise Blocked('pipeline_filesystem_state') from None

    def install(self, raw, identity, release_id, register):
        # No CLI integration. register is an observer, never the sole durability
        # mechanism: this store owns a fixed no-clobber resource-intent table.
        need(type(release_id) is str and re.fullmatch(r'[a-z0-9_-]{1,80}', release_id), 'pipeline_release_id')
        inv, blobs = pipeline_capsule(raw); invraw = canonical(inv); slot = self.location(identity)
        need(digest(invraw) == identity, 'pipeline_inventory_digest'); rows = inv['entries']
        intent = canonical(self._intent(identity, release_id, rows)); need(len(intent) <= 2 << 20, 'pipeline_intent_capacity')
        try:
            with self._namespace() as (dirs, guard, stack):
                parent = dirs[BASE + '/capsules']; state = dirs[BASE + '/state']
                try: fcntl.flock(parent, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError: raise Blocked('pipeline_store_busy') from None
                # Reject every occupied slot, even a sealed known graph. Reuse
                # requires separately reviewed admission and is not implemented.
                need(identity not in os.listdir(parent), 'pipeline_generation_exists')
                intentname = 'pipeline-' + release_id + '.intent.json'
                self._write(state, intentname, intent, 0o400)
                register('generation', slot, None); guard()
                os.mkdir(identity, 0o700, dir_fd=parent); os.fsync(parent)
                generation = os.open(identity, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
                stack.callback(os.close, generation); gid = self._custody(generation, True)
                def bound():
                    guard()
                    need(self._custody(generation, True) == gid
                         == self._identity(os.stat(identity, dir_fd=parent, follow_symlinks=False)), 'pipeline_generation_changed')
                bound(); register('generation_created', slot, gid); bound()
                os.mkdir('pipeline', 0o700, dir_fd=generation); os.fsync(generation)
                graph = os.open('pipeline', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=generation)
                stack.callback(os.close, graph); graphid = self._identity(os.fstat(graph))
                graphdirs = {'':graph}; graphstack=contextlib.ExitStack(); stack.callback(graphstack.close)
                for row in rows:
                    bound(); path = row['path']; p, _, name = path.rpartition('/'); d = graphdirs[p]
                    if row['type'] == 'dir':
                        os.mkdir(name, 0o700, dir_fd=d); os.fsync(d)
                        fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=d)
                        graphstack.callback(os.close, fd); self._custody(fd, True); graphdirs[path] = fd
                    elif row['type'] == 'file': self._write(d, name, blobs[path], row['mode'])
                # Graph links are validated by the bounded inventory resolver,
                # created last, and are never used to open files/directories.
                for row in rows:
                    if row['type'] == 'symlink':
                        bound(); p, _, name = row['path'].rpartition('/'); d = graphdirs[p]
                        os.symlink(row['target'], name, dir_fd=d); os.fsync(d)
                for path, fd in reversed(list(graphdirs.items())):
                    os.fchmod(fd, 0o555); os.fsync(fd)
                # The private graph is now sealed read-only. Verification pins
                # its own directory set; retaining the construction set too
                # doubles FD usage for the exact 740-directory approved graph.
                # Keep graph/generation/namespace anchors pinned throughout.
                graphstack.close(); graphdirs.clear()
                bound()
                graphid = self._identity(os.fstat(graph))
                need(graphid == self._identity(os.stat('pipeline', dir_fd=generation, follow_symlinks=False)), 'pipeline_root_changed')
                # Capture actual created identities before exposing a fault point.
                created = self._graph(graph, rows, bound)
                self._write(generation, 'inventory.json', invraw, 0o400)
                register('graph_ready', slot, gid); bound()
                need(set(os.listdir(generation)) == {'pipeline','inventory.json'}
                     and self._graph(graph, rows, bound) == created, 'pipeline_preseal_changed')
                seal = {'version':1,'contract':PIPELINE_CONTRACT,'inventorySha256':identity,
                        'generationIdentity':gid,'rootIdentity':graphid,'graphIdentitySha256':created,
                        'intentName':intentname,'intentSha256':digest(intent)}
                self._write(generation, 'seal.json', canonical(seal), 0o400)
                os.fsync(graph); os.fsync(generation); os.fsync(parent); os.fsync(state)
                self._verify(generation, state, identity, bound)
                register('sealed', slot, gid); bound()
                self._verify(generation, state, identity, bound)
                return slot
        except FileExistsError:
            raise Blocked('pipeline_no_clobber') from None


# PR86 v2 root domain: isolated classes, no public path/approval switches.
CONTRACT='pr86-pipeline-v2'
PHASES={'intent','capsule_staged','backed_up','prepared','switching','old_mount_detached',
        'publisher','new_mount_attached','selection_written','tuple_verified','committed',
        'rollback_intent','rollback_detached','rollback_publisher','rollback_mount',
        'rollback_selection','rolled_back',*[f'file_{i}' for i in range(14)],
        *[f'rollback_file_{i}' for i in range(14)]}
FIELDS={'version','contract','identity','directory','phase','oldPublisher','newPublisher',
        'invariants','c2Targets','pipeline','resources','child'}
PIPELINE_FIELDS={'oldSelectionHash','newSelectionHash','oldGeneration','newGeneration','oldSealHash',
                 'newSealHash','targetParentIdentity','underlyingTargetIdentity','mountBefore','mountPrepared','mountAfter'}


def selection(p,raw):
    v=p.parse(raw)
    p.need(type(v) is dict and set(v)=={'version','contract','sourceSha','pipelineTreeSha1','inventorySha256',
        'descriptorSha256','releaseIdentity','provenanceKind'} and type(v['version']) is int and v['version']==1
        and v['contract']==CONTRACT and all(type(v[k]) is str for k in ['sourceSha','pipelineTreeSha1','inventorySha256','descriptorSha256','releaseIdentity','provenanceKind']) and p.SHA.fullmatch(v['sourceSha'])
        and v['pipelineTreeSha1'] in [p.PIPELINE_OLD_TREE,p.PIPELINE_NEW_TREE]
        and p.HEX.fullmatch(v['inventorySha256']) and p.HEX.fullmatch(v['descriptorSha256'])
        and re.fullmatch(r'[a-z0-9_-]{1,80}',v['releaseIdentity'])
        and v['provenanceKind'] in ['github-artifact','legacy-installed-attested'],'pipeline_selection')
    return v


class TransactionV2:
    """Coupled protocol; injected host/mount objects are trusted root components.

    Reached only after independent authenticated v2 admission and enrollment.
    No approval flag, path override, dependency installer, retry or cleanup.
    """
    def __init__(self,p,fs,host,mounts,fault=lambda _:None):
        self.p,self.fs,self.host,self.mounts,self.fault=p,fs,host,mounts,fault
        self.j=None
    def save(self,phase):
        p=self.p;p.need(phase in PHASES,'pipeline_phase');self.j['phase']=phase
        self.validate(self.j)
        raw=p.canonical(self.j);p.need(len(raw)<=65536,'pipeline_journal_capacity')
        self.fs.write(p.INTERLOCK,raw,replace=os.path.lexists(self.fs.path(p.INTERLOCK)))
        self.fault(phase)
    def validate(self,j):
        p=self.p
        def identity(v,n):return type(v) is list and len(v)==n and all(type(x) is int and x>=0 for x in v)
        p.need(type(j) is dict and set(j)==FIELDS and type(j['version']) is int and j['version']==2
            and j['contract']==CONTRACT and j['phase'] in PHASES
            and type(j['identity']) is str and re.fullmatch(r'[a-z0-9_-]{1,80}',j['identity'])
            and j['directory']==p.BASE+'/releases/'+j['identity']
            and type(j['pipeline']) is dict and set(j['pipeline'])==PIPELINE_FIELDS
            and type(j['c2Targets']) is dict and set(j['c2Targets'])==set(p.FILES.values())|set(p.RECORDS)
            and type(j['resources']) is dict and set(j['resources'])=={'oldSelection','newSelection','staged','restores','selectionRecord','mountStage','rollbackMountStage','mountStageIdentity','rollbackMountStageIdentity','bundle','manifest','descriptor','provenance','capsule','payloadFiles'}
            and j['resources']['oldSelection']==j['directory']+'/old-selection.json'
            and j['resources']['newSelection']==j['directory']+'/new-selection.json'
            and type(j['resources']['staged']) is dict and set(j['resources']['staged'])==set(j['c2Targets'])
            and type(j['resources']['restores']) is dict and set(j['resources']['restores'])==set(j['c2Targets']), 'pipeline_journal_schema')
        for kind in ['oldPublisher','newPublisher']:
            v=j[kind];p.need(type(v) is dict and set(v)=={'sha','branch'} and type(v['sha']) is str and p.SHA.fullmatch(v['sha'])
                and type(v['branch']) is str and re.fullmatch(r'[A-Za-z0-9_/.-]{1,160}',v['branch']),'pipeline_publisher')
        for target,r in j['c2Targets'].items():
            p.need(type(r) is dict and set(r)=={'backup','oldHash','newHash','oldMode','oldIdentity','newIdentity','parentIdentity'}
                and r['backup']==j['directory']+'/backup/'+str(list(j['c2Targets']).index(target))
                and p.HEX.fullmatch(r['oldHash']) and p.HEX.fullmatch(r['newHash'])
                and type(r['oldMode']) is int and r['oldMode'] in [0o400,0o444,0o555,0o600,0o644,0o755]
                and identity(r['oldIdentity'],9) and identity(r['parentIdentity'],6)
                and (r['newIdentity'] is None or identity(r['newIdentity'],9)), 'pipeline_target_record')
            for key in ['staged','restores']:
                want=str(os.path.dirname(target))+'/.'+os.path.basename(target)+'.'+j['identity']+'.'+key
                p.need(j['resources'][key][target]==want,'pipeline_resource_path')
        sr=j['resources']['selectionRecord']
        p.need(type(sr) is dict and set(sr)=={'oldIdentity','newIdentity','parentIdentity','stage','restore'}
            and identity(sr['oldIdentity'],9) and identity(sr['parentIdentity'],6)
            and (sr['newIdentity'] is None or identity(sr['newIdentity'],9))
            and sr['stage']==os.path.dirname(p.PIPELINE_SELECTION)+'/.pipeline.json.'+j['identity']+'.staged'
            and sr['restore']==os.path.dirname(p.PIPELINE_SELECTION)+'/.pipeline.json.'+j['identity']+'.restores'
            and j['resources']['mountStage']==p.BASE+'/mounts/'+j['identity']
            and j['resources']['rollbackMountStage']==p.BASE+'/mounts/rollback-'+j['pipeline']['oldGeneration'][:16], 'pipeline_resource_schema')
        p.need(all(j['resources'][k]==j['directory']+'/'+name for k,name in [('bundle','source.bundle'),
            ('manifest','promotion.json'),('descriptor','pipeline-runtime.json'),('provenance','provenance.json'),('capsule','pipeline-runtime.tar')]),'pipeline_resource_path')
        p.need(j['resources']['payloadFiles']=={name:j['directory']+'/'+name for name in p.FILES},'pipeline_payload_paths')
        p.need(all(j['resources'][k] is None or identity(j['resources'][k],6) for k in ['mountStageIdentity','rollbackMountStageIdentity']),'pipeline_mount_registration')
        c=j['child']
        p.need(c is None or type(c) is dict and set(c)=={'pid','startTicks','bootId','operation'}
            and type(c['pid']) is int and c['pid']>0 and type(c['startTicks']) is int and c['startTicks']>0
            and type(c['bootId']) is str and re.fullmatch(r'[a-f0-9-]{36}',c['bootId'])
            and c['operation'] in ['source','mount'],'pipeline_child')
        for k in ['oldSelectionHash','newSelectionHash','oldGeneration','newGeneration','oldSealHash']:
            p.need(type(j['pipeline'][k]) is str and p.HEX.fullmatch(j['pipeline'][k]),'pipeline_identity')
        p.need(j['pipeline']['newSealHash'] is None or type(j['pipeline']['newSealHash']) is str and p.HEX.fullmatch(j['pipeline']['newSealHash']), 'pipeline_identity')
        p.need(all(identity(j['pipeline'][k],6) for k in ['targetParentIdentity','underlyingTargetIdentity']),'pipeline_parent_identity')
        def mount_record(value,prepared=False):
            if type(value) is not dict:return False
            keys=({'mountId','namespace','rootIdentity','generation','stage'} if prepared else
                {'state','namespace'} if value.get('state')=='absent' else {'state','namespace','mountId','rootIdentity','generation'})
            if set(value)!=keys or type(value['namespace']) is not str or not re.fullmatch(r'mnt:\[[1-9][0-9]*\]',value['namespace']):return False
            if not prepared and value.get('state')=='absent':return True
            return (prepared or value.get('state')=='mounted') and type(value['mountId']) is int and value['mountId']>0 and identity(value['rootIdentity'],6) and value['generation'] in [j['pipeline']['oldGeneration'],j['pipeline']['newGeneration']]
        p.need(mount_record(j['pipeline']['mountBefore']),'pipeline_mount_record')
        for key in ['mountPrepared','mountAfter']:
            value=j['pipeline'][key]
            p.need(value is None or mount_record(value,prepared=key=='mountPrepared'),'pipeline_mount_record')
        prepared=j['pipeline']['mountPrepared']
        p.need(prepared is None or prepared['stage']==j['resources']['mountStage'] and prepared['generation']==j['pipeline']['newGeneration'], 'pipeline_mount_record')
    def mount_intent(self,key,value):
        p=self.p;p.need(key in ['mountStageIdentity','rollbackMountStageIdentity']
            and self.j['resources'][key] is None and type(value) is list and len(value)==6,'pipeline_mount_registration')
        self.j['resources'][key]=value;self.validate(self.j)
        self.fs.write(p.INTERLOCK,p.canonical(self.j),replace=True)
        self.fault(key+'_registered')
    def _target_state(self,target,r):
        p=self.p
        p.need(list(p.stamp(os.lstat(self.fs.path(os.path.dirname(target)))))[:6]==r['parentIdentity'],'pipeline_target_parent_changed')
        raw=self.fs.read(target,p.MAX_TAR);st=list(p.stamp(os.lstat(self.fs.path(target))))
        # rename may update ctime; the pinned inode/content/mode/mtime must agree.
        if p.digest(raw)==r['oldHash'] and st[:8]==r['oldIdentity'][:8]:return 'old'
        if p.digest(raw)==r['newHash'] and r['newIdentity'] is not None and st[:8]==r['newIdentity'][:8]:return 'new'
        raise p.Blocked('pipeline_unknown_target')
    def _replace(self,stage,target,expected,current):
        p=self.p
        p.need(target in self.j['c2Targets'] or target==p.PIPELINE_SELECTION,'pipeline_target_path')
        allowed=([self.j['resources']['selectionRecord'][k] for k in ['stage','restore']] if target==p.PIPELINE_SELECTION else
                 [self.j['resources'][k][target] for k in ['staged','restores']])
        p.need(stage in allowed,'pipeline_stage_path')
        src=self.fs.directory(os.path.dirname(stage));dst=self.fs.directory(os.path.dirname(target))
        try:
            expected_parent=(self.j['resources']['selectionRecord']['parentIdentity'] if target==p.PIPELINE_SELECTION else self.j['c2Targets'][target]['parentIdentity'])
            p.need(list(p.stamp(os.fstat(src)))[:6]==list(p.stamp(os.fstat(dst)))[:6]==expected_parent,'pipeline_target_parent_changed')
            before=os.stat(os.path.basename(stage),dir_fd=src,follow_symlinks=False)
            old=os.stat(os.path.basename(target),dir_fd=dst,follow_symlinks=False)
            p.need(list(p.stamp(before))[:8]==expected[:8] and list(p.stamp(old))[:8]==current[:8], 'pipeline_replace_cas')
            os.rename(os.path.basename(stage),os.path.basename(target),src_dir_fd=src,dst_dir_fd=dst)
            os.fsync(src);os.fsync(dst)
            p.need(list(p.stamp(os.stat(os.path.basename(target),dir_fd=dst,follow_symlinks=False)))[:8]==expected[:8], 'pipeline_replace_readback')
        finally:os.close(src);os.close(dst)
    def promote(self,contents,m,identity):
        p=self.p;p.need(getattr(self.host,'child_protocol_version',None)==2,'pipeline_child_protocol_required')
        p.need({'source.bundle','promotion.json','pipeline-runtime.tar','pipeline-runtime.json'}<=set(contents),'pipeline_payload_metadata')
        proof=m.get('_rootProvenance')
        p.need(type(proof) is dict and set(proof)=={'version','repository','sourceSha','artifactId','zipSha256','zipBytes','buildRunId','buildAttempt','ciRunId','ciAttempt'}
            and type(proof['version']) is int and proof['version']==1 and proof['repository']==p.REPOSITORY
            and proof['sourceSha']==m['sourceSha'] and type(proof['zipSha256']) is str and p.HEX.fullmatch(proof['zipSha256'])
            and all(p.positive(proof[k]) for k in ['artifactId','zipBytes','buildRunId','buildAttempt','ciRunId','ciAttempt'])
            and proof['zipBytes']<=p.MAX_ARCHIVE,'pipeline_provenance_record')
        self.host.bind(self)
        p.need(m.get('version')==2 and re.fullmatch(r'[a-z0-9_-]{1,80}',identity),'pipeline_release')
        p.need(not os.path.lexists(self.fs.path(p.INTERLOCK)),'pending_promotion_recovery')
        reject_unknown_pending(p,self.fs)
        release_inventory_v2(p,self.fs)
        self.host.idle();self.host.verify_baseline();old=self.host.publisher();inv=self.host.invariants()
        oldraw=self.fs.read(p.PIPELINE_SELECTION,16384);oldsel=selection(p,oldraw)
        p.need(oldsel['sourceSha']==old['sha'],'pipeline_old_source')
        oldseal=p.PipelineStore(self.fs).verify(oldsel['inventorySha256'])
        d=p.pipeline_descriptor(contents['pipeline-runtime.json'],contents['pipeline-runtime.tar'],m['sourceSha'])
        newsel={'version':1,'contract':CONTRACT,'sourceSha':m['sourceSha'],'pipelineTreeSha1':p.PIPELINE_NEW_TREE,
            'inventorySha256':d['inventorySha256'],'descriptorSha256':p.digest(contents['pipeline-runtime.json']),
            'releaseIdentity':identity,'provenanceKind':'github-artifact'}
        newraw=p.canonical(newsel);directory=p.BASE+'/releases/'+identity
        p.need(not os.path.lexists(self.fs.path(directory)),'replayed_release')
        updates=self.host.authority_updates(contents,m,identity)
        p.need(set(updates)==set(p.FILES.values())|set(p.RECORDS),'pipeline_targets')
        targets={}
        for target,data in updates.items():
            raw=self.fs.read(target,p.MAX_TAR);st=os.lstat(self.fs.path(target))
            targets[target]={'backup':directory+'/backup/'+str(len(targets)),'oldHash':p.digest(raw),'newHash':p.digest(data),
                'oldMode':stat.S_IMODE(st.st_mode),'oldIdentity':list(p.stamp(st)),'newIdentity':None,
                'parentIdentity':list(p.stamp(os.lstat(self.fs.path(os.path.dirname(target)))))[:6]}
        self.j={'version':2,'contract':CONTRACT,'identity':identity,'directory':directory,'phase':'intent',
            'oldPublisher':old,'newPublisher':{'sha':m['sourceSha'],'branch':'HEAD'},'invariants':inv,'c2Targets':targets,
            'pipeline':{'oldSelectionHash':p.digest(oldraw),'newSelectionHash':p.digest(newraw),
                'oldGeneration':oldsel['inventorySha256'],'newGeneration':d['inventorySha256'],'oldSealHash':p.digest(p.canonical(oldseal)),
                'newSealHash':None,'targetParentIdentity':self.mounts.parent_identity(),'underlyingTargetIdentity':self.mounts.underlying_identity(),
                'mountBefore':self.mounts.inspect(),'mountPrepared':None,'mountAfter':None},
            'resources':{'oldSelection':directory+'/old-selection.json','newSelection':directory+'/new-selection.json',
                'mountStage':p.BASE+'/mounts/'+identity,'rollbackMountStage':p.BASE+'/mounts/rollback-'+oldsel['inventorySha256'][:16],
                'mountStageIdentity':None,'rollbackMountStageIdentity':None,'bundle':directory+'/source.bundle',
                'manifest':directory+'/promotion.json','descriptor':directory+'/pipeline-runtime.json','provenance':directory+'/provenance.json',
                'capsule':directory+'/pipeline-runtime.tar','payloadFiles':{name:directory+'/'+name for name in p.FILES},
                'selectionRecord':{'oldIdentity':list(p.stamp(os.lstat(self.fs.path(p.PIPELINE_SELECTION)))),
                    'newIdentity':None,'parentIdentity':list(p.stamp(os.lstat(self.fs.path(os.path.dirname(p.PIPELINE_SELECTION)))))[:6],
                    'stage':os.path.dirname(p.PIPELINE_SELECTION)+'/.pipeline.json.'+identity+'.staged',
                    'restore':os.path.dirname(p.PIPELINE_SELECTION)+'/.pipeline.json.'+identity+'.restores'},
                **{k:{t:os.path.dirname(t)+'/.'+os.path.basename(t)+'.'+identity+'.'+k for t in targets} for k in ['staged','restores']}},'child':None}
        pipeline_disk_guard(self.fs,contents,updates,{t:os.lstat(self.fs.path(t)).st_size for t in targets},oldraw,newraw)
        self.save('intent');self.fs.mkdir(directory);self.fs.mkdir(directory+'/backup')
        for key,name in [('manifest','promotion.json'),('descriptor','pipeline-runtime.json')]:
            if name in contents:self.fs.write(self.j['resources'][key],contents[name])
        if '_rootProvenance' in m:self.fs.write(self.j['resources']['provenance'],p.canonical(m['_rootProvenance']))
        self.fs.write(self.j['resources']['oldSelection'],oldraw);self.fs.write(self.j['resources']['newSelection'],newraw)
        self.fs.write(self.j['resources']['capsule'],contents['pipeline-runtime.tar'],0o444)
        for name,path in self.j['resources']['payloadFiles'].items():
            self.fs.write(path,contents[name],0o555 if name in ['node','ingest','c2projection','relayprobe'] else 0o444)
        self.host.validate_release_binaries(contents,m,directory)
        p.PipelineStore(self.fs).install(contents['pipeline-runtime.tar'],d['inventorySha256'],identity,
            lambda event,path,stamp:self.fault('generation_'+event))
        self.j['pipeline']['newSealHash']=p.digest(p.canonical(p.PipelineStore(self.fs).verify(d['inventorySha256'])))
        self.save('capsule_staged')
        for target,r in targets.items():
            self.fs.write(r['backup'],self.fs.read(target,p.MAX_TAR),r['oldMode'])
            staged=self.j['resources']['staged'][target];self.fs.write(staged,updates[target],r['oldMode'])
            r['newIdentity']=list(p.stamp(os.lstat(self.fs.path(staged))))
        sr=self.j['resources']['selectionRecord'];self.fs.write(sr['stage'],newraw,0o644)
        sr['newIdentity']=list(p.stamp(os.lstat(self.fs.path(sr['stage']))))
        self.save('backed_up');self.host.import_release(contents,m,directory)
        self.j['pipeline']['mountPrepared']=self.mounts.prepare(d['inventorySha256'],identity,lambda value:self.mount_intent('mountStageIdentity',value))
        self.host.check_release(m)
        self.save('prepared');p.need(self.host.invariants()==inv and self.host.publisher()==old,'pipeline_pre_switch_drift')
        self.save('switching');self.mounts.detach(self.j['pipeline']['mountBefore']);self.save('old_mount_detached')
        p.need(self.host.publisher()==old,'pipeline_underlying_source_drift')
        self.host.switch(self.j['newPublisher']);self.save('publisher')
        self.mounts.attach(self.j['pipeline']['mountPrepared']);self.j['pipeline']['mountAfter']=self.mounts.inspect();self.save('new_mount_attached')
        for i,(target,r) in enumerate(targets.items()):
            self._target_state(target,r);self._replace(self.j['resources']['staged'][target],target,r['newIdentity'],r['oldIdentity']);self.save('file_'+str(i))
        p.need(self.fs.read(p.PIPELINE_SELECTION,16384)==oldraw,'pipeline_selection_drift')
        self._replace(sr['stage'],p.PIPELINE_SELECTION,sr['newIdentity'],sr['oldIdentity']);self.save('selection_written')
        p.need(self.host.publisher()==self.j['newPublisher'] and self.host.invariants()==inv,'pipeline_tuple')
        p.need(all(self._target_state(t,r)=='new' for t,r in targets.items()),'pipeline_tuple')
        p.need(self.mounts.generation()==d['inventorySha256'],'pipeline_mount_tuple');self.save('tuple_verified')
        emit_attestation(p,self.fs,self.mounts,newraw,[self.j['pipeline']['oldSelectionHash'],self.j['pipeline']['newSelectionHash']])
        self.save('committed');self.fs.write(directory+'/receipt.json',p.canonical(self.j))
        self.fs.write(p.BASE+'/state/last.json',p.canonical({'version':2,'identity':identity}),replace=os.path.lexists(self.fs.path(p.BASE+'/state/last.json')))
        self.fs.remove_owned(p.INTERLOCK,p.canonical(self.j));return 'PIPELINE_V2_COMMITTED'
    def recover(self,j,deliberate=False):
        p=self.p;self.validate(j);self.j=j
        if self.host.engine is None:self.host.bind(self)
        reject_unknown_pending(p,self.fs,current=j['identity'])
        release_inventory_v2(p,self.fs,current=j['identity'])
        p.need(self.host.child_absent(j['child']),'pipeline_child_cleanup_unverified')
        self.host.idle()
        current=self.host.publisher();p.need(current in [j['oldPublisher'],j['newPublisher']],'pipeline_unknown_source')
        # Classify ALL domains before any write. Unknown partial preparation is
        # preserved, not cleaned up or guessed from a source SHA.
        states={t:self._target_state(t,r) for t,r in j['c2Targets'].items()}
        for name,path in j['resources']['payloadFiles'].items():
            p.need(p.digest(self.fs.read(path,p.MAX_TAR))==j['c2Targets'][p.FILES[name]]['newHash'],'pipeline_retained_payload')
        inventory,_=p.pipeline_capsule(self.fs.read(j['resources']['capsule'],p.PIPELINE_CAP))
        p.need(p.digest(p.canonical(inventory))==j['pipeline']['newGeneration'],'pipeline_retained_capsule')
        for target,r in j['c2Targets'].items():
            stage=j['resources']['staged'][target]
            if os.path.lexists(self.fs.path(stage)):
                p.need(r['newIdentity'] is not None and list(p.stamp(os.lstat(self.fs.path(stage))))[:8]==r['newIdentity'][:8]
                    and p.digest(self.fs.read(stage,p.MAX_TAR))==r['newHash'],'pipeline_unknown_stage')
            p.need(not os.path.lexists(self.fs.path(j['resources']['restores'][target])),'pipeline_unknown_restore')
        oldraw=self.fs.read(j['resources']['oldSelection'],16384);newraw=self.fs.read(j['resources']['newSelection'],16384)
        p.need(p.digest(oldraw)==j['pipeline']['oldSelectionHash'] and p.digest(newraw)==j['pipeline']['newSelectionHash'],'pipeline_selection_backup')
        selected=self.fs.read(p.PIPELINE_SELECTION,16384);sr=j['resources']['selectionRecord']
        current=list(p.stamp(os.lstat(self.fs.path(p.PIPELINE_SELECTION))))
        p.need(list(p.stamp(os.lstat(self.fs.path(os.path.dirname(p.PIPELINE_SELECTION)))))[:6]==sr['parentIdentity'],'pipeline_selection_parent_changed')
        p.need((selected==oldraw and current[:8]==sr['oldIdentity'][:8]) or
            (selected==newraw and sr['newIdentity'] is not None and current[:8]==sr['newIdentity'][:8]),'pipeline_unknown_selection')
        for g,k in [(j['pipeline']['oldGeneration'],'oldSealHash'),(j['pipeline']['newGeneration'],'newSealHash')]:
            p.need(p.digest(p.canonical(p.PipelineStore(self.fs).verify(g)))==j['pipeline'][k],'pipeline_seal_changed')
        self.mounts.classify(j['pipeline'],j['resources'])
        for target,r in j['c2Targets'].items():p.need(p.digest(self.fs.read(r['backup'],p.MAX_TAR))==r['oldHash'],'pipeline_backup_hash')
        latest=self.host.invariants()
        p.need(deliberate or latest==j['invariants'],'pipeline_invariant_drift')
        if deliberate:
            ledger='/var/lib/aktau-sync/c2/ledger/attempts.json'
            p.need(set(latest)==set(j['invariants']) and all(latest[k]==j['invariants'][k] for k in latest if k!=ledger),'pipeline_reader_custody_changed')
            self.j['invariants']=latest
        old_mounted=(self.mounts.generation()==j['pipeline']['oldGeneration'] and self.host.publisher()==j['oldPublisher'])
        self.save('rollback_intent')
        if not old_mounted:
            self.mounts.detach_known(j['pipeline'],j['resources']);self.save('rollback_detached')
            self.host.switch(j['oldPublisher']);self.save('rollback_publisher')
            self.mounts.restore(j['pipeline'],lambda value:self.mount_intent('rollbackMountStageIdentity',value))
        # Preserve an independently classified already-restored old tuple.
        self.save('rollback_mount')
        for i,(target,r) in enumerate(j['c2Targets'].items()):
            if states[target]=='new':
                stage=j['resources']['restores'][target]
                p.need(not os.path.lexists(self.fs.path(stage)),'pipeline_unknown_restore')
                self.fs.write(stage,self.fs.read(r['backup'],p.MAX_TAR),r['oldMode'])
                st=list(p.stamp(os.lstat(self.fs.path(stage))));r['oldIdentity']=st
                self.validate(self.j);self.fs.write(p.INTERLOCK,p.canonical(self.j),replace=True)
                self.fault('rollback_replace_registered')
                self._replace(stage,target,st,r['newIdentity'])
                self.fault('rollback_replace_published')
            self.save('rollback_file_'+str(i))
        if selected!=oldraw:
            p.need(not os.path.lexists(self.fs.path(sr['restore'])),'pipeline_unknown_restore')
            self.fs.write(sr['restore'],oldraw,0o644)
            restored=list(p.stamp(os.lstat(self.fs.path(sr['restore']))))
            sr['oldIdentity']=restored
            self.validate(self.j);self.fs.write(p.INTERLOCK,p.canonical(self.j),replace=True)
            self._replace(sr['restore'],p.PIPELINE_SELECTION,restored,sr['newIdentity'])
        self.save('rollback_selection')
        p.need(self.host.publisher()==j['oldPublisher'] and self.host.invariants()==latest
               and self.mounts.generation()==j['pipeline']['oldGeneration'],'pipeline_rollback_tuple')
        p.need(all(self._target_state(t,r)=='old' for t,r in j['c2Targets'].items()),'pipeline_rollback_tuple')
        emit_attestation(p,self.fs,self.mounts,oldraw,[j['pipeline']['oldSelectionHash'],j['pipeline']['newSelectionHash']])
        self.save('rolled_back');terminal=j['directory']+'/rollback.json';raw=p.canonical(j)
        if os.path.lexists(self.fs.path(terminal)):
            p.need(self.fs.read(terminal,65536)==raw,'pipeline_rollback_receipt_conflict')
        else:self.fs.write(terminal,raw)
        self.fault('rollback_receipt_durable')
        self.fs.remove_owned(p.INTERLOCK,raw);return 'PIPELINE_V2_ROLLED_BACK'


class TrackedHost:
    """Existing Host methods with gated, journalled mutating Git children.

    The child cannot exec until its PID/start/boot identity is durably recorded.
    No environment/command input is accepted from the release request.
    """
    child_protocol_version=2
    def __init__(self,p,fs):
        self.p,self.fs,self.base=p,fs,p.Host(fs);self.engine=None
        if not fs.sandbox:
            account=pwd.getpwnam('aktau-sync')
            p.need(type(account.pw_uid) is int and account.pw_uid>0 and type(account.pw_gid) is int and account.pw_gid>0,
                'pipeline_actor_identity')
    def bind(self,engine):
        self.p.need(self.engine is None,'pipeline_host_bound');self.engine=engine
    def __getattr__(self,name):return getattr(self.base,name)
    def git(self,args,pass_fds=()):
        p=self.p
        argv=['/usr/bin/git','--no-replace-objects','-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null',
              '-c','gc.auto=0','-c','maintenance.auto=false','-c','fetch.unpackLimit=0','-C',str(self.fs.path(p.PUBLISHER)),*args]
        if not self.fs.sandbox:argv=['/usr/sbin/runuser','-u','aktau-sync','--',*argv]
        if args[0] not in ['checkout','fetch']:
            p.need(not pass_fds,'pipeline_git_fd');return p.command(argv,timeout=20,cap=2<<20).decode()
        if args[0]=='fetch':
            p.need(type(pass_fds) is tuple and len(pass_fds)==1 and type(pass_fds[0]) is int and pass_fds[0]>=3
                and len(args)==4 and args[:2]==['fetch','--no-tags'] and args[2]=='/proc/self/fd/'+str(pass_fds[0])
                and p.SHA.fullmatch(args[3]),'pipeline_git_fd')
            return self._child(argv,pass_fds).decode()
        p.need((len(args)==3 and args[:2]==['checkout','--detach'] and p.SHA.fullmatch(args[2])) or
               (len(args)==2 and re.fullmatch(r'[A-Za-z0-9_/][A-Za-z0-9_/.-]{0,159}',args[1]) and not args[1].startswith('-')),'pipeline_git_command')
        return self._child(argv).decode()
    def publisher(self):
        p=self.p;p.need(self.git(['status','--porcelain=v1','--untracked-files=all'])=='','dirty_publisher')
        sha=self.git(['rev-parse','HEAD']).strip();branch=self.git(['rev-parse','--abbrev-ref','HEAD']).strip()
        p.need(p.SHA.fullmatch(sha) and (branch=='HEAD' or re.fullmatch(r'[A-Za-z0-9_/.-]{1,160}',branch)),'publisher_sha')
        return {'sha':sha,'branch':branch}
    def switch(self,v):
        # v2 rollback intentionally restores an exact detached immutable commit;
        # retained branches remain untouched. No fetch, network or hook.
        if v['branch']=='HEAD':self.git(['checkout','--detach',v['sha']])
        else:
            self.p.need(self.git(['rev-parse','refs/heads/'+v['branch']]).strip()==v['sha'],'rollback_ref_changed')
            self.git(['checkout',v['branch']])
        self.p.need(self.publisher()==v,'pipeline_switch_readback')
    def invariants(self):
        # Persisted JSON contains lists; never compare it to transient Python
        # tuples after a crash/restart. Preserve all exact values and hashes.
        return self.p.parse(self.p.canonical(self.base.invariants()))
    def verify_baseline(self):
        p=self.p;policy=p.parse(self.fs.read(p.POLICY));p.validate_policy(policy)
        p.need(policy['version']==2,'pipeline_policy_required');enrolled=require_enrollment(p,self.fs,policy)
        selected=selection(p,self.fs.read(p.PIPELINE_SELECTION,16384))
        p.need(self.publisher()['sha']==p.PIPELINE_OLD_SOURCE and selected['sourceSha']==p.PIPELINE_OLD_SOURCE
            and selected['pipelineTreeSha1']==p.PIPELINE_OLD_TREE and selected['inventorySha256']==enrolled['generation'],
            'pipeline_exact_old_baseline')
        p.Host.verify_old_closure(self,policy)
        backend=self.engine.mounts if self.engine is not None else LinuxMounts(p,self.fs)
        p.need(backend.generation()==enrolled['generation']
            and p.parse(self.fs.read(p.PIPELINE_MOUNT_RECORD,16384))==attestation(p,self.fs,backend,self.fs.read(p.PIPELINE_SELECTION,16384)),
            'pipeline_old_mount_not_attested')
        # PR86 is a dependency-only transition. Freeze the ledger codec so a
        # partial 14-target replacement never makes recovery depend on mixed
        # live AUTO/code bytes or execution of an unapproved backup module.
        p.need(p.digest(self.fs.read(p.FILES['custodian.py']))==p.PIPELINE_CUSTODIAN,'pipeline_codec_scope')
    def validate_release_binaries(self,contents,m,directory):
        self.base.binaries(contents,m,directory)
    def import_release(self,contents,m,directory):
        p=self.p;path=directory+'/source.bundle'
        p.need(p.digest(contents['source.bundle'])==m['sourceBundleSha256'],'source_bundle_digest')
        self.fs.write(path,contents['source.bundle'],0o444)
        with self.fs.source_bundle_fd(str(self.fs.path(path)),m['sourceBundleSha256']) as fd:
            self.git(['fetch','--no-tags','/proc/self/fd/'+str(fd),m['sourceSha']],pass_fds=(fd,))
        p.need(self.git(['rev-parse',m['sourceSha']+'^{tree}']).strip()==m['sourceTree'],'source_tree')
    def authority_updates(self,contents,m,identity):
        p=self.p
        # This runs only after independent admission in a future installed v2
        # entry; local tests provide synthetic root state, never production.
        site=self.fs.read(p.SITE)
        p.need(p.parse(site)=={'version':2,'evidence':'site-content-verification','origin':'https://aktau.market',
            'representations':['product_ru','product_kk','sitemap','catalog','dashboard','category']},'site_policy_changed')
        authority={'version':1,'approved':True,'sourceSha':m['sourceSha'],'binarySha256':m['files']['c2projection'],
            'clockSha256':m['files']['relayprobe'],'buildId':identity,'platform':'linux/amd64'}
        automatic={'version':2,'enabled':True,'sourceSha':m['sourceSha'],'sitePolicySha256':p.digest(site),
            'files':{target:m['files'][name] for name,target in p.FILES.items()}}
        return {**{target:contents[name] for name,target in p.FILES.items()},p.AUTH:p.canonical(authority),p.AUTO:p.canonical(automatic)}
    def child_absent(self,c):
        if c is None:return True
        from pathlib import Path
        boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip()
        if boot!=c['bootId']:return True
        try:
            fields=Path('/proc/'+str(c['pid'])+'/stat').read_text().rsplit(') ',1)[1].split()
        except FileNotFoundError:return not self.p.group_active(c['pid'])
        if int(fields[19])!=c['startTicks']:return not self.p.group_active(c['pid'])
        return fields[0]=='Z' and not self.p.group_active(c['pid'])
    def _child(self,argv,pass_fds=()):
        import selectors,signal,time
        from pathlib import Path
        p=self.p;p.need(self.engine is not None and self.engine.j is not None,'pipeline_child_journal')
        gate_r,gate_w=os.pipe2(os.O_CLOEXEC);out_r,out_w=os.pipe2(os.O_CLOEXEC)
        pid=os.fork()
        if pid==0:
            try:
                os.close(gate_w);os.close(out_r);os.setsid()
                if os.read(gate_r,1)!=b'G':os._exit(125)
                os.close(gate_r);os.dup2(out_w,1);os.close(out_w)
                null=os.open('/dev/null',os.O_RDWR);os.dup2(null,0);os.dup2(null,2);os.close(null)
                for fd in pass_fds:os.set_inheritable(fd,True)
                os.execve(argv[0],argv,{'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','GIT_CONFIG_NOSYSTEM':'1',
                    'GIT_CONFIG_GLOBAL':'/dev/null','GIT_NO_REPLACE_OBJECTS':'1','GIT_NO_LAZY_FETCH':'1'})
            except BaseException:os._exit(126)
        os.close(gate_r);os.close(out_w);complete=False;status=None;data=bytearray()
        try:
            fields=Path('/proc/'+str(pid)+'/stat').read_text().rsplit(') ',1)[1].split()
            record={'pid':pid,'startTicks':int(fields[19]),'bootId':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'operation':'source'}
            self.engine.j['child']=record
            # Do not run the phase fault hook while writing a child barrier.
            raw=p.canonical(self.engine.j);self.engine.validate(self.engine.j)
            self.fs.write(p.INTERLOCK,raw,replace=True)
            os.write(gate_w,b'G');os.close(gate_w);gate_w=None;end=time.monotonic()+20
            with selectors.DefaultSelector() as selector:
                selector.register(out_r,selectors.EVENT_READ)
                while True:
                    remaining=end-time.monotonic();p.need(remaining>0 and selector.select(remaining),'pipeline_child_timeout')
                    chunk=os.read(out_r,min(65536,(2<<20)+1-len(data)))
                    if not chunk:break
                    data.extend(chunk);p.need(len(data)<=2<<20,'pipeline_child_capacity')
            while status is None:
                found,value=os.waitpid(pid,os.WNOHANG)
                if found:status=value;break
                p.need(time.monotonic()<end,'pipeline_child_timeout')
                time.sleep(.01)
            p.need(os.waitstatus_to_exitcode(status)==0,'pipeline_child_failed')
            p.need(not p.group_active(pid),'pipeline_child_cleanup_unverified');complete=True
        finally:
            if gate_w is not None:os.close(gate_w)
            os.close(out_r)
            if not complete:
                for sig in [signal.SIGTERM,signal.SIGKILL]:
                    try:os.killpg(pid,sig)
                    except ProcessLookupError:
                        try:os.kill(pid,sig)
                        except ProcessLookupError:pass
                until=time.monotonic()+2
                while status is None and time.monotonic()<until:
                    try:
                        found,value=os.waitpid(pid,os.WNOHANG)
                        if found:status=value;break
                    except ChildProcessError:status=0;break
                    time.sleep(.01)
                # Unknown live/D-state children retain the durable interlock.
                p.need(status is not None and not p.group_active(pid),'pipeline_child_cleanup_unverified')
            self.engine.j['child']=None
            self.fs.write(p.INTERLOCK,p.canonical(self.engine.j),replace=True)
        return bytes(data)


def systemd_host_namespace():
    """Root boot mode only. PID1 opens its own fixed namespace via OpenFile=.

    No caller path/FD option, no approval inferred from environment variables.
    The installed unit is independently pinned; the restricted SSH entry cannot
    invoke this root-only CLI mode. Validate the actual kernel namespace handle.
    """
    need(os.getuid()==os.geteuid()==0 and os.environ.get('LISTEN_PID')==str(os.getpid())
        and os.environ.get('LISTEN_FDS')=='1' and os.environ.get('LISTEN_FDNAMES')=='host-mount','pipeline_manager_fd')
    st=os.fstat(3)
    need(fcntl.ioctl(3,0xb703)==0x00020000 and stat.S_ISREG(st.st_mode)
        and fcntl.fcntl(3,fcntl.F_GETFL)&os.O_ACCMODE==os.O_RDONLY,'pipeline_manager_namespace')
    current=os.stat('/proc/self/ns/mnt')
    need((st.st_dev,st.st_ino)==(current.st_dev,current.st_ino),'pipeline_manager_namespace')
    fd=fcntl.fcntl(3,fcntl.F_DUPFD_CLOEXEC,16);os.close(3)
    for key in ['LISTEN_PID','LISTEN_FDS','LISTEN_FDNAMES']:os.environ.pop(key,None)
    return fd


def _enrolled_underlying_target(p,fs,st,parent):
    """The one operator-owned underlying inode authenticated by root enrollment.

    This is DATA custody, never capsule/root-parent custody. There is no caller
    approval flag or path override. Unenrolled 0775, any other writable mode,
    changed inode/owner/parent or invalid consumed authority remains rejected.
    """
    actor=(fs.uid,fs.gid) if fs.sandbox else (pwd.getpwnam('aktau-sync').pw_uid,pwd.getpwnam('aktau-sync').pw_gid)
    if (not fs.sandbox and actor[0]<=0) or not stat.S_ISDIR(st.st_mode) or stat.S_IMODE(st.st_mode)!=0o775 or (st.st_uid,st.st_gid)!=actor:
        return False
    try:
        policy=p.parse(fs.read(p.POLICY));p.validate_policy(policy)
        if policy['version']!=2:return False
        receipt=p.require_enrollment(p,fs,policy)
        return (list(p.stamp(st))[:6]==receipt['underlyingTargetIdentity']
            and list(p.stamp(parent))[:6]==receipt['targetParentIdentity'])
    except (p.Blocked,OSError,ValueError,TypeError,KeyError):
        # The caller emits the explicit fail-closed mount-custody error.
        return False


def _enrolled_underlying_inputs(p,fs,sel,expected_root):
    """Read-only OLD data exceptions, never executable/root-path admission.

    Only the exact consumed 0775 baseline may inspect its original actor-group
    writable tracked files, including unchanged originals under the exact PR86
    new tree. Current selected Git blob verification remains mandatory. The raw
    record is root-private, independently digest-approved, and inode-specific.
    """
    try:
        if (type(sel.get('sourceSha'))is not str or not p.SHA.fullmatch(sel['sourceSha']) or sel.get('pipelineTreeSha1') not in [p.PIPELINE_OLD_TREE,p.PIPELINE_NEW_TREE] or expected_root is None):return {}
        policy=p.parse(fs.read(p.POLICY));p.validate_policy(policy)
        if policy['version']!=2:return {}
        receipt=p.require_enrollment(p,fs,policy)
        if receipt['underlyingTargetIdentity']!=expected_root or stat.S_IMODE(expected_root[2])!=0o775:return {}
        if sel['pipelineTreeSha1']==p.PIPELINE_OLD_TREE and sel.get('inventorySha256')!=receipt['generation']:return {}
        raw=fs.read(p.BASE+'/pr86-bootstrap-input/old-input-inventory.json',2<<20)
        if p.digest(raw)!=policy['pipelineContract']['baselineInputInventorySha256']:return {}
        inv=p.parse(raw)
        if (type(inv)is not dict or set(inv)!={'version','kind','sourceSha','pipelineTreeSha1','rootIdentity','entries'}
            or type(inv['version'])is not int or inv['version']!=1 or inv['kind']!='legacy-input-observed-not-authorized'
            or inv['sourceSha']!=p.PIPELINE_OLD_SOURCE or inv['pipelineTreeSha1']!=p.PIPELINE_OLD_TREE
            or type(inv['rootIdentity'])is not list or inv['rootIdentity'][:6]!=expected_root
            or type(inv['entries'])is not list or len(inv['entries'])>8192):return {}
        out={}
        for row in inv['entries']:
            if type(row)is not list or len(row)!=3 or type(row[0])is not str:return {}
            p.pipeline_path(row[0])
            if row[0] in out or type(row[1])is not list or len(row[1])!=9 or any(type(n)is not int or n<0 for n in row[1]):return {}
            out[row[0]]=row
        return out
    except (p.Blocked,OSError,ValueError,TypeError,KeyError):return {}


class LinuxMounts:
    """Fixed Linux mount domain. Only root inside the intended mount namespace.

    fs.sandbox is Python-only test plumbing, never a CLI or environment setting.
    Unknown/EBUSY mounts are not retried, forced or lazily detached.
    """
    def __init__(self,p,fs,namespace_fd=None):
        import ctypes
        self.p,self.fs=p,fs
        p.need(os.getuid()==os.geteuid()==0,'pipeline_mount_root')
        self.libc=ctypes.CDLL(None,use_errno=True)
        self.libc.mount.argtypes=[ctypes.c_char_p,ctypes.c_char_p,ctypes.c_char_p,ctypes.c_ulong,ctypes.c_void_p]
        self.libc.mount.restype=ctypes.c_int
        self.libc.umount2.argtypes=[ctypes.c_char_p,ctypes.c_int];self.libc.umount2.restype=ctypes.c_int
        from pathlib import Path
        self.namespace=os.readlink('/proc/self/ns/mnt')
        if namespace_fd is None:
            try:manager=os.readlink('/proc/1/ns/mnt')
            except PermissionError:
                record=p.parse(fs.read(p.PIPELINE_MOUNT_RECORD,16384))
                from pathlib import Path
                p.need(type(record) is dict and set(record)=={'version','bootId','mountNamespaceInode','mountId',
                    'selectionSha256','mountedRootDev','mountedRootInode','inventorySha256'}
                    and type(record['version']) is int and record['version']==1
                    and type(record['mountNamespaceInode']) is int
                    and record['bootId']==Path('/proc/sys/kernel/random/boot_id').read_text().strip()
                    and record['mountNamespaceInode']==os.stat('/proc/self/ns/mnt').st_ino
                    and stat.S_IMODE(os.lstat(fs.path(p.PIPELINE_MOUNT_RECORD)).st_mode)==0o444,
                    'pipeline_manager_attestation')
                manager=self.namespace
            p.need(self.namespace==manager,'pipeline_mount_namespace')
        else:
            p.need(type(namespace_fd) is int and namespace_fd>=16 and fcntl.ioctl(namespace_fd,0xb703)==0x00020000
                and (os.fstat(namespace_fd).st_dev,os.fstat(namespace_fd).st_ino)==
                    (os.stat('/proc/self/ns/mnt').st_dev,os.stat('/proc/self/ns/mnt').st_ino),'pipeline_mount_namespace')
        self.stage=None;self.generations=set();self._underlying=None
    def _path(self,path):return os.fsencode(self.fs.path(path))
    def _mount(self,source,target,flags):
        import ctypes
        self.p.need(os.readlink('/proc/self/ns/mnt')==self.namespace,'pipeline_mount_namespace')
        # The checkout is operator-owned. Never let mount(2) resolve its path
        # (including a last-moment symlink) with root authority. Root/admin is
        # trusted; ordinary actors may replace names despite advisory locks.
        import contextlib
        with contextlib.ExitStack() as stack:
            def pinned(path):
                allowed=(path==self.p.PUBLISHER+'/pipeline' or
                    re.fullmatch(re.escape(self.p.BASE)+r'/mounts/[a-z0-9_-]{1,80}',path) or
                    re.fullmatch(re.escape(self.p.BASE)+r'/capsules/[a-f0-9]{64}/pipeline',path))
                self.p.need(bool(allowed),'pipeline_mount_path')
                fd=os.open(self.fs.sandbox or '/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC)
                stack.callback(os.close,fd)
                logical=''
                account=None if self.fs.sandbox else pwd.getpwnam('aktau-sync')
                actor=(self.fs.uid,self.fs.gid) if account is None else (account.pw_uid,account.pw_gid)
                for part in path.strip('/').split('/'):
                    logical+='/'+part
                    parent_st=os.fstat(fd)
                    nxt=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=fd)
                    stack.callback(os.close,nxt);fd=nxt;st=os.fstat(fd)
                    owners=[(self.fs.uid,self.fs.gid),actor] if logical in [self.p.PUBLISHER,self.p.PUBLISHER+'/pipeline'] else [(self.fs.uid,self.fs.gid)]
                    custody=(not st.st_mode&0o022 or logical==self.p.PUBLISHER+'/pipeline'
                        and _enrolled_underlying_target(self.p,self.fs,st,parent_st))
                    self.p.need((st.st_uid,st.st_gid) in owners and custody and not os.listxattr(fd),'pipeline_mount_custody')
                return os.fsencode('/proc/self/fd/'+str(fd))
            src=None if source is None else pinned(source)
            dst=pinned(target)
            result=self.libc.mount(src,dst,None,flags,None)
            self.p.need(result==0,'pipeline_mount_syscall')
    def _unmount(self,path):
        self.p.need(os.readlink('/proc/self/ns/mnt')==self.namespace,'pipeline_mount_namespace')
        self.p.need(self.libc.umount2(self._path(path),0)==0,'pipeline_unmount_unknown_or_busy')
    def _record(self,path):
        from pathlib import Path
        exact=str(self.fs.path(path));found=[]
        for line in Path('/proc/self/mountinfo').read_text().splitlines():
            fields=line.split();point=fields[4]
            self.p.need('\\' not in exact,'pipeline_mount_path')
            if point==exact:found.append(fields)
            elif point.startswith(exact+'/'):raise self.p.Blocked('pipeline_nested_mount')
        self.p.need(len(found)<=1,'pipeline_stacked_mount')
        if not found:return None
        fields=found[0]
        self.p.need({'ro','nosuid','nodev'}<=set(fields[5].split(',')),'pipeline_mount_flags')
        return {'mountId':int(fields[0]),'namespace':self.namespace,'rootIdentity':list(self.p.stamp(os.lstat(self.fs.path(path))))[:6]}
    def _root(self,g):
        self.p.need(type(g) is str and self.p.HEX.fullmatch(g),'pipeline_generation')
        self.p.PipelineStore(self.fs).verify(g)
        return self.p.BASE+'/capsules/'+g+'/pipeline'
    def parent_identity(self):
        return list(self.p.stamp(os.lstat(self.fs.path(self.p.PUBLISHER))))[:6]
    def underlying_identity(self):
        # Caller must capture the underlying target before it is first mounted
        # at independently authorized baseline enrollment. Never guess hidden
        # checkout inode from the visible mounted graph.
        if self._underlying is not None:return self._underlying
        if self._record(self.p.PUBLISHER+'/pipeline') is not None:
            policy=self.p.parse(self.fs.read(self.p.POLICY))
            receipt=require_enrollment(self.p,self.fs,policy)
            self.p.need(self.parent_identity()==receipt['targetParentIdentity'],'pipeline_underlying_parent_changed')
            sel=selection(self.p,self.fs.read(self.p.PIPELINE_SELECTION,16384))
            host=TrackedHost(self.p,self.fs)
            self.p.need(private_underlying(self.p,self.fs,host,self,sel,
                expected_root=receipt['underlyingTargetIdentity']) is True,'pipeline_underlying_not_verified')
            self._underlying=receipt['underlyingTargetIdentity']
        else:
            self._underlying=list(self.p.stamp(os.lstat(self.fs.path(self.p.PUBLISHER+'/pipeline'))))[:6]
        return self._underlying
    def inspect(self):
        target=self.p.PUBLISHER+'/pipeline';record=self._record(target)
        if record is None:return {'state':'absent','namespace':self.namespace}
        # Resolve only a root-controlled committed selection, never argv/env.
        raw=self.fs.read(self.p.PIPELINE_SELECTION,16384);sel=selection(self.p,raw);g=sel['inventorySha256']
        self.generations.add(g)
        matches=[v for v in self.generations if list(self.p.stamp(os.lstat(self.fs.path(self._root(v)))))[:6]==record['rootIdentity']]
        self.p.need(len(matches)==1,'pipeline_mount_generation')
        return {**record,'state':'mounted','generation':matches[0]}
    def generation(self):return self.inspect().get('generation')
    def prepare(self,g,identity,register=lambda _:None):
        self.p.need(re.fullmatch(r'[a-z0-9_-]{1,80}',identity),'pipeline_mount_identity')
        self.generations.add(g)
        path=self.p.BASE+'/mounts/'+identity
        self.p.need(not os.path.lexists(self.fs.path(path)),'pipeline_orphan_mount_stage')
        self.fs.mkdir(path);self.stage=path
        register(list(self.p.stamp(os.lstat(self.fs.path(path))))[:6])
        self._mount(self._root(g),path,4096)                    # MS_BIND
        self._mount(None,path,4096|32|1|2|4)                   # BIND,REMOUNT,RO,NOSUID,NODEV
        self._mount(None,path,1<<18)                          # MS_PRIVATE
        record=self._record(path)
        self.p.need(record is not None,'pipeline_mount_readback')
        return {**record,'generation':g,'stage':path}
    def detach(self,expected):
        self.p.need(self.inspect()==expected,'pipeline_mount_changed')
        if expected['state']=='mounted':self._unmount(self.p.PUBLISHER+'/pipeline')
        if self._underlying is not None:
            self.p.need(list(self.p.stamp(os.lstat(self.fs.path(self.p.PUBLISHER+'/pipeline'))))[:6]==self._underlying,'pipeline_underlying_changed')
    def attach(self,prepared):
        self.p.need(set(prepared)=={'mountId','namespace','rootIdentity','generation','stage'}
            and prepared['stage']==self.stage and self._record(self.stage)=={k:prepared[k] for k in ['mountId','namespace','rootIdentity']},'pipeline_prepared_mount')
        self._mount(self.stage,self.p.PUBLISHER+'/pipeline',8192) # MS_MOVE
        record=self._record(self.p.PUBLISHER+'/pipeline')
        self.p.need(record is not None and record['rootIdentity']==prepared['rootIdentity'],'pipeline_mount_readback')
    def classify(self,record,resources=None):
        if resources is not None:
            for key,stampkey in [('mountStage','mountStageIdentity'),('rollbackMountStage','rollbackMountStageIdentity')]:
                path=resources[key]
                if not os.path.lexists(self.fs.path(path)):
                    self.p.need(resources[stampkey] is None,'pipeline_missing_mount_stage');continue
                observed=self._record(path)
                self.p.need(resources[stampkey] is not None,'pipeline_unknown_mount_stage')
                if observed is None:
                    self.p.need(list(self.p.stamp(os.lstat(self.fs.path(path))))[:6]==resources[stampkey]
                        and not os.listdir(self.fs.path(path)),'pipeline_mount_stage_changed')
                else:
                    prepared=record['mountPrepared']
                    self.p.need(key=='mountStage' and prepared is not None and path==prepared['stage']
                        and observed=={k:prepared[k] for k in ['mountId','namespace','rootIdentity']},'pipeline_unknown_prepared_mount')
        current=self._record(self.p.PUBLISHER+'/pipeline')
        if current is None:return 'absent'
        matches=[]
        for key in ['oldGeneration','newGeneration']:
            st=list(self.p.stamp(os.lstat(self.fs.path(self._root(record[key])))))[:6]
            # Recovery is a fresh process: classify only sealed generations
            # named in the validated durable journal, not an in-memory cache.
            self.generations.add(record[key])
            if current['rootIdentity']==st:matches.append(key)
        self.p.need(len(matches)==1,'pipeline_unknown_mount');return matches[0]
    def detach_known(self,record,resources=None):
        if self.classify(record,resources)!='absent':self._unmount(self.p.PUBLISHER+'/pipeline')
    def restore(self,record,register=lambda _:None):
        g=record['oldGeneration'];prepared=self.prepare(g,'rollback-'+g[:16],register);self.attach(prepared)


def require_enrollment(p,fs,policy):
    """Read independent admin authorization + completed bootstrap; never mint it."""
    import datetime
    c=policy['pipelineContract'];path='/etc/aktau-sync-promotion/pr86-baseline-approval.json'
    raw=fs.read(path,16384);a=p.parse(raw)
    fixed={'version':1,'purpose':'pr86-baseline-enrollment','sourceSha':p.PIPELINE_OLD_SOURCE,
        'pipelineTreeSha1':p.PIPELINE_OLD_TREE,'packageBlobSha1':p.PIPELINE_OLD_PACKAGE,'lockBlobSha1':p.PIPELINE_OLD_LOCK,
        'legacyInputInventorySha256':c['baselineInputInventorySha256'],'oldRuntimeInventorySha256':c['baselineRuntimeInventorySha256'],
        'nodeSha256':p.PIPELINE_NODE,'pnpmTarSha256':p.PIPELINE_PNPM,
        'oldExecutorSha256':'d69c667212b2a6c8a25081ccdc90f798024e850784262976e06e45ce13f45118',
        'oldPolicySha256':'2bf672f1626252f107447552493ad982999d3d7f444f000394a7006d952ddb8b',
        'newPolicySha256':p.digest(p.canonical(policy))}
    p.need(type(a) is dict and set(a)==set(fixed)|{'approvalId','reviewedRootBundleSha256','notBefore','expiresAt'}
        and type(a['version']) is int and all(a[k]==v for k,v in fixed.items())
        and type(a['approvalId']) is str and re.fullmatch(r'[a-f0-9]{32}',a['approvalId'])
        and p.HEX.fullmatch(a['reviewedRootBundleSha256']),'pipeline_baseline_authority')
    times=[]
    for key in ['notBefore','expiresAt']:
        p.need(type(a[key]) is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z',a[key]),'pipeline_baseline_time')
        times.append(datetime.datetime.fromisoformat(a[key].replace('Z','+00:00')).timestamp()*1000)
    p.need(0<times[1]-times[0]<=3600000,'pipeline_baseline_time')
    prefix=p.BASE+'/state/pr86-baseline-';consumed=p.parse(fs.read(prefix+'consumed-'+a['approvalId']+'.json',16384))
    p.need(type(consumed) is dict and set(consumed)=={'version','approvalSha256','usedAt'} and type(consumed['version']) is int
        and consumed['version']==1 and consumed['approvalSha256']==p.digest(raw) and type(consumed['usedAt']) is int
        and times[0]<=consumed['usedAt']<times[1],'pipeline_baseline_consumption')
    receipt=p.parse(fs.read(prefix+'enrolled-'+a['approvalId']+'.json',16384))
    p.need(type(receipt) is dict and set(receipt)=={'version','approvalSha256','policySha256','outcome','generation',
        'targetParentIdentity','underlyingTargetIdentity','legacyReleaseIdentity','legacyReceiptName','legacyReceiptSha256'} and type(receipt['version']) is int and receipt['version']==1
        and receipt['approvalSha256']==p.digest(raw) and receipt['policySha256']==fixed['newPolicySha256']
        and receipt['outcome']=='BASELINE_ENROLLED' and receipt['generation']==c['baselineRuntimeInventorySha256']
        and all(type(receipt[k]) is list and len(receipt[k])==6 and all(type(n) is int and n>=0 for n in receipt[k])
            for k in ['targetParentIdentity','underlyingTargetIdentity']),'pipeline_baseline_receipt')
    p.need(type(receipt['legacyReleaseIdentity']) is str and re.fullmatch(r'[a-z0-9_-]{1,80}',receipt['legacyReleaseIdentity'])
        and receipt['legacyReceiptName'] in ['receipt.json','rollback.json'] and type(receipt['legacyReceiptSha256']) is str
        and p.HEX.fullmatch(receipt['legacyReceiptSha256']),'pipeline_baseline_legacy_binding')
    legacy_path=p.BASE+'/releases/'+receipt['legacyReleaseIdentity']+'/'+receipt['legacyReceiptName']
    legacy_raw=fs.read(legacy_path,65536);legacy=p.parse(legacy_raw)
    side='oldPublisher' if receipt['legacyReceiptName']=='rollback.json' else 'newPublisher'
    p.need(p.digest(legacy_raw)==receipt['legacyReceiptSha256'] and type(legacy) is dict
        and type(legacy.get('version')) is int and legacy['version']==1 and legacy.get('identity')==receipt['legacyReleaseIdentity']
        and legacy.get('directory')==p.BASE+'/releases/'+receipt['legacyReleaseIdentity']
        and legacy.get('phase')==('rolled_back' if side=='oldPublisher' else 'committed')
        and type(legacy.get(side)) is dict and legacy[side].get('sha')==p.PIPELINE_OLD_SOURCE
        and set(legacy.get('targets',{}))==set(p.FILES.values())|set(p.RECORDS),'pipeline_baseline_legacy_binding')
    p.PipelineStore(fs).verify(receipt['generation'])
    return receipt


def legacy_input_inventory(p,fs,host,reference):
    """Read-only OLD capture, never authorization or adoption of node_modules.

    The future fixed bootstrap must supply an independently verified public
    OLD reference. No CLI path/reference/approval override is exposed here.
    Unknown/private paths are rejected without reading their bytes.
    """
    p.need(host.publisher()['sha']==p.PIPELINE_OLD_SOURCE,'pipeline_capture_source')
    for name,want in [('pipeline',p.PIPELINE_OLD_TREE),('pipeline/package.json',p.PIPELINE_OLD_PACKAGE),('pipeline/pnpm-lock.yaml',p.PIPELINE_OLD_LOCK)]:
        p.need(host.git(['rev-parse',p.PIPELINE_OLD_SOURCE+':'+name]).strip()==want,'pipeline_capture_source')
    inventory,blobs=p.pipeline_capsule(reference);rows=inventory['entries'];nodes={r['path']:r for r in rows}
    for path,want in [('package.json',p.PIPELINE_OLD_PACKAGE),('pnpm-lock.yaml',p.PIPELINE_OLD_LOCK)]:
        data=p.pipeline_blob(path,rows,blobs)
        p.need(hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==want,'pipeline_capture_reference')
    target=fs.path(p.PUBLISHER+'/pipeline')
    for line in pathlib.Path('/proc/self/mountinfo').read_text().splitlines():
        point=line.split()[4]
        p.need(point!=str(target) and not point.startswith(str(target)+'/'),'pipeline_capture_already_mounted')
    actor=pwd.getpwnam('aktau-sync') if not fs.sandbox else None
    pairs={(fs.uid,fs.gid),((actor.pw_uid,actor.pw_gid) if actor else (fs.uid,fs.gid))}
    anchors=contextlib.ExitStack();pins=[]
    try:
        parent=os.open(fs.sandbox or '/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC);anchors.callback(os.close,parent)
        logical_path=''
        for part in (p.PUBLISHER+'/pipeline').strip('/').split('/'):
            logical_path+='/'+part
            child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=parent);anchors.callback(os.close,child)
            st=os.fstat(child);owners=pairs if logical_path in [p.PUBLISHER,p.PUBLISHER+'/pipeline'] else {(fs.uid,fs.gid)}
            p.need((st.st_uid,st.st_gid) in owners and not st.st_mode&0o022 and not os.listxattr(child),'pipeline_capture_parent')
            pins.append((parent,part,child,list(p.stamp(st))[:6]));parent=child
        fd=parent
    except BaseException:anchors.close();raise
    observed=[];seen=set();logical=0;mismatches=0;aliases=0
    def walk(parent,relative):
        nonlocal logical,mismatches,aliases
        original=p.stamp(os.fstat(parent));st=os.fstat(parent)
        p.need((st.st_uid,st.st_gid) in pairs and not st.st_mode&0o022 and not os.listxattr(parent),'pipeline_capture_custody')
        with os.scandir(parent) as entries:
            for entry in entries:
                path=relative+'/'+entry.name if relative else entry.name
                p.need(path in nodes and len(seen)<20480,'pipeline_capture_unknown_path')
                row=nodes[path];st=os.stat(entry.name,dir_fd=parent,follow_symlinks=False)
                p.need((st.st_uid,st.st_gid) in pairs,'pipeline_capture_custody');seen.add(path)
                if row['type']=='dir':
                    p.need(stat.S_ISDIR(st.st_mode),'pipeline_capture_type')
                    child=os.open(entry.name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=parent)
                    try:
                        p.need(p.stamp(os.fstat(child))==p.stamp(st),'pipeline_capture_changed');walk(child,path)
                        p.need(p.stamp(os.fstat(child))==p.stamp(os.stat(entry.name,dir_fd=parent,follow_symlinks=False)),'pipeline_capture_changed')
                    finally:os.close(child)
                    observed.append([path,list(p.stamp(st)),None])
                elif row['type']=='symlink':
                    p.need(stat.S_ISLNK(st.st_mode) and st.st_nlink==1 and not os.listxattr('/proc/self/fd/'+str(parent)+'/'+entry.name,follow_symlinks=False),'pipeline_capture_type')
                    link=os.readlink(entry.name,dir_fd=parent);p.need(link==row['target'],'pipeline_capture_link')
                    p.need(p.stamp(st)==p.stamp(os.stat(entry.name,dir_fd=parent,follow_symlinks=False)),'pipeline_capture_changed')
                    observed.append([path,list(p.stamp(st)),link])
                else:
                    p.need(stat.S_ISREG(st.st_mode) and stat.S_IMODE(st.st_mode) in [0o444,0o555,0o644,0o755]
                        and 0<=st.st_size<=16<<20,'pipeline_capture_type')
                    child=os.open(entry.name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=parent)
                    try:
                        p.need(not os.listxattr(child) and p.stamp(os.fstat(child))==p.stamp(st),'pipeline_capture_custody')
                        h=hashlib.sha256();size=0
                        while data:=os.read(child,65536):
                            size+=len(data);logical+=len(data);p.need(size<=16<<20 and logical<=90<<20,'pipeline_capture_capacity');h.update(data)
                        value=h.hexdigest();p.need(size==st.st_size and p.stamp(st)==p.stamp(os.fstat(child))
                            ==p.stamp(os.stat(entry.name,dir_fd=parent,follow_symlinks=False)),'pipeline_capture_changed')
                        mismatches+=int(size!=row['size'] or value!=row['sha256']);aliases+=int(st.st_nlink!=1)
                        observed.append([path,list(p.stamp(st)),value])
                    finally:os.close(child)
        p.need(p.stamp(os.fstat(parent))==original,'pipeline_capture_changed')
    try:
        initial=p.stamp(os.fstat(fd));walk(fd,'')
        p.need(p.stamp(os.fstat(fd))==initial==p.stamp(os.stat(target,follow_symlinks=False)) and seen==set(nodes),'pipeline_capture_changed')
        for parent,name,child,original in pins:
            p.need(list(p.stamp(os.fstat(child)))[:6]==original==list(p.stamp(os.stat(name,dir_fd=parent,follow_symlinks=False)))[:6],'pipeline_capture_parent_changed')
    finally:anchors.close()
    observed.sort(key=lambda row:row[0].encode())
    value={'version':1,'kind':'legacy-input-observed-not-authorized','sourceSha':p.PIPELINE_OLD_SOURCE,
        'pipelineTreeSha1':p.PIPELINE_OLD_TREE,'rootIdentity':list(initial),'entries':observed}
    raw=p.canonical(value);p.need(len(raw)<=2<<20,'pipeline_capture_capacity')
    return {'status':'LEGACY_DEPENDENCY_INPUT_NOT_AUTHORIZED','inventorySha256':p.digest(raw),'entryCount':len(observed),
        'referenceMismatches':mismatches,'aliasedFiles':aliases,'inventory':value}


def reject_unknown_pending(p,fs,current=None):
    """Never infer completion from a missing name when an atomic write tore.

    No deletion/reuse. Only finite root-owned control/target parents are read;
    unrelated resources remain untouched for explicit reconciliation.
    """
    parents={p.BASE,p.BASE+'/state',os.path.dirname(p.PIPELINE_SELECTION),os.path.dirname(p.PIPELINE_MOUNT_RECORD),
        *[os.path.dirname(v) for v in [*p.FILES.values(),*p.RECORDS]]}
    if current is not None:
        p.need(re.fullmatch(r'[a-z0-9_-]{1,80}',current),'pipeline_release')
        parents|={p.BASE+'/releases/'+current,p.BASE+'/releases/'+current+'/backup'}
    for parent in parents:
        if not os.path.lexists(fs.path(parent)):continue
        fd=fs.directory(parent)
        try:
            with os.scandir(fd) as entries:
                for count,entry in enumerate(entries,1):
                    p.need(count<=4096,'pipeline_parent_capacity')
                    p.need(not entry.name.endswith('.pending'),'pipeline_unknown_pending_write')
        finally:os.close(fd)


def release_inventory_v2(p,fs,current=None):
    """Read v1 history unchanged; dispatch v2 by exact version and fixed paths."""
    parent=fs.directory(p.BASE+'/releases')
    try:names=os.listdir(parent);p.need(len(names)<=1000,'release_inventory_capacity')
    finally:os.close(parent)
    for name in names:
        p.need(re.fullmatch(r'[a-z0-9_-]{1,80}',name),'unknown_release_stage')
        directory=p.BASE+'/releases/'+name;fd=fs.directory(directory)
        try:entries=set(os.listdir(fd))
        finally:os.close(fd)
        # The current interlocked transaction is classified separately, but an
        # unregistered extra resource is never ignored during recovery.
        allowed=set(p.FILES)|{'source.bundle','promotion.json','backup','receipt.json','rollback.json'}
        v2allowed=allowed|{'pipeline-runtime.json','pipeline-runtime.tar','provenance.json','old-selection.json','new-selection.json'}
        if name==current:
            p.need(entries<=v2allowed,'pipeline_unknown_release_resource');continue
        terminal='rollback.json' if 'rollback.json' in entries else 'receipt.json'
        p.need(terminal in entries,'orphan_release_stage')
        record=p.parse(fs.read(directory+'/'+terminal,65536))
        p.need(type(record) is dict and type(record.get('version')) is int and record['version'] in [1,2]
            and record.get('identity')==name and record.get('directory')==directory
            and record.get('phase')==('rolled_back' if terminal=='rollback.json' else 'committed'),'unknown_release_receipt')
        if record['version']==1:
            p.need(entries<=allowed and set(record.get('targets',{}))==set(p.FILES.values())|set(p.RECORDS),'unknown_release_resource')
            targets=record['targets']
        else:
            TransactionV2(p,fs,None,None).validate(record)
            p.need(entries<=v2allowed and (set(p.FILES)|{'source.bundle','promotion.json','backup','pipeline-runtime.json',
                'pipeline-runtime.tar','provenance.json','old-selection.json','new-selection.json'})<=entries,'unknown_release_resource')
            targets=record['c2Targets']
            for file,path in record['resources']['payloadFiles'].items():
                p.need(p.digest(fs.read(path,p.MAX_TAR))==targets[p.FILES[file]]['newHash'],'pipeline_retained_payload')
        backup=fs.directory(directory+'/backup')
        try:p.need(set(os.listdir(backup))=={str(i) for i in range(14)},'unknown_backup_resource')
        finally:os.close(backup)
        for i,(target,item) in enumerate(targets.items()):
            p.need(item.get('backup')==directory+'/backup/'+str(i) and type(item.get('oldHash')) is str
                and p.HEX.fullmatch(item['oldHash']) and p.digest(fs.read(item['backup'],p.MAX_TAR))==item['oldHash'],
                'pipeline_backup_hash')


def enrolled_baseline_context(p,fs):
    policy=p.parse(fs.read(p.POLICY));p.validate_policy(policy);p.need(policy['version']==2,'pipeline_policy_required')
    enrolled=require_enrollment(p,fs,policy)
    last=p.parse(fs.read(p.BASE+'/state/last.json',16384));raw=fs.read(p.PIPELINE_SELECTION,16384);sel=selection(p,raw)
    p.need(last=={'identity':enrolled['legacyReleaseIdentity']}
        and sel['provenanceKind']=='legacy-installed-attested' and sel['sourceSha']==p.PIPELINE_OLD_SOURCE
        and sel['pipelineTreeSha1']==p.PIPELINE_OLD_TREE and sel['inventorySha256']==enrolled['generation'],
        'pipeline_baseline_selection')
    legacy=p.parse(fs.read(p.BASE+'/releases/'+enrolled['legacyReleaseIdentity']+'/'+enrolled['legacyReceiptName'],65536))
    side='oldHash' if enrolled['legacyReceiptName']=='rollback.json' else 'newHash'
    for target,item in legacy['targets'].items():
        p.need(p.digest(fs.read(target,p.MAX_TAR))==item[side],'pipeline_baseline_closure')
    return raw,sel,{'pipeline':{'underlyingTargetIdentity':enrolled['underlyingTargetIdentity'],
        'targetParentIdentity':enrolled['targetParentIdentity']}}


def tuple_record(p,fs):
    """Only a retained committed/rolled-back v2 receipt, never HEAD inference."""
    selected=fs.read(p.PIPELINE_SELECTION,16384);sel=selection(p,selected)
    last=p.parse(fs.read(p.BASE+'/state/last.json',16384))
    p.need(type(last) is dict and set(last)=={'version','identity'} and type(last['version']) is int and last['version']==2
        and type(last['identity']) is str and re.fullmatch(r'[a-z0-9_-]{1,80}',last['identity']),'pipeline_committed_receipt')
    directory=p.BASE+'/releases/'+last['identity']
    terminal='rollback.json' if os.path.lexists(fs.path(directory+'/rollback.json')) else 'receipt.json'
    j=p.parse(fs.read(directory+'/'+terminal,65536))
    TransactionV2(p,fs,None,None).validate(j)
    p.need(j['identity']==last['identity'] and j['phase']==('rolled_back' if terminal=='rollback.json' else 'committed'),'pipeline_committed_receipt')
    side='old' if terminal=='rollback.json' else 'new'
    p.need(p.digest(selected)==j['pipeline'][side+'SelectionHash'] and sel['sourceSha']==j[side+'Publisher']['sha']
        and sel['inventorySha256']==j['pipeline'][side+'Generation'],'pipeline_selection_receipt')
    for target,r in j['c2Targets'].items():p.need(p.digest(fs.read(target,p.MAX_TAR))==r[side+'Hash'],'pipeline_receipt_closure')
    seal=p.PipelineStore(fs).verify(sel['inventorySha256'])
    p.need(p.digest(p.canonical(seal))==j['pipeline'][side+'SealHash'],'pipeline_receipt_seal')
    if side=='new':
        p.need(p.digest(fs.read(j['resources']['descriptor'],16384))==sel['descriptorSha256'],'pipeline_descriptor_alignment')
        manifest=p.parse(fs.read(j['resources']['manifest'],16384));proof=p.parse(fs.read(j['resources']['provenance'],16384))
        p.need(type(manifest) is dict and manifest.get('version')==2 and type(manifest['version']) is int
            and manifest.get('sourceSha')==sel['sourceSha'] and type(proof) is dict and proof.get('sourceSha')==sel['sourceSha']
            and type(proof.get('artifactId')) is int and proof['artifactId']>0,'pipeline_receipt_provenance')
        for name,path in j['resources']['payloadFiles'].items():
            p.need(p.digest(fs.read(path,p.MAX_TAR))==j['c2Targets'][p.FILES[name]]['newHash'],'pipeline_retained_payload')
    return selected,sel,j


def attestation(p,fs,mounts,raw):
    from pathlib import Path
    sel=selection(p,raw);record=mounts.inspect()
    p.need(record.get('state')=='mounted' and record.get('generation')==sel['inventorySha256'],'pipeline_attest_mount')
    st=os.stat(fs.path(p.PUBLISHER+'/pipeline'),follow_symlinks=False)
    return {'version':1,'bootId':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
        'mountNamespaceInode':os.stat('/proc/self/ns/mnt').st_ino,'mountId':record['mountId'],
        'selectionSha256':p.digest(raw),'mountedRootDev':st.st_dev,'mountedRootInode':st.st_ino,
        'inventorySha256':sel['inventorySha256']}


def emit_attestation(p,fs,mounts,raw,allowed):
    path=p.PIPELINE_MOUNT_RECORD
    if os.path.lexists(fs.path(path)):
        old=p.parse(fs.read(path,16384))
        p.need(type(old) is dict and set(old)=={'version','bootId','mountNamespaceInode','mountId','selectionSha256',
            'mountedRootDev','mountedRootInode','inventorySha256'} and type(old['version']) is int and old['version']==1
            and old['selectionSha256'] in allowed,'pipeline_unknown_attestation')
    value=attestation(p,fs,mounts,raw)
    fs.write(path,p.canonical(value),0o444,replace=os.path.lexists(fs.path(path)))
    p.need(p.parse(fs.read(path,16384))==value,'pipeline_attestation_readback')
    return value


def mount_committed(p,fs,host,mounts):
    from pathlib import Path
    p.need(not os.path.lexists(fs.path(p.INTERLOCK)),'pending_promotion_recovery')
    last=p.parse(fs.read(p.BASE+'/state/last.json',16384))
    raw,sel,j=(enrolled_baseline_context(p,fs) if type(last) is dict and set(last)=={'identity'} else tuple_record(p,fs))
    p.need(mounts.parent_identity()==j['pipeline']['targetParentIdentity'],'pipeline_underlying_parent_changed')
    p.need(host.publisher()['sha']==sel['sourceSha'],'pipeline_source_alignment')
    # No fallback to HEAD or to an unbound legacy receipt.
    p.Host.verify_old_closure(host,p.parse(fs.read(p.POLICY)))
    current=mounts.inspect()
    if current['state']=='absent':
        p.need(mounts.underlying_identity()==j['pipeline']['underlyingTargetIdentity'],'pipeline_underlying_changed')
        boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip()
        identity='boot-'+boot.replace('-','')+'-'+p.digest(raw)[:16]
        intent=p.BASE+'/state/'+identity+'.json'
        value={'version':1,'phase':'intent','selectionSha256':p.digest(raw),'stage':p.BASE+'/mounts/'+identity,
            'bootId':boot,'namespace':mounts.namespace,'stageIdentity':None,'mountPrepared':None}
        fs.write(intent,p.canonical(value))
        def registered(st):
            p.need(value['stageIdentity'] is None,'pipeline_boot_registration')
            value['stageIdentity']=st;value['phase']='registered';fs.write(intent,p.canonical(value),replace=True)
        prepared=mounts.prepare(sel['inventorySha256'],identity,registered)
        value['mountPrepared']=prepared;value['phase']='prepared';fs.write(intent,p.canonical(value),replace=True)
        mounts.attach(prepared);value['phase']='mounted';fs.write(intent,p.canonical(value),replace=True)
    elif current.get('generation')!=sel['inventorySha256']:raise p.Blocked('pipeline_mount_changed')
    value=emit_attestation(p,fs,mounts,raw,[p.digest(raw)])
    return {'status':'PIPELINE_COMMITTED_MOUNT_READY','inventorySha256':value['inventorySha256']}


def verify_parity(p,fs,host,mounts):
    """Read-only source/runtime parity; never C2 convergence or DB-data parity."""
    try:
        p.need(not os.path.lexists(fs.path(p.INTERLOCK)),'pending_promotion_recovery')
        reject_unknown_pending(p,fs)
        raw,sel,j=tuple_record(p,fs)
        host.invariants() # validates reader metadata + existing ledger codec; never returns its payload
        p.need(host.publisher()['sha']==sel['sourceSha'],'pipeline_source_alignment')
        tree=host.git(['rev-parse',sel['sourceSha']+':pipeline']).strip()
        p.need(tree==sel['pipelineTreeSha1'],'pipeline_tree_alignment')
        p.Host.verify_old_closure(host,p.parse(fs.read(p.POLICY)))
        p.need(p.digest(fs.read(p.NODE,p.MAX_TAR))==p.PIPELINE_NODE,'pipeline_node_identity')
        inv=p.parse(fs.read(p.BASE+'/capsules/'+sel['inventorySha256']+'/inventory.json',2<<20));rows=inv['entries']
        # Seal verification already hashes each actual mounted-source file. A
        # graph version is never inferred solely from package.json labels.
        p.need(mounts.generation()==sel['inventorySha256'],'pipeline_mount_alignment')
        mounted=attestation(p,fs,mounts,raw)
        p.need(p.parse(fs.read(p.PIPELINE_MOUNT_RECORD,16384))==mounted,'pipeline_attestation_stale')
        underlying=private_underlying(p,fs,host,mounts,sel,expected_root=j['pipeline']['underlyingTargetIdentity'])
        if underlying is None:return {'status':'NOT_VERIFIED','reason':'underlying_namespace_unavailable'}
        p.need(underlying is True,'pipeline_underlying_not_verified')
        return {'status':'PRODUCTION_SOURCE_RUNTIME_ALIGNED','sourceSha':sel['sourceSha'],
            'pipelineTreeSha1':tree,'inventorySha256':sel['inventorySha256'],'closureCount':12,
            'underlyingTrackedCheckout':True,'readerLedgerCustody':True,'c2Acceptance':'NOT_MEASURED'}
    except (FileNotFoundError,PermissionError):return {'status':'NOT_VERIFIED','reason':'missing_control_evidence'}
    except p.Blocked:return {'status':'BLOCKED','reason':'source_runtime_mismatch'}


def private_underlying(p,fs,host,mounts,sel,expected_root=None):
    """Child-only private namespace. No subprocess or write in the child."""
    import ctypes,selectors,signal,time
    before=mounts.inspect();parent=os.readlink('/proc/self/ns/mnt')
    # Resolve immutable Git metadata in the bounded/reaped parent command path.
    rows=host.git(['ls-tree','-r','-z',sel['sourceSha'],'--','pipeline']).split('\0')
    enrolled_inputs=_enrolled_underlying_inputs(p,fs,sel,expected_root)
    rd,wr=os.pipe2(os.O_CLOEXEC);pid=os.fork()
    if pid==0:
        try:
            os.close(rd);os.unshare(0x00020000)
            p.need(os.readlink('/proc/self/ns/mnt')!=parent,'pipeline_child_namespace')
            p.need(mounts.libc.mount(None,b'/',None,(1<<18)|(1<<14),None)==0,'pipeline_child_private')
            p.need(mounts.libc.umount2(os.fsencode(fs.path(p.PUBLISHER+'/pipeline')),0)==0,'pipeline_child_unmount')
            if expected_root is not None:
                p.need(list(p.stamp(os.stat(fs.path(p.PUBLISHER+'/pipeline'),follow_symlinks=False)))[:6]
                    ==expected_root,'pipeline_underlying_identity')
            if fs.sandbox:uid,gid=fs.uid,fs.gid
            else:account=pwd.getpwnam('aktau-sync');uid,gid=account.pw_uid,account.pw_gid
            for row in rows:
                if not row:continue
                meta,path=row.split('\t');mode,kind,obj=meta.split()
                p.need(kind=='blob' and mode in ['100644','100755'],'pipeline_underlying_type')
                relative=path[len('pipeline/'):];p.pipeline_path(relative)
                d=os.open(fs.sandbox or '/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC)
                try:
                    parts=(p.PUBLISHER+'/pipeline/'+relative).strip('/').split('/')
                    for part in parts[:-1]:
                        nxt=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=d)
                        os.close(d);d=nxt;ds=os.fstat(d)
                        p.need(ds.st_uid in [fs.uid,uid] and ds.st_gid in [fs.gid,gid] and not ds.st_mode&0o002
                            and not os.listxattr(d),'pipeline_underlying_parent')
                    file=os.open(parts[-1],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=d)
                    try:
                        st=os.fstat(file);enrolled=enrolled_inputs.get(relative)
                        writable_bound=(enrolled is not None and enrolled[1]==list(p.stamp(st)) and stat.S_IMODE(st.st_mode) in [0o664,0o775]
                            and (st.st_uid,st.st_gid)==(uid,gid) and type(enrolled[2])is str and p.HEX.fullmatch(enrolled[2]))
                        p.need(stat.S_ISREG(st.st_mode) and st.st_nlink==1 and st.st_size<=16<<20
                            and st.st_uid in [fs.uid,uid] and st.st_gid in [fs.gid,gid] and (not st.st_mode&0o022 or writable_bound)
                            and not os.listxattr(file),'pipeline_underlying_file')
                        h=hashlib.sha1(b'blob '+str(st.st_size).encode()+b'\0');sha256=hashlib.sha256();size=0
                        while data:=os.read(file,65536):
                            size+=len(data);p.need(size<=16<<20,'pipeline_underlying_capacity');h.update(data);sha256.update(data)
                        p.need(size==st.st_size and h.hexdigest()==obj and (not st.st_mode&0o022 or sha256.hexdigest()==enrolled[2]) and p.stamp(os.fstat(file))==p.stamp(st)
                            ==p.stamp(os.stat(parts[-1],dir_fd=d,follow_symlinks=False)),'pipeline_underlying_blob')
                    finally:os.close(file)
                finally:os.close(d)
            # Check the complete tracked namespace, not just successful reads
            # of expected files. The legacy ignored node_modules is inactive;
            # it is never followed or treated as the selected dependency graph.
            wanted=set();directories={''}
            for row in rows:
                if not row:continue
                _,path=row.split('\t');p.need(path.startswith('pipeline/'),'pipeline_underlying_path')
                path=path[9:];wanted.add(path)
                parent=os.path.dirname(path)
                while parent:directories.add(parent);parent=os.path.dirname(parent)
            seen=set();seen_dirs={''}
            def walk(fd,relative):
                original=p.stamp(os.fstat(fd));count=0
                with os.scandir(fd) as entries:
                    for entry in entries:
                        count+=1;p.need(count<=len(wanted)+len(directories)+1,'pipeline_underlying_extra')
                        if not relative and entry.name=='node_modules':continue
                        path=relative+'/'+entry.name if relative else entry.name
                        st=os.stat(entry.name,dir_fd=fd,follow_symlinks=False)
                        if stat.S_ISDIR(st.st_mode):
                            p.need(path in directories,'pipeline_underlying_extra')
                            child=os.open(entry.name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=fd)
                            try:
                                p.need(p.stamp(os.fstat(child))==p.stamp(st),'pipeline_underlying_changed')
                                seen_dirs.add(path);walk(child,path)
                                p.need(p.stamp(os.fstat(child))==p.stamp(os.stat(entry.name,dir_fd=fd,follow_symlinks=False)),
                                    'pipeline_underlying_changed')
                            finally:os.close(child)
                        else:
                            p.need(path in wanted and stat.S_ISREG(st.st_mode),'pipeline_underlying_extra');seen.add(path)
                p.need(p.stamp(os.fstat(fd))==original,'pipeline_underlying_changed')
            fd=os.open(fs.path(p.PUBLISHER+'/pipeline'),os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC)
            try:walk(fd,'')
            finally:os.close(fd)
            p.need(seen==wanted and seen_dirs==directories,'pipeline_underlying_inventory')
            os.write(wr,b'OK');os._exit(0)
        except OSError as error:
            os.write(wr,b'UNAVAILABLE' if error.errno in [1,38] else b'BLOCKED');os._exit(1)
        except BaseException:
            os.write(wr,b'BLOCKED');os._exit(1)
    os.close(wr);result=b'BLOCKED';reaped=False
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(rd,selectors.EVENT_READ)
            if selector.select(10):result=os.read(rd,16)
        if result!=b'OK':
            try:os.kill(pid,signal.SIGKILL)
            except ProcessLookupError:pass
        deadline=time.monotonic()+2
        while time.monotonic()<deadline:
            found,status=os.waitpid(pid,os.WNOHANG)
            if found:reaped=True;break
            time.sleep(.01)
        p.need(reaped,'pipeline_verify_child_cleanup_unverified')
        p.need(mounts.inspect()==before,'pipeline_parent_mount_changed')
        if result==b'UNAVAILABLE':return None
        return result==b'OK' and os.waitstatus_to_exitcode(status)==0
    finally:os.close(rd)


if __name__ == '__main__':
    try:
        main()
    except BaseException as e:
        code = str(e) if type(e) is Blocked and re.fullmatch(r'[a-z_]{1,80}', str(e)) else 'operation_failed'
        reply({'status': 'BLOCKED', 'errorClass': code})
        sys.exit(1)
