import { useTranslation } from 'react-i18next'
import { useSnapshotDate } from '../../api/queries'
import { formatDate } from '../../lib/format'

export function SnapshotBar() {
  const { t } = useTranslation()
  const snapshotAt = useSnapshotDate()

  return (
    <div className="border-b border-line">
      <div className="container-page flex h-9 items-center justify-between gap-4 text-[13px] text-muted">
        <p data-testid="snapshot-date" className="tabular">
          {snapshotAt ? t('snapshot.actualOn', { date: formatDate(snapshotAt) }) : ' '}
        </p>
        <p>{t('snapshot.city')}</p>
      </div>
    </div>
  )
}
