import test from 'node:test';
import assert from 'node:assert/strict';
import { runOperatorAttempt, controlChannel } from './c2-operator-entry.mjs';
import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function harness(overrides = {}) {
  const events = [], calls = [];
  let now = 0;
  const session = {
    attemptId: 'a'.repeat(32),
    arm: async () => { calls.push('arm'); return { state: 'armed', attemptId: 'a'.repeat(32) } },
    observe: async () => { calls.push('observe'); return { acceptance: 'INCONCLUSIVE', reason: 'pending_post_identity_and_cleanup' } },
    finalize: () => { calls.push('finalize'); return { acceptance: 'PASS', qualifiedPassCount: 1, accepted: false } },
    ...overrides.session,
  };
  const deps = {
    drop: () => { calls.push('drop'); return { state: 'NON_ROOT_PROTECTED' } },
    prepare: async () => { calls.push('prepare'); return session },
    command: async phase => { calls.push(phase); return phase === 'before' ? 'ARM' : 'FINALIZE' },
    emit: e => events.push(e),
    monotonic: () => now,
    ...overrides.deps,
  };
  return { events, calls, deps, setNow: n => { now = n } };
}

test('manual protected lifecycle uses existing supervisor and explicit external attestation barriers', async () => {
  const h = harness(); assert.equal(await runOperatorAttempt(h.deps), 0);
  assert.deepEqual(h.calls, ['drop', 'prepare', 'before', 'arm', 'observe', 'after', 'finalize']);
  assert.deepEqual(h.events.map(x => x.state), ['PREPARED_REQUIRES_BEFORE_ATTESTATION', 'ARMED_REQUIRES_LIVE_ROOT_READY', 'OBSERVED_REQUIRES_POST_ATTESTATION', 'FINALIZED']);
  assert.equal(h.events.at(-1).acceptance, 'PASS');
});
test('missing root launch authority never constructs provider or arms', async () => {
  const h = harness({ deps: { drop: () => { throw Error('private provider payload') } } });
  assert.equal(await runOperatorAttempt(h.deps), 1); assert.deepEqual(h.calls, []);
  assert.equal(JSON.stringify(h.events).includes('private provider'), false);
});
test('external BEFORE cancellation leaves ordinary sync untouched and performs no observation', async () => {
  const h = harness({ deps: { command: async () => 'CANCEL' } });
  assert.equal(await runOperatorAttempt(h.deps), 1); assert.equal(h.calls.includes('arm'), false);
  assert.equal(h.calls.includes('observe'), false);
});
test('NOT_ARMED cannot be relabelled ACTIVE or PASS', async () => {
  const h = harness({ session: { arm: async () => ({ state: 'NOT_ARMED' }) } });
  assert.equal(await runOperatorAttempt(h.deps), 1); assert.equal(h.calls.includes('observe'), false);
  assert.equal(h.events.some(e => e.state === 'FINALIZED'), false);
});
test('missing post attestation cannot finalize a provisional result', async () => {
  const h = harness({ deps: { command: async phase => phase === 'before' ? 'ARM' : 'CANCEL' } });
  assert.equal(await runOperatorAttempt(h.deps), 1); assert.equal(h.calls.includes('finalize'), false);
});
test('one original 35-minute clock covers external approval waits and late AFTER', async () => {
  const h = harness(); h.deps.command = async phase => { if (phase === 'after') h.setNow(35 * 60000 + 1); return phase === 'before' ? 'ARM' : 'FINALIZE' };
  assert.equal(await runOperatorAttempt(h.deps), 1); assert.equal(h.calls.includes('finalize'), false);
});
test('unchanged private supervisor verdict FAIL or INCONCLUSIVE is never promoted', async () => {
  for (const acceptance of ['FAIL', 'INCONCLUSIVE']) {
    const h = harness({ session: { finalize: () => ({ acceptance, qualifiedPassCount: 0, accepted: false }) } });
    assert.equal(await runOperatorAttempt(h.deps), 0); assert.equal(h.events.at(-1).acceptance, acceptance);
  }
});
test('malformed session/final result and provider failures are fail closed without raw error output', async () => {
  for (const scenario of ['attempt', 'prepare', 'result']) {
    const h = harness(scenario === 'attempt' ? { session: { attemptId: 'wrong' } } : scenario === 'prepare'
      ? { deps: { prepare: async () => { throw Error('password=synthetic-private') } } }
      : { session: { finalize: () => ({ acceptance: 'PASS', qualifiedPassCount: -1, secret: 'synthetic-private' }) } });
    assert.equal(await runOperatorAttempt(h.deps), 1);
    assert.equal(JSON.stringify(h.events).includes('synthetic-private'), false);
  }
});
test('bounded private control accepts partial exact commands but rejects trailing data, early command and EOF', async () => {
  const stream = new PassThrough(), command = controlChannel(stream), first = command();
  stream.write('AR'); stream.write('M\n'); assert.equal(await first, 'ARM');
  const second = command(); stream.write('FINALIZE\n'); assert.equal(await second, 'FINALIZE'); stream.destroy();
  for (const input of ['ARM\nFINALIZE\n', 'x'.repeat(17), 'UNKNOWN\n']) {
    const s = new PassThrough(), wait = controlChannel(s), rejected = assert.rejects(wait(), /control/);
    s.write(input); await rejected; s.destroy();
  }
  const early = new PassThrough(), earlyWait = controlChannel(early); early.write('ARM\n');
  await assert.rejects(earlyWait(), /control/); early.destroy();
  const ended = new PassThrough(), endWait = controlChannel(ended), rejected = assert.rejects(endWait(), /control/);
  ended.end(); await rejected;
});
test('source/nonroot invocation cannot run an installed production controller or accept overrides', () => {
  const entry = fileURLToPath(new URL('./c2-operator-entry.mjs', import.meta.url));
  for (const args of [[], ['--fixture'], ['--source-sha', 'a'.repeat(40)]]) {
    const r = spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8', timeout: 2000, env: {} });
    assert.equal(r.status, 1); assert.equal(r.stderr, '');
    assert.deepEqual(JSON.parse(r.stdout), { state: 'NOT_ARMED', acceptance: 'INCONCLUSIVE' });
  }
});
