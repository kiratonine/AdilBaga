// Linux private operator state; no provisioning, stale-lock deletion or root writes.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join() === [...keys].sort().join();
const time = v => Number.isSafeInteger(v) && v >= 0 && v < 8640000000000000;
export function validateState(s) {
  if (!exact(s, ['version','phase','failures','lastUTC','pending']) || s.version !== 1
    || !['OK','DEGRADED','INCIDENT'].includes(s.phase) || s.failures !== { OK: 0, DEGRADED: 1, INCIDENT: 2 }[s.phase]
    || !(s.lastUTC === null || time(s.lastUTC)) || (s.lastUTC === null && s.phase !== 'OK')) throw Error('state_invalid');
  const p = s.pending;
  if (p !== null && (!exact(p, ['id','type','atUTC','nextAttemptUTC','attempts']) || !/^[a-f0-9]{32}$/.test(p.id)
    || p.id.length !== 32 || !['incident_opened','incident_recovered'].includes(p.type)
    || !time(p.atUTC) || !time(p.nextAttemptUTC) || s.lastUTC === null || p.atUTC > s.lastUTC || p.nextAttemptUTC < p.atUTC
    || !Number.isInteger(p.attempts) || p.attempts < 0 || p.attempts > 3
    || (p.attempts === 0 ? p.nextAttemptUTC !== p.atUTC : p.nextAttemptUTC !== s.lastUTC + 60000)
    || (p.type === 'incident_opened' ? s.phase !== 'INCIDENT' : s.phase !== 'OK'))) throw Error('state_invalid');
  return s;
}
export function openState(directory, io = fs) {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  if (process.platform !== 'linux' || process.geteuid() === 0 || typeof directory !== 'string'
    || directory.length > 4096 || !path.isAbsolute(directory) || path.normalize(directory) !== directory || directory === '/'
    || directory === sourceRoot || directory.startsWith(sourceRoot + '/')
    || directory.split('/').some(p => ['.git','node_modules','artifacts'].includes(p))) throw Error('state_directory');
  let selected;
  for (let p = directory; ; p = path.dirname(p)) {
    const s = io.lstatSync(p);
    if (!s.isDirectory() || s.isSymbolicLink() || ![0, process.geteuid()].includes(s.uid)
      || ((s.mode & 0o022) && !(p !== directory && s.uid === 0 && (s.mode & 0o1000)))) throw Error('state_directory');
    if (p === directory) { if (s.uid !== process.geteuid() || (s.mode & 0o7777) !== 0o700) throw Error('state_directory'); selected = s; }
    if (p === '/') break;
  }
  const c = io.constants, dfd = io.openSync(directory, c.O_RDONLY | c.O_DIRECTORY | c.O_NOFOLLOW);
  let lock, poisoned = false, closed = false;
  const base = '/proc/self/fd/' + dfd, name = n => base + '/' + n;
  try {
    const opened = io.fstatSync(dfd);
    if (opened.dev !== selected.dev || opened.ino !== selected.ino || opened.uid !== process.geteuid() || (opened.mode & 0o7777) !== 0o700) throw Error('state_directory');
    const lfd = io.openSync(name('monitor.lock'), c.O_WRONLY | c.O_CREAT | c.O_EXCL | c.O_NOFOLLOW, 0o600);
    try { lock = io.fstatSync(lfd); io.fsyncSync(lfd); io.fsyncSync(dfd); } finally { io.closeSync(lfd); }
    if (io.readdirSync(base).some(n => n.startsWith('.pending-'))) throw Error('state_interrupted');
    let value;
    try {
      const fd = io.openSync(name('state.json'), c.O_RDONLY | c.O_NOFOLLOW | c.O_NONBLOCK);
      try {
        const s = io.fstatSync(fd);
        if (!s.isFile() || s.uid !== process.geteuid() || (s.mode & 0o7777) !== 0o600 || s.nlink !== 1 || s.size > 16384) throw Error('state_file');
        const bytes = Buffer.alloc(16385), n = io.readSync(fd, bytes, 0, bytes.length, 0);
        if (n !== s.size || n > 16384) throw Error('state_file');
        const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, n));
        value = validateState(JSON.parse(raw));
        if (raw !== JSON.stringify(value) + '\n') throw Error('state_noncanonical');
      } finally { io.closeSync(fd); }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      value = { version: 1, phase: 'OK', failures: 0, lastUTC: null, pending: null };
    }
    return {
      get value() { return structuredClone(value); },
      save(next) {
        if (closed || poisoned) throw Error('state_unavailable');
        try {
          validateState(next); const raw = Buffer.from(JSON.stringify(next) + '\n');
          if (raw.length > 16384) throw Error('state_capacity');
          const temp = name('.pending-' + randomBytes(16).toString('hex'));
          const fd = io.openSync(temp, c.O_WRONLY | c.O_CREAT | c.O_EXCL | c.O_NOFOLLOW, 0o600);
          try {
            let offset = 0;
            while (offset < raw.length) { const n = io.writeSync(fd, raw, offset, raw.length - offset); if (n < 1) throw Error('state_write'); offset += n; }
            io.fsyncSync(fd);
          } finally { io.closeSync(fd); }
          io.renameSync(temp, name('state.json')); io.fsyncSync(dfd); value = structuredClone(next);
        } catch { poisoned = true; throw Error('state_write'); }
      },
      close() {
        if (closed) return;
        closed = true;
        try {
          if (poisoned) throw Error('state_interrupted');
          const s = io.lstatSync(name('monitor.lock'));
          if (!s.isFile() || s.dev !== lock.dev || s.ino !== lock.ino || s.uid !== process.geteuid() || (s.mode & 0o7777) !== 0o600 || s.nlink !== 1) throw Error('state_lock');
          io.unlinkSync(name('monitor.lock')); io.fsyncSync(dfd);
        } finally { io.closeSync(dfd); }
      },
    };
  } catch (e) { io.closeSync(dfd); throw e; } // Existing/crashed lock retained, never auto-repaired.
}
