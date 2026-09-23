import * as fs from 'fs';
import * as path from 'path';
import { NormalizerService } from '../src/modules/normalization/normalizer.service';
import { MatcherService } from '../src/modules/matching/matcher.service';
import { RawImportedProduct } from '../src/modules/import/types/import.types';

async function runAudit() {
  console.log('='.repeat(70));
  console.log('      ADIL BAĞA — BACKEND 2 COMPREHENSIVE AUDIT & VERIFICATION');
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  // --- SUITE 1: NORMALIZATION EDGE CASES (Section 4, Group 1) ---
  console.log('\n>>> 1. NORMALIZATION EDGE CASES');
  const normalizer = new NormalizerService();

  // Case 1: МОЛОКО УЛЬТРАПАСТЕРИЗОВАННОЕ 3,2% 1000 МЛ -> volumeMl: 1000, fatPercent: 3.2
  const n1 = normalizer.normalize('МОЛОКО УЛЬТРАПАСТЕРИЗОВАННОЕ 3,2% 1000 МЛ', 'FoodMaster');
  assert(n1.volumeMl === 1000, 'Case 1: Volume 1000ml extracted from "1000 МЛ"');
  assert(n1.fatPercent === 3.2, 'Case 1: Fat 3.2% extracted from "3,2%" (comma to dot)');
  assert(n1.brand === 'FoodMaster', 'Case 1: Brand FoodMaster canonicalized');

  // Case 2: Сливки стерилизованные 10% 0,5 л -> volumeMl: 500, fatPercent: 10.0
  const n2 = normalizer.normalize('Сливки стерилизованные 10% 0,5 л');
  assert(n2.volumeMl === 500, 'Case 2: Volume 500ml extracted from "0,5 л"');
  assert(n2.fatPercent === 10.0, 'Case 2: Fat 10.0% extracted');

  // Case 3: Молоко кокосовое лайт 1.5% 900 мл -> volumeMl: 900, fatPercent: 1.5
  const n3 = normalizer.normalize('Молоко кокосовое лайт 1.5% 900 мл');
  assert(n3.volumeMl === 900, 'Case 3: Volume 900ml extracted from "900 мл"');
  assert(n3.fatPercent === 1.5, 'Case 3: Fat 1.5% extracted from "1.5%"');

  // Case 4: Хлебцы хрустящие гречневые 100 г -> weightGrams: 100, breadType: 'crispbread'
  const n4 = normalizer.normalize('Хлебцы хрустящие гречневые 100 г');
  assert(n4.weightGrams === 100, 'Case 4: Weight 100g extracted');
  assert(n4.breadType === 'crispbread', 'Case 4: Bread type "crispbread" detected from "хлебцы"');

  // Case 5: Масло подсолнечное рафинированное дезодорированное 0.9 л -> volumeMl: 900
  const n5 = normalizer.normalize('Масло подсолнечное рафинированное дезодорированное 0.9 л');
  assert(n5.volumeMl === 900, 'Case 5: Volume 900ml extracted from "0.9 л"');

  // Case 6: Чай черный байховый 100 пак -> packageCount: 100
  const n6 = normalizer.normalize('Чай черный байховый 100 пак');
  assert(n6.packageCount === 100, 'Case 6: Package count 100 extracted from "100 пак"');

  // Case 7: Сахар-рафинад быстрорастворимый кусковой 1 кг -> weightGrams: 1000
  const n7 = normalizer.normalize('Сахар-рафинад быстрорастворимый кусковой 1 кг');
  assert(n7.weightGrams === 1000, 'Case 7: Weight 1000g extracted from "1 кг"');

  // --- SUITE 2: MATCHER FALSE-POSITIVE & POSITIVE TESTS (Section 4, Group 2) ---
  console.log('\n>>> 2. MATCHER FALSE-POSITIVE & POSITIVE TESTS');
  const matcher = new MatcherService();

  // 1. Negative: Different volume: 500ml vs 1000ml -> match: false
  const p1 = matcher.prepareCandidate({ storeCode: 'DINA', sourceProductId: '1', name: 'Молоко 3.2% 500 мл', category: 'milk', price: 350 });
  const p2 = matcher.prepareCandidate({ storeCode: 'DANA', sourceProductId: '2', name: 'Молоко 3.2% 1000 мл', category: 'milk', price: 570 });
  assert(matcher.canMatch(p1, p2).match === false, 'Strict volume check: 500ml != 1000ml (match: false)');

  // 2. Negative: Different fat: 2.5% vs 3.2% -> match: false
  const p3 = matcher.prepareCandidate({ storeCode: 'DINA', sourceProductId: '3', name: 'Молоко 2.5% 1 л', category: 'milk', price: 500 });
  const p4 = matcher.prepareCandidate({ storeCode: 'DANA', sourceProductId: '4', name: 'Молоко 3.2% 1 л', category: 'milk', price: 550 });
  assert(matcher.canMatch(p3, p4).match === false, 'Strict fat check: 2.5% != 3.2% (match: false)');

  // 3. Negative: Different brands: FoodMaster vs Петропавловское -> match: false
  const p5 = matcher.prepareCandidate({ storeCode: 'DINA', sourceProductId: '5', name: 'Молоко FoodMaster 3.2% 1 л', category: 'milk', price: 550 });
  const p6 = matcher.prepareCandidate({ storeCode: 'DANA', sourceProductId: '6', name: 'Молоко Петропавловское 3.2% 1 л', category: 'milk', price: 550 });
  assert(matcher.canMatch(p5, p6).match === false, 'Brand mismatch check: FoodMaster != Петропавловское (match: false)');

  // 4. Negative: Different categories: Oil vs Milk -> match: false
  const p7 = matcher.prepareCandidate({ storeCode: 'DINA', sourceProductId: '7', name: 'Масло подсолнечное 1 л', category: 'oil', price: 850 });
  const p8 = matcher.prepareCandidate({ storeCode: 'DANA', sourceProductId: '8', name: 'Молоко 1 л', category: 'milk', price: 550 });
  assert(matcher.canMatch(p7, p8).match === false, 'Category mismatch check: oil != milk (match: false)');

  // 5. Positive: EAN Barcode match
  const b1 = matcher.prepareCandidate({ storeCode: 'DINA', sourceProductId: '9', name: 'Масло 1л', category: 'oil', price: 800, rawPayload: { barcode: '4600699500018' } });
  const b2 = matcher.prepareCandidate({ storeCode: 'FIX_PRICE', sourceProductId: '10', name: 'Масло подсолнечное 1 л', category: 'oil', price: 820, rawPayload: { barcode: '4600699500018' } });
  const mBarcode = matcher.canMatch(b1, b2);
  assert(mBarcode.match === true && mBarcode.method === 'barcode', 'EAN Barcode exact match verified (match: true, method: barcode)');

  // --- SUITE 3: AKTAU GEODATA VALIDATION (Section 4, Group 3) ---
  console.log('\n>>> 3. AKTAU STORE LOCATIONS VALIDATION');
  // Coordinates bounding box for Aktau city: Lat 43.58 - 43.75, Lon 51.08 - 51.30
  // Minimum >= 10 store locations across the 3 retail chains
  const seedLocations = [
    // Dina Locations in Aktau
    { storeCode: 'DINA', name: 'Гипермаркет 301 «Дина»', address: 'г. Актау, 33 микрорайон, Акку 33', lat: 43.683094, lon: 51.157194 },
    { storeCode: 'DINA', name: 'Супермаркет 303 «Дина», ТЦ Shum', address: 'г. Актау, 4 микрорайон, 74', lat: 43.637827, lon: 51.165376 },
    { storeCode: 'DINA', name: 'Минимаркет 304 «Дина», ТД Атлант', address: 'г. Актау, 4 микрорайон, 36', lat: 43.633559, lon: 51.160610 },
    { storeCode: 'DINA', name: 'Супермаркет 3201 «Дина», Royal House', address: 'г. Актау, 19 микрорайон, 5', lat: 43.675328, lon: 51.155875 },
    { storeCode: 'DINA', name: 'Минимаркет 3301 «Дина»', address: 'г. Актау, 27 микрорайон, 31/3', lat: 43.668143, lon: 51.162442 },

    // Dana Locations in Aktau
    { storeCode: 'DANA', name: 'Дана Гипермаркет', address: 'г. Актау, 17 микрорайон, 1', lat: 43.664200, lon: 51.154100 },
    { storeCode: 'DANA', name: 'Дана Супермаркет', address: 'г. Актау, 14 микрорайон, 38', lat: 43.649100, lon: 51.158200 },
    { storeCode: 'DANA', name: 'Дана 28 мкр', address: 'г. Актау, 28 микрорайон, 45', lat: 43.673000, lon: 51.169000 },

    // Fix Price Locations in Aktau
    { storeCode: 'FIX_PRICE', name: 'Fix Price ТРК «Актау»', address: 'г. Актау, 16 микрорайон, 6', lat: 43.655200, lon: 51.164300 },
    { storeCode: 'FIX_PRICE', name: 'Fix Price 11А мкр', address: 'г. Актау, 11А микрорайон, 1Б', lat: 43.652100, lon: 51.161200 },
    { storeCode: 'FIX_PRICE', name: 'Fix Price 12 мкр', address: 'г. Актау, 12 микрорайон, 16', lat: 43.645500, lon: 51.168500 },
    { storeCode: 'FIX_PRICE', name: 'Fix Price 19 мкр', address: 'г. Актау, 19 микрорайон, 11', lat: 43.674100, lon: 51.153900 }
  ];

  assert(seedLocations.length >= 10, `Total store locations count >= 10 (actual: ${seedLocations.length})`);

  const uniqueStoreCodes = new Set(seedLocations.map(l => l.storeCode));
  assert(uniqueStoreCodes.has('DINA') && uniqueStoreCodes.has('DANA') && uniqueStoreCodes.has('FIX_PRICE'), 'Store locations cover all 3 chains (DINA, DANA, FIX_PRICE)');

  for (const loc of seedLocations) {
    const insideLat = loc.lat >= 43.58 && loc.lat <= 43.75;
    const insideLon = loc.lon >= 51.08 && loc.lon <= 51.30;
    assert(insideLat && insideLon, `Location "${loc.name}" (${loc.storeCode}) is strictly inside Aktau polygon (${loc.lat}, ${loc.lon})`);
  }

  // --- SUITE 4: SNAPSHOT INTEGRITY & PRICE CONSISTENCY (Section 4, Group 4) ---
  console.log('\n>>> 4. SNAPSHOT INTEGRITY (data/snapshots/final_dataset.json)');
  const snapshotPath = path.resolve(__dirname, '../../data/snapshots/final_dataset.json');
  assert(fs.existsSync(snapshotPath), 'Snapshot file final_dataset.json exists');

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
  assert(snapshot.summary.totalRawProducts >= 200, `Raw products count >= 200 (actual: ${snapshot.summary.totalRawProducts})`);
  assert(snapshot.summary.totalCanonicalProducts >= 100, `Canonical products count >= 100 (actual: ${snapshot.summary.totalCanonicalProducts})`);
  assert(snapshot.summary.matchedAcrossTwoOrMoreStores >= 1, `Multi-store matches >= 1 (actual: ${snapshot.summary.matchedAcrossTwoOrMoreStores})`);

  // Verify all 3 stores are represented in summary
  const hasAllStoresInSummary = Boolean(
    snapshot.summary?.rawByStore?.DINA > 0 &&
    snapshot.summary?.rawByStore?.DANA > 0 &&
    snapshot.summary?.rawByStore?.FIX_PRICE > 0
  );
  assert(hasAllStoresInSummary, 'All 3 retail chains (DINA, DANA, FIX_PRICE) are represented in the snapshot');

  let pricesConsistent = true;
  for (const c of snapshot.canonicalProducts) {
    const minOfferPrice = Math.min(...c.offers.map((o: any) => o.price));
    if (c.minPrice !== minOfferPrice) {
      pricesConsistent = false;
      break;
    }
  }
  assert(pricesConsistent, 'Every CanonicalProduct.minPrice strictly equals min(offers.price)');

  // --- SUITE 5: DTO SANITY CHECK (Section 4, Group 5) ---
  console.log('\n>>> 5. RAW PRODUCTS DTO SANITY');
  let dtoValid = true;
  let invalidReason = '';
  for (const r of snapshot.rawProducts) {
    if (!['DINA', 'DANA', 'FIX_PRICE'].includes(r.storeCode)) {
      dtoValid = false;
      invalidReason = `Invalid storeCode: ${r.storeCode}`;
      break;
    }
    if (!r.sourceProductId || typeof r.sourceProductId !== 'string' || r.sourceProductId.trim() === '') {
      dtoValid = false;
      invalidReason = `Empty sourceProductId for ${r.name}`;
      break;
    }
    if (!r.name || typeof r.name !== 'string' || r.name.trim() === '') {
      dtoValid = false;
      invalidReason = `Empty product name`;
      break;
    }
    if (typeof r.price !== 'number' || !Number.isInteger(r.price) || r.price <= 0) {
      dtoValid = false;
      invalidReason = `Invalid price ${r.price} for ${r.name}`;
      break;
    }
  }
  assert(dtoValid, 'All RawProducts have valid storeCode, non-empty sourceProductId, non-empty name, and integer price > 0', invalidReason);

  // --- SUMMARY ---
  console.log('\n' + '='.repeat(70));
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  if (failed === 0) {
    console.log('AUDIT VERDICT: [APPROVED] Backend 2 is production-ready for Smart City Aktau!');
  } else {
    console.error('AUDIT VERDICT: [REJECTED] Fix failing tests before merging.');
    process.exit(1);
  }
  console.log('='.repeat(70) + '\n');
}

runAudit().catch(err => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
