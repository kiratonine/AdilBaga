import { createInstance, type i18n as I18n } from 'i18next'
import kk from './kk.json'
import { DEFAULT_LANGUAGE, type Language } from './languages'
import ru from './ru.json'

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
      resources: { ru: { translation: ru }, kk: { translation: kk } },
      lng: lang,
      fallbackLng: DEFAULT_LANGUAGE,
      initAsync: false,
      interpolation: { escapeValue: false },
    })
    instances.set(lang, instance)
  }
  return instance
}
