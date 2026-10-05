import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const root = resolve(import.meta.dirname, '../..');
export const image = 'grafana/k6:2.3.0';
export const env = Object.fromEntries(['PATH', 'HOME', 'GOCACHE', 'GOMODCACHE'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
Object.assign(env, { GOTOOLCHAIN: 'local', COREPACK_ENABLE_AUTO_PIN: '0' });
export function run(label, command, args, options = {}) {
  const r = spawnSync(command, args, { env, encoding: 'utf8', timeout: 1_200_000, maxBuffer: 32 << 20, ...options });
  if (r.status !== 0) {
    const classes = ((r.stdout ?? '') + (r.stderr ?? '')).match(/(?:restore_failed|postgres_outcome_class)=[a-z_]+|restore_failed:[a-z_]+|checksum_failed|configuration_guard_failed/g);
    throw Error(label + ': ' + (classes?.join(',') || 'operation_failed'));
  }
  return r.stdout.trim();
}
export const docker = (label, args, options) => run(label, 'docker', args, options);
export function backupInputs(settings) {
  try {
    const file = realpathSync(settings.PERF_BACKUP_FILE), home = realpathSync(settings.PERF_BACKUP_GPG_HOME);
    for (const path of [file, home]) if (path === root || path.startsWith(root + '/')) throw Error();
    if (!file.endsWith('.dump.gpg') || !statSync(file).isFile() || !statSync(file + '.json').isFile()
      || !statSync(home).isDirectory() || (statSync(home).mode & 0o777) !== 0o700) throw Error();
    return { file, home };
  } catch { throw Error('representative_input_unavailable'); }
}
export function owned(name) {
  if (!/^adilbaga-part13-[a-f0-9]{12}(?:-(?:db|api|fake|k6|net|policy))?$/.test(name)) throw Error('unsafe_owned_resource');
  return name;
}
export function loopback(value) {
  const u = new URL(value);
  if (u.protocol !== 'postgres:' || u.hostname !== '127.0.0.1' || !u.port || u.pathname !== '/part11_perf'
    || u.username !== 'postgres' || u.search || u.hash) throw Error('unsafe_restore_target');
  return value;
}
export async function wait(probe, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await probe()) return; await new Promise(r => setTimeout(r, 250)); }
  throw Error('bounded_readiness_failed');
}
export const temporary = () => mkdtempSync(join(tmpdir(), 'adilbaga-part13-'));

// Timer callbacks must never throw past the owner's resource cleanup boundary.
export function intervalSampler(probe, onFailure, interval = 2000) {
  let error;
  const timer = setInterval(() => {
    try { probe(); }
    catch (e) {
      error = e?.message === 'DB_pool_invariant' ? 'DB_pool_invariant' : 'sampling_failed';
      clearInterval(timer);
      try { onFailure(); } catch { /* owner finally still removes the container */ }
    }
  }, interval);
  return { stop() { clearInterval(timer); }, get error() { return error; } };
}
