# Private application PostgreSQL backups — local foundation

No scheduler, storage provider or production recovery is configured. Commands
are operator-only, not API runtime tooling. Use the explicit current application
database, **not** a separate empty backup database; do not fall back to runtime
DATABASE_URL, DIRECT_URL or SMOKE_DATABASE_URL.

## Backup

Prerequisites: RTK, Node24, PostgreSQL17 client tools matching source major,
GnuPG with an independently configured recipient. Do not automatically install
tools. Shell tracing must be off. Privately source a 0600 operator env file:

```bash
set +x
set -a
source /absolute/private/operator-backup.env
set +a
rtk proxy bash ops/postgres/backup.sh
```

Required configuration:

- BACKUP_DATABASE_URL: direct operator connection to the current application DB.
- BACKUP_OUTPUT_DIR: absolute private 0700 directory outside the repository.
- BACKUP_GPG_HOME: absolute private GnuPG keyring outside the repository.
- BACKUP_GPG_RECIPIENT: full public recipient fingerprint (40–64 hex characters).

The command dumps **all public application tables/schema**, not only API-visible
tables, using custom format, no-owner/no-acl. Supabase-managed schemas are not a
portable application restore. Cluster-global roles/passwords are not in pg_dump.
Never put an operator credential into API configuration.

URLs are parsed into private libpq environment fields: no DSN/password in argv.
Unknown URL options fail. Backup reads have read-only session defaults and bounded
connect/statement timeouts. Guard rejects relative/repo/symlink-to-repo paths and
artifacts/TODO/node_modules paths. umask077; plaintext temp directory0700, files600;
EXIT cleanup removes plaintext and incomplete ciphertext. Metadata600 contains
timestamp, filename, size, tool version and plaintext SHA256 only. GPG uses
public-key encryption, not custom crypto. A filename ending in .gpg is **not**
sufficient proof: recovery must decrypt/check SHA256/validate custom format.

## Restore drill — local only

Prepare a new owned loopback PostgreSQL17 container/database privately. No public
bind, production credentials or production host. Configure RESTORE_DATABASE_URL
to literal 127.0.0.1 or ::1, explicit port, database named `part11_*`, no URI query
parameters; use private local credentials. Set BACKUP_FILE to the encrypted
`.dump.gpg` and BACKUP_GPG_HOME to the outside-repo decryption keyring:

```bash
rtk proxy bash ops/postgres/restore-test.sh
```

The target must be a freshly created disposable database. The script does **not**
drop existing schemas/tables. It decrypts to a private temporary file, verifies
the adjacent manifest's plaintext SHA256, validates custom format and restores
with **--exit-on-error**; zero exit is mandatory. Plaintext is removed on failure
or success. Missing/invalid target or non-loopback target is rejected first.

RLS policy role references require **local-only** NOLOGIN prerequisites
aktau_api_reader and aktau_ingest_writer. Restore no-owner/no-acl intentionally
does not recreate production owners/ACLs/logins/passwords. Verify schema/RLS/
policies/constraints/indexes/history plus all table counts/fingerprints before
local least-privilege setup. Reconstruct only reviewed LOCAL reader grants:
public USAGE, SELECT on categories/canonical_products/offers/stores/
store_locations/snapshots; a local safe LOGIN with sole reader membership,
ADMIN=false/INHERIT=true/SET=false. No private3 SELECT. Do not rerun guarded
production bootstraps against an already activated role.

Then run local Go health/GET smoke using that restricted local credential.
Remove only owned disposable resources and decrypted/plaintext artifacts. Keep
encrypted backup and a recoverable private key outside repo; never archive either.

## Integrity and operations

Compare counts and deterministic ordered row fingerprints for all nine app
tables plus _prisma_migrations. Floating confidence fingerprints use PostgreSQL
float8send bytes plus canonical non-float JSON rather than formatter-dependent
float JSON text; no rounding/normalization that could conceal data loss.
Compare columns/enums/functions/constraints/indexes/RLS/policies, latest published
snapshot, SourceRun history and migration records. On mismatch STOP: never label
partial restore PASS or repair production to match a backup.

Retention policy: **7 daily + 4 weekly + several monthly** encrypted recovery
points; exact monthly count selected during operations review. Record creation
time/checksums; no automatic pruning/deletion now. Prove recovery regularly.
Current private owner-workstation encrypted copy is off the managed DB server,
not final disaster redundancy. Independent off-VPS storage/provider and key
custody/escrow must be reviewed before deployment; no provider chosen here.

**Scheduler NOT CONFIGURED; live alerts NOT CONFIGURED.** Scheduling/pruning,
off-VPS delivery and independent key backup are future operations activation.
See [rollback](../../docs/runbooks/rollback.md) and
[rotation](../../docs/runbooks/secret-rotation.md).

Synthetic guard/cleanup tests (no DB/network writes):

```bash
rtk proxy node --test ops/postgres/backup.test.mjs
```

Those test doubles do not prove encryption/restore; the actual PG17/GPG drill
provides that evidence separately in the Part11 report.
