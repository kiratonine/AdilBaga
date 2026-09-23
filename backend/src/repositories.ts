import type {
  CategoryDto,
  DashboardDto,
  FilterSchemaDto,
  ProductCardDto,
  ProductQuery,
} from './contracts/catalog';

export interface ProductRepository {
  findProducts(query: ProductQuery): Promise<ProductCardDto[]>;
  findById(id: string): Promise<ProductCardDto | null>;
}

export interface CategoryRepository {
  findAll(): Promise<CategoryDto[]>;
  findFilters(slug: string): Promise<FilterSchemaDto | null>;
}

export interface DashboardRepository {
  getDashboard(): Promise<DashboardDto>;
}

export const PRODUCT_REPOSITORY = Symbol('ProductRepository');
export const CATEGORY_REPOSITORY = Symbol('CategoryRepository');
export const DASHBOARD_REPOSITORY = Symbol('DashboardRepository');
