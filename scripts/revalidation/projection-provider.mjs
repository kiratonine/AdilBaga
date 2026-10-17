// LOCAL synthetic provider only. No configurable executable/path/DSN/env input.
// A reviewed Go binary/custody integration requires separate approval; JSON
// files and caller callbacks cannot manufacture trusted projection evidence.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { validateProjectionV2, prepareBeforeV2 } from './c2-manifest.mjs';
import { captureTiming, verdictCapture, deepFreeze } from './production-observer.mjs';
const execute = promisify(execFile), trusted = new WeakMap(), providers = new WeakMap();
const executable = process.execPath;
const script = fileURLToPath(new URL('./fixtures/projection-provider-v2.mjs', import.meta.url));
const fail = reason => ({ acceptance: 'INCONCLUSIVE', reason });

export function isSyntheticProjection(value) { return trusted.has(value) }
export function sameSyntheticCustody(before, after) {
  return sameProviderCustody(before, after);
}
export function sameProviderCustody(before, after) {
  return trusted.has(before) && trusted.has(after) && trusted.get(before) === trusted.get(after);
}
export function ownsSyntheticBefore(provider, before) {
  return ownsProviderBefore(provider, before);
}
export function ownsProviderBefore(provider, before) {
  return providers.has(provider) && trusted.has(before) && providers.get(provider) === trusted.get(before);
}
export function createSyntheticProjectionProvider({ scenario = 'valid', failurePhase = 'before' } = {}) {
  if (!['valid', 'timeout', 'invalid_json', 'oversized', 'unchanged', 'wrong_previous', 'wrong_witness', 'wrong_sha',
    'wrong_attempt', 'wrong_snapshot', 'bad_hash', 'unqualified'].includes(scenario)) throw Error('invalid_synthetic_scenario');
  if (!['before', 'after'].includes(failurePhase)) throw Error('invalid_synthetic_scenario');
  return createProvider({ sourceSha: 'b'.repeat(40), frontendSha: 'c'.repeat(40),
    run: (args, phase) => execute(executable, [script, ...args], { env: { C2_SYNTHETIC_SCENARIO:
      (phase === 'after-commit' ? 'after' : 'before') === failurePhase ? scenario : 'valid' },
    timeout: 10000, maxBuffer: 64 * 1024, encoding: 'utf8', windowsHide: true }) });
}

// Registry remains private. Only these reviewed factories mint custody, never
// JSON, files, flags or caller-supplied execution callbacks.
function createProvider({ run, sourceSha, frontendSha }) {
  const custody = {};
  const settled = new WeakSet();
  async function load(args, phase, attemptId) {
    try {
      const { stdout } = await run(args, phase);
      const p = JSON.parse(stdout);
      // Go's one compact JSON + LF protocol also rejects duplicate keys,
      // multiple objects/trailing data; body digest is of those exact bytes.
      if (JSON.stringify(p) + '\n' !== stdout || Buffer.byteLength(stdout) >= 16 * 1024) throw Error();
      validateProjectionV2(p, phase, attemptId);
      if (p.provenance.sourceSha !== sourceSha || p.provenance.frontendSha !== frontendSha
        || p.provenance.canonicalStateId !== createHash('sha256').update(JSON.stringify(p.body)).digest('hex')) throw Error();
      const result = deepFreeze(structuredClone(p)); trusted.set(result, custody); return result;
    } catch { return null }
  }
  const provider = Object.freeze({ fixtureOnly: true,
    async before(attemptId) {
      if (typeof attemptId !== 'string' || attemptId.length !== 32 || !/^[0-9a-f]{32}$/.test(attemptId)) return null;
      return load(['-phase', 'before', '-attempt', attemptId, '-frontend-sha', frontendSha], 'before-canonical-mutation', attemptId);
    },
    async after(capture, before) {
      const stop = reason => ({ ...fail(reason), request_count: capture?.request_count ?? 0, results: [], events: [] });
      const timing = captureTiming(capture), selected = prepareBeforeV2(before);
      if (!timing || trusted.get(before) !== custody || selected.status !== 'ready') return stop('untrusted_capture_or_before');
      if (settled.has(capture)) return stop('after_already_requested');
      settled.add(capture);
      if (timing.ageMs < 0 || timing.ageMs > 60000 || timing.now < timing.completedAt) return stop('after_late');
      const receipt = timing.receipt;
      if (!receipt || receipt.status !== 204 || receipt.attemptId !== before.attemptId || typeof receipt.snapshotId !== 'string'
        || receipt.snapshotId.length !== 36 || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(receipt.snapshotId)) return stop('event_mismatch');
      const after = await load(['-phase', 'after', '-attempt', before.attemptId, '-frontend-sha', before.provenance.frontendSha,
        '-snapshot', receipt.snapshotId, '-previous', before.snapshotId, '-witness', selected.witness.id, '-slug', selected.witness.slug], 'after-commit', before.attemptId);
      if (captureTiming(capture).ageMs > 60000) return stop('after_late');
      if (!after) return stop('after_unavailable');
      return verdictCapture(capture, before, after);
    },
  });
  providers.set(provider, custody);
  return provider;
}

// Production-disabled: exact disposable credentials/DB, loopback, private owned
// temporary directory and pinned ELF only. No general executable/DSN adapter.
export function createLocalGoProjectionProvider({ directory, binarySha256, sourceSha, frontendSha, databaseURL }) {
  const reject = () => { throw Error('invalid_local_projection_profile') };
  if (process.platform !== 'linux' || typeof directory !== 'string' || !path.isAbsolute(directory)
    || path.normalize(directory) !== directory || !directory.startsWith(os.tmpdir() + '/aktau-c2-joint-')
    || binarySha256?.length !== 64 || !/^[0-9a-f]{64}$/.test(binarySha256 ?? '')
    || sourceSha?.length !== 40 || !/^[0-9a-f]{40}$/.test(sourceSha ?? '')
    || frontendSha?.length !== 40 || !/^[0-9a-f]{40}$/.test(frontendSha ?? '')) reject();
  let url;
  try { url = new URL(databaseURL) } catch { reject() }
  if (url.protocol !== 'postgres:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || !url.port
    || url.pathname !== '/part16_c2' || url.username !== 'aktau_api_runtime' || url.password !== 'ci-local-only'
    || url.search !== '?sslmode=disable' || url.hash) reject();
  const binary = path.join(directory, 'c2projection');
  function identity() {
    for (let p = directory; ; p = path.dirname(p)) {
      const st = fs.lstatSync(p);
      if (!st.isDirectory() || st.isSymbolicLink() || (st.uid !== 0 && st.uid !== process.geteuid())
        || ((st.mode & 0o022) !== 0 && !(st.uid === 0 && (st.mode & 0o1000)))) reject();
      if (p === directory && (st.uid !== process.geteuid() || (st.mode & 0o777) !== 0o700)) reject();
      if (p === '/') break;
    }
    const fd = fs.openSync(binary, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const st = fs.fstatSync(fd);
      if (st.size > 64 * 1024 * 1024) reject();
      const bytes = fs.readFileSync(fd);
      if (!st.isFile() || st.uid !== process.geteuid() || (st.mode & 0o7777) !== 0o700
        || bytes.subarray(0, 4).toString('hex') !== '7f454c46'
        || createHash('sha256').update(bytes).digest('hex') !== binarySha256) reject();
    } finally { fs.closeSync(fd) }
  }
  try { identity() } catch { reject() }
  return createProvider({ sourceSha, frontendSha, run: args => {
    identity();
    return execute(binary, args, { env: { APP_ENV: 'production', C2_PROJECTION_DATABASE_URL: databaseURL },
      timeout: 10000, maxBuffer: 64 * 1024, encoding: 'utf8', windowsHide: true });
  } });
}
