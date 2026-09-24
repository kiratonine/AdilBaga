import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ProductCardDto, ProductQuery } from '../contracts/catalog';
import type { ProductRepository } from '../repositories';
import { mapProduct, usableOffer } from './prisma-mappers';
import { PrismaService } from './prisma.service';

function matchesFilters(product: ProductCardDto, filters: ProductQuery['filters']): boolean {
  return Object.entries(filters ?? {}).every(([key, options]) => {
    const value = key === 'brand' ? product.brand : product.attributes[key];
    return value !== null && value !== undefined && options.includes(value);
  });
}

@Injectable()
export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findProducts(query: ProductQuery): Promise<ProductCardDto[]> {
    const where: Prisma.CanonicalProductWhereInput = {
      offers: { some: usableOffer },
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const rows = await this.prisma.canonicalProduct.findMany({
      where,
      include: {
        category: true,
        offers: { where: usableOffer, include: { store: true }, orderBy: { price: 'asc' } },
      },
    });
    const products = rows.map(mapProduct).filter((product): product is ProductCardDto =>
      product !== null && matchesFilters(product, query.filters));
    if (query.sort === 'name_asc') {
      products.sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id));
    } else if (query.sort === 'price_desc') {
      products.sort((a, b) => b.minPrice - a.minPrice || a.id.localeCompare(b.id));
    } else {
      products.sort((a, b) => a.minPrice - b.minPrice || a.id.localeCompare(b.id));
    }
    const offset = query.offset ?? 0;
    return query.limit === undefined ? products.slice(offset) : products.slice(offset, offset + query.limit);
  }

  async findById(id: string): Promise<ProductCardDto | null> {
    const row = await this.prisma.canonicalProduct.findUnique({
      where: { id },
      include: {
        category: true,
        offers: { where: usableOffer, include: { store: true }, orderBy: { price: 'asc' } },
      },
    });
    return row ? mapProduct(row) : null;
  }
}
