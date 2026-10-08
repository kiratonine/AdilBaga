import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

export const root = resolve(import.meta.dirname, '../..');
export const temporary = mkdtempSync(join(tmpdir(), 'adilbaga-ci-'));
// Do not inherit runtime, backup, live-profile, provider or libpq configuration.
export const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'RUNNER_TEMP', 'CI', 'CI_BASE_SHA',
  'GOCACHE', 'GOMODCACHE', 'PLAYWRIGHT_BROWSERS_PATH', 'PW_CHANNEL'].filter(k => process.env[k])
  .map(k => [k, process.env[k]]));
Object.assign(env, { GOTOOLCHAIN: 'local', COREPACK_ENABLE_AUTO_PIN: '0',
  NEXT_TELEMETRY_DISABLED: '1', DATABASE_URL: 'postgres://ci:ci@127.0.0.1:1/unused',
  DIRECT_URL: 'postgres://ci:ci@127.0.0.1:1/unused' });
export const httpEnv = { NEXT_PUBLIC_API_MODE: 'http',
  NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:18080', API_BASE_URL: 'http://127.0.0.1:18080',
  NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3100', NEXT_PUBLIC_ENABLE_TEST_MOCKS: '0' };
export function safe(text) {
  return text.replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, '[REDACTED_DATABASE_URL]');
}
export function run(label, command, args = [], options = {}) {
  const r = spawnSync(command, args, { cwd: root, env, encoding: 'utf8',
    timeout: 20 * 60_000, maxBuffer: 32 * 1024 * 1024, ...options });
  const output = safe((r.stdout ?? '') + (r.stderr ?? ''));
  if (r.status !== 0) {
    console.error(output.slice(-12000));
    throw new Error(`${label}: FAIL (exit ${r.status ?? 'timeout/startup'})`);
  }
  console.log(`${label}: PASS`);
  return output.trim();
}
export function localURL(value) {
  let u;
  try { u = new URL(value); } catch { throw new Error('invalid local CI target'); }
  if (u.protocol !== 'postgres:' || !['127.0.0.1', '[::1]'].includes(u.hostname)
      || !u.port || !/^\/part(?:04_fixture|04_security|08|10_security|11_recovery)$/.test(u.pathname)
      || u.username !== 'postgres' || u.password !== 'ci-local-only'
      || u.search !== '?sslmode=disable' || u.hash) throw new Error('refusing non-CI target');
  return u;
}
export async function wait(label, probe, budget = 60_000) {
  const deadline = Date.now() + budget;
  while (Date.now() < deadline) {
    if (await probe()) return console.log(`${label}: PASS`);
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`${label}: readiness deadline exceeded`);
}
export function browserInstallArgs(settings) {
  if (settings.CI === 'true') return ['exec', 'playwright', 'install', '--with-deps', 'chromium'];
  if (settings.PW_CHANNEL === 'chrome') return null;
  return ['exec', 'playwright', 'install', 'chromium'];
}
export function prepareBrowser() {
  const args = browserInstallArgs(env);
  if (args) run('Chromium install', 'pnpm', args, { cwd: join(root, 'frontend') });
  else console.log('Browser installer: SKIP (local existing Chrome; E2E must still pass)');
}
