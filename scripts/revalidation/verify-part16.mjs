import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
export const root = resolve(import.meta.dirname, '../..');
export function verify(read = p => readFileSync(join(root, p), 'utf8')) {
  const route = read('frontend/src/app/internal/revalidate/route.ts');
  assert.match(route, /revalidateTag\('catalog-data', \{ expire: 0 \}\)/);
  assert.ok(route.includes("revalidatePath('/[lang]/(site)/products/[id]', 'page')"));
  assert.match(route, /authenticated\(/);
  assert.doesNotMatch(route, /export.*function GET/);
  const helper = read('frontend/src/lib/revalidation.ts');
  assert.match(helper, /timingSafeEqual/);
  assert.match(helper, /sha256/);
  assert.match(helper, /reader\.cancel/);
  assert.match(read('frontend/src/proxy.ts'), /pathname === '\/internal\/revalidate'/);
  assert.match(read('frontend/src/app/sitemap.ts'), /await connection\(\)/);
  assert.match(read('frontend/src/api/httpAdapter.ts'), /tags: \['catalog-data'\]/);
  const command = read('backend-go/cmd/ingest/main.go');
  assert.ok(command.indexOf('revalidation.New(') < command.indexOf('pgx.Connect('));
  assert.match(command, /PublishThenNotify\(ctx, true, staged.Publish, notifier.Notify\)/);
  assert.doesNotMatch(read('backend-go/internal/ingestion/ingestor.go'), /revalidation|net\/http/);
  const client = read('backend-go/internal/revalidation/client.go');
  assert.ok(client.indexOf('publish(ctx)') < client.indexOf('notify(notificationCtx)'));
  assert.match(client, /return "degraded", nil/);
  assert.match(client, /http.ErrUseLastResponse/);
  assert.match(client, /5\s*\*\s*time.Second/);
  assert.match(read('scripts/create-clean-archive.mjs'), /production-part-16-review.tar.gz/);
  const report = read('docs/production/reports/PART_16_REPORT.md');
  assert.match(report, /Status: \*\*(READY_FOR_EXTERNAL_REVIEW|BLOCKED)\*\*/);
  assert.match(report, /Vercel Production branch = `main`/);
  assert.match(report, /Part17: NOT STARTED/);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verify(); console.log('Part16 static boundaries PASS (not production deployment evidence)');
}
