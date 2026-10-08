import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, verify } from './verify-part16.mjs';
test('approved implementation boundaries', () => verify());
for (const [label, path, from, to] of [
  ['stale tag semantics','frontend/src/app/internal/revalidate/route.ts',"{ expire: 0 }","'max'"],
  ['timing unsafe','frontend/src/lib/revalidation.ts','timingSafeEqual','unsafeCompare'],
  ['postcommit failure conflation','backend-go/internal/revalidation/client.go','return "degraded", nil','return "degraded", err'],
]) test(label, () => assert.throws(() => verify(p => {
  const text = readFileSync(join(root,p),'utf8'); return p === path ? text.replaceAll(from,to) : text;
})));
