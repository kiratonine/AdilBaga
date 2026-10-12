import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const text=readFileSync(new URL('../../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
for(const marker of ['workflow_run:', 'workflow_dispatch:', 'default: dry-run','contents: read','actions: read',
  'cancel-in-progress: false',"vars.AUTO_DEPLOY_ENABLED == 'true'",'environment: production','timeout-minutes: 45',
  'github.event.workflow_run.event', 'github.event.workflow_run.head_repository.full_name',
  'ref: ${{ needs.gate.outputs.sha }}','persist-credentials: false'])assert.ok(text.includes(marker),`missing workflow boundary: ${marker}`);
assert.ok(!/pull_request_target|StrictHostKeyChecking=no|agent.forward|docker image prune|latest/.test(text));
for(const match of text.matchAll(/uses:\s*([^\s]+)/g))assert.match(match[1],/^[\w/-]+@[a-f0-9]{40}$/);
const before=text.split('  rollout:')[0];
assert.ok(!before.includes('secrets.'),'credentials before gate');
assert.ok(!/^\s*(?:-\s*)?run:.*\$\{\{/m.test(text),'payload shell interpolation');
console.log('Auto-deploy static workflow boundaries PASS; not deployment acceptance');
