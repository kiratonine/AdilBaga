import type { ReactNode } from 'react'

/** Линейные иконки 24×24, stroke 2, цвет — currentColor */
const PATHS = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  sliders: (
    <>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  basket: (
    <>
      <path d="M3 9h18l-1.6 9.6a2 2 0 0 1-2 1.4H6.6a2 2 0 0 1-2-1.4L3 9Z" />
      <path d="m8 9 3-5M16 9l-3-5" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

type IconProps = {
  name: IconName
  size?: number
  className?: string
  /** Есть подпись — иконка значимая (role="img"); нет — декоративная */
  label?: string
}

export function Icon({ name, size = 24, className, label }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {PATHS[name]}
    </svg>
  )
}
