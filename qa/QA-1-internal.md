# QA-1 — Internal Technical Checks
> Run by Claude (or CI) before any release. Each item has a pass/fail verdict and a fix path.

---

## BLOCK A — Build & Type Safety

| # | Check | Command | Pass Condition |
|---|-------|---------|---------------|
| A1 | Monorepo builds clean | `pnpm turbo build` | Exit 0, no red errors |
| A2 | TypeScript: web app | `pnpm --filter web tsc --noEmit` | 0 type errors |
| A3 | TypeScript: api | `pnpm --filter api tsc --noEmit` | 0 type errors |
| A4 | TypeScript: db package | `pnpm --filter @vigmis/db tsc --noEmit` | 0 type errors |
| A5 | TypeScript: ad-connectors | `pnpm --filter @vigmis/ad-connectors tsc --noEmit` | 0 type errors |
| A6 | Lint: web | `pnpm --filter web lint` | 0 errors (warnings OK) |
| A7 | Lint: api | `pnpm --filter api lint` | 0 errors |
| A8 | No console.log in prod code | `grep -r "console\.log" apps/ --include="*.ts" --include="*.tsx" -l` | List is empty or only dev files |

---

## BLOCK B — Database Schema Integrity

| # | Check | How | Pass Condition |
|---|-------|-----|---------------|
| B1 | All migrations parse without error | Run each `.sql` file through `psql --dry-run` or Supabase CLI | No SQL syntax errors |
| B2 | Foreign keys are consistent | Read each migration: every FK references an existing table | No dangling references |
| B3 | RLS is enabled on every tenant-scoped table | `SELECT tablename FROM pg_tables WHERE schemaname='public'` + check RLS policies | Every table with `tenant_id` has an RLS policy |
| B4 | `ai_usage_monthly` has unique index on (tenant_id, year_month) | Check migration 037+ | Duplicate month inserts blocked |
| B5 | `platform_tokens.token_encrypted` is NOT NULL on save | Check `crypto.ts` encrypt path | Plaintext never written |
| B6 | `approval_snapshots` table is insert-only (no UPDATE/DELETE policy) | Check RLS policies | Immutability enforced |
| B7 | `audit_log` row count grows on every state change | Trigger test action → count rows | +1 row per action |

---

## BLOCK C — API Server Health

| # | Check | Request | Pass Condition |
|---|-------|---------|---------------|
| C1 | Server starts | `pnpm --filter api dev` | Fastify listens on port 3001 |
| C2 | Health endpoint | `GET /health` | `{"ok":true}` |
| C3 | Unauthenticated request blocked | `GET /api/campaigns` (no JWT) | 401 Unauthorized |
| C4 | Invalid JWT blocked | `GET /api/campaigns` (bad token) | 401 |
| C5 | Onboarding route reachable | `POST /api/onboarding` (valid JWT, empty body) | 400 validation error (not 500) |
| C6 | Chat route reachable | `POST /api/chat` (valid JWT) | 200 or quota-related response |
| C7 | Billing route reachable | `GET /api/billing/usage` | 200 with usage object |
| C8 | Social route reachable | `GET /api/social/posts` | 200 with array |
| C9 | Comments route reachable | `GET /api/social/comments` | 200 with array |
| C10 | No route returns 500 on empty DB | All GET routes for fresh tenant | 200 + empty arrays, not 500 |

---

## BLOCK D — Cron Jobs (24 jobs)

For each cron, call `POST /api/cron/<name>` with header `Authorization: Bearer <CRON_SECRET>`.

| # | Cron | Pass Condition | Failure Mode to Watch |
|---|------|---------------|-----------------------|
| D1 | `briefings` | 200, no exception | OpenAI key missing → graceful skip |
| D2 | `comments-crisis` | 200, returns crisis count | False positives → check threshold |
| D3 | `comments-digest` | 200, digest created | Empty if no comments OK |
| D4 | `comments-insights` | 200, sentiment scored | AI cost tracking increments |
| D5 | `comments-priority` | 200, priority scores updated | No division-by-zero |
| D6 | `daily-report` | 200, report row inserted | GA4 not connected = partial OK |
| D7 | `digest` | 200 | |
| D8 | `expire-protocols` | 200, expired protocols count ≥ 0 | |
| D9 | `ga4-sync` | 200 or skip-without-error if GA4 not configured | Not 500 |
| D10 | `geo-refresh` | 200 | |
| D11 | `invoice` | 200, invoice row inserted for active tenants | Amount = 0 for free tier OK |
| D12 | `monthly-report` | 200 | |
| D13 | `news-scan` | 200 | No crash if news API unavailable |
| D14 | `optimize` | 200, optimization log entry created | No live platform calls in test |
| D15 | `optimize-pro` | 200, only runs for pro tenants | Free tenant = skip |
| D16 | `reattestation` | 200, re-attestation triggered for overdue tenants | |
| D17 | `shopify-sync` | 200 or skip-without-error if not connected | Not 500 |
| D18 | `social-analytics` | 200, analytics rows updated | Not connected = skip |
| D19 | `social-comments` | 200, new comments fetched | Rate limit handled gracefully |
| D20 | `social-publish` | 200, approved posts published | Unapproved = no action |
| D21 | `social-weekly` | 200, draft posts created for next 7 days | Only if social settings exist |
| D22 | `stop-loss` | 200, no campaigns wrongly paused | Threshold check logic |
| D23 | `trust-recompute` | 200, trust_tier updated | |
| D24 | `weather` | 200 or skip if weather API unavailable | |

**Cron auth test:** Call each cron with wrong secret → 401.

---

## BLOCK E — Authentication & Authorization

| # | Check | How | Pass Condition |
|---|-------|-----|---------------|
| E1 | Sign-up creates Clerk user + Supabase row | Sign up → check both systems | User exists in both |
| E2 | Clerk webhook creates tenant row | Clerk `user.created` webhook | `tenants` row inserted |
| E3 | JWT from Clerk is valid in API | Use Clerk dev JWT → API call | 200 (not 401) |
| E4 | Tenant isolation: tenant A can't read tenant B's data | Two accounts, cross-tenant GET | 403 or empty result |
| E5 | Admin-only routes require admin flag | `GET /api/admin/freeze` without admin | 403 |
| E6 | Paddle webhook verifies signature | POST with bad signature | 400 |
| E7 | Session expiry handled | Use expired JWT | 401, not 500 |

---

## BLOCK F — Quota & Billing Logic

| # | Check | How | Pass Condition |
|---|-------|-----|---------------|
| F1 | Free plan: chat cap enforced | Insert 50+ chat rows → send new message | 429 or degraded response |
| F2 | Free plan: comment cap enforced | Insert 200+ comment rows → cron run | Comments stop being processed |
| F3 | Circuit breaker: degrade state | Set `breaker_state = 'degrade'` → chat | Simplified response returned |
| F4 | Circuit breaker: freeze state | Set `breaker_state = 'freeze'` → chat | Hard block, user informed |
| F5 | Pro plan: higher limits | Pro tenant, send 200 messages | No block until pro limit |
| F6 | Invoice calculation | Set `managed_spend_usd = 1000`, 6% fee | Invoice = $60 + subscription |
| F7 | Free plan invoice = $0 if no spend | Free tenant, no managed spend | Invoice total = 0 |
| F8 | Usage API returns correct values | `GET /api/billing/usage` | Matches `ai_usage_monthly` row |

---

## BLOCK G — AI & Content Services

| # | Check | How | Pass Condition |
|---|-------|-----|---------------|
| G1 | Chat generates response | POST chat message | Response in <10s, not empty |
| G2 | Intent router classifies correctly | Send "pause my campaign" → chat | Action tag present in response |
| G3 | Action execution: pause campaign | Chat: "pause campaign X" | Campaign status → paused |
| G4 | Policy classifier blocks prohibited content | POST policy-check with test phrase | Policy violation returned |
| G5 | Post generation uses brand voice | Generate post for tenant with brand_voice set | Post reflects voice settings |
| G6 | Comment sentiment classification | Insert raw comment → run insights cron | Sentiment field populated |
| G7 | High-stakes detector fires on crisis terms | Insert comment with crisis keywords | `high_stakes_detector` row inserted |
| G8 | AI disclosure on AI-generated posts | Generate post → check output | Disclosure tag present |
| G9 | OpenAI key missing → graceful degradation | Remove key → run chat | Error message, not 500 crash |

---

## BLOCK H — Ad Platform Connectors

| # | Check | How | Pass Condition |
|---|-------|-----|---------------|
| H1 | Google OAuth URL generated | `GET /api/connectors/google/auth-url` | Valid OAuth URL returned |
| H2 | Meta OAuth URL generated | `GET /api/connectors/meta/auth-url` | Valid OAuth URL returned |
| H3 | TikTok OAuth URL generated | `GET /api/connectors/tiktok/auth-url` | Valid OAuth URL returned |
| H4 | Token encrypted on save | Connect platform → check DB | `token_encrypted` has value, not plaintext |
| H5 | Disconnected platform returns clear error | API call with disconnected platform | 400/409 "not connected", not 500 |
| H6 | Expired token detected | Set expired token in DB → API call | Re-auth requested to user |

---

## BLOCK I — Social Media

| # | Check | How | Pass Condition |
|---|-------|-----|---------------|
| I1 | Weekly post generation creates 7 drafts | `POST /api/cron/social-weekly` | 7 `social_posts` rows in `draft` status |
| I2 | Post approval flow | Create draft → approve via API | Status → `approved` |
| I3 | Post rejection flow | Create draft → reject | Status → `rejected` |
| I4 | Publish cron only publishes approved posts | Mix of approved+draft → cron | Only approved ones published |
| I5 | Cooling-off respected | 2 posts in same hour → second blocked | `publish_cooling_off` enforced |
| I6 | Comments fetched and stored | Run `social-comments` cron | New rows in `social_comments` |
| I7 | Reply sent to platform | `POST /api/social/comments/:id/reply` | Platform API called (mocked OK) |

---

## BLOCK J — Security

| # | Check | How | Pass Condition |
|---|-------|-----|---------------|
| J1 | SQL injection: API inputs sanitized | Send `'; DROP TABLE users;--` in name field | No DB error, input rejected |
| J2 | XSS: HTML in post content escaped | Generate post with `<script>` content | Content escaped in response |
| J3 | CRON_SECRET required for all crons | Call cron without secret | 401 |
| J4 | SERVICE_ROLE_KEY not exposed to frontend | Check Next.js env config | Key not in `NEXT_PUBLIC_*` |
| J5 | No sensitive keys in build output | `grep -r "sk-" .next/` | No API keys in build |
| J6 | Rate limiting on chat | 100 req/min → 429 | Rate limit triggers |
| J7 | Audit log written for all mutations | Any state-changing API call | Row in `audit_log` |

---

## BLOCK K — Frontend Smoke Tests

| # | Page | Check | Pass Condition |
|---|------|-------|---------------|
| K1 | `/sign-in` | Renders without error | No console errors |
| K2 | `/sign-up` | Renders without error | No console errors |
| K3 | `/onboarding` | Redirects unauthenticated | → sign-in |
| K4 | `/dashboard` | Loads for authed user | Campaign list visible |
| K5 | `/billing` | Shows plan + usage | Plan badge visible |
| K6 | `/profile` | User data loaded | Name/email visible |
| K7 | `/admin/freeze` | Blocked for non-admin | 403 page |
| K8 | Public pages | All load without auth | `/about`, `/faq`, `/terms`, `/privacy` |
| K9 | Social inbox page | Comments visible | Count + sentiment badges |
| K10 | Mobile viewport | No broken layout | Responsive at 375px |

---

## BLOCK L — Regression Canaries
Specific bugs that were fixed — re-test each release.

| # | Regression | Test |
|---|-----------|------|
| L1 | `middleware.ts` + `proxy.ts` coexist → build breaks | Run `pnpm turbo build` — must pass |
| L2 | Free user above quota not blocked | Set usage over cap → next chat must degrade |
| L3 | Invoice generated with wrong fee % | Verify invoice = spend × correct percentage |
| L4 | Social post published twice (cooling-off bypass) | Two rapid publish calls → second blocked |
| L5 | AI disclosure missing on generated content | Generate post → check for disclosure marker |

---

## SCORING

| Blocks passed | Verdict |
|--------------|---------|
| A–C + E all pass | Minimum viable deploy |
| + D + F | Billing & crons ready |
| + G–I | AI + social features ready |
| + J + K + L | Full release candidate |
