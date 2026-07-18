#!/usr/bin/env bash
#
# Back up the Supabase Postgres database to a timestamped custom-format dump.
#
# Usage:
#   export SUPABASE_DB_URL="postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres?sslmode=require"
#   ./scripts/db-backup.sh [output-file]
#
# If your network is IPv4-only the db.<ref>.supabase.co host may not resolve.
# In that case use the Session pooler URL from the Supabase dashboard:
#   postgresql://postgres.<ref>:PASSWORD@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
#
set -euo pipefail

# Prefer the newest Homebrew Postgres client (server is PG17; v16 pg_dump refuses
# to dump a newer server). Falls back to whatever pg_dump is already on PATH.
for v in 18 17 16; do
  if [[ -d "/opt/homebrew/opt/postgresql@${v}/bin" ]]; then
    export PATH="/opt/homebrew/opt/postgresql@${v}/bin:$PATH"
    break
  fi
done

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Error: SUPABASE_DB_URL is not set." >&2
  echo "  export SUPABASE_DB_URL=\"postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres?sslmode=require\"" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "Error: pg_dump not found. Install it with: brew install postgresql@16" >&2
  exit 1
fi

OUTFILE="${1:-backups/production-$(date +%Y%m%d-%H%M%S).dump}"
mkdir -p "$(dirname "$OUTFILE")"

echo "Backing up database to $OUTFILE ..."
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  "$SUPABASE_DB_URL" \
  -f "$OUTFILE"

echo "Done. Wrote $OUTFILE ($(du -h "$OUTFILE" | cut -f1))"
