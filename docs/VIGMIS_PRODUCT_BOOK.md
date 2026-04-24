# VIGMIS — ספר המוצר המלא
### גרסה חיה | עודכן לאחרונה: 2026-04-24

> מסמך זה הוא האמת היחידה על מה Vigmis הוא, מה הוא עושה, ואיך הוא עובד.
> כל שאלה על "מה לבנות" — התשובה כאן.

---

# חלק א — חזון ומיצוב

## מה זה Vigmis

**Vigmis הוא משרד פרסום אוטונומי מבוסס AI.**

הלקוח מחבר חשבונות פרסום, עונה על שאלות בסיסיות, ו-Vigmis עושה את הכל:
- מבין את העסק ובונה אסטרטגיה
- יוצר קמפיינים ומביא אותם לאוויר
- מנהל תקציבים ומקצה בין פלטפורמות
- מייצר קריאייטיב (תמונות, ווידאו, טקסט)
- מודד תוצאות אמיתיות — לא רק קליקים
- מחליט ומבצע שינויים אוטומטית
- מדווח בשפה עסקית, לא שפת מודעות

**הלקוח לא צריך ידע בפרסום. הוא צריך להגדיר מטרה ולאשר החלטות גדולות.**

## הגדרה מדויקת

> Vigmis = Autonomous Marketing Operating System with Business Outcome Intelligence

לא "כלי לניהול מודעות". לא "דשבורד ל-ads". מערכת אוטונומית שמחליטה ופועלת לפי ערך עסקי אמיתי.

## למה Vigmis עדיף על סוכנות פרסום

| נושא | סוכנות ממוצעת | Vigmis |
|------|--------------|--------|
| זמינות | שעות עבודה | 24/7 |
| מהירות תגובה לבעיה | שעות/ימים | דקות |
| אופטימיזציה | שבועית/חודשית | 3–6x ביום |
| ROAS אמיתי | לפעמים | תמיד (אחרי tracking) |
| Incrementality testing | רק סוכנויות גדולות | אוטומטי |
| Creative | ידני, יקר | AI, דקות |
| שקיפות | דוח שהסוכנות בוחרת | הכל גלוי |
| עלות | $2,000–$10,000/חודש | 5–7% מה-spend |

---

# חלק ב — מודל עסקי

## תמחור

| תוכנית | מנוי | עמלת ניהול | בדיקות |
|--------|------|-----------|--------|
| **Basic** | $0 | 7% מה-spend | 3x ביום |
| **Pro** | $15/חודש | 5% מה-spend | 6x ביום |

**חיוב:** Paddle (Merchant of Record — מטפל ב-VAT גלובלי)
- $15 בתחילת חודש (Pro)
- % עמלה בסוף חודש לפי spend אמיתי

## שירותים נוספים (חיוב לפי שימוש)

| שירות | מחיר | הערות |
|-------|------|-------|
| Social posts — Facebook/Instagram | $1/פוסט | |
| Social posts — TikTok | $3/פוסט | כולל ייצור ווידאו |
| ניהול תגובות | $0.05/תגובה שנשלחה | |
| ווידאו HeyGen (דמות מדברת) | $15/ווידאו | |
| ווידאו Kling (קינמטי) | $12/ווידאו | |
| ווידאו Pika (אנימציה) | $8/ווידאו | |
| תמונות DALL-E 3 | כלול במחיר | |

## הגדרת "managed spend"

**Managed click** = קליק שנוצר ממודעה שנוצרה או מנוהלת על ידי Vigmis בלבד.
העמלה מחושבת רק על spend שויגמיס ניהל בפועל — לא על קמפיינים חיצוניים.

---

# חלק ג — פיצ'רים קיימים (deployed)

## 3.1 Onboarding Flow

**מטרה:** להביא לקוח חדש מהרשמה עד קמפיין ראשון פעיל.

**שלבים:**
1. **Connect Platforms** — חיבור Google / Meta / TikTok דרך OAuth
2. **Website Check** — Vigmis סורק את האתר, מבין מה הלקוח מוכר
3. **AI Chat Interview** — שיחה עם AI שבונה פרופיל עסקי מלא
4. **Historical Analysis** — ניתוח קמפיינים קיימים (אם יש)
5. **Strategy Generation** — AI בונה תוכנית אסטרטגיה (Budget Advisory + פלטפורמות + יעדים)
6. **Budget Advisory** — ייעוץ תקציב: מינימום / מומלץ / תקרה + תחזית קליקים/לידים + break-even
7. **Creative Brief** — AI מגדיר מה צריך לייצר
8. **Creative Generate** — יצירת תמונות/ווידאו
9. **Campaign Plan Approval** — לקוח מאשר רשמית עם checkbox ("החלטתי המושכלת")
10. **Launch** — הקמפיין יוצא לאוויר

**הכלל:** אין השקה ללא אישור מפורש של הלקוח.

## 3.2 אופטימיזציה אוטומטית

**מה הEngine עושה:**
- בודק ביצועי קמפיינים 3x/יום (Basic) או 6x/יום (Pro)
- משווה לbenchmarks לפי פלטפורמה × סוג קמפיין × שלב (awareness/traffic/conversions)
- מחליט: scale_up / scale_down / pause / resume / needs_targeting_review / creative_refresh

**Learning Period:**
- קמפיין חדש ללא היסטוריה → 7–10 ימים ידיים מרוחקות
- מציג ללקוח countdown ("3 ימים נשארו בלמידה")

**Conservative vs Auto Mode:**
- Conservative: כל פעולה → Protocol לאישור לקוח
- Auto: מבצע ומדווח

**Benchmarks לפי פלטפורמה:**
- Meta: awareness CTR 0.5–2%, traffic CTR 1–3%, conversions CPA לפי ניתוח
- Google: Search CTR 3–10%, Display CTR 0.1–0.5%, Shopping לפי קטגוריה
- TikTok: awareness CTR 0.5–1.5%, traffic CTR 1–2.5%

## 3.3 Decision Protocols

**מה זה:** מערכת פרוטוקולים לכל פעולה שהEngine רוצה לבצע.

**סוגי פרוטוקולים:**
- `approval_request` — מחכה לאישור לקוח
- `scale_up` / `scale_down` — שינוי תקציב
- `pause` / `resume` — עצירה/חידוש קמפיין
- `creative_refresh` — חידוש קריאייטיב
- `needs_targeting_review` — בעיה בטרגטינג
- `stagnation_alert` — קיפאון מתמשך

**Dashboard Decisions Tab:** רשימת פרוטוקולים פתוחים + thread שיחה + approve/reject

**Protocol Expiry:** פרוטוקול פג תוקפו אחרי X שעות → banner אדום אזהרה ללקוח

## 3.4 A/B Testing

**Flow:**
1. Engine מזהה creative fatigue (CTR ירד 33%+)
2. מציע: "החלף ישירות" או "טסט 7 ימים A/B"
3. אם A/B: Vigmis יוצר Creative חדש → יוצר Ad Set B → 50/50 תקציב
4. 7 ימים + 50+ קליקים לכל variant → winner protocol עם נתונים
5. אישור לקוח → pause A, full budget ל-B

## 3.5 Conversion Tracking Guide (הגרסה הקיימת)

**מה קיים:** מדריך Protocol ביום 1 עם הוראות לכל פלטפורמה — איך להגדיר tracking ידנית.
**מה חסר:** tracking אוטומטי שVigmis עצמו עושה (ראה חלק ד').

## 3.6 Alerts ו-Notifications

**ערוצים:** WhatsApp (Twilio) + Email (SendGrid)

**סוגי התראות:**
- קמפיין מתחת לbenchmark
- תקציב נשרף מהר מדי
- token פג תוקפו
- A/B winner נמצא
- Social post ממתין לאישור
- תגובה דורשת אישור (תלונה = URGENT)

**Weekly Digest (שני 8am):** סיכום שבוע — KPIs, AI actions, social metrics

**Daily Report (8am):** KPIs vs אתמול + פעולות AI + attention items

**Monthly Report (2nd of month):** MoM comparison, ROI banner, invoice estimate

## 3.7 Intelligence ו-Analytics

**Benchmark Recalibration:** אחרי 30 ימים — בנצ'מארקים מתעדכנים לבסיס האישי של הלקוח.

**Stagnation Detector:** אחרי 30+ ימים + CTR < 60% מbenchmark + 3+ scale_down → הודעה ישירה וכנה:
- בדוק: דף נחיתה / תמחור / תקציב מול תחרות / טרגטינג / product-market fit
- אחרי 60 ימים: "אולי פרסום ממומן לא מתאים לך עכשיו"

**Proactive Growth:** אחרי 7 ימי ביצועים מצוינים → מציע scale-up אסטרטגי + הצעת Google Search אחרי 21 יום

**Token Health:** בודק תוקף OAuth tokens — פג תוקפו → Protocol + notification. פג בעוד 5 ימים → warning.

**Historical Analytics:** ניתוח קמפיינים קיימים (Google/Meta/TikTok) לפני onboarding

## 3.8 Dashboard

**Tabs:**
1. **Overview** — "חדר בקרה": Platform health dots, BurnGauge SVG, Today's KPIs + WoW arrows, AI Actions timeline, Emergency Stop
2. **Analytics** — KPI 8-grid, Conversion Funnel, dual chart (spend+conv.), top/bottom performers, sortable table, Compare toggle (WoW/MoM)
3. **Campaigns** — רשימת קמפיינים + Learning badge + Edit Settings + Rethink Strategy
4. **Intelligence** — Territory intelligence, audience insights, A/B tests
5. **Decisions** — Protocol queue + approve/reject
6. **Social** — Posts queue + analytics + Comments tab
7. **Settings** — Alert channels, optimization mode, billing, danger zone

**Export:** CSV + PDF לכל tab + Marketing Plan + Invoice estimate

## 3.9 Social Media Management

**פלטפורמות:** Facebook, Instagram, TikTok

**תדירות:** פעם בשבוע לכל פלטפורמה

**תוכן:** Educational / Promotional / Social Proof / Behind the Scenes / Trending — רוטציה

**Approval Modes:**
- Auto — מפרסם אוטומטית
- Review — 24h לאישור לפני פרסום
- Strict — לא מפרסם בלי אישור

**Boost אוטומטי:** פוסט אורגני שביצע טוב → הצעה להפוך לפרסומת

## 3.10 Community Management (תגובות)

**קטגוריות:** positive / question / complaint / spam / other

**Flow:**
- AI קורא תגובות מMeta כל 4 שעות
- מסווג + מציע תגובה + recommends action
- תלונות → URGENT, תמיד דורשות אישור
- ספאם → מציע הסתרה
- $0.05 לתגובה שנשלחה

## 3.11 Creative Generation

| סוג | כלי | עלות | תיאור |
|-----|-----|------|-------|
| תמונות | DALL-E 3 | כלול | ייצור לפי brief |
| ווידאו — דמות מדברת | HeyGen | $15 | אוואטר מציג מוצר |
| ווידאו — קינמטי | Kling AI | $12 | קליפ סינמטי |
| ווידאו — אנימציה | Pika Labs | $8 | אנימציה למוצר |

## 3.12 Territory Intelligence

- Auto-detect מדינה, מטבע, CPC benchmarks
- עונתיות, חגים מקומיים
- טון מותאם תרבות
- עמלה ב-USD ללא קשר למטבע מקומי

## 3.13 Billing

**Paddle** = Merchant of Record
- Basic: 0 + 7% spend
- Pro: $15/חודש + 5% spend
- Social posts + תגובות מחויבים בסוף חודש
- Invoice estimate בדשבורד

## 3.14 Legal & Compliance

**דפים:** Terms, Privacy, Refund Policy, Cookie Policy, Acceptable Use, FAQ/Help Center
**GDPR:** Cookie banner, Terms checkbox באונבורדינג, Marketing opt-in, Unsubscribe בכל email
**חשבון:** Delete Account + Export Data בSettings
**חברה:** Taurus Management and Investments Ltd. | ח.פ. 514565118 | הרצליה
**Status Page:** status.vigmis.com (Instatus)

---

# חלק ג.ב — GEO (AI Visibility) — deployed 2026-04-24

## מה זה GEO

**GEO = Generative Engine Optimization** — אופטימיזציה לנראות ב-AI.

כשמישהו שואל ChatGPT, Claude, Gemini, Perplexity "מה הכי טוב..." — ה-AI מחזיר שמות של עסקים. Vigmis מוודא שהלקוחות שלה מופיעים שם.

## מה Vigmis עושה

**1. סריקה אוטומטית של האתר**
- בדיקת Schema.org JSON-LD (הקוד שמגיד ל-AI מי אנחנו)
- Meta description, H1/H2, Open Graph
- FAQ signals, NAP data (שם/כתובת/טלפון), reviews schema

**2. ניתוח AI + ציון GEO (0-100, כיתה A-F)**
- Claude מנתח ומחזיר: ציון, בעיות לפי חומרה, נקודות חוזק

**3. תוצרים מוכנים ללקוח**
- JSON-LD Schema.org קוד מוכן להדבקה ב-`<head>`
- 10 FAQ שאלה-תשובה מוכנות לאתר
- תיאור עסקי 120 מילה מותאם לAI
- Checklist פעולות ידניות (Google Business Profile, דירקטוריות וכו')

**4. דלתא חודשי**
- כל חודש Vigmis מריץ מחדש + מחשב שינוי מהחודש הקודם (↑8 / ↓3)

## איך זה עובד (flow)

1. **אונבורדינג:** ברגע שהלקוח מסיים → GEO audit רץ אוטומטית ברקע
2. **Dashboard:** Tab "AI Visibility" מציג דוח מוכן + ציון + כרטיס בOverview
3. **חודשי:** CRON ב-1 לחודש מרענן את כל הדוחות + שומר snapshot היסטורי
4. **דייג'סט שבועי:** ציון GEO מופיע בכל מייל שבועי + delta מהחודש הקודם

## היסטוריה (deployed 2026-04-24)

- `geo_report_snapshots` — snapshot היסטורי של כל ריצת GEO (לא נמחק)
- `monthly_snapshots` — תמונת מצב חודשית מלאה: GEO + קמפיינים + אופטימיזציות + social
- Tab "History" — ציר זמן אינטראקטיבי עם כל החודשים, score delta, events

## מה לקוח מקבל

הלקוח פותח את הדשבורד ורואה דוח מוכן — לא ממלא כלום, לא לוחץ "הרץ". Vigmis עשה את העבודה.

---

# חלק ד — בנייה בתהליך (Conversion Intelligence System)

## הבעיה

Vigmis כרגע רואה רק מה שהפלטפורמות מדווחות — לא מה שקרה בפועל באתר הלקוח.
- ROAS שMeta מציגה ≠ ROAS אמיתי
- אין ידיעה מה נקנה, כמה הוזמן, מי ביטל
- אי אפשר לאמת attribution
- אופטימיזציה על קליקים — לא על רכישות

## Round 1 — תשתית tracking

### שאלות חדשות בOnboarding (ראשונות!)

```
1. מה אתה מוכר?
   ○ חנות כללית (הרבה מוצרים — לקוח בוחר)
   ○ מוצר/מוצרים ספציפיים (Hero Product)
   ○ שירות / Lead Generation (ליד = המרה)
   ○ SaaS / אפליקציה (הרשמה/Trial = המרה)

2. מה KPI ראשי?
   ○ ROAS (revenue / spend)
   ○ רווח לפי מכירה (דורש margin)
   ○ Cost per Lead
   ○ Cost per Qualified Lead

3. מה ה-margin המשוער? ____%
   (Revenue - COGS / Revenue × 100)

4. יש לך מוצר Hero? (מוצר ספציפי שרוצה למקד עליו פרסום)
   ○ כן — מה הוא? מה המחיר? מה ה-margin?
   ○ לא

5. סוג אתר?
   ○ Shopify ○ WooCommerce ○ WordPress ○ Wix ○ Custom
```

### Vigmis JS Pixel

סקריפט קטן שהלקוח מדביק באתר (או מותקן דרך GTM):

```javascript
<script>
(function(v,i,g,m,s){
  v._vigmis=v._vigmis||{tid:'TENANT_ID'};
  // auto-capture: page_view, click_id (gclid/fbclid/ttclid), UTM params
  // fires on every page, captures conversion events
})(window);
</script>
```

**מה הסקריפט עושה:**
- Auto-capture: page_view, UTMs, click IDs (gclid/fbclid/ttclid) → שמור ב-cookie 90 ימים
- API event: `vigmis('track', 'purchase', { value: 250, currency: 'USD', orderId: '123' })`
- Sends to `/track` endpoint

### Events API

`POST /track` — מקבל events מהאתר:

```json
{
  "tenant_id": "xxx",
  "event": "purchase",
  "value": 250,
  "currency": "USD",
  "order_id": "12345",
  "gclid": "Cj0KCQ...",
  "fbclid": "IwAR...",
  "utm_source": "facebook",
  "utm_campaign": "summer_sale",
  "landing_page": "/products/hero-item"
}
```

### Attribution Engine

- Match conversion → ad via click ID (gclid → Google campaign, fbclid → Meta campaign)
- Fallback: UTM source/medium/campaign
- Deduplication: אם pixel + server שולחים אותו event → מספר פעם אחת
- Attribution window: 7 ימי קליק / 1 יום view (ניתן לשינוי)

### Shopify OAuth Integration

- לקוח מחבר Shopify בonboarding
- Vigmis שואב orders בזמן אמת (webhook)
- כל order: value, products, line_items, order_id
- Attribution: match order ← UTM params שנשמרו ב-cookie → campaign_id
- Product-level: איזה product נמכר מכל קמפיין

### Launch Readiness Gate

לפני השקת קמפיין ראשון — checklist חובה:
```
✅ tracking script installed (test event received)
✅ conversion event mapped (purchase / lead)
✅ attribution validated (test click → conversion traced)
✅ Shopify connected (if e-commerce)
```
אם לא — **לא משיקים**. לא ניתן לדלג.

### True ROAS Dashboard

**לפני:** מציג ROAS מMeta/Google בלבד
**אחרי:** מציג שניהם:
```
Platform ROAS: 4.2x  ← מה Meta אמרה (אפור, קטן)
True ROAS:     2.1x  ← מה Shopify מראה (כחול, גדול)
```

## Round 2 — דיוק ואופטימיזציה על אמת

### Meta CAPI Auto-Setup

- Vigmis מגדיר אוטומטית Conversion API למטא
- שולח events מהשרת (לא רק מהדפדפן) → מדויק יותר, עובד גם iOS14
- Deduplication אוטומטי עם pixel events

### Google Enhanced Conversions

- Vigmis מגדיר Enhanced Conversions לגוגל
- שולח hashed email/phone עם כל conversion → Google מאמת ברמת user

### Engine Upgrade — אופטימיזציה על True CPA

**לפני:** מחליט על בסיס CTR / CPC / platform ROAS
**אחרי:** מחליט על בסיס:
- True CPA (site conversions / spend) — עדיפות ראשונה
- True ROAS (revenue / spend) — עדיפות שנייה
- Profit per conversion = (Revenue × (1 - COGS%)) - Spend — אם margin ידוע
- Platform metrics — fallback בלבד

### Product-Level Attribution

- מ-Shopify line items: איזה product נמכר מכל קמפיין/ad
- Hero Product Mode: dashboard נפרד לביצועי מוצר ספציפי
- Alert: "קמפיין X מוכר יותר — אבל קמפיין Y מרוויח יותר ליחידה"

### Offline Conversion Sync

- Vigmis שולח בחזרה לפלטפורמות: qualified_lead, closed_deal, purchase_value
- Meta: Offline Conversions API
- Google: Offline Conversions import
- **מה זה עושה:** אלגוריתם Meta/Google לומד מי הלקוח האיכותי → פחות בזבוז על לידים זולים שלא קונים

## Round 3 — מה שאף אחד לא עושה

### Incrementality Testing (אוטומטי)

**מה זה:** 10% מהקהל לא רואה מודעות. מה ההפרש בתוצאות בין 90% ל-10%?
זה הדרך היחידה לדעת אם הפרסום **באמת** עובד.

**Vigmis עושה את זה אוטומטי:**
- Holdout group setup אוטומטי
- Statistical significance detection
- תוצאה: "True Incremental ROAS: X" vs "Attributed ROAS: Y"
- אף SMB tool לא עושה את זה כיום

### Creative → Outcome Correlation

- קושר creative_id → conversion event → CRM outcome
- תוצאה: "הוידאו הזה מביא קליקים זולים אבל 5% conversion rate. התמונה הזו מביאה קליקים יקרים אבל 22% conversion rate."
- Dashboard: creative performance לפי מכירות בפועל — לא לפי CTR

### Audience Quality Scoring

- Lookalike 1% vs 3% vs interest targeting — מי קונה בפועל?
- Vigmis מצליב audience segment → conversion events → assigns quality score
- מחזיר signal לפלטפורמות: "אלה הקונים האמיתיים — מצא עוד כאלה"

### CRM Webhook + Lead Quality Loop

- Vigmis מקבל webhook מכל CRM (HubSpot, Monday, Zoho, custom)
- כל status update: lead → contacted → qualified → closed / lost
- Vigmis מחשב:
  - Cost per Qualified Lead (לא רק CPL)
  - Cost per Closed Deal
  - Close Rate per Campaign
  - Average Time to Close
- אופטימיזציה: קמפיין שמביא CPL זול אבל close rate 2% → גרוע. קמפיין עם CPL גבוה אבל close rate 18% → מצוין.

---

# חלק ה — ארכיטקטורה טכנית

## Stack

| רכיב | טכנולוגיה | Deploy |
|------|-----------|--------|
| Frontend | Next.js 16 (App Router) | Vercel Pro |
| Backend API | Fastify (Node.js) | Railway |
| Database | Supabase (PostgreSQL) | Supabase |
| Auth | Clerk | Clerk Cloud |
| AI | Anthropic Claude (primary), OpenAI GPT-4o, Gemini | Railway |
| Email | SendGrid | Cloud |
| WhatsApp | Twilio | Cloud |
| Billing | Paddle | Cloud |
| Creative Video | HeyGen, Kling AI, Pika Labs | Cloud APIs |
| Creative Image | DALL-E 3 (OpenAI) | Cloud |

## ארכיטקטורה בסיסית

```
User Browser
    ↓
Vercel (Next.js 16)
    ↓ Server Actions
Railway (Fastify API)
    ↓              ↓              ↓
Supabase      Ad Platforms    AI Providers
(PostgreSQL)  (Meta/Google/   (Anthropic/
              TikTok APIs)    OpenAI/Gemini)
```

**כלל:** כל AI קוראות דרך Railway API. אין מפתחות AI בVercel.

## Middleware

`apps/web/proxy.ts` (לא middleware.ts!) — Next.js 16 rule:
- ציבורי: /, /sign-in, /sign-up, /terms, /privacy, /refund, /cookies, /faq, /about, /contact, /unsubscribe, /api/cron
- מוגן (Clerk auth): כל השאר

## Crons (Vercel Pro)

| Cron | Schedule | מה עושה |
|------|----------|---------|
| optimize | 0 3,11,19 * * * | אופטימיזציה Basic (3x/יום) |
| optimize-pro | 0 7,15,23 * * * | אופטימיזציה Pro (3x נוספות) |
| invoice | 0 6 1 * * | חשבונית חודשית |
| digest | 0 8 * * 1 | Weekly digest (שני) |
| expire-protocols | 0 2 * * * | פקיעת protocols |
| social-weekly | 0 8 * * 1 | יצירת פוסטים שבועיים |
| social-publish | 0 * * * * | פרסום פוסטים מאושרים |
| social-comments | 0 */4 * * * | משיכת תגובות |
| social-analytics | 0 */6 * * * | עדכון analytics סושיאל |
| daily-report | 0 8 * * * | דוח יומי |
| monthly-report | 0 7 2 * * | דוח חודשי |

## Database — Migrations שרצו

| Migration | תוכן |
|-----------|------|
| 001–009 | Core: tenants, campaigns, metrics, alerts, intelligence, creatives, protocols |
| 010 | approval_request table |
| 011 | decision_protocols table |
| 012 | ab_tests — עמודות חדשות |
| 013 | paddle_customer_id |
| 014 | social_settings, social_posts, social_analytics |
| 015 | social_comments |

---

# חלק ו — Onboarding Flow מלא (כולל שדרוג עתידי)

## שלבים קיימים
```
connect → chat → website_check → analysis → strategy → creative_brief
→ creative_generate → campaign_plan → launch
```

## שלבים חדשים (Round 1)
```
[NEW] business_type_definition    ← ראשון מכל!
connect
[NEW] store_connection (Shopify)
[NEW] tracking_setup (pixel install + verify)
chat
website_check
analysis
strategy (+ margin + hero product)
[NEW] conversion_mapping
[NEW] launch_readiness_gate       ← חובה לפני launch
creative_brief
creative_generate
campaign_plan
launch
```

---

# חלק ז — סוגי לקוחות ומה Vigmis עושה לכל אחד

## A. E-commerce (חנות כללית)

**דוגמה:** חנות ציוד לבעלי חיים עם 500 מוצרים
**KPI:** ROAS, Revenue
**Vigmis עושה:** מתחבר ל-Shopify, אופטימיזציה על total revenue, attribution לפי UTM

## B. Hero Product

**דוגמה:** מוצר אחד (גאדג'ט, קורס, תוסף תזונה)
**KPI:** Profit per unit, CAC
**Vigmis עושה:** קמפיין ממוקד מוצר, מחשב True Profit = Revenue - COGS - Spend, מזהה אם שינוי creative/audience משפר רווחיות

## C. Lead Generation (B2C)

**דוגמה:** שירותי שיפוצים, עורך דין, מאמן אישי
**KPI:** Cost per Qualified Lead, Cost per Closed Deal
**Vigmis עושה:** מחבר CRM webhook, מחשב close rate לפי קמפיין, שולח qualified leads כ-offline conversions לפלטפורמות

## D. SaaS / App

**דוגמה:** תוכנה, אפליקציה, membership
**KPI:** Cost per Trial, CAC, Payback Period
**Vigmis עושה:** עוקב אחר signup → trial → paid, מחשב CAC לפי מקור

## E. B2B (מוגבל כרגע)

**מצב:** ללא LinkedIn — חלקי בלבד
**מה עובד:** Google Search (intent), Meta (job title targeting)
**מה חסר:** LinkedIn (targeting מדויק לB2B)
**מסר ללקוח:** "Vigmis עובד לB2B דרך Google + Meta. LinkedIn integration בקרוב."

---

# חלק ח — ממתין לאישורים חיצוניים

| פלטפורמה | סטטוס | מה חסר |
|-----------|--------|--------|
| Google Ads API — Standard Access | ממתין (הוגש 2026-04-07) | אישור גוגל |
| Meta Marketing API — Business Verification | ממתין | אישור מטא |
| TikTok — Marketing API + Content Posting | Login Kit ✅ | scopes נוספים |
| Meta — pages_manage_posts | ממתין | הוספה לApp |
| Meta — instagram_content_publish | ממתין | הוספה לApp |
| Meta — instagram_manage_comments | ממתין | הוספה לApp |

---

# חלק ט — פיצ'רים עתידיים (לא בתהליך)

> פרק זה מתעדכן בהתאם לסדר עדיפויות. דברים כאן לא בנויים עדיין.

## עדיפות גבוהה (Round 4)

### LinkedIn Integration
- יפתח B2B באמת
- Targeting לפי תפקיד / חברה / תעשייה
- Lead Gen Forms ב-LinkedIn

### Multi-Touch Attribution
- Last-touch הוא approximation. מי שהתחיל את המסע מקבל קרדיט חלקי.
- מצריך: session stitching, cross-device, view-through
- שווה לבנות כש-data volume מספיק

### WooCommerce Native Integration
- כרגע: webhook ידני
- עתיד: plugin WordPress + OAuth

### Cross-Device Attribution
- ראה מודעה בנייד → קנה על מחשב
- דורש email-based matching (hashed)

## עדיפות בינונית (Round 5)

### Profit-Based Optimization (מלא)
- אם לקוח מזין margin לפי product → Vigmis מייצר קמפיינים לפי רווח ולא לפי revenue
- עכשיו: margin% כללי
- עתיד: margin לפי SKU מShopify

### LTV Optimization
- לא אופטימיזציה על first purchase אלא על 12-month LTV
- דורש 6+ חודשי data per customer

### Predictive Lead Quality
- AI מנבא איכות ליד בזמן אמת לפי: landing page, form fields, time-of-day, source
- דורש 3–6 חודשי data + CRM feedback

### HubSpot / Salesforce Native Connector
- כרגע: webhook כללי
- עתיד: OAuth ישיר, sync דו-כיווני

## עדיפות נמוכה (Round 6+)

### Competitive Intelligence
- מה המתחרים מוציאים ועל מה מפרסמים
- Tools: Meta Ad Library API, SimilarWeb, SpyFu

### Incrementality Testing Advanced
- Multi-cell holdout (A/B/C test עם holdouts)
- Geographic holdouts
- Synthetic control groups

### Profit-Based Creative Selection
- לא "איזה creative יש לו CTR טוב" אלא "איזה creative מוכר ברווח גבוה יותר"
- דורש creative_id → product sold → margin data

### Google Performance Max Integration
- PMax מסתיר את הנתונים — Vigmis צריך לעבוד בתוך המגבלות שלו

### TikTok Shop Integration
- מכירה ישירה דרך TikTok
- שוק עולה, בעיקר Gen-Z

### Retail / Offline Attribution
- ראה מודעה → קנה בחנות פיזית
- Meta Offline Events + Google Store Visit Conversions

---

# חלק י — מדדי הצלחה של Vigmis עצמו

**מה מוכיח שVigmis עובד:**
- True ROAS > Platform ROAS (מוכיח שהפלטפורמות מנפחות)
- Incrementality ROAS > 0 (מוכיח שהפרסום מוסיף ערך)
- Close Rate per Campaign (מוכיח אופטימיזציה על איכות)
- "Vigmis saved X$ this month" (efficiency gain)

**המשפט שמוכר Vigmis:**
> "הROAS האמיתי שלך הוא 1.8x, לא 4.2x שפייסבוק הראתה.
> בגלל זה שינינו אסטרטגיה — וחסכנו $3,000 בחודש."

---

*מסמך זה מתעדכן עם כל תוספת פיצ'ר. גרסה אחרונה תמיד ב-`docs/VIGMIS_PRODUCT_BOOK.md`*
