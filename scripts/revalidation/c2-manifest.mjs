// LOCAL preparation only. Pure projection validator, NOT a provenance attestor.
// A future approved provider must establish these claims independently of the
// measured frontend. No DB/HTTP/clock/env access or production transport here.
const id = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v) && v.length <= 128 && !v.endsWith('\n');
const slug = v => typeof v === 'string' && /^[a-z0-9-]{1,64}$/.test(v) && !v.endsWith('\n');
const hex = (v, n) => typeof v === 'string' && v.length === n && /^[0-9a-f]+$/.test(v);
const uuid = v => typeof v === 'string' && v.length === 36 && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
const iso = v => typeof v === 'string' && v.length === 24 && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const fail = reason => { throw Error(reason) };
function keys(value, names) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail('invalid_projection');
  const own = Reflect.ownKeys(value);
  if (own.length !== names.length || own.some(k => typeof k !== 'string' || !names.includes(k))
    || names.some(k => {
      const d = Object.getOwnPropertyDescriptor(value, k);
      return !d || !Object.hasOwn(d, 'value') || !d.enumerable;
    })) fail('invalid_projection');
}
function list(value, max, valid) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max) fail('invalid_membership');
  // Only the intrinsic non-enumerable length plus own enumerable data indices.
  // Do not invoke an accessor, inherited element or caller-supplied iterator.
  const own = Reflect.ownKeys(value), items = [];
  if (own.length !== value.length + 1 || own.some(k => typeof k !== 'string')) fail('invalid_membership');
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) fail('invalid_membership');
    items.push(d.value);
  }
  if (!items.every(valid) || new Set(items).size !== items.length) fail('invalid_membership');
}
function projection(p, phase, snapshotId, attemptId) {
  keys(p, ['snapshotId', 'attemptId', 'provenance', 'dashboardAt', 'topEight', 'products', 'categoryPages', 'sitemap']);
  if (p.snapshotId !== snapshotId || p.attemptId !== attemptId || !iso(p.dashboardAt)) fail('projection_identity');
  const s = p.provenance;
  keys(s, ['kind', 'evidenceId', 'phase', 'canonicalStateId', 'sourceSha', 'frontendSha', 'semantics', 'snapshotStatus', 'consistentRead', 'exclusiveWindow']);
  if (!['fixture', 'sealed-repository-projection'].includes(s.kind) || !id(s.evidenceId) || !id(s.canonicalStateId)
    || s.phase !== phase || !hex(s.sourceSha, 40) || !hex(s.frontendSha, 40) || s.semantics !== 'go-next-c2-v1'
    || s.snapshotStatus !== 'published' || s.consistentRead !== true || s.exclusiveWindow !== true) fail('unqualified_provenance');
  list(p.topEight, 8, id);
  list(p.products, 8, () => true);
  if (!Array.isArray(p.products) || p.products.length !== p.topEight.length) fail('invalid_products');
  const products = new Map();
  for (const product of p.products) {
    keys(product, ['id', 'slug', 'snapshotAt']);
    if (!id(product.id) || !slug(product.slug) || !iso(product.snapshotAt) || product.snapshotAt > p.dashboardAt
      || products.has(product.id) || !p.topEight.includes(product.id)) fail('invalid_products');
    products.set(product.id, product);
  }
  list(p.categoryPages, 8, () => true);
  const pages = new Map();
  for (const page of p.categoryPages) {
    keys(page, ['slug', 'productIds']);
    if (!slug(page.slug) || pages.has(page.slug)) fail('invalid_membership');
    list(page.productIds, 24, id); pages.set(page.slug, page.productIds);
  }
  keys(p.sitemap, ['categorySlugs', 'productIds']);
  list(p.sitemap.categorySlugs, 64, slug);
  // This is the actual bounded traversal subset, NOT all canonical products.
  list(p.sitemap.productIds, 5000, id);
  return { products, pages };
}
const freeze = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value) }
  return value;
};

// v1 local input: explicit before/after projections. sourceSha/frontendSha are
// substantiated identities supplied by the caller, not invented by this module.
// Ranking is supplied in repository order, never recomputed with JS collation.
// Selection uses ASCII product-ID ascending, independent of changing price rank.
// Deadline eligibility belongs to the existing trusted event/observer, not UTC.
export function buildManifest(input) {
  try {
    keys(input, ['version', 'attemptId', 'beforeSnapshotId', 'afterSnapshotId', 'before', 'after']);
    if (input.version !== 1 || !hex(input.attemptId, 32) || !uuid(input.beforeSnapshotId) || !uuid(input.afterSnapshotId)
      || input.beforeSnapshotId === input.afterSnapshotId) fail('invalid_run');
    const b = input.before, a = input.after;
    const before = projection(b, 'before-canonical-mutation', input.beforeSnapshotId, input.attemptId);
    const after = projection(a, 'after-commit', input.afterSnapshotId, input.attemptId);
    if (b.provenance.kind !== a.provenance.kind || b.provenance.sourceSha !== a.provenance.sourceSha
      || b.provenance.frontendSha !== a.provenance.frontendSha || b.provenance.evidenceId === a.provenance.evidenceId
      || b.provenance.canonicalStateId === a.provenance.canonicalStateId) fail('conflicting_provenance');
    if (a.dashboardAt <= b.dashboardAt) fail('unchanged_or_reversed_dashboard');
    const eligible = (p, state, index) => state.topEight.includes(p.id) && index.pages.get(p.slug)?.includes(p.id)
      && state.sitemap.categorySlugs.includes(p.slug) && state.sitemap.productIds.includes(p.id);
    const selected = [...before.products.keys()].sort().map(k => [before.products.get(k), after.products.get(k)])
      .find(([p, q]) => q && p.slug === q.slug && q.snapshotAt > p.snapshotAt && eligible(p, b, before) && eligible(q, a, after));
    if (!selected) fail('no_changed_stable_witness');
    const [p, q] = selected, productBefore = p.snapshotAt, productAfter = q.snapshotAt;
    const targets = [
      ['product_ru', `/ru/products/${p.id}`, productBefore, productAfter],
      ['product_kk', `/kk/products/${p.id}`, productBefore, productAfter],
      ['sitemap', '/sitemap.xml', b.dashboardAt, a.dashboardAt],
      ['catalog', '/ru/catalog', b.dashboardAt, a.dashboardAt],
      ['dashboard', '/ru/dashboard', b.dashboardAt, a.dashboardAt],
      ['category', `/ru/collections/${p.slug}`, productBefore, productAfter],
    ].map(([name, path, old, next]) => ({ name, path, productId: p.id, slug: p.slug, before: old, after: next, productBefore, productAfter }));
    // Preparation-only: even a claimed sealed projection cannot arm the default
    // public transport. Custody/provider authorization is NOT inferred from JSON.
    return freeze({ status: 'ready', manifest: { snapshotId: input.afterSnapshotId, attemptId: input.attemptId, fixtureOnly: true, targets } });
  } catch (error) {
    const safe = ['invalid_projection', 'invalid_membership', 'projection_identity', 'unqualified_provenance', 'invalid_products', 'invalid_run',
      'conflicting_provenance', 'unchanged_or_reversed_dashboard', 'no_changed_stable_witness'];
    return { status: 'inconclusive', reason: safe.includes(error?.message) ? error.message : 'invalid_projection' };
  }
}
