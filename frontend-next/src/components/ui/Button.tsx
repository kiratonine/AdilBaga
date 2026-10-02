import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

const BASE =
  'inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-[18px] text-[15px] font-medium transition-colors disabled:cursor-default disabled:opacity-60'

// Основная — графит: зелёный в дизайн-коде только для выгоды
const LOOK: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-card hover:bg-ink/85',
  secondary: 'bg-card text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-ink)]',
  ghost: 'text-ink hover:bg-surface',
}

/** Классы кнопки — для элементов, которые рендерит не Button */
export function buttonClass(variant: ButtonVariant = 'secondary', className = '') {
  return `${BASE} ${LOOK[variant]} ${className}`.trim()
}

type Common = {
  variant?: ButtonVariant
  className?: string
  testId?: string
  children: ReactNode
}

type AsButton = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & { href?: undefined }
type AsLink = Common & { href: string; prefetch?: boolean }

export function Button(props: AsButton | AsLink) {
  if (props.href !== undefined) {
    const { href, prefetch, variant, className, testId, children } = props
    return (
      <Link href={href} prefetch={prefetch} data-testid={testId} className={buttonClass(variant, className)}>
        {children}
      </Link>
    )
  }
  const { variant, className, testId, children, type = 'button', ...rest } = props
  return (
    <button type={type} data-testid={testId} className={buttonClass(variant, className)} {...rest}>
      {children}
    </button>
  )
}
