# Nest Express → qs: минимальное устранение CI blocker, 2026-10-27

Source-only candidate. Итоговый статус после проверки exact-head CI указывается в PR checks и финальной передаче; pending CI не считается PASS. Merge/deployment этим этапом не разрешены и не выполнялись.

## Baseline и RCA

Fresh origin/main **`519279ba49f8ce9aede84050c2a92643114cc453`** совпал с Owner baseline. Отдельный native worktree `/home/denis/tmp/aktau-nest-express-qs-audit-20261027`, branch `fix/nest-express-qs-audit-20261027`; чужие worktrees сохранены. Root rules/RTK, Nest bootstrap/tests, manifests/lock, advisory и C2 publisher/build admission изучены. Применены nestjs-best-practices и codex-security:fix-finding; анализ/отдельный review pass выполнены одним агентом согласно project rules.

[Exact-main CI40552572765](https://github.com/kiratonine/AdilBaga/actions/runs/40552572765) действительно FAILURE: Nest build и28tests PASS, `pnpm audit --prod` exit1 на **Express5.2.1 → qs6.16.0**. PostgreSQL Integration/Staging были SKIPPED, CI Gate FAILURE; это не9/9PASS. Локальный baseline frozen install + audit воспроизвёл exit1.

[GitHub reviewed advisory GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw) указывает affected `>=6.7.0 <=6.16.0`, patched6.16.1. При comma-array serialization объект с non-callable own toString вызывает TypeError. Отсутствие подходящего error boundary может приводить к DoS; реальная эксплуатация наших Nest routes/production этим не доказана. В backend source не найден прямой вызов qs.stringify/comma, поэтому package-level reproducer не выдаётся за доказанный application attack path или инцидент Go API.

`pnpm why qs` до изменения показывал **две версии**: Express использовал6.16.0, его body-parser2.4.0 уже использовал6.16.1. Наличие patched версии в одной цепочке не исправляло другую.

## Точный минимальный diff

Три paths:

1. [backend/package.json](../../../backend/package.json): одна строка в существующем pnpm.overrides:

   ```json
   "express@5.2.1>qs": "6.16.1"
   ```

2. [backend/pnpm-lock.yaml](../../../backend/pnpm-lock.yaml): штатный `pnpm install --lockfile-only`; добавлен тот же override, Express snapshot переключён6.16.0→6.16.1, удалены неиспользуемые package/snapshot entries6.16.0. Уже существующий integrity6.16.1 не менялся.
3. Этот report.

Package manager сохранён **pnpm10.32.1**, Node24.10.0. Express остаётся5.2.1, Nest platform11.2.6; declared Express qs range **^6.14.0** допускает6.16.1. Override scoped на конкретного parent/version, не глобальный qs override. Существующие body-parser/multer/undici overrides, scripts, dependencies/devDependencies и все остальные manifest fields идентичны baseline. Exact-text lock transformation проверяет отсутствие importer/settings/прочих packages/integrities drift; другие lockfiles не менялись.

После frozen install `pnpm why qs`: **одна версия6.16.1**, Express и body-parser deduped. Реальное разрешение через createRequire Nest→Express→qs подтверждает6.16.1, не только текст lockfile. `pnpm audit --prod --json`: advisories empty, все severity counts0, muted empty; exit0. Audit не отключался и exceptions/ignore rules не добавлялись.

## FAIL-FIRST и поведение

Изолированный package-level regression запускает **фактически установленный Express qs** через его реальный pnpm dependency path:

```js
const { createRequire } = require('node:module');
const root = createRequire(backendDirectory + '/package.json');
const nest = createRequire(root.resolve('@nestjs/platform-express/package.json'));
const express = createRequire(nest.resolve('express/package.json'));
const qs = express('qs');
```

До fix: version6.16.0, assert.doesNotThrow провален с `Cannot convert object to primitive value`, exit1. После fix тот же код exit0 на6.16.1:

- hostile JSON `{a:[{toString:'x'}]}` и эквивалентный результат `qs.parse('a[0][toString]=x',{allowPrototypes:true})`;
- comma с обычным encoder и с encodeValuesOnly=true;
- положительные controls: обычная comma serialization и repeated-key parsing сохраняют прежние ожидаемые значения.

Первый probe неправильно создавал require от неразрешённого symlink path pnpm и дал MODULE_NOT_FOUND. Исправлена только адресация теста через root.resolve; qualified fail-first выше подтвердил именно TypeError в6.16.0. Этот setup failure не считается security reproduction. Скрипт/outputs сохранены отдельно от минимального source diff; никаких новых runtime/test package scripts или dependencies.

## Фактические проверки

| Команда/проверка | Результат |
| --- | --- |
| Baseline `pnpm install --frozen-lockfile` |exit0 |
| Baseline `pnpm why qs`, `pnpm audit --prod --json` |две версии; audit exit1, исходный GHSA подтверждён |
| `pnpm install --lockfile-only` |exit0; только заявленный lock delta |
| `pnpm install --frozen-lockfile` после fix |exit0; lock не переписан |
| `pnpm why qs`, real Express module resolution |exit0; только6.16.1 |
| Package reproducer/обычные controls |FAIL-FIRST exit1 → PASS-AFTER exit0 |
| `node scripts/ci/run-checks.mjs nest` |exit0: frozen install, Prisma generate, TypeScript build, **28/28tests PASS,0SKIP**, production audit exit0/no known vulnerabilities |
| `node scripts/ci/run-checks.mjs security` |exit0; source/workflow/migration guards и backup synthetic guard PASS |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py` |exit0; **36/36PASS**, без SKIP; существующий deliberate duplicate-ZIP warning не скрыт |
| Manifest/lock exact scope, links, bounded privacy, `git diff --check` |локальные проверки; только три согласованных paths |

Новые audit vulnerabilities не обнаружены в проверенной backend production graph. Это не заявление об отсутствии всех repo/dev dependency advisories; audit registry может обновляться. Hosted CI запускается на точный опубликованный PR head; его run/jobs/conclusion проверяются перед финальным статусом, не подменяются локальными28tests или старым CI.

## C2 admission compatibility

Проверены реальные source guards `Host.import_source`, producer policy и relevance function в [publisher-promotion.py](../../../ops/c2/publisher-promotion.py):

- Protected `backend/prisma`, `contracts`, `deploy/compose.production.yml` не меняются, включая сравнение с последним известным publisher6e7a96d. Pipeline manifests/lock/Dina blobs также неизменны.
- Все producer bytes идентичны base: build workflow SHA256 `1d7764798c1c78ac616e4615ef46ba7fd810b1f192692318cdf1a3aa66da6312`; builder `308504c27ee7ceed871b1044d88a20a1f45a9525c9e4f3cca9d9b8382240b9b4`; executor `d69c667212b2a6c8a25081ccdc90f798024e850784262976e06e45ce13f45118`.
- Только Nest package/lock delta сам по себе **не promotion-relevant**; guard не ослаблен и такой standalone publisher promotion не должен принудительно проходить. Совокупный future source от6e7a96d включает ещё не установленный PR83 Node provider diff и остаётся relevant. Protected-path/producer checks проходят source-level comparison, а не обходятся исключением.
- Backend package override не устанавливает Node dependencies на VPS и не меняет Go/pipeline/C2 closure bytes. Будущий sourceSha/Go embedded source/new artifact должны формироваться штатно для будущего exact main после review/merge/CI9. Нельзя переименовать старый artifact или вручную заменить authority.

**Source compatibility PASS; live root admission NOT_RUN.** Нет VPS/SSH/DB/production HTTP, artifact build/dispatch, root policy/pin/helper changes, promotion, sync/ingest/HMAC, Frontend/Go/schema/DTO/SLA/workflow/settings/secrets изменений. AUTO DEPLOY не менялся. No merge, tag или Release. При будущем release все независимые admission gates требуют свежей фактической проверки.

## Review boundary

Изолированный review pass повторно проверил все copies dependency graph: vulnerable qs6.16.0 удалён, Express и body-parser разрешают6.16.1, обычные controls/28HTTP-domain tests сохранены. Сужение override на Express5.2.1 намеренное: будущая смена Express требует повторной проверки, а не скрытого глобального version pin. Production reachability/эксплуатация не утверждаются.

Retained security evidence через Codex Security artifact store:
`/home/denis/.codex/state/plugins/codex-security/scans/aktau-nest-express-qs-audit-20261027/artifacts-3d16d70ed3dbc568d7f48563a2298f09ee3681ccb1424f47da76af664c52833f/artifacts/` — before/after audit/why, actual PoC, Nest/security/promotion test logs. Canonical scan не создавался; это standalone fix evidence, не независимый внешний Code Review.

Source-only PR передаётся на независимый review. **STOP перед merge/deployment.**
