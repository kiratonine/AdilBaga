import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { FilterDto, FilterValues } from '../../api/types'
import { formatAttributeValue } from '../../lib/attributes'

type Props = {
  filters: FilterDto[]
  values: FilterValues
  onChange: (key: string, values: string[]) => void
}

/** Фильтры строятся только по schema бэка: какие ключи и значения показать, решает он */
export function DynamicFilters({ filters, values, onChange }: Props) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      {filters.map((filter) => {
        const selected = values[filter.key] ?? []
        const toggle = (value: string) =>
          onChange(filter.key, selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])

        return (
          <fieldset key={filter.key} data-testid={`filter-${filter.key}`}>
            {filter.type === 'multi-select' ? (
              <>
                <legend className="mb-2.5 text-sm font-semibold">{filter.label}</legend>
                <div className="flex flex-wrap gap-2">
                  {filter.options.map((option) => {
                    const value = String(option)
                    return (
                      <Chip key={value} pressed={selected.includes(value)} onClick={() => toggle(value)}>
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
        )
      })}
    </div>
  )
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex h-9 items-center rounded-full border px-3.5 text-sm tabular transition-colors ${
        pressed ? 'border-ink bg-ink text-page' : 'border-line text-ink hover:border-ink/50'
      }`}
    >
      {children}
    </button>
  )
}
