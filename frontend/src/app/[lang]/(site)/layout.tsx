import { Header } from '../../../components/layout/Header'
import { Main } from '../../../components/layout/Main'
import { SitePage } from '../../../components/layout/SitePage'
import { TabBar } from '../../../components/layout/TabBar'

/** Все страницы сайта: шапка с поиском, серый фон, на мобильном — таб-бар */
export default function SiteLayout({ children }: LayoutProps<'/[lang]'>) {
  return (
    <SitePage>
      <Header />
      <Main>{children}</Main>
      <TabBar />
    </SitePage>
  )
}
