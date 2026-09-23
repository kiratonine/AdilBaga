import { Controller, Get, Param } from '@nestjs/common';
import type { CategoryDto, FilterSchemaDto } from '../contracts/catalog';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  findAll(): Promise<CategoryDto[]> {
    return this.categories.findAll();
  }

  @Get(':slug/filters')
  findFilters(@Param('slug') slug: string): Promise<FilterSchemaDto> {
    return this.categories.findFilters(slug);
  }
}
