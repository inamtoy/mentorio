#!/usr/bin/env bash
# Daily backup for one project on this server. Run as root (cron):
#   backup.sh <project>
# Writes /var/backups/<project>/<project>-YYYYmmdd-HHMM.sql.gz (pg_dump of the
# database named <project>) and, if <project> has a media directory, a
# media-*.tar.gz next to it. Keeps KEEP_DAYS (default 7) days.
# Override per project with env vars: DB_NAME, MEDIA_DIR, KEEP_DAYS.
# Dumps run as the postgres superuser, so row-level security can't hide rows.
#
# Restore:  gunzip -c FILE.sql.gz | sudo -u postgres psql -d <db>   (into an empty db
# whose roles exist — see deploy/README.md)
#
# These files sit on the same disk as the database. Copy them off the server too.
set -euo pipefail

name=${1:?usage: backup.sh <project>}
db=${DB_NAME:-$name}
media=${MEDIA_DIR:-/home/deploy/$name/media}
keep=${KEEP_DAYS:-7}
dir=/var/backups/$name
stamp=$(date +%Y%m%d-%H%M)

install -d -m 700 "$dir"
cd /tmp  # sudo -u postgres can't read root's cwd

sudo -u postgres pg_dump --no-password "$db" | gzip -9 > "$dir/$name-$stamp.sql.gz.tmp"
mv "$dir/$name-$stamp.sql.gz.tmp" "$dir/$name-$stamp.sql.gz"
echo "$(date -Is) db    -> $dir/$name-$stamp.sql.gz ($(du -h "$dir/$name-$stamp.sql.gz" | cut -f1))"

if [[ -d $media ]]; then
    tar -czf "$dir/media-$stamp.tar.gz.tmp" -C "$(dirname "$media")" "$(basename "$media")"
    mv "$dir/media-$stamp.tar.gz.tmp" "$dir/media-$stamp.tar.gz"
    echo "$(date -Is) media -> $dir/media-$stamp.tar.gz"
fi

find "$dir" -maxdepth 1 -name '*.gz' -mtime +"$((keep - 1))" -delete
