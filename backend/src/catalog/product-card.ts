import type { ProductCardDto } from '../contracts/catalog';

export function normalizeProduct(product: ProductCardDto): ProductCardDto {
  const offers = [...product.offers].sort((a, b) => a.price - b.price);
  return {
    ...product,
    offers,
    minPrice: offers[0]?.price ?? 0,
  };
}
