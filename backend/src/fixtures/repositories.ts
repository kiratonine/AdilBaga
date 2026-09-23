import { Injectable } from '@nestjs/common';
import type {
  CategoryDto,
  DashboardDto,
  FilterSchemaDto,
  ProductCardDto,
  ProductQuery,
} from '../contracts/catalog';
import type {
  CategoryRepository,
  DashboardRepository,
  ProductRepository,
} from '../repositories';

const snapshotAt = '2026-09-23T09:00:00.000Z';

const categories: CategoryDto[] = [
  { id: 'bd82bf16-270e-4aa8-b78e-3981efb7eac2', slug: 'milk', name: 'Молоко' },
];

const milkFilters: FilterSchemaDto = {
  category: 'milk',
  filters: [
    { key: 'volumeMl', label: 'Объём', type: 'multi-select', options: [500, 1000] },
    { key: 'fatPercent', label: 'Жирность', type: 'multi-select', options: [2.5, 3.2] },
  ],
};

// Fixtures are illustrative contract data, not the verified Aktau snapshot.
const products: ProductCardDto[] = [
  {
    id: '2358a413-8c03-4e59-baad-7675045b97bb',
    name: 'Молоко FoodMaster 3.2% 1 л',
    brand: 'FoodMaster',
    category: { slug: 'milk', name: 'Молоко' },
    imageUrl: null,
    attributes: { volumeMl: 1000, fatPercent: 3.2 },
    minPrice: 570,
    offers: [
      { storeCode: 'DINA', storeName: 'Dina', price: 570, oldPrice: null },
      { storeCode: 'DANA', storeName: 'Dana', price: 620, oldPrice: 650 },
    ],
    snapshotAt,
  },
  {
    id: 'c6381f7d-b66a-445a-bbe6-3e56670656c2',
    name: 'Молоко Адал 2.5% 500 мл',
    brand: 'Адал',
    category: { slug: 'milk', name: 'Молоко' },
    imageUrl: 'https://example.com/fixtures/milk-adal.jpg',
    attributes: { volumeMl: 500, fatPercent: 2.5 },
    minPrice: 390,
    offers: [
      { storeCode: 'DANA', storeName: 'Dana', price: 390, oldPrice: null },
      { storeCode: 'DINA', storeName: 'Dina', price: 420, oldPrice: null },
    ],
    snapshotAt,
  },
];

@Injectable()
export class FixtureProductRepository implements ProductRepository {
  async findProducts(_query: ProductQuery): Promise<ProductCardDto[]> {
    // Search, filters and sorting belong to Part 02.
    return products;
  }

  async findById(id: string): Promise<ProductCardDto | null> {
    return products.find((product) => product.id === id) ?? null;
  }
}

@Injectable()
export class FixtureCategoryRepository implements CategoryRepository {
  async findAll(): Promise<CategoryDto[]> {
    return categories;
  }

  async findFilters(slug: string): Promise<FilterSchemaDto | null> {
    return slug === 'milk' ? milkFilters : null;
  }
}

@Injectable()
export class FixtureDashboardRepository implements DashboardRepository {
  async getDashboard(): Promise<DashboardDto> {
    return {
      summary: {
        canonicalProducts: 2,
        stores: 2,
        matchedAcrossStores: 2,
        snapshotAt,
      },
      priceSpreads: [],
      locations: [],
    };
  }
}
