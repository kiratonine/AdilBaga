"""Owner-installed broker. No arbitrary commands, paths or uploaded Python execute.

Install only after separate source/SSH/sudo review. JSON header plus ONE image
stream; detached worker survives SSH loss and holds flock through compensation.
Diagnostics are fixed classes, never subprocess stderr or HTTP bodies.
"""
import fcntl
import contextlib
import hashlib
import ipaddress
import json
import os
import re
import signal
import stat
import subprocess
import sys
import time
import tarfile
import tempfile
import urllib.request
from pathlib import Path

STATE = Path('/var/lib/adilbaga/deploy')
COMPOSE = Path('/opt/adilbaga/compose.production.yml')
RELEASE = Path('/etc/adilbaga/release.env')
ENV = Path('/etc/adilbaga/api.env')
SHA = re.compile(r'^[a-f0-9]{40}$')
DIGEST = re.compile(r'^[a-f0-9]{64}$')
TAG = re.compile(r'^adilbaga-api:([a-f0-9]{40})$')
PRODUCER_FIELDS = {'repository', 'ciWorkflow', 'ciRunId', 'ciAttempt',
                   'buildWorkflow', 'buildRunId', 'buildAttempt', 'artifactIdentity'}


class Blocked(Exception):
    pass


def require(ok, reason):
    if not ok:
        raise Blocked(reason)


def command(args, timeout=30, pass_fds=()):
    try:
        r = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, timeout=timeout, check=False,
                           env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8'},
                           pass_fds=pass_fds)
        require(r.returncode == 0, 'command_failed')
        require(len(r.stdout) <= 8 << 20, 'output_limit')
        return r.stdout
    except (OSError, subprocess.TimeoutExpired):
        raise Blocked('command_timeout_or_start') from None


def secure_file(path, mode):
    s = path.lstat()
    require(stat.S_ISREG(s.st_mode) and s.st_uid == 0 and stat.S_IMODE(s.st_mode) == mode,
            'unapproved_file_permissions')
    return path.read_bytes()


def settings():
    # Simple existing dotenv syntax only. Unsupported syntax fails, never eval.
    raw = secure_file(ENV, 0o600)
    out = {}
    for line in raw.decode().splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        key, sep, value = line.partition('=')
        require(sep and re.fullmatch(r'[A-Z][A-Z0-9_]*', key), 'env_syntax')
        require(key not in out, 'duplicate_env')
        out[key] = value.strip().strip('"\'')
    require(out.get('APP_ENV') == 'production', 'production_env')
    from urllib.parse import urlparse
    user = (urlparse(out.get('DATABASE_URL', '')).username or '').split('.')[0]
    require(user == 'aktau_api_runtime', 'runtime_identity')
    require(not any(out.get(k) for k in ['DIRECT_URL', 'INGEST_DATABASE_URL', 'BACKUP_DATABASE_URL']),
            'unsafe_runtime_credentials')
    peers = out.get('TRUSTED_PROXY_CIDRS', '').split(',')
    require(len(peers) == 1, 'exact_peer_required')
    p = ipaddress.ip_network(peers[0], strict=True)
    require(p.prefixlen == p.max_prefixlen, 'broad_proxy')
    return raw, out, p


def release_tag():
    raw = secure_file(RELEASE, 0o600)
    require(re.fullmatch(rb'API_IMAGE=adilbaga-api:[a-f0-9]{40}\n?', raw), 'release_file_shape')
    return raw, raw.decode().strip().split('=', 1)[1]


def inspect(tag=None):
    if tag:
        require(TAG.fullmatch(tag), 'invalid_image_tag')
        return json.loads(command(['docker', 'image', 'inspect', tag]))[0]
    return json.loads(command(['docker', 'inspect', 'adilbaga-api']))[0]


def replace_release(raw):
    require(re.fullmatch(rb'API_IMAGE=adilbaga-api:[a-f0-9]{40}\n?', raw), 'release_file_shape')
    tmp = RELEASE.with_name('release.env.auto-deploy')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(raw)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, RELEASE)
    finally:
        tmp.unlink(missing_ok=True)


def recreate():
    command(['docker', 'compose', '--env-file', str(RELEASE), '-f', str(COMPOSE),
             'up', '-d', '--force-recreate'], 90)


def tunnel(active):
    command(['systemctl', 'start' if active else 'stop', 'cloudflared'], 30)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise Blocked('redirect_rejected')


def http(url, method='GET', body=None, headers=None, expected=200, timeout=18):
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(),
                                 method=method, headers={'User-Agent': 'AdilBaga-Deployment-Operator/1.0',
                                 'Content-Type': 'application/json', **(headers or {})})
    try:
        try:
            response = urllib.request.build_opener(NoRedirect).open(req, timeout=timeout)
        except urllib.error.HTTPError as e:
            response = e
        with response:
            require(response.status == expected, 'http_status')
            raw = response.read((2 << 20) + 1)
            require(len(raw) <= 2 << 20, 'http_body_limit')
            h = response.headers
            require(h.get('CF-Cache-Status', '').upper() not in ['HIT', 'STALE', 'UPDATING'], 'edge_cache')
            require(not h.get('Strict-Transport-Security'), 'unexpected_hsts')
            if expected == 204:
                return None, h
            require('application/json' in h.get('Content-Type', ''), 'http_content_type')
            return json.loads(raw), h
    except Blocked:
        raise
    except Exception:
        raise Blocked('http_transport_or_json') from None


def ready(now=time.monotonic, pause=time.sleep, probe=None):
    end = now() + 30
    while now() < end:
        try:
            (probe or (lambda: http('http://127.0.0.1:8080/health/ready', timeout=min(3, max(.1, end-now())))))()
            return
        except Blocked:
            pause(min(.5, max(0, end-now())))
    raise Blocked('persistent_readiness')


def validate_manifest(m):
    fields = {'sha', 'revision', 'os', 'arch', 'user', 'entrypoint', 'rootfs', 'binary', 'archive', 'size'}
    require(isinstance(m, dict) and set(m) in (fields, fields | {'provenance'}), 'manifest_fields')
    require(isinstance(m['sha'], str) and SHA.fullmatch(m['sha']), 'manifest_sha')
    require(m['sha'] == m['revision'] and m['os'] == 'linux' and m['arch'] == 'amd64'
            and m['user'] == '10001:10001' and m['entrypoint'] == ['/usr/local/bin/api'], 'manifest_identity')
    require(DIGEST.fullmatch(m['binary']) and DIGEST.fullmatch(m['archive']), 'manifest_digest')
    require(isinstance(m['rootfs'], list) and 0 < len(m['rootfs']) <= 20 and
            all(re.fullmatch(r'sha256:[a-f0-9]{64}', x) for x in m['rootfs']), 'manifest_layers')
    require(type(m['size']) is int and 0 < m['size'] <= 256 << 20, 'manifest_size')


def strict_json(raw):
    def pairs(items):
        out = {}
        for key, value in items:
            require(key not in out, 'duplicate_json_key')
            out[key] = value
        return out
    try:
        return json.loads(raw, object_pairs_hook=pairs,
                          parse_constant=lambda _: require(False, 'nonfinite_json'))
    except (ValueError, UnicodeError):
        raise Blocked('invalid_authorization_json') from None


def trusted_directory(fd, private=False):
    s = os.fstat(fd)
    require(stat.S_ISDIR(s.st_mode) and s.st_uid == 0 and not s.st_mode & 0o022
            and (not private or stat.S_IMODE(s.st_mode) == 0o700), 'authorization_directory')


@contextlib.contextmanager
def root_parent(path):
    # Walk from / using held dirfds. No symlink or writable ancestor is trusted.
    require(path.is_absolute() and '..' not in path.parts, 'authorization_path')
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        trusted_directory(fd)
        for part in path.parent.parts[1:]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                            dir_fd=fd)
            os.close(fd)
            fd = child
            trusted_directory(fd)
        trusted_directory(fd, private=True)
        yield fd
    except OSError:
        raise Blocked('authorization_unavailable') from None
    finally:
        os.close(fd)


def root_bytes(path, limit, identity=False):
    with root_parent(path) as parent:
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK,
                     dir_fd=parent)
        with os.fdopen(fd, 'rb') as f:
            s = os.fstat(f.fileno())
            require(stat.S_ISREG(s.st_mode) and s.st_uid == 0 and
                    stat.S_IMODE(s.st_mode) == 0o600 and s.st_nlink == 1 and
                    0 < s.st_size <= limit, 'authorization_file')
            raw = f.read(limit + 1)
            after = os.fstat(f.fileno())
            require(len(raw) == s.st_size and len(raw) <= limit and
                    (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns) ==
                    (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
                    'authorization_file_changed')
            signature = (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
            return (raw, signature) if identity else raw


def authorization(m, now=None):
    validate_manifest(m)
    require('provenance' in m, 'independent_authorization_required')
    raw = root_bytes(STATE / 'authorizations' / (m['sha'] + '.json'), 16384)
    a = strict_json(raw)
    fields = {'schemaVersion', 'environment', 'releaseSha', 'archiveSha256', 'archiveSize',
              'approved', 'approvedBy', 'approvedAt', 'expiresAt', 'authorizationId'} | PRODUCER_FIELDS
    require(isinstance(a, dict) and set(a) == fields and type(a['schemaVersion']) is int
            and a['schemaVersion'] == 1, 'authorization_schema')
    p = m['provenance']
    require(isinstance(p, dict) and set(p) == PRODUCER_FIELDS, 'producer_schema')
    require(a['repository'] == 'kiratonine/AdilBaga' and a['environment'] == 'production'
            and a['releaseSha'] == m['sha'] and a['ciWorkflow'] == '.github/workflows/ci.yml'
            and a['buildWorkflow'] == '.github/workflows/deploy-production.yml', 'authorization_identity')
    for key in ['ciRunId', 'ciAttempt', 'buildRunId', 'buildAttempt']:
        require(type(a[key]) is int and 0 < a[key] <= 9007199254740991, 'authorization_run')
    item = a['artifactIdentity']
    require(isinstance(item, dict) and set(item) == {'id', 'name'} and type(item['id']) is int
            and 0 < item['id'] <= 9007199254740991 and item['name'] ==
            'adilbaga-api-' + m['sha'] + '-' + str(a['buildRunId']) + '-' + str(a['buildAttempt']),
            'authorization_artifact')
    require(all(p[k] == a[k] and type(p[k]) is type(a[k]) for k in PRODUCER_FIELDS),
            'authorization_producer_mismatch')
    require(type(p['artifactIdentity'].get('id')) is int, 'producer_artifact_type')
    require(a['approved'] is True and isinstance(a['approvedBy'], str) and
            re.fullmatch(r'owner:[a-zA-Z0-9_-]{1,64}', a['approvedBy']) and
            isinstance(a['authorizationId'], str) and re.fullmatch(r'[a-f0-9]{32}', a['authorizationId']),
            'authorization_approval')
    require(type(a['approvedAt']) is int and type(a['expiresAt']) is int and
            0 < a['approvedAt'] <= (time.time() if now is None else now) < a['expiresAt']
            and 0 < a['expiresAt'] - a['approvedAt'] <= 86400, 'authorization_expired')
    require(type(a['archiveSize']) is int and a['archiveSize'] == m['size'] and
            isinstance(a['archiveSha256'], str) and DIGEST.fullmatch(a['archiveSha256']) and
            a['archiveSha256'] == m['archive'], 'authorization_archive')
    return raw, a


def consume_authorization(a):
    # One attempted load per Owner authorization; rollback/retry needs NEW approval.
    marker = STATE / 'authorizations' / (a['authorizationId'] + '.used')
    with root_parent(marker) as parent:
        fd = os.open(marker.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW |
                     os.O_CLOEXEC, 0o600, dir_fd=parent)
        with os.fdopen(fd, 'wb') as f:
            f.write(b'consumed\n')
            f.flush()
            os.fsync(f.fileno())
        os.fsync(parent)


@contextlib.contextmanager
def approved_archive(m, path):
    raw, a = authorization(m)
    # Copy bounded protected stored bytes into a SEALED Linux memfd. docker CLI
    # inherits only this fd; it never reopens a caller-replaceable archive path.
    data, source_identity = root_bytes(path, 256 << 20, identity=True)
    require(len(data) == a['archiveSize'] and hashlib.sha256(data).hexdigest() == a['archiveSha256'],
            'independent_archive_digest')
    fd = os.memfd_create('approved-image', os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
    try:
        with os.fdopen(os.dup(fd), 'wb') as f:
            f.write(data)
            f.flush()
        del data
        seals = fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL
        fcntl.fcntl(fd, fcntl.F_ADD_SEALS, seals)
        require(fcntl.fcntl(fd, fcntl.F_GET_SEALS) == seals, 'archive_not_sealed')
        os.lseek(fd, 0, os.SEEK_SET)
        yield fd, raw, a, source_identity
    finally:
        os.close(fd)


def verify_image(m, image, binary):
    c = image['Config']
    require(c['Labels'].get('org.opencontainers.image.revision') == m['sha'] and
            image['Os'] == m['os'] and image['Architecture'] == m['arch'] and
            c['User'] == m['user'] and c['Entrypoint'] == m['entrypoint'] and
            image['RootFS']['Layers'] == m['rootfs'] and binary == m['binary'], 'image_identity')
    require(all(x.startswith('PATH=') for x in c.get('Env') or []), 'baked_env')


class Host:
    def preflight(self):
        self.old, self.prior = release_tag()
        self.compose = secure_file(COMPOSE, 0o644)
        # Reviewed compose digest, not caller-controlled YAML.
        require(hashlib.sha256(self.compose).hexdigest() ==
                '7ba6711fcf18a08d96008bb063e1ca475f668fbdfc4a98eb5b00a0fbbdd57eb5', 'compose_drift')
        self.raw, self.env, self.peer = settings()
        prior = inspect(self.prior)  # rollback image retained before any cutover
        c = inspect()
        require(c['Config']['Image'] == self.prior and c['State']['Running'] and
                c['State']['Health']['Status'] == 'healthy' and c['RestartCount'] == 0 and
                c['Image'] == prior['Id'] and
                prior['Config']['Labels'].get('org.opencontainers.image.revision') == TAG.fullmatch(self.prior)[1],
                'prior_health')
        require(command(['systemctl', 'is-active', 'cloudflared']).strip() == b'active', 'prior_tunnel')
        ready()
        self.hardening()

    def fresh_main(self, sha):
        main, _ = http('https://api.github.com/repos/kiratonine/AdilBaga/git/ref/heads/main')
        return main['object']['sha'] == sha

    def identity(self, m, archive):
        with approved_archive(m, archive) as (fd, raw, a, source_identity):
            self._load_approved(m, archive, fd, raw, a, source_identity)
        self.authorization_raw = raw
        self.authorization_manifest = m

    def _load_approved(self, m, archive, fd, raw, a, source_identity):
        # A valid docker-save archive must not silently overwrite rollback tags.
        with os.fdopen(os.dup(fd), 'rb') as stored, tarfile.open(fileobj=stored, mode='r:') as saved:
            members = saved.getmembers()
            names = [x.name for x in members]
            require(len(names) <= 10000 and len(names) == len(set(names)), 'archive_inventory')
            for entry in members:
                require(not entry.name.startswith('/') and '..' not in Path(entry.name).parts
                        and (entry.isfile() or entry.isdir()), 'archive_paths')
            entry = saved.getmember('manifest.json')
            require(entry.isfile() and entry.size <= 262144, 'save_manifest')
            content = json.loads(saved.extractfile(entry).read())
            require(len(content) == 1 and content[0].get('RepoTags') == ['adilbaga-api:' + m['sha']],
                    'save_tag_allowlist')
        require(authorization(m)[0] == raw, 'authorization_changed')
        current, current_identity = root_bytes(archive, 256 << 20, identity=True)
        require(current_identity == source_identity and len(current) == a['archiveSize']
                and hashlib.sha256(current).hexdigest() == a['archiveSha256'],
                'archive_changed_before_load')
        del current
        consume_authorization(a)
        os.lseek(fd, 0, os.SEEK_SET)
        command(['docker', 'load', '--input', '/proc/self/fd/' + str(fd)], 120, pass_fds=(fd,))
        tag = 'adilbaga-api:' + m['sha']
        image = inspect(tag)
        cid = command(['docker', 'create', tag]).decode().strip()
        require(re.fullmatch('[a-f0-9]{64}', cid), 'container_id')
        api = archive.with_name('api-binary')
        try:
            command(['docker', 'cp', cid + ':/usr/local/bin/api', str(api)])
            verify_image(m, image, hashlib.sha256(api.read_bytes()).hexdigest())
        finally:
            command(['docker', 'rm', cid])
            api.unlink(missing_ok=True)

    def recheck_authorization(self):
        require(authorization(self.authorization_manifest)[0] == self.authorization_raw,
                'authorization_changed_before_cutover')

    def unchanged(self):
        require(secure_file(ENV, 0o600) == self.raw and secure_file(COMPOSE, 0o644) == self.compose,
                'private_configuration_changed')

    def hardening(self):
        c = inspect()
        h = c['HostConfig']
        require(c['State']['Running'] and c['State']['Health']['Status'] == 'healthy'
                and c['RestartCount'] == 0 and c['Config']['User'] == '10001:10001'
                and h['ReadonlyRootfs'] and h['CapDrop'] == ['ALL'] and not h.get('CapAdd')
                and 'no-new-privileges:true' in h['SecurityOpt'] and not h['Privileged']
                and h['PortBindings'] == {'8080/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '8080'}]}
                and h['LogConfig']['Type'] == 'local'
                and h['Tmpfs'].get('/tmp') == 'rw,noexec,nosuid,size=16m', 'runtime_hardening')
        require(command(['docker', 'exec', 'adilbaga-api', 'id', '-u']).strip() == b'10001', 'uid')
        command(['docker', 'exec', 'adilbaga-api', 'sh', '-c',
                 'test -r /etc/ssl/certs/ca-certificates.crt && ! command -v go'])
        actual = dict(x.split('=', 1) for x in c['Config']['Env'])
        require(all(actual.get(k) == v for k, v in self.env.items()), 'runtime_env_drift')
        sockets = command(['ss', '-lntH']).decode().splitlines()
        for line in sockets:
            addr = line.split()[3]
            if addr.rsplit(':', 1)[-1] in ['80', '443', '8080']:
                require(addr == '127.0.0.1:8080', 'public_origin_listener')
        # Observe new established connection in the actual container netns.
        import socket
        pid = str(c['State']['Pid'])
        before = set(command(['nsenter', '-t', pid, '-n', 'ss', '-tnH']).decode().splitlines())
        with socket.create_connection(('127.0.0.1', 8080), timeout=3):
            candidates = set()
            for _ in range(10):
                after = set(command(['nsenter', '-t', pid, '-n', 'ss', '-tnH']).decode().splitlines())
                for line in after-before:
                    fields = line.split()
                    if len(fields) >= 5 and fields[0] == 'ESTAB' and fields[3].endswith(':8080'):
                        addr = fields[4].rsplit(':', 1)[0].strip('[]')
                        ip = ipaddress.ip_address(addr)
                        candidates.add(ip.ipv4_mapped if hasattr(ip, 'ipv4_mapped') and ip.ipv4_mapped else ip)
                if candidates:
                    break
                time.sleep(.1)
        require(len(candidates) == 1 and next(iter(candidates)) in self.peer, 'measured_peer')

    def stop(self):
        tunnel(False)

    def activate(self, sha):
        # Private, durable rollback reference survives worker failure/reboot.
        previous = STATE / (sha + '.previous.env')
        fd = os.open(previous, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as f:
            f.write(self.old)
            f.flush()
            os.fsync(f.fileno())
        replace_release(('API_IMAGE=adilbaga-api:' + sha + '\n').encode())
        recreate()
        ready()
        self.unchanged()
        self.hardening()

    def local(self):
        from auto_smoke import Smoke
        Smoke('http://127.0.0.1:8080', self.env).run()

    def open(self):
        tunnel(True)

    def public(self):
        from auto_smoke import Smoke
        Smoke('https://api.aktau.market', self.env).run()

    def observe(self):
        end = time.monotonic() + 600
        while True:
            self.unchanged()
            self.hardening()
            require(command(['systemctl', 'is-active', 'cloudflared']).strip() == b'active', 'tunnel_state')
            http('https://api.aktau.market/health/live')
            http('https://api.aktau.market/health/ready')
            # Read only new-container logs, classify without emitting content.
            raw = command(['docker', 'logs', '--since', inspect()['State']['StartedAt'],
                           '--tail', '10000', 'adilbaga-api'])
            for line in raw.splitlines():
                try:
                    event = json.loads(line)
                except ValueError:
                    raise Blocked('unexpected_log_format') from None
                require(event.get('level') != 'ERROR' and not 500 <= event.get('status', 0) < 600,
                        'application_error_observed')
            if time.monotonic() >= end:
                break
            time.sleep(min(30, end-time.monotonic()))

    def rollback(self):
        self.stop()
        replace_release(self.old)
        recreate()
        ready()
        self.unchanged()
        self.hardening()
        self.local()  # prior application must pass BEFORE reopening
        self.open()
        self.public()


def rollout(host, manifest, archive):
    host.preflight()
    if host.prior == 'adilbaga-api:' + manifest['sha']:
        return 'NO_OP'
    if not host.fresh_main(manifest['sha']):
        return 'SKIPPED_STALE'
    host.identity(manifest, archive)
    host.recheck_authorization()
    if not host.fresh_main(manifest['sha']):
        return 'SKIPPED_STALE'
    try:
        # Set compensation ownership BEFORE tunnel stop; stop may partly succeed.
        host.stop()
        host.activate(manifest['sha'])
        host.local()
        host.open()
        host.public()
        host.observe()
        return 'DEPLOYED'
    except BaseException:
        try:
            # A total worker budget expiry still leaves one bounded compensation.
            host.rollback()
            return 'BLOCKED_ROLLED_BACK'
        except BaseException:
            try:
                host.stop()
            except BaseException:
                pass
            return 'BLOCKED_ROLLBACK_FAILED'


def write_result(path, status):
    tmp = path.with_suffix('.next')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'w') as f:
            os.fchmod(f.fileno(), 0o600)
            f.write(json.dumps({'status': status}))
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
        # Persist the rename as well as the contents before reporting completion.
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        tmp.unlink(missing_ok=True)


def receive_archive(stream, manifest, archive, fd=None):
    if fd is None:
        fd = os.open(archive, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        remaining, digest = manifest['size'], hashlib.sha256()
        with os.fdopen(fd, 'wb') as f:
            while remaining:
                chunk = stream.read(min(1 << 20, remaining))
                require(chunk, 'incomplete_transfer')
                remaining -= len(chunk)
                digest.update(chunk)
                f.write(chunk)
            require(stream.read(1) == b'', 'trailing_transfer')
            f.flush()
            os.fsync(f.fileno())
        require(digest.hexdigest() == manifest['archive'], 'checksum_before_load')
    except BaseException:
        archive.unlink(missing_ok=True)
        raise


def serve(stream=sys.stdin.buffer):
    require(os.geteuid() == 0 and not sys.argv[1:], 'broker_authority')
    def request_deadline(_signal, _frame):
        raise Blocked('request_deadline')
    signal.signal(signal.SIGALRM, request_deadline)
    signal.alarm(180)
    library = Path('/usr/local/lib/adilbaga-deploy')
    ls = library.lstat()
    require(stat.S_ISDIR(ls.st_mode) and ls.st_uid == 0 and stat.S_IMODE(ls.st_mode) == 0o755,
            'unapproved_library')
    secure_file(library / 'auto_broker.py', 0o644)
    secure_file(library / 'auto_smoke.py', 0o644)
    sys.path.insert(0, str(library))  # isolated Python: no user cwd/PYTHONPATH modules
    require(STATE.is_dir() and STATE.stat().st_uid == 0 and stat.S_IMODE(STATE.stat().st_mode) == 0o700,
            'broker_state_setup')
    with root_parent(STATE / 'state-check'):
        pass
    line = stream.readline(16385)
    require(len(line) <= 16384 and line.endswith(b'\n'), 'request_header')
    request = strict_json(line)
    op = request.get('operation')
    if op == 'status' and set(request) == {'operation'}:
        require(not any(json.loads(p.read_text()).get('status') == 'RUNNING'
                        for p in STATE.glob('*.json')), 'running_release_manual_review_or_wait')
        _, tag = release_tag()
        host = Host()
        host.preflight()
        return {'active': TAG.fullmatch(tag)[1], 'available': True}
    if op == 'result' and set(request) == {'operation', 'sha'}:
        require(SHA.fullmatch(request['sha']), 'status_sha')
        return json.loads((STATE / (request['sha'] + '.json')).read_text())
    require(op == 'submit' and set(request) == {'operation', 'manifest'}, 'operation_allowlist')
    m = request['manifest']
    validate_manifest(m)
    lock = os.open(STATE / 'lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(lock)
        raise Blocked('release_busy') from None
    require(not any(json.loads(p.read_text()).get('status') == 'RUNNING'
                    for p in STATE.glob('*.json')), 'incomplete_release_manual_review')
    archive_fd, archive_name = tempfile.mkstemp(prefix=m['sha'] + '-', suffix='.tar', dir=STATE)
    archive = Path(archive_name)
    result = STATE / (m['sha'] + '.json')
    try:
        receive_archive(stream, m, archive, fd=archive_fd)
        write_result(result, 'RUNNING')
        pid = os.fork()
        if pid == 0:
            os.setsid()
            signal.signal(signal.SIGHUP, signal.SIG_IGN)
            def interrupted(_signal, _frame):
                raise Blocked('worker_interrupted')
            signal.signal(signal.SIGTERM, interrupted)
            signal.signal(signal.SIGINT, interrupted)
            signal.signal(signal.SIGALRM, interrupted)
            signal.alarm(1800)
            # Worker failure is handled below; no payload/stdout leaked to SSH.
            for n in (0, 1, 2):
                os.dup2(os.open('/dev/null', os.O_RDWR), n)
            try:
                status = rollout(Host(), m, archive)
            except BaseException:
                status = 'BLOCKED_PREFLIGHT'
            write_result(result, status)
            archive.unlink(missing_ok=True)
            os.close(lock)
            os._exit(0)
        signal.alarm(0)
        return {'status': 'ACCEPTED'}
    except BaseException:
        archive.unlink(missing_ok=True)
        raise
    finally:
        os.close(lock)


if __name__ == '__main__':
    try:
        print(json.dumps(serve()), flush=True)
    except BaseException:
        print(json.dumps({'status': 'BLOCKED_BROKER'}), flush=True)
        sys.exit(1)
