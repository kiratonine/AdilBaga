import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDeployment, verify, paths, verifyArtifactIdentity } from './verify-part15.mjs';
const release = 'a'.repeat(40), digest = 'b'.repeat(64);
function evidence() {
  const local = {id:'config-digest',revision:release,os:'linux',arch:'amd64',user:'10001:10001',entrypoint:['/usr/local/bin/api'],rootfs:[`sha256:${digest}`]};
  return [local, {...local,id:'oci-manifest-digest'}, {local:digest,remote:digest,verifiedBeforeLoad:true}, {local:digest,remote:digest}, release];
}
test('portable identity accepts different store identifiers with exact artifact proof', () => verifyArtifactIdentity(...evidence()));
for (const field of ['archive','binary','rootfs','revision','user','entrypoint','arch','timing']) test(`portable identity rejects ${field} mismatch`, () => {
  const e=evidence();
  if(field==='archive')e[2].remote='c'.repeat(64);
  else if(field==='binary')e[3].remote='c'.repeat(64);
  else if(field==='timing')e[2].verifiedBeforeLoad=false;
  else e[1][field]=field==='rootfs'?[`sha256:${'c'.repeat(64)}`]:field==='entrypoint'?['/bin/sh']:'wrong';
  assert.throws(() => verifyArtifactIdentity(...e));
});
test('private compose and truthful report accepted', () => verify(readDeployment()));
test('application gate is required, not inferred from static artifact checks', () => {
  const files = readDeployment();
  files.set(paths[1], files.get(paths[1]).replace('application-level graceful degradation', 'provider-only acceptance'));
  assert.throws(() => verify(files), /application_voice_gate_missing/);
});
test('superseded provider-perfect gate is rejected in current deploy instructions', () => {
  const files = readDeployment();
  files.set(paths[1], files.get(paths[1]) + '\ngenuine full-production-context Gemini success is mandatory\n');
  assert.throws(() => verify(files), /superseded_provider_gate/);
});
for (const cidr of ['172.18.0.1/32', 'fd00::1/128']) test(`exact synthetic peer ${cidr} accepted (not measured evidence)`, () => {
  const files = readDeployment();
  files.set(paths[1], files.get(paths[1]) + `\nTRUSTED_PROXY_CIDRS=${cidr}\n`);
  verify(files);
});
for (const [name, path, from, to] of [
  ['public8080', paths[0], '127.0.0.1:8080:8080', '0.0.0.0:8080:8080'],
  ['bare8080', paths[0], '127.0.0.1:8080:8080', '8080:8080'],
  ['host network', paths[0], 'restart: unless-stopped', 'network_mode: host'],
  ['writable root', paths[0], 'read_only: true', 'read_only: false'],
  ['root user', paths[0], '10001:10001', '0:0'],
  ['capabilities', paths[0], 'cap_drop:', 'cap_add:'],
  ['privilege escalation', paths[0], 'no-new-privileges:true', 'no-new-privileges:false'],
  ['repo env', paths[0], '/etc/adilbaga/api.env', './api.env'],
  ['broad IPv4 trust', paths[1], 'HSTS: DEFERRED.', 'HSTS: DEFERRED.\nTRUSTED_PROXY_CIDRS=172.16.0.0/12'],
  ['broad IPv6 trust', paths[1], 'HSTS: DEFERRED.', 'HSTS: DEFERRED.\nTRUSTED_PROXY_CIDRS=::/0'],
  ['embedded URL', paths[1], 'HSTS: DEFERRED.', 'HSTS: DEFERRED.\nDATABASE_URL=postgres://example.invalid/db'],
  ['embedded Gemini', paths[1], 'HSTS: DEFERRED.', 'HSTS: DEFERRED.\nGEMINI_API_KEY=synthetic-not-a-real-secret'],
  ['embedded session token', paths[1], 'HSTS: DEFERRED.', 'HSTS: DEFERRED.\nUPSTASH_REDIS_REST_TOKEN=synthetic-not-a-real-secret'],
  ['owner identity', paths[1], 'HSTS: DEFERRED.', 'HSTS: DEFERRED.\nruntime=postgres'],
  ['ingest identity', paths[1], 'HSTS: DEFERRED.', 'HSTS: DEFERRED.\nruntime=aktau_ingest_runtime'],
  ['HSTS activation', paths[1], 'HSTS: DEFERRED.', 'HSTS: ENABLED.'],
  ['service nesting escape', paths[0], '    read_only: true', '  read_only: true'],
]) test(`reject ${name}`, () => {
  const files = readDeployment();
  assert.ok(files.get(path).includes(from));
  files.set(path, files.get(path).replace(from, to));
  assert.throws(() => verify(files));
});
