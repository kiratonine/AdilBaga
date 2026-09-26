import type { FilterDefinitionDto } from '../../contracts/catalog';
import type { NlpParseInput, ParsedVoiceQuery, VoiceFilterValue } from '../voice-types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validFilter(value: VoiceFilterValue, definition: FilterDefinitionDto): boolean {
  if (value === null) return true;
  const options = definition.options ?? [];
  if (definition.type === 'boolean') {
    return typeof value === 'boolean' && (options.length === 0 || options.includes(value));
  }
  if (options.length === 0) return false;
  const optionType = typeof options[0];
  return typeof value === optionType &&
    (typeof value !== 'number' || Number.isFinite(value)) &&
    options.includes(value);
}

export function validateNlpResult(value: unknown, input: NlpParseInput): ParsedVoiceQuery | null {
  if (!isRecord(value) || Object.keys(value).some((key) =>
    !['intent', 'category', 'filters'].includes(key))) return null;

  const intent = value.intent;
  const category = value.category;
  const filters = value.filters;
  if (intent !== null && intent !== 'cheapest' && intent !== 'search') return null;
  if (category !== null &&
    (typeof category !== 'string' || !input.categories.some((item) => item.slug === category))) return null;
  if (!isRecord(filters)) return null;

  const selectedCategory = category ?? input.currentCategory;
  const schema = input.schemas.find((item) => item.category === selectedCategory);
  const parsedFilters: Record<string, VoiceFilterValue> = {};
  for (const [key, filterValue] of Object.entries(filters)) {
    const definition = schema?.filters.find((item) => item.key === key);
    if (!definition || !(
      filterValue === null || typeof filterValue === 'string' ||
      typeof filterValue === 'number' || typeof filterValue === 'boolean'
    ) || !validFilter(filterValue, definition)) return null;
    parsedFilters[key] = filterValue;
  }
  return { intent, category, filters: parsedFilters };
}
