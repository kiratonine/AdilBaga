#!/usr/bin/python3
"""Fixed, separately reviewed helper installation; no executor/policy mutation.

No upload/path/UID/command/fixture override is exposed by the production CLI.
Tests inject an isolated owned filesystem and modeled business authority only.
"""
import base64
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import sys
import types

SOURCE = 'f38941cf1e007fef251c4b1964629ee523a15327'
CI = 40230819477
HELPER_HASH = '98d1d5a4311a2e45b6ceb543558b40f2fc5d2c4826e064ed3f4ec5712a85fe68'
HELPER_SIZE = 34494
ROOT = '/usr/local/libexec/aktau-sync-promotion'
TARGET = ROOT + '/root-executor-pair-upgrade.py'
STAGE = ROOT + '/.root-executor-pair-upgrade.py.install-f38941cf.pending'
BACKUP = '/var/backups/aktau-c2-helper-install-20261026-f38941cf'
INTENT = BACKUP + '/intent.json'
COPY = BACKUP + '/helper.reviewed.py'
RECEIPT = BACKUP + '/receipt.jsonl'
EXECUTOR = ROOT + '/publisher-promotion.py'
POLICY = '/etc/aktau-sync-promotion/policy.json'
BASE = '/var/lib/aktau-sync-promotion'
OLD = 'fca92db4cda0d94d25f6b7afbe314cb9bac94fff024f619eb94a24a365330670'
OLD_POLICY = 'aea14e7d8814311c57586a3397f24ef754de7072a817b05aa0888497214ac74d'
LOCKS = [(BASE + '/state/ingress.lock', 0o600), (BASE + '/runtime.lock', 0o644),
         ('/var/lib/aktau-c2-custodian/controller.lock', 0o600)]
PAIR_BACKUP = '/var/backups/aktau-c2-executor-upgrade-20261025-8cff133b'
PAIR_JOURNAL = BASE + '/state/executor-pair-upgrade-8cff133b.json'
ABSENT = [PAIR_BACKUP, PAIR_JOURNAL, PAIR_JOURNAL + '.pending',
          ROOT + '/.publisher-promotion.py.pair-8cff133b.pending',
          ROOT + '/.publisher-promotion.py.pair-8cff133b.restore',
          '/etc/aktau-sync-promotion/.policy.json.pair-8cff133b.pending',
          '/etc/aktau-sync-promotion/.policy.json.pair-8cff133b.restore']
PHASES = ['staged', 'linked', 'committed', 'rollback_intent', 'rolled_back']

class Blocked(Exception): pass

def need(ok, code):
    if not ok: raise Blocked(code)

def digest(raw): return hashlib.sha256(raw).hexdigest()

def canonical(v): return (json.dumps(v, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n').encode()

def stamp(s): return [s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns]

def core(s): return s[:8]

def parse(raw):
    def pairs(items):
        out = {}
        for k, v in items:
            need(k not in out, 'duplicate_key'); out[k] = v
        return out
    try:
        value = json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: need(False, 'invalid_json'))
        need(canonical(value) == raw, 'noncanonical_json'); return value
    except (ValueError, TypeError, UnicodeError): raise Blocked('invalid_json') from None

class Filesystem:
    """Pinned root custody. No sandbox/path override is exposed by main()."""

    def __init__(self, sandbox=None):
        self.sandbox = Path(sandbox) if sandbox else None
        self.uid, self.gid = (os.geteuid(), os.getegid()) if sandbox else (0, 0)
        if sandbox:
            s = os.lstat(sandbox)
            need(stat.S_ISDIR(s.st_mode) and (s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode)) == (self.uid, self.gid, 448), 'sandbox_custody')
        else:
            need(os.getuid() == os.geteuid() == 0, 'root_required')

    def path(self, path):
        need(type(path) is str and path.startswith('/') and ('..' not in Path(path).parts) and (str(Path(path)) == path), 'fixed_path')
        return self.sandbox / path[1:] if self.sandbox else Path(path)

    @contextlib.contextmanager
    def directory(self, path):
        self.path(path)
        fd = os.open(self.sandbox or '/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            initial = os.fstat(fd)
            need((initial.st_uid, initial.st_gid) == (self.uid, self.gid) and (not initial.st_mode & 18) and (initial.st_mode & 448 == 448) and (not os.listxattr(fd)), 'root_directory_custody')
            for part in Path(path).parts[1:]:
                n = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
                os.close(fd)
                fd = n
                s = os.fstat(fd)
                need((s.st_uid, s.st_gid) == (self.uid, self.gid) and (not s.st_mode & 18) and (s.st_mode & 448 == 448) and (not os.listxattr(fd)), 'root_directory_custody')
            s = os.fstat(fd)
            yield fd
            need(stamp(os.stat(self.path(path), follow_symlinks=False))[:5] == stamp(s)[:5], 'directory_changed')
        finally:
            os.close(fd)

    @contextlib.contextmanager
    def opened(self, path, mode, cap=1 << 20, empty=False):
        with self.directory(str(Path(path).parent)) as parent:
            name = Path(path).name
            fd = os.open(name, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
            try:
                s = os.fstat(fd)
                need(stat.S_ISREG(s.st_mode) and (s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode), s.st_nlink) == (self.uid, self.gid, mode, 1) and ((0 if empty else 1) <= s.st_size <= cap) and (not os.listxattr(fd)), 'root_file_custody')
                raw = bytearray()
                while (b := os.read(fd, min(65536, cap + 1 - len(raw)))):
                    raw.extend(b)
                    need(len(raw) <= cap, 'read_capacity')
                need(len(raw) == s.st_size and stamp(os.fstat(fd)) == stamp(s) == stamp(os.stat(name, dir_fd=parent, follow_symlinks=False)), 'file_changed')
                yield (fd, parent, bytes(raw), stamp(s))
            finally:
                os.close(fd)

    def read(self, path, mode, cap=1 << 20):
        with self.opened(path, mode, cap) as (_, _, raw, s):
            return (raw, s)

    def exists(self, path):
        with self.directory(str(Path(path).parent)) as d:
            try:
                os.stat(Path(path).name, dir_fd=d, follow_symlinks=False)
                return True
            except FileNotFoundError:
                return False

    def names(self, path):
        with self.directory(path) as d:
            return set(os.listdir(d))

    def create(self, path, raw, mode):
        need(type(raw) is bytes and 0 < len(raw) <= 512 << 10, 'write_capacity')
        with self.directory(str(Path(path).parent)) as d:
            fd = os.open(Path(path).name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 384, dir_fd=d)
            try:
                os.fchown(fd, self.uid, self.gid)
                at = 0
                while at < len(raw):
                    n = os.write(fd, raw[at:])
                    need(n > 0, 'short_write')
                    at += n
                os.fchmod(fd, mode)
                os.fsync(fd)
                created = stamp(os.fstat(fd))
            finally:
                os.close(fd)
            os.fsync(d)
        actual, st = self.read(path, mode)
        need(actual == raw and st == created, 'write_readback')
        return st

    def mkdir(self, path):
        with self.directory(str(Path(path).parent)) as d:
            os.mkdir(Path(path).name, 448, dir_fd=d)
            fd = os.open(Path(path).name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=d)
            try:
                state = os.fstat(fd)
                need((state.st_uid, state.st_gid) == (self.uid, self.gid) and (not os.listxattr(fd)), 'backup_custody')
                os.fchmod(fd, 448)
                os.fsync(fd)
                os.fsync(d)
                created = stamp(os.fstat(fd))[:5]
            finally:
                os.close(fd)
        with self.directory(path) as d:
            s = os.fstat(d)
            need(stamp(s)[:5] == created and stat.S_IMODE(s.st_mode) == 448, 'backup_mode')
            return created

    @contextlib.contextmanager
    def locks(self):
        with contextlib.ExitStack() as stack:
            for path, mode in LOCKS:
                fd, parent, raw, s = stack.enter_context(self.opened(path, mode, 4096, empty=True))
                need(raw == b'', 'lock_contents')
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                need(stamp(os.fstat(fd)) == s == stamp(os.stat(Path(path).name, dir_fd=parent, follow_symlinks=False)), 'lock_changed')
            yield

def lineage(before, current):
    need(type(current) is dict and set(current) == {'stable', 'ledger'} and type(current['stable']) is dict
         and type(current['ledger']) is dict and set(current['ledger']) == {'stamp', 'sha256', 'entries'}
         and type(current['ledger']['stamp']) is list and len(current['ledger']['stamp'])==9
         and all(type(x) is int and x>=0 for x in current['ledger']['stamp'])
         and type(current['ledger']['sha256']) is str and re.fullmatch('[a-f0-9]{64}',current['ledger']['sha256'])
         and type(current['ledger']['entries']) is list and len(current['ledger']['entries']) <= 2048
         and all(type(x) is str and re.fullmatch('[a-f0-9]{64}', x) for x in current['ledger']['entries']), 'snapshot_schema')
    need(len(canonical(current)) <= 300 << 10, 'snapshot_capacity')
    if before is not None:
        need(before['stable'] == current['stable'] and current['ledger']['entries'][:len(before['ledger']['entries'])]
             == before['ledger']['entries'], 'protected_state_changed')

class ProductionChecks:
    def __init__(self, fs, p): self.fs, self.p = fs, p
    def validate_policy(self, v): self.p.validate_policy(v)

    def snapshot(self, policy):
        p = self.p; p.validate_policy(policy); host = p.Host(p.Filesystem())
        host.idle()  # fixed status/pgrep, no service mutation
        need(host.publisher() == {'sha': 'fd2b9a3eec417f739299e3d1ccc1d3d6b09860fd',
                                   'branch': 'deploy/dina-weight-sync-part32'}, 'publisher_baseline')
        need(host.verify_old_closure(policy), 'unaligned_old_closure')
        need(not os.path.lexists(p.INTERLOCK), 'promotion_interlock')
        stable = {'publisher': host.publisher(), 'files': {}, 'inventory': {}, 'units': {}}
        for target, expected in policy['runtimeFiles'].items():
            if target == EXECUTOR: continue  # the pair engine separately classifies/CAS-checks this target
            mode = stat.S_IMODE(os.lstat(target).st_mode)
            need(mode in [0o644, 0o755], 'runtime_mode')
            raw, st = self.fs.read(target, mode); need(digest(raw) == expected, 'runtime_pin')
            stable['files'][target] = {'stamp': st, 'sha256': digest(raw)}
        for target in [*p.FILES.values(), p.AUTH, p.AUTO, p.SITE]:
            mode = stat.S_IMODE(os.lstat(target).st_mode)
            need(mode in [0o444, 0o555, 0o644, 0o755], 'closure_mode')
            raw, st = self.fs.read(target, mode, 256 << 20)
            stable['files'][target] = {'stamp': st, 'sha256': digest(raw)}
        need(stable['files'][p.SITE]['sha256'] == '569bd562b7aee9b34c4bc201959bc22fbe51ad1e290eb1e79a3b0fb1f8ba0e49', 'site_policy')
        tx = p.Transaction(p.Filesystem(), host); tx.inventory()
        expected = {'build-40189038360-1': ('rollback.json', 'e98f067a011bdbc8cc666f1c144da73d902faef7d2201bd0ef3f527284ee35e1'),
                    'initial-1c322af27e6bee3673aafd70b1312735': ('receipt.json', '8107183decdabff0ec53c5b001a2d396da214eadb9d97a9d168467bccae8f29c')}
        with self.fs.directory(BASE+'/releases') as d:
            need(stat.S_IMODE(os.fstat(d).st_mode)==0o700,'releases_private_mode')
            stable['releasesIdentity']=stamp(os.fstat(d))[:5]
        need(self.fs.names(BASE + '/releases') == set(expected), 'release_inventory_changed')
        for name, (terminal, h) in expected.items():
            folder = BASE + '/releases/' + name; raw, st = self.fs.read(folder + '/' + terminal, 0o600, 65536)
            need(digest(raw) == h, 'release_receipt_changed'); record = parse(raw)
            stable['inventory'][name] = {'terminalStamp': st, 'terminalSha256': h, 'backups': {}}
            for target, r in record['targets'].items():
                need(target in set(p.FILES.values()) | set(p.RECORDS), 'backup_target')
                raw, st = self.fs.read(r['backup'], 0o600, 256 << 20)
                need(digest(raw) == r['oldHash'], 'backup_hash')
                stable['inventory'][name]['backups'][target] = {'stamp': st, 'sha256': digest(raw)}
        for unit, role in [('aktau-sync.service', 'daily'), ('aktau-sync-full.service', 'weekly'), ('aktau-c2-custodian.service', 'c2')]:
            raw = p.command(['/usr/bin/systemctl', 'show', unit, '--property=ExecStart', '--value'], timeout=5, cap=8192)
            state=p.command(['/usr/bin/systemctl','show',unit,'--property=ActiveState,Result','--value'],timeout=5,cap=256)
            need(set(state.decode().splitlines())=={'inactive','success'},'service_state')
            text = raw.decode(); expected_arg = '/usr/bin/python3 -I -B ' + ROOT + '/promotion-runtime-gate.py ' + role
            need(text.count('argv[]=') == 1 and 'argv[]=' + expected_arg + ' ;' in text, 'loaded_wrapper')
            stable['units'][unit] = digest(raw)
        for unit in ['aktau-sync.timer', 'aktau-sync-full.timer', 'aktau-go-monitor.timer']:
            raw = p.command(['/usr/bin/systemctl', 'show', unit, '--property=ActiveState,UnitFileState', '--value'], timeout=5, cap=256)
            need(set(raw.decode().splitlines()) == {'active', 'enabled'}, 'timer_state'); stable['units'][unit] = digest(raw)
        # Existing validator reads metadata only on reader. It validates ledger with
        # the installed hash-pinned codec; no DSN bytes/hash are read or stored.
        invariant = host.invariants()
        stable['readerNamespace'] = {k: list(v) for k, v in invariant.items() if not k.endswith('/attempts.json')}
        reader='/var/lib/aktau-sync/c2/reader.dsn';reader_stat=os.lstat(reader)
        need(stat.S_ISREG(reader_stat.st_mode) and reader_stat.st_nlink==1 and not os.listxattr(reader,follow_symlinks=False),'reader_metadata')
        stable['readerMetadata']=stamp(reader_stat)
        import pwd
        actor = pwd.getpwnam('aktau-sync')
        need((actor.pw_uid,actor.pw_gid)==(999,987),'operator_account')
        ledger = '/var/lib/aktau-sync/c2/ledger/attempts.json'
        with self.fs.directory('/var/lib') as base:
            d = os.dup(base)
            try:
                for name in ['aktau-sync', 'c2', 'ledger']:
                    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=d); os.close(d); d = fd
                    s = os.fstat(d); need((s.st_uid, s.st_gid) == (actor.pw_uid, actor.pw_gid)
                         and not s.st_mode & 0o022 and not os.listxattr(d), 'operator_parent')
                fd = os.open('attempts.json', os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=d)
                try:
                    s = os.fstat(fd); need(stat.S_ISREG(s.st_mode) and s.st_nlink == 1 and 0 < s.st_size <= 4 << 20
                         and (s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode)) == (actor.pw_uid, actor.pw_gid, 0o600,)
                         and not os.listxattr(fd), 'ledger_custody')
                    raw = os.read(fd, (4 << 20) + 1)
                    need(len(raw) == s.st_size and stamp(os.fstat(fd)) == stamp(s)
                         == stamp(os.stat('attempts.json', dir_fd=d, follow_symlinks=False)), 'ledger_changed')
                    ledger_stamp = stamp(s)
                finally: os.close(fd)
            finally: os.close(d)
        need(digest(raw) == invariant[ledger][-1], 'ledger_snapshot_race')
        codec = types.ModuleType('approved_pair_ledger'); codec.__file__ = p.FILES['custodian.py']
        code = self.fs.read(codec.__file__, stat.S_IMODE(os.lstat(codec.__file__).st_mode))[0]
        need(digest(code) == parse(p.Filesystem().read(p.AUTO))['files'][codec.__file__], 'ledger_codec')
        exec(compile(code, codec.__file__, 'exec'), codec.__dict__)
        entries = codec.node_ledger_json(raw)
        if entries: codec.ledger_verdict(entries, entries[-1]['attemptId'])
        return {'stable': stable, 'ledger': {'stamp': ledger_stamp, 'sha256': digest(raw),
                                             'entries': [digest(canonical(e)) for e in entries]}}

def source_verified(api):
    ci = api('actions/runs/' + str(CI)); jobs = api('actions/runs/' + str(CI) + '/jobs?per_page=100')['jobs']
    names = {'Contracts', 'Go Quality', 'Nest Reference', 'Frontend', 'Pipeline Quality', 'Security',
             'PostgreSQL Integration', 'Ephemeral Staging', 'CI Gate'}
    need(ci.get('id') == CI and type(ci['id']) is int and ci.get('head_sha') == SOURCE
         and ci.get('repository', {}).get('full_name') == 'kiratonine/AdilBaga'
         and ci.get('head_repository', {}).get('full_name') == 'kiratonine/AdilBaga'
         and ci.get('event') == 'push' and ci.get('head_branch') == 'main'
         and ci.get('path') == '.github/workflows/ci.yml' and ci.get('status') == 'completed'
         and ci.get('conclusion') == 'success', 'source_ci')
    need(type(jobs) is list and len(jobs) == 9 and {j.get('name') for j in jobs} == names
         and all(j.get('status') == 'completed' and j.get('conclusion') == 'success' for j in jobs), 'source_jobs')
    item = api('contents/ops/c2/root-executor-pair-upgrade.py?ref=' + SOURCE)
    need(item.get('type') == 'file' and item.get('encoding') == 'base64'
         and item.get('path') == 'ops/c2/root-executor-pair-upgrade.py'
         and type(item.get('size')) is int and item['size'] == HELPER_SIZE
         and item.get('sha') == 'cc002eb4d3eaa26865ebcf3439fbe1a0139fd1e3', 'source_metadata')
    try: raw = base64.b64decode(item['content'].replace('\n', ''), validate=True)
    except (ValueError, TypeError, KeyError): raise Blocked('source_encoding') from None
    need(len(raw) == HELPER_SIZE and digest(raw) == HELPER_HASH, 'source_digest')
    compile(raw, TARGET, 'exec')  # Never execute downloaded helper, including definitions.
    return raw


class Installer:
    def __init__(self, fs, checks, source, fault=None):
        self.fs, self.checks, self.source = fs, checks, source
        self.fault = fault or (lambda _: None)
        self.intent = None; self.record = None; self.receipt_stamp = None; self.receipt_hash = None

    def parents(self):
        out = {}
        for path in [ROOT, '/var/backups']:
            with self.fs.directory(path) as d:
                s = os.fstat(d); out[path] = stamp(s)[:5]
                need(stat.S_IMODE(s.st_mode) == 0o755, 'parent_mode')
                v = os.fstatvfs(d)
                need(not v.f_flag & os.ST_RDONLY and v.f_bavail * v.f_frsize > 4 << 20, 'parent_capacity')
        if not self.fs.sandbox:
            need(out[ROOT][:2] == [64770, 935172] and out['/var/backups'][:2] == [64770, 34573], 'approved_parent_identity')
        return out

    def snapshot(self):
        executor, es = self.fs.read(EXECUTOR, 0o755)
        policy, ps = self.fs.read(POLICY, 0o644)
        need(len(executor) == 56173 and digest(executor) == OLD and len(policy) == 1557
             and digest(policy) == OLD_POLICY, 'old_pair_required')
        state = self.checks.snapshot(parse(policy)); lineage(None, state)
        state['stable']['installedPair'] = {'executor': es, 'policy': ps}
        return state

    def absence(self):
        for path in ABSENT: need(not self.fs.exists(path), 'pair_resource_present')
        for parent, prefixes in [(ROOT, ['.root-executor-pair-upgrade.py.install-', '.publisher-promotion.py.pair-']),
                                 ('/etc/aktau-sync-promotion', ['.policy.json.pair-']),
                                 (BASE + '/state', ['executor-pair-upgrade-']),
                                 ('/var/backups', ['aktau-c2-helper-install-', 'aktau-c2-executor-upgrade-20261025'])]:
            names = self.fs.names(parent); need(len(names) <= 2000, 'namespace_capacity')
            allowed = {Path(STAGE).name, Path(BACKUP).name}
            need(not {n for n in names if any(n.startswith(prefix) for prefix in prefixes)} - allowed, 'unknown_namespace')

    def unchanged(self, state):
        need(self.parents() == self.intent['parents'], 'parent_changed')
        need(self.snapshot() == state, 'protected_window_changed')
        self.absence()

    def backup_cas(self):
        with self.fs.directory(BACKUP) as d:
            need(stamp(os.fstat(d))[:5] == self.intent['directory']
                 and stat.S_IMODE(os.fstat(d).st_mode) == 0o700, 'backup_identity')

    def save(self, phase):
        self.backup_cas()
        previous = self.receipt_hash
        row = {'version': 1, 'phase': phase, 'previous': previous, 'intentHash': digest(canonical(self.intent)),
               'stage': self.record['stage'], 'intentStamp': self.record['intentStamp'], 'copyStamp': self.record['copyStamp']}
        raw = canonical(row)
        if self.receipt_stamp is None:
            need(phase == 'staged', 'first_phase')
            self.receipt_stamp = self.fs.create(RECEIPT, raw, 0o600)
        else:
            content, actual = self.fs.read(RECEIPT, 0o600, 4 << 20)
            need(actual == self.receipt_stamp and digest(content) == previous, 'receipt_cas')
            with self.fs.opened(RECEIPT, 0o600, 4 << 20) as (held, parent, old, st):
                need(st == actual and old == content, 'receipt_changed')
                fd = os.open(Path(RECEIPT).name, os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
                try:
                    need(stamp(os.fstat(fd)) == st, 'receipt_inode')
                    at = 0
                    while at < len(raw):
                        n = os.write(fd, raw[at:]); need(n > 0, 'receipt_short_write'); at += n
                    os.fsync(fd)
                finally: os.close(fd)
                os.fsync(parent)
            self.receipt_stamp = self.fs.read(RECEIPT, 0o600, 4 << 20)[1]
        self.record = row
        self.receipt_hash = digest(self.fs.read(RECEIPT, 0o600, 4 << 20)[0])
        self.fault(phase)

    def load(self):
        raw, intent_stamp = self.fs.read(INTENT, 0o600, 512 << 10); self.intent = parse(raw); i = self.intent
        need(type(i) is dict and set(i) == {'version', 'source', 'helperHash', 'originalAbsent', 'directory', 'parents', 'snapshot'}
             and type(i['version']) is int and i['version'] == 1 and i['source'] == SOURCE
             and i['helperHash'] == HELPER_HASH and i['originalAbsent'] is True, 'intent_schema')
        need(self.parents() == i['parents'], 'parent_changed'); lineage(None, i['snapshot'])
        with self.fs.directory(BACKUP) as d:
            need(stamp(os.fstat(d))[:5] == i['directory'] and stat.S_IMODE(os.fstat(d).st_mode) == 0o700, 'backup_identity')
        need(self.fs.names(BACKUP) == {'intent.json', 'helper.reviewed.py', 'receipt.jsonl'}, 'unknown_backup')
        candidate, copy_stamp = self.fs.read(COPY, 0o600, HELPER_SIZE)
        need(len(candidate) == HELPER_SIZE and digest(candidate) == HELPER_HASH, 'backup_digest')
        raw, self.receipt_stamp = self.fs.read(RECEIPT, 0o600, 4 << 20)
        prior = None; cumulative = b''; seen = []
        for line in raw.splitlines(keepends=True):
            row = parse(line)
            need(set(row) == {'version', 'phase', 'previous', 'intentHash', 'stage', 'intentStamp', 'copyStamp'}
                 and type(row['version']) is int and row['version'] == 1 and row['phase'] in PHASES
                 and row['previous'] == prior and row['intentHash'] == digest(canonical(i)), 'receipt_schema')
            need(row['intentStamp'] == intent_stamp and row['copyStamp'] == copy_stamp, 'retained_inode_changed')
            need(type(row['stage']) is list and len(row['stage']) == 9 and all(type(n) is int and n >= 0 for n in row['stage']), 'stage_schema')
            if seen: need(row['stage'] == self.record['stage'], 'stage_history_changed')
            phase = row['phase']; last = seen[-1] if seen else None
            allowed = {None: {'staged'}, 'staged': {'linked', 'rollback_intent'}, 'linked': {'committed', 'rollback_intent'},
                       'committed': {'rollback_intent'}, 'rollback_intent': {'rolled_back'}, 'rolled_back': set()}
            need(phase in allowed[last], 'receipt_order'); seen.append(phase)
            cumulative += line; prior = digest(cumulative); self.record = row
        need(bool(seen) and canonical(self.record) == raw.splitlines(keepends=True)[-1], 'receipt_empty')
        self.receipt_hash = digest(raw)

    def resources(self):
        self.backup_cas()
        need(self.fs.names(BACKUP) == {'intent.json', 'helper.reviewed.py', 'receipt.jsonl'}, 'unknown_backup')
        intent, ist = self.fs.read(INTENT, 0o600, 512 << 10)
        copy, cst = self.fs.read(COPY, 0o600, HELPER_SIZE)
        receipt, rst = self.fs.read(RECEIPT, 0o600, 4 << 20)
        need(intent == canonical(self.intent) and ist == self.record['intentStamp']
             and digest(copy) == HELPER_HASH and cst == self.record['copyStamp']
             and rst == self.receipt_stamp and digest(receipt) == self.receipt_hash, 'retained_changed')
        r = self.record; need(r is not None, 'receipt_missing'); names = []
        for path in [STAGE, TARGET]:
            if self.fs.exists(path): names.append(path)
        phase = r['phase']
        allowed = {'staged': [[STAGE]], 'linked': [[STAGE, TARGET], [TARGET]], 'committed': [[TARGET]],
                   'rollback_intent': [[], [STAGE], [TARGET], [STAGE, TARGET]], 'rolled_back': [[]]}
        need(names in allowed[phase], 'unregistered_resource')
        expected = r['stage']; need(expected[5] == 1, 'stage_link_history')
        for path in names:
            # Read-only pinned descriptors remain held by unlink/publish critical sections.
            with self.fs.directory(str(Path(path).parent)) as d:
                fd = os.open(Path(path).name, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=d)
                try:
                    s = os.fstat(fd); current = stamp(s)
                    need(stat.S_ISREG(s.st_mode) and current[:5] == expected[:5]
                         and current[6:8] == expected[6:8] and s.st_nlink == len(names)
                         and not os.listxattr(fd), 'resource_identity')
                    raw = os.read(fd, HELPER_SIZE + 1)
                    need(len(raw) == HELPER_SIZE and digest(raw) == HELPER_HASH
                         and stamp(os.fstat(fd)) == current == stamp(os.stat(Path(path).name, dir_fd=d, follow_symlinks=False)), 'resource_digest')
                finally: os.close(fd)
        return names

    def install(self, raw):
        need(type(raw) is bytes and len(raw) == HELPER_SIZE and digest(raw) == HELPER_HASH, 'candidate_digest')
        compile(raw, TARGET, 'exec')
        self.absence()
        need(not self.fs.exists(TARGET) and not self.fs.exists(STAGE) and not self.fs.exists(BACKUP), 'existing_install_state')
        parents = self.parents(); baseline = self.snapshot()
        directory = self.fs.mkdir(BACKUP); self.fault('mkdir_unregistered')
        self.intent = {'version': 1, 'source': SOURCE, 'helperHash': HELPER_HASH, 'originalAbsent': True,
                       'directory': directory, 'parents': parents, 'snapshot': baseline}
        intent_stamp = self.fs.create(INTENT, canonical(self.intent), 0o600); self.fault('intent')
        copy_stamp = self.fs.create(COPY, raw, 0o600); self.fault('copy_unregistered')
        stage = self.fs.create(STAGE, raw, 0o755); self.fault('stage_unregistered')
        self.record = {'stage': stage, 'intentStamp': intent_stamp, 'copyStamp': copy_stamp}; self.save('staged')
        self.unchanged(baseline); self.resources()
        with self.fs.opened(STAGE, 0o755, HELPER_SIZE) as (fd, parent, content, actual):
            need(actual == stage and content == raw, 'stage_cas'); self.fault('before_link')
            need(stamp(os.fstat(fd)) == actual == stamp(os.stat(Path(STAGE).name, dir_fd=parent, follow_symlinks=False)), 'stage_changed')
            with self.fs.directory(ROOT) as now: need(stamp(os.fstat(now))[:5] == stamp(os.fstat(parent))[:5], 'parent_cas')
            os.link(Path(STAGE).name, Path(TARGET).name, src_dir_fd=parent, dst_dir_fd=parent, follow_symlinks=False)
            os.fsync(parent); self.fault('link_unregistered')
            self.save('linked'); self.resources(); self.unlink_owned(STAGE, 2)
        self.fault('stage_unlinked'); self.unchanged(baseline); self.resources()
        self.save('committed'); self.resources(); return 'HELPER_INSTALLED_NOT_EXECUTED'

    def unlink_owned(self, path, links):
        with self.fs.directory(str(Path(path).parent)) as parent:
            fd = os.open(Path(path).name, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
            try:
                s = os.fstat(fd); expected = self.record['stage']
                need(stamp(s)[:5] == expected[:5] and stamp(s)[6:8] == expected[6:8] and s.st_nlink == links
                     and not os.listxattr(fd), 'unlink_identity')
                raw = os.read(fd, HELPER_SIZE + 1)
                need(len(raw) == HELPER_SIZE and digest(raw) == HELPER_HASH, 'unlink_digest')
                self.fault('before_unlink')
                need(stamp(os.fstat(fd)) == stamp(s) == stamp(os.stat(Path(path).name, dir_fd=parent, follow_symlinks=False)), 'unlink_cas')
                with self.fs.directory(str(Path(path).parent)) as now:
                    need(stamp(os.fstat(now))[:5] == stamp(os.fstat(parent))[:5], 'unlink_parent_cas')
                os.unlink(Path(path).name, dir_fd=parent); os.fsync(parent)
            finally: os.close(fd)

    def run(self, mode):
        need(mode in ['install', 'readback', 'rollback-install'], 'fixed_mode')
        raw = self.source() if mode == 'install' else None  # independent network proof, before locks
        with self.fs.locks():
            self.absence()
            if mode == 'install': return self.install(raw)
            self.load(); names = self.resources(); current = self.snapshot()
            lineage(self.intent['snapshot'], current)  # valid ledger append across an idle window is retained
            if mode == 'readback':
                need(self.record['phase'] == 'committed', 'installation_not_committed')
                return 'HELPER_INSTALL_READBACK_VERIFIED'
            need(self.record['phase'] != 'rolled_back', 'already_rolled_back')
            if self.record['phase'] != 'rollback_intent': self.save('rollback_intent')
            self.unchanged(current)
            names = self.resources()
            if STAGE in names: self.unlink_owned(STAGE, len(names)); self.fault('rollback_stage_unlinked')
            names = self.resources()
            if TARGET in names: self.unlink_owned(TARGET, len(names)); self.fault('rollback_target_unlinked')
            self.unchanged(current); self.resources(); self.save('rolled_back')
            return 'HELPER_INSTALL_ROLLED_BACK'


def main():
    need(len(sys.argv) == 2 and sys.argv[1] in ['--install', '--readback', '--rollback-install'], 'fixed_entry')
    need(sys.flags.isolated and sys.dont_write_bytecode, 'isolated_python_required')
    fs = Filesystem(); code, _ = fs.read(EXECUTOR, 0o755)
    need(len(code) == 56173 and digest(code) == OLD, 'installed_executor_digest')
    p = types.ModuleType('pinned_old_executor'); p.__file__ = EXECUTOR
    exec(compile(code, EXECUTOR, 'exec'), p.__dict__)  # installed immutable old executor definitions only
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(Blocked('installer_deadline'))); signal.alarm(120)
    for sig in [signal.SIGTERM, signal.SIGINT, signal.SIGHUP]:
        signal.signal(sig, lambda *_: (_ for _ in ()).throw(Blocked('installer_cancelled')))
    result = Installer(fs, ProductionChecks(fs, p), lambda: source_verified(p.github)).run(sys.argv[1][2:])
    print(json.dumps({'status': result, 'helperExecuted': False, 'rootPairChanged': False, 'sourceSha': SOURCE}))


if __name__ == '__main__':
    try: main()
    except BaseException as error:
        safe = str(error) if isinstance(error, Blocked) else type(error).__name__
        if not re.fullmatch('[A-Za-z_]{1,80}', safe): safe = 'installer_rejected'
        print(json.dumps({'status': 'BLOCKED', 'errorClass': safe})); sys.exit(1)
