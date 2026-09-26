import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OfferDto, ProductCardDto } from '../src/contracts/catalog';
import { calculateBaskets } from '../src/dashboard/basket-calculator';

function product(
  id: string,
  categorySlug: string,
  attributes: ProductCardDto['attributes'],
  offers: OfferDto[],
): ProductCardDto {
  return {
    id, name: id, brand: null,
    category: { slug: categorySlug, name: categorySlug },
    imageUrl: null, attributes,
    minPrice: Math.min(...offers.map((offer) => offer.price)),
    offers, snapshotAt: '2026-09-23T09:00:00.000Z',
  };
}

function offer(storeCode: OfferDto['storeCode'], price: number): OfferDto {
  return { storeCode, storeName: storeCode, price, oldPrice: null };
}

test('basket calculator uses exact attributes and the cheapest usable offer of each store', () => {
  const products = [
    product('milk-a', 'milk', { volumeMl: 1000 }, [offer('DINA', 740), offer('DANA', 650), offer('FIX_PRICE', 0)]),
    product('milk-b', 'milk', { volumeMl: 1000 }, [offer('DINA', 610), offer('DINA', 600), offer('DANA', 900), offer('FIX_PRICE', 800)]),
    product('milk-small', 'milk', { volumeMl: 500 }, [offer('DINA', 100), offer('DANA', 100), offer('FIX_PRICE', 100)]),
    product('sugar-1kg', 'sugar', { weightGrams: 1000 }, [offer('DINA', 400), offer('DANA', 450), offer('FIX_PRICE', -10)]),
    product('oil-1l', 'oil', { volumeMl: 1000 }, [offer('DINA', 300), offer('FIX_PRICE', 350)]),
    product('oil-small', 'oil', { volumeMl: 900 }, [offer('DANA', 1)]),
  ];
  const baskets = calculateBaskets(products, [
    { code: 'FIX_PRICE', name: 'Fix Price' },
    { code: 'DANA', name: 'Dana' },
    { code: 'DINA', name: 'Dina' },
  ]);

  assert.deepEqual(baskets.map((basket) => basket.storeCode), ['DINA', 'DANA', 'FIX_PRICE']);
  for (const basket of baskets) {
    assert.deepEqual(basket.items.map((item) => item.categorySlug), ['milk', 'sugar', 'oil']);
    assert.equal(basket.total, basket.items.reduce((sum, item) => sum + (item.price ?? 0), 0));
  }
  assert.deepEqual(baskets[0]?.items.map((item) => [item.productId, item.price]), [
    ['milk-b', 600], ['sugar-1kg', 400], ['oil-1l', 300],
  ]);
  assert.equal(baskets[0]?.total, 1300);
  assert.deepEqual(baskets[1]?.items.map((item) => [item.productId, item.price]), [
    ['milk-a', 650], ['sugar-1kg', 450], [null, null],
  ]);
  assert.equal(baskets[1]?.total, 1100);
  assert.deepEqual(baskets[2]?.items.map((item) => [item.productId, item.price]), [
    ['milk-b', 800], [null, null], ['oil-1l', 350],
  ]);
  assert.equal(baskets[2]?.total, 1150);
  assert.deepEqual(baskets[2]?.items[1], {
    categorySlug: 'sugar', categoryName: 'Сахар и соль',
    productId: null, name: null, price: null,
  });
});

test('basket calculator returns null positions and zero total without exact matches', () => {
  const [basket] = calculateBaskets([], [{ code: 'DINA', name: 'Dina' }]);
  assert.equal(basket?.total, 0);
  assert.deepEqual(basket?.items.map((item) => [item.productId, item.name, item.price]), [
    [null, null, null], [null, null, null], [null, null, null],
  ]);
});
