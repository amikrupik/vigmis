# Vigmis — Phase 1 Security Audit (code-level)

Date: 2026-06-06 · Auditor: Claude Opus 4.8 · Scope: actual code, not the plan doc.
Repo: `C:\vigmis\vigmis-main` (monorepo: `apps/api`, `apps/web`, `packages/*`).

---

## TL;DR — the architectural truth

**Tenant isolation is enforced 100% in application code, not in the database.**

- `packages/db/src/client.ts` builds a single Supabase client from
  `NEXT_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY`. The API runs with the
  **service-role key**, which **bypasses RLS entirely**.
- Every RLS policy in `supabase/migrations/` is written as
  `USING (tenant_id = current_setting('app.tenant_id', true)::uuid)` — but **nothing in the
  codebase ever sets `app.tenant_id`** (verified: zero `set_config` / `SET app.tenant_id`).
  A second style uses `auth.uid()`, which is also always NULL because auth is Clerk, not
  Supabase Auth.
- **Net effect:** the RLS policies are dead. They provide *no* protection today. The only
  thing standing between tenant A and tenant B's data is the `.eq('tenant_id', request.tenantId)`
  filter in each route.

The good news: **that application-layer filtering is consistent and correct** across the routes
audited (verify-then-act pattern everywhere). The bad news: there is **no defense-in-depth** — a
single missing `.eq('tenant_id', …)` in a future route = full cross-tenant breach, with nothing
to catch it.

---

## Item-by-item

### 1. RLS Audit
- **Current state:** RLS enabled on most tenant tables, but policies depend on
  `current_setting('app.tenant_id')` which is never set → policies evaluate to NULL → no-op.
  API uses service-role → RLS bypassed regardless. Some tables (e.g. `audit_log`, `platform_tokens`,
  `tenants`, `team_members`) have **no policy at all**.
- **CRITICAL corollary:** the Supabase anon key is public (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).
  Any `public` table **without RLS enabled** is reachable directly via PostgREST with that public
  key — bypassing the Vigmis API entirely. Several tables (`platform_tokens`, `client_settings`,
  `audit_log`, `tenants`, `team_members`, …) had no RLS. This is a potential data-exposure hole,
  not just a missing defense-in-depth layer.
- **Verdict:** was non-functional / exposed. **FIXED** via `supabase/migrations/045_rls_lockdown.sql`.
- **Fix applied:** migration enables RLS on **every** public table + adds a consistent
  `tenant_isolation_all` policy where `tenant_id` exists. Safe for the running app because the API
  uses the service-role key (bypasses RLS); it only closes the anon-key door. Fully idempotent.
  **Must be run** against the live DB (needs the `sbp_` token).
- **Follow-up:** to make RLS *actively* enforce (not just deny anon), move per-request reads to a
  client that runs `SET LOCAL app.tenant_id` — then the `current_setting` policies engage.

### 2. Cross-tenant test
- **Current state:** Audited all `:id` routes (campaigns, social, protocols, optimization,
  policy, explainability, creatives, assets, comments, operational, billing). **Every one** uses
  the safe pattern: `.eq('id', id).eq('tenant_id', request.tenantId)` to verify ownership before
  acting. No route trusts a client-supplied `tenant_id`. `request.tenantId` comes only from the
  verified Clerk JWT (`apps/api/src/middleware/auth.ts`).
- **Verdict:** ✅ No cross-tenant data leak found in the current routes.
- **Fix:** none required now; add the CI lint above so it stays true.

### 3. OAuth token storage
- **Current state:** ✅ All token writes encrypt first:
  `packages/ad-connectors/src/{google,meta,tiktok}/auth.ts` call `encryptToken(...)` on
  `access_token`/`refresh_token` before the `platform_tokens` upsert. Reads decrypt via
  `decryptToken`. Crypto (`packages/db/src/crypto.ts`) is correct AES-256-GCM with a random
  12-byte IV per encryption + auth tag.
- **Verdict:** ✅ Solid.
- **Follow-up (low):** no key-rotation/versioning scheme — a `v1:` prefix on the ciphertext
  would make future key rotation possible.

### 4. Log redaction  — **FIXED**
- **Was:** `Fastify({ logger: true })` (default pino). The request serializer logs `req.url`
  **including the query string**, and there's a `?token=` auth fallback + OAuth `?code=`/`?state=`
  callbacks → access tokens and OAuth codes were landing in logs. No header redaction.
- **Fixed in `apps/api/src/server.ts` + `apps/api/src/middleware/secrets.ts`:**
  - pino `redact` for `authorization`, `cookie`, `x-admin-secret`, `x-cron-secret`,
    `x-shopify-hmac-sha256`, `paddle-signature` headers.
  - custom `req` serializer routes the URL through `sanitizeUrl()` which strips
    `token/code/access_token/refresh_token/secret/state/hmac/signature/key/password=` values.
  - `error-handler.ts` now logs `sanitizeUrl(request.url)` too.

### 5. Security headers — **FIXED**
- **Was:** `apps/web/next.config.ts` was empty (`{}`); API set no headers.
- **Fixed:**
  - `apps/web/next.config.ts`: `headers()` adds `X-Content-Type-Options`, `X-Frame-Options: DENY`,
    `Referrer-Policy`, HSTS (2y, preload), `Permissions-Policy`, `X-DNS-Prefetch-Control`.
  - `apps/api/src/server.ts`: `onSend` hook sets the same security headers + `Cross-Origin-*`
    and removes `X-Powered-By`.
  - **CSP deliberately omitted** — needs tuning against Clerk before enabling. Tracked follow-up.

### 6. Prompt injection
- **Current state:** `apps/api/src/routes/chat.ts` parses the model's *free-text output* for
  `[ACTION:...]` tags and executes them (pause/resume campaigns, create/publish posts, set ad
  account, etc.). This is a confused-deputy surface. **However**, every action handler re-scopes to
  `tenantId` and verifies ownership before acting, so the blast radius is bounded to the user's own
  tenant — a user can only ever affect their own resources, which they could do via the normal UI
  anyway.
- **Verdict:** tenant-bounded; **hardened** in this pass.
- **Fix applied (`apps/api/src/routes/chat.ts`):** `neutralizeActionTags()` rewrites any `[ACTION:…]`
  syntax found in **untrusted** text — the incoming user message, replayed chat history, and scraped
  page context — so only the model's freshly-generated output can carry an executable tag. A user (or
  injected web/comment content) can no longer smuggle a tag into the model's context to be echoed back.
- **Follow-up (recommended):** switch from free-text `[ACTION:…]` parsing to provider tool-calling
  with a strict schema, so actions are structurally separated from narrative.

---

## Extra findings (beyond the 6) — fixed in this pass

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| A | `CRON_SECRET` had a hardcoded public fallback `'vigmis-cron'` in ~16 cron endpoints (billing invoicing across all tenants, notifications, syncs, optimization). Anyone knowing the literal could trigger them. | **HIGH** | **FIXED** — central `assertCronSecret`/`hasValidCronSecret` in `middleware/secrets.ts`, fails closed if `CRON_SECRET` unset, constant-time compare. All call sites + the internal self-call now use it. |
| B | Webhook HMAC (Shopify, Paddle) verified against `JSON.stringify(request.body)`, not the raw signed bytes → real webhooks fail / temptation to weaken. | **MED** | **FIXED** — global `application/json` content-type parser captures `req.rawBody`; Shopify + Paddle now verify the true bytes. |
| C | Shopify HMAC used `timingSafeEqual` on raw buffers → throws 500 on length mismatch. | LOW | **FIXED** — `safeEqual()` is length-safe + constant-time. |
| D | Admin-secret compare was non-constant-time (`!==`). | LOW | **FIXED** — `safeEqual()`. |
| E | Instatus webhook failed **open** when `INSTATUS_WEBHOOK_SECRET` unset. | LOW | **FIXED** — fails closed. |

## Extra findings — now fixed

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| F | RLS missing on tenant tables → public anon key could read data directly via PostgREST. | **HIGH** | **FIXED** — `supabase/migrations/045_rls_lockdown.sql` (must be run). Safe (service-role bypasses). |
| G | `db` client key precedence `ANON \|\| SERVICE_ROLE` was ambiguous; could break the API or risk service-role exposure. | MED | **FIXED** — `packages/db/src/client.ts`: server uses service-role explicitly, browser is anon-only with a hard guard. Proven safe (web imports types only). |

## Extra findings — documented, NOT auto-fixed (low risk / need infra)

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| H | `?token=` query-param auth fallback in `middleware/auth.ts` — tokens end up in browser history / Referer. | LOW (logs now sanitized) | Use short-lived, single-use tokens for the redirect-init flow only. |
| I | OAuth CSRF `state` stored in an in-memory `Map` (`connectors.ts`) — lost on restart, broken across multiple Railway instances. | LOW | Move to DB/Redis with TTL. |
| J | Global rate limit only (100/min). | LOW | Add stricter per-route limits on `/auth/*` and webhooks. |

---

## ACTION REQUIRED by you (env) before/after deploy
Because cron auth now **fails closed**:
1. Ensure `CRON_SECRET` is set in **Railway** (API) to a strong random value (not `vigmis-cron`).
2. Update whatever triggers the crons (Railway cron / scheduler / GitHub Action) to send the
   **same** value in the `x-cron-secret` header. If `CRON_SECRET` is unset, **all crons return 401**.
3. Set `INSTATUS_WEBHOOK_SECRET` (else the Instatus webhook returns 401).
4. Confirm Shopify/Paddle webhooks still verify after the raw-body change (they should now verify
   *correctly* for the first time).
