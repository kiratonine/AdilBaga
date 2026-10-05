import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, run } from './helpers.mjs';
import { check } from '../ci/check-source.mjs';

const archive = join(root, 'artifacts/production-part-13-review.tar.gz');
const names = run('archive inventory', 'tar', ['-tzf', archive]).split('\n');
assert.equal(new Set(names).size, names.length);
const types = run('archive types', 'tar', ['-tvzf', archive]).split('\n');
assert.equal(types.length, names.length); assert.ok(types.every(x => x.startsWith('-')));
for (const path of names) {
  const r = spawnSync('tar', ['-xOzf', archive, '--', path], { maxBuffer: 32 << 20 });
  assert.equal(r.status, 0); check(path, r.stdout);
  assert.ok(!path.startsWith('TODO/') && !path.endsWith('/next-env.d.ts'));
  assert.ok(r.stdout.equals(readFileSync(join(root, path))), 'source byte mismatch');
}
for (const path of ['scripts/perf/api-load.js','scripts/perf/run-local.mjs','scripts/perf/fake-upstash.mjs',
  'scripts/perf/product-mappings-audit.sql','scripts/perf/summarize.mjs',
  'docs/production/PERFORMANCE_BASELINE.md','docs/production/reports/PART_13_REPORT.md',
  ...['api-down','db-down','redis-down','ingestion-failed','rollback','secret-rotation'].map(n=>'docs/runbooks/'+n+'.md')]) assert.ok(names.includes(path));
console.log(`archive PASS: ${names.length} safe regular unique members, source/report byte-match, six runbooks, bounded secret scan`);
