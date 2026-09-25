import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { DinaScraper } from '../src/modules/import/scrapers/dina.scraper';
import { DanaScraper } from '../src/modules/import/scrapers/dana.scraper';
import { FixPriceLoader } from '../src/modules/import/scrapers/fixprice.loader';
import { MatcherService, MatchGroup } from '../src/modules/matching/matcher.service';
import { RawImportedProduct } from '../src/modules/import/types/import.types';

const SNAPSHOT_OUT = path.resolve(__dirname, '../../data/snapshots/final_dataset.json');

async function runPipeline() {
  console.log('='.repeat(60));
  console.log('ADIL BAĞA — DATA INGESTION & MATCHING PIPELINE');
  console.log('='.repeat(60));
  console.log(`Execution time: ${new Date().toISOString()}`);
  console.log('Target location: Aktau, Mangystau, Kazakhstan\n');

  // 1. Run Dina Scraper
  console.log('>>> [1/3] Ingesting Dina Market (Aktau shop 28)...');
  const dinaScraper = new DinaScraper();
  const dinaRes = await dinaScraper.fetchProducts();
  console.log(`[DINA] Fetched ${dinaRes.totalFetched} products.`);

  // 2. Run Dana Scraper
  console.log('\n>>> [2/3] Ingesting Dana Market (Aktau catalog)...');
  const danaScraper = new DanaScraper();
  const danaRes = await danaScraper.fetchProducts();
  console.log(`[DANA] Fetched ${danaRes.totalFetched} products.`);

  // 3. Run Fix Price Loader
  console.log('\n>>> [3/3] Loading Fix Price Aktau snapshot...');
  const fixPriceLoader = new FixPriceLoader();
  const fpRes = fixPriceLoader.load();
  console.log(`[FIX_PRICE] Loaded ${fpRes.totalFetched} products.`);

  // Combine raw
  const allRaw: RawImportedProduct[] = [
    ...dinaRes.products,
    ...danaRes.products,
    ...fpRes.products
  ];
  console.log(`\n>>> Total Raw Products Ingested: ${allRaw.length}`);

  // 4. Run Product Matching Pipeline
  console.log('\n>>> [4/4] Executing Normalization & Product Matching...');
  const matcher = new MatcherService();
  const groups: MatchGroup[] = matcher.groupProducts(allRaw);
  console.log(`>>> Formed ${groups.length} Canonical Products!`);

  // Analyze overlaps
  const matched2Plus = groups.filter(g => {
    const stores = new Set(g.offers.map(o => o.storeCode));
    return stores.size >= 2;
  });
  const matched3Stores = groups.filter(g => {
    const stores = new Set(g.offers.map(o => o.storeCode));
    return stores.size === 3;
  });

  // Calculate price spreads
  const priceSpreads = matched2Plus.map(g => {
    const prices = g.offers.map(o => o.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const diff = max - min;
    const diffPct = min > 0 ? Math.round((diff / min) * 100) : 0;
    return {
      canonicalId: g.id,
      name: g.canonicalName,
      minPrice: min,
      maxPrice: max,
      diffTenge: diff,
      diffPercent: diffPct,
      offers: g.offers
    };
  }).sort((a, b) => b.diffPercent - a.diffPercent);

  // 5. Save Complete Final Snapshot to JSON
  const finalDataset = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    city: 'Aktau',
    summary: {
      totalRawProducts: allRaw.length,
      rawByStore: {
        DINA: dinaRes.totalFetched,
        DANA: danaRes.totalFetched,
        FIX_PRICE: fpRes.totalFetched
      },
      totalCanonicalProducts: groups.length,
      matchedAcrossTwoOrMoreStores: matched2Plus.length,
      matchedAcrossAllThreeStores: matched3Stores.length
    },
    priceSpreads: priceSpreads.slice(0, 10),
    canonicalProducts: groups,
    rawProducts: allRaw
  };

  fs.mkdirSync(path.dirname(SNAPSHOT_OUT), { recursive: true });
  fs.writeFileSync(SNAPSHOT_OUT, JSON.stringify(finalDataset, null, 2), 'utf-8');
  console.log(`\n>>> Final snapshot written to: ${SNAPSHOT_OUT}`);

  // 6. Print Report
  console.log('\n' + '='.repeat(60));
  console.log('DATA QUALITY REPORT');
  console.log('='.repeat(60));
  console.log(`Raw Products:
  - Dina:      ${dinaRes.totalFetched}
  - Dana:      ${danaRes.totalFetched}
  - Fix Price: ${fpRes.totalFetched}
  Total:       ${allRaw.length}`);
  console.log(`\nCanonical Products Formed: ${groups.length}`);
  console.log(`Matched across 2+ stores:  ${matched2Plus.length}`);
  console.log(`Matched across 3 stores:   ${matched3Stores.length}`);

  console.log('\nTOP PRICE SPREADS (Max savings in Aktau):');
  for (const s of priceSpreads.slice(0, 5)) {
    console.log(`- ${s.name}:`);
    console.log(`  Min: ${s.minPrice} ₸ | Max: ${s.maxPrice} ₸ | Difference: +${s.diffPercent}% (+${s.diffTenge} ₸)`);
    for (const o of s.offers) {
      console.log(`    * ${o.storeCode}: ${o.price} ₸`);
    }
  }
  console.log('='.repeat(60));
}

runPipeline().catch(err => {
  console.error('Pipeline error:', err);
  process.exit(1);
});
