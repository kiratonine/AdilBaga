// Mandatory Linux root sandbox; never silently replace distinct UID proof with mocks.
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { root, run } from './common.mjs';

if (process.platform !== 'linux') throw new Error('distinct-UID integration requires Linux + Docker');
const goRoot = realpathSync(run('Go SDK root', 'go', ['env', 'GOROOT']));
if (run('Go version', join(goRoot, 'bin/go'), ['version']) !== 'go version go1.27.3 linux/amd64') {
  throw new Error('root bundle qualification requires Go1.27.3 linux/amd64');
}
const id = `aktau-bundle-root-${randomUUID()}`;
let built = false;
try {
  run('Docker prerequisite', 'docker', ['version', '--format', '{{.Server.Version}}']);
  run('Build owned isolated root fixture', 'docker', ['build', '--tag', id,
    dirname(join(root, 'ops/c2/fixtures/bundle-root/Dockerfile'))]);
  built = true;
  console.log(run('Real root/runuser/Git FD + executor pair crash/recovery qualification (0 SKIP)', 'docker', [
    'run', '--name', id, '--rm', '--network', 'none', '--cap-drop', 'ALL',
    ...['SETUID', 'SETGID', 'CHOWN', 'DAC_OVERRIDE', 'KILL'].flatMap(c => ['--cap-add', c]),
    '--security-opt', 'no-new-privileges', '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,size=1073741824',
    '--memory', '2g', '--cpus', '2', '--pids-limit', '128',
    '--mount', `type=bind,src=${root},dst=/src,readonly`,
    '--mount', `type=bind,src=${goRoot},dst=/usr/local/go,readonly`, id,
    'python3', '-B', 'ops/c2/root_executor_pair_integration.py',
  ]));
} finally {
  // Only this invocation's random, owned resources; never prune/reuse host containers.
  // rm may report not-found after --rm; an inspection distinguishes absence from failure.
  const { spawnSync } = await import('node:child_process');
  const removed = spawnSync('docker', ['rm', '-f', id], { encoding: 'utf8', timeout: 15_000 });
  if (removed.status !== 0) {
    const names = run('Root fixture cleanup inventory', 'docker', ['ps', '-aq', '--filter', `name=^/${id}$`]);
    if (names) throw new Error('root fixture cleanup unverified');
  }
  if (built) run('Remove owned fixture image', 'docker', ['image', 'rm', id]);
}
