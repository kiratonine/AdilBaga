// Manual, one-attempt operator entry; NOT an approval issuer or scheduler.
// Install separately from the unchanged eight-file kit after independent review.
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const lifetime = 35 * 60000;
const validAttempt = x => typeof x === 'string' && /^[a-f0-9]{32}$/.test(x);

// This orchestration function does not create a provider/capture capability.
// Tests supply local stand-ins; the executable path below has fixed imports,
// no options, callbacks, fixture mode, credential or approval parameters.
export async function runOperatorAttempt({ drop, prepare, command, emit, monotonic = () => performance.now() }) {
  const start = monotonic();
  let timer, prepared = false;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(Error('deadline')), lifetime) });
  const check = () => { if (monotonic() - start >= lifetime) throw Error('deadline') };
  const bounded = async promise => { check(); const value = await Promise.race([promise, deadline]); check(); return value };
  try {
    const launch = drop();
    if (launch?.state !== 'NON_ROOT_PROTECTED') throw Error('launch');
    const session = await bounded(prepare());
    prepared = true;
    if (!validAttempt(session?.attemptId)) throw Error('attempt');
    emit({ state: 'PREPARED_REQUIRES_BEFORE_ATTESTATION', attemptId: session.attemptId });
    // Independent root actor must first attest this exact BEFORE identity.
    if (await bounded(command('before')) !== 'ARM') throw Error('command');
    const armed = await bounded(session.arm());
    if (armed?.state !== 'armed' || armed.attemptId !== session.attemptId) throw Error('arm');
    emit({ state: 'ARMED_REQUIRES_LIVE_ROOT_READY', attemptId: session.attemptId });
    // This state does not claim that root has issued READY. Go still checks
    // the real process-bound root record and the existing one-shot Unix IPC.
    await bounded(session.observe());
    emit({ state: 'OBSERVED_REQUIRES_POST_ATTESTATION', attemptId: session.attemptId });
    if (await bounded(command('after')) !== 'FINALIZE') throw Error('command');
    check();
    const result = session.finalize();
    check();
    if (!['PASS', 'FAIL', 'INCONCLUSIVE'].includes(result?.acceptance)
      || !Number.isSafeInteger(result.qualifiedPassCount) || result.qualifiedPassCount < 0
      || typeof result.accepted !== 'boolean'
      || result.accepted !== (result.qualifiedPassCount >= 3 && result.reconciliationRequired !== true)) throw Error('result');
    emit({ state: 'FINALIZED', acceptance: result.acceptance, qualifiedPassCount: result.qualifiedPassCount,
      accepted: result.accepted, reconciliationRequired: result.reconciliationRequired === true });
    return 0;
  } catch {
    // No raw exception/DB/provider/HTTP body. Unknown ledger/socket state is
    // retained, not deleted or silently rearmed after failure/cancellation.
    emit({ state: prepared ? 'RECONCILIATION_REQUIRED' : 'NOT_ARMED', acceptance: 'INCONCLUSIVE' });
    return 1;
  } finally { clearTimeout(timer) }
}

export function controlChannel(input) {
  let pending = null, invalid = false, buffer = '';
  const fail = () => { invalid = true; pending?.reject(Error('control')); pending = null };
  input.setEncoding('utf8');
  input.on('error', fail); input.on('end', fail);
  input.on('data', chunk => {
    if (!pending || invalid || buffer.length + chunk.length > 16) { fail(); return }
    buffer += chunk;
    if (!buffer.endsWith('\n')) return;
    if (!['ARM\n', 'FINALIZE\n', 'CANCEL\n'].includes(buffer)) { fail(); return }
    const resolve = pending.resolve, value = buffer.trim(); pending = null; buffer = ''; resolve(value);
  });
  return () => {
    if (invalid || pending) return Promise.reject(Error('control'));
    return new Promise((resolve, reject) => { pending = { resolve, reject } });
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.on('error', () => process.exit(1));
  const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
  const finish = async code => { await new Promise(resolve => process.stdout.write('', resolve)); process.exit(code) };
  try {
    if (process.argv.length !== 2 || process.platform !== 'linux' || process.getuid() !== 0
      || process.geteuid() !== 0 || process.argv[1] !== '/usr/local/libexec/aktau-c2-operator.mjs') throw Error('launch');
    // Root-controlled standalone entry, immutable Node and complete installed
    // closure must be independently reviewed before this actual root launch.
    const { dropProductionSupervisorPrivileges } = await import('/usr/local/libexec/aktau-c2/projection-provider.mjs');
    const { prepareObservation } = await import('/usr/local/libexec/aktau-c2/c2-production-supervisor.mjs');
    const command = controlChannel(process.stdin);
    const code = await runOperatorAttempt({ drop: dropProductionSupervisorPrivileges, prepare: prepareObservation, command, emit });
    // A pending observe/Go helper must not keep a failed manual controller
    // alive beyond the original deadline. Pipe EOF ends its private helper;
    // unknown filesystem/ledger state remains a reconciliation interlock.
    await finish(code);
  } catch { emit({ state: 'NOT_ARMED', acceptance: 'INCONCLUSIVE' }); await finish(1) }
}
