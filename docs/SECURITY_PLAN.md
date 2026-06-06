# Vigmis Security Plan — Comprehensive

**Version:** 1.4 (Phase 1 code audit executed + hardening implemented)  
**Date:** 2026-06-06  
**Stack:** Next.js (Turborepo monorepo) · Supabase · Clerk · Vercel  
**Audit report:** see `docs/SECURITY_AUDIT_PHASE1.md` for the full code-level findings.  
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
| **[NEW] Log redaction — Fastify redact config** | 15.1 | 2 hours |
| **[NEW] Immutable audit log (no DELETE policy)** | 8.1b | 2 hours |

### Phase 1b — AI-Specific (Parallel with Phase 1)
| Item | Part | Effort |
|------|------|--------|
| **[NEW] Prompt injection patterns blocked** | 16.1 | 4 hours |
| **[NEW] AI cost explosion protection (token limits all endpoints)** | 16.3 | 2 hours |
| **[NEW] Jailbreak detection → trust tier** | 16.2 | 4 hours |

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

### Phase 2b — SDL + Data Lifecycle
| Item | Part | Effort |
|------|------|--------|
| **[NEW] PR security checklist template** | 14.2 | 1 hour |
| **[NEW] Data Lifecycle map — verify cascade delete** | 18.3 | 1 day |
| **[NEW] Session re-auth for critical actions** | 13.2 | 1 day |
| **[NEW] Vendor lockout runbooks documented** | 17 | 4 hours |

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

---

## PART 13 — SESSION HIJACKING PROTECTION
*(Added v1.3 — Gap identified in GPT review)*

Even if JWT is stolen, critical actions must require re-authentication.

### 13.1 Session Binding
- [ ] Device fingerprint stored on login (user-agent + IP hash) — flag anomalies
- [ ] Bind session to original IP range (soft check — alert, don't hard-block due to mobile networks)

### 13.2 Re-authentication for Critical Actions
The following actions must require fresh password/MFA confirmation even with a valid session:
- [ ] Delete workspace / account
- [ ] Change billing method
- [ ] Connect / disconnect Meta / Google OAuth
- [ ] Transfer workspace ownership
- [ ] Export all data

Implementation: Clerk's `requiresReAuth` challenge flow or custom challenge-then-proceed modal.

### 13.3 Session Revocation
- [ ] "Sign out all devices" button in settings
- [ ] Automatic revocation on password change
- [ ] Log all active sessions visible to user

---

## PART 14 — SECURE DEVELOPMENT LIFECYCLE (SDL)
*(Added v1.3 — Enterprise customers will ask for this)*

### 14.1 Security Review Before Release
Every feature with user-facing data must pass:
- [ ] Threat model: what new attack surfaces does this introduce?
- [ ] Data flow check: does new data touch unprotected endpoints?
- [ ] Input validation: all inputs validated with Zod

### 14.2 Security Checklist for Every PR
Add to PR template:
```
## Security Checklist
- [ ] New endpoints require authentication?
- [ ] New DB tables have RLS enabled?
- [ ] User inputs validated with Zod?
- [ ] No secrets in code / logs?
- [ ] No new npm packages with known CVEs?
```

### 14.3 Threat Modeling for New Features
For features with: payments, OAuth, file upload, AI generation, webhooks — mandatory 15-min threat model before implementation.

---

## PART 15 — LOG REDACTION & SECRET MASKING
*(Added v1.3 — Common gap, easy to exploit)*

**Rule:** No token, API key, or Authorization header may appear in any log — not even in debug mode.

### 15.1 What Must Never Be Logged
- OAuth tokens (access_token, refresh_token)
- API keys (OPENAI_API_KEY, META_APP_SECRET, etc.)
- Authorization headers
- Cookie values
- PII (email, phone) in error logs
- Supabase URLs with embedded credentials

### 15.2 Implementation
- [ ] Add Fastify `redact` config:
  ```javascript
  const app = Fastify({
    logger: {
      redact: ['req.headers.authorization', 'req.body.token', 'req.body.access_token']
    }
  });
  ```
- [ ] Railway logs: verify no secrets visible in build or runtime logs
- [ ] Sentry (when added): enable PII scrubbing
- [ ] Never log `request.body` directly — always destructure only needed fields

---

## PART 16 — AI-SPECIFIC SECURITY
*(Added v1.3 — Critical for Vigmis as an AI product)*

### 16.1 Prompt Injection (existing)
Already partially built: `policy-classifier.ts` + intent router.

Missing:
- [ ] Explicit prompt injection patterns blocked before sending to AI: `ignore previous instructions`, `DAN`, `system:`, `<|im_start|>`
- [ ] User-supplied content wrapped in delimiters, never concatenated raw into system prompt

### 16.2 Model Abuse / Jailbreak
- [ ] Log all prompts that trigger policy-classifier (already done) + alert on burst
- [ ] Detect jailbreak attempts: score prompt, flag user, increment trust-tier violation count
- [ ] Hard limit: if user triggers ≥3 policy blocks in 24h → flag for manual review

### 16.3 Cost Explosion Attack
An attacker can craft prompts that intentionally generate maximum-length responses to inflate AI costs.

- [ ] Max input token limit per request (e.g., user message ≤ 2,000 tokens)
- [ ] Max output token per task type — already set but verify all endpoints have `maxTokens`
- [ ] Circuit breaker (already built) — verify it triggers before catastrophic cost

### 16.4 Prompt Extraction
User should not be able to extract Vigmis's system prompts.

- [ ] System prompts never returned in API responses
- [ ] AI responses scanned: if response contains "my instructions are..." or "system prompt:" → block + log

### 16.5 AI Budget Limits (per tenant)
- [ ] Soft limit: warn user when 80% of monthly AI quota reached
- [ ] Hard limit: block non-essential AI calls at 100% (circuit breaker — already built)
- [ ] Per-request cost logged to `ai_usage_monthly` (already built)

---

## PART 17 — VENDOR LOCKOUT RUNBOOKS
*(Added v1.3 — Vendor Outage covered, Vendor Ban was missing)*

### 17.1 OpenAI Account Suspended/Banned
**Trigger:** OpenAI sends suspension email or API returns 403 across all keys.
**Response:**
1. Immediately switch `ai-router/config.ts` fallback to Anthropic (change `FALLBACK_MODEL`)
2. Notify all tenants: "AI features temporarily degraded — working to restore"
3. Contact OpenAI support, provide account details
4. If >48h: provision backup account under different entity
**RPO:** <2h for partial restore (Anthropic fallback), <48h for full restore

### 17.2 Meta App Suspended
**Trigger:** Meta disables Vigmis app — all OAuth tokens become invalid.
**Response:**
1. Detect via `401 OAuthException` on Meta API calls → set `platform_tokens.meta.revoked=true`
2. Stop all Meta-related crons immediately
3. Notify affected tenants: "Meta connection requires reconnection"
4. Contact Meta Business Support with App ID `2071308000486044`
5. If >72h: evaluate interim manual management for top customers
**Note:** This kills organic posting AND paid ads for all Meta-connected tenants.

### 17.3 Google OAuth Project Disabled
**Trigger:** Google disables OAuth project `145233766699-...`
**Response:**
1. All Google OAuth tokens become invalid → detect via `invalid_grant` responses
2. Stop Google Ads and GA4 crons
3. Create new OAuth project in Google Cloud Console
4. Update env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
5. Mass-email tenants to reconnect Google

### 17.4 Supabase Instance Issues
- Covered in Part 7 (Backup & Disaster Recovery)

---

## PART 18 — DATA LIFECYCLE
*(Added v1.3 — Required for GDPR compliance)*

### 18.1 Data Map

| Data Type | Collection | Processing | Storage | Sharing | Archival | Deletion |
|-----------|-----------|-----------|---------|---------|---------|---------|
| User email/name | Signup (Clerk) | Auth only | Clerk + Supabase | None | Never archived | On account delete |
| OAuth tokens | Connect platform | Encrypt + store | Supabase Vault | Never | Never | On disconnect or account delete |
| Website content | Onboarding scrape | AI analysis → stored | client_settings | Never | Never | On account delete |
| Campaign data | Created by Vigmis | Optimization engine | campaigns table | Never | 2 years | On account delete |
| Social posts | Generated by AI | Approve → publish | social_posts | Meta/Google/TikTok API | 1 year | On account delete |
| Audit log | Every action | Immutable record | audit_log | Legal/compliance only | Permanent | Never (7-year legal hold) |
| AI conversations | Onboarding + chat | AI generation | client_settings.conversation | Never | 1 year | On account delete |
| Billing data | Paddle/Stripe webhook | Fee calculation | billing_events | Paddle/Stripe | 7 years (legal) | Never (legal obligation) |

### 18.2 Retention Periods
- **Active customer data:** retained while account active + 30 days after cancellation
- **Audit logs:** minimum 7 years (legal/forensic requirement)
- **AI usage logs:** 1 year (pricing disputes)
- **Billing records:** 7 years (tax/legal)
- **OAuth tokens:** deleted immediately on disconnect

### 18.3 Deletion Cascade
Account delete → cascade in order:
1. Revoke all OAuth tokens on platforms (best-effort)
2. Delete platform_tokens
3. Delete campaigns (pause first if active)
4. Delete social_posts, social_settings
5. Delete client_settings
6. Delete team_members, team_invites
7. Delete tenants row
8. Trigger Clerk user deletion
9. Audit log entry: `account.deleted` (retained for 7 years)
10. Email confirmation to user

**Note:** Already partially built (`DELETE /account` endpoint) — verify full cascade.

---

## PHASE 1 CODE AUDIT — EXECUTED 2026-06-06 (v1.4)

Real code audit (not doc review). Full report: `docs/SECURITY_AUDIT_PHASE1.md`.

### Architectural truth discovered
Tenant isolation is enforced **only in application code** (`.eq('tenant_id', request.tenantId)`),
not in the DB: the API runs with the Supabase **service-role key** (bypasses RLS), and every
RLS policy keyed off `current_setting('app.tenant_id')` was a **no-op** because that GUC is never
set. **Critical corollary:** the public anon key (PostgREST) could read any table that lacked RLS.

### Implemented in this pass (committed)
| Fix | File(s) |
|-----|---------|
| **RLS lockdown** — enable RLS on every `public` table + consistent tenant policy. Closes direct anon-key access; safe because the API uses service-role (bypassrls). | `supabase/migrations/045_rls_lockdown.sql` |
| **CRON_SECRET fail-closed** — removed the hardcoded `'vigmis-cron'` default from ~16 cron endpoints; central constant-time guard. | `apps/api/src/middleware/secrets.ts` + all cron routes |
| **Log redaction** — pino `redact` for secret headers + `sanitizeUrl()` strips `token/code/access_token/secret/state/hmac/…` from logged URLs. | `apps/api/src/server.ts`, `middleware/error-handler.ts` |
| **Security headers** — API `onSend` hook + Next.js `headers()` (HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP). | `apps/api/src/server.ts`, `apps/web/next.config.ts` |
| **Webhook HMAC over raw body** — content-type parser captures `req.rawBody`; Shopify + Paddle now verify the exact signed bytes (was re-serialized JSON). | `apps/api/src/server.ts`, `routes/tracking.ts`, `billing/paddle.ts` |
| **Constant-time secret compare** — `safeEqual()` for admin / Instatus / Shopify / cron. Instatus webhook now fails closed. | `middleware/secrets.ts`, `routes/{admin,webhooks,tracking}.ts` |
| **DB client hardening** — server uses service-role explicitly; browser guard forbids service-role; `persistSession:false`. | `packages/db/src/client.ts` |
| **Prompt-injection containment** — neutralize `[ACTION:…]` tags in untrusted text (user msg, history, scraped page context); only the model's fresh output may carry executable tags. Also already tenant-scoped. | `apps/api/src/routes/chat.ts` |

### Verified already-correct
- OAuth tokens encrypted (AES-256-GCM, random IV + tag) before every DB write. ✅
- No cross-tenant leak in any audited route (verify-then-act on `tenant_id`). ✅

### Status vs plan (updated)
| Area | State after v1.4 | Remaining gap |
|------|------------------|---------------|
| Authentication | Clerk | MFA not mandatory, no passkeys |
| OAuth token storage | ✅ AES-256-GCM encrypted | Add key-version prefix for rotation |
| RLS | ✅ Lockdown migration written (run it) | Wire `SET LOCAL app.tenant_id` if moving off service-role |
| Security headers | ✅ API + web | Add tuned CSP (Clerk-compatible) |
| Secret handling | ✅ fail-closed, constant-time, redacted logs | — |
| Webhooks | ✅ raw-body HMAC, fail-closed | — |
| Rate limiting | Global 100/min | Per-route limits on auth/webhooks |
| Backups | Supabase default (7 days) | PITR + cold storage |
| Privacy / cookie consent | Basic /privacy page | Full GDPR consent flow |
| Monitoring | Vercel + Instatus | Sentry + alerts |
| Penetration testing | Never done | Plan Q3 2026 |

### REQUIRED env actions (or things break / stay exposed)
1. **Run** `supabase/migrations/045_rls_lockdown.sql` (needs `sbp_` token).
2. Set a strong **`CRON_SECRET`** in Railway and update the scheduler to send it — else all crons 401.
3. Set **`INSTATUS_WEBHOOK_SECRET`**, **`PADDLE_WEBHOOK_SECRET`**, **`TOKEN_ENCRYPTION_KEY`** (64 hex), **`ADMIN_SECRET`**.
4. Confirm **`SUPABASE_SERVICE_ROLE_KEY`** is set for the API and **never** exposed as `NEXT_PUBLIC_*`.
