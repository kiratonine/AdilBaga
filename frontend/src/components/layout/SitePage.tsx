import type { ReactNode } from 'react'

/** Серый фон страниц сайта (белые карточки на нём). Футер — белый, вне обёртки */
export function SitePage({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col bg-page">{children}</div>
}
