'use client'

import { useTranslation } from 'react-i18next'
import type { FilterDto, FilterValues } from '../../api/types'
import { formatAttributeValue } from '../../lib/attributes'
import { Chip } from '../ui/Chip'

type Props = {
  filters: FilterDto[]
  values: FilterValues
  onChange: (key: string, values: string[]) => void
  /** Каждый фильтр — белая карточка (сайдбар на сером фоне); без него — просто блоки (шторка) */
  boxed?: boolean
}

/** Фильтры строятся только по schema бэка: какие ключи и значения показать, решает он */
export function DynamicFilters({ filters, values, onChange, boxed = false }: Props) {
  const { t } = useTranslation()

  return (
    <div className={`flex flex-col ${boxed ? 'gap-2' : 'gap-6'}`}>
      {filters.filter(hasChoices).map((filter) => {
        const selected = values[filter.key] ?? []
        const toggle = (value: string) =>
          onChange(filter.key, selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])

        return (
          // Карточка — обёртка: у <fieldset> легенда ложится на верхнюю границу и игнорирует padding
          <div key={filter.key} className={boxed ? 'rounded-card bg-card p-4' : ''}>
            <fieldset data-testid={`filter-${filter.key}`}>
              {filter.type === 'multi-select' ? (
                <>
                  <legend className="mb-2.5 text-sm font-semibold">{filter.label}</legend>
                  <div className="flex flex-wrap gap-2">
                    {(filter.options ?? []).map((option) => {
                      const value = String(option)
                      return (
                        <Chip
                          key={value}
                          pressed={selected.includes(value)}
                          onClick={() => toggle(value)}
                          className="tabular"
                        >
                          {formatAttributeValue(filter.key, option, t)}
                        </Chip>
                      )
                    })}
                  </div>
                </>
              ) : (
                // boolean: включённый чип = ?key=true, выключенный — фильтра нет
                <>
                  <legend className="sr-only">{filter.label}</legend>
                  <Chip
                    pressed={selected.includes('true')}
                    onClick={() => onChange(filter.key, selected.includes('true') ? [] : ['true'])}
                  >
                    {filter.label}
                  </Chip>
                </>
              )}
            </fieldset>
          </div>
        )
      })}
    </div>
  )
}

/** Multi-select без options показывать нечего */
const hasChoices = (filter: FilterDto) => filter.type === 'boolean' || (filter.options?.length ?? 0) > 0
