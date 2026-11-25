#!/bin/bash
# GeoFold nightly backup: the database and the photo store.
#
# Install (as root; replaces /home/deploy/backup.sh, which only dumped the database):
#   install -o root -g root -m 700 vps/scripts/backup.sh /usr/local/sbin/geofold-backup
#   crontab -e   ->   0 3 * * * /usr/local/sbin/geofold-backup
#
# On this server it keeps KEEP_DAYS of database dumps and photo snapshots in
# /home/deploy/backups (root-only). Photo snapshots are hard-linked to the previous
# one, so a photo that has not changed costs no extra space. That covers mistakes
# and a misbehaving app, not losing the server. For that, set BACKUP_REMOTE in
# /etc/geofold-backup.env to an rclone remote — preferably an rclone "crypt"
# remote, so everything is encrypted before it leaves this machine — and each run
# also copies the new dump and the photo store there.
#
# Status: `journalctl -t geofold-backup`, and /home/deploy/backups/LAST_SUCCESS.
#
# Restore:
#   database: gunzip -c db-<ts>.sql.gz | docker exec -i app-db-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
#             (into an empty database)
#   photos:   rsync -a /home/deploy/backups/storage/<ts>/ /home/deploy/app/storage/
#             then: chown -R 1000:1000 /home/deploy/app/storage
set -euo pipefail
umask 077

APP=/home/deploy/app
DEST=/home/deploy/backups
DB_CONTAINER=app-db-1
KEEP_DAYS=7
BACKUP_REMOTE=""        # e.g. "geofold-crypt:" (an rclone remote); empty = keep backups on this server only
REMOTE_KEEP_DAYS=30

CONF=/etc/geofold-backup.env
if [ -f "$CONF" ]; then
  # Sourced as root, so it must be root's alone.
  [ "$(stat -c '%u %a' "$CONF")" = "0 600" ] || { echo "$CONF must be owned by root, mode 600" >&2; exit 1; }
  # shellcheck source=/dev/null
  . "$CONF"
fi

TS=$(date +%Y%m%d_%H%M%S)
SNAP_GLOB='[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]_[0-9][0-9][0-9][0-9][0-9][0-9]'
log()  { logger -t geofold-backup -- "$*"; echo "$*"; }
fail() { logger -p user.err -t geofold-backup -- "FAILED: $*"; echo "FAILED: $*" >&2; exit 1; }
trap 'fail "line $LINENO: $BASH_COMMAND"' ERR

exec 9>/run/lock/geofold-backup.lock
flock -n 9 || fail "a previous backup is still running"

mkdir -p "$DEST/storage"
chmod 700 "$DEST" "$DEST/storage"   # older dumps were left world-readable

# ---- 1. Database -------------------------------------------------------------
DB_FILE="$DEST/db-$TS.sql.gz"
docker exec "$DB_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=plain' \
  | gzip -9 > "$DB_FILE.part"
gzip -t "$DB_FILE.part"
TAIL=$(gunzip -c "$DB_FILE.part" | tail -n 3)
case "$TAIL" in
  *"PostgreSQL database dump complete"*) ;;
  *) rm -f "$DB_FILE.part"; fail "database dump is incomplete" ;;
esac
mv "$DB_FILE.part" "$DB_FILE"

# ---- 2. Photos: a snapshot, hard-linked to the previous one -------------------
PREV=$(find "$DEST/storage" -mindepth 1 -maxdepth 1 -type d -name "$SNAP_GLOB" | sort | tail -n 1)
SNAP="$DEST/storage/$TS"
# The PNG cache is derived from the WebP originals and rebuilt on demand.
rsync -a --delete --exclude '/pictures/_png_cache/' ${PREV:+--link-dest="$PREV"} \
  "$APP/storage/" "$SNAP.part/"
mv "$SNAP.part" "$SNAP"

# ---- 3. Off this server (optional) ---------------------------------------------
if [ -n "$BACKUP_REMOTE" ]; then
  command -v rclone >/dev/null || fail "BACKUP_REMOTE is set but rclone is not installed"
  rclone copy "$DB_FILE" "${BACKUP_REMOTE%/}/db/"
  # Photos removed from the server are moved aside on the remote, not deleted.
  rclone sync "$APP/storage/" "${BACKUP_REMOTE%/}/storage/current/" \
    --exclude '/pictures/_png_cache/**' \
    --backup-dir "${BACKUP_REMOTE%/}/storage/removed/$TS"
  rclone delete "${BACKUP_REMOTE%/}/db/" --min-age "${REMOTE_KEEP_DAYS}d"
fi

# ---- 4. Retention on this server -------------------------------------------------
find "$DEST" -maxdepth 1 -type f -name 'db-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
find "$DEST/storage" -mindepth 1 -maxdepth 1 -type d -name "$SNAP_GLOB" | sort | head -n -"$KEEP_DAYS" \
  | while read -r old; do rm -rf -- "$old"; done
# Leftovers of runs that failed half-way.
find "$DEST/storage" -mindepth 1 -maxdepth 1 -type d -name "$SNAP_GLOB.part" -mtime +1 \
  -exec rm -rf -- {} +

date -Is > "$DEST/LAST_SUCCESS"
log "ok: database $(du -h "$DB_FILE" | cut -f1), photos $(du -sh "$SNAP" | cut -f1)${BACKUP_REMOTE:+, copied to $BACKUP_REMOTE}"
