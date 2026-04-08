# Vigmis — Development Log

> This file is updated after every work session.
> Purpose: never repeat mistakes, always know where we are.

---

## How to use this log

After each session, add an entry:
- What we built
- What worked
- What didn't work and why
- Decisions made and why
- What's next

---

## Current Status

**Phase:** Pre-development / planning aligned to Vigmis documents
**Week:** 0
**Last updated:** 2026-04-04

### What exists right now
- [ ] Codebase: nothing yet
- [ ] Infrastructure: nothing yet
- [x] Documents: FEATURES.md, ARCHITECTURE.md, LOG.md
- [x] Product definition validated against Vigmis docs
- [x] MVP scope confirmed: Google + Meta full workflow
- [x] Root workspace identified: c:\vigmis\vigmis-main

### Active decisions
| Decision | Choice | Reason |
|----------|--------|--------|
| Monorepo tool | Turborepo | Simple, fast, works with Next.js |
| Frontend | Next.js 14 | SSR, great DX, Vercel deploy |
| Backend | Node.js + TypeScript + Fastify | Typed, fast, familiar |
| DB | PostgreSQL via Supabase | Managed, free tier, row-level security |
| Auth | Clerk | Multi-tenant OAuth out of the box |
| Billing | Stripe | Industry standard |
| Hosting (start) | Railway + Vercel | Zero DevOps, instant |
| AI (start) | OpenAI (GPT-4o + DALL-E) | Most capable, well-documented APIs |
| AI router | Custom router for GPT/Claude/Gemini | To choose best AI tool per task, build trust with multiple providers |
| Workspace root | c:\vigmis\vigmis-main | Documents and source are there |

---

## Session 3: 2026-04-04 — AI Router Decision

### What we built
- Updated VIGMIS_SPEC.md with AI router details
- Updated WORKPLAN.md with AI router task in Stage 1
- Updated LOG.md with new decision

### What worked
- Documents updated successfully

### What didn't work and why
- N/A

### Decisions made and why
- Added AI router as core feature: Vigmis will choose the best AI tool (GPT, Claude, Gemini) per task to build trust with customers by using multiple providers. Currently registered to GPT, will register to others later.

### What's next
- Continue with Stage 1: fix dev server, complete AI router, test auth flow

---

## Session Log

---

### Session 4 — 2026-04-05 — Stage 2: Ad Connections + Onboarding

**What we built:**
- `docs/DECISIONS.md` — all product + architecture decisions documented (D-001 to D-006)
- `supabase/migrations/001_initial_schema.sql` — full DB schema: tenants, client_settings, platform_tokens, audit_log, approval_requests
- `packages/db/src/types.ts` — TypeScript types mirroring the schema
- `packages/db/src/crypto.ts` — AES-256-GCM token encryption/decryption
- `packages/ad-connectors/` — new package: interface + Google OAuth + Meta OAuth (full flow: auth URL → callback → token storage → refresh → validate)
- `apps/api/src/middleware/auth.ts` — Clerk JWT verification, auto-creates tenant row
- `apps/api/src/middleware/error-handler.ts` — centralised error responses
- `apps/api/src/routes/onboarding.ts` — POST /onboarding/settings, GET /onboarding/status
- `apps/api/src/routes/connectors.ts` — GET /auth/google, /auth/google/callback, /auth/meta, /auth/meta/callback, /auth/status
- `packages/ai-router/src/providers/anthropic.ts` — Claude Sonnet + Haiku provider
- `packages/ai-router/src/config.ts` — updated routing: Claude for analysis/seo/optimization/reports, GPT for copywriting/research
- `packages/ai-router/src/router.ts` — fallback logic when provider fails
- `apps/web/app/onboarding/page.tsx` — protected onboarding page
- `apps/web/app/onboarding/OnboardingPageClient.tsx` — connect step + saving state
- `apps/web/app/onboarding/actions.ts` — Server Action: AI conversation with Claude, topic tracking, summary extraction
- `apps/web/app/components/OnboardingChat.tsx` — chat UI with voice input (Web Speech API)

**What worked:**
- Full OAuth flow for both Google and Meta implemented to spec
- AI onboarding as conversation (not a form) — Claude covers 5 required topics dynamically
- Voice input with Web Speech API — no extra service needed
- AES-256-GCM token encryption — no plaintext tokens ever reach the DB
- Removed @fastify/jwt (unused, had critical vulns) → 0 vulnerabilities

**Decisions made:**
- Onboarding = AI conversation agent, not a form (D-001)
- Claude for analysis/reasoning, GPT for writing (D-002)
- 3 risk levels for approval gate (D-003)
- AES-256-GCM for token encryption (D-004)
- API enforces multi-tenancy, not Supabase RLS alone (D-005)
- AI mirrors client's language (D-006)

**What's next — Stage 3:**
- Run the DB migration in Supabase dashboard
- Fill in env vars: ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, TOKEN_ENCRYPTION_KEY
- Apply for Google Ads API developer token + Meta Marketing API access (takes days/weeks)
- Build: website analysis, market research, recommendation report, approval gate UI

---

### Session 2 — 2026-04-04
**What we did:**
- זיהינו את מבנה המסמכים המקוריים בתיקיית `c:\vigmis\vigmis-main/docs`
- קראנו את `FEATURES.md`, `ARCHITECTURE.md`, ו־`LOG.md`
- אימתנו שה־MVP חייב לכלול Google + Meta מלאים
- הבנו שהמוצר הוא Marketing OS, לא רק מנהל מודעות
- אישרנו את הצורך בעבודה מהספריה ההורית ובסימון כל החלטה ולוג זיכרון
- תכננו את צ'אנק היישום הבא: שלד מערכת, connectors, AI Router, safety, approval flow

**What worked:**
- זיהינו נכון את היקף ה־MVP והצטיידנו בהבנה נכונה של הפרויקט
- יצרנו תיעוד והבשלנו את התוכנית למימוש מעשי
- נכנסנו לניתוח ארכיטקטוני ולא רק לשאט-קוד

**What didn't work:**
- עדיין לא קיימת תשתית קוד מוכנה ב־`vigmis` או בשורש
- השרת המקומי לא חזר לסטטוס ריצה תקין, אך זה כעת משני תהליך התכנון

**Decisions made:**
- העליון של הפרויקט הוא Marketing OS, לא רק כלי פרסום
- ה־MVP הראשון יהיה Google + Meta, לא Google בלבד
- יישום חייב להיות modular, connector-based ו־AI-router-ready
- יש לשמור כל החלטה ב־`docs/LOG.md` ובזיכרון סשן
- יש להתחיל מהספריה `c:\vigmis\vigmis-main`

**Open questions:**
- האם יש מסמכים נוספים בתיקיית האב שצריך לשלב בתכנון?
- האם נדרש כבר כעת לקבוע מבנה `apps/api` ו־`packages` לפי ARCHITECTURE.md?

**Next session:**
- לסרוק את תכולת הספריה ההורית במלואה
- לתכנן את מבנה הפרויקט המדויק לפי ARCHITECTURE.md
- ליצור scaffold ראשוני של המערכת כולל connectors ו־job flow
- להקים לוג זיכרון פנימי נוסף בסשן

---

### Session 1 — 2026-04-03
**What we did:**
- קראנו את כל המסמכים המקוריים (כולל קבצי וורד)
- בנינו תכנית מוצר ושלבים מלאה
- קיבלנו את המלצות גיפיטי והשווינו
- סיכמנו מודל תמחור סופי
- הגדרנו שיטת בדיקות בשלושה שלבים
- הקמנו מערכת זיכרון ולוגים

**החלטות שהתקבלו:**
- מוצר: מערכת הפעלה שיווקית — זרימה מלאה לא רק לוח בקרה
- שלב א: גוגל + מטא מלאים (כולל סריקה, מחקר, דוח, הצעה, אישור, הפעלה, אופטימיזציה)
- שלב ב: טיקטוק + קריאייטיב
- אתרי לקוחות: המלצות בלבד, אין נגיעה אוטומטית
- תמחור: 15 סנט לקליק (חינמי) / 12 סנט + 15 דולר לחודש (פרו)
- הרשמה חינמית, חיוב מהקמפיין הראשון
- לקוחות בטא לפי סדר: לא פעיל → קטן → גדול
- לוח זמנים: 3 חודשים לגרסה ראשונה

**מה הבא:**
- פתיחת חשבונות: גיטהאב, מסד נתונים מנוהל, שירות אימות, ריילוויי, ורסל, תשלומים
- הגשת בקשות לממשקי תכנות: גוגל אדס, מטא (לוקח שבועות לאישור)
- שלב אפס: בניית תשתית מקומית

---

### Session 0 — 2026-04-02
**What we did:**
- Read all 3 original Vigmis documents
- Defined project scope, phases, costs, timeline
- Created FEATURES.md, ARCHITECTURE.md, LOG.md

**Decisions made:**
- Start local development, deploy to Railway for staging
- Use Turborepo monorepo structure
- Build AI Router as swappable abstraction from day 1
- i18n from day 1 (separate language JSON files)
- All providers (AI, storage, email) behind interfaces

**Nothing failed yet** (pre-code)

**Next session:** Scaffold the monorepo — package.json, folder structure, Docker Compose, env files

---

<!-- TEMPLATE FOR NEW SESSIONS:

### Session N — YYYY-MM-DD
**What we did:**
-

**What worked:**
-

**What didn't work:**
- [issue]: [what we tried] → [root cause] → [fix]

**Decisions made:**
-

**Open questions:**
-

**Next session:**
-

-->

---

## Known Issues & Resolutions

| Date | Issue | Root Cause | Fix | Status |
|------|-------|-----------|-----|--------|
| — | — | — | — | — |

---

## API Keys & Credentials Needed

> Never store actual values here. Store in .env files.

| Service | Where to get | Notes |
|---------|-------------|-------|
| OpenAI | platform.openai.com | Need GPT-4o + DALL-E access |
| Google Ads API | developers.google.com/google-ads | Need developer token (takes ~1 week approval) |
| Meta Marketing API | developers.facebook.com | Need Business Manager access |
| TikTok Business API | business-api.tiktok.com | Need partner account |
| Stripe | dashboard.stripe.com | Need to verify business |
| SerpAPI | serpapi.com | Keyword + competitor research |
| Clerk (Auth) | clerk.com | Free tier covers MVP |
| Supabase | supabase.com | Free tier covers MVP |
| Railway | railway.app | Free tier → Pro when needed |

---

## Architecture Decisions Record (ADR)

### ADR-001: Local-first development
**Date:** 2026-04-02
**Decision:** Develop locally with Docker Compose, deploy to Railway for staging.
**Reason:** Faster iteration, no cloud costs during dev. Railway mirrors production closely enough.
**Consequence:** Need Docker installed locally. Will migrate to GCP when scale demands it.

### ADR-002: AI Router abstraction
**Date:** 2026-04-02
**Decision:** All AI calls go through `packages/ai-router`, never directly to OpenAI/Claude SDK.
**Reason:** AI landscape changes monthly. Must be able to swap models in 10 minutes.
**Consequence:** Small overhead per AI call. Worth it for flexibility.

### ADR-003: Provider interfaces for all external services
**Date:** 2026-04-02
**Decision:** Storage, email, billing all have an interface + multiple implementations.
**Reason:** Avoid lock-in. Stripe could be replaced, GCS could be replaced.
**Consequence:** Slightly more boilerplate up front. Saves refactors later.

### ADR-004: i18n from day 1
**Date:** 2026-04-02
**Decision:** All UI strings in `packages/i18n/[lang].json`. No hardcoded strings in components.
**Reason:** Adding a language later is near-impossible if strings are scattered in code.
**Consequence:** Small discipline overhead. Adding a new language = translate one JSON file.
