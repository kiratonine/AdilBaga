import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { preparePlan, reviewBundle, NODE_FILES, BUILD_RECIPE } from './c2-provisioning-plan.mjs';
test('offline plan never accepts an approval or probes environment', () => {
  assert.equal(preparePlan().status, 'C2_READY_FOR_APPROVAL');
  assert.throws(() => preparePlan({ approved: true }));
  const r = spawnSync(process.execPath, [path.join(import.meta.dirname, 'c2-provisioning-plan.mjs')], { env: {}, encoding: 'utf8' });
  assert.equal(r.status, 0); assert.equal(r.stdout, 'C2_READY_FOR_APPROVAL\n');
});
test('real installer sandbox negative/positive suite (no host root writes)', () => {
  const r = spawnSync('python3', ['-B', '-m', 'unittest', 'discover', '-s', 'ops/c2', '-p', 'test_*.py'], {
    cwd: path.resolve(import.meta.dirname, '../..'), encoding: 'utf8', timeout: 60000,
  });
  assert.equal(r.status, 0, 'installer suite failed: ' + r.stderr);
  assert.match(r.stderr, /OK/);
});
test('bundle review binds exact immutable source and rejects drift, links and malformed ELF', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aktau-c2-review-'));
  try {
    const elf = Buffer.alloc(64); elf.set([0x7f, 69, 76, 70, 2, 1]); elf.writeUInt16LE(62, 18);
    for (const name of ['c2projection', 'relayprobe']) fs.writeFileSync(path.join(dir, name), elf, { mode: 0o600 });
    for (const name of NODE_FILES) fs.copyFileSync(path.join(root, 'scripts/revalidation', name), path.join(dir, name));
    fs.writeFileSync(path.join(dir, 'source-manifest.json'), JSON.stringify({ sourceSha: sha, recipe: BUILD_RECIPE, nodeMajor: 24 }) + '\n', { mode: 0o600 });
    assert.equal(reviewBundle(dir, sha).status, 'REVIEW_REQUIRED_NOT_APPROVAL');
    assert.throws(() => reviewBundle(dir, '0'.repeat(40)), /BLOCKED/);
    const module = path.join(dir, NODE_FILES[0]); const original = fs.readFileSync(module);
    fs.appendFileSync(module, '// drift\n'); assert.throws(() => reviewBundle(dir, sha), /BLOCKED/); fs.writeFileSync(module, original);
    const manifest = path.join(dir, 'source-manifest.json');
    fs.linkSync(manifest, path.join(dir, 'extra')); assert.throws(() => reviewBundle(dir, sha), /BLOCKED/); fs.unlinkSync(path.join(dir, 'extra'));
    const binary = path.join(dir, 'relayprobe'); fs.writeFileSync(binary, 'bad ELF'); assert.throws(() => reviewBundle(dir, sha));
  } finally { fs.rmSync(dir, { recursive: true }); }
});
