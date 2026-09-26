import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CategoryDto, FilterSchemaDto } from '../contracts/catalog';
import { CATEGORY_REPOSITORY, type CategoryRepository } from '../repositories';

@Injectable()
export class CategoriesService {
  constructor(@Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository) {}

  findAll(): Promise<CategoryDto[]> {
    return this.categories.findAll();
  }

  async findFilters(slug: string): Promise<FilterSchemaDto> {
    const schema = await this.categories.findFilters(slug);
    if (!schema) throw new NotFoundException('Category filter schema not found');
    return schema;
  }
}
