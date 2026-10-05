import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, run } from './common.mjs';
import { check } from './check-source.mjs';

const archive = resolve(root, 'artifacts/production-part-12-review.tar.gz');
const names = run('archive inventory', 'tar', ['-tzf', archive]).split('\n');
assert.equal(new Set(names).size, names.length, 'duplicate members');
const modes = run('archive types', 'tar', ['-tvzf', archive]).split('\n');
assert.equal(modes.length, names.length);
assert.ok(modes.every(line => line.startsWith('-')), 'non-regular member');
for (const path of names) {
  const extracted = spawnSync('tar', ['-xOzf', archive, '--', path], { maxBuffer: 32 << 20 });
  assert.equal(extracted.status, 0, 'member read failed');
  check(path, extracted.stdout);
  assert.ok(!path.startsWith('TODO/') && !path.endsWith('/next-env.d.ts'), 'excluded generated member');
  assert.ok(extracted.stdout.equals(readFileSync(join(root, path))), `source byte mismatch: ${path}`);
}
for (const path of ['.github/workflows/ci.yml', '.github/dependabot.yml',
  'docs/production/reports/PART_12_REPORT.md', 'docs/production/STAGING_PLAN.md',
  'docs/production/GITHUB_BRANCH_PROTECTION.md', ...['api-down', 'db-down', 'redis-down',
    'ingestion-failed', 'rollback', 'secret-rotation'].map(n => `docs/runbooks/${n}.md`)]) assert.ok(names.includes(path), `missing review member: ${path}`);
console.log(`archive PASS: ${names.length} safe regular members, all source/report bytes match, six runbooks`);
