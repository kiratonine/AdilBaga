'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { LANGUAGE_COOKIE, LANGUAGES, type Language } from '../../i18n'
import { switchLanguagePath } from '../../lib/paths'
import { useLang } from '../../lib/useLang'

const LABELS: Record<Language, string> = { ru: 'Рус', kk: 'Қаз' }
const YEAR_SECONDS = 60 * 60 * 24 * 365

/** Запоминаем выбор: с `/` proxy поведёт сразу на этот язык */
function rememberLanguage(lang: Language) {
  document.cookie = `${LANGUAGE_COOKIE}=${lang}; path=/; max-age=${YEAR_SECONDS}; samesite=lax`
}

/** Обычные ссылки на ту же страницу с другим префиксом — их видит и поисковик */
export function LanguageSwitch() {
  const { t } = useTranslation()
  const current = useLang()
  const pathname = usePathname()
  const router = useRouter()

  function choose(event: MouseEvent<HTMLAnchorElement>, lang: Language, href: string) {
    rememberLanguage(lang)
    // Фильтры и запрос поиска переносим на другой язык (в href их нет, чтобы не читать searchParams при пререндере)
    const { search } = window.location
    if (search && !event.defaultPrevented && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      router.push(href + search)
    }
  }

  return (
    <div role="group" aria-label={t('nav.language')} className="flex rounded-[var(--radius-control)] bg-surface p-0.5">
      {LANGUAGES.map((lang) => {
        const active = lang === current
        const href = switchLanguagePath(pathname, lang)
        return (
          <Link
            key={lang}
            href={href}
            lang={lang}
            hrefLang={lang}
            // Язык меняют редко — не предзагружаем каждую страницу на втором языке
            prefetch={false}
            aria-current={active ? 'true' : undefined}
            onClick={(event) => choose(event, lang, href)}
            className={`flex h-9 items-center rounded-[8px] px-2.5 text-sm font-medium transition-colors ${
              active ? 'bg-page text-ink shadow-[0_1px_2px_rgb(26_31_36/0.08)]' : 'text-muted hover:text-ink'
            }`}
          >
            {LABELS[lang]}
          </Link>
        )
      })}
    </div>
  )
}
