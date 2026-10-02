import { Main } from '../../components/layout/Main'
import { LandingPage } from '../../views/LandingPage'

// Лендинг — без шапки сайта (она в группе (site)), выбор языка — в самой странице. Тексты статичные, API не нужен
export default function Page() {
  return (
    <Main>
      <LandingPage />
    </Main>
  )
}
