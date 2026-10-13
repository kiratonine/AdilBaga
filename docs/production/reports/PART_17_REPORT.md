# Production Part17 — Branding, Domain & SEO Preflight

Status: **READY_FOR_EXTERNAL_REVIEW**

Дата: 2026-10-13. Этап B: публичное имя **Aktau Market** утверждено владельцем,
единое написание RU/KK; production domain **https://aktau.market**. GitHub repository
и Vercel Project Name не переименовываются. Исторический аудит этапа A ниже сохранён.
Existing зелёный LogoMark/favicon **APPROVED** как финальный логотип;
contact/operator/legal decisions **PENDING PRODUCT DECISION**;
Этап C: owner-authorized AI frontend source candidate реализован с текущим знаком;
новый знак не требуется, contact/operator/legal deferred. Part16 signed production verification остаётся
открытым; Automatic CI/CD Activation — **FROZEN / WAITING_FOR_OWNER**.

## 1. Изоляция и baseline

- Fetch origin выполнен в начале и повторно в конце аудита.
- Base / `origin/main`: `02f1a76886312a7073a8a84bb3d9a0364be2068d`.
- Новая ветка: `feat/part-17-brand-seo`.
- Отдельный native-WSL worktree: `/home/denis/tmp/adilbaga-part17-brand-seo`.
- Старый worktree `/mnt/d/install/projects/adilbaga`, ветка
  `integrate/full-stack`, HEAD `6da1cc4…`: до аудита чистый; файлы не переносились,
  checkout/merge/reset/clean там не выполнялись.
- [PR #19](https://github.com/kiratonine/AdilBaga/pull/19) независимо подтверждён
  GitHub metadata как merged, merge SHA равен baseline; merged_at
  `2026-10-13T10:24:13Z`, head `2454e6d1c0983ddb51a997d09ead727e1c1816bc`.

В экспортированном main root `AGENTS.md` отсутствует. Применены предоставленные
владельцем правила и прочитанный файл старого worktree; отдельная ветка/worktree
явно разрешены текущей задачей. AGENTS не копировался и не добавлялся.
Прочитаны roadmap Part17, FRONTEND_REVALIDATION, актуальные Part15/16 reports,
NETWORK_PERIMETER и Cloudflare checklist, API_V1_CONTRACT, Next source и sync docs.
Применён next-best-practices (metadata) для проверки серверных metadata-конвенций.

## 2. Что уже корректно / сохраняется

| Область | Подтверждённое source behavior |
| --- | --- |
| URL | `src/lib/site.ts` централизует SITE_URL/absoluteUrl; production требует явный NEXT_PUBLIC_SITE_URL, localhost fallback только non-production |
| API | `src/api/catalogApi.ts` + config требуют явный HTTP mode/public URL; API_BASE_URL — server override, иначе public URL; no silent production mocks |
| Metadata | RU/KK server layout задаёт metadataBase, title template, description, Twitter large image; `pageMetadata` задаёт canonical/hreflang/OG |
| Canonical | Свой языковой URL; category canonical без filters/sort; product stable ID; `ru`, `kk`, `x-default=ru` сохранены |
| JSON-LD | Organization/WebSite на catalog; Product/AggregateOffer/BreadcrumbList на detail; KZT и реальные DTO values; `<` escaping при сериализации |
| Robots | Crawl allow `/`; search — noindex/follow; robots с абсолютным sitemap URL |
| Sitemap | RU/KK catalog/dashboard/categories/products, hreflang, lastmod из snapshot; search и redirect-only language root исключены |
| Cache | `catalog-data` TTL3600, product ISR3600, runtime sitemap; Part16 fixed HMAC event + expire0/path invalidation не меняются |
| Assets | Price-tag/equal-sign icon в LogoMark и icon.svg визуально согласован; OG RU/KK PNG существуют |
| Siri | Go Speech сообщает товары/цены/сеть/адрес, не содержит имени Adil Bağa; exact speech/DTO менять для rename не требуется |

Это source-level выводы и локальные проверки, не новые production smoke или
доказательство правильной индексации поисковиками. RU/KK product/category names
приходят из API как сейчас: не вводить перевод DTO/таксономии в branding scope.

## 3. Подтверждённые проблемы и decision gates

### P1. Финальный бренд не утверждён

Roadmap требует централизованный rename до индексации, а действующие правила
называют Adil Bağa временным. Домен `aktau.market` сам по себе не утверждает имя
«Aktau Market». В UI/metadata всё ещё Adil Bağa. **PRODUCT_DECISION_REQUIRED**:
оставить/изменить имя, одинаковое или различное RU/KK написание, tagline, logo.
Никакого автоматического search/replace по всему репозиторию.

### P2. Бренд имеет несколько source-of-truth

`Logo.tsx` hardcode visible text и aria-label. `ru.json`/`kk.json` отдельно хранят
brand.name и уже включённое имя в brand.title. Layout/OG/JSON-LD используют i18n,
но Logo от них независим. Отдельного SITE_NAME нет. SVG mark дублируется в
LogoMark, icon.svg и OG generator. Это rename-maintenance gap, не текущий API bug.

### P3. Контакт/организация отсутствуют

Footer содержит about/copyright без контакта и идентичности оператора.
`siteJsonLd` Organization содержит name/url/logo, но нет contact info.
Contact/privacy/terms routes не найдены среди текущих frontend routes.
Это launch-content gap; юридические тексты/адрес/email нельзя придумать.
Решить, какой действующий публичный contact и operator name можно публиковать.
Не добавлять необоснованные sameAs/social accounts или private email.

### P4. OG/favicon/README требуют согласованного завершения

Визуально просмотрен `public/og/ru.png`: старое имя Adil Bağa и пример цен
570/610/650. Generator содержит эти статические примеры, не production quotes.
Нельзя объявлять их актуальными ценами; перед release решить, сохранить ли
illustrative card с явным обозначением примера либо утвердить иной copy.
Обе OG картинки необходимо регенерировать после утверждения бренда, а не только
изменить metadata. Текущий favicon — `app/icon.svg`, не отдельный favicon.ico;
отсутствие ico само по себе не дефект Next.js.
README содержит старую формулировку «production deploy не выполнен»/«планируемые
адреса» (строки около424), противоречащую принятым production reports. README
также использует `assets/logo/Logo.jpg`, отдельный от frontend SVG источник.
Не переписывать исторические reports как будто старых состояний не было.

### P5. GitHub About и внешние настройки

Read-only GitHub repository metadata на момент аудита:

- Repo `kiratonine/AdilBaga`, default branch `main`.
- About description: «Сравнение цен на продукты в Актау с городской аналитикой
  и интеграцией с Siri.» — содержательно соответствует продукту.
- Homepage **`https://adil-baga.vercel.app`**, не production `https://aktau.market`.
- Topics включают `hackathon`, `mangystauhub`, `aktau`.

Homepage drift подтверждён независимо. Переименование repo/project/tunnel не
обязательно для публичного бренда и не входит в минимальный source rename.
About/topics — отдельное owner-approved UI изменение, здесь не выполнялось.

Vercel Settings / Cloudflare dashboard / Search Console / Yandex Webmaster и
фактический iPhone Shortcut **не проверялись заново**. Предыдущая owner evidence:
Vercel project `adil-baga`, domain aktau.market, branch main/root frontend/Next.js,
deployment `bbdd25aac35852b9a1f24a391dcdca2621fd5457`. После PR19 main уже другой:
нужны новое dashboard SHA/alias confirmation и affected freshness/SEO production
smoke; нельзя переносить старый deployed-SHA PASS на новый main без подтверждения.
Cloudflare zone/tunnel naming не влияет на canonical; утверждённую topology/CORS
не менять. Search registration/indexing state неизвестен. Robots сейчас разрешает
crawl: не утверждать, что публичная индексация ещё не началась, только потому что
Search Console не проверен. Не включать noindex/robots block без отдельного scope.

### P6. Ограничения SEO coverage, не повод менять контракт

Sitemap ограничен50×100 product pages: после5000 products список может быть
неполным без явного failure. Это подтверждённый growth bound в source, не
доказательство текущей production потери URLs. Product JSON-LD нет rating/reviews
и availability без соответствующего DTO значения: не фабриковать rich-result
поля. OG product image может быть внешним photo URL; default PNG используется
при отсутствии image. Проверка внешних image fetch/crawler доступов остаётся
отдельным release smoke, здесь не выполнялась.

## 4. Совместимость PR19 и незакрытого Part16

Полный merged diff относительно bbdd25… для frontend просмотрен: ProductCard,
ProductPage, RU/KK dictionaries и новый freshness hook/tests; Go revalidation и
cmd/ingest source не менялись. Stale warning после36h считается after-mount,
не в SSR: это намеренно исключает hydration mismatch. Brand keys сохранены;
будущие правки dictionaries должны сохранять новые card.priceStale RU/KK тексты.
Hook пересчитывается при snapshotAt change/mount, а не на таймере: не заявлять
постоянно открытой вкладке автоматический пересчёт при пересечении36h.

Timer/сбор/ingestion — отдельная Backend2 операционная работа. `ops/sync` команды
installation/enable/start не выполнялись. Индикатор не гарантирует фактическое
обновление и не заменяет webhook; copy «обновляем данные» требует подтверждённого
operational sync до launch, activation не вытекает из merge.
Part16 signed production acceptance/shared-secret/notifier/convergence всё ещё
отдельные gates. Не publish snapshot ради Part17, не обращаться к Redis/Gemini.

Siri историческая спецификация называет Shortcut «Продукты»; deployed device
notification title/config не хранятся здесь как проверяемый актуальный export.
Owner должен проверить display name, notification title и API URL на iPhone
после утверждения бренда; не менять бренд в Speech или frozen wire fields.

## 5. Точный минимальный план файлов (НЕ реализован)

| Файлы | Изменение только после решения/review |
| --- | --- |
| `frontend/src/lib/site.ts` | Дополнить существующий общий module public brand/organization/contact constants; не второй URL source |
| `frontend/src/components/layout/Logo.tsx` | Убрать независимый hardcode имени/aria-label в пользу утверждённой конфигурации |
| `frontend/src/i18n/ru.json`, `kk.json` | Утверждённые localized brand/title/tagline/contact labels; сохранить PR19 keys |
| `frontend/src/app/[lang]/layout.tsx`, `frontend/src/lib/seo.ts` | Только wiring общего имени/title template при необходимости; не менять canonical/ru/kk/path semantics |
| `frontend/src/lib/structuredData.ts` | Утверждённые Organization identity/contact; не product DTO/price/schema semantics |
| `frontend/src/components/layout/Footer.tsx` | Реальные contact/operator ссылки; legal-page scope отдельно согласовать |
| `frontend/src/app/icon.svg`, `frontend/scripts/generate-og.mjs`, `frontend/public/og/ru.png`, `kk.png` | Только утверждённый знак/copy и regenerated assets |
| `README.md`, `assets/logo/Logo.jpg` | Согласовать public name/logo и актуальные production wording, без переименования Git repo |
| `frontend/src/lib/seo.test.ts`, `structuredData.test.ts`, `frontend/src/components/layout/Header.test.tsx`, `frontend/e2e/seo.spec.ts` | Новое ожидаемое имя; exact canonical/hreflang/product assertions сохранить |
| Новый `frontend/src/lib/site.test.ts` и при изменении Footer новый `Footer.test.tsx` | Минимальные central-brand/contact regression tests |

Необходимость title wiring/layout правок зависит от выбранного механизма; это
кандидатный whitelist, не обещание изменить каждый файл. `SITE_URL` и API
конфигурация уже централизованы: не добавлять независимый API_URL, не менять env
имена. `sitemap.ts`, `robots.ts`, API_V1_CONTRACT/OpenAPI, Go Speech, DB/Prisma,
Voice/revalidation/CI не требуют изменений для простого brand rename.
Sitemap масштабирование — отдельное review при доказанной необходимости.

Порядок: product decision → minimal source patch/test → source review → отдельно
разрешённые release/owner UI actions → affected public SEO/assets verification.
Vercel branch main сохраняется; никакого deployment из этой feature branch.
Не требовать DNS/domain move: aktau.market уже целевой домен.

## 6. Реальные локальные проверки

Native-WSL worktree, Node24.10.0, pnpm10.32.1; frozen install PASS без изменения
lockfile. Никаких real env/private config files не копировалось.

- Focused Vitest: **9 files /80 tests PASS** (SEO, JSON-LD, config, sitemap/robots,
  Header, PR19 freshness/ProductCard/ProductPage, webhook route). Mock mode,
  forks/maxWorkers1/no-isolate. jsdom emitted two known navigation-not-implemented
  messages, assertion/worker failures0.
- Part16 static verifier tests **4/4 PASS** и verifier PASS. Не production proof.
- Первый typecheck без env корректно rejected missing explicit API mode; это
  configuration invocation, не source defect. Повтор с explicit HTTP URLs на
  неиспользуемый loopback65534 и site URL aktau.market: **typecheck PASS**.
- **Lint PASS exit0**, existing PR19 `react(set-state-in-effect)` warning в
  `src/lib/freshness.ts:20` сохранён; не скрыт/исправлен в branding audit.
- PNG RU OG визуально просмотрен; favicon/LogoMark source inspected.
- `git diff --check` PASS; отдельный `diff --no-index --check` нового report
  не вывел whitespace findings (exit1 для отличающегося нового файла).
  Bounded report secret/private-config scan PASS. Final status нового worktree
  содержит только untracked report; старый worktree по-прежнему clean с полным
  HEAD `6da1cc4318ea4b68da2d2ba30a51747a39e31767`.
- Полные build/E2E/Go/runtime matrices не запускались: audit/report-only, source
  не менялся. Не объявляется hosted CI PASS нового merge SHA или production smoke.

## 7. Фактические изменения и safety

Единственный новый review file: `docs/production/reports/PART_17_REPORT.md`.
Runtime/tests/assets/contracts неизменны. node_modules/typegen outputs только
ignored local test artifacts. Старый worktree не затронут.

Production HTTP/VPS/Vercel/Cloudflare/DB/Redis/Gemini не вызывались; единственные
внешние read-only операции — Git fetch и GitHub PR/repository metadata.
Секреты не читались, не создавались и не ротировались. No ingestion/timer/CI
activation, no commit/push/merge/deployment. Audit READY_FOR_EXTERNAL_REVIEW;
**implementation/product release pending PRODUCT_DECISION_REQUIRED + remaining
Part16/owner-access gates**, не Part17 DONE. STOP для Code Review.

## 8. Этап B — Product Decision Closure & Frontend Handoff

### Preflight и закрытые решения

Повторный fetch: HEAD и `origin/main` всё ещё
`02f1a76886312a7073a8a84bb3d9a0364be2068d`; текущая ветка/worktree сохранены.
Единственный существовавший untracked файл перед этапом B — этот report.
AGENTS отсутствует в этом worktree; предоставленные правила владельца применены.
Roadmap Part17 и текущий source/test configuration перечитаны.

Owner прямо утвердил **Aktau Market** как единственное публичное написание RU/KK.
Stage A `PRODUCT_DECISION_REQUIRED` **для имени закрыт**. Это не автоматически
закрывает знак/favicon/OG design, контакты, operator/legal identity или юридические
тексты. Они остаются pending; ничего не придумано. Домен aktau.market сохраняется;
repo `kiratonine/AdilBaga` и Vercel project `adil-baga` не переименовываются.

### Docs-only deliverables

Создан `docs/production/PART_17_FRONTEND_HANDOFF.md`: точные candidate paths,
ownership Frontend-разработчика, ограничения common name/client-server imports,
JSON-LD Organization vs Product.brand, SEO/cache/PR19 acceptance, локальные команды
под Node24 и owner-only checklist GitHub About/Vercel/Cloudflare/Search Console/
Yandex Webmaster/Siri. Команды будущей реализации не выдаются за executed PASS.

README минимально актуализирован: заголовок/current public copy Aktau Market,
Live App URL aktau.market; имя Adil Bağa сохранено как историческое. Existing
logo/screenshots не заменены: README прямо обозначает их как исторические assets.
Удалены устаревшие current-state claims local-only/no VPS/no deployment:
документирован принятый Go VPS/Cloudflare Tunnel API, Next main→Vercel frontend,
Supabase, reference NestJS. Исторические849/6 counts явно помечены как baseline,
не live counts. Repo clone paths и approved local commands сохранены.

Deployment state основан на принятом owner handoff/production development history
и AUTO_DEPLOY_CI_CD_REPORT, а не свежем VPS probe. Main operational docs до сих пор
содержат исторические e6ef854/BLOCKED checkpoints: они не переписаны и не приняты
за current runtime query. README не утверждает новую проверку release/image/Siri.

### Scope protection и оставшиеся gates

Фактический change set этапа B ровно:

1. `README.md`.
2. `docs/production/PART_17_FRONTEND_HANDOFF.md` (новый).
3. `docs/production/reports/PART_17_REPORT.md` (сохранён этап A, добавлен B).

`frontend/**`, backend-go/runtime/Speech/dependencies, backend/Prisma,
contracts/API v1, Part16 implementation/docs, pipeline/ops/sync Backend2 и
CI/CD workflows не изменены. Existing accepted PR19 freshness keys/behavior и
HMAC/cache strategy сохранены без source patch.

Remaining: Frontend branding source patch/visual review; утверждение logo и
contacts/operator/legal; owner-only metadata/UI changes только отдельным
разрешением; confirmation актуального Vercel deployed SHA после PR19; Part16
signed production acceptance/convergence; отдельно review Search indexing и Siri
display/notification. Автоматизация deployment **FROZEN / WAITING_FOR_OWNER**.
Никакой timer/ingest/production release authorization не подразумевается handoff.

### Реальные проверки этапа B

- Part16 verifier tests повторены: **4/4 PASS**, static verifier PASS.
- `git diff --check` PASS; дополнительно проверены trailing whitespace новых
  untracked docs, существование report/handoff ссылки и allowlist трёх файлов.
- Bounded secret/private-key scan новых docs и добавленных README строк PASS.
  Первый diagnostic helper дал ложные findings на прежнем README example DSN и
  из-за `trim()` porcelain status; проверка исправлена на added-lines scope и
  сохранение leading status column, source при этом не менялся.
- Protected-source diff по frontend/backend-go/backend/contracts/pipeline/ops/
  .github/scripts/FRONTEND_REVALIDATION пустой. Старый worktree clean, HEAD
  `6da1cc4318ea4b68da2d2ba30a51747a39e31767` не изменён.
- Stage A frontend80/80, typecheck/lint PASS сохранены как **предыдущая** evidence,
  не повторены/не переобъявлены за этап B. Full build/E2E/Go matrices не требуются
  для docs-only update; будущие frontend patch commands перечислены в handoff.

Статус **READY_FOR_EXTERNAL_REVIEW** означает готовность docs/handoff этапа B,
не Part17 launch DONE. No production/API/provider/VPS calls, credentials/settings
changes, commit/push/merge/deployment. STOP для Code Review.

## 9. Этап C — Frontend Branding & SEO Implementation

### Authorization / immutable base

AI-агент явно назначен владельцем вместо отсутствующего Frontend-разработчика;
новый графический знак будет предоставлен позже. Existing SVG/favicon/README
logo сохранить. Fetch подтверждает тот же `origin/main`/HEAD
`02f1a76886312a7073a8a84bb3d9a0364be2068d`; branch/worktree сохранены.
Существовавшие README и untracked docs этапов A/B не сброшены и включены в review.
Прочитаны frontend/AGENTS, локальные Next16.3.8 metadata docs, roadmap и handoff.

### Минимальная реализация

Pure public `src/lib/brand.ts` содержит SITE_NAME=`Aktau Market`: без env, URL,
secrets или server-only imports. Logo visible/aria-label, layout title template,
OG siteName/social title и Organization/WebSite JSON-LD используют константу.
I18n RU/KK runtime name связан с SITE_NAME, localized title интерполирует siteName;
raw dictionary names проверяются тестом на равенство. Canonical/hreflang/site URL,
API configuration и URL paths не менялись.

У внутреннего frontend `siteJsonLd` убран произвольный параметр name, чтобы
публикуемая identity не зависела от caller; это **не API v1 DTO change**.
Product JSON-LD и Product.brand не менялись, existing FoodMaster assertion PASS.
Не добавлялись legalName/contactPoint/email/social fields.

Header/Footer source неизменны: Header уже использует Logo, Footer не содержит
старого имени. LogoMark geometry/colors, `app/icon.svg` и `assets/logo/Logo.jpg`
byte-unchanged. OG generator использует SITE_NAME через Node24 native TS import;
тот же знак и layout. Existing RU/KK1200×630 PNG пересобраны в preinstalled Chrome.
Статические570/610/650 явно помечены как illustrative/условные, не live offer.
Нового provider/dependency/logo generation не добавлено.

Новые regression assertions: common name RU/KK, no old name/unresolved template
в metadata/JSON-LD, отсутствие fabricated legal/contact. Playwright дополнительно
проверяет raw HTML/OG siteName/Organization/WebSite и accessible Logo обеих языков;
сохраняет screenshots desktop/iPhone. Existing route/price/canonical/hreflang
assertions обновлены только по имени.

### Actual changed/new files (полный candidate A+B+C)

Modified tracked:

- `README.md` (сохранён docs этап B).
- `frontend/e2e/pages.spec.ts`, `frontend/e2e/seo.spec.ts`, `frontend/e2e/smoke.spec.ts`.
- `frontend/public/og/ru.png`, `frontend/public/og/kk.png`.
- `frontend/scripts/generate-og.mjs`.
- `frontend/src/app/[lang]/layout.tsx`.
- `frontend/src/app/[lang]/(site)/catalog/page.tsx`.
- `frontend/src/components/layout/Logo.tsx`, `frontend/src/components/layout/Header.test.tsx`.
- `frontend/src/i18n/index.ts`, `frontend/src/i18n/ru.json`, `frontend/src/i18n/kk.json`.
- `frontend/src/lib/seo.ts`, `frontend/src/lib/seo.test.ts`.
- `frontend/src/lib/structuredData.ts`, `frontend/src/lib/structuredData.test.ts`.
- `scripts/create-clean-archive.mjs`: только permanent `production-part-17` target;
  existing exclusions/CI/deployment semantics не менялись.

New untracked source/docs (явно включены в patch/archive):

- `frontend/src/lib/brand.ts`, `frontend/src/lib/brand.test.ts`.
- `docs/production/PART_17_FRONTEND_HANDOFF.md`.
- `docs/production/reports/PART_17_REPORT.md` (этот report A/B/C).

### Реально выполненные проверки

Native WSL, Node24.10.0 / pnpm10.32.1 / Next16.3.8 / existing Chrome. Никакого
browser/dependency/system package install в этапе C; lockfile unchanged.

| Gate | Результат |
| --- | --- |
| frontend typecheck | PASS explicit local HTTP config |
| frontend lint | PASS exit0, прежний PR19 freshness set-state-in-effect warning сохранён |
| full frontend unit | **39 files /214 tests PASS**,0 failed/worker timeouts |
| production HTTP build | PASS API127.0.0.1:65534 unavailable, site aktau.market; no production API used |
| OG regeneration | PASS RU/KK, preinstalled Chrome; Node native-TS typeless-module warning harmless, package config не менялся |
| full mock Playwright E2E | **51 PASS /3 skipped /0 failed**, desktop+iPhone,24.7s |
| Part16 verifier/tests | **4/4 PASS**, static boundaries PASS |
| real LOCAL HTTP cache smoke | PASS synthetic mutable API + Next production server, no production data |
| archive script syntax | node --check PASS |

Три Playwright skips — существующие platform-specific guards в shell.spec
(mobile test on desktop, desktop test on mobile, narrow-phone test on desktop),
не newly weakened assertions. Server emitted `destination stream closed early`
при concurrent navigation teardown; E2E assertion failures0, hydration/no-console
и navigation checks PASS. Не утверждается нулевой server stderr. Full unit jsdom
две navigation-not-implemented notices сохранены. Никакого workaround/timeout hack.

Визуально просмотрены RU/KK OG и desktop/mobile language screenshots: common
brand видим, старый знак сохранён, имя не обрезано. Screenshots test-results ignored
и не включаются в source archive. Existing mock images могут показывать placeholder;
это не production image availability proof.

Cache smoke: все6 warm preconditions stale; после **локального** signed204
first-response fresh в этом run. RUproduct MISS173ms, KKproduct MISS174ms;
sitemap39ms, dashboard165ms, catalog169ms, category172ms; stale response counts0.
Detail API calls8 warm,9 на sitemap observation,16 на остальных. Одна shared5000ms
граница сохранена. Это не first-response guarantee: исторические STALE evidence
и accepted bounded consistency остаются в Part16. Production signed gate не запускался.

Real Go/DB HTTP E2E и hosted CI нового candidate **NOT RUN**: текущий scope не
меняет backend/API и выполняет available local frontend mock suite плюс synthetic
HTTP cache flow. Production acceptance, физический Siri и provider checks не
подменяются этими локальными результатами.

### Deferred / safety / review artifacts

Frontend text/SEO candidate готов; final new logo/contact/operator/legal всё ещё
deferred. Owner-only GitHub About/Vercel/Cloudflare/Search Console/Yandex actions,
Part16 signed production verification и final release review остаются отдельно.
Automatic CI/CD Activation **FROZEN / WAITING_FOR_OWNER**.

Protected Go/backend/contracts/Prisma/pipeline/ops/.github, Part16 HMAC/client/API
cache/sitemap/robots, favicon и README logo source diff пустой. No production
HTTP/VPS/provider access, migration/ingest/timer/secret/settings/deploy action,
commit/push/merge. Review artifacts создаются только в ignored `artifacts/`:
`production-part-17-source.patch` (binary PNG + все untracked source/docs) и
`production-part-17-review.tar.gz` (existing clean archive permanent target).
Окончательные artifact byte-match/secret/hygiene результаты фиксируются ниже.

### Final artifact/hygiene evidence

- `git diff --check` PASS, node syntax checks generator/archive PASS.
- Existing source/security policy scan **558 files PASS**, bounded known patterns,
  не exhaustive security audit. No private env/key/backup copied.
- Clean Part17 archive: **558 unique safe regular members**, no unsafe paths,
  real .env, node_modules/.next/test output, dumps/backups or compiled Go artifacts;
  all-source/report/PNG byte-match и bounded archive secret scan PASS.
- Binary source patch: **23 changed/new files**, в том числе все4 untracked
  source/docs; применён к fresh clean export exact HEAD, каждый результат byte-match
  с candidate PASS. PNG включены как git binary patch, не опущены.
- Старый integrate/full-stack worktree остаётся clean, HEAD
  `6da1cc4318ea4b68da2d2ba30a51747a39e31767`. В feature worktree только перечисленные
  reviewed candidates, artifacts ignored; staged/commit changes NONE.

Status **READY_FOR_EXTERNAL_REVIEW** — только source candidate Part17 этап C.
Part16 signed production gate открыт; final new logo/contact/legal deferred;
Automatic CI/CD Activation FROZEN. STOP для независимого Code Review, без release.

## 10. Final independent review — docs-only corrections

Owner сообщает independent Code Review PASS branding/SEO implementation, без
подтверждённых runtime defects. Исправлены ровно два замечания: root README теперь
говорит, что Aktau Market frontend branding/SEO **реализован как source candidate,
ещё не выпущенный в production**, вместо передачи отсутствующему разработчику;
frontend README heading — **Aktau Market — frontend (Next.js)**. Technical repo/
package/env identifiers, исторические reports/context и approved commands сохранены.

Correction изменяет только `README.md`, `frontend/README.md` и этот report.
Source/tests/PNG/LogoMark/favicon/Go/API/Part16/ingestion/CI/CD не редактируются.
В preflight дополнительно обнаружена существующая правка `frontend/package.json`:
только `packageManager` с pnpm10.32.1 и integrity suffix; dependencies/scripts не
менялись. Происхождение этой правки здесь не устанавливалось. Она **сохранена без
изменений**, явно включена в current-source patch/archive и требует отдельного
учёта при финальном review; прежний список23 файлов описывает этап C до неё.
Final candidate теперь25 файлов: прежние23 + frontend README + pre-existing
package.json metadata. Никакого скрытого rollback/restore чужих изменений.

Повторяются docs link/hygiene проверки, Part16 verifier4/4, bounded secret scan
и patch/archive byte-match; full runtime matrices не повторяются для docs-only
correction, принятые unit214/E2E51 PASS evidence сохранены как предыдущие результаты.
Production/VPS/settings/provider/DB actions NONE, no commit/push/merge/deploy.

Correction verification: Part16 **4/4 PASS**, static verifier PASS;
`git diff --check` PASS,8 local Markdown link targets exist, new-doc whitespace
check PASS. SHA256 before/after comparison confirms **555 files outside the three
correction docs unchanged** (including pre-existing package.json metadata).
Existing bounded source/security scan558 files PASS. Updated binary patch covers
all25 changed/new files (4 untracked), clean archive558 safe regular unique files;
Fresh baseline patch application, all25-file byte-match, source/report/PNG archive
byte-match и bounded archive secret scan **PASS** для corrected artifacts.
Historical runtime test evidence
remains unchanged. Status **READY_FOR_EXTERNAL_REVIEW**, STOP for final review.

## 11. Final Code Review remediation — docs and isolated approved scope

Independent review (owner-reported) подтвердил frontend/SEO, binary patch, OG PNG
и archive roundtrip; runtime defects не найдены. Исправлены только root README
intro (implementation готова как source candidate, **not merged/deployed**; новый
знак/контакты pending), frontend README production domain (не planned), финальное
handoff ownership (AI уже подготовил candidate вместо отсутствующего разработчика)
и этот report. История этапов A–C/предыдущих проверок сохранена.

### packageManager provenance / safe separation

Fresh fetch: `origin/main` и feature HEAD остаются
`02f1a76886312a7073a8a84bb3d9a0364be2068d`. В baseline `frontend/package.json`
packageManager отсутствует; local diff только добавляет pnpm10.32.1 с integrity
suffix. Последний committed manifest change — `e8342da…` (Next migration).
Installed Corepack source имеет auto-pin branch `COREPACK_ENABLE_AUTO_PIN=1`,
который добавляет packageManager в manifest без spec. Это **возможный механизм**,
не доказательство автора/момента этой конкретной правки. Shell history/private
configs не читались; правка не удалялась и не редактировалась в исходном worktree.

Approved Part17 patch **исключает `frontend/package.json` целиком**. Для review
archive создаётся отдельный clean Git export exact origin/main, к которому
применяется только approved binary patch. Его manifest byte-identical baseline;
все24 approved changed/new files byte-identical текущему worktree. Таким образом
archive — **approved-scope export**, не скрытая копия полного dirty worktree.
Оригинальный worktree по-прежнему содержит несогласованный manifest pin.
Не сравнивать archive manifest с dirty original как требование равенства:
это единственное намеренное исключение, сравнивается с immutable origin/main.

Это подготовленный review/будущий commit allowlist, **не staging или commit**.
При последующем owner authorization нельзя `git add -A`/`git commit -a` в этом
worktree; stage только24 allowlisted paths ниже, packageManager оставить вне
commit до отдельного решения. Ни чужой pin, ни исходный worktree не потеряны.

### Exact approved patch/archive file list — 24 paths

- `README.md`
- `frontend/README.md`
- `docs/production/PART_17_FRONTEND_HANDOFF.md`
- `docs/production/reports/PART_17_REPORT.md`
- `frontend/e2e/pages.spec.ts`
- `frontend/e2e/seo.spec.ts`
- `frontend/e2e/smoke.spec.ts`
- `frontend/public/og/ru.png`
- `frontend/public/og/kk.png`
- `frontend/scripts/generate-og.mjs`
- `frontend/src/app/[lang]/layout.tsx`
- `frontend/src/app/[lang]/(site)/catalog/page.tsx`
- `frontend/src/components/layout/Logo.tsx`
- `frontend/src/components/layout/Header.test.tsx`
- `frontend/src/i18n/index.ts`
- `frontend/src/i18n/ru.json`
- `frontend/src/i18n/kk.json`
- `frontend/src/lib/seo.ts`
- `frontend/src/lib/seo.test.ts`
- `frontend/src/lib/structuredData.ts`
- `frontend/src/lib/structuredData.test.ts`
- `frontend/src/lib/brand.ts`
- `frontend/src/lib/brand.test.ts`
- `scripts/create-clean-archive.mjs`

Исходный dirty status остаётся25 paths: эти24 плюс **excluded/preserved**
`frontend/package.json`. Архив содержит полный source export, не только24 файла;
unchanged manifest и остальные baseline source files включены как reference.

### Checks / safety

Part16 verifier **4/4 PASS**, static verifier PASS; `git diff --check` PASS.
Markdown local targets/whitespace и bounded scans проверяются для corrected docs
и final approved export. Предыдущие full unit214/Playwright51 PASS не перезапускались:
implementation/tests/assets не меняются; baseline manifest не меняет dependency
versions/lockfile, а pin исключён как tooling-only несогласованная правка.
Binary patch проверяется применением к fresh export exact origin/main;
archive безопасные members и source/report/PNG bytes проверяются против этого
approved export, а retained packageManager — против pre-correction original.

No production/API/VPS/provider/settings/DB/ingest/CI activation; no commit/push/
merge/deploy. Automatic CI/CD Activation FROZEN, Part16 signed gate открыт.
Status **READY_FOR_EXTERNAL_REVIEW** относится к исправленному approved Part17
review scope, не production launch. Final artifact/check results приведены ниже.

Final correction results: **24-path binary patch application to exact origin/main
PASS**; all24 changed/new source/doc/PNG bytes match original candidate. Clean
approved-scope archive **558 regular safe unique members PASS**, all export bytes
including report match; `frontend/package.json` matches baseline (pin absent),
original pin retained unchanged. Bounded source/archive secret scan PASS. All554
files outside four corrected docs byte-preserved,8 local Markdown link targets
exist, whitespace/diff-check PASS. Real index untouched; old integration worktree
clean/unchanged. Final artifact paths unchanged:
`artifacts/production-part-17-source.patch` and
`artifacts/production-part-17-review.tar.gz`, now explicitly **approved scope only**,
superseding the previous25-path artifacts. No full runtime rerun or production
claim. READY_FOR_EXTERNAL_REVIEW; STOP.

## 12. Final owner logo decision / PR readiness

Owner сообщает independent review approved-scope24 paths/archive558 members и
binary roundtrip **PASS**, functional blockers не найдены. Owner окончательно
утвердил existing зелёный SVG LogoMark — ценник со знаком равенства — финальным
логотипом **Aktau Market**. Existing favicon APPROVED, новый знак не нужен.
Это supersedes historical pending-logo decisions этапов A–C без переписывания
их evidence. Текущие pending: contact/operator/legal, Part16 signed production
gate и отдельно разрешённые внешние launch checks. CI/CD Activation FROZEN.

Docs-only correction: README header использует `frontend/src/app/icon.svg` с
актуальным alt; old JPG сохранён byte-unchanged. Relative repo image paths и SVG
поддерживаются GitHub согласно [README image paths](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
и [supported image formats](https://docs.github.com/en/repositories/working-with-files/using-files/working-with-non-code-files).
Файл существует и не содержит scripts/external references. GitHub live rendered
view **не проверялся**: candidate не pushed; не подменяется локальной проверкой.
Handoff теперь помечает знак/favicon APPROVED, исключает logo из current pending.
Runtime/tests/SVG/PNG/JPG/manifest/Go/Part16/API/ingest/CI source не менялись.

Approved future commit scope остаётся **ровно24 paths из раздела11**;
`frontend/package.json` excluded, original local pin сохранён. Scope export от
exact `origin/main` с baseline manifest и approved binary patch используется для
нового archive; никаких git add/commit операций. Header report status остаётся
READY_FOR_EXTERNAL_REVIEW по AGENTS convention; итоговая handoff disposition
для этой задачи — **READY_FOR_PR**, не merged/deployed или launch DONE.

Final logo-closure checks: Part16 **4/4 PASS**, static verifier/diff-check PASS;
8 local Markdown targets и README SVG path существуют, static SVG без script/
external references; **555 files outside three edited docs byte-unchanged**,
включая JPG/SVG/PNG/tests/packageManager. Bounded source/security scan558 PASS.
Approved binary patch24 paths применён к exact origin/main PASS; archive558 safe
regular unique members PASS, approved-export source/report byte-match PASS,
manifest baseline/no pin PASS, original pin preserved PASS. Review artifacts
обновлены по прежним paths, origin/main remains `02f1a768…`; real index/old
worktree untouched. READY_FOR_PR; pending только contact/operator/legal, Part16
signed gate и отдельно разрешённые external launch checks. No commit/push/merge/
deployment/production action. STOP.
