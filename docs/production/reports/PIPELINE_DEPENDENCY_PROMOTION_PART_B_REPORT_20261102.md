# PR86 offline pipeline promotion — Part B, 2026-11-02

**BLOCKED_IMPLEMENTATION. STOP по обязательному safety condition Owner.** Реализация начата, но real-filesystem CAS qualification провалена. Это неполный локальный source candidate, **не готовый к publication, installation или production**. Commit/push/Draft PR не выполнены; exact-new-head CI9 отсутствует. Pipeline/C2/VPS не изменены.

## 1. Baseline и утверждённый scope

Fresh fetch и `origin/main` подтвердили **49f6823768817b0390f215de42439cce523bf5d3**. Создан отдельный native worktree `/home/denis/tmp/aktau-pr86-offline-pipeline-promotion`, branch `feat/pr86-offline-pipeline-promotion`, HEAD49f6823. Основной checkout и предыдущие worktrees не переключались/reset/rebase.

Прочитаны root AGENTS/RTK, approved Design Contract v2 из предыдущего worktree, root executor/helper fixtures и runtime/build boundaries. Исходный contract и remediation report не редактировались. Source authorization — текущее задание Owner; оно добавляет обязательный read-only post-deploy verifier и требует STOP при непроверенной безопасности/сбое tests.

## 2. Что реализовано локально

В `ops/c2/publisher-promotion.py` добавлены пока **не подключённые к CLI/admission** компоненты:

- фиксированные PR86 package/lock/tree/Node/pnpm identities;
- строгий bounded inventory parser: типы/порядок ключей, paths/parents, file sizes/modes/hashes, relative link resolution с cycle/escape/dangling protection;
- indexed USTAR capsule parser: exact members, per-blob hashes, canonical byte representation, отсутствие transport links/PAX/extra/trailing members;
- pure helper только для exact contracts-lock пары, **не вызванный существующим source admission**;
- read-only sealed-graph verification и начальный PipelineStore с journal registration callback, создание только private stage, links last, fsync, root-seal, no-clobber publication через renameat2.

Текущий default root entry по-прежнему принимает только прежний manifest/policy protocol. V2 artifact не разрешён этой частичной работой. Никакого временного permissive flag, generic dependency bypass или ложного PRODUCTION_SOURCE_RUNTIME_ALIGNED результата нет.

В `ops/c2/test_publisher_promotion.py` добавлены parser и real-filesystem safety regressions.

Исторический root-helper fixture ранее читал **текущий** publisher-promotion.py и требовал его старый digest d69c667…, что несовместимо с любым новым executor source. В `ops/c2/fixtures/pair-upgrade/executor-after.json` сохранены точные старые public source bytes из49f6823; SHA256 восстановленного файла проверен как d69c667212b2a6c8a25081ccdc90f798024e850784262976e06e45ce13f45118. `test_root_executor_pair_upgrade.py` читает этот immutable fixture, сохраняя старые hash assertions/reverse-patch semantics. Сам исторический helper/installer и его constants/journal не изменялись. Полный helper suite ещё не запускался после этой адаптации; PASS не объявляется.

## 3. Fail-first и подтверждённый safety failure

### Parser qualification

```sh
python3 -B -m unittest discover -s ops/c2 \
  -p test_publisher_promotion.py -k PipelineCapsuleV2Tests
```

До реализации: exit1,4tests,13errors/subtest errors из-за отсутствующих новых entrypoints/constants. После: exit0,4/4PASS. Проверены malformed/extra/boolean fields, traversal/absolute paths, link escape/cycle/dangling, duplicate paths, indexed blobs/canonicality и exact protected-lock controls.

Дополнительно real87,275,520-byte new design-fixture capsule прошёл новый parser:5058entries/4142regular blobs, около0.962s локально. Это parser test на публичных fixture bytes, не новый authenticated artifact и не installation qualification.

### Real-filesystem store safety matrix

```sh
python3 -B -m unittest discover -s ops/c2 \
  -p test_publisher_promotion.py -k PipelineStoreSafetyTests
```

**Exit1:3PASS/1FAIL.**

| Case | Реальный результат |
| --- | --- |
| Sealed filesystem roundtrip и изменение file hash | PASS, tamper отклонён |
| SIGKILL после mkdir/registered stage | PASS, intent/stage сохранены, reinstall заблокирован, final capsule отсутствует |
| ENOSPC при записи graph | PASS, partial stage сохранён, final capsule отсутствует |
| Foreign staging inode перед publication | **FAIL — нарушена safety boundary** |

Falling assertion:

```text
FAIL: test_foreign_stage_inode_is_never_renamed_into_registered_capsule
AssertionError: False is not true : foreign staging inode was moved before CAS rejection
```

В изолированной owned temporary filesystem тест после `sealed` registration заменяет staging directory другим inode с отдельным foreign marker. `PipelineStore.install()` затем вызывает renameat2 по имени stage без финального сравнения с зарегистрированной identity. Финальная verify правильно отклоняет неправильный slot, **но слишком поздно: foreign directory уже перемещена** в capsule namespace. Требуемое «не перемещать/не изменять чужие ресурсы» нарушено.

Это подтверждённый дефект **нового локального staging code**. Это не доказанный remote exploit или ошибка установленного production executor: source не опубликован и новый путь не подключён. Тест затрагивал только собственный disposable sandbox; реальные чужие файлы не перемещались.

По прямому указанию Owner `STOP при непроверенной безопасности или сбое тестов` дальнейшая реализация/qualification остановлена. Failure не скрыт retries, relaxed assertion, cleanup или заменой теста. Следующее исправление должно pin/open stage inode и сравнить зарегистрированные directory/parent identities непосредственно перед publication, включая after-rename readback; затем пройти весь race/crash domain. Само по себе исправление одного assertion не доказывает coupled transaction safety.

## 4. Остальные выполненные проверки

| Команда/проверка | Exit/result |
| --- | --- |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py` после parser, до добавления store safety class | exit0,40tests PASS (36 прежних +4новых parser); не полный regression matrix |
| Local systemd fixture image build | exit0, systemd/dbus установлены только в новой local Docker image |
| Первый systemd preflight | wrapper exit0, но container exit32/BLOCKED: попытка нового mount поверх уже существующего cgroup2; не считается PASS |
| Исправленный private-cgroup fixture setup | systemd PID1 реально running; `systemctl is-system-running --wait` exit1/`degraded`; подтверждена доступность systemd, **не application/boot integration PASS** |
| External fixture Python syntax setup | начальный local quoting SyntaxError исправлен до container invocation; production не затронут |
| Exact source/provenance/old-byte fixture identity | Git/frozen digest проверены локально |

Systemd sandbox использовал только собственные random containers: network=none, private cgroup namespace, read-only container root, ограниченные tmpfs/memory/PIDs и необходимые namespace capabilities. Remount затрагивал только существующий **container-local bind mount** cgroup2; host cgroup mount/settings не менялись. Оба именованных containers удалены с проверкой отсутствия. Созданная local image `aktau-pr86-systemd-fixture:20261102` сохранена как test prerequisite; Docker prune/удаление сторонних ресурсов не выполнялись.

Не выполнены/не объявляются PASS:

- real systemd activation/boot recovery tests нового production code;
- полный coupled source+dependency+14-target transaction/recovery/rollback matrix;
- EBUSY/stale mount/parent races/child-cleanup/reboot/v1-v2 rollback после новых ledger entries для новой реализации;
- новый builder/workflow/final artifact size admission;
- полный Go/Voice/pipeline/ops/security/C2 sweep после изменений;
- Draft PR и exact-new-head CI9.

Предыдущие baseline CI9 и design runtime old→new→old результаты не подменяют эти отсутствующие проверки.

## 5. Mandatory post-deploy verifier — остаётся обязательным, не реализован

Verifier должен выдавать PRODUCTION_SOURCE_RUNTIME_ALIGNED только после независимой проверки exact-main source, pipeline tree/blob identities, mounted graph и underlying tracked checkout, Node/pnpm, C2 authority/12closure hashes и rollback. Он должен проверять фактическое содержимое hidden checkout, а не только Git HEAD.

Выбранный для дальнейшей реализации безопасный read-only подход: отдельный дочерний private mount namespace, recursive-private propagation, снятие bind только внутри этого namespace и чтение underlying tracked files при сохранении shared source exclusion. В parent/production namespace mount не снимается. Должны быть протестированы namespace/propagation isolation, timeout/child cleanup, stamp/hash recheck и отсутствие writes; до этого никакого alignment SUCCESS entrypoint не добавляется. Нельзя выдавать SOURCE_RUNTIME_ALIGNED за C2 3/3.

## 6. Что осталось перед безопасным продолжением

1. Исправить подтверждённый stage-inode CAS defect и повторить fail-first regression без ослабления контроля foreign resources.
2. Завершить v2 policy/descriptor admission, builder/capsule integration, независимую OLD inventory/attestation, mount/actor/boot gate, versioned journal/coupled rollback и строгий read-only verifier.
3. Пройти все обязательные fault cases на real filesystem/mount/systemd, включая конечное состояние послеSIGKILL, unknown states и v1 history.
4. Только после полной qualification — весь regression matrix, независимый exact scope/privacy review, commit/push Draft PR и exact-head CI9. При новом FAIL снова BLOCKED, никакого merge/production.

Нет SSH, VPS/root upgrade/production mount, package install на VPS, sync/ingest, HMAC POST, artifact promotion, AUTO DEPLOY или SLA changes. Reader/ledger/source authority production не читались и не менялись. Public API/DB/parsers/Go/Frontend не изменены.

**BLOCKED_IMPLEMENTATION. Локальный candidate не выпущен. STOP для независимого Code Review обнаруженного safety failure.**


## 7. Isolated staging-inode CAS review — 2026-11-02

**BLOCKED_CAS_DESIGN. Исправление не заявляется реализованным.** Owner разрешил продолжить только этот дефект и потребовал STOP, если инвариант нельзя гарантировать. Исходный незакоммиченный candidate и предыдущая история сохранены; ни одна другая часть Part B не продолжена.

### 7.1 Fail-first и точный source scope

Повторена без изменения assertion команда:

```bash
python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py -k PipelineStoreSafetyTests
```

Exit **1**, **3 PASS / 1 FAIL**, 4 tests. Падает прежний `test_foreign_stage_inode_is_never_renamed_into_registered_capsule`: `foreign staging inode was moved before CAS rejection`. SIGKILL после mkdir, ENOSPC и seal/tamper controls в этом же запуске прошли. Никакого PASS-AFTER нет.

В этом продолжении изменён **только данный report, append-only**. Четыре ранее изменённых source/test/fixture файла побайтово сохранены. HEAD49f6823768817b0390f215de42439cce523bf5d3, branch feat/pr86-offline-pipeline-promotion; никаких stage/commit/push/PR/reset/rebase.

### 7.2 Подтверждённая граница гарантии

`PipelineStore.install()` сохраняет stamp только через callback, затем заново открывает BASE/capsules и публикует именованный source. `Filesystem.directory()` проверяет владельца и отсутствие group/other write на компонентах, но не связывает их с ранее удерживаемыми parent descriptors; эта проверка не является доказательством отсутствия других privileged writers. Сам Store не требует доказательства удержания ingress/runtime/controller locks и durable transaction interlock. Эти существующие production-примитивы не изменялись; v2 production integration по-прежнему отсутствует.

Linux `renameat2(src_dirfd, stage_name, dst_dirfd, generation, RENAME_NOREPLACE)` не принимает expected source inode. Открытый stage descriptor сохраняет доступ к прежнему inode, но syscall всё равно выбирает источник **по имени**. Destination no-clobber не даёт source CAS. Послеrename сравнение обнаруживает ошибку слишком поздно для требования «чужой inode не перемещать». Rename обратно тоже был бы непредусмотренным изменением чужого ресурса/слепым recovery и не выполнен.

Предварительная проверка pinned stage/parents полезна и отклонит уже произошедшую подмену, но оставляет окно между последней проверкой и syscall. `flock` исключает только cooperating writers, а не файловые операции владельца namespace. Root-only0700 исключает непривилегированных writers, **не произвольный root-процесс**. Не утверждается, что непривилегированный атакующий способен выполнить этот сценарий в корректном root-private namespace. Также не утверждается невозможность безопасной публикации при отдельно доказанной модели единственного доверенного writer; сейчас именно эта предпосылка не реализована/не квалифицирована.

### 7.3 Реальный Linux probe, без production

Вне Git сохранены воспроизводимый `rename_cas_probe.py`, `kernel-proof.json`, `before.json`, исторический report prefix и принадлежащие тесту fixtures:

`/home/denis/tmp/aktau-pr86-cas-design-efhw9ffd/`

Команда:

```bash
python3 -B /home/denis/tmp/aktau-pr86-cas-design-efhw9ffd/rename_cas_probe.py
```

Exit **0**, `KERNEL_LIMITATION_REPRODUCED`, **NOT_A_CAS_FIX**. Реальные файловые операции выполнены UID1000 в собственном0700 sandbox: один sandbox owner моделирует privileged namespace writer. Это не тест с настоящим production root/другими UID и не root-custody qualification.

| Контроль | Наблюдение |
|---|---|
| Stage descriptor и оба parent descriptors pinned; directory flock удерживается; подмена после последнего сравнения | rename exit0 переносит заменённый inode; original остаётся доступен через FD/retained path |
| Destination parent заменён после открытия FD | rename exit0 публикует в retained old parent, а не по ожидаемому абсолютному pathname |
| Занятый destination, RENAME_NOREPLACE | return-1/errno17 EEXIST; оба inode остаются на местах |
| Второй cooperating opener пытается взять flock | EWOULDBLOCK; при этом операцию владельца namespace lock не запрещает |

Чужие production ресурсы не открывались/не перемещались/не удалялись. Все перемещённые marker/inode — специально созданные собственные тестовые fixtures, сохранённые для review. Нет автоматического удаления или rollback неизвестных ресурсов.

### 7.4 Альтернативный минимальный design для решения review

Предпочтительный вариант для дальнейшего согласования: отказаться от перемещения завершённого stage по изменяемому имени. После durable intent создавать fixed content-addressed generation сразу через parent-dirfd + mkdir no-clobber, pin её inode, строить/запечатывать graph внутри **ещё не выбранного** private generation. Runtime selection не получает его до полной проверки seal/inventory/custody. Interrupted/foreign generation остаётся невыбираемой и блокирует reuse; никакого автоматического удаления. Это требует явного уточнения approved capsule/journal publication protocol и crash/recovery tests, поэтому здесь не реализовано. Проверка destination collision должна сохранять существующий неизвестный inode нетронутым.

Если review требует сохранить stage→generation rename, необходима явно доказанная модель writer exclusion: существующие три locks, durable intent/interlock, pinned parent/stage descriptors, полная parent-chain custody/no-ACL проверка, запрет запускать callback/child/writer между финальным CAS и syscall, postrename inode proof и сохранение interlock при неопределённости. Должно быть явно согласовано, что процессы с эквивалентной root authority, игнорирующие locks, находятся вне threat model. Нельзя обещать неизменность чужого inode при инъекции такого writer непосредственно перед syscall. Одних новых stat/assertions для такой гарантии недостаточно.

### 7.5 Итог обязательных проверок и STOP

| Проверка | Реальный результат |
|---|---|
| PipelineStoreSafetyTests fail-first, прежние assertions | exit1,3PASS/1FAIL |
| Изолированный kernel semantics probe | exit0, ограничение воспроизведено; не qualification PASS |
| Полный test_publisher_promotion.py после fix | NOT_RUN: fix отсутствует, mandatory safety suite FAIL, STOP |
| Полный test_root_executor_pair_upgrade.py | NOT_RUN: STOP; старый frozen fixture сохранён, full compatibility PASS не заявляется |
| node scripts/ci/run-checks.mjs ops | NOT_RUN: STOP; общий ops PASS не заявляется |
| Diff check / source preservation / report prefix | выполняются отдельно ниже; результаты фиксируются в local integrity evidence |

Нет PR/commit/push, SSH, production mutation, root upgrade, package installation на VPS, mount/systemd/builder/journal-v2/verifier реализации, sync/ingest/HMAC/AUTO_DEPLOY/C2 authority или SLA changes. Следующее действие — независимый review границы writer exclusion и выбранной capsule publication схемы. **BLOCKED_CAS_DESIGN. STOP.**


## 8. Direct unselected generation correction — 2026-11-02

**BLOCKED_GENERATION_STORE.** Работа продолжена только в прежнем worktree/ветке feat/pr86-offline-pipeline-promotion, HEAD49f6823768817b0390f215de42439cce523bf5d3. Owner передал independent approval отказаться от stage→generation rename. Изменения filesystem store начаты, но qualification остановлена на первом after-change test error. Commit/push/PR, SSH или production операций нет.

### 8.1 Threat model и узкий diff

Root/admin доверенные; обычные writers, writable external locations, filesystem corruption и crashes входят в модель. Компрометированный root вне модели. Pinned descriptors/0700/advisory flock не выдаются за абсолютную защиту от root.

В `ops/c2/publisher-promotion.py` заменён только новый локальный PipelineStore: no-follow pinned ancestors, фиксированные private BASE/capsules/state, root ownership и no ACL/xattr, store-local nonblocking directory flock; прямой mkdir content-addressed generation; no-clobber files/symlinks внутри pinned generation; bounded durable resource-intent table, fsync до generation mkdir; no automatic reuse существующего slot. Полная graph validation до seal и после него, seal связывает generation/root identities, graph-stamp digest и intent digest. Runtime selection не открывается/не записывается. Stage→generation rename отсутствует в новом Store.

Это не v2 release journal/selection/transaction: resource intent имеет только filesystem inventory scope. Existing v1 CLI/admission и root helper не менялись; новый store по-прежнему не подключён к production entry. Никаких builder/mount/systemd/boot/verifier изменений.

В `ops/c2/test_publisher_promotion.py` добавлены12focused generation tests, private BASE setup. В `ops/c2/fixtures/pipeline-store-before.json` сохранены точные прежние PipelineStore source и оригинальный failing test с SHA256 для исторического negative evidence. Старый failing test остаётся также в прежней test class без ослабления assertions; адаптация historical harness/остальных старых lifecycle tests под новую модель **не закончена**, их полный PASS не заявляется.

Design Contract скопирован побайтово из предыдущего design worktree в этот worktree и дополнен append-only разделом13, где stage→rename признан superseded. Предыдущий design worktree не изменён. История текущего Part B report сохранена append-only. Ранее изменённые root-helper test и historical executor fixture сохранены без новых правок.

### 8.2 Fail-first / after-change evidence

Команда обоих запусков:

```bash
python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py -k PipelineGenerationSafetyTests
```

| Запуск | Exit | Результат |
| --- | --- | --- |
| Fail-first против прежнего Store |1|12tests,4PASS/8FAIL |
| После filesystem изменения |1|12tests,11PASS/1ERROR |

Fail-first показывает отсутствие generation_created/resource intent и generation-in-place semantics, отсутствие запрета reuse и новых fault boundaries. Assertion не ослаблялся ради PASS.

After-change ERROR: `test_graph_symlink_substitution_is_not_followed`. Callback `graph_ready` делает `node_modules.rename(...)`, но pipeline уже имеет0555, а процесс теста — UID1000 без root CAP_DAC_OVERRIDE. Поэтому Python получает `PermissionError: [Errno 13] Permission denied` внутри test fault injector до того, как новый store мог обработать symlink substitution. Этот результат **не считается PASS защиты** и не доказывает production vulnerability. Нужна корректная изолированная privileged fixture либо явно моделирующий доверенную fault-injection permission transition setup с дальнейшим неизменным assertion. Сейчас это не исправлялось: Owner требует STOP на обязательном FAIL.

11прошедших tests покрывают: generation-in-place без os.rename/replace/selection, foreign existing generation preservation, запрет повторного использования sealed generation, intent presence до generation mkdir, реальный SIGKILL после generation mkdir и blocked retry, parent и generation substitution после создания без последующих graph writes, preseal content corruption, corrupted seal/reinstall rejection, unsafe parent mode и parent symlink. Они не подменяют полный crash/symlink/ENOSPC/partial-graph matrix.

Evidence вне Git: `/home/denis/tmp/aktau-generation-safety-fu3twloi/`:

- `fail-first.log` — полный исходный результат;
- `generation-after.log` — полный11PASS/1ERROR и traceback;
- два исходных report prefixes, before.json;
- копия нового store source и final-integrity.json.

### 8.3 STOP и невыполненные проверки

После error остановлены изменения и запуск дальнейшей mandatory matrix. Не выполнены/не заявляются PASS:

- полный filesystem safety/parser/publisher suite на текущем candidate;
- новый ENOSPC/partial graph/intent fsync-failure/последующий metadata-failure matrix;
- исторический root-helper suite после этой correction;
- `node scripts/ci/run-checks.mjs ops` (default local Node20, ops требует Node24; подбор runtime и запуск не выполнялись после STOP);
- новая root/Linux multi-UID qualification или CI.

`git diff --check`, неизменность обоих report prefixes и frozen helper files проверяются как финальная integrity фиксация, не как qualification generation store. Candidate остаётся незавершённым/unpublished, не для установки. Production reader/ledger/authority/API/DB/publisher/sync не открывались и не менялись. Никаких runtime selection, cleanup неизвестных ресурсов, rollback, HMAC, AUTO DEPLOY, C2 SLA или дальнейшего Part B.

**BLOCKED_GENERATION_STORE. STOP для независимого Code Review.**


## 9. Test-only direct-generation qualification correction — 2026-11-02

**BLOCKED_GENERATION_STORE.** Исправлена qualification основной generation matrix, но следующий обязательный publisher suite завершился ERROR в historical harness. По условию Owner дальнейшие исправления и проверки остановлены. Остальной Part B не продолжался.

### 9.1 Точный diff этого продолжения

Изменены только `ops/c2/test_publisher_promotion.py` и append-only эти два report/contract. Production source `ops/c2/publisher-promotion.py`, frozen historical CAS fixture, historical root-helper test/fixture побайтово сохранены. Все прежние незакоммиченные изменения сохранены, baseline/HEAD49f6823768817b0390f215de42439cce523bf5d3, прежняя ветка/worktree.

Неправильная symlink fault fixture разделена на два независимых теста:

1. **Unprivileged UID**: требует actual geteuid()!=0, выполняет реальную запрещённую rename под0555, требует именно EACCES и неизменность полного graph snapshot/inode/mode/selection sentinel. После запрещённой попытки Store успешно seal/verify обычный graph. Это Linux permission denial, а не обработка Store успешно выполненной подмены.
2. **Controlled privileged-corruption model**: только внутри собственной TemporaryDirectory fixture владелец временно переводит pipeline0555→0700, реально перемещает node_modules и создаёт внешний symlink. Injector явно проверяет is_symlink/readlink/retained directory и выставляет proof flag; finally восстанавливает0555 и проверяет тот же dev/inode/owner/group/mode/no-xattr до возвращения Store. Store получает Linux ENOTDIR от directory no-follow open; тест требует именно этот errno, successful-injection/restoration flags, неизменность external target, отсутствие seal/selection, verify rejection и blocked reuse без cleanup. Injector PermissionError не мог бы дать PASS.

Это разрешённая test-only permission transition, **не actual root/CAP_DAC_OVERRIDE или multi-UID fixture**. Production contract/permissions/Store не ослаблены; root/admin остаётся trusted, compromised root вне модели.

Старые активные SIGKILL/ENOSPC tests адаптированы с stage на unselected generation: durable intent сохранён, generation остаётся на конечном имени, seal/selection отсутствуют, retry отклоняется без изменения ресурсов. ENOSPC injector проверяет реальный открытый FD через /proc/self/fd и не подменяет неиспользуемый теперь Filesystem.write.

Historical CAS negative evidence сохранено в неизменном `fixtures/pipeline-store-before.json` с исходным Store и исходной assertion. Новый harness проверяет оба digest и должен запускать именно frozen OLD code, ожидая только прежний конкретный AssertionError. **Этот harness пока ошибочен: не добавлен binding m в namespace оригинального теста.** Оригинальный frozen assertion не изменялся; skip/xfail не использованы. Его воспроизведение в текущем полном suite НЕ объявляется PASS.

### 9.2 Реальные команды и exit codes

Evidence: `/home/denis/tmp/aktau-generation-qualification-sjqjg2te/`.

| Команда | Exit | Реальный результат |
| --- | --- | --- |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py -k test_graph_symlink_substitution_is_not_followed` до изменения tests |1|1ERROR, исходный PermissionError воспроизведён; fail-first.log |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py -k PipelineGenerationSafetyTests` после test correction |0|20/20PASS,0SKIP; generation-final.log |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py` |1|64tests:63PASS/1ERROR,0SKIP; publisher-final.log |
| `python3 -B -m unittest discover -s ops/c2 -p test_root_executor_pair_upgrade.py` |NOT_RUN|STOP после publisher ERROR |
| `node --version` / `node scripts/ci/run-checks.mjs ops` для Node24 |NOT_RUN|STOP; установленный Node24 найден по пути ниже, version/profile не запускались |

Publisher ERROR: `test_historical_foreign_stage_cas_failure_remains_reproducible`, `NameError: name 'm' is not defined` при вызове frozen original test. Это ошибка нового тестового namespace, не результат security check Store. Известная исправляемая причина зафиксирована; по прямому STOP условию Owner после mandatory ERROR код больше не менялся.

Установленный локальный runtime обнаружен: `/home/denis/.nvm/versions/node/v24.10.0/bin/node`. Версии проекта/зависимости не менялись. Общий ops/root-helper PASS и compatibility не заявляются.

### 9.3 Что покрыли20 targeted tests

Реальные Linux filesystem операции на owned temporary directories UID1000: occupied foreign generation, parent/generation inode replacement, unsafe parent modes/symlink, corrupt graph/seal, partial graph без seal, запрет automatic reuse/cleanup и отсутствие нового selection. Реальный fork/SIGKILL после generation mkdir оставляет intent и unsealed slot.

Fault injection: ENOSPC до первого payload write; реальная partial запись2байт из8 и ENOSPC на следующем вызове; последовательные короткие записи и zero-progress rejection; пять fsync EIO точек — intent file, state directory, graph file, seal file, generation directory после появления seal. Ошибка не подавляется, intent/partial resources сохраняются, повторная установка отклоняется, selection не меняется. Ошибки ENOSPC/EIO моделируются на конкретных FD; реальное исчерпание диска/power loss не проводились. При EIO не заявляется durability; проверены propagation/no-cleanup/no-selection, не готовность generation после failed durability barrier.

Проверена фактическая последовательность успешных fsync intent file→state directory до generation mkdir и конфликт store-directory flock без writes. Advisory lock не заявляется защитой от root, игнорирующего lock. Эти результаты относятся только к store; journal-v2/source+dependencies+14-target rollback, mount/systemd, builder, verifier не реализовывались/не квалифицировались.

### 9.4 Integrity и STOP

Исторические префиксы обоих документов, production source/frozen fixtures/root-helper tests и git diff --check проверяются в final-integrity.json. Это integrity evidence, не замена невыполненным обязательным suites. Никаких commit/push/PR, SSH/VPS, root upgrade, production mutation, sync/HMAC, runtime selection, AUTO DEPLOY или C2 SLA changes.

Следующий узкий шаг после разрешения продолжить — корректно связать namespace frozen historical assertion с m и повторить publisher→historical root-helper→Node24 ops. **BLOCKED_GENERATION_STORE. STOP для независимого review.**


## 10. Historical CAS harness isolation correction — 2026-11-02

**BLOCKED_GENERATION_STORE.** Исправлена текущая CAS harness ошибка; Generation20/20 и Publisher64/64 прошли. Однако следующий обязательный historical root-helper suite завершился30PASS/1ERROR. В соответствии с прямым STOP Owner дальнейшие правки и Node24 ops не выполнялись. Полная qualification НЕ завершена.

### 10.1 Scope и неизменность

Продолжена та же branch feat/pr86-offline-pipeline-promotion/worktree, HEAD49f6823768817b0390f215de42439cce523bf5d3. Изменены только `ops/c2/test_publisher_promotion.py` и append-only данный report/Design Contract. Production publisher/Generation Store, root helper/его tests, historical fixtures сохранены побайтово относительно начала этого продолжения. Существующий untracked `report md files.zip` не открывался для изменения, не удалялся и не включён в scope.

### 10.2 Минимальное корректное связывание historical module

Fail-first воспроизвёл ровно `NameError: name 'm' is not defined` в original frozen assertion. Простая привязка m к текущему publisher была бы неправильным исправлением.

Новый harness создаёт отдельный ModuleType и исполняет **полный исторический OLD publisher**. Чтобы не дублировать72KiB source в ещё одной fixture, текущий файл используется только как compression basis: его PipelineStore заменяется точным frozen class, восстанавливается исходный separator и **до exec проверяется полный SHA256 исходного OLD-модуля** `ef30e25b620633895d8778654b860942afb02e65e3a54fa1e1865efacaffc026`. Этот digest совпадает с сохранённым before.json предыдущего generation correction. Если любая общая часть текущего source изменится, reconstruction будет отвергнут; исполнения смеси implementations нет.

Пины неизменны:

- frozen Store SHA256: `253a6f6cb839dffa41f6d39b6e0096bb7dff9f22ba6110d97056ca413420965e`;
- original assertion SHA256: `00fb6557bdafed44120883570272190bbf4080b0fcd8787ada1080bb347a3d5b`.

Проверяются pinned digests, а не только самодекларированные fixture поля. Оба отрицательных subcase меняют source и пересчитывают его metadata digest: это всё равно отвергается до exec. Отдельный negative binding control отвергает текущий m. Ни NameError, ни generic exception не могут удовлетворить positive control.

Original assertion получает `m=old_module`, отдельный unittest receiver с old.Filesystem/old.PipelineStore и observer journal на old.canonical/old.Filesystem. У этих классов и Blocked иная object identity, чем у текущего publisher; проверены __globals__ Store/Filesystem именно OLD module. Оригинальный negative test source не менялся. Ожидается только точный AssertionError `False is not true : foreign staging inode was moved before CAS rejection`; независимо проверяются foreign marker в перемещённом capsule и retained original staging directory. Это historical negative evidence старого Store, не ослабление новых invariants и не xfail/skip.

### 10.3 Реальные команды / результаты

Evidence: `/home/denis/tmp/aktau-generation-historical-1tfj58gm/`.

| Команда | Exit | Реальный результат |
| --- | --- | --- |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py -k test_historical_foreign_stage_cas_failure_remains_reproducible` до правки |1|1ERROR/NameError, fail-first.log |
| Та же historical команда после исправления |0|1PASS с отрицательными binding/fixture subcases, historical-final.log |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py -k PipelineGenerationSafetyTests` |0|20/20PASS,0SKIP, generation-final.log |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py` |0|64/64PASS,0SKIP, publisher-final.log |
| `python3 -B -m unittest discover -s ops/c2 -p test_root_executor_pair_upgrade.py` |1|31tests:30PASS/1ERROR,0SKIP, root-helper-final.log |
| `export PATH="/home/denis/.nvm/versions/node/v24.10.0/bin:$PATH"; node --version; node scripts/ci/run-checks.mjs ops` |NOT_RUN|STOP после обязательного root-helper ERROR |
| `git diff --check` |0|PASS, финальная integrity проверка |

Duplicate promotion.tar warning в publisher log — deliberate malformed ZIP negative fixture; suite exit0. Результаты других ранее выполненных matrices не подменяют отсутствующий общий ops PASS.

### 10.4 Точный новый blocker: historical source factory fixture

Ошибка: `test_root_executor_pair_upgrade.SourceTests.test_real_reviewed_bytes_through_fixed_factory`, `pair_upgrade.Blocked: reviewed_source_metadata`.

Read-only inspection показала: SourceTests.api() всё ещё читает mutable рабочий `publisher-promotion.py`, маркируя эти bytes как содержимое исторического reviewed SOURCE. Root helper source_verified() правильно требует фиксированный размер59455 и digestd69c667…; текущий файл имеет **82236bytes**, digest **4dd848631a6f0f8104840adaaa2eb589dae1d69c07d743cf433a5c5db6d028de**. Он не является историческим59455-byte artifact, поэтому root helper корректно fail-closed отклоняет metadata до проверки bytes.

В immutable `fixtures/pair-upgrade/executor-after.json` уже сохранены нужные59455bytes с точным SHA256d69c667212b2a6c8a25081ccdc90f798024e850784262976e06e45ce13f45118. Транзакционные helper tests используют эту fixture и прошли; SourceTests factory mock/positive assertion остались привязаны к текущему source. Это ограничение test fixture, не доказанный production дефект helper; helper/pins/trust checks ослаблять нельзя.

По указанию STOP после любого обязательного FAIL/ERROR исправление этого отдельного root-helper test здесь не выполнялось. Следующий узкий шаг — отдельно разрешённая test-only адаптация исторического SourceTests API mock и expected bytes на точные frozen reviewed bytes, затем повтор полного helper и Node24 ops. Production helper и approved pins менять не требуется/не разрешается.

### 10.5 Integrity и оставшиеся границы

До/после digests production source/frozen fixtures/root-helper test и префиксы обоих reports проверены в final-integrity.json. Full Stage B transaction/builder/mount/systemd/journal-v2/verifier не продолжались. Actual root/multi-UID qualification и physical power-loss/ENOSPC tests не заявляются сверх ранее описанных fixture fault injections. Generation Store не подключён к CLI/admission/selection;64tests PASS не является production или C2 acceptance.

Никаких commit/push/PR, SSH/VPS, root upgrade, production mutations, sync/HMAC, C2 SLA/authority/AUTO DEPLOY изменений. **BLOCKED_GENERATION_STORE. STOP для независимого review.**


## 11. Historical SourceTests factory correction — 2026-11-02

**GENERATION_STORE_SAFETY_READY_FOR_REVIEW.** Все обязательные проверки этого ограниченного test-only продолжения прошли. Это readiness **Generation Store filesystem qualification**, не завершение Part B, не release authorization, не production alignment и не C2 PASS. Предыдущие BLOCKED entries сохранены как историческое evidence, а не переписаны.

### 11.1 Scope и RCA

Та же branch feat/pr86-offline-pipeline-promotion, HEAD49f6823768817b0390f215de42439cce523bf5d3, прежний worktree. SourceTests.api() ошибочно обслуживал GitHub `contents?ref=8cff133…` bytes из mutable рабочего дерева. Root helper корректно требовал59455-byte reviewed executor d69c667… и fail-closed возвращал reviewed_source_metadata. Source/helper/security policy не нуждались в ослаблении.

Только этот incremental diff:

1. `ops/c2/test_root_executor_pair_upgrade.py`: fixed historical fixture loader, independent size/SHA256 checks до mock metadata, положительный expected result — frozen bytes, два negative tests. Старые CI/source/path/size/digest/encoding/unavailable-authority checks сохранены.
2. Новые `ops/c2/fixtures/pair-upgrade/workflow-reviewed.json` и `builder-reviewed.json`: точные public reviewed bytes из Git object SOURCE8cff133be30a8c31f4d5e06d297dcf9af5e97847, line arrays с сохранёнными line endings. Tests больше не читают рабочие workflow/builder для historical responses.
3. Append-only этот report и тот же Design Contract.

Existing executor-after.json, executor-before.json/policy fixtures, historical CAS fixture/assertion, publisher/Generation Store, root helper, test_publisher_promotion.py не изменены в этом продолжении. Approved pins и security policy не менялись. Все предыдущие незакоммиченные изменения сохранены. Owner-added untracked report ZIP не изменялся/не удалялся и не входит в qualification scope.

### 11.2 Immutable fixture identities

| Historical path | Decoded bytes | SHA256 |
| --- | --- | --- |
| ops/c2/publisher-promotion.py |59455|d69c667212b2a6c8a25081ccdc90f798024e850784262976e06e45ce13f45118 |
| .github/workflows/sync-publisher-build.yml |3929|1d7764798c1c78ac616e4615ef46ba7fd810b1f192692318cdf1a3aa66da6312 |
| scripts/ops/build-sync-promotion.py |5211|308504c27ee7ceed871b1044d88a20a1f45a9525c9e4f3cca9d9b8382240b9b4 |

Loader проверяет list-of-strings shape, decoded length и закреплённый полный digest **до** создания base64/size metadata. Эти constants независимы от ответа mock и от вызова production source_verified. Сам production verifier дополнительно применяет неизменённые approved constants. Только executor fixture существовала ранее; новые workflow/builder arrays извлечены read-only `git show <SOURCE>:<fixed-path>` и сверены с approved hashes, без checkout/build/network.

Новые negative tests: каждый из3 frozen sources повреждается без изменения длины на уровне fixture read; independent digest guard должен отклонить ответ до формирования successful metadata. Отдельный mock подменяет historical executor текущими рабочими bytes с согласованными base64/size — неизменный production verifier отвергает reviewed_source_metadata. Это не successful-response подмена и не ослабление audit/authority checks. Положительный тест по-прежнему требует ровно5authority calls и сравнивает source_verified с independently validated frozen executor bytes.

### 11.3 Fail-first / pass-after и обязательные команды

Evidence: `/home/denis/tmp/aktau-historical-source-factory-f9vvf9rr/`.

| Команда | Exit | Результат / log |
| --- | --- | --- |
| `python3 -B -m unittest discover -s ops/c2 -p test_root_executor_pair_upgrade.py -k test_real_reviewed_bytes_through_fixed_factory` до изменения assertions/mock |1|исходный reviewed_source_metadata ERROR воспроизведён; fail-first.log |
| `python3 -B -m unittest discover -s ops/c2 -p test_root_executor_pair_upgrade.py` после correction |0|33/33PASS,0SKIP; root-helper-final.log |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py -k PipelineGenerationSafetyTests` |0|20/20PASS,0SKIP; generation-final.log |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py` |0|64/64PASS,0SKIP; publisher-final.log |
| `export PATH="/home/denis/.nvm/versions/node/v24.10.0/bin:$PATH"; node --version` |0|v24.10.0; node-version.log |
| `node scripts/ci/run-checks.mjs ops` с тем же PATH |0|полный profile:220Python tests PASS +185Node tests PASS,0SKIP; ops-final.log |
| `git diff --check` |0|PASS |

Числа перекрываются между focused/full/profile runs и не суммируются как уникальные tests. Ops реально выполнил полный installer/custodian/helper Python discovery и существующие Node ops/local HTTPS lifecycle regressions, не только отдельный новый тест. Duplicate promotion.tar warning сохранён как deliberate malformed ZIP negative fixture; suite PASS по exit0/summary, warning не скрыт. Ни SKIP, ни pending CI не объявляются PASS. Зависимости/версии проекта не менялись, production endpoints не использовались.

### 11.4 Integrity и remaining gaps

Сохранены префиксы обоих reports, точные hashes production publisher/root-helper/test_publisher и ранее frozen fixtures. Новые fixture decoded hashes проверены выше. Финальные source-preservation/diff/scope hashes — final-integrity.json вне Git.

Уже прошедшая20-test Generation matrix сохраняет оговорённые границы: реальные owned Linux filesystem operations/SIGKILL, разрешённый test-only privileged-corruption permission transition, syscall fault injection ENOSPC/EIO; не physical power-loss/full-disk, не actual compromised-root protection. Historical CAS negative evidence воспроизводится на отдельно pinned OLD module и не подменяет positive generation safety. Store остаётся unselected и не подключён к v1 CLI/admission.

Остальной Part B **не продолжался и не готов**: builder/artifact integration, runtime/mount selection, systemd/boot integration, journal-v2/source+dependency+14-target coupled rollback, baseline enrollment/authority и post-deploy verifier не реализованы/не квалифицированы. Общая Part B crash/rollback/production readiness не следует из текущего ops PASS. Полный Go/Voice/pipeline/PG17/C2 sweep и hosted CI9 для этой test-only correction не требовались и заново не выполнялись.

Никаких commit/push/PR, SSH/VPS, root upgrade, production mutation, sync/ingest/HMAC, AUTO DEPLOY, C2 SLA/authority changes. **GENERATION_STORE_SAFETY_READY_FOR_REVIEW. STOP для независимого Code Review; не переходить к остальному Part B автоматически.**


## 12. Part B2 — offline Artifact v2/source admission candidate, 2026-11-03

**BLOCKED_ARTIFACT_V2.** Реализация B2 начата, но обязательный real builder integration завершился exit1/BLOCKED_BUILD. По Owner STOP после обязательного FAIL дальнейшие исправления и suites не выполнялись. Candidate неполный, не готов к publication/production. Ранее принятая Generation Store qualification остаётся исторически принятой и не переименовывается в завершение B2.

### 12.1 Preflight, сохранность и scope

Fresh `git fetch origin`: HEAD и origin/main остались49f6823768817b0390f215de42439cce523bf5d3. Та же branch feat/pr86-offline-pipeline-promotion/native worktree. Предыдущие uncommitted changes/reports сохранены, нет checkout/reset/rebase/stash/commit/push/PR. Owner-added `report md files v3.zip` оставлен нетронутым.

Generation Store class сохранён **побайтово** (AST source segment сравнен с сохранённым generation_store.py прежнего evidence). Frozen CAS class/assertion и historical helper fixtures не редактировались. Root-helper/policy/authority,14 C2 paths, reader/ledger/production не менялись.

Incremental source candidate:

- `ops/c2/test_publisher_promotion.py`: historical CAS loader теперь читает независимо сохранённый **полный** OLD module из `ops/c2/fixtures/pipeline-store-old-module.json`; полный SHA256ef30e25b620633895d8778654b860942afb02e65e3a54fa1e1865efacaffc026 сохраняется как pre-exec guard. Текущий mutable publisher больше не используется даже как reconstruction basis. Новый полный fixture восстановлен до B2 edits и сверён с прежним independently pinned digest; source/assertion negative checks не ослаблялись. Этот изменённый harness после B2 ещё не запускался.
- `ops/c2/publisher-promotion.py`: bounded version-dispatched outer16-member v2 TAR/parser с descriptor/capsule hashes, точными Node/pnpm/platform/tree/package/lock/version/count identities и runtime-package versions; legacy14-member v1 inventory сохранён. Добавлена isolated object-store `source_admission_v2`: Git objects/bundle inspection без checkout, exact baseline ancestry/tree/lock/protected checks и tracked pipeline/closure bytes. **Source admission ещё не квалифицирован.**
- Production admission и direct Transaction.promote явно отвергают v2 (`artifact_v2_activation_disabled`) до transaction/authority/source switching. V1 source/protected/dependency gates не разрешают новый runtime transition. Существующий network producer/CI/ZIP policy flow не ослаблялся.
- `scripts/ops/build-sync-promotion.py`: unprivileged Linuxamd64-only dependency preparation, pinned pnpm distribution digest, frozen install с ignore-scripts/ignore-pnpmfile, полный graph с pinned CLI, runtime/native probes, indexed capsule, v2 descriptor и bounded TAR/qualification-ZIP checks до output publication. **Builder integration FAIL; эти части не считаются проверенными/завершёнными.**
- `.github/workflows/sync-publisher-build.yml`: явные unprivileged Linuxamd64 и final256MiB TAR checks. Новые producer bytes не включены в root policy; installed production authority не менялась. Workflow не запускался.
- Новый `ops/c2/test_pipeline_artifact.py`: fixtures/tests v1-v2 dispatch/descriptor/source IDs/hashes/version types/TAR extras/malformed/links/traversal/runtime version/activation barrier. Часть focused tests прошла; последние добавленные tests ещё NOT_RUN после STOP.
- Append-only этот report и существующий Design Contract.

### 12.2 Реальные команды и результаты

Evidence: `/home/denis/tmp/aktau-b2-artifact-d1crwufq/`.

| Команда/проверка | Exit | Реальный результат |
| --- | --- | --- |
| `git fetch origin` / HEAD+origin/main |0|49f6823768817b0390f215de42439cce523bf5d3 без drift |
| `python3 -B -m unittest discover -s ops/c2 -p test_pipeline_artifact.py` fail-first |1|5tests,16errors/subtest errors; v2 parser/descriptor/activation barrier отсутствовали; fail-first.log |
| Та же focused команда после первоначального parser implementation |0|5/5PASS; focused-after.log |
| Та же focused команда после builder integration edits, до добавления последних3tests |0|5/5PASS; focused-final.log |
| Real builder command через run-build.py ниже |1|BLOCKED_BUILD; builder-integration.log, builder-result.json |
| Полный текущий8-test artifact suite, Publisher/Root-helper/Ops/Pipeline regressions |NOT_RUN|STOP после обязательного integration FAIL |
| `git diff --check` |0|финальная integrity проверка |

Последние3 test methods (unapproved graph version/self-consistent hashes, malformed outer types/extra/capacity, v1 payload smuggling) добавлены перед builder run, но не запускались после него. Их нельзя засчитывать PASS. Producer/CI negative regression coverage старого suite сохранён, но полный suite на новом candidate не запускался.

Фактический real builder invocation:

```text
python3 -B scripts/ops/build-sync-promotion.py
  49f6823768817b0390f215de42439cce523bf5d3
  /home/denis/tmp/aktau-b2-artifact-d1crwufq/promotion.tar
  1 1 2 1 build-only
```

Это local integration с **явно синтетическими producer IDs**, не authenticated GitHub artifact и не release approval. Runner использовал non-root UID1000, PATH с существующим cached Go1.27.3 toolchain и pinned public Node24.18.0 из design evidence, GOTOOLCHAIN=local. Runtime secrets/env не передавались. Никаких pnpm/root install на VPS или source checkout. Предварительное обнаружение system Go1.27.1 не скрывалось; для integration выбран существующий cached1.27.3.

### 12.3 Builder failure: доказанное и неизвестное

Builder CLI вернул только `BLOCKED_BUILD`, exit1. Его старый catch-all handler не сохраняет stage/error enum, subprocess stderr тоже подавлен. **Точное место первого FAIL этого invocation не доказано**, поэтому ни Go build, ни pnpm install/runtime/capsule/source-admission steps отдельно не объявляются PASS. Повторный builder/installer для диагностики после STOP не запускался.

Отдельно read-only inspection реального `git archive ... pipeline` доказал ошибку нового guard: первый member имеет name **`pipeline`**, isdir=True, тогда как prepare_pipeline требует `member.name.startswith('pipeline/')` для всех members. Поэтому такой guard детерминированно отклонит валидный root directory при достижении этой стадии. Это подтверждённый local source defect, но без stage trace нельзя утверждать, что именно он был первым fail в текущем builder run. После обязательного FAIL не исправлялся.

Следующий узкий fix должен: разрешить только точный root member pipeline/isdir наряду с безопасными descendants; добавить safe closed-enum builder stage/reason diagnostics без stdout raw payload/credentials; воспроизвести/устранить фактическую причину до повторения mandatory integration. Это не основание увеличивать archive caps или bypass source/producer checks.

### 12.4 Artifact size, activation и remaining gates

`promotion.tar` не создан. Реального final artifact/ZIP размера или SHA256 нет; старые260.5MB estimates не подменяют требуемое измерение. Limits256MiB outer ZIP/TAR,96MiB capsule,90MiB logical не менялись. Qualification ZIP builder — только локальная size check, никогда не GitHub original ZIP/provenance.

Source admission function остаётся offline candidate; она не даёт root approval и не подключена к activation. Никаких source checkout, mount/runtime selection, authority writes, journal-v2/source+dependency+14-target transaction, root upgrade или OLD baseline enrollment. Отдельная activation barrier требуется до будущей полной source/dependency/C2 rollback qualification.

После устранения builder blocker нужны: полный8-test focused и source-bundle negative cases, actual complete artifact/capsule/runtime/native/package graph и size measurements; полные Publisher/Root-helper/Ops/Pipeline regressions; workflow/builder integration и повторная safety/provenance review. Никаких CI/PR/production PASS для этой части пока нет. Historical Stage B1 accepted tests не выданы за B2 results.

Нет SSH/VPS, merge/production changes, manual sync/ingest/HMAC/AUTO DEPLOY/C2 SLA/authority changes. **BLOCKED_ARTIFACT_V2. STOP для независимого Code Review.**


## 13. One-shot Part B completion and local qualification — 2026-11-03

Status: **PART_B_SOURCE_READY_FOR_INDEPENDENT_REVIEW**. This is an uncommitted,
source-only candidate, not an installed release or production acceptance.
Branch `feat/pr86-offline-pipeline-promotion`; HEAD / fetched origin/main:
`49f6823768817b0390f215de42439cce523bf5d3`. Previous failed qualification and
historical report sections are retained. Active internal schemas and the precise
systemd namespace handoff are specified in Design Contract §18.

### B2 — bounded builder and independently authenticated admission

The real Git archive begins with directory `pipeline`; the former guard rejected
that legitimate member. The replacement accepts precisely that directory and
bounded descendants, rejects duplicates, alternate roots, traversal, PAX and
unexpected types, and reports closed build-stage/reason enums. Further real
builder qualification exposed official pnpm's inactive cross-platform native
reflink files: the exception is restricted to four independently indexed inactive
files, with active Linux ELF checks retained. No install hooks or pnpmfile run;
no raw subprocess payload is emitted. Bounded subprocess groups are reaped.

The new version-2 outer TAR has exactly 16 regular members. A strict descriptor
binds exact source, PR86 tree/package/lock, Node/pnpm/Linux identities, inventory
and capsule. Version 1 retains its 14-member format. Source admission checks the
actual Git bundle and precisely the approved contracts-lock pair; other protected
changes remain blocked. The private root proof is constructed only following
independent GitHub original archive, producer, main and CI verification. An
uploader cannot supply that proof. Policy v1 cannot admit dependency switching.

Real Linux/amd64 non-root local builds (synthetic build-only CI identifiers):

| Build | TAR bytes | SHA256 | qualification ZIP bytes |
| --- | ---: | --- | ---: |
| OLD v1 | 172400640 | `4e504d0a65d3bea0da90202919db2914e07ce1f5f2b0bd17504f615f3884b971` | 72296613 |
| Current v2 | 261130240 | `a0725cc1ae7a783da17bf62d29bff20e8372cc98370355d7c2ec8a3844295f7a` | 93475038 |

The v2 TAR is below 268435456 bytes, with 7305216 bytes remaining. Caps were not
raised. Node v24.18.0, pnpm 10.32.1 and Go 1.27.3 are pinned. These local build-only
artifacts contain committed baseline source, not the uncommitted producer changes;
they are qualification inputs, **not a future production authorization**. A new
reviewed source SHA, hosted CI and authenticated artifact are mandatory later.

### B3 — direct generation and coupled rollback

The previous stage-to-generation rename design remains superseded. Direct
root-private content-addressed generations use durable registration before mkdir,
pinned descriptors, no-clobber, full graph verification before and after seal,
and no automatic cleanup/reuse of unknown generations. Frozen historical CAS
source/assertion bytes remain independent of current code.

The real 740-directory graph exposed a descriptor-lifetime error: construction
and verification descriptors overlapped and exhausted the process FD budget.
Construction descriptors now close after chmod/fsync while pinned anchors remain;
independent post-seal verification then succeeds without increasing OS limits.

Version-2 journal couples actual Git source, selected dependency mount and all
original 14 C2 targets. Fixed resources retain the authenticated bundle, manifest,
descriptor, capsule, twelve payloads and rollback backups. Child PID/start/boot
identity is durable before exec. Unknown cleanup, torn pending files, inode/CAS
mismatch or live-child uncertainty retain interlock and resources. Fail-first
fsync-EIO testing found that pending metadata could previously permit another
promotion; unknown-pending admission now rejects it before writes. Rollback
receipt replay is allowed only for identical already-committed bytes, never an
overwrite. Restored mount identity is retained across interrupted recovery.

Historical v1 `last.json` has only `identity`, without a version field. Its exact
shape is preserved. Independently completed enrollment additionally binds the
specific legacy terminal receipt name and SHA256. Legacy dependency-unbound
rollback fails closed. Reader and latest ledger entries survive rollback.

Real OLD→NEW→OLD qualification used actual Git, root-private bundle FD, distinct
UID1999, both public dependency graphs, actual ELF binaries and all 14 targets.
Enrollment/CI authorization were explicitly synthetic isolated test fixtures.
No production trust record was created.

### B4 — immutable runtime and real systemd qualification

Fixed `pipeline-pnpm` accepts only the six approved script argv families,
checks actor/source/mount/authority, rejects environment injection, and invokes
the pinned pnpm graph without NODE_PATH. Actual Node/ESM imports and execution
verified Zod4.6.7, tsx4.23.15, esbuild0.28.2, undici7.30.1, one Linux native addon
and 25 Dina/Dana/Fix Price fixture products. All six shim argv passed the real
boundary using a test execution sink; business sync was not run.

A real mount fail-first reproduced following an operator-owned target symlink.
Mount source/target now use pinned no-follow descriptors and exact ownership,
mode and identity checks. ENOSPC, EBUSY, foreign parents/inodes, graph tamper,
SIGKILL boundaries, partial writes, stale seals and unknown resources are tested.
The root integration includes 23 individual v2 crash boundaries, including all
14 target replacements. These are actual disposable filesystem/mount operations.

Real systemd PID1 testing found `/proc/1/ns/mnt` access unavailable under the
bounded service capabilities. No CAP_SYS_PTRACE was granted. Systemd OpenFile
passes only `/proc/1/ns/mnt:host-mount:read-only`; the service validates manager
PID, FD count/name/type/access and current namespace inode, consumes fd3, and
retains a CLOEXEC duplicate. This requires systemd >=253. Both actor units waited
at the dependency barrier, then the root oneshot restored the committed mount
and both read-only actor gates exited 0. Actor capabilities after UID drop were
zero. Custodian isolation and timer schedules are unchanged.

Container setup failures (missing fixture FOWNER/SETPCAP, private cache path,
then namespace FD permission) are retained in evidence, separately from source
fixes. Only owned container namespaces/cgroups were used. **Actual kernel reboot
was NOT_RUN**; service startup/mount reconstruction is not reboot evidence.

### B5 — read-only verifier and OLD baseline boundary

Fixed root read-only verifier checks source/tree, mounted inventory and seal,
Node/pnpm, 12/12 closure, C2 authority, retained release and reader/ledger custody.
Underlying checkout is inspected only in a bounded private child mount namespace;
parent runtime mount remains intact. Unknown hidden files, timeout/cleanup and
tamper fail closed. The actual-artifact sandbox returned
`PRODUCTION_SOURCE_RUNTIME_ALIGNED`, `c2Acceptance=NOT_MEASURED`.
This is a **sandbox result, not VPS evidence**.

Read-only OLD input capture uses pinned no-follow descriptors and bounded hash,
link, mode, owner and inode inventory. It always reports
`LEGACY_DEPENDENCY_INPUT_NOT_AUTHORIZED`; an installed node_modules tree is not
self-authenticating. A synthetic public fixture captured 4813 entries, rejected
unknown private paths without reading them, and detected altered Zod. Real VPS
OLD baseline and independent authorization remain unavailable and unmodified.

### Executed qualification and limits

Commands ran from this worktree. Full logs, failed iterations, scripts and exit
records are in `/home/denis/tmp/aktau-part-b-one-shot-6wst5sq4`.
Node ops used v24.10.0; artifact runtime remained v24.18.0. Go used 1.27.3.
Counts below overlap; they must not be summed as unique tests.

| Actual command / qualification | Result / exit |
| --- | --- |
| `node scripts/ci/run-checks.mjs ops` | 259 Python + 186 Node PASS; 0 SKIP; exit0 (`ops-current-qualified.log`) |
| Python publisher suite / generation subset | 64/64 and 20/20 PASS, included in current ops |
| Python historical root-helper suite | 33/33 PASS, included in current ops; helper implementation untouched |
| `node scripts/ci/run-root-bundle-integration.mjs` | 71 real root/helper/installer + 10 Linux mount tests PASS; 0 SKIP; see final exit record |
| `python3 -B .../run-full-artifact.py` | actual OLD→NEW→OLD, graph runtime, v1 enrollment baseline, read-only verifier PASS; exit0 |
| `python3 -B .../run-systemd.py` | real systemd root oneshot and both waiting actor gates SUCCESS/exit0 |
| C2 full Node tests with local Go1.27.3 relayprobe | 377/377 PASS, 0 SKIP; `c2-final-2.log`, exit0 |
| `node scripts/ci/run-checks.mjs pipeline` | frozen install, pipeline tests, typecheck PASS; exit0 |
| `go test -count=1 ./...` (backend-go) | PASS; exit0 |
| `go test -race -count=1 ./...` (backend-go) | PASS; exit0 |
| `go vet ./...` (backend-go) | PASS; exit0 |
| `node scripts/ci/run-checks.mjs security` | policy/secret guards and synthetic backup guards PASS; exit0 |
| `node scripts/revalidation/verify-part16.mjs` | PASS; exit0, not production evidence |
| contracts profile | lint + 12 PASS, **10 fixture HTTP SKIP**; exit0, not 22 executed PASS |
| Nest profile | generate/build/audit + 28/28 PASS; exit0 |
| frontend profile | lint/typecheck/build/audit + 278 unit PASS; E2E 57 PASS, **11 SKIP**; exit0 |
| `node scripts/ci/run-db-integration.mjs` | disposable PG17 migrations/integration/C2 real CLI/FIFO/READY/COMMIT/AFTER PASS and cleanup; exit0 |
| `node scripts/ci/run-ephemeral-staging.mjs` | API healthy/non-root/read-only, DB outage/recovery without API restart and cleanup PASS; E2E 14 PASS, **6 SKIP**; exit0 |
| Python AST / JS syntax; `git diff --check` | PASS; exit0, integrity record in review archive |
| Hosted CI9 for changed source | **EXTERNAL_GATE_NOT_RUN**, no publication authorized |
| Actual kernel reboot; production inventory/promotion/C2 | **NOT_RUN** |

First C2 sweep used a nonexistent relayprobe path and failed; the correct existing
`backend-go/internal/revalidation/testdata/relayprobe` was built and the full
377-test rerun passed. Optional contract/frontend/staging skips are retained and
are not presented as production, physical Siri or zero-skip qualification.

### Exact scope, preservation and next gates

The review archive contains `review/manifest.json`: each reviewed source path,
changed/new status, purpose, applicable checks and SHA256; `review/diff.patch`
contains the full tracked binary diff. The manifest is the exact file list,
including required new tests and frozen fixtures. No Go, frontend, parser,
contracts, DB, API or dependency lock source was modified. Historical frozen
fixtures and the Owner's unrelated ZIP remain byte-identical. Both report
prefixes and existing README/handoff history are preserved append-only.

Archive path:
`/home/denis/tmp/aktau-part-b-source-review-20261103-6wst5sq4.tar.gz`.
Archive SHA256 and safe-member/byte-match checks are recorded alongside it and
returned to Owner; the digest is not embedded recursively inside the archive.
Large generated build TARs, node_modules, private environment, TODO, .git and
Owner's ZIP are excluded. Evidence retains initial failures as well as final PASS.

Remaining release gates, in order: independent source review → authorized commit
and PR → exact-new-main CI9 → real kernel boot qualification where available →
separate authorized bounded VPS OLD inventory → independent actual OLD enrollment
and exact-purpose new root bootstrap/pins review → authenticated new immutable
artifact → separately authorized production transaction/readback. Historical
consumed helpers cannot be reused. Artifact size headroom is only about 6.97 MiB;
future source changes must pass the same cap. Root/admin is trusted; this does not
claim resistance to a compromised root. No SSH, production mutation, source
publication, approval, AUTO DEPLOY or artificial C2 events were performed.


## 14. Independent-review P1 capacity corrections — 2026-11-03

**SOURCE_CAPACITY_GATES_READY_FOR_INDEPENDENT_REVIEW**. The independent review
remains CHANGES_REQUESTED until a new external decision. Nothing is installed,
committed or published. Branch and HEAD remain
`feat/pr86-offline-pipeline-promotion` /
`49f6823768817b0390f215de42439cce523bf5d3`; fetched origin/main is the same SHA.
Execution scope is §6 of `PART_B_INDEPENDENT_CODE_REVIEW_20261103.md`.
Historical report/contract prefixes, frozen fixtures and unrelated Owner ZIP are
preserved byte-for-byte. Prior source-only gates have not become production PASS.

### Reproduction and minimal correction

Two new tests first failed against the reviewed code with **Blocked not raised**:
(1) host MemAvailable large but cgroup headroom insufficient, (2) target-parent
filesystem has no free space while BASE is healthy. Command:
`python3 -B -m unittest discover -s ops/c2 -p test_pipeline_release.py -k CapacityAdmissionTests`.
Fail-first exit1 and complete output are retained as `capacity-fail-first.log`.
The original assertions were retained; final expanded capacity matrix is12/12,
exit0 (`capacity-final-root.log`).

Only these implementation/test files changed since the reviewed archive:

- `ops/c2/publisher-promotion.py`: cgroup-aware memory admission, explicit peak
  buffers, fixed per-device disk plan and bounded source pack/tree accounting;
- `ops/c2/test_pipeline_release.py`: twelve focused capacity regressions;
- `ops/c2/pipeline_runtime_integration.py`: actual separate tmpfs capacity test.

The same Part B Report and Design Contract are appended, with active capacity
rules in Contract §19. No journal fields, artifact version, authority, root pin,
rollback semantics or runtime selection mechanism was changed by this correction.
No source outside these five paths changed since this review cycle began.

Memory headroom is the minimum of kernel MemAvailable and all finite visible
cgroup-v2 ancestor `memory.max - memory.current` values, with an additional64MiB
reserve. Missing child data, unsupported hierarchy and malformed budgets fail
closed. The real kernel hierarchy root without both limit interfaces is handled
only after controller/interface validation, not as a child fallback. No swap is
counted. Combined ingress peak covers input/read copies, TAR buffers, capsule
parsing/materialization and interpreter/inventory overhead. No cap was raised.
The production operator must verify visibility of the controlling hierarchy;
this check is not a kernel memory reservation against later unrelated pressure.

Disk admission runs before release intent/mkdir. A pinned-descriptor plan covers
BASE, releases, capsules, state, mounts, each real target parent, selection and
mount-record parents, publisher checkout and Git object storage. Each real
st_dev accumulates file/block/inode high water: retained payload + materialized
generation + old backups + new staged copies + possible rollback restore +
metadata/pending copies. Distinct filesystems get their own64MiB and256inode
reserves; same-device observations use minimum available values, including
quotas. Unknown/subordinate mounts or invalid resource metadata fail closed.
No legacy data is deleted/reclaimed to pass admission. Both source checkout trees
are bounded, pack object count bounds index allocation, and fixed
`fetch.unpackLimit=0` prevents loose-object expansion from defeating that budget.
Temporary source inspection checks its own filesystem before pack import.

### Real Linux evidence and executed regression matrix

A new owned container with **128MiB memory and128MiB memory+swap** limit,
readonly root/no network/no capabilities, rejected a128MiB request with
`insufficient_memory_capacity` (exit0 for the negative qualification). Its host
MemAvailable was not used to bypass its cgroup. No controller setting was changed.

A new native test mounted a **1MiB tmpfs** on the target parent inside the owned
root sandbox, proved st_dev differs from BASE, and got
`insufficient_disk_capacity` before intent. Marker bytes/old tuple remained;
normal unmount succeeded. It did not touch host/production mounts.

All commands ran in this worktree; Node ops24.10.0, artifact Node24.18.0,
pnpm10.32.1, Go1.27.3. Logs and command scripts are in
`/home/denis/tmp/aktau-capacity-review-vacg14fz` and the review archive. Counts
below overlap and must not be summed as unique tests.

| Command / actual evidence | Result | Exit |
| --- | --- | ---: |
| CapacityAdmissionTests | 12/12 PASS | 0 |
| `python3 -B -m unittest discover -s ops/c2 -p test_pipeline_artifact.py` | 12/12 PASS | 0 |
| Publisher suite; PipelineGenerationSafetyTests subset | 64/64;20/20 PASS | 0 |
| Historical root-helper suite | 33/33 PASS; frozen source unchanged | 0 |
| `node scripts/ci/run-checks.mjs ops` | **271 Python +186 Node PASS;0 SKIP** (`ops-final-reviewed.log`) | 0 |
| `node scripts/ci/run-root-bundle-integration.mjs` | 71 root/helper/installer +11 native Linux tests PASS;0 SKIP | 0 |
| Real low-cgroup container (`real-cgroup.log`) | bounded rejection PASS | 0 |
| Actual non-root v2 builder (`run-build-final.py`) | complete16-member bounded artifact PASS | 0 |
| Actual OLD→NEW→OLD (`run-full-artifact.py`) | source/deps/14 targets +runtime imports +private underlying check PASS | 0 |
| Real systemd PID1 (`run-systemd.py`) | both actors wait; root mount reconstruction; three SUCCESS statuses | 0 |
| `node --test scripts/revalidation/*.test.mjs scripts/ci/guard.test.mjs`, C2_LOCAL_PROBE set to local1.27.3 ELF | 377/377 PASS;0 SKIP | 0 |
| `go test -count=1 ./...` in backend-go | PASS, including Voice | 0 |
| `go test -race -count=1 ./...` in backend-go | PASS | 0 |
| `go vet ./...` in backend-go | PASS | 0 |
| `node scripts/ci/run-checks.mjs pipeline` | frozen install/tests/typecheck PASS | 0 |
| `node scripts/ci/run-checks.mjs security` | policy +synthetic backup guards PASS | 0 |
| `node scripts/revalidation/verify-part16.mjs` | static boundaries PASS | 0 |
| `node scripts/ci/run-db-integration.mjs` | disposable PG17 migrations, Go/C2 real CLI/FIFO/publication fixtures, cleanup PASS | 0 |
| contracts profile |12 PASS,10 SKIP (fixture HTTP not executed there) | 0 |
| Nest profile |generate/build/audit +28/28 PASS | 0 |
| frontend profile |278 unit PASS; E2E57 PASS,11 SKIP; build/lint/types/audit PASS | 0 |
| Ephemeral Staging | Docker health/DB outage/recovery/cleanup PASS; fixture contract18 PASS,4 SKIP; E2E14 PASS,6 SKIP | 0 |
| AST/syntax, `git diff --check`, exact scope/history/fixture preservation | PASS | 0 |
| New hosted exact-head CI9 | EXTERNAL_GATE_NOT_RUN: Git publication forbidden | — |
| Actual kernel reboot; VPS inventory/promotion/acceptance | NOT_RUN | — |

The first copied real-artifact/systemd harness omitted its public
`capsule-probe.mts` input and failed with FileNotFoundError. Those failures and
exit1 are preserved; the missing local test input was copied byte-identically,
then full runs passed. This was not a production failure or Store protection PASS.
One intermediate concurrent ops run had Python270 PASS but Node185/186: the
23-boundary SIGKILL test reached its unchanged60s subprocess deadline under
parallel build/regression load. Failure/timeout is retained. No assertion or
limit was relaxed; the final current-source profile passed271+186. Differences
in count reflect the final added cgroup-root compatibility regression.

### Rebuilt size/source comparison

Both builds use source `49f6823768817b0390f215de42439cce523bf5d3` and synthetic
build-only producer IDs, not independent GitHub release authorization.

| Artifact | TAR bytes | qualification ZIP bytes | TAR SHA256 |
| --- | ---: | ---: | --- |
| Previous review build |261130240|93475038|`a0725cc1ae7a783da17bf62d29bff20e8372cc98370355d7c2ec8a3844295f7a`|
| Final rebuilt candidate input |261130240|93474995|`ec59e0b3a52e75da6cefdb2fe574bc1a9d023f635faec858b01055c6d9288f39`|

TAR margin remains7305216 bytes under256MiB. Graph hashes are independently
indexed per build; byte-reproducibility across preparation times is not claimed.
The local artifact binds the committed baseline source, not a future uncommitted
root-executor commit. New reviewed producer source/pins/CI/authenticated artifact
remain mandatory before any installation. Large build TARs are retained outside
the compact review source archive.

### Fresh-main acceptance and remaining gates

The local verifier's `PRODUCTION_SOURCE_RUNTIME_ALIGNED` means installed approved
tuple consistency, not equality to the current remote main. Future authorized
acceptance must separately timestamp a fresh GitHub main observation and compare
it with measured deployed SHA plus reviewed artifact SHA. Missing/drifted proof
is `MAIN_PARITY_NOT_VERIFIED/BLOCKED`; local tuple PASS cannot replace it. No
network dependency was introduced into the verifier and no live DB/Git parity
claim is made. Source/runtime parity is separate from future natural C2 3/3.

The new single review archive is
`/home/denis/tmp/aktau-part-b-capacity-review-20261103-vacg14fz.tar.gz`.
Unlike the previous diff-only package, it includes clean baseline source needed
to reproduce tests, current changed/new paths, exact binary diff, capacity-only
diff, manifest, sanitized logs and original FAIL evidence. It excludes .git,
TODO, dependency/build directories, Owner ZIP, DB data, env/secrets and large
build artifacts. Its SHA256/safe-member/byte-match verification is external to
avoid a recursive digest. Existing review archive and old evidence are retained.

Remaining gates: independent source review; separately authorized publication
and exact-new-head CI9; real root/bootstrap/pins review; authorized real OLD VPS
inventory and baseline enrollment; systemd>=253/OpenFile capability check;
real reboot qualification; authenticated artifact and approved promotion; fresh
main/deployed/artifact comparison; natural C2 acceptance. No SSH, production
writes, root upgrade, sync/HMAC, AUTO DEPLOY, Git publication or physical Siri
retesting occurred. Root/admin remains trusted; admission checks do not defeat
compromised root or reserve all resources against later external pressure.


## 15. PR87 native mount qualification: diagnostics candidate, hosted environment blocker (2026-11-03)

**Status: BLOCKED_WITH_EVIDENCE. Production remains NO-GO.** This uncommitted
candidate improves prerequisite failure diagnostics and bounded failure capture;
it does **not** establish that the mandatory hosted mount blocker is fixed.
No new hosted run, commit, push, PR edit, SSH or production operation occurred.
PR87 remains Draft at `fc50dc392fc5a70d87ce7c20cc512e0c6f83265d`, parent/main
`49f6823768817b0390f215de42439cce523bf5d3`. Previous hosted run `41642315453`,
attempt 1, still has Go Quality/CI Gate FAILURE and PostgreSQL/Staging SKIPPED;
five other jobs succeeded. Skipped jobs are not qualified.

### 15.1 Evidence and limits of the diagnosis

Canonical prior source archive SHA256 remains
`bec51754fa2aa4feae213df7d82c01799f8135d1da022637da3fa7d56a0487fa`.
Original full available sanitized hosted failure transcript and prior CI matrix
are retained in the new evidence directory. That run did not record first mount
errno, effective LSM profile or capability metadata; its `pipeline_mount_syscall`
exception alone cannot distinguish AppArmor, seccomp, capability, kernel or
filesystem denial. Tail-only capture discarded useful early output.

Local environment: UID1000 host, Node24.10.0, Go1.27.3, Linux/amd64 WSL2
`6.18.54.1-microsoft-standard-WSL2`; owned Docker fixture runs UID0 with exact
CapEff/Prm/Bnd `00000000002000e3`, seccomp mode2, cgroup2, no network,
no-new-privileges, readonly root/source, /tmp bounded1GiB, memory2GiB,
CPU2, pids128. Docker security options list built-in seccomp and cgroup namespace.
AppArmor kernel parameter is N; current LSM label is the kernel label (a NUL
terminator was accounted for). **LOCAL_LSM_PARITY_NOT_VERIFIED**: this is not an
AppArmor-confined hosted runner. No unconfined/privileged flags, extra
capabilities, host namespace, host mount or host security policy changes were used.

Actual local tmpfs, bind, read-only remount, move, unmount and private namespace
operations return errno0. Root/tmp propagation is private, source is readonly,
manager/user namespace checks pass, and parent mount namespace is unchanged.
These facts qualify the local fixture only, not hosted AppArmor compatibility.
Docker documents that its default AppArmor profile denies mount; that supports
an LSM hypothesis, not proof of the original runner's actual denial:
https://docs.docker.com/engine/security/apparmor/ and
https://github.com/moby/profiles/blob/main/apparmor/template.go .

### 15.2 Minimal scoped candidate and preserved invariants

Seven paths differ from published HEAD (including this append):

- `ops/c2/pipeline_runtime_integration.py`: module prerequisite gate before the
  existing native class. All existing classes/methods/assertions are AST-identical
  to published HEAD, including 11 methods and the 23 SIGKILL phases.
- `scripts/ci/run-root-bundle-integration.mjs`: invokes scoped prerequisite/capture
  unit tests and uses bounded capture for only the native Docker command.
  Existing Docker arguments, capabilities, deadlines and owned cleanup stay intact.
- `scripts/ci/native-mount-preflight.py`: fixed test-only metadata and real syscall
  prerequisite probe; no production authorization, public path override or policy
  installation. Rejects absent SYS_ADMIN, extra capabilities, unknown LSM,
  unconfined/unknown seccomp, writable source, bad namespace/propagation.
  A forked child records first errno, creates only bounded owned scratch mounts,
  unshares a private namespace and verifies readonly/move semantics. Child timeout,
  cancellation and unverified cleanup fail closed; original parent namespace is checked.
- `scripts/ci/test_native_mount_preflight.py`: 13 metadata/lifecycle tests,
  including timeout, cancellation and child cleanup failure; these unit tests
  are explicitly distinct from real kernel qualification.
- `scripts/ci/native-mount-capture.mjs`: fixed Docker caller, 180s existing
  deadline and 2MiB total bounded sanitized capture; reports truncation/timeout/
  startup failure and never converts incomplete output to success.
- `scripts/ci/native-mount-capture.test.mjs`: six bounded output, sanitization,
  first-failure retention, timeout, overflow and startup regressions.
- This cumulative Part B report: append-only section15; all earlier bytes retained.

Production publisher/parser, generation store, capacity gates, runtime selection,
rollback, authority, workflow, Design Contract, frozen historical fixtures,
Go/pipeline/frontend and the executable shim bytes/mode are unchanged.
No existing safety assertion, skip policy, mount fallback or CI gate is relaxed.
Root/admin remains trusted; this candidate does not defend compromised root.

### 15.3 Fail-first and negative qualification

Inside an owned disposable Docker container, an additional restrictive seccomp
filter denies the mount syscall with EPERM. It adds a denial; it does not relax
Docker's existing filter or modify host policy. The exact frozen HEAD native
fixture (SHA256 `958b3b8849eb66faef29efa0d95c3be37be7c5a79d2d507d79d0766d4c57f4a8`)
then reproduces 1 failure/31 errors over11 methods, exit1. This is controlled
failure-family reproduction, **not actual hosted RCA**. The first off-tree replay
used a misleading Python linecache filename; both transcripts are retained.
The corrected replay compiles the actual frozen path, retains ROOT resolution,
and independently verifies frozen bytes against `git show HEAD`.

With the same real syscall denial, the new prerequisite gate returns BLOCKED,
`kernel_prerequisite_denied`, first operation `tmpfs_before_unshare`, errno1
`EPERM`, cleanup KNOWN, parent namespace unchanged. Negative wrapper exit0 means
expected rejection, not mount/native PASS. A separate real container without
SYS_ADMIN rejects before probing (`missing_sys_admin`, empty operations).
Latest negatives were repeated after final metadata changes; both wrappers exit0
and owned containers are absent afterward. Unknown LSM, seccomp and namespace
failures have unit coverage. Native ENOSPC/EBUSY/crash assertions remain active.
Comparable hosted LSM successful qualification and actual hosted first errno are
NOT_VERIFIED; no new CI run was authorized.

### 15.4 Actual commands and results

All commands use `rtk proxy`; project commands run non-root unless inside the
owned Docker root fixture. Node executable is
`/home/denis/.nvm/versions/node/v24.10.0/bin/node`; Go SDK is
`/home/denis/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.27.3.linux-amd64/bin`
with `GOTOOLCHAIN=local`. No dependency/project version was changed.

| Command | Actual result / exit |
| --- | --- |
| `python3 -B -m unittest discover -s scripts/ci -p test_native_mount_preflight.py` | 13/13 PASS, 0 |
| `node --test scripts/ci/native-mount-capture.test.mjs` | 6/6 PASS, 0 |
| `python3 -B -m unittest discover -s ops/c2 -p test_pipeline_release.py -k CapacityAdmissionTests` | 12/12 PASS, 0 |
| `python3 -B -m unittest discover -s ops/c2 -p test_pipeline_artifact.py` | 12/12 PASS, 0 |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py` | 64/64 PASS locally, 0 |
| `python3 -B -m unittest discover -s ops/c2 -p test_root_executor_pair_upgrade.py` | 33/33 PASS, 0 |
| `node scripts/ci/run-checks.mjs ops` | 271 Python +186 Node PASS, 0 SKIP, exit0 |
| `node scripts/ci/run-checks.mjs security` | PASS, 0 |
| `node scripts/revalidation/verify-part16.mjs` | PASS, 0 |
| C2 Node regression suite (full scripts/revalidation tests + CI guard tests) | 377/377 PASS, 0 SKIP, exit0; transcript retained |
| In backend-go: `go test -count=1 ./...` | PASS, 0 |
| In backend-go: `go test -race -count=1 ./...` | PASS, 0 |
| In backend-go: `go vet ./...` | PASS, 0 |
| `node scripts/ci/run-root-bundle-integration.mjs` | Final candidate: 71 real root/helper/installer +11 real native tests PASS locally, 0 SKIP, exit0; 13+6 prerequisite/capture units PASS |
| `node --check` for three affected JS files; Python AST for three affected Python files | PASS, 0 |
| Existing native class AST equality to HEAD; `git diff --check` | PASS, 0 |
| Comparable hosted AppArmor/seccomp native qualification | NOT_VERIFIED |
| New exact-head hosted CI9 / PG17 / ephemeral staging | NOT_RUN in this source-only task |

The Python3.13 publisher63 PASS/1 ERROR timing risk remains historical evidence;
local64 PASS does not resolve or hide that independent risk. No timing assertion
was changed. Earlier failed hosted run and all local replay logs remain retained.

### 15.5 Review packet and precise next gate

Evidence directory:
`/home/denis/tmp/aktau-pr87-native-mount-fix-20261103-ncesbh7j`.
The off-tree clean archive includes full tracked source plus the four new CI
files, this report, exact HEAD-relative diff including new files, source inventory,
changed file SHA256/size/mode/status, original28-path freeze comparison, sanitized
logs, failure reproduction inputs and executable `review/REPRODUCE.md`.
External archive validation records safe regular members, uniqueness, byte-match,
report prefix and original frozen/production source preservation; archive digest
is external to avoid recursive hashing. Owner ZIP is unchanged and excluded.

Remaining essential gate: independent review of this diagnostic candidate,
followed by separately authorized Git publication/diagnostic CI on the real
runner to obtain its first errno and LSM/capability/namespace metadata; or an
approved comparable confined disposable host. Neither was available/authorized
here. A proven solution requiring host LSM policy changes or broad privilege
exceptions must STOP for security design review; it is not silently applied.
Therefore this task cannot honestly claim the hosted blocker removed or CI9
qualified. Existing PR source bytes were changed locally in disclosed paths and
have no new commit SHA or hosted qualification. No Git publication or production
mutation occurred. STOP pending independent review.

Packet verification note: an initial off-tree verification command used the
wrong shim path `ops/sync/pipeline-pnpm` and exited1 (FileNotFoundError).
Repository discovery confirmed `ops/c2/pipeline-pnpm`; the verifier was corrected,
without changing source, modes or assertions. This tooling failure is retained.


## 16. PR87 secure native sandbox design — 2026-11-03

**SANDBOX_SECURITY_DESIGN_READY_FOR_INDEPENDENT_REVIEW (DESIGN ONLY).**
**HOSTED_ENFORCED_POLICY_QUALIFICATION_NOT_RUN; CI9/MERGE/PRODUCTION NO-GO.**
HEAD remains `1ce935205141ce7266ae268c5c82a5b0c3c4c893`, Draft PR87,
main49f6823768817b0390f215de42439cce523bf5d3; fresh read-only refs/PR agree.
The original28 paths and all763 current source bytes/modes were frozen before
this append. Only this report is changed in Git; all committed diagnostic code,
existing11 native methods/23 crash phases, historical fixtures, production
publisher,14-target custody/rollback, Design Contract §19 and shim100755 remain
unchanged. Owner untracked files were preserved. No commit/push/PR edit/CI rerun.

Full consolidated design and qualification report (off-tree):
`/home/denis/tmp/aktau-pr87-sandbox-design-20261103-vn88wq3k/HOSTED_NATIVE_MOUNT_SANDBOX_SECURITY_DESIGN.md`.
It contains the syscall/path/flag table,14-file rollback boundary, threat model,
complete standalone enforce-profile template/binding, VM/manager lifecycle,
capability/LSM/seccomp design, rejected alternatives, required negative matrix,
exact proposed implementation paths, commands/results and external gates.

### 16.1 Proved blocker versus attribution

Accepted hosted run41659473269/attempt1: first tmpfs mount EACCES13 with
AppArmorY/docker-default enforce, expected capsets00000000002000e3 including
SYS_ADMIN, seccomp2, readonlysrc, private propagation and unchanged parent.
Root71 PASS; native0/11, not a mount qualification PASS. Hosted result stays
fiveSUCCESS/twoFAILURE/twoSKIPPED. Original41642315453 had no recorded errno.
Local deliberately injected EPERM1 is distinct. Exclusive AppArmor causality
is not audit-proven; no host audit access or new profile comparison occurred.

Public primary sources were read and exact upstream Moby source bytes frozen
at commit4b8214fc4971e06172938a1f1554ccff6647ee80 (URLs/hash manifest retained).
Docker's current default profile denies mount; adding a later allow cannot
neutralize that deny. Upstream Docker seccomp conditionally permits more than
legacy mount/unshare under SYS_ADMIN; actual hosted filter rules were not dumped.
Official AppArmor manual documents exact-option versus subset rules and known
mount mediation limitations. Therefore a per-container profile needs more than
a bare allow rule or arbitrary-label acceptance.

### 16.2 Selected bounded proposal; no active candidate

Select a dedicated single-use Linux/amd64 VM with a trusted immutable image/root
manager, no production routes/secrets or reusable disk, and an enforced exact
per-container profile. Job user has no general sudo/docker-group privilege;
manager is image-installed independently of PR upload. Root71 keeps default
confinement without SYS_ADMIN. Native keeps exact existing six caps,
networknone/read-only root+src/no-new-privileges/tmp1GiB/RAM2GiB/CPU2/PID128,
owned resources/cleanup and all real assertions. Root/admin/kernel remain
trusted; a container is not claimed to defeat compromised test kernel/admin.

Complete profile draft permits only the audited owned scratch tmpfs, capsule→
stage bind/read-only remount/private propagation, stage→publisher move, plain
unmount, and child-private root propagation. It denies proc/sys/dev/src mounts,
network and source/proc/sys writes; no generic mount/umount or arbitraryprocfd
mount permission. Because production mount endpoints are pinned `/proc/self/fd/N`,
actual canonical FD path mediation under AppArmor must be qualified. A proc alias
failure is a STOP, never grounds for `/proc/**` mount permission or changing
production descriptor pinning.

Mandatory future defense: retain Docker seccomp and intersect it with a trusted
pre-exec deny-only filter for measured flags, exact CLONE_NEWNS, no setns/unused
modern mount APIs/bpf or alternate syscall ABI. The complete declarative spec is
included, but executable filter/manager/image are NOT_IMPLEMENTED or authorized.
No custom profile is admitted by current preflight: it intentionally rejects
this unapproved label. A future exact label+hash+root-loader receipt/image proof
and negative spoof tests are required. Label alone cannot prove loaded bytes.

No workflow/harness/source policy activation was wired in: available evidence
supports a reviewable design/prototype, not a verified active sandbox. New policy
must not run until independent design/source approval and separate Owner
permission for one disposable VM/profile/manager qualification window.

### 16.3 Actual local checks

- Node24.10.0, Go1.27.3, Python3.12.3, Docker29.1.3, WSL2kernel6.18.54.1;
  local AppArmorN, hence no comparable confinement claim.
- Current preflight13, capture6, capacity12, artifact12, publisher64,
  historical root-helper33: all PASS/exit0. Ops271Python+186Node PASS/0SKIP/exit0;
  security PASS/exit0. Exact argv, measured times and UID1000 are in REGRESSIONS.json.
- `go test -count=1 ./...`, `go test -race -count=1 ./...`, `go vet ./...`
  in backend-go all exit0. Package timings retained; total wrapper wall time
  was not instrumented and is not invented.
- Unchanged `node scripts/ci/run-root-bundle-integration.mjs` exit0:
  real root71/71 in19.500s; native11/11 in4.870s,0SKIP including23 SIGKILL phases.
- Additional transparent libc inventory: real native11/11 in4.902s/exit0,
  mountflags6,4096,4135,8192,262144,278528; umountflags0; actualEBUSY16 preserved.
  Trace forwards original libc and errno; no assertions or syscalls are mocked.
  It records no paths/payload/authority. Off-tree C build succeeds with Werror;
  local shared-object build output is excluded from review archive.
- Complete draft profile: existing apparmor_parser4.0.1 compiles with
  `--skip-kernel-load --skip-cache --stdout --jobs 1`, exit0. Kernel interface
  warning retained; no profile/cache/host policy was installed. Syntax compile
  is not enforcement proof. ABI3.0/compiler closure/hash are documented.
- Eight new off-tree static/parser design tests PASS: template/binding/tamper,
  closed caps/mount rules, malformed syntax rejection and current fail-closed
  rejection of unapproved custom labels. They do not test kernel confinement.
- `git diff --check`, code/mode/prefix preservation and safe archive byte-match
  are final packet checks; hosted/new-profile/VM/reboot/production/C2 acceptance
  NOT_RUN. Python3.13 missing-PID risk remains historical OPEN, not fixed by64PASS.

### 16.4 Review and next gate

Prototype template SHA256: 1bc32a70db0e32a476035579659ce42fb29e14039a156a6e62435ea6967dfc9a.
Rendered profile SHA256: e33921947f86e3fb6e98891fcdb3c9ab378d172ce684c767c8a86e0b12041d1c.
Offline compiled SHA256: 991fb94fedf80005bc7c51f95773fc02b418fdcdce55e8a539d13374f19386e7 (bytes not installed or shipped).
Full exact binding and compiler result are separate evidence JSON.

Independent review must assess policy/FD mediation, deny-only filter design,
trusted manager bootstrap and ephemeral VM destruction. Then implement/review
only the exact proposed test-only paths, authorize the isolated policy window,
qualify real negative cases+71/11/23 and exact-head CI9. Existing standard hosted
runner custom-policy feasibility is UNVERIFIED; no cloud/GitHub resources created.
No --privileged/unconfined/host policy mutation/host namespace bypass is accepted.
No current profile was loaded or executed, including in a VM. Existing hosted
failure stays failure. No production source/DB/API/C2 authority/SLA, SSH/VPS,
root upgrade, sync/HMAC, AUTO DEPLOY or Git publication occurred. STOP.


## 17. Autonomous CI→production completion attempt — 2026-11-03

**PART_B_BLOCKED_WITH_EVIDENCE.** Primary blocker:
`MISSING_ISOLATED_RUNNER_AUTHORIZATION_OR_CAPABILITY`; coupled gate:
`INDEPENDENT_PRIVILEGED_SOURCE_REVIEW_REQUIRED`. No production deployment,
new privileged policy execution, Git publication or new CI run occurred.
This section is append-only; §16 and every prior byte are preserved.

### 17.1 Actual authority, source and progression

Task `AKTAU_MARKET_PART_B_AUTONOMOUS_CI_TO_PRODUCTION_COMPLETION_TASK_20261103.md`
was read fully, including §5's condition: publication follows independent
privilege-bearing source review and successful isolated qualification. Owner's
broad authorization does not remove that condition or authorize self-review.
Expected/current feature HEAD remains
`1ce935205141ce7266ae268c5c82a5b0c3c4c893`, existing Draft PR87, remote main
`49f6823768817b0390f215de42439cce523bf5d3`; refs/PR checked read-only.
No reset/rebase/stash/clean, branch/worktree replacement or force was used.
Initial §16 append, all old source/fixtures/modes and Owner untracked files were
preserved. Exactly the following source candidate is uncommitted:

- `scripts/ci/native-mount-deny-only.c` (new): actual classic BPF program and fixed
  native launcher. Compiles with Linux headers, no new library/package dependency.
  Only `--emit-bpf` ran; it exports instructions and NEVER calls seccomp/prctl to
  install a filter. Runtime path is fixed `/ci/native-mount-deny-only`, root0555,
  no xattrs/link substitution; NNP and existing filter required; TSYNC must return0
  and increment filter count; exec is only isolated Python/native fixture.
- `scripts/ci/native-mount-manager.py` (new): fixed guest-side root manager
  candidate, isolated Python entry, strict external one-job authorization,
  root/no-follow/ACL/hash/mode/source graph checks, fixed OCI/image/policy/boot
  identities, exclusive durable intent and root71/native11-only Docker argv.
  Bounded capture retains unreaped direct-child PID until process-group cleanup,
  including direct-exit/closed-stdout descendants. Foreign/unknown containers are
  not removed; existing intent/unknown state blocks reuse. Output is only
  tests-complete-awaiting-independent-VM-destroy-proof, never CI9 PASS.
- `scripts/ci/fixtures/native-mount-v1.apparmor` and
  `scripts/ci/fixtures/native-mount-v1.binding.json` (new): full prior standalone
  enforce-profile prototype and descriptive hash binding, not authority.
  Offline compiled digest is not VM/kernel enforcement qualification.
- `scripts/ci/native-mount-preflight.py` (modified): exact custom enforced label
  admitted only with manager-mounted, readonly root-owned binding/receipt,
  strict digest/job/run/attempt/head/checkout/VM fields and custody. No env/path
  override or arbitrary-label bypass. Existing known local/default diagnostics
  and thirteen tests remain unchanged. New class is not a production C2 approval.
- `scripts/ci/test_native_mount_sandbox.py` (new):23 unprivileged source tests,
  interpreting actual compiled BPF bytes, strict metadata, real user child-group
  cleanup/cancellation, no-clobber/partial writes and foreign-resource negatives.
  Synthetic authorization objects are test fixtures only, not issued approvals.
- `ops/ci/native-mount-runner/README.md` (new): fixed layout, external bootstrap/
  provisioner/destroy assumptions, command and authority boundaries, known gaps.
- This same Part B report (modified): §17 append. The existing §16 was already
  dirty at task start. New review bytes do not inherit prior source approvals.

Production publisher/parser, generation store, actual11 native methods/23 crash
assertions,14-target rollback, Go/API/DB/parsers/Frontend/Siri, root one-shot
helpers, frozen fixtures, Design Contract and shimGit100755 are unchanged.
Existing CI workflow/root runner/capture are unchanged and not routed to the new
manager. No partial permissive sandbox was made active just to get green CI.

### 17.2 Source security evidence and unresolved qualification

Actual exported BPF:119 instructions, SHA256
`b9e50a99f87cb236c51aa7f2146ed75809e6ee84045516aab43c2c9521bf0b29`.
Compiler: UbuntuGCC13.3.0, -std=c11 -O2 -Wall -Wextra -Werror.
It rejects wrong ABI/x32, unmeasured/high mount flags, forced/lazy umount,
non-CLONE_NEWNS unshare, other namespace clone bits including NEWTIME, setns,
modern mount APIs, bpf/perf and unused sensitive calls; clone3 returnsENOSYS.
Other calls defer to Docker's original filter by intersection, never overriding
its denial. Actual kernel TSYNC/thread/fork inheritance is **NOT_RUN**: a userspace
instruction interpreter is not kernel qualification. No new filter was installed.

The full profile compiles with existing AppArmor4.0.1, `--skip-kernel-load
--skip-cache --stdout --jobs 1`, exit0. Rendered policy SHA256
`e33921947f86e3fb6e98891fcdb3c9ab378d172ce684c767c8a86e0b12041d1c`;
offline compiled SHA256
`991fb94fedf80005bc7c51f95773fc02b418fdcdce55e8a539d13374f19386e7`.
Compiled bytes/ELF are not installed or shipped. Current kernel lacks the AppArmor
interface; warning retained. FD path mediation, actual enforced negatives,
policy loader/root manager under privilege and VM lifecycle are NOT_RUN.

The manager does not install policy, create a VM, issue an approval or pretend
to independently measure its own VM image. Its image-id/loaded receipt require
an independent trusted image administrator/provisioner; a guest file or profile
name alone is insufficient proof. A concrete immutable image, bootstrap/loader
and independent destruction controller are **not available/implemented** for a
specific authorized infrastructure. Those are real external integration gaps,
not a functional full sandbox claim. The repository runners API returned403;
this proves insufficient discovery permission, not that no runner exists.
Local /dev/kvm is absent and VM tools were not found. No cloud account, paid
resource, VM or reusable self-hosted production runner was created.

All active policy execution stays behind independent security review of the
whole exact privilege-bearing diff and a concrete one-use VM authorization.
No --privileged, unconfined profile/filter, new host namespace/capability,
AppArmor host/global change or generic root command interface was used.
No fake root/job/OLD authorization, image identity or teardown proof was created.

### 17.3 Actual local matrix, not hosted CI9

All commands ran via rtk proxy, native WSL UID1000, Node24.10.0/Go1.27.3,
Python3.12.3; Docker root only in existing unchanged owned fixtures. No new
policy was used in those existing root71/native11 tests. First20/expanded22/
final23 new tests all passed; intermediate evidence retained. Ordinary source
preparation corrected valid Next.js `[lang]/(site)` path admission, atime-insensitive
identity comparison, bounded IDs, unknown-state checks and child PID/group
lifecycle before final qualification, without weakening security assertions.

| Command | Actual result |
| --- | --- |
| `python3 -B -m unittest discover -s scripts/ci -p test_native_mount_sandbox.py -v` |23/23 PASS,0SKIP,exit0; compiled instruction CPU tests, NOT kernel policy |
| `python3 -B -m unittest discover -s scripts/ci -p test_native_mount_preflight.py` |13/13 PASS,exit0 |
| `node --test scripts/ci/native-mount-capture.test.mjs` |6/6 PASS,exit0 |
| `python3 -B -m unittest discover -s ops/c2 -p test_pipeline_release.py -k CapacityAdmissionTests` |12/12 PASS,exit0 |
| `python3 -B -m unittest discover -s ops/c2 -p test_pipeline_artifact.py` |12/12 PASS,exit0 |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py` |64/64 localPASS,exit0; historical Python3.13 missing-PID risk stillOPEN |
| `python3 -B -m unittest discover -s ops/c2 -p test_root_executor_pair_upgrade.py` |33/33 PASS,exit0 |
| `node scripts/ci/run-checks.mjs ops` |271Python+186Node PASS,0SKIP,exit0 |
| `node scripts/ci/run-checks.mjs go` |PASS,exit0,124.140s; mod/test/race/vet/staticcheck plus377 C2NodePASS/0SKIP |
| `node scripts/ci/run-root-bundle-integration.mjs` |root71+native11/23crash PASS locally,0SKIP,exit0,34.767s; AA-disabled WSL only |
| `node scripts/revalidation/verify-part16.mjs` |PASS,exit0 |
| `node scripts/ci/run-checks.mjs contracts` |exit0,4.280s |
| `node scripts/ci/run-checks.mjs nest` |exit0,8.539s |
| `node scripts/ci/run-checks.mjs frontend` |exit0,73.999s |
| `node scripts/ci/run-checks.mjs pipeline` |exit0,8.907s |
| `node scripts/ci/run-checks.mjs security` |exit0, repeated after source, PASS |
| `node scripts/ci/run-db-integration.mjs` |actual disposablePG17,exit0,66.297s; no SKIP found |
| `node scripts/ci/run-ephemeral-staging.mjs` |exit0,60.392s; **partial test coverage**, details below |
| JS/Python/C syntax, offline profile parser, diff/mode/history checks |PASS,exit0 |

Staging's exit0 is **not a zero-SKIP claim**: live GET contracts18PASS+4VoiceSKIP
for each of Go/Nest; Playwright14PASS+6device-conditionalSKIP. Skipped cases are
NOT_EXECUTED, not passed; separate local GoVoice parity ran in staging but does
not retroactively relabel contract skips. No production Voice/Siri retest occurred.
Full command argv/exit/elapsed/logs are in FULL_PROFILE_RESULTS.json,
AFFECTED_RESULTS.json, GO_ROOT_RESULTS.json and specific final-source result JSON.
A report-only rg query initially omitted `--` for a pattern beginning `---`;
read-only Python parsing corrected the evidence query. No test/source gate was
changed. No local result substitutes for hosted nine required jobs.

### 17.4 Fresh bounded production observations — no writes

Two bounded read-only SSH sessions through existing `my-vps`, BatchMode,
strict host-key verification, no forwarding/retries: metadata inventory and
bounded OLD dependency observation. No secrets/reader.dsn/env/DB backup contents
were read or printed. No HTTP/SQL/Redis, service/timer changes, root tool invocation,
publish, sync/ingest/HMAC, package installation or production source switch occurred.

Readback timestamp: 2026-11-03T16:38:56Z.
Publisher SHA `b2012c5b8c05de8a7667bf942daf9d7232f3a7b6`; clean Git.
Automatic/authorization source agrees; all12 actual installed closure SHA256
match current authority. C2 remains enabled. API container reports healthy with
image tag49f6823768817b0390f215de42439cce523bf5d3; this is tag/state metadata,
not a new API deployed-SHA/HTTP smoke proof. Timers/services metadata retained.
No promotion interlock observed; lock metadata captured but lock freedom was
not independently proved by acquiring or altering locks. Reader metadata/hash
of ledger captured; reader content never opened. Ledger34INCONCLUSIVE,0PASS,
0FAIL; full policy/history validation and qualified acceptance not performed.
No C2 PASS is claimed. Legitimate future ledger appends must remain preserved.

Systemd255.4 meets the version threshold, but actual OpenFile namespace-FD
admission has **NOT_VERIFIED** status. cgroupv2 visible; full ancestor/quota/
namespace visibility and production capacity admission NOT_VERIFIED.
Current pipeline is not mounted, v2 selection absent, installed root policyv1
SHA2562bf672f1626252f107447552493ad982999d3d7f444f000394a7006d952ddb8b.
No used root helper/installer was replayed or modified.

Five retained release directories,14 backup files each (70total), four committed
receipt paths and one rollback receipt path observed. No backup content/hash or
complete receipt-chain verification performed: **ROLLBACK_READINESS_NOT_PROVEN**,
not rollback PASS. No rollback attempted. v2 OLD enrollment/root authorization
remain absent. Observed actual OLD graph is not automatically trusted:
61,707,071logical bytes; bounded public dependency hash/inode/link/mode inventory,
SHA25632d26532e6811734b594724fe59e6ff174cf3c97e11580c1899de9ec9e6de01d.
Expected OLD Git identities match observed publisher:
pipeline tree2ed1c1c6d6fef504b08829f4193a0b60681bd3a7;
package3049257eb2898eb4c279a296f3bd56f1a52e883b;
lockcfee18d88a435e550c0ed3f074fb8ccd4704cdfe.
This read-only mutable-tree observation is not atomic enrollment, independent
package provenance, a sealed capsule, script-execution authorization or signed
root approval. Actual Node/pnpm executable-version and baseline authority still
need independent admission; installed closure paths/hashes alone do not prove them.

### 17.5 Hosted/release/prod status and ONE handoff

Current hosted41659473269/attempt1 (head1ce9352):5SUCCESS/GoQuality+GateFAILURE/
PG+StagingSKIPPED. It covers only the committed diagnostic source, **not** this
uncommitted candidate. First hosted tmpfsEACCES13/defaultAppArmor remains accepted
evidence; exclusive audit-proven LSM causality still unavailable. No new CI run,
new commit, push, PR edit, merge or exact-main qualification occurred. Source
publication is gated by TASK§5, not silently omitted despite broad authorization.

New authenticated Artifact v2/buildRun/ZIP/TAR/source-main tuple: **NOT_RUN**.
No old artifact or fake build identity was reused; unchanged256MiB caps and
previous7,305,216-byte local margin remain constraints, not new size proof.
Production promotion, PRODUCTION_SOURCE_RUNTIME_ALIGNED, fresh-main deployed
parity, v2 rollback/reboot and genuine3/3 acceptance: **NOT_RUN/NOT_VERIFIED**.
Observed production publisher differs from GitHubmain49f6823; no parity PASS.
AUTO_DEPLOY_ENABLED remains false (read-only variable query).

ONE next action is in off-tree EXTERNAL_GATES.md: independent review of this
whole privilege-bearing source packet and provision of one concrete authorized
single-use VM/image/provisioner with independent destruction authority. No
secrets should be sent in chat. Then qualify actual policy/filter/FD mediation,
root71/native11/crash23/negative lifecycle, review/wire CI and require9/9 before
protected merge. New authenticated artifact and independently approved real OLD
inventory/root bootstrap are subsequent dependent gates. No further Frontend or
Backend2 confirmation requested; no production permission was invented.

Off-tree consolidated report/evidence:
`/home/denis/tmp/aktau-part-b-autonomous-20261103-9tj7hwyj`.
Includes exact diff, per-file hashes/modes/status, original28/frozen preservation,
SOURCE_FREEZE_SHA256.txt, CI9_MATRIX.json, sanitized PRODUCTION_READBACK.json,
ROLLBACK_READINESS.json, OLD observation, full test outputs and ONE external handoff.
New clean source/evidence archive is externally validated for safe regular members,
uniqueness, byte-match and SHA256; no .git/TODO/env/secrets/node_modules/Owner ZIP,
DB data or compiled binaries included. No production PASS is claimed. STOP at
independent privileged review/isolated runner authority gate.


### 17.6 Final source qualification update

Final candidate additionally checks that the manager is outside Docker and in
VM PID1's mount namespace, captures only a bounded mount-topology SHA256/inode
before container creation and requires unchanged topology after each owned
container cleanup. No raw host mount records are logged. This protocol is still
unexecuted under privilege; independent VM topology/destroy proof is not invented.
A new metadata-negative test covers container/wrong-parent rejection and synthetic
topology hashing. Final new suite is **24/24 PASS,0SKIP,exit0** (sandbox-last.log),
superseding earlier20/22/23 iteration counts as final source coverage. All previous
results/logs are retained. The external blocker and all NOT_RUN gates are unchanged.


## 18. Owner fast-track CI resolution — 2026-11-03/04, prepublication

**SELF_REVIEWED_OWNER_AUTHORIZED — CI ONLY.** Owner explicitly superseded the
previous optional dedicated-VM/second-reviewer model for this CI scope. Standard
GitHub ubuntu-24.04 is a fresh disposable job VM; its managed lifecycle is the
accepted boundary, not independently attested physical destruction. No source
production/root-approval contract or branch rule is bypassed. No statement here
is independent review or a production authorization record.

### 18.1 Minimal selected scope / preservation

The old manager/BPF/provisioner prototype was backed up off-tree with exact hashes
before edits and is **NOT_PUBLISHED**. Its original four unused code/test/docs
paths remain in the worktree; no Owner data was deleted. The new fast path does
not install or invoke that manager or deny-only launcher. Additional BPF was a
proposal in §16/17, not a frozen CI requirement in Design Contract §§18/19.
Original Docker seccomp stays active. This change does not claim a narrower
syscall allowlist than the existing Docker filter or defend compromised root.

Publish only9 paths: same cumulative report; existing root CI runner; existing
native preflight and its test; standalone AppArmor profile/binding; new
`native-mount-hosted.mjs`, its Node test and `native-mount-policy-integration.py`.
No production publisher/Go/DB/frontend/parser/14-target rollback/fixtures change.
Shim remains Git100755. Existing native11 methods and23 phases are byte-identical.
Current source head before publication is1ce935205141ce7266ae268c5c82a5b0c3c4c893;
main49f6823768817b0390f215de42439cce523bf5d3; same Draft PR87, no automerge.

### 18.2 Self-review and objective CI boundary

`native-mount-hosted.mjs` executes as ordinary runner user. Its sudo calls are
only fixed system tools/data operations: enabled/status read, unique root0700
/run directory, tee/chmod/hash of fixed files, compile-without-load, exact binary
profile add/remove, registered-file cleanup. No uploaded JavaScript/Python/root
manager or shell snippet is executed under sudo. Root-copy bytes are hashed
before load; the exact compiled policy digest is measured per job and logged.
The profile/binding input is obtained from the actual checkout commit through
verified Git commit/tree/blob hash chains, not mutable upload files or argv.
No variable selects command, arbitrary root path or profile contents.

Before sudo, require actual Linux/X64/GitHub-hosted/ubuntu24/CI/go context,
known repository, current checkout==GITHUB_SHA, positive run/attempt, trusted
same-repository PR/base or push-main, non-container24.04 and microsoft/kvm VM.
No external fork, slim/self-hosted or workflow_dispatch exception. Existing
workflow contents-read/persist-credentialsfalse/no production secrets remain.
This is trusted GitHub job context plus Owner-reviewed repository code, not a
hardware attestation against a malicious root/admin. GitHub job sudo access is
an accepted property of this dedicated VM, never a production permission.

The complete enforced profile permits only audited owned tmpfs, bind/remount/
move/private/unmount paths. No generic mount/umount, proc-FD loophole, complain,
unconfined, extra caps, host namespace/socket bind or docker-default edit.
Root71 remains default-confined withoutSYS_ADMIN. Native keeps previous six caps,
networknone/read-only root+src/tmp1GiB/RAM2GiB/CPU2/PID128/NNP and default seccomp.
Receipt identifies actual kernel label/profile hashes/compiled bytes/run/source;
preflight requires readonly root-owned files, exact schema/enforce label and
known repository/image identity. This is CI test custody, not root release approval.

Hosted execution will run an actual default-profile denial control, actual
missing-SYS_ADMIN denial, owned dummy writable-source rejection (never expose the
real source writable), enforced network/proc/sys/dev/src/path/flags/FD negatives,
then all unchanged native11/crash23. Unexpected successful mounts abort that
owned container; no guessed unmount or broad permission is added. Scoped kernel
audit output is collected on failure, no unrelated raw host logs. Containers are
verified absent before exact profile removal; root unknown setup state is left
for the managed VM lifecycle, never silently retried on that host.

### 18.3 Local checks / actual failure retained

Node24.10.0, Python3.12, Go1.27.3. Preflight16, hosted Node7, capture6, capacity12,
artifact12, publisher64, root-helper33 PASS. Go profile incl race/vet/staticcheck
and377 C2Node tests PASS. Pipeline/security and disposablePG17 PASS. Staging exit0
with its existing Voice/device-conditional SKIPs counted separately, not PASS.
Local root71/native11/crash23 PASS under unchanged WSL environment, **not**
new-policy enforcement. Profile compiles offline only; no local host policy loaded.

First ops attempt failed: one60s per-case subprocess returned statusnull while
Go/PG/staging ran concurrently. Original full output retained. The exact crash
case then passed unchanged under the same60s limit in27.382s; full serialized
ops passed271Python+186Node/0SKIP in177.497s. Resource contention is consistent
with this failure, not a source RCA claimed beyond measured evidence. No timeout
or assertion changed. Old Python3.13 publisher missing-PID remains a known P2.
Unused prototype Python3.13 PID/stderr issue is preserved, NOT_PUBLISHED, not
suppressed or represented as fixed. No failure was relabeled local CI9 success.

### 18.4 Production diagnostics before any conditional release

Fresh bounded read-only SSH: publisherb2012c5b8c05de8a7667bf942daf9d7232f3a7b6,
Git clean, root policyv1 unchanged.12/12 installed closure hashes and6 runtime
pins match. Five retained terminal receipts,70/70 backup content hashes match
receipt oldHash; no backup values/reader/env secrets exported. This is measured
retention, not independent OLD enrollment or a new rollback authorization.

Daily last run Nov03 18:00+05 exited1; weekly Nov02 03:00+05 exited1. Both timers
active/waiting, not currently executing. Locks snapshot runtime/controller free;
ingress.lock absent (recorded, not created). Safe journal categories show Dana
exit1, Dina/FixPrice exit0, stale-source and publish-step-failed; weekly has Dana
scraper failure. No restart/sync was run to clear failed state. Further sanitized
causality is being collected; no unsupported healthy-sync claim is made. API
container still healthy; ledger/reader preserved. Production promotion remains
conditional on containment, current authority and measured OLD/rollback gates.

Next: one scoped commit/non-force push after local checks and this self-review;
actual hosted enforcement/CI9, normal source fixes if needed, protected merge
only on9SUCCESS and actual branch gates. Source/CI acceptance is not production
approval. Follow-up results append here; final report is off-tree. Root production
policyv1 does not automatically authorize v2 enrollment/provisioning, so no old
helper/release/initial approval may be replayed. AUTO_DEPLOY stays false.


### 18.1 Actual hosted qualification, protected merge and authenticated Artifact v2

Recorded 2026-11-03T19:37:20.009825+00:00. Final task status: **PART_B_CI_QUALIFIED_RELEASE_BLOCKED**.
Self-review is **SELF_REVIEWED_OWNER_AUTHORIZED**, never independent security review.

- Non-force commit `47a27b8d13ba85f12b347dad4fe1f6bd98414cbe`: exactly nine CI/report paths. Frozen Part B production code, fixtures and the 100755 pnpm shim are unchanged by this commit.
- [PR87](https://github.com/kiratonine/AdilBaga/pull/87) transitioned Draft→Ready and merged normally, without bypass/force. Main is `d071be3c7e071a4b52256548a8239d6c179ce565`; its tree equals the qualified PR tree. Ruleset25068830 is active, reviewer count0, required CI Gate, current_user_can_bypass=never.
- [PR CI41700861534](https://github.com/kiratonine/AdilBaga/actions/runs/41700861534), attempt1: **9/9 SUCCESS**. Separate [push-main CI41702239307](https://github.com/kiratonine/AdilBaga/actions/runs/41702239307), attempt1: **9/9 SUCCESS**.
- On both actual standard GitHub Ubuntu24 VMs: enforced exact AppArmor label, builtin seccomp2, root71/native11 and original23 crash boundaries passed. Default-profile control retained actual EACCES13. Actual negative mounts/flags/FD alias, missing SYS_ADMIN, source writes and network socket were denied; exact custom profile cleanup verified. No privileged/unconfined mode, global docker-default edit or production policy execution. Unknown/unconfined/complain metadata rejection is unit coverage; no unconfined container was launched. Legacy hostedLSMParity=NOT_VERIFIED remains distinct from actual CI label/enforcement evidence.
- Build [41703391529](https://github.com/kiratonine/AdilBaga/actions/runs/41703391529), attempt1, one manual-artifact dispatch: 2/2 build jobs SUCCESS. Artifact `13265286099` is authenticated against GitHub repository/run/attempt/source and GitHub ZIP digest.
- ZIP `ab9048d5c46edc002534a21813618fb771e123f94393d26f8003d928bb7d88bd`, 96080608 bytes. TAR `31827b7b6b3818d5a866e792fa8891036f0bb460c676bc7d1e38c14c41fed057`, 262277120 bytes; margin 6158336 below unchanged268435456 cap. Exactly16 canonical members, 12/12 closure hashes, package/lock/tree identities, protected exact contracts-lock pair, complete indexed graph and Go1.27.3/Linux-amd64/CGO0 provenance verified. Embedded projection SHA equals exact main.
- Actual authenticated graph executed in a disposable non-root Ubuntu24 Docker sandbox, network-none/read-only/no install: Node24.18.0/pnpm10.32.1/tsx/Zod4/undici/esbuild PASS. First off-tree probe incorrectly imported transitive-only undici from the root; preserved failure, corrected probe to actual cheerio/tsx dependency owners, PASS. No source/dependency change.

### 18.2 Real failures, limitations and production read-only reconciliation

- Initial parallel local ops run hit the existing60s crash-test timeout. Exact unchanged test then passed isolated27.382s and full serialized ops passed271Python+186Node; no timeout/assertion change. Original failure/log retained.
- Local preflight16, hosted-context7, capture6, capacity12, artifact12, publisher64, historical helper33, Go/race/vet+C2-377, pipeline/security, PG17 and root71/native11 passed. Staging exit0 includes existing explicit optional SKIP:4 in each backend smoke group,6 browser cases; never represented as executed PASS. Local WSL AppArmorN is not hosted enforcement proof. Python3.13 prototype error remains NOT_PUBLISHED; historical3.13 risk is not claimed qualified.
- VPS snapshot `2026-11-03T19:17:01Z`: publisher `b2012c5b8c05de8a7667bf942daf9d7232f3a7b6` clean; policyv1 SHA2562bf672f1626252f107447552493ad982999d3d7f444f000394a7006d952ddb8b; all6 installed runtime pins and12 closure hashes match; five retained terminal releases and70/70 actual backup hashes match their receipts. No interlock; all3 correct lock paths unheld in /proc/locks snapshot (not a future reservation). Initial collector used a wrong ingress path, corrected off-tree and rechecked `/var/lib/aktau-sync-promotion/state/ingress.lock`; no production change.
- Reader600/C2+ledger700, UID999/GID987, no symlinks/xattrs; reader contents were not read. Ledger34INCONCLUSIVE,0PASS,0FAIL. API container remains49f6823 healthy metadata; bounded public GET live/ready/catalog all200. These are availability checks, not C2 PASS or data-freshness proof.
- Daily/weekly failed is not reset. Safe journal evidence: Dana HTTP500/scraper failure; daily freshness rejects DANA age48/60/72h before ingest. Upstream500 internal RCA is not proven; weekly also had timeout, exact terminal reason remains limited. This is an existing publication freshness incident, not repaired by dependency promotion. No synthetic sync/publication.
- All4 v2 resources absent: root baseline approval, pipeline selection, runtime mount record and dependency unit. Installed root executor remains historical d69c667… under policyv1, not new source63ccddb…. No valid completed OLD enrollment. Historical mutable OLD graph observation is not authorization and has group-writable entries; no adoption/chmod. Actual production-derived OLD rollback/rehearsal, OpenFile FD compatibility, quotas and complete actor cgroup budgets remain NOT_VERIFIED. Existing70 C2 backup hashes do not prove dependency rollback.

### 18.3 One actionable release gate; production not attempted

**OLD_ROOT_AUTHORITY_UNAVAILABLE / V2_BOOTSTRAP_NOT_PROVISIONED**: DesignContract§8 and§18 require a new fixed-purpose, frozen, admin-authenticated root bootstrap bound to the measured OLD graph, exact new root pins, strict policy2, durable baseline consumption/enrollment, selection/mount and boot/runtime units with coupled rollback. Historical consumed helper/initial approval cannot be replayed. Sole Owner may be the actual authorized admin; no second human is invented, and this agent has not minted an independent root record. The current published source has no production enrollment/bootstrap CLI; fixture helpers are not production installers.

Exact public candidate pins, schemas/admission requirements and the single Owner/admin handoff are saved in `/home/denis/tmp/aktau-part-b-fast-track-20261103-0cfdxvvz/EXTERNAL_GATES.md` and `NEW_ROOT_PUBLIC_SOURCE_PINS.json`. Resolve Dana freshness incident separately without bypassing freshness gates; then independently verify/enroll OLD and qualify the fixed bootstrap/rollback before any live writes. Recheck current main/CI/artifact expiry and fresh locks before one official promotion. No production pnpm install, root upgrade, mount, daemon-reload, service restart, authority rewrite, promotion or reboot was performed. AUTO_DEPLOY_ENABLED=false; SYNC_C2_PROMOTION_ENABLED absent.

Consolidated report: `/home/denis/tmp/aktau-part-b-fast-track-20261103-0cfdxvvz/PART_B_FINAL_OWNER_FAST_TRACK_REPORT_20261103.md`. Final source/evidence archive: `/home/denis/tmp/aktau-part-b-owner-fast-track-20261104-0cfdxvvz.tar.gz`; external SHA256 sidecar generated after sealing. Final tracked worktree delta after this append is this report only; excluded Owner files and unused prototype remain untouched.


## 19. Final bootstrap TASK — confirmed actual custody conflict (2026-11-04)

Recorded 2026-11-03T20:34:05.714300+00:00. **BLOCKED_WITH_EVIDENCE**, not source/bootstrap/deployment completion. New clean worktree `/home/denis/tmp/aktau-part-b-v2-root-bootstrap`, branch `feat/part-b-v2-root-bootstrap`, baseline/current main `d071be3c7e071a4b52256548a8239d6c179ce565`. Original worktrees and Owner files remain untouched. Only authenticated historical report tail §§18.1–18.3 was imported as an append, verified against its previous source manifest; no dirty code/prototype was copied.

### 19.1 New fact and exact frozen-contract conflict

Fresh root read-only metadata at 2026-11-03T20:17:53Z and second observation20:25:11Z proves `/opt/aktau-sync/pipeline`: UID999/GID987, mode0775, dev64770/inode798605/nlink6, no xattr. Its node_modules and .pnpm directories are also0775. /opt and /opt/aktau-sync are0755.

`publisher-promotion.py:2318` unconditionally requires `not st.st_mode & 0o022` along the mount target chain; `legacy_input_inventory` at2504/2512 also forbids group-writable input parents/directories. Therefore the actual OLD is rejected before capture/target mount. Both attach and restore use the same guard; after detaching an enrolled OLD mount, underlying0775 reappears and neither NEW attachment nor OLD reattachment can pass the unchanged contract. A standalone bootstrap direct syscall would bypass this root boundary and leave rollback unsafe. An admin approval alone does not override these predicates.

New real Linux qualification (not mocks/SKIP): rootUID0 and aktau-syncUID1999 in disposable Ubuntu24 containers, original six caps, networknone/readonlyroot/NNP/resource bounds. Actual sealed readonly stage was prepared in both cases. Target0775 => `pipeline_mount_custody` before target mount, original inode/mode/bytes unchanged. Separate0755 positive control => actual readonly mount, detach and OLD reattach all succeed. This distinguishes the mode contract from missing capabilities/AppArmor/kernel support. No runtime root source/policy/guard was changed.

First qualification harness failed before testing Store because it chmodded after chown without CAP_FOWNER. Failure preserved; corrected fixture ordering (chmod before chown), with no extra capability; final two real controls exit0. Final runner uses UUID-owned resource names and verifies container/image cleanup.

### 19.2 Independent evidence completed, unexecuted work explicit

Fresh GitHub main is unchanged `d071be3c7e071a4b52256548a8239d6c179ce565`. Existing real PR41700861534/main41702239307 CI9 remain9/9 SUCCESS, build41703391529 is2/2 SUCCESS. Original artifact13265286099 remains unexpired; original cached ZIP recomputed SHA256ab9048d5c46edc002534a21813618fb771e123f94393d26f8003d928bb7d88bd matches live GitHub metadata. No new CI/build dispatched and no old artifact renamed as new. Prior accepted20 sanitized job logs are retained as historical evidence, not newly run tests.

Current VPS publisher remains detached b2012c5b8c05de8a7667bf942daf9d7232f3a7b6, clean; exact OLD tree/package/lock match independent public GitHub objects with recomputed blob hashes. Policyv1, all6 runtime pins,12/12 closure and70/70 backups in five retained releases match. No interlock; reader metadata and ledger34INCONCLUSIVE/0PASS retained. No DSN/env/secret read. Existing target775 means secure full OLD freeze cannot be claimed: both required input/runtime inventory digests are null in OLD_BASELINE_EVIDENCE.json, not copied from prior observation or fixtures. GATE_ROOT_BOOTSTRAP/GATE_PROMOTION are FAIL summaries, not approvals.

One current read-only Dana catalog GET200 (TTFB1090ms/full1166ms), API live200/1541ms, ready200/500ms; three requests, no retry, bodies not retained. Historical DANA48/60/72h freshness failures remain; one200 does not establish scrape recovery/data freshness, HTTP500 internal RCA or C2 acceptance. No sync, ingest, HMAC or publication.

Bootstrap implementation/frozen applicable root bundle/new PR/new-main CI/new artifact/root enrollment/production-derived coupled rollback/reboot: **NOT_RUN after confirmed frozen root-contract conflict**. No hypothetical installer for a different0755 baseline was published as a solution for this0775 VPS. The full unchanged regression matrix is not rerun/claimed newly PASS; exact previously qualified source/CI is preserved. No commit/push/merge, root upgrade, policy/mode change, daemon-reload, service/timer changes or live transaction. AUTO DEPLOY false.

### 19.3 One exact Owner decision, not general deployment re-approval

The requested combination (unchanged0775 original target + unchanged no-group-write capture/mount guards + actual coupled rollback) is incompatible. AGENTS frozen-contract STOP and this TASK's no-guard-weakening/no-original-chmod constraints apply. Required single decision: explicitly approve a **source-only contract amendment** for the exact operator-owned raw-input/underlying-target0775 case, bound to independently authenticated baseline metadata/inventories and private FD/inode CAS. It must preserve every root-private parent/capsule/seal check, original permissions, root-only normalized copy/nlink1/no writable alias, locks, authenticated baseline and coupled rollback. No generic0775/path/UID/env exception. After that decision the applicable bootstrap and required rollback/fault matrix can be implemented and qualified; only then may Owner issue a real short-lived exact-bundle root approval. No future hash/approval is requested or invented now.

Consolidated report and the **single** handoff are `/home/denis/tmp/aktau-part-b-bootstrap-20261104-qu904_eh/PART_B_FINAL_PRODUCTION_COMPLETION_REPORT_20261104.md`; no additional handoff/TASK document. Archive/SHA256 external seal follows.


### 19.4. Продолжение после первоначального read-only checkpoint — source candidate

Первоначальный §19 описывает ранний checkpoint, когда нового исходного кода ещё не было. Он сохранён как история, а не как утверждение об окончательном diff. После него выполнена самостоятельная source-only работа в `feat/part-b-v2-root-bootstrap` от `d071be3c7e071a4b52256548a8239d6c179ce565`.

Добавлены **неквалифицированные для production** `ops/c2/pr86-root-bootstrap.py` и `ops/c2/test_pr86_root_bootstrap.py`. Кандидат ограничен фиксированными девятью root targets, существующим approval/enrollment contract, тремя locks, no-clobber inputs, независимой GitHub source/CI проверкой **до import/exec runtime**, consumed record, backup/interlock, OLD selection и явным rollback. Approval не создаётся. Ни кандидат, ни новый policy не устанавливались на VPS. Это не `Source done`: полная реальная bootstrap/systemd/crash qualification ещё не доказана.

В `publisher-promotion.py` добавлен узкий private guard для underlying operator-owned `pipeline/0775`: только реальная роль, точные parent/target identities из **существующего валидного consuming enrollment**, sealed generation и policy v2. Ни root/capsule parents, ни unenrolled group-write exception не разрешены. Public CLI/approval override не добавлен, `require_enrollment` schema не изменена. На VPS permissions/ownership не менялись.

Fail-first boundary test: до функции — 8 ERROR (отсутствующая реализация). Затем обнаружен дефект тестовой fixture: parent уже имел 0755, поэтому chmod0755 не был инъекцией. Исправлена только fixture: она доказывает фактическую смену режима. Существующая отрицательная проверка не ослаблена. Дополнительный пред-CAS comparator воспроизводит AssertionError при исключении ctime; это реконструкция старого варианта, выполненная после рабочего исправления, не хронологический fail-first. Новый Files CAS сравнивает полный stamp перед publication, после собственного rename допускается ожидаемое изменение ctime при проверке перенесённого inode.

Текущие локальные bootstrap tests: **40/40 PASS, 0 SKIP**. Они включают authority/CI/source boundaries, реальные непривилегированные Linux filesystem операции и модель platform для транзакции с реальным SIGKILL дочернего процесса. Модель не заменяет root/systemd integration. Три отдельных disposable root/native mount сценария PASS: unenrolled0775 отклонён до target mount; 0755 mounted+detach+reattach; enrolled0775 mounted+detach+reattach через реальный consuming validator. Root UID0 и actor UID1999, network none, без privileged/unconfined.

### 19.5. Реальные критические gates — не подменять локальным rebuild

Повторный production readback `2026-11-03T21:53:06Z`: publisher clean detached `b2012c5b8c05de8a7667bf942daf9d7232f3a7b6`, policy v1 SHA256 `2bf672f1626252f107447552493ad982999d3d7f444f000394a7006d952ddb8b`; authority alignment, 12/12 closure и 70/70 backups сохранены; interlock отсутствует; ledger **34 INCONCLUSIVE, 0 PASS, 0 FAIL**. API image `49f6823768817b0390f215de42439cce523bf5d3` healthy. Daily/weekly last runs FAILED, timers активны: это не healthy sync/data freshness PASS.

OLD public reference независимо пересобран непривилегированно из exact Git/lock/SRI; Node24.18.0/pnpm10.32.1/tsx/esbuild/Zod3/undici7 offline probe в network-none Linux PASS. Но reference **не является установленным OLD**: фактический Vite7.3.6 отличается от lock/rebuild7.3.7. Два стабильных peer-aware observational passes: 3436 entries, 60779422 известных публичных bytes, 6 неизвестных paths и 21 несовпадающий путь; это не полная inventory и не независимая аттестация unknown/generated/cache entries. `legacyInputInventorySha256` и approved `oldRuntimeInventorySha256` для VPS остаются **не установленными**, не заменены reference digest.

Реальная root-systemd qualification локально недоступна: `sudo -n systemd-run` отказал `password is required`, root unit не запущен; последующий unprivileged observer получил PermissionError для `/proc/1/ns/mnt`. Ошибка сохранена. Отдельный **user-manager** OpenFile feature probe успешно передал namespace FD3 и unit был collected; это не root manager/bootstrap/boot qualification. Пароль не запрашивался, sudo/cgroup/security policy не обходилась. Production для теста не использовался.

Статус этого continuation: **BLOCKED / BLOCKED_WITH_EVIDENCE**, не release-ready. Без полного OLD provenance, двух настоящих inventory identities, квалификации bootstrap/recovery/root-systemd и последующего exact bundle admin approval нельзя создавать production trust record или выполнять bootstrap/promotion. Новые commit/PR/CI/build в этом continuation не создавались. Старый CI9/artifact относятся только к `d071be3…`, не к изменённому кандидату. Единственный подробный consolidated report и sanitized evidence находятся off-tree; окончательные exit codes/матрица/архив добавляются ниже после завершения серийных проверок.


### 19.5.1. Дополнительный локальный rollback defect и исправление

До source correction выполнен настоящий fail-first: новый `Platform.verify_rolled_back()` не проверял underlying OLD bytes, тест завершился AssertionError `Blocked not raised`. Исправлено минимально: после detach проверяется полная raw input inventory **до удаления records/восстановления legacy root files**, затем повторно в финальном rollback verifier. Drift сохраняет interlock и блокирует дальнейший recovery. Добавлены negative и stable positive controls; три focused regression PASS. Evidence: `underlying-rollback-fail-first.log` / `UNDERLYING_ROLLBACK_FAIL_FIRST.json`. Это локальный новый кандидат, не production defect/deploy; последняя матрица расширена до43 bootstrap tests и314 Python ops tests. Full root-systemd/bootstrap qualification и настоящий OLD approval по-прежнему отсутствуют.


### 19.6. Окончательная локальная матрица continuation

Новый bootstrap43/43 PASS без SKIP; финальный ops314 Python +186 Node PASS без SKIP; publisher64, historical root-helper33, capacity12, artifact12 PASS. Go/race/vet/staticcheck/govulncheck и C2 Node377/377 PASS; root/native71+11 PASS; pipeline, security, contracts, Nest, Frontend, PG17, staging commands exit0. Optional SKIP сохранены: contracts10; frontend E2E11; staging Voice4 на каждый backend и browser6 — не считаются executed PASS. Full root-bootstrap/root-systemd/reboot recovery не квалифицированы. Новый CI/build/PR не запускались. Продакшен не изменён. Final disposition BLOCKED_WITH_EVIDENCE. Полная матрица команд/exit codes, failed evidence, единственный continuation handoff и archive integrity — в off-tree PART_B_FINAL_PRODUCTION_COMPLETION_REPORT_20261104.md.


## 20. 2026-11-04 — last-mile actual OLD custody and real bootstrap qualification

Historical §§1–19 are preserved. This section supersedes the earlier **local
qualification** blockers, not production authority. No production source,
permissions, policy, service, database, timer or snapshot was changed.

### 20.1 Actual installed OLD, not the rebuilt reference

Bounded read-only SSH established a complete3504-entry actual inventory. The
installed inner pnpm lock is the public historical blob
`7521af962056f2e9de08b366de03371731f7c64d` from
`bd47a251e7ec85fda80ae4e3ad282bb6599ce408`, rather than the tracked b201 lock.
Vite7.3.6 bytes/peer context were independently checked against official npm SRI;
generated wrappers/modules/workspace metadata and the stale public Vitest cache
were classified before retaining their bytes. No private file was adopted.
The normalized graph omits only the five explicitly permitted `.vite`/
`.vite-temp` entries and adds the independently pinned official pnpm tool.
Original actual files/modes were not repaired to resemble Vite7.3.7.

A bounded15.233s capture held the three existing exclusive locks. The service
account was nologin, no actor/group writer process existed, and all10 non-root
processes were checked for writable descriptors to the actual graph/aliases.
Full no-follow metadata/hashes matched before and after a local root-private
capture. The capture uses independently reconstructed **byte-equivalent public
content**, verified against the locked actual VPS, not a filesystem image of the
VPS. Its2824 raw blob files are distinct root-owned0400/nlink1 inodes. Original
pnpm hardlinks remain unchanged. This is custody evidence, **not approval**.

| Identity | SHA256 |
|---|---|
| Actual raw input inventory | `c7b3caeadf17078552603e04bcdecbfd42fad24e3542cd2ca14ec019a88d8b3b` |
| Normalized OLD runtime inventory | `2eb199ecb3eb7747a7ad5666cff849b8f2e8c1c713088558d4ea9d6335fd6026` |
| OLD runtime capsule,85903360bytes | `2e50aeb78637af8ed1e6014f1b7b97e62c59f170c770bd0f062910e574d00bae` |
| Root-private local capture seal | `2a69ff94af413736eb6fb4eb54bbda7f4ef2e53d0ff080f901489e5709fb8259` |

Retained owned volume:
`aktau-old-root-snapshot-5c3d5a3287a7486594990a06a88e7642`.
Evidence: `ACTUAL_OLD_ROOT_CUSTODY_CAPTURE.json`, complete inventories, public
origin/SRI and generated-file classification under the off-tree evidence
location below. The failed first local copy lacked DAC_READ_SEARCH on a readonly
input bind; its empty owned volume/log remain. Only the disposable copy process
received that bounded read capability. No VPS permissions were changed.

### 20.2 Fail-first source corrections

The existing bootstrap was continued, not replaced. Fail-first evidence exposed
and corrected: missing initial/recovery idle admission; pre-consumption orphan
namespace checks; ordinary pretty UTF8 npm metadata incorrectly subjected to
canonical wire JSON; unregistered/partial raw capture being reported rolled
back; same-generation foreign mount identity; missing durable mount-stage inode
registration; control/enrollment replacement checks occurring too late; and
missing interlock on deliberate recovery of a committed but foreign tuple.
Raw retention now has durable intent, a bound seal/inode record and complete
revalidation before recovery mutates live resources. Unknown partials remain
interlocked; no foreign cleanup/adoption is added.

Actual OLD→NEW testing additionally exposed0664 tracked OLD data files and an
omitted underlying-target identity in the parity call. Design Contract§20.2
explicitly records the narrowly bound read-only exception: independently
approved/consumed raw inventory, exact original file identity/mode/owner/SHA256,
fixed OLD/NEW trees, and **current selected Git blob** all remain mandatory.
This does not authorize execution from the underlying legacy node_modules or
relax capsule/private/root custody. A real ordinary UID1999 held-dirfd injection
replaced an original with same bytes/mode but another inode; the verifier rejected
it without touching either inode or the parent's mount.

Python3.13 descendant cleanup has a deterministic real-child readiness handshake.
The original0.3s command budget and descendant-kill assertions remain. Original
3.13.5 failure was reproduced under explicit0.05CPU loading; corrected test and
full64-test publisher suite passed on that interpreter earlier in this task.
Final-byte3.13 rerun is recorded in the final off-tree matrix, not inferred here.
No production command implementation was changed for this test race.

### 20.3 Real root/systemd and coupled rollback

Owned disposable Ubuntu24/systemd255.4 PID1 fixture, network none, readonly
source/root, private namespaces/cgroups, finite tmpfs/CPU/memory/PIDs and bounded
capabilities. No privileged/unconfined mode, SYS_PTRACE or host-policy change.
Synthetic CI/approval exist **only inside the fixture**. Real filesystem, Git,
runuser, public ELF/graph, mount and systemd operations were exercised.

- Nine root targets read back; two unchanged targets are preserved. Two actual
  historical v1 histories/28 backup files are retained in the fixture.
- Actual0775 underlying target, Node24.18.0, pinned pnpm10.32.1, OLD Vite7.3.6,
  Zod3.25.76/undici7.30.0 and25 public Dina/Dana/FixPrice products passed.
- Authenticated historical d071 artifact is used **only as fixture input**:
  OLD→NEW Zod4.6.7/undici7.30.1→OLD, actual readonly graph imports/esbuild/native
  addon, `PRODUCTION_SOURCE_RUNTIME_ALIGNED` **inside the fixture**,14-target
  restoration, reader custody and a new terminal ledger append via the actual
  Node ledger API all passed. This is not a new deployable release artifact.
- Two real systemd actors waited behind the exclusive transaction, then entered
  with zero effective capabilities. Actual OpenFile FD3/manager namespace and
  committed mount reconstruction passed. Kernel mount IDs were observed to be
  recycled; the invalid test assumption of unequal IDs was replaced with the
  actual durable boot intent, confirmed absent→mounted transition and exact
  restored mount/attestation tuple. **Kernel reboot NOT_RUN.**
- 28 final actual-root scenarios passed: all seven changed root publication steps,
  before/after consumed, intent/raw/generation/stage interruptions, SIGKILL,
  rollback interruption, foreign inode, ENOSPC/fsync-EIO syscall injection,
  EBUSY, mount registration/bind/move boundaries and unknown attestation after
  reload. Unknown resources remain intact/interlocked. These are not physical
  disk/power-loss tests.
- Two additional actual CLI signal scenarios passed: SIGTERM cancellation and
  SIGALRM deadline use the real entry/handlers and recover to OLD. Earlier
  harness attempts correctly hit a parent-held lock and an unbound synthetic
  API after module reload; both failures are retained and the harness corrected.
- Kernel reboot and production bootstrap/promotion are **NOT_RUN**. A systemd
  reconstruction is never presented as a physical reboot or production PASS.

The disposable PID budget changed128→512 after a demonstrated fork-resource
failure; only fixture `/opt` and Node tmpfs capacity grew to satisfy the unchanged
per-filesystem reserve. Production guards, artifact cap and timeouts did not grow.

### 20.4 Local regressions and current production boundary

Final local commands from TASK§6 all exited0: bootstrap66, publisher64,
historical helper33, capacity12, artifact12; ops337Python+186Node; root bundle71
and native11; Go ordinary/race/vet/staticcheck/govulncheck/full-size READY2CPU;
C2 Node377; pipeline, security, contracts, Nest28/audit, frontend278/build and
Playwright57PASS/11SKIP; PG17, ephemeral staging, Part16 and diff-check.
C2/ops/native suites have0SKIP. Optional/live profiles are not turned into PASS;
full Go skip inventory and final3.13 results are separately retained.
Eight frozen fixture files remain identical to HEAD; the historical executor
remains59455bytes/SHA256`d69c667212b2a6c8a25081ccdc90f798024e850784262976e06e45ce13f45118`.

Fresh read-only VPS evidence: clean publisher`b2012c5…`, policy1/old executor,
12/12 closure and70/70 backups across five retained releases preserved; API
container`49f6823…` healthy. Ledger35INCONCLUSIVE/0PASS/0FAIL at observation;
no interlock, bootstrap/selection or independent baseline approval exists.
Production systemd255 supports the required feature and SSH shares the manager
mount namespace. These are snapshots, not future admission reservations.

The genuine2026-11-04 daily run had DINA/FIXPRICE exit0, DANA exit1/11s, then
rejected DANA source age84h and failed publication. This proves freshness remains
blocked; the latest scraper HTTP failure cause is **not established** by the
sanitized enum projection. Historical HTTP500 must not be labelled a newly
measured status. No threshold, data, parser, timer or publication was changed.

New candidate Git/CI/main/artifact/root-bundle qualification and genuine
short-lived administrative approval remain separate release gates. Prior
PR87/main CI9 and artifact13265286099 are historical only. No old artifact will
be used to deploy changed source. AUTO DEPLOY remains untouched/disabled.

Evidence directory:
`/home/denis/tmp/aktau-part-b-last-mile-20261104-2qqc63bb`.
The single final off-tree consolidated report is
`PART_B_LAST_MILE_RELEASE_REPORT_20261104.md`; final Git/CI/artifact identities,
command exits, sanitized logs and archive integrity are recorded there and in
subsequent append-only qualification entries. This section does not declare
production deployment or C2 acceptance.
