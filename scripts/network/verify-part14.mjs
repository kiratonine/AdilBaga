import assert from 'node:assert/strict';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const root = resolve(import.meta.dirname, '../..');
export const planPaths = [
  'docs/production/NETWORK_PERIMETER.md',
  'docs/production/CLOUDFLARE_ACTIVATION_CHECKLIST.md',
  'ops/cloudflare/README.md',
  'ops/cloudflare/cloudflared-config.example.yml',
];

// Narrow, deterministic Phase A artifact checks, NOT a Cloudflare emulator or
// complete secret detector. Errors contain classes only, never rejected content.
export function checkPerimeterSecrets(bytes) {
  const text = bytes.toString('utf8');
  assert.ok(!/"(?:TunnelSecret|AccountTag|TunnelID)"\s*:/i.test(text), 'tunnel_credentials_json');
  assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/.test(text), 'private_key');
  assert.ok(!/^\s*(?:export\s+)?(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN|TUNNEL_TOKEN)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/im.test(text), 'perimeter_token');
}

export function verifyPlan(files) {
  for (const path of planPaths) assert.ok(files.has(path), 'missing_plan_artifact');
  for (const [path, text] of files) {
    checkPerimeterSecrets(Buffer.from(text));
    if (path.startsWith('ops/cloudflare/')) assert.ok(planPaths.includes(path), 'unexpected_cloudflare_artifact');
    assert.ok(text.includes('PLANNED / NOT ACTIVATED'), 'missing_inactive_marker');
    assert.ok(text.includes('PLANNED ONLY / NOT OWNED / NOT RESOLVED / NOT ACTIVE'), 'missing_hostname_state');
    assert.match(text, /HSTS:\s*DEFERRED\b/, 'hsts_not_deferred');
    assert.ok(!/^\s*(?:#\s*)?(?:Status:\s*(?:\*\*)?ACTIVE|(?:Cloudflare|DNS|TLS|Tunnel|DNSSEC|WAF)\s*(?:=|:)\s*(?:ACTIVE|PASS))\b/im.test(text), 'false_activation_claim');
    for (const [, value] of text.matchAll(/^\s*CORS_ALLOWED_ORIGINS=([^\n]+)$/gm)) {
      assert.equal(value.trim(), 'https://aktau.market', 'unapproved_cors');
    }
    for (const [, value] of text.matchAll(/^\s*TRUSTED_PROXY_CIDRS=([^\n]+)$/gm)) {
      assert.equal(value.trim(), '<EXACT_IMMEDIATE_PEER_CIDRS>', 'unapproved_peer_assignment');
    }
  }
  const template = files.get(planPaths[3]);
  assert.ok(template.includes('NOT ACTIVE'), 'template_not_inactive');
  // Only this placeholder-only grammar is reviewed. Reject added settings,
  // duplicate ingress/key entries, public targets, tokens, real UUIDs and catchall drift.
  const lines = template.split('\n').map(x => x.trim()).filter(x => x && !x.startsWith('#'));
  assert.deepEqual(lines, [
    'tunnel: <TUNNEL_UUID>',
    'credentials-file: <PRIVATE_CREDENTIALS_FILE_OUTSIDE_REPO>',
    'ingress:',
    '- hostname: api.aktau.market',
    'service: http://127.0.0.1:8080',
    '- service: http_status:404',
  ], 'unreviewed_tunnel_template');
  const design = files.get(planPaths[0]);
  for (const marker of ['no public inbound API origin port', 'API cache bypass',
    'Voice POST no-cache', 'Full (strict)', 'DNSSEC', 'CF-Connecting-IP',
    'X-Forwarded-For', 'Siri/Shortcut', '/metrics', 'Phase B', 'Rollback']) {
    assert.ok(design.includes(marker), 'missing_design_boundary');
  }
  assert.ok(!/^- \[x\]/m.test(files.get(planPaths[1])), 'activation_claim_in_checklist');
}

export function readPlan() {
  const files = new Map();
  for (const path of planPaths) {
    assert.ok(lstatSync(join(root, path)).isFile(), 'non_regular_plan_artifact');
    files.set(path, readFileSync(join(root, path), 'utf8'));
  }
  const allowed = new Set(planPaths.filter(p => p.startsWith('ops/cloudflare/')).map(p => p.split('/').at(-1)));
  assert.ok(readdirSync(join(root, 'ops/cloudflare')).every(p => allowed.has(p)), 'unexpected_cloudflare_artifact');
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyPlan(readPlan());
  console.log('Part14 offline perimeter verifier PASS (not activation evidence)');
}
