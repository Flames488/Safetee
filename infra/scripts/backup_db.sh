#!/usr/bin/env bash
# Dumps the production database to a timestamped file. Intended to run from
# cron daily. Point DATABASE_URL at the same managed Postgres the API uses.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/root/safetee-backups}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set — export it or source backend/.env first" >&2
  exit 1
fi

# strip the +asyncpg driver suffix pg_dump doesn't understand
PLAIN_URL=$(echo "$DATABASE_URL" | sed 's/+asyncpg//')

pg_dump "$PLAIN_URL" --format=custom --file="$BACKUP_DIR/safetee-$TIMESTAMP.dump"

# keep the last 14 days locally; off-site retention should be handled by
# whatever object storage this gets synced to (not wired up here yet)
find "$BACKUP_DIR" -name "safetee-*.dump" -mtime +14 -delete

echo "Backup written to $BACKUP_DIR/safetee-$TIMESTAMP.dump"
