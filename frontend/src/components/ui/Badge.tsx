import type { ReactNode } from 'react'

export type BadgeTone = 'discount' | 'best' | 'neutral'

// discount и best — про выгоду, поэтому зелёные; neutral — справочная пометка
const TONE: Record<BadgeTone, string> = {
  discount: 'bg-accent text-card',
  best: 'bg-accent-soft text-accent',
  neutral: 'bg-surface text-muted',
}

export function Badge({ tone, className = '', children }: { tone: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs leading-none font-semibold ${TONE[tone]} ${className}`.trim()}>
      {children}
    </span>
  )
}
