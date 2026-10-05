import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, env, run, wait, localURL } from './common.mjs';

// No caller-selected database: create a new owned container and derive loopback
// port from Docker. Only this container can receive setup SQL or be cleaned up.
export async function postgres(task) {
  const name = `adilbaga-part12-${randomBytes(6).toString('hex')}`;
  let created = false;
  const docker = (label, args, options) => run(label, 'docker', args, options);
  try {
    docker('create disposable PG17', ['run', '-d', '--name', name, '--label', 'adilbaga.part12=ci',
      '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=ci-local-only', 'postgres:17-alpine']);
    created = true;
    // The image's temporary init server is socket-only; wait for the final TCP server.
    await wait('PG final TCP readiness', () => spawnSync('docker', ['exec', name, 'pg_isready',
      '-h', '127.0.0.1', '-p', '5432', '-U', 'postgres', '-d', 'postgres'],
      { env, stdio: 'ignore', timeout: 3000 }).status === 0);
    await wait('PG TCP SELECT 1', () => {
      const result = spawnSync('docker', ['exec', '-e', 'PGPASSWORD=ci-local-only', name,
        'psql', '-X', '-h', '127.0.0.1', '-p', '5432', '-U', 'postgres', '-d', 'postgres',
        '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', 'SELECT 1'],
      { env, encoding: 'utf8', timeout: 3000 });
      return result.status === 0 && result.stdout.trim() === '1';
    });
    const binding = docker('loopback binding', ['port', name, '5432/tcp']);
    if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error('unsafe PG binding');
    const url = (db, user = 'postgres') => {
      const value = `postgres://${user}:ci-local-only@${binding}/${db}?sslmode=disable`;
      localURL(value.replace(`${user}:`, 'postgres:'));
      return value;
    };
    const sql = (db, text) => {
      localURL(url(db));
      return docker(`local SQL ${db}`, ['exec', '-i', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
        '-U', 'postgres', '-d', db, '-qAt'], { input: text });
    };
    docker('reader bootstrap', ['exec', '-i', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-q'],
      { input: readFileSync(join(root, 'backend/prisma/security/aktau_api_reader_role.sql')) });
    run('Nest frozen install', 'pnpm', ['install', '--frozen-lockfile'], { cwd: join(root, 'backend') });
    const databases = ['part04_fixture', 'part04_security', 'part08', 'part10_security', 'part11_recovery'];
    for (const db of databases) {
      docker(`create ${db}`, ['exec', name, 'createdb', '-U', 'postgres', db]);
      const target = url(db); localURL(target);
      run(`Prisma migrate deploy ${db}`, 'pnpm', ['exec', 'prisma', 'migrate', 'deploy'],
        { cwd: join(root, 'backend'), env: { ...env, DATABASE_URL: target, DIRECT_URL: target } });
      const applied = sql(db, 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;');
      if (applied !== '20260923000000_init\n20261004000000_rls_runtime_access\n20261005000000_snapshot_history') throw new Error('migration chain mismatch');
    }
    const login = (user, parent) => sql('part04_fixture', `CREATE ROLE ${user} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'ci-local-only'; GRANT ${parent} TO ${user} WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;`);
    login('part04_api_login', 'aktau_api_reader');
    const fixture = readFileSync(join(root, 'backend-go/tests/fixtures/catalog.sql'));
    const load = db => sql(db, fixture);
    const go = (args, extra) => console.log(run(`Go local ${args.join(' ')}`, 'go', args,
      { cwd: join(root, 'backend-go'), env: { ...env, ...extra } }));
    await task({ name, url, sql, login, load, go, docker });
  } finally {
    if (created) {
      // Exact owned name only; anonymous volumes created by this container only.
      docker('PG cleanup', ['rm', '-f', '-v', name]);
    }
  }
}
