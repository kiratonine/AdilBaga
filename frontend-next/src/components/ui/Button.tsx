import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'md' | 'icon'

const BASE =
  'inline-flex items-center justify-center gap-2 text-[15px] font-medium transition-colors disabled:cursor-default disabled:opacity-60'

// Размер: icon — круглая кнопка 44px под иконку (нужен aria-label)
const SIZE: Record<ButtonSize, string> = {
  md: 'h-11 px-[18px] rounded-[var(--radius-control)]',
  icon: 'size-11 rounded-full p-0',
}

// Основная — графит: зелёный в дизайн-коде только для выгоды
const LOOK: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-card not-disabled:hover:bg-ink/85',
  secondary: 'bg-card text-ink shadow-[inset_0_0_0_1px_var(--color-line)] not-disabled:hover:shadow-[inset_0_0_0_1px_var(--color-ink)]',
  ghost: 'text-ink not-disabled:hover:bg-surface',
}

/** Классы кнопки — для элементов, которые рендерит не Button. className не перебивает BASE/размер — для формы есть size */
export function buttonClass(variant: ButtonVariant = 'secondary', className = '', size: ButtonSize = 'md') {
  return `${BASE} ${SIZE[size]} ${LOOK[variant]} ${className}`.trim()
}

type Common = {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  testId?: string
  children: ReactNode
}

type AsButton = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & { href?: undefined }
type AsLink = Common & { href: string; prefetch?: boolean }

export function Button(props: AsButton | AsLink) {
  if (props.href !== undefined) {
    const { href, prefetch, variant, size, className, testId, children } = props
    return (
      <Link href={href} prefetch={prefetch} data-testid={testId} className={buttonClass(variant, className, size)}>
        {children}
      </Link>
    )
  }
  const { variant, size, className, testId, children, type = 'button', ...rest } = props
  return (
    <button type={type} data-testid={testId} className={buttonClass(variant, className, size)} {...rest}>
      {children}
    </button>
  )
}
