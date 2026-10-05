# Secret rotation

## LOCAL NOW

Rotate one class at a time only with separate authorization. Never put values
in Git, reports, command argv/history, logs or archives. Use private files0600,
directories0700 and safe stdin/private mechanisms. Verify a new credential before
revoking the old where overlap is supported; after rotation validate logs are
sanitized and remove only known obsolete credentials safely.

- **API DB:** keep aktau_api_runtime restricted reader identity, sole parent/
  safe membership flags, no ownership/admin/private-table grants. Never use owner.
- **Future ingestion DB:** separate writer identity, not API configuration.
  LOGIN creation/production dry-run/apply are explicitly deferred.
- **Gemini:** rotate configured keys in reviewed order; classified smoke and
  shared bounded timeout/fallback; never print key/prompt/provider body.
- **Upstash:** isolated session SET EX600/GET/DEL; TTL and internal hashed key
  semantics unchanged, no memory/DB fallback.
- **Backup encryption recipient/key:** establish recoverable independent key
  custody, prove a new encrypted backup can restore before retiring old recipient.
  Keep ability to decrypt retained recovery points. Never reuse as app secret.
- **Future VPS/SSH:** separate host credential inventory; infrastructure not
  provisioned, no rotation/configuration action now.

On suspected tracked exposure STOP, classify safely, contact owner; do not rewrite
Git history or silently revoke production credentials. Part11 performs no rotation.

## FUTURE VPS

Secret-store/provider overlap mechanics and access/escrow review are deferred to
deployment operations. No SSH/VPS/provider-specific command invented here.
