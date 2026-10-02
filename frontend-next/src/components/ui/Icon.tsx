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
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  // Категории товаров (lib/categoryIcons.ts)
  milk: (
    <>
      <path d="M8 2h8v3l2 3v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8l2-3V2Z" />
      <path d="M6 12h12" />
    </>
  ),
  bread: (
    <>
      <path d="M6 10.5A3.5 3.5 0 0 1 8.5 4h7a3.5 3.5 0 0 1 2.5 6.5V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-8.5Z" />
      <path d="M10 9.5v3M14 9.5v3" />
    </>
  ),
  egg: <path d="M12 3c-3.5 0-6.5 5.5-6.5 10a6.5 6.5 0 0 0 13 0c0-4.5-3-10-6.5-10Z" />,
  sugar: (
    <>
      <rect x="3" y="12" width="8" height="8" rx="1.5" />
      <rect x="13" y="12" width="8" height="8" rx="1.5" />
      <rect x="8" y="3" width="8" height="8" rx="1.5" />
    </>
  ),
  oil: (
    <>
      <path d="M10 2h4v4l2 3v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9l2-3V2Z" />
      <path d="M12 12c-1 1.3-1.5 2.2-1.5 3a1.5 1.5 0 0 0 3 0c0-.8-.5-1.7-1.5-3Z" />
    </>
  ),
  wheat: (
    <>
      <path d="M12 22V9" />
      <path d="M12 13c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4ZM12 13c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4ZM12 18c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4ZM12 18c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4ZM12 8c-1.2-1.2-1.2-3.5 0-5.5 1.2 2 1.2 4.3 0 5.5Z" />
    </>
  ),
  carrot: (
    <>
      <path d="M14.5 9.5 3 21s7-1.5 11-5.5a3.5 3.5 0 0 0 .5-6Z" />
      <path d="M15 9l1-5M15 9l5-1M15 9l4-4M9 15l1.5 1.5M11 12l1.5 1.5" />
    </>
  ),
  drumstick: (
    <>
      <path d="M15 3a6 6 0 0 1 0 12c-1.2 0-2-.2-3-.7L9 17.5" />
      <path d="M15 3a6 6 0 0 0-6 6c0 1 .2 1.8.7 2.7L6.5 15" />
      <path d="M6.5 15a2 2 0 1 0-2 2.5 2 2 0 1 0 2.5 2.5 2 2 0 0 0 2-2.5" />
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
