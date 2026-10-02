import type { ButtonHTMLAttributes } from 'react'

/** Таблетка фильтра/сортировки. 40px на мобильном (палец), 36px с md */
export function chipClass(pressed = false, className = '') {
  const look = pressed
    ? 'bg-ink text-card'
    : 'bg-card text-ink shadow-[inset_0_0_0_1px_var(--color-line)] not-disabled:hover:shadow-[inset_0_0_0_1px_rgb(26_31_36/0.5)]'
  return `inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors disabled:cursor-default disabled:opacity-50 md:h-9 ${look} ${className}`.trim()
}

type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  /** Передан — чип-переключатель с aria-pressed; не передан — просто кнопка-таблетка */
  pressed?: boolean
  className?: string
  testId?: string
}

export function Chip({ pressed, className, testId, type = 'button', children, ...rest }: ChipProps) {
  return (
    <button type={type} aria-pressed={pressed} data-testid={testId} className={chipClass(pressed, className)} {...rest}>
      {children}
    </button>
  )
}
