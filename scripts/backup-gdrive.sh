#!/bin/bash
# Vigmis — Automated Backup to Google Drive
# Runs nightly via cron. Keeps last 30 days.
# Requires: rclone configured with Google Drive (run setup once)

set -e

DATE=$(date +"%Y-%m-%d_%H-%M")
BACKUP_DIR="/tmp/vigmis-backups"
FILENAME="vigmis-db-${DATE}.sql.gz"
GDRIVE_FOLDER="vigmis-backups"
RETENTION_DAYS=30

echo "=== Vigmis Backup: ${DATE} ==="

# 1. Create local temp folder
mkdir -p "$BACKUP_DIR"

# 2. Dump PostgreSQL database
echo "→ Dumping database..."
pg_dump "$DATABASE_URL" | gzip > "${BACKUP_DIR}/${FILENAME}"
echo "  Done: ${FILENAME} ($(du -sh "${BACKUP_DIR}/${FILENAME}" | cut -f1))"

# 3. Upload to Google Drive
echo "→ Uploading to Google Drive..."
rclone copy "${BACKUP_DIR}/${FILENAME}" "gdrive:${GDRIVE_FOLDER}/"
echo "  Uploaded to Google Drive/${GDRIVE_FOLDER}/${FILENAME}"

# 4. Delete backups older than 30 days from Google Drive
echo "→ Cleaning old backups (older than ${RETENTION_DAYS} days)..."
rclone delete "gdrive:${GDRIVE_FOLDER}/" \
  --min-age "${RETENTION_DAYS}d" \
  --include "vigmis-db-*.sql.gz"

# 5. Clean local temp file
rm -f "${BACKUP_DIR}/${FILENAME}"

echo "=== Backup complete ==="

# 6. Print what's currently in Google Drive
echo "→ Current backups in Google Drive:"
rclone ls "gdrive:${GDRIVE_FOLDER}/" | sort
