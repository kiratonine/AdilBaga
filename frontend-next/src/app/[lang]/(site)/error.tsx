'use client'

import { ErrorState } from '../../../components/ui/States'

// Сервер не получил данные от API (кроме 404 — это not-found). Шапка остаётся, повтор — без перезагрузки
export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState onRetry={retry} />
}
