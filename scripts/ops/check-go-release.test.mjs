import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import https from 'node:https';
import { checkRelease, main } from './check-go-release.mjs';

const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const hash = b => createHash('sha256').update(b).digest('hex');
function fixture(t, ref = sha) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aktau-release-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'backend-go'));
  const archive = Buffer.from('synthetic-not-a-docker-archive'), binary = Buffer.from('synthetic-api');
  fs.writeFileSync(path.join(dir, 'image.tar'), archive); fs.writeFileSync(path.join(dir, 'api'), binary);
  const manifest = { sha: ref, revision: ref, os: 'linux', arch: 'amd64', user: '10001:10001', entrypoint: ['/usr/local/bin/api'], rootfs: ['sha256:' + 'a'.repeat(64)], archive: hash(archive), binary: hash(binary), size: archive.length };
  const save = () => fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest)); save();
  for (const name of ['Dockerfile', 'go.mod']) fs.writeFileSync(path.join(dir, 'backend-go', name), execFileSync('git', ['show', ref + ':backend-go/' + name]));
  return { dir, manifest, save };
}
test('default is offline, no file/network and no echo of private arguments', () => {
  const io = mock.method(fs, 'openSync', () => assert.fail('file read'));
  const net = mock.method(https, 'request', () => assert.fail('network'));
  try { let out; assert.equal(main([], x => { out = x }), 0); assert.equal(JSON.parse(out).status, 'NOT_VERIFIED'); assert.equal(main(['PRIVATE_SENTINEL'], x => { assert.ok(!x.includes('PRIVATE_SENTINEL')) }), 2); }
  finally { io.mock.restore(); net.mock.restore() }
});
test('valid local bytes and exact recipe ready only for review, never production approval', t => {
  const f = fixture(t), r = checkRelease(f.dir, sha);
  assert.equal(r.status, 'READY_FOR_OWNER_REVIEW'); assert.equal(r.production, 'BLOCKED');
  for (const gate of ['hosted_ci','saved_image_contents','independent_authorization','rollback_compatibility','post_cutover_smoke']) assert.equal(r.gates.find(g => g.gate === gate).status, 'NOT_VERIFIED');
  assert.ok(!JSON.stringify(r).includes(f.dir));
});
for (const [name, change] of [
  ['wrong sha', m => { m.sha = 'b'.repeat(40) }], ['missing sha', m => { delete m.sha }],
  ['wrong revision', m => { m.revision = 'c'.repeat(40) }], ['wrong platform', m => { m.arch = 'arm64' }],
  ['root user', m => { m.user = '0' }], ['wrong entrypoint', m => { m.entrypoint = ['/bin/sh'] }],
  ['altered archive digest', m => { m.archive = 'd'.repeat(64) }], ['altered binary digest', m => { m.binary = 'e'.repeat(64) }],
  ['wrong size', m => { m.size++ }], ['unknown approval', m => { m.approved = true }],
  ['invalid layer', m => { m.rootfs = ['unsafe'] }], ['digest newline', m => { m.binary += '\n' }],
]) test('reject local candidate ' + name, t => {
  const f = fixture(t); change(f.manifest); f.save(); assert.equal(checkRelease(f.dir, sha).status, 'BLOCKED');
});
for (const kind of ['symlink', 'oversize', 'secret', 'duplicate', 'recipe', 'toolchain', 'binary_symlink', 'directory_symlink']) test('reject unsafe input ' + kind, t => {
  const f = fixture(t), file = path.join(f.dir, 'manifest.json');
  if (kind === 'symlink') { fs.renameSync(file, file + '.real'); fs.symlinkSync(file + '.real', file); }
  if (kind === 'oversize') fs.writeFileSync(file, ' '.repeat(16385));
  if (kind === 'secret') fs.writeFileSync(file, '{"secret":"postgres://private:PRIVATE_SENTINEL@private.invalid/db"}');
  if (kind === 'duplicate') fs.writeFileSync(file, JSON.stringify(f.manifest).replace('{', '{"sha":"' + sha + '",'));
  if (kind === 'recipe') fs.appendFileSync(path.join(f.dir, 'backend-go/Dockerfile'), '\nFROM unsafe\n');
  if (kind === 'toolchain') fs.appendFileSync(path.join(f.dir, 'backend-go/go.mod'), '\ntoolchain go1.99.0\n');
  if (kind === 'binary_symlink') { fs.unlinkSync(path.join(f.dir, 'api')); fs.symlinkSync('/etc/passwd', path.join(f.dir, 'api')); }
  let dir = f.dir;
  if (kind === 'directory_symlink') { dir = f.dir + '-link'; fs.symlinkSync(f.dir, dir); t.after(() => fs.unlinkSync(dir)); }
  const r = checkRelease(dir, sha); assert.equal(r.status, 'BLOCKED'); assert.ok(!JSON.stringify(r).includes('PRIVATE_SENTINEL'));
});
test('full exact SHA required including trailing newline, unsupported mode fails closed', t => {
  const f = fixture(t);
  for (const s of ['', sha.slice(0, 39), sha + '\n', sha.toUpperCase(), 'not-a-sha']) assert.equal(checkRelease(f.dir, s).status, 'BLOCKED');
});
test('rollback cannot be the candidate or substitute an unvalidated target', t => {
  const f = fixture(t); assert.equal(checkRelease(f.dir, sha, { directory: f.dir, sha }).status, 'BLOCKED');
  assert.equal(checkRelease(f.dir, sha, { directory: '/missing', sha: 'a'.repeat(40) }).status, 'BLOCKED');
});
test('separate valid local rollback is not compatibility or production proof; no input writes', t => {
  const f = fixture(t), previous = '438ecdfa3d386a186dcd8b73c3c10aef5e79dc82', old = fixture(t, previous);
  const before = fs.readFileSync(path.join(f.dir, 'manifest.json'));
  const r = checkRelease(f.dir, sha, { directory: old.dir, sha: previous });
  assert.equal(r.status, 'READY_FOR_OWNER_REVIEW'); assert.equal(r.production, 'BLOCKED');
  assert.equal(r.gates.find(g => g.gate === 'rollback_local_bytes').status, 'READY_FOR_OWNER_REVIEW');
  assert.equal(r.gates.find(g => g.gate === 'rollback_compatibility').status, 'NOT_VERIFIED');
  assert.deepEqual(fs.readFileSync(path.join(f.dir, 'manifest.json')), before);
});
test('synthetic producer claims follow existing format but never authenticate hosted CI', t => {
  const f = fixture(t);
  f.manifest.provenance = { repository: 'kiratonine/AdilBaga', ciWorkflow: '.github/workflows/ci.yml', ciRunId: 1, ciAttempt: 1,
    buildWorkflow: '.github/workflows/deploy-production.yml', buildRunId: 2, buildAttempt: 1, artifactIdentity: { id: 3, name: `adilbaga-api-${sha}-2-1` } };
  f.save(); let r = checkRelease(f.dir, sha); assert.equal(r.status, 'READY_FOR_OWNER_REVIEW');
  assert.equal(r.gates.find(g => g.gate === 'hosted_ci').status, 'NOT_VERIFIED');
  f.manifest.provenance.artifactIdentity.name = 'wrong'; f.save(); assert.equal(checkRelease(f.dir, sha).status, 'BLOCKED');
});
for (const value of [null, false, 0]) test('present but invalid optional provenance is rejected: ' + value, t => {
  const f = fixture(t); f.manifest.provenance = value; f.save(); assert.equal(checkRelease(f.dir, sha).status, 'BLOCKED');
});
test('oversized binary rejected before reading it and CLI exits remain sanitized', t => {
  const f = fixture(t); fs.truncateSync(path.join(f.dir, 'api'), (64 << 20) + 1);
  let output; assert.equal(main(['--check', f.dir, sha], x => { output = x }), 1);
  assert.equal(JSON.parse(output).status, 'BLOCKED'); assert.ok(!output.includes(f.dir));
});
