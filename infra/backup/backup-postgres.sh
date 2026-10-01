#!/bin/sh
set -eu

BACKUP_DIRECTORY="${BACKUP_DIRECTORY:-/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIRECTORY"
pg_dump --format=custom --file="$BACKUP_DIRECTORY/pos-$TIMESTAMP.dump" "$DATABASE_URL"
find "$BACKUP_DIRECTORY" -type f -name 'pos-*.dump' -mtime "+$BACKUP_RETENTION_DAYS" -delete
