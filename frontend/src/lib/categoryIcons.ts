import type { IconName } from '../components/ui/Icon'

/**
 * Иконка плитки категории. Слаги — из моков и сида бэка; на что-то кроме иконки они не влияют,
 * поэтому новая категория без записи здесь просто получит корзинку
 */
const ICONS: Record<string, IconName> = {
  milk: 'milk',
  dairy: 'milk',
  bread: 'bread',
  eggs: 'egg',
  sugar: 'sugar',
  oil: 'oil',
  groats: 'wheat',
  vegetables: 'carrot',
  meat: 'drumstick',
}

export function categoryIcon(slug: string): IconName {
  return Object.hasOwn(ICONS, slug) ? ICONS[slug] : 'basket'
}
