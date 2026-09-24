import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import kk from './kk.json'
import ru from './ru.json'

export const LANGUAGES = ['ru', 'kk'] as const
export type Language = (typeof LANGUAGES)[number]

const STORAGE_KEY = 'adilbaga.lang'

function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return LANGUAGES.includes(stored as Language) ? (stored as Language) : 'ru'
  } catch {
    return 'ru'
  }
}

export function setLanguage(lang: Language) {
  void i18n.changeLanguage(lang)
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // localStorage недоступен (приватный режим) — язык просто не запомнится
  }
}

i18n.on('languageChanged', (lang) => {
  document.documentElement.lang = lang
})

void i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, kk: { translation: kk } },
  lng: readStoredLanguage(),
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
})

export default i18n
