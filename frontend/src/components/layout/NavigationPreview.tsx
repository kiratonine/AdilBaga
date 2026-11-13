'use client'

import { usePathname } from 'next/navigation'
import { type ReactNode, useEffect, useState } from 'react'
import { clickTarget, previewRoute, type PreviewRoute } from '../../lib/navigationPreview'
import { CatalogPageLoading } from '../../views/CatalogPage'
import { CategoryPageLoading } from '../../views/CategoryPage'
import { DashboardPageLoading } from '../../views/DashboardPage'
import { ProductPagePreview } from '../../views/ProductPage'
import { SzptPageLoading } from '../../views/SzptPage'

/** На быстрой сети страница приходит раньше — заглушку не показываем, чтобы не мигала */
export const PREVIEW_DELAY = 120

type Pending = { from: string; to: string; route: PreviewRoute }

/**
 * Мгновенный отклик на переход. Страницы рендерит сервер (в HTML — данные, у неизвестного товара — честный 404),
 * поэтому на слабой сети ответ идёт долго. Чтобы нажатие не выглядело зависанием, сразу после клика по ссылке
 * на месте страницы показываем будущую: товар из списка — уже с названием и ценами, остальное — скелетоном.
 * Текущая страница остаётся смонтированной (скрыта): если переход не состоится, её состояние не потеряется.
 * Заглушка уходит, как только Next сменил адрес; «Назад» в браузере во время ожидания её тоже снимает
 */
export function NavigationPreview({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [pending, setPending] = useState<Pending | null>(null)
  const [visible, setVisible] = useState<Pending | null>(null)

  // Адрес сменился — новая страница на месте, заглушка не нужна (сброс во время рендера, без лишнего кадра)
  const [seenPath, setSeenPath] = useState(pathname)
  if (seenPath !== pathname) {
    setSeenPath(pathname)
    setPending(null)
    setVisible(null)
  }

  useEffect(() => {
    // Capture: next/link сам вызывает preventDefault, на всплытии обычный клик от отменённого не отличить
    const onClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(anchor instanceof HTMLAnchorElement)) return
      const to = clickTarget(event, anchor, new URL(window.location.href))
      const route = to ? previewRoute(to) : null
      setPending(to && route ? { from: window.location.pathname, to, route } : null)
    }
    const cancel = () => {
      setPending(null)
      setVisible(null)
    }
    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', cancel)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', cancel)
    }
  }, [])

  useEffect(() => {
    if (!pending) return
    const timer = setTimeout(() => {
      setVisible(pending)
      // Нажали внизу длинного списка — заглушку показываем с начала, как и будущую страницу
      window.scrollTo({ top: 0 })
    }, PREVIEW_DELAY)
    return () => clearTimeout(timer)
  }, [pending])

  const shown = visible !== null && visible === pending && visible.from === pathname
  return (
    <>
      <div hidden={shown}>
        {children}
      </div>
      {shown && (
        <div data-testid="navigation-preview">
          <Preview route={visible.route} />
        </div>
      )}
    </>
  )
}

function Preview({ route }: { route: PreviewRoute }) {
  switch (route.kind) {
    case 'product':
      return <ProductPagePreview id={route.id} />
    case 'category':
      return <CategoryPageLoading slug={route.slug} />
    case 'catalog':
      return <CatalogPageLoading />
    case 'dashboard':
      return <DashboardPageLoading />
    case 'szpt':
      return <SzptPageLoading />
  }
}
