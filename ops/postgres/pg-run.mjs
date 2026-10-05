import { spawnSync } from 'node:child_process';

// libpq does not expand a URI provided through the PGDATABASE environment
// default. Parse it into private env fields instead of exposing it in argv.
try {
  const [name, command, ...args] = process.argv.slice(2);
  if (!['BACKUP_DATABASE_URL', 'RESTORE_DATABASE_URL'].includes(name) || !['pg_dump', 'pg_restore'].includes(command)) throw Error();
  const u = new URL(process.env[name]);
  const env = { ...process.env };
  // Inherited PGHOSTADDR/PGSERVICE must not redirect an explicit operator URL.
  for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
  Object.assign(env, { PGHOST: u.hostname.replace(/^\[|\]$/g, ''), PGPORT: u.port || '5432', PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: decodeURIComponent(u.pathname.slice(1)), PGCONNECT_TIMEOUT: '15' });
  if (command === 'pg_dump') env.PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=300000';
  for (const [key, value] of u.searchParams) {
    const field = { sslmode: 'PGSSLMODE', sslrootcert: 'PGSSLROOTCERT', channel_binding: 'PGCHANNELBINDING', connect_timeout: 'PGCONNECT_TIMEOUT' }[key];
    if (!field) throw Error();
    env[field] = value;
  }
  // pg_restore needs --dbname to actually restore, rather than emit SQL.
  const operationArgs = command === 'pg_restore' ? ['--dbname', env.PGDATABASE, ...args] : args;
  const result = spawnSync('rtk', ['proxy', command, ...operationArgs], { env, encoding: 'utf8', maxBuffer: 4 << 20 });
  if (result.status !== 0) {
    const diagnostic = (result.stdout || '') + (result.stderr || '');
    const outcome = /permission denied/i.test(diagnostic) ? 'permission_denied' : /role .*does not exist/i.test(diagnostic) ? 'role_prerequisite' : /extension .*not available/i.test(diagnostic) ? 'extension_prerequisite' : /connection.*failed|could not connect/i.test(diagnostic) ? 'connection' : 'operation_failed';
    console.error('postgres_outcome_class=' + outcome);
  }
  process.exit(result.status ?? 1);
} catch { console.error('postgres_operation_failed'); process.exit(1); }
