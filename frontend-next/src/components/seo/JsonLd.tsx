import { serializeJsonLd } from '../../lib/structuredData'

/** Структурированные данные в HTML страницы (серверный компонент — в клиентский бандл не попадает) */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
}
