// Снимок цен сделан в Актау, поэтому дату показываем в местном часовом поясе
const TIME_ZONE = 'Asia/Aqtau'

const priceFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

/** 1590 → «1 590 ₸» (с неразрывными пробелами) */
export function formatPrice(value: number): string {
  return `${priceFormatter.format(value)} ₸`
}

/** ISO → «24.09.2026» */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TIME_ZONE,
  }).format(new Date(iso))
}

const percentFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })

/** 34.1 → «34,1%» */
export function formatPercent(value: number): string {
  return `${percentFormatter.format(value)}%`
}
