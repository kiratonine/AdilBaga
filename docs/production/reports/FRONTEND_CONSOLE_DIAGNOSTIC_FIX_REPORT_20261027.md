# Browser console: RU/KK catalog — diagnosis and minimal fix, 2026-10-27

**FRONTEND_CONSOLE_FIX_READY_FOR_REVIEW / READY_FOR_EXTERNAL_REVIEW.** Подтверждённые ненужные category RSC prefetch отключены одной Link prop. GA POST, предоставленный Owner, **204 SUCCESS**, исправления не требует. CSP дополнительно не расширена: необходимость рекламного mapuid и outbound iframe для выбранных базовых функций не подтверждена. Их намеренные CSP denials могут оставаться; «вся консоль очищена» не заявляется.

## 1. Source, scope и среда

Fresh `git fetch origin --prune`: main **6e7a96d6fe71029718d61e104d2f9197f17e9fae**, совпал с Owner baseline. Основной checkout и существующие deployment worktrees не изменялись. Новый native WSL worktree `/home/denis/tmp/aktau-frontend-console-fix-20261027`, branch `fix/frontend-console-csp-prefetch`.

Прочитаны root AGENTS/RTK, roadmap, текущий analytics report и заданные security-headers/Analytics/analytics-browser/CategoryTiles/next.config; category server page/adapter, tests и установленная реализация Next Link. Применён next-best-practices; UI/бренд/дизайн не меняются. Installed Next **16.4.1**, React19, Node24.10.0, pnpm10.32.1. Next package не поставляет standalone docs: использованы его actual `dist/client/app-dir/link.js`/`link.d.ts` и официальная [Link reference](https://nextjs.org/docs/app/api-reference/components/link), а не Pages Router assumptions.

Scope ровно4paths:

- [CategoryTiles.tsx](../../../frontend/src/components/catalog/CategoryTiles.tsx): comment + `prefetch={false}` на существующих category Links.
- [security-headers.test.ts](../../../frontend/src/lib/security-headers.test.ts): regression guard без изменения runtime policy.
- [catalog-network.spec.ts](../../../frontend/e2e/catalog-network.spec.ts):6 production-build E2E cases, desktop+iPhone, RU/KK.
- Этот report. Historical reports не переписывались.

Не изменены Backend/DB/C2/root policy/API contracts/analytics IDs/events/UTM/WeakMap/CSP builder/next.config/dependencies/locks/secrets/AUTO DEPLOY. Ни SSH, ни production deployment, ни sync/ingest/HMAC/C2 execution, ни settings changes. PR предназначен для review до merge/production.

## 2. Actual Chrome и production evidence

MCP browser доступен: **Headless Chrome151.0.7922.173/Linux**, первоначально about:blank, не профиль Owner Chrome155/Windows. Это реальные браузерные GET production, но не инспекция его расширений/старого Network log. CDP фиксировал method/status/MIME/canceled/blockedReason/initiator; query/payload/cookie values в evidence не сохранялись. После диагностики страницы закрыты/about:blank, service workers отсутствуют.

Production app/assets/GET разрешались; настоящие SDK loader GET были разрешены. **Все collector/watch/pixel/POST requests перехвачены локально**, provider hits не отправлялись. Поэтому synthetic collector responses не являются production collector acceptance evidence. Первая диагностическая intercept-заглушка не имела Allow-Credentials и создала собственные CORS errors у credentialed Yandex fetch/XHR; это ошибка диагностического fixture, не production RCA. Исправлена только заглушка (origin+credentials), результаты повторной проверки ниже. Исходная tool-ошибка не выдаётся за ошибку приложения.

Оба live `/ru/catalog` и `/kk/catalog`: document **200**, policy headers соответствуют source. В каждом live trace15 status200 prefetch records и8 canceled prefetch records, включая dashboard; запись200 и последующий canceled могут относиться к одному stream и не суммируются как отдельные requests. Headers `Next-Router-Prefetch:1`, `_rsc` query, initiator=script, frames — Next immutable app chunk. Для обеих локалей:

- Получены category prefetch **200 text/x-component**, затем часть body streams — **net::ERR_ABORTED, canceled=true, blockedReason=null**.
- Click по настоящей category bread → корректная RU/KK collections URL и **200 text/x-component** с `RSC:1`, без prefetch header.
- **0 observed HTTP5xx,0 application pageerrors**. Это bounded observation, не гарантия отсутствия серверных ошибок в иное время.
- Независимый обычный live GET `/ru/collections/bread`: **200 text/html**,192556bytes/776ms; KK: **200 text/html**,193463bytes/2146ms. Скрипты этих document probes не исполнялись.

## 3. Причина каждого сообщения и решение

| Сообщение | Доказанная механика / evidence | Решение |
| --- | --- | --- |
| Yandex image `https://yandex.ru/an/mapuid/googledctssp/` blocked | Live img-src не содержит yandex.ru. Origin mc.yandex.ru в img-src не разрешает другой origin yandex.ru. Локальный настоящий browser CSP probe подтверждает img-src violation. | Не добавлять рекламный origin только для тишины консоли; необходимость для выбранных basic counters не доказана. |
| iframe `https://mc.yandex.ru/` blocked | Live frame-src/child-src отсутствуют; outbound frame наследует default-src self. Локальный CSP event effectiveDirective=frame-src. Это отдельное правило от inbound frame-ancestors. | Не разрешать лишний iframe, blob или wildcard. frame-ancestors none и X-Frame-Options DENY сохранены. |
| category `_rsc` GET «failed» | Actual Next prefetch, HTTP200 headers/Flight MIME плюс client cancellation, не наблюдённый5xx. App Router запускает такие запросы для видимых Link/hover. | Точечный prefetch=false только у category tiles, без глобального отключения навигации/cache. |
| GA `/g/collect` POST | Owner предоставил actual DevTools **204 No Content**; текущая CSP уже разрешает www.google-analytics.com/region1. Live SDK инициатор — gtag.js; диагностический collector перехвачен. | Это успешный transport. Не добавлять retry/page_view/новые origins и не объявлять блокировщик причиной данного204. |

### Yandex: проверка необходимости, privacy и остаточные сообщения

Текущий init явно **webvisor=false,clickmap=false,trackLinks=false,trackHash=false**, ecommerce/accurateBounce тоже false; manual hit/reachGoal остаются. [Официальная CSP документация Метрики](https://yandex.ru/support/metrica/ru/code/install-counter-csp) связывает расширения frame/child permissions с Webvisor/maps; автоматического разрешения всех перечисленных доменов из неё не следует. [Официальный restricted-mode overview](https://yandex.ru/support/metrica/ru/general/counter-general) отдельно описывает first-party-only режим и его ограничения. Настройки кабинета/режимы в этом task не менялись.

Прочитан публичный SDK `https://mc.yandex.ru/metrika/tag.js`:223354bytes, SHA256 **c960d3e7f2e954d977f05c0771980813d49697f5b2c4add76da7ea9b7285fe50**. Он содержит cookie-matching flow (`sync.cook.int`, server-supplied `CookieMatchUrls`) и hidden iframe helpers. Конкретная googledctssp URL не hardcoded в этом snapshot; её наличие в текущих server settings или конкретный iframe call path исходного профиля **NOT_VERIFIED**, так как реальные tracker hits/settings не запрашивались. Cookie matching — обоснованная интерпретация endpoint/SDK, не доказательство необходимости для наших выбранных функций.

Поэтому **добавленных CSP origins нет**. Basic loader/collector origins остаются точными и условными по валидным IDs. Новые tests удерживают запрет yandex.ru image, iframe fallback, blob/wildcards/advertising origins и inbound framing protection. Если впоследствии действительно нужна дополнительная SDK функция, сначала требуется её доказательство/feature-level privacy review, затем отдельно минимальный permission diff. Включение неутверждённых tracking permissions, undocumented SDK disable flags, Webvisor или ослабление frame-ancestors ради удаления warning здесь не применялись. Optional denials не подавляются console filters.

### RSC: предел доказанности и минимальный fix

Source `CategoryTiles` использовал default prefetch на каждой плитке; installed Next Link проверяет `prefetchProp !== false` для viewport/hover/touch. [Next prefetch guide](https://nextjs.org/docs/app/guides/prefetching) описывает этот opt-out. В installed segment-cache `bufferPrefetchResponseBody` также есть намеренный reader.cancel при ограниченном partial prefix; по Network trace нельзя приписать каждый abort одному конкретному internal call site. Подтверждена категория **client-canceled speculative stream**, точная ветка внутреннего cancel **NOT_VERIFIED**. Не объявляется доказанная проблема Vercel/CDN/API.

Добавлено только `prefetch={false}`. Категории загружаются при выборе пользователя; href, a11y/SEO anchors, locale paths, SSR/React Query/API/error propagation сохранены. Другие Links (dashboard/product и т.д.) не менялись. Цена opt-out — первый click на динамическую категорию может ждать server render; обычная navigation выполняется и проверена. Ошибки сервера не фильтруются: category page/adapter всё ещё пробрасывают non404 failures, console не перехвачена/не заглушена runtime-кодом. При будущем реальном5xx нужен отдельный server correlation, не новый prefetch workaround.

### GA: успешный204 и privacy

Ответ204 — нормальный успешный HTTP response без тела ([RFC9110 §15.3.5](https://www.rfc-editor.org/rfc/rfc9110.html#name-204-no-content)). Переданный Owner запрос относится к page_view; в report/evidence перенесены только origin/path/method/status. Полная URL с client/session identifiers, payload и cookies **не скопирована**. Это Owner-provided metadata, а не отправленный агентом production hit. Наличие события в GA dashboards этим не проверялось.

[Google CSP reference](https://developers.google.com/tag-platform/security/guides/csp) требует разрешений для используемых endpoints; наблюдённый www.google-analytics.com уже разрешён в connect-src. Blind wildcard/Ads permissions не добавлены. NET_BLOCKED_BY_CLIENT, CSP failure, cancellation, non2xx — разные классы; оснований приписывать конкретному предоставленному204 adblock/application failure нет. Если есть другая красная строка Network, её нельзя смешивать с этим успешным запросом. Analytics.tsx/analytics-browser и8product events не изменены; дублей/повторных отправок не добавлено.

## 4. FAIL-FIRST и реальные проверки

Сначала написан новый production-build E2E до изменения runtime:

```sh
pnpm exec playwright test e2e/catalog-network.spec.ts --project=desktop --workers=1 --grep 'category navigation'
```

**exit1:2 FAIL (RU/KK),0 SKIP** — явные8+ category background requests вместо ожидаемых0. После двухстрочного runtime diff тот же настоящий Next production server, без изменения assertions/retries/timeouts:6/6 desktop+iPhone navigation/CSP cases PASS. Production наблюдения не подменены этими fixtures.

| Команда / проверка | Фактический результат |
| --- | --- |
| Frozen `pnpm install` | exit0; lockfiles unchanged |
| `pnpm typecheck` с documented HTTP loopback env | exit0 |
| `pnpm lint` | exit0,0 errors;2 прежних set-state-in-effect warnings в freshness/Analytics, новых нет |
| `pnpm test` | exit0;45files,274/274 PASS |
| `pnpm test --pool=forks --maxWorkers=1 --no-isolate` | exit0;45files,274/274 PASS |
| `pnpm exec playwright test e2e/catalog-network.spec.ts --workers=1` | exit0;6/6 PASS,0 SKIP; normal GET/clickedRSC/RU/KK/desktop+iPhone/CSP denials |
| `node scripts/ci/run-checks.mjs frontend` | exit0; install/typecheck/lint/CI unit274/audit/production build; configured E2E57 PASS,11 existing SKIP |
| Explicit dummy-ID analytics+network E2E below | exit0;14/14 PASS,0 SKIP |
| `node scripts/ci/run-checks.mjs security` | exit0; source/workflow guards,1/1 backup synthetic guard PASS |
| `node scripts/revalidation/verify-part16.mjs` | exit0; static only, не C2 production evidence |
| diff/scope/history/links/bounded privacy | PASS перед publication;4paths, historical/runtime contracts outside scope unchanged |

Root frontend wrapper не передаёт analytics IDs; его8 gated analytics cases и3 platform cases честно остаются SKIP. Они не считаются PASS. Отдельный явный запуск использует **только существующие synthetic IDs**, intercepted SDK/collectors, canonical origin mapped на loopback:

```sh
NEXT_PUBLIC_GA_ID=G-TEST123456 NEXT_PUBLIC_YANDEX_METRIKA_ID=12345678 \
NEXT_PUBLIC_SITE_URL=https://aktau.market \
pnpm exec playwright test e2e/analytics.spec.ts e2e/catalog-network.spec.ts --workers=1
```

Проверены init/loaders once, initial/RU/KK/Back/Forward pageviews, user-only product events, private-query exclusion, blocked-provider resilience и navigation. Ни одного real GA/Yandex hit в tests. Browser live diagnosis отдельно разрешал static SDK GET, но все hits тоже перехватывались. Source screenshot/UI redesign и visual assertions не требовались. Existing NO_COLOR warnings/jsdom navigation messages не скрыты.

## 5. Review и release boundary

Native evidence outsideGit: `/home/denis/tmp/aktau-frontend-console-evidence-20261027`; только sanitized Network metadata/headers, SDK public snapshot, source/fail-first/final test logs. Secrets/owner collector query/cookies не собирались. One source-only PR в main, без merge/deploy до независимого review. Hosted CI для точного нового HEAD проверяется отдельно; на момент source-report commit он ещё не запущен, итоговые run/jobs указываются в PR checks/финальной передаче, pending/skipped jobs не считаются SUCCESS.

Намеренные Yandex CSP warnings могут сохраняться, пока SDK пытается обращаться к недоказанно необходимым ресурсам. Это не скрыто и не объявлено исправленной delivery Метрики. Browser extensions/Owner profile и удалённые counter settings не инспектировались. Никаких гарантий доставки analytics всем privacy-браузерам или отсутствия будущих5xx не заявляется.

**STOP для независимого Code Review.**
