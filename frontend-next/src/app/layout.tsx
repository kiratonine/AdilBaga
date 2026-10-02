import type { Metadata } from 'next'
import { Footer } from '../components/layout/Footer'
import { Providers } from '../components/Providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Adil Bağa',
}

// Временный корневой layout: /ru и /kk, шапка и выбор языка — сессия Next 2
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ru">
      <body className="flex min-h-dvh flex-col">
        <Providers>
          <main id="main" tabIndex={-1} className="flex-1">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  )
}
