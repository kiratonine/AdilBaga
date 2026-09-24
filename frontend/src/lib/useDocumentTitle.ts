import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

/** Заголовок вкладки: «<страница> — Adil Bağa»; без title — общий заголовок сайта. Меняется вместе с языком */
export function useDocumentTitle(title?: string) {
  const { t } = useTranslation()
  const full = title ? `${title} — ${t('brand.name')}` : t('brand.title')
  useEffect(() => {
    document.title = full
  }, [full])
}
