#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
node "$script_dir/guard.mjs" backup
command -v pg_dump >/dev/null
command -v gpg >/dev/null
stage=temporary_file
temporary="$(mktemp -d "$BACKUP_OUTPUT_DIR/.part11-plain.XXXXXXXX")"
artifact=''
complete=false
cleanup() {
  local code=$?
  # Exact paths created by this invocation; never prune existing backups.
  [[ ! -f "$temporary/application.dump" ]] || unlink "$temporary/application.dump"
  rmdir "$temporary"
  if [[ "$complete" != true ]]; then
    [[ -z "$artifact" || ! -f "$artifact" ]] || unlink "$artifact"
    printf 'backup_failed:%s\n' "$stage" >&2
  fi
  exit "$code"
}
trap cleanup EXIT
stage=dump
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000' \
  node "$script_dir/pg-run.mjs" BACKUP_DATABASE_URL pg_dump --format=custom --schema=public --no-owner --no-acl --file="$temporary/application.dump"
stage=validation
pg_restore --list "$temporary/application.dump" >/dev/null 2>&1
checksum="$(sha256sum "$temporary/application.dump")"
checksum="${checksum%% *}"
filename="app-public-$(date -u +%Y%m%dT%H%M%SZ)-${temporary##*.}.dump.gpg"
candidate="$BACKUP_OUTPUT_DIR/$filename"
test ! -e "$candidate"
test ! -e "$candidate.json"
artifact="$candidate"
stage=encryption
gpg --homedir "$BACKUP_GPG_HOME" --batch --yes --trust-model always \
  --recipient "$BACKUP_GPG_RECIPIENT" --output "$artifact" --encrypt "$temporary/application.dump" 2>/dev/null
test -s "$artifact"
chmod 600 "$artifact"
stage=metadata
export PART11_FILE="$filename" PART11_CHECKSUM="$checksum" PART11_SIZE="$(stat -c %s "$artifact")" PART11_PGDUMP="$(pg_dump --version)"
node --input-type=module -e 'console.log(JSON.stringify({timestamp:new Date().toISOString(),filename:process.env.PART11_FILE,encrypted_bytes:Number(process.env.PART11_SIZE),plaintext_sha256:process.env.PART11_CHECKSUM,pg_dump_version:process.env.PART11_PGDUMP,status:"encrypted"}))' > "$artifact.json"
chmod 600 "$artifact.json"
complete=true
printf 'backup_encryption:PASS\n'
