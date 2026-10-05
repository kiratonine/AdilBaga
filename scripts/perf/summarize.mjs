// Read only ignored generated results. Output contains aggregate numbers only;
// never query text, discovered input, request/session IDs or backup material.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './helpers.mjs';

const r = JSON.parse(readFileSync(join(root, 'artifacts/perf-part13/results.json'), 'utf8'));
const rounded = n => Math.round(n * 1000) / 1000;
const aggregate = values => ({ min: rounded(Math.min(...values)), avg: rounded(values.reduce((a,b)=>a+b,0)/values.length), max: rounded(Math.max(...values)), start: rounded(values[0]), end: rounded(values.at(-1)) });
function memory(value) {
  const m = value.split('/')[0].trim().match(/^(\d+(?:\.\d+)?)\s*(B|kB|KB|MB|GB|KiB|MiB|GiB)$/);
  if (!m) throw Error('unrecognized_memory_unit');
  return Number(m[1]) * ({ B:1,kB:1000,KB:1000,MB:1e6,GB:1e9,KiB:1024,MiB:1024**2,GiB:1024**3 })[m[2]] / 1e6;
}
const profiles = r.profiles.filter(p=>p.tier==='representative').map(p=>{
  const metrics = p.summary.metrics, trend = metrics.latency.values;
  const out = { label:p.label, offeredRPS:p.mode==='clarification'?p.rate/2:p.rate, seconds:Number(p.duration.slice(0,-1)), requests:metrics.measured_requests.values.count,
    p50:rounded(trend.med), p95:rounded(trend['p(95)']), p99:rounded(trend['p(99)']), max:rounded(trend.max),
    checks:metrics.checks.values, errorRate:metrics.unexpected.values.rate, fiveXX:metrics.unexpected_5xx.values.count,
    dropped:metrics.dropped_iterations?.values.count??0, exit:p.exit,
    connections:{ total:Math.max(...p.samples.map(s=>s.connections.total)), active:Math.max(...p.samples.map(s=>s.connections.active)) },
    queries:p.queries.slice(0,3).map(q=>({...q,mean_exec_time:rounded(q.mean_exec_time),max_exec_time:rounded(q.max_exec_time),total_exec_time:rounded(q.total_exec_time)})),
    endpoints:Object.fromEntries(Object.entries(metrics).filter(([key])=>key.startsWith('latency{')).map(([key,value])=>[key,value.values])) };
  out.scheduledRPS=rounded(out.requests/out.seconds);
  out.wholeRunRPS=rounded(metrics.measured_requests.values.rate);
  for (const name of ['api','db']) {
    const samples=p.samples.flatMap(s=>s.stats.filter(v=>v.name===name));
    out[name]={ cpu:aggregate(samples.map(s=>Number(s.cpu.replace('%','')))), memoryMB:aggregate(samples.map(s=>memory(s.memory))) };
  }
  return out;
});
console.log(JSON.stringify({status:r.status??'IN_PROGRESS',proofs:r.proofs,profiles},null,2));
