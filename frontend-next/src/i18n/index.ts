import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import kk from './kk.json'
import ru from './ru.json'

export const LANGUAGES = ['ru', 'kk'] as const
export type Language = (typeof LANGUAGES)[number]

// Пока язык фиксирован: источником станет префикс URL (/ru, /kk) — сессия Next 2
void i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, kk: { translation: kk } },
  lng: 'ru',
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
})

export default i18n
