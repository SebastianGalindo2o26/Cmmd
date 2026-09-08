#!/bin/sh
set -eu

BACKUP_DIRECTORY="${BACKUP_DIRECTORY:-/backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIRECTORY"
pg_dump --format=custom --file="$BACKUP_DIRECTORY/pos-$TIMESTAMP.dump" "$DATABASE_URL"

