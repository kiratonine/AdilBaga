import type { FilterDto, FilterValues, SortValue } from '../api/types'

export const SORT_VALUES: SortValue[] = ['price_asc', 'price_desc', 'name_asc']
export const DEFAULT_SORT: SortValue = 'price_asc'

/** Состояние фильтров живёт в URL. Берём только ключи из schema бэка — лишние параметры игнорируем */
export function readFilters(params: URLSearchParams, filters: FilterDto[]): FilterValues {
  const values: FilterValues = {}
  for (const filter of filters) {
    const raw = params.getAll(filter.key)
    const picked =
      filter.type === 'boolean'
        ? raw.filter((v) => v === 'true' || v === 'false').slice(0, 1)
        : raw.filter((v) => filter.options.some((option) => String(option) === v))
    if (picked.length > 0) values[filter.key] = [...new Set(picked)]
  }
  return values
}

/** Неизвестный sort бэк отвечает 400, поэтому невалидное значение из URL заменяем дефолтом */
export function readSort(params: URLSearchParams): SortValue {
  const sort = params.get('sort')
  return SORT_VALUES.includes(sort as SortValue) ? (sort as SortValue) : DEFAULT_SORT
}

export function countActive(values: FilterValues): number {
  return Object.values(values).reduce((sum, list) => sum + list.length, 0)
}

/** Новый набор параметров: заменяет значения одного фильтра, остальное сохраняет */
export function withFilter(params: URLSearchParams, key: string, values: string[]): URLSearchParams {
  const next = new URLSearchParams(params)
  next.delete(key)
  for (const value of values) next.append(key, value)
  return next
}

export function withoutFilters(params: URLSearchParams, filters: FilterDto[]): URLSearchParams {
  const next = new URLSearchParams(params)
  for (const filter of filters) next.delete(filter.key)
  return next
}

export function withSort(params: URLSearchParams, sort: SortValue): URLSearchParams {
  const next = new URLSearchParams(params)
  if (sort === DEFAULT_SORT) next.delete('sort')
  else next.set('sort', sort)
  return next
}
