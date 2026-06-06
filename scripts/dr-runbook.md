# Vigmis — Backup & Disaster Recovery Runbook

This is the operational companion to `docs/SECURITY_PLAN.md` PART 7.
It covers: what is backed up, how to set it up, how to restore, and the drill.

---

## Recovery objectives (SLA)

| Scenario | RTO (time to recover) | RPO (max data loss) |
|----------|----------------------|---------------------|
| Single feature failure | < 5 min (redeploy) | 0 |
| Database corruption | < 1 hour (Supabase PITR) | < 1 min (PITR) |
| Supabase account lost / vendor ban | < 4 hours (rebuild from R2) | < 24 h (nightly R2) |
| Ransomware / full takeover | < 24 hours | < 24 h |

---

## The layers (defense in depth)

| Layer | What | Where | Deletable? |
|-------|------|-------|-----------|
| 1 | Live DB + Point-in-Time Recovery | Supabase (primary) | n/a |
| 2 | Nightly encrypted snapshot (DB + Storage) | **Cloudflare R2, Object Lock** | **NO — immutable** |
| 3 | Secrets + encryption key | **1Password** (2-person access) | manual |
| 4 | Code | GitHub + optional GitLab mirror | git is distributed |

**Golden rule:** if Supabase disappears tomorrow morning, Layer 2 + Layer 3 bring the business back.

---

## ⚠️ The most important sentence in this document

**A restored database is worthless without `TOKEN_ENCRYPTION_KEY`.**
OAuth tokens (Meta/Google/TikTok) are stored AES-256-GCM encrypted with that key. The key is
**not** in the database and **not** in the backup. It lives only in Railway env + 1Password.
Lose it → every client must reconnect every ad platform from scratch.
→ **Store `TOKEN_ENCRYPTION_KEY` in 1Password today.**

---

## One-time setup

### 1. Supabase PITR (Layer 1)
Supabase Dashboard → Project → Database → Backups → enable **Point-in-Time Recovery** (paid add-on).

### 2. Cloudflare R2 bucket with Object Lock (Layer 2)
1. Cloudflare dashboard → R2 → **Create bucket** (e.g. `vigmis-backups`).
2. Enable **Object Lock** on the bucket (compliance/governance mode) with a default
   retention of **90 days** — this is what makes backups undeletable.
3. Add a lifecycle rule to expire objects after retention (cost control).
4. Create an **R2 API token** scoped to this bucket with **Object Read & Write** —
   do **NOT** grant delete. Note the Access Key ID + Secret + the S3 endpoint
   `https://<account_id>.r2.cloudflarestorage.com`.

### 3. age encryption keypair (Layer 2 encryption)
On a trusted machine (NOT in CI):
```bash
age-keygen -o vigmis-backup.key      # prints the PUBLIC key (age1...) to stderr
```
- Put the **private key** (`vigmis-backup.key`) in **1Password** — this is the ONLY thing that can decrypt backups.
- The **public key** (`age1...`) goes into the GitHub secret `BACKUP_AGE_RECIPIENT`.

### 4. (Optional) Supabase Storage S3 access — to back up creatives/logos
Supabase → Storage → **S3 Connection** → enable. Note endpoint + access key + secret.

### 5. (Optional) Backup monitoring
Create a check at healthchecks.io (or Better Stack) with a daily period + grace.
Put its ping URL in `BACKUP_HEARTBEAT_URL`. The job pings on success and `/fail` on error,
so you get alerted if a backup is missed, fails, or stops running.

### 6. GitHub Actions secrets
Repo → Settings → Secrets and variables → Actions → add:
`BACKUP_DATABASE_URL`, `BACKUP_AGE_RECIPIENT`, `R2_ENDPOINT`, `R2_BUCKET`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and (optional)
`SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY`,
`BACKUP_HEARTBEAT_URL`.

Then run the workflow once manually: Actions → **nightly-backup** → Run workflow.

---

## Restore

### Decrypt a backup
```bash
# 1. pull the latest object from R2 (aws cli with the R2 endpoint)
aws s3 ls   "s3://$R2_BUCKET/vigmis/" --endpoint-url "$R2_ENDPOINT" --region auto --recursive | tail
aws s3 cp   "s3://$R2_BUCKET/vigmis/2026/06/06/vigmis-backup-....tar.age" . --endpoint-url "$R2_ENDPOINT" --region auto

# 2. decrypt with the private key from 1Password
age -d -i vigmis-backup.key vigmis-backup-....tar.age > archive.tar
tar -xf archive.tar          # → db.sql.gz, manifest.json, storage/

# 3. restore the database
gunzip -c db.sql.gz | psql "$TARGET_DATABASE_URL"

# 4. restore storage (if present) into the new project's buckets
#    aws s3 sync storage/<bucket> s3://<bucket> --endpoint-url <new supabase s3 endpoint>
```

### Full rebuild ("Supabase is gone")
1. Provision a new Supabase project (different region if vendor-region issue).
2. Restore DB (step 3 above) → run any pending migrations in `supabase/migrations/`.
3. Restore Storage (step 4).
4. Re-inject env vars from 1Password — **including `TOKEN_ENCRYPTION_KEY`** (must be the SAME value).
5. Point Railway/Vercel at the new project; update OAuth redirect URIs; update DNS.
6. Smoke-test critical flows. Target: 4 hours.

---

## Quarterly restore drill (REQUIRED)

A backup you have never restored is not a backup.

Every quarter:
1. Spin up a throwaway Supabase project (or local Postgres).
2. Pull the latest R2 backup, decrypt, restore DB + Storage.
3. Verify: row counts sane, a sample OAuth token decrypts with the 1Password key,
   an image opens from restored storage.
4. Record the date + result. Tear down the throwaway project.

---

## Still on the roadmap (documented, not yet automated)
- **Layer 3 cold copy** to a *second* provider/region (e.g. Google Cloud Storage) — weekly.
- **Infrastructure-as-code** snapshot of Vercel/DNS/Clerk config (export to the same R2 bucket).
