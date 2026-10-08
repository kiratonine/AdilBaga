import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check } from '../ci/check-source.mjs';
import { checkPerimeterSecrets } from '../network/verify-part14.mjs';
import { root, verify } from './verify-part16.mjs';
verify();
const archive = join(root,'artifacts/production-part-16-review.tar.gz');
function tar(args) { const result=spawnSync('tar',args,{maxBuffer:32<<20}); assert.equal(result.status,0,'archive_operation_failed'); return result.stdout.toString('utf8').trim().split('\n') }
const names=tar(['-tzf',archive]);
assert.equal(new Set(names).size,names.length,'duplicate_members');
const types=tar(['-tvzf',archive]);
assert.equal(types.length,names.length);
assert.ok(types.every(x=>x.startsWith('-')),'non_regular_member');
for(const path of names) {
  check(path,Buffer.alloc(0));
  assert.ok(!/(?:^|\/)(?:TODO|tmp|temp|logs|traces|caches?|credentials|keyrings?)(?:\/|$)/.test(path),'excluded_member');
  assert.ok(!/(?:^|\/)(?:next-env\.d\.ts|credentials\.json|cert\.pem)$|\.(?:sql\.gz|tar(?:\.gz)?|sqlite|db|log)$/i.test(path),'private_generated_backup_member');
}
const temporary=mkdtempSync(join(tmpdir(),'part16-archive-verification-'));
try {
  tar(['-xzf',archive,'-C',temporary,'--no-same-owner','--no-same-permissions']);
  for(const path of names) {
    const bytes=readFileSync(join(temporary,path));
    check(path,bytes); checkPerimeterSecrets(bytes);
    assert.ok(bytes.equals(readFileSync(join(root,path))),'source_report_byte_mismatch');
  }
  for(const path of ['docs/production/reports/PART_16_REPORT.md','docs/production/FRONTEND_REVALIDATION.md',
    'frontend/src/app/internal/revalidate/route.ts','frontend/src/app/internal/revalidate/route.test.ts',
    'backend-go/internal/revalidation/client.go','backend-go/internal/revalidation/client_test.go',
    'scripts/revalidation/verify-part16.mjs']) assert.ok(names.includes(path),'required_member_missing');
  console.log(`Part16 archive PASS: ${names.length} safe regular unique members; all-source/report byte-match; bounded secret scan`);
} finally { rmSync(temporary,{recursive:true,force:true}) }
