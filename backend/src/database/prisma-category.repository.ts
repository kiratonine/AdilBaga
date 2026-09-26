import { Injectable } from '@nestjs/common';
import type { CategoryDto, FilterDefinitionDto, FilterSchemaDto } from '../contracts/catalog';
import type { CategoryRepository } from '../repositories';
import { scalarAttributes, usableOffer } from './prisma-mappers';
import { PrismaService } from './prisma.service';

function definitions(value: unknown): FilterDefinitionDto[] {
  if (!value || typeof value !== 'object' || !('filters' in value) ||
    !Array.isArray(value.filters)) return [];
  return value.filters.flatMap((item: unknown): FilterDefinitionDto[] => {
    if (!item || typeof item !== 'object' || !('key' in item) || !('label' in item) ||
      !('type' in item) || typeof item.key !== 'string' || typeof item.label !== 'string' ||
      (item.type !== 'multi-select' && item.type !== 'boolean')) return [];
    if (item.type === 'boolean') return [{ key: item.key, label: item.label, type: 'boolean' }];
    if (!('options' in item) || !Array.isArray(item.options)) return [];
    const options = item.options.filter((option: unknown): option is string | number | boolean =>
      typeof option === 'string' || typeof option === 'boolean' ||
      (typeof option === 'number' && Number.isFinite(option)));
    return [{ key: item.key, label: item.label, type: 'multi-select', options }];
  });
}

@Injectable()
export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<CategoryDto[]> {
    const rows = await this.prisma.category.findMany({ orderBy: { slug: 'asc' } });
    return rows.map(({ id, slug, name }) => ({ id, slug, name }));
  }

  async findFilters(slug: string): Promise<FilterSchemaDto | null> {
    const category = await this.prisma.category.findUnique({ where: { slug } });
    if (!category) return null;
    const schema = definitions(category.filterSchema);
    if (schema.length === 0) return { category: slug, filters: [] };

    // Backend 2's schema is the allowlist; discard stale options absent from usable products.
    const rows = await this.prisma.canonicalProduct.findMany({
      where: { categoryId: category.id, offers: { some: usableOffer } },
      select: { brand: true, attributes: true },
    });
    const filters = schema.flatMap((filter): FilterDefinitionDto[] => {
      const actual = new Set(rows.map((row) =>
        filter.key === 'brand' ? row.brand : scalarAttributes(row.attributes)[filter.key],
      ).filter((value) => value !== null && value !== undefined));
      if (actual.size === 0) return [];
      if (filter.type === 'boolean') return [filter];
      const options = filter.options?.filter((option) => actual.has(option)) ?? [];
      return options.length ? [{ ...filter, options }] : [];
    });
    return { category: slug, filters };
  }
}
