import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outputDir = join(root, 'artifacts');
const output = join(outputDir, 'backend-1-part-03-review.tar.gz');
const excludedDirs = new Set([
  '.git', 'TODO', 'artifacts', 'node_modules', 'dist', 'build', '.next',
  'coverage', 'tmp', 'temp', 'logs', 'playwright-report', 'test-results',
  'traces', '.cache', '.turbo', 'cache', 'caches', '.pnpm-store',
  '.ssh', '.aws', '.config', 'credentials', 'secrets',
]);
const excludedNames = new Set([
  'id_rsa', 'id_ed25519', 'credentials.json', 'service-account.json',
  'serviceAccountKey.json', '.npmrc', '.pypirc',
]);

function isSafeFile(name) {
  if (name === '.env.example') return true;
  if (name === '.env' || name.startsWith('.env.')) return false;
  if (excludedNames.has(name)) return false;
  if (/\.(log|pem|key|p12|pfx|jks|keystore|sqlite|db)$/iu.test(name)) return false;
  if (/^(?:secret|credentials)(?:[._-]|$)/iu.test(name)) return false;
  return true;
}

const files = [];
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name)) collect(path);
    } else if (entry.isFile() && isSafeFile(entry.name)) {
      files.push(relative(root, path));
    }
  }
}

collect(root);
files.sort();
mkdirSync(outputDir, { recursive: true });
const temporary = mkdtempSync(join(tmpdir(), 'adilbaga-archive-'));
try {
  const list = join(temporary, 'files');
  writeFileSync(list, `${files.join('\0')}\0`);
  const result = spawnSync('tar', ['--null', '-czf', output, '-C', root, '-T', list], {
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`${output} (${statSync(output).size} bytes, ${files.length} files)`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
