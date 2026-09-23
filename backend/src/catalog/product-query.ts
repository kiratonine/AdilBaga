import { BadRequestException } from '@nestjs/common';
import type { FilterDefinitionDto, ProductQuery } from '../contracts/catalog';

const standardKeys = new Set(['category', 'search', 'sort', 'limit', 'offset']);
const sorts = new Set(['price_asc', 'price_desc', 'name_asc']);

function scalar(value: unknown, key: string): string {
  if (typeof value !== 'string') throw new BadRequestException(`${key} must be a single string`);
  return value;
}

function integer(value: unknown, key: string, minimum: number): number | undefined {
  if (value === undefined) return undefined;
  const input = scalar(value, key);
  if (!/^\d+$/u.test(input)) throw new BadRequestException(`${key} must be an integer`);
  const parsed = Number(input);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new BadRequestException(`${key} must be an integer >= ${minimum}`);
  }
  return parsed;
}

function parseFilterValue(input: string, filter: FilterDefinitionDto): string | number | boolean {
  const options = filter.options ?? [];
  let parsed: string | number | boolean;
  if (filter.type === 'boolean' || typeof options[0] === 'boolean') {
    if (input !== 'true' && input !== 'false') throw new BadRequestException(`Invalid ${filter.key} value`);
    parsed = input === 'true';
  } else if (typeof options[0] === 'number') {
    if (!/^-?\d+(?:\.\d+)?$/u.test(input)) throw new BadRequestException(`Invalid ${filter.key} value`);
    parsed = Number(input);
    if (!Number.isFinite(parsed)) throw new BadRequestException(`Invalid ${filter.key} value`);
  } else {
    parsed = input;
  }
  if (options.length > 0 && !options.includes(parsed)) {
    throw new BadRequestException(`Invalid ${filter.key} value`);
  }
  return parsed;
}

export function parseProductQuery(
  raw: Record<string, unknown>,
  definitions: FilterDefinitionDto[],
): ProductQuery {
  const category = raw.category === undefined ? undefined : scalar(raw.category, 'category').trim();
  const search = raw.search === undefined ? undefined : scalar(raw.search, 'search').trim();
  const sort = raw.sort === undefined ? 'price_asc' : scalar(raw.sort, 'sort');
  if (!sorts.has(sort)) throw new BadRequestException('Invalid sort');

  const filters: NonNullable<ProductQuery['filters']> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (standardKeys.has(key)) continue;
    if (!category) throw new BadRequestException('Dynamic filters require a category');
    const definition = definitions.find((item) => item.key === key);
    if (!definition) throw new BadRequestException(`Unknown filter: ${key}`);
    const inputs = Array.isArray(value) ? value : [value];
    filters[key] = inputs.map((input) => parseFilterValue(scalar(input, key), definition));
  }

  return {
    category: category || undefined,
    search: search || undefined,
    sort: sort as NonNullable<ProductQuery['sort']>,
    limit: integer(raw.limit, 'limit', 1),
    offset: integer(raw.offset, 'offset', 0) ?? 0,
    filters,
  };
}
