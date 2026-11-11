import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { root, temporary, env, httpEnv, run, prepareBrowser, goTestArgs } from './common.mjs';

const group = process.argv[2];
const cwd = name => join(root, name);
const pnpm = (name, args, extra = {}) => run(`${name} ${args.join(' ')}`, 'pnpm', args,
  { cwd: cwd(name), env: { ...env, ...extra } });
const install = name => pnpm(name, ['install', '--frozen-lockfile']);
if (group === 'contracts') {
  install('contracts'); pnpm('contracts', ['lint']);
  console.log(pnpm('contracts', ['test']).split('\n').slice(-10).join('\n'));
} else if (group === 'go') {
  const go = args => run(`go ${args.join(' ')}`, 'go', goTestArgs(args), { cwd: cwd('backend-go') });
  if (run('gofmt check', 'gofmt', ['-l', '.'], { cwd: cwd('backend-go') })) throw new Error('gofmt drift');
  const before = ['go.mod', 'go.sum'].map(f => readFileSync(join(cwd('backend-go'), f)));
  go(['mod', 'tidy']);
  ['go.mod', 'go.sum'].forEach((f, i) => {
    if (!before[i].equals(readFileSync(join(cwd('backend-go'), f)))) throw new Error('module drift');
  });
  run('Go Git dependency drift', 'git', ['diff', '--exit-code', '--', 'go.mod', 'go.sum'], { cwd: cwd('backend-go') });
  for (const args of [['mod', 'verify'], ['test', '-count=1', './...'], ['test', '-count=1', '-race', './...'],
    ['vet', './...'], ['tool', 'staticcheck', './...'], ['tool', 'staticcheck', '-tags=integration', './...'],
    ['tool', 'govulncheck', './...']]) console.log(go(args));
  for (const name of ['api', 'ingest', 'prune']) go(['build', '-o', join(temporary, name), `./cmd/${name}`]);
} else if (group === 'schema') {
  // backend/ keeps only the Prisma schema and migrations; env carries placeholder DB URLs.
  install('backend'); console.log(pnpm('backend', ['exec', 'prisma', 'validate']));
} else if (group === 'frontend') {
  install('frontend'); pnpm('frontend', ['typecheck'], httpEnv); pnpm('frontend', ['lint'], httpEnv);
  console.log(pnpm('frontend', ['test', '--pool=forks', '--maxWorkers=1', '--no-isolate'], {
    NEXT_PUBLIC_API_MODE: 'mock', NEXT_PUBLIC_ENABLE_TEST_MOCKS: '1' }).split('\n').slice(-10).join('\n'));
  console.log(pnpm('frontend', ['audit', '--prod']));
  pnpm('frontend', ['build'], httpEnv);
  prepareBrowser();
  // DIAGNOSTIC (draft PR, do not merge): full Playwright output and webServer start/ready timing.
  const started = Date.now();
  console.log(pnpm('frontend', ['test:e2e'], { DEBUG: 'pw:webserver' }));
  console.log(`e2e step: ${((Date.now() - started) / 1000).toFixed(1)}s, ${cpus().length} CPUs`);
} else if (group === 'pipeline') {
  install('pipeline');
  console.log(pnpm('pipeline', ['test']).split('\n').slice(-10).join('\n'));
  pnpm('pipeline', ['typecheck']);
} else if (group === 'mock-e2e') {
  install('frontend'); prepareBrowser();
  console.log(pnpm('frontend', ['test:e2e']).split('\n').slice(-8).join('\n'));
} else if (group === 'ops') {
  if (process.versions.node.split('.')[0] !== '24') throw new Error('ops requires Node24');
  run('local TLS prerequisite (no installation)', 'openssl', ['version']);
  console.log(run('ops regressions and local HTTPS lifecycle', process.execPath, ['--test',
    'scripts/ops/verify-go-production.test.mjs', 'scripts/ops/monitor-go-production.test.mjs',
    'scripts/ops/check-go-release.test.mjs', 'scripts/ops/monitor-lifecycle.test.mjs',
    'scripts/ops/telegram-notifier.test.mjs', 'scripts/ops/telegram-lifecycle.test.mjs',
    'scripts/ops/prepare-recovery-operator.test.mjs', 'scripts/ops/daily-sync.test.mjs',
    'scripts/ops/monitor-state.test.mjs', 'scripts/ops/sync-report.test.mjs',
    ]));
} else if (group === 'security') {
  console.log(run('release broker regressions', 'python3', ['-B', '-m', 'unittest', 'discover', '-s', 'scripts/deploy', '-p', 'auto_*_test.py']));
  console.log(run('release transport guards', 'node', ['--test', 'scripts/deploy/auto-gate.test.mjs']));
  console.log(run('disposable CI database guards', 'node', ['--test', 'scripts/ci/guard.test.mjs']));
  console.log(run('staging parity no-skip guard', 'node', ['--test', 'scripts/ci/parity-output.test.mjs']).split('\n').slice(-8).join('\n'));
  run('tracked secrets / workflow policy', 'node', ['scripts/ci/check-source.mjs']);
  console.log(run('backup synthetic guards', 'node', ['--test', 'ops/postgres/backup.test.mjs']).split('\n').slice(-10).join('\n'));
} else throw new Error('unknown CI group');
