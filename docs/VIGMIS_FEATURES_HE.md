# Vigmis — ספר מלא: כל מה שיש במערכת

**תאריך עדכון:** 2026-06-11  
**מקור אמת לתמחור:** `apps/api/src/billing/pricing.ts`  
**מקור אמת לטכנולוגיה:** קוד בפועל ב-monorepo  
**הערה:** זהו תיעוד מלא — כל פיצ'ר, כל שירות, כל אפשרות, כל תצורה, כל API, כל cron, כל טבלה

---

## 1. מה זה Vigmis

Vigmis היא פלטפורמת SaaS לניהול פרסום דיגיטלי אוטומטי לעסקים קטנים ובינוניים.

### 1.1 מה Vigmis עושה בשביל הלקוח

- מנהלת קמפיינים בתשלום (Google Ads, Meta Ads, TikTok Ads) — תקציבים, bid, A/B, אופטימיזציה יומית
- מייצרת ומפרסמת תוכן אורגני (פוסטים, תמונות, סרטונים) ב-Facebook, Instagram, TikTok
- מגיבה לתגובות בסושיאל מדיה — מסווגת, מציעה תגובות, מתריעה על משברים ולידים
- מנתחת ביצועים אמיתיים דרך GA4 (לא נתוני הפלטפורמות שמנופחים)
- שולחת תדריכים יומיים/שבועיים ב-WhatsApp + Email
- מייצרת קריאייטיב (סרטונים, תמונות) דרך HeyGen / Replicate / DALL-E
- מנהלת את תקציב AI באופן חכם (Circuit Breaker מגן על מרווח)

**מה הלקוח עושה:** Onboarding חד-פעמי + אישורים תקופתיים. הכל אחר — Vigmis.

### 1.2 מבנה תאגידי

| ישות | תפקיד | רישום |
|---|---|---|
| **Taurus Management and Investments Ltd.** | IP owner, פיתוח, תשתית טכנולוגית | ישראל, ח.פ. 514565118 |
| **VIGMIS US LLC** | מכירות, Stripe account holder, Merchant of Record | Wyoming, USA (בהקמה) |

- **Split:** 75% Net Revenue ל-Taurus / 25% ל-VIGMIS US
- **Governing Law:** ישראל, בתי משפט ת"א (עד השלמת LLC)
- **vigmis.com** — בבעלות Taurus
- כל מנועי הטכנולוגיה (AI, optimization, brand voice, publisher shield) — ב-Taurus
- VIGMIS US = פנים מול לקוחות + Stripe + PCI compliance

---

## 2. Onboarding — 7 שלבים (+ שלב שמירה נסתר)

### שלב 1 — ניתוח אתר אוטומטי

**מה קורה:**
- Crawl של עמוד הבית + עד 5 עמודי משנה
- חילוץ Open Graph metadata, JSON-LD Product schema
- User-Agent של דפדפן (לא bot — עוקף חסימות בסיסיות)
- "Confidence gate": מתחת ל-500 תווים → שגיאה מפורשת (לא ממציאים תוכן)
- תוצאה נשמרת ב-`client_settings.website_analysis`

**מה המנוע מחלץ:**
- WHAT THEY SELL — מוצרים, מחירים, טווח
- TARGET CUSTOMER — דמוגרפיה, אורח חיים, צרכים
- POSITIONING & USP — מבדלים, ערך מוצע
- BRAND VOICE — טון, אישיות, אותות אמון
- CONVERSION ARCHITECTURE — CTA ראשי, funnel, הצעה
- STRENGTHS — מה עובד באתר
- WEAKNESSES — אלמנטים חסרים
- AD HOOKS — 3 זוויות מסר ספציפיות מהתוכן

**שיפור עתידי מתוכנן:** Re-crawl שבועי אוטומטי + Lighthouse/Core Web Vitals audit + trust signals extraction

---

### שלב 2 — שיחת AI (Intake Interview)

**מנגנון:** Claude מנהל שיחת intake — לא טופס סטטי. עד 10 נושאים:

| נושא | פרטים |
|---|---|
| Business type | ecommerce / hero_product / lead_gen / saas / general_store |
| Website URL | עם בדיקת נגישות |
| Monthly budget | מקבל כל מטבע, ממיר ל-ILS |
| Management % | 10%-100% — אחוז שנותנים ל-Vigmis לנהל |
| Goal | leads / purchases / traffic / awareness |
| Margin % | רק אם goal=purchases או business_type=ecommerce/hero_product |
| Hero product | שם + margin — רק אם business_type=hero_product |
| Geography | כולל (geo_include) + מוחרג (geo_exclude) |
| Exclusions | מה לעולם לא לפרסם |
| Open notes | פלטפורמות מועדפות, risk_level, dayparting rules |

**תוצאה:** `client_settings` מתמלא בכל שדות הנדרשים לאסטרטגיה

---

### שלב 3 — חיבור Meta (Facebook + Instagram)

- Facebook Login OAuth
- **Scopes:** public_profile, ads_read, ads_management, pages_show_list, pages_read_engagement, pages_manage_posts, business_management, instagram_basic, instagram_content_publish, instagram_manage_comments
- **Token:** Long-lived 60 ימים + רענון אוטומטי
- בחירת Page מפורשת (אין ניחוש אוטומטי) — אין pages[0] אוטומטי
- Instagram מוצג אוטומטית לכל Page שמחובר
- Ad Account נבחר בנפרד
- **Business Verification:** אושר (ID 3698041317002548)
- **App Review status:** public_profile בלבד אושר; שאר ה-scopes ממתינים להגשה חוזרת עם סרטון end-to-end

**שגיאות מוכרות:**
- "Vigmis does not have admin access to Page X" → הוראה לבחור Page אחר
- "Page role too low" → הוראה לעדכן role ב-Facebook Page Settings
- Permission error (`#100/#200`) → מודאל Reconnect Facebook

---

### שלב 4 — חיבור Google Ads (אופציונלי)

- OAuth נפרד מ-GA4 (Scope: adwords בלבד)
- בחירת Account מפורשת לאחר חיבור
- Quota: 15,000 ops/יום (Basic Access)
- Standard Access — יוגש ב-10,000 משתמשים

---

### שלב 5 — חיבור TikTok (אופציונלי)

- **TikTok for Developers** (open.tiktokapis.com) — Content Posting
  - Scopes: `user.info.basic`, `video.upload`
  - `video.publish` הוסר (לא אושר), הוגש מחדש
  - Upload: FILE_UPLOAD (לא PULL_FROM_URL — חוסך verify domain)
- **TikTok for Business** (business-api.tiktok.com) — Marketing API
  - ממתין לאישור

---

### שלב 6 — חיבור GA4 + Shopify (אופציונליים)

**GA4:**
- OAuth נפרד (Scope: analytics.readonly בלבד)
- Properties Picker אוטומטי לאחר חיבור
- Sync יומי 02:30 UTC דרך Data API
- שמירה ב-`ga4_daily_metrics` (sessions, conversions, revenue per source/medium)

**Shopify:**
- Webhook-based להזמנות/checkout/ביטול
- Full catalog sync (products + shipping zones + currency)
- AOV model — Average Order Value per customer
- Webhook endpoint: `/track/shopify/webhook` + HMAC verification
- Cron sync יומי 03:00

---

### שלב 7 — Social Media + הגדרות אישור

**Social Opt-In:**
- הלקוח בוחר פלטפורמות: Facebook / Instagram / TikTok
- Approval Mode לפי פלטפורמה:
  - **Auto:** פרסום אוטומטי ללא המתנה
  - **Review:** כל פוסט ממתין לאישור לפני פרסום
  - **Strict:** אישור + Human Review לפני כל דבר

**Conservative vs Active Mode:**
- **Conservative:** כל פעולה משמעותית (scale, pause, תקציב) דורשת אישור
- **Active:** פעולות אוטומטיות ללא המתנה — engine פועל עצמאית

---

### שלב נסתר — שמירה + פעולות רקע

לאחר השלמת onboarding, ברקע:
1. שמירת כל `client_settings`
2. Brand Voice Extraction — LLM מנתח אתר + שיחה → `brand_voice_profile`
3. Creative Brief Extraction — pain/promise/proof/objection model → `creative_brief`
4. Conversion Readiness Audit — score 0-100 → verdict (block/fix_before_ads/ready)
5. Strategy Generation — אסטרטגיה מלאה כולל budget allocation, CPC משוערים, custom benchmarks
6. Attestation gate — 3 הצהרות חובה: `onboarding_master`, `tos_acceptance`, `ai_disclosure_consent`

---

## 3. חיבורי פלטפורמות

### 3.1 Meta (Facebook + Instagram)

ראה §2 שלב 3 לפרטים מלאים.

**ניתוק:**
- `DELETE /me/permissions` ב-Facebook
- מחיקה מ-DB + ניקוי social_settings
- נרשם ב-audit_log

---

### 3.2 Google Ads

ראה §2 שלב 4 לפרטים.

**ניתוק:** revoke token API + מחיקה מ-DB

---

### 3.3 TikTok

ראה §2 שלב 5 לפרטים.

**מצב נוכחי:** אין Client Key עדיין — ממתין. Marketing API ממתין לאישור.

---

### 3.4 Google Analytics 4

ראה §2 שלב 6 לפרטים.

---

### 3.5 Shopify

ראה §2 שלב 6 לפרטים.

---

### 3.6 Pixel Tracking (first-party)

- **Snippet:** JavaScript pixel שמוטמע באתר הלקוח
- **Events שנאספים:** pageview / lead / purchase / add_to_cart / initiate_checkout
- **Parameters:** gclid, fbclid, ttclid, utm_source, utm_medium, utm_campaign, utm_content, order_id, value, currency
- **Endpoint:** `/track/pixel`
- **Snippet URL:** `GET /track/snippet` — קוד ל-copy-paste
- **Verify:** `POST /track/verify` — בודק אם pixel ירה ב-30 ימים אחרונים
- **Storage:** `conversion_events` table

---

## 4. אסטרטגיה (Strategy)

### 4.1 ייצור אוטומטי

מבוסס על:
- ניתוח האתר (website_analysis)
- תשובות השיחה (client_settings)
- Conversion Readiness verdict
- Custom benchmarks מהענף

**פלט האסטרטגיה:**
- חלוקת תקציב בין Google / Meta / TikTok
- קהל יעד מפורט
- CPC משוער + Custom benchmarks (minCtr, goodCtr, maxCpc, maxCpa)
- Funnel מלא (awareness → consideration → conversion)
- המלצות קמפיין ממוקדות
- Creative Briefs ראשוניים
- הצעות פלטפורמות חסרות
- המלצות אורגני
- Conversion Readiness verdict

**שמירה:** `client_settings.strategy_plan`

---

### 4.2 Conversion Readiness Gate

- LLM מבצע audit על האתר לפני שמשיקים קמפיין
- Score 0-100:
  - ≥70 = ready
  - 40-69 = fix_before_ads
  - <40 = block (חוסם השקת קמפיין עד שהלקוח מתקן)
- בודק: checkout flow, CTA, forms, pixel, mobile readiness

---

### 4.3 Strategy Viewer

- לשונית Strategy ב-Dashboard
- מציג: ניתוח האתר, תוכנית קמפיין מלאה, Change History מה-audit_log
- "Re-analyze website" → ריצה חוזרת
- "Rethink strategy" → חזרה ל-onboarding

---

### 4.4 Custom Benchmarks

טבלה `custom_benchmarks` per-client:

| שדה | תיאור |
|---|---|
| minCtr | CTR מינימלי לכניסה לקמפיין |
| goodCtr | CTR "טוב" לענף הזה |
| maxCpc | CPC מקסימלי לפני pause |
| maxCpa | CPA מקסימלי לפני scale-down |
| learningDays | ימי learning phase לפני פעולה |

מוזרקים לכל החלטת אופטימיזציה.

---

## 5. ניהול קמפיינים

### 5.1 יצירה ותפעול

- פתיחת קמפיינים ב-Google / Meta / TikTok
- הגדרת תקציבים יומיים וחודשיים
- אופטימיזציית bid
- A/B testing
- Pause / Resume אוטומטי
- Dayparting rules — by day of week + hour

---

### 5.2 Optimization Engine — מה האלגוריתם עושה

**מקור נתונים: GA4** (לא self-reporting של הפלטפורמות)

| פעולה | תנאי |
|---|---|
| Scale up +20% תקציב | ROAS ≥ 2 + Statistical Significance (Wilson CI ≥90%) |
| Scale down -20% | CPA חורג מ-maxCpa |
| Pause | 0 conversions אחרי חלון זמן |
| Creative refresh alert | Creative fatigue (proportions z-test) |
| Targeting review | Stagnation alert |

---

### 5.3 Statistical Significance Gating

- `services/significance.ts` — Wilson confidence intervals
- `safeToScaleUp` דורש: CI ≥90% + min spend max($30, 2× daily budget)
- `proportionsDiffer` — 2-prop z-test לזיהוי creative fatigue
- מחובר ל-`optimization/rules.ts` — **אין פעולה ללא significance**

---

### 5.4 תדירות אופטימיזציה

| מסלול | ריצות ביום | שעות UTC |
|---|---|---|
| Grow | 3 | 03:00, 11:00, 19:00 |
| Scale | 6 | + 07:00, 15:00, 23:00 |

---

### 5.5 Conservative Mode

- כל פעולה יוצרת "Decision Protocol" — ממתין לאישור
- Active Mode → פעולות מיידיות

---

### 5.6 Context-Aware Optimization

- **Calendar:** Black Friday, Cyber Monday, Christmas, Valentine's, Back-to-School, חגים ישראלים (Yom Kippur, Passover, High Holidays)
- **Weather:** OpenWeatherMap 3-day forecast. Per-business sensitivity (hot_boost/rain_dampens/etc). 2×/day
- **News:** NewsAPI + LLM relevance filter. Alerts על relevance ≥0.7. Cron כל 6 שעות
- `getOperationalContext` משלב הכל לcontext אחד לכל החלטה

---

### 5.7 Decision Protocols (Approval Workflows)

כשמשתמש ב-Conservative Mode, כל פעולה משמעותית יוצרת Protocol:

**סוגי protocols:**
- `strategy_approval` — אישור אסטרטגיה ראשונית
- `budget_change` — שינוי תקציב
- `campaign_pause` — הקפאת קמפיין
- `campaign_resume` — חידוש קמפיין
- `campaign_scale` — הגדלת תקציב
- `creative_refresh` — רענון קריאייטיב
- `targeting_review` — בדיקת קהל יעד
- `stagnation_alert` — התראת קיפאון
- `general_advice` — עצה כללית

**סטטוסים:** pending → in_discussion → approved / rejected / expired

**זרימה:**
```
Engine מזהה opportunity
        ↓
יוצר Decision Protocol (pending)
        ↓
לקוח רואה ב-Dashboard + קבלת התראה
        ↓
לקוח יכול: לדון (שיחה), לאשר, לדחות
        ↓
אישור → Engine מבצע בפועל
```

**Auto-expire:** protocols שלא טופלו מסתיימים אוטומטית לאחר X ימים.

---

### 5.8 Metric Interpretation

`services/metric-interpreter.ts` — bands per (metric × campaign_type × category)

| Metric | verdicts |
|---|---|
| ctr | excellent / good / normal / concerning / critical |
| frequency | context-aware: 4 ב-retargeting = good; 4 ב-prospecting = concerning |
| hook_rate | TikTok-specific |
| completion_rate | video watch-through |
| roas | excellent / good / normal / concerning / critical |
| cpa | excellent / good / normal / concerning / critical |

---

## 6. Analytics & Attribution

### 6.1 GA4 כ-Ground Truth

כל הפלטפורמות מנפחות נתונים (double-counting, view-through attribution). GA4 = מקור יחיד, ללא הטיה.

---

### 6.2 UTM Match

- כל קמפיין של Vigmis מקבל UTM אוטומטי
- חיבור campaign_name ↔ source/medium ב-GA4

---

### 6.3 Inflation Factor

- השוואה GA4 vs platform self-report
- תיקון החלטות ה-engine לפי הפער

---

### 6.4 Incrementality

- `services/incrementality.ts` — floor estimate: incremental_roas = new_customer_revenue / ad_spend
- מבוסס על GA4 new_users + first_time_purchasers
- `tenant_incrementality_snapshot` — cached

---

### 6.5 Budget Scenario Modeling

- `GET /analytics/budget-forecast?budget=N`
- 4 תרחישים: Conservative (50%) / Current / Growth (2×) / Aggressive (4×)
- מבוסס על GA4 ROAS היסטורי

---

### 6.6 Creative Theme Learning

- `GET /intelligence/creative-themes`
- ניתוח 90 ימים אחרונים: אילו themes עובדים הכי טוב

---

### 6.7 True ROAS & True Profit

- `conversion_tracking_snapshots` — daily snapshot
- `true_roas` = revenue (Shopify/pixel) ÷ ad_spend
- `true_profit` = (revenue × margin%) − ad_spend
- `data_source` field: shopify / pixel / none

---

### 6.8 Export & Reports

**פורמטים:** CSV (Excel-compatible, UTF-8 BOM) / HTML (print-friendly, triggers browser print dialog)

| Export | Endpoint | תוכן |
|---|---|---|
| Analytics | `GET /export/analytics?period=7\|30\|90&format=csv\|html` | KPIs, daily trend, campaign breakdown |
| Campaigns | `GET /export/campaigns?format=csv\|html` | שם, פלטפורמה, סטטוס, תקציב, ימי ריצה |
| Social | `GET /export/social?format=csv\|html` | פוסטים + תגובות + analytics |
| Marketing Plan | `GET /export/marketing-plan?format=html` | מסמך אסטרטגיה מלא (printable) |
| Invoice | `GET /export/invoice?format=html` | חשבונית מפורטת (printable) |

**הורדת נתונים לפני מחיקה:** לקוח יכול להוריד JSON של כל נתוני הקמפיין מ-Settings → Export Data

---

## 7. תוכן אורגני (Social Media)

### 7.1 ייצור פוסטים

- שבועי אוטומטי (Facebook + Instagram + TikTok)
- מבוסס על ניתוח האתר + אסטרטגיה + Creative Brief
- שפה: `client_settings.content_language` — מפורש או auto (Unicode detection)
- Brand Voice: מחובר לכל generation. Tone, lexicon, formality מ-`brand_voice_profile`
- Hashtags, CTA, לוגו — מוזרקים אוטומטית
- Content Pillars: educational / promotional / social_proof / behind_the_scenes / trending
- AI Disclosure: suffix מתויג אוטומטית לפי פלטפורמה + EU AI Act

---

### 7.2 Creative Brief Layer

- Dialog לפני כל יצירה: Product / Message / Style / CTA
- ה-brief עובר ל-LLM לפני brand voice block
- מחובר גם לפוסטים, גם לסרטונים, גם לתמונות
- `services/creative-brief.ts` — extractCreativeBrief (pain/promise/proof/objection model)

---

### 7.3 Brand Voice Engine

- `services/brand-voice.ts` — extractBrandVoice מניתוח אתר
- מחובר לכל paths: posts + replies + creatives
- **Human Override Learning:** כשמשתמש עורך תגובת AI, המערכת לומדת מהפערים (Levenshtein diff). אחרי ≥10 עריכות משמעותיות → LLM מעדכן `brand_voice_profile`

---

### 7.4 מחזור חיי פוסט

```
Draft → AI-generated → Pending Approval → Approved → Scheduled → Published
                                        ↘ Rejected
```

- עריכה ידנית לפני אישור
- תזמון לתאריך + שעה
- AI Policy check לפני אישור (pre-flight + post-flight)
- High-stakes cooling-off: 1 שעה השהיה אם יש טענות מחירים/ערבויות/urgency
- Two-Key Pattern: סיווג שני עצמאי לtier 1 + trust watch/restricted

---

### 7.5 פרסום

| פלטפורמה | מצב |
|---|---|
| Facebook Page feed | ✅ פעיל |
| Instagram Business | ✅ פעיל (תמונה חובה) |
| TikTok | ✅ FILE_UPLOAD מוכן — ממתין לאישור scope video.publish |

**עלות per-post (add-ons):**
- פוסט + תמונת AI חדשה + פרסום: $1.00
- פוסט + תמונה קיימת + פרסום: $0.70

---

### 7.6 Pre-launch Creative Scoring

- `POST /creatives/score`
- GPT-4o Vision מנתח: attention / clarity / emotion / cta_presence
- ציון 0-100 + verdict (excellent/good/fair/poor) + tips לשיפור

---

## 8. ייצור קריאייטיב (Videos & Images)

### 8.1 סוגי קריאייטיב

| סוג | פרובידר | מחיר בסיסי | זמן המתנה |
|---|---|---|---|
| Avatar Video (AI spokesperson) | HeyGen | $15 | ~3 דקות |
| Cinematic Video | Replicate (minimax/video-01) | $12 | ~5 דקות |
| Animation Video | Replicate (lucataco/animate-diff-v2) | $8 | ~4 דקות |
| Image Creative (standalone) | DALL-E / Replicate | $5 | שניות |

**פרסום:** קנייה כוללת פרסום ב-FB/IG/TikTok ללא הגבלה.

---

### 8.2 זרימת יצירה

```
POST /creatives/generate
        ↓
 brief מועשר (לוגו + CTA + brand voice + Brand DNA)
        ↓
 אם provider API key חסר → status: pending_setup
        ↓
 שליחה ל-HeyGen / Replicate / DALL-E
        ↓
 polling GET /creatives/:id/status
        ↓
 completed → upload ל-Supabase Storage
        ↓
 Approve / Reject / Request Revision
```

---

### 8.3 מערכת Revisions

| Revision | עלות |
|---|---|
| 0 (דור ראשון) | חינם |
| 1 (תיקון ראשון) | חינם |
| 2 (תיקון שני) | חינם |
| 3–5 | 50% ממחיר דור ראשון |
| 6+ | חסום — חייבים creative חדש |

**מחירי revision 3–5 (50%):** Avatar $7.50 / Cinematic $6.00 / Animation $4.00 / Image $2.50

**אישור = נעילה:** לאחר אישור → closed. כל שינוי = creative חדש.

**Auto-discard:** קריאייטיב שהושלם אך לא אושר תוך 7 ימים → נדחה אוטומטית, ללא חיוב.

**מקסימום:** 5 revisions לכל brief.

---

### 8.4 Approve & Pay Flow

- Revision 0–2: `POST /creatives/:id/approve` → sets `approved_at`, ללא חיוב
- Revision 3–5: `POST /creatives/:id/approve` → יוצר Stripe Checkout → 402 + `checkout_url` (50%)
- לאחר תשלום: webhook `checkout.session.completed` → `approved_at` נרשם

---

### 8.5 Reject Flow

- `POST /creatives/:id/reject` → status=rejected, אין חיוב
- Auto-discard cron 02:00 UTC: `completed` + `approved_at IS NULL` + `updated_at < 7 days ago` → rejected

---

### 8.6 Credits לפי מסלול

| | Grow | Scale |
|---|---|---|
| Video Credits / חודש | 0 | 1 (כל סוג) |
| Image Credits / חודש | 0 | 3 |
| Post Credits / חודש | 0 | 5 |

Credits לא מצטברים. נאפסים ב-1 לחודש. לא ניתנים להחזר.

---

### 8.7 Brand DNA System

- כל Creative מקבל אוטומטית Brand DNA injection לפני שליחה ל-provider
- **Brand Colors:** עד 5 hex colors ב-Settings → Brand DNA
- **Do Not Change Elements:** Logo / Product / Face/Person / Colors / Background / Text / Layout
- **Approved Styles:** styles שנלמדו מ-creatives שאושרו בעבר
- DNA string מוזרק לתוך prompt/script לפני שליחה

---

### 8.8 Keep/Change Form (לrevisions)

כשמשתמש לוחץ "Request Revision":
1. Checkboxes — מה **לשמור בדיוק:** Logo, Product, Face, Background, Text, Colors
2. שדה טקסט — מה **לשנות**
3. API בונה: `"KEEP EXACTLY: [list]. CHANGE ONLY: [description]. DO NOT modify anything else."`

---

### 8.9 Creative Studio Pro (/studio)

- עמוד נפרד `/studio` — ניהול כל ה-creatives
- Version History (V1→V2→V3) timeline לכל creative
- Compare: השוואת שתי גרסאות זו לצד זו
- Restore: יצירת revision חדש מ-brief של גרסה ישנה
- Status badges: queued / processing / completed / failed / approved / credit-used
- Approve / Discard / Request Revision

---

### 8.10 AI Critic Service (תמונות בלבד)

- `services/creative-critic.ts` — GPT-4o Vision משווה before/after
- Returns: `{ score: 0-1, issues: string[], pass: boolean }`
- score ≥ 0.75 = pass; < 0.75 = fail → regenerate silently (עד 2 retries)
- `critic_score` נשמר ב-`creative_jobs.critic_score`
- רק לrevisions עם תמונות — לא לסרטונים (יקר מדי)

---

### 8.11 Best-of-3 Images (DALL-E בלבד)

- כל יצירת תמונה מייצרת 3 variants במקביל
- כל variant עובר דרך `creative-scorer.ts` (GPT-4o Vision)
- ה-variant עם הציון הגבוה ביותר מוחזר ללקוח
- כל 3 URLs נשמרים ב-`creative_jobs.brief._all_candidate_urls`

---

### 8.12 אחסון קריאייטיבים

- כל קריאייטיב מועלה ל-Supabase Storage bucket "creatives" לאחר completion
- URL קבוע ב-CDN
- Provider URL (HeyGen/Replicate) = fallback אם storage נכשל

---

## 9. Social Inbox — ניהול תגובות

### 9.1 סיווג אוטומטי (Taxonomy v2)

10 קטגוריות: `positive` / `question` / `purchase_intent` / `lead` / `complaint` / `angry` / `troll` / `hate` / `legal_risk` / `spam`

גם: `do_not_engage` flag, `priority_score` (0-100), `routing_recommendation`, `reply_blocked_by_policy`

---

### 9.2 Auto-Reply Logic

- Confidence ≥0.85 → auto-reply אפשרי
- מתחת לסף → Human approval חובה
- Draft reply עובר policy-classifier לפני שמירה
- Brand voice מחובר לכל reply

---

### 9.3 Priority Engine

- Score 0-100: sentiment × recency × reach × goal
- Hot (≥75) → WhatsApp+Email digest מיידי
- Cron כל 30 דקות

---

### 9.4 Comment-to-Lead

- קטגוריה `lead` + `purchase_intent` → digest ל-WhatsApp + Email
- 4 שפות (en/he/ar/ru)
- Fingerprint — אין double-send

---

### 9.5 Crisis Detection

- Snapshot יומי + baseline 7 ימים
- Z-score ≥2.5 → crisis alert
- Per-metric: complaint/angry/hate/legal_risk/total
- Critical notification + flag `crisis_alert_sent`

---

### 9.6 Human Override Learning

- כל פעם שמשתמש עורך תגובת AI → נרשם ב-`reply_override_log` (Levenshtein diff)
- אחרי ≥10 עריכות משמעותיות → LLM מנתח patterns → מעדכן `brand_voice_profile`

---

### 9.7 Insights Mining

- LLM מאגד קריאייטיב מ-90 ימים: שאלות חוזרות / התנגדויות / תלונות / שבחים / feature requests
- min 3 occurrences. suggested_action קונקרטי
- Cron יומי 05:00

---

## 10. יועץ AI (Chat)

### 10.1 כיצד עובד

- זמין בכל עמוד (global chat, root layout, Clerk auth)
- מקבל `pageContext` (pathname) + נתוני הלקוח
- Intent Router: מסווג כל בקשה ל-6 פחים לפני LLM

---

### 10.2 Intent Router — 6 פחים

| פח | פעולה |
|---|---|
| Native capability | בצע |
| Subscription gate | "זמין ב-Scale — שדרג כאן" |
| Platform limitation | "Meta TOS אוסר X. החלופה: Y" |
| Legal block | סירוב + הסבר |
| Ethical block | סירוב + הסבר ערכי |
| Out of scope but adjacent | "אני כלי שיווק. לזה תצטרך עו"ד. הנה התובנה השיווקית" |

**כלל:** כל "לא" כולל (א) סיבה (ב) מה כן אפשר

---

### 10.3 Pipe Actions (ב-Chat)

- `create_post|platform|pillar`
- `write_post|platform|pillar|text`
- `edit_post|postId|new_text`
- `set_post_image|postId|url`
- `approve_post|postId`
- `reject_post|postId|reason`
- `schedule_post|postId|ISO_datetime`
- `select_ad_account|act_xxx`

---

### 10.4 מכסות AI לפי תקציב + מסלול

| Tier | הוצאות חודשיות | Sessions | Comments auto-handled |
|---|---|---|---|
| T1 | עד $1,000 | 30 | 300 |
| T2 | $1,001 – $3,000 | 75 | 800 |
| T3 | $3,001 – $6,000 | 150 | 2,000 |
| T4 | $6,001 – $12,000 | 300 | 4,000 |
| T5 | $12,000+ | 400 | 6,000 |

**Session = עד 12 הודעות.** חבילה נוספת: +25 sessions = $9.

---

## 11. Proactive Briefings

### 11.1 מה הם

- תדריך ביצועים שנשלח אוטומטית ב-WhatsApp + Email
- מה הוצא, מה ה-ROAS, מה ה-AI שינה ולמה

### 11.2 תדירות

| | Grow | Scale |
|---|---|---|
| תדירות | שבועי (ב') | יומי |

### 11.3 שפות

- 4 שפות: en / he / ar / ru
- RTL email לעברית וערבית

---

## 12. מערכת התראות מלאה

### 12.1 Daily Report (Email — כל בוקר)

נשלח ב-08:00 אם `email_enabled = true`:
- KPIs אתמול: spend, conversions, ROAS, CPA, CTR, impressions
- % מהתקציב היומי שנוצל
- פעולות AI שרצו בלילה
- התראות הדורשות תשומת לב
- אישורים ממתינים (Decision Protocols)
- פוסטים ממתינים לאישור
- תגובות ממתינות לטיפול

---

### 12.2 Weekly Digest (Email — כל ב')

- כמות קמפיינים פעילים + תקציב יומי כולל
- AI Visibility Score (geo report) — ציון A-F
- רשימת קמפיינים (פלטפורמה, סטטוס, תקציב)
- סיכום התראות
- פעילות סושיאל (פוסטים שפורסמו, ממתינים, תגובות שטופלו)
- Pro plan upsell (למשתמשי Grow עם הוצאה גבוהה)

---

### 12.3 Monthly Report (Email — 1 לחודש)

- סיכום ROI (% + $ רווח)
- ROAS לעומת חודש קודם
- ביצועי קמפיין (המוצלח ביותר highlighted)
- נתוני סושיאל
- סכום חשבונית (עמלת ניהול + שירותי סושיאל)
- כמות אופטימיזציות AI שהופעלו

---

### 12.4 Comment-to-Lead Digest (WhatsApp + Email — מיידי)

- מופעל כשיש תגובה מסוג lead / purchase_intent
- 4 שפות
- Fingerprint למניעת כפילויות
- Hot score ≥75 → מיידי

---

### 12.5 Crisis Alert (מיידי)

- Z-score ≥2.5 → Critical notification
- WhatsApp + Email
- `crisis_alert_sent` flag למניעת spam

---

### 12.6 Ghost Cleanup Emails (Cron)

- **יום 30:** "החשבון שלך מוכן — עדיין לא השקת קמפיין"
- **יום 60:** "תזכורת אחרונה — חשבונות ללא פעילות עשויים להיבדק"
- לא מוחקים — רק מתריעים

---

### 12.7 AI Landscape Digest (Email ל-Team — 1 לחודש)

**מה מגיע ל-`AI_LANDSCAPE_EMAIL`:**
- עדכוני כלי AI יצירתיים (Midjourney, DALL-E, Sora, HeyGen וכו')
- עדכוני פלטפורמות פרסום (Google/Meta/TikTok)
- מודלי AI חדשים (Claude, GPT, Gemini, Llama וכו')
- מודיעין מתחרים (Madgicx, Pencil, Smartly, Albert, Motion)
- המלצות לVigmis — ממוינות לפי עדיפות (high/medium/low) + effort level

---

## 13. Publisher Shield — אחריות ותאימות

### 13.1 Content Policy — 3 Tiers

**Tier 0 — בלוק מוחלט (regex fast-path, ללא LLM):**
- סמים לא חוקיים, נשק, סחר בבני אדם, ניצול קטינים
- דיבה על עסקים בשם. Shaming אנשים פרטיים
- הסתה גזעית / דתית / מגדרית
- פירמידות, הונאות פיננסיות. טענות רפואיות מוחלטות
- שיווק לקטינים של אלכוהול/הימורים/טבק. Doxxing

**Tier 1 — דורש Human Review + רישיון:**
- הימורים / אלכוהול / קנאביס (חוקיות לפי מדינה)
- תוספי תזונה עם טענות בריאות
- שירותים פיננסיים / רפואיים
- פוליטיקה ובחירות

**Tier 2 — מותר עם הסתייגויות:**
- מוצרי מבוגרים (לפי מדינה + פלטפורמה)
- שירותי דייטינג
- ירידה במשקל

---

### 13.2 Geographic Awareness

- חוקיות נבדקת לפי מדינת הלקוח + מדינת היעד של הקמפיין
- דוגמה: קנאביס — חוקי בקליפורניה, פלילי בסעודיה

---

### 13.3 Truth Verification

Vigmis מאמתת טענות בתוכן מול:
- Shopify product catalog (מחיר, מלאי, משלוח)
- `website_analysis`

Blocks: fake_scarcity, shipping_contradiction
Warns: שאר הטענות

---

### 13.4 Trust Tier

- 4 רמות: trusted / standard / watch / restricted
- 3 axes נפרדים: policy_violations / customer_complaints / bypass_attempts
- Daily recompute
- מחובר ל-publish, generation, campaign launch

---

### 13.5 Attestation (הצהרות)

- 3 הצהרות חובה לפני onboarding:
  - `onboarding_master` — הצהרת שימוש כשר
  - `tos_acceptance` — קבלת תנאי שימוש
  - `ai_disclosure_consent` — הסכמה לגילוי AI content
- Re-attestation כל 90 ימים
- `content_attestations` table — כל הצהרה + IP + timestamp + canonical-JSON hash

---

### 13.6 High-Stakes Cooling-Off

- 1 שעה השהיה לפוסטים עם: ערבות/refund/מחיר/הנחה/urgency
- הלקוח יכול לבטל ידנית

---

### 13.7 Stop Loss — סיום לקוח

- Auto-freeze אחרי: ≥5 bypass attempts
- Manual review אחרי: ≥15 policy blocks / ≥3 legal_risk events ב-30 ימים
- Cron יומי + `OPS_ALERT_EMAIL`

---

### 13.8 Admin Kill Switch

- `POST /admin/tenants/:id/freeze` — ADMIN_SECRET header בלבד
- freeze_capabilities: publish / optimize / generation / crons
- `isFrozenFor(tenantId, capability)` מחובר לכל entry points

---

### 13.9 Approval Snapshots

- Forensic-grade: canonical-JSON SHA256, IP, UA, attestation linkage
- מחובר ל-publish + budget changes + campaign launch + onboarding
- משמש כ-evidence of user intent במקרי מחלוקת

---

## 14. מערך החיובים המלא

### 14.1 שני מסלולים

| | Grow | Scale |
|---|---|---|
| שם בקוד (DB) | `free` | `pro` |
| עמלת ניהול | 7% מהוצאות פרסום | 6% מהוצאות פרסום |
| מנוי חודשי | $0 | $49 |
| רצפת מינימום | $29/חודש | $49 (מתוך המנוי) |
| אופטימיזציה | 3×/יום | 6×/יום |
| תדריך | שבועי | יומי |
| פוסטים כלולים | 0 | 5/חודש |
| Reply drafts כלולים | 100 | 300 |
| וידאו כלול | 0 | 1/חודש (כל סוג) |
| Image Creatives כלולים | 0 | 3/חודש |
| משתמשים | 1 | עד 3 |

**נקודת שוויון:** Scale זול יותר מ-Grow בעמלות בלבד כשהוצאות עולות על ~$4,900/חודש.

---

### 14.2 חישוב עמלה חודשית

**Grow:**
```
עמלה = max(7% × הוצאות, $29)
```
- הוצאות $200 → $14 → גובים $29 (רצפה)
- הוצאות $415 → $29 = שוויון
- הוצאות $1,000 → $70

**Scale:**
```
עמלה = $49 + 6% × הוצאות
```
- הוצאות $0 → $49
- הוצאות $500 → $79
- הוצאות $5,000 → $349

**הוצאות מוערכות מ-DB:** תקציב יומי × ימי פעילות (פעיל=100%, מושהה=50%)

---

### 14.3 תוספות בתשלום (Add-ons)

| שירות | מחיר |
|---|---|
| פוסט + תמונת AI חדשה + פרסום | $1.00 |
| פוסט + תמונה קיימת + פרסום | $0.70 |
| תגובה אחרי bundle | $0.05 |
| +25 AI Sessions | $9.00 |
| Image Creative | $5.00 |
| Animation Video | $8.00 |
| Cinematic Video | $12.00 |
| Avatar Video | $15.00 |

---

### 14.4 Circuit Breaker — הגנת מרווח

בכל חודש, מעקב אחרי **יחס עלות AI ÷ עמלה חודשית**:

| אחוז | פעולה |
|---|---|
| < 25% | תקין — Claude Sonnet 4.6 לכל שאלה |
| 25%–30% (Grow) / 40% (Scale) | **Degrade** — GPT-4o-mini לשגרה. קרונים לא חיוניים מושהים |
| ≥ 30% (Grow) / ≥ 40% (Scale) | **Freeze** — כל AI נחסם עד ה-1 לחודש. OPS_ALERT_EMAIL |

GPT-4o-mini = ~20× זול מ-Claude Sonnet.

---

### 14.5 Stripe Billing

| | מנגנון |
|---|---|
| Scale $49/חודש | Stripe Subscription (auto-charge) |
| Creative revision 3–5 | Stripe Checkout one-time |
| Account deletion עם חוב | Stripe Checkout one-time |
| עמלת % חודשית | Draft invoice (לא auto-charge עדיין) |

**שדרוג ל-Scale:**
1. `POST /billing/checkout` → Stripe Checkout session (mode: subscription)
2. Redirect ל-Stripe hosted page
3. webhook `checkout.session.completed` → upsert billing_customers (plan=pro)

**Customer Portal:**
1. `POST /billing/portal` → Stripe Portal URL
2. הלקוח רואה: חשבוניות, ביטול, עדכון כרטיס

**Webhooks:**
- `checkout.session.completed`
- `customer.subscription.created/updated`
- `customer.subscription.deleted` → downgrade ל-free
- `invoice.payment_failed` → status: past_due

---

### 14.6 זרימת מחיקת חשבון

```
לחיצה "Delete Account"
        ↓
1. ביטול Stripe subscription
        ↓
2. חישוב יתרה לחודש הנוכחי
        ↓
        ↙              ↘
יתרה = $0          יתרה > $0
    ↓                    ↓
מחיקה מיידית     Stripe Checkout (one-time)
                         ↓
                  תשלום → webhook
                         ↓
                  executeAccountDeletion
```

**executeAccountDeletion:**
1. מושהים כל קמפיינים
2. Revoke OAuth tokens — Meta / Google / TikTok
3. מחיקת משתמש Clerk (login חסום מיידית)
4. רישום ב-audit_log
5. DELETE מ-tenants (cascade לכל הטבלאות)

**מה לא נמחק:** `billing_invoices` — tenant_id → NULL + `deleted_tenant_id` נשמר לתמיד

---

### 14.7 מחזור חיוב חודשי

- Cron `POST /billing/invoice` ביום 1 לכל חודש
- מחשב עמלה לכל tenant
- יוצר draft invoice ב-`billing_invoices`
- Stripe subscription גובה $49 אוטומטית
- עמלת % — draft בלבד (לא auto-charge עדיין)

---

### 14.8 בקרת יתרה

- `GET /account/balance` — יתרה נוכחית + פירוט
- `GET /billing/status` — plan + fee estimate + period
- `GET /billing/invoices` — 12 חשבוניות אחרונות

---

### 14.9 מה קורה אם הלקוח לא משלם final balance

חשבון **נשאר פעיל** — אין מחיקה. לקוח יכול לחזור ולסיים את התהליך. אין "Deletion Pending" state פורמלי.

---

## 15. אבטחה

### 15.1 Token Encryption

- כל OAuth tokens (Meta/Google/TikTok) מוצפנים ב-AES-256-GCM
- `packages/db/src/crypto.ts` — encryptToken / decryptToken
- Token בטקסט חופשי לא נשמר בשום מקום ב-DB

---

### 15.2 Audit Log — אירועים מלאים

Append-only (migration 046 — immutable policy)

| Action | מי | Payload |
|---|---|---|
| `onboarding.completed` | User | goal, budget, social_enabled |
| `optimization.scale_up` | System | campaign_id, old_budget, new_budget |
| `optimization.pause` | System | campaign_id, reason |
| `optimization.resume` | System | campaign_id |
| `optimization.budget_change` | System | old_budget, new_budget |
| `optimization.metrics_snapshot` | System | spend, conversions, roas |
| `protocol.approved` | User | protocolId, type, actionPayload |
| `protocol.rejected` | User | protocolId, type, reason |
| `protocol.expired` | System | protocolId, type |
| `campaign.created` | User | platform, budget |
| `campaign.paused` | User/System | campaign_id |
| `campaign.deleted` | User | campaign_id |
| `creative.generated` | System | type, provider_job_id |
| `creative.approved` | User | creative_id, type |
| `creative.rejected` | User | creative_id |
| `social.posted` | System | post_id, platform |
| `social.comment_replied` | User | comment_id, platform |
| `team.member_added` | User | member_email |
| `team.member_removed` | User | member_id |
| `account.deleted` | User | reason, final_balance |
| `billing.invoice_generated` | System | amount, period |
| `compliance.violation_detected` | System | violation_type, severity |
| `platform.connected` | User | platform |
| `platform.disconnected` | User | platform |
| `account.downgraded` | System | old_plan, new_plan |

---

### 15.3 OAuth Security

- State parameter: `crypto.randomBytes(16)` + Map עם expiry 10 דקות → מונע CSRF
- לא pages[0] אוטומטי — הלקוח חייב לבחור

---

### 15.4 CRON_SECRET

- כל Cron מ-Vercel עם `x-cron-secret` header
- ה-API מאמת בכל route. ללא secret → 401

---

### 15.5 HMAC על Webhooks

- Shopify webhook: HMAC verification
- Stripe webhook: `verifyStripeWebhook()` עם raw body + signing secret

---

### 15.6 Log Redaction

- Tokens, API keys, PII — נמחקים מ-logs אוטומטית לפני כתיבה
- Security headers בכל response

---

## 16. Multi-User — Team Members

| | Grow | Scale |
|---|---|---|
| Seats | 1 | עד 3 |

- Invite-based. Token תוקף 7 ימים. שליחה ב-SendGrid
- Auth middleware: tenant_id נפתר מ-own tenant → team_members → create new
- API: GET/POST/DELETE `/team`, POST `/team/invite`, POST `/team/accept`
- UI: `/settings/team`, `/join?token=xxx`

---

## 17. i18n — רב-לשוניות

### 17.1 10 שפות נתמכות

en / he / ar / es / pt / fr / ru / de / tr / it

### 17.2 RTL

- עברית + ערבית: `html dir="rtl"` אוטומטי

### 17.3 שפת UI לעומת שפת תוכן

- **שפת UI** (`ui_language`): השפה שהדשבורד מוצג בה
- **שפת תוכן** (`content_language`): שפת הפוסטים/קמפיינים. `auto` = זיהוי Unicode

---

## 18. עמודי Settings — כל האפשרויות

### 18.1 Settings → General

- Website URL + business type (ecommerce/hero_product/lead_gen/saas/general_store)
- Monthly budget + management percentage
- Goal + margin percentage
- Geographic targets + exclusions
- Dayparting rules (by day of week, hour)
- Risk level: conservative / balanced / aggressive
- Weather sensitivity profile
- Logo upload (Supabase Storage, bucket: logos)
- Language preference (UI + content)
- Brand DNA (colors + do-not-change elements)

---

### 18.2 Settings → Team

- List of team members + roles
- Invite by email
- Remove member
- Seat counter (Grow: 1/1, Scale: X/3)

---

### 18.3 Settings → Notifications

- Email alerts: on/off
- SMS: on/off
- WhatsApp: on/off
- Digest frequency
- Alert types: leads / crisis / optimization actions

---

### 18.4 Settings → Account

- Name, email
- Delete Account flow
- Export Data (JSON download של כל נתוני הקמפיין)

---

## 19. תשתית טכנית

### 19.1 Stack

| Component | Technology |
|---|---|
| Frontend | Next.js 16 App Router, Vercel, Tailwind CSS, Clerk |
| API | Fastify, Node.js, TypeScript, Railway |
| Database | Supabase (PostgreSQL) |
| Auth | Clerk (JWT), Bearer token per request |
| AI (decisions) | Claude Sonnet 4.6 |
| AI (copywriting) | GPT-4o |
| AI (triage/classify) | GPT-4o-mini |
| AI (images) | DALL-E 3 |
| AI (research) | Gemini 2.5 Flash |
| AI (degrade mode) | GPT-4o-mini (~20× cheaper) |
| AI Gateway (non-native) | OpenRouter (Perplexity Sonar Pro, Mistral וכד') |
| Billing | Stripe (Checkout + Subscription + Webhooks) |
| Email | SendGrid |
| Storage | Supabase Storage (buckets: logos, creatives) |
| Videos | HeyGen (avatar), Replicate (cinematic + animation) |
| Weather | OpenWeatherMap |
| News | NewsAPI.org |
| WhatsApp | Twilio |
| Monitoring | Railway health check + OPS_ALERT_EMAIL |

---

### 19.2 AI Router — ניתוב מודלים

| Task | Model | עלות |
|---|---|---|
| chat, optimization_decision, analysis, report | Claude Sonnet 4.6 | $3/$15 per 1M |
| copywriting (posts, reply drafts) | GPT-4o | $2.5/$10 |
| triage, sentiment, classification | GPT-4o-mini | $0.15/$0.60 |
| image generation | DALL-E 3 | $0.04/image |
| market research, AI landscape | Gemini 2.5 Flash + Perplexity Sonar | זול |
| creative scoring | GPT-4o Vision | — |
| degrade mode | GPT-4o-mini | ~20× זול |

**OpenRouter:** עבור מודלים שאינם native (Perplexity, Mistral וכד'). OpenAI-compatible SDK עם baseURL של OpenRouter.

---

### 19.3 Monorepo Structure

```
apps/web             Next.js 16 (Vercel)
apps/api             Fastify (Railway)
packages/db          Supabase client + crypto
packages/ai-router   Model routing + providers
packages/ad-connectors  Google/Meta/TikTok APIs
packages/config      shared config
```

---

### 19.4 Middleware

- `apps/web/proxy.ts` — Clerk middleware (מחליף middleware.ts — שניהם ביחד שוברים build)

---

### 19.5 Migrations

- **49 migrations** (001 → 049) — כולן רצו על Supabase
- DDL מורץ ידנית עם `sbp_` token (Supabase Management API)

---

### 19.6 Deploy

- **Frontend (Vercel):** GitHub push → auto-deploy. Crons מוגדרים ב-Vercel.
- **API (Railway):** GitHub push → auto-deploy. אין `railway up` — Git push = deploy.
- **לא להשתמש ב-`railway up`** — GitHub auto-deploy עובד ועדיף

---

## 20. OpenWeatherMap Integration

**ENV:** `OPENWEATHER_API_KEY`

- API: OpenWeatherMap Forecast API (5-day forecast)
- Coordinates: ערים ראשיות (Tel Aviv, Jerusalem, Haifa, New York, LA, London, Berlin, Paris, וכו')
- fallback: Tel Aviv אם business_country = 'IL'
- **Cron:** `/api/cron/weather` — פעמיים ביום
- **Manual:** `/ops/weather/refresh-now`
- מופעל רק אם tenant יש `weather_sensitive = true`
- **Logic:** evaluates sensitivity per-business (hot_boost, rain_dampens, rain_boosts, cold_dampens, cold_boosts)
- **Storage:** `weather_snapshot` table
- **Degrades gracefully:** אם אין API key → no-op

---

## 21. NewsAPI Integration

**ENV:** `NEWSAPI_KEY`

- Provider: NewsAPI.org v2
- חיפוש לפי: industry keywords + business keywords + competitor names
- LLM מדרג relevance → `relevance_score` (0-1)
- מחלץ: why_relevant, suggested_action
- **Storage:** `news_alerts` table
- **Cron:** כל 6 שעות — `/api/cron/news-scan`
- **UI:** הלקוח יכול לדחות alert (`news/:id/dismiss`)
- **Degrades gracefully:** אם אין API key → רשימה ריקה

---

## 22. Crons פעילים (Vercel)

| Path | Schedule | פעולה |
|---|---|---|
| `/api/cron/optimize` | 03:00, 11:00, 19:00 | אופטימיזציה — Grow |
| `/api/cron/optimize-pro` | 07:00, 15:00, 23:00 | אופטימיזציה — Scale |
| `/api/cron/social-weekly` | Mon 08:00 | ייצור פוסטים שבועי |
| `/api/cron/social-publish` | hourly | פרסום פוסטים מתוזמנים |
| `/api/cron/social-comments` | every 4h | שליפת תגובות חדשות |
| `/api/cron/social-analytics` | every 6h | engagement metrics |
| `/api/cron/ga4-sync` | 02:30 | sync GA4 יומי |
| `/api/cron/briefings` | hourly | שליחת תדריכים |
| `/api/cron/comments-priority` | every 30min | ניקוד תגובות |
| `/api/cron/comments-digest` | every 30min | Lead digest push |
| `/api/cron/comments-crisis` | hourly | בדיקת משבר (z-score) |
| `/api/cron/comments-insights` | 05:00 | חילוץ insights מ-90 ימים |
| `/api/cron/reattestation` | 09:00 | תזכורות re-attestation |
| `/api/cron/stop-loss` | 10:00 | auto-freeze violations |
| `/api/cron/trust-recompute` | 11:00 | חישוב מחדש Trust Tier |
| `/api/cron/shopify-sync` | 03:00 | sync מוצרי Shopify |
| `/api/cron/weather` | every 12h | עדכון תחזית מזג אוויר |
| `/api/cron/news-scan` | every 6h | סריקת חדשות ענף |
| `/api/cron/ghost-cleanup` | 09:00 | אזהרה ל-tenants ללא קמפיינים (יום 30/60) |
| `/api/cron/creative-discard` | 02:00 | auto-reject creatives לא מאושרים אחרי 7 ימים |
| `/api/cron/billing-invoice` | 01:00 (1st of month) | ייצור חשבוניות חודשיות |
| `/api/cron/protocols-expire` | daily | auto-expire פרוטוקולים ישנים |
| `/api/cron/ai-landscape` | 01:00 (1st of month) | digest מודיעין AI ל-team |

---

## 23. עמודי UI עיקריים

| Path | תכולה |
|---|---|
| `/` | Landing page — pricing, CTA |
| `/pricing` | תמחור מלא עם גילוי מלא (7 פסקאות billing disclosure) |
| `/terms` | ToS מלא (§1-§22) |
| `/privacy` | מדיניות פרטיות |
| `/acceptable-use` | Acceptable Use Policy (Tier 0/1/2) |
| `/refund` | מדיניות ביטול + מחיקת חשבון |
| `/sign-in`, `/sign-up` | Clerk auth |
| `/onboarding` | 7-step onboarding wizard |
| `/dashboard` | Posts / Comments / Connect tabs |
| `/dashboard/intelligence` | Conversion Readiness / Insights / Briefings / Crisis |
| `/dashboard/compliance` | Attestations / Industry licenses |
| `/dashboard/settings` | Delete account / Export data |
| `/billing` | Plan status / Usage widget / Invoices / Upgrade |
| `/studio` | Creative Studio Pro — ניהול כל ה-creatives |
| `/settings/team` | Team members management |
| `/settings/general` | Logo upload / Language / Brand DNA |
| `/settings/notifications` | Email/SMS/WhatsApp preferences |
| `/join?token=` | קבלת הזמנה לצוות |
| `/admin/freeze` | Kill switch (ADMIN_SECRET) |

---

## 24. Terms of Service — עיקרי הסעיפים

| סעיף | תוכן |
|---|---|
| §3 | AUTOMATED AI SYSTEM DISCLAIMER — אזהרה בולטת: robot decisions, monitoring obligation, no liability |
| §5 | Ad Spend & Billing (Grow: 7% + $29 min; Scale: $49 + 6%) |
| §6 | AI-Generated Content — user is publisher, must own all assets |
| §7 | AI Disclosure Consent — חובת תיוג תוכן AI לפי platform rules |
| §8 | Third-Party Platform Disclaimer — אין שליטה על Google/Meta/TikTok |
| §9 | No Guarantee of Results |
| §10 | Prohibited Uses — Tier 0/1/2 |
| §11 | Vigmis's Sole Discretion to Refuse Service |
| §13 | Limitation of Liability — max 3 months fees or $50; no indirect damages |
| §17 | Creative Production Policy — מחירים, revisions, auto-discard |
| §20 | Termination — Path A (cancel subscription) / Path B (delete + final billing) |
| §21 | Governing Law — Israel, Tel Aviv courts |
| **Company** | Taurus Management and Investments Ltd., ח"פ 514565118, ישראל |

---

## 25. מסלול לקוח — Customer Journey

1. `/sign-up` → Clerk auth → tenant נוצר אוטומטית
2. Onboarding: URL → ניתוח → שיחת AI intake → חיבור Meta/Google/TikTok/GA4/Shopify
3. Vigmis מייצרת אסטרטגיה + Conversion Readiness audit (ברקע)
4. לקוח מאשר → Vigmis פותחת קמפיינים
5. Vigmis מייצרת פוסטים שבועיים → לקוח מאשר/דוחה/עורך
6. Vigmis מפרסמת מאושרים. מגיבה לתגובות. מתריעה על leads.
7. אופטימיזציה 3-6×/יום. תדריך שבועי/יומי.
8. לקוח רואה Dashboard עם metrics אמיתיים (GA4) + history
9. לקוח מוחק → חישוב יתרה → Stripe → cascade delete

---

## 26. מה עדיין פתוח

| פריט | סטטוס |
|---|---|
| Meta App Review — pages_manage_posts/Instagram scopes | ממתין להגשה חוזרת עם סרטון |
| TikTok Marketing API | ממתין לאישור |
| TikTok video.publish scope | הוגש מחדש |
| TikTok Client Key | ממתין ל-Anna |
| עמלת % חודשית — auto-charge ב-Stripe | Draft invoice בלבד |
| "Deletion Pending" state | לא קיים — חשבון נשאר פעיל אם לא שילם |
| Google Ads Standard Access | יוגש ב-10,000 משתמשים |
| Multi-user | נבנה, לא נבדק end-to-end |
| Perplexity per-client research | מתוכנן — לא ממומש |
| Facebook Ad Library integration | מתוכנן |
| Creative performance feedback loop | מתוכנן |
| Website re-crawl אוטומטי | מתוכנן |
| VIGMIS US LLC EIN | בהקמה |
| Stripe Live (requires EIN) | בהקמה |
| Clerk LIVE keys | דורש Stripe Live |

---

## 27. מדדי קוד

- **49 migrations** על Supabase (001–049)
- **23+ route modules** API (creatives, billing, account, social, campaigns, connectors, chat, ops, export, analytics, tracking, compliance, protocols, team, onboarding, auth, notifications, ga4, ...)
- **30+ services** ב-API
- **23 crons** רשומים ב-Vercel
- **10 שפות** קבצי תרגום
- **TypeScript compile: 0 errors** (API + Web)
- **Railway auto-deploy:** ✅ GitHub push = deploy

---

## נספח א' — רווחיות per-customer (Unit Economics)

| לקוח | עמלה | עלות AI | תשתית | נשאר | מרווח |
|---|---|---|---|---|---|
| Grow $300 (רצפה) | $29 | ~$10 | ~$2 | ~$17 | 59% |
| Grow $1,000 | $70 | ~$13 | ~$3 | ~$54 | 77% |
| Grow $5,000 | $350 | ~$52 | ~$11 | ~$287 | 82% |
| Scale $500 | $79 | ~$8 | ~$2 | ~$69 | 87% |
| Scale $3,000 | $229 | ~$30 | ~$8 | ~$191 | 83% |

**לקוח מסוכן:** Grow + תקציב $300 + 800 AI messages + 1,500 תגובות → הפסד. Circuit Breaker מגן.

**Scale פחות רווחי מ-Grow** מעל ~$750 הוצאות — הפיצ'רים הנוספים עולים יותר מההפרש בעמלה.

---

## נספח ב' — DB Schema: כל הטבלאות

### Core

| טבלה | תוכן |
|---|---|
| `tenants` | חשבונות לקוח (clerk_user_id, email) |
| `client_settings` | כל נתוני onboarding + website_analysis + strategy_plan + brand_voice_profile + social_settings |
| `platform_tokens` | OAuth tokens (Meta/Google/TikTok) — מוצפנים AES-256-GCM |
| `campaigns` | קמפיינים (platform, external_id, status: pending/active/paused/error, daily_budget_usd) |
| `custom_benchmarks` | benchmarks per-client (minCtr, goodCtr, maxCpc, maxCpa, learningDays) |

### Decisions & Protocols

| טבלה | תוכן |
|---|---|
| `decision_protocols` | approval workflows (type, status: pending/in_discussion/approved/rejected/expired) |
| `conversational_history` | chat messages (role, content, timestamp) |
| `approval_snapshots` | forensic records (canonical-JSON SHA256, IP, UA) |

### Tracking & Conversion

| טבלה | תוכן |
|---|---|
| `conversion_events` | pixel events (pageview/lead/purchase/add_to_cart, gclid, fbclid, value) |
| `shopify_connections` | Shopify OAuth (access_token, webhook_id) |
| `conversion_tracking_snapshots` | daily true ROAS/profit (platform_roas, true_roas, true_profit) |
| `ga4_daily_metrics` | sessions, conversions, revenue per source/medium |
| `historical_data_snapshots` | prior campaign data מהפלטפורמות |
| `tenant_incrementality_snapshot` | floor estimate incremental ROAS |

### Creatives

| טבלה | תוכן |
|---|---|
| `creative_jobs` | AI generation tasks (type, status, provider_job_id, output_url, revision_of, critic_score) |
| `creative_briefs` | structured briefs (hooks, cta, keep/change instructions) |

### Social Media

| טבלה | תוכן |
|---|---|
| `social_posts` | scheduled posts (platform, pillar, content, status, cost_usd) |
| `social_comments` | comment inbox (sentiment, priority_score, status, billed, replied_at) |
| `social_analytics` | post metrics (likes, comments, shares, reach, impressions, engagement_rate) |
| `social_settings` | configuration (enabled, platforms, approval_mode, content_pillars) |
| `reply_override_log` | human edits to AI replies (Levenshtein diff) |

### Operational Context

| טבלה | תוכן |
|---|---|
| `news_alerts` | industry news (relevance_score, why_relevant, suggested_action, status) |
| `weather_snapshot` | weather forecast (location, forecast, recommendation, applied) |
| `operational_context` | daily synthesis (calendar + weather + news) |
| `audit_log` | append-only log של כל הפעולות |
| `content_attestations` | consent records (attestation_kind, IP, timestamp, hash) |
| `alert_settings` | notification preferences (email/sms/whatsapp enabled) |
| `dismissed_alerts` | user-dismissed alerts |

### Analytics & Reporting

| טבלה | תוכן |
|---|---|
| `geo_reports` | AI visibility score (score, grade A-F) |
| `geo_report_snapshots` | monthly trend (score_delta) |

### Billing

| טבלה | תוכן |
|---|---|
| `billing_customers` | subscription (plan: free/pro, stripe_id, stripe_subscription_id) |
| `billing_invoices` | חשבוניות (amount, status, deleted_tenant_id) — לעולם לא נמחקות |

### Team

| טבלה | תוכן |
|---|---|
| `team_members` | members per tenant (user_id, role, invited_by) |
| `team_invites` | pending invites (token, email, expires_at) |

---

## נספח ג' — API Routes: כל ה-Endpoints

### Onboarding

| Method | Path | תיאור |
|---|---|---|
| POST | `/onboarding/chat` | AI intake interview |
| POST | `/onboarding/analyze` | ניתוח אתר + market research + strategy generation |
| POST | `/onboarding/website-check` | quick website check (adequate flag + unclear questions) |
| POST | `/onboarding/discuss` | דיון על strategy עם הלקוח |
| POST | `/onboarding/settings` | שמירת strategy מאושרת |

### Auth

| Method | Path | תיאור |
|---|---|---|
| GET | `/auth/status` | אילו פלטפורמות מחוברות |
| POST | `/auth/google` | Google OAuth |
| POST | `/auth/meta` | Meta OAuth |
| POST | `/auth/tiktok` | TikTok OAuth |

### Campaigns

| Method | Path | תיאור |
|---|---|---|
| GET/POST | `/campaigns` | list / create |
| DELETE | `/campaigns/:id` | delete |
| POST | `/campaigns/:id/pause` | pause |
| POST | `/campaigns/:id/resume` | resume |

### Optimization

| Method | Path | תיאור |
|---|---|---|
| GET | `/optimization/status` | optimizations in flight |
| POST | `/optimization/approve` | אישור פעולה |
| POST | `/optimization/reject` | דחיית פעולה |
| POST | `/optimization/run-now` | trigger מיידי |

### Analytics

| Method | Path | תיאור |
|---|---|---|
| GET | `/analytics/summary` | KPIs (spend, clicks, conversions, ROAS, CPA) |
| GET | `/analytics/historical` | trend data |
| GET | `/analytics/budget-forecast` | 4 scenarios |
| GET | `/intelligence/creative-themes` | theme learning |

### Export

| Method | Path | תיאור |
|---|---|---|
| GET | `/export/analytics` | analytics CSV/HTML |
| GET | `/export/campaigns` | campaigns CSV/HTML |
| GET | `/export/social` | social CSV/HTML |
| GET | `/export/marketing-plan` | strategy HTML |
| GET | `/export/invoice` | invoice HTML |

### Creatives

| Method | Path | תיאור |
|---|---|---|
| POST | `/creatives/generate` | יצירת creative |
| GET | `/creatives/jobs` | jobs in-flight |
| GET | `/creatives/:id/status` | polling status |
| POST | `/creatives/:id/approve` | אישור |
| POST | `/creatives/:id/reject` | דחייה |
| POST | `/creatives/:id/revise` | revision request |
| POST | `/creatives/score` | GPT-4o Vision scoring |
| GET | `/creatives/avatars` | HeyGen available avatars |
| GET | `/creatives/voices` | HeyGen available voices |

### Social

| Method | Path | תיאור |
|---|---|---|
| POST | `/social/compose` | draft post (AI or manual) |
| POST | `/social/publish` | queue for publishing |
| GET | `/social/inbox` | comment feed |
| POST | `/social/comment/:id/reply` | respond to comment |
| POST | `/social/comment/:id/dismiss` | dismiss |
| POST | `/social/comment/:id/mark-spam` | spam |

### Tracking

| Method | Path | תיאור |
|---|---|---|
| GET | `/track/status` | pixel active + events |
| GET | `/track/snippet` | pixel code |
| POST | `/track/verify` | verify pixel fires |
| POST | `/track/shopify/connect` | Shopify OAuth |
| POST | `/track/shopify/webhook` | Shopify order events |

### Billing

| Method | Path | תיאור |
|---|---|---|
| GET | `/billing/status` | plan + fee estimate |
| GET | `/billing/invoices` | 12 חשבוניות אחרונות |
| GET | `/account/balance` | יתרה נוכחית |
| POST | `/billing/checkout` | create Stripe Checkout |
| POST | `/billing/portal` | Stripe Portal URL |
| POST | `/billing/stripe/webhook` | Stripe events |

### Operations

| Method | Path | תיאור |
|---|---|---|
| GET | `/ops/context` | calendar + weather + news synthesis |
| GET | `/ops/news` | news alerts |
| POST | `/ops/news/:id/dismiss` | dismiss alert |
| PUT | `/ops/weather-sensitivity` | set weather profile |

### Protocols (Decision Workflows)

| Method | Path | תיאור |
|---|---|---|
| GET | `/protocols` | list (pending first) |
| GET | `/protocols/:id` | single + conversation |
| POST | `/protocols/:id/reply` | client message + AI response |
| POST | `/protocols/:id/approve` | approve + execute |
| POST | `/protocols/:id/reject` | reject |

### Team & Account

| Method | Path | תיאור |
|---|---|---|
| GET | `/team/members` | list members |
| POST | `/team/invite` | send invite |
| DELETE | `/team/member/:id` | remove |
| GET | `/account/profile` | user info |
| PUT | `/account/profile` | update |
| POST | `/account/delete` | initiate deletion |

### Admin

| Method | Path | תיאור |
|---|---|---|
| POST | `/admin/tenants/:id/freeze` | freeze account |
| GET | `/admin/health` | system health |

---

## נספח ד' — 22 שירותים דיגיטליים

| שירות | קטגוריה | תפקיד בקצרה | שימוש בפועל במערכת |
|---|---|---|---|
| **Vercel** | Hosting/Frontend | מארח את ה-Frontend ומריץ את ה-Crons | Deploy אוטומטי מ-GitHub. מריץ 23 cron jobs לפי לוח זמנים. CDN גלובלי לממשק המשתמש. |
| **Railway** | Hosting/API | מארח את שרת ה-API (Fastify) | Deploy אוטומטי מ-GitHub. שומר כל env vars. health check אוטומטי. כל ה-API routes. |
| **Supabase** | Database/Storage | PostgreSQL + Storage | 49 migrations. כל נתוני הלקוחות, קמפיינים, tokens מוצפנים, creatives, חשבוניות. Storage buckets: logos + creatives. |
| **Clerk** | Auth | ניהול משתמשים ו-JWT | sign-up/sign-in, JWT לכל request, tenant isolation, team members. TEST keys כרגע — LIVE בפתיחה. |
| **Stripe** | Billing | תשלומים | Scale subscription $49/חודש. Checkout one-time לcreatives + final balance. Portal לניהול מנוי. Webhooks לאירועי תשלום. |
| **OpenAI** | AI | GPT-4o + DALL-E | GPT-4o לcopywriting ותוכן. GPT-4o-mini לsniifassification וsentiment. DALL-E 3 לתמונות (best-of-3). GPT-4o Vision לcreative scoring + AI Critic. |
| **Anthropic** | AI | Claude Sonnet 4.6 | קבלת החלטות אסטרטגיות, optimization decisions, ניתוח, chat, strategy generation. המודל "המנהל" של המערכת. |
| **OpenRouter** | AI Gateway | gateway למודלים לא-native | Perplexity Sonar Pro לחדשות/research. גישה ל-Mistral ומודלים נוספים. OpenAI-compatible SDK. |
| **Google (OAuth + GA4 + Ads)** | Platform | חיבור Google | GA4: ground truth analytics — sessions, conversions, revenue. Google Ads: פתיחה וניהול קמפיינים. OAuth נפרד לכל service. |
| **Meta (Facebook + Instagram)** | Platform | חיבור Meta | פתיחה וניהול קמפיינים. פרסום פוסטים ל-Page. קריאת תגובות. Instagram Business publishing. |
| **TikTok (Developers + Business)** | Platform | חיבור TikTok | TikTok Developers: content posting (FILE_UPLOAD). TikTok for Business: Marketing API (בהמתנה לאישור). |
| **HeyGen** | Creative | ייצור סרטוני avatar | Avatar videos עם AI spokesperson. Voices + avatars catalog. $15 לסרטון. ~3 דקות המתנה. |
| **Replicate** | Creative | ייצור סרטוני AI | Cinematic (minimax/video-01) $12. Animation (animate-diff-v2) $8. Polling-based completion. |
| **SendGrid** | Email | שליחת emails | Daily reports, weekly digest, monthly report, team invites, ghost cleanup emails, AI landscape digest. 100/day (Free — צריך upgrade). |
| **Twilio** | Messaging | WhatsApp | Comment-to-Lead digest. Crisis alerts. Hot priority notifications. 4 שפות. |
| **OpenWeatherMap** | Data | תחזית מזג אוויר | 3-day forecast לכל עסק. Per-business sensitivity profile. מוזרק ל-operational context ולהחלטות optimization. |
| **NewsAPI** | Data | חדשות ענף | סריקת חדשות רלוונטיות. LLM מדרג relevance. מוזרק לcontext. Alerts ללקוח. כל 6 שעות. |
| **Shopify** | E-commerce | אינטגרציית חנות | Order webhooks, AOV model, catalog sync. HMAC verification. True conversion data. |
| **Cloudflare R2** | Storage | CDN/Assets | assets, logos, creatives CDN. Backend לStorage URLs קבועים. |
| **Perplexity Sonar Pro** | AI/Research | web search בזמן אמת | Monthly AI Landscape Digest — כלים חדשים, עדכוני פלטפורמות, מתחרים. דרך OpenRouter. מתוכנן: per-client market research. |
| **Gemini 2.5 Flash** | AI | research קל | Market research, analysis tasks. עלות נמוכה. דרך ai-router. |
| **Cloudflare** | Infrastructure | DNS/CDN | DNS, DDoS protection, force majeure clause בToS. |

---

## נספח ה' — ENV Vars קריטיים

### Railway (API)

| Variable | שימוש |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | אימות webhook |
| `STRIPE_PRO_PRICE_ID` | Scale subscription price |
| `OPENROUTER_API_KEY` | Perplexity + non-native models |
| `CLERK_SECRET_KEY` | Auth |
| `SUPABASE_URL` | DB |
| `SUPABASE_SERVICE_ROLE_KEY` | DB |
| `CRON_SECRET` | אימות cron requests |
| `SENDGRID_API_KEY` | Email |
| `OPS_ALERT_EMAIL` | Circuit breaker + stop-loss alerts |
| `AI_LANDSCAPE_EMAIL` | Monthly AI digest recipient |
| `WEB_URL` | Frontend URL לlinks ב-emails |
| `HEYGEN_API_KEY` | Avatar videos |
| `REPLICATE_API_TOKEN` | Cinematic + Animation |
| `OPENAI_API_KEY` | GPT-4o, DALL-E |
| `ANTHROPIC_API_KEY` | Claude Sonnet |
| `META_APP_ID` | Meta OAuth |
| `META_APP_SECRET` | Meta OAuth |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `TIKTOK_CLIENT_KEY` | TikTok OAuth (ממתין) |
| `TIKTOK_CLIENT_SECRET` | TikTok OAuth (ממתין) |
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM לOAuth tokens |
| `ADMIN_SECRET` | Kill switch |
| `OPENWEATHER_API_KEY` | Weather API |
| `NEWSAPI_KEY` | News scanning |

### Vercel (Frontend)

| Variable | שימוש |
|---|---|
| `CRON_SECRET` | אימות crons |
| `CLERK_SECRET_KEY` | Auth |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Client-side auth |
| `NEXT_PUBLIC_SUPABASE_URL` | Client-side DB access |
| `NEXT_PUBLIC_API_URL` | Railway API URL |

---

*עדכון אחרון: 2026-06-11 — גרסה מקיפה (הכל כולל הכל)*
