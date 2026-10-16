// Explicit synthetic fixture-only manifest. Never derive production witnesses
// from captures alone or feed measured frontend output back as its own oracle.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const fixture = name => JSON.parse(fs.readFileSync(new URL(`../../../frontend/src/mocks/${name}.json`, import.meta.url)));
export function fixtureManifest(snapshotId, attemptId) {
  const products = fixture('products'), dashboard = fixture('dashboard');
  const selected = products.find(p => dashboard.priceSpreads.slice(0, 8).some(s => s.productId === p.id)
    && products.filter(q => q.category.slug === p.category.slug).sort((a, b) => a.minPrice - b.minPrice).slice(0, 24).some(q => q.id === p.id));
  assert.ok(selected, 'fixture has no qualified product');
  const before = dashboard.summary.snapshotAt, productBefore = selected.snapshotAt;
  const after = '2026-10-16T12:00:00.000Z', productAfter = '2026-10-16T11:00:00.000Z';
  assert.notEqual(before, after); assert.notEqual(productBefore, productAfter);
  const id = selected.id, slug = selected.category.slug;
  return { snapshotId, attemptId, fixtureOnly: true, targets: [
    ['product_ru', `/ru/products/${id}`, productBefore, productAfter], ['product_kk', `/kk/products/${id}`, productBefore, productAfter],
    ['sitemap', '/sitemap.xml', before, after], ['catalog', '/ru/catalog', before, after],
    ['dashboard', '/ru/dashboard', before, after], ['category', `/ru/collections/${slug}`, productBefore, productAfter],
  ].map(([name, path, old, next]) => ({ name, path, productId: id, slug, before: old, after: next, productBefore, productAfter })) };
}

export function fixtureBody(target, fresh = true) {
  const stamp = fresh ? target.after : target.before, product = fresh ? target.productAfter : target.productBefore;
  if (target.name === 'sitemap') return '<urlset>' + ['catalog', 'dashboard', `collections/${target.slug}`, `products/${target.productId}`]
    .flatMap(p => ['ru', 'kk'].map(lang => `<url><loc>https://aktau.market/${lang}/${p}</loc><lastmod>${p.startsWith('products') ? product : stamp}</lastmod></url>`)).join('') + '</urlset>';
  const q = (queryKey, data) => ({ queryKey, state: { data } });
  const prod = { id: target.productId, snapshotAt: stamp };
  const queries = target.name.startsWith('product_') ? [q(['product', target.productId], prod)] : target.name === 'category'
    ? [q(['products', { category: target.slug }], { pages: [[prod]] })]
    : [q(['dashboard'], { summary: { snapshotAt: stamp }, priceSpreads: [{ productId: target.productId }] })];
  if (target.name === 'catalog') queries.push(q(['product', target.productId], { ...prod, snapshotAt: product }));
  return `<script>self.__next_f.push(${JSON.stringify([1, `a:${JSON.stringify({ queries })}\n`])})</script>`;
}
