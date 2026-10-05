// Картинки для соцсетей (Open Graph, 1200×630) на каждый язык → public/og/<lang>.png.
// Рисует Playwright: next/og не читает woff2, а кириллица Golos/Montserrat есть только в woff2 из fontsource.
// Запуск: pnpm og (после правки `brand` в словарях или текстов ниже). PW_CHANNEL=chrome — через установленный Chrome
import { chromium } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fontCss = (pkg) => pathToFileURL(join(root, 'node_modules', '@fontsource-variable', pkg, 'index.css')).href
const languages = ['ru', 'kk']

// Заголовок и пример (одна позиция, самая низкая цена выделена) — тексты бывшего лендинга, в словарях их больше нет
const texts = {
  ru: { title: 'Где продукты в Актау выгоднее', exampleProduct: 'Молоко 3,2%, 1 л', exampleCheapest: 'Выгоднее всего' },
  kk: { title: 'Ақтауда азық-түлік қай жерде тиімді', exampleProduct: 'Сүт 3,2%, 1 л', exampleCheapest: 'Ең тиімді' },
}

const offers = [
  { store: 'Dina', color: '#2a78d6', price: '570 ₸', best: true },
  { store: 'Dana', color: '#eb6834', price: '610 ₸' },
  { store: 'Fix Price', color: '#4a3aa7', price: '650 ₸' },
]

const logo = `<svg viewBox="0 0 32 32" width="64" height="64"><path d="M11.2 6H26a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H11.2a2 2 0 0 1-1.5-.7l-6-8a2 2 0 0 1 0-2.6l6-8a2 2 0 0 1 1.5-.7Z" fill="#17744a"/><circle cx="10.6" cy="16" r="1.9" fill="#fff"/><path d="M16 13.2h8M16 18.8h8" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`

const html = (t, og) => `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="${fontCss('golos-text')}">
<link rel="stylesheet" href="${fontCss('montserrat')}">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: #fff; color: #1a1f24; font-family: 'Golos Text Variable', sans-serif;
    display: grid; grid-template-columns: 1fr 430px; gap: 64px; padding: 72px 80px; }
  .display { font-family: 'Montserrat Variable', sans-serif; }
  .brand { display: flex; align-items: center; gap: 6px; font-size: 34px; font-weight: 800; letter-spacing: -0.02em; }
  h1 { margin-top: 56px; font-size: 60px; line-height: 1.08; font-weight: 800; letter-spacing: -0.025em; }
  .tagline { margin-top: 28px; font-size: 26px; line-height: 1.35; color: #697178; }
  .card { align-self: center; border: 2px solid #e2e6e4; border-radius: 24px; padding: 32px; }
  .product { font-size: 26px; font-weight: 600; }
  .row { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; padding: 16px 20px;
    border-radius: 14px; background: #f3f5f4; font-size: 24px; }
  .row.best { background: #e5f2ea; }
  .store { display: flex; align-items: center; gap: 12px; }
  .dot { width: 14px; height: 14px; border-radius: 50%; }
  .price { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .best .price { color: #17744a; }
  .label { margin-top: 18px; font-size: 20px; font-weight: 600; color: #17744a; }
</style></head>
<body>
  <div>
    <div class="brand display">${logo}${t.brand.name}</div>
    <h1 class="display">${og.title}</h1>
    <p class="tagline">${t.brand.tagline}</p>
  </div>
  <div class="card">
    <p class="product">${og.exampleProduct}</p>
    ${offers
      .map(
        (o) => `<div class="row${o.best ? ' best' : ''}"><span class="store"><span class="dot" style="background:${o.color}"></span>${o.store}</span><span class="price display">${o.price}</span></div>`,
      )
      .join('')}
    <p class="label">${og.exampleCheapest}</p>
  </div>
</body></html>`

const outDir = join(root, 'public', 'og')
mkdirSync(outDir, { recursive: true })
const tmp = mkdtempSync(join(tmpdir(), 'og-'))
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {})
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  for (const lang of languages) {
    const t = JSON.parse(readFileSync(join(root, 'src', 'i18n', `${lang}.json`), 'utf8'))
    const file = join(tmp, `${lang}.html`)
    writeFileSync(file, html(t, texts[lang]))
    await page.goto(pathToFileURL(file).href)
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: join(outDir, `${lang}.png`) })
    console.log(`public/og/${lang}.png`)
  }
} finally {
  await browser.close()
  rmSync(tmp, { recursive: true, force: true })
}
