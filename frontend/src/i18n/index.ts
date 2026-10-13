import { createInstance, type i18n as I18n } from 'i18next'
import kk from './kk.json'
import { DEFAULT_LANGUAGE, type Language } from './languages'
import ru from './ru.json'
import { SITE_NAME } from '../lib/brand'

export * from './languages'

const instances = new Map<Language, I18n>()

/**
 * Экземпляр i18next на язык. Язык берётся из префикса URL (/ru, /kk) и не переключается:
 * changeLanguage не вызываем, поэтому один экземпляр безопасно делить между запросами на сервере
 */
export function getI18n(lang: Language): I18n {
  let instance = instances.get(lang)
  if (!instance) {
    instance = createInstance()
    // Словари лежат в бандле — инициализация синхронная, текст есть уже при первом рендере (SSR без расхождений)
    void instance.init({
      resources: {
        ru: { translation: { ...ru, brand: { ...ru.brand, name: SITE_NAME } } },
        kk: { translation: { ...kk, brand: { ...kk.brand, name: SITE_NAME } } },
      },
      lng: lang,
      fallbackLng: DEFAULT_LANGUAGE,
      initAsync: false,
      interpolation: { escapeValue: false, defaultVariables: { siteName: SITE_NAME } },
    })
    instances.set(lang, instance)
  }
  return instance
}
