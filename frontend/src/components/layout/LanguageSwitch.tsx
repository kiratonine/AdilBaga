import { useTranslation } from 'react-i18next'
import { LANGUAGES, setLanguage, type Language } from '../../i18n'

const LABELS: Record<Language, string> = { ru: 'Рус', kk: 'Қаз' }

export function LanguageSwitch() {
  const { t, i18n } = useTranslation()

  return (
    <div role="group" aria-label={t('nav.language')} className="flex rounded-[var(--radius-control)] bg-surface p-0.5">
      {LANGUAGES.map((lang) => {
        const active = i18n.resolvedLanguage === lang
        return (
          <button
            key={lang}
            type="button"
            lang={lang}
            aria-pressed={active}
            onClick={() => setLanguage(lang)}
            className={`h-9 rounded-[8px] px-2.5 text-sm font-medium transition-colors ${
              active ? 'bg-page text-ink shadow-[0_1px_2px_rgb(26_31_36/0.08)]' : 'text-muted hover:text-ink'
            }`}
          >
            {LABELS[lang]}
          </button>
        )
      })}
    </div>
  )
}
