// LOCAL synthetic provider only. No configurable executable/path/DSN/env input.
// A reviewed Go binary/custody integration requires separate approval; JSON
// files and caller callbacks cannot manufacture trusted projection evidence.
import { execFile, execFileSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { validateProjectionV2, prepareBeforeV2 } from './c2-manifest.mjs';
import { captureTiming, verdictCapture, deepFreeze, isProductionCapture } from './production-observer.mjs';
const execute = promisify(execFile), trusted = new WeakMap(), providers = new WeakMap();
const executable = process.execPath;
const script = fileURLToPath(new URL('./fixtures/projection-provider-v2.mjs', import.meta.url));
const fail = reason => ({ acceptance: 'INCONCLUSIVE', reason });
const production = new WeakMap();
const beforeBaselines = new WeakMap();
const authorityPath = '/etc/aktau-c2/authorization.json';
const deploymentPath = '/etc/aktau-c2/deployment.json';
const binaryPath = '/usr/local/libexec/aktau-c2/c2projection';
const clockPath = '/usr/local/libexec/aktau-c2/relayprobe';
const exact = (v, names) => v && Object.getPrototypeOf(v) === Object.prototype
  && Reflect.ownKeys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const hex = (v, n) => typeof v === 'string' && new RegExp(`^[a-f0-9]{${n}}$`).test(v) && v.length === n;

// POSIX ACL write permission for named users/groups is bounded by the group
// class mask represented in st_mode. Rejecting both group/other write also
// rejects effective extended-ACL write. Root/admin remains trusted.
function rootFile(file, max) {
  for (let p = path.dirname(file); ; p = path.dirname(p)) {
    const st = fs.lstatSync(p);
    if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== 0 || (st.mode & 0o022)) throw Error('authority');
    if (p === '/') break;
  }
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.uid !== 0 || st.nlink !== 1 || (st.mode & 0o022) || st.size < 1 || st.size > max) throw Error('authority');
    const bytes = fs.readFileSync(fd);
    if (bytes.length > max) throw Error('authority');
    return bytes;
  } finally { fs.closeSync(fd) }
}
function rootJSON(file) {
  const raw = rootFile(file, 16384).toString('utf8'), value = JSON.parse(raw);
  if (JSON.stringify(value) + '\n' !== raw) throw Error('authority');
  return value;
}
function readApproval() {
  const approved = rootJSON(authorityPath);
  if (!exact(approved, ['version', 'approved', 'sourceSha', 'binarySha256', 'clockSha256', 'buildId', 'platform'])
    || approved.version !== 1 || approved.approved !== true || !hex(approved.sourceSha, 40)
    || !hex(approved.binarySha256, 64) || !hex(approved.clockSha256, 64)
    || approved.platform !== 'linux/amd64' || process.arch !== 'x64'
    || !/^[a-zA-Z0-9_-]{1,80}$/.test(approved.buildId)) throw Error('authority');
  return approved;
}
// Future admin launch only: drop THIS process to the literal existing service
// account before constructing a provider. Never creates an account/approval or
// changes host permissions. Linux credential transition makes the process
// non-dumpable; same-UID /proc/fd access must not expose the private helper pipe.
export function dropProductionSupervisorPrivileges(options = {}) {
  if (!exact(options,[]) || process.platform!=='linux' || process.getuid()!==0 || process.geteuid()!==0) throw Error('launch_authority');
  const approved=readApproval(),bytes=rootFile(clockPath,64<<20);
  if(createHash('sha256').update(bytes).digest('hex')!==approved.clockSha256 || bytes.subarray(0,4).toString('hex')!=='7f454c46')throw Error('launch_authority');
  const raw=execFileSync(clockPath,['operator'],{env:{},timeout:500,maxBuffer:1024,stdio:['ignore','pipe','ignore']}).toString();
  const account=JSON.parse(raw);
  if(JSON.stringify(account)+'\n'!==raw || !exact(account,['uid','gid']) || !Number.isSafeInteger(account.uid)||account.uid<=0||!Number.isSafeInteger(account.gid)||account.gid<0)throw Error('launch_account');
  process.setgroups([]);process.setgid(account.gid);process.setuid(account.uid);
  const status=fs.readFileSync('/proc/self/status','utf8');
  if(process.getuid()!==account.uid||process.geteuid()!==account.uid||process.getgid()!==account.gid||process.getegid()!==account.gid
    || fs.statSync('/proc/self/status').uid!==0 || !['CapEff','CapPrm','CapInh'].every(k=>new RegExp('^'+k+':\\s+0+$','m').test(status)))throw Error('launch_unprotected');
  return Object.freeze({state:'NON_ROOT_PROTECTED'});
}
export function isProductionProvider(provider) { return production.has(provider) }
export function admitsProductionCapture(provider, before) {
  return production.has(provider) && ownsProviderBefore(provider, before);
}
export function productionIdentity(provider, attemptId, stage) {
  const state = production.get(provider);
  if (!state) throw Error('authority');
  return state.identity(attemptId, stage);
}
export function productionBeforeIdentity(provider, before) {
  const state = production.get(provider);
  if (!state || !ownsProviderBefore(provider, before)) throw Error('deployment_unverified');
  const identity = state.beforeIdentity();
  if (!identity || identity.attemptId !== before.attemptId || identity.frontendSha !== before.provenance.frontendSha) throw Error('deployment_unverified');
  return identity;
}
export async function productionClock(provider, signal) {
  const state = production.get(provider);
  if (!state) throw Error('authority');
  // Immutable root-controlled clock executable was hashed at construction.
  // Recheck small approval metadata, not a synchronous full-binary read while
  // FIFO intake is active. Root-controlled paths cannot be swapped by operator.
  state.checkApproval();
  const { stdout } = await execute(clockPath, ['clock'], { env: {}, timeout: 2000, maxBuffer: 1024, signal });
  return JSON.parse(stdout);
}
// Actual SO_PEERCRED from the accepted Unix socket, not caller JSON. The same
// independently approved immutable clock ELF exposes this one fd-only helper.
export function productionReadyRelay(provider, attemptId) {
  const state = production.get(provider);
  if (!state || !hex(attemptId,32)) throw Error('authority');
  state.checkApproval();
  return spawn(clockPath,['ready-server',attemptId],{env:{},stdio:['pipe','pipe','ignore']});
}
export function providerBeforeBaseline(provider, before) {
  if (!ownsProviderBefore(provider, before)) throw Error('authority');
  const baseline = beforeBaselines.get(before);
  if (!baseline || baseline.snapshotId !== before.snapshotId) throw Error('baseline');
  return baseline;
}

export function productionReadyAuthority(provider, before) {
  const initial = productionBeforeIdentity(provider, before);
  const a = rootJSON('/etc/aktau-c2/ready.json');
  const names = ['version', 'attemptId', 'sourceSha', 'frontendSha', 'deploymentId', 'confirmedAt', 'bootId',
    'operatorUid', 'operatorGid', 'supervisorPid', 'supervisorStartTicks', 'nodeExecutable', 'nodeSha256', 'commandSha256',
    'supervisorSha256', 'ingestSha256', 'relaySha256', 'expiresAt'];
  const now = Date.now(), expires = Date.parse(a?.expiresAt), confirmed = Date.parse(a?.confirmedAt);
  if (!exact(a, names) || Object.keys(a).join() !== names.join() || a.version !== 1
    || a.attemptId !== before.attemptId || a.sourceSha !== before.provenance.sourceSha
    || a.frontendSha !== initial.frontendSha || a.deploymentId !== initial.deploymentId
    || a.confirmedAt !== new Date(initial.confirmedAt).toISOString() || a.operatorUid !== process.geteuid()
    || a.operatorGid !== process.getegid() || a.supervisorPid !== process.pid
    || process.getuid()!==process.geteuid() || process.getgid()!==process.getegid()
    || a.nodeExecutable!==process.execPath || !/^\/[a-zA-Z0-9_./-]{1,255}$/.test(a.nodeExecutable) || path.normalize(a.nodeExecutable)!==a.nodeExecutable || fs.statSync('/proc/self/status').uid!==0
    || typeof a.supervisorStartTicks !== 'string' || !/^[1-9][0-9]{0,19}$/.test(a.supervisorStartTicks)
    || !Number.isFinite(expires) || !Number.isFinite(confirmed) || new Date(expires).toISOString() !== a.expiresAt
    || a.expiresAt.length !== 24 || confirmed > now || expires <= now || expires - confirmed > 35 * 60000
    || a.bootId !== fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()
    || ['nodeSha256', 'commandSha256', 'supervisorSha256', 'ingestSha256','relaySha256'].some(k => !hex(a[k], 64))) throw Error('ready_authority');
  const approved=rootJSON(authorityPath);
  if(a.relaySha256!==approved.clockSha256 || a.sourceSha!==approved.sourceSha)throw Error('ready_authority');
  const fields = fs.readFileSync('/proc/self/stat', 'utf8').replace(/^.*\) /, '').trim().split(/\s+/);
  if (fields[19] !== a.supervisorStartTicks || fs.statSync('/proc/' + fields[1]).uid !== 0
    || !fs.readFileSync('/proc/self/status', 'utf8').includes('TracerPid:\t0\n')) throw Error('ready_process');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  if (hash(rootFile(process.execPath, 256 << 20)) !== a.nodeSha256
    || hash(fs.readFileSync('/proc/self/cmdline')) !== a.commandSha256
    || hash(rootFile(fileURLToPath(new URL('./c2-production-supervisor.mjs', import.meta.url)), 2 << 20)) !== a.supervisorSha256) throw Error('ready_process');
  return deepFreeze(structuredClone(a));
}
export function recheckProductionReadyAuthority(provider,authority) {
  const state=production.get(provider);
  if(!state || JSON.stringify(rootJSON('/etc/aktau-c2/ready.json'))!==JSON.stringify(authority)
    || Date.now()>=Date.parse(authority.expiresAt)||fs.statSync('/proc/self/status').uid!==0)throw Error('ready_authority_changed');
  state.checkApproval();
}
// No caller-selected path, execution callback, digest, approval or environment.
// Nonsecret metadata root0644, directories root0755, executables root0555:
// readable/executable by aktau-sync, never writable by it. Installation is NOT
// performed here. Local fixtures cannot mint this capability.
export function createProductionProjectionProvider(options = {}) {
  if (!exact(options, []) || process.platform !== 'linux' || process.geteuid() === 0) throw Error('authority');
  const approved = readApproval();
  function verify() {
    if (JSON.stringify(rootJSON(authorityPath)) !== JSON.stringify(approved)) throw Error('authority');
    for (const [file, digest] of [[binaryPath, approved.binarySha256], [clockPath, approved.clockSha256]]) {
      const bytes = rootFile(file, 64 * 1024 * 1024);
      if (bytes.subarray(0, 4).toString('hex') !== '7f454c46'
        || createHash('sha256').update(bytes).digest('hex') !== digest) throw Error('authority');
    }
  }
  let agreedBefore = null, identityDrift = false;
  function identity(attemptId, stage) {
    if (identityDrift || !['before', 'after'].includes(stage)) throw Error('deployment_changed');
    verify();
    const d = rootJSON(deploymentPath);
    if (!exact(d, ['version', 'attemptId', 'stage', 'alias', 'deploymentId', 'frontendSha', 'ready', 'target', 'confirmedAt', 'optInInactive', 'legitimatePublication'])
      || d.version !== 1 || d.attemptId !== attemptId || d.stage !== stage || d.alias !== 'aktau.market'
      || d.ready !== true || d.target !== 'Production' || d.legitimatePublication !== true || !hex(d.frontendSha, 40)
      || !/^dpl_[a-zA-Z0-9]{1,80}$/.test(d.deploymentId) || !Number.isSafeInteger(d.confirmedAt)
      || typeof d.optInInactive !== 'boolean' || (stage === 'after' && !d.optInInactive)
      || Date.now() - d.confirmedAt < 0 || Date.now() - d.confirmedAt > 35 * 60 * 1000) throw Error('deployment_unverified');
    if (stage === 'before') {
      // Supervisor and CLI must consume the same complete, independently read
      // BEFORE attestation. Never silently replace the first trusted identity.
      if (agreedBefore && JSON.stringify(d) !== JSON.stringify(agreedBefore)) {
        identityDrift = true; throw Error('deployment_changed');
      }
      agreedBefore ??= deepFreeze(structuredClone(d));
      return agreedBefore;
    }
    const invariant = ['version', 'attemptId', 'alias', 'deploymentId', 'frontendSha', 'ready', 'target', 'legitimatePublication'];
    if (!agreedBefore || invariant.some(k => d[k] !== agreedBefore[k]) || d.confirmedAt < agreedBefore.confirmedAt) {
      identityDrift = true; throw Error('deployment_changed');
    }
    return deepFreeze(structuredClone(d));
  }
  verify();
  // Read credential only in a separately authorized operator invocation.
  const credential = '/var/lib/aktau-sync/c2/reader.dsn';
  for (let p = path.dirname(credential); p !== '/'; p = path.dirname(p)) {
    const st = fs.lstatSync(p);
    if (!st.isDirectory() || st.isSymbolicLink() || ![0, process.geteuid()].includes(st.uid) || (st.mode & 0o022)) throw Error('credential');
  }
  const fd = fs.openSync(credential, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let databaseURL;
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.uid !== process.geteuid() || (st.mode & 0o7777) !== 0o600 || st.nlink !== 1 || st.size > 8192) throw Error('credential');
    databaseURL = fs.readFileSync(fd, 'utf8').trim();
  } finally { fs.closeSync(fd) }
  const url = new URL(databaseURL);
  let username;
  try { username = decodeURIComponent(url.username) } catch { throw Error('credential') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname
    || /^aktau_api_runtime(?:\.[a-z0-9]{20})?$/.exec(username)?.[0] !== username
    || !url.password) throw Error('credential');
  // Frontend identity is bound per attempt at BEFORE, not to current main.
  let initial = null;
  const provider = createProvider({ sourceSha: approved.sourceSha, frontendSha: null, run: async (args, phase) => {
    verify();
    const attemptId = args[args.indexOf('-attempt') + 1];
    if (phase === 'before-canonical-mutation') {
      if (initial) throw Error('attempt_already_prepared');
      initial = identity(attemptId, 'before');
    }
    if (!initial || initial.attemptId !== attemptId) throw Error('deployment_unverified');
    if (phase === 'after-commit') {
      const current = rootJSON(deploymentPath);
      identity(attemptId, current.stage); // same bound deployment, before or after attestation
    }
    args = args.map((v, i) => args[i - 1] === '-frontend-sha' ? initial.frontendSha : v);
    return execute(binaryPath, args, { env: { APP_ENV: 'production', C2_PROJECTION_DATABASE_URL: databaseURL },
      timeout: 10000, maxBuffer: 64 * 1024, encoding: 'utf8', windowsHide: true });
  }, frontendIdentity: () => initial?.frontendSha });
  production.set(provider, { verify, identity, beforeIdentity: () => {
    if (!initial || identityDrift) return null;
    return identity(initial.attemptId, 'before');
  }, checkApproval: () => {
    if (JSON.stringify(rootJSON(authorityPath)) !== JSON.stringify(approved)) throw Error('authority');
  } });
  return provider;
}

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
function createProvider({ run, sourceSha, frontendSha, frontendIdentity }) {
  const custody = {};
  const settled = new WeakSet();
  async function load(args, phase, attemptId, ready = false) {
    try {
      const { stdout } = await run(args, phase);
      let p = JSON.parse(stdout), baseline;
      // Go's one compact JSON + LF protocol also rejects duplicate keys,
      // multiple objects/trailing data; body digest is of those exact bytes.
      if (JSON.stringify(p) + '\n' !== stdout || Buffer.byteLength(stdout) >= 16 * 1024) throw Error();
      if (ready) {
        if (!exact(p, ['projection', 'baseline']) || Object.keys(p).join() !== 'projection,baseline'
          || !exact(p.baseline, ['snapshotId', 'publishedAt']) || Object.keys(p.baseline).join() !== 'snapshotId,publishedAt'
          || p.baseline.snapshotId !== p.projection?.snapshotId || typeof p.baseline.publishedAt !== 'string'
          || p.baseline.publishedAt.length !== 24 || new Date(p.baseline.publishedAt).toISOString() !== p.baseline.publishedAt) throw Error();
        baseline = p.baseline; p = p.projection;
      }
      validateProjectionV2(p, phase, attemptId);
      if (p.provenance.sourceSha !== sourceSha || p.provenance.frontendSha !== (frontendIdentity ? frontendIdentity() : frontendSha)
        || p.provenance.canonicalStateId !== createHash('sha256').update(JSON.stringify(p.body)).digest('hex')) throw Error();
      const result = deepFreeze(structuredClone(p)); trusted.set(result, custody);
      if (baseline) beforeBaselines.set(result, deepFreeze(structuredClone(baseline)));
      return result;
    } catch { return null }
  }
  const provider = Object.freeze({ fixtureOnly: true,
    async before(attemptId) {
      if (typeof attemptId !== 'string' || attemptId.length !== 32 || !/^[0-9a-f]{32}$/.test(attemptId)) return null;
      return load(['-phase', 'before', '-attempt', attemptId, '-frontend-sha', frontendSha], 'before-canonical-mutation', attemptId);
    },
    async beforeReady(attemptId) {
      if (typeof attemptId !== 'string' || attemptId.length !== 32 || !/^[0-9a-f]{32}$/.test(attemptId)) return null;
      return load(['-phase', 'ready-before', '-attempt', attemptId, '-frontend-sha', frontendSha], 'before-canonical-mutation', attemptId, true);
    },
    async after(capture, before) {
      const stop = reason => ({ ...fail(reason), request_count: capture?.request_count ?? 0, results: [], events: [] });
      const timing = captureTiming(capture), selected = prepareBeforeV2(before);
      if (production.has(provider) && !isProductionCapture(capture, provider)) return stop('untrusted_production_capture');
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
