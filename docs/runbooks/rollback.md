# Recovery / rollback boundaries

## LOCAL NOW

Identify which class failed before changing state:

1. **Application:** select a reviewed immutable prior binary/image; validate
   locally against current schema/contracts, then externally review rollout.
2. **Migration:** do not blindly reverse applied migrations or alter Prisma
   history. Fresh encrypted backup and disposable PG17 recovery proof first;
   separately reviewed schema reconciliation is required.
3. **Snapshot:** keep previous published snapshot readable; inspect failed staged
   history/atomicity read-only. No destructive DB rewind or history deletion to
   hide a failure. Publishing/recovery is separately authorized.
4. **Credential:** preserve restricted role semantics; verify replacement before
   revoke when supported. Never restore an owner credential to API runtime.

For suspected DB loss: [backup/restore tooling](../../ops/postgres/README.md),
choose an explicit recovery point, compare all counts/fingerprints/schema/history/
security and local restricted Go smoke. Restore only an owned loopback target
until owner separately approves production recovery. Take a fresh backup before
any destructive recovery; preserve existing backups and audit evidence.

## FUTURE VPS

Actual revision switch/restart/traffic rollback commands depend on the future
deployment topology and are not configured. This runbook authorizes no production
mutation, schema rollback, deploy or cutover. Railway remains retired.
