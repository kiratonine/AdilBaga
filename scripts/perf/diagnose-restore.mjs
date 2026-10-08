import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, chmodSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, env, backupInputs, owned, loopback, wait, docker, run, temporary } from './helpers.mjs';

// Inspect raw stderr only in memory. Never emit SQL, archive paths or raw errors.
export function classify(raw) {
  const tests = [
    ['connection', /could not connect|connection.*failed|connection refused|timeout expired/i],
    ['role_prerequisite', /role .*does not exist/i],
    ['extension_prerequisite', /extension .*not available|could not open extension control/i],
    ['duplicate_object', /already exists|duplicate object/i],
    ['missing_relation', /relation .*does not exist/i],
    ['missing_function', /function .*does not exist/i],
    ['permission_denied', /permission denied|must be owner|must be superuser/i],
    ['dependency', /dependenc|depends on/i],
    ['version_or_syntax', /unsupported version|syntax error|unrecognized configuration parameter/i],
    ['constraint', /violates .*constraint|duplicate key|not-null constraint/i],
  ];
  const outcome = tests.find(([, pattern]) => pattern.test(raw))?.[0] ?? 'unknown';
  // Only fixed known application identifiers may escape. Unknown names omitted.
  const allowed = new Set(['public','stores','store_locations','categories','raw_products',
    'canonical_products','product_mappings','offers','snapshots','source_runs','_prisma_migrations',
    'pg_stat_statements','aktau_api_reader','aktau_ingest_writer']);
  const match = raw.match(/(?:schema|relation|function|extension|role) "([a-z_]+)"/i);
  const kind = raw.match(/\b(SCHEMA|TABLE|FUNCTION|EXTENSION|ROLE)\b/i)?.[1]?.toUpperCase();
  return { outcome, ...(match && allowed.has(match[1]) && kind ? { object: { kind, name: match[1] } } : {}) };
}

async function target(task) {
  const name = owned('adilbaga-part13-' + randomBytes(6).toString('hex') + '-db');
  let created = false;
  try {
    docker('plain PG17', ['run','-d','--name',name,'--label','adilbaga.part13=diagnostic',
      '-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD=part13-local-only','postgres:17-alpine']);
    created = true;
    await wait(() => spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-d','postgres'],{env,stdio:'ignore',timeout:3000}).status === 0);
    const sql = text => docker('local diagnostic SQL',['exec','-i',name,'psql','-X','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:text});
    await wait(() => { try { return sql('SELECT 1;') === '1'; } catch { return false; } });
    console.log('server_version=' + sql('SHOW server_version;').replace(/[^a-zA-Z0-9 .()_-]/g,''));
    sql('CREATE ROLE aktau_api_reader NOLOGIN; CREATE ROLE aktau_ingest_writer NOLOGIN; CREATE DATABASE part11_perf;');
    const port = docker('diagnostic loopback binding',['port',name,'5432/tcp']);
    if (!/^127\.0\.0\.1:\d+$/.test(port)) throw Error('unsafe binding');
    const url = loopback(`postgres://postgres:part13-local-only@${port}/part11_perf`);
    await task(url);
  } finally { if(created)docker('owned diagnostic cleanup',['rm','-f','-v',name]); }
}

async function main() {
  const input = backupInputs(process.env);
  console.log('pg_restore_version=' + run('client version','pg_restore',['--version']).replace(/[^a-zA-Z0-9 .()_-]/g,''));
  let success = false;
  await target(async url => {
    const r = spawnSync('bash',[join(root,'ops/postgres/restore-test.sh')],{env:{...env,BACKUP_FILE:input.file,BACKUP_GPG_HOME:input.home,RESTORE_DATABASE_URL:url},encoding:'utf8',maxBuffer:4<<20,timeout:300_000});
    success = r.status === 0;
    console.log('plain_restore=' + (success ? 'PASS' : 'FAIL'));
  });
  if(success)return;
  // Exactly one new target after plain failure; no DB repair or ignored restore errors.
  await target(async url => {
    const dir = temporary(), plaintext = join(dir,'application.dump');
    chmodSync(dir,0o700);
    try {
      const decrypt = spawnSync('gpg',['--homedir',input.home,'--batch','--quiet','--output',plaintext,'--decrypt',input.file],{env,encoding:'utf8',timeout:60_000});
      if(decrypt.status !== 0)throw Error('diagnostic_decrypt_failed');
      chmodSync(plaintext,0o600);
      const m = JSON.parse(readFileSync(input.file+'.json'));
      if(createHash('sha256').update(readFileSync(plaintext)).digest('hex') !== m.plaintext_sha256)throw Error('diagnostic_checksum_failed');
      run('custom format','pg_restore',['--list',plaintext]);
      const u = new URL(url);
      const r = spawnSync('pg_restore',['--verbose','--dbname','part11_perf','--no-owner','--no-acl','--exit-on-error',plaintext],
        {env:{...env,PGHOST:'127.0.0.1',PGPORT:u.port,PGUSER:'postgres',PGPASSWORD:u.password,PGDATABASE:'part11_perf',PGCONNECT_TIMEOUT:'15'},encoding:'utf8',maxBuffer:4<<20,timeout:300_000});
      console.log('diagnostic_restore=' + (r.status === 0 ? 'PASS' : 'FAIL'));
      if(r.status !== 0)console.log(JSON.stringify(classify((r.stdout??'')+(r.stderr??''))));
    } finally { rmSync(dir,{recursive:true,force:true}); }
  });
  process.exitCode=1;
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); }
  catch { console.error('diagnostic_helper_failed'); process.exitCode=1; }
}
