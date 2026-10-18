// Operator library only: no autorun, scheduler, credential provisioning or
// systemd administration. Production execution requires separate authorization.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createProductionProjectionProvider, productionIdentity, productionBeforeIdentity } from './projection-provider.mjs';
import { calibrateProductionClock, openPersistentReceiver } from './fifo-adapter.mjs';
import { prepareBeforeV2 } from './c2-manifest.mjs';

const directory = '/var/lib/aktau-sync/c2';
const id = v => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v) && v.length === 32;
const inconclusive = reason => ({ acceptance: 'INCONCLUSIVE', reason, request_count: 0 });
const terminal = s => s === 'completed' || s === 'inconclusive';
function privateDirectory(dir) {
  if (!path.isAbsolute(dir) || path.normalize(dir) !== dir) throw Error('ledger_directory');
  for (let p = dir; ; p = path.dirname(p)) {
    const st = fs.lstatSync(p);
    if (!st.isDirectory() || st.isSymbolicLink() || ![0, process.geteuid()].includes(st.uid)
      || ((st.mode & 0o022) && !(p !== dir && st.uid === 0 && (st.mode & 0o1000)))
      || (p === dir && (st.uid !== process.geteuid() || (st.mode & 0o7777) !== 0o700))) throw Error('ledger_directory');
    if (p === '/') break;
  }
}
function syncDirectory(dir) {
  const fd = fs.openSync(dir, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}
function read(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.uid !== process.geteuid() || st.nlink !== 1 || (st.mode & 0o7777) !== 0o600 || st.size > 4 * 1024 * 1024) throw Error('ledger_corrupt');
    return JSON.parse(fs.readFileSync(fd, 'utf8'));
  } finally { fs.closeSync(fd) }
}
function atomic(file, value) {
  const raw = JSON.stringify(value) + '\n';
  if (Buffer.byteLength(raw) > 4 * 1024 * 1024) throw Error('ledger_capacity');
  const temp = file + '.' + randomBytes(16).toString('hex') + '.pending';
  const fd = fs.openSync(temp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try {
    const bytes = Buffer.from(raw); let offset = 0;
    while (offset < bytes.length) {
      const n = fs.writeSync(fd, bytes, offset, bytes.length - offset);
      if (n < 1) throw Error('ledger_write'); offset += n;
    }
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd) }
  fs.renameSync(temp, file); syncDirectory(path.dirname(file));
}
// No production capability is minted here. Exported for local durability tests.
export function openAttemptLedger(dir) {
  privateDirectory(dir);
  const lock = path.join(dir, 'operator.lock');
  const fd = fs.openSync(lock, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.fsyncSync(fd); syncDirectory(dir) } finally { fs.closeSync(fd) }
  // Any failure leaves the lock as a deliberate recovery interlock. No automatic
  // stale PID cleanup: SIGKILL/reboot is not proof that a new attempt is safe.
  if (fs.readdirSync(dir).some(n => n.endsWith('.pending'))) throw Error('ledger_incomplete');
  const file = path.join(dir, 'attempts.json');
  let entries = fs.existsSync(file) ? read(file) : [];
  if (!Array.isArray(entries) || entries.length > 1000) throw Error('ledger_corrupt');
  const seen = new Set();
  for (const e of entries) {
    if (!e || !id(e.attemptId) || seen.has(e.attemptId) || !terminal(e.state)
      || !['PASS', 'FAIL', 'INCONCLUSIVE'].includes(e.verdict)
      || !Array.isArray(e.transitions) || e.transitions[0] !== 'prepared' || e.transitions.at(-1) !== e.state
      || !Array.isArray(e.history) || e.history.length !== e.transitions.length
      || e.history.some((h, i) => h?.state !== e.transitions[i] || !Number.isSafeInteger(h.atUTC))
      || (e.state === 'completed' && (e.transitions.join() !== 'prepared,armed,event_consumed,completed' || e.evidence?.acceptance !== e.verdict))
      || (e.state === 'inconclusive' && e.verdict !== 'INCONCLUSIVE')) throw Error('ledger_incomplete');
    seen.add(e.attemptId);
  }
  let active = null, closed = false, poisoned = false;
  function save(next) {
    if (poisoned) throw Error('ledger_unavailable');
    try { privateDirectory(dir); atomic(file, next); entries = next }
    catch (e) { poisoned = true; throw e }
  }
  return Object.freeze({
    prepare() {
      if (active || closed) throw Error('attempt_state');
      const attemptId = randomBytes(16).toString('hex');
      if (seen.has(attemptId)) throw Error('attempt_reuse');
      active = { attemptId, state: 'prepared', transitions: ['prepared'],
        history: [{ state: 'prepared', atUTC: Date.now(), evidence: null }], verdict: 'INCONCLUSIVE', evidence: null };
      save([...entries, active]); return attemptId;
    },
    transition(state, evidence = null) {
      if (!active || closed || !({ prepared: ['armed', 'inconclusive'], armed: ['event_consumed', 'inconclusive'], event_consumed: ['completed', 'inconclusive'] })[active.state]?.includes(state)) throw Error('attempt_state');
      const verdict = state === 'completed' ? evidence?.acceptance : 'INCONCLUSIVE';
      if (!['PASS', 'FAIL', 'INCONCLUSIVE'].includes(verdict)) throw Error('attempt_state');
      const next = { ...active, state, transitions: [...active.transitions, state],
        history: [...active.history, { state, atUTC: Date.now(), evidence }], verdict, evidence };
      save([...entries.slice(0, -1), next]); active = next;
    },
    series() {
      if (poisoned) throw Error('ledger_unavailable');
      let count = 0;
      for (const e of entries) { if (e.verdict === 'FAIL') count = 0; else if (e.state === 'completed' && e.verdict === 'PASS') count++ }
      return count;
    },
    checkpoint(evidence) {
      if (!active || closed || terminal(active.state)) throw Error('attempt_state');
      const next = { ...active, checkpoints: [...(active.checkpoints ?? []), { atUTC: Date.now(), evidence }] };
      save([...entries.slice(0, -1), next]); active = next;
    },
    close() {
      if (poisoned || closed || !active || !terminal(active.state)) throw Error('attempt_incomplete');
      fs.unlinkSync(lock); syncDirectory(dir); closed = true;
    },
  });
}

export async function prepareObservation(options = {}) {
  if (Reflect.ownKeys(options).length) throw Error('operator_options');
  // Fixed independent authority before any ledger/FIFO or network activity.
  const provider = createProductionProjectionProvider();
  const ledger = openAttemptLedger(path.join(directory, 'ledger'));
  const attemptId = ledger.prepare();
  let observed = false, result = null, initial = null, completedUTC = null;
  return Object.freeze({ attemptId,
    async observe() {
      if (observed) throw Error('attempt_reuse'); observed = true;
      let receiver;
      try {
        initial = productionIdentity(provider, attemptId, 'before');
        const before = await provider.before(attemptId);
        if (!before || prepareBeforeV2(before).status !== 'ready') throw Error('before_unavailable');
        if (productionBeforeIdentity(provider, before) !== initial) throw Error('before_identity_changed');
        const calibration = await calibrateProductionClock(provider);
        // Operator provisions the FIFO under this private per-attempt directory;
        // supervisor never creates a service/drop-in or invokes mkfifo via shell.
        receiver = openPersistentReceiver({ fifo: path.join(directory, attemptId, 'event.fifo'), attemptId, calibration, before, provider });
        ledger.transition('armed', { attemptId, sourceSha: before.provenance.sourceSha,
          frontendSha: before.provenance.frontendSha, snapshotId: before.snapshotId, deploymentId: initial.deploymentId });
        result = await receiver.observe({ onEvent: event => ledger.transition('event_consumed', event) });
      } catch { result = inconclusive('operator_prerequisite_or_evidence_failure') }
      finally { receiver?.close() }
      completedUTC = Date.now();
      ledger.checkpoint({ result, completedUTC, initial });
      // Provisional result cannot count until independent post-deployment and
      // opt-in cleanup attestation is installed by the privileged operator.
      return Object.freeze({ acceptance: 'INCONCLUSIVE', reason: 'pending_post_identity_and_cleanup', request_count: result.request_count ?? 0 });
    },
    finalize() {
      if (!observed || !result) throw Error('attempt_state');
      let final = result;
      try {
        const post = productionIdentity(provider, attemptId, 'after');
        if (!initial || post.deploymentId !== initial.deploymentId || post.frontendSha !== initial.frontendSha
          || post.confirmedAt < completedUTC || !post.optInInactive) throw Error('deployment_changed');
      } catch { final = { ...result, acceptance: 'INCONCLUSIVE', reason: 'post_identity_or_cleanup_unverified' } }
      // Only the existing validator-generated safe result is persisted; no raw
      // HTTP body or credential ever enters this record.
      if (final.acceptance === 'INCONCLUSIVE') ledger.transition('inconclusive', final);
      else ledger.transition('completed', final);
      const count = ledger.series(); ledger.close();
      return Object.freeze({ acceptance: final.acceptance, qualifiedPassCount: count, accepted: count >= 3 });
    },
  });
}
