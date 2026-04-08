# Vigmis — Full Feature Specification

> Version: 0.1 | Status: Planning | Last updated: 2026-04-02

---

## Phase 1 — Google Ads Automation (Weeks 1–8)

### Onboarding
- [ ] User registration (email + Google OAuth)
- [ ] Business profile wizard (URL, industry, budget, KPIs, language)
- [ ] Budget management percentage selection: user chooses one of 6 tiers — 10%, 25%, 50%, 75%, 90%, 100% — during onboarding. Note: selecting 10% displays a "Limited optimization" warning, as low budget allocation restricts the system's ability to optimize effectively.
- [ ] AI-powered website crawler (understands products, services, tone)
- [ ] Competitor discovery (top 5 competitors auto-detected)
- [ ] Baseline market report (avg CPC, keyword landscape)

### Google Ads Integration
- [ ] OAuth 2.0 connection to Google Ads account
- [ ] Read existing campaigns and historical data
- [ ] Keyword research & suggestion (via Google Keyword Planner API + SerpAPI)
- [ ] Automated Search campaign creation (headlines, descriptions, keywords)
- [ ] Smart bidding strategy selection (Target CPA / Target ROAS)
- [ ] Budget pacing and daily cap enforcement

### Optimization Loop (every 60 min)
- [ ] Pull performance data from Google Ads API
- [ ] Pause underperforming keywords/ads (rule-based)
- [ ] Increase budget on top performers
- [ ] Auto-generate new ad variations to replace losers
- [ ] Log every change with reason + rollback option

### Dashboard & Reporting
- [ ] Real-time KPI display: CTR, CPA, ROAS, spend, conversions
- [ ] Campaign breakdown by keyword, ad, device, location
- [ ] Budget management percentage control: user can view and update their tier (10/25/50/75/90/100%) at any time directly from the dashboard
- [ ] Weekly automated PDF report (email delivery)
- [ ] Smart alerts: budget overrun, CTR drop, conversion anomaly (email + SMS)
- [ ] **Smart Upsell — Budget Expansion Suggestion**: after 7 days of running, the system analyzes campaign performance. If results are positive, Vigmis proactively suggests increasing the managed budget percentage. Example message: "Your campaigns improved X%. You're currently managing 10% of your budget with Vigmis. Upgrading to 25% could increase conversions by an estimated Y%." The suggestion is data-driven (based on actual performance, not generic). User can accept with one click (updates their management percentage) or dismiss. Never shown if performance is negative. Drives both user value and Vigmis revenue growth.

### Billing
- [ ] Stripe integration (credit card, saved payment method)
- [ ] Usage tracking: clicks counted per client
- [ ] Per-click billing ($0.07/click) OR monthly subscription
- [ ] Invoice generation (PDF, multi-currency)
- [ ] Client billing dashboard (spend history, invoices)

**Measurement Scope (Critical)**
- Vigmis measures, optimizes, and charges fees ONLY on campaigns it created and manages (identified by the "VIGMIS_" prefix in campaign names)
- Campaigns the client runs independently on Meta/Google are completely ignored by Vigmis
- The managed budget percentage (10/25/50/75/90/100%) applies only to the budget Vigmis manages, not the client's total ad spend
- Fee calculation is based solely on VIGMIS_ campaign spend

---

## Phase 2 — Meta + TikTok + Creative (Weeks 9–14)

### Meta (Facebook + Instagram) Integration
- [ ] OAuth connection to Meta Business Manager
- [ ] Read existing campaigns and audiences
- [ ] Automated campaign creation (Feed, Stories, Reels formats)
- [ ] Custom audience creation from CRM/pixel data
- [ ] Lookalike audience generation
- [ ] Dynamic creative testing (A/B auto-rotation)

### TikTok Ads Integration
- [ ] OAuth connection to TikTok Business Center
- [ ] Automated campaign creation (In-Feed Ads, TopView)
- [ ] TikTok-specific creative guidelines enforcement
- [ ] Trending hashtag and sound recommendations

### Creative Automation
- [ ] AI copywriting: headlines, descriptions, CTAs (OpenAI GPT-4o)
- [ ] Banner generation (DALL-E / Flux / Midjourney API)
- [ ] Platform-specific asset resizing (auto-resize for each format)
- [ ] Brand kit upload: logo, colors, fonts — applied to all creatives
- [ ] Creative performance scoring + automatic replacement

### Cross-Platform
- [ ] Unified budget allocation engine (moves budget to best-performing platform)
- [ ] Cross-platform attribution (which platform drove the conversion)
- [ ] Frequency capping across platforms (same user doesn't see ad 10x)

---

## Phase 3 — Organic + AI Router + SEO (Weeks 15–20)

### SEO & Organic Content
- [ ] Keyword ranking tracker (daily SERP position monitoring)
- [ ] Blog post generation (OpenAI, SEO-optimized, brand voice)
- [ ] Meta tags optimization (title, description auto-generated)
- [ ] Internal linking recommendations
- [ ] Backlink opportunity detection
- [ ] Google Search Console integration

### AI Router
- [ ] Unified AI abstraction layer (swap models without code change)
- [ ] Task-to-model routing: copywriting → GPT-4o, analysis → Claude, images → DALL-E
- [ ] Cost tracking per model per client
- [ ] Fallback logic (if OpenAI down → Claude, etc.)
- [ ] Model performance logging for continuous improvement

### Advanced Analytics
- [ ] ROI forecasting (next 30/60/90 days)
- [ ] Budget simulation tool (what-if scenarios)
- [ ] Seasonality detection and proactive budget suggestions
- [ ] Cohort analysis (client performance over time)

---

## Phase 4 — Scale, Admin & Polish (Weeks 21–26)

### Multi-Language
- [ ] UI available in: English, Hebrew, Arabic, Spanish, French, German
- [ ] User language preference saved per account
- [ ] AI generates copy in client's target language
- [ ] RTL support (Hebrew, Arabic)

### Admin Portal (for Vigmis team)
- [ ] View all clients, status, spend, health
- [ ] Manual override on any client's campaigns
- [ ] Impersonate client account (support mode)
- [ ] Revenue dashboard (MRR, churn, top clients)
- [ ] System health monitoring

### Client Management
- [ ] Multi-user per account (invite team members, set roles)
- [ ] White-label option (agency can brand as their own)
- [ ] API access for enterprise clients
- [ ] Webhook notifications to client's systems

### Infrastructure & Security
- [ ] Automated daily database backups (30-day retention)
- [ ] Audit log: every action recorded (who, what, when)
- [ ] GDPR compliance (data export, deletion requests)
- [ ] SOC 2 preparation checklist
- [ ] Rate limiting and DDoS protection
- [ ] Uptime monitoring + status page

---

## Future (Post-MVP)

- [ ] Video ad generation (RunwayML / Synthesia)
- [ ] Influencer discovery and outreach
- [ ] CRM full automation (email sequences, SMS)
- [ ] LinkedIn Ads integration
- [ ] Amazon Ads integration
- [ ] Offline campaign planning
- [ ] Mobile app (iOS + Android)
- [ ] Open API for third-party integrations
- [ ] Predictive ML models (custom-trained per client)
- [ ] White-label mobile app
