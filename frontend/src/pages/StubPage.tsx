import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'

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

// Заглушки заменяются реальными страницами в сессиях 3–4
export function SearchStub() {
  const [params] = useSearchParams()
  return <StubPage title={`«${params.get('q') ?? ''}»`} />
}

export function ProductStub() {
  const { id } = useParams()
  return <StubPage title={`/products/${id}`} />
}
