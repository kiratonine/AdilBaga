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
  // Explicit full-size READY qualification, with two actual allowed CPUs for
  // the Go client AND its helper/Node descendants. No production authority.
  const allowed = readFileSync('/proc/self/status','utf8').match(/^Cpus_allowed_list:\s*([0-9,-]+)$/m)?.[1];
  if (!allowed) throw new Error('READY qualification CPU affinity unavailable');
  const cpus=[];
  for(const part of allowed.split(',')) {
    const [first,last=first]=part.split('-').map(Number);
    for(let id=first;id<=Math.min(last,first+1)&&cpus.length<2;id++)cpus.push(id);
    if(cpus.length===2)break;
  }
  if(cpus.length!==2)throw new Error('READY qualification requires two CPUs');
  console.log(run('READY full-size2CPU qualification (fixtures only)', 'taskset', ['-c',cpus.join(','),'go','test','-count=1',
    '-tags=readyqualification','-run','^TestReadyLargeELF','-v','./internal/revalidation'],
    {cwd:cwd('backend-go'),env:{...env,GOMAXPROCS:'2'}}));
  for (const name of ['api', 'ingest']) go(['build', '-o', join(temporary, name), `./cmd/${name}`]);
  const relay = join(temporary, 'relayprobe');
  go(['build', '-o', relay, './internal/revalidation/testdata/relayprobe']);
  console.log(run('C2 Node regressions (real local relay, no production)', 'node', ['--test',
    ...run('C2 test inventory', 'git', ['ls-files', '--cached', '--others', '--exclude-standard', 'scripts/revalidation/*.test.mjs']).split('\n').filter(Boolean),
    'scripts/ci/guard.test.mjs'], { env: { ...env, C2_LOCAL_PROBE: relay } }));
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
} else if (group === 'ops') {
  if (process.versions.node.split('.')[0] !== '24') throw new Error('ops requires Node24');
  run('local TLS prerequisite (no installation)', 'openssl', ['version']);
  console.log(run('C2 installer and automatic custodian regressions', 'python3', ['-B', '-m', 'unittest', 'discover', '-s', 'ops/c2', '-p', 'test_*.py']));
  console.log(run('ops regressions and local HTTPS lifecycle', process.execPath, ['--test',
    'scripts/ops/verify-go-production.test.mjs', 'scripts/ops/monitor-go-production.test.mjs',
    'scripts/ops/check-go-release.test.mjs', 'scripts/ops/monitor-lifecycle.test.mjs',
    'scripts/ops/telegram-notifier.test.mjs', 'scripts/ops/telegram-lifecycle.test.mjs',
    'scripts/ops/prepare-recovery-operator.test.mjs', 'scripts/ops/c2-provisioning-plan.test.mjs',
    'scripts/ops/c2-ingest-launch.test.mjs', 'scripts/ops/sync-promotion.test.mjs']));
} else if (group === 'security') {
  run('tracked secrets / workflow policy', 'node', ['scripts/ci/check-source.mjs']);
  console.log(run('backup synthetic guards', 'node', ['--test', 'ops/postgres/backup.test.mjs']).split('\n').slice(-10).join('\n'));
} else throw new Error('unknown CI group');
