# Vigmis — Work Plan
**Updated:** 2026-06-03  
**Status:** Active backlog — items to be implemented in batches

---

## CATEGORY A — Platform Connections (OAuth & Status)

### A1. Fix Google OAuth
**Priority:** Critical | **Size:** Small  
**Issue:** User reports Google connection not working.  
**Action:** Get error message from user → check redirect URI match between `GOOGLE_REDIRECT_URI` env var and Google Cloud Console → check scopes include `adwords` + `analytics.readonly`.  
**Files:** `apps/api/src/routes/connectors.ts`, Google Cloud Console settings.

### A2. TikTok Marketing API
**Priority:** Deferred | **Size:** N/A  
**Issue:** Marketing API not yet approved by TikTok. Content API (video posting) already approved.  
**Action:** Submit TikTok Business API application when ready. No code changes needed until approved.

### A3. Platform Connection Status UI — prominent & always visible
**Priority:** High | **Size:** Medium  
**What:** In the dashboard, always show a clear status bar or panel:
- Meta: Connected / Not connected / Token expired
- Google Ads: Connected / Not connected
- TikTok: Coming soon
- GA4: Connected / Not connected (relies on Google token + analytics scope)  

Show this prominently — not buried in a Connect tab. Use colored indicators.  
**Files:** `apps/web/app/dashboard/DashboardClient.tsx`

### A4. "No Account" Educational Flow
**Priority:** High | **Size:** Small  
**What:** When a user clicks "Connect Meta/Google" and fails (or declines), show a helpful message explaining they need to create a business account first. Include direct links to:
- Meta Business Manager creation
- Google Ads account creation  

Pattern: Many SaaS tools show this. Example: "It looks like you don't have a Meta Business account yet. Here's how to create one in 5 minutes → [link]"  
**Files:** Connect tab UI, OAuth error handlers.

### A5. GA4 Connection — scope enforcement
**Priority:** Medium | **Size:** Small  
**Issue:** GA4 uses the Google Ads OAuth token. If user connected Google without `analytics.readonly` scope, GA4 silently fails.  
**Action:** Detect missing scope → show clear message: "To connect Analytics, reconnect your Google account and approve the Analytics permission" → add "Reconnect Google with Analytics" button.  
**Files:** `apps/web/app/dashboard/DashboardClient.tsx`, GA4 section.

### A6. Connection-aware content creation
**Priority:** High | **Size:** Medium  
**What:** Before generating a post/creative:
- Check which platforms are connected
- Show banner: "You're connected to Meta only. This content will be published to Facebook & Instagram. Connect Google or TikTok to expand reach."
- If user requests a platform they're not connected to → prompt to connect, not a generic error  

**Files:** Post generation flow, video/image creation flow.

### A7. Budget recommendation respects connected platforms
**Priority:** High | **Size:** Medium  
**What:** During onboarding/strategy:
- If only Meta connected → don't include Google budget in recommendation
- If only Google connected → don't include Meta budget  
- Vigmis asks: "You're not connected to Google Ads. Would you like to? It could add X% more reach." → Yes/No
- If No → proceed with Meta-only strategy  
**Files:** `apps/api/src/routes/onboarding.ts`, strategy generation service.

---

## CATEGORY B — Content Creation UX (Consent Before Charge)

### B1. Creative Brief Dialog — before ANY content creation
**Priority:** High | **Size:** Medium  
**What:** Before generating any post/image/video, open a short dialog (3-5 guided questions):
1. What product or service is this for?
2. What's the main message? (optional)
3. Any specific style, tone, or reference? (optional + image upload)
4. Any text that must appear? (e.g., phone number, website)
5. Any restrictions? (e.g., "don't use red", "no people")  

Customer can answer 0 of these (Vigmis uses defaults) or all of them (full control).  
This also acts as legal protection — customer approved the brief.  
**Files:** New `CreativeBriefDialog` component, all content generation entry points.

### B2. Logo Upload
**Priority:** High | **Size:** Small  
**What:**  
- Settings page: "Upload your logo" → stored in Supabase Storage
- Logo auto-applied to all generated images/videos/banners
- Customer can toggle "include logo" per creative  
**DB:** Add `logo_url` to `client_settings`.  
**Files:** Settings UI, `apps/api/src/services/creative-brief.ts`, image generation pipeline.

### B3. CTA / Contact Info in all creatives
**Priority:** High | **Size:** Small  
**What:**  
- Default CTA pulled from onboarding (website URL, phone)
- Before every publish: "Add contact info to this creative? [website] [phone] [custom text]" → Yes (default) / Skip
- Customer can set default CTA in Settings and override per creative  
**Files:** Publish flow, onboarding settings, creative generation.

### B4. Reference / Product Image Upload in Brief Dialog
**Priority:** Medium | **Size:** Small  
**What:** In the brief dialog (B1), allow customer to upload:
- A reference image ("I want something like this")
- A product photo ("use this product in the creative")
- These are sent to the AI generation pipeline as reference/style guide  
**Files:** Brief dialog, DALL-E / Replicate API calls.

### B5. Preview Before Charge — ALL content types
**Priority:** Critical | **Size:** Medium  
**Principle:** Never charge for content the customer hasn't seen and approved.  
**Flow for images/videos:**
1. Generate → show preview
2. Customer: Approve / Request revision / Cancel
3. Approve → charge + publish
4. Revision → regenerate (1 free revision included) → show again
5. Cancel → no charge, content discarded  

**Currently:** Post approval exists (cooling-off). Images/videos: unclear if preview is shown before charge.  
**Action:** Audit and enforce this pattern for all content types.  
**Files:** `apps/web/app/dashboard/DashboardClient.tsx`, `apps/api/src/routes/social.ts`, creatives route.

---

## CATEGORY C — Platform Specs & File Handling

### C1. Auto-resize images/videos per platform
**Priority:** Medium | **Size:** Medium  
**What:** When publishing to a platform, automatically resize/crop to correct dimensions:

| Platform | Post Image | Story | Video |
|----------|-----------|-------|-------|
| Facebook | 1200×630 | 1080×1920 | 1280×720 |
| Instagram | 1080×1080 | 1080×1920 | 1080×1080 |
| TikTok | — | 1080×1920 | 1080×1920 |
| Google Display | Multiple | — | 1920×1080 |

Auto-resize = free, automatic, no customer action needed.  
Tool: Sharp (Node.js image processing) or Cloudinary.  
**Files:** `apps/api/src/services/social-publisher.ts`, image upload pipeline.

### C2. File size/weight enforcement per platform
**Priority:** Medium | **Size:** Small  
**What:** Validate before upload attempt:

| Platform | Image max | Video max | Video length |
|----------|-----------|-----------|-------------|
| Facebook | 4 MB | 4 GB | 240 min |
| Instagram | 8 MB | 100 MB | 60 min (feed), 15s (story) |
| TikTok | — | 287 MB | 10 min |
| Google Ads | 5 MB | 256 MB | — |

If file exceeds limit → auto-compress before attempting upload, not after failure.  
**Files:** Pre-publish validation, `social-publisher.ts`.

### C3. Intelligent error handling for publish failures
**Priority:** High | **Size:** Medium  
**What:** When a publish fails, parse the platform API error and respond intelligently:

| Error type | Current | Should be |
|-----------|---------|-----------|
| Token expired | Generic error | "Your Meta connection expired. Click here to reconnect →" |
| Missing permission | Generic error | "Vigmis needs the pages_manage_posts permission. Click here to reconnect →" |
| File too large | Generic error | "Image is 6MB, Instagram max is 8MB — auto-compressing and retrying..." |
| Wrong aspect ratio | Generic error | "Auto-resizing to Instagram format..." |
| Rate limit | Generic error | "Instagram rate limit reached. Scheduled for +2 hours." |
| Account suspended | Generic error | "Your Meta ad account has been flagged. Contact Meta support." |
| Page not found | Generic error | "The connected Facebook Page no longer exists. Please reconnect." |

**Files:** `apps/api/src/services/social-publisher.ts`, error parsing layer.

---

## CATEGORY D — Pricing Page & UI Text

### D1. Remove 3x/6x optimization frequency from pricing page
**Priority:** Low | **Size:** Tiny  
**What:** Replace "3× / day" and "6× / day" with "AI Optimization" and "Advanced AI Optimization".  
Customers can't evaluate frequency — daily vs weekly briefing is the felt differentiator.  
**Files:** `apps/web/app/pricing/page.tsx`, homepage pricing teaser.

---

## CATEGORY E — Already in Progress / Monitoring

### E1. Multi-user (Scale: up to 3 seats)
**Status:** ✅ Built + migration 041 applied.  
**Remaining:** Test the full invite → accept flow with a real email.

### E2. Security Plan
**Status:** ✅ Documented in `docs/SECURITY_PLAN.md` v1.2.  
**Remaining:** Phase 1 items (RLS audit, token encryption, headers) not yet implemented.

### E3. Google OAuth debug
**Status:** Waiting for error message from user.

---

---

## CATEGORY F — Multi-Language, Multi-Market & UI Localization

**Context:** Current state: only 4 languages (he/ar/ru/en) via heuristic Unicode detection from website content. UI is English-only. RTL not implemented. Users who don't speak English cannot use the system comfortably.

### F0. UI Language — Hebrew first, then Arabic
**Priority:** Critical | **Size:** Large (1-2 weeks)  
**What:** Full UI translation + RTL layout support.

Two separate problems:
1. **Translation:** Every UI string needs a translation file. Use `next-intl` library. User selects UI language in onboarding/settings. Store in `client_settings.ui_language`.
2. **RTL layout:** Hebrew and Arabic go right-to-left. Requires:
   - `<html dir="rtl" lang="he">` when Hebrew is active
   - Tailwind RTL utilities (`rtl:text-right`, `rtl:flex-row-reverse`, etc.) on all components
   - Logical CSS properties (start/end instead of left/right)
   - Test every page: forms, menus, tables, modals, buttons

**Phase 1:** Hebrew UI + RTL — all dashboard pages, all error messages, all notifications.  
**Phase 2:** Arabic UI (RTL already done, just translation).  
**Phase 3:** Russian UI (LTR, just translation).  
**Phase 4:** French, German, Spanish (LTR, translation via i18n files).

**Files:** All `apps/web/app/**/*.tsx`, new `messages/` directory for translation strings, `next.config.ts`, root layout.

### F1. Content language — user-configurable, any language
**Priority:** High | **Size:** Small  
**What:**
- Add `content_language` field to `client_settings` (default: auto-detect from website)
- Setting in onboarding and settings page: "What language should your content be in?"
- AI receives explicit language instruction — can generate in ANY language (French, Greek, German, Turkish, etc.)
- Replaces the limited 4-language Unicode heuristic

**Files:** `apps/api/src/services/social-content.ts` (replace detectLanguage with explicit setting), onboarding UI, settings UI.

### F2. Multi-market — multiple languages per account
**Priority:** Medium | **Size:** Medium  
**What:** For companies selling in multiple countries:
- Onboarding step: "Which countries do you sell to?" → multi-select
- Per country: auto-suggest language, customer can override
- Each campaign has a `target_language` — content generated in that language automatically
- E.g.: French campaign → French posts. Greek campaign → Greek posts. English campaign → English posts.

**Files:** `client_settings.target_markets`, campaign schema, social content generation.

### F3. Chat & brief in any language
**Priority:** Medium | **Size:** Tiny  
**What:** Customer types in Hebrew/Arabic/French/any language → Vigmis responds in the same language → content generated in that language. No configuration needed.  
**Files:** Chat route system prompt, content generation pipeline.

---

---

## CATEGORY G — Competitive Intelligence Features (from market research)
*Source: Deep research 2026-06-03 — verified against 22 sources, 4/25 claims confirmed*

### G1. Pre-launch Creative Scoring
**Priority:** Medium | **Size:** Medium  
**What:** Before any image/video/banner goes live, score it with AI:
- Attention prediction: where will the eye land? (heatmap overlay)
- Engagement score: 0-100 estimate based on visual analysis
- Emotion reading: does the creative feel right for the campaign goal?
- Recommendation: "This creative scores 62/100. Images with faces typically score 15 points higher — regenerate?"

**SMB version (no complex CV needed):** Use Claude/GPT vision API to analyze the image against a scoring rubric. Simple, fast, cheap.  
**Business value:** Customer sees their creative quality BEFORE spending money. Reduces wasted spend.  
**Vigmis advantage:** Competitors (Smartly.io) only offer this at enterprise pricing ($2,500+/mo). Vigmis can offer it to SMBs.  
**Files:** New `creative-scorer.ts` service, brief dialog (B1), publish flow.

### G2. Cross-Creative Theme Learning
**Priority:** Medium | **Size:** Medium  
**What:** After campaigns run, analyze all creatives together and surface patterns:
- "Posts with a question headline performed 2× better this month — continue this style"
- "Images with people outperformed product-only by 34%"
- "Short captions (<50 words) had 28% higher engagement"

This feeds back into content generation — Vigmis gets smarter with every campaign.  
**Data already exists:** `social_posts` table has performance metrics. Need: analysis layer that clusters and synthesizes patterns.  
**Files:** New `creative-insights.ts` service, dashboard Intelligence tab.

### G3. Budget Scenario Modeling ("What If")
**Priority:** Medium | **Size:** Medium  
**What:** When customer asks "how much should I spend?" or Vigmis recommends a budget change:
- Show a simulation: "With $500/month → estimated 15 leads, ROAS ~2.1"
- "With $1,000/month → estimated 32 leads, ROAS ~2.4 (diminishing returns kick in above $800)"
- Based on: industry benchmarks + customer's actual historical data (if available)

**Foundation available:** incrementality.ts, significance.ts, GA4 data. Need: forecasting layer.  
**Files:** New `forecast.ts` service, strategy viewer, onboarding strategy step.

---

## Suggested Batch Order

### Batch 1 — Quick wins (1-2 days)
- A1: Google OAuth fix (pending error message)
- B2: Logo upload
- B3: CTA default in all content
- D1: Remove 3x/6x from pricing page

### Batch 2 — Connection UX (2-3 days)
- A3: Platform status bar
- A4: No-account educational flow
- A5: GA4 scope detection
- A6: Connection-aware content creation

### Batch 3 — Content creation UX (3-4 days)
- B1: Creative brief dialog
- B4: Reference image upload
- B5: Preview before charge audit + fix

### Batch 4 — Platform specs (2-3 days)
- C1: Auto-resize per platform
- C2: File size enforcement
- C3: Intelligent error handling

### Batch 5 — Strategy & Budget UX (2-3 days)
- A7: Budget recommendation respects connected platforms

### Batch 6 — Multi-language & UI Localization (1-2 days)
Languages: English, Hebrew, Arabic, Spanish, Portuguese, French, Russian, German, Turkish, Italian
- F0: next-intl setup + translation files for all 10 languages
- F0: RTL layout (Hebrew + Arabic) — html dir attribute + Tailwind rtl: utilities
- F0: Language selector in settings/onboarding (stores in client_settings.ui_language)
- F1: Content language — any language, user-configurable (replaces 4-lang heuristic)
- F2: Multi-market — per-campaign language
- F3: Chat responds in customer's language automatically

### Batch 7 — Expose hidden features (1 day)
- Incrementality analysis → dashboard widget
- Metric interpreter → context tooltips on metrics
- Conversion readiness score → Strategy tab
- Weather/news impact → feed in briefings

### Batch 8 — Competitive Intelligence (4-5 days)
- G1: Pre-launch creative scoring (LLM vision)
- G2: Cross-creative theme learning
- G3: Budget scenario modeling ("what if")

---

*Total estimate: ~3 weeks of focused development*
