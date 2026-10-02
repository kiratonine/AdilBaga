import { Golos_Text, Montserrat } from 'next/font/google'

// next/font: шрифты раздаём сами, наборы символов из subsets — preload в <head>, у системного fallback
// подогнаны метрики (без скачка вёрстки при подмене). Расширенные наборы нужны на каждой странице:
// latin-ext — ₸ в ценах и ğ в «Adil Bağa», cyrillic-ext — казахские буквы. Без preload браузер находит их
// только при раскладке текста, и первая отрисовка ждёт их отдельным кругом запросов
export const golos = Golos_Text({
  subsets: ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'],
  variable: '--font-golos',
  display: 'swap',
})

// Цены, логотип, крупные цифры
export const montserrat = Montserrat({ subsets: ['latin', 'latin-ext'], variable: '--font-montserrat', display: 'swap' })
