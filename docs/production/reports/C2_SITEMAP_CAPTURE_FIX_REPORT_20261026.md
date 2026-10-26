# C2 sitemap capture — минимальное source-only исправление, 2026-10-26

Статус кандидата: **READY_FOR_EXTERNAL_REVIEW**. Production не изменён; C2 acceptance не закрыт.

## База и границы

- Fresh fetch: `origin/main=36bd280efc333689383a9cf41afdf645bc2e60c2` (merged favicon PR #80). По сравнению с production `d4398710211262b5c385c12c9435d47d87aed65d` изменены только два frontend icon assets; текущий C2 исходник совпадает.
- Native WSL worktree `/home/denis/tmp/aktau-c2-sitemap-capture-fix`, ветка `fix/c2-sitemap-capture-limit`. Основной checkout и другие worktrees не изменялись.
- Изучен полный Owner/Backend2 report `TODO/OWNER_REPORT_C2_SITEMAP_CAPTURE_FAILED_20261026.md`, root rules/roadmap, текущие C2 observer/provider/custody/ledger и tests, [C2 runbook](../../../ops/c2/README.md), [sync runbook](../../../ops/sync/README.md), [revalidation contract](../FRONTEND_REVALIDATION.md), frozen OpenAPI и root promotion admission.
- Никаких SSH/production HTTP/SQL, sync/ingest/publication, root trust/pin changes, merge, deployment, workflow dispatch или AUTO DEPLOY. Git publication ограничена одним source-only PR для независимого review.

## Подтверждение причины и fail-first

Backend2 сообщил 200/identity sitemap **4 252 947 байт**, а старый cap равен **4 194 304**. Разница **58 643 байта**. Stream-counted `publicGet` безусловно отвергает такое тело как `oversized_body`; capture прекращается, прежний verdict теряет target/class и сохраняет только `INCONCLUSIVE / capture_failed`.

Это **подтверждённый source/local reproduction дефект admission**, а не новая production observation. У прежнего production ledger нет исходного error-class: нельзя исключить одновременно сработавший timeout другого пути. Backend2 также сообщил первый настоящий armed admission 2171 мс, 17 исторических INCONCLUSIVE, 0/3 PASS. Эти данные Owner/Backend2-reported; в этом этапе ledger/VPS не читались.

Сначала добавлены семь регрессий без изменения runtime:

```bash
node --test --test-name-pattern="current-size XML|survives trusted verdict" scripts/revalidation/c2-projection-v2.test.mjs
```

Node24.10: **exit1, 0 PASS / 7 FAIL / 0 SKIP**. Большой XML давал `capture_failed` вместо `capture_complete`; шесть safe-diagnostic cases не получали `failedTarget`. Исходный log сохранён вне Git. Fixture содержит настоящий XML, восемь точных RU/KK loc/lastmod для выбранной матрицы и обычные дополнительные url entries, а не JSON/один большой marker.

## Минимальный diff и совместимость

Единственный production runtime файл — [production-observer.mjs](../../../scripts/revalidation/production-observer.mjs):

1. Sitemap cap **8 МиБ = 8 388 608 байт**, фиксированный и без env/path override. Запас к наблюдённому размеру **4 135 661 байт (~97,24%)**. Остальные тела по-прежнему 2 МиБ. Это ограниченный запас для роста текущего каталога, не обещание вместить любой будущий sitemap/длины image URL. При дальнейшем превышении останется INCONCLUSIVE/oversized_body. Никакого truncation или частичного PASS.
2. Для registry-held failed capture прежний результат `INCONCLUSIVE / capture_failed`, `request_count`, пустые `events/results` сохранены; добавляются только **`failedTarget`** (одно из шести фиксированных имён) и **`failureClass`** (timeout/redirect/non200/oversized_body/missing_marker/unexpected_revision/encoded_body/transport). Выбирается первая завершившаяся ошибка в capture events, не утверждается единственность причины при конкурирующих запросах. Произвольные error.message не экспортируются.

Диагностика доступна только после существующих capture-registry/BEFORE/provider-custody checks; клон capture не получает доверие или diagnostics. Если AFTER/custody недостоверны, прежний fail-closed отказ остаётся; поля не выдумываются. Failure не становится PASS/FAIL.

Ledger evidence — вложенный JSON результата, без exact-key schema на эти два additive поля. [Supervisor](../../../scripts/revalidation/c2-production-supervisor.mjs) сохраняет результат без изменения; tests подтверждают durable write, reopen, INCONCLUSIVE и series=0. Это совместимо с запросом Backend2 сохранять target/error, не меняет event/FIFO/projection/READY/wire schema или acceptance policy. Сырые HTML/XML, credentials, raw errors и полный event payload в failure summary не попадают.

Streaming limit продолжает считать фактические Buffer chunks независимо от Content-Length; chunk сверх cap не добавляется, stream уничтожается. Максимум одновременных разрешённых body buffers вырос с 14 до 18 МиБ (пять ×2 плюс один ×8; JS strings/parser/temporary copies добавляют overhead). Evidence сохраняет только markers/hash; итоговая память всё равно зависит от runtime/GC. Таймаут 4000 мс и bounded request count ограничивают нагрузку; cap не отменён.

**Сохранены:** fixed HTTPS origin `aktau.market:443`, TLS certificate verification, `Accept-Encoding: identity`, native no-proxy/no-cookie/no-auth transport, отсутствие redirect follow/retries, timeout4000, acceptance5000, diagnostics20000, максимум21 GET/2 sitemap, monotonic event clock/uncertainty, BEFORE→READY→COMMIT→204→FIFO→AFTER→FINALIZE и все root/private custody checks. Go, HMAC, SQL, frontend, manifest algorithm, systemd и dependencies не изменены.

Тестовые изменения: [production-observer.test.mjs](../../../scripts/revalidation/production-observer.test.mjs) и [c2-projection-v2.test.mjs](../../../scripts/revalidation/c2-projection-v2.test.mjs). Четвёртый изменённый файл — этот report. Другие отчёты не переписывались.

## Реальная streaming integration и отрицательные проверки

Один локальный owned HTTPS server с временным self-signed сертификатом и явным CA, проверкой TLS, port127.0.0.1 и test-only request adapter. Никакого production DNS/HTTP, отключения TLS или внешних analytics hits.

- XML **4 252 995 байт**: старая граница4 МиБ даёт `oversized_body`, новая принимает полный поток и все8 exact markers. В окончательном полном Node/C2 run локальная передача заняла **193,92 мс**; это loopback TLS, не Vercel latency и не production SLA.
- Ровно8 МиБ принимается транспортом; 8 МиБ+1 в chunked response без Content-Length отвергается. Transport admission сам не доказывает marker freshness.
- Hanging partial response даёт timeout (укороченный test timer40 мс, production ceiling4000 не меняется); 302 не следует redirect,503 не считается200, gzip отвергается; явных запросов8, без retries/HEAD/POST.
- Capture tests подтверждают отсутствие PASS/FAIL при timeout/non200/redirect/oversized/missing marker/raw transport error; bounded target/class проходят через реальный synthetic-provider AFTER и существующий ledger.
- Большой XML проходит весь trusted synthetic BEFORE→capture→AFTER verdict,6 GET, только при совпадении независимого AFTER. Fixture transport не получает production capability.

## Frontend sitemap latency — анализ без изменения frontend

[frontend sitemap](../../../frontend/src/app/sitemap.ts) вызывает `connection()`: runtime rendering, не build-time sitemap; нельзя считать Full Route Cache HIT гарантированным. Categories, dashboard и `allProducts()` запускаются параллельно через Promise.all. **Внутри allProducts последовательная пагинация**, limit100, offset=page×100, до50 страниц; остановка при неполной странице. Для3019 товаров это31 product API call; при точном кратном100 нужна ещё одна пустая страница, пока cap50. Число3019 — пример/предыдущее историческое наблюдение, не новый live count. Критический путь cold API traversal — сумма задержек страниц плюс сериализация XML и передача.

[Server HTTP adapter](../../../frontend/src/api/httpAdapter.ts) кеширует каждый URL на3600s с tag `catalog-data`. После accepted signed204 [handler](../../../frontend/src/app/internal/revalidate/route.ts) вызывает `revalidateTag('catalog-data',{expire:0})` и фиксированный product revalidatePath. Поэтому следующий sitemap может платить за expired fetches/полную цепочку пагинации; warm tagged API cache может быть быстрее, но runtime XML всё равно генерируется. `MISS` Vercel сам по себе не доказывает холодный Data Cache, конкретную региональную причину или дефект CDN.

Backend2-reported sitemap12,95/1,80/1,88s и product5,57s показывают реальный риск таймаута, но эти замеры не коррелируют invocation/region/upstream spans и не устанавливают cold/warm RCA. Новых production измерений здесь нет. Новый cap устраняет детерминированный size rejection; **не устраняет >4000ms timeout, историческую cache latency и не гарантирует≤5s**. Второй sitemap GET также ограничен остатком общего окна; поздний ответ не получает новое окно.

Безопасный следующий frontend investigation, отдельно согласуемый с Frontend: read-only корреляция function duration/region, x-vercel-id/cache/age и длительностей API страниц на настоящей публикации; затем review конкретного предложения оптимизации пагинации/генерации. Возможные cached generation/index/параллелизация требуют отдельного frontend/protocol review и проверки witness membership; здесь их нет. Не увеличивать observer timeout/SLA ради скрытия проблемы.

## Реальные локальные проверки

Node24.10.0, Go1.27.3, non-root uid1000; все текущие тесты сохранены. Logs — вне Git в `/home/denis/tmp/aktau-c2-sitemap-fix-evidence`.

| Команда | Результат |
| --- | --- |
| focused fail-first, семь новых cases | exit1;0/7 PASS,7 FAIL,0 SKIP до fix |
| focused observer+projection после fix | exit0;151/151 PASS,0 SKIP; первый TLS fixture использовал Promise.race listeners и выдал MaxListeners warning; тестовый cleanup исправлен, окончательный полный run без warning |
| `node scripts/ci/run-checks.mjs go` | exit0: unit/race/vet/staticcheck/integration staticcheck/govulncheck, full-size2CPU READY qualification, builds; C2+guard **366/366 PASS,0 FAIL,0 SKIP**, actual local Go relayprobe |
| `node scripts/ci/run-checks.mjs ops` | exit0; Python C2 **190 PASS**, Node ops **185/185 PASS,0 SKIP** |
| `node scripts/ci/run-root-bundle-integration.mjs` | exit0; actual isolated Linux distinct UID/runuser/Git FD/root pair/helper crash-recovery, **69 PASS**, no SKIP; own Docker fixture cleaned |
| `node scripts/ci/run-db-integration.mjs` | exit0; new disposable loopback PG17, migrations, restricted provider, actual Go READY/publication fixture paths/site policy, cleanup PASS |
| `node scripts/ci/run-checks.mjs security` | exit0; source/workflow policy, synthetic backup guard1/1 PASS |
| `node scripts/revalidation/verify-part16.mjs` | exit0; static boundaries PASS, не production evidence |
| `C2_LOCAL_PROBE=<local Go1.27.3 relayprobe> node --test scripts/revalidation/*.test.mjs scripts/ci/guard.test.mjs` (последний run после финальных test assertions) | exit0; **366/366 PASS,0 FAIL,0 SKIP**,25,594s |
| Frozen pnpm install + Next production build + `node scripts/revalidation/cache-smoke.mjs` | exit0; **6/6 representations PASS**,53–157ms по shared window; structural operator integration6/6 PASS,168–249ms; GET405/auth401/signed204 PASS, fixtures only |
| JS syntax, diff-check, exact scope, Markdown links, bounded privacy/history checks | exit0 перед publication; четыре согласованных paths, historical reports/source вне scope сохранены |

Первый дополнительный local cache-smoke завершился exit1/missing_marker: при build был ошибочно выбран `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100`, тогда как неизменённый smoke нормализует только `http://localhost:3100`. Повторная сборка с **http://localhost:3100**, без изменения source или test predicate, завершилась PASS выше. Оба logs сохранены; первый результат не переписан. Маленький mutable API этого smoke не моделирует31-page cold traversal и не доказывает latency крупного production sitemap.

Hosted CI9 запускается для точного опубликованного PR HEAD; при создании этого report он ещё не выполнен. Фактические run URL/jobs/conclusions указываются в PR checks и финальной передаче; pending/skipped не считаются SUCCESS. Merge и promotion запрещены до независимого review.

**Дополнительная проверка, не скрыта:** `node scripts/revalidation/joint-poc.mjs` — exit1 до запуска15 сценариев. Этот исторический ручной entrypoint сравнивает protected postgres files с frozen baseline `6a4b4c7a91ec471db54987b689c3c87a785523a3`, а main уже содержит поздние dashboard.go/dashboard_test.go изменения. Diff guard отказывает. Это не ошибка capture/нового XML fixture и не PASS/не SKIP. Guard/Go файлы не ослаблены и не изменены ради прохождения; current mandatory Go/C2 and disposable DB integration проходят отдельно. Исторический15/15 не выдаётся за новый запуск. Устранение stale baseline этого отдельного harness — вне минимального sitemap diff, требует отдельного review.

## Authenticated manual promotion после review — НЕ выполнено

1. Независимый review этого source-only PR; protected merge, fresh exact-main SHA и все9 обязательных CI jobs SUCCESS.
2. На новом exact-main запуск `sync-publisher-build.yml` mode=`manual-artifact`, sha=<new exact main>, ci_run=<successful exact-main CI>; AUTO DEPLOY и SYNC_C2_PROMOTION_ENABLED не включать.
3. Проверить новый run/attempt/artifact ID, original GitHub ZIP digest/size, TAR inventory/source.bundle, всех12 immutable C2 файлов, embedded provider/source authority и pinned producer workflow/builder/executor. Этот diff producer/root executor не меняет; если обнаружен отдельный pin drift — STOP для независимого review.
4. Отдельно разрешённый свежий idle VPS preflight: runtime/controller locks, publisher/authority, reader metadata, ledger, retained releases/rollback, no interlock/orphan; сохранить Dina/API/services/timers.
5. Только официальный canonical request header + исходный ZIP через existing authenticated root executor `/usr/local/sbin/aktau-sync-promote`; одна reviewed promotion с receipt/readback всех12 hashes. Не редактировать файлы, READY или sourceSha вручную, не повторять failed artifact/initial-reviewed.
6. При неизвестной/частичной транзакции STOP и read-only reconciliation. После установки bounded safe smoke и сравнение rollback/reader/ledger/API/timers; никакого искусственного sync.
7. Backend2 наблюдает настоящие scheduled cycles: новые additive fields различают oversized/timeout/marker/transport failures. Три consecutive qualified PASS≤5s остаются обязательными; INCONCLUSIVE не добавляет, FAIL сбрасывает. **Сейчас новый production PASS не заявлен.**

STOP перед merge/production promotion. Известный latency риск и blocked исторический ручной PoC явно передаются независимому reviewer; они не скрыты изменением limits/guards.
