# Vigmis — Pre-Launch Checklist (before real user registration)

Actions that are deliberately deferred until we open to real/paying users.
**Claude: when the user says they're about to enable user registration / go to market,
surface this list and walk through it.**

Last updated: 2026-06-06

---

## 🔴 Must-do before go-live

### Backups & Disaster Recovery
- [ ] **Supabase PITR** — enable (~$100/mo add-on). *Deferred by decision 2026-06-06: not worth it
      with zero users; enable the moment real users start onboarding.* Reduces data loss (RPO) from
      ~24h to seconds. Code/runbook already ready (`scripts/dr-runbook.md`).
- [ ] Recreate R2 bucket `vigmis-backups` **with Object Lock enabled at creation** + 90-day retention.
- [ ] Generate `age` keypair; private key → password manager; public key → GitHub secret `BACKUP_AGE_RECIPIENT`.
- [ ] Add GitHub Actions secrets (R2 + DB URL + optional Storage + heartbeat) and run `nightly-backup` once.
- [ ] **Back up `TOKEN_ENCRYPTION_KEY` to the password manager** — without it a restored DB's OAuth tokens are unrecoverable.
- [ ] Do the first **restore drill** (decrypt + restore to a throwaway project) and record the result.
- [ ] Set up backup monitoring (healthchecks.io) → alert on missed/failed backup.

### Secrets & accounts (VIGMIS-side protection)
- [ ] **Rotate the Supabase `sbp_` access token** used during the 2026-06-06 session (it was pasted in chat).
- [ ] Set `PADDLE_WEBHOOK_SECRET` in Railway **or** confirm billing moved to Stripe and align the code.
- [ ] Remove the stray/malformed Railway variable `SKAWIrnqB0tXmAT7Hug0ohDtJjOicf56`.
- [ ] **MFA on every console**: GitHub, Vercel, Supabase, Railway, Cloudflare, Clerk, domain registrar.
- [ ] Move all secrets into a password manager with **2-person recovery access** (SECURITY_PLAN §6.3).

### Compliance / legal
- [ ] Real Privacy Policy + Terms (current ones are placeholders in `server.ts`).
- [ ] Cookie consent flow if serving EU users (GDPR).
- [ ] Define incident-response contacts (fill the blank table in SECURITY_PLAN §7.5).

---

## 🟡 Recommended soon after launch
- [ ] Tuned Content-Security-Policy (Clerk-compatible) on the web app.
- [ ] GitLab (or Bitbucket) mirror of the GitHub repo.
- [ ] Per-route rate limits on `/auth/*` and webhooks (global 100/min already in place).
- [ ] Infrastructure-as-code snapshot (Vercel/DNS/Clerk config) → R2.
- [ ] Layer-3 cold backup copy to a second provider/region (weekly).

---

## ✅ Already done (2026-06-06 security pass)
- RLS lockdown on all 49 public tables (migration 045) — closes public-anon-key data access.
- CRON/admin/webhook auth: fail-closed + constant-time (no hardcoded defaults).
- OAuth tokens AES-256-GCM encrypted; verified no cross-tenant leak.
- Security headers (API + web); secrets redacted from logs.
- Webhook HMAC over raw signed body (Shopify + Paddle).
- Prompt-injection containment (`[ACTION:]` neutralized in untrusted text).
- `ADMIN_SECRET` set (kill-switch enabled). DR pipeline built (`scripts/backup.sh` + workflow).
