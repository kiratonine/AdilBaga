import { realpathSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Operator-only guard. Never print URL, host, password, key or raw exceptions.
try {
  const repo = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
  const outside = (value, create = false) => {
    if (!value || !isAbsolute(value)) throw Error();
    if (resolve(value).split(sep).some(part => ['artifacts', 'TODO', 'node_modules'].includes(part))) throw Error();
    let parent = resolve(value);
    while (true) {
      try { parent = realpathSync(parent); break; }
      catch { const next = dirname(parent); if (next === parent) throw Error(); parent = next; }
    }
    if (parent === repo || parent.startsWith(repo + sep)) throw Error();
    if (create) mkdirSync(value, { recursive: true, mode: 0o700 });
    const path = realpathSync(value);
    if (path === repo || path.startsWith(repo + sep)) throw Error();
    return path;
  };
  const url = new URL(process.env[process.argv[2] === 'backup' ? 'BACKUP_DATABASE_URL' : 'RESTORE_DATABASE_URL'] ?? '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname || url.pathname === '/') throw Error();
  if (process.argv[2] === 'backup') {
    if (!process.env.BACKUP_GPG_RECIPIENT || !/^[A-Fa-f0-9]{40,64}$/.test(process.env.BACKUP_GPG_RECIPIENT)) throw Error();
    const home = outside(process.env.BACKUP_GPG_HOME);
    if (!statSync(home).isDirectory() || (statSync(home).mode & 0o777) !== 0o700) throw Error();
    const output = outside(process.env.BACKUP_OUTPUT_DIR, true);
    if ((statSync(output).mode & 0o777) !== 0o700) throw Error();
  } else if (process.argv[2] === 'restore') {
    if (!['127.0.0.1', '[::1]'].includes(url.hostname) || !url.port || !/^\/part11_[a-z0-9_]+$/.test(url.pathname) || url.search) throw Error();
    const home = outside(process.env.BACKUP_GPG_HOME);
    if (!statSync(home).isDirectory() || (statSync(home).mode & 0o777) !== 0o700) throw Error();
    const artifact = outside(process.env.BACKUP_FILE);
    if (!statSync(artifact).isFile() || !artifact.endsWith('.dump.gpg')) throw Error();
  } else throw Error();
} catch { console.error('configuration_guard_failed'); process.exit(1); }
