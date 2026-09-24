import { Injectable } from '@nestjs/common';
import type {
  CategoryDto,
  DashboardDto,
  FilterSchemaDto,
  ProductCardDto,
  ProductQuery,
} from '../contracts/catalog';
import { normalizeProduct } from '../catalog/product-card';
import type {
  CategoryRepository,
  DashboardRepository,
  ProductRepository,
  StoreLocationRepository,
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
    imageUrl: null,
    attributes: { volumeMl: 500, fatPercent: 2.5 },
    minPrice: 390,
    offers: [
      { storeCode: 'DANA', storeName: 'Dana', price: 390, oldPrice: null },
      { storeCode: 'DINA', storeName: 'Dina', price: 420, oldPrice: null },
    ],
    snapshotAt,
  },
];

// Illustrative points near Aktau, not verified store addresses.
const locations: DashboardDto['locations'] = [
  {
    storeCode: 'DINA',
    storeName: 'Dina',
    name: 'Dina — демо-точка',
    address: 'Актау, демонстрационный адрес (не проверен)',
    latitude: 43.635,
    longitude: 51.169,
  },
  {
    storeCode: 'DANA',
    storeName: 'Dana',
    name: 'Dana — демо-точка',
    address: 'Актау, демонстрационный адрес (не проверен)',
    latitude: 43.645,
    longitude: 51.181,
  },
];

@Injectable()
export class FixtureProductRepository implements ProductRepository {
  async findProducts(query: ProductQuery): Promise<ProductCardDto[]> {
    const search = query.search?.toLocaleLowerCase();
    const filtered = products
      .filter((product) => !query.category || product.category.slug === query.category)
      .filter((product) => !search || product.name.toLocaleLowerCase().includes(search))
      .filter((product) => Object.entries(query.filters ?? {}).every(([key, values]) =>
        values.includes(product.attributes[key] as string | number | boolean),
      ))
      .map(normalizeProduct);

    if (query.sort === 'name_asc') {
      filtered.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    } else if (query.sort === 'price_desc') {
      filtered.sort((a, b) => b.minPrice - a.minPrice);
    } else {
      filtered.sort((a, b) => a.minPrice - b.minPrice);
    }
    const offset = query.offset ?? 0;
    return query.limit === undefined
      ? filtered.slice(offset)
      : filtered.slice(offset, offset + query.limit);
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
    const matched = products.filter((product) =>
      new Set(product.offers.map((offer) => offer.storeCode)).size >= 2,
    );
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
    }).sort((a, b) => b.differencePercent - a.differencePercent);

    return {
      summary: {
        canonicalProducts: products.length,
        stores: new Set(locations.map((location) => location.storeCode)).size,
        matchedAcrossStores: matched.length,
        snapshotAt: products.reduce((latest, product) =>
          product.snapshotAt > latest ? product.snapshotAt : latest, products[0]?.snapshotAt ?? snapshotAt),
      },
      priceSpreads,
      locations,
    };
  }
}

@Injectable()
export class FixtureStoreLocationRepository implements StoreLocationRepository {
  async findByStoreCode(storeCode: DashboardDto['locations'][number]['storeCode']) {
    return locations.filter((location) => location.storeCode === storeCode);
  }
}
