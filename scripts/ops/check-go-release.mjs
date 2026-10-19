// LOCAL review artifacts only. This tool cannot authenticate a live host/CI or approve deployment.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { verifyArtifactIdentity } from '../deploy/verify-part15.mjs';
import { artifactName } from '../deploy/auto-build.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const full = (value, length) => typeof value === 'string' && value.length === length && /^[a-f0-9]+$/.test(value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join() === [...keys].sort().join();
const require = condition => { if (!condition) throw Error('local_artifact_rejected'); };
function directory(value) {
  require(typeof value === 'string' && value.length <= 4096 && path.isAbsolute(value) && path.normalize(value) === value && value !== '/');
  require(!value.split('/').some(p => ['.git','.ssh','.gnupg','secrets','backups','node_modules'].includes(p)));
  for (let p = value; ; p = path.dirname(p)) { const s = fs.lstatSync(p); require(s.isDirectory() && !s.isSymbolicLink()); if (p === '/') break; }
}
function read(file, limit) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd); require(before.isFile() && before.nlink === 1 && before.size > 0 && before.size <= limit);
    const bytes = Buffer.alloc(before.size); let at = 0;
    while (at < bytes.length) { const n = fs.readSync(fd, bytes, at, bytes.length - at, at); require(n > 0); at += n; }
    const after = fs.fstatSync(fd); require(before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs);
    return bytes;
  } finally { fs.closeSync(fd); }
}
function json(bytes) {
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  require(!/postgres(?:ql)?:\/\/|-----BEGIN|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_|\bAIza[\w-]{35}/.test(raw));
  const value = JSON.parse(raw), tokens = raw.match(/"(?:\\.|[^"\\])*"|[{}\[\]:]/g) ?? [], stack = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '{' || token === '[') stack.push(token === '{' ? new Set() : null);
    else if (token === '}' || token === ']') stack.pop();
    else if (token.startsWith('"') && tokens[i + 1] === ':') { const keys = stack.at(-1), key = JSON.parse(token); require(keys instanceof Set && !keys.has(key)); keys.add(key); }
  }
  return value;
}
function source(sha, file) {
  return execFileSync('git', ['--no-replace-objects', 'show', sha + ':backend-go/' + file], {
    cwd: root, timeout: 5000, maxBuffer: 65536, stdio: ['ignore','pipe','ignore'],
    env: { PATH: process.env.PATH, HOME: process.env.HOME, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_LAZY_FETCH: '1' },
  });
}
function localBundle(dir, sha) {
  require(full(sha, 40)); directory(dir); directory(path.join(dir, 'backend-go'));
  const m = json(read(path.join(dir, 'manifest.json'), 16384));
  const fields = ['sha','revision','os','arch','user','entrypoint','rootfs','binary','archive','size'];
  require(exact(m, fields) || exact(m, [...fields, 'provenance']));
  require(m.sha === sha && full(m.binary, 64) && full(m.archive, 64) && Number.isSafeInteger(m.size) && m.size > 0 && m.size <= 256 << 20);
  require(Array.isArray(m.rootfs) && m.rootfs.length > 0 && m.rootfs.length <= 128 && m.rootfs.every(x => typeof x === 'string' && x.startsWith('sha256:') && full(x.slice(7), 64)));
  if (Object.hasOwn(m, 'provenance')) {
    const p = m.provenance;
    require(exact(p, ['repository','ciWorkflow','ciRunId','ciAttempt','buildWorkflow','buildRunId','buildAttempt'])
      || exact(p, ['repository','ciWorkflow','ciRunId','ciAttempt','buildWorkflow','buildRunId','buildAttempt','artifactIdentity']));
    require(p.repository === 'kiratonine/AdilBaga' && p.ciWorkflow === '.github/workflows/ci.yml' && p.buildWorkflow === '.github/workflows/deploy-production.yml');
    require(['ciRunId','ciAttempt','buildRunId','buildAttempt'].every(k => Number.isSafeInteger(p[k]) && p[k] > 0));
    if (p.artifactIdentity) require(exact(p.artifactIdentity, ['id','name']) && Number.isSafeInteger(p.artifactIdentity.id)
      && p.artifactIdentity.id > 0 && p.artifactIdentity.name === artifactName(sha, p.buildRunId, p.buildAttempt));
  }
  const archive = read(path.join(dir, 'image.tar'), 256 << 20), binary = read(path.join(dir, 'api'), 64 << 20);
  require(archive.length === m.size);
  // Reuse Part15's identity/digest invariants with LOCAL claims only. The second
  // record is NOT a remotely measured image; saved-image internals remain unverified.
  verifyArtifactIdentity(m, m, { local: hash(archive), remote: m.archive, verifiedBeforeLoad: true },
    { local: hash(binary), remote: m.binary }, sha);
  // verifiedBeforeLoad here means local bytes were checked before ANY possible
  // load; this module never loads an image or authenticates a transfer/remote copy.
  for (const file of ['Dockerfile', 'go.mod']) require(read(path.join(dir, 'backend-go', file), 65536).equals(source(sha, file)));
  return { sha, expectedTag: 'adilbaga-api:' + sha };
}
const unverified = ['hosted_ci','saved_image_contents','build_base_and_toolchain','independent_authorization','runtime_config_db_voice',
  'rollback_compatibility','post_cutover_smoke','c2_production_acceptance'];
export function checkRelease(directory, sha, rollback) {
  try {
    const candidate = localBundle(directory, sha);
    if (rollback) { require(rollback.sha !== sha); localBundle(rollback.directory, rollback.sha); }
    return { status: 'READY_FOR_OWNER_REVIEW', production: 'BLOCKED', reason: 'local_consistency_only', candidate,
      gates: [
        { gate: 'candidate_local_bytes_and_recipe', status: 'READY_FOR_OWNER_REVIEW' },
        { gate: 'rollback_local_bytes', status: rollback ? 'READY_FOR_OWNER_REVIEW' : 'NOT_VERIFIED' },
        { gate: 'broker_installation', status: 'NOT_VERIFIED' },
        ...unverified.map(gate => ({ gate, status: 'NOT_VERIFIED' })),
      ] };
  } catch { return { status: 'BLOCKED', production: 'BLOCKED', reason: 'local_artifact_rejected' }; }
}
export function main(args, write = s => process.stdout.write(s + '\n')) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--offline')) { write(JSON.stringify({ status: 'NOT_VERIFIED', reason: 'offline_no_inputs' })); return 0; }
  if (args[0] !== '--check' || ![3,5].includes(args.length)) { write(JSON.stringify({ status: 'BLOCKED', reason: 'arguments' })); return 2; }
  const value = checkRelease(args[1], args[2], args.length === 5 ? { directory: args[3], sha: args[4] } : undefined);
  write(JSON.stringify(value)); return value.status === 'BLOCKED' ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
