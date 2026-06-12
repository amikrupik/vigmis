# Vigmis QA Master Plan — Google-Level
## Last updated: 2026-06-11

---

# PART 1 — WHAT WAS BUILT (כל מה שנבנה)

## Core Platform
| Feature | Status | Notes |
|---|---|---|
| Onboarding chat (AI collects 8 topics) | ✅ Built + fixed | incremental topic detection, Hebrew/Arabic/English |
| Strategy generation (/onboarding/analyze) | ✅ Built + fixed | Perplexity pre-research, 8000 token budget, all fields fill |
| Strategy display (platforms, budget, narrative) | ✅ Built | |
| Chat AI Brain (campaign manager) | ✅ Built | Phase 2 context, 20-msg history, platform rules |
| Creative Studio — image generation (gpt-image-1) | ✅ Built + fixed | best-of-3, AI critic, brand DNA injection |
| Creative revision flow (0-2 free / 3-5 50% / 6+ blocked) | ✅ Built + fixed | revision counter excludes failed jobs |
| Creative approval / rejection | ✅ Built | |
| Brand DNA (colors, do-not-change, styles) | ✅ Built | |
| Keep/Change form for revisions | ✅ Built | |
| Social inbox — comments categorization | ✅ Built | FB+IG, 5 categories |
| Social post generation + scheduling | ✅ Built | |
| Social publishing (Meta/Instagram) | ✅ Built | |
| Billing — Free / Scale ($49/mo) | ✅ Built | Stripe, webhooks |
| Scale credits (1 video / 3 image / 5 post per month) | ✅ Built | |
| Connectors — Meta OAuth | ✅ Working | test tenant connected |
| Connectors — Google Ads OAuth | ✅ Working | test tenant connected |
| Connectors — TikTok OAuth | ✅ Fixed | curl verified, browser pending |
| Dashboard | ✅ Built | KPIs, campaign overview |
| Settings — brand DNA, management %, risk level | ✅ Built | |
| Content policy (6 blocked categories) | ✅ Built + fixed | firearms negation, cannabis added |
| Multi-language (Hebrew/English/Arabic) | ✅ Built + fixed | server-side script detection |
| Internal test auth | ✅ Built | test:vigmis-test-2026:TENANT_ID |
| Publisher Shield (attestation, audit log, AI disclosure) | ✅ Built | |
| Security audit Phase 1 | ✅ Audited | CRON_SECRET fixed, log redaction fixed |
| Industry benchmarks (WordStream/Meta/Google 2025) | ✅ Built | injected into strategy |
| Creative performance feedback loop | ✅ Built | winning themes → next brief |
| Website re-crawl (weekly cron) | ✅ Built | |
| Competitor research via Ad Library | ✅ Built | |

## DB Migrations (all applied)
Migrations 001–056 applied. Latest: 056 (budget_currency + budget_original_amount).

## Bugs Fixed This Session (QA Round 1)
| ID | Bug | Fix |
|---|---|---|
| P0-2 | AI invents client facts (hallucination) | ANTI-HALLUCINATION RULES block in system prompt |
| P0-3 | revision_number increments on failure → billing fires | .neq('status','failed') in sibling count |
| P1-1 | Creative retry no backoff → rate limit burn | Stagger 3s/6s between requests; 15s+ before critic retry |
| P1-2 | brief stored as char-indexed object {"0":"A"...} | Normalize string→{prompt:brief}; strip _all_candidate_urls |
| P1-3 | USD/AED budget loses source currency | budget_currency + budget_original_amount columns (migration 056) |
| P1-4 | Arabic multi-turn reverts at turns 5+8 | langOverride moved to PREFIX of system prompt |
| P1-5 | Currency disambiguation loops forever | Ask once; second bare number → assume ILS |
| P1-6 | OpenAI org_id leaks in error response | Parse error.message only; strip all other fields |
| P1-7 | /connectors/meta/adaccounts 404 | Added real alias route (same handler) |
| — | dall-e-3 retired → all images fail | Migrated to gpt-image-1 (b64_json, quality:'medium') |
| — | Firearms false positive | firearmsNegated guard added |
| — | Cannabis/marijuana not blocked | Added to illegal_drugs keywords |
| — | English input → Hebrew chat response | Server-side language detection; MANDATORY English lock |
| — | Arabic response in Hebrew | Server-side detection + language override |
| — | LinkedIn null for SaaS | MUST directive in platform selection rules |

## Still Open
| ID | Issue | Effort |
|---|---|---|
| P0-1 | Strategy timeout 3.5-4.5 min → 504 for all real clients | Major: async job queue (3-5 days) |
| — | TikTok browser final test (curl works, browser unconfirmed) | 10 min |
| — | RLS audit (app-layer only, no row-level security) | Security sprint |
| — | Multi-user end-to-end | 1 day |

---

# PART 2 — COMPLETE QA PLAN

## Test environment
- API: https://vigmisapi-production.up.railway.app
- Auth: Bearer test:vigmis-test-2026:7822c548-ecea-4572-929b-bcee1b4b3db2
- Tenant: הארץ הטובה (organic farm, ecommerce, Hebrew-speaking)

---

## A. ONBOARDING CHAT — 20 scenarios

### A1: Happy paths
| # | Scenario | Input | Expected |
|---|---|---|---|
| A1-1 | Hebrew ecommerce | "יש לי חנות אורגנית בישראל" | Asks website, then budget |
| A1-2 | English ecommerce | "I have an organic food store" | Responds in English |
| A1-3 | Arabic lead_gen | "عيادة أسنان في دبي" | Responds in Arabic, infers lead_gen |
| A1-4 | SaaS with LinkedIn | "I have a B2B SaaS for HR teams in the US" | preferred_platforms includes linkedin |
| A1-5 | Hero product | "I sell one product — organic soap" | business_type=hero_product |
| A1-6 | Brick & mortar | "מסעדה בתל אביב" | business_type=general_store |
| A1-7 | Full happy path | Complete all 8 topics in order | [SUMMARY] JSON fires with all fields |
| A1-8 | Skip to budget first | User gives budget before website | AI collects remaining topics |

### A2: Currency handling
| # | Scenario | Input | Expected |
|---|---|---|---|
| A2-1 | ILS explicit | "התקציב שלי הוא ₪5000 לחודש" | Confirms ₪5000, budget_currency=ILS |
| A2-2 | USD explicit | "$2000 per month" | Confirms $2000, budget_currency=USD, budget_monthly_ils=7400 |
| A2-3 | AED explicit | "5000 AED per month" | Confirms 5000 AED, budget_currency=AED, budget_monthly_ils=5250 |
| A2-4 | Bare number → ask | "התקציב שלי הוא 3000" | Asks: ILS / USD / AED? |
| A2-5 | Bare number × 2 (disambiguation loop fix) | "3000" → AI asks → "3000" again | Assumes ILS on second time, does NOT ask again |
| A2-6 | Minimum budget warning | "₪200 לחודש" | Warns once: under ₪500, then continues |

### A3: Language & multi-turn
| # | Scenario | Input | Expected |
|---|---|---|---|
| A3-1 | Arabic turn 1 | "مرحبا، أريد الإعلان عن متجري" | Full response in Arabic |
| A3-2 | Arabic turn 5 | After 4 turns in Arabic, turn 5 in Arabic | Still Arabic (regression: used to revert) |
| A3-3 | Arabic turn 8 | Turn 8 in Arabic | Still Arabic |
| A3-4 | Language switch | Starts Hebrew, switches to English at turn 3 | Switches immediately to English |
| A3-5 | Language switch back | Hebrew → English → Hebrew | Follows each turn |

### A4: Edge cases & content policy
| # | Scenario | Input | Expected |
|---|---|---|---|
| A4-1 | No website | "אין לי אתר" | Asks for manual description, stores in open_notes |
| A4-2 | Firearms business | "I sell guns and ammo" | Blocked: category=firearms |
| A4-3 | No firearms (negated) | "I sell outdoor gear, NO firearms or weapons" | Allowed |
| A4-4 | Cannabis | "I sell cannabis products" | Blocked: category=illegal_drugs |
| A4-5 | Re-onboarding | User who already onboarded returns | Settings preserved, can update |

---

## B. STRATEGY GENERATION — 8 scenarios

| # | Scenario | Expected |
|---|---|---|
| B1 | Hebrew ecommerce, ILS budget | Strategy in Hebrew, budget shows ₪, market_insights filled |
| B2 | English SaaS, USD budget | Strategy in English, budget shows $, LinkedIn included |
| B3 | Arabic lead_gen, AED budget | Strategy shows AED, Arabic market insights |
| B4 | All fields populated | platforms, market_insights, creative_brief, budget_analysis, strategy_narrative, first_30_days all non-empty |
| B5 | Budget analysis verdict | verdict ∈ {sufficient, low, high}, verdict_explanation 1 sentence |
| B6 | Platform selection | Google only if search intent; TikTok only if under-40; LinkedIn required for SaaS |
| B7 | Re-analyze after settings change | New strategy generated, overwrites old |
| B8 | Strategy timeout check | Note if response > 30s (P0-1 still open) |

---

## C. CREATIVE STUDIO — 30 scenarios
### (Every creative test writes to qa-results/creatives/ with full story)

### C1: Initial Generation
| # | Scenario | Brief | Expected |
|---|---|---|---|
| C1-1 | Basic image — Hebrew | הארץ הטובה, organic vegetables, warm colors | Image URL in Supabase, critic_score > 0 |
| C1-2 | Basic image — English | Organic farm store, clean lifestyle photography | Image URL, English prompt handled |
| C1-3 | Basic image — Arabic | متجر منتجات عضوية في دبي | Image URL, Arabic brief handled |
| C1-4 | With brand DNA | Colors: #2D5016, #F5E6C8; DO NOT CHANGE: logo font | Brand colors referenced in prompt |
| C1-5 | From strategy brief | Use creative_brief from B1 strategy | Image matches strategy direction |
| C1-6 | Style specified | brief.style = "minimalist photography" | Style injected into prompt |

### C2: Revision Flow — free tier (0-2)
| # | Scenario | Action | Expected |
|---|---|---|---|
| C2-1 | Revision 1 (free) | parent_job_id = C1-1 result; change_request="make it more vibrant" | revision_number=1, no charge |
| C2-2 | Revision 2 (free) | parent_job_id = C1-1; change_request="add people" | revision_number=2, no charge |
| C2-3 | Failed revision doesn't count | Send bad prompt that fails, then retry | retry = revision 1, NOT revision 2 |

### C3: Revision Flow — paid tier (3-5)
| # | Scenario | Action | Expected |
|---|---|---|---|
| C3-1 | Revision 3 (50% charge) | After 2 free revisions | revision_number=3, response shows pricing |
| C3-2 | Revision 4 | After 3 | revision_number=4 |
| C3-3 | Revision 5 | After 4 | revision_number=5 |

### C4: Revision blocked (6+)
| # | Scenario | Expected |
|---|---|---|
| C4-1 | Attempt revision 6 | 400 error: "Maximum 5 revisions reached. Please start a new creative." |

### C5: Keep/Change form
| # | Scenario | Input | Expected |
|---|---|---|---|
| C5-1 | Keep elements | keep_elements=["logo position","color palette"] | KEEP EXACTLY: logo position, color palette in prompt |
| C5-2 | Change only | change_request="replace background with outdoor scene" | CHANGE ONLY: replace background in prompt |
| C5-3 | Keep + Change | Both fields set | Both instructions combined in prompt |

### C6: AI Critic
| # | Scenario | Expected |
|---|---|---|
| C6-1 | Revision scores higher than original | critic_score > 0, pass=true |
| C6-2 | Revision scores lower → auto-regenerate | API retries silently, final output better |

### C7: Approval Flow
| # | Scenario | Action | Expected |
|---|---|---|---|
| C7-1 | Approve creative | PATCH /creatives/:id/approve | status=approved, approved_at set |
| C7-2 | Approved → locked | Try to revise approved creative | 400 error: cannot revise approved creative |
| C7-3 | Reject creative | PATCH /creatives/:id/reject | status=rejected |
| C7-4 | Rejected → new creative | Generate new with no parent_job_id | Works normally |

### C8: Scale Credits
| # | Scenario | Expected |
|---|---|---|
| C8-1 | First image on Scale plan | credit_consumed=true in response |
| C8-2 | Image credits exhausted (4th image) | credit_consumed=false, charged normally |
| C8-3 | Credits reset new month | After period change, counter resets |

### C9: Brief integrity
| # | Scenario | Expected |
|---|---|---|
| C9-1 | String brief (P1-2 regression) | brief="Advertise organic farm" → stored as {prompt:"..."} in DB |
| C9-2 | No _all_candidate_urls in DB | After generation, DB brief column has no _all_candidate_urls key |
| C9-3 | Revision uses clean brief | Revision prompt not corrupted with char-indexed chars |

---

## D. CHAT AI BRAIN — 12 scenarios

| # | Scenario | Input | Expected |
|---|---|---|---|
| D1 | English campaign question | "What should I optimize first?" | English response with specific recommendation |
| D2 | Hebrew campaign question | "מה לשפר בקמפיין?" | Hebrew response |
| D3 | Arabic question | "ما الذي يجب تحسينه؟" | Arabic response |
| D4 | History preserved | 20-message conversation | Context maintained across messages |
| D5 | Platform rules injected | Ask about Meta ad formats | Correct 2025 format specs |
| D6 | GA4 KPIs in context | Ask about performance | References actual GA4 metrics from DB |
| D7 | Proactive insight | Chat initialized after strategy | AI notices opportunity without being asked |
| D8 | One question max per turn | Send complex multi-part question | AI answers + asks MAX one follow-up |
| D9 | No hallucination | Ask about a product not in their data | AI doesn't invent details |
| D10 | Budget recommendation | "Should I increase budget?" | Specific advice based on their actual data |
| D11 | Cross-language history | Previous turns Hebrew, current English | Responds in English (not Hebrew) |
| D12 | Connects dots | Link website, GA4, Meta data together | Synthesizes across sources |

---

## E. CONTENT POLICY — 12 scenarios

| # | Input | Expected | Category |
|---|---|---|---|
| E1 | "I sell firearms and ammunition" | blocked=true, category=firearms | Firearms |
| E2 | "outdoor gear, NO firearms" | allowed | Firearms negated |
| E3 | "gun accessories, no actual guns" | allowed | Firearms negated |
| E4 | "I sell cannabis" | blocked=true, category=illegal_drugs | Drugs |
| E5 | "marijuana dispensary" | blocked=true | Drugs |
| E6 | "I sell prescription medications online" | blocked=true, category=unauthorized_pharma | Pharma |
| E7 | "licensed pharmacy" | allowed (not keyword-blocked) | Pharma |
| E8 | "online casino" | blocked=true, category=gambling | Gambling |
| E9 | "MLM business opportunity" | blocked=true, category=pyramid_scheme | MLM |
| E10 | "content promoting racial superiority" | blocked=true, category=hate_incitement | Hate |
| E11 | "organic farm store" | allowed | Legal |
| E12 | "dental clinic" | allowed | Legal |

---

## F. CONNECTORS — 8 scenarios

| # | Scenario | Expected |
|---|---|---|
| F1 | GET /connectors/meta/ad-accounts (hyphen) | Returns accounts list |
| F2 | GET /connectors/meta/adaccounts (no hyphen) | Same as F1 (alias works) |
| F3 | GET /connectors/meta/pages | Returns Facebook pages |
| F4 | Expired token | Shows "Reconnect" (not "Connected") |
| F5 | No Meta connected | 400: Meta is not connected |
| F6 | GET /auth/status | google:true, meta:true, tiktok:true |
| F7 | TikTok OAuth URL | Redirects to TikTok with correct redirect_uri |
| F8 | Select ad account | POST /connectors/meta/account → saves account_id |

---

## G. SOCIAL & PUBLISHING — 10 scenarios

| # | Scenario | Expected |
|---|---|---|
| G1 | Generate social post (from strategy) | Post content matches strategy direction |
| G2 | Schedule post for future | status=scheduled, publish_at set |
| G3 | Post in Hebrew | Hebrew content, RTL-aware |
| G4 | Post in English | English content |
| G5 | Social credits consumed (Scale) | scale_post_credits_used increments |
| G6 | Comments inbox — new comment | Categorized: lead/complaint/praise/question/neutral |
| G7 | Lead comment → WhatsApp | WhatsApp link generated with pre-filled message |
| G8 | Crisis detection | High-volume negative comments → crisis alert |
| G9 | Brand-voice reply | AI-suggested reply matches brand tone |
| G10 | Approval mode = strict | Post requires human approval before publish |

---

## H. BILLING — 8 scenarios

| # | Scenario | Expected |
|---|---|---|
| H1 | Free plan limits | Cannot use Scale features |
| H2 | Upgrade to Scale (Stripe checkout) | Plan upgrades, credits available |
| H3 | Downgrade | downgrade_requested_at set, access until period end |
| H4 | Webhook fires | Stripe event updates billing_customers |
| H5 | Invoice generated | Invoice record created after charge |
| H6 | Credits reset new month | scale_*_credits_used reset to 0 |
| H7 | Credit consumed flag | credit_consumed=true for Scale first generation |
| H8 | Downgrade → no new credits | credit_consumed=false even if credits remain |

---

## I. DASHBOARD & SETTINGS — 8 scenarios

| # | Scenario | Expected |
|---|---|---|
| I1 | Dashboard loads | KPIs show, no JS errors |
| I2 | Empty state (no campaigns) | Friendly empty state, not crash |
| I3 | Settings save — basic fields | budget, management_percentage, goal saved |
| I4 | Settings save — budget_currency | budget_currency=USD stored (P1-3 regression) |
| I5 | Settings save — brand DNA | brand_colors, do_not_change_elements saved |
| I6 | Strategy re-generated after settings change | Calls /onboarding/analyze again |
| I7 | Notification bell | News alerts appear |
| I8 | Risk level change | conservative/balanced/aggressive saved |

---

## J. ERROR STATES & EDGE CASES — 12 scenarios

| # | Scenario | Expected |
|---|---|---|
| J1 | Missing required field in creative generate | 400 with clear message (not stack trace) |
| J2 | Invalid creative type | 400: "type must be one of: avatar, cinematic, animation, image" |
| J3 | Unknown tenant | 401/403, no data leaked |
| J4 | Parent job not found in revision | 404: "Parent job not found" |
| J5 | OpenAI error (bad key) | 500 with safe message (no org_id) |
| J6 | Supabase unavailable | 500 with "service unavailable", no raw SQL |
| J7 | Strategy with empty settings | Graceful fallback, not crash |
| J8 | Brief as string (P1-2 regression) | Stored as {prompt:"..."}, not {"0":"A"...} |
| J9 | Budget 0 | Validation error before processing |
| J10 | management_percentage = 0 | Validation error |
| J11 | Very long brief (10k chars) | Handled, truncated gracefully |
| J12 | XSS in brief field | Stored as text, never executed |

---

## K. AI INTELLIGENCE TESTS — 8 scenarios
### (Testing real quality of AI brain, not just correctness)

| # | Test | What we're checking |
|---|---|---|
| K1 | "My ROAS dropped 40% last week, what happened?" | AI gives specific hypotheses based on actual data, not generic advice |
| K2 | "Should I advertise on TikTok?" | AI says no if audience is 45+ or B2B, gives specific reasoning |
| K3 | "My competitor is running huge sales" | AI gives concrete counterstrategy, not "consider doing the same" |
| K4 | "I have ₪500 budget — is it enough?" | Honest assessment: below threshold for most platforms, specific advice |
| K5 | "What should my first ad say?" | Copy direction specific to THIS business, not generic template |
| K6 | "Is my cost per lead good?" | References actual industry benchmark injected from DB |
| K7 | "Add Instagram to my strategy" | Checks if IG is connected first; if not, guides to connect |
| K8 | Multi-turn memory | References fact from turn 1 in turn 8 without re-asking |

---

## L. MULTI-USER & SECURITY — 6 scenarios

| # | Scenario | Expected |
|---|---|---|
| L1 | Tenant A cannot see Tenant B creative_jobs | 404 for cross-tenant resource access |
| L2 | Tenant A cannot see Tenant B client_settings | 404 |
| L3 | Two users same tenant — both see same data | Both get same creative_jobs |
| L4 | VIGMIS_TEST_SECRET not set → test auth disabled | Bearer test:... returns 401 |
| L5 | Expired Clerk token | 401 with clear auth error |
| L6 | No Authorization header | 401 |

---

## M. CREATIVE GALLERY (output format)

Every creative generated in QA writes to:
`qa-results/creatives/NNN_NAME/story.md`

### story.md format:
```
# Creative: [name]
## Scenario: [what this tests]
## Brief sent:
{...json...}
## Prompt injected to gpt-image-1:
"..."
## Result:
- Status: PASS / FAIL
- Output URL: [url]
- Critic Score: X/10
- revision_number: N
## Assessment:
[2 sentences on quality and correctness]
```

---

# PART 3 — HOW I RUN IT

## Execution Plan (Workflow — parallel agents)

```
Phase 1 (parallel, ~20 agents):
  - Regression tests (P0-3, P1-1 through P1-7) — each one agent
  - Content policy (E1-E12) — 2 agents (6 each)
  - Connector tests (F1-F8) — 1 agent
  - Error state tests (J1-J12) — 2 agents

Phase 2 (parallel, ~15 agents):
  - Creative generation C1-1 through C1-6 — 6 agents
  - Each writes to qa-results/creatives/

Phase 3 (sequential, ~10 agents):
  - Revision flow C2, C3, C4 (must be sequential — depends on job IDs)
  - Keep/Change C5
  - AI Critic C6

Phase 4 (parallel, ~10 agents):
  - Approval flow C7
  - Chat AI Brain D1-D12 — 3 agents (4 each)
  - Intelligence tests K1-K8 — 2 agents

Phase 5 (parallel, ~8 agents):
  - Onboarding regression A2, A3, A4
  - Strategy tests B1-B4
  - Dashboard/Settings I1-I8

Phase 6 (1 agent):
  - Compile MASTER_REPORT_v3.md from all results
  - Update qa-results/creatives/INDEX.md
```

## Total: ~65 agents, ~15-20 min
## Output: 
- qa-results/MASTER_REPORT_v3.md
- qa-results/creatives/INDEX.md  
- qa-results/creatives/001_*/story.md through 030_*/story.md

---

# READY TO RUN
Type "תריץ" to launch the full QA workflow.
