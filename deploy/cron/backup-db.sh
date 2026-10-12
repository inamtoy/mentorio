#!/bin/sh
# Nightly full dump of the database into the db_backups volume.
# Connects as the BYPASSRLS role: every table has FORCE ROW LEVEL SECURITY,
# so a dump as any other non-superuser role fails outright.
set -eu
dir=/data/db-backups
file="$dir/mentorio-$(date +%Y%m%d-%H%M).dump"
PGPASSWORD="$DB_AUTH_BYPASS_PASSWORD" pg_dump -h "$DB_HOST" -p "${DB_PORT:-5432}" \
  -U "$DB_AUTH_BYPASS_USER" -Fc -f "$file.tmp" "$DB_NAME"
mv "$file.tmp" "$file"
find "$dir" -name 'mentorio-*.dump' -mtime +"${DB_BACKUP_KEEP_DAYS:-14}" -delete
echo "backup written: $file"
