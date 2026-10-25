#!/usr/bin/python3
"""One reviewed root executor/policy pair. No publisher deployment or general CLI.

SOURCE ONLY until independent review/install. Tests inject an owned filesystem
and authority model through Python objects; production CLI has no such inputs.
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

SOURCE = '8cff133be30a8c31f4d5e06d297dcf9af5e97847'
CI = 40208958302
ID = 'executor-pair-20261025-8cff133b-v1'
ROOT = '/usr/local/libexec/aktau-sync-promotion'
EXECUTOR = ROOT + '/publisher-promotion.py'
SELF = ROOT + '/root-executor-pair-upgrade.py'
POLICY = '/etc/aktau-sync-promotion/policy.json'
BASE = '/var/lib/aktau-sync-promotion'
BACKUP = '/var/backups/aktau-c2-executor-upgrade-20261025-8cff133b'
JOURNAL = BASE + '/state/executor-pair-upgrade-8cff133b.json'
PENDING = JOURNAL + '.pending'
OLD = 'fca92db4cda0d94d25f6b7afbe314cb9bac94fff024f619eb94a24a365330670'
NEW = 'd69c667212b2a6c8a25081ccdc90f798024e850784262976e06e45ce13f45118'
OLD_POLICY = 'aea14e7d8814311c57586a3397f24ef754de7072a817b05aa0888497214ac74d'
NEW_POLICY = '2bf672f1626252f107447552493ad982999d3d7f444f000394a7006d952ddb8b'
WORKFLOW = '1d7764798c1c78ac616e4615ef46ba7fd810b1f192692318cdf1a3aa66da6312'
BUILDER = '308504c27ee7ceed871b1044d88a20a1f45a9525c9e4f3cca9d9b8382240b9b4'
TARGETS = {'executor': (EXECUTOR, 0o755, OLD, NEW, 56173, 59455),
           'policy': (POLICY, 0o644, OLD_POLICY, NEW_POLICY, 1557, 1557)}
LOCKS = [(BASE + '/state/ingress.lock', 0o600), (BASE + '/runtime.lock', 0o644),
         ('/var/lib/aktau-c2-custodian/controller.lock', 0o600)]
PHASES = {'intent', 'backup_created', 'backed_up', 'staged_executor', 'staged_policy',
          'prepared', 'executor_replaced', 'pair_replaced', 'verified',
          'rollback_prepared', 'rollback_policy_replaced', 'rollback_executor_replaced', 'rolled_back'}
RESOURCES = {**{'old_' + k: (BACKUP + '/' + k + '.old', 0o600, v[2], v[4]) for k, v in TARGETS.items()},
             **{'new_' + k: (str(Path(v[0]).parent / ('.' + Path(v[0]).name + '.pair-8cff133b.pending')), v[1], v[3], v[5]) for k, v in TARGETS.items()},
             **{'restore_' + k: (str(Path(v[0]).parent / ('.' + Path(v[0]).name + '.pair-8cff133b.restore')), v[1], v[2], v[4]) for k, v in TARGETS.items()}}
RECEIPT = (json.dumps({'version': 1, 'id': ID, 'sourceSha': SOURCE, 'executorSha256': NEW,
                       'policySha256': NEW_POLICY, 'outcome': 'verified'}, separators=(',', ':')) + '\n').encode()
RESOURCES['receipt'] = (BACKUP + '/receipt.json', 0o600, hashlib.sha256(RECEIPT).hexdigest(), len(RECEIPT))


class Blocked(Exception): pass


def need(ok, code):
    if not ok: raise Blocked(code)


def digest(raw): return hashlib.sha256(raw).hexdigest()
def canonical(v): return (json.dumps(v, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n').encode()
def stamp(s): return [s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns]
def core(s): return s[:8]  # rename can change ctime; exact inode/bytes/mtime/mode remain required

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


def candidate(old, validate):
    need(len(old) == 1557 and digest(old) == OLD_POLICY, 'old_policy_digest')
    a = parse(old); validate(a); b = json.loads(json.dumps(a))
    need(a['producerFiles']['ops/c2/publisher-promotion.py'] == a['runtimeFiles'][EXECUTOR] == OLD, 'old_pins')
    b['producerFiles']['ops/c2/publisher-promotion.py'] = NEW; b['runtimeFiles'][EXECUTOR] = NEW
    validate(b); raw = canonical(b)
    need(old.count(OLD.encode()) == 2 and raw == old.replace(OLD.encode(), NEW.encode())
         and len(raw) == 1557 and digest(raw) == NEW_POLICY, 'two_pin_candidate')
    return raw


class Filesystem:
    """Pinned root custody. No sandbox/path override is exposed by main()."""
    def __init__(self, sandbox=None):
        self.sandbox = Path(sandbox) if sandbox else None
        self.uid, self.gid = (os.geteuid(), os.getegid()) if sandbox else (0, 0)
        if sandbox:
            s = os.lstat(sandbox)
            need(stat.S_ISDIR(s.st_mode) and (s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode)) == (self.uid, self.gid, 0o700), 'sandbox_custody')
        else: need(os.getuid() == os.geteuid() == 0, 'root_required')

    def path(self, path):
        need(type(path) is str and path.startswith('/') and '..' not in Path(path).parts and str(Path(path)) == path, 'fixed_path')
        return self.sandbox / path[1:] if self.sandbox else Path(path)

    @contextlib.contextmanager
    def directory(self, path):
        self.path(path)
        fd = os.open(self.sandbox or '/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            initial=os.fstat(fd);need((initial.st_uid,initial.st_gid)==(self.uid,self.gid) and not initial.st_mode&0o022 and initial.st_mode&0o700==0o700 and not os.listxattr(fd),'root_directory_custody')
            for part in Path(path).parts[1:]:
                n = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
                os.close(fd); fd = n; s = os.fstat(fd)
                need((s.st_uid, s.st_gid) == (self.uid, self.gid) and not s.st_mode & 0o022 and s.st_mode&0o700==0o700
                     and not os.listxattr(fd), 'root_directory_custody')
            s = os.fstat(fd)
            yield fd
            need(stamp(os.stat(self.path(path), follow_symlinks=False))[:5] == stamp(s)[:5], 'directory_changed')
        finally: os.close(fd)

    @contextlib.contextmanager
    def opened(self, path, mode, cap=1 << 20, empty=False):
        with self.directory(str(Path(path).parent)) as parent:
            name = Path(path).name
            fd = os.open(name, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
            try:
                s = os.fstat(fd)
                need(stat.S_ISREG(s.st_mode) and (s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode), s.st_nlink)
                     == (self.uid, self.gid, mode, 1) and (0 if empty else 1) <= s.st_size <= cap
                     and not os.listxattr(fd), 'root_file_custody')
                raw = bytearray()
                while b := os.read(fd, min(65536, cap + 1 - len(raw))):
                    raw.extend(b); need(len(raw) <= cap, 'read_capacity')
                need(len(raw) == s.st_size and stamp(os.fstat(fd)) == stamp(s)
                     == stamp(os.stat(name, dir_fd=parent, follow_symlinks=False)), 'file_changed')
                yield fd, parent, bytes(raw), stamp(s)
                # Caller may have renamed the file; its own CAS/readback handles that.
            finally: os.close(fd)

    def read(self, path, mode, cap=1 << 20):
        with self.opened(path, mode, cap) as (_, _, raw, s): return raw, s

    def exists(self, path):
        with self.directory(str(Path(path).parent)) as d:
            try: os.stat(Path(path).name, dir_fd=d, follow_symlinks=False); return True
            except FileNotFoundError: return False

    def names(self, path):
        with self.directory(path) as d: return set(os.listdir(d))

    def create(self, path, raw, mode):
        need(type(raw) is bytes and 0 < len(raw) <= 512 << 10, 'write_capacity')
        with self.directory(str(Path(path).parent)) as d:
            fd = os.open(Path(path).name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=d)
            try:
                os.fchown(fd, self.uid, self.gid); at = 0
                while at < len(raw):
                    n = os.write(fd, raw[at:]); need(n > 0, 'short_write'); at += n
                os.fchmod(fd,mode);os.fsync(fd);created=stamp(os.fstat(fd))
            finally: os.close(fd)
            os.fsync(d)
        actual, st = self.read(path, mode); need(actual == raw and st==created, 'write_readback'); return st

    def mkdir(self, path):
        with self.directory(str(Path(path).parent)) as d:
            os.mkdir(Path(path).name, 0o700, dir_fd=d)
            fd=os.open(Path(path).name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=d)
            try:
                state=os.fstat(fd);need((state.st_uid,state.st_gid)==(self.uid,self.gid) and not os.listxattr(fd),'backup_custody')
                os.fchmod(fd,0o700);os.fsync(fd);os.fsync(d);created=stamp(os.fstat(fd))[:5]
            finally:os.close(fd)
        with self.directory(path) as d:
            s=os.fstat(d);need(stamp(s)[:5]==created and stat.S_IMODE(s.st_mode)==0o700,'backup_mode');return created

    def rename(self, source, target, mode, expected_source, expected_target, wanted, old_hash):
        need(Path(source).parent==Path(target).parent,'same_parent_required')
        with self.opened(source, mode) as (sf, sd, raw, ss), self.opened(target, mode, 512 << 10) as (tf, td, target_raw, ts):
            need(ss == expected_source and ts == expected_target and digest(raw) == wanted and digest(target_raw)==old_hash, 'inode_hash_cas')
            # Recheck names/descriptors immediately before replacing, while both stay pinned.
            need(stamp(os.fstat(sf)) == ss == stamp(os.stat(Path(source).name, dir_fd=sd, follow_symlinks=False))
                 and stamp(os.fstat(tf)) == ts == stamp(os.stat(Path(target).name, dir_fd=td, follow_symlinks=False)), 'stale_inode')
            for path,held in [(source,sd),(target,td)]:
                with self.directory(str(Path(path).parent)) as current:
                    need(stamp(os.fstat(current))[:5]==stamp(os.fstat(held))[:5],'parent_cas')
            os.rename(Path(source).name, Path(target).name, src_dir_fd=sd, dst_dir_fd=td); os.fsync(td)
        result, state = self.read(target, mode); need(result == raw and core(state) == core(ss), 'rename_readback')
        return state

    def journal(self, value, previous, old_hash):
        raw=canonical(value);st=self.create(PENDING,raw,0o600)
        if previous is None:
            with self.opened(PENDING,0o600,512<<10) as (fd,d,content,actual):
                need(actual==st and content==raw,'journal_pending_changed')
                os.link(Path(PENDING).name,Path(JOURNAL).name,src_dir_fd=d,dst_dir_fd=d,follow_symlinks=False)
                linked=stamp(os.fstat(fd));expected=st.copy();expected[5]=2
                need(core(linked)==core(expected) and linked==stamp(os.stat(Path(PENDING).name,dir_fd=d,follow_symlinks=False))
                     ==stamp(os.stat(Path(JOURNAL).name,dir_fd=d,follow_symlinks=False)),'journal_link_changed')
                os.unlink(Path(PENDING).name,dir_fd=d);os.fsync(d)
        else:self.rename(PENDING,JOURNAL,0o600,st,previous,digest(raw),old_hash)
        actual,state=self.read(JOURNAL,0o600,512<<10);need(actual==raw,'journal_readback');return state

    @contextlib.contextmanager
    def locks(self):
        with contextlib.ExitStack() as stack:
            for path, mode in LOCKS:
                fd, parent, raw, s = stack.enter_context(self.opened(path, mode, 4096, empty=True))
                need(raw==b'','lock_contents')
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


class Upgrade:
    def __init__(self, fs, checks, source, fault=None):
        self.fs, self.checks, self.source = fs, checks, source
        self.fault = fault or (lambda _: None)
        self.j = None; self.js = None;self.jh=None

    def save(self, phase, event=None):
        need(self.j['seq']<63,'journal_capacity')
        self.j['phase'] = phase; self.j['seq'] += 1
        self.js = self.fs.journal(self.j, self.js,self.jh);self.jh=digest(canonical(self.j)); self.fault(event or phase)

    def load(self):
        raw, self.js = self.fs.read(JOURNAL, 0o600, 512 << 10);self.jh=digest(raw); self.j = parse(raw); j = self.j
        need(type(j) is dict and set(j) == {'version', 'id', 'sourceSha', 'phase', 'seq', 'original', 'snapshot', 'backupDirectory', 'resources'}
             and type(j['version']) is int and j['version'] == 1 and j['id'] == ID and j['sourceSha'] == SOURCE
             and j['phase'] in PHASES and type(j['seq']) is int and 0 < j['seq'] <=63
             and type(j['resources']) is dict and set(j['resources']) <= set(RESOURCES)
             and type(j['original']) is dict and set(j['original']) == set(TARGETS), 'journal_schema')
        for k, rec in {**j['original'], **j['resources']}.items():
            need(type(rec) is dict and set(rec) == {'stamp', 'sha256'} and type(rec['stamp']) is list
                 and len(rec['stamp']) == 9 and all(type(x) is int and x >= 0 for x in rec['stamp'])
                 and type(rec['sha256']) is str and re.fullmatch('[a-f0-9]{64}', rec['sha256']), 'journal_record')
            expected = TARGETS[k][2] if k in TARGETS else RESOURCES[k][2]
            mode,length=(TARGETS[k][1],TARGETS[k][4]) if k in TARGETS else (RESOURCES[k][1],RESOURCES[k][3])
            need(rec['sha256']==expected and rec['stamp'][2]==stat.S_IFREG|mode
                 and rec['stamp'][3:7]==[self.fs.uid,self.fs.gid,1,length], 'journal_hash_or_metadata')
        need(j['backupDirectory'] is None or (type(j['backupDirectory']) is list and len(j['backupDirectory']) == 5
             and all(type(x) is int and x >= 0 for x in j['backupDirectory'])), 'journal_directory')
        lineage(None, j['snapshot'])

    def classify(self):
        out = {}
        for k, (path, mode, old, new, _, _) in TARGETS.items():
            raw, s = self.fs.read(path, mode, 512 << 10); h = digest(raw)
            if h == old and s == self.j['original'][k]['stamp']: out[k] = 'old'
            elif h == new and 'new_' + k in self.j['resources'] and core(s) == core(self.j['resources']['new_' + k]['stamp']): out[k] = 'new'
            elif h == old and 'restore_' + k in self.j['resources'] and core(s) == core(self.j['resources']['restore_' + k]['stamp']): out[k] = 'restored'
            else: raise Blocked('unknown_pair_inode_or_hash')
        need(not (out['executor'] != 'new' and out['policy'] == 'new'), 'unknown_mixed_pair')
        return out

    def inventory(self, states=None):
        need(not self.fs.exists(PENDING), 'unresolved_journal_temp')
        family={n for n in self.fs.names(str(Path(JOURNAL).parent)) if n.startswith('executor-pair-upgrade-')}
        need(family <= {Path(JOURNAL).name},'unknown_upgrade_journal')
        family={n for n in self.fs.names('/var/backups') if n.startswith('aktau-c2-executor-upgrade-20261025')}
        need(family <= {Path(BACKUP).name},'unknown_upgrade_backup')
        for path in [EXECUTOR, POLICY]:
            parent = str(Path(path).parent); stem = '.' + Path(path).name + '.pair-'
            actual = {str(Path(parent) / n) for n in self.fs.names(parent) if n.startswith(stem)}
            expected = {v[0] for k, v in RESOURCES.items() if k in (self.j['resources'] if self.j else {}) and v[0] in actual}
            need(actual == expected, 'unknown_target_temp')
        if self.j is None:
            need(not self.fs.exists(BACKUP), 'orphan_backup'); return
        if self.j['backupDirectory'] is None:
            need(not self.fs.exists(BACKUP), 'unregistered_backup_directory')
        else:
            with self.fs.directory(BACKUP) as d:
                need(stamp(os.fstat(d))[:5] == self.j['backupDirectory'] and stat.S_IMODE(os.fstat(d).st_mode) == 0o700, 'backup_directory_changed')
            need(self.fs.names(BACKUP) == {Path(RESOURCES[k][0]).name for k in self.j['resources'] if RESOURCES[k][0].startswith(BACKUP + '/')}, 'unknown_backup_resource')
        for k, rec in self.j['resources'].items():
            path, mode, h, size = RESOURCES[k]
            if self.fs.exists(path):
                raw, s = self.fs.read(path, mode, 512 << 10)
                need(s == rec['stamp'] and len(raw) == size and digest(raw) == h, 'resource_changed')
            else:
                key = k.split('_', 1)[-1]
                moved = (k.startswith('new_') and states and (states[key] == 'new' or
                         states[key] == 'restored' and self.j['phase'].startswith('rollback') or
                         states[key] == 'restored' and self.j['phase'] == 'rolled_back')) or (
                         k.startswith('restore_') and states and states[key] == 'restored')
                need(moved, 'registered_resource_missing')

    def store(self, key, raw, phase, event):
        path, mode, h, size = RESOURCES[key]
        need(len(raw) == size and digest(raw) == h, 'resource_digest')
        st = self.fs.create(path, raw, mode); self.fault(event + '_unregistered')
        self.j['resources'][key] = {'stamp': st, 'sha256': h}; self.save(phase, event);self.inventory(self.classify())

    def unchanged(self, baseline, policy):
        current = self.checks.snapshot(policy); lineage(None, current)
        need(current == baseline, 'protected_window_changed')

    def space(self):
        for parent in {str(Path(v[0]).parent) for v in TARGETS.values()} | {'/var/backups',str(Path(JOURNAL).parent)}:
            with self.fs.directory(parent) as d:
                space=os.fstatvfs(d);need(not getattr(space,'f_flag',0)&os.ST_RDONLY and space.f_bavail*space.f_frsize>=4*(59455+56173+1557)+(4<<20),'insufficient_space')

    def run(self, mode):
        need(mode in ['verify', 'apply', 'recover', 'rollback'], 'fixed_mode')
        new = None
        if mode in ['verify', 'apply']:
            new = self.source()
            need(type(new) is bytes and len(new) == 59455 and digest(new) == NEW, 'reviewed_source_digest')
            compile(new, EXECUTOR, 'exec')  # validate syntax, never execute downloaded source
        with self.fs.locks():
            if self.fs.exists(JOURNAL):
                self.load(); states = self.classify(); self.inventory(states)
                policy = parse(self.fs.read(POLICY, 0o644)[0]); current = self.checks.snapshot(policy); lineage(self.j['snapshot'], current)
                if mode == 'apply': raise Blocked('existing_upgrade_no_retry')
                if mode == 'verify':
                    need(self.j['phase'] == 'verified' and set(states.values()) == {'new'}, 'upgrade_incomplete')
                    return 'ROOT_EXECUTOR_PAIR_VERIFIED'
                if mode == 'recover' and self.j['phase'] == 'verified':
                    need(set(states.values()) == {'new'}, 'verified_pair_changed'); return 'ROOT_EXECUTOR_PAIR_VERIFIED'
                if self.j['phase'] == 'rolled_back':
                    need('new' not in states.values(), 'rollback_pair_changed'); return 'ROOT_EXECUTOR_PAIR_ROLLED_BACK'
                return self.rollback(current, policy, states)
            need(mode in ['verify', 'apply'], 'recovery_journal_missing'); self.inventory()
            original = {}; data = {}
            for k, (path, perm, h, _, length, _) in TARGETS.items():
                raw, s = self.fs.read(path, perm, 512 << 10)
                need(len(raw) == length and digest(raw) == h, 'old_pair_digest')
                data[k] = raw; original[k] = {'stamp': s, 'sha256': h}
            replacement = candidate(data['policy'], self.checks.validate_policy)
            policy = parse(data['policy']); baseline = self.checks.snapshot(policy); lineage(None, baseline)
            self.space()
            if mode == 'verify': return 'ROOT_EXECUTOR_PAIR_UPGRADE_READY'
            self.j = {'version': 1, 'id': ID, 'sourceSha': SOURCE, 'phase': 'intent', 'seq': 0,
                      'original': original, 'snapshot': baseline, 'backupDirectory': None, 'resources': {}}
            self.save('intent'); self.j['backupDirectory'] = self.fs.mkdir(BACKUP); self.save('backup_created', 'backup_directory');self.inventory(self.classify())
            self.store('old_executor', data['executor'], 'backup_created', 'backup_executor')
            self.store('old_policy', data['policy'], 'backed_up', 'backup_policy')
            self.fault('backup_complete')
            self.store('new_executor', new, 'staged_executor', 'stage_executor')
            self.store('new_policy', replacement, 'staged_policy', 'stage_policy')
            self.save('prepared'); self.inventory(self.classify()); self.unchanged(baseline, policy)
            for k, phase in [('executor', 'executor_replaced'), ('policy', 'pair_replaced')]:
                path, perm, _, h, _, _ = TARGETS[k]; slot = 'new_' + k
                # Original full inode/stamp CAS and pinned descriptor hash, not just a digest.
                self.fs.rename(RESOURCES[slot][0], path, perm, self.j['resources'][slot]['stamp'], original[k]['stamp'], h,TARGETS[k][2])
                self.fault(k + '_renamed'); self.save(phase)
            self.inventory(self.classify()); self.unchanged(baseline, parse(replacement))
            self.store('receipt', RECEIPT, 'pair_replaced', 'receipt')
            self.unchanged(baseline,parse(replacement));states=self.classify();need(set(states.values())=={'new'},'final_pair');self.inventory(states)
            self.save('verified');need(set(self.classify().values())=={'new'},'final_pair');return 'ROOT_EXECUTOR_PAIR_VERIFIED'

    def rollback(self, baseline, policy, states):
        self.space()
        # Never run publisher --rollback-* here. Only this pair's known backup domain.
        for k in TARGETS:
            if states[k] == 'new':
                need('old_' + k in self.j['resources'], 'backup_missing_for_restore')
                if 'restore_' + k not in self.j['resources']:
                    raw, _ = self.fs.read(RESOURCES['old_' + k][0], 0o600)
                    self.store('restore_' + k, raw, 'rollback_prepared', 'restore_' + k)
        self.unchanged(baseline, policy)
        for k in ['policy', 'executor']:
            if states[k] == 'new':
                slot = 'restore_' + k; path, perm, old, _, _, _ = TARGETS[k]
                raw, current = self.fs.read(path, perm)
                need(digest(raw) == TARGETS[k][3] and core(current) == core(self.j['resources']['new_' + k]['stamp']), 'restore_cas')
                self.fs.rename(RESOURCES[slot][0], path, perm, self.j['resources'][slot]['stamp'], current, old,TARGETS[k][3])
                self.fault('rollback_' + k + '_renamed'); self.save('rollback_' + k + '_replaced')
        states = self.classify(); need('new' not in states.values(), 'rollback_readback')
        self.unchanged(baseline, parse(self.fs.read(POLICY, 0o644)[0])); self.inventory(states)
        self.save('rolled_back'); return 'ROOT_EXECUTOR_PAIR_ROLLED_BACK'


def source_verified(api):
    """Fixed immutable reviewed commit/CI; no uploader manifest or latest-main adoption."""
    ci = api('actions/runs/' + str(CI)); jobs = api('actions/runs/' + str(CI) + '/jobs?per_page=100')['jobs']
    need(ci.get('id') == CI and type(ci.get('id')) is int and ci.get('head_sha') == SOURCE
         and ci.get('repository', {}).get('full_name') == 'kiratonine/AdilBaga'
         and ci.get('head_repository', {}).get('full_name') == 'kiratonine/AdilBaga'
         and ci.get('event') == 'push' and ci.get('head_branch') == 'main'
         and ci.get('path') == '.github/workflows/ci.yml' and ci.get('status') == 'completed'
         and ci.get('conclusion') == 'success', 'reviewed_ci_identity')
    names = {'Contracts', 'Go Quality', 'Nest Reference', 'Frontend', 'Pipeline Quality', 'Security',
             'PostgreSQL Integration', 'Ephemeral Staging', 'CI Gate'}
    need(type(jobs) is list and len(jobs) == 9 and {j.get('name') for j in jobs} == names
         and all(j.get('status') == 'completed' and j.get('conclusion') == 'success' for j in jobs), 'reviewed_ci_jobs')
    code = None
    for path, h, size in [('ops/c2/publisher-promotion.py', NEW, 59455),
                          ('.github/workflows/sync-publisher-build.yml', WORKFLOW, 3929),
                          ('scripts/ops/build-sync-promotion.py', BUILDER, 5211)]:
        item = api('contents/' + path + '?ref=' + SOURCE)
        need(item.get('encoding') == 'base64' and item.get('type') == 'file' and item.get('path') == path
             and type(item.get('size')) is int and item['size'] == size, 'reviewed_source_metadata')
        try: raw = base64.b64decode(item['content'].replace('\n', ''), validate=True)
        except (KeyError, ValueError, TypeError): raise Blocked('reviewed_source_encoding') from None
        need(len(raw) == size and digest(raw) == h, 'reviewed_source_digest')
        if path.endswith('publisher-promotion.py'): code = raw
    return code


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


def main():
    need(len(sys.argv) == 2 and sys.argv[1] in ['--verify', '--apply', '--recover', '--rollback'], 'fixed_entry')
    fs = Filesystem()
    need(sys.flags.isolated and sys.dont_write_bytecode,'isolated_python_required')
    need(str(Path(__file__).absolute()) == SELF, 'installed_helper_path')
    fs.read(SELF, 0o755)  # externally reviewed root helper custody, not caller-selected source
    raw, _ = fs.read(EXECUTOR, 0o755)
    need((len(raw), digest(raw)) in [(56173, OLD), (59455, NEW)], 'installed_executor_digest')
    p = types.ModuleType('independently_pinned_executor'); p.__file__ = EXECUTOR
    exec(compile(raw, EXECUTOR, 'exec'), p.__dict__)
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(Blocked('helper_deadline'))); signal.alarm(120)
    for sig in [signal.SIGTERM, signal.SIGINT, signal.SIGHUP]:
        signal.signal(sig, lambda *_: (_ for _ in ()).throw(Blocked('helper_cancelled')))
    result = Upgrade(fs, ProductionChecks(fs, p), lambda: source_verified(p.github)).run(sys.argv[1][2:])
    print(json.dumps({'status': result, 'sourceSha': SOURCE, 'promotionExecuted': False}))


if __name__ == '__main__':
    try: main()
    except BaseException as error:
        safe = str(error) if isinstance(error, Blocked) else type(error).__name__
        if not re.fullmatch('[A-Za-z_]{1,80}', safe): safe = 'helper_rejected'
        print(json.dumps({'status': 'BLOCKED', 'errorClass': safe})); sys.exit(1)
