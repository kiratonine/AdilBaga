import { Header } from '../../../components/layout/Header'
import { Main } from '../../../components/layout/Main'

/** Все страницы, кроме лендинга: шапка с поиском и навигацией */
export default function SiteLayout({ children }: LayoutProps<'/[lang]'>) {
  return (
    <>
      <Header />
      <Main>{children}</Main>
    </>
  )
}
