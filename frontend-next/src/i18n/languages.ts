// Отдельно от словарей и i18next: нужно proxy, а тот не должен тянуть переводы в свой бандл
export const LANGUAGES = ['ru', 'kk'] as const
export type Language = (typeof LANGUAGES)[number]
export const DEFAULT_LANGUAGE: Language = 'ru'

/** Cookie с последним выбранным языком — по ней proxy решает, куда вести с `/` */
export const LANGUAGE_COOKIE = 'lang'

export const isLanguage = (value: unknown): value is Language => LANGUAGES.includes(value as Language)
