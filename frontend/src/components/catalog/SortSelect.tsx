import { useTranslation } from 'react-i18next'
import type { SortValue } from '../../api/types'
import { SORT_VALUES } from '../../lib/filterParams'

export function SortSelect({ value, onChange }: { value: SortValue; onChange: (value: SortValue) => void }) {
  const { t } = useTranslation()
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only text-muted sm:not-sr-only">{t('sort.label')}</span>
      <select
        data-testid="sort-select"
        value={value}
        onChange={(e) => onChange(e.target.value as SortValue)}
        className="h-9 cursor-pointer rounded-[var(--radius-control)] border border-line bg-page pr-8 pl-3 font-medium"
      >
        {SORT_VALUES.map((sort) => (
          <option key={sort} value={sort}>
            {t(`sort.${sort}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
