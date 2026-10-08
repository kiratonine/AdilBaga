import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check } from '../ci/check-source.mjs';
import { checkPerimeterSecrets } from '../network/verify-part14.mjs';
import { root, paths, readDeployment, verify } from './verify-part15.mjs';
verify(readDeployment());
const archive = join(root, 'artifacts/production-part-15-review.tar.gz');
function tar(args) {
  const r = spawnSync('tar', args, { maxBuffer: 32 << 20 });
  assert.equal(r.status, 0, 'archive_operation_failed');
  return r.stdout;
}
const names = tar(['-tzf', archive]).toString('utf8').trim().split('\n');
assert.equal(new Set(names).size, names.length, 'duplicate_members');
const types = tar(['-tvzf', archive]).toString('utf8').trim().split('\n');
assert.equal(types.length, names.length, 'inventory_mismatch');
assert.ok(types.every(x => x.startsWith('-')), 'non_regular_member');
for (const p of names) {
  check(p, Buffer.alloc(0));
  assert.ok(!/(?:^|\/)(?:TODO|tmp|temp|logs|traces|caches?|credentials|keyrings?)(?:\/|$)/.test(p), 'excluded_member');
  assert.ok(!/(?:^|\/)(?:next-env\.d\.ts|credentials\.json|cert\.pem)$/.test(p), 'private_or_generated_member');
  assert.ok(!/\.(?:sql\.gz|tar(?:\.gz)?|sqlite|db|log)$/i.test(p), 'release_backup_or_output');
  const bytes = tar(['-xOzf', archive, '--', p]);
  check(p, bytes);
  checkPerimeterSecrets(bytes);
  assert.ok(!['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe'].includes(bytes.subarray(0, 4).toString('hex')) && !bytes.subarray(0, 2).equals(Buffer.from('4d5a', 'hex')), 'compiled_member');
  assert.ok(bytes.equals(readFileSync(join(root, p))), 'source_byte_mismatch');
}
for (const p of [...paths, 'scripts/deploy/verify-part15.mjs', 'scripts/deploy/verify-part15.test.mjs', 'scripts/deploy/verify-archive.mjs', 'scripts/create-clean-archive.mjs',
  ...['api-down', 'db-down', 'redis-down', 'ingestion-failed', 'rollback', 'secret-rotation'].map(n => `docs/runbooks/${n}.md`),
]) assert.ok(names.includes(p), 'required_member_missing');
console.log(`Part15 archive PASS: ${names.length} safe regular unique members; source/report byte-match; bounded secret scan PASS`);
