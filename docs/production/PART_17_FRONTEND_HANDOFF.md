# Part17 — Frontend handoff: Aktau Market

## Этап C — актуальная ответственность и состояние candidate

Владелец отдельно разрешил AI-агенту реализовать frontend вместо временно
отсутствующего Frontend-разработчика. Source candidate выполнен в существующем
`feat/part-17-brand-seo`; это **не deployment**. Ниже сохранены требования handoff
этапа B, а текущие решения/результаты этого раздела уточняют их статус.

- Имя Aktau Market централизовано в pure `frontend/src/lib/brand.ts`; Logo,
  i18n runtime, layout/OG/site JSON-LD используют его. Client/server конфигурация
  URL не менялась; Product.brand остаётся производителем.
- RU/KK dictionaries обновлены; title использует interpolation siteName.
- Existing SVG LogoMark, favicon и `assets/logo/Logo.jpg` **не изменены**.
- Existing RU/KK OG PNG пересобраны нынешним знаком, имя Aktau Market; примерные
  цены помечены «Иллюстрация · цены условные» / «Көрнекі мысал · бағалар шартты».
- Header и Footer сами не требуют source изменений: Header рендерит Logo, Footer
  не содержит старого имени. Контакты/оператор/legal отсутствуют, не выдуманы.
- Local full unit214/214, typecheck/lint, HTTP backend-down build PASS;
  mock Playwright51 PASS/3 existing platform skips; Part16 static4/4 и local
  six-path cache smoke PASS39–174ms. Подробности/ограничения в PART_17_REPORT.

Final owner decision: existing зелёный SVG LogoMark (ценник со знаком равенства)
и favicon **APPROVED** как финальный логотип Aktau Market. Новый знак не нужен;
SVG/PNG не менять. Contact/operator/legal остаются deferred; внешняя активация/
индексация/release по этому документу не разрешаются.

## Утверждённые решения и границы

Owner decision: публичное имя **Aktau Market**, одинаковое RU/KK. Production site
`https://aktau.market`, API `https://api.aktau.market`. GitHub repository
`kiratonine/AdilBaga` и Vercel project `adil-baga` **не переименовывать**.
Baseline этого handoff: `02f1a76886312a7073a8a84bb3d9a0364be2068d` (`main`, PR19
merged). Перед source work проверить свежий main и совместимость новых изменений;
не перезаписывать чужую работу. Этот документ не разрешает deployment/merge.

Исходный handoff назначал визуальный frontend/SEO Frontend-разработчику; этап C
передал эту реализацию AI-агенту по явному owner authorization. Независимый
Code Review остаётся необходимым перед любым commit/release.

**PENDING PRODUCT DECISION:** публичные contacts, юридическое имя оператора
и юридические тексты. Existing LogoMark/favicon — **APPROVED**. Не выводить
имя юридического лица из публичного бренда. Не придумывать email/телефон/адрес,
privacy/terms, social sameAs или contactPoint. До утверждения оставить такие
поля отсутствующими; не публиковать placeholder contact как реальный.
Text/config rename уже подготовлен с утверждённым existing logo.

## Точные source targets

| Файл | Минимальное изменение / ограничение |
| --- | --- |
| `frontend/src/lib/site.ts` | Единый публичный SITE_NAME=`Aktau Market`; использовать существующий SITE_URL/absoluteUrl. Не создавать второй URL source. Client-safe name нельзя импортировать через модуль с нежелательной server dependency; при необходимости маленький `src/lib/brand.ts` с pure constants |
| `frontend/src/i18n/ru.json`, `kk.json` | Общее написание brand.name; локализованный title с новым именем и текущим назначением сервиса. Сохранить PR19 `card.priceStale` и все небрендовые strings |
| `frontend/src/components/layout/Logo.tsx` | Text и accessible name из единого public name; existing графический LogoMark APPROVED, не заменять; сохранить href на языковой catalog |
| `frontend/src/components/layout/Header.tsx` | Проверить integration Logo/language/navigation/search; менять только доказанно необходимое branding wiring, не перестраивать layout/flow |
| `frontend/src/components/layout/Footer.tsx` | Согласованное публичное имя при необходимости; никакого выдуманного operator/contact. Existing copyright не превращать в юридическую identity |
| `frontend/src/app/[lang]/layout.tsx`, `src/lib/seo.ts` | Общее имя в title template, OG siteName/social title; сохранить descriptions RU/KK, metadataBase, canonical/hreflang и search noindex |
| `frontend/src/lib/structuredData.ts` | WebSite public name Aktau Market; Organization publication name можно использовать без утверждения юридического legalName/contact. Product.brand — бренд самого товара, не сайта! |
| `frontend/src/app/icon.svg` | Existing favicon APPROVED, byte-unchanged; не требовать favicon.ico просто из-за отсутствия такого файла |
| `frontend/scripts/generate-og.mjs`, `frontend/public/og/ru.png`, `kk.png` | Actual images с новым именем в обоих языках. Не только metadata rename. Для статического примера цен согласовать явное illustrative copy/замену, не выдавать fixture prices за live offer |
| `frontend/src/lib/seo.test.ts`, `structuredData.test.ts`, `components/layout/Header.test.tsx`, `frontend/e2e/seo.spec.ts` | Обновить только name expectations; сохранить ценовые/SEO/route assertions |
| Новый `frontend/src/lib/brand.test.ts` либо `site.test.ts`; `Footer.test.tsx` при изменении Footer | Единство имени RU/KK, accessible logo, отсутствие выдуманных contacts/legal metadata |

Пути в таблице относительны root; сокращённые `src/...` — внутри `frontend/`.
`assets/logo/Logo.jpg` сохраняется как исторический файл без изменений;
README использует существующий `frontend/src/app/icon.svg`. Не делать массовый
rename исторических screenshots. README уже обновлён
Backend docs этапом B; не затереть эти изменения.

## Acceptance criteria

- Header/Logo accessible name и metadata/WebSite/OG используют ровно Aktau Market
  RU/KK. Не остаётся старое публичное имя в newly rendered branding; исторические
  reports/screenshots и технические repository/env identifiers не переписываются.
- SITE_URL остаётся explicit production config; public API URL и server override
  используют текущую конфигурацию. Нет нового API_URL с независимым значением.
- Canonical: language-specific URLs; category без query; product ID неизменен.
  Hreflang `ru`, `kk`, `x-default=ru`, `<html lang>`, metadata descriptions и
  JSON-LD escaping сохранены. Никаких новых рейтингов/цены/availability из воздуха.
- Sitemap не меняет snapshot lastmod/route coverage; robots allow и search
  noindex/follow сохраняются. Не менять indexability без нового review.
- Part16 неизменен: HMAC fixed event, `catalog-data`, TTL3600, product ISR3600,
  fixed path invalidation, runtime sitemap, convergence≤5s (first STALE допустим).
- PR19 freshness warning сохранён в ProductCard/ProductPage RU/KK, без hydration
  regression; не добавлять таймер/активацию sync внутри branding.
- OSM URL/referrerPolicy/CSP, global privacy/security headers не ослаблять.
- API v1 DTO/routes, Go Speech/session flow, DB/Prisma, ingest/notifier и CI/CD
  untouched. Не добавлять новые dependencies ради rename.
- Assets визуально проверены на desktop/mobile RU/KK; OG PNG реально пересобраны
  после утверждения дизайна. Favicon/OG served local с корректным MIME.
- Contacts/legal остаются pending и absent до owner approval; final launch DONE
  не объявлять только по завершению name patch.

## Локальные команды после frontend patch

Node24 и pnpm с текущим frozen lockfile. Использовать native Linux filesystem при
известном `/mnt/d` worker startup issue; не менять timeouts/dependencies.

```bash
cd frontend
rtk pnpm install --frozen-lockfile
NEXT_PUBLIC_API_MODE=http NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:65534 \
API_BASE_URL=http://127.0.0.1:65534 NEXT_PUBLIC_SITE_URL=https://aktau.market \
rtk proxy pnpm typecheck
rtk proxy pnpm lint
NEXT_PUBLIC_API_MODE=mock rtk proxy pnpm test --pool=forks --maxWorkers=1 --no-isolate

# HTTP build с недоступным local API — НЕ production запросы.
NEXT_PUBLIC_API_MODE=http NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:65534 \
API_BASE_URL=http://127.0.0.1:65534 NEXT_PUBLIC_SITE_URL=https://aktau.market \
rtk pnpm build

# Mock Playwright: config сам задаёт test-only mock build opt-in.
PW_CHANNEL=chrome rtk proxy pnpm test:e2e

# Только после согласования visual assets, существующий local Chrome:
PW_CHANNEL=chrome rtk proxy pnpm og
```

Не устанавливать sudo/apt/browser libraries самостоятельно. Если browser недоступен,
зафиксировать blocker. Mock E2E не называть real HTTP/production проверкой.
HTTP E2E только против уже поднятого **локального fixture Go API**, например3000:

```bash
E2E_API=http NEXT_PUBLIC_API_MODE=http \
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000 API_BASE_URL=http://127.0.0.1:3000 \
NEXT_PUBLIC_SITE_URL=http://localhost:3100 PW_CHANNEL=chrome \
rtk proxy pnpm test:e2e

# HTTP build для следующего synthetic LOCAL cache-smoke (API стартует самим smoke).
NEXT_PUBLIC_API_MODE=http NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:18090 \
API_BASE_URL=http://127.0.0.1:18090 NEXT_PUBLIC_SITE_URL=http://localhost:3100 \
rtk pnpm build
cd ..
rtk proxy node --test scripts/revalidation/verify-part16.test.mjs
rtk proxy node scripts/revalidation/verify-part16.mjs
rtk proxy node scripts/revalidation/cache-smoke.mjs
rtk git diff --check
```

Cache smoke запускает предварительно собранный real LOCAL Next с mutable synthetic API; signed
events только loopback. Не заменять адреса на production. Если local fixture API
не поднят, использовать existing reviewed ephemeral staging harness отдельно,
не fallback на production и не менять fixture/runtime для branding tests.
Записать actual files/tests/results и first-response/eventual freshness отдельно.
Все команды выше — требования будущего frontend patch, не заявленный PASS этапа B.

## Owner-only external checklist — ничего не выполнено

Checklist не является разрешением менять системы. Сначала source review/явная
owner authorization; read-only evidence можно собрать без changes/secrets.

- **GitHub About:** оставить repository name; после отдельного разрешения Homepage
  `https://aktau.market`, согласованный description и актуальные topics. Сейчас
  Stage A независимо наблюдал старый vercel.app homepage. Не включать auto deploy.
- **Vercel:** оставить Project Name `adil-baga`, Production Branch `main`, Root
  Directory `frontend`, Next.js. Read-only проверить текущий production SHA/alias,
  domain aktau.market, production-scoped HTTP/site env по именам. Secret values не
  Reveal/не копировать; HMAC не создавать/ротировать. Rename branch deployment
  в production не выпускать. Release из main только отдельным разрешением.
- **Cloudflare:** read-only подтвердить zone/domain/Tunnel/current security rules.
  Не переименовывать tunnel, менять DNS/CORS/cache/WAF/HSTS или origin exposure
  ради branding. Existing public origins сохраняются; никакой новой инфраструктуры.
- **Search Console:** owner проверить existing property/indexing state. Регистрация,
  verification DNS/file tag и sitemap submit только отдельно разрешённым scope
  после source/deployment/Part16 readiness; не выбирать метод, требующий DNS, молча.
- **Yandex Webmaster:** аналогично property/site/indexing и отдельное разрешение
  verification/submission. Не утверждать, что индексация ещё не началась.
- **Siri:** после frontend/source review owner проверить реальный Shortcut display
  name/notification title и unchanged HTTPS API URL. Exact Go Speech не менять;
  исторический Shortcut «Продукты» не переименовывать без отдельного решения.

## Готовность handoff

Название и existing LogoMark/favicon **APPROVED**; contact/operator/legal pending. Part16
signed production gate открыт. Automatic CI/CD Activation **FROZEN /
WAITING_FOR_OWNER**. AI-агент уже подготовил frontend source candidate и выполнил
локальные проверки вместо отсутствующего Frontend-разработчика. Candidate ещё
не merged/deployed; production publication/deployment этим handoff не разрешены.
