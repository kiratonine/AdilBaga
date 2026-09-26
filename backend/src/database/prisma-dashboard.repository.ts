import { Inject, Injectable } from '@nestjs/common';
import type { DashboardDto } from '../contracts/catalog';
import { calculateBaskets } from '../dashboard/basket-calculator';
import { PRODUCT_REPOSITORY, type DashboardRepository, type ProductRepository } from '../repositories';
import { mapLocation } from './prisma-mappers';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaDashboardRepository implements DashboardRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
  ) {}

  async getDashboard(): Promise<DashboardDto> {
    const [products, stores, rows] = await Promise.all([
      this.products.findProducts({}),
      this.prisma.store.findMany({ select: { code: true, name: true } }),
      this.prisma.storeLocation.findMany({
        include: { store: true },
        orderBy: [{ store: { code: 'asc' } }, { name: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const matched = products.filter((product) =>
      new Set(product.offers.map((offer) => offer.storeCode)).size >= 2);
    const priceSpreads = matched.map((product) => {
      const prices = product.offers.map((offer) => offer.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      return {
        productId: product.id,
        name: product.name,
        minPrice,
        maxPrice,
        differencePercent: Math.round(((maxPrice - minPrice) / minPrice) * 10_000) / 100,
      };
    }).sort((a, b) => b.differencePercent - a.differencePercent || a.productId.localeCompare(b.productId));
    return {
      summary: {
        canonicalProducts: products.length,
        stores: stores.length,
        matchedAcrossStores: matched.length,
        snapshotAt: products.reduce((latest, product) =>
          product.snapshotAt > latest ? product.snapshotAt : latest, ''),
      },
      priceSpreads,
      locations: rows.map(mapLocation),
      baskets: calculateBaskets(products, stores),
    };
  }
}
