# PR86 pipeline offline promotion — Design Contract v2

Дата: 2026-11-02. **DESIGN_CONTRACT_READY_FOR_REVIEW**, исключительно design candidate. Реализация Part B, production inventory и root upgrade **не разрешаются этим документом**. Новая транзакция не реализована и не квалифицирована; её crash/recovery tests остаются NOT_RUN.

Baseline main: **`49f6823768817b0390f215de42439cce523bf5d3`**. Fresh fetch подтвердил этот SHA. Работа продолжена без checkout/reset/rebase в `/home/denis/tmp/aktau-c2-pipeline-dependency-promotion-20261102`, branch `fix/c2-pipeline-dependency-promotion-20261102`, HEAD49f6823. Только новый Markdown contract; предыдущий [remediation report](PIPELINE_DEPENDENCY_PROMOTION_REMEDIATION_REPORT_20261102.md) сохранён. Доказанные RCA и опасность naive rollback не пересматриваются.

## 1. Решение и границы доверия

**Один механизм: retained root-sealed capsule всей pipeline/, read-only bind mount на существующий `/opt/aktau-sync/pipeline`.** Capsule содержит точные tracked pipeline files из source.bundle, полный установленный graph node_modules и закреплённый pnpm10.32.1 внутри `node_modules/.aktau-pnpm/`. Последний путь уже исключён существующим Git ignore; нового `.gitignore` или generic package override нет.

Это сохраняет `import.meta.dirname`, относительные ESM imports, `pnpm exec tsx`, реальные `.pnpm` links и существующий `REPO_ROOT=/opt/aktau-sync`. Каталоги `/opt/aktau-sync/data`, backend-go, reader/ledger и секреты не входят в capsule. NODE_PATH не используется. Не меняются бизнес-скрипты, parser semantics, public API/DB, C2 source manifest/authority форматы, READY5000/HTTP4000/SLA5000,21GET/2sitemap, HMAC/FIFO/AFTER и private custody.

Trust boundaries:

| Область | Доверие/полномочия |
| --- | --- |
| GitHub reviewed main, exact CI9, pinned producer, оригинальный ZIP digest | Независимая авторизация новых public bytes; uploader manifest сам ничего не разрешает |
| Root executor/policy/retained receipts | Проверка source+capsule+14 targets, фиксированные filesystem/mount операции; package code не выполняется root-ом |
| aktau-sync | Выполнение уже выбранного graph, обычные data outputs; без mount/sudo/SSH extension |
| Package registry | Недоверенные входные bytes до integrity/build qualification; сеть доступна только изолированному CI preparation |
| Legacy installed graph | Не считается CI-proven по наличию lockfile; отдельная проверка/attestation перед baseline enrollment |
| Root/admin | Независимая исходная provisioning authority; её компрометация вне модели. Ни installer, ни PR не выдают себе approval |

Mount требует существующей root CAP_SYS_ADMIN, **не выдаваемой aktau-sync/CI/SSH caller**. Этот новый root-side scope должен быть принят review и отдельно разрешён для production. [mount(2)](https://man7.org/linux/man-pages/man2/mount.2.html) различает bind, remount и move: простой bind не является доказательством read-only. Новый механизм обязан проверить flags/inode после attachment. `noexec` не применим к исполняемому esbuild graph; обязательны ro,nosuid,nodev, отсутствие writable alias для оператора и root-only source ancestors.

Отвергнуты: in-place pnpm install; расширение PIPELINE_TOOLING_BRIDGE без dependency domain; NODE_PATH; operator-writable symlink как единственное доказательство selection; отдельный bind только node_modules, оставляющий writable pipeline loader/config; ранний systemd per-service bind через mutable current до acquisition lock (может закрепить прежнее поколение у ожидающего unit).

## 2. Ровно разрешённый переход

Новая реализация принимает source S только из независимого exact-main authenticated build, с49f6823 в ancestry и **pipeline tree ровно4f1294e…**. Допустимы первый переход old→new ниже и последующее переиспользование того же неизменного new graph в source/C2 release. Любая следующая смена package/lock/pipeline tree требует отдельного design/review. Это не general dependency deployment API.

| Identity | OLD, publisherb2012c5 | NEW, PR86 |
| --- | --- | --- |
| Source baseline | `b2012c5b8c05de8a7667bf942daf9d7232f3a7b6` | source S: reviewed descendant49f6823, exact current main |
| pipeline Git tree | `2ed1c1c6d6fef504b08829f4193a0b60681bd3a7` | `4f1294e3ec73fd477d85825588b8f382125fc1c6` |
| package.json blob | `3049257eb2898eb4c279a296f3bd56f1a52e883b` | `b4d13a331beb967c63c32c480fcccfc31dc545e1` |
| pnpm-lock.yaml blob | `cfee18d88a435e550c0ed3f074fb8ccd4704cdfe` | `bd94f3bb67624e36cc89b94585bae22065ec14c1` |
| zod |3.25.76 |4.6.7 |
| undici |7.30.0 |7.30.1 |
| tsx / esbuild |4.23.15 /0.28.2 |4.23.15 /0.28.2 |

Tracked tree comparison uses Git object type/mode and raw blob bytes, no EOL conversion, replace objects or arbitrary hooks. Artifact SourceSha is S, **not** fabricated49f6823 when Part B creates a later main. The pipeline subtree must remain the exact NEW tree. No parser change is implicit.

Pinned environment:

- Node **v24.18.0**, Linuxamd64, approved ELF SHA256 **`41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c`**; existing C2 Node member/path remains unchanged.
- pnpm **10.32.1** official package `https://registry.npmjs.org/pnpm/-/pnpm-10.32.1.tgz`, SHA256 **`9b943b94bc8f55efb993aad8e44b538e6b091e60a9e4a944dcde869855f233e3`**; SRI **`sha512-pwaTjw6JrBRWtlY+q07fHR+vM2jRGR/FxZeQ6W3JGORFarLmfWE94QQ9LoyB+HMD5rQNT/7KnfFe8a1Wc0jyvg==`**.
- Linux x86_64, glibc (not musl); approved Node minimum ABI and all selected optional/native files must pass the actual target compatibility gate. No cross-OS graph reuse. Go1.27.3 provenance unchanged for the existing three ELFs.
- Full frozen graph, including runtime-used devDependency tsx and its native esbuild. No assumption that `--prod` suffices.

## 3. Artifact v2: exact inventory, hashes and bounds

SSH request remains the existing exact **version1** seven-field canonical line + original GitHub ZIP. No path/command/env/approval argument is added. **promotion.json.version=2** explicitly selects this package contract. Legacy manifest1 cannot carry dependency changes. Reject unknown/mixed versions rather than filling omitted fields.

Outer ZIP: exactly one regular `promotion.tar`, same256MiB compressed-input and outer TAR caps. Outer TAR v2: **16 regular members**, previous14 plus `pipeline-runtime.tar` and `pipeline-runtime.json`. No archive symlinks/hardlinks, PAX, devices, duplicate names or extra members. Existing12 `files` hashes, source.bundle hash, recipe, toolchain and producer identity remain mandatory.

The existing promotion.json key set gains exactly `pipelineRuntime`, with exact keys `{descriptorSha256, capsuleSha256, inventorySha256}` (all64 lowercase hex). These hashes refer to authenticated bytes inside the same artifact. `pipelineRuntime` does not authorize root policy. Root independently validates all original GitHub/CI/build pins and computes every digest.

`pipeline-runtime.json` exact-key schema (notation: S40/H64 lower hex; N bounded non-boolean integer):

```text
version = 1
contract = "pr86-pipeline-v2"
sourceSha: S40                     # same S as promotion.json / source.bundle
pipelineTreeSha1 = NEW_TREE
packageBlobSha1 = NEW_PACKAGE
lockBlobSha1 = NEW_LOCK
nodeVersion = "v24.18.0"
nodeSha256 = PINNED_NODE_SHA256
pnpmVersion = "10.32.1"
pnpmTarSha256 = PINNED_PNPM_TAR_SHA256
platform = "linux/amd64/glibc"
capsuleSha256: H64
inventorySha256: H64
capsuleBytes: N
logicalBytes: N
entryCount: N
```

For the first transition OLD identities come only from the pinned root contract and independently enrolled baseline. They cannot be replaced by an artifact's statement of old state. `files` remains the exact12 C2 members; existing authorization.json, automatic.json and source-manifest.json schemas are unchanged.

### Inner capsule format: indexed regular blobs

A raw USTAR export of pnpm links failed locally: valid link target103bytes exceeds its100byte field. Do not enable arbitrary PAX to hide this. `pipeline-runtime.tar` is deterministic USTAR containing:

1. `inventory.json`;
2. exactly `blob/<i>` for each regular-file entry i in inventory; no blob for dirs/links.

All members regular, mode0444, uid/gid/mtime0. No transport symlink/hardlink entries. The installer reconstructs filesystem links only from the independently authenticated, strictly validated inventory.

Inventory canonical form: compact UTF8 JSON + LF, ensure_ascii=false, no duplicate/nonfinite keys; key order exactly shown below. Entries sorted by raw UTF8 path bytes, unique. Path is relative to `capsule/pipeline`, no leading slash, empty/dot/dotdot components, backslash, NUL/control bytes or reserved current/receipt paths.

```json
{"version":1,"entries":[
  {"path":"...","type":"dir","mode":365},
  {"path":"...","type":"file","mode":292,"size":123,"sha256":"H64"},
  {"path":"...","type":"symlink","target":"relative-target"}
]}
```

292=0444,365=0555. Files may use0555 only for expected executable-bit source/tool entries; native executables require expected platform/content checks. Root directory is0555. No setuid/setgid/sticky file bits, ACL/xattr/capabilities or special files. Files reconstructed as distinct nlink1 inodes; source-store hardlinks never become retained writable aliases.

Links: relative only, ≤512UTF8bytes, bounded32-hop resolution, no cycle/dangling/escape; resolve entirely inside the capsule pipeline tree, including all intermediate links. Build directories/files through no-follow dirfd operations, links last, then validate the completed graph. Do not relax the old root Filesystem's no-symlink rules for policy/14 targets; use a separate confined graph validator. The `.aktau-pnpm` tool distribution is nested under ignored `node_modules/`, not a new untracked pipeline-root directory. Exclude Corepack cache metadata; verify the official distribution, not the cache directory as authority.

Fixed limits, not caller overrides:

| Resource | Limit |
| --- | --- |
| ZIP / outer TAR |256MiB each, unchanged |
| inner capsule TAR |96MiB |
| logical capsule file bytes |90MiB |
| inventory JSON |2MiB |
| entries incl dirs/links |8192 |
| regular file |16MiB |
| path / target |512bytes each |
| path depth / symlink hops |32 /32 |
| descriptor / manifest |16KiB each |
| journal |64KiB; per-file observed tables separately hashed, max2MiB |
| root request total / child Git |300s / existing20s, unchanged; SSH360s retained |

All bounds and total archive budget must pass simultaneously. Memory guard retains old bounds and adds conservative combined-budget accounting for outer/inner materialization and cgroup remaining memory. Disk admission includes original ZIP, stages, both graphs, all backups, observed tables and journal reserve; use actual available capacity and stop on ENOSPC. No dropping a backup or silently raising caps.

### Measured design fixture hashes — not production approvals

The values below pin the local normalized fixture graphs and indexed packing experiment. They are **not** future production artifact IDs/digests; future exact-main CI must produce and authenticate its own original ZIP/descriptor/capsule hashes. No final artifact hash is invented before that build.

| Fixture | Entries / logical bytes | Indexed TAR bytes / SHA256 | Inventory bytes / SHA256 |
| --- | --- | --- | --- |
| old | 4813 / 81946836 | 85913600 / `231f17acdccec37a0999f6bd98d4672a60657f0e4b0b8a1a9debb81753844f35` | 890900 / `2d73c7d82aa69acbf09b6404b1a32e690dc48aa4760e1778d25042e9f1bd4237` |
| new | 5058 / 83068409 | 87275520 / `d4b347f2f90158e3f00af961d520b3c260e89ff37c8c85a7f9d80b0e2773fc83` | 936848 / `bc17140b64fc8c989aa06aa50066e5e034cccfc9443d9a61126faaf7d4a205ec` |

Previous authenticatedb2012c5 artifact's regular-member bytes total173,255,133. New fixture capsule87,275,520bytes gives about260.5MB before a few new headers/descriptor: close to, but below256MiB. A future source.bundle/Go build can change size; combined-budget qualification is mandatory, not inferred from this estimate.

## 4. Layout, runtime and mount lifecycle

Fixed paths, proposed for independent approval:

```text
/var/lib/aktau-sync-promotion/                 # existing root custody
  capsules/<inventorySHA256>/                 # root:root0700; immutable generation
    pipeline/                                # root:root0555, selected ro bind source
      <all tracked pipeline files>
      node_modules/...                       # full graph + internal relative links
      node_modules/.aktau-pnpm/...            # pinned official pnpm distribution
    inventory.json                           # root0400
    seal.json                                # root0400, hashes/root inode/contract
  releases/build-<run>-<attempt>/             # existing retained release identity
    <existing14 members, backups, receipts>
    pipeline-runtime.tar
    pipeline-runtime.json
    pipeline-observed.json                   # bounded per-file verification table
  state/                                     # existing private journals
  .pipeline-stage-<release-id>/               # registered BEFORE creation
/etc/aktau-sync-promotion/pipeline.json       # root0644, sole persistent selection
/run/aktau-sync-promotion/pipeline-mount.json # root0444, boot-specific attestation
/usr/local/libexec/aktau-sync-promotion/bin/pnpm
/opt/aktau-sync/pipeline                      # fixed global namespace ro bind target
```

No capsule overwrites/GC in Part B. Reuse of an existing content-addressed capsule requires full seal/inventory equivalence and root custody; never replace its bytes/descriptor on collision. Build provenance is stored per release; capsule content seal binds pipeline tree/platform/toolchain/inventory and does not falsely claim a later full-source SHA originally built its content.

Persistent selection exact schema:

```text
version=1; contract="pr86-pipeline-v2";
sourceSha:S40; pipelineTreeSha1:S40;
inventorySha256:H64; descriptorSha256:H64;
releaseIdentity: fixed build-run-attempt or enrolled baseline identity;
provenanceKind: "github-artifact" | "legacy-installed-attested".
```

Generation path is derived solely from the validated inventory hash; no path string is accepted. Selection/provenance pointers must refer to retained root receipts and exact descriptors. `legacy-installed-attested` is allowed only for the one independently approved OLD baseline, never a new uploader artifact.

Ephemeral attestation exact fields: version1,bootId,mountNamespaceInode,mountId,selectionSha256,mountedRootDev,mountedRootInode,inventorySha256. Root writes it only after verifying the mount against a committed selection. The daily/weekly actor gate reads this public, non-secret record, checks current boot/namespace/mountinfo and mounted-root inode after acquiring the existing shared runtime lock. It also checks that selection source/pipeline tree agree with publisher and C2 authority. Missing/stale/mismatched attestation is not synthesized or bypassed.

Fixed pnpm shim runs **as aktau-sync**, with approved Node absolute path and `/opt/aktau-sync/pipeline/node_modules/.aktau-pnpm/bin/pnpm.cjs`; it is a root-controlled script, no setuid. Runtime gate prepends only its fixed root-owned bin directory to PATH. The production shim accepts only the existing scheduled script names (scrape:dina, scrape:dana, scrape:fixprice, sync, scope:dina, scope:dana); install/add/update/fetch and arbitrary run/exec are not production entrypoints. The disposable probe invokes the pinned CLI directly for pnpm exec tsx qualification; it does not grant that CLI a new root privilege. Reject loader/pnpm-config injection (including NODE_OPTIONS, nonempty NODE_PATH, NODE_COMPILE_CACHE and ESBUILD_BINARY_PATH) instead of executing uploaded configuration. Part B must disable mutable tsx transform caches using the fixed `TSX_DISABLE_CACHE=1` setting present in tsx4.23.15 and qualify that mode; this extra cache-hardening behavior is not claimed tested by the current runtime probe. Existing EnvironmentFile contents/credentials are not copied or logged. Artifact pipeline config must match the pinned tree; `.env`/private `.npmrc` in the proposed mount target is an admission blocker requiring Owner reconciliation, not something to hide under a mount.

Mount preparation: verify root seal and input/parent dirfds, stage a bind under root-private registered staging path, make that new bind ro,nosuid,nodev, then verify flags/root identity. This avoids exposing a briefly writable mount at the public target. Close all descriptors/cwd into the *old mounted view* before its single unmount; keep only safe parent and private-source descriptors. Unmount without force/lazy flags, verify the revealed underlying target inode, perform source checkout while it is unmounted, and move/attach the already-ro staging bind to that fixed target with descriptor/parent CAS. Verify canonical destination path and mount identity immediately afterwards. Do not hold an old mount FD and then mistake self-induced EBUSY for successful detach.

All mount/umount argv or syscall inputs are fixed/dirfd-derived and bounded, no shell=True, fstab parsing, generic mount helper or caller path. Unexpected nested mounts/propagation/namespace state reject. EBUSY, foreign inode, unexpected mount or unknown child state => STOP and retain evidence; no force/lazy detach or blind second apply. [umount(2)](https://man7.org/linux/man-pages/man2/umount.2.html) explicitly exposes EBUSY and warns that force/lazy modes change normal removal semantics.

### Reboot

Mounts are not durable. Add a fixed root oneshot `aktau-sync-dependencies.service` invoking only new root-only `publisher-promotion.py --mount-committed-pipeline`; it does **not** publish or upgrade source/authority. Only the daily/weekly service drop-ins gain Requires+After for this unit; timer schedules/User/EnvironmentFile/business ExecStart stay unchanged. Before/After without Requires is not a failure dependency; see [systemd.unit](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html).

The boot operation must execute in PID1's host mount namespace, without PrivateTmp/PrivateMounts/ProtectSystem/BindPaths-style filesystem namespace creation of its own; it compares its namespace to /proc/1/ns/mnt before writes. This is a new narrowly privileged root operation, not an extension of aktau-sync privileges. It takes existing locks and validates a fully committed tuple, or fails. If there is a pending/unknown transaction it must not infer recovery from source HEAD or automatically rollback. Its exact zero-input root-only mode may reconstruct only the known committed mount/ephemeral attestation; no source switch, package install, ledger edit or replay of approval. It handles units waiting at their dependency barrier without treating them as executing publishers; operator PID/cgroup check must still prove no actor started. Mount namespace must match the attested host view for the two pipeline-executing actor units; production checklist must establish this. Their runtime gate independently refuses service entry if mount proof is absent even when systemd cached the oneshot as active.

**Existing custodian isolation is preserved.** `ops/c2/aktau-c2-custodian.service` already sets PrivateTmp=yes, ProtectSystem=full and ReadWritePaths, so its namespace must not be required to equal the host namespace. It does not execute pipeline packages. The c2 role keeps the existing root/shared-lock/notify/PID entry behavior and independent C2 authority checks, without adding actor package-mount or actor Git-dirty checks to that role. No weakening of its namespace settings and no new mount-unit dependency in promotion-custodian.conf. A custodian instance waiting across promotion must still satisfy existing BEFORE/process/Go-source authority checks; it is not evidence that the pipeline graph ran. This role distinction prevents a correct private namespace from being rejected or silently disabled.

## 5. OLD baseline: capture, provenance and retention

The local OLD fixture was rebuilt from the old Git blobs; **it does not attest the actual VPS tree**. Before any v2 enrollment, separately authorized read-only inventory must establish actual old source/package/lock, complete installed graph and pnpm/Node identities. A lockfile or guessed version is insufficient.

The reviewed provisioning packet must bind one actual old-tree inventory digest and origin evidence. Prefer matching all public package bytes against an independently obtained old-lock integrity closure and known pnpm-generated files; qualify any esbuild generated/copy step explicitly. If actual public files differ or provenance cannot be established, **BLOCKED_LEGACY_DEPENDENCIES_UNATTESTED**, not an automatic adoption. An independently approved `legacy-installed-attested` baseline may be used only with that explicit provenance label and exact inventory; it is never relabelled CI-built. Administrative approval is independent of the uploader/agent and is not created by the capture tool.

### Independent baseline authorization record

Fixed future path `/etc/aktau-sync-promotion/pr86-baseline-approval.json`: root:root0600,nlink1,no-follow/root-controlled ancestors,no ACL/xattr. It is created by the independent Owner/admin after reviewing the bounded inventory and exact root provisioning bundle; **never by the uploader, capture tool or artifact**. No approval file is created in this task.

Exact-key record schema:

```text
version=1; purpose="pr86-baseline-enrollment"; approvalId:hex32;
sourceSha=OLD_SOURCE; pipelineTreeSha1=OLD_TREE;
packageBlobSha1=OLD_PACKAGE; lockBlobSha1=OLD_LOCK;
legacyInputInventorySha256:H64;
oldRuntimeInventorySha256:H64;
nodeSha256=PINNED_NODE_SHA256; pnpmTarSha256=PINNED_PNPM_TAR_SHA256;
oldExecutorSha256=d69c667...; oldPolicySha256=2bf672f...;
reviewedRootBundleSha256:H64; newPolicySha256:H64;
notBefore:UTC-ISO-ms; expiresAt:UTC-ISO-ms.
```

`legacyInputInventorySha256` covers the actual old entry/content/stamp table. `oldRuntimeInventorySha256` covers the explicitly reviewed normalized execution graph (including the separate pinned pnpm distribution); it must be computed/reviewed, not inferred from a package version. `reviewedRootBundleSha256` binds every new root/runtime/unit byte. Dates form a positive interval of at most1hour; no automatic extension. The exact full old executor digest is `d69c667212b2a6c8a25081ccdc90f798024e850784262976e06e45ce13f45118`; old policy is `2bf672f1626252f107447552493ad982999d3d7f444f000394a7006d952ddb8b`. Parsers never accept ellipsis strings.

A fixed bootstrap records and fsyncs a no-clobber consumed intent at `BASE/state/pr86-baseline-consumed-<approvalId>.json` **before its first mutation**, and matches it on recovery. Any failed/unknown apply consumes that attempt. Its own journal references this record; neither initial-reviewed nor a consumed historic helper approval is used. Baseline capture/normalization/retention must reproduce both approved hashes before enrollment. Missing provenance or hashes is a production admission failure, not a caller-controlled fallback.

Under all existing exclusive locks, root capture must:

1. Prove no actor/service/child can still be using or changing the tree. Pin `/opt` root/no-write and the one delegated `/opt/aktau-sync` parent to actual aktau-sync UID/GID/mode/device/inode, obtained from the real account. No UID/path/env override and no chown/chmod of existing parents.
2. Before opening content, require exactly approved tracked pipeline files plus ignored node_modules; reject secrets/config/unexpected untracked files, private modes, special files, external links and ACL/xattr/capabilities. Inspect secret-name presence as metadata only. Source files must match old Git blobs, including executable bits.
3. Read with no-follow pinned descriptors. Record and compare device/inode/uid/gid/mode/nlink/size/mtime/ctime, complete directory name sets and hashes on two passes. Existing store hardlinks may be read only if accounted for in approved provenance; root copies into **new distinct nlink1** retained files, never links the mutable store into custody. CAS rejects any change. Record per-file input stamps in a bounded private table referenced by hash from the journal.
4. Journal intent before creating snapshot/stage resources. Copy all approved old graph bytes, retain original metadata inventory/old source+14 hashes, seal the independently approved normalized executable capsule and separate raw capture identity. Any necessary normalization (including separate pinned pnpm distribution) is explicitly described and tested, not falsely called the original bit-for-bit installed tree. Preserve the untouched underlying old node_modules as an additional retention layer; never use it as the sole rollback.
5. Fsync files/directories, verify a second read of the sealed graph, then enroll the OLD selection with a root baseline receipt. Prove the old source, old package versions/import graph and data paths still work in sandbox before review. Production bootstrap must not run a real scrape/sync as its proof.

Retention is root-private, no-clobber, includes old/new snapshots and every historical release backup. No deletion, pnpm prune, GC or rollback-ref removal in this Part. Read-only inventory alone does not authorize capture/enrollment; those are future explicit administrative mutations.

## 6. Unified v2 journal and recovery

The14 C2 targets remain their existing exact paths/modes. `pipeline.json` and capsule/mount are an **additional separately typed transaction domain**, never silently appended to a v1 target map. Atomicity is logical service-entry exclusion under the existing ingress/runtime/controller locks plus durable interlock; no claim that15 files and a Git checkout change in one filesystem instruction.

Journal2 exact top-level fields:

```text
version=2; contract="pr86-pipeline-v2"; identity; directory;
phase: closed enum below;
oldPublisher:{sha,branch}; newPublisher:{sha,branch};
invariants: existing reader/ledger snapshot;
c2Targets: exactly the existing14 backup records;
pipeline:{oldSelectionHash,newSelectionHash,oldGeneration,newGeneration,
          oldSealHash,newSealHash,targetParentIdentity,underlyingTargetIdentity,
          mountBefore,mountPrepared,mountAfter};
resources: fixed stage/capsule/selection/observed-table records with intent/stamp/hash;
child: null or {pid,startTicks,bootId,operation};
```

Types/prefixes/root-owned paths are fixed by schema, not executable strings. Each existing C2 backup record retains backup/oldHash/newHash/oldMode/oldIdentity semantics. Full inventory/stamp tables live in bounded private files; the64KiB journal references their hashes. Unknown phase/property/resource is fail-closed. Resource identity is durable before its mkdir/create/mount.

| Phase | Required durable fact / allowed next action |
| --- | --- |
| intent | Independent artifact + current baseline identities accepted; every planned resource registered |
| capsule_staged | Indexed blobs reconstructed, exact inventory/custody/digests verified; old runtime unchanged |
| backed_up | Old selection/seals/source and14 old target bytes verified and retained |
| prepared | Candidate provenance, fresh current-main, capacity, three locks, idle/child and invariant checks PASS; private ro mount ready |
| switching | Intent fsynced before first visible source/mount change; service entry interlocked |
| old_mount_detached | Only known old mount removed; underlying target identity verified |
| publisher | Git child finished/clean, exact new HEAD; no still-live child |
| new_mount_attached | Fixed target maps to new sealed root with required flags; no namespace ambiguity |
| file_0..file_13 | Each authority/closure replacement recorded with old/new CAS |
| selection_written | Atomic root selection replacement and fsync; no external entry yet |
| tuple_verified | Source+tree+mount+selection+all14 hashes agree; reader/ledger invariant intact |
| committed | Receipt + last pointer durably written; remove interlock only after complete readback |
| rollback_intent / rollback_* / rolled_back | Restore old tuple under the same barriers; verify every domain before clearing interlock |

Known pre-switch failures may be marked aborted only after a full proof that the old tuple remained unchanged and no child/mount/resource state is ambiguous. Otherwise retain interlock/resources for explicit recovery. No automatic second promotion or package install. Ordinary ingestion semantics remain unchanged outside this explicit release interlock.

Recovery rules:

- Acquire the same three locks, validate canonical journal, root custody, all referenced bytes and inode states; classify source as known old/new, each target as known old/new, and mounts as absent/known-old/known-new/private-prepared. Anything else is UNKNOWN => no writes/deletions.
- No rollback while a Git/mount/copy child may still run. PID/startTicks/bootId/cgroup state must prove cleanup; cancellation/timeout is not proof. New boot does not authorize guessing the tuple from HEAD.
- Explicit recovery restores old source **and** old capsule selection/mount **and**14 C2 targets. It never reruns pnpm or fetches packages. It retains new bytes/receipt and old capture for review.
- Later `rollback-last` snapshots current reader/ledger invariants; it preserves all legitimate natural ledger entries rather than replaying the original release-time ledger. Source rollback is independent of production API image rollback.
- Mount operations returning unknown/EBUSY or mismatched readback are not retried/forced. Root reconciliation determines exact state first.

### Historical v1 receipts

Inventory reader dispatches by exact version. Existing v1 receipts/rollback receipts retain their14-target schemas, directory modes, hashes, ownership and bytes unchanged. A new enrollment receipt binds the actual old dependency baseline to last v1 release. After v2 enrollment, ordinary `rollback-last` of a v1 historical receipt **cannot** ignore dependency state: it returns `DEPENDENCY_HISTORY_UNBOUND` unless a separately reviewed migration record binds its graph. The new release can roll back to its enrolled OLD baseline using its own v2 receipt. Old one-shot helpers and initial approval are not replayed.

## 7. Exact protected contracts exception

Only for this transition, require all conditions simultaneously:

1. Old source is the independently verified old publisher, or later unchanged graph mode expressly allowed by the contract. Initial package/lock/tree identities match §2.
2. Protected diff across `backend/prisma`, `contracts`, `deploy/compose.production.yml` is either empty or **exactly** `contracts/pnpm-lock.yaml`.
3. For that file, type/mode is100644 both sides; blobs are **`4a631ef27450ce85b818e4fe02705b9bcd224c13` → `504f5a4544438da6ea2e994b73932eae4eec5497`**. No rename/symlink/delete/filemode exception.
4. All other contract/Prisma/compose paths, including package scripts and OpenAPI, are byte-identical. Exact lock pair proves only reviewed fast-uri3.1.8→3.1.9 tooling delta; no prefix exclusion or future version acceptance.

Unknown old/new lock, extra protected path, boolean IDs, forged labels or an artifact without the dependency payload are rejected before source/mount switch. No API/DB contract change is authorized.

## 8. Root executor/policy upgrade path

Historical helper/installer remain immutable and unusable for this new upgrade. Their source/hash/publisher/release pins in the remediation report are not configuration options. Do not edit their constants or remove consumed journals.

### Strict policy v2 shape

The new executor accepts exact policy keys `version,enabled,repository,buildWorkflow,producerFiles,runtimeFiles,initialBridge,pipelineContract`, version2, enabled=true, same repository/workflow and existing initialBridge literal. `producerFiles` remains exactly the three fixed producer paths; no wildcard. `runtimeFiles` is the existing six paths plus exactly `ROOT/bin/pnpm` and `/etc/systemd/system/aktau-sync-dependencies.service`, all independently reviewed full SHA256 pins. Existing daily/weekly paths receive new bytes/pins; custodian drop-in pin stays unchanged. Unknown root/runtime path is rejected.

`pipelineContract` exact keys are `id,oldSourceSha,oldTreeSha1,newTreeSha1,oldPackageBlobSha1,newPackageBlobSha1,oldLockBlobSha1,newLockBlobSha1,contractsOldLockBlobSha1,contractsNewLockBlobSha1,nodeSha256,pnpmTarSha256,baselineInputInventorySha256,baselineRuntimeInventorySha256`. All constants equal §§2/7; the two baseline hashes equal the independently approved inventory. Bounds are compiled fixed constants, not operator tunables. Policy does not include its own approval/receipt digest (which would create a circular hash dependency); the independent baseline approval record binds the complete new policy hash, and the committed bootstrap receipt binds both records plus generated inode identities.

The historical initialBridge value is retained for v1 history validation only; v2 enrollment cannot mint/replay initial-reviewed approval. Status response should explicitly report artifact/selection protocol support and whether dependency tuple is aligned, without changing a boolean into convergence PASS. New failure classes are closed enums without file contents or secrets.

After independently reviewed Part B source/CI, prepare a **new fixed-purpose one-time root provisioning packet**, bound to those immutable source bytes and exact installed baseline. It must be independently reviewed/admin-authenticated and must cover:

- old executor d69c667… and actual old policy2bf672f… (or STOP on drift);
- exact new executor, builder, workflow, runtime-gate, shim, mount-unit/drop-in hashes;
- the complete finite pin delta, new strict pipeline contract and independently approved OLD baseline inventory;
- no-clobber root-private backups, original inode/hash CAS, durable bootstrap journal, baseline capture/enrollment and full rollback of root files/unit configuration/selection/mount; no publisher/sourceSha or C2 authority rewrite during bootstrap;
- daemon-reload/readback only under separate production authorization, with sync idle; existing services/timers not restarted or rescheduled. Install the mount dependency with the OLD capsule still selected; normal publisher remainsb2012c5 until later promotion.

The packet cannot be finalized with invented new hashes before the approved source exists. If source freeze requires a later small source-only bootstrap PR, do that separate reviewed freeze rather than a generic updater or self-authorization. Existing restricted SSH caller still has only the zero-argument promote entry; no new general sudo/SSH command. Root-only mount/recovery modes are unavailable to that caller.

First v2 production release order: fresh root/OLD inventory → independent baseline approval → reviewed fixed bootstrap/enrollment → verify old runtime mount/unchanged source → new exact-main CI9/manual-artifact → original ZIP/provenance/graph checks → one official promotion → independent tuple/receipt/rollback/API/timer readback. AUTO DEPLOY remains false. No artificial sync/HMAC/C2 attempt is part of admission.

## 9. Production read-only inventory checklist — NOT EXECUTED

Future separately authorized collector: one bounded SSH session, ≤12 logical read-only operations,120s total, ≤110s remote work, output ≤2MiB public metadata/inventory hashes, no retries/fallback. Do not invoke unverified pnpm/Corepack/version shims (they can acquire packages). Metadata outside these fixed paths is not searched.

1. UTC,bootId,kernel/arch/glibc metadata, real aktau-sync UID/GID; no account mutation.
2. Publisher HEAD/branch/clean status and source/package/lock/tree blobs through fixed `runuser … git --no-optional-locks --no-replace-objects -c core.hooksPath=/dev/null -c core.fsmonitor=false -C /opt/aktau-sync …` argv; no fetch/checkout.
3. Root executor/policy/runtime/shim/systemd pins, known authority/source manifest; private credential files excluded.
4. Existing services/timers ActiveState/Result/User/WorkingDirectory/mount-namespace settings/NextElapse metadata; no start/stop/reload.
5. Three existing lock custody/availability and operator PID/cgroup absence; advisory probe FDs closed, no new lock file.
6. Fixed parent device/inode/UID/GID/mode/ACL/xattr names for publisher/pipeline/node_modules, root runtime/capsule/control namespaces; reject unknown mounts/symlinks.
7. Existing node_modules full bounded inventory/hash/stamp projection; no raw source/body output. Real secret filenames/private modes/unexpected config cause STOP (tracked public .env.example is allowed) before content read, not a recursive scan of home/.env/store outside scope.
8. Static identity of the actual Node/pnpm distribution and approved global shim, native ELF/platform/libc metadata; no package execution/install or environment dump.
9. Current release/last/interlock/retained receipts/backups and root helper consumed journals, bounded hashes only; no recovery or deletion.
10. Reader metadata only; validate ledger chronology/hash/counts using reviewed codec without exporting payload or changing history.
11. `/proc/self/mountinfo`, actor unit namespace identities plus the separately isolated custodian, filesystem/cgroup capacity/capability availability for the proposed fixed mount; no mount/capability change.
12. Recheck HEAD/control identities/inventory stamps; emit only VERIFIED/BLOCKED/NOT_VERIFIED evidence and stop if changed/deadline exceeded.

This supplies admission data; it does not authorize provisioning. Missing old graph provenance, .env/config in the mount target, wrong pnpm/Node/libc, extra protected changes, missing mount capability, namespace drift or insufficient budget blocks deployment. No secret, DSN, backup contents, DB connection, HTTP or production package code is required by this checklist.

## 10. Qualification matrix: analytical outcomes versus executed tests

| Fault/state | Required outcome in Part B | Current status |
| --- | --- | --- |
| Bad repo/workflow/SHA/CI/ZIP/capsule/inventory/SRI | Reject before switch, no new authority | Design specified; new-path tests NOT_RUN |
| Alternate package/lock/tree, extra contracts delta | Exact-pair rejection | Existing gates previously reproduced; new exception tests NOT_RUN |
| Traversal/absolute/cyclic links, PAX/hardlinks, ACL/xattr, mode/capability tamper | Reject graph, no foreign writes | Inventory packing checks executed on valid fixtures only; adversarial installer tests NOT_RUN |
| pre/postinstall/pnpmfile/config or loader injection | No installer/root package execution/network; fail closed | Fixture dependency preparation used ignore-scripts/ignore-pnpmfile; new admission tests NOT_RUN |
| Crash/SIGKILL after intent/mkdir/stage/detach/Git/mount/file_i/selection/receipt | Durable interlock, known-state recovery or BLOCKED; retain generations | New transaction NOT_RUN |
| ENOSPC/short write/fsync error | No committed mixed tuple; old data retained | NOT_RUN |
| Timeout/cancellation / live Git/native child / cleanup failure | No racing rollback or second apply | New cleanup tests NOT_RUN; native child/EBUSY hazard observed locally |
| Foreign mount/parent/inode/selection or namespace | BLOCKED, no forced unmount/delete | Read-only mount and actor write/rename controls executed; race/CAS tests NOT_RUN |
| Successful new graph then rollback | Source+dependency+14 targets together; old versions/data paths verified | Dependency runtime old→new→old executed; source/14-target journal NOT_RUN |
| v1 history + v2 baseline + later natural ledger entries | Read-only v1 inventory; v2 rollback preserves latest ledger | NOT_RUN |
| Reboot/interrupted bootstrap/unknown receipt | Only committed mount restoration; unknown transaction blocks | systemd/reboot/bootstrap NOT_RUN |

None of these pending rows is counted PASS. Design readiness is not implementation/production acceptance.

## 11. Executed disposable Linux evidence

Evidence outside Git: `/home/denis/tmp/aktau-c2-dependency-design-evidence-20261102`. No repository runtime files changed. Existing local Docker base `aktau-c2-bundle-root:test`, image ID `sha256:8822e58d636d91340b694889e94e57de9adcbc8c6d3325f1d32271970cdc34b0`, Linuxamd64 on kernel `6.18.54.1-microsoft-standard-WSL2`, private random owned containers, network=none, read-only container root, bounded tmpfs/memory/CPU/PIDs, read-only fixture input. Mount capability exists only inside each disposable container; no host/VPS mount, package/service/user mutation. Named containers removed independently; no Docker prune or shared-resource removal.

Preparation used old/new package+lock/tree snapshots read with git archive, no checkout or Git source switch. Old dependency install was non-root/local with frozen lockfile, ignore-scripts and ignore-pnpmfile. Official pnpm tar SRI and **1077 package-file bytes** independently matched; only non-package Corepack cache metadata was excluded. No registry access inside the runtime fixture.

The real runtime probe, executed as UID1999 through pinned `pnpm exec tsx`, checks Zod, ESM imports, esbuild transform and real Rollup `.node` addon, Cheerio/undici loading,25 captured Dina/Dana/FixPrice products through actual SourceProductSchema, and repository/data path preservation. It does not execute production CLI scrape/sync or use DB credentials. Synthetic TS probe is fixture-only, not an extra approved capsule source member. Final Part B must run an external probe against a reconstructed exact-file-set capsule.

| Phase | Node / pnpm / tsx | Zod / undici | esbuild / native addon | Store fixtures / paths / write controls |
| --- | --- | --- | --- | --- |
| baseline | v24.18.0 / 10.32.1 / 4.23.15 | 3.25.76 / 7.30.0 | 0.28.2 / 1 real `.node` | 25 PASS / preserved / denied |
| candidate | v24.18.0 / 10.32.1 / 4.23.15 | 4.6.7 / 7.30.1 | 0.28.2 / 1 real `.node` | 25 PASS / preserved / denied |
| rollback | v24.18.0 / 10.32.1 / 4.23.15 | 3.25.76 / 7.30.0 | 0.28.2 / 1 real `.node` | 25 PASS / preserved / denied |

Actor writes to mounted pipeline and mountpoint rename were denied; mountinfo ro flag verified. OLD→NEW and NEW→OLD changes were real Linux mount operations, **not** a simulation of journal/authority recovery. Final rollback mount stays attached as production runtime would; destruction of the owned container removes its namespace. No claim of source+14 C2 target transaction qualification.

Failures retained rather than hidden:

- Initial sandbox had an executable-path permission failure; explicit executable tmpfs/directory setup fixed the fixture, no production permission change.
- USTAR link export failed at103-byte link target; indexed regular-blob format was subsequently constructed and every blob hash rechecked.
- An extra cleanup unmount after the final OLD runtime probe returned EBUSY even after visible actor cleanup. Its full kernel cause is **NOT_PROVEN**. Removing that redundant final unmount models the required final state (OLD remains mounted), not a force/retry workaround. Earlier old→new→old runtime pass also completed; the EBUSY attempt remains evidence. Intermediate detach must still treat EBUSY as STOP in production. The container PID1 fixture reaps its own adopted children; that is not a production kill/reaper utility.
- A toolchain directory initially placed at pipeline root would become untracked under the publisher clean check. The final design places it under existing ignored node_modules; no Git ignore change.

Actual local commands/results:

- `python3 prepare-fixture.py`: exit0, public local preparation only; no repository source switch.
- Official pnpm SRI +1077 file-byte comparison: exit0; proof in pnpm-distribution-proof.json.
- `python3 measure-capsules.py`: exit0; every indexed regular blob hash re-read and matched; fixed caps satisfied.
- `python3 run-fixture.py`: final exit0, three real old/new/old runtime phases; network=none, UID1999. Initial failed setup/cleanup attempts above remain in separate logs.
- `python3 -m py_compile` on external fixture scripts, local Markdown links/privacy/scope, historical report hash preservation and `git diff --check`: verified during final integrity check; no production result inferred.

Container/runtime result, hashes, commands, logs and cleanup proofs are retained locally. Python fixture syntax, Markdown links, exact docs-only scope, root-source preservation and `git diff --check` are checked separately. No new full CI/PR is claimed for a design document. Prior baseline CI9/regression evidence remains in the remediation report and is not rerun/relabelled as a new transaction PASS.

## 12. Minimal Part B file scope and review exit

Reuse existing root transaction/build/entry components. Required source areas:

1. `ops/c2/publisher-promotion.py`, `ops/c2/test_publisher_promotion.py`: strict v2 graph/selection/receipt/recovery/mount domain, exact transition/contract exception, v1 reader compatibility.
2. `scripts/ops/build-sync-promotion.py`, `.github/workflows/sync-publisher-build.yml`: fixed off-host graph preparation, indexed payload, source/SRI/native qualification, authenticated digest; updated independent producer pins later.
3. `ops/c2/promotion-runtime-gate.py`, `ops/c2/test_promotion_runtime_gate.py`: committed tuple/mount verification after shared lock, fixed PATH, existing PID/notify semantics.
4. New fixed `ops/c2/pipeline-pnpm` and `ops/c2/aktau-sync-dependencies.service`; existing `ops/c2/promotion-daily.conf` and `promotion-weekly.conf` receive only the mount dependency and reviewed actor runtime wrapper integration. `promotion-custodian.conf` and the custodian namespace hardening stay unchanged. No timer schedule/User/env change.
5. New disposable `ops/c2/pipeline_runtime_integration.py`, invoked from existing `scripts/ci/run-root-bundle-integration.mjs` in a separate bounded mount-capable container. Existing FD/helper tests remain unchanged and keep their lower capability profile.
6. `ops/c2/README.md`, existing `docs/production/BACKEND2_SYNC_C2_AUTOMATED_PROMOTION_HANDOFF.md`, and this contract/report qualification section. `scripts/ops/sync-promotion.mjs`/test only if strict v2 reply/transport parsing actually needs a delta; request/protocol privilege stays fixed.

The new exact-purpose production bootstrap must be frozen/reviewed after implementation hashes exist. It is not implemented by repurposing historical helpers. Go/Voice/Frontend/parser/DB/public DTO/source schema/C2 convergence algorithm are outside Part B.

Part B exit requires fail-first tests, every pending fault row executed, real Linux graph reconstruction/FD mount/CAS/child cleanup/systemd staging qualification, Go/Voice/pipeline/C2/ops/security regressions and exact PR-head CI9. Then independent review; **no automatic merge/provisioning/promotion**. New artifact/provenance and baseline installation remain separate production gates.

**Design choices are explicit; actual production inventory/approval/new build hashes are still required admission evidence, not fabricated values. DESIGN_CONTRACT_READY_FOR_REVIEW. STOP.**


## 13. Review-approved filesystem-only correction — 2026-11-02

Owner передал решение independent review APPROVED WITH CONDITIONS: **stage→generation rename design superseded**. Generation создаётся сразу под фиксированным `BASE/capsules/<inventorySHA256>`, остаётся unselected и не становится runtime selection только из-за существования каталога/seal. `.pipeline-stage-<release-id>` больше не должен создаваться новым store; исторические остатки не дают права удаления/recovery. Переиспользование existing generation в этой ограниченной реализации запрещено, даже если она выглядит sealed. Дальнейший reuse требует отдельного admission review.

Threat model: доверенный root/admin и root-installed code; обычные недоверенные процессы, доступные им writable paths, повреждённые состояния и crashes входят в модель. Root compromise/произвольный privileged writer, игнорирующий custody/locks, вне модели. Нельзя заявлять абсолютный CAS против root. Fixed parent descriptors должны быть pinned/no-follow, каждый ancestor проверяется на owner/group/mode/ACL/xattr и неизменность pathname→inode, конечные BASE/capsules/state — private0700. Parent descriptors не подменяют проверку абсолютной parent chain.

Перед первым mkdir должен быть создан no-clobber/fsync resource intent с полным списком generation, pipeline, entries, inventory/seal. Неполный intent или generation не удаляются/не перезаписываются/не продолжаются автоматически. Предлагаемый store-local `state/pipeline-<release-id>.intent.json` — bounded2MiB resource table, **не journal-v2 release transaction и не approval**; источник данных — уже bounded inventory. Callback journal сам по себе не является механизмом durability. Existing ingress/runtime/controller locks и durable release interlock остаются обязательными будущими release prerequisites и здесь не реализуются заново. Store-local advisory directory lock сериализует только cooperating store writers.

Внутренние операции должны оставаться dirfd-relative/no-follow/O_EXCL; links только validated relative и создаются последними, не используются для открытия файлов/директорий. До seal необходимы полный inventory/hash/identity/custody/name-set pass и fsync; seal должен связывать root/generation identities, graph identity digest и durable intent digest. После seal — повторная проверка graph/metadata, без selection, cleanup или rollback. Generation при любом unknown/partial состоянии остаётся unselected и блокирует install.

**Реализация этого дополнения не квалифицирована: BLOCKED_GENERATION_STORE.** Fail-first12tests:8FAIL; первый после-изменений focused run:11PASS/1ERROR. Error — non-root fault fixture пытается rename дочерней directory под0555 родителем и получает PermissionError до вызова защитной проверки. По прямому STOP условию Owner дальнейшие правки/матрица остановлены. Нельзя считать этот error successful rejection store или root sandbox qualification. Остальные Part B разделы не реализовывались и их qualification не повышается до PASS.


## 14. Qualification-only follow-up — 2026-11-02

Filesystem source/approved direct-generation semantics не менялись. Non-root permission denial и controlled privileged-corruption model теперь проверяются раздельно. Последний использует только disposable fixture ownership: pipeline0555→0700 для подтверждённой symlink substitution, затем finally0555 с inode/owner/group/mode/no-xattr readback перед Store. Требуется proof фактической инъекции; PermissionError injector не считается security PASS. Actual privileged-root/multi-UID qualification не заявляется.

Targeted generation matrix20/20PASS,0SKIP. Покрыты direct unselected creation, strict no-reuse/foreign preservation, parent/generation replacement, symlink denial/injection, graph/seal tamper, SIGKILL, ENOSPC/partial/zero/short writes и5fsync-EIO точек с сохранением ресурсов и отсутствием selection. ENOSPC/EIO — конкретные syscall fault injections, не physical disk/power-loss proof. Store readiness не равна transaction readiness, approval, runtime selection или C2 acceptance.

Следующий mandatory publisher suite64tests:63PASS/1ERROR. Frozen historical CAS harness не передал binding m исходному тесту; NameError не является security PASS. По STOP условию Owner дальнейшая qualification остановлена; historical root-helper/Node24 ops не запускались. Полный protocol по-прежнему BLOCKED_GENERATION_STORE. Подробные команды/evidence — раздел9 того же Part B report; все прежние design sections сохранены append-only.


## 15. Historical harness isolation qualification — 2026-11-02

Source/Generation Store не менялись. Historical assertion теперь связывается с отдельным полным frozen OLD module, а не current publisher. Полный reconstructed historical source pinned SHA256ef30e25b620633895d8778654b860942afb02e65e3a54fa1e1865efacaffc026 проверяется до exec; исходные Store/assertion digests и fixture bytes сохранены. Отрицательные current-module binding и self-consistently corrupted fixture controls отвергаются; положительный historical control воспроизводит точный прежний CAS AssertionError. Никаких skip/xfail.

Generation20/20 и Publisher64/64PASS,0SKIP. Следующий mandatory root-helper suite30PASS/1ERROR: historical SourceTests API mock по-прежнему отдаёт mutable current source вместо pinned59455-byte reviewed source. Неизменный helper корректно вернул reviewed_source_metadata. Это отдельный test-only blocker; production pins не ослаблялись. По Owner STOP дальнейшие правки/Node24 ops не выполнялись. Qualification в целом остаётся BLOCKED_GENERATION_STORE; полный Part B не продолжен. Команды и digests — раздел10 того же Part B report.


## 16. Generation Store qualification exit — 2026-11-02

**GENERATION_STORE_SAFETY_READY_FOR_REVIEW**, только в пределах filesystem store/test qualification. Historical SourceTests factory больше не выдаёт mutable checkout за reviewed SOURCE: executor59455bytes/d69c667…, workflow3929bytes/1d776479… и builder5211bytes/308504c… читаются из fixed historical fixtures с independent pre-metadata length/SHA256 verification. Workflow/builder bytes закреплены из Git object8cff133be30a8c31f4d5e06d297dcf9af5e97847. Положительный результат сравнивается с frozen executor; повреждение любой fixture и неверный current-source binding отклоняются. Production helper/publisher/Generation Store/approved pins не менялись.

Fail-first: исходный reviewed_source_metadata ERROR воспроизведён. После test-only correction: historical root-helper33/33, Generation20/20, Publisher64/64PASS; полный Nodev24.10.0 ops profile exit0 —220Python +185Node tests PASS,0SKIP. git diff --check exit0; прежние report prefixes и frozen source/assertion сохранены. Команды/hashes/evidence — раздел11 того же Part B report.

Эта запись supersedes только прежний qualification blocker historical SourceTests. Она **не** объявляет готовыми artifact/builder, runtime selection, mount/systemd/boot, journal-v2 coupled recovery/rollback, baseline approval, production verifier или общий Part B. No compromised-root/physical power-loss claim; ранее описанные test-only fault bounds сохранены. Нет Git publication/production operations. STOP для независимого review.


## 17. Part B2 source-only artifact/admission checkpoint — 2026-11-03

**BLOCKED_ARTIFACT_V2.** Owner разрешил только offline Artifact v2+Source Admission без runtime switching. Generation Store остаётся побайтово прежним; historical CAS теперь использует отдельный full OLD-source fixture с тем же pinned SHA256ef30e25b620633895d8778654b860942afb02e65e3a54fa1e1865efacaffc026, без current-source reconstruction dependency.

Добавлены local v2 parser/descriptor/source-object inspection и non-root Linuxamd64 builder/workflow candidate в согласованных paths. V1 parser остаётся поддержанным; v2 явно отвергается production admission/legacy Transaction до любых live transitions. Existing root policy/producer pins не обновлялись. Source inspect не означает root authorization и не запускает checkout.

Initial focused parser5/5PASS; real builder integration exit1/BLOCKED_BUILD. Независимо подтверждён дефект guard, отклоняющего валидный Git TAR root member pipeline/isdir; точный первый failed stage текущего invocation неизвестен из-за существующего generic error handler. После mandatory FAIL — STOP без fix/retry/дальнейших suites. Последний8-test inventory и полные regressions/source admission/real package graph integration NOT_RUN. Actual final TAR/ZIP не создан и не измерен;256MiB caps не повышались. Детали/evidence — раздел12 того же Part B report.

Этот checkpoint не supersede принятую filesystem qualification как историческое evidence, но B2 остаётся непроверенным. Никаких builder/mount/activation qualification PASS по аналитическим предположениям. No runtime selection, journal-v2, authority writes, root upgrade, production или Git publication. STOP для review конкретного blocker.

## 18. One-shot source implementation clarification — 2026-11-03

This appendix supersedes the *local implementation blockers* in §17, not the
independent production authorization gates. Direct unselected generations from
§14 remain active; stage→generation rename is still superseded. Root/admin is
trusted; ordinary actors, accessible-path substitutions, crashes and malformed
state are in the threat model. Compromised root and physical power-loss hardware
behavior are not claimed prevented by these tests.

### 18.1 Namespace, bootstrap and v1 compatibility

The root-owned BASE directory is0755 so the existing actor-readable runtime lock
is reachable. Only root may write it. Capsule/state/generation namespaces remain
root0700. No automatic capsule reuse, GC, overwrite or recovery cleanup exists.
Construction directory FDs are closed only after readonly chmod/fsync, before
opening the independent verification set; graph/generation/ancestor anchors stay
pinned. This avoids doubling the approved740-directory graph's descriptor use.

The boot service uses systemd **>=253**
[`OpenFile=`](https://www.freedesktop.org/software/systemd/man/255/systemd.service.html#OpenFile=)
with the single fixed `/proc/1/ns/mnt:host-mount:read-only` handle. This replaces
direct PID1 namespace inspection *inside the bounded service*, which was denied
in a real systemd sandbox. It does not replace namespace identity with labels.
The service validates LISTEN_PID/count/name, actual read-only nsfs type and
current namespace dev/inode; it pins the FD CLOEXEC, closes fd3 and consumes the
metadata. No public caller path/FD override is added. Restricted SSH still has
only the zero-argument promotion wrapper and cannot invoke the root boot CLI.
Root service bounding capabilities are SYS_ADMIN,DAC_READ_SEARCH,SETUID,SETGID,
KILL; ambient capabilities are only SETUID/SETGID for fixed runuser operations.
Real UID-drop tests clear actor permitted/effective/ambient capabilities.
**SYS_PTRACE is not granted.** Other bounded root processes may use only the
current root0444 manager-derived attestation if proc1 inspection is denied;
wrong boot/namespace, missing evidence or namespace mismatch blocks.

The existing actor scripts, timers, User/EnvironmentFile and custodian isolation
are unchanged. Daily/weekly gain only Requires+After. Actual systemd waiting jobs,
root mount reconstruction and read-only actor entry were tested; this is not a
claim that a physical/kernel reboot occurred.

Completed enrollment record at the existing fixed `pr86-baseline-enrolled-ID.json`
has exact keys:

```text
version=1; approvalSha256; policySha256; outcome="BASELINE_ENROLLED";
generation; targetParentIdentity[6]; underlyingTargetIdentity[6];
legacyReleaseIdentity; legacyReceiptName (receipt.json|rollback.json);
legacyReceiptSha256.
```

The last three fields bind actual immutable v1 history. Historical v1
`state/last.json` remains **identity-only**, exactly as implemented before this
Part; it is not rewritten into a fictional version1 pointer. Only v2 last
pointers use `{version:2,identity}`. Initial baseline boot restoration requires
that exact linked v1 terminal receipt, OLD source/tree/generation, current closure
and independent completed enrollment. It never infers authorization from HEAD.
Old records are read-only. V1 rollback after enrollment is blocked even through
the direct old rollback method, as well as the normal rollback-last dispatcher.

`legacy_input_inventory` is a fixed-path read-only helper for a future reviewed
bootstrap, with independently supplied public OLD reference. It verifies OLD
Git/tree/package/lock, pinned parent ownership/inodes, no-follow traversal,
bounded metadata/content and no active pipeline mount. Unknown/private paths are
not read; no installer or selection is invoked. Output is always
`LEGACY_DEPENDENCY_INPUT_NOT_AUTHORIZED`, including mismatches/aliases and an
observed inventory hash. No automatic trust in current node_modules follows.
Actual production capture/approval inputs remain absent from this source task.

### 18.2 Transaction resource details

Journal2 retains the top-level schema in §6. Its resources exact keys are:

```text
oldSelection,newSelection,staged,restores,selectionRecord,
mountStage,rollbackMountStage,mountStageIdentity,rollbackMountStageIdentity,
bundle,manifest,descriptor,provenance,capsule,payloadFiles.
```

All paths are derived from the fixed release identity/target maps. `payloadFiles`
is exactly the12 existing member names to retained release paths; `capsule` is
`release/pipeline-runtime.tar`. Source.bundle, original manifest, descriptor,
private independently obtained provenance, both selections, full new payload and
all14 original backups remain available after rollback. No generated live DB,
reader secret, ledger payload or environment is copied into the release.

Target records retain backup/oldHash/newHash/oldMode and include old/new inode
identity plus parent identity. Selection has a separate typed record. Mount
records have exact state/namespace/mountId/rootIdentity/generation schemas;
booleans are never numeric identities. Rename publication is confined to known14
targets or the selector with pinned parent/source/destination CAS and readback.
Mount calls likewise use no-follow pinned directory FDs, not an operator-owned
pathname resolved later by root. Ordinary writers cannot modify root parents;
root/admin concurrency must follow the same locks.

Before a restore rename, the new restore inode is durably registered. During
rollback the journal's oldIdentity is rebound to that known restored inode; the
original committed receipt retains the original audit identity unchanged.
Already-restored known old tuples are preserved on restart. A durable identical
rollback receipt is accepted without overwriting it, allowing a crash before
interlock removal to reconcile; differing receipts block. Incomplete/unregistered
restores or filesystem writes remain UNKNOWN, not guessed or deleted.

Root-only torn `.pending` writes in finite control/target parents block a new
promotion/recovery/parity claim, even when the named initial journal was never
published. Existing v1 history and mixed v2 retained inventory are dispatched
without changing original records. A child PID/startTicks/boot identity is
fsynced before exec permission; EOF is not treated as child exit, waits and group
cleanup are bounded, and uncertain cleanup retains the interlock.

Boot resource identity derives from bootId **and selection hash**, allowing a
baseline and later committed tuple in the same boot without overwriting an old
intent. Intent is durable before mkdir, stage inode before mount, prepared mount
record before move. Unexpected retries/unknown existing intent are rejected.

### 18.3 Verifier and external gates

Read-only parity holds the existing shared lock and checks selected exact source,
actual pipeline tree, descriptor/provenance/retained bytes, Node identity,
selected graph seal,12/12 closure, C2 authority, reader/ledger custody and rollback
records. Hidden tracked checkout hashes and unknown files are checked only in a
private child mount namespace, with parent isolation and cleanup proof. Ignored
legacy `node_modules` is never followed or claimed selected. Failure/unsupported
namespace evidence yields BLOCKED/NOT_VERIFIED, never synthesized alignment.
The result does not assert DB contents equal Git or establish any C2 PASS.

Normal v2 admission still independently verifies immutable GitHub ZIP/producer/
main/CI evidence, requires policy2 plus enrollment, and runs source admission.
The private provenance field is constructed by root and rejected in uploaded
manifests. Valid v1 policy/artifact flows remain supported; policy2 cannot use a
v1 artifact as a dependency bypass. Transport recognizes the single v2 commit
result and never retries a timeout/rollback/unknown result.

New executable/policy/unit hashes must be frozen after independent source review.
The historical consumed helpers are unchanged and not applicable to this new
pair. No production bootstrap, root approval, hosted CI or actual VPS inventory
was performed. A new exact-purpose root packet and actual independently approved
OLD inventory are required. Detailed executed commands, failures, test counts,
artifact sizes and remaining kernel-reboot/hosted CI gates are appended to the
same Part B report, not inferred from this contract text.


## 19. Capacity admission correction following independent review — 2026-11-03

This append-only amendment supersedes §18's single-host-memory / single-BASE
headroom assumptions. Artifact formats, trust authority, fourteen targets, C2
limits and journal/recovery semantics are unchanged. This is source-only.

### 19.1 Effective memory headroom

`memory_guard()` validates a positive integer caller budget, reads kernel
MemAvailable and cgroup-v2 membership/mount metadata, and walks the current
cgroup plus every visible ancestor up to `/sys/fs/cgroup`. Effective available
bytes are the minimum of host MemAvailable and each finite
`max(0, memory.max - memory.current)`. Swap is excluded. A further 64 MiB reserve
must remain after the caller's requested budget. Unsupported v1/hybrid,
ambiguous mount roots/controllers, missing child files, invalid numbers and
unavailable metadata fail closed; there is no host-only fallback.

The genuine kernel hierarchy root may omit both memory.max and memory.current.
Only that final root, with both absent, memory controller advertised and the
kernel memory.stat interface present, uses host MemAvailable as its outer bound.
A namespaced non-root kernel cgroup exposing limit files is measured normally.
A missing/partial child interface is never interpreted as unlimited. Production
qualification must verify root sees the controlling hierarchy, not a delegated
view hiding a tighter external ancestor. No cgroup configuration is changed.

Ingress bounds simultaneous input/read copies, TAR decompression/member copies,
capsule parsing/materialization/verification and inventory/interpreter overhead:
`2*ZIP + 4*TAR + 4*96MiB + 128MiB`, followed by the extra 64MiB reserve.
Before reading ingress, TAR is conservatively 256MiB; ZIP extraction checks the
actual declared TAR size again. Initial reviewed TAR uses the same conservative
cap. Existing artifact caps remain unchanged. These are admission/headroom checks,
not kernel memory reservations or a promise against unrelated later pressure.

### 19.2 Per-filesystem incremental disk peak

Before saving release intent or creating any transaction resource, the v2
executor constructs a closed plan from actual retained payload lengths, actual
old/new target lengths and the validated capsule inventory. It pins every fixed
parent with no-follow descriptors, reads fstat/fstatvfs, groups by st_dev, rounds
each file/link/directory conservatively to filesystem blocks, and charges:

- BASE: live/pending interlock metadata;
- BASE/releases: retained twelve payloads, capsule, source bundle, manifests,
  old-target backups, selections, provenance and terminal metadata;
- BASE/capsules: complete materialized graph including directory/link allocation,
  inventory/seal and metadata copies;
- BASE/state and BASE/mounts: generation intent, old/new pointers and mount dirs;
- each of the fourteen actual target parents: new staged payload plus potential
  rollback restore, keeping already allocated current files charged in bavail;
- selection and mount-record parents: replacement/restore/pending high water;
- publisher checkout and `.git`: both bounded old/new checkout trees and Git
  incoming pack/index/temporary pack allocation.

Every device needs an additional 64MiB byte reserve and 256 spare inodes.
Same-device mounts contribute their minimum observed byte/inode availability,
so quotas are not replaced by the most permissive observation. Unknown devices,
invalid statvfs, file mounts or unplanned subordinate writable mounts reject
before writes. BASE's capsules/releases/state/mounts may be separate devices:
each receives its own budget. The selected readonly pipeline mount is the sole
intentional descendant exception; it is not written by this check. No backup,
legacy generation or unknown resource is reclaimed to manufacture free space.

Offline source admission bounds both source trees to 8192 files, 8192 parent
directories, 256MiB logical bytes, 512-byte paths and depth32. The incoming bundle
PACK header bounds object count to 1048576; index/metadata allowance is64MiB.
`fetch.unpackLimit=0` keeps the pack instead of silently expanding loose objects;
GC remains disabled. Root-private temporary source inspection independently
checks its filesystem before writing the bundle/importing the pack. The fixed
source import and checkout budgets do not change authorized source identities.
Later I/O pressure still fails closed with retained journal/interlock; admission
is not fallocate or a guarantee against unrelated disk consumption.

### 19.3 Main parity is a separate acceptance gate

`PRODUCTION_SOURCE_RUNTIME_ALIGNED` continues to mean the installed approved
tuple agrees locally. It does not assert equality to GitHub's current main.
A future separately authorized release acceptance must fetch fresh main identity,
record UTC timestamp/source and compare it with measured deployed source and the
reviewed immutable artifact. Drift or unavailable fresh proof yields
`MAIN_PARITY_NOT_VERIFIED/BLOCKED`, even if local tuple verification passes.
No GitHub network dependency, remote ref substitution or DB/Git byte comparison
is added to the local verifier. No such production comparison ran in this task.

Actual fail-first/PASS-after commands, Linux cgroup/tmpfs results, rebuilt sizes,
full regression exits and external gates are appended to the existing Part B
Report §14. Previous failed review/qualification history remains unchanged.


## 20. 2026-11-04 — неприменённый bootstrap compatibility candidate

Historical §§1–19 preserved. This appendix records a source proposal/qualification boundary, **not production authorization** or a completed bootstrap.

Threat model remains trusted root/admin, excluded compromised root; ordinary writers, filesystem substitutions in writable locations, crashes and unknown states remain in scope. The existing VPS underlying publisher pipeline directory is actor-owned0775. Its inode/mode/UID/GID/parent must remain unchanged. The candidate allows only this underlying DATA target after the existing independently approved, consumed enrollment binds its exact six-field target and parent identities and a verified sealed generation. Capsule/root/private parent custody stays non-writable. No public `approved` flag, arbitrary path, environment override or new enrollment schema is introduced. Unenrolled0775 and other writable modes remain rejected.

Disposable actual Linux root mount tests passed for the above narrow boundary, including OLD detach/reattach; synthetic root records are explicitly test fixtures. This does not authorize the VPS tuple. Actual OLD graph differs from frozen public lock reference (Vite7.3.6 vs7.3.7, generated wrappers/metadata and unknown cache/native paths). Rebuilt reference hashes cannot fill actual approved OLD inventory fields. A complete independently attested actual inventory and explicit byte-diff/provenance are still required.

New fixed-purpose bootstrap candidate has local filesystem/authority/model transaction tests. Full actual bootstrap/root-systemd/crash qualification is **not complete**. Local root manager access failed; user-manager OpenFile feature proof is separate and cannot count as root/boot PASS. No production trust/policy/runtime/selection change occurred. No candidate source publication or production instruction is approved by this appendix. See the same Part B report §19.4–19.5 and final off-tree consolidated report for exact evidence and remaining gates.


### 20.1. Underlying OLD rollback revalidation

The candidate must re-hash/revalidate the exact approved raw OLD input after detaching the baseline mount **before** removing live selection/attestation or restoring legacy root files, and again before a successful rollback terminal record. A hidden underlying inode stamp alone does not establish unchanged contents; actor-held writable descriptors are within the threat model. Missing/mismatched actual raw bytes must preserve interlock and stop. A real local fail-first regression exposed the omission; the candidate was corrected with negative and stable controls. This remains unqualified for production until full root-manager/crash/rollback admission is proved; it does not waive the actual OLD provenance requirement.


### 20.2. 2026-11-04 — candidate: exact enrolled OLD tracked-data inspection

This is an explicit, unapplied compatibility amendment for the measured OLD
filesystem, not a production approval or permission change. Full disposable
bootstrap/OLD→NEW qualification exposed original tracked OLD files with mode
0664 (and executable files may retain0775). A 0775-directory-only exception was
insufficient: initial admission and post-switch private parity rejected these
unchanged files. Original source permissions must not be changed to pass.

The private hidden-checkout reader may inspect such an original tracked file
only inside the fixed publisher pipeline and the two already frozen PR86
pipeline trees. The **actual selected commit's Git blob** remains mandatory.
Additionally, the original file must match the complete nine-field inode/owner/
mode/link/size/time stamp and SHA256 in the root-private OLD input inventory.
That inventory's digest is bound by the unchanged independently approved,
consumed baseline record/policy and verified sealed OLD generation; the exact
0775 underlying target identity is still required. Mode is restricted to0664 or
0775, the owner/group must be the real actor, and regular-file/nlink1/no-follow/
xattr/hash/race checks remain. Unchanged OLD files can remain present while the
exact NEW tree is selected; this does not substitute OLD identity for NEW.
Missing authority, different target, other tree, changed inode, changed bytes,
other writable mode or unavailable input proof fails closed.

This admits **read-only DATA inspection**, never execution from underlying
node_modules, arbitrary writable paths, root/private ancestors or capsule
custody. The existing strict legacy-reference observer is unchanged. Selected
runtime is exclusively the separately sealed readonly graph. Current Git and
actual mounted source authority are still checked independently. The read-only
parity verifier now supplies the validated journal's underlying target identity
to the private verifier instead of omitting that bound. No public path/UID/env/
approval override or new enrollment schema is introduced.

Actual OLD custody capture and full source/fault/test results are recorded
append-only in the same Part B Report. All new executable/policy hashes require
fresh source/CI/bundle qualification and genuine Owner/admin authorization
before production use. Historical helpers/approvals are not reused.
