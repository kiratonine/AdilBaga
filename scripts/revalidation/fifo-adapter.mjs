// Opt-in local IPC adapter. Import opens nothing; no sender, CLI or POST/HEAD.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createEventSource } from './production-observer.mjs';
import { ownsProviderBefore, isProductionProvider, productionClock } from './projection-provider.mjs';
import { prepareBeforeV2 } from './c2-manifest.mjs';

const calibrations = new WeakSet(), consumed = new Set();
const productionEvents = new WeakMap();
export function isTrustedProductionEvent(event, provider, before) {
  const state = productionEvents.get(event);
  return !!state && state.provider === provider && state.before === before;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const attempt = /^[0-9a-f]{32}$/;
const ns = v => typeof v === 'string' && /^[1-9][0-9]{0,19}$/.test(v);
const fail = reason => { throw Error(reason) };
const inconclusive = reason => ({ acceptance: 'INCONCLUSIVE', reason, request_count: 0, results: [], events: [] });
const boot = () => fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
const cleanEnv = { PATH: '/usr/local/bin:/usr/bin:/bin' };

// Go CLOCK_MONOTONIC sample is bracketed by Node hrtime, including process
// startup. Intersect measured bounds; never equate clocks with zero error.
// probe must be the reviewed locally-built Go testdata/relayprobe binary.
export function calibrateClock(probe) {
  if (process.platform !== 'linux') fail('unsupported_platform');
  const bootId = boot(); let lower = null, upper = null;
  for (let i = 0; i < 5; i++) {
    const before = process.hrtime.bigint();
    let sample;
    try { sample = JSON.parse(execFileSync(probe, ['clock'], { env: cleanEnv, timeout: 2000, maxBuffer: 1024, stdio: ['ignore', 'pipe', 'ignore'] })) } catch { fail('clock_probe_failed') }
    const after = process.hrtime.bigint();
    if (sample.bootId !== bootId || !ns(sample.monoNs)) fail('clock_probe_invalid');
    const mono = BigInt(sample.monoNs), lo = before - mono, hi = after - mono;
    lower = lower === null || lo > lower ? lo : lower;
    upper = upper === null || hi < upper ? hi : upper;
  }
  if (lower > upper || lower > 0n || upper < 0n || upper - lower > 100_000_000n) fail('clock_uncertain');
  const result = Object.freeze({ bootId, lower, upper, measuredAt: process.hrtime.bigint(), samples: 5 });
  calibrations.add(result); return result;
}

function checkPath(file) {
  if (process.platform !== 'linux' || !path.isAbsolute(file) || path.normalize(file) !== file) fail('unsafe_fifo');
  for (let p = path.dirname(file); ; p = path.dirname(p)) {
    const st = fs.lstatSync(p);
    if (!st.isDirectory() || st.isSymbolicLink() || (st.uid !== 0 && st.uid !== process.geteuid())) fail('unsafe_fifo');
    if (p === path.dirname(file) && (st.uid !== process.geteuid() || (st.mode & 0o777) !== 0o700)) fail('unsafe_fifo');
    if ((st.mode & 0o022) !== 0 && !(st.uid === 0 && (st.mode & 0o1000) !== 0)) fail('unsafe_fifo');
    if (p === '/') break;
  }
  const st = fs.lstatSync(file);
  if (!st.isFIFO() || st.isSymbolicLink() || st.uid !== process.geteuid() || (st.mode & 0o777) !== 0o600) fail('unsafe_fifo');
  return st;
}

// Authority comes from a private same-UID FIFO plus expected run identity,
// not bootId. Same UID/root are trusted; FIFO cannot attest an executable/PID.
export function openReceiver(options) { return receiver(options, false) }

// The caller cannot supply a clock probe/callback to mint a calibration.
export async function calibrateProductionClock(provider, signal) {
  if (!isProductionProvider(provider)) fail('authority');
  const bootId = boot(); let lower = null, upper = null;
  for (let i = 0; i < 5; i++) {
    const start = process.hrtime.bigint(), sample = await productionClock(provider, signal), end = process.hrtime.bigint();
    if (sample.bootId !== bootId || !ns(sample.monoNs)) fail('clock_probe_invalid');
    const lo = start - BigInt(sample.monoNs), hi = end - BigInt(sample.monoNs);
    lower = lower === null || lo > lower ? lo : lower; upper = upper === null || hi < upper ? hi : upper;
  }
  if (lower > upper || lower > 0n || upper < 0n || upper - lower > 100_000_000n) fail('clock_uncertain');
  const c = Object.freeze({ bootId, lower, upper, measuredAt: process.hrtime.bigint(), samples: 5 });
  calibrations.add(c); return c;
}
export function openPersistentReceiver(options) {
  if (!isProductionProvider(options?.provider) || !ownsProviderBefore(options.provider, options.before)) fail('authority');
  return receiver(options, true);
}
function receiver({ fifo, attemptId, calibration, manifest, before, provider }, persistent) {
  let fd;
  try {
    const st = checkPath(fifo);
    fd = fs.openSync(fifo, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW);
    const opened = fs.fstatSync(fd);
    if (st.ino !== opened.ino || st.dev !== opened.dev || st.uid !== opened.uid || st.mode !== opened.mode) fail('unsafe_fifo');
  } catch { if (fd !== undefined) fs.closeSync(fd); fail('unsafe_fifo') }
  let closed = false;
  const close = () => { if (!closed) { closed = true; fs.closeSync(fd) } };
  const armedAt = process.hrtime.bigint();
  return { close, async observe({ get, sleep, waitMs = 2000, onEvent } = {}) {
    let refreshing = null, refreshError = false;
    const abortRefresh = new AbortController();
    try {
      if (persistent && (get !== undefined || sleep !== undefined)) return inconclusive('production_transport_fixed');
      if (!calibrations.has(calibration) || calibration.bootId !== boot() || process.hrtime.bigint() - calibration.measuredAt > 60_000_000_000n) return inconclusive('clock_unverified');
      if (typeof attemptId !== 'string' || attemptId.length !== 32 || !attempt.test(attemptId) || (!persistent && (!Number.isInteger(waitMs) || waitMs < 1 || waitMs > 10000))) return inconclusive('invalid_run');
      const deadline = persistent ? armedAt + 35n * 60n * 1_000_000_000n : process.hrtime.bigint() + BigInt(waitMs) * 1_000_000n;
      let raw;
      while (process.hrtime.bigint() < deadline) {
        if (persistent) {
          const age = process.hrtime.bigint() - calibration.measuredAt;
          if (refreshError || age > 60_000_000_000n || boot() !== calibration.bootId || closed) return inconclusive('clock_or_reader_unavailable');
          if (!refreshing && age > 30_000_000_000n) {
            refreshing = calibrateProductionClock(provider, abortRefresh.signal).then(c => { calibration = c }, () => { refreshError = true })
              .finally(() => { refreshing = null });
          }
        }
        const buffer = Buffer.alloc(4097);
        let n = 0;
        try { n = fs.readSync(fd, buffer, 0, buffer.length, null) } catch (e) { if (e.code !== 'EAGAIN') return inconclusive('fifo_read_failed') }
        if (n) {
          raw = buffer.subarray(0, n).toString('utf8');
          if (n > 4096 || !raw.endsWith('\n') || raw.indexOf('\n') !== raw.length - 1) return inconclusive('partial_or_oversized_message');
          if (persistent && process.hrtime.bigint() >= deadline) return inconclusive('supervision_expired');
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      if (!raw) return inconclusive('event_missing');
      if (persistent && refreshError) return inconclusive('clock_unverified');
      // Keep capture (<=20s), AFTER child (<=10s) and a safety margin inside
      // the same35min supervision bound; never grant a late new HTTP window.
      if (persistent && deadline - process.hrtime.bigint() < 31_000_000_000n) return inconclusive('supervision_budget_insufficient');
      let event;
      try { event = JSON.parse(raw) } catch { return inconclusive('invalid_message') }
      const keys = ['version', 'snapshotId', 'attemptId', 'status', 'startMono', 'endMono', 'bootId', 'errorClass'];
      if (!event || JSON.stringify(event) + '\n' !== raw || Object.keys(event).join() !== keys.join() || event.version !== 1 || !ns(event.startMono) || !ns(event.endMono)) return inconclusive('invalid_message');
      if (typeof event.snapshotId !== 'string' || event.snapshotId.length !== 36 || !uuid.test(event.snapshotId) || event.attemptId !== attemptId) return inconclusive('unrelated_event');
      const snapshotId = event.snapshotId; // learned only from the trusted FIFO
      if (event.bootId !== calibration.bootId) return inconclusive('boot_mismatch');
      const identity = snapshotId + ':' + attemptId;
      if (consumed.has(identity) || consumed.size >= 256) return inconclusive('duplicate_or_capacity');
      consumed.add(identity);
      if (event.status !== 204 || event.errorClass !== 'none') return { ...inconclusive('not_accepted204'), receipt: Object.freeze({ ...event }) };
      const start = BigInt(event.startMono), end = BigInt(event.endMono), nowNS = process.hrtime.bigint();
      if (nowNS - calibration.measuredAt > 60_000_000_000n) return inconclusive('clock_unverified');
      if (start > end || end + calibration.lower > nowNS || nowNS - (end + calibration.lower) > 5_000_000_000n) return inconclusive('event_expired_or_unordered');
      if (before !== undefined) {
        if (!ownsProviderBefore(provider, before) || before.attemptId !== attemptId || prepareBeforeV2(before).status !== 'ready'
          || (persistent ? !isProductionProvider(provider) : provider?.fixtureOnly !== true) || typeof provider.after !== 'function') return inconclusive('manifest_unverified');
        if (!get && !persistent) return inconclusive('fixture_transport_required');
      } else {
        if (manifest?.snapshotId !== snapshotId || manifest?.attemptId !== attemptId) return inconclusive('manifest_unverified');
        if (manifest.fixtureOnly === true && !get) return inconclusive('fixture_transport_required');
      }
      // BigInt until subtraction of the local anchor. Convert only bounded
      // relative durations; round bounds outward by <=1 microsecond.
      const anchor = nowNS;
      const beginDelta = start + calibration.lower - anchor, endDelta = end + calibration.upper - anchor;
      if (beginDelta < -20_000_000_000n || endDelta > 100_000_000n || endDelta < beginDelta) return inconclusive('clock_uncertain');
      const beginMs = Math.floor(Number(beginDelta) / 1000) / 1000;
      const endMs = Math.ceil(Number(endDelta) / 1000) / 1000;
      if (!Number.isFinite(beginMs) || endMs - beginMs >= 5000 || beginMs < -20000) return inconclusive('clock_uncertain');
      if (persistent) {
        if (typeof onEvent !== 'function') return inconclusive('ledger_unavailable');
        await onEvent(Object.freeze({ ...event }));
      }
      let replay = beginMs;
      const now = () => replay === null ? Number(process.hrtime.bigint() - anchor) / 1e6 : replay;
      const source = createEventSource({ now, utc: () => Date.now() - (Number(process.hrtime.bigint() - anchor) / 1e6 - endMs) });
      source.begin(attemptId); replay = endMs;
      const trustedEvent = source.accept204(204, { ...event, calibrationLowerNs: calibration.lower.toString(), calibrationUpperNs: calibration.upper.toString(),
        calibrationMeasuredAtNs: calibration.measuredAt.toString() }); replay = null;
      if (persistent) productionEvents.set(trustedEvent, { provider, before });
      if (before !== undefined) {
        const capture = await source.capture(before, { ...(get ? { get } : {}), ...(sleep ? { sleep } : {}), ...(persistent ? { provider } : {}) });
        if (!capture.acceptance.startsWith('capture_')) return capture;
        if (persistent && process.hrtime.bigint() >= deadline) return inconclusive('supervision_expired');
        const result = await provider.after(capture, before);
        if (persistent && process.hrtime.bigint() >= deadline) return inconclusive('supervision_expired');
        return result;
      }
      return await source.observe({ publicationId: attemptId, targets: manifest.targets }, { ...(get ? { get } : {}), ...(sleep ? { sleep } : {}) });
    } catch { return inconclusive('ipc_unavailable') } finally { abortRefresh.abort(); close() }
  } };
}
