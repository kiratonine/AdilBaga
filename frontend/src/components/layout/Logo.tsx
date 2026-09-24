import { Link } from 'react-router'

/** Знак: ценник со знаком «=» — «справедливая цена» */
export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d="M11.2 6H26a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H11.2a2 2 0 0 1-1.5-.7l-6-8a2 2 0 0 1 0-2.6l6-8a2 2 0 0 1 1.5-.7Z"
        fill="var(--color-accent)"
      />
      <circle cx="10.6" cy="16" r="1.9" fill="var(--color-page)" />
      <path d="M16 13.2h8M16 18.8h8" stroke="var(--color-page)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

export function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-1 rounded-md" aria-label="Adil Bağa">
      <LogoMark />
      <span className="font-display text-[1.0625rem] whitespace-nowrap font-extrabold tracking-[-0.02em]">Adil Bağa</span>
    </Link>
  )
}
