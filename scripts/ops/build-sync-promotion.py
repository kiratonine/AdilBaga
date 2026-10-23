#!/usr/bin/env python3
"""Build one public immutable sync/C2 artifact off-host; never authorizes it."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile

REPO = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('promotion_build_protocol', REPO / 'ops/c2/publisher-promotion.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


def call(args, *, cwd=REPO, env=None, cap=256 << 20):
    r = subprocess.run(args, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=600)
    p.need(r.returncode == 0 and len(r.stdout) <= cap, 'build_command')
    return r.stdout


def build(sha, output, producer, kind):
    p.need(type(sha) is str and p.SHA.fullmatch(sha), 'source_sha')
    target = Path(output)
    p.need(target.is_absolute() and not target.exists() and target.parent.is_dir(), 'output_no_clobber')
    p.need(call(['git', '--no-replace-objects', 'rev-parse', sha + '^{commit}']).decode().strip() == sha)
    env = {'PATH': os.environ['PATH'], 'HOME': os.environ['HOME'], 'LANG': 'C.UTF-8',
           'GOTOOLCHAIN': 'local', 'CGO_ENABLED': '0', 'GOOS': 'linux', 'GOARCH': 'amd64'}
    p.need(call(['go', 'version'], env=env) == b'go version go1.27.3 linux/amd64\n', 'build_go_version')
    node = Path(shutil.which('node')).resolve()
    p.need(call([str(node), '--version'], env=env) == b'v24.18.0\n', 'build_node_version')
    with tempfile.TemporaryDirectory(prefix='aktau-sync-build-') as temp:
        work = Path(temp)
        archive = call(['git', 'archive', '--format=tar', sha, 'backend-go'])
        with tarfile.open(fileobj=io.BytesIO(archive), mode='r:') as tar:
            for m in tar.getmembers():
                p.need(not m.name.startswith('/') and '..' not in Path(m.name).parts
                       and (m.isfile() or m.isdir()), 'source_archive')
            tar.extractall(work, filter='data')
        contents = {'node': node.read_bytes()}
        for name, command in [('c2projection', './cmd/c2projection'), ('relayprobe', './internal/revalidation/testdata/relayprobe'), ('ingest', './cmd/ingest')]:
            args = ['go', 'build', '-trimpath']
            if name == 'c2projection': args += ['-ldflags', '-X main.sourceSHA=' + sha]
            args += ['-o', str(work / name), command]
            call(args, cwd=work / 'backend-go', env=env)
            contents[name] = (work / name).read_bytes()
        for name, source in p.source_paths().items():
            contents[name] = call(['git', '--no-replace-objects', 'show', sha + ':' + source])
        contents['source-manifest.json'] = p.canonical({'sourceSha': sha, 'recipe': p.RECIPE, 'nodeMajor': 24})
        # A new isolated object store prevents changing any source worktree ref.
        bare = work / 'source.git'
        call(['git', 'init', '--bare', str(bare)])
        call(['git', '--git-dir=' + str(bare), 'fetch', '--no-tags', str(REPO), sha + ':refs/heads/publisher'])
        bundle = work / 'source.bundle'
        call(['git', '--git-dir=' + str(bare), 'bundle', 'create', str(bundle), 'refs/heads/publisher'])
        contents['source.bundle'] = bundle.read_bytes()
        p.need(kind in ['initial', 'build-only', 'promote'], 'build_kind')
        manifest = {'version': 1, 'kind': kind, 'sourceSha': sha,
                    'sourceTree': call(['git', 'rev-parse', sha + '^{tree}']).decode().strip(),
                    'goVersion': 'go1.27.3', 'nodeVersion': 'v24.18.0', 'recipe': p.RECIPE,
                    **producer, 'files': {n: p.digest(contents[n]) for n in p.FILES},
                    'sourceBundleSha256': p.digest(contents['source.bundle'])}
        contents['promotion.json'] = p.canonical(manifest)
        p.validate_package(contents, sha)
        # Tar metadata is deterministic; no source workspace, credential or env.
        with target.open('xb') as f, tarfile.open(fileobj=f, mode='w', format=tarfile.USTAR_FORMAT) as tar:
            for name in sorted(contents):
                raw = contents[name]; member = tarfile.TarInfo(name)
                member.mode = 0o555 if name in ['node', 'ingest', 'c2projection', 'relayprobe'] else 0o444
                member.size = len(raw); member.mtime = 0; member.uid = member.gid = 0
                tar.addfile(member, io.BytesIO(raw))
        p.need(target.stat().st_size <= p.MAX_TAR, 'package_size')
        return {'sourceSha': sha, 'archiveSha256': hashlib.file_digest(target.open('rb'), 'sha256').hexdigest(),
                'archiveSize': target.stat().st_size, 'files': manifest['files']}


if __name__ == '__main__':
    try:
        p.need(len(sys.argv) == 8, 'build_usage')
        producer = dict(zip(['ciRunId', 'ciAttempt', 'buildRunId', 'buildAttempt'], [int(v) for v in sys.argv[3:7]]))
        p.need(all(type(v) is int and v >= 0 for v in producer.values()), 'build_identity')
        print(json.dumps(build(sys.argv[1], sys.argv[2], producer, sys.argv[7])))
    except BaseException:
        print('BLOCKED_BUILD', file=sys.stderr)
        sys.exit(1)
