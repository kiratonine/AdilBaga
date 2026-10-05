'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useEffectEvent, useRef, useState, type FormEvent, type InputHTMLAttributes, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { useHref } from '../../lib/useLang'
import { Icon } from '../ui/Icon'

export const SEARCH_DEBOUNCE_MS = 350
/** Короче — слишком много случайных совпадений, ждём Enter */
const MIN_LIVE_QUERY = 2

export function SearchBox() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const href = useHref()
  const searchPath = href('/search')
  const onSearchPage = pathname === searchPath
  const urlQuery = onSearchPage ? (params.get('q') ?? '').trim() : ''
  const [value, setValue] = useState(urlQuery)
  const [syncedQuery, setSyncedQuery] = useState(urlQuery)

  // Синхронизация с URL (назад/вперёд в истории) — прямо во время рендера, без эффекта.
  // Если URL просто догнал набранный текст, ввод не трогаем (иначе съедим пробел в конце)
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery)
    if (urlQuery !== value.trim()) setValue(urlQuery)
  }

  // На /search заменяем запись в истории и сохраняем сортировку, с других страниц — обычный переход
  function goTo(q: string) {
    const next = new URLSearchParams(onSearchPage ? params.toString() : undefined)
    if (q) next.set('q', q)
    else next.delete('q')
    const search = next.toString()
    const url = search ? `${searchPath}?${search}` : searchPath
    if (onSearchPage) router.replace(url)
    else router.push(url)
  }
  // Effect Event: видит свежие params, но не перезапускает таймер при каждом рендере
  const goLive = useEffectEvent(goTo)

  // Поиск по мере ввода. Очистка поля на /search тоже обновляет URL
  const liveQuery = value.trim()
  const shouldGo =
    liveQuery !== urlQuery && (liveQuery.length >= MIN_LIVE_QUERY || (liveQuery === '' && onSearchPage))
  useEffect(() => {
    if (!shouldGo) return
    const timer = setTimeout(() => goLive(liveQuery), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [liveQuery, shouldGo])

  // Пришли на /search без запроса (таб «Поиск») — сразу в поле. Только при переходе внутри сайта:
  // при первой загрузке клавиатуру без действия пользователя не открываем
  const inputRef = useRef<HTMLInputElement>(null)
  const previousPath = useRef(pathname)
  useEffect(() => {
    if (previousPath.current === pathname) return
    previousPath.current = pathname
    if (onSearchPage && !urlQuery) inputRef.current?.focus()
  }, [pathname, onSearchPage, urlQuery])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (liveQuery && liveQuery !== urlQuery) goTo(liveQuery)
  }

  return <SearchField ref={inputRef} onSubmit={submit} value={value} onChange={(e) => setValue(e.target.value)} />
}

/**
 * Поле без логики — в HTML пререндера, пока SearchBox ждёт searchParams (они есть только в браузере).
 * Выглядит так же, поэтому подмена при гидрации незаметна
 */
export function SearchBoxFallback() {
  return <SearchField onSubmit={(e) => e.preventDefault()} defaultValue="" />
}

type FieldProps = Pick<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange'> & {
  onSubmit: (event: FormEvent) => void
  ref?: Ref<HTMLInputElement>
}

function SearchField({ onSubmit, ref, ...input }: FieldProps) {
  const { t } = useTranslation()

  return (
    <form role="search" onSubmit={onSubmit} className="relative w-full">
      <label htmlFor="site-search" className="sr-only">
        {t('search.label')}
      </label>
      <Icon name="search" size={20} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
      <input
        ref={ref}
        id="site-search"
        data-testid="search-input"
        type="search"
        {...input}
        placeholder={t('search.placeholder')}
        autoComplete="off"
        enterKeyHint="search"
        className="h-11 w-full rounded-control bg-surface pr-4 pl-10 text-[15px] placeholder:text-muted focus:bg-card focus:outline-2 focus:outline-ink"
      />
    </form>
  )
}
