import type { TFunction } from 'i18next'
import type { CategoryRefDto, FilterDto } from '../api/types'

// Бэк отдаёт названия категорий и подписи фильтров только по-русски (nameKk нет). Перевод — в словаре
// по слагу/ключу (`data.category.*`, `data.filter.*`, есть только в kk.json); нет перевода — текст бэка как есть.
// Новая категория или фильтр на бэке не ломают UI, просто останутся по-русски, пока не добавим строку

export function categoryName(t: TFunction, category: CategoryRefDto): string {
  return t(`data.category.${category.slug}`, { defaultValue: category.name })
}

export function filterLabel(t: TFunction, filter: Pick<FilterDto, 'key' | 'label'>): string {
  return t(`data.filter.${filter.key}`, { defaultValue: filter.label })
}
