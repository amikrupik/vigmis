# Vigmis Security Plan — Comprehensive

**Version:** 1.2 (second GPT review — 5 additions)  
**Date:** 2026-06-03  
**Stack:** Next.js (Turborepo monorepo) · Supabase · Clerk · Vercel  
**Scope:** Production SaaS platform — AI marketing tools for SMBs

---

## EXECUTIVE SUMMARY

Vigmis handles advertiser accounts, ad creatives, AI-generated content, Meta/Google/TikTok API tokens, and billing data. This plan covers all layers: infrastructure, application, data, legal compliance, and disaster recovery. Priority is ordered by risk × impact.

---

## PART 1 — THREAT MODEL

| Threat | Likelihood | Impact | Priority |
|--------|-----------|--------|----------|
| Stolen OAuth tokens (Meta/Google/TikTok) | High | Critical | P0 |
| Cross-tenant data leak (user A sees user B) | Medium | Critical | P0 |
| Supabase RLS misconfiguration (data leak) | Medium | Critical | P0 |
| Cloud account takeover (Vercel/Supabase/GitHub) | Low | Critical | P0 |
| Account takeover (credential stuffing) | High | High | P1 |
| AI prompt injection via user content | Medium | High | P1 |
| API scraping / content theft | High | Medium | P1 |
| Ransomware / full data loss | Low | Critical | P1 |
| GDPR/privacy violation → legal action | Medium | High | P1 |
| Critical vendor outage (OpenAI/Meta/Stripe) | Medium | High | P1 |
| XSS / CSRF in dashboard | Low | High | P2 |
| DDoS / availability attack | Low | Medium | P2 |
| Insider threat (employee access) | Low | High | P2 |
| Supply chain attack (npm) | Low | High | P2 |

---

## PART 2 — AUTHENTICATION & ACCESS CONTROL

### 2.1 User Authentication (Clerk)
- [ ] **MFA mandatory** for all accounts (TOTP / SMS as fallback)
- [ ] **Session duration:** max 8h idle, 30d absolute for "remember me"
- [ ] **Anomalous login detection:** flag logins from new countries, block after 5 failed attempts (15-min lockout)
- [ ] **Passkey support** (WebAuthn) — passwordless, phishing-resistant
- [ ] **Admin roles** separated from customer roles at Clerk org level

### 2.2 OAuth Token Management (Meta / Google / TikTok)
This is the **highest-risk area** — these tokens give direct access to customer ad accounts.

- [ ] Store OAuth tokens **encrypted at rest** using Supabase Vault (AES-256 with KMS-managed key, not app-level env var)
- [ ] Tokens must be **row-level isolated** — user A cannot query user B's tokens (RLS policy)
- [ ] Token refresh: background job, rotate before expiry, log every rotation
- [ ] **Anomalous usage detection:** alert if token used from new IP, unusual hours, or volume spike
- [ ] **Revocation endpoint:** one-click "disconnect platform" that immediately revokes both our stored token and the platform's issued token
- [ ] Audit log: every API call made with a customer's token (which campaign, what action, timestamp, IP)
- [ ] Token scope: request **minimum required scopes only** — no broad permissions
- [ ] Token validity check on every use — handle expired/revoked gracefully without exposing error details

### 2.3 Internal API Security
- [ ] All internal API routes require `Authorization: Bearer <clerk_jwt>` — no unauthenticated endpoints
- [ ] Service-to-service calls (api ↔ web) use short-lived signed tokens, not shared secrets
- [ ] Admin API routes require separate admin role claim in JWT

### 2.3b Tenant Isolation (Multi-Tenant Architecture)
**This is the single most dangerous failure mode.** If user A sees one record of user B — lawsuit, GDPR violation, loss of trust.

- [ ] Every customer-data table has a `tenant_id` column (= Clerk organization ID or user ID)
- [ ] RLS policies enforce `tenant_id = auth.uid()` — not just user_id, but verified at DB level
- [ ] **No shared caches** across tenants (Redis keys must be prefixed with tenant_id)
- [ ] API responses never include tenant_id in the response — internal only
- [ ] **Automated cross-tenant breach test** runs in CI:
  ```typescript
  // Example test: user A's token must not return user B's data
  test('cross-tenant isolation', async () => {
    const resA = await api.get('/campaigns', { auth: tokenA });
    const resB = await api.get('/campaigns', { auth: tokenB });
    expect(resA.data.every(c => c.tenant_id === tenantA)).toBe(true);
    expect(resB.data.every(c => c.tenant_id === tenantB)).toBe(true);
    // Ensure no overlap
    const idsA = resA.data.map(c => c.id);
    const idsB = resB.data.map(c => c.id);
    expect(idsA.filter(id => idsB.includes(id))).toHaveLength(0);
  });
  ```
- [ ] Penetration test specifically targets tenant isolation (see Part 11)

### 2.4 Row Level Security (Supabase)
**Critical:** every table that contains customer data must have RLS enabled.

```sql
-- Template for all customer-scoped tables:
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_data" ON campaigns
  USING (user_id = auth.uid());
```

- [ ] Audit all tables: confirm RLS enabled + policy exists
- [ ] Run automated test: user A cannot read user B's rows (integration test)
- [ ] Supabase service key used **only** in server-side API — never in client bundle

---

## PART 3 — APPLICATION SECURITY

### 3.1 Security Headers (next.config.ts)
```typescript
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://clerk.vigmis.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' https://api.clerk.com https://*.supabase.co",
      "frame-ancestors 'none'",
    ].join('; ')
  },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];
```

### 3.2 Rate Limiting
- [ ] **Authentication endpoints:** 5 req/min per IP
- [ ] **AI generation endpoints:** per-user quota (already partially built) + per-IP limit
- [ ] **Public API:** 100 req/min per API key
- [ ] **Webhook endpoints (Meta/Google):** verify HMAC signature before processing
- [ ] Implementation: Vercel Edge Middleware + Upstash Redis (rate limit counters)

### 3.3 Input Validation & Injection Prevention
- [ ] All user inputs validated with **Zod** schemas before DB write
- [ ] AI prompts sanitized: strip HTML, limit length, detect prompt injection patterns
- [ ] File uploads (images, creatives): type validation, virus scan via VirusTotal API, size limit
- [ ] No raw SQL — use Supabase client ORM only (parameterized queries)
- [ ] SSRF protection: if fetching external URLs (scraping), whitelist domains or use proxy

### 3.4 CSRF Protection
- [ ] Clerk handles CSRF for auth flows
- [ ] Custom API routes: verify `Origin` header matches `vigmis.com`
- [ ] Double-submit cookie pattern for forms not using Clerk

### 3.5 Supply Chain Security
- [ ] `npm audit` in CI — fail build on high/critical vulnerabilities
- [ ] Dependabot / Renovate: auto-PRs for security patches
- [ ] Lock file committed (package-lock.json) — no `*` version ranges; pin exact versions for critical packages
- [ ] **SBOM (Software Bill of Materials):** generate on every release (`npm sbom --json`)
- [ ] **Build signing:** Vercel deployment provenance attestation enabled
- [ ] **Secret scanning in CI:** gitleaks + GitHub secret scanning — fail on any detected secret
- [ ] **GitHub Branch Protection (required):**
  - Require PR review before merge to main
  - Require status checks to pass (tests + audit)
  - No force-push to main
  - No direct commits to main (including admin)
- [ ] Subresource Integrity (SRI) for any CDN-loaded scripts
- [ ] Review new dependencies before adding: check npm downloads, last publish date, maintainer reputation

---

## PART 4 — CONTENT PROTECTION (ANTI-COPYING)

### 4.0 Realistic Expectations
Anti-copying **cannot be 100% effective**. The goal is: make copying hard enough that it's not worth it, detect when it happens, and prove ownership in court.

Strategy: **Deter → Detect → Prove** (in that order of priority).

### 4.1 IP Protection
- [ ] AI-generated content: embed invisible watermark metadata in all generated images
- [ ] Disable right-click on creative previews (CSS + JS, not security but deterrent)
- [ ] Terms of Service: explicit prohibition on scraping, reselling, or re-training on Vigmis outputs
- [ ] DMCA policy page + designated agent registered with US Copyright Office

### 4.2 Anti-Scraping
- [ ] Vercel Firewall: block known scraper ASNs (DataCenter IP ranges)
- [ ] Vercel BotID integration: detect bot traffic, serve challenge or block
- [ ] Honeypot endpoints: hidden API routes that only bots hit → auto-block IP
- [ ] Rate limiting on content delivery endpoints (see 3.2)
- [ ] Login wall: all valuable content behind authentication

### 4.3 API Security
- [ ] API keys (for any public API): scoped, revocable, logged
- [ ] No sensitive data in URL params (use POST body, never `?token=...`)
- [ ] Response filtering: API never returns more fields than the caller needs

---

## PART 5 — DATA PROTECTION & PRIVACY COMPLIANCE

### 5.1 Applicable Laws & Standards

| Regulation | Jurisdiction | Key Requirements |
|-----------|-------------|-----------------|
| GDPR | EU (affects all EU users) | Consent, right to deletion, DPA, 72h breach notification |
| Israeli Privacy Protection Law (תשמ"א-1981) + Regulations 2017 | Israel | Registration of databases, breach notification, data security standards |
| Israeli Database Security Regulations | Israel | Security manager appointment, access controls, audit logs |
| CCPA | California, USA | Right to know, opt-out of sale, deletion |
| PCI-DSS v4 | Global (if card data) | Handled by Stripe/payment processor — don't store card data |

### 5.2 Required Data Practices
- [ ] **Privacy Policy** page: comprehensive, lawyer-reviewed, covers AI processing
- [ ] **Cookie consent banner** (GDPR-compliant): opt-in for analytics/marketing cookies
- [ ] **Data Processing Agreement (DPA)** template for B2B customers
- [ ] **Data retention policy:** define how long each data type is kept, automated deletion
- [ ] **Right to deletion:** one-click "Delete my account" that cascades through all tables
- [ ] **Data export:** user can download all their data (GDPR portability right)
- [ ] **Breach notification procedure:** documented 72h GDPR + Israeli law process

### 5.3 Data Classification & Encryption at Rest

**Rule:** RLS protects against unauthorized queries. Encryption at rest protects against DB dump / direct file access — two different attack vectors.

| Data Type | Classification | Storage | Encryption at Rest |
|-----------|---------------|---------|-------------------|
| OAuth tokens (Meta/Google/TikTok) | Critical | Supabase Vault | AES-256 (KMS-managed key) |
| API keys (OpenAI, Anthropic) | Critical | Vercel env (server only) | TLS in transit; Vercel encrypts at rest |
| Customer PII (name, email, phone) | Sensitive | Supabase — **encrypted columns** | pgcrypto column-level encryption |
| Ad account IDs | Sensitive | Supabase — **encrypted columns** | pgcrypto column-level encryption |
| Business data (budgets, performance) | Sensitive | Supabase | TLS + RLS (column encryption optional) |
| AI-generated content | Internal | Supabase Storage | TLS + Supabase storage encryption |
| Analytics/usage logs | Internal | Supabase | TLS |

**Implementation note:** Column-level encryption means even if someone gets a raw DB dump (e.g., via backup file leak), PII is still unreadable without the application key.

```sql
-- Example: encrypt email column
UPDATE users SET email = pgp_sym_encrypt(email, current_setting('app.encryption_key'));
```

- [ ] Implement column-level encryption on PII fields (name, email, phone, address)
- [ ] Encryption key stored in Supabase Vault — never in application code
- [ ] Key rotation procedure documented (annual minimum)

### 5.4 Third-Party Processors
Must have DPAs with all of:
- [ ] Vercel (hosting)
- [ ] Supabase (database)
- [ ] Clerk (authentication)
- [ ] OpenAI / Anthropic (AI processing)
- [ ] Stripe (billing)

---

## PART 6 — INFRASTRUCTURE SECURITY

### 6.1 Vercel Configuration
- [ ] **Vercel Firewall:** enable WAF rules for OWASP Top 10
- [ ] **DDoS protection:** Vercel provides layer 3/4 protection automatically; enable layer 7 rules
- [ ] **Preview deployment protection:** require auth on all preview URLs (not public)
- [ ] **Environment variables:** never in code, only via `vercel env` — separate per environment
- [ ] **Branch protection:** only main deploys to production, require PR review

### 6.2 Supabase Configuration
- [ ] **Connection pooling:** use PgBouncer (Supabase Transaction mode)
- [ ] **Network restrictions:** only Vercel IP ranges can connect (Supabase network restrictions)
- [ ] **Vault:** use Supabase Vault for secrets, not plain columns
- [ ] **Audit log:** enable `pg_audit` for all sensitive tables
- [ ] **Backup:** see Part 7

### 6.2b Cloud Account Security (Vercel / Supabase / GitHub / Clerk)
**If any of these accounts is compromised, the entire business can be shut down in minutes.**

- [ ] **MFA on every vendor account** — no exceptions: Vercel, Supabase, GitHub, Clerk, Stripe, OpenAI, Anthropic
- [ ] **Hardware security keys (YubiKey)** for owner accounts on all critical vendors — TOTP is not enough for founders/CTO
- [ ] **Recovery codes** stored in an encrypted password manager (1Password / Bitwarden) offline copy
- [ ] **Break Glass accounts:** separate emergency admin accounts with different email + password, used only in crisis — stored offline
- [ ] **Minimal team access:** only people who need prod access have it; review quarterly
- [ ] **GitHub:** organization-level security policy — require MFA for all org members
- [ ] **Vercel:** team member roles — developer ≠ owner; production deploy requires role confirmation
- [ ] **Alert on:** new team member added, billing method changed, new OAuth app registered

### 6.3 Secrets Management + Secrets Disaster Recovery

**Normal operation:**
- [ ] No secrets in `.env` files committed to git (use `.env.example` only)
- [ ] Rotate all secrets on suspected compromise — runbook documented
- [ ] Secret scanning in CI (GitHub secret scanning + gitleaks)
- [ ] Separate secrets per environment: dev secrets ≠ prod secrets

**Secrets Disaster Recovery — "what if ALL secrets are lost?"**

This scenario: Vercel account deleted, Supabase project deleted, no access to any vendor account. Starting from zero.

- [ ] **Secrets inventory document** (offline, encrypted): complete list of every secret, which vendor, what it's used for — updated on every rotation
- [ ] **Encrypted backup of all secrets:** stored in 1Password / Bitwarden Secrets Manager — separate from the application, accessible even if all vendor accounts are down
- [ ] **Recovery procedure documented:**
  1. Access secrets backup from password manager
  2. Create new vendor accounts with break-glass credentials (stored separately)
  3. Re-provision: new Supabase project → restore DB → inject secrets → new Vercel project → deploy
  4. Update OAuth redirect URIs at Meta/Google/TikTok developer consoles
  5. Re-invite team members
- [ ] **Two people hold the master password** to the secrets backup — never one person only
- [ ] **Test recovery annually:** actually go through the process with a staging environment

---

## PART 7 — BACKUP & DISASTER RECOVERY

### 7.1 Recovery Objectives

| Scenario | RTO (Recovery Time) | RPO (Data Loss) |
|----------|-------------------|-----------------|
| Single feature failure | < 5 min (redeploy) | 0 |
| Database corruption | < 1 hour | < 1 hour |
| Full infrastructure failure | < 4 hours | < 24 hours |
| Ransomware / complete takeover | < 24 hours | < 24 hours |

### 7.1b 3-2-1 Backup Rule
**The rule:** 3 copies, on 2 different media, 1 offsite.

| Copy | Location | Type | Retention |
|------|---------|------|-----------|
| Copy 1 | Supabase (primary) | Live DB + PITR | 7 days rolling |
| Copy 2 | Supabase Storage (same account) | Encrypted pg_dump | 30 days |
| Copy 3 | AWS S3 / Cloudflare R2 (different vendor) | Encrypted pg_dump | 90 days, **immutable** |

**Why 3 copies matter:** If Supabase has a catastrophic failure or account compromise, copies 1 and 2 are lost simultaneously. Copy 3 (different vendor) is the real disaster recovery backup.

**Immutable backup:** S3 Object Lock or R2 with retention policy — cannot be deleted even by us. Protects against ransomware that would otherwise delete our backups.

### 7.2 Database Backups (Supabase)
- [ ] **Daily automated backups** (Supabase Pro: 7 days retention → upgrade to 30 days)
- [ ] **Point-in-time recovery (PITR):** enabled — can restore to any second in last 7 days
- [ ] **Weekly export to cold storage:** `pg_dump` → encrypted → Supabase Storage (different region) or S3
- [ ] **Monthly DR drill:** actually restore a backup to staging, verify data integrity

### 7.3 Application Backup
- [ ] Code: Git (already) + mirror to second remote (GitLab / Bitbucket)
- [ ] Vercel deployments: all builds are immutable and stored — can rollback to any previous deploy instantly
- [ ] Environment variables: encrypted backup of all env vars (not in git)

### 7.4 Disaster Recovery Runbook
- [ ] **Runbook document** (separate): step-by-step for "complete rebuild from scratch"
  1. Provision new Supabase project in different region
  2. Restore from latest backup
  3. Create new Vercel project, connect repo
  4. Re-inject all environment variables from backup
  5. Update DNS to new Vercel URLs
  6. Verify all OAuth redirect URIs updated
  7. Smoke test all critical flows
  8. Estimated time: 4-6 hours
- [ ] This runbook must be tested annually

### 7.5 Incident Response Playbook

**Who gets called (define before incident):**

| Role | Name | Contact | Backup |
|------|------|---------|--------|
| Incident Commander | ___ | ___ | ___ |
| Technical Lead | ___ | ___ | ___ |
| Legal/Compliance | ___ | ___ | ___ |
| Customer Communication | ___ | ___ | ___ |

**Severity Levels:**

| Level | Definition | Response Time |
|-------|-----------|--------------|
| P0 — Critical | Data breach, full outage, account takeover | Immediate, 24/7 |
| P1 — High | Partial outage, suspected breach | < 1 hour |
| P2 — Medium | Feature down, anomalous activity | < 4 hours |

**P0 Playbook — Step by Step:**

*Phase 1: Contain (0–30 min)*
1. Incident Commander declared — single person owns the response
2. Rotate ALL secrets (Vercel env, Supabase service key, Clerk keys)
3. Revoke ALL customer OAuth tokens (Meta/Google/TikTok)
4. Disable public access to Supabase (network restrictions)
5. Take Vercel deployment to maintenance mode if needed
6. Document: start an incident log with timestamps

*Phase 2: Assess (30 min–2 hours)*
7. Determine: what was accessed? Which tenants? Which data?
8. Determine: how did attacker get in? (Entry point)
9. Preserve: snapshot current DB state for forensics — do NOT clean up yet
10. Alert Legal — 72h GDPR clock starts NOW if PII was exposed

*Phase 3: Recover (2–24 hours)*
11. Restore to last known-clean backup in new environment
12. Rebuild infrastructure from scratch if compromised (use DR runbook)
13. Verify data integrity before re-opening
14. Re-issue OAuth tokens to customers (they must reconnect their platforms)

*Phase 4: Communicate*
15. Internal team briefed within 2 hours
16. Affected customers notified (template ready in advance)
17. GDPR notification to supervisory authority within 72 hours (if PII exposed)
18. Israeli Privacy Authority notification (if Israeli users affected)
19. Public statement (if needed)

*Phase 5: Post-Incident*
20. Root cause analysis document
21. Fix the vulnerability
22. Update this playbook based on what didn't work
23. Customer compensation assessment

---

## PART 8 — MONITORING & ALERTING

### 8.1 Security Monitoring
- [ ] **Vercel logs:** real-time error monitoring (Sentry integration)
- [ ] **Supabase logs:** alert on unusual query patterns (full table scans, bulk exports)
- [ ] **Auth anomalies:** Clerk webhooks → alert on: mass login failures, new country logins, bulk signups
- [ ] **Uptime monitoring:** Uptime Robot / Better Uptime — alert < 30 sec downtime
- [ ] **Certificate expiry:** alert 30 days before TLS cert expires

### 8.1b Immutable Audit Trail
**Why immutable:** if there's ever litigation, a deletable audit log is worthless — and may even be worse than no log (evidence of tampering). Append-only = legally defensible.

- [ ] **Separate audit log table** — never updated or deleted, only inserted
- [ ] **Append-only enforcement at DB level:**
  ```sql
  -- Revoke DELETE and UPDATE on audit table from all roles including service role
  REVOKE DELETE, UPDATE, TRUNCATE ON audit_log FROM service_role, authenticated, anon;
  ```
- [ ] **What gets logged:** every create/update/delete on customer data, every auth event, every API call with a customer's OAuth token, every admin action
- [ ] **Log retention:** 7 years (Israeli commercial law requirement + GDPR "as long as needed")
- [ ] **Offsite archive:** monthly export of audit logs to S3 immutable storage (same as backups)
- [ ] **No UI delete:** admin panel must not have a "clear logs" button
- [ ] **Legal hold flag** (see Part 12b): legal hold prevents automated log deletion for specific tenants

### 8.2 Business Security Metrics (Monthly Review)
- Failed login attempts by IP
- OAuth token revocations (unexpected spikes)
- AI cost per user (anomaly = possible account compromise)
- New user signups by geography (bot signups)

---

## PART 9 — ORGANIZATIONAL SECURITY

### 9.1 Access Control (Internal) + Insider Threat

**Reality check:** most major data breaches are employees, not external hackers. Disgruntled employee, compromised employee laptop, or accidental over-access are more likely than a sophisticated external attack.

- [ ] Principle of least privilege: developers don't have prod DB access by default
- [ ] Production access: requires 2-person authorization (4-eyes principle)
- [ ] **Just-In-Time (JIT) Access:** no standing prod access — request access → approved by second person → auto-expires after 2 hours
  - Tool: implement via Supabase RLS + temporary role grant, or use a PAM tool (HashiCorp Boundary, Teleport)
- [ ] **Every prod access is logged:** who, when, what query, how many rows returned — stored in immutable audit log
- [ ] **Alert on unusual internal access:** bulk exports, queries touching >1000 rows, access outside business hours
- [ ] Supabase Studio in production: disabled by default; JIT access only
- [ ] Offboarding checklist: revoke within 1 hour of departure (not end-of-day)

### 9.2 Security Awareness
- [ ] Social engineering awareness (phishing of team members)
- [ ] Secure coding training for all developers
- [ ] Annual security review of this document

### 9.3 Vendor Assessment
- [ ] Before adding any new package/vendor: security review (popularity, maintenance, known CVEs)
- [ ] Annual review of all third-party integrations

---

## PART 10 — BUSINESS CONTINUITY

What happens when a critical vendor goes down? Vigmis must continue to function — or fail gracefully with clear user communication.

### 10.1 Vendor Failure Scenarios

| Vendor | Failure Impact | Mitigation |
|--------|---------------|-----------|
| OpenAI API down | AI generation stops | Fallback to Anthropic (Claude) — already in ai-router |
| Anthropic API down | AI generation degraded | Fallback to OpenAI |
| Meta Graph API down | Can't publish/fetch FB/IG | Queue actions, retry when restored; show status to user |
| Google Ads API down | Google campaigns paused | Queue + retry; user notification |
| TikTok API down | TikTok features paused | Queue + retry |
| Stripe down | Can't charge new customers | Accept new signups, defer billing; existing access unaffected |
| Clerk down | Users can't log in | Emergency: Clerk has 99.99% SLA; have emergency contact ready |
| Vercel down | Site unavailable | Vercel has 99.99% SLA; DNS failover to backup deployment |
| Supabase down | All data unavailable | Vercel functions fail gracefully; read-only cache for critical data |

### 10.2 Degraded Mode Design
- [ ] **Circuit breakers:** if vendor API fails 3× in 60s, stop calling, return cached/error response
- [ ] **Job queues:** ad publishing jobs queued (not dropped) when platform API is down — process when restored
- [ ] **Status page:** `status.vigmis.com` — shows current health of all integrations
- [ ] **User communication:** in-app banner when any platform they use is degraded
- [ ] **AI fallback routing:** ai-router already exists — ensure it has fallback chain: Claude → OpenAI → error

### 10.3 SLA Targets

| Service | Target Uptime | Allowed Downtime/Month |
|---------|-------------|----------------------|
| vigmis.com (main app) | 99.9% | ~43 min |
| AI generation | 99.5% | ~3.6 hours |
| Platform publishing (Meta/Google) | 99% | ~7 hours |

---

## PART 11 — PENETRATION TESTING

**GPT is right:** "we'll do it later" is not acceptable before having paying customers.

### 11.1 Pre-Launch Requirements (Before First Paying Customer)
- [ ] **OWASP Top 10 self-assessment** — go through each item, document pass/fail
- [ ] **API Security Top 10** (OWASP API) — specifically relevant to our REST/Next.js API routes
- [ ] **OAuth Security Review:** test token storage, scope handling, PKCE, state parameter validation
- [ ] **Cross-tenant isolation test:** dedicated test suite (see 2.3b)
- [ ] **Internal security review** by a developer who didn't write the code

### 11.2 External Penetration Test (Q3 2026)
- Scope: web app + API + OAuth flows + Supabase RLS
- Budget estimate: $5,000–$15,000 for a reputable firm
- Firms: HackerOne, Synack, or Israeli firm (KPMG Cyber, Sygnia)
- Deliverable: written report with CVSS scores + remediation guidance
- Re-test after fixes

### 11.3 Ongoing Bug Bounty (Phase 3)
- Consider HackerOne or Intigriti managed bug bounty program
- Scope: production app only, no DoS, responsible disclosure
- Minimum reward: $100 (low) to $2,000 (critical)

---

## PART 12 — IMPLEMENTATION ROADMAP

### Phase 1 — Critical (Do Now, 1-2 weeks)
| Item | Part | Effort |
|------|------|--------|
| Enable RLS on all Supabase tables + audit | 2.4 | 1 day |
| Add tenant_id to all tables + cross-tenant test | 2.3b | 1 day |
| Encrypt OAuth tokens in Supabase Vault (KMS) | 2.2 | 1 day |
| MFA mandatory in Clerk + YubiKey on vendor accounts | 2.1 + 6.2b | 2 hours |
| Secret scanning in CI (gitleaks) + GitHub branch protection | 3.5 | 2 hours |
| Add security headers to next.config.ts | 3.1 | 2 hours |
| Enable Vercel WAF + preview protection | 6.1 | 2 hours |

### Phase 2 — Before First Paying Customer
| Item | Part | Effort |
|------|------|--------|
| OWASP Top 10 self-assessment | 11.1 | 2 days |
| Cross-tenant isolation automated tests | 2.3b | 1 day |
| PII column-level encryption (pgcrypto) | 5.3 | 1 day |
| Immutable audit log table (append-only, no DELETE) | 8.1b | 1 day |
| Legal hold flag + deletion job guard | 12b | 4 hours |
| Rate limiting (Upstash Redis) | 3.2 | 1 day |
| Privacy Policy page (lawyer-reviewed) | 5.2 | 3 days |
| Cookie consent banner | 5.2 | 1 day |
| GDPR deletion flow (with legal hold check) | 5.2 | 2 days |
| 3-2-1 backup: PITR + S3 immutable copy | 7.1b | 1 day |
| Secrets backup in 1Password (2-person access) | 6.3 | 2 hours |
| Fill in Incident Response Playbook contacts | 7.5 | 2 hours |
| Circuit breakers + job queues for platform APIs | 10.2 | 2 days |
| Status page (status.vigmis.com) | 10.2 | 1 day |

### Phase 3 — Scale (1-3 months)
| Item | Part | Effort |
|------|------|--------|
| External penetration test | 11.2 | 2 weeks |
| DR drill + full runbook test | 7.4 | 1 day |
| DPAs with all processors | 5.4 | 1 week |
| DMCA registration + IP terms | 4.1 | 1 week |
| Full audit logging system | 8.1 | 3 days |
| Vercel BotID integration | 4.2 | 1 day |
| SOC 2 Type I (if enterprise customers needed) | — | 3 months |

---

## PART 12b — LEGAL HOLD & DATA PRESERVATION

**The problem:** Vigmis has an automated GDPR deletion flow (user requests account deletion → data deleted in 30 days). But if that user is simultaneously suing us, deleting their data is destruction of evidence — potentially a criminal offense in some jurisdictions.

### Legal Hold Procedure
- [ ] **Legal hold flag** on tenant/user record: `legal_hold: boolean` in DB
- [ ] **Automated deletion jobs must check this flag** before any deletion
  ```typescript
  // In any deletion cron/job:
  const { legal_hold } = await db.from('tenants').select('legal_hold').eq('id', tenantId).single();
  if (legal_hold) {
    await notifyLegal(`Deletion blocked for ${tenantId} — legal hold active`);
    return; // do not delete
  }
  ```
- [ ] **Who can set legal hold:** only Incident Commander or legal counsel — not customer-facing staff
- [ ] **Legal hold log:** every time a hold is set or lifted, it's recorded in the immutable audit trail with reason and authorizing person
- [ ] **GDPR compliance:** when legal hold is active, the GDPR deletion right is suspended — this is legal under GDPR Article 17(3)(e) (legal claims defense). Must document this in Privacy Policy.

### Litigation Preservation
- [ ] When litigation is anticipated or commenced:
  1. Set legal hold immediately on all affected tenants
  2. Export and preserve: all logs, all communications, all AI-generated content, all campaign data
  3. Notify Supabase + Vercel to preserve any infrastructure logs they hold (via legal request if needed)
  4. Do NOT delete, modify, or overwrite any data in scope
- [ ] Legal hold template letter to vendors (prepared in advance, not written during crisis)

---

## QUESTIONS FOR REVIEW (GPT / Legal Counsel)

1. Israeli Database Regulations 2017: does Vigmis qualify as a "database holder" requiring formal registration? (Likely yes — >10,000 records)
2. For GDPR: given Vigmis processes EU user data via AI providers (OpenAI/Anthropic), does the "sub-processor" chain need explicit disclosure in the privacy policy?
3. SOC 2 vs ISO 27001: which certification is more valued by Israeli SMB customers?
4. PCI-DSS scope: since all payment processing is Stripe (no card data stored), are we in "SAQ A" (simplest) scope or is there additional obligation?
5. For the Meta/Google/TikTok OAuth tokens: are we legally the "data controller" or "data processor" for ad account data? This affects GDPR obligations significantly.
6. Content watermarking of AI outputs: is there an Israeli copyright law implication if customers claim ownership of AI-generated ads?

---

## CURRENT STATUS vs PLAN

| Area | Current State | Gap |
|------|--------------|-----|
| Authentication | Clerk (basic) | MFA not mandatory, no passkeys |
| OAuth token storage | Unknown — likely plain text | Must encrypt in Vault |
| RLS | Unknown | Must audit all tables |
| Security headers | None | Full implementation needed |
| Rate limiting | Partial (AI quota) | Need API-wide limiting |
| Backups | Supabase default (7 days) | Need PITR + cold storage |
| Privacy Policy | Missing | Must create before scaling |
| Cookie consent | Missing | Required for GDPR |
| Monitoring | Basic Vercel logs | Need Sentry + alerts |
| Penetration testing | Never done | Plan for Q3 2026 |
