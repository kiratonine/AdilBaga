import type { StoreCode, StoreLocationDto } from '../api/types'

/**
 * Цвета сетей на карте. Категориальная палитра (синий, оранжевый, фиолетовый) проверена
 * на различимость при дальтонизме; зелёный не используем — он в UI значит «здесь дешевле».
 */
const STORE_COLORS: Record<StoreCode, string> = {
  DINA: '#2a78d6',
  DANA: '#eb6834',
  FIX_PRICE: '#4a3aa7',
}

/** Сеть, которую бэк добавит позже, без своего цвета — нейтральный серый */
const FALLBACK_COLOR = '#697178'

export function storeColor(code: string): string {
  return STORE_COLORS[code as StoreCode] ?? FALLBACK_COLOR
}

/** У точки пока нет id в контракте — ключ из сети и адреса */
export function locationKey(location: StoreLocationDto): string {
  return `${location.storeCode}:${location.address}`
}

export type StoreGroup = {
  storeCode: StoreCode
  storeName: string
  locations: StoreLocationDto[]
}

/** Точки по сетям в порядке первого появления в ответе — порядок и цвет не зависят от числа точек */
export function groupByStore(locations: StoreLocationDto[]): StoreGroup[] {
  const groups = new Map<string, StoreGroup>()
  for (const location of locations) {
    const group = groups.get(location.storeCode)
    if (group) group.locations.push(location)
    else groups.set(location.storeCode, { storeCode: location.storeCode, storeName: location.storeName, locations: [location] })
  }
  return [...groups.values()]
}
