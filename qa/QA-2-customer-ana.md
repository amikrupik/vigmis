# QA-2 — Customer Journey: Ana / הארץ הטובה
> Ana is the owner of "הארץ הטובה" — an Israeli e-commerce store selling organic food products.
> She has a Google Ads account, a Facebook page, and Instagram. She speaks Hebrew.
> This document walks through every touchpoint she would experience as a real user.
> **Each step has: what Ana does → what she should see → what to report if wrong.**

---

## PERSONA CARD

| Field | Value |
|-------|-------|
| Name | Ana |
| Business | הארץ הטובה — organic food e-commerce |
| Website | haartezhatova.co.il |
| Platform | Google Ads (active), Facebook Page, Instagram |
| Budget | ₪8,000/month (~$2,200 USD) |
| Goal | More online purchases (ROAS > 4) |
| Plan | Free (upgrade to Pro during test) |
| Language | Hebrew (UI in English per policy) |

---

## PHASE 1 — DISCOVERY & SIGN-UP

### Step 1.1 — Landing page
**Ana does:** Visits vigmis.com (marketing site)
**She should see:**
- Clear value prop in Hebrew or bilingual
- "Start Free" CTA button
- Pricing section (Free vs Pro)
- FAQ section

**Report if:**
- Page doesn't load
- CTA goes to 404
- Pricing is missing or shows wrong numbers
- Page is English-only with no Hebrew option

---

### Step 1.2 — Sign Up
**Ana does:** Clicks "Start Free" → Clerk sign-up form
**She should see:**
- Email/password sign-up form
- Google OAuth option
- Email verification sent immediately

**Report if:**
- Form doesn't submit
- No confirmation email received (within 2 min)
- After email verification → redirected to wrong page
- Error message shown instead of success

---

### Step 1.3 — Post-signup redirect
**Ana does:** Verifies email, returns to app
**She should see:**
- Automatically redirected to `/onboarding`
- Welcome message
- Chat interface for intake interview

**Report if:**
- Redirected to dashboard (skipping onboarding) — should be blocked
- Blank page / loading spinner forever
- Chat input not visible

---

## PHASE 2 — ONBOARDING INTERVIEW (10 Topics)

Ana talks to the AI. Each topic must be covered before strategy is generated.

### Step 2.1 — Business type
**Ana types:** "I sell organic food products online, mainly through my website"
**System should:**
- Detect `ecommerce` business type
- Confirm back to Ana: "Got it, you're an e-commerce store"

**Report if:**
- No confirmation, just moves on silently
- Wrong business type detected (e.g. "lead_gen")

---

### Step 2.2 — Website URL
**Ana types:** "My website is haartezhatova.co.il"
**System should:**
- Extract and save URL
- Trigger website scraping in background
- Confirm: "I'll analyze your website"

**Report if:**
- URL not saved (verify in `client_settings.website_url`)
- Scraper crashes on Hebrew site
- System asks for URL again later

---

### Step 2.3 — Advertising goal
**Ana types:** "I want more purchases, my margin is about 35%"
**System should:**
- Set goal = `purchases`
- Save margin = 35%
- Confirm both

**Report if:**
- Goal saved as "leads" or "traffic" by mistake
- Margin not saved

---

### Step 2.4 — Budget
**Ana types:** "My monthly budget is about 8,000 shekels, roughly $2,200"
**System should:**
- Save budget in USD ($2,200) or ask for USD conversion
- Save management percentage (default or ask)

**Report if:**
- Budget saved as 8000 without currency conversion
- System crashes on shekel mention

---

### Step 2.5 — Geographic targeting
**Ana types:** "I ship all over Israel, mainly central region"
**System should:**
- Save geographic targets: Israel, with note about central
- Confirm targeting scope

**Report if:**
- Targeting saved as global/worldwide
- No confirmation

---

### Step 2.6 — Existing platforms
**Ana types:** "I have Google Ads and Facebook, I don't use TikTok"
**System should:**
- Record preferred platforms: Google, Meta
- TikTok = excluded (not required)

**Report if:**
- TikTok still appears as active option later
- Platforms not saved

---

### Step 2.7 — Brand voice
**Ana types:** "My brand is warm, natural, honest. We care about families eating well."
**System should:**
- Save brand voice in `brand_voice` table
- Note: warm, natural, family-oriented, honest

**Report if:**
- Voice not saved
- Generic voice used in posts (e.g. "corporate" tone)

---

### Step 2.8 — Content pillars
**Ana types:** "Organic lifestyle, seasonal recipes, behind-the-scenes farm stories, family health"
**System should:**
- Save 4 content pillars in `social_settings.content_pillars`

**Report if:**
- Default pillars used instead of Ana's
- Pillars not reflected in generated posts

---

### Step 2.9 — Exclusions & constraints
**Ana types:** "Please don't advertise on Shabbat (Friday night to Saturday night)"
**System should:**
- Save dayparting rule: no ads Friday 17:00 – Saturday 23:00

**Report if:**
- Constraint not saved
- System has no dayparting field (report as missing feature)

---

### Step 2.10 — Risk assessment
**Ana types:** "I'm open to testing new things but not aggressive risk"
**System should:**
- Set risk_level = `medium`
- Confirm: "I'll optimize for growth without aggressive risk-taking"

**Report if:**
- Risk level not saved
- System uses aggressive bidding later (report as logic gap)

---

### Step 2.11 — Strategy generation
**Ana does:** Finishes all 10 topics
**She should see:**
- "Your strategy is ready" message
- Summary of: business type, goal, budget, targeting, brand, platforms
- Recommendation to connect ad platforms
- CTA: "Connect Google Ads"

**Report if:**
- Strategy not generated after completing all topics
- Summary shows wrong values
- No CTA to connect platforms

---

## PHASE 3 — PLATFORM CONNECTIONS

### Step 3.1 — Connect Google Ads
**Ana does:** Clicks "Connect Google Ads"
**She should see:**
- Google OAuth consent screen (Google's UI)
- After approval → back to Vigmis with "Google Ads connected" message
- Her ad account listed for selection

**Report if:**
- OAuth redirect fails (bad redirect_uri)
- Back to Vigmis shows error
- Ad account list empty (even though she has one)
- Token not saved in DB (Ana can check by disconnecting + reconnecting)

---

### Step 3.2 — Connect Meta (Facebook/Instagram)
**Ana does:** Clicks "Connect Facebook"
**She should see:**
- Meta OAuth flow
- Permission request for: ads_management, pages_read_engagement, instagram_basic
- After approval → Facebook page listed, Instagram account listed

**Report if:**
- OAuth fails
- No page listed (Ana has one active page)
- Missing Instagram account
- Meta App in wrong mode (should be Development for testers)

---

### Step 3.3 — Dashboard after connections
**Ana does:** Returns to dashboard
**She should see:**
- Both platforms shown as "Connected" with green badge
- Google Ads account name visible
- Facebook page name visible
- Instagram handle visible

**Report if:**
- Platforms show "Disconnected" after successful OAuth
- Account names show IDs instead of readable names
- Instagram not linked to page

---

## PHASE 4 — CAMPAIGNS

### Step 4.1 — First campaign created
**Ana does:** AI advisor creates first Google Ads campaign based on strategy
**She should see:**
- Campaign appears in campaign list
- Status: "pending" → "active" after approval
- Campaign name format: `VIGMIS_GOOGLE_SEARCH_2026-05-30`
- Budget: ~$70/day (based on monthly budget)

**Report if:**
- Campaign not created after strategy finalized
- Budget wrong (e.g. monthly amount used as daily)
- Name format wrong
- Status stays "pending" forever

---

### Step 4.2 — Pause campaign via chat
**Ana types in chat:** "Can you pause my Google Ads campaign for today?"
**She should see:**
- Chat responds: "I'll pause your campaign now"
- Action tag executed: `[ACTION:pause_campaign|campaign_id]`
- Campaign status → "paused"
- Confirmation in chat

**Report if:**
- Chat responds but doesn't actually pause
- Action tag visible in UI (should be hidden)
- Campaign status unchanged

---

### Step 4.3 — Resume campaign
**Ana types:** "Resume the campaign"
**She should see:**
- Campaign status → "active"
- Confirmation in chat

**Report if:**
- Status stays "paused"
- Chat says resumed but platform shows paused

---

### Step 4.4 — Campaign performance data
**Ana does:** Views dashboard after 3 days
**She should see:**
- Impressions, clicks, spend, conversions visible
- ROAS calculated (revenue / spend)
- Daily trend chart

**Report if:**
- All metrics show 0 after 3+ days (GA4 sync issue)
- ROAS field missing or blank
- Chart crashes on render

---

## PHASE 5 — SOCIAL MEDIA MANAGEMENT

### Step 5.1 — Weekly posts generated
**Ana does:** Waits for Monday morning (or triggers manually)
**She should see:**
- 7 draft posts in the social inbox
- Each post in Hebrew (content language = Hebrew, market = Israel)
- Each post assigned to a platform (mix of Facebook and Instagram)
- Each post matches one of her content pillars
- Posts use her brand voice (warm, family, organic)

**Report if:**
- Posts in English (content must be Hebrew!)
- Less than 7 posts
- Posts don't reflect her brand voice
- All 7 posts on same platform (no variety)
- Generic content (not about organic food)

---

### Step 5.2 — Review and approve a post
**Ana does:** Opens social inbox → reviews first post
**She should see:**
- Post text (Hebrew)
- Platform badge (Facebook / Instagram)
- Suggested publish time
- Approve / Edit / Reject buttons

**Ana does:** Clicks "Approve"
**She should see:**
- Post status → "approved"
- Removed from pending list
- Confirmation toast

**Report if:**
- Approve button missing
- Status doesn't change
- Post disappears completely (should move to approved section)

---

### Step 5.3 — Edit a post before approving
**Ana does:** Clicks "Edit" on a post → changes some text → approves
**She should see:**
- Edited text saved
- Post status → "approved"

**Report if:**
- Edits not saved (original text restored)
- Can't type in edit field

---

### Step 5.4 — Reject a post
**Ana does:** Clicks "Reject" on a post
**She should see:**
- Post status → "rejected"
- Post removed from publishing queue

**Report if:**
- Rejected post still published the next day

---

### Step 5.5 — Published post confirmation
**Ana does:** Checks Facebook/Instagram after scheduled publish time
**She should see:**
- Post live on her Facebook page
- Post live on her Instagram
- Engagement count starts appearing (within 24h)

**Report if:**
- Post not published at scheduled time
- Published to wrong page/account
- Duplicate post (published twice)

---

### Step 5.6 — Check social analytics
**Ana does:** Opens social analytics section
**She should see:**
- Likes, comments, shares per post
- Reach and impressions
- Best-performing post highlighted

**Report if:**
- All zeros (sync cron issue)
- Data older than 24h
- Analytics for wrong account

---

## PHASE 6 — COMMENTS INBOX

### Step 6.1 — Comments fetched
**Ana does:** Opens comments inbox
**She should see:**
- All new comments from last 24h
- Each comment has:
  - Author name
  - Comment text (in original language)
  - Platform badge (FB / IG)
  - Sentiment badge: Positive / Question / Complaint / Spam / Other
  - Priority score (High / Medium / Low)
  - AI-suggested reply (in Hebrew matching brand voice)

**Report if:**
- No comments visible even though she has real comments on her pages
- Sentiment always shows same category
- AI replies in English instead of Hebrew
- AI replies generic ("Thank you for your comment!")

---

### Step 6.2 — Reply to a customer question
**Ana does:** Finds a comment: "Is your almond butter suitable for diabetics?"
She sees: AI suggested reply with relevant info
She clicks "Send Reply"
**She should see:**
- Reply posted on Facebook/Instagram under the original comment
- Comment status → "replied"
- Reply text matches what was sent

**Report if:**
- Reply not actually posted (only marked in DB)
- Reply posted but with wrong text
- Reply from wrong account (not Ana's page)

---

### Step 6.3 — Dismiss spam comment
**Ana does:** Sees a spam comment → clicks "Ignore"
**She should see:**
- Comment removed from inbox
- Not shown again

**Report if:**
- Comment reappears next sync
- Ignore button missing

---

### Step 6.4 — Crisis detection
**Ana does:** (Simulated) A comment says: "I found mold in your product! This is disgusting and dangerous!"
**She should see:**
- Comment appears with **red "Crisis" badge**
- Priority = **High**
- Email notification sent to Ana
- Dashboard shows crisis alert banner

**Report if:**
- Comment processed as "Complaint" only (no crisis flag)
- No notification sent
- No banner on dashboard
- Crisis badge color not red/prominent

---

## PHASE 7 — AI ADVISOR CHAT

### Step 7.1 — Ask for performance summary
**Ana types:** "How are my campaigns doing this week?"
**She should see:**
- Summary with actual numbers (impressions, clicks, spend, ROAS)
- Comparison to last week
- Recommendation: "Your ROAS is above target, consider increasing budget"

**Report if:**
- Generic response with no real data
- Numbers don't match dashboard
- No recommendation

---

### Step 7.2 — Ask for explanation
**Ana types:** "Why did the system pause my campaign yesterday?"
**She should see:**
- Specific reason (e.g. "Stop-loss triggered: CPC exceeded threshold by 40%")
- Action taken and timestamp
- What to do next

**Report if:**
- "I don't know" response
- Generic explanation
- No timestamp

---

### Step 7.3 — Request content
**Ana types:** "Generate a post about our new spring honey harvest"
**She should see:**
- Draft post in Hebrew
- Matches brand voice
- Includes relevant hashtags (Hebrew + English)
- Option to approve or edit

**Report if:**
- Post in English
- Post in wrong tone (corporate vs warm)
- No way to approve directly from chat

---

### Step 7.4 — Budget advice
**Ana types:** "My sales are up 30% this week, should I increase my budget?"
**She should see:**
- Analysis of current performance vs budget
- Concrete recommendation: "Yes, increase by X% — here's why"
- Offer to execute the change

**Report if:**
- Always says "yes" regardless of data
- Always says "consult your advisor" (too conservative)
- No concrete recommendation

---

### Step 7.5 — Chat quota (Free plan)
**Ana does:** Sends 50+ chat messages in one month (Free plan limit)
**She should see:**
- Warning when approaching limit: "You have X messages left this month"
- After limit: degraded response (shorter, no action execution)
- Upgrade prompt: "Upgrade to Pro for unlimited chat"

**Report if:**
- No warning before hitting limit
- Hard block with no explanation
- No upgrade prompt shown

---

## PHASE 8 — BILLING

### Step 8.1 — View current usage (Free plan)
**Ana does:** Goes to Billing page
**She should see:**
- Plan: Free
- AI usage: X chat messages, Y comments processed
- Managed spend: $X,XXX this month
- Estimated fee: $0 (free plan) or % if applicable
- Usage bars showing progress toward limits

**Report if:**
- Usage shows 0 even after heavy use
- Fee calculated incorrectly
- No usage bars (raw numbers only is OK but bars better)

---

### Step 8.2 — Upgrade to Pro
**Ana does:** Clicks "Upgrade to Pro" → Paddle checkout opens
**She should see:**
- Paddle checkout with correct price ($49/month + 6% of managed spend)
- Successful payment → plan = "pro"
- Higher chat and comment limits unlocked

**Report if:**
- Paddle checkout doesn't open
- After payment → plan still shows "free"
- Price shown incorrectly in checkout

---

### Step 8.3 — Monthly invoice
**Ana does:** At month end, goes to Billing → Invoices
**She should see:**
- Invoice for current month
- Line items: subscription fee + managed spend fee
- Total in USD
- Download PDF option

**Report if:**
- No invoice generated
- Invoice total = $0 even with Pro + spend
- PDF download fails

---

## PHASE 9 — REPORTING & ANALYTICS

### Step 9.1 — Daily report
**Ana does:** Checks email on Tuesday morning
**She should see:**
- Email: "Your Vigmis Daily Report – Monday"
- Key metrics: spend, ROAS, top performing campaign
- Any alerts or anomalies

**Report if:**
- Email not received
- Email in English only (should support Hebrew or bilingual)
- Missing metrics in email

---

### Step 9.2 — Dashboard analytics
**Ana does:** Opens Analytics section
**She should see:**
- Campaign performance by day (chart)
- Top 3 performing ad sets
- Geographic breakdown (central region higher)
- Source attribution (Google vs Meta)

**Report if:**
- Charts don't render (blank white box)
- Geographic data always shows Tel Aviv only
- Source attribution shows "direct" for everything

---

### Step 9.3 — GA4 integration
**Ana does:** Connects her GA4 property (UA-XXXXXXXXX or G-XXXXXXX)
**She should see:**
- GA4 connected badge
- Conversion events imported (e.g. "purchase")
- ROAS calculated using real revenue data

**Report if:**
- GA4 connection fails
- Conversions show as 0 even with real purchases
- Revenue data differs from GA4 by more than 5%

---

### Step 9.4 — Export data
**Ana does:** Clicks Export → Download CSV
**She should see:**
- CSV file with campaigns, spend, conversions, ROAS
- Date range selector works
- File downloads within 10 seconds

**Report if:**
- Export button missing
- CSV is empty
- CSV has wrong column names (ID instead of campaign name)
- Download times out

---

## PHASE 10 — EDGE CASES & STRESS TESTS

### Step 10.1 — Shabbat compliance
**Ana does:** Checks if campaigns pause Friday 17:00 → Saturday 23:00
**She should see:**
- Campaigns paused automatically before Shabbat
- Campaigns resume automatically after

**Report if:**
- Campaigns run through Shabbat (dayparting rule ignored)
- Wrong timezone used (must be Israel time, UTC+3)

---

### Step 10.2 — Low budget alert
**Ana does:** Budget runs below 10% remaining midweek
**She should see:**
- Dashboard alert: "Budget running low"
- Chat message: "Your daily budget is nearly exhausted"
- Option to increase budget from alert

**Report if:**
- No alert shown
- Alert too late (budget already exhausted)

---

### Step 10.3 — High ROAS — scale up suggestion
**Ana does:** ROAS hits 8x (double target) for 3 consecutive days
**She should see:**
- Chat proactively messages: "Your ROAS is 8x — consider scaling up"
- Recommendation with specific budget increase amount

**Report if:**
- No proactive message
- Message comes too late (day 7+)
- Recommendation is vague ("consider increasing")

---

### Step 10.4 — Poor performing ad set
**Ana does:** One ad set has 0 conversions after 7 days and $200 spend
**She should see:**
- Stop-loss triggers: ad set paused
- Dashboard alert: "Ad set paused due to poor performance"
- Explanation in chat

**Report if:**
- Poor performer keeps running
- Stop-loss fires too early (after 1 day / $20)
- No explanation given

---

### Step 10.5 — Disconnect and reconnect Meta
**Ana does:** Disconnects Facebook → reconnects
**She should see:**
- After reconnect: same page and account reselected
- Posts queue not affected
- Comments inbox not reset

**Report if:**
- All posts lost on disconnect
- Comments inbox cleared
- Wrong page selected after reconnect

---

## REPORTING TEMPLATE

When Ana finds a bug, she should report:

```
Bug Report
----------
Step: [e.g. Step 5.1 — Weekly posts generated]
What I did: [exactly what I clicked/typed]
What I expected: [from the QA doc]
What I got: [actual result]
Screenshot: [attach]
Severity: Critical / High / Medium / Low

Critical = feature completely broken, no workaround
High = feature broken, workaround exists
Medium = incorrect behavior, cosmetic or partial
Low = minor UX issue
```

---

## SEVERITY DEFINITIONS

| Severity | Examples | SLA |
|----------|---------|-----|
| **Critical** | Can't sign up, campaigns not paused, tokens leaked | Fix before any release |
| **High** | Posts in wrong language, billing wrong, comments not fetched | Fix within current sprint |
| **Medium** | Metrics display bug, wrong sort order, missing badge | Fix in next sprint |
| **Low** | Typo, alignment off, minor UX | Backlog |

---

## EXPECTED TEST DURATION

| Phase | Est. Time |
|-------|----------|
| Sign-up + Onboarding | 30 min |
| Platform connections | 20 min |
| Campaigns | 30 min |
| Social media + comments | 45 min |
| Chat advisor | 30 min |
| Billing | 20 min |
| Analytics + export | 20 min |
| Edge cases | 30 min |
| **Total** | **~3.5 hours** |
