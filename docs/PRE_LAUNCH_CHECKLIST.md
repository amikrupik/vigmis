# Vigmis — Pre-Launch Checklist (before real user registration)

Actions that are deliberately deferred until we open to real/paying users.
**Claude: when the user says they're about to enable user registration / go to market,
surface this list and walk through it.**

Last updated: 2026-06-06

---

## 🔴 Must-do before go-live

### Backups & Disaster Recovery
**Decision 2026-06-06:** the R2 backup pipeline is BUILT and immutability is PROVEN, but *activating*
it is deferred to launch — there is no real customer data to protect yet, and safe activation needs
the secrets vault (below). All of the following fire together at the "opening registration" trigger:
- [ ] **Supabase PITR** — enable (~$100/mo add-on). Reduces data loss (RPO) from ~24h to seconds.
- [ ] Pick a password manager: **Bitwarden (free)** or 1Password (~$8/user/mo — *deferred 2026-06-06, paid*).
- [ ] Generate `age` keypair → private key into the password manager; public key → GitHub secret `BACKUP_AGE_RECIPIENT`.
      *(A temporary key was generated and securely deleted on 2026-06-06; regenerate cleanly into the vault.)*
- [ ] Add GitHub Actions secrets (R2 keys + endpoint + bucket + DB URL + optional Storage + heartbeat) and run `nightly-backup` once.
- [ ] **Back up `TOKEN_ENCRYPTION_KEY` to the password manager** — without it a restored DB's OAuth tokens are unrecoverable.
- [ ] Do the first **restore drill** (decrypt + restore to a throwaway project) and record the result.
- [ ] Set up backup monitoring (healthchecks.io) → alert on missed/failed backup.

> ✅ Already done & permanent: R2 bucket `vigmis-backups` created; **Bucket Lock (90-day, whole bucket)
> set and immutability verified** (DELETE returns `409 ObjectLockedByBucketPolicy`); full pipeline coded
> (`scripts/backup.sh`, `.github/workflows/backup.yml`, `scripts/dr-runbook.md`).

### Secrets & accounts (VIGMIS-side protection)
- [ ] **Rotate the Supabase `sbp_` access token** used during the 2026-06-06 session (it was pasted in chat).
- [ ] **Rotate the Cloudflare R2 tokens** shared during the 2026-06-06 session (backup token + admin token).
- [ ] **Billing = Stripe** (Paddle dropped, 2026-06-06). When the Stripe account is registered: implement
      the Stripe webhook handler (replace the Paddle one in `routes/billing.ts`) + set `STRIPE_WEBHOOK_SECRET`.
      *(Current Paddle webhook fails closed — safe, just unused.)*
- [ ] Verify `TIKTOK_CLIENT_SECRET` in Railway has no stray newline (its value currently spans 2 lines) —
      check when activating TikTok. *(Earlier-suspected "stray variable" was a false alarm — it's this value's 2nd line.)*
- [ ] **MFA on every console**: GitHub, Vercel, Supabase, Railway, Cloudflare, Clerk, domain registrar.
- [ ] Move all secrets into the password manager with **2-person recovery access** (SECURITY_PLAN §6.3).

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
