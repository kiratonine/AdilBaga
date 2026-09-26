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

  // 6. Different product type test: Promo гречка 700g vs Promo манка 700g MUST NOT MATCH
  const buckwheatPromo: RawImportedProduct = {
    storeCode: 'DINA',
    sourceProductId: 'dina_8',
    name: 'Крупа Promo гречка 700 г',
    brand: 'Promo',
    category: 'groats',
    price: 305
  };
  const semolinaPromo: RawImportedProduct = {
    storeCode: 'DINA',
    sourceProductId: 'dina_9',
    name: 'Крупа Promo манная 700 г',
    brand: 'Promo',
    category: 'groats',
    price: 361
  };
  const res6 = matcher.canMatch(matcher.prepareCandidate(buckwheatPromo), matcher.prepareCandidate(semolinaPromo));
  assert(res6.match === false, 'Different product types (buckwheat vs semolina) under same brand/weight must NOT match');

  // 7. packageCount extraction and preservation in canonical group attributes
  const quailEgg: RawImportedProduct = {
    storeCode: 'DANA',
    sourceProductId: 'dana_egg_20',
    name: 'ЯЙЦО ПЕРЕПЕЛИНЫЕ 20ШТ',
    category: 'eggs',
    price: 650
  };
  const candQuail = matcher.prepareCandidate(quailEgg);
  assert(candQuail.attrs.packageCount === 20, 'Normalizer: 20ШТ extracted as packageCount = 20');
  const groupsQuail = matcher.groupProducts([quailEgg]);
  assert((groupsQuail[0]?.attributes as any)?.packageCount === 20, 'Matcher: MatchGroup.attributes preserves packageCount = 20');

  // 8. packageCount mismatch protection: 10 eggs vs 20 eggs MUST NOT MATCH
  const egg10: RawImportedProduct = {
    storeCode: 'DINA',
    sourceProductId: 'dina_egg_10',
    name: 'Яйцо куриное 10 шт С1',
    category: 'eggs',
    price: 550
  };
  const egg20: RawImportedProduct = {
    storeCode: 'DANA',
    sourceProductId: 'dana_egg_20b',
    name: 'Яйцо куриное 20 шт С1',
    category: 'eggs',
    price: 1050
  };
  const res8 = matcher.canMatch(matcher.prepareCandidate(egg10), matcher.prepareCandidate(egg20));
  assert(res8.match === false, 'Package count mismatch (10 шт vs 20 шт) must NOT match');

  // Egg-shaped sweets must not inherit a scraper's public eggs category or /N pack count.
  const eggCase = (name: string): RawImportedProduct => ({
    storeCode: 'DINA', sourceProductId: name, name, category: 'eggs', price: 500
  });
  assert(matcher.groupProducts([eggCase('Kinder Surprise 20г/36')])[0]?.category === 'other', 'Kinder Surprise is public other');
  assert(matcher.groupProducts([eggCase('Шоколадное яйцо с подарком 20г/24')])[0]?.category === 'other', 'Chocolate egg is public other');
  assert(matcher.groupProducts([eggCase('Яйцо куриное С1 10 шт')])[0]?.category === 'eggs', 'Chicken egg remains public eggs');
  assert(matcher.prepareCandidate(quailEgg).attrs.packageCount === 20, 'Quail eggs 20ШТ have packageCount 20');
  assert(matcher.prepareCandidate(eggCase('Яйцо Ramazan Extra/10')).attrs.packageCount === 10, 'Real DINA egg /10 has packageCount 10');
  assert(matcher.prepareCandidate(eggCase('Яйцо куриное Ақкөл Құс С2/10(Упаковка входит в цену)')).attrs.packageCount === 10, 'Real DINA egg С2/10 before parenthesis has packageCount 10');
  const chocolatePack = matcher.prepareCandidate(eggCase('Шоколадное яйцо 20г/24'));
  assert(chocolatePack.attrs.productType === 'confectionery' && chocolatePack.attrs.packageCount == null, 'Chocolate 20г/24 is not eggs packageCount 24');

  // 9. Weighted price normalization in DinaScraper (0.7 -> 700 ₸)
  const { DinaScraper } = require('../import/scrapers/dina.scraper');
  const scraper = new DinaScraper();
  const bananItem = {
    id: '927',
    name: 'Банан',
    price: 0.7,
    oldPrice: 0.9,
    price_type: 'weight',
    isWeightProduct: true
  };
  const bananProd = scraper.processProductItem(bananItem);
  assert(bananProd?.price === 700 && bananProd?.oldPrice === 900, 'DINA weighted price: 0.7 ₸/g normalized to 700 ₸/kg and oldPrice 900 ₸');

  // 10. Piece product price NOT multiplied
  const breadItem = {
    id: '3001',
    name: 'Хлеб формовой',
    price: 180,
    oldPrice: null,
    price_type: 'piece',
    isWeightProduct: false
  };
  const breadProd = scraper.processProductItem(breadItem);
  assert(breadProd?.price === 180, 'Piece product price preserved without modification (180 ₸)');

  // 11. Cross-store positive matching for canonical brand and size
  const sugarDina: RawImportedProduct = {
    storeCode: 'DINA',
    sourceProductId: 'dina_s_3kg',
    name: 'Сахар песок Достык 3кг/5',
    category: 'sugar',
    price: 2172
  };
  const sugarDana: RawImportedProduct = {
    storeCode: 'DANA',
    sourceProductId: 'dana_s_3kg',
    name: 'САХАР "ДОСТЫК" 3КГ',
    category: 'sugar',
    price: 1821
  };
  const res11 = matcher.canMatch(matcher.prepareCandidate(sugarDina), matcher.prepareCandidate(sugarDana));
  assert(res11.match === true, 'Cross-store match: Сахар Достык 3 кг (DINA) == САХАР "ДОСТЫК" 3КГ (DANA)');

  // 12. Category semantics: Kefir is NOT canonical milk (must be other)
  const kefirRaw: RawImportedProduct = {
    storeCode: 'DINA',
    sourceProductId: 'dina_kefir_1',
    name: 'Кефир Акнек /пл/б /6 3.2% 1 л',
    category: 'milk',
    price: 572
  };
  const kefirGroup = matcher.groupProducts([kefirRaw])[0];
  assert(kefirGroup?.category === 'other', 'Category semantics: Kefir maps to category "other", NOT "milk"');

  // 13. Category semantics: Tan/Ayran is NOT canonical milk (must be other)
  const tanRaw: RawImportedProduct = {
    storeCode: 'DINA',
    sourceProductId: 'dina_tan_1',
    name: 'Тан Акнек п/б 1 л',
    category: 'milk',
    price: 341
  };
  const tanGroup = matcher.groupProducts([tanRaw])[0];
  assert(tanGroup?.category === 'other', 'Category semantics: Tan/Ayran maps to category "other", NOT "milk"');

  // 14. Category semantics: Actual milk is canonical milk
  const milkActual: RawImportedProduct = {
    storeCode: 'DINA',
    sourceProductId: 'dina_milk_1',
    name: 'Молоко Новый день 2.5% 1 л',
    category: 'milk',
    price: 568
  };
  const milkGroup = matcher.groupProducts([milkActual])[0];
  assert(milkGroup?.category === 'milk', 'Category semantics: Actual milk maps to category "milk"');

  // 15. Nemoloko oat classic 3.2% 1L is preserved as category milk
  const nemolokoClassicRaw: RawImportedProduct = {
    storeCode: 'DANA',
    sourceProductId: 'dana_nemo_classic',
    name: 'МОЛОЧНЫЙ НАПИТОК "NEMOLOKO" ОВСЯНОЕ КЛАССИЧЕСКОЕ 3,2 % 1 л',
    category: 'milk',
    price: 995
  };
  const nemoClassicGroup = matcher.groupProducts([nemolokoClassicRaw])[0];
  assert(
    nemoClassicGroup?.category === 'milk' &&
    (nemoClassicGroup?.attributes as any)?.volumeMl === 1000 &&
    (nemoClassicGroup?.attributes as any)?.fatPercent === 3.2,
    'Category semantics: Nemoloko oat classic 3.2% 1L has category "milk", volumeMl=1000, fatPercent=3.2'
  );

  // 16. Matching Guard: Dimension mismatch (950g vs 2L) MUST NOT MATCH
  const miloko950g: RawImportedProduct = {
    storeCode: 'DINA',
    sourceProductId: 'dina_miloko_950',
    name: 'Молоко "Милоко" 3,2% 950г',
    category: 'milk',
    price: 596
  };
  const miloko2L: RawImportedProduct = {
    storeCode: 'DANA',
    sourceProductId: 'dana_miloko_2l',
    name: 'МОЛОКО "МИЛОКО" 3,2% 2Л',
    category: 'milk',
    price: 1204
  };
  const res16 = matcher.canMatch(matcher.prepareCandidate(miloko950g), matcher.prepareCandidate(miloko2L));
  assert(res16.match === false, 'Matching Guard: 950g vs 2L dimension mismatch must NOT match');

  // 17. Matching Guard: Flavor mismatch (vanilla vs chocolate) MUST NOT MATCH
  const nemoVanilla: RawImportedProduct = {
    storeCode: 'DINA',
    sourceProductId: 'dina_nemo_vanilla',
    name: 'Напиток овсяный Nemoloko ванильный 1 л',
    category: 'milk',
    price: 1187
  };
  const nemoChocolate: RawImportedProduct = {
    storeCode: 'DANA',
    sourceProductId: 'dana_nemo_choco',
    name: 'МОЛОЧНЫЙ НАПИТОК "NEMOLOKO"  ОВСЯНОЕ ШОКОЛАДНОЕ 1л',
    category: 'milk',
    price: 1224
  };
  const res17 = matcher.canMatch(matcher.prepareCandidate(nemoVanilla), matcher.prepareCandidate(nemoChocolate));
  assert(res17.match === false, 'Matching Guard: vanilla vs chocolate flavor mismatch must NOT match');

  // 18. Matching Guard: Oil composition mismatch (pure sunflower vs sunflower+olive mix) MUST NOT MATCH
  const oleinaSunflower: RawImportedProduct = {
    storeCode: 'DINA',
    sourceProductId: 'dina_oleina_pure',
    name: 'Масло "Олейна" подсолнечное 1л',
    category: 'oil',
    price: 974
  };
  const oleinaMix: RawImportedProduct = {
    storeCode: 'DANA',
    sourceProductId: 'dana_oleina_mix',
    name: 'МАСЛО OLEINA МИКС ПОДСОЛНЕЧНЫЙ И ОЛИВКОВЫЙ 1Л',
    category: 'oil',
    price: 965
  };
  const res18 = matcher.canMatch(matcher.prepareCandidate(oleinaSunflower), matcher.prepareCandidate(oleinaMix));
  assert(res18.match === false, 'Matching Guard: pure sunflower vs sunflower+olive mix must NOT match');

  // 19. Weighted price guard: Low-price piece item 9 ₸ is preserved without modification
  const lowPricePiece = {
    id: '12345',
    name: 'Пакет полиэтиленовый майка',
    price: 9,
    oldPrice: null,
    price_type: 'piece',
    isWeightProduct: false
  };
  const lowPriceProd = scraper.processProductItem(lowPricePiece);
  assert(lowPriceProd?.price === 9, 'Weighted price guard: piece item price 9 ₸ remains 9 ₸ (NOT multiplied to 9000 ₸)');

  // 20. Canonical attributes preservation: productType is saved in canonical attributes
  assert(
    (nemoClassicGroup?.attributes as any)?.productType === 'milk',
    'Attributes preservation: CanonicalProduct.attributes preserves productType'
  );

  console.log(`\nRESULTS: ${passed}/${total} tests passed!`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
