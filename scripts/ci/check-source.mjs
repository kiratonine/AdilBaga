import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, run } from './common.mjs';

// Deterministic project-specific check, not an exhaustive secret scanner.
export function check(path, bytes) {
  assert.ok(path && !path.startsWith('/') && !path.split('/').some(p => ['', '.', '..'].includes(p)), 'unsafe member path');
  const name = path.split('/').at(-1);
  const badDir = /(?:^|\/)(?:\.git|node_modules|artifacts|\.next|dist|build|coverage|test-results|playwright-report|\.ssh|\.gnupg|backups|secrets)(?:\/|$)/;
  assert.ok(!badDir.test(path), `forbidden artifact: ${path}`);
  assert.ok(!(name === '.env' || name.startsWith('.env.')) || name === '.env.example', `forbidden env: ${path}`);
  assert.ok(!/\.(?:pem|key|p12|pfx|dump|gpg|age|kbx|prof|pprof|exe|test|tsbuildinfo)$/i.test(name)
    && !/^id_(?:rsa|ed25519)$/.test(name) && !/(?:^|\/)\.railway(?:\/|$)/.test(path), `forbidden private artifact: ${path}`);
  assert.ok(!bytes.subarray(0, 4).equals(Buffer.from('7f454c46', 'hex')), `compiled artifact: ${path}`);
  const text = bytes.toString('utf8');
  for (const pattern of [/-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----\s*\n[A-Za-z0-9+/]/,
    /AIza[\w-]{35}/, /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, /\bgithub_pat_[A-Za-z0-9_]{50,}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/]) {
    assert.ok(!pattern.test(text), `credential pattern: ${path}`);
  }
}
const files = run('source inventory', 'git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
  .split('\0').filter(p => p && !p.startsWith('TODO/'));
for (const path of files) check(path, readFileSync(join(root, path)));
const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
assert.ok(!/pull_request_target|\bsecrets\.|railway|cloudflare|\bdeploy\b|\bssh\b/i.test(workflow), 'unsafe workflow boundary');
assert.match(workflow, /permissions:\s*\n\s+contents: read/);
assert.match(workflow, /name: CI Gate/);
assert.match(workflow, /if: always\(\)/);
assert.match(workflow, /cancel-in-progress: true/);
const accepted = process.env.CI_BASE_SHA;
if (accepted && !/^0{40}$/.test(accepted)) {
  assert.match(accepted, /^[a-f0-9]{40}$/i, 'invalid immutable base');
  const changed = run('migration immutable base diff', 'git', ['diff', '--name-status', accepted, '--', 'backend/prisma/migrations']);
  for (const line of changed.split('\n').filter(Boolean)) assert.match(line, /^A\t/, 'existing migration modified/deleted');
}
assert.equal(run('local migration byte drift', 'git', ['diff', 'HEAD', '--', 'backend/prisma/migrations']), '');
console.log(`source/security policy PASS: ${files.length} files; bounded patterns only`);
