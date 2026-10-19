// Explicit one-shot operator tool; default path has no state or network I/O.
import https from 'node:https';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createVerifier } from './verify-go-production.mjs';
import { openState } from './monitor-state.mjs';

export function createNotifier(config, { request = https.request, timeoutMs = 5000 } = {}) {
  let url;
  try { url = new URL(config.url); } catch { throw Error('delivery_not_configured'); }
  if (typeof config.url !== 'string' || config.url.length > 2048 || url.href !== config.url || url.protocol !== 'https:'
    || url.username || url.password || url.search || url.hash || /[?#]/.test(config.url) || !url.hostname
    || typeof config.token !== 'string' || !/^[A-Za-z0-9._~+/-]{16,512}$/.test(config.token)
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) throw Error('delivery_not_configured');
  const token = config.token; // Never persisted, logged, or passed via argv.
  return (event, signal) => new Promise(resolve => {
    if (!event || !['incident_opened','incident_recovered'].includes(event.type) || !/^[a-f0-9]{32}$/.test(event.id)
      || event.id.length !== 32 || !Number.isSafeInteger(event.atUTC) || event.atUTC < 0 || event.atUTC >= 8640000000000000 || signal?.aborted) return resolve(false);
    const body = JSON.stringify({ type: event.type, timestamp: new Date(event.atUTC).toISOString(), category: 'go_api_unavailable' });
    let req, timer, done = false;
    const finish = ok => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel); req?.destroy(); resolve(ok); };
    const cancel = () => finish(false);
    timer = setTimeout(cancel, timeoutMs); signal?.addEventListener('abort', cancel, { once: true });
    try {
      req = request(url, { method: 'POST', agent: false, rejectUnauthorized: true, headers: {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
        Authorization: 'Bearer ' + token, 'Idempotency-Key': event.id,
      } }, res => { const ok = res.statusCode >= 200 && res.statusCode < 300; res.destroy(); finish(ok); });
      req.on('error', cancel); req.end(body);
    } catch { finish(false); }
  });
}
const result = (outcome, reason) => ({ outcome, reason });
function healthy(v) {
  const endpoints = ['live','ready','categories','products','dashboard'];
  return v?.outcome === 'PASS' && v.requests === 5 && Array.isArray(v.records) && v.records.length === 5
    && v.records.every((r, i) => r.endpoint === endpoints[i] && r.outcome === 'PASS' && r.schemaClass === 'valid' && r.statusClass === '2xx');
}
export async function runMonitor({ directory, check = () => createVerifier()(), notify, now = Date.now, storeFactory = openState, signal } = {}) {
  let store, answer = result('BLOCKED', 'state_unavailable');
  try {
    if (typeof notify !== 'function') return result('BLOCKED', 'delivery_not_configured');
    if (signal?.aborted) return result('BLOCKED', 'cancelled');
    store = storeFactory(directory); let s = store.value;
    const time = now();
    if (!Number.isSafeInteger(time) || time < 0 || time >= 8639999999940000 || (s.lastUTC !== null && time < s.lastUTC)) answer = result('BLOCKED', 'clock_discontinuity');
    else {
      const deliver = async () => {
        if (s.pending.attempts >= 3) return result('PENDING', 'delivery_exhausted');
        if (time < s.pending.nextAttemptUTC) return result('PENDING', 'delivery_cooldown');
        s.lastUTC = time; s.pending.attempts++; s.pending.nextAttemptUTC = time + 60000;
        store.save(s); // Persist id and attempt BEFORE remote side effects.
        let accepted = false;
        try { accepted = await notify(structuredClone(s.pending), signal) === true; } catch { /* fixed pending class only */ }
        if (!accepted) return result('PENDING', 'delivery_failed');
        s.pending = null; store.save(s); return result('DELIVERED', 'pending_delivered');
      };
      if (s.pending) answer = await deliver(); // Drain one event; do not reorder health/recovery behind an undelivered incident.
      else {
        let ok = false;
        try { ok = healthy(await check()); } catch { /* inaccessible/partial data is unsuccessful, never healthy */ }
        if (signal?.aborted) answer = result('BLOCKED', 'cancelled');
        else {
          const previous = s.phase; s.lastUTC = time;
          s.failures = ok ? 0 : Math.min(2, s.failures + 1);
          s.phase = ok ? 'OK' : s.failures === 1 ? 'DEGRADED' : 'INCIDENT';
          const type = previous !== 'INCIDENT' && s.phase === 'INCIDENT' ? 'incident_opened'
            : previous === 'INCIDENT' && ok ? 'incident_recovered' : null;
          if (type) s.pending = { id: randomBytes(16).toString('hex'), type, atUTC: time, nextAttemptUTC: time, attempts: 0 };
          store.save(s); answer = result(type === 'incident_recovered' ? 'RECOVERED' : s.phase, ok ? 'probe_complete' : 'probe_unavailable');
          if (s.pending) { const delivery = await deliver(); if (delivery.outcome !== 'DELIVERED') answer = delivery; }
        }
      }
    }
  } catch { answer = result('BLOCKED', 'state_unavailable'); }
  finally { try { store?.close(); } catch { answer = result('BLOCKED', 'state_unavailable'); } }
  return answer;
}
export async function main(args, env = process.env, write = s => process.stdout.write(s + '\n')) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--offline')) {
    write(JSON.stringify({ outcome: 'OFFLINE', activation: 'ACTIVATION_PENDING', requests: 0, deliveries: 0 })); return 0;
  }
  if (args.length !== 1 || args[0] !== '--run') { write(JSON.stringify(result('BLOCKED', 'arguments'))); return 2; }
  let notify;
  try { notify = createNotifier({ url: env.AKTAU_MONITOR_RECEIVER_URL, token: env.AKTAU_MONITOR_RECEIVER_TOKEN }); }
  catch { write(JSON.stringify(result('BLOCKED', 'delivery_not_configured'))); return 2; }
  const value = await runMonitor({ directory: env.AKTAU_MONITOR_STATE_DIR, notify });
  write(JSON.stringify(value)); return ['OK','RECOVERED','DELIVERED'].includes(value.outcome) ? 0 : value.outcome === 'BLOCKED' ? 2 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
