import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outputDir = join(root, 'artifacts');
if (process.argv[2] && !['production-part-13', 'production-part-12', 'production-part-11', 'production-part-10', 'production-part-08', 'production-part-07', 'production-part-05', 'production-part-04', 'production-part-03', 'production-part-02', 'production-part-01', 'production-part-00', 'full-stack', 'full-stack-backend2', 'backend-1-part-05', 'backend-1-part-06', 'backend-2-eggs-data-quality'].includes(process.argv[2])) {
  throw new Error('Unknown archive target');
}
const output = join(outputDir, process.argv[2] === 'production-part-13'
  ? 'production-part-13-review.tar.gz'
  : process.argv[2] === 'production-part-12'
  ? 'production-part-12-review.tar.gz'
  : process.argv[2] === 'production-part-11'
  ? 'production-part-11-review.tar.gz'
  : process.argv[2] === 'production-part-10'
  ? 'production-part-10-review.tar.gz'
  : process.argv[2] === 'production-part-08'
  ? 'production-part-08-review.tar.gz'
  : process.argv[2] === 'production-part-07'
  ? 'production-part-07-review.tar.gz'
  : process.argv[2] === 'production-part-05'
  ? 'production-part-05-review.tar.gz'
  : process.argv[2] === 'production-part-04'
  ? 'production-part-04-review.tar.gz'
  : process.argv[2] === 'production-part-03'
  ? 'production-part-03-review.tar.gz'
  : process.argv[2] === 'production-part-02'
  ? 'production-part-02-review.tar.gz'
  : process.argv[2] === 'production-part-01'
  ? 'production-part-01-review.tar.gz'
  : process.argv[2] === 'production-part-00'
  ? 'production-part-00-review.tar.gz'
  : process.argv[2] === 'backend-1-part-06'
  ? 'backend-1-part-06-review.tar.gz'
  : process.argv[2] === 'backend-2-eggs-data-quality'
  ? 'backend-2-eggs-data-quality-review.tar.gz'
  : process.argv[2] === 'backend-2-data-quality-v2'
  ? 'backend-2-data-quality-v2-review.tar.gz'
  : process.argv[2] === 'full-stack'
  ? 'full-stack-integration-review.tar.gz'
  : process.argv[2] === 'full-stack-backend2'
    ? 'full-stack-backend2-review.tar.gz'
    : process.argv[2] === 'backend-1-part-05'
      ? 'backend-1-part-05-review.tar.gz'
    : 'backend-1-part-04-review.tar.gz');
const excludedDirs = new Set([
  '.git', 'TODO', 'artifacts', 'node_modules', 'dist', 'build', '.next',
  'coverage', 'tmp', 'temp', 'logs', 'playwright-report', 'test-results',
  'traces', '.cache', '.vite', '.vitest', '.turbo', 'cache', 'caches', '.pnpm-store',
  '.ssh', '.aws', '.config', '.railway', '.gnupg', 'keyring', 'keyrings', 'private-keys-v1.d', 'credentials', 'secrets', 'backups', 'Presentation',
]);
const excludedNames = new Set([
  'id_rsa', 'id_ed25519', 'credentials.json', 'service-account.json',
  'serviceAccountKey.json', '.npmrc', '.pypirc', 'next-env.d.ts', 'AGENTS_backup.md',
  'app-public-schema.sql', 'app-public.sql', 'full.sql',
]);

function isSafeFile(name, relativePath) {
  if (name === '.env.example') return true;
  if (name === '.env' || name.startsWith('.env.')) return false;
  if (excludedNames.has(name)) return false;
  if (/\.(dump|log|pem|key|p12|pfx|jks|keystore|sqlite|db|tsbuildinfo|gpg|age|kbx)$/iu.test(name)) return false;
  if (/^(?:secret|credentials)(?:[._-]|$)/iu.test(name)
    && relativePath !== join('docs', 'runbooks', 'secret-rotation.md')) return false;
  return true;
}

function isGoArtifact(path) {
  const name = relative(root, path);
  if (!name.startsWith('backend-go/')) return false;
  if (/(?:^|\/)bin(?:\/|$)|(?:^|\/)api$|\.(?:exe|test|out|prof|pprof)$|(?:^|\/)coverage[._-]/iu.test(name)) return true;
  // Exclude compiled binaries even when go build uses an arbitrary output name.
  const magic = readFileSync(path).subarray(0, 4).toString('hex');
  return ['7f454c46', 'feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe'].includes(magic) || magic.startsWith('4d5a');
}

const files = [];
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name) && !(directory === join(root, 'backend-go') && entry.name === 'bin') && !(process.argv[2] === 'backend-1-part-05' && directory === root && entry.name === 'frontend')) collect(path);
    } else if (entry.isFile() && isSafeFile(entry.name, relative(root, path)) && !isGoArtifact(path)) {
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
