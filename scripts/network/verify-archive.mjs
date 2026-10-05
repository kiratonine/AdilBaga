import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check } from '../ci/check-source.mjs';
import { root, planPaths, checkPerimeterSecrets, readPlan, verifyPlan } from './verify-part14.mjs';

verifyPlan(readPlan());
const archive = join(root, 'artifacts/production-part-14-review.tar.gz');
function tar(args) {
  const r = spawnSync('tar', args, { maxBuffer: 32 << 20 });
  assert.equal(r.status, 0, 'bounded_archive_operation_failed');
  return r.stdout;
}
const names = tar(['-tzf', archive]).toString('utf8').trim().split('\n');
assert.equal(new Set(names).size, names.length, 'duplicate_members');
const types = tar(['-tvzf', archive]).toString('utf8').trim().split('\n');
assert.equal(types.length, names.length, 'inventory_mismatch');
assert.ok(types.every(x => x.startsWith('-')), 'non_regular_member');
for (const path of names) {
  check(path, Buffer.alloc(0)); // validate path before using it for any filesystem read
  assert.ok(!/(?:^|\/)(?:TODO|tmp|temp|logs|traces|caches?|credentials|keyrings?)(?:\/|$)/.test(path), 'excluded_member');
  assert.ok(!/(?:^|\/)(?:next-env\.d\.ts|credentials\.json)$/.test(path), 'generated_or_private_member');
  assert.ok(!/\.(?:sql\.gz|tar\.gz|sqlite|db|log)$/i.test(path), 'backup_or_output_member');
  const bytes = tar(['-xOzf', archive, '--', path]);
  check(path, bytes);
  checkPerimeterSecrets(bytes);
  assert.ok(!['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe'].includes(bytes.subarray(0, 4).toString('hex'))
    && !bytes.subarray(0, 2).equals(Buffer.from('4d5a', 'hex')), 'compiled_member');
  assert.ok(bytes.equals(readFileSync(join(root, path))), 'source_byte_mismatch');
}
for (const path of [...planPaths,
  'docs/production/reports/PART_14_REPORT.md',
  'scripts/network/verify-part14.mjs', 'scripts/network/verify-part14.test.mjs',
  'scripts/network/verify-archive.mjs', 'scripts/create-clean-archive.mjs',
  ...['api-down', 'db-down', 'redis-down', 'ingestion-failed', 'rollback', 'secret-rotation'].map(n => `docs/runbooks/${n}.md`),
]) assert.ok(names.includes(path), 'required_member_missing');
console.log(`Part14 archive PASS: ${names.length} safe regular unique members; all source/report bytes match; six runbooks retained; bounded secret scan PASS`);
