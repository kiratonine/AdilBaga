import { notFound, permanentRedirect } from 'next/navigation'
import { isLanguage } from '../../i18n'
import { localePath } from '../../lib/paths'

// Лендинга больше нет: главная языка — каталог. `/` proxy ведёт туда сразу, сюда попадают старые ссылки на /ru, /kk
export default async function Page({ params }: PageProps<'/[lang]'>) {
  const { lang } = await params
  if (!isLanguage(lang)) notFound()
  permanentRedirect(localePath(lang, '/catalog'))
}
