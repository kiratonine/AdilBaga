# Pre-Part18 — Dependency Security & GitHub Hygiene

Status: **READY_FOR_EXTERNAL_REVIEW**

Outcome: approved contracts dependency remediation verified; ordinary Dependabot
version PRs paused in source configuration. Это не production/Part18 launch PASS
и не доказательство включённых GitHub security settings.

## 1. Immutable preflight / isolation

`git fetch origin --prune` выполнен до worktree creation и повторно после checks.
Fresh `origin/main` = expected baseline
`ea01c2568d06d15e87acad3b3cb99035bd476e74`; new HEAD совпадает с ним.
Созданы отдельные branch `chore/pre-part18-security-hygiene` и native-WSL worktree
`/home/denis/tmp/adilbaga-pre-part18-security-hygiene`. Начальный tree clean.
Существующие integration/Part17/auto-deploy worktree не использовались и не
редактировались; shared refs обновлялись только требуемым fetch. Никаких действий
с PR24, Backend2 branch, parser, sync, timer или production.

Root AGENTS отсутствует в новом main worktree; прочитаны предоставленные production
rules и root AGENTS исходного repository. Явный scope новой branch имеет приоритет
над историческим integrate-only default. Прочитаны roadmap Part18, Part17 report,
AUTO_DEPLOY_SETUP, contracts README/tests, CI workflow/run-checks/check-source и
Dependabot config. Fix-finding skill использован для узкой remediation и проверок
boundary/compatibility; single-agent по owner policy, два собственных прохода
(до patch и финальный regression/bypass review), без subagent или полного scan.
Единственный retained report — этот файл по прямому запросу владельца.

## 2. Versions / dependency graph

| Package | Before | Candidate |
| --- | --- | --- |
| ajv (contracts devDependency) | 8.17.1 | **8.20.0** |
| yaml (contracts devDependency) | 2.8.1 | **2.9.1** |
| @redocly/cli | 2.57.0 | unchanged |
| ajv-formats | 3.0.1 | unchanged; peer resolves ajv8.20.0 |
| packageManager | pnpm@10.32.1 | unchanged |

Installed/locked Ajv transitive versions unchanged: fast-deep-equal3.1.3,
fast-uri3.1.8, json-schema-traverse1.0.0, require-from-string2.0.2. yaml имеет
пустой dependency snapshot. Всего9 installed packages включая tooling root.
Redocly остаётся тем же bundled CLI; не заявляется обновление его внутренних
bundled компонентов. Новых dependencies/overrides/ignore/suppression нет.

Manifest изменён apply_patch только по двум exact version pins; lockfile обновлён
обычным `pnpm install --lockfile-only`, затем frozen install. Structural assertion
сравнил baseline/current manifest полностью и lockfile после двух version
substitutions и двух integrity updates: other package nodes/snapshots/settings
полностью равны. Нет latest/range expansion/packageManager rewrite.

## 3. Advisory evidence / actual exposure

### AJV

[GHSA-2g4f-4pwh-qvx6 / CVE-2025-69873](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6):
moderate ReDoS, affected v8 `<8.18.0`, exploit requires `$data` enabled and a
data-derived pattern. Baseline audit matched direct `.>ajv`8.17.1. Requested8.20.0
is above the fixed range; [maintainer release8.20.0](https://github.com/ajv-validator/ajv/releases/tag/v8.20.0)
also documents Node22/24 support. [Release8.19.0](https://github.com/ajv-validator/ajv/releases/tag/v8.19.0)
contains additional format/$data hardening; no separate CVE asserted here.

`contracts/tests/contract.test.mjs:4–12` imports AJV2020, creates
`{strict:false, allErrors:true}`, adds formats, and compiles frozen schemas/examples.
`$data:true` **не задан**; runtime inspection confirms disabled before/after.
No production AJV source path modified. Поэтому этот task устраняет flagged
dependency, но не утверждает ранее доказанный exploitable production ReDoS.
Expensive regex attack не запускался: prerequisite отсутствует в реальном caller.
Post-update audit0 + unchanged validation controls/tests являются focused evidence.

### YAML

[Maintainer GHSA-48c2-rrv3-qjmp / CVE-2026-33532](https://github.com/eemeli/yaml/security/advisories/GHSA-48c2-rrv3-qjmp):
moderate stack overflow during deeply nested collection composition, affected
2.x `<2.8.3`, corrected2.8.3. Baseline yaml2.8.1 matched audit. Requested2.9.1
includes the correction; [release2.9.1](https://github.com/eemeli/yaml/releases/tag/v2.9.1)
also bounds recursive merge aliases. No speculative advisory inferred from that
release note.

Concrete local source path: checked-in OpenAPI YAML → `yaml.parse` in contract
suite → AJV schema compilation. CI may parse PR-supplied source, but no public
HTTP endpoint in this package parses request YAML. The old package threw
**RangeError** on synthetic5000-level flow sequence in **parse/parseDocument/
parseAllDocuments**, while ordinary YAML worked. Candidate safely rejects both
5000-level sequence and2000-level mapping (six API/case combinations), as
YAMLParseError or document errors, never RangeError. Ordinary YAML still parses;
unchanged full contract fixtures/invariants PASS. No malicious payload/output
retained in repo; bounded in-process diagnostic only.

Initial `pnpm audit --json` exit1: **2 moderate advisories**,0 high/critical.
Final same command exit0: **0 known advisories** in this contracts graph. This is
a point-in-time registry result, not an exhaustive repository security certificate
or a claim that every parser resource-exhaustion possibility is eliminated.

## 4. Dependabot policy / GitHub boundaries

All five existing update entries retained: gomod/backend-go, npm/backend,
npm/frontend, npm/contracts, github-actions/root. Each weekly schedule and directory
is unchanged. Removed `target-branch: integrate/full-stack`; set
`open-pull-requests-limit: 0` in all five. No ignore/security update suppression,
CI disablement, workflow/permissions/source deployment edits.

According to [GitHub options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference),
zero temporarily prevents ordinary version-update PR creation; security updates
are not governed by that version-PR limit. [GitHub security update configuration](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-security-updates)
specifies valid manifest directories and no target-branch for applying this config
to security updates. Default-branch behavior therefore applies after review/merge;
this uncommitted source change is **not already active** on GitHub.

Actual alerts/dependency graph/security-update enablement depends on repository
Settings. **No administrative settings/alerts access verification was performed**;
no claim that security updates are enabled or processing now. Owner/admin should
later verify dependency graph, Dependabot alerts and security updates enabled,
without changing automatic deployment activation. No settings changed by task.

[PR10](https://github.com/kiratonine/AdilBaga/pull/10) and
[PR12](https://github.com/kiratonine/AdilBaga/pull/12) read-only metadata both
confirmed **OPEN / NOT MERGED**, base `integrate/full-stack`, requested AJV8.20.0
and yaml2.9.1 respectively. **Not closed/rebased/retargeted/modified**. This candidate
does not supersede their state until separately reviewed owner action. Disabling
new version PRs is not proof existing PRs were closed or reconfigured.

## 5. Actual commands / exit codes

Environment: native Linux WSL worktree; Node24.10.0, pnpm10.32.1. Shell command
prefix for pnpm operations:
`PATH=/home/denis/.nvm/versions/node/v24.10.0/bin:$PATH COREPACK_ENABLE_AUTO_PIN=0`.
No .env/private config loaded; CI helper child env excludes live/provider/backup
configuration. Every command below was actually executed; inline diagnostics
were not committed as new tests or modified existing tests.

| Command (cwd indicated) | Exit | Result |
| --- | ---: | --- |
| `rtk git fetch origin --prune`, worktree add/checks | 0 | exact base, new isolated branch, initially clean |
| `pnpm install --frozen-lockfile` (contracts, baseline) | 0 | baseline graph installed |
| `pnpm audit --json` (contracts, baseline) | 1 | expected finding:2 moderate advisories |
| `node --input-type=module` baseline diagnostic (contracts) | 0 | AJV $data disabled; three YAML RangeError observations; legitimate YAML control PASS |
| `pnpm install --lockfile-only` (contracts, candidate) | 0 | only approved lock graph changes |
| `node scripts/ci/run-checks.mjs contracts` (root) | 0 | child frozen install0 / lint0 / test0 |
| `pnpm test` within Contracts CI group | 0 | **12 PASS /10 SKIP /0 FAIL**,22 tests total |
| `pnpm audit --json` (contracts, candidate) | 0 | known advisories0 |
| `node --input-type=module` candidate diagnostic (contracts) | 0 | six safe YAML depth rejections + ordinary YAML, AJV options, exact manifest/lock diff and five-block Dependabot equality PASS |
| `pnpm list --depth Infinity` (contracts) | 0 | selected versions/transitives confirmed |
| `node --test scripts/ci/guard.test.mjs` (root) | 0 | **4/4 PASS** |
| `CI_BASE_SHA=ea01c2568d06d15e87acad3b3cb99035bd476e74 node scripts/ci/run-checks.mjs security` | 0 | source/workflow/migration immutability scan PASS; synthetic backup guard **1/1 PASS** |
| `rtk git diff --check` | 0 | no whitespace error |
| protected-path `rtk git diff --name-only` | 0 | empty for runtime/frontend/Go/pipeline/ops/API/tests/examples/Part16/CI workflows |

Contracts HTTP tests skip by design **without CONTRACT_API_BASE_URL**: fixture/live
servers not launched; no claim of new live/HTTP parity. Tests/assertions/schema/
examples unchanged, neither skips added nor tests weakened. Relevant local
Contracts/Security GitHub Actions commands reproduced; **hosted candidate CI NOT
RUN**, no push authorized.

## 6. Final verification pass / exact scope

Independent-perspective final pass reconfirmed affected source boundaries, disabled
AJV $data, updated yaml failure type, legitimate fixtures and unchanged transitive
nodes. Changing Dependabot limit does not lower mandatory CI or enable deployment;
none of the five entries gained security ignore rules. Frozen schema/DTO/request
semantics, packageManager and @redocly CLI preserved.

Only four changed/new files:

1. `contracts/package.json`.
2. `contracts/pnpm-lock.yaml`.
3. `.github/dependabot.yml`.
4. `docs/production/reports/PRE_PART18_SECURITY_HYGIENE_REPORT.md` (only report).

Bounded secret scan uses existing project policy, not a new full security scanner.
Final allowlist/diff-check and new-report whitespace/Markdown-target checks retained
below; no credentials, tokens, database URLs or private key material in this report.
No source archive/second report was requested or generated.

## 7. Remaining Part18 gates / stop

- Independent review of this candidate, then separately authorized GitHub actions.
- Owner decision on stale Dependabot PR10/12 and admin verification of security
  settings; nothing closed/changed by this task.
- Part16 correctly signed production event/cache verification remains open.
- Current-snapshot/runtime/ingestion/rollback/backup/monitoring/edge/Siri launch
  evidence and legal/contact/operator completion must be reconciled under Part18;
  historical PASSs do not replace current-state authorization and evidence.
- Backend2 owns PR24/its ingestion branches; no inspection/change/publish/timer
  action by this task. CI/CD Activation **FROZEN / WAITING_FOR_OWNER**.

No production/DB/VPS/Vercel/Cloudflare/provider access, mutation/deployment,
ingestion, migration, secret/settings change, commit/push/PR/merge. Existing
worktree files preserved. **READY_FOR_EXTERNAL_REVIEW**, STOP for Code Review.

Final report-inclusive checks: `CI_BASE_SHA=ea01c2568d06d15e87acad3b3cb99035bd476e74
node scripts/ci/check-source.mjs` exit0, **559 source files** bounded scan PASS,
immutable migration-base and local-drift guards PASS. Inline Node hygiene check
exit0: exact four-file allowlist PASS, report whitespace/DSN/private-key/credential
assignment checks PASS, staged index NONE. Report links are public authoritative
URLs (no local Markdown targets). Final `git diff --check` exit0. Protected paths
unchanged; no runtime/contract/CI assertions weakened to obtain these results.
