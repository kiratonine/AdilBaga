// Explicit local child-process test adapter. No DB, network, stdin or secrets.
import { projectionPair } from './projection-v2.mjs';
import { createHash } from 'node:crypto';
const args = process.argv.slice(2), flags = new Map();
for (let i = 0; i < args.length; i += 2) {
  if (flags.has(args[i]) || !args[i + 1]) process.exit(2);
  flags.set(args[i], args[i + 1]);
}
const attempt = flags.get('-attempt');
if (!/^[0-9a-f]{32}$/.test(attempt ?? '') || flags.get('-frontend-sha') !== 'c'.repeat(40)) process.exit(2);
const pair = projectionPair(attempt), after = flags.get('-phase') === 'after';
if (!['before', 'after'].includes(flags.get('-phase'))) process.exit(2);
if (after && (flags.get('-snapshot') !== pair.after.snapshotId || flags.get('-previous') !== pair.before.snapshotId
  || flags.get('-witness') !== 'p-a' || flags.get('-slug') !== 'milk')) process.exit(4);
if (process.env.C2_SYNTHETIC_SCENARIO === 'timeout') await new Promise(r => setTimeout(r, 20000));
if (process.env.C2_SYNTHETIC_SCENARIO === 'invalid_json') { process.stdout.write('invalid\n'); process.exit(0) }
if (process.env.C2_SYNTHETIC_SCENARIO === 'oversized') { process.stdout.write('x'.repeat(70000)); process.exit(0) }
const failures = { go_identity: [3, 'identity'], go_chain: [4, 'chain'], go_timeout: [1, 'timeout'],
  go_projection: [1, 'projection'], go_output: [1, 'output'] };
const failure = failures[process.env.C2_SYNTHETIC_SCENARIO];
if (failure) { process.stderr.write(`c2projection_failed:${failure[1]}\n`); process.exit(failure[0]) }
if (process.env.C2_SYNTHETIC_SCENARIO === 'private_error') {
  process.stderr.write('synthetic-private: do not persist child output\n'); process.exit(1);
}
if (after) {
  switch (process.env.C2_SYNTHETIC_SCENARIO) {
    case 'unchanged': pair.after.body.candidates[0].snapshotAt = pair.before.body.candidates[0].snapshotAt; break;
    case 'wrong_previous': pair.after.previousSnapshotId = '33333333-3333-3333-3333-333333333333'; break;
    case 'wrong_witness': pair.after.body.witnessId = 'p-b'; break;
    case 'wrong_sha': pair.after.provenance.sourceSha = 'd'.repeat(40); break;
    case 'wrong_attempt': pair.after.attemptId = 'd'.repeat(32); break;
    case 'wrong_snapshot': pair.after.snapshotId = '33333333-3333-3333-3333-333333333333'; break;
    case 'unqualified': pair.after.body.candidates[0].sitemapIndex = null; break;
  }
  pair.after.provenance.canonicalStateId = createHash('sha256').update(JSON.stringify(pair.after.body)).digest('hex');
  if (process.env.C2_SYNTHETIC_SCENARIO === 'bad_hash') pair.after.provenance.canonicalStateId = 'f'.repeat(64);
}
process.stdout.write(JSON.stringify(after ? pair.after : pair.before) + '\n');
