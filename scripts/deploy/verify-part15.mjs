import assert from 'node:assert/strict';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isIP } from 'node:net';
export const root = resolve(import.meta.dirname, '../..');
export const paths = ['deploy/compose.production.yml', 'deploy/README.md', 'docs/production/reports/PART_15_REPORT.md'];
export function verifyArtifactIdentity(local, remote, archive, binary, releaseSHA) {
  const digest = /^[a-f0-9]{64}$/;
  assert.match(releaseSHA, /^[a-f0-9]{40}$/);
  for (const pair of [archive, binary]) {
    assert.match(pair.local, digest);
    assert.equal(pair.remote, pair.local, 'artifact_digest_mismatch');
  }
  assert.equal(archive.verifiedBeforeLoad, true, 'checksum_not_verified_before_load');
  for (const image of [local, remote]) {
    assert.equal(image.revision, releaseSHA, 'release_revision_mismatch');
    assert.equal(image.os, 'linux');
    assert.equal(image.arch, 'amd64');
    assert.equal(image.user, '10001:10001');
    assert.deepEqual(image.entrypoint, ['/usr/local/bin/api']);
    assert.ok(Array.isArray(image.rootfs) && image.rootfs.length > 0);
    for (const layer of image.rootfs) assert.match(layer, /^sha256:[a-f0-9]{64}$/);
  }
  assert.deepEqual(remote.rootfs, local.rootfs, 'rootfs_diff_ids_mismatch');
  // image.id intentionally is not compared across different Docker stores.
}
const approved = `services:
  api:
    image: \${API_IMAGE:?API_IMAGE is required}
    container_name: adilbaga-api
    restart: unless-stopped
    env_file:
      - /etc/adilbaga/api.env
    user: "10001:10001"
    read_only: true
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=16m
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    ports:
      - "127.0.0.1:8080:8080"
    stop_grace_period: 12s
    logging:
      driver: local
    networks:
      - production
networks:
  production:
    name: adilbaga-production
    driver: bridge`;
export function verify(files) {
  for (const p of paths) assert.ok(files.has(p), 'deployment_artifact_missing');
  for (const text of files.values()) {
    assert.ok(!/postgres(?:ql)?:\/\//i.test(text), 'embedded_database_url');
    assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY/.test(text), 'private_key');
    assert.ok(!/^\s*(?:export\s+)?(?:DATABASE_URL|GEMINI_API_KEY\d*|UPSTASH_REDIS_REST_TOKEN)\s*[:=]\s*\S+/im.test(text), 'embedded_runtime_secret');
    for (const [, raw] of text.matchAll(/^[ \t]*TRUSTED_PROXY_CIDRS[ \t]*=[ \t]*([^\r\n]*)$/gm)) {
      for (const cidr of raw.split(',').map(x => x.trim()).filter(Boolean)) {
        const [ip, mask, extra] = cidr.split('/');
        const family = isIP(ip);
        assert.ok(!extra && ((family === 4 && mask === '32') || (family === 6 && mask === '128')), 'broad_or_invalid_trusted_proxy');
      }
    }
    assert.ok(!/(?:runtime|DATABASE_URL)\s*[:=]\s*(?:postgres|aktau_ingest_runtime)\b/i.test(text), 'unsafe_runtime_identity');
    assert.ok(!/HSTS\s*[:=]\s*(?:ON|ENABLED|ACTIVE)|Strict-Transport-Security\s*:/i.test(text), 'hsts_activation');
  }
  const compose = files.get(paths[0]).split('\n').filter(x => x.trim() && !x.trimStart().startsWith('#')).join('\n');
  assert.equal(compose, approved, 'unreviewed_compose_structure');
  const readme = files.get(paths[1]);
  for (const marker of ['HSTS: DEFERRED', 'exact IPv4 /32 or IPv6 /128', 'zero-application state']) assert.ok(readme.includes(marker), 'operator_boundary_missing');
  for (const marker of ['Create ONE `docker save` archive', 'BEFORE load', 'RootFS diff IDs', 'Cross-store `.Id` equality is NOT required']) assert.ok(readme.includes(marker), 'portable_release_gate_missing');
  for (const marker of ['application-level graceful degradation', 'approved deterministic fallback', 'Provider outcome is telemetry, not a perfect availability gate', 'Persistent application-level Voice failure', 'Static verifier PASS is not live Voice availability evidence', 'gemini-3.5-flash-lite']) assert.ok(readme.includes(marker), 'application_voice_gate_missing');
  assert.ok(!/genuine full-production-context Gemini success|fallback (?:success|responses) (?:is|are) insufficient|perfect provider-only (?:success|availability) is mandatory/i.test(readme), 'superseded_provider_gate');
  const report = files.get(paths[2]);
  assert.match(report, /Status: \*\*(?:BLOCKED|READY_FOR_EXTERNAL_REVIEW)\*\*/);
  for (const marker of ['DB mutation: NONE', 'Migration: NONE', 'Ingestion/snapshot: NONE', 'Part16+', 'No physical Siri claim']) assert.ok(report.includes(marker), 'report_boundary_missing');
  assert.ok(!/frontend (?:deployment|deploy)\s*[:=]\s*PASS|physical Siri\s*[:=]\s*PASS/i.test(report), 'false_out_of_scope_claim');
}
export function readDeployment() {
  assert.deepEqual(readdirSync(join(root, 'deploy')).sort(), ['README.md', 'compose.production.yml'], 'unexpected_deployment_file');
  return new Map(paths.map(p => {
    assert.ok(lstatSync(join(root, p)).isFile(), 'non_regular_deployment_artifact');
    return [p, readFileSync(join(root, p), 'utf8')];
  }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verify(readDeployment());
  console.log('Part15 static deployment verifier PASS; not live acceptance evidence');
}
