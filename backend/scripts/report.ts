import * as fs from 'fs';
import * as path from 'path';

const SNAPSHOT_PATH = path.resolve(__dirname, '../../data/snapshots/final_dataset.json');

function generateReport() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    console.error(`Error: Snapshot file not found at ${SNAPSHOT_PATH}.`);
    console.error('Run "npm run data:pipeline" first to generate the dataset.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
  const summary = data.summary;
  const canonicals = data.canonicalProducts || [];
  const priceSpreads = data.priceSpreads || [];

  console.log('\n' + '='.repeat(65));
  console.log('       ADIL BAĞA (ӘДІЛ БАҒА) — DATA QUALITY & METRICS REPORT');
  console.log('='.repeat(65));
  console.log(`Target City:         Aktau, Mangystau, Kazakhstan`);
  console.log(`Dataset Version:     ${data.version}`);
  console.log(`Generated At:        ${data.generatedAt}\n`);

  console.log('--- 1. INGESTION METRICS ---');
  console.log(`Total Raw Products:  ${summary.totalRawProducts}`);
  console.log(`  * Dina Market:     ${summary.rawByStore.DINA}`);
  console.log(`  * Dana Market:     ${summary.rawByStore.DANA}`);
  console.log(`  * Fix Price:       ${summary.rawByStore.FIX_PRICE}\n`);

  console.log('--- 2. CANONICAL & MATCHING METRICS ---');
  console.log(`Canonical Products:  ${summary.totalCanonicalProducts}`);
  console.log(`Multi-Store Matches: ${summary.matchedAcrossTwoOrMoreStores} (products present in 2+ retail chains)`);
  console.log(`Triple-Store Matches:${summary.matchedAcrossAllThreeStores} (products present in ALL 3 retail chains)\n`);

  console.log('--- 3. CATEGORY DISTRIBUTION ---');
  const catCount: Record<string, number> = {};
  for (const c of canonicals) {
    const cat = c.category || 'other';
    catCount[cat] = (catCount[cat] || 0) + 1;
  }
  for (const [k, v] of Object.entries(catCount)) {
    console.log(`  * ${k.padEnd(16)}: ${v} canonical products`);
  }

  console.log('\n--- 4. TOP PRICE SPREADS (MAX USER BENEFIT) ---');
  if (priceSpreads.length === 0) {
    console.log('  No multi-store price spreads recorded.');
  } else {
    for (let i = 0; i < Math.min(priceSpreads.length, 5); i++) {
      const s = priceSpreads[i];
      console.log(`[${i + 1}] ${s.name}`);
      console.log(`    Min Price:    ${s.minPrice} ₸`);
      console.log(`    Max Price:    ${s.maxPrice} ₸`);
      console.log(`    Difference:   +${s.diffPercent}% (+${s.diffTenge} ₸)`);
      console.log(`    Offers:`);
      for (const o of s.offers) {
        console.log(`      - ${o.storeCode}: ${o.price} ₸`);
      }
    }
  }

  console.log('\n' + '='.repeat(65));
  console.log('STATUS: READY FOR BACKEND 1 & FRONTEND CONSUMPTION');
  console.log('='.repeat(65) + '\n');
}

generateReport();
