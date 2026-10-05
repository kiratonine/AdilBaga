import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '../..');
test('backup guards, bounded metadata, checksum and failure cleanup (synthetic only)', () => {
  const temp = mkdtempSync(tmpdir() + '/adilbaga-part11-guards.');
  try {
    const out = temp + '/encrypted', home = temp + '/keyring', bin = temp + '/bin';
    for (const path of [out, home, bin]) mkdirSync(path, { mode: 0o700 });
    const script = (name, body) => writeFileSync(bin + '/' + name, '#!/bin/sh\nset -eu\n' + body, { mode: 0o700 });
    script('pg_dump', 'if [ "${1:-}" = --version ]; then printf "pg_dump test-double\\n"; exit 0; fi\ntest "${PGHOSTADDR+x}" != x\ntest "${PGSERVICE+x}" != x\nfor a do case "$a" in --file=*) printf "synthetic custom dump" > "${a#--file=}";; esac; done\n');
    script('pg_restore', 'exit 0\n');
    script('gpg', 'if [ "${TEST_ENCRYPT_FAIL:-}" = 1 ]; then exit 1; fi\nwhile [ "$#" -gt 0 ]; do if [ "$1" = --output ]; then shift; printf "synthetic ciphertext" > "$1"; fi; shift; done\n');
    const env = { ...process.env, PGHOSTADDR: '192.0.2.1', PGSERVICE: 'ignored-inherited-service', PATH: bin + ':' + process.env.PATH, BACKUP_DATABASE_URL: 'postgres://local:local@127.0.0.1:15491/part11_test', BACKUP_OUTPUT_DIR: out, BACKUP_GPG_HOME: home, BACKUP_GPG_RECIPIENT: 'A'.repeat(40) };
    const run = (script, changes = {}) => spawnSync('rtk', ['proxy', 'bash', root + '/ops/postgres/' + script], { env: { ...env, ...changes }, encoding: 'utf8' });
    for (const changes of [{ BACKUP_DATABASE_URL: '' }, { BACKUP_OUTPUT_DIR: '' }, { BACKUP_OUTPUT_DIR: 'relative' }, { BACKUP_OUTPUT_DIR: root }, { BACKUP_OUTPUT_DIR: root + '/artifacts' }, { BACKUP_GPG_RECIPIENT: '' }, { BACKUP_GPG_HOME: root }]) {
      assert.notEqual(run('backup.sh', changes).status, 0);
    }
    symlinkSync(root, temp + '/repo-link');
    assert.notEqual(run('backup.sh', { BACKUP_OUTPUT_DIR: temp + '/repo-link' }).status, 0);
    assert.notEqual(run('backup.sh', { TEST_ENCRYPT_FAIL: '1' }).status, 0);
    assert.deepEqual(readdirSync(out), [], 'failed encryption retains no plaintext/ciphertext');
    assert.equal(run('backup.sh').status, 0);
    const files = readdirSync(out);
    assert.equal(files.length, 2);
    const artifact = out + '/' + files.find(name => name.endsWith('.dump.gpg'));
    const metadata = JSON.parse(readFileSync(artifact + '.json'));
    assert.equal(metadata.plaintext_sha256, createHash('sha256').update('synthetic custom dump').digest('hex'));
    assert(metadata.encrypted_bytes > 0);
    for (const url of ['postgres://local:local@example.invalid/part11_test', 'postgres://local:local@127.0.0.1:15491/postgres', 'postgres://local:local@127.0.0.1:15491/part11_test?host=example.invalid']) {
      assert.notEqual(run('restore-test.sh', { RESTORE_DATABASE_URL: url, BACKUP_FILE: artifact }).status, 0);
    }
    assert(!files.some(name => name.startsWith('.part11-plain.')));
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
