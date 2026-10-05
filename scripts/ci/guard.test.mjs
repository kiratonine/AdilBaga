import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env, localURL, browserInstallArgs } from './common.mjs';
import { eventBase } from './select-event-base.mjs';

test('setup refuses caller-controlled hosts/options/database/credentials', () => {
  const good = 'postgres://postgres:ci-local-only@127.0.0.1:15432/part04_fixture?sslmode=disable';
  assert.ok(localURL(good));
  for (const value of [undefined, '', good.replace('127.0.0.1', 'remote.invalid'),
    good + '&host=remote.invalid', good.replace('part04_fixture', 'production'),
    good.replace('ci-local-only', 'owner-secret'), good.replace(':15432', ''),
    good.replace('127.0.0.1', 'localhost')]) assert.throws(() => localURL(value));
});
test('browser setup distinguishes hosted CI and local reproduction without sudo', () => {
  assert.deepEqual(browserInstallArgs({ CI: 'true', PW_CHANNEL: 'chrome' }), ['exec', 'playwright', 'install', '--with-deps', 'chromium']);
  assert.equal(browserInstallArgs({ PW_CHANNEL: 'chrome' }), null);
  assert.deepEqual(browserInstallArgs({}), ['exec', 'playwright', 'install', 'chromium']);
  assert.deepEqual(browserInstallArgs({ CI: 'false' }), ['exec', 'playwright', 'install', 'chromium']);
});
test('event base uses PR base, push before and no fabricated dispatch base', () => {
  const a = 'a'.repeat(40), b = 'b'.repeat(40);
  assert.equal(eventBase('pull_request', { pull_request: { base: { sha: a }, head: { sha: b } }, before: b }), a);
  assert.equal(eventBase('push', { before: b, after: a }), b);
  assert.equal(eventBase('push', { before: '0'.repeat(40) }), '0'.repeat(40));
  assert.equal(eventBase('workflow_dispatch', { before: b }), '');
  for (const [name, event] of [['pull_request', {}], ['push', {}], ['push', { before: 'not-a-sha' }],
    ['push', { before: `${a}\nUNTRUSTED=1` }], ['pull_request_target', {}]]) assert.throws(() => eventBase(name, event));
});
test('child environment contains no provider/live/backup fallback', () => {
  for (const key of Object.keys(env)) assert.doesNotMatch(key, /^(LIVE_|TEST_|BACKUP_|PG|UPSTASH|GEMINI)/);
  assert.equal(env.DATABASE_URL, 'postgres://ci:ci@127.0.0.1:1/unused');
  assert.equal(env.DIRECT_URL, env.DATABASE_URL);
});
