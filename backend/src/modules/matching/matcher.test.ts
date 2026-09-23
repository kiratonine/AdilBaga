import { MatcherService } from './matcher.service';
import { RawImportedProduct } from '../import/types/import.types';

function runTests() {
  const matcher = new MatcherService();
  console.log('=== RUNNING MATCHER UNIT TESTS ===\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
    }
  }

  // 1. Same SKU test: Dana Nemoloko vs Fix Price Nemoloko
  const nemolokoDana: RawImportedProduct = {
    storeCode: 'DANA',
    sourceProductId: 'dana_17801',
    name: 'NEMOLOKO РИСОВЫЙ КЛАССИЧЕСКИЙ ЛАЙТ 1Л',
    category: 'milk',
    price: 1170
  };
  const nemolokoFixPrice: RawImportedProduct = {
    storeCode: 'FIX_PRICE',
    sourceProductId: 'fp_50202',
    name: 'Напиток рисовый Nemoloko классический лайт 1.5% 1 л',
    category: 'milk',
    price: 650
  };
  const res1 = matcher.canMatch(matcher.prepareCandidate(nemolokoDana), matcher.prepareCandidate(nemolokoFixPrice));
  assert(res1.match === true, 'Matching: Nemoloko 1L (Dana) == Nemoloko 1L (Fix Price)');

  // 2. Different volume test: 500ml vs 1000ml MUST NOT MATCH
  const milk500: RawImportedProduct = {
    storeCode: 'DINA',
    sourceProductId: 'dina_1',
    name: 'Молоко FoodMaster 3.2% 500 мл',
    category: 'milk',
    price: 350
  };
  const milk1000: RawImportedProduct = {
    storeCode: 'DANA',
    sourceProductId: 'dana_2',
    name: 'Молоко FoodMaster 3.2% 1000 мл',
    category: 'milk',
    price: 570
  };
  const res2 = matcher.canMatch(matcher.prepareCandidate(milk500), matcher.prepareCandidate(milk1000));
  assert(res2.match === false, 'Different volume (500ml vs 1000ml) must NOT match');

  // 3. Different fat % test: 2.5% vs 3.2% MUST NOT MATCH
  const milkFat25: RawImportedProduct = {
    storeCode: 'DINA',
    sourceProductId: 'dina_3',
    name: 'Молоко FoodMaster 2.5% 1 л',
    category: 'milk',
    price: 520
  };
  const milkFat32: RawImportedProduct = {
    storeCode: 'DANA',
    sourceProductId: 'dana_4',
    name: 'Молоко FoodMaster 3.2% 1 л',
    category: 'milk',
    price: 570
  };
  const res3 = matcher.canMatch(matcher.prepareCandidate(milkFat25), matcher.prepareCandidate(milkFat32));
  assert(res3.match === false, 'Different fat % (2.5% vs 3.2%) must NOT match');

  // 4. Different brand test: FoodMaster vs Петропавловское MUST NOT MATCH
  const milkFM: RawImportedProduct = {
    storeCode: 'DINA',
    sourceProductId: 'dina_5',
    name: 'Молоко FoodMaster 3.2% 1 л',
    category: 'milk',
    price: 570
  };
  const milkPP: RawImportedProduct = {
    storeCode: 'DANA',
    sourceProductId: 'dana_6',
    name: 'Молоко Петропавловское 3.2% 1 л',
    category: 'milk',
    price: 550
  };
  const res4 = matcher.canMatch(matcher.prepareCandidate(milkFM), matcher.prepareCandidate(milkPP));
  assert(res4.match === false, 'Different brands (FoodMaster vs Петропавловское) must NOT match');

  // 5. Barcode exact match test
  const prodA: RawImportedProduct = {
    storeCode: 'DINA',
    sourceProductId: 'dina_7',
    name: 'Масло подсолнечное рафинированное 1л',
    category: 'oil',
    price: 850,
    rawPayload: { barcode: '4600699500018' }
  };
  const prodB: RawImportedProduct = {
    storeCode: 'FIX_PRICE',
    sourceProductId: 'fp_50301',
    name: 'Масло Золотая Семечка 1 л',
    category: 'oil',
    price: 820,
    rawPayload: { barcode: '4600699500018' }
  };
  const res5 = matcher.canMatch(matcher.prepareCandidate(prodA), matcher.prepareCandidate(prodB));
  assert(res5.match === true && res5.method === 'barcode', 'Barcode exact match works');

  console.log(`\nRESULTS: ${passed}/${total} tests passed!`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
