import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkOperator, parseOperator } from './prepare-recovery-operator.mjs';

const script = path.join(import.meta.dirname, 'prepare-recovery-operator.mjs');
const template = (dir) => `BACKUP_DATABASE_URL=postgresql://backup_reader:synthetic-only@db.invalid/app?sslmode=verify-full\nBACKUP_OUTPUT_DIR=${dir}/output\nBACKUP_GPG_HOME=${dir}/keyring\nBACKUP_GPG_RECIPIENT=${'A'.repeat(40)}\n`;
function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aktau-recovery-test-')); fs.chmodSync(dir, 0o700);
  try {
    for (const name of ['output', 'keyring']) fs.mkdirSync(path.join(dir, name), { mode: 0o700 });
    const file = path.join(dir, 'operator'); fs.writeFileSync(file, template(dir), { mode: 0o600 });
    fn({ dir, file });
  } finally { fs.rmSync(dir, { recursive: true }); }
}
test('default/offline does not inspect supplied env or file; fixed output only', () => {
  for (const args of [[], ['--offline']]) {
    const r = spawnSync(process.execPath, [script, ...args], { env: { DATABASE_URL: 'must-not-use', BACKUP_DATABASE_URL: 'must-not-read' }, encoding: 'utf8' });
    assert.equal(r.status, 0); assert.equal(r.stdout, 'MISSING_OPERATOR_INPUT\n'); assert.equal(r.stderr, '');
  }
});
test('valid private context with tools is READY; no connection', () => fixture(({ file }) => {
  assert.equal(checkOperator(file, { tools: () => true }), 'READY');
}));
for (const [label, mutate] of [
  ['missing DSN', s => s.replace(/^BACKUP_DATABASE_URL=.*\n/, '')],
  ['duplicate', s => s + 'BACKUP_GPG_RECIPIENT=AAAA\n'],
  ['substitution', s => s.replace('db.invalid', '$(touch unsafe)')],
  ['multiline', s => s + 'arbitrary line\n'],
  ['oversized', s => s + 'X'.repeat(16384)],
  ['invalid recipient', s => s.replace('A'.repeat(40), 'SHORT')],
  ['unknown key', s => s + 'DATABASE_URL=not-an-input\n'],
  ['bad URL encoding', s => s.replace('backup_reader', 'bad%XX')],
  ['unsafe query', s => s.replace('sslmode=verify-full', 'host=attacker.invalid')],
  ['missing TLS', s => s.replace('?sslmode=verify-full', '')],
]) test(label + ' fails closed without leaking input', () => fixture(({ file }) => {
  fs.writeFileSync(file, mutate(fs.readFileSync(file, 'utf8')));
  assert.notEqual(checkOperator(file, { tools: () => true }), 'READY');
  const r = spawnSync(process.execPath, [script, '--check', file], { encoding: 'utf8' });
  assert.notEqual(r.status, 0); assert.match(r.stdout, /^(MISSING_OPERATOR_INPUT|INVALID_CUSTODY|BLOCKED)\n$/);
  assert.equal(r.stderr, ''); assert(!r.stdout.includes('synthetic-only'));
}));
test('unsafe modes, hardlinks, symlinks, source directory and missing tools rejected', () => fixture(({ dir, file }) => {
  fs.chmodSync(file, 0o644); assert.equal(checkOperator(file), 'INVALID_CUSTODY'); fs.chmodSync(file, 0o600);
  fs.linkSync(file, dir + '/hard'); assert.equal(checkOperator(file), 'INVALID_CUSTODY'); fs.unlinkSync(dir + '/hard');
  fs.symlinkSync(file, dir + '/link'); assert.equal(checkOperator(dir + '/link'), 'INVALID_CUSTODY');
  fs.chmodSync(dir + '/output', 0o770); assert.equal(checkOperator(file), 'INVALID_CUSTODY'); fs.chmodSync(dir + '/output', 0o700);
  fs.mkdirSync(dir + '/.git'); assert.equal(checkOperator(file), 'INVALID_CUSTODY'); fs.rmdirSync(dir + '/.git');
  assert.equal(checkOperator(file, { tools: () => false }), 'BLOCKED');
}));
test('parser rejects quoted/newline/substituted values; returned data never implicitly uses env', () => {
  assert.throws(() => parseOperator('BACKUP_DATABASE_URL="value"\n'));
  assert.throws(() => parseOperator('BACKUP_DATABASE_URL=`command`\n'));
  assert.throws(() => parseOperator(''));
});
