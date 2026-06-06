#!/usr/bin/env bash
# =============================================================================
# Vigmis hardened backup → Cloudflare R2 (immutable, encrypted)
#
# Backs up:  PostgreSQL database  +  Supabase Storage (creatives/logos/files)
# Encrypts:  with `age` using a PUBLIC key only — the runner CANNOT decrypt its
#            own backups. The private key lives in 1Password (see dr-runbook.md).
# Uploads:   to a Cloudflare R2 bucket that has Object Lock enabled, so backups
#            are immutable — a stolen key (or ransomware, or a rogue insider)
#            cannot delete them. This script intentionally has NO delete command.
#
# Designed to run from GitHub Actions (.github/workflows/backup.yml) so the
# backup compute is independent of Supabase/Railway — if either is compromised
# or deleted, the backups (and the job that makes them) are untouched.
#
# WARNING: the DB dump's OAuth tokens are encrypted in-row with TOKEN_ENCRYPTION_KEY.
# That key is NOT in the database and NOT in this backup. It MUST be stored in
# 1Password — without it, a restored DB's tokens are unrecoverable garbage.
# =============================================================================
set -euo pipefail

# ---- required ----
: "${DATABASE_URL:?DATABASE_URL is required (Supabase Postgres connection string)}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required (age public key, age1...)}"
: "${R2_ENDPOINT:?R2_ENDPOINT is required (https://<acct>.r2.cloudflarestorage.com)}"
: "${R2_BUCKET:?R2_BUCKET is required}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is required (R2 token — grant write only, no delete)}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is required}"

# ---- optional ----
HEARTBEAT_URL="${BACKUP_HEARTBEAT_URL:-}"                 # healthchecks.io-style monitor (ping on success, /fail on error)
SB_S3_ENDPOINT="${SUPABASE_S3_ENDPOINT:-}"               # Supabase → Storage → S3 connection (optional)
SB_S3_KEY="${SUPABASE_S3_ACCESS_KEY_ID:-}"
SB_S3_SECRET="${SUPABASE_S3_SECRET_ACCESS_KEY:-}"
SB_S3_REGION="${SUPABASE_S3_REGION:-us-east-1}"

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
DAYPATH="$(date -u +%Y/%m/%d)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

ping_fail() { [ -n "$HEARTBEAT_URL" ] && curl -fsS -m 10 --data-raw "$1" "${HEARTBEAT_URL}/fail" >/dev/null 2>&1 || true; }
fail() { echo "BACKUP FAILED: $*" >&2; ping_fail "$*"; exit 1; }

echo "→ [1/4] pg_dump (database)"
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$WORK/db.sql.gz" || fail "pg_dump"
DBSIZE=$(wc -c < "$WORK/db.sql.gz")
# Sanity gate: a near-empty dump is a silent failure dressed up as success.
[ "$DBSIZE" -gt 1000 ] || fail "db dump suspiciously small (${DBSIZE} bytes)"
echo "  db.sql.gz = ${DBSIZE} bytes"

echo "→ [2/4] Supabase Storage"
STORAGE_ARG=""
if [ -n "$SB_S3_ENDPOINT" ] && [ -n "$SB_S3_KEY" ]; then
  mkdir -p "$WORK/storage"
  buckets=$(AWS_ACCESS_KEY_ID="$SB_S3_KEY" AWS_SECRET_ACCESS_KEY="$SB_S3_SECRET" \
    aws s3 ls --endpoint-url "$SB_S3_ENDPOINT" --region "$SB_S3_REGION" 2>/dev/null | awk '{print $3}') || fail "storage list"
  for b in $buckets; do
    echo "  syncing bucket: $b"
    AWS_ACCESS_KEY_ID="$SB_S3_KEY" AWS_SECRET_ACCESS_KEY="$SB_S3_SECRET" \
      aws s3 sync "s3://${b}" "$WORK/storage/${b}" \
      --endpoint-url "$SB_S3_ENDPOINT" --region "$SB_S3_REGION" --no-progress --only-show-errors \
      || fail "storage sync ($b)"
  done
  STORAGE_ARG="storage"
else
  echo "  (SUPABASE_S3_* not set — skipping Storage backup. Set them to include creatives/logos.)"
fi

echo "→ [3/4] package + encrypt (age)"
printf '{"stamp":"%s","git":"%s","db_bytes":%s}\n' "$STAMP" "${GITHUB_SHA:-local}" "$DBSIZE" > "$WORK/manifest.json"
tar -C "$WORK" -cf "$WORK/archive.tar" db.sql.gz manifest.json $STORAGE_ARG
age -r "$BACKUP_AGE_RECIPIENT" -o "$WORK/archive.tar.age" "$WORK/archive.tar" || fail "age encrypt"

echo "→ [4/4] upload to R2 (immutable bucket — no delete by design)"
KEY="vigmis/${DAYPATH}/vigmis-backup-${STAMP}.tar.age"
AWS_EC2_METADATA_DISABLED=true \
  aws s3 cp "$WORK/archive.tar.age" "s3://${R2_BUCKET}/${KEY}" \
  --endpoint-url "$R2_ENDPOINT" --region auto --only-show-errors || fail "r2 upload"

echo "✓ backup complete: s3://${R2_BUCKET}/${KEY}"
[ -n "$HEARTBEAT_URL" ] && curl -fsS -m 10 "$HEARTBEAT_URL" >/dev/null 2>&1 || true
