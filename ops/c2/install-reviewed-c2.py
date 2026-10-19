#!/usr/bin/env python3
"""Fixed-path Linux installer. No secrets, services, network or approval creation.

The sandbox API exercises the SAME install/rollback algorithm with the caller's
uid standing in for root. It cannot install on host paths or mint Node custody.
"""
import ctypes
import contextlib
import hashlib
import json
import os
import pwd
import re
import secrets
import stat
import sys

NODES = ('c2-production-supervisor.mjs', 'projection-provider.mjs',
         'fifo-adapter.mjs', 'production-observer.mjs', 'c2-manifest.mjs')
FILES = ('c2projection', 'relayprobe') + NODES + ('source-manifest.json',)
TARGETS = ('/usr/local/libexec/aktau-c2', '/etc/aktau-c2', '/var/lib/aktau-sync/c2')
APPROVAL = '/etc/aktau-c2-install/approval.json'
BUNDLE = '/var/lib/aktau-c2-install/bundle'
RECEIPT = '/etc/aktau-c2-install/receipt.jsonl'
RECIPE = 'CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-X main.sourceSHA=<sourceSha>" ./cmd/c2projection; CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath ./internal/revalidation/testdata/relayprobe'
NOFOLLOW = os.O_NOFOLLOW | os.O_CLOEXEC


def require(ok):
    if not ok:
        raise ValueError('BLOCKED')


def canonical(value):
    return (json.dumps(value, separators=(',', ':'), ensure_ascii=False) + '\n').encode()


class Installer:
    def __init__(self, sandbox=None, fault=None):
        require(sys.platform == 'linux')
        self.uid = os.geteuid()
        self.gid = os.getegid()
        self.root = sandbox
        self.fault = fault or (lambda point: None)
        self._c2_identity = None
        if sandbox is None:
            require(self.uid == 0 and self.gid == 0)
            # Root must not execute an operator-writable installer checkout.
            script = os.path.abspath(__file__)
            parent = os.path.dirname(script)
            while True:
                s = os.lstat(parent)
                require(stat.S_ISDIR(s.st_mode) and s.st_uid == 0 and s.st_gid == 0 and not s.st_mode & 0o022)
                if parent == '/':
                    break
                parent = os.path.dirname(parent)
            s = os.lstat(script)
            require(stat.S_ISREG(s.st_mode) and s.st_uid == 0 and s.st_gid == 0 and s.st_nlink == 1 and not s.st_mode & 0o022)
        else:
            require(os.path.isabs(sandbox) and os.path.realpath(sandbox) == sandbox)
            s = os.lstat(sandbox)
            require(stat.S_ISDIR(s.st_mode) and s.st_uid == self.uid and stat.S_IMODE(s.st_mode) == 0o700)

    def mapped(self, absolute):
        return self.root + absolute if self.root else absolute

    def directory(self, absolute):
        """Pin each ancestor by descriptor, refusing symlinks/effective ACL write."""
        current = self.root or '/'
        fd = os.open(current, os.O_RDONLY | os.O_DIRECTORY | NOFOLLOW)
        try:
            for name in absolute.strip('/').split('/') if absolute != '/' else []:
                new = os.open(name, os.O_RDONLY | os.O_DIRECTORY | NOFOLLOW, dir_fd=fd)
                os.close(fd)
                fd = new
                s = os.fstat(fd)
                require(s.st_uid == self.uid and s.st_gid == self.gid and not s.st_mode & 0o022)
            return fd
        except BaseException:
            os.close(fd)
            raise

    def read(self, absolute, limit=16384, mode=None):
        parent, name = os.path.split(absolute)
        d = self.directory(parent)
        try:
            fd = os.open(name, os.O_RDONLY | os.O_NONBLOCK | NOFOLLOW, dir_fd=d)
            try:
                s = os.fstat(fd)
                require(stat.S_ISREG(s.st_mode) and s.st_uid == self.uid and s.st_gid == self.gid and s.st_nlink == 1
                        and not s.st_mode & 0o022 and 0 < s.st_size <= limit)
                if mode is not None:
                    require(stat.S_IMODE(s.st_mode) == mode)
                data = os.read(fd, limit + 1)
                require(0 < len(data) <= limit and len(data) == s.st_size)
                return data
            finally:
                os.close(fd)
        finally:
            os.close(d)

    def _operator(self, approval):
        account = pwd.getpwnam('aktau-sync')
        require(type(account.pw_uid) is int and account.pw_uid == approval['operatorUid']
                and type(account.pw_gid) is int and 0 <= account.pw_gid < 2**32 - 1)
        return account.pw_uid, account.pw_gid

    def _check_c2_parent(self, fd, approval):
        owner = self._operator(approval)
        base = self.directory('/var/lib')  # general root-only walk unchanged
        try:
            linked = os.stat('aktau-sync', dir_fd=base, follow_symlinks=False)
            st = os.fstat(fd)
            require(stat.S_ISDIR(st.st_mode) and stat.S_ISDIR(linked.st_mode)
                    and (st.st_dev, st.st_ino) == (linked.st_dev, linked.st_ino)
                    and (st.st_uid, st.st_gid) == owner and stat.S_IMODE(st.st_mode) == 0o755
                    and stat.S_IMODE(linked.st_mode) == 0o755)
            identity = (st.st_dev, st.st_ino, *owner)
            require(self._c2_identity is None or self._c2_identity == identity)
            self._c2_identity = identity
        finally:
            os.close(base)

    def _c2_parent(self, approval):
        # Precisely the direct parent of TARGETS[2], never an exception for
        # authority, bundle, receipt, /etc, /usr/local/libexec or arbitrary path.
        self._operator(approval)
        base = self.directory('/var/lib')
        try:
            fd = os.open('aktau-sync', os.O_RDONLY | os.O_DIRECTORY | NOFOLLOW, dir_fd=base)
        finally:
            os.close(base)
        try:
            self._check_c2_parent(fd, approval)
            return fd
        except BaseException:
            os.close(fd)
            raise

    def _linked(self, fd, parent, name, record=None):
        st = os.fstat(fd)
        linked = os.stat(name, dir_fd=parent, follow_symlinks=False)
        require(stat.S_ISDIR(st.st_mode) and stat.S_ISDIR(linked.st_mode)
                and (st.st_dev, st.st_ino) == (linked.st_dev, linked.st_ino))
        if record is not None:
            require((st.st_dev, st.st_ino) == (record['dev'], record['ino']))
        return st

    def _target_custody(self, st, index, approval, staging):
        if index < 2:
            require((st.st_uid, st.st_gid) == (self.uid, self.gid)
                    and stat.S_IMODE(st.st_mode) in ((0o700, 0o755) if staging else (0o755,)))
        else:
            self._operator(approval)
            # Same pre-existing sandbox mapping: do not chown host test data
            # to the production account. Production uses only OS+approval IDs.
            owner = (self.uid, self.gid) if self.root else self._operator(approval)
            allowed = {owner, (self.uid, self.gid)} if staging else {owner}
            require((st.st_uid, st.st_gid) in allowed and stat.S_IMODE(st.st_mode) == 0o700)

    def admission(self):
        raw = self.read(APPROVAL, mode=0o600)
        a = json.loads(raw)
        require(canonical(a) == raw and set(a) == {'version', 'authorization', 'files', 'operatorUid', 'recipe', 'nodeMajor'})
        auth = a['authorization']
        require(set(auth) == {'version', 'approved', 'sourceSha', 'binarySha256', 'clockSha256', 'buildId', 'platform'})
        require(a['version'] == 1 and a['nodeMajor'] == 24 and a['recipe'] == RECIPE
                and type(a['operatorUid']) is int and a['operatorUid'] >= 1000
                and auth['version'] == 1 and auth['approved'] is True
                and re.fullmatch('[0-9a-f]{40}', auth['sourceSha'])
                and re.fullmatch('[A-Za-z0-9_-]{1,80}', auth['buildId'])
                and auth['platform'] == 'linux/amd64' and set(a['files']) == set(FILES))
        if not self.root:
            require(pwd.getpwnam('aktau-sync').pw_uid == a['operatorUid'])
        directory = self.directory(BUNDLE)
        try:
            require(set(os.listdir(directory)) == set(FILES))
        finally:
            os.close(directory)
        contents = {}
        for name in FILES:
            digest = a['files'][name]
            require(type(digest) is str and re.fullmatch('[0-9a-f]{64}', digest))
            data = self.read(BUNDLE + '/' + name, 64 << 20)
            require(hashlib.sha256(data).hexdigest() == digest)
            if name in FILES[:2]:
                require(len(data) >= 64 and data[:6] == b'\x7fELF\x02\x01'
                        and data[18:20] == b'\x3e\x00')
            contents[name] = data
        require(auth['binarySha256'] == a['files']['c2projection']
                and auth['clockSha256'] == a['files']['relayprobe'])
        manifest_raw = contents['source-manifest.json']
        manifest = json.loads(manifest_raw)
        require(canonical(manifest) == manifest_raw and manifest == {
            'sourceSha': auth['sourceSha'], 'recipe': RECIPE, 'nodeMajor': 24})
        # Only exact pinned bytes read above are installed; never reopen bundle
        # by pathname after admission. Node files need independent review against
        # the approved source SHA; caller build manifests cannot grant approval.
        return a, contents, hashlib.sha256(raw).hexdigest()

    def write(self, fd, data):
        offset = 0
        while offset < len(data):
            n = os.write(fd, data[offset:])
            require(n > 0)
            offset += n
        os.fsync(fd)

    def append(self, fd, value):
        self.write(fd, canonical(value))

    def rename_new(self, parent, stage, final):
        libc = ctypes.CDLL(None, use_errno=True)
        result = libc.renameat2(parent, stage.encode(), parent, final.encode(), 1)
        if result:
            raise OSError(ctypes.get_errno(), 'no_clobber')
        os.fsync(parent)

    def inventory(self, parents, intents, complete=False):
        """All fixed parents, including those missing from a partial receipt.

        A staging name alone is never ownership proof. Unknown reserved names
        (including links/files), unrecorded targets or contradictory records
        preserve the entire receipt/resources for manual reconciliation.
        """
        require(len(parents) == len(TARGETS) and len(intents) <= len(TARGETS))
        require(not complete or len(intents) == len(TARGETS))
        stages = set()
        for index, record in enumerate(intents):
            require(type(record) is dict and set(record) == {'target', 'stage', 'dev', 'ino'}
                    and record['target'] == TARGETS[index]
                    and type(record['stage']) is str
                    and re.fullmatch(r'\.aktau-c2-stage-[0-9a-f]{32}', record['stage'])
                    and record['stage'] not in stages
                    and type(record['dev']) is int and record['dev'] >= 0
                    and type(record['ino']) is int and record['ino'] > 0)
            stages.add(record['stage'])
        for index, (absolute, parent) in enumerate(zip(TARGETS, parents)):
            names = set(os.listdir(parent))
            reserved = {name for name in names if name.startswith('.aktau-c2-stage-')}
            final = os.path.basename(absolute)
            if index >= len(intents):
                require(not reserved and final not in names)
                continue
            stage = intents[index]['stage']
            require(reserved <= {stage})
            require((final in names) != (stage in names))
            require(not complete or final in names)

    def install(self):
        a, contents, approval_hash = self.admission()
        parents = []
        receipt_parent = self.directory(os.path.dirname(RECEIPT))
        receipt = None
        try:
            for index, absolute in enumerate(TARGETS):
                parent = self._c2_parent(a) if index == 2 else self.directory(os.path.dirname(absolute))
                parents.append(parent)
            # A missing receipt is not evidence that an earlier install left
            # no resources: inspect every parent before creating anything.
            self.inventory(parents, [])
            self._check_c2_parent(parents[2], a)
            receipt = os.open(os.path.basename(RECEIPT), os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW,
                              0o600, dir_fd=receipt_parent)
            self.append(receipt, {'version': 1, 'approvalHash': approval_hash})
            os.fsync(receipt_parent)
            for i, (absolute, parent) in enumerate(zip(TARGETS, parents)):
                self._check_c2_parent(parents[2], a)
                stage = '.aktau-c2-stage-' + secrets.token_hex(16)
                os.mkdir(stage, 0o700, dir_fd=parent)
                d = os.open(stage, os.O_RDONLY | os.O_DIRECTORY | NOFOLLOW, dir_fd=parent)
                try:
                    s = self._linked(d, parent, stage)
                    require((s.st_uid, s.st_gid) == (self.uid, self.gid)
                            and stat.S_IMODE(s.st_mode) == 0o700 and not os.listdir(d))
                    self.append(receipt, {'target': absolute, 'stage': stage, 'dev': s.st_dev, 'ino': s.st_ino})
                    os.fsync(parent)
                    if i == 0:
                        for name, data in contents.items():
                            f = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW, 0o555 if name in FILES[:2] else 0o444, dir_fd=d)
                            try:
                                self.write(f, data)
                                os.fchmod(f, 0o555 if name in FILES[:2] else 0o444)
                            finally:
                                os.close(f)
                        os.fchmod(d, 0o755)
                    elif i == 1:
                        f = os.open('authorization.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW, 0o644, dir_fd=d)
                        try:
                            self.write(f, canonical(a['authorization']))
                            os.fchmod(f, 0o644)
                        finally:
                            os.close(f)
                        os.fchmod(d, 0o755)
                    else:
                        os.mkdir('ledger', 0o700, dir_fd=d)
                        # Sandbox deliberately uses its own uid, never chowns
                        # local host resources to a production account.
                        owner = self.uid if self.root else a['operatorUid']
                        group = self.gid if self.root else self._operator(a)[1]
                        ledger = os.open('ledger', os.O_RDONLY | os.O_DIRECTORY | NOFOLLOW, dir_fd=d)
                        try:
                            ledger_stat = self._linked(ledger, d, 'ledger')
                            require((ledger_stat.st_uid, ledger_stat.st_gid) == (self.uid, self.gid)
                                    and stat.S_IMODE(ledger_stat.st_mode) == 0o700 and not os.listdir(ledger))
                            self._check_c2_parent(parent, a)
                            self._linked(d, parent, stage)
                            os.fchown(ledger, owner, group)
                            os.fsync(ledger)
                        finally:
                            os.close(ledger)
                        os.fchown(d, owner, group)
                    os.fsync(d)
                    os.fsync(parent)
                    self.fault('before_rename')
                    self._check_c2_parent(parents[2], a)
                    self._linked(d, parent, stage, {'dev': s.st_dev, 'ino': s.st_ino})
                    self.rename_new(parent, stage, os.path.basename(absolute))
                    current = self._linked(d, parent, os.path.basename(absolute), {'dev': s.st_dev, 'ino': s.st_ino})
                    self._target_custody(current, i, a, False)
                    self.fault('after_rename')
                finally:
                    os.close(d)
            self._check_c2_parent(parents[2], a)
            self.append(receipt, {'complete': True})
            return 'C2_PROVISIONED_INACTIVE'
        finally:
            if receipt is not None:
                os.close(receipt)
            os.close(receipt_parent)
            for fd in parents:
                os.close(fd)

    def rollback(self):
        # Strict drift check BEFORE deletion; no live ledger, credential or
        # deployment records may be removed. No re-running admission against a
        # caller replacement bundle can authorize deletion.
        raw = self.read(RECEIPT, 32768, 0o600)
        lines = raw.splitlines(keepends=True)
        records = [json.loads(line) for line in lines]
        require(all(canonical(r) == line for r, line in zip(records, lines)))
        a, contents, digest = self.admission()
        require(records and type(records[0]) is dict and type(records[0].get('version')) is int
                and records[0] == {'version': 1, 'approvalHash': digest})
        intents = records[1:]
        complete = bool(intents and type(intents[-1]) is dict and set(intents[-1]) == {'complete'}
                        and intents[-1]['complete'] is True)
        if complete:
            intents = intents[:-1]
        verified = []
        children = {}
        descriptors = contextlib.ExitStack()
        try:
            parents = []
            for index, absolute in enumerate(TARGETS):
                parent = self._c2_parent(a) if index == 2 else self.directory(os.path.dirname(absolute))
                descriptors.callback(os.close, parent)
                parents.append(parent)
            # This MUST precede every deletion, including receipt unlink for
            # a header-only receipt after mkdir-before-intent interruption.
            self.inventory(parents, intents, complete)
            for index, record in enumerate(intents):
                parent = parents[index]
                final = os.path.basename(record['target'])
                present = []
                for name in (final, record['stage']):
                    try:
                        s = os.stat(name, dir_fd=parent, follow_symlinks=False)
                        present.append((name, s))
                    except FileNotFoundError:
                        pass
                require(len(present) == 1)
                name, s = present[0]
                require(stat.S_ISDIR(s.st_mode) and s.st_dev == record['dev'] and s.st_ino == record['ino'])
                d = os.open(name, os.O_RDONLY | os.O_DIRECTORY | NOFOLLOW, dir_fd=parent)
                descriptors.callback(os.close, d)
                st = self._linked(d, parent, name, record)
                expected = contents if index == 0 else {'authorization.json': canonical(a['authorization'])} if index == 1 else {'ledger': None}
                present_names = set(os.listdir(d))
                # An inode-pinned private staging directory can contain only
                # a prefix of the reviewed bytes after interrupted writes.
                # Published trees require exact bytes and inventory.
                staging = name == record['stage']
                self._target_custody(st, index, a, staging)
                require(present_names <= set(expected) if staging else present_names == set(expected))
                expected = {k: v for k, v in expected.items() if k in present_names}
                for filename, data in expected.items():
                    if data is None:
                        child = os.open(filename, os.O_RDONLY | os.O_DIRECTORY | NOFOLLOW, dir_fd=d)
                        descriptors.callback(os.close, child)
                        child_stat = self._linked(child, d, filename)
                        self._target_custody(child_stat, 2, a, staging)
                        require(not os.listdir(child))
                        children[(d, filename)] = (child, {'dev': child_stat.st_dev, 'ino': child_stat.st_ino}, staging)
                    else:
                        fd = os.open(filename, os.O_RDONLY | os.O_NONBLOCK | NOFOLLOW, dir_fd=d)
                        try:
                            st = os.fstat(fd)
                            actual = os.read(fd, len(data) + 1)
                            require(stat.S_ISREG(st.st_mode) and st.st_nlink == 1 and st.st_uid == self.uid
                                    and not st.st_mode & 0o022 and st.st_size <= len(data)
                                    and (data.startswith(actual) if staging else actual == data))
                        finally:
                            os.close(fd)
                verified.append((parent, d, name, expected))
            self.inventory(parents, intents, complete)
            self._check_c2_parent(parents[2], a)
            for index, (parent, d, name, _) in enumerate(verified):
                st = self._linked(d, parent, name, intents[index])
                self._target_custody(st, index, a, name == intents[index]['stage'])
            for (d, filename), (child, record, staging) in children.items():
                child_stat = self._linked(child, d, filename, record)
                self._target_custody(child_stat, 2, a, staging)
                require(not os.listdir(child))
            for parent, d, name, expected in reversed(verified):
                self._check_c2_parent(parents[2], a)
                for filename, data in expected.items():
                    if data is None:
                        child, record, _ = children[(d, filename)]
                        self._linked(child, d, filename, record)
                        os.rmdir(filename, dir_fd=d)
                    else:
                        os.unlink(filename, dir_fd=d)
                os.fsync(d)
                os.rmdir(name, dir_fd=parent)
                os.fsync(parent)
            parent = self.directory(os.path.dirname(RECEIPT))
            try:
                os.unlink(os.path.basename(RECEIPT), dir_fd=parent)
                os.fsync(parent)
            finally:
                os.close(parent)
            return 'ROLLED_BACK_OWN_INACTIVE_RESOURCES'
        finally:
            descriptors.close()


if __name__ == '__main__':
    try:
        require(len(sys.argv) == 2 and sys.argv[1] in ('--verify', '--install', '--rollback'))
        installer = Installer()
        if sys.argv[1] == '--verify':
            installer.admission()
            print('READY')
        else:
            print(installer.install() if sys.argv[1] == '--install' else installer.rollback())
    except Exception:
        print('BLOCKED')
        sys.exit(1)
