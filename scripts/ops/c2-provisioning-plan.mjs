// Nonprivileged, pure plan. A plan is NOT independent approval or capability.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
export const NODE_FILES = Object.freeze(['c2-production-supervisor.mjs', 'projection-provider.mjs',
  'fifo-adapter.mjs', 'production-observer.mjs', 'c2-manifest.mjs']);
export const BUILD_RECIPE = 'CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-X main.sourceSHA=<sourceSha>" ./cmd/c2projection; CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath ./internal/revalidation/testdata/relayprobe';

// Explicit local artifact inspection, NOT approval. Proves bundle source bytes
// match the full immutable Git object; binaries still need independent review.
export function reviewBundle(directory, sourceSha) {
  if (typeof sourceSha !== 'string' || !/^[0-9a-f]{40}$/.test(sourceSha)
    || !path.isAbsolute(directory) || fs.realpathSync(directory) !== directory) throw Error('BLOCKED');
  const names = ['c2projection', 'relayprobe', ...NODE_FILES, 'source-manifest.json'];
  if (fs.readdirSync(directory).sort().join() !== [...names].sort().join()) throw Error('BLOCKED');
  const source = { sourceSha, recipe: BUILD_RECIPE, nodeMajor: 24 };
  const hashes = {};
  for (const name of names) {
    const file = path.join(directory, name), s = fs.lstatSync(file);
    if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || s.size < 1 || s.size > 64 * 1024 * 1024
      || s.uid !== process.geteuid() || (s.mode & 0o022)) throw Error('BLOCKED');
    const data = fs.readFileSync(file);
    if (NODE_FILES.includes(name)) {
      const r = spawnSync('git', ['show', `${sourceSha}:scripts/revalidation/${name}`], {
        cwd: path.resolve(import.meta.dirname, '../..'), env: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', HOME: '/nonexistent' },
        maxBuffer: 2 * 1024 * 1024, timeout: 5000,
      });
      if (r.status !== 0 || !data.equals(r.stdout)) throw Error('BLOCKED');
    } else if (name === 'source-manifest.json') {
      if (data.toString() !== JSON.stringify(source) + '\n') throw Error('BLOCKED');
    } else if (data.subarray(0, 6).toString('hex') !== '7f454c460201' || data.readUInt16LE(18) !== 62) throw Error('BLOCKED');
    hashes[name] = createHash('sha256').update(data).digest('hex');
  }
  return Object.freeze({ status: 'REVIEW_REQUIRED_NOT_APPROVAL', ...source, files: Object.freeze(hashes) });
}
export function preparePlan(options = {}) {
  if (Reflect.ownKeys(options).length) throw Error('untrusted_approval');
  return Object.freeze({ status: 'C2_READY_FOR_APPROVAL', platform: 'linux/amd64',
    approval: '/etc/aktau-c2-install/approval.json',
    bundle: '/var/lib/aktau-c2-install/bundle',
    installer: 'ops/c2/install-reviewed-c2.py',
    creates: Object.freeze(['/usr/local/libexec/aktau-c2', '/etc/aktau-c2', '/var/lib/aktau-sync/c2']),
    neverCreates: Object.freeze(['deployment.json', 'reader.dsn', 'publisher_hook', 'systemd_unit']),
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length === 2) console.log(preparePlan().status);
    else if (process.argv.length === 5 && process.argv[2] === '--review-bundle') {
      console.log(JSON.stringify(reviewBundle(process.argv[3], process.argv[4])));
    } else throw Error('BLOCKED');
  } catch { console.log('BLOCKED'); process.exitCode = 1 }
}
