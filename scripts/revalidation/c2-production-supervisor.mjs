// Operator library only: no autorun, scheduler, credential provisioning or
// systemd administration. Production execution requires separate authorization.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { createProductionProjectionProvider, productionIdentity, productionBeforeIdentity, productionReadyAuthority, recheckProductionReadyAuthority, productionReadyRelay, providerBeforeBaseline } from './projection-provider.mjs';
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

// Narrow child-stdio adapter. No paths, network, authority minting or logs here.
// Production caller supplies only the independently approved fixed Go relay.
export async function openReadyRelay({ child, attemptId, respond }) {
  if (typeof attemptId!=='string' || attemptId.length!==32 || !/^[a-f0-9]{32}$/.test(attemptId) || typeof respond !== 'function') throw Error('ready_config');
  let buffer = Buffer.alloc(0), phase = 'starting', failed = false, closing = false;
  let listenResolve, listenReject, deliveredResolve;
  const listening = new Promise((resolve, reject) => { listenResolve = resolve; listenReject = reject });
  const delivered = new Promise(resolve => { deliveredResolve = resolve });
  const exited=new Promise(resolve=>child.once('close',resolve));let stopping=null;
  const stopChild=()=>stopping??=(async()=>{
    closing=true;deliveredResolve(false);child.stdin.end();
    const term=setTimeout(()=>child.kill('SIGTERM'),250),kill=setTimeout(()=>child.kill('SIGKILL'),1000);
    try{if(child.exitCode===null&&child.signalCode===null)await exited}finally{clearTimeout(term);clearTimeout(kill)}
    return child.exitCode===0&&child.signalCode===null;
  })();
  const fail = () => { if (failed) return; failed = true; listenReject(Error('ready_relay')); deliveredResolve(false); child.stdin.destroy(); child.kill('SIGTERM') };
  child.stdin.on('error', fail);
  child.on('error', fail);
  child.on('exit', code => { if (!closing && (code !== 0 || phase !== 'delivered' || buffer.length)) fail() });
  child.stdout.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 8192) { fail(); return }
    while (buffer.includes(10)) {
      const at = buffer.indexOf(10), raw = buffer.subarray(0, at + 1).toString('utf8'); buffer = buffer.subarray(at + 1);
      let frame;
      try { frame = JSON.parse(raw); if (JSON.stringify(frame) + '\n' !== raw) throw Error() } catch { fail(); return }
      if(!frame || typeof frame!=='object' || Array.isArray(frame)){fail();return}
      if (phase === 'starting' && raw === '{"state":"listening"}\n') { phase = 'listening'; listenResolve(); continue }
      if (phase === 'listening' && Object.keys(frame).join() === 'state,request,peer' && frame.state === 'request') {
        phase = 'responding';
        const r = frame.request;
        if (!r || Object.keys(r).join() !== 'version,attemptId,nonce' || r.version !== 1 || r.attemptId !== attemptId || typeof r.nonce!=='string' || r.nonce.length!==32 || !/^[a-f0-9]{32}$/.test(r.nonce)) { fail(); return }
        const p=frame.peer;
        if(!p || Object.keys(p).join()!=='pid,uid,gid,executableSha256,rootControlled,bootId'
          || !Number.isSafeInteger(p.pid) || p.pid<1 || !Number.isSafeInteger(p.uid) || p.uid<0 || !Number.isSafeInteger(p.gid) || p.gid<0
          || typeof p.executableSha256!=='string' || p.executableSha256.length!==64 || !/^[a-f0-9]{64}$/.test(p.executableSha256) || typeof p.rootControlled!=='boolean'
          || typeof p.bootId!=='string' || p.bootId.length!==36 || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(p.bootId)){fail();return}
        Promise.resolve().then(() => respond(Object.freeze({ ...r }), Object.freeze({ ...frame.peer }))).then(answer => {
          if (failed || phase !== 'responding') throw Error('ready_state');
          const encoded = JSON.stringify(answer) + '\n';
          if (Buffer.byteLength(encoded) > 4096) throw Error('ready_size');
          phase = 'answered'; child.stdin.write(encoded);
        }).catch(fail);
        continue;
      }
      if (phase === 'answered' && raw === '{"state":"delivered"}\n') { phase = 'delivered'; deliveredResolve(true); continue }
      fail(); return;
    }
  });
  const timer = setTimeout(fail, 1500);
  try { await listening } catch {const clean=await stopChild();const e=Error('ready_relay');e.cleanupVerified=clean;throw e} finally { clearTimeout(timer) }
  return Object.freeze({
    delivered,
    live: () => !failed && !closing && phase === 'delivered' && child.exitCode === null && child.signalCode === null,
    async close() {
      return stopChild();
    },
  });
}

export async function prepareObservation(options = {}) {
  if (Reflect.ownKeys(options).length) throw Error('operator_options');
  // Fixed independent authority before any ledger/FIFO or network activity.
  const provider = createProductionProjectionProvider();
  const ledger = openAttemptLedger(path.join(directory, 'ledger'));
  const attemptId = ledger.prepare();
  let observed = false, arming = null, receiver = null, relay = null, pending = null;
  let result = null, initial = null, completedUTC = null;
  let readyAuthority = null, cleanupVerified=true;
  async function arm() {
    if (arming) return arming;
    arming = (async () => {
      try {
        initial = productionIdentity(provider, attemptId, 'before');
        const before = await provider.beforeReady(attemptId);
        const selected = prepareBeforeV2(before);
        if (!before || selected.status !== 'ready') throw Error('before_unavailable');
        if (productionBeforeIdentity(provider, before) !== initial) throw Error('before_identity_changed');
        const baseline = providerBeforeBaseline(provider, before);
        const calibration = await calibrateProductionClock(provider);
        receiver = openPersistentReceiver({ fifo: path.join(directory, attemptId, 'event.fifo'), attemptId, calibration, before, provider });
        ledger.transition('armed', { attemptId, sourceSha: before.provenance.sourceSha,
          frontendSha: before.provenance.frontendSha, snapshotId: before.snapshotId, deploymentId: initial.deploymentId });
        const digest = v => createHash('sha256').update(JSON.stringify(v) + '\n').digest('hex');
        let consumed = false;
        // Start the SAME receiver now: calibration refresh/deadline never wait
        // for an external admin record or the later observe() call.
        pending = receiver.observe({ onEvent: async event => {
          if (!relay?.live()) throw Error('ready_not_delivered');
          recheckProductionReadyAuthority(provider,readyAuthority);
          ledger.transition('event_consumed', event);
        } });
        relay = await openReadyRelay({ child: productionReadyRelay(provider, attemptId), attemptId,
          respond(request, peer) {
            if(!receiver.isArmed())throw Error('reader_not_armed');
            const a = productionReadyAuthority(provider, before);
            if (consumed || peer.uid !== a.operatorUid || peer.gid !== a.operatorGid || peer.rootControlled !== true
              || peer.executableSha256 !== a.ingestSha256 || peer.bootId !== a.bootId || !Number.isSafeInteger(peer.pid) || peer.pid < 1
              || a.bootId !== calibration.bootId || Date.now() >= Date.parse(a.expiresAt)) throw Error('ready_peer');
            consumed = true;
            readyAuthority = a;
            const response = { version: 1, status: 'READY', attemptId, nonce: request.nonce, s0: baseline,
              projectionSha256: digest(before), witnessSha256: digest(selected.witness), sourceSha: a.sourceSha,
              frontendSha: a.frontendSha, deploymentId: a.deploymentId, confirmedAt: a.confirmedAt,
              bootId: a.bootId, expiresAt: a.expiresAt };
            ledger.checkpoint({ state: 'ready_consumed', nonceSha256: digest(request.nonce), projectionSha256: response.projectionSha256,
              witnessSha256: response.witnessSha256 });
            return response;
          } });
        return Object.freeze({ state: 'armed', attemptId });
      } catch (e) {
        try{receiver?.close()}catch{cleanupVerified=false}
        if(relay && !await relay.close())cleanupVerified=false;
        if(e?.cleanupVerified===false)cleanupVerified=false;
        result = inconclusive('operator_prerequisite_or_evidence_failure');
        return Object.freeze({ state: 'NOT_ARMED' });
      }
    })();
    return arming;
  }
  return Object.freeze({ attemptId,
    arm,
    async observe() {
      if (observed) throw Error('attempt_reuse'); observed = true;
      try {
        await arm();
        result ??= await pending;
        if(result.acceptance!=='INCONCLUSIVE'&&!relay?.live())throw Error('ready_relay_lost');
        if(result.acceptance!=='INCONCLUSIVE')recheckProductionReadyAuthority(provider,readyAuthority);
      } catch { result = {...(result??inconclusive('operator_prerequisite_or_evidence_failure')),acceptance:'INCONCLUSIVE',reason:'operator_prerequisite_or_evidence_failure'} }
      finally {
        try{receiver?.close()}catch{cleanupVerified=false}
        if(relay&&!await relay.close())cleanupVerified=false;
        if(!cleanupVerified)result={...(result??inconclusive('cleanup_unverified')),acceptance:'INCONCLUSIVE',reason:'cleanup_unverified'};
      }
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
        if(result.acceptance!=='INCONCLUSIVE')recheckProductionReadyAuthority(provider,readyAuthority);
        const post = productionIdentity(provider, attemptId, 'after');
        if (!initial || post.deploymentId !== initial.deploymentId || post.frontendSha !== initial.frontendSha
          || post.confirmedAt < completedUTC || !post.optInInactive) throw Error('deployment_changed');
      } catch { final = { ...result, acceptance: 'INCONCLUSIVE', reason: 'post_identity_or_cleanup_unverified' } }
      // Only the existing validator-generated safe result is persisted; no raw
      // HTTP body or credential ever enters this record.
      if (final.acceptance === 'INCONCLUSIVE') ledger.transition('inconclusive', final);
      else ledger.transition('completed', final);
      const count = ledger.series(); if(cleanupVerified)ledger.close();
      return Object.freeze({ acceptance: final.acceptance, qualifiedPassCount: count, accepted: cleanupVerified&&count >= 3,
        ...(!cleanupVerified?{reconciliationRequired:true}:{}) });
    },
  });
}
