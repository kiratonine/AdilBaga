#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
node "$script_dir/guard.mjs" restore
command -v pg_restore >/dev/null
command -v gpg >/dev/null
temporary="$(mktemp -d /tmp/adilbaga-part11-restore.XXXXXXXX)"
stage=decrypt
complete=false
cleanup() {
  local code=$?
  [[ ! -f "$temporary/application.dump" ]] || unlink "$temporary/application.dump"
  rmdir "$temporary"
  [[ "$complete" == true ]] || printf 'restore_failed:%s\n' "$stage" >&2
  exit "$code"
}
trap cleanup EXIT
gpg --homedir "$BACKUP_GPG_HOME" --batch --quiet --output "$temporary/application.dump" --decrypt "$BACKUP_FILE" 2>/dev/null
stage=checksum
export PART11_PLAINTEXT="$temporary/application.dump"
node --input-type=module -e 'import{readFileSync}from"node:fs";import{createHash}from"node:crypto";try{const m=JSON.parse(readFileSync(process.env.BACKUP_FILE+".json"));const actual=createHash("sha256").update(readFileSync(process.env.PART11_PLAINTEXT)).digest("hex");if(actual!==m.plaintext_sha256)throw Error()}catch{console.error("checksum_failed");process.exit(1)}'
stage=format
pg_restore --list "$temporary/application.dump" >/dev/null 2>&1
stage=restore
# Explicit loopback disposable target, no production fallback and no ignored errors.
node "$script_dir/pg-run.mjs" RESTORE_DATABASE_URL pg_restore --no-owner --no-acl --exit-on-error "$temporary/application.dump"
complete=true
printf 'restore_checksum_and_exit_zero:PASS\n'
