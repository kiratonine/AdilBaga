import type { Prisma } from '@prisma/client';
import { normalizeProduct } from '../catalog/product-card';
import type { ProductCardDto } from '../contracts/catalog';
import type { StoreLocation } from '../location/nearest-store';

export const usableOffer = { inStock: true, price: { gt: 0 } } as const;

export function scalarAttributes(value: unknown): ProductCardDto['attributes'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const attributes: ProductCardDto['attributes'] = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean' ||
      (typeof item === 'number' && Number.isFinite(item))) {
      attributes[key] = item;
    }
  }
  return attributes;
}

export type ProductRow = Prisma.CanonicalProductGetPayload<{
  include: { category: true; offers: { include: { store: true } } };
}>;

export function mapProduct(row: ProductRow): ProductCardDto | null {
  const usable = row.offers.filter((offer) => offer.inStock && offer.price > 0);
  if (usable.length === 0) return null;
  const snapshotAt = usable.reduce((latest, offer) =>
    offer.snapshotAt > latest ? offer.snapshotAt : latest, usable[0]!.snapshotAt);
  return normalizeProduct({
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: { slug: row.category.slug, name: row.category.name },
    imageUrl: row.imageUrl,
    attributes: scalarAttributes(row.attributes),
    minPrice: usable[0]!.price,
    offers: usable.map((offer) => ({
      storeCode: offer.store.code,
      storeName: offer.store.name,
      price: offer.price,
      oldPrice: offer.oldPrice,
    })),
    snapshotAt: snapshotAt.toISOString(),
  });
}

type LocationRow = Prisma.StoreLocationGetPayload<{ include: { store: true } }>;

export function mapLocation(row: LocationRow): StoreLocation {
  return {
    storeCode: row.store.code,
    storeName: row.store.name,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}
