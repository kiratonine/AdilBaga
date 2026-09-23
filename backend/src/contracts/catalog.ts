export interface CategoryDto {
  id: string;
  slug: string;
  name: string;
}

export interface FilterDefinitionDto {
  key: string;
  label: string;
  type: 'multi-select' | 'boolean';
  options?: Array<string | number | boolean>;
}

export interface FilterSchemaDto {
  category: string;
  filters: FilterDefinitionDto[];
}

export interface OfferDto {
  storeCode: 'DINA' | 'DANA' | 'FIX_PRICE';
  storeName: string;
  price: number;
  oldPrice: number | null;
}

export interface ProductCardDto {
  id: string;
  name: string;
  brand: string | null;
  category: Pick<CategoryDto, 'slug' | 'name'>;
  imageUrl: string | null;
  attributes: Record<string, string | number | boolean | null>;
  minPrice: number;
  offers: OfferDto[];
  snapshotAt: string;
}

export interface ProductQuery {
  category?: string;
  search?: string;
  sort?: 'price_asc' | 'price_desc' | 'name_asc';
  limit?: number;
  offset?: number;
  filters?: Record<string, Array<string | number | boolean>>;
}

export interface DashboardDto {
  summary: {
    canonicalProducts: number;
    stores: number;
    matchedAcrossStores: number;
    snapshotAt: string;
  };
  priceSpreads: Array<{
    productId: string;
    name: string;
    minPrice: number;
    maxPrice: number;
    differencePercent: number;
  }>;
  locations: Array<{
    storeCode: OfferDto['storeCode'];
    storeName: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  }>;
}
