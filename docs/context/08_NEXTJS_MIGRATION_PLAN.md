# Next.js frontend migration — COMPLETE

Updated: 2026-10-03. Implementation COMPLETE; Production Part 01 awaits external review.
Canonical report: `docs/production/reports/PART_01_REPORT.md`.

## Итоговый путь

`frontend/` — единственный frontend, Next.js 16 App Router, React 19,
TypeScript, Tailwind 4, TanStack Query, i18next и Leaflet. Старый Vite source
удалён только после всех pre-switch PASS gates. NestJS остаётся reference backend
для будущего Go parity; public API/DTO и Supabase schema/data не изменены.

## Завершённые шаги

1. Каркас, существующие lib/api/components и deterministic mocks перенесены.
2. Next App Router, язык в `/ru`/`/kk`, cookie и proxy redirects.
3. SSR/hydration каталога, категории, товара, поиска и Dashboard; Leaflet client-only.
4. Metadata, canonical, ru/kk/x-default hreflang, Product/AggregateOffer,
   BreadcrumbList, Organization/WebSite JSON-LD, robots/sitemap/OG; search noindex.
5. Fail-closed production config: только HTTP, обязательный публичный API URL и
   site URL. Internal `API_BASE_URL` optional; default — явно заданный public URL.
6. Production mock artifact разрешён лишь test-only flag
   `NEXT_PUBLIC_ENABLE_TEST_MOCKS=1`; нет автоматического перехода на mocks.
7. Каталог/Dashboard/sitemap ждут runtime request (`connection()`), не API при
   build. Server GET cache ограничен 3600 s с tag `catalog-data`; browser fetch
   не получает Next cache options. Backend-down build PASS.
8. Mock suite и live data-agnostic HTTP suite разделены. Unit и desktop/iPhone
   viewport E2E проверены; real ru/kk SSR/SEO и HTTP 404 сохранены.
9. После всех pre-switch PASS старый frontend удалён, Next переименован в
   `frontend/`; повторены final-path gates. Unit выполняются на byte-identical
   native-WSL test copy без изменений dependencies/timeouts (Part 00 /mnt/d issue).
10. README/worklog обновлены, permanent archive target `production-part-01`.

## Configuration / verification

Production example: `frontend/.env.example`. Planned URLs:
`https://aktau.market`, `https://api.aktau.market`; бренд пока **Adil Bağa**.
Для local smoke явно задавать API/site origin; secrets в frontend не нужны.

```bash
cd frontend
# С явными HTTP/site env из README:
rtk proxy pnpm typecheck
rtk proxy pnpm lint
NEXT_PUBLIC_API_MODE=mock rtk pnpm test
rtk pnpm build
PW_CHANNEL=chrome rtk pnpm test:e2e
E2E_API=http NEXT_PUBLIC_API_MODE=http \
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000 API_BASE_URL=http://127.0.0.1:3000 \
NEXT_PUBLIC_SITE_URL=http://localhost:3100 PW_CHANNEL=chrome rtk pnpm test:e2e
```

История migration/design — в `docs/context/06_FRONTEND_WORKLOG.md`.
Нет deploy/brand rename/DB mutation/commit/push. Physical Siri — PENDING OWNER.
После внешнего review — Production Part 02 (API Contract Freeze/OpenAPI), не сейчас.
