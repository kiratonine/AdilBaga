import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planPaths, readPlan, verifyPlan, checkPerimeterSecrets } from './verify-part14.mjs';

test('reviewed placeholder plan is valid', () => verifyPlan(readPlan()));

for (const [name, path, from, to] of [
  ['hostname state', planPaths[0], 'PLANNED ONLY / NOT OWNED / NOT RESOLVED / NOT ACTIVE', 'ACTIVE'],
  ['HSTS state', planPaths[0], 'HSTS: DEFERRED', 'HSTS: enabled'],
  ['wildcard CORS', planPaths[2], 'CORS_ALLOWED_ORIGINS=https://aktau.market', 'CORS_ALLOWED_ORIGINS=*'],
  ['wide IPv4 trust', planPaths[2], '<EXACT_IMMEDIATE_PEER_CIDRS>', '0.0.0.0/0'],
  ['wide IPv6 trust', planPaths[2], '<EXACT_IMMEDIATE_PEER_CIDRS>', '::/0'],
  ['premature private subnet', planPaths[2], '<EXACT_IMMEDIATE_PEER_CIDRS>', '10.0.0.0/8'],
  ['public origin', planPaths[3], 'http://127.0.0.1:8080', 'http://203.0.113.7:8080'],
  ['catchall absent', planPaths[3], '  - service: http_status:404', ''],
  ['real tunnel id', planPaths[3], '<TUNNEL_UUID>', '00000000-0000-4000-8000-000000000000'],
  ['active claim', planPaths[3], '# Host-placement', 'Tunnel: ACTIVE\n# Host-placement'],
  ['commented active claim', planPaths[3], '# Host-placement', '# Tunnel: ACTIVE\n# Host-placement'],
  ['activated checklist', planPaths[1], '- [ ]', '- [x]'],
]) {
  test(`reject ${name}`, () => {
    const files = readPlan();
    assert.ok(files.get(path).includes(from), 'test mutation did not apply');
    files.set(path, files.get(path).replaceAll(from, to));
    assert.throws(() => verifyPlan(files));
  });
}

test('reject added unreviewed tunnel setting', () => {
  const files = readPlan();
  files.set(planPaths[3], files.get(planPaths[3]) + '\nnoTLSVerify: true\n');
  assert.throws(() => verifyPlan(files), /unreviewed_tunnel_template/);
});

test('reject unexpected ops artifact and credential JSON without printing content', () => {
  const files = readPlan();
  files.set('ops/cloudflare/private.json', '{}');
  assert.throws(() => verifyPlan(files), /unexpected_cloudflare_artifact/);
  const synthetic = JSON.stringify({ ['Tunnel' + 'Secret']: 'synthetic-only' });
  assert.throws(() => checkPerimeterSecrets(Buffer.from(synthetic)), /tunnel_credentials_json/);
});

test('reject private key and token assignments with class-only errors', () => {
  assert.throws(() => checkPerimeterSecrets(Buffer.from('-----BEGIN ' + 'PRIVATE KEY-----')), /private_key/);
  assert.throws(() => checkPerimeterSecrets(Buffer.from('TUNNEL_' + 'TOKEN=' + 'x'.repeat(40))), /perimeter_token/);
});
