import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ProductCardDto } from '../contracts/catalog';
import {
  CATEGORY_REPOSITORY,
  PRODUCT_REPOSITORY,
  type CategoryRepository,
  type ProductRepository,
} from '../repositories';
import { normalizeProduct } from './product-card';
import { parseProductQuery } from './product-query';

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository,
  ) {}

  async findAll(raw: Record<string, unknown>): Promise<ProductCardDto[]> {
    const category = typeof raw.category === 'string' ? raw.category.trim() : undefined;
    const schema = category ? await this.categories.findFilters(category) : null;
    const query = parseProductQuery(raw, schema?.filters ?? []);
    return (await this.products.findProducts(query)).map(normalizeProduct);
  }

  async findById(id: string): Promise<ProductCardDto> {
    const product = await this.products.findById(id);
    if (!product) throw new NotFoundException('Product not found');
    return normalizeProduct(product);
  }
}
