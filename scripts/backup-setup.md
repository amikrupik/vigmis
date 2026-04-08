# Backup Setup — Google Drive

Run these steps once. After that, backups run automatically every night.

---

## Step 1 — Install rclone

```bash
# Linux / Railway server
curl https://rclone.org/install.sh | sudo bash
```

---

## Step 2 — Connect Google Drive (once, in browser)

```bash
rclone config
```

Answer the prompts:
```
n  (new remote)
name> gdrive
Storage> drive          (type "drive" for Google Drive)
client_id>              (leave empty, press Enter)
client_secret>          (leave empty, press Enter)
scope> 1                (full access)
root_folder_id>         (leave empty, press Enter)
service_account_file>   (leave empty, press Enter)
Edit advanced config? n
Use auto config? y      ← opens browser, log in to your Google account
Configure as shared drive? n
y  (confirm)
q  (quit)
```

Done. rclone is now connected to your Google Drive.

---

## Step 3 — Test it

```bash
# Should show your Google Drive root
rclone ls gdrive:

# Create the backup folder
rclone mkdir gdrive:vigmis-backups

# Run a manual backup
bash scripts/backup-gdrive.sh
```

---

## Step 4 — Schedule nightly (cron)

```bash
crontab -e
```

Add this line (runs every night at 2:00 AM):
```
0 2 * * * DATABASE_URL=your_db_url bash /app/scripts/backup-gdrive.sh >> /var/log/vigmis-backup.log 2>&1
```

---

## What gets backed up

| Item | Method | Location |
|------|--------|----------|
| PostgreSQL database | pg_dump → gzip | Google Drive/vigmis-backups/ |
| Retention | 30 days | Auto-deleted after |

## To restore

```bash
# Download from Google Drive
rclone copy "gdrive:vigmis-backups/vigmis-db-2026-04-02_02-00.sql.gz" /tmp/

# Restore
gunzip -c /tmp/vigmis-db-2026-04-02_02-00.sql.gz | psql "$DATABASE_URL"
```
