import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function eventBase(name, event) {
  if (name === 'workflow_dispatch') return '';
  if (!['pull_request', 'push'].includes(name)) throw new Error('unsupported CI event');
  const base = name === 'pull_request' ? event.pull_request?.base?.sha : event.before;
  if (typeof base !== 'string' || !/^[a-f0-9]{40}$/i.test(base)) throw new Error('invalid trusted event base');
  return base;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.GITHUB_EVENT_PATH || !process.env.GITHUB_ENV) throw new Error('GitHub event/env paths required');
  const base = eventBase(process.env.GITHUB_EVENT_NAME, JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')));
  // Only validated hex (or empty dispatch value), never shell interpolation.
  appendFileSync(process.env.GITHUB_ENV, `CI_BASE_SHA=${base}\n`);
  console.log(base ? 'Trusted event base selected' : 'Dispatch: local migration drift guard only');
}
