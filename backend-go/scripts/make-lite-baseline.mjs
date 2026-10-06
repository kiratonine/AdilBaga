// Собирает «лёгкий» слепок прод-каталога для тестовой БД (SCRUM-7, Task 11).
// Вход (не коммитятся, лежат в data/agent/):
//   baseline_static.sql   — stores, categories, snapshots, source_runs, store_locations
//   baseline_groups.txt   — по строке на canonical: "<category slug>|<store>:<sourceProductId>,..."
//                           store: 1=DINA, 2=DANA (id без префикса dana_), 3=FIX_PRICE (id без префикса fp_)
// Выход: data/agent/prod_catalog.sql — сохраняет структуру групп (какие raw в каком canonical) и id магазинов,
// названия/цены/payload заменены заглушками: этого хватает для проверки -recluster, гейтов и API-смоука.
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

const DATA = resolve(import.meta.dirname, '../../data/agent')
const STORE = { 1: { code: 'DINA', id: '645743a0-4161-46b0-b399-f8ede52af81c', prefix: '' },
  2: { code: 'DANA', id: '546620cb-b3ca-4c01-929f-d37c1ff14b96', prefix: 'dana_' },
  3: { code: 'FIX_PRICE', id: 'eeee78c3-c5b2-4b44-b886-4e462dbcb5d0', prefix: 'fp_' } }
const SNAPSHOT = 'baseline-internal-v1'
const q = (s) => `'${String(s).replaceAll("'", "''")}'`

const groups = readFileSync(resolve(DATA, 'baseline_groups.txt'), 'utf8').trim().split('\n')
const out = [readFileSync(resolve(DATA, 'baseline_static.sql'), 'utf8')]
const raws = [], canon = [], maps = [], offers = []
groups.forEach((line, gi) => {
  const [slug, members] = line.split('|')
  const cid = randomUUID()
  canon.push(`(${q(cid)},${q(`baseline group ${gi + 1}`)},(SELECT id FROM public.categories WHERE slug=${q(slug)}))`)
  for (const m of members.split(',')) {
    const [s, id] = m.split(':')
    const st = STORE[s], rid = randomUUID(), spid = `${st.prefix}${id}`
    raws.push(`(${q(rid)},${q(SNAPSHOT)},${q(st.id)},${q(spid)},${q(`baseline ${spid}`)},100)`)
    maps.push(`(${q(randomUUID())},${q(rid)},${q(cid)},'deterministic',1,'approved')`)
    offers.push(`(${q(randomUUID())},${q(SNAPSHOT)},${q(cid)},${q(rid)},${q(st.id)},100,true,'2026-09-26 11:36:05.102')`)
  }
})
out.push(`INSERT INTO public.raw_products (id,"snapshotId","storeId","sourceProductId","rawName","rawPrice") VALUES\n${raws.join(',\n')};`)
out.push(`INSERT INTO public.canonical_products (id,name,"categoryId") VALUES\n${canon.join(',\n')};`)
out.push(`INSERT INTO public.product_mappings (id,"rawProductId","canonicalProductId","matchMethod","matchConfidence","reviewStatus") VALUES\n${maps.join(',\n')};`)
out.push(`INSERT INTO public.offers (id,"snapshotId","canonicalProductId","rawProductId","storeId",price,"inStock","snapshotAt") VALUES\n${offers.join(',\n')};`)
writeFileSync(resolve(DATA, 'prod_catalog.sql'), `${out.join('\n\n')}\n`, 'utf8')
console.log(`prod_catalog.sql: ${groups.length} canonical, ${raws.length} raw`)
