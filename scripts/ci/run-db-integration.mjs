import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './common.mjs';
import { postgres } from './postgres.mjs';

await postgres(async ({ url, sql, login, load, go }) => {
  go(['test', '-count=1', '-race', '-tags=integration', './tests/integration',
    '-run', '^(TestDestructiveTargetGuard|TestDeterministicCatalog|TestBootstrapFailsClosed)$', '-v'], {
    TEST_DATABASE_URL: url('part04_fixture'), TEST_API_DATABASE_URL: url('part04_fixture', 'part04_api_login'),
  });
  go(['test', '-count=1', '-race', '-tags=integration', './internal/postgres', '-run', '^TestLocalProductionIdentity$', '-v'], {
    PART10_ADMIN_DATABASE_URL: url('part10_security'), PART10_DISPOSABLE_CONFIRM: '1',
  });
  login('aktau_api_runtime', 'aktau_api_reader');
  for (const db of ['part04_security', 'part08', 'part11_recovery']) load(db);
  sql('part08', "INSERT INTO snapshots(id) VALUES('fixture-unpublished');");
  sql('part08', readFileSync(join(root, 'backend/prisma/security/aktau_ingest_writer_role.sql')));
  login('part08_api', 'aktau_api_reader'); login('part08_writer', 'aktau_ingest_writer');
  go(['test', '-count=1', '-race', '-tags=integration', './tests/integration', '-run', '^TestLocalSnapshotSecurity$', '-v'], {
    SNAPSHOT_SECURITY_DATABASE_URL: url('part08'), SNAPSHOT_SECURITY_READER_URL: url('part08', 'part08_api'),
    SNAPSHOT_SECURITY_WRITER_URL: url('part08', 'part08_writer'), SNAPSHOT_ROLLBACK_CONFIRM: '1',
  });
  go(['test', '-count=1', '-race', '-tags=integration', './internal/postgres',
    '-run', '^(TestLocalPhysicalPoolSessionPolicy|TestLocalClonePlans|TestLocalObservability)$', '-v'], {
    POOL_POLICY_DATABASE_URL: url('part04_security', 'part04_api_login'),
    SMOKE_DATABASE_URL: url('part04_security', 'part04_api_login'),
    PART11_OPERATOR_DATABASE_URL: url('part11_recovery'), PART11_READER_DATABASE_URL: url('part11_recovery', 'aktau_api_runtime'),
  });
  go(['test', '-count=1', '-race', '-tags=integration', './tests/integration', '-run', '^TestCloneRestrictedSecurity$', '-v'], {
    SMOKE_DATABASE_URL: url('part04_security', 'part04_api_login'),
  });
});
