// Explicit LOCAL integration entrypoint. Owns a fresh disposable PG17 through
// the existing CI harness. No production transport, supplied DSN or binary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomBytes } from 'node:crypto';
import { postgres } from '../ci/postgres.mjs';
import { createLocalGoProjectionProvider } from './projection-provider.mjs';
import { openReceiver, calibrateClock } from './fifo-adapter.mjs';
import { createEventSource } from './production-observer.mjs';
import { prepareBeforeV2 } from './c2-manifest.mjs';
import { fixtureBody } from './fixtures/c2-manifest.mjs';

const exec = promisify(execFile), sourceSha = '4ba5b5276c0f2148b22fb31473f1f6816ef09d3f';
const frontendSha = '61eccfb957237781a8b5c14110f4a73de4952e83';
const s0 = 'aaaaaaaa-0000-4000-8000-000000000000', s1 = 'bbbbbbbb-1111-4111-8111-111111111111';
const s2 = 'cccccccc-2222-4222-8222-222222222222';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aktau-c2-joint-'));
fs.chmodSync(directory, 0o700);
const cleanEnv = { HOME: process.env.HOME, PATH: process.env.PATH, GOTOOLCHAIN: 'local' };
function virtualClock() {
  let time = 0, queued = false; const timers = [];
  const sleep = ms => new Promise(resolve => {
    timers.push({ at: time + ms, resolve });
    if (!queued) { queued = true; setImmediate(function pump() {
      queued = false; time = Math.min(...timers.map(t => t.at));
      for (const t of [...timers]) if (t.at <= time) { timers.splice(timers.indexOf(t), 1); t.resolve() }
      if (timers.length) { queued = true; setImmediate(pump) }
    }) }
  });
  return { now: () => time, set: v => { time = v }, sleep };
}
try {
  // Pin the Go source tree to the approved provider commit, not an invented
  // deployment identity. Node integration has no Go runtime modifications.
  assert.equal(execFileSync('git', ['diff', sourceSha, '--', 'backend-go/cmd/c2projection', 'backend-go/internal/postgres'], { encoding: 'utf8' }), '');
  for (const [name, pkg] of [['c2projection', './cmd/c2projection'], ['relayprobe', './internal/revalidation/testdata/relayprobe'], ['fixture', './internal/revalidation/testdata/c2fixture']]) {
    execFileSync('go', ['build', '-ldflags', '-X main.sourceSHA=' + sourceSha, '-o', path.join(directory, name), pkg], { cwd: 'backend-go', env: cleanEnv, timeout: 120000 });
    fs.chmodSync(path.join(directory, name), 0o700);
  }
  const binarySha256 = createHash('sha256').update(fs.readFileSync(path.join(directory, 'c2projection'))).digest('hex');
  await postgres(async ({ url, sql, login }) => {
    login('aktau_api_runtime', 'aktau_api_reader');
    const databaseURL = url('part16_c2', 'aktau_api_runtime');
    const providerOptions = { directory, binarySha256, sourceSha, frontendSha, databaseURL };
    const reset = () => {
      sql('part16_c2', `TRUNCATE snapshots,stores,categories,canonical_products CASCADE;
INSERT INTO stores(id,code,name) VALUES ('dina','DINA','Dina'),('dana','DANA','Dana'),('fix','FIX_PRICE','Fix Price');
INSERT INTO categories(id,slug,name) VALUES ('milk','milk','Milk');
INSERT INTO canonical_products(id,name,brand,"categoryId",attributes) SELECT 'p'||lpad(i::text,2,'0'),'Fixture '||i,'A','milk','{}' FROM generate_series(1,12)i;
INSERT INTO snapshots(id,status,"publishedAt") VALUES ('${s0}','published','2026-10-15 12:00:00'),('${s1}','validating',NULL);
INSERT INTO raw_products(id,"storeId","sourceProductId","rawName","rawPrice","snapshotId")
SELECT snap||'-'||s||'-'||i,s,s||i,'fixture',100,snap FROM generate_series(1,12)i,unnest(ARRAY['dina','dana'])s,unnest(ARRAY['${s0}','${s1}'])snap;
INSERT INTO offers(id,"canonicalProductId","rawProductId","storeId",price,"inStock","snapshotAt","snapshotId")
SELECT 'o-'||snap||'-'||s||'-'||i,'p'||lpad(i::text,2,'0'),snap||'-'||s||'-'||i,s,
CASE s WHEN 'dina' THEN 100+i ELSE 100+i+i*i*3 END,true,
CASE WHEN i=5 THEN '2026-10-15 10:00:00.123'::timestamp ELSE '2026-10-15 11:00:00.123'::timestamp END,snap
FROM generate_series(1,12)i,unnest(ARRAY['dina','dana'])s,unnest(ARRAY['${s0}','${s1}'])snap;`);
    };
    const publish = ({ unchanged = false } = {}) => sql('part16_c2', `BEGIN;
UPDATE canonical_products SET name=name||' revised';
${unchanged ? '' : `UPDATE offers SET "snapshotAt"="snapshotAt"+interval '1 day' WHERE "snapshotId"='${s1}';`}
UPDATE snapshots SET status='published',"publishedAt"='2026-10-16 12:00:00' WHERE id='${s1}'; COMMIT;`);
    const setup = async () => {
      reset();
      const provider = createLocalGoProjectionProvider(providerOptions), attemptId = randomBytes(16).toString('hex');
      const before = await provider.before(attemptId); assert.ok(before);
      const prepared = prepareBeforeV2(before); assert.equal(prepared.status, 'ready'); assert.equal(prepared.witness.id, 'p05');
      const fifoDir = fs.mkdtempSync(path.join(directory, 'fifo-')); fs.chmodSync(fifoDir, 0o700);
      const fifo = path.join(fifoDir, 'event'); execFileSync('mkfifo', ['-m', '600', fifo]);
      return { provider, attemptId, before, prepared, fifo, calibration: calibrateClock(path.join(directory, 'relayprobe')) };
    };
    // Actual current Go C2Project state is an independent fixture renderer only:
    // never registered as trusted AFTER, not substituted for the real CLI.
    // Exactly one trusted CLI AFTER is acquired by the adapter after capture.
    const renderTargets = async c => {
      const result = await exec(path.join(directory, 'fixture'), [s1, s0, c.prepared.witness.id, c.prepared.witness.slug], {
        env: { C2_PROJECTION_DATABASE_URL: databaseURL }, timeout: 10000, maxBuffer: 16384 });
      const state = JSON.parse(result.stdout);
      assert.equal(state.SnapshotID, s1);
      assert.ok(state.Body && Array.isArray(state.Body.candidates), 'Go fixture Body.candidates required');
      assert.equal(state.Body.candidates.length, 1, 'Go fixture must have one pinned candidate');
      const product = state.Body.candidates[0];
      assert.equal(product.id, c.prepared.witness.id, 'Go fixture witness identity');
      assert.equal(product.slug, c.prepared.witness.slug, 'Go fixture witness category');
      const timestamp = value => typeof value === 'string' && value.length === 24
        && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
        && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
      assert.ok(timestamp(product.snapshotAt) && timestamp(state.Body.dashboardAt), 'Go fixture exact timestamps required');
      return c.prepared.targets.map(t => ({ ...t, after: ['catalog', 'dashboard', 'sitemap'].includes(t.name) ? state.Body.dashboardAt : product.snapshotAt,
        productAfter: product.snapshotAt }));
    };
    const notify = async (c, status = 204) => {
      const result = await exec(path.join(directory, 'relayprobe'), ['notify', String(status), c.fifo, s1], {
        env: { C2_EVENT_ATTEMPT_ID: c.attemptId }, timeout: 10000, maxBuffer: 2048 });
      const summary = JSON.parse(result.stdout); assert.equal(summary.requests, 1); assert.equal(summary.relay, 'sent');
      return summary;
    };
    await test('REAL Go CLI S0 -> SQL fixture COMMIT S1 -> signed loopback204/FIFO ->6 bodies -> real CLI AFTER ->PASS', async () => {
      const c = await setup(); publish();
      let reference, calls = 0;
      const get = async p => { calls++; reference ??= renderTargets(c); const targets = await reference;
        return { status: 200, text: fixtureBody(targets.find(t => t.path === p)), headers: { date: 'diagnostic' } } };
      const observing = openReceiver(c).observe({ get }); await notify(c);
      const result = await observing;
      assert.equal(result.acceptance, 'PASS'); assert.equal(calls, 6); assert.equal(result.request_count, 6);
      assert.equal(result.before.sourceSha, sourceSha); assert.equal(result.after.sourceSha, sourceSha);
      assert.equal(result.after.frontendSha, frontendSha); assert.notEqual(c.before.body.dashboardAt, c.before.body.candidates.find(x => x.id === 'p05').snapshotAt);
      assert.equal(result.event.receipt.snapshotId, s1);
      assert.ok(Object.isFrozen(result.events[0].markers)); assert.throws(() => { result.events[0].markers[0] = 'corrupt' }, TypeError);
      assert.equal((await c.provider.after(JSON.parse(JSON.stringify(result)), c.before)).acceptance, 'INCONCLUSIVE');
      console.log(JSON.stringify({ joint: 'PASS', fixture_publication: 'SQL_COMMIT_NOT_STAGE_PUBLISH', paths: result.results.map(r => r.target),
        requests: calls, clock_uncertainty_ms: result.clock_uncertainty_ms, first_fresh_ms: result.results.map(r => r.first_fresh_ms), fixtureOnly: c.provider.fixtureOnly }));
    });
    await test('real CLI changed body unequal to trusted AFTER ->INCONCLUSIVE', async () => {
      const c = await setup(); publish(); let reference;
      const observing = openReceiver(c).observe({ get: async p => { reference ??= renderTargets(c);
        const t = (await reference).find(t => t.path === p);
        return { status: 200, headers: {}, text: fixtureBody({ ...t, after: '2099-01-01T00:00:00.000Z', productAfter: '2099-01-01T00:00:00.000Z' }) }; } });
      await notify(c); const result = await observing;
      assert.equal(result.acceptance, 'INCONCLUSIVE');
      assert.equal(result.results.length, 6); assert.equal(result.events.length, 6);
      assert.ok(result.events.every(e => e.class === 'changed' && e.error === null && e.status === 200));
    });
    await test('real FIFO and CLI: selected stale body ->fresh within original5s', async () => {
      const c = await setup(); publish(); let reference, count = 0;
      const observing = openReceiver(c).observe({ get: async p => {
        reference ??= renderTargets(c); const t = (await reference).find(t => t.path === p);
        return { status: 200, headers: {}, text: fixtureBody(t, t.name !== 'product_ru' || ++count > 1) };
      } });
      await notify(c); const result = await observing; assert.equal(result.acceptance, 'PASS');
      assert.equal(result.request_count, 7); assert.equal(result.results.find(t => t.target === 'product_ru').stale_count, 1);
    });
    await test('actual200 is not C2 accepted204 and admits0 GET', async () => {
      const c = await setup(); publish(); let calls = 0;
      const observing = openReceiver(c).observe({ get: () => { calls++; assert.fail('no GET') } });
      const summary = await notify(c, 200); assert.equal(summary.outcome, 'success');
      assert.equal((await observing).reason, 'not_accepted204'); assert.equal(calls, 0);
    });
    await test('real CLI unchanged marker cannot turn persistent stale into FAIL', async () => {
      const c = await setup(); publish({ unchanged: true });
      // Same trusted event-source API, virtual shared clock solely for long
      // diagnostic scheduling; the end-to-end positive test uses real FIFO.
      const clock = virtualClock(), source = createEventSource({ now: clock.now });
      source.begin(c.attemptId); source.accept204(204, { status: 204, snapshotId: s1, attemptId: c.attemptId });
      const captured = await source.capture(c.before, { sleep: clock.sleep,
        get: async p => ({ status: 200, headers: {}, text: fixtureBody(c.prepared.targets.find(t => t.path === p), false) }) });
      assert.equal(captured.acceptance, 'capture_complete');
      assert.ok(captured.events.length > 0 && captured.events.every(e => e.error === null));
      const verdict = await c.provider.after(captured, c.before);
      assert.equal(verdict.acceptance, 'INCONCLUSIVE'); assert.equal(verdict.reason, 'unchanged_marker');
    });
    for (const scenario of ['late_discovery', 'proven_stale', 'after_late', 'intervening', 'moved_witness', 'missing_witness', 'wrong_event']) {
      await test(`real CLI negative: ${scenario}`, async () => {
        const c = await setup(); publish();
        const targets = await renderTargets(c), clock = virtualClock(), source = createEventSource({ now: clock.now });
        source.begin(c.attemptId); source.accept204(204, { status: 204, snapshotId: scenario === 'wrong_event' ? s2 : s1, attemptId: c.attemptId });
        const captured = await source.capture(c.before, { sleep: clock.sleep, get: async p => {
          const t = targets.find(t => t.path === p);
          const fresh = scenario !== 'proven_stale' && (scenario !== 'late_discovery' || t.name === 'sitemap' || clock.now() >= 3000);
          return { status: 200, headers: {}, text: fixtureBody(t, fresh) };
        } });
        if (scenario === 'after_late') clock.set(60001);
        if (scenario === 'intervening') sql('part16_c2', `INSERT INTO snapshots(id,status,"publishedAt") VALUES ('${s2}','published','2026-10-17 12:00:00')`);
        if (scenario === 'moved_witness') sql('part16_c2', `INSERT INTO categories(id,slug,name) VALUES ('bread','bread','Bread'); UPDATE canonical_products SET "categoryId"='bread' WHERE id='p05'`);
        if (scenario === 'missing_witness') sql('part16_c2', `UPDATE offers SET "inStock"=false WHERE "snapshotId"='${s1}' AND "canonicalProductId"='p05'`);
        const verdict = await c.provider.after(captured, c.before);
        assert.equal(captured.acceptance, 'capture_complete');
        assert.ok(captured.events.length >= 6 && captured.events.every(e => e.error === null && e.status === 200));
        assert.equal(verdict.acceptance, scenario === 'proven_stale' ? 'FAIL' : 'INCONCLUSIVE');
        const reasons = { after_late: 'after_late', intervening: 'after_unavailable', wrong_event: 'after_unavailable',
          moved_witness: 'unqualified_after', missing_witness: 'unqualified_after' };
        if (reasons[scenario]) assert.equal(verdict.reason, reasons[scenario]);
        if (scenario === 'late_discovery') {
          const product = verdict.results.find(r => r.target === 'product_ru');
          assert.equal(product.first_fresh_ms, 7500); assert.equal(product.acceptance, 'INCONCLUSIVE');
        }
        if (scenario === 'proven_stale') {
          assert.equal(captured.request_count, 21);
          assert.ok(verdict.events.some(e => e.class === 'stale' && e.start_elapsed_ms > 5000));
        }
        assert.ok(captured.request_count <= 21); assert.ok(captured.events.filter(e => e.target === 'sitemap').length <= 2);
        assert.equal((await c.provider.after(captured, c.before)).reason, 'after_already_requested');
      });
    }
    await test('real CLI source identity mismatch cannot mint BEFORE', async () => {
      reset();
      assert.equal(await createLocalGoProjectionProvider({ ...providerOptions, sourceSha: 'd'.repeat(40) }).before(randomBytes(16).toString('hex')), null);
    });
    await test('real provider refuses remote/production configuration and symlink binary', () => {
      for (const databaseURL of [url('part16_c2'), providerOptions.databaseURL.replace('127.0.0.1', 'remote.invalid'),
        providerOptions.databaseURL.replace('part16_c2', 'production')]) assert.throws(() => createLocalGoProjectionProvider({ ...providerOptions, databaseURL }));
      const file = path.join(directory, 'c2projection'), moved = file + '.owned'; fs.renameSync(file, moved); fs.symlinkSync(moved, file);
      try { assert.throws(() => createLocalGoProjectionProvider(providerOptions)) } finally { fs.unlinkSync(file); fs.renameSync(moved, file) }
    });
    await test('real provider read-only ACL failure produces no BEFORE', async () => {
      reset(); sql('part16_c2', 'GRANT INSERT ON offers TO aktau_api_runtime');
      try { assert.equal(await createLocalGoProjectionProvider(providerOptions).before(randomBytes(16).toString('hex')), null) }
      finally { sql('part16_c2', 'REVOKE INSERT ON offers FROM aktau_api_runtime') }
    });
  });
} finally { fs.rmSync(directory, { recursive: true, force: true }) }
