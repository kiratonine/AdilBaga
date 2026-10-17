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
function buildManifestV1(input) {
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

// v2 is compact: positions attest membership without exporting 5000 products.
// This validates claims, not their custody; provider trust is separate.
export function validateProjectionV2(p, phase, attemptId) {
  keys(p, ['version', 'phase', 'attemptId', 'snapshotId', 'previousSnapshotId', 'provenance', 'body']);
  if (p.version !== 2 || p.phase !== phase || !hex(attemptId, 32) || p.attemptId !== attemptId
    || !uuid(p.snapshotId) || !(p.previousSnapshotId === null || uuid(p.previousSnapshotId))
    || p.previousSnapshotId === p.snapshotId) fail('projection_identity');
  const s = p.provenance;
  keys(s, ['kind', 'evidenceId', 'canonicalStateId', 'sourceSha', 'frontendSha', 'semantics', 'snapshotStatus', 'consistentRead']);
  if (s.kind !== 'sealed-repository-projection' || s.evidenceId !== `${attemptId}-${phase === 'after-commit' ? 'after' : 'before'}`
    || !hex(s.canonicalStateId, 64) || !hex(s.sourceSha, 40) || !hex(s.frontendSha, 40)
    || s.semantics !== 'go-next-c2-v2' || s.snapshotStatus !== 'published' || s.consistentRead !== true) fail('unqualified_provenance');
  const b = p.body;
  keys(b, ['dashboardAt', 'topEight', 'witnessId', 'candidates', 'categoryPages', 'sitemap']);
  if (!iso(b.dashboardAt) || !(b.witnessId === null || id(b.witnessId))) fail('invalid_products');
  list(b.topEight, 8, id); list(b.candidates, 8, () => true); list(b.categoryPages, 8, () => true);
  keys(b.sitemap, ['categorySlugs', 'productCount', 'truncated']);
  list(b.sitemap.categorySlugs, 64, slug);
  if (!Number.isInteger(b.sitemap.productCount) || b.sitemap.productCount < 0 || b.sitemap.productCount > 5000
    || typeof b.sitemap.truncated !== 'boolean' || (b.sitemap.truncated && b.sitemap.productCount !== 5000)) fail('invalid_membership');
  const pages = new Map(), products = new Map();
  for (const page of b.categoryPages) {
    keys(page, ['slug', 'productIds']);
    if (!slug(page.slug) || pages.has(page.slug)) fail('invalid_membership');
    list(page.productIds, 24, id); pages.set(page.slug, page.productIds);
  }
  const index = (v, max) => v === null || Number.isInteger(v) && v >= 0 && v <= max;
  const beforeSitemapPositions = new Set();
  for (const c of b.candidates) {
    keys(c, ['id', 'slug', 'snapshotAt', 'topEightIndex', 'categoryIndex', 'sitemapIndex']);
    if (!id(c.id) || products.has(c.id) || !(c.slug === null || slug(c.slug)) || !(c.snapshotAt === null || iso(c.snapshotAt))
      || (c.snapshotAt !== null && c.snapshotAt > b.dashboardAt) || !index(c.topEightIndex, 7)
      || !index(c.categoryIndex, 23) || !index(c.sitemapIndex, 4999)) fail('invalid_products');
    if (phase === 'before-canonical-mutation') {
      if (!b.topEight.includes(c.id) || c.topEightIndex !== b.topEight.indexOf(c.id)) fail('invalid_products');
      if (c.sitemapIndex !== null) {
        if (beforeSitemapPositions.has(c.sitemapIndex)) fail('invalid_membership');
        beforeSitemapPositions.add(c.sitemapIndex);
      }
    }
    // Null means ineligible, not fabricated membership. Non-null claims must agree.
    if (c.topEightIndex !== null && b.topEight[c.topEightIndex] !== c.id
      || c.categoryIndex !== null && pages.get(c.slug)?.[c.categoryIndex] !== c.id
      || c.sitemapIndex !== null && c.sitemapIndex >= b.sitemap.productCount) fail('invalid_membership');
    products.set(c.id, c);
  }
  if (phase === 'after-commit' && (b.candidates.length !== 1 || b.categoryPages.length !== 1)) fail('invalid_products');
  const eligible = c => c && c.slug !== null && c.snapshotAt !== null && c.topEightIndex !== null
    && c.categoryIndex !== null && c.sitemapIndex !== null && b.sitemap.categorySlugs.includes(c.slug);
  return { products, eligible };
}

function targetsV2(b, a, p, q) {
  const productBefore = p.snapshotAt, productAfter = q.snapshotAt;
  return [
    ['product_ru', `/ru/products/${p.id}`, productBefore, productAfter],
    ['product_kk', `/kk/products/${p.id}`, productBefore, productAfter],
    ['sitemap', '/sitemap.xml', b.body.dashboardAt, a.body.dashboardAt],
    ['catalog', '/ru/catalog', b.body.dashboardAt, a.body.dashboardAt],
    ['dashboard', '/ru/dashboard', b.body.dashboardAt, a.body.dashboardAt],
    ['category', `/ru/collections/${p.slug}`, productBefore, productAfter],
  ].map(([name, path, before, after]) => ({ name, path, productId: p.id, slug: p.slug, before, after, productBefore, productAfter }));
}

export function prepareBeforeV2(before) {
  try {
    const checked = validateProjectionV2(before, 'before-canonical-mutation', Object.getOwnPropertyDescriptor(before, 'attemptId')?.value);
    const witness = [...checked.products.values()].filter(c => c.slug !== null && c.snapshotAt !== null
      && c.categoryIndex !== null && c.sitemapIndex !== null && before.body.sitemap.categorySlugs.includes(c.slug))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0];
    if (!witness || witness.id !== before.body.witnessId || !checked.eligible(witness)) fail('witness_mismatch');
    // Capture needs only BEFORE. No invented AFTER timestamp is introduced.
    const targets = targetsV2(before, before, witness, witness).map(({ after, productAfter, ...target }) => target);
    return freeze({ status: 'ready', witness: { id: witness.id, slug: witness.slug }, targets, fixtureOnly: true });
  } catch { return { status: 'inconclusive', reason: 'unqualified_before' } }
}

export function buildManifest(input) {
  if (!input || Object.getOwnPropertyDescriptor(input, 'version')?.value !== 2) return buildManifestV1(input);
  try {
    keys(input, ['version', 'attemptId', 'before', 'after']);
    const b = input.before, a = input.after;
    const prepared = prepareBeforeV2(b);
    if (prepared.status !== 'ready' || input.attemptId !== b.attemptId) fail('unqualified_before');
    const checked = validateProjectionV2(a, 'after-commit', input.attemptId);
    if (a.previousSnapshotId !== b.snapshotId || a.snapshotId === b.snapshotId) fail('snapshot_chain');
    if (a.provenance.sourceSha !== b.provenance.sourceSha || a.provenance.frontendSha !== b.provenance.frontendSha
      || a.provenance.canonicalStateId === b.provenance.canonicalStateId) fail('conflicting_provenance');
    const p = b.body.candidates.find(c => c.id === prepared.witness.id), q = checked.products.get(p.id);
    if (a.body.witnessId !== p.id || !checked.eligible(q) || q.slug !== p.slug) fail('unqualified_after');
    if (q.snapshotAt <= p.snapshotAt || a.body.dashboardAt <= b.body.dashboardAt) fail('unchanged_marker');
    return freeze({ status: 'ready', manifest: { snapshotId: a.snapshotId, attemptId: input.attemptId, fixtureOnly: true,
      targets: targetsV2(b, a, p, q) } });
  } catch (e) {
    const safe = ['unqualified_before', 'snapshot_chain', 'conflicting_provenance', 'unqualified_after', 'unchanged_marker',
      'invalid_projection', 'invalid_membership', 'projection_identity', 'unqualified_provenance', 'invalid_products'];
    return { status: 'inconclusive', reason: safe.includes(e?.message) ? e.message : 'invalid_projection' };
  }
}
