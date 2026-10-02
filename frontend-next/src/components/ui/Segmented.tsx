import type { ReactNode } from 'react'

/** Переключатель-таблетка (RU/KZ). Сегменты — любые элементы с segmentClass */
export function Segmented({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={`flex rounded-full bg-surface p-0.5 ${className}`.trim()}>
      {children}
    </div>
  )
}

export function segmentClass(active: boolean) {
  return `flex h-9 items-center rounded-full px-3 text-sm font-medium transition-colors ${
    active ? 'bg-card text-ink shadow-[0_1px_2px_rgb(26_31_36/0.08)]' : 'text-muted hover:text-ink'
  }`
}
