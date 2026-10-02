import { Header } from '../../components/layout/Header'
import { Main } from '../../components/layout/Main'
import { NotFoundPage } from '../../views/NotFoundPage'

// Граница на уровне [lang]: ловит notFound() из любой страницы и неизвестные пути ([...rest]).
// Layout группы (site) при этом не рендерится, поэтому шапка — здесь
export default function NotFound() {
  return (
    <>
      <Header />
      <Main>
        <NotFoundPage />
      </Main>
    </>
  )
}
