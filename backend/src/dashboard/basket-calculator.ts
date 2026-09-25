import type { BasketDto, BasketItemDto, OfferDto, ProductCardDto } from '../contracts/catalog';
import { BASKET_SLOTS } from './basket-config';

type BasketStore = { code: OfferDto['storeCode']; name: string };

const storeOrder: OfferDto['storeCode'][] = ['DINA', 'DANA', 'FIX_PRICE'];

export function calculateBaskets(
  products: readonly ProductCardDto[],
  stores: readonly BasketStore[],
): BasketDto[] {
  return [...stores]
    .sort((a, b) => storeOrder.indexOf(a.code) - storeOrder.indexOf(b.code))
    .map((store) => {
      const items: BasketItemDto[] = BASKET_SLOTS.map((slot) => {
        let cheapest: { product: ProductCardDto; price: number } | undefined;
        for (const product of products) {
          if (product.category.slug !== slot.categorySlug ||
              product.attributes[slot.attributeKey] !== slot.attributeValue) continue;
          for (const offer of product.offers) {
            if (offer.storeCode !== store.code || !Number.isFinite(offer.price) || offer.price <= 0) continue;
            if (!cheapest || offer.price < cheapest.price ||
                (offer.price === cheapest.price && product.id < cheapest.product.id)) {
              cheapest = { product, price: offer.price };
            }
          }
        }
        return {
          categorySlug: slot.categorySlug,
          categoryName: slot.categoryName,
          productId: cheapest?.product.id ?? null,
          name: cheapest?.product.name ?? null,
          price: cheapest?.price ?? null,
        };
      });
      return {
        storeCode: store.code,
        storeName: store.name,
        total: items.reduce((sum, item) => sum + (item.price ?? 0), 0),
        items,
      };
    });
}
