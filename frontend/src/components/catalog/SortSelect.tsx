'use client'

import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SortValue } from '../../api/types'
import { SORT_VALUES } from '../../lib/filterParams'
import { Chip } from '../ui/Chip'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'

type Props = { value: SortValue; onChange: (value: SortValue) => void; className?: string }

/** ≥ md — нативный <select>; на мобильном — чип с текущим вариантом, список в шторке */
export function SortSelect({ value, onChange, className = '' }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const name = useId()

  return (
    <div className={className}>
      <label className="relative hidden items-center gap-2 text-sm md:flex">
        <span className="text-muted">{t('sort.label')}</span>
        <select
          data-testid="sort-select"
          value={value}
          onChange={(e) => onChange(e.target.value as SortValue)}
          className="h-9 cursor-pointer appearance-none rounded-full bg-card pr-9 pl-3.5 font-medium shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_rgb(26_31_36/0.5)]"
        >
          {SORT_VALUES.map((sort) => (
            <option key={sort} value={sort}>
              {t(`sort.${sort}`)}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size={16} className="pointer-events-none absolute right-3" />
      </label>

      <Chip testId="sort-chip" aria-haspopup="dialog" onClick={() => setOpen(true)} className="md:hidden">
        <span className="sr-only">{t('sort.label')}: </span>
        {t(`sort.${value}`)}
        <Icon name="chevron-down" size={16} />
      </Chip>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('sort.label')} testId="sort-sheet">
        <fieldset>
          <legend className="sr-only">{t('sort.label')}</legend>
          {SORT_VALUES.map((sort) => (
            <label
              key={sort}
              className="flex h-12 cursor-pointer items-center justify-between gap-3 border-b border-line last:border-b-0"
            >
              {t(`sort.${sort}`)}
              <input
                type="radio"
                name={name}
                value={sort}
                checked={sort === value}
                onChange={() => {
                  onChange(sort)
                  setOpen(false)
                }}
                className="size-5 accent-ink"
              />
            </label>
          ))}
        </fieldset>
      </Sheet>
    </div>
  )
}
