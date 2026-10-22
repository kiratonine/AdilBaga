import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OfferDto, ProductCardDto } from '../src/contracts/catalog';
import { calculateBaskets } from '../src/dashboard/basket-calculator';

function product(
  id: string,
  name: string,
  categorySlug: string,
  attributes: ProductCardDto['attributes'],
  offers: OfferDto[],
): ProductCardDto {
  return {
    id, name, brand: null,
    category: { slug: categorySlug, name: categorySlug },
    imageUrl: null, attributes,
    minPrice: Math.min(...offers.map((offer) => offer.price)),
    offers, snapshotAt: '2026-09-23T09:00:00.000Z',
  };
}

function offer(storeCode: OfferDto['storeCode'], price: number): OfferDto {
  return { storeCode, storeName: storeCode, price, oldPrice: null };
}

const stores = [
  { code: 'FIX_PRICE' as const, name: 'Fix Price' },
  { code: 'DANA' as const, name: 'Dana' },
  { code: 'DINA' as const, name: 'Dina' },
];

test('demo basket matches category, size range and name pattern per store', () => {
  const products = [
    product('milk-1l', 'Молоко Новый день 1.5% 1л', 'milk', { volumeMl: 1000 },
      [offer('DINA', 499), offer('DANA', 537), offer('FIX_PRICE', 699)]),
    product('oat-milk', 'Напиток Nemoloko 1 л', 'milk', { volumeMl: 1000 }, [offer('DINA', 1)]),
    product('pasta', 'Спагетти Pasta collection 400 г', 'groats', { weightGrams: 400 },
      [offer('DINA', 185), offer('DANA', 347), offer('FIX_PRICE', 266)]),
    product('oats', 'Овсяные хлопья 400 г', 'groats', { weightGrams: 400 },
      [offer('DINA', 1), offer('DANA', 1), offer('FIX_PRICE', 1)]),
    product('rice', 'Рис круглозерный 800 г', 'groats', { weightGrams: 800 },
      [offer('DINA', 636), offer('DANA', 690), offer('FIX_PRICE', 399)]),
    product('rice-noodle', 'Рисовая лапша 800 г', 'groats', { weightGrams: 800 }, [offer('DINA', 1)]),
    product('yogurt', 'Йогурт FRUTTIS 115 г', 'dairy', { weightGrams: 115 },
      [offer('DINA', 231), offer('DANA', 257), offer('FIX_PRICE', 249)]),
    product('oil-08', 'Масло подсолнечное 0.8 л', 'oil', { volumeMl: 800 }, [offer('DINA', 745)]),
    product('oil-09', 'Масло подсолнечное 0,9 л', 'oil', { volumeMl: 900 }, [offer('FIX_PRICE', 799)]),
    product('oil-1l', 'Масло подсолнечное 1 л', 'oil', { volumeMl: 1000 }, [offer('DANA', 920)]),
    product('oil-5l', 'Масло подсолнечное 5 л', 'oil', { volumeMl: 5000 },
      [offer('DINA', 1), offer('DANA', 1), offer('FIX_PRICE', 1)]),
    product('oil-str', 'Масло подсолнечное 1 л', 'oil', { volumeMl: '1000' }, [offer('DINA', 1)]),
  ];
  const baskets = calculateBaskets(products, stores);

  assert.deepEqual(baskets.map((basket) => basket.storeCode), ['DINA', 'DANA', 'FIX_PRICE']);
  const keys = ['basket-milk', 'basket-pasta', 'basket-rice', 'basket-yogurt', 'basket-oil'];
  for (const b of baskets) assert.deepEqual(b.items.map((i) => i.categorySlug), keys);
  assert.deepEqual(baskets.map((b) => b.items.map((i) => i.productId)), [
    ['milk-1l', 'pasta', 'rice', 'yogurt', 'oil-08'],
    ['milk-1l', 'pasta', 'rice', 'yogurt', 'oil-1l'],
    ['milk-1l', 'pasta', 'rice', 'yogurt', 'oil-09'],
  ]);
  assert.deepEqual(baskets.map((b) => b.total), [2296, 2751, 2412]);
  assert.deepEqual(baskets[0]?.items.map((i) => i.categoryName), [
    'Молоко 1 л', 'Макароны 400 г', 'Рис 800 г', 'Йогурт Fruttis 115 г', 'Масло подсолнечное 0,8–1 л',
  ]);
});

test('basket calculator takes the cheapest usable offer and breaks ties by product id', () => {
  const products = [
    product('milk-b', 'Молоко Б 1 л', 'milk', { volumeMl: 1000 },
      [offer('DINA', 610), offer('DINA', 600), offer('DANA', 900), offer('FIX_PRICE', 0)]),
    product('milk-a', 'Молоко А 1 л', 'milk', { volumeMl: 1000 },
      [offer('DINA', 600), offer('DANA', 650), offer('FIX_PRICE', -10)]),
  ];
  const baskets = calculateBaskets(products, stores);

  assert.deepEqual(baskets.map((b) => [b.items[0]?.productId, b.items[0]?.price]), [
    ['milk-a', 600], ['milk-a', 650], [null, null],
  ]);
});

test('basket calculator returns null positions and zero total without matches', () => {
  const [basket] = calculateBaskets([], [{ code: 'DINA', name: 'Dina' }]);
  assert.equal(basket?.total, 0);
  assert.deepEqual(basket?.items.map((item) => [item.productId, item.name, item.price]), [
    [null, null, null], [null, null, null], [null, null, null], [null, null, null], [null, null, null],
  ]);
});
