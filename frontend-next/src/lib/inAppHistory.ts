'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { stripLanguage } from './paths'

// Был ли переход внутри сайта с момента загрузки вкладки: тогда «Назад» = history.back()
// (вернёт на прошлую страницу с её фильтрами), иначе пользователь пришёл извне и «назад» на сайте некуда
let entryPath: string | undefined
let navigated = false

/** Вызывается один раз в Providers. Смена языка — та же страница, переходом не считается */
export function useTrackInAppNavigation() {
  const pathname = usePathname()
  useEffect(() => {
    const path = stripLanguage(pathname)
    if (entryPath === undefined) entryPath = path
    else if (path !== entryPath) navigated = true
  }, [pathname])
}

export const hasInAppHistory = () => navigated

/** Для тестов */
export function resetInAppHistory(value = false) {
  entryPath = undefined
  navigated = value
}
