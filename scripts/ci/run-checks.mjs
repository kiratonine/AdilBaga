import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, temporary, env, httpEnv, run, prepareBrowser } from './common.mjs';

const group = process.argv[2];
const cwd = name => join(root, name);
const pnpm = (name, args, extra = {}) => run(`${name} ${args.join(' ')}`, 'pnpm', args,
  { cwd: cwd(name), env: { ...env, ...extra } });
const install = name => pnpm(name, ['install', '--frozen-lockfile']);
if (group === 'contracts') {
  install('contracts'); pnpm('contracts', ['lint']);
  console.log(pnpm('contracts', ['test']).split('\n').slice(-10).join('\n'));
} else if (group === 'go') {
  const go = args => run(`go ${args.join(' ')}`, 'go', args, { cwd: cwd('backend-go') });
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
  for (const name of ['api', 'ingest']) go(['build', '-o', join(temporary, name), `./cmd/${name}`]);
} else if (group === 'nest') {
  install('backend'); pnpm('backend', ['db:generate']); pnpm('backend', ['build']);
  console.log(pnpm('backend', ['test']).split('\n').slice(-10).join('\n'));
  console.log(pnpm('backend', ['audit', '--prod']));
} else if (group === 'frontend') {
  install('frontend'); pnpm('frontend', ['typecheck'], httpEnv); pnpm('frontend', ['lint'], httpEnv);
  console.log(pnpm('frontend', ['test', '--pool=forks', '--maxWorkers=1', '--no-isolate'], {
    NEXT_PUBLIC_API_MODE: 'mock', NEXT_PUBLIC_ENABLE_TEST_MOCKS: '1' }).split('\n').slice(-10).join('\n'));
  console.log(pnpm('frontend', ['audit', '--prod']));
  pnpm('frontend', ['build'], httpEnv);
  prepareBrowser();
  console.log(pnpm('frontend', ['test:e2e']).split('\n').slice(-8).join('\n'));
} else if (group === 'pipeline') {
  install('pipeline');
  console.log(pnpm('pipeline', ['test']).split('\n').slice(-10).join('\n'));
  pnpm('pipeline', ['typecheck']);
} else if (group === 'mock-e2e') {
  install('frontend'); prepareBrowser();
  console.log(pnpm('frontend', ['test:e2e']).split('\n').slice(-8).join('\n'));
} else if (group === 'security') {
  run('tracked secrets / workflow policy', 'node', ['scripts/ci/check-source.mjs']);
  console.log(run('backup synthetic guards', 'node', ['--test', 'ops/postgres/backup.test.mjs']).split('\n').slice(-10).join('\n'));
} else throw new Error('unknown CI group');
