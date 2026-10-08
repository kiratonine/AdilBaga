import { Header } from '../../components/layout/Header'
import { Main } from '../../components/layout/Main'
import { SitePage } from '../../components/layout/SitePage'
import { TabBar } from '../../components/layout/TabBar'
import { NotFoundPage } from '../../views/NotFoundPage'

// Граница на уровне [lang]: ловит notFound() из любой страницы и неизвестные пути ([...rest]).
// Layout группы (site) при этом не рендерится, поэтому оболочка — здесь
export default function NotFound() {
  return (
    <SitePage>
      <Header />
      <Main>
        <NotFoundPage />
      </Main>
      <TabBar />
    </SitePage>
  )
}
