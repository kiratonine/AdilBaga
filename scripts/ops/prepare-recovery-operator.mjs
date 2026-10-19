// Offline by default. No dotenv evaluation, inherited DSN fallback or DB access.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const keys = ['BACKUP_DATABASE_URL', 'BACKUP_OUTPUT_DIR', 'BACKUP_GPG_HOME', 'BACKUP_GPG_RECIPIENT'];
const root = path.resolve(import.meta.dirname, '../..');
const invalid = () => { throw Error('INVALID_CUSTODY') };

export function parseOperator(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 16384 || /[\r\0$`"'\\]/.test(raw)) throw Error('BLOCKED');
  const result = Object.create(null);
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const index = line.indexOf('=');
    const name = line.slice(0, index), value = line.slice(index + 1);
    if (index < 1 || !keys.includes(name) || Object.hasOwn(result, name) || !value || /\s/.test(value)) throw Error('BLOCKED');
    result[name] = value;
  }
  if (!keys.every(k => Object.hasOwn(result, k))) throw Error('MISSING_OPERATOR_INPUT');
  const u = new URL(result.BACKUP_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(u.protocol) || !u.hostname || !u.username || !u.password
    || !u.pathname || u.pathname === '/' || u.hash || u.search !== '?sslmode=verify-full') throw Error('BLOCKED');
  // Decode exactly once; malformed percent encodings fail closed.
  for (const v of [u.username, u.password, u.pathname]) if (/[\0\r\n]/.test(decodeURIComponent(v))) throw Error('BLOCKED');
  if (!/^[a-fA-F0-9]{40}(?:[a-fA-F0-9]{24})?$/.test(result.BACKUP_GPG_RECIPIENT)) throw Error('BLOCKED');
  return Object.freeze(result);
}

function custody(file, directory = false) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.normalize(file) !== file
    || file === root || file.startsWith(root + '/')) invalid();
  for (let p = directory ? file : path.dirname(file); ; p = path.dirname(p)) {
    const st = fs.lstatSync(p);
    const stickyRoot = p !== file && st.uid === 0 && (st.mode & 0o1000);
    if (!st.isDirectory() || st.isSymbolicLink() || ![0, process.geteuid()].includes(st.uid)
      || ((st.mode & 0o022) && !stickyRoot) || fs.existsSync(path.join(p, '.git'))) invalid();
    if (p === '/') break;
  }
  const st = fs.lstatSync(file);
  if (st.isSymbolicLink() || st.uid !== process.geteuid()
    || (st.mode & 0o7777) !== (directory ? 0o700 : 0o600)
    || (directory ? !st.isDirectory() : !st.isFile() || st.nlink !== 1 || st.size > 16384)) invalid();
  return st;
}

// Explicit trusted handle only; returns secrets solely to an explicit caller,
// never a logger. No state is cached; callers must retain exclusive custody.
export function readOperatorContext(file) {
  const initial = custody(file);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const st = fs.fstatSync(fd);
    if (st.dev !== initial.dev || st.ino !== initial.ino || st.nlink !== 1 || st.uid !== process.geteuid()
      || !st.isFile() || (st.mode & 0o7777) !== 0o600 || st.size > 16384) invalid();
    const values = parseOperator(fs.readFileSync(fd, 'utf8'));
    custody(values.BACKUP_OUTPUT_DIR, true); custody(values.BACKUP_GPG_HOME, true);
    if (values.BACKUP_OUTPUT_DIR === values.BACKUP_GPG_HOME
      || values.BACKUP_OUTPUT_DIR.startsWith(values.BACKUP_GPG_HOME + '/')
      || values.BACKUP_GPG_HOME.startsWith(values.BACKUP_OUTPUT_DIR + '/')) invalid();
    return values;
  } finally { fs.closeSync(fd) }
}
function toolsAvailable() {
  if (process.versions.node.split('.')[0] !== '24') return false;
  for (const [command, pattern] of [['/usr/bin/pg_dump', /PostgreSQL\) 17\./], ['/usr/bin/pg_restore', /PostgreSQL\) 17\./], ['/usr/bin/gpg', /GnuPG/]]) {
    const r = spawnSync(command, ['--version'], { env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' }, timeout: 2000, maxBuffer: 4096, encoding: 'utf8' });
    if (r.status !== 0 || !pattern.test(r.stdout)) return false;
  }
  return true;
}
export function checkOperator(file, { tools = toolsAvailable } = {}) {
  if (!file) return 'MISSING_OPERATOR_INPUT';
  try { readOperatorContext(file); return tools() ? 'READY' : 'BLOCKED' }
  catch (e) { return ['MISSING_OPERATOR_INPUT', 'INVALID_CUSTODY'].includes(e.message) ? e.message : 'BLOCKED' }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const offline = !args.length || (args.length === 1 && args[0] === '--offline');
  const result = offline ? 'MISSING_OPERATOR_INPUT' : args.length === 2 && args[0] === '--check' ? checkOperator(args[1]) : 'BLOCKED';
  console.log(result);
  process.exitCode = offline || result === 'READY' ? 0 : 1;
}
