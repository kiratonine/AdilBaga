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

## VPS — first Go release rollback

Railway retired. First release has no prior production Go image. Safe reviewed
target is Part14B zero-application state; no database rollback is required because
Part15 performs no migration/data/ingestion change. This rollback was executed
after the first Part15 artifact/readiness failure and again after full-context
Gemini invalid_output3/3 despite corrected identity/readiness PASS. At those
historical checkpoints Tunnel was stopped and application container/network
removed, image/private config retained. Current source release
`e6ef854e2973e5b0871888bbc3111e026cdccc5b` is active behind Tunnel. Zero-application
rollback remains the first-release emergency target. A correctly handled Gemini
failure alone is not a rollback trigger; application/security/network failures are.

```bash
ssh my-vps 'sudo systemctl stop cloudflared'
ssh my-vps 'sudo docker compose --env-file /etc/adilbaga/release.env -f /opt/adilbaga/compose.production.yml down'
ssh my-vps 'sudo ss -lntup'
```

Require no8080 listener and no public80/443/8080. Never expose origin as emergency
fallback, switch to owner credentials, mutate schema/history or rewind snapshots.
Recovery needs artifact identity and local health/Voice proof before Tunnel start.
Future successful releases preserve current/previous SHA images and private
release metadata; prior-image rollback requires schema compatibility review.
