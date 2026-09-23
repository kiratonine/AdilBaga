import { useTranslation } from 'react-i18next'

/** Временная страница для разделов из следующих сессий */
export function StubPage({ title }: { title: string }) {
  const { t } = useTranslation()
  return (
    <>
      <h1 className="text-[28px] leading-tight font-semibold">{title}</h1>
      <p className="mt-3 text-muted">{t('stub.soon')}</p>
    </>
  )
}
