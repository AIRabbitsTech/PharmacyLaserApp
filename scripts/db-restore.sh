#!/usr/bin/env bash
#
# Restore a custom-format dump (from db-backup.sh) into a target Supabase DB.
#
# WARNING: --clean drops existing objects before recreating them. Point this at
# a FRESH project or a throwaway DB unless you really mean to overwrite.
#
# Usage:
#   export SUPABASE_RESTORE_URL="postgresql://postgres:PASSWORD@db.<target-ref>.supabase.co:5432/postgres?sslmode=require"
#   ./scripts/db-restore.sh path/to/backup.dump
#
set -euo pipefail

# Prefer the newest Homebrew Postgres client to match the server major version.
for v in 18 17 16; do
  if [[ -d "/opt/homebrew/opt/postgresql@${v}/bin" ]]; then
    export PATH="/opt/homebrew/opt/postgresql@${v}/bin:$PATH"
    break
  fi
done

if [[ -z "${SUPABASE_RESTORE_URL:-}" ]]; then
  echo "Error: SUPABASE_RESTORE_URL is not set." >&2
  echo "  export SUPABASE_RESTORE_URL=\"postgresql://postgres:PASSWORD@db.<target-ref>.supabase.co:5432/postgres?sslmode=require\"" >&2
  exit 1
fi

DUMPFILE="${1:-}"
if [[ -z "$DUMPFILE" || ! -f "$DUMPFILE" ]]; then
  echo "Error: pass the dump file to restore, e.g. ./scripts/db-restore.sh backups/production-20260625.dump" >&2
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "Error: pg_restore not found. Install it with: brew install postgresql@16" >&2
  exit 1
fi

echo "Restoring $DUMPFILE into target database ..."
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  -d "$SUPABASE_RESTORE_URL" \
  "$DUMPFILE"

echo "Done."
