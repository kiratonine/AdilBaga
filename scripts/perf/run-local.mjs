import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { cpus, totalmem, release } from 'node:os';
import assert from 'node:assert/strict';
import { root, env, image, run, docker, backupInputs, owned, loopback, wait, intervalSampler } from './helpers.mjs';
import { token } from './fake-upstash.mjs';

// Private backup inputs are never emitted, written to output, or inherited by API/k6.
const input = backupInputs(process.env);
const prefix = owned('adilbaga-part13-' + randomBytes(6).toString('hex'));
const net = owned(prefix + '-net'), db = owned(prefix + '-db'), api = owned(prefix + '-api'), fake = owned(prefix + '-fake');
const output = join(root, 'artifacts/perf-part13'); mkdirSync(output, { recursive: true });
const resources = new Set(); let network = false, binding, tier, initial, before;
const results = { base: run('base', 'git', ['rev-parse', 'HEAD'], { cwd: root }), metadata: {}, profiles: [], proofs: {} };
const save = () => writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
const pass = label => { results.proofs[label] = true; save(); console.log(label + ': PASS'); };
const create = (name, args) => { owned(name); docker('create owned resource', ['run', '-d', '--name', name, '--label', 'adilbaga.part13=perf', '--label', `adilbaga.part13.owner=${prefix}`, ...args]); resources.add(name); };
const remove = name => { if (resources.has(name)) { docker('owned cleanup', ['rm', '-f', '-v', owned(name)]); resources.delete(name); } };
const sql = (text, target = db) => docker('local SQL', ['exec', '-i', owned(target), 'psql', '-X', '-U', 'postgres', '-d', 'part11_perf', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: text });
const identity = () => JSON.parse(docker('API identity', ['inspect', '--format', '{"id":"{{.Id}}","started":"{{.State.StartedAt}}","restarts":{{.RestartCount}}}', api]));
const unchanged = () => { assert.deepEqual(identity(), initial, 'API restarted'); };
const request = async (path, body) => {
  const r = await fetch(`http://127.0.0.1:${binding.api}${path}`, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000) });
  let b; try { b = await r.json(); } catch { throw Error('invalid_json'); }
  return { status: r.status, body: b };
};
const ready = () => wait(async () => { try { return (await request('/health/ready')).status === 200; } catch { return false; } });
async function startDB(profiling = false, target = db) {
  create(target, ['--network', net, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=part13-local-only',
    'postgres:17-alpine', ...(profiling ? ['-c', 'shared_preload_libraries=pg_stat_statements'] : [])]);
  await wait(() => spawnSync('docker', ['exec', target, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres'], { env, stdio: 'ignore', timeout: 3000 }).status === 0);
  await wait(() => spawnSync('docker', ['exec', '-e', 'PGPASSWORD=part13-local-only', target, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-qAt', '-c', 'SELECT 1'], { env, encoding: 'utf8', timeout: 3000 }).stdout?.trim() === '1');
  docker('create local database', ['exec', target, 'createdb', '-U', 'postgres', 'part11_perf']);
  sql('CREATE ROLE aktau_api_reader NOLOGIN; CREATE ROLE aktau_ingest_writer NOLOGIN;', target);
  const port = docker('PG binding', ['port', target, '5432/tcp']); if (!/^127\.0\.0\.1:\d+$/.test(port)) throw Error('unsafe PG binding');
  return loopback(`postgres://postgres:part13-local-only@${port}/part11_perf`);
}
function prepareRepresentative(target = db) {
  assert.ok(resources.has(owned(target)), 'target not created by this run');
  assert.equal(docker('owned target proof', ['inspect', '--format', '{{index .Config.Labels "adilbaga.part13.owner"}}', target]), prefix);
  sql(`BEGIN;
    DO $$ BEGIN
      IF current_database() <> 'part11_perf' OR to_regnamespace('public') IS NULL
        OR EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace)
        OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace)
        OR EXISTS(SELECT 1 FROM pg_type WHERE typnamespace='public'::regnamespace)
      THEN RAISE EXCEPTION 'fresh target guard failed'; END IF;
    END $$;
    DROP SCHEMA public;
    DO $$ BEGIN
      IF to_regnamespace('public') IS NOT NULL THEN RAISE EXCEPTION 'target preparation failed'; END IF;
    END $$; COMMIT;`, target);
  pass('fresh_owned_empty_public_DROP_RESTRICT_absent');
}
function reader() {
  sql("GRANT USAGE ON SCHEMA public TO aktau_api_reader; GRANT SELECT ON categories,canonical_products,offers,stores,store_locations,snapshots TO aktau_api_reader; CREATE ROLE aktau_api_runtime LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'part13-local-only'; GRANT aktau_api_reader TO aktau_api_runtime WITH ADMIN FALSE,INHERIT TRUE,SET FALSE;");
  const proof = sql("SELECT has_schema_privilege('aktau_api_runtime','public','USAGE') AND (SELECT bool_and(has_table_privilege('aktau_api_runtime',x,'SELECT') AND NOT has_table_privilege('aktau_api_runtime',x,'INSERT,UPDATE,DELETE')) FROM unnest(ARRAY['categories','canonical_products','offers','stores','store_locations','snapshots'])x) AND (SELECT bool_and(NOT has_table_privilege('aktau_api_runtime',x,'SELECT')) FROM unnest(ARRAY['raw_products','product_mappings','source_runs'])x) AND NOT has_schema_privilege('aktau_api_runtime','public','CREATE');");
  assert.equal(proof, 't');
  assert.equal(sql("SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolinherit AND rolcanlogin FROM pg_roles WHERE rolname='aktau_api_runtime';"), 't');
  assert.equal(sql("SELECT count(*)=1 AND bool_and(r.rolname='aktau_api_reader' AND NOT m.admin_option AND m.inherit_option AND NOT m.set_option) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid WHERE member=(SELECT oid FROM pg_roles WHERE rolname='aktau_api_runtime');"), 't');
  const restricted = text => docker('restricted local SELECT', ['exec', '-i', '-e', 'PGPASSWORD=part13-local-only', db, 'psql', '-X', '-h', '127.0.0.1', '-U', 'aktau_api_runtime', '-d', 'part11_perf', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: text });
  assert.equal(restricted('SELECT current_user;'), 'aktau_api_runtime');
  for (const table of ['categories','canonical_products','offers','stores','store_locations','snapshots']) {
    assert.ok(Number(restricted(`SELECT count(*) FROM ${table};`)) > 0, 'restricted SELECT empty');
  }
}
function securityAudit() {
  const rls = JSON.parse(sql("SELECT json_agg(relname ORDER BY relname) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname IN ('canonical_products','categories','offers','product_mappings','raw_products','snapshots','source_runs','store_locations','stores') AND relrowsecurity AND NOT relforcerowsecurity;"));
  assert.deepEqual(rls, ['canonical_products','categories','offers','product_mappings','raw_products','snapshots','source_runs','store_locations','stores']);
  assert.equal(sql("SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relforcerowsecurity;"), '0');
  const expected = [];
  for (const table of ['categories','canonical_products','offers','stores','store_locations','snapshots']) expected.push({ table, role: 'aktau_api_reader', cmd: 'SELECT' });
  for (const [table, commands] of Object.entries({ stores:['SELECT'], categories:['SELECT'], snapshots:['SELECT','INSERT','UPDATE'], source_runs:['SELECT','INSERT','UPDATE'], raw_products:['SELECT','INSERT'], canonical_products:['SELECT','INSERT','UPDATE'], product_mappings:['SELECT','INSERT'], offers:['SELECT','INSERT'] })) {
    for (const cmd of commands) expected.push({ table, role: 'aktau_ingest_writer', cmd });
  }
  const key = p => `${p.table}|${p.role}|${p.cmd}`;
  const policies = JSON.parse(sql("SELECT json_agg(json_build_object('table',tablename,'role',roles[1],'cmd',cmd,'name',policyname,'permissive',permissive,'qual',qual,'check',with_check,'roleCount',cardinality(roles))) FROM pg_policies WHERE schemaname='public';"));
  assert.deepEqual(policies.map(key).sort(), expected.map(key).sort(), 'exact policy matrix');
  for (const p of policies) {
    assert.equal(p.roleCount, 1); assert.equal(p.permissive, 'PERMISSIVE');
    assert.equal(p.name, `${p.role}_${p.cmd.toLowerCase()}`);
    assert.equal(p.qual, p.cmd === 'INSERT' ? null : 'true');
    assert.equal(p.check, p.cmd === 'SELECT' ? null : 'true');
  }
  assert.equal(sql("SELECT (SELECT count(*) FROM snapshots)=1 AND (SELECT count(*) FROM snapshots WHERE status='published' AND \"publishedAt\" IS NOT NULL)=1 AND (SELECT count(*) FROM source_runs)=3 AND (SELECT count(*) FROM source_runs r JOIN snapshots s ON s.id=r.\"snapshotId\" WHERE r.status='succeeded' AND s.status='published')=3;"), 't');
}
async function startAPI(policy = false) {
  const overrides = policy ? [] : ['-e', 'RATE_LIMIT_RPS=1000', '-e', 'RATE_LIMIT_BURST=2000', '-e', 'VOICE_RATE_LIMIT_RPS=100', '-e', 'VOICE_RATE_LIMIT_BURST=200'];
  create(api, ['--network', net, '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '-p', '127.0.0.1::8080', '-e', 'APP_ENV=test', '-e', 'CORS_ALLOWED_ORIGINS=http://127.0.0.1:3100', '-e', 'LOG_LEVEL=info',
    '-e', `DATABASE_URL=postgres://aktau_api_runtime:part13-local-only@${db}:5432/part11_perf?sslmode=disable`,
    '-e', `UPSTASH_REDIS_REST_URL=http://${fake}:8082`, '-e', `UPSTASH_REDIS_REST_TOKEN=${token}`, ...overrides, 'adilbaga-part13-api:review']);
  const port = docker('API binding', ['port', api, '8080/tcp']); if (!/^127\.0\.0\.1:\d+$/.test(port)) throw Error('unsafe API binding');
  binding = { api: port.split(':')[1] }; await ready(); initial = identity();
  assert.equal(docker('non-root', ['exec', api, 'id', '-u']), '10001');
  assert.equal(docker('read-only', ['inspect', '--format', '{{.HostConfig.ReadonlyRootfs}}', api]), 'true');
}
const tables = ['stores','store_locations','categories','raw_products','canonical_products','product_mappings','offers','snapshots','source_runs','_prisma_migrations'];
const mappingsSQL = readFileSync(join(root, 'scripts/perf/product-mappings-audit.sql'), 'utf8');
const mappingsAudit = (target = db) => {
  assert.equal(sql("SELECT string_agg(attname,',' ORDER BY attname COLLATE \"C\") FROM pg_attribute WHERE attrelid='product_mappings'::regclass AND attnum>0 AND NOT attisdropped;", target), 'canonicalProductId,createdAt,id,matchConfidence,matchMethod,rawProductId,reviewStatus', 'mapping field completeness');
  return JSON.parse(sql(mappingsSQL, target));
};
function fingerprints() {
  return Object.fromEntries(tables.map(t => {
    const row = t === 'product_mappings' ? "(to_jsonb(t)-'matchConfidence')::text || encode(float8send(\"matchConfidence\"),'hex')" : 'to_jsonb(t)::text';
    return [t, JSON.parse(sql(`SELECT json_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(md5(${row}),'' ORDER BY id COLLATE "C"),''))) FROM ${t} t;`))];
  }));
}
async function voiceInputs() {
  const schema = (await request('/api/categories/milk/filters')).body;
  const volumes = schema.filters.find(f => f.key === 'volumeMl')?.options ?? [];
  const volume = volumes.includes(1000) ? 1000 : volumes.includes(500) ? 500 : null;
  const fats = schema.filters.find(f => f.key === 'fatPercent')?.options ?? [];
  if (!volume || !fats.length) throw Error('voice_discovery_failed');
  return `${volume === 1000 ? '1 литр' : '500 мл'} ${fats[0]}%`;
}
const coordinates = { latitude: 43.63798231415926, longitude: 51.16918027182818 };
async function direct(fields) {
  const r = await request('/api/voice/start', { ...coordinates, text: 'самое дешёвое молоко ' + fields + ' perfmarkerqzv81739' });
  assert.equal(r.status, 201); assert.equal(r.body.status, 'result');
}
async function clarify(fields) {
  const r = await request('/api/voice/start', { ...coordinates, text: 'самое дешёвое молоко perfmarkerqzv81739' });
  assert.equal(r.status, 201); assert.equal(r.body.status, 'needs_clarification');
  const end = await request('/api/voice/continue', { sessionId: r.body.sessionId, text: fields });
  assert.equal(end.status, 201); assert.equal(end.body.status, 'result');
  const logs = docker('bounded private logs', ['logs', '--tail', '1000', api]);
  if (logs.includes(r.body.sessionId)) throw Error('privacy_session_id');
}
function sample() {
  const stats = docker('stats', ['stats', '--no-stream', '--format', '{{json .}}', api, db]).split('\n').map(JSON.parse);
  const connections = JSON.parse(sql("SELECT json_build_object('total',count(*),'active',count(*) FILTER(WHERE state='active')) FROM pg_stat_activity WHERE usename='aktau_api_runtime';"));
  if (connections.total > 4) throw Error('DB_pool_invariant');
  return { stats: stats.map(s => ({ name: s.Name === api ? 'api' : 'db', cpu: s.CPUPerc, memory: s.MemUsage })), connections };
}
async function profile(mode, rate, duration, label) {
  sql('SELECT pg_stat_statements_reset();');
  const dir = join(output, label); mkdirSync(dir, { recursive: true }); chmodSync(dir, 0o777);
  const samples = []; const sampleNow = () => samples.push(sample()); sampleNow();
  const name = owned(prefix + '-k6');
  resources.add(name);
  let code, child;
  const sampler = intervalSampler(sampleNow, () => child?.kill('SIGTERM'));
  try {
    child = spawn('docker', ['run', '--name', name, '--network', net, '--read-only', '--tmpfs', '/tmp', '--cap-drop=ALL',
      '-v', `${join(root, 'scripts/perf/api-load.js')}:/work/load.js:ro`, '-v', `${dir}:/out`,
      '-e', `API=http://${api}:8080`, '-e', `MODE=${mode}`, '-e', `RATE=${rate}`, '-e', `DURATION=${duration}`, image, 'run', '--quiet', '/work/load.js'], { env, stdio: 'ignore' });
    code = await new Promise((resolve, reject) => { child.on('error', () => reject(Error('k6_start_failed'))); child.on('exit', resolve); });
  } finally { sampler.stop(); remove(name); }
  if (sampler.error) throw Error(sampler.error);
  sampleNow(); unchanged();
  const summary = JSON.parse(readFileSync(join(dir, 'summary.json')));
  const queries = JSON.parse(sql("SELECT coalesce(json_agg(x),'[]') FROM (SELECT queryid::text,calls,mean_exec_time,max_exec_time,total_exec_time,rows FROM pg_stat_statements WHERE userid=(SELECT oid FROM pg_roles WHERE rolname='aktau_api_runtime') ORDER BY total_exec_time DESC LIMIT 8)x;"));
  results.profiles.push({ tier, label, mode, rate, duration, exit: code, summary, samples, queries }); save();
  if (code !== 0) throw Error('k6_profile_failed:' + label);
  console.log('profile ' + label + ': PASS');
}
try {
  results.metadata = { k6: docker('k6 version', ['run', '--rm', image, 'version']), digest: docker('k6 digest', ['image', 'inspect', '--format', '{{index .RepoDigests 0}}', image]),
    docker: docker('Docker version', ['version', '--format', '{{.Server.Version}}']), cpu: cpus().length, memory: totalmem(), os: release(),
    go: run('Go version', 'go', ['version']), pg: 'postgres:17-alpine' };
  docker('reviewed API build', ['build', '--network=none', '--pull=false', '-t', 'adilbaga-part13-api:review', join(root, 'backend-go')]);
  // Docker 29 internal networks omit published ports. Use an owned bridge with
  // loopback-only bindings; every request target is generated from owned names.
  docker('owned network', ['network', 'create', net]); network = true;
  create(fake, ['--network', net, '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '-e', 'PART13_FAKE_CONTAINER=1', '-v', `${join(root, 'scripts/perf/fake-upstash.mjs')}:/work/fake.mjs:ro`, '--user', 'node', 'node:20-alpine', 'node', '/work/fake.mjs']);
  tier = 'fixture'; await startDB(true);
  for (const file of ['20260923000000_init','20261004000000_rls_runtime_access','20261005000000_snapshot_history']) sql(readFileSync(join(root, `backend/prisma/migrations/${file}/migration.sql`)));
  sql(readFileSync(join(root, 'backend-go/tests/fixtures/catalog.sql'))); sql(readFileSync(join(root, 'scripts/ci/fixtures/voice-parity-overlay.sql')));
  reader(); sql('CREATE EXTENSION pg_stat_statements;'); await startAPI();
  await profile('mixed', 1, '30s', 'fixture-smoke'); await direct(await voiceInputs()); await clarify(await voiceInputs()); pass('fixture_smoke');
  remove(api); remove(db);

  tier = 'representative'; const localURL = await startDB();
  prepareRepresentative();
  run('private checksum restore', 'bash', [join(root, 'ops/postgres/restore-test.sh')], { env: { ...env,
    BACKUP_FILE: input.file, BACKUP_GPG_HOME: input.home, RESTORE_DATABASE_URL: localURL } }); pass('checksum_restore_exit_zero');
  before = fingerprints(); results.restored = before;
  const report = readFileSync(join(root, 'docs/production/reports/PART_11_REPORT.md'), 'utf8');
  for (const t of tables) {
    const match = report.match(new RegExp('\\| ' + t + ' \\| (\\d+) \\| ([a-f0-9]+) \\|'));
    assert.ok(match, 'approved count missing'); assert.equal(before[t].count, Number(match[1]), 'restored count mismatch');
    if (t !== 'product_mappings') assert.equal(before[t].fingerprint, match[2], 'restored fingerprint mismatch:' + t);
  }
  const manifest = JSON.parse(readFileSync(input.file + '.json'));
  assert.equal(manifest.plaintext_sha256, 'ee92d9b0f79ce22a4e625fcd89bfda579437924dfccfd90115738ee2189da355');
  const auditA = mappingsAudit(); assert.equal(auditA.count, 863);
  const second = owned(prefix + '-policy');
  const secondURL = await startDB(false, second); prepareRepresentative(second);
  run('independent checksum restore', 'bash', [join(root, 'ops/postgres/restore-test.sh')], { env: { ...env,
    BACKUP_FILE: input.file, BACKUP_GPG_HOME: input.home, RESTORE_DATABASE_URL: secondURL } });
  const auditB = mappingsAudit(second);
  results.productMappingsEquivalent = { A: auditA, B: auditB }; save();
  assert.deepEqual(auditA, auditB, 'product_mappings_double_restore_mismatch');
  remove(second); pass('product_mappings_field_complete_binary_safe_double_restore');
  securityAudit();
  assert.equal(sql('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;'), '20260923000000_init\n20261004000000_rls_runtime_access\n20261005000000_snapshot_history');
  reader(); pass('representative_integrity_history_RLS_restricted_role');
  // Profiling is enabled only after the plain restore and integrity proof.
  sql("ALTER SYSTEM SET shared_preload_libraries='pg_stat_statements';");
  docker('owned profiling restart', ['restart', db]);
  await wait(() => { try { return sql('SELECT 1;') === '1'; } catch { return false; } });
  sql('CREATE EXTENSION pg_stat_statements; ANALYZE;');
  assert.deepEqual(fingerprints(), before, 'profiling changed application data');
  assert.deepEqual(mappingsAudit(), auditA, 'profiling changed versioned mapping audit');
  securityAudit();
  assert.equal(sql("SELECT (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname IN ('canonical_products','categories','offers','product_mappings','raw_products','snapshots','source_runs','store_locations','stores') AND relrowsecurity AND NOT relforcerowsecurity)=9 AND (SELECT count(*) FROM pg_policies WHERE schemaname='public')=23;"), 't');
  pass('local_profiling_preserves_integrity_RLS_history'); await startAPI();
  await profile('mixed', 1, '30s', 'cold-smoke');
  for (const [rate, duration] of [[5,'60s'],[10,'120s'],[20,'180s'],[40,'120s']]) await profile('mixed', rate, duration, 'read-' + rate);
  await profile('mixed', 20, '300s', 'soak-20');
  await profile('dashboard', 5, '60s', 'dashboard-5');
  for (const mode of ['products','price_desc','name_asc','category','search','filter']) await profile(mode, 5, '30s', 'isolated-' + mode);
  await profile('direct', 1, '60s', 'voice-direct'); await profile('clarification', 1, '60s', 'voice-clarification');
  const fields = await voiceInputs(); await direct(fields); await clarify(fields);
  docker('fake outage', ['stop', fake]);
  assert.equal((await request('/api/products')).status, 200); assert.equal((await request('/health/live')).status, 200); assert.equal((await request('/health/ready')).status, 200); await direct(fields);
  assert.equal((await request('/api/voice/start', { ...coordinates, text: 'самое дешёвое молоко perfmarkerqzv81739' })).status, 503); unchanged();
  docker('fake recovery', ['start', fake]); await wait(async () => { try { await clarify(fields); return true; } catch { return false; } }); unchanged(); pass('fake_Redis_outage_recovery_and_Gemini_absent_fallback');
  docker('DB outage', ['stop', db]);
  for (let i=0;i<3;i++) { assert.equal((await request('/health/live')).status,200); assert.equal((await request('/health/ready')).status,503); assert.equal((await request('/api/products')).status,500); }
  unchanged(); docker('DB recovery', ['start', db]); await ready(); assert.equal((await request('/api/products')).status,200); unchanged(); pass('DB_outage_recovery_without_API_restart');
  const logs = docker('privacy logs', ['logs', api]);
  for (const marker of ['perfmarkerqzv81739',String(coordinates.latitude),String(coordinates.longitude)]) if(logs.includes(marker))throw Error('privacy_marker');
  pass('privacy');
  remove(api); await startAPI(true);
  assert.equal((await request('/api/categories')).status,200);
  const general = await Promise.all(Array.from({length:80},()=>request('/api/categories')));
  assert.ok(general.some(r=>r.status===429)); assert.ok(general.every(r=>[200,429].includes(r.status)));
  await wait(async()=> (await request('/api/categories')).status===200); unchanged(); pass('general_default_limiter_recovery');
  // Fresh policy process prevents the spent general bucket masking VoiceGate.
  remove(api); await startAPI(true); await direct(fields);
  const voice = await Promise.all(Array.from({length:12},()=>request('/api/voice/start',{...coordinates,text:'самое дешёвое молоко '+fields})));
  assert.ok(voice.some(r=>r.status===201)); assert.ok(voice.some(r=>r.status===429)); assert.ok(voice.every(r=>[201,429].includes(r.status)));
  await wait(async()=> (await request('/api/voice/start',{...coordinates,text:'самое дешёвое молоко '+fields})).status===201);
  assert.equal((await request('/health/live')).status,200); await ready(); unchanged(); pass('Voice_default_limiter_recovery');
  assert.deepEqual(fingerprints(),before); assert.deepEqual(mappingsAudit(),auditA); securityAudit(); pass('post_fingerprints_unchanged'); results.status='PASS';save();
} catch (e) { results.status='BLOCKED';results.failure=String(e.message).replace(/(?:\/[^ ]+|postgres:\/\/[^ ]+)/g,'[redacted]');save();console.error('Part13 failed class='+results.failure);process.exitCode=1; }
finally {
  for(const name of [...resources].reverse())remove(name);
  if(network)docker('owned network cleanup',['network','rm',owned(net)]);
  console.log('owned cleanup: PASS');
}
