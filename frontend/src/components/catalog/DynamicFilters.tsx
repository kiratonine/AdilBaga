'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FilterDto, FilterValues } from '../../api/types'
import { formatAttributeValue } from '../../lib/attributes'
import { filterLabel } from '../../lib/dataLabels'
import { Chip } from '../ui/Chip'
import { Icon } from '../ui/Icon'

type Props = {
  filters: FilterDto[]
  values: FilterValues
  onChange: (key: string, values: string[]) => void
  /** Каждый фильтр — белая карточка (сайдбар на сером фоне); без него — просто блоки (шторка) */
  boxed?: boolean
}

/** С этого числа значений у фильтра появляется поиск, а список ограничен по высоте и прокручивается */
const SEARCHABLE_FROM = 13

/** Фильтры строятся только по schema бэка: какие ключи и значения показать, решает он */
export function DynamicFilters({ filters, values, onChange, boxed = false }: Props) {
  const { t } = useTranslation()

  return (
    <div className={`flex flex-col ${boxed ? 'gap-2' : 'gap-6'}`}>
      {filters.filter(hasChoices).map((filter) => {
        const selected = values[filter.key] ?? []
        const label = filterLabel(t, filter)

        return (
          // Карточка — обёртка: у <fieldset> легенда ложится на верхнюю границу и игнорирует padding
          <div key={filter.key} className={boxed ? 'rounded-card bg-card p-4' : ''}>
            <fieldset data-testid={`filter-${filter.key}`}>
              {filter.type === 'multi-select' ? (
                <>
                  <legend className="mb-2.5 text-sm font-semibold">{label}</legend>
                  <MultiSelectOptions
                    filter={filter}
                    label={label}
                    selected={selected}
                    onChange={(next) => onChange(filter.key, next)}
                  />
                </>
              ) : (
                // boolean: включённый чип = ?key=true, выключенный — фильтра нет
                <>
                  <legend className="sr-only">{label}</legend>
                  <Chip
                    pressed={selected.includes('true')}
                    onClick={() => onChange(filter.key, selected.includes('true') ? [] : ['true'])}
                  >
                    {label}
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

type OptionsProps = {
  filter: Extract<FilterDto, { type: 'multi-select' }>
  label: string
  selected: string[]
  onChange: (values: string[]) => void
}

/**
 * Чипы значений. Длинный список (бренды, граммовки — сотни значений) не растягивает страницу:
 * поле поиска + прокрутка внутри карточки. Выбранные значения видны всегда, даже если не подходят под поиск
 */
function MultiSelectOptions({ filter, label, selected, onChange }: OptionsProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const options = (filter.options ?? []).map((option) => ({
    value: String(option),
    text: formatAttributeValue(filter.key, option, t),
  }))
  const searchable = options.length >= SEARCHABLE_FROM
  const needle = normalize(query)
  const visible = needle
    ? options.filter((o) => selected.includes(o.value) || normalize(o.text).includes(needle))
    : options

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])

  const chips = (
    <div className="flex flex-wrap gap-2">
      {visible.map((option) => (
        <Chip
          key={option.value}
          pressed={selected.includes(option.value)}
          onClick={() => toggle(option.value)}
          className="tabular"
        >
          {option.text}
        </Chip>
      ))}
    </div>
  )

  if (!searchable) return chips

  return (
    <>
      <div className="relative mb-3">
        <Icon
          name="search"
          size={18}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('category.filterSearch')}
          aria-label={t('category.filterSearchLabel', { label })}
          data-testid={`filter-search-${filter.key}`}
          autoComplete="off"
          enterKeyHint="search"
          // 16px на мобильном — иначе iOS Safari зумит страницу при фокусе
          className="h-10 w-full rounded-control bg-surface pr-3 pl-9 text-base placeholder:text-muted focus:bg-card focus:outline-2 focus:outline-ink md:h-9 md:text-sm"
        />
      </div>
      {/* Отступ внутри и минус снаружи — чтобы рамка фокуса у крайних чипов не обрезалась прокруткой */}
      <div
        data-testid={`filter-options-${filter.key}`}
        className="-m-1 max-h-64 overflow-y-auto overscroll-contain p-1"
      >
        {visible.length > 0 ? chips : <p className="py-2 text-sm text-muted">{t('category.filterNoMatch')}</p>}
      </div>
    </>
  )
}

/** Регистр, «ё» и разделитель дроби не важны: «бурёнка» находит «БУРЕНКА», «1.5» — «1,5%» */
const normalize = (text: string) => text.trim().toLocaleLowerCase('ru').replaceAll('ё', 'е').replaceAll('.', ',')

/** Multi-select без options показывать нечего */
const hasChoices = (filter: FilterDto) => filter.type === 'boolean' || (filter.options?.length ?? 0) > 0
