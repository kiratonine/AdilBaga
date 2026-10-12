import assert from 'node:assert/strict';
import {readFileSync, appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const repository = 'kiratonine/AdilBaga';
export const mandatory = ['Contracts', 'Frontend', 'Go Quality', 'Security', 'Nest Reference',
  'Pipeline Quality', 'PostgreSQL Integration', 'Ephemeral Staging', 'CI Gate'];
export const shaPattern = /^[a-f0-9]{40}$/;
export function eventCandidate(event, name, enabled, ref) {
  if (enabled !== 'true') return {status:'DISABLED'};
  if (event.repository?.full_name !== repository) return {status:'REJECTED_EVENT'};
  if (name === 'workflow_run') {
    const r=event.workflow_run;
    if (!r || r.event !== 'push' || r.head_branch !== 'main' || r.status !== 'completed'
      || r.conclusion !== 'success' || r.head_repository?.full_name !== repository)
      return {status:'REJECTED_EVENT'};
    assert.match(r.head_sha, shaPattern);
    assert.ok(Number.isSafeInteger(r.id) && r.id > 0);
    return {status:'VERIFY_CI', sha:r.head_sha, run:r.id};
  }
  if (name === 'workflow_dispatch' && ref === 'refs/heads/main' && event.inputs?.mode === 'deploy') {
    assert.match(event.inputs.sha, shaPattern);
    assert.match(event.inputs.ci_run, /^[1-9][0-9]{0,15}$/);
    const run=Number(event.inputs.ci_run); assert.ok(Number.isSafeInteger(run));
    return {status:'VERIFY_CI',sha:event.inputs.sha,run};
  }
  return {status:'REJECTED_EVENT'};
}
export function verifyCI(candidate, run, workflow, jobs, main) {
  assert.match(candidate.sha, shaPattern);
  assert.equal(run.repository?.full_name,repository);
  assert.equal(run.head_repository?.full_name,repository);
  assert.equal(run.id,candidate.run); assert.equal(run.head_sha,candidate.sha);
  assert.equal(run.event,'push'); assert.equal(run.head_branch,'main');
  assert.equal(run.status,'completed'); assert.equal(run.conclusion,'success');
  assert.equal(workflow.id,run.workflow_id); assert.equal(workflow.path,'.github/workflows/ci.yml');
  assert.equal(workflow.name,'CI'); assert.equal(workflow.state,'active');
  assert.equal(jobs.length,9,'unexpected CI jobs');
  for(const name of mandatory) {
    const matches=jobs.filter(j=>j.name===name);
    assert.equal(matches.length,1,'missing/duplicate CI job');
    assert.equal(matches[0].status,'completed'); assert.equal(matches[0].conclusion,'success');
    assert.equal(matches[0].head_sha,candidate.sha);
    assert.equal(matches[0].run_attempt,run.run_attempt);
  }
  return main===candidate.sha ? {...candidate,status:'ELIGIBLE'} : {status:'SKIPPED_STALE'};
}
export async function api(path) {
  // Never expose provider body / headers / token in errors.
  const r=await fetch(`https://api.github.com/repos/${repository}/${path}`,{
    headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${process.env.GITHUB_TOKEN}`},
    signal:AbortSignal.timeout(15000), redirect:'error'});
  assert.ok(r.ok,'github_api_failed'); return r.json();
}
export async function check(candidate) {
  const run=await api(`actions/runs/${candidate.run}`);
  const workflow=await api(`actions/workflows/${run.workflow_id}`);
  const response=await api(`actions/runs/${candidate.run}/attempts/${run.run_attempt}/jobs?per_page=100`);
  assert.equal(response.total_count,response.jobs.length,'CI pagination/truncation');
  const main=await api('git/ref/heads/main');
  return verifyCI(candidate,run,workflow,response.jobs,main.object.sha);
}
if (import.meta.url===pathToFileURL(process.argv[1]??'').href) {
  try {
    const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
    const candidate=eventCandidate(event,process.env.GITHUB_EVENT_NAME,process.env.AUTO_DEPLOY_ENABLED,process.env.GITHUB_REF);
    const result=candidate.status==='VERIFY_CI' ? await check(candidate) : candidate;
    console.log(result.status);
    if(process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
      `eligible=${result.status==='ELIGIBLE'}\nsha=${result.sha??''}\nrun=${result.run??''}\n`);
  } catch { console.error('BLOCKED_CI_GATE'); process.exitCode=1; }
}
