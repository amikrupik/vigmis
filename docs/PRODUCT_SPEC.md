# Vigmis — Product Specification

**Version:** 1.0 MVP  
**Last updated:** 2026-04-11  
**Language:** English (system), Hebrew (user-facing optional)

---

## What Is Vigmis?

Vigmis is an AI-powered advertising manager that runs Google, Meta, and TikTok campaigns autonomously. It handles strategy, creative production, budget management, and optimization — so business owners don't need to know anything about advertising.

**Core positioning:** Not a tool. An AI manager that works for you 24/7.

**Target market:** Global — adapts automatically to any territory (currency, holidays, cultural tone, CPC benchmarks).

---

## Architecture

```
User (browser)
  ↓
Next.js (Vercel) — web app
  ↓ server actions
Fastify API (Railway) — business logic + AI
  ↓
Supabase — database + storage
Clerk — authentication
Stripe — billing
AI providers — OpenAI / Anthropic / Gemini (via ai-router)
Ad platforms — Google Ads / Meta Ads / TikTok Ads
Video providers — HeyGen / Kling AI / Pika Labs
Alerts — Twilio (WhatsApp) / SendGrid (email)
```

---

## User Flow

### Onboarding (new user)
1. **Sign up** (Clerk)
2. **Connect platforms** — Google Ads, Meta Ads (TikTok coming)
3. **Interview** — AI chat collects: website, budget, goal, geography, exclusions, notes
4. **Analysis** — AI scans website + researches market + builds strategy
5. **Strategy review** — user sees platform allocation, can request changes
6. **Creative** — choose video type (Avatar $15 / Cinematic $12 / Animation $8), upload own, or skip
7. **Launch** — campaigns created on connected platforms

### Returning user → Dashboard
Overview → Analytics → Campaigns → Creative → Intelligence → Settings

---

## Features — Complete List

### 1. Onboarding & AI Interview
- Conversational AI intake (supports English + Hebrew)
- Covers 7 topics: website, budget, management %, goal, geography, exclusions, notes
- Live topic progress tracker
- Website scanning during analysis
- AI market research (competitors, CPC, audience insights)
- Strategy generation with platform allocation
- Strategy feedback loop — request changes before approving
- Saving to DB on confirmation

### 2. Campaign Management
- **Launch** — creates campaigns on Google / Meta / TikTok from strategy plan
- **List** — all campaigns with status, platform, budget, errors
- **Pause / Resume** — per-campaign control
- Platform support: Google (search, display, PMax), Meta (conversion, awareness, traffic), TikTok (in-feed, spark, topview)
- Budget: monthly ILS → USD conversion → daily per campaign
- Campaign naming convention: `VIGMIS_{PLATFORM}_{TYPE}_{DATE}`

### 3. Analytics Dashboard
- Metrics: ROAS, CPA, CTR, Impressions, Conversions, Spend
- Period selector: 7 / 30 / 90 days
- Daily spend trend chart (bar chart)
- Platform breakdown with spend % bar
- Campaign-level performance table
- Mock data shown until Google/Meta APIs connected

### 4. Budget Pacing
- Day-of-month progress vs. expected spend
- Status: on_track / overspending / underspending
- Recommendation text
- Progress bar visualization

### 5. Performance Alerts
- Alert types: campaign_error, creative_fatigue, budget_exhaustion, spend_anomaly, ctr_drop
- Severity: critical / warning / info
- Displayed on Overview tab
- Dismiss per alert
- **Delivery channels:**
  - WhatsApp via Twilio (requires TWILIO env vars)
  - Email via SendGrid (requires SENDGRID_API_KEY)
- Real alert engine activates when Google/Meta APIs connected

### 6. Creative — Video Production
- **Talking Avatar** (HeyGen) — $15/video — AI spokesperson
- **Cinematic** (Kling AI) — $12/video — photorealistic scenes
- **Animation** (Pika Labs) — $8/video — motion graphics
- Brief Approval flow: write script → Preview Brief → review type/cost/policy → Approve & Generate
- Policy: 1 free revision, $5 additional, delivery 3–5 min
- Job polling: status updates every 8 seconds
- Storage: Supabase Storage bucket "creatives" (permanent CDN URLs)
- Fallback to provider URL if Storage fails
- Status: queued → processing → completed | failed | pending_setup (if API key missing)

### 7. Ad Copy Generator
- 6 AI-generated variations per request
- Platform-specific character limits (Google / Meta / TikTok)
- Each variation: headline, description, CTA, predicted score, tone tag
- One-click copy to clipboard

### 8. Creative Scoring
- Score 0–100 with letter grade
- Breakdown: hook / clarity / cta / audience / platform fit
- Strengths + improvements
- Predicted CTR
- Recommended action: launch / tweak / rework

### 9. Creative Fatigue Detection
- Auto-detects when CTR drops significantly over time
- Alert triggered: "CTR dropped 28% over 5 days"
- Suggests generating a new creative variation
- (Activates fully when Google/Meta APIs connected)

### 10. Audience Discovery
- AI generates 8 audience segments
- Each: name, size, potential (high/medium/low), interests, reasoning, platform fit
- Platform tags per segment

### 11. Territory Intelligence
- Auto-detects country from geo_include settings
- Currency: symbol + code (USD, EUR, ILS, BRL, etc.)
- CPC benchmarks by platform
- Market insights summary
- Upcoming events calendar (holidays, seasonal peaks — global)
- Localization tips (tone, format, platform preferences)

### 12. Competitive Intelligence
- Facebook Ad Library search (activates when Meta connected)
- Search by competitor brand or keyword
- Returns active ads with creative previews
- TikTok Creative Center (planned)

### 13. A/B / Multivariate Testing
- Test multiple ad variations simultaneously
- Statistical significance tracking
- Auto-pause losers, scale winners
- Budget allocation between variants

### 14. Creative Element Analytics
- Break down performance by element: hook, color, CTA, format, length
- Answer: "Which hook style drives the most clicks?"
- Answer: "Does 'Free' in headline improve CTR?"
- Heatmap-style breakdown per creative
- Recommendations: replace specific element, keep others

### 15. Real-time Budget Shifting
- AI monitors performance hourly
- Automatically shifts budget from underperforming campaigns to top performers
- User-configurable: auto-approve or require confirmation
- Audit log of all budget moves

### 16. CRO Audit (Website Optimization)
- AI scans landing page against campaign goals
- Score 0–100
- Issues: CTA placement, trust signals, message match, load speed indicators
- Specific fix recommendations: "Move CTA above the fold", "Add 3 testimonials"
- Re-audit after changes

### 17. Billing
- Free tier: 7% of managed spend
- Pro plan: flat fee (Stripe subscription)
- Stripe Checkout for upgrades
- Stripe Customer Portal for management
- Monthly invoice generation (cron)
- Fee calculator: ILS → USD → managed % → 7% fee

### 18. Global Chat Assistant
- Available on every page (onboarding, dashboard, billing)
- Knows user's campaign context
- Can answer questions, explain metrics, suggest changes
- Feedback button on every response

---

## Platforms

| Platform | OAuth | Campaign Create | Pause/Resume | Status |
|----------|-------|-----------------|--------------|--------|
| Google Ads | ✓ | ✓ | ✓ | Pending Dev Token |
| Meta Ads | ✓ | ✓ | ✓ | Pending Business Verification |
| TikTok Ads | ✓ code ready | ✓ code ready | ✓ code ready | Pending API approval |

---

## Video Providers

| Provider | Type | Cost to user | Our cost | Status |
|----------|------|-------------|---------|--------|
| HeyGen | Talking Avatar | $15 | ~$3 | Ready (needs API key) |
| Kling AI | Cinematic | $12 | ~$2 | Ready (needs API key) |
| Pika Labs | Animation | $8 | ~$1 | Ready (needs API key) |

---

## Alert Delivery

| Channel | Provider | Status |
|---------|----------|--------|
| WhatsApp | Twilio WhatsApp Business API | Code ready (needs keys) |
| Email | SendGrid | Code ready (needs key) |

---

## Database (Supabase)

| Table | Purpose |
|-------|---------|
| `tenants` | One row per user |
| `client_settings` | Onboarding data, strategy plan |
| `platform_tokens` | OAuth tokens per platform |
| `campaigns` | All campaigns with status |
| `creative_jobs` | Video generation jobs |
| `billing_customers` | Stripe customer + plan |
| `audit_log` | All significant actions |
| `alert_settings` | User alert preferences (planned) |
| `dismissed_alerts` | Dismissed alert IDs (planned) |

---

## Environment Variables

### Railway (API)
| Key | Purpose |
|-----|---------|
| `CLERK_SECRET_KEY` | Auth verification |
| `ANTHROPIC_API_KEY` | Claude AI |
| `OPENAI_API_KEY` | GPT-4o |
| `GEMINI_API_KEY` | Gemini (fallback) |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth |
| `META_APP_ID/SECRET` | Meta OAuth |
| `TIKTOK_APP_ID/SECRET/REDIRECT_URI` | TikTok OAuth |
| `HEYGEN_API_KEY` | Avatar videos |
| `KLING_API_KEY` | Cinematic videos |
| `PIKA_API_KEY` | Animation videos |
| `TWILIO_ACCOUNT_SID` | WhatsApp alerts |
| `TWILIO_AUTH_TOKEN` | WhatsApp alerts |
| `TWILIO_WHATSAPP_FROM` | e.g. whatsapp:+14155238886 |
| `SENDGRID_API_KEY` | Email alerts |
| `STRIPE_SECRET_KEY` | Billing |
| `STRIPE_WEBHOOK_SECRET` | Stripe events |
| `STRIPE_PRO_PRICE_ID` | Pro plan price |
| `WEB_URL` | CORS + redirects |
| `SUPABASE_URL` | Database |
| `SUPABASE_SERVICE_ROLE_KEY` | Database admin |

### Vercel (Web)
| Key | Purpose |
|-----|---------|
| `NEXT_PUBLIC_API_URL` | Railway API URL |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend |
| `CLERK_SECRET_KEY` | Clerk server |

---

## Pricing Model

- **Free tier:** 7% fee on managed ad spend (no monthly fee)
- **Pro tier:** flat monthly subscription via Stripe (TBD price)
- Users pay ad platforms directly (Google/Meta/TikTok)
- Vigmis charges only its fee via Stripe

---

## What's NOT in MVP

- Landing page builder (planned — next phase)
- Mobile app
- Multi-user / team accounts
- White-label for agencies
- Automated reporting PDFs
- Custom domain for creatives
