// Offline, non-root renderer. No installation, configuration/secret read or execution.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
const names = ['aktau-go-monitor.service', 'aktau-go-monitor.timer'];
export function renderUnits({ user, node, source } = {}) {
  if (typeof user !== 'string' || !/^[a-z_][a-z0-9_-]{0,30}$/.test(user) || user === 'root'
    || typeof node !== 'string' || !/^\/(?:usr|opt)\/[A-Za-z0-9_./-]+\/node$/.test(node) || path.normalize(node) !== node
    || typeof source !== 'string' || !/^\/opt\/aktau-monitor\/releases\/[a-f0-9]{40}$/.test(source)
    || source.length !== '/opt/aktau-monitor/releases/'.length + 40) throw Error('unit_parameters');
  return Object.fromEntries(names.map(name => {
    const raw = fs.readFileSync(path.join(root, 'ops/monitor/systemd', name), 'utf8');
    if (Buffer.byteLength(raw) > 16384) throw Error('unit_template');
    const text = raw.replaceAll('@MONITOR_USER@', user).replaceAll('@NODE24@', node).replaceAll('@SOURCE_DIR@', source);
    if (/@[A-Z_]+@/.test(text)) throw Error('unit_template');
    return [name, text];
  }));
}
export function writeUnits(directory, parameters) {
  const rendered = renderUnits(parameters); // Validate before opening any output.
  if (process.platform !== 'linux' || process.geteuid() === 0 || typeof directory !== 'string'
    || directory.length > 4096 || !path.isAbsolute(directory) || path.normalize(directory) !== directory
    || directory === root || directory.startsWith(root + '/') || directory === '/') throw Error('output_directory');
  let selected;
  for (let p = directory; ; p = path.dirname(p)) {
    const s = fs.lstatSync(p);
    if (!s.isDirectory() || s.isSymbolicLink() || ![0, process.geteuid()].includes(s.uid)
      || ((s.mode & 0o022) && !(p !== directory && s.uid === 0 && (s.mode & 0o1000)))) throw Error('output_directory');
    if (p === directory) { if (s.uid !== process.geteuid() || (s.mode & 0o7777) !== 0o700) throw Error('output_directory'); selected = s; }
    if (p === '/') break;
  }
  const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try {
    const s = fs.fstatSync(fd), base = '/proc/self/fd/' + fd;
    if (s.dev !== selected.dev || s.ino !== selected.ino || s.uid !== process.geteuid() || (s.mode & 0o7777) !== 0o700 || fs.readdirSync(base).length) throw Error('output_directory');
    for (const name of names) {
      const out = fs.openSync(base + '/' + name, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      try {
        const bytes = Buffer.from(rendered[name]); let at = 0;
        while (at < bytes.length) { const n = fs.writeSync(out, bytes, at, bytes.length - at); if (n < 1) throw Error('unit_write'); at += n; }
        fs.fsyncSync(out);
      } finally { fs.closeSync(out); }
    }
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
}
export function main(args, write = s => process.stdout.write(s + '\n')) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--offline')) { write('{"status":"OFFLINE","installed":false}'); return 0; }
  if (args.length !== 5 || args[0] !== '--render') { write('{"status":"BLOCKED","reason":"arguments"}'); return 2; }
  try { writeUnits(args[1], { user: args[2], node: args[3], source: args[4] }); write('{"status":"RENDERED_NOT_INSTALLED","files":2}'); return 0; }
  catch { write('{"status":"BLOCKED","reason":"unit_parameters_or_output"}'); return 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
