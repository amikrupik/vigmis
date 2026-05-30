# Vigmis — רשימת פיצ'רים מלאה

מסמך זה מתאר את כל היכולות, השירותים והפיצ'רים של פלטפורמת Vigmis במצבה הנוכחי.
תאריך עדכון: 2026‑05‑30.

---

## 1. תיאור הפלטפורמה בקצרה

Vigmis היא פלטפורמת SaaS שמנהלת לעסקים קטנים ובינוניים (SMB) **באופן אוטומטי** את כל מערך הפרסום הדיגיטלי שלהם — גם פרסום בתשלום (Google Ads, Meta Ads, TikTok Ads) וגם פרסום אורגני בסושיאל מדיה (Facebook, Instagram, TikTok).

הלקוח עובר Onboarding חד‑פעמי, וVigmis ממשיכה לבד: יוצרת אסטרטגיה, פותחת קמפיינים, מנהלת תקציבים, מייצרת תוכן יומיומי, מפרסמת פוסטים, ועוקבת אחרי תוצאות — בלי שהלקוח נדרש לדעת דבר על שיווק דיגיטלי.

---

## 2. תהליך הצטרפות (Onboarding)

### 2.1 ניתוח אתר אוטומטי
- Multi‑page crawl: דף בית + עד 5 עמודי משנה (about, products, shop, collections, services, menu, faq).
- חילוץ Open Graph (og:title, og:description, og:site_name).
- חילוץ JSON‑LD Product schema (Shopify, Wix, Squarespace).
- שימוש ב‑User‑Agent של דפדפן (לא bot string) כדי לעקוף חסימות בסיסיות.
- "Confidence gate": אם מצאנו פחות מ‑500 תווים אחרי כל המאמץ — מסרבים להמשיך ומחזירים שגיאה מפורשת ללקוח (לא ממציאים תוכן).
- זיהוי שפה אוטומטי לפי טווחי Unicode (עברית / ערבית / רוסית / אנגלית).
- שמירת הניתוח בבסיס הנתונים (טבלת `client_settings.website_analysis`) — לשימוש חוזר בכל פעולה עתידית.

### 2.2 שאלון עסקי
- מטרת הקמפיין (מכירות, לידים, תנועה).
- תקציב חודשי.
- אזורים גיאוגרפיים.
- אזורים להחרגה.
- מרווח רווח (Margin) למוצר.
- מוצר‑דגל (Hero product).
- שאלות מותאמות לפי סוג העסק.

### 2.3 הגדרת מצב אישור (Approval Mode)
- **Conservative** — כל פעולה משמעותית של ה‑engine יוצרת Decision Protocol שדורש אישור מהלקוח לפני ביצוע.
- **Active** — הפעולות מתבצעות אוטומטית.

---

## 3. אינטגרציות לפלטפורמות חיצוניות (OAuth)

### 3.1 Google Ads
- חיבור דרך Google OAuth.
- Scope: `adwords` + Google Analytics readonly.
- **סטטוס:** Basic Access אושר. עובד עם חשבונות Google Ads אמיתיים. מגבלה: 15,000 ops/יום (מספיק ל‑~100 לקוחות פעילים).
- Standard Access ממתין: יוגש מחדש כשהיקף הפעילות יגיע ל‑10,000 משתמשים.

### 3.2 Meta (Facebook + Instagram)
- חיבור דרך Facebook Login.
- Scopes מבוקשים: `public_profile`, `ads_read`, `ads_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`.
- Token: long‑lived (60 ימים), עם רענון אוטומטי.
- **סטטוס נכון לתאריך:** רק `public_profile` אושר ב‑App Review. שאר ה‑scopes ממתינים להגשה מחודשת עם סרטון end‑to‑end מלא. הוגש 2026‑05‑03, נדחה בגלל סרטון לא מספיק. App Review הבא בהכנה.
- Business Verification אושר (Vigmis ID 3698041317002548).
- Access Verification — Tech Provider אושר.

### 3.3 TikTok
- שני APIs נפרדים:
  - **TikTok for Developers** (open.tiktokapis.com) — Content Posting API. אושר. Scopes: `user.info.basic`, `video.upload`, `video.publish`. תומך ב‑Direct Post.
  - **TikTok for Business** (business‑api.tiktok.com) — Marketing API. הוגש, עוד לא אושר.
- העלאה דרך FILE_UPLOAD (לא PULL_FROM_URL) — חוסך verify domain.

### 3.4 Google Analytics 4 (GA4)
- Properties Picker אוטומטי דרך Admin API.
- Sync יומי של נתונים (sessions, conversions, revenue per source/medium) דרך Data API.
- Cron אוטומטי ב‑02:30 UTC.
- שמירה בטבלת `ga4_daily_metrics`.

### 3.5 Shopify
- Webhooks ל‑order events.
- Conversion tracking אמיתי (לא self‑reporting של הפלטפורמות).
- חישוב AOV (Average Order Value) per customer.

---

## 4. ייצור אסטרטגיה אוטומטי

לפי ניתוח האתר + השאלון, ה‑AI מייצרת תוכנית קמפיין מלאה:

- חלוקת תקציב בין הפלטפורמות (Google / Meta / TikTok).
- קהל יעד מומלץ.
- CPC משוער ו‑custom benchmarks.
- רשימת המלצות לפעולה.
- בחירת פלטפורמות מתאימות לסוג העסק (לדוגמה — TikTok לא מתאים לעסקים מסוימים).

האסטרטגיה נשמרת ב‑`client_settings.strategy_plan` ונגישה ב‑Strategy tab ב‑Dashboard.

---

## 5. ניהול קמפיינים אוטומטי (Paid Ads)

### 5.1 יצירה ותפעול
- יצירת קמפיינים בפלטפורמות (Google + Meta + TikTok).
- הגדרת תקציבים יומיים וחודשיים.
- אופטימיזציית bid.
- A/B testing.
- Pause / Resume אוטומטי.

### 5.2 Optimization Engine
- שואב metrics אמיתיים: clicks, impressions, conversions, revenue, ROAS, CPA.
- מקור נתונים: GA4 (ground truth) — לא ה‑self‑reporting של Meta/Google שמנופח.
- מחליט פעולות לפי כללים:
  - Scale up (+20% תקציב) אם ROAS ≥ 2.
  - Scale down (‑20%) אם CPA חורג מ‑maxCpa.
  - Pause אם 0 conversions לאחר חלון זמן.
  - Needs creative refresh (creative fatigue).
  - Needs targeting review.
  - Alerts וstagnation alerts.

### 5.3 תדירות אופטימיזציה
- **Basic plan:** 3 פעמים ביום (03:00, 11:00, 19:00 UTC).
- **Pro plan:** 6 פעמים ביום (נוסף: 07:00, 15:00, 23:00 UTC).

### 5.4 Conservative Mode
- כל פעולה יוצרת "Decision Protocol" — רשומה שמחכה לאישור הלקוח.
- הלקוח רואה את ההמלצה, מאשר/דוחה.
- ב‑Active Mode הפעולות מתבצעות מיד.

---

## 6. תוכן ופרסום אורגני (Social Media)

### 6.1 ייצור תוכן
- ייצור פוסטים שבועי אוטומטי (Facebook + Instagram + TikTok).
- מבוסס על ניתוח האתר + האסטרטגיה.
- **גילוי שפה אוטומטי** — פוסט נכתב בשפת השוק של הלקוח (אתר ישראלי = פוסט בעברית. אתר אנגלי = פוסט באנגלית).
- ייצור Hashtags רלוונטיים.
- ייצור תמונות (AI).
- ייצור וידאו דרך **HeyGen** (avatar‑based videos).
- חלוקה לעמודות תוכן (pillars).

### 6.2 ניהול פוסטים
- מצב Draft / Approved / Scheduled / Published.
- ויכולת Edit לפני אישור.
- אישור/דחייה ידני (תלוי במצב Approval).
- תזמון לתאריך/שעה ספציפיים.

### 6.3 פרסום אוטומטי
- **Facebook:** Page feed (טקסט / תמונה).
- **Instagram:** Business account (תמונה + caption + hashtags). דורש image — לא תומך text‑only.
- **TikTok:** Direct Post via FILE_UPLOAD (כשvideo.publish יאושר). כרגע התשתית מוכנה, מחכה לאישור scope.

### 6.4 שליפת Page Access Token
- שליפה מ‑`/me/accounts` (לא מ‑`/<pageId>?fields=access_token` שהיה לא אמין).
- שני failure modes ברורים:
  - "Vigmis does not have admin access to Page X" — הזמנה ברורה לבחור Page אחר.
  - "Page role too low" — הוראה ברורה לעדכן את התפקיד ב‑Facebook Page Settings.

---

## 7. Attribution + אנליטיקס

### 7.1 Ground Truth דרך GA4
- כל הפלטפורמות מנפחות נתונים בגלל double‑counting:
  - Google: 30 ימי post‑click attribution.
  - Meta: 1‑day view‑through + 7‑day click‑through.
  - TikTok: דומה.
- GA4 = מקור יחיד באתר, ללא הטיה.

### 7.2 Match לפי UTM
- כל קמפיין שVigmis יוצרת מקבל UTM אוטומטי.
- חיבור בין campaign_name ל‑source/medium ב‑GA4.
- Fallback ל‑source/medium אם אין match.

### 7.3 חישוב Inflation Factor
- השוואה GA4 vs platform self‑report.
- תיקון החלטות ה‑engine לפי הפער.

### 7.4 Sources חיצוניים שזמינים
- Shopify orders (conversion + revenue).
- Vigmis Pixel (self‑hosted ב‑`/track.js`).

---

## 8. מעקב Conversions (Tracking)

### 8.1 Vigmis Pixel
- JavaScript snippet קצר שהלקוח מטמיע באתר.
- נשלח מ‑`https://vigmisapi-production.up.railway.app/track.js?pid=<tenantId>`.
- שולח אירועים (pageview, conversion) חזרה ל‑Vigmis API.

### 8.2 Shopify Webhooks
- אינטגרציה אוטומטית עם חנויות Shopify.
- מעקב אחרי orders/checkout/cancellations.
- AOV model — חישוב Average Order Value per customer.
- כתובת webhook: `${API_URL}/track/shopify/webhook`.

### 8.3 Tracking Guide למשתמש
- Email אוטומטי ביום 1 עם הוראות התקנת Pixel.

---

## 9. צ'אט גלובלי (AI Assistant)

זמין בכל עמוד באפליקציה (mounted ב‑root layout דרך Clerk auth — רק למשתמשים מחוברים).

### 9.1 מודעות הקשר אוטומטית
- אוסף `usePathname()` ושולח אותו כ‑pageContext לכל קריאה.
- ה‑AI יודע באיזה עמוד המשתמש עכשיו ומציע פעולות רלוונטיות.

### 9.2 פעולות זמינות (Pipe Syntax)
- `create_post|platform|pillar` — AI מייצר פוסט חדש לפי האסטרטגיה.
- `write_post|platform|pillar|text` — כתיבת פוסט מותאם מהמשתמש.
- `edit_post|postId|new_text` — עריכת פוסט קיים (לא לפוסטים שכבר פורסמו).
- `set_post_image|postId|url` — הוספת תמונה דרך URL.
- `approve_post|postId` — אישור פוסט לפרסום.
- `reject_post|postId|reason` — דחיית פוסט עם סיבה.
- `schedule_post|postId|ISO_datetime` — תזמון לתאריך.
- `select_ad_account|act_xxx` — בחירת Ad Account ל‑Meta.

### 9.3 Context שהצ'אט מקבל
- 20 הפוסטים האחרונים.
- `social_settings` של הלקוח.
- Ad Account שנבחר ב‑Meta.

---

## 10. Strategy Viewer + History

לשונית Strategy ב‑Dashboard. מציגה:

- **מה Vigmis הבינה על העסק** — `website_analysis`.
- **תוכנית הקמפיין** — פלטפורמות, חלוקת תקציב, קהל יעד, CPC, המלצות, custom benchmarks.
- **Inputs** — מטרה, תקציב, גיאוגרפיה, החרגות, margin, hero product.
- **Change History** — מ‑`audit_log`: scale_up/down, pause, alert, recalibrated.
- **כפתור "Re‑analyze website"** — ריצה חוזרת של ניתוח האתר על ה‑settings הקיימים.
- **לינק "Rethink strategy"** — חזרה ל‑onboarding לעדכון פרמטרים.

---

## 11. Connect Tab — חיבור פלטפורמות

3 קלפים פשוטים (UI באנגלית, ייהפך ל‑רב‑לשוני בעתיד):

### 11.1 Facebook Page (+ Instagram auto‑linked)
- "Load my pages" → רשימת Pages של המשתמש (אינסטגרם מקושר מוצג אוטומטית לכל Page).
- בחירה שומרת ב‑`social_settings.facebook_page_id` + `instagram_user_id` + ממלאת `platforms` JSONB array.
- ללא ניחושים אוטומטיים (מנענו את "Goodland incident" — Vigmis לקחה page[0] ופרסמה לעמוד אישי במקום עסקי).

### 11.2 Meta Ad Account
- "Load my ad accounts" → רשימה של כל Ad Accounts (id, name, currency, business, active/inactive).
- בחירה שומרת ב‑`platform_tokens.account_id` בפורמט `act_xxx`.

### 11.3 Google Analytics (אופציונלי)
- "Load my GA4 properties" → רשימה.
- בחירה שומרת ב‑`ga4_settings`.
- כפתור "Sync now" ל‑sync ידני.

### 11.4 Disconnect
- POST `/connectors/meta/disconnect`:
  - Revoke ב‑Facebook (`DELETE /me/permissions`) כדי שVigmis תיעלם מ‑Apps & Websites של המשתמש.
  - מחיקת token מ‑DB.
  - ניקוי `social_settings` (page IDs, platforms array).

### 11.5 Reconnect Modal
- כשpublish נכשל בגלל permissions → מודאל פשוט בעברית "Your Facebook permissions for Vigmis are out of date".
- כפתור אחד — Reconnect Facebook.
- `<details>` עם Technical details (rawError) לתמיכה.
- Regex זיהוי שגיאות permission: `pages_manage_posts|publish_to_groups|permission|#100|#200|#10|scope|not allowed`.

---

## 12. Multi‑tenancy

- בידוד ברמת לקוח (`tenant_id` בכל טבלה).
- Clerk לאימות משתמשים.
- Tenant נוצר אוטומטית בסיגנאפ ראשון (טבלה `tenants` עם `clerk_user_id`).
- Supabase row‑level isolation דרך מפתחות.

---

## 13. תשתית טכנית

### 13.1 Frontend
- **Next.js 16** App Router (לא Pages Router).
- Vercel deployment.
- Tailwind CSS.
- shadcn/ui components.
- Clerk authentication.
- `bidi safety` — עטיפת ערכים דינמיים ב‑`<bdi>` למניעת LTR/RTL conflicts.

### 13.2 API
- **Fastify** ב‑Node.js (TypeScript).
- Railway deployment (`vigmisapi-production.up.railway.app`).
- Clerk JWT verification middleware.

### 13.3 Database
- **Supabase** (Postgres).
- Storage לתמונות/וידאו.
- 21 migrations עד כה.
- טבלאות עיקריות: `tenants`, `client_settings`, `platform_tokens`, `social_settings`, `social_posts`, `audit_log`, `ga4_settings`, `ga4_daily_metrics`, `campaigns`, ועוד.

### 13.4 AI / Content Generation
- **OpenAI / Claude** — טקסט (פוסטים, ad copy, אסטרטגיה).
- **HeyGen API** — סרטונים מבוססי avatar (pay‑as‑you‑go, $10 בחשבון).
- **DALL‑E / equivalent** — תמונות.

### 13.5 Auth
- Clerk (JWT).
- Bearer token בכל request ל‑API.
- Fallback: `?token=` query param ל‑OAuth redirect flows.

### 13.6 Email + Domains
- Google Workspace על tmgt.co.il + vigmis.com (alias domain).
- 5 Groups: billing/legal/privacy/security/support @vigmis.com.
- DNS מנוהל ב‑Namecheap (לא Vercel).

---

## 14. אבטחה ותאימות

- **Token Encryption** — `encryptToken()` / `decryptToken()` ב‑`@vigmis/db`. tokens של Meta/Google/TikTok לעולם לא נשמרים בטקסט חופשי.
- **Audit Log** — כל פעולה משמעותית (חיבור, ניתוק, scale_up, pause, וכו') נכתבת ל‑`audit_log`.
- **State Validation** ב‑OAuth — `crypto.randomBytes(16)` + Map עם expiry של 10 דקות. מונע CSRF.
- **No Silent Fallbacks** — אין ניחושים אוטומטיים (לא pages[0], לא ad_accounts[0]). הלקוח חייב לבחור במפורש.
- **GDPR / Privacy** — Privacy policy + Terms ב‑vigmis.com. Unsubscribe endpoint.

---

## 15. תמחור, מסלולים ומכסות ✅ הוכרע (2026-05-30)

מקור האמת בקוד: `apps/api/src/billing/pricing.ts`.

**העיקרון המרכזי:** Vigmis מוכרת *ניהול פרסום*, לא ייעוץ ללא הגבלה. כל פעולת AI עולה טוקנים — ולכן הצריכה ממוכסת, והמכסות **גדלות עם התקציב**: ככל שהלקוח מפרסם יותר, העמלה שלו גדולה יותר ומותר לו לצרוך יותר. כך המרווח הגולמי נשאר סביב 80%+ בכל מדרגה.

### 15.1 מסלולים, אחוזים ורצפה

| | Starter (code: free) | Pro (code: pro) |
|---|---|---|
| Management fee | 7% of ad spend | 6% of ad spend |
| Monthly subscription | none | $49 |
| Minimum monthly charge (floor) | $29 | $49 |
| Briefings | Weekly | Daily |
| Included creatives / month | 0 (pay per use) | 1 video + 2 banners |
| Connected channels | per spend tier | All |

הרצפה תופסת את הלקוח הקטן בלי תקציב: כל אחד משלם את הגבוה מבין האחוז לבין הרצפה. לקוח שמפרסם יפה לא מרגיש אותה; מי שבא רק להתייעץ בלי תקציב — נתפס בה. ב-Pro האחוז ירד מ-5% ל-6% והמנוי עלה מ-15$ ל-49$ כדי שהמסלול יישאר רווחי גם בתקציבים גבוהים (תיקון העיוות שבו Starter היה רווחי יותר מ-Pro).

### 15.2 מכסות לפי מדרגת תקציב (Allowances)

| Tier | Monthly ad spend | AI advisor conversations | Comments auto-handled | Active campaigns | Channels | Shopify products |
|---|---|---|---|---|---|---|
| T1 | up to $1,000 | 30 | 300 | 3 | 2 | 500 |
| T2 | $1,001 – $3,000 | 75 | 800 | 6 | 2 | 1,500 |
| T3 | $3,001 – $6,000 | 150 | 2,000 | 10 | 3 | 5,000 |
| T4 | $6,001 – $12,000 | 300 | 4,000 | 20 | All | 10,000 |
| T5 | $12,000 + | 400 + scales | 6,000 + scales | Unlimited | All | Unlimited |

הגדרה מדידה: **שיחת ייעוץ אחת = סשן צ'אט אחד, עד 12 הודעות.** מעבר לזה נחשבת שיחה חדשה — כך כל שיחה חסומה גם בעלות וגם בכמות. כשמכסה נגמרת מוצגת הודעה רכה ("מתחדש בחודש הבא / שדרג"), הפיצ'ר לא נשבר.

### 15.3 תוספות בתשלום (Metered add-ons)

| Item | Price to customer | Our cost | Margin |
|---|---|---|---|
| Social post (FB / IG) | $1.00 | ~$0.05 | 95% |
| TikTok post | $3.00 | ~$0.05 | 98% |
| Comment reply sent | $0.05 | ~$0.012 | 76% |
| Extra conversations (pack of 25) | $9.00 | ~$4.50 | 50% |
| Cinematic video | $12.00 | ~$0.50 | 96% |
| Avatar video | $15.00 | ~$2.00 | 87% |
| Banner | $5.00 | ~$0.04 | 99% |

### 15.4 מפסק ביטחון פר-לקוח (Circuit breaker)

ה-`ai-router` מחזיר `cost_usd` לכל קריאה; הצבירה החודשית מושווית לעמלה.

| Trigger (per customer / month) | Action |
|---|---|
| AI cost reaches 25% of fee | Auto-degrade: routine tasks drop to the cheap model; pause news/weather/insights crons |
| AI cost reaches 40% of fee | Freeze AI features + alert ops (reuse existing stop-loss) |
| Allowance hit (conversations / comments) | Soft wall: renew next month or upgrade |
| Abnormal burst (10× normal in a day) | Rate-limit + flag for review |

### 15.5 הוכחת רווחיות (שימוש מלא במכסה)

| Customer | Fee | AI cost | Processing + infra | Left | Margin |
|---|---|---|---|---|---|
| $300 chatterer (floor) | $29.00 | $9.90 | $1.94 | $17.16 | 59% |
| $1,000 Starter | $70.00 | $12.90 | $3.13 | $53.97 | 77% |
| $5,000 Starter | $350.00 | $52.00 | $11.25 | $286.75 | 82% |
| $10,000 Starter | $700.00 | $99.00 | $21.40 | $579.60 | 83% |

### 15.6 מודל בחירת המודלים (מאיפה העלות באה)

`packages/ai-router/src/config.ts` מנתב כל משימה למודל. החלטות יקרות (אופטימיזציה, ניתוח, דוחות, צ'אט) רצות על Claude Sonnet 4.6; כתיבת תוכן על GPT-4o; משימות סיווג (triage, sentiment) על gpt-4o-mini; תמונות על DALL·E 3. **כל החישוב הזה תקף רק כל עוד הקובץ הזה לא משתנה** — מעבר ל-Opus או מודל יקר מפוצץ את המודל. שמירה על הקובץ קריטית.

### 15.7 סליקה (Payment processing)

- **שלב 1:** Meshulam (סליקה ישראלית) — לא MoR, לא אכפת להם מ‑AI/ad tech.
- **שלב 2:** חברת בת בחו"ל + Stripe ישיר.
- **לא בדרך:** Stripe Direct (לא תומך בישראל), Lemon Squeezy (נדחה), 2Checkout (נדחה), Paddle (לא תומך בישראל).
- עלות סליקה משוערת: 2.9% + $0.30 לחשבונית (נלקחת בחשבון בטבלת הרווחיות).

### 15.8 סטטוס מימוש

- ✅ `pricing.ts` — אחוזים, רצפות, מדרגות מכסה, מחירי תוספות, ספי מפסק (source of truth).
- ✅ `calculator.ts` — חישוב עמלה עם רצפה + Pro 6%/$49.
- ✅ `notifications.ts` — חישובי עמלה ו-Pro upsell מעודכנים.
- ✅ **אכיפת מכסות חיה** — migration 039 (`ai_usage_monthly` + `bump_ai_usage` RPC) + `services/usage.ts`:
  - מעקב עלות AI, הודעות צ'אט ותגובות מטופלות לכל לקוח לחודש (atomic increment).
  - **צ'אט:** `checkChatQuota` חוסם לפני כל קריאת LLM — freeze (מפסק) או מיצוי מכסת שיחות → קיר רך עם הודעה (לא שגיאה). רישום עלות אחרי כל תשובה.
  - **תגובות:** `checkCommentQuota` עוצר triage כשהמכסה החודשית נגמרה או במצב freeze; budget נספר לאורך הריצה.
  - **מפסק:** `breakerState` משווה עלות AI לעמלה; מעבר ל-freeze → עדכון `breaker_state`, audit log, ומייל ל-`OPS_ALERT_EMAIL`.
- ✅ **Cron throttling** — `isThrottled()` מדלג על לקוחות ב-degrade/freeze ב-crons הלא-חיוניים (news-scan, weather, comments-insights).
- ✅ **תקרת קמפיינים** — `/campaigns/launch` חוסם כשמספר הקמפיינים הפעילים מגיע למכסת המדרגה.
- ✅ **UI** — `GET /billing/usage` + widget "Usage & Limits" בעמוד Billing (conversations/comments מול מכסה, breaker banner, tier). מחירי המסלולים עודכנו (Starter 7%/$29, Pro $49+6%).
- ✅ **migrations 023–039 הורצו על Supabase** (2026-05-30, דרך Management API — 17 קבצים, 0 שגיאות). `ai_usage_monthly` + `bump_ai_usage` פעילים.

---

## 16. Cron Jobs פעילים

(Vercel Cron config ב‑`apps/web/vercel.json`)

| Cron | תדירות | פעולה |
|---|---|---|
| `optimize` (Basic) | 03:00, 11:00, 19:00 UTC | אופטימיזציה לכל לקוחות Basic |
| `optimize-pro` | 07:00, 15:00, 23:00 UTC | אופטימיזציה נוספת ל‑Pro |
| `ga4-sync` | 02:30 UTC | sync יומי של GA4 metrics |
| `weekly-generator` | שבועי | ייצור פוסטים שבועי |

---

## 17. מה לא מוכן עדיין / משימות פתוחות

- **Meta App Review** — pages_manage_posts + Instagram scopes טרם אושרו. הגשה חוזרת עם סרטון end‑to‑end מלא בהכנה.
- **TikTok Marketing API** — Standard Access ממתין.
- **Google Ads Standard Access** — יוגש כשנגיע ל‑10,000 משתמשים.
- **Billing** — Meshulam טרם מומש.
- **Multi‑language UI** — כרגע אנגלית בלבד. תרגומים אחרי גמר פיתוח.
- **Comment management UI** — Instagram comments scope קיים בבקשה, UI ייבנה בסבב הבא.

---

## 18. Marketing Brain — שכבת חשיבה דיאגנוסטית ✅ נבנה (Sessions 3-4)

הסעיף הזה היה roadmap. נכון ל-2026-05-28 — **הכל נבנה ב-backend**. הפיצ'רים הבאים זמינים כקוד פעיל:

### 18.1 Statistical Significance Gating ✅ נבנה
- `apps/api/src/services/significance.ts` — Wilson confidence intervals
- `safeToScaleUp` / `safeToScaleDown` requires 90% CI ≥ goodCtr (or ≤ minCtr) AND min spend (max($30, 2× daily budget))
- `proportionsDiffer` (2-prop z-test) ל-creative fatigue detection
- מחובר ל-`apps/api/src/optimization/rules.ts` — החלטות scale up/down עוברות דרכו

### 18.2 Incrementality / Attribution Honesty ✅ נבנה במלואו
- `apps/api/src/services/incrementality.ts` — floor estimate של incremental_roas = new_customer_revenue / ad_spend
- migration 029 — extended ga4_daily_metrics עם new_users + first_time_purchasers + first_purchase_revenue + returning_users
- tenant_incrementality_snapshot table (cached)
- `packages/ad-connectors/src/ga4/index.ts` — fetchGa4DailyAcquisition עושה 2 קריאות במקביל (aggregate + newVsReturning split) ומאחד. GA4DailyRow מוחזר עם כל השדות החדשים. ה-sync ב-`routes/ga4.ts` ה-upsert spread אוטומטית.

### 18.3 Creative Brief Layer ✅ נבנה
- migration 026 — creative_briefs table per product
- `apps/api/src/services/creative-brief.ts` — extractCreativeBrief (LLM 4-corner pain/promise/proof/objection), saveCreativeBrief, getDefaultBrief, briefInstructions
- אוטומטי לאחר onboarding/settings (background)
- מחובר ל-social-content.ts — כל post generation מקבל briefBlock לפני brand voice block

### 18.4 Brand Voice Engine ✅ נבנה
- migration 025 — `client_settings.brand_voice_profile` JSONB + brand_voice_extracted_at + brand_voice_source
- `apps/api/src/services/brand-voice.ts` — extractBrandVoice (LLM), brandVoiceInstructions, getBrandVoice, refreshBrandVoiceForTenant
- אוטומטי לאחר onboarding/settings (background)
- מחובר לכל הgeneration paths (posts + comment replies)

### 18.5 Proactive Briefings (WhatsApp/Email) ✅ נבנה
- migration 028 — briefing_preferences + briefing_log
- `apps/api/src/services/briefings.ts` — buildBriefing, sendBriefingForTenant, dispatchBriefingsCron
- 4 שפות (en/he/ar/ru) + RTL email
- `apps/api/src/routes/briefings.ts` — GET/PUT preferences, send-now, log, preview, cron
- Cron רשום ב-`apps/web/vercel.json` כל שעה
- **UI לעריכת preferences עדיין לא קיים — API בלבד.**

### 18.6 "Don't Advertise" / Conversion Readiness ✅ נבנה
- migration 027 — client_settings.conversion_readiness JSONB + conversion_readiness_score + at
- `apps/api/src/services/conversion-readiness.ts` — auditConversionReadiness (LLM, score 0-100, verdict ready/fix_before_ads/block), gateAdsByReadiness
- `apps/api/src/routes/readiness.ts` — POST /readiness/audit, GET /readiness, GET /readiness/gate
- מחובר ל-`/campaigns/launch` — verdict=block חוסם השקה. אוטומטי לאחר onboarding (background).
- **UI להצגת readiness score ב-Strategy tab עדיין לא קיים.**
- **Inventory feed (Shopify) — דורש shopify_products+shopify_settings tables שלא קיימים. Truth Verifier degrades gracefully.**

### 18.7 Context-Aware Interpretation ✅ נבנה
- `apps/api/src/services/metric-interpreter.ts` — context-aware bands per (metric × campaignType × category)
- 6 metrics: ctr/frequency/hook_rate/completion_rate/roas/cpa
- Verdicts: excellent/good/normal/concerning/critical
- Special readings: frequency=4 ב-retargeting=good, ב-prospecting=concerning
- interpretCampaign() מחזיר primary + all readings
- **UI ב-chat/dashboard עדיין לא חשוף.**

### 18.8 Operational Awareness ✅ נבנה במלואו
- ✅ Geographic awareness ב-classifier + publisher (סעיף 20.4 + Session 4.5)
- ✅ Calendar awareness — `apps/api/src/services/operational-awareness.ts`. Black Friday, Cyber Monday, Christmas, Valentine's, Back-to-school, High Holidays IL, Yom Kippur, Passover. per-country activation.
- ✅ Business hours per country — DEFAULT_BUSINESS_HOURS (IL/US/GB/DE) + closedDays
- ✅ News monitoring — `apps/api/src/services/news-monitor.ts`. NewsAPI integration + LLM relevance filter (relevance_score 0-1, category competitor/industry/regulation/macroeconomy). migration 037 (news_alerts table). Cron `/ops/cron/news-scan` כל 6 שעות. notification אוטומטי על relevance ≥0.7.
- ✅ Weather — `apps/api/src/services/weather.ts`. OpenWeatherMap 3-day forecast. per-business sensitivity profile (hot_boost / rain_dampens / rain_boosts / cold_dampens / cold_boosts). migration 038 (weather_snapshot + client_settings.weather_sensitive + weather_sensitivity). Cron `/ops/cron/weather` 2×/day. PUT `/ops/weather-sensitivity` להגדרה.
- ✅ getOperationalContext משלב הכל: active_event + upcoming_event + weather_note + recent_news_alerts + recommendation

---

## 19. Intent Router — טיפול בבקשות פתוחות ✅ נבנה (Session 3.3)

`apps/api/src/services/intent-router.ts` — classifyIntent + fast-path policy check + מענה מובנה.
מחובר ל-`/chat` route: נון-native bucket מחזיר תשובה ישירות ללא הפעלת ה-chat engine.

כל בקשה בצ'אט מסווגת לאחד מ‑6 פחים:

| פח | פעולה |
|---|---|
| 1. Native capability | בצע |
| 2. Subscription gate | "זמין ב‑Pro — שדרוג כאן" |
| 3. Platform limitation | "Meta TOS אוסר X. החלופה היא Y" |
| 4. Legal block | סירוב + הסבר חוקי |
| 5. Ethical block | סירוב + הסבר ערכי (סעיף 20) |
| 6. Out of scope but adjacent | "אני כלי שיווק. לזה תצטרך עו"ד/רו"ח. אבל הנה התובנה השיווקית" |

**כלל מוחלט:** כל "לא" חייב לכלול (א) סיבה ספציפית (ב) מה כן אפשר במקום. אין "אני לא יכול לעזור" generic.

---

## 20. Content Policy — מערכת 3‑Tiers ✅ נבנה (Sessions 1, 4.5)

`apps/api/src/services/policy-classifier.ts` (Session 1) — fast-path regex (Tier 0 בלוק מיידי) + LLM classifier.
`apps/api/src/services/policy-gate.ts` — wrapper שרושם כל classification ב-`content_decisions` table (audit immutable).
`apps/api/src/services/geo-context.ts` (Session 4.5) — geoLegality(category, country) — cannabis/CBD/gambling/alcohol/political per-country.
מחובר ל-: social-content generation (pre-flight), social.ts approve (post-flight), publish cron (last line), chat (intent-router fast-path).

### 20.1 Tier 0 — בלוק מוחלט, אוטומטי, ללא ערעור
- סמים, נשק לא חוקי, סחר בבני אדם, ניצול קטינים.
- דיבה / לכלוך על עסקים מזוהים בשם.
- shaming של אנשים פרטיים בשם.
- הסתה על רקע גזע/דת/מגדר/לאום/נטייה.
- פירמידות, "תתעשר מהר", הונאות פיננסיות.
- טענות רפואיות מוחלטות ("מרפא X").
- שיווק לקטינים של אלכוהול/הימורים/טבק.
- doxxing / מידע אישי של אחרים.

### 20.2 Tier 1 — דורש Human Review + רישיון מתאים
- הימורים (לפי מדינה).
- אלכוהול / קנאביס / CBD (חוקיות לפי מדינה).
- תוספי תזונה עם טענות בריאות.
- שירותים פיננסיים (יועצים, אשראי).
- שירותים רפואיים (דורש רישיון מקצועי).
- פוליטיקה ובחירות (חלונות זמן רגישים).

### 20.3 Tier 2 — מותר עם הסתייגויות
- מוצרי מבוגרים (לפי מדינה + פלטפורמה).
- שירותי דייטינג.
- ירידה במשקל (פלטפורמות מגבילות).

### 20.4 Geographic Awareness
- Vigmis יודעת באיזו מדינה הלקוח פועל ולאן הקמפיין מכוון.
- חוקיות נבדקת לפי שתי המדינות (מקור + יעד).
- דוגמה: קנאביס חוקי בקליפורניה, פלילי בסעודיה. CBD אסור בחלק מהאיחוד.

### 20.5 Why — הצדקה תפעולית
זה לא רק אתיקה — זה **סיכון פלטפורמה קיומי**. לקוח אחד שמפר Meta TOS → ה‑App של Vigmis יכול להיחסם → כל הלקוחות מאבדים שירות בבת אחת. Vigmis חייבת להיות מחמירה יותר מ‑Meta/Google/TikTok.

### 20.6 Positioning
**"Vigmis לעסקים שעובדים נקי."** — סינון הוא feature, לא bug.

---

## 21. Publisher Liability Shield ✅ נבנה (Sessions 1, 2, 4, 5)

Vigmis היא **publisher**, לא tool. היא יוצרת, מפרסמת, ומבצעת אופטימיזציה. Section 230 (US) לא מגן עליה כמו על platform נייטרלי. ב‑EU/ישראל יש עוד פחות הגנות.

### 21.1 MVP — כל הרכיבים נבנו (Session 1)

#### ✅ Explicit Content Responsibility Checkbox
- `apps/web/app/components/AttestationCheckbox.tsx` + `attestation-actions.ts`
- `apps/api/src/routes/attestations.ts` — 7 versioned statement kinds
- onboarding/settings מקבל gate (412) אם 3 attestations חסרים: onboarding_master + tos_acceptance + ai_disclosure_consent

#### ✅ Approval Snapshots (Forensic-Grade)
- migration 023 — approval_snapshots table
- `apps/api/src/services/approval-snapshot.ts` — canonical-JSON SHA256, IP, UA, attestation linkage
- מחובר ל-publish + budget changes + campaign launch + onboarding completion

#### ✅ High-Risk Claims Classifier
- migration 023 — content_decisions table (audit immutable)
- `apps/api/src/services/policy-classifier.ts` — fast-path regex Tier 0 + LLM nuanced + fail-closed
- `apps/api/src/routes/policy.ts` — POST /policy/classify

#### ✅ AI-Generated Content Disclosure (Auto-Labeling)
- `apps/api/src/services/ai-disclosure.ts` — Meta/IG/TikTok/Google + EU AI Act
- per-platform metadata (TikTok is_ai_generated flag, Meta ai_info_label)
- visible suffix ב-4 שפות (en/he/ar/ru)
- מתחשב ב-client_edit (אם המשתמש כתב לבד, text לא נחשב AI)

#### ✅ Decision Audit Log
- כל החלטה ב-`content_decisions` (block/allow/rewrite + tier + category + reason + model_used + tokens + latency)
- `apps/api/src/routes/explainability.ts` — GET /audit/decisions/:id, /audit/snapshots/:id, /audit/compliance-summary

### 21.2 פוסט‑MVP

### 21.2 Post-MVP — נבנו ב-Sessions 3, 4, 5

#### ✅ Truth Verification (Cross-Reference) — Session 4.1 + Shopify sync
- `apps/api/src/services/truth-verifier.ts` — claim extraction (free_shipping/price/discount/limited_stock/limited_time)
- Cross-reference: shopify_products + shopify_settings + website_analysis
- Block על fake_scarcity, shipping_contradiction. warn על שאר.
- migration 036 — shopify_products + shopify_settings tables
- `apps/api/src/services/shopify-sync.ts` — fullSyncForTenant (paginated catalog fetch + shipping zones + currency), registerProductWebhooks (products/create+update+delete + inventory_levels/update), applyProductWebhook (delta updates), dispatchShopifySyncCron (nightly)
- חיבור ב-OAuth callback (`/track/shopify/callback`) — full sync + webhook registration רצים אוטומטית ברקע
- Webhook endpoint `/track/shopify/products-webhook` עם HMAC verification
- Cron `/api/cron/shopify-sync` 03:00 יומי

#### ✅ Trust Tier (3-axis scoring) — Session 3.2
- migration 024 — tenant_trust_tier + bypass_attempts tables
- `apps/api/src/services/trust-tier.ts` — computeTier, recomputeTrustTier, getTrustTier, actionGateForTier, logBypassAttempt
- 3 axes נפרדים (policy_violations / customer_complaints / bypass_attempts) — לא score מאוחד
- 4 tiers: trusted / standard / watch / restricted
- מחובר ל-publish, generation, campaign launch
- Daily cron `/compliance/cron/recompute-trust` מרענן

#### ✅ Periodic Re-Attestation — Session 5.1
- `apps/api/src/services/re-attestation.ts` — checkReAttestationStatus + dispatchReAttestationCron
- 90 ימים → תזכורת אימייל + audit log
- Cron `/api/cron/reattestation` ב-vercel.json

#### ✅ Two-Key Pattern — Session 4.6
- `apps/api/src/services/two-key.ts` — evaluateTwoKey
- Triggers: Tier 1 category / trust tier watch+restricted / high-stakes keywords
- Second-pass classifier (paranoid prompt + temperature 0)
- מחובר ל-`/social/posts/:id/approve` — final=block → 422, final=requires_human → 409

#### ✅ Pre-Publish Cooling-Off — Session 5.2
- migration 034 — cooling_off_until + cooling_off_labels + cooling_off_cancelled על social_posts
- `apps/api/src/services/high-stakes-detector.ts` — 8 patterns (guarantee/refund/price/discount/urgency)
- 1-hour השהיה ב-approve handler אם publish_now AND high-stakes
- POST `/social/posts/:id/cancel-cooling-off` — בעל העסק יכול לבטל

#### ✅ Industry Compliance Gates — Session 5.3
- `apps/api/src/services/industry-gates.ts` — pattern detection ל-medical/financial/legal/gambling/alcohol/cannabis/cosmetic/minors/food
- דורש industry_eligibility attestation עם context.license תואם
- מחובר ל-social.ts approve + campaigns launch

#### ✅ Sensitive Business Kill Switch — Session 5.4
- migration 035 — tenants.frozen + freeze_reason + freeze_capabilities + frozen_at + frozen_by
- `apps/api/src/routes/admin.ts` — POST /admin/tenants/:id/freeze, /unfreeze + GET /state
- Protected by `ADMIN_SECRET` env var (לא Clerk — אדמיני Vigmis בלבד)
- `isFrozenFor(tenantId, capability)` helper מחובר ל-publish, generation, optimization, campaign launch

#### ✅ Explainability Layer — Session 5.5
- `apps/api/src/routes/explainability.ts` — GET /audit/decisions/:id, /audit/snapshots/:id, /audit/compliance-summary
- מענה לרגולטורים / לקוחות / תביעות — מחזיר full trace

#### ✅ Stop Loss — Customer Termination — Session 5.6
- `apps/api/src/services/stop-loss.ts` — evaluateStopLoss + dispatchStopLossCron
- Thresholds (30 days): ≥15 policy blocks / ≥5 bypass attempts / ≥3 legal_risk events
- ≥5 bypass → auto-freeze. אחרת manual review + OPS_ALERT_EMAIL
- Cron `/api/cron/stop-loss` ב-vercel.json

### 21.3 Framing משפטי — קריטי
- **אסור:** "Vigmis created this ad."
- **חובה:** "Customer-approved content. Draft prepared by AI assistant based on customer-provided business information."
- כל UI string, email, metadata חייב לעמוד בכלל.

### 21.4 Insurance Triggers
- E&O / Publishers Liability insurance — חובה מ‑$1M ARR או 100+ לקוחות פעילים.
- ביום 1 לא חובה, אבל לתכנן.

---

## 22. ToS — Terms of Service (סעיפים מחייבים)

ניסוח סופי דורש עו"ד. הסעיפים המחייבים:

1. **רשימת קטגוריות אסורות** — מפורטת לפי 3 ה‑tiers (סעיף 20).
2. **סעיף שיקול דעת בלעדי:**
   > "Vigmis שומרת לעצמה את הזכות לסרב לתת שירות, להפסיק שירות קיים, או להסיר תוכן, לפי שיקול דעתה הבלעדי, גם במקרים שאינם נכללים ברשימה המפורשת — כולל בשל שיקולי תדמית, ערכים, סיכון פלטפורמה, או שיקולים אתיים."
3. **ללא החזר במקרה של הפרה** — אם נסגר עקב הפרה, אין refund.
4. **Indemnification** — הלקוח משפה את Vigmis על תביעות צד ג' מתוכן שהוא הזין/אישר.
5. **הצהרת זכאות (Eligibility)** — חתימת הלקוח שיש לו הרישיונות/אישורים הנדרשים (רופא, יועץ פיננסי, מורשה הימורים וכו').
6. **מנגנון ערעור פנימי** — הוגן, מתועד, לא מחייב את Vigmis לאשר.
7. **Content Responsibility** — כל מידע שהלקוח מזין הוא על אחריותו (אמיתות, חוקיות, זכויות שימוש).
8. **AI Content Disclosure consent** — הלקוח מסכים לתיוג אוטומטי של תוכן AI לפי דרישות פלטפורמות.

---

## 23. Regulatory Compliance

- **EU AI Act** — חל כבר. AI-generated content disclosure חובה.
- **Meta/Google/TikTok policies** — AI labeling דרישה חובה.
- **GDPR** — קיים. Privacy policy + Unsubscribe.
- **COPPA / ילדים** — flags לזיהוי content המכוון לקטינים.
- **HIPAA-like (US health)** — אם מפעילים שם, נדרש tier מתאים.
- **MiFID/SEC-like (financial)** — חובת disclaimer + רישוי.
- **Israeli Consumer Protection Law** — חובת הצגת מחיר מלא, אחריות, ביטול עסקה.
- **Political ad transparency** — חלונות זמן רגישים סביב בחירות.

---

## 24. Sensitive Operations — Kill Switch & Audit ✅ נבנה (Session 5.4)

### 24.1 Admin Capabilities ✅
- `apps/api/src/routes/admin.ts` — POST /admin/tenants/:id/freeze, /unfreeze + GET /state
- ADMIN_SECRET header (לא Clerk — אדמיני Vigmis בלבד)
- freeze_capabilities array: publish / optimize / generation / crons
- `isFrozenFor(tenantId, capability)` helper מחובר ל-publish, generation, optimization, campaign launch

### 24.2 Audit Tables ✅
- `content_decisions` — כל החלטת classifier (Session 1)
- `approval_snapshots` — forensic snapshots (Session 1)
- `content_attestations` — חתימות checkbox (Session 1)
- `bypass_attempts` — Session 3.2
- `tenant_trust_tier` — Session 3.2
- `briefing_log` — Session 4.2
- `sentiment_velocity_snapshot` — Session 6.3
- `comment_insights` + `reply_outcomes` — Session 6.6
- `reply_override_log` — Session 6.5

---

## 25. Social Inbox Intelligence ✅ נבנה (Session 6)

### 25.1 Taxonomy v2 + Do-Not-Engage
- migration 031 — Sentiment expanded ל-10: positive/question/purchase_intent/lead/complaint/angry/troll/hate/legal_risk/spam/other
- columns חדשים: classifier_confidence, reply_confidence, routing_recommendation, do_not_engage, priority_score, reply_blocked_by_policy
- `social-comments.ts` — provocation patterns fast-path (לפני LLM)

### 25.2 Confidence-Gated Auto-Reply
- AUTO_REPLY_CONFIDENCE_THRESHOLD = 0.85
- מתחת לסף → human approval required תמיד
- ai_draft_reply עובר policy-classifier לפני שנשמר. block → reply_blocked_by_policy=true

### 25.3 Brand Voice on Replies
- triageComment מקבל brand_voice_block מ-Session 3.4
- replies תואמות tone/lexicon/formality של הלקוח

### 25.4 Human Override Learning
- migration 031 — reply_override_log table
- sendCommentReply משווה ai_draft vs human_final, מחשב Levenshtein, רושם דיף
- `apps/api/src/services/reply-override-learning.ts` — אחרי 10+ substantive overrides, LLM מנתח patterns ומציע lexicon/rhythm/formality updates ל-brand_voice_profile

### 25.5 Priority Engine + Comment-to-Lead
- `apps/api/src/services/comment-priority.ts` — score 0-100 (sentiment × recency × reach × goal)
- `apps/api/src/services/lead-digest.ts` — hot ≥75 → WhatsApp+Email digest ב-4 שפות
- fingerprint לאי-double-send
- Cron `/api/cron/comments-digest` ב-vercel.json

### 25.6 Crisis Detection (velocity-based)
- migration 032 — sentiment_velocity_snapshot
- `apps/api/src/services/sentiment-velocity.ts` — daily snapshot + baseline 7d × 2.5σ z-score
- per-metric crisis (complaint/angry/hate/legal_risk/total)
- evaluateAndAlertTenant → critical notification + crisis_alert_sent flag

### 25.7 Routing Recommendation
- public_reply / private_dm / ignore / hide / escalate
- מוצג ב-Comments tab כ-badges (✅ UI נחשף)

### 25.8 Insights Mining
- migration 033 — comment_insights + reply_outcomes tables
- `apps/api/src/services/comment-insights.ts` — LLM clustering ל-recurring objections/questions/complaints/praise/feature_requests/faq_candidates
- min 3 occurrences. suggested_action concrete.
- Daily cron `/api/cron/comments-insights`

---

## 26. Crons Active (vercel.json)

| Cron | Schedule | Purpose |
|---|---|---|
| `optimize` (Basic) | 03:00, 11:00, 19:00 | Existing — optimization for Basic plan |
| `optimize-pro` | 07:00, 15:00, 23:00 | Existing — optimization for Pro |
| `social-weekly` | Mon 08:00 | Existing — weekly post generation |
| `social-publish` | hourly | Existing — publish scheduled posts (also picks up cooling_off due) |
| `social-comments` | every 4h | Existing — fetch new comments |
| `social-analytics` | every 6h | Existing — engagement metrics |
| `ga4-sync` | 02:30 | Existing — GA4 daily sync |
| `briefings` | hourly | **New** — proactive briefings WhatsApp/Email |
| `comments-priority` | every 30min | **New** — score new comments |
| `comments-digest` | every 30min | **New** — lead digest push |
| `comments-crisis` | hourly | **New** — sentiment velocity check |
| `comments-insights` | 05:00 daily | **New** — mine recurring themes |
| `reattestation` | 09:00 daily | **New** — 90-day re-attestation reminders |
| `stop-loss` | 10:00 daily | **New** — auto-freeze on threshold violations |
| `trust-recompute` | 11:00 daily | **New** — refresh trust tiers |

---

## 27. Wire-ups across the system

Each gate is enforced at multiple entry points:

| Gate | Pre-Generation | Pre-Publish | Pre-Campaign-Launch | Pre-Optimization |
|---|---|---|---|---|
| Admin freeze (`isFrozenFor`) | ✅ | ✅ | ✅ | ✅ |
| Trust Tier (`actionGateForTier`) | ✅ | ✅ | ✅ | — |
| Policy classifier | ✅ pre-flight | ✅ post-flight + cron | — | — |
| Truth verifier | ✅ | — | — | — |
| Approval snapshot | — | ✅ | ✅ | — |
| Industry gate | — | ✅ | ✅ | — |
| Two-key | — | ✅ | — | — |
| High-stakes cooling-off | — | ✅ | — | — |
| Conversion readiness | — | — | ✅ | — |
| Significance gating | — | — | — | ✅ |

---

## 28. UI Pages ✅ נבנו

| Path | תכולה |
|---|---|
| `/dashboard` | Posts tab עם cooling-off banner + Comments tab v2 עם badges (priority/confidence/do-not-engage/routing/blocked) + Connect |
| `/dashboard/intelligence` | Conversion Readiness widget + Recurring Insights list + Briefings preferences form + Crisis Check |
| `/dashboard/compliance` | Required attestations status + Industry license attestation form (9 license types) + Re-attest master |
| `/admin/freeze` | Kill switch panel — freeze/unfreeze/get-state. ADMIN_SECRET-gated. |
| `/onboarding` | AttestationCheckbox עבור 3 sigs (master + ToS + AI disclosure) |
| `/terms` + `/acceptable-use` | ToS + AUP מעודכנים עם 3-tier system + sole discretion clause |

---

## 29. Outstanding — דחויים בכוונה

הכל מה שאינו בקוד הוא דחייה מפורשת בהסכמת המשתמש:

- **Session 7 — Conversation Intelligence** דחוי (דורש לפחות חודש נתונים מ-Session 6 לעבוד)
- **Tests:** אפס — תכנון אחרי בדיקות ידניות מוצלחות
- **ToS+AUP:** drafts מוכנים בקוד, דורשים legal review לפני go-live

---

## 30. סטטיסטיקת קוד

- Monorepo (npm workspaces, Turbo).
- Apps: `apps/web` (Next.js 16 App Router + Turbopack), `apps/api` (Fastify).
- Packages: `@vigmis/db`, `@vigmis/ad-connectors`, `@vigmis/ai-router`, `@vigmis/config`.
- **39 migrations** (001 → 039).
- **37+ routes** ב-API.
- **28+ services** ב-API.
- **24 crons** רשומים ב-Vercel scheduler.
- TypeScript compile: ✅ 0 errors (API + Web)
- DB: ✅ 39/39 migrations applied to Supabase, schema in sync.

---

## נספח: זרימה של לקוח חדש (Customer Journey)

1. הלקוח מגיע ל‑vigmis.com → Sign Up → Clerk.
2. Onboarding: מילוי שאלון + הזנת URL של האתר.
3. Vigmis סורקת את האתר ומבינה את העסק.
4. הלקוח מחבר Facebook (OAuth) → בוחר Page + Instagram + Ad Account.
5. הלקוח מחבר Google Ads (OAuth, אופציונלי).
6. הלקוח מחבר GA4 + Shopify (אופציונלי).
7. Vigmis מייצרת תוכנית קמפיין → הלקוח מאשר.
8. Vigmis פותחת קמפיינים בפלטפורמות.
9. Vigmis מייצרת פוסטים שבועיים → הלקוח מאשר/דוחה דרך הצ'אט.
10. Vigmis מפרסמת פוסטים מאושרים.
11. Vigmis מבצעת אופטימיזציה אוטומטית 3‑6 פעמים ביום.
12. הלקוח רואה Dashboard עם metrics אמיתיים (GA4) + change history.

---

## נספח ב׳: תוכנות ושירותים משתתפים

> מדריך מלא לכל שירות חיצוני שVigmis מתחבר אליו — מה תפקידו, איפה הוא קיים בקוד, ואיך הוא מחובר.

---

### קטגוריה 1 — ענן ותשתית

---

#### 1.1 Vercel
**תפקיד:** Hosting לאפליקציית ה-Web (frontend + crons)

**מה רץ שם:**
- `apps/web` — כל ממשק המשתמש (Next.js 16, App Router)
- 24 Cron Jobs — מתוזמנים דרך `vercel.json` crons configuration
- Edge Middleware (proxy.ts) — Clerk auth על כל route מוגן

**חיבור בקוד:**
- `apps/web/` — כל קוד ה-Next.js מ-deployed אוטומטית
- `apps/web/proxy.ts` — middleware שמריץ Clerk auth (מחליף middleware.ts)
- `vercel.json` — הגדרת crons (schedule + secret)
- env vars: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_API_URL`

**חשוב לדעת:**
- Web app ו-API רצים על שני שירותים נפרדים (Vercel + Railway)
- `NEXT_PUBLIC_API_URL` חייב לפנות ל-Railway API URL בפרודקשן
- Crons מופעלים מ-Vercel ומעבירים את הבקשה ל-Railway API

---

#### 1.2 Railway
**תפקיד:** Hosting ל-Backend API (Fastify server)

**מה רץ שם:**
- `apps/api` — כל שרת ה-Fastify (30 route modules, 37 services)
- בניה מ-Dockerfile (`Dockerfile` בשורש הפרויקט)

**חיבור בקוד:**
- `apps/api/src/server.ts` — נקודת הכניסה לשרת
- `railway.toml` — הגדרת health check (`/health`), restart policy
- `Dockerfile` — בניה ל-production image
- env vars: כל המשתנים הסודיים (Supabase, OpenAI, Meta, Google, Paddle, Stripe)

**URL בפרודקשן:** `https://vigmisapi-production.up.railway.app`

**חשוב לדעת:**
- Railway מריץ את ה-API ישירות מ-Node.js (לא serverless) — חיבורי DB קבועים
- Health check על `/health` — Railway מריץ restart אוטומטי אם נכשל
- שינויים ב-`apps/api` דורשים `railway up` לדיפלוי ידני (לא automatic deploy)

---

#### 1.3 Supabase
**תפקיד:** בסיס נתונים ראשי (PostgreSQL) + Auth Infrastructure + Storage

**מה מאוחסן שם:**
- כל טבלאות המערכת (39 migrations, ~50 טבלאות)
- OAuth tokens מוצפנים (platform_tokens)
- נתוני לקוחות, קמפיינים, פוסטים, תגובות, חיוב
- Audit log מלא
- Approval snapshots (forensic records)

**חיבור בקוד:**
- `packages/db/src/client.ts` — Supabase client (service role — גישה מלאה מה-API)
- `packages/db/src/crypto.ts` — הצפנת tokens לפני שמירה (AES-256-GCM)
- `supabase/migrations/*.sql` — 39 קבצי migration, schema מלא
- כל service ב-`apps/api/src/services/` קורא ל-`db` מ-`@vigmis/db`
- env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

**Row Level Security (RLS):**
- כל טבלה עם `tenant_id` מוגנת עם policy: `tenant_id = current_setting('app.tenant_id')`
- Service Role מ-API מעקף RLS (גישה מלאה) — לכן ה-API אחראי על isolation
- Anon key (frontend) — אסור לו לגשת ישירות לטבלאות (web app לא מתחבר לSupabase ישירות)

**חשוב לדעת:**
- URL הפרויקט: `rzgkyzjetnrpcqmzfjtv.supabase.co`
- migrations מורצות ידנית ע"י מפתח עם sbp_ token (לא אוטומטי ב-CI)
- Service Role Key — **לא** נחשף ל-frontend בשום מצב

---

### קטגוריה 2 — אימות ומשתמשים

---

#### 2.1 Clerk
**תפקיד:** ניהול משתמשים, אימות (Auth), sign-in/sign-up UI

**מה עושה:**
- UI מוכן לsign-in / sign-up (דפי `/sign-in`, `/sign-up`)
- JWT generation — כל request מ-frontend נושא Clerk JWT
- Webhook על `user.created` — יוצר tenant row ב-Supabase
- Protected routes — `proxy.ts` בודק JWT לפני כל route מוגן

**חיבור בקוד:**
- `apps/web/proxy.ts` — `clerkMiddleware()` מגן על כל דפי ה-app
- `apps/api/src/middleware/auth.ts` — `verifyToken()` מאמת JWT ב-API + resolves `tenantId`
- `apps/web/app/api/webhooks/clerk/route.ts` — מאזין ל-`user.created`, יוצר tenant
- env vars: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (web), `CLERK_SECRET_KEY` (web + api)

**חשוב לדעת:**
- כל request ל-API חייב Authorization: Bearer <clerk_jwt>
- API auth middleware יוצר tenant אוטומטית אם לא קיים (auto-provisioning)
- Clerk Dashboard: app.clerk.com → vigmis → API Keys

---

### קטגוריה 3 — פלטפורמות פרסום

---

#### 3.1 Google Ads
**תפקיד:** פרסום בתשלום — Search, Display, Performance Max

**מה עושה:**
- פתיחת קמפיינים, הגדרת תקציבים, ניהול ad groups
- שליפת נתוני ביצועים (impressions, clicks, conversions, ROAS)
- OAuth לחיבור חשבון לקוח

**חיבור בקוד:**
- `packages/ad-connectors/src/google/` — כל לוגיקת Google Ads
- `apps/api/src/routes/connectors.ts` — OAuth initiation + callback + token save
- `apps/api/src/services/engine.ts` — מפעיל Google Ads API לשינוי קמפיינים
- OAuth tokens מוצפנים ב-`platform_tokens` (AES-256-GCM)
- env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_ADS_DEVELOPER_TOKEN`

**חשוב לדעת:**
- נדרש Developer Token (Standard Access לסקייל מלא, Basic Access בשימוש כעת)
- OAuth Redirect URI חייב להיות זהה ב-Google Cloud Console ובenv
- Rate limit: 15,000 mutate ops/day (Basic Access)

---

#### 3.2 Meta (Facebook + Instagram)
**תפקיד:** פרסום בתשלום + ניהול תוכן אורגני

**שני שימושים:**
1. **Meta Ads API** — קמפיינים בתשלום (Facebook + Instagram Ads)
2. **Meta Graph API** — פרסום פוסטים אורגניים, שליפת תגובות, ניתוח engagement

**חיבור בקוד:**
- `packages/ad-connectors/src/meta/` — Meta Ads API
- `apps/api/src/services/social-publisher.ts` — Graph API לפוסטים ותגובות
- `apps/api/src/services/social-comments.ts` — שליפת תגובות
- `apps/api/src/routes/connectors.ts` — OAuth flow
- `apps/api/src/routes/social.ts` — CRUD פוסטים + inbox תגובות
- env vars: `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `FB_ACCESS_TOKEN`

**Scopes שנדרשים:**
`ads_management`, `ads_read`, `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`

**חשוב לדעת:**
- App חייב להיות ב-Development mode עד שעובר App Review מלא
- Testers בלבד יכולים לחבר במצב Development — אחרת Scopes לא זמינים
- Graph API version: נדרש לעדכן ל-v21.0+ מדי שנה

---

#### 3.3 TikTok Ads
**תפקיד:** פרסום בתשלום על TikTok

**חיבור בקוד:**
- `packages/ad-connectors/src/tiktok/` — TikTok Ads API
- `apps/api/src/routes/connectors.ts` — OAuth
- env vars: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`

**חשוב לדעת:**
- TikTok Ads API דורש Business Center access
- פחות mature מ-Meta/Google — פחות rate limits אבל API לא יציב

---

### קטגוריה 4 — AI ומודלים

---

#### 4.1 OpenAI
**תפקיד:** מודל AI ראשי לכל פעולות התוכן והניתוח

**שימושים בקוד:**
- Chat advisor — `gpt-4o-mini` לשיחות ניהול
- ייצור פוסטים לסושיאל מדיה
- ניתוח sentiment תגובות
- Policy classifier — בדיקת תוכן לפני פרסום
- Brief generation — תוכנית יצירתית
- Crisis detection — זיהוי תגובות קריטיות

**חיבור בקוד:**
- `packages/ai-router/src/router.ts` — ניתוב בין providers
- `packages/ai-router/src/providers/` — OpenAI, Anthropic, Gemini adapters
- `apps/api/src/routes/chat.ts` — chat handler → ai-router
- `apps/api/src/services/social-content.ts` — post generation
- `apps/api/src/services/comment-insights.ts` — sentiment
- env vars: `OPENAI_API_KEY`

**חשוב לדעת:**
- המודל העיקרי: `gpt-4o-mini` (עלות נמוכה, מהיר)
- עלות ה-AI היא העלות הגדולה ביותר בפרויקט — circuit breaker מגן על רווחיות
- `ai_usage_monthly` מאכסן את העלות הצבורה per tenant per month

---

#### 4.2 Anthropic (Claude)
**תפקיד:** Provider משני — בשימוש ל-tasks שדורשים הבנה עמוקה יותר

**חיבור בקוד:**
- `packages/ai-router/src/providers/anthropic.ts` — adapter מוכן
- מנוהל דרך `ai-router` — ניתוב אוטומטי לפי task type
- env vars: `ANTHROPIC_API_KEY`

**חשוב לדעת:**
- מוגדר אך לא בשימוש ראשי כרגע — ai-router מנתב ל-OpenAI כברירת מחדל

---

#### 4.3 Google Gemini
**תפקיד:** Provider שלישי — גיבוי / tasks מסוימים

**חיבור בקוד:**
- `packages/ai-router/src/providers/gemini.ts`
- env vars: `GEMINI_API_KEY`

**חשוב לדעת:**
- מוגדר, לא פעיל בתהליכי ייצור עיקריים

---

#### 4.4 HeyGen
**תפקיד:** יצירת וידאו עם avatar מדבר (AI video generation)

**חיבור בקוד:**
- מוזכר כ-add-on בתמחור (`videoCinematic`, `videoAvatar`)
- env vars: `HEYGEN_API_KEY`

**חשוב לדעת:**
- פיצ'ר בשלב beta — עדיין לא מחובר לUI

---

#### 4.5 Replicate
**תפקיד:** מודלים נוספים לתמונות / וידאו

**חיבור בקוד:**
- env vars: `REPLICATE_API_TOKEN` (כרגע placeholder בלבד)

---

### קטגוריה 5 — תשלומים וחיוב

---

#### 5.1 Paddle
**תפקיד:** מנוע subscription ותשלום (מחליף Stripe כברירת מחדל)

**מה עושה:**
- ניהול מנויים (Free / Pro)
- Checkout hosted (אין טיפול ב-CC data אצלנו)
- Webhook events: `subscription.created`, `subscription.cancelled`, `payment.succeeded`
- Customer portal (self-service לביטול / שינוי)

**חיבור בקוד:**
- `apps/api/src/billing/paddle.ts` — `getOrCreatePaddleCustomer`, `createPaddleCheckout`, `createPaddlePortalSession`, `verifyPaddleWebhook`
- `apps/api/src/routes/billing.ts` — `/billing/checkout`, `/billing/portal`, `/billing/webhook`
- `apps/api/src/billing/calculator.ts` — חישוב חיוב חודשי
- `apps/api/src/billing/pricing.ts` — הגדרת תוכניות, תמחור, circuit breaker
- env vars: `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`

**חשוב לדעת:**
- Paddle 2023 API (לא הישנה) — billing entity = Paddle, לא Vigmis
- Paddle הוא ה-Merchant of Record — מטפל במע"מ / VAT אוטומטית

---

#### 5.2 Stripe
**תפקיד:** תשלום חלופי / add-ons (מוגדר אך לא ראשי)

**חיבור בקוד:**
- `apps/api/src/billing/stripe.ts` (אם קיים) — לא בשימוש ראשי
- env vars: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`

**חשוב לדעת:**
- מפתחות test בסביבת dev (prefix `sk_test_`, `pk_test_`)
- Paddle הוא ה-primary — Stripe גיבוי

---

### קטגוריה 6 — Analytics ו-Tracking

---

#### 6.1 Google Analytics 4 (GA4)
**תפקיד:** מקור אמת להמרות ו-ROAS אמיתי

**מה עושה:**
- שליפת conversion events אמיתיים (purchases, leads)
- מחשב ROAS אמיתי (revenue / ad spend) במקום attribution של הפלטפורמה
- מסנכרן ל-`ga4_daily_metrics` ב-DB

**חיבור בקוד:**
- `apps/api/src/routes/ga4.ts` — חיבור property, שליפת נתונים
- `apps/web/app/api/cron/ga4-sync/route.ts` — cron יומי לסנכרון
- `apps/api/src/services/` — incrementality analysis משתמש ב-GA4 data
- env vars: דרך Google OAuth (אותו `GOOGLE_CLIENT_ID` + Refresh Token per tenant)

**חשוב לדעת:**
- כל tenant מחבר Property ID משלו
- GA4 Data API דורש scope: `https://www.googleapis.com/auth/analytics.readonly`

---

### קטגוריה 7 — תקשורת ו-Notifications

---

#### 7.1 SendGrid
**תפקיד:** שליחת אימיילים (daily reports, alerts, invoices)

**חיבור בקוד:**
- `apps/api/src/services/notify.ts` — `sendEmail()` function
- נקרא מ: briefings, stop-loss alerts, AI breaker freeze, monthly reports
- env vars: `SENDGRID_API_KEY`

**חשוב לדעת:**
- כל notification email עובר דרך SendGrid
- OPS_ALERT_EMAIL — כתובת admin לqibbles קריטיים (circuit breaker freeze)

---

#### 7.2 Twilio
**תפקיד:** WhatsApp messaging (Comment-to-Lead)

**חיבור בקוד:**
- env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `WHATSAPP_FROM`
- מוגדר לשליחת WhatsApp messages ללידים שמגיעים מתגובות

**חשוב לדעת:**
- Sandbox: `whatsapp:+14155238886` — sandbox של Twilio, לא מספר עסקי אמיתי
- לפרודקשן: נדרש Twilio WhatsApp Business account עם מספר מאושר

---

### קטגוריה 8 — E-Commerce

---

#### 8.1 Shopify
**תפקיד:** סנכרון נתוני מכירות ו-AOV (Average Order Value)

**מה עושה:**
- שליפת orders + revenue data אמיתית
- מחשב ROAS אמיתי על בסיס מכירות Shopify (לא platform attribution)
- מסנכרן ל-`shopify_tables` ב-DB

**חיבור בקוד:**
- `apps/api/src/services/shopify-sync.ts`
- `apps/web/app/api/cron/shopify-sync/route.ts` — cron יומי
- migration 036 — `shopify_tables`

**חשוב לדעת:**
- דורש Shopify Private App token per tenant
- חלופה לGA4 לעסקי e-commerce — נתוני מכירות ישירים

---

### קטגוריה 9 — Monitoring ומידע חיצוני

---

#### 9.1 Weather API
**תפקיד:** נתוני מזג אוויר לקמפיינים geo-based

**חיבור בקוד:**
- `apps/api/src/services/weather.ts`
- `apps/web/app/api/cron/weather/route.ts` — מסנכרן יומי
- `weather_data` table ב-DB
- env vars: מוגדר בservice (API key ספציפי לספק שנבחר)

---

#### 9.2 News Monitoring
**תפקיד:** ניטור חדשות לזיהוי אירועים שמשפיעים על מותג הלקוח

**חיבור בקוד:**
- `apps/api/src/services/news-monitor.ts`
- `apps/web/app/api/cron/news-scan/route.ts` — סריקה יומית
- `news_alerts` table ב-DB

---

### קטגוריה 10 — מפות ו-Code

---

#### 10.1 GitHub / Version Control
**תפקיד:** שמירת קוד המקור

**מבנה ה-Repo:**
```
vigmis-main/
├── apps/
│   ├── api/          → Railway (Fastify backend)
│   ├── web/          → Vercel (Next.js frontend + crons)
│   └── marketing/    → Vercel (landing page)
├── packages/
│   ├── db/           → Supabase client + crypto
│   ├── ad-connectors/→ Google, Meta, TikTok adapters
│   ├── ai-router/    → OpenAI, Anthropic, Gemini router
│   └── config/       → shared config
└── supabase/
    └── migrations/   → 39 SQL migration files
```

---

### מפת חיבורים מהירה

| שירות | מחובר ל | דרך |
|-------|---------|-----|
| Vercel | Railway API | `NEXT_PUBLIC_API_URL` env var |
| Vercel | Clerk | `CLERK_SECRET_KEY` + middleware |
| Railway API | Supabase | `SUPABASE_URL` + `SERVICE_ROLE_KEY` |
| Railway API | OpenAI | `OPENAI_API_KEY` |
| Railway API | Meta Graph API | OAuth token per tenant (encrypted in DB) |
| Railway API | Google Ads | OAuth token per tenant (encrypted in DB) |
| Railway API | SendGrid | `SENDGRID_API_KEY` |
| Railway API | Paddle | `PADDLE_API_KEY` + webhook |
| Railway API | Twilio | `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` |
| Web (Next.js) | Clerk | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| Crons (Vercel) | Railway API | `NEXT_PUBLIC_API_URL` + `CRON_SECRET` |

---

### Environment Variables — מיפוי מלא

| משתנה | נמצא ב | שירות |
|-------|--------|-------|
| `SUPABASE_URL` | Railway | Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Railway | Supabase |
| `CLERK_SECRET_KEY` | Railway + Vercel | Clerk |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Vercel | Clerk |
| `OPENAI_API_KEY` | Railway | OpenAI |
| `ANTHROPIC_API_KEY` | Railway | Anthropic |
| `GEMINI_API_KEY` | Railway | Google Gemini |
| `HEYGEN_API_KEY` | Railway | HeyGen |
| `TOKEN_ENCRYPTION_KEY` | Railway | הצפנת OAuth tokens |
| `GOOGLE_CLIENT_ID` | Railway | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Railway | Google OAuth |
| `GOOGLE_REDIRECT_URI` | Railway | Google OAuth |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Railway | Google Ads |
| `META_APP_ID` | Railway | Meta OAuth |
| `META_APP_SECRET` | Railway | Meta OAuth |
| `META_REDIRECT_URI` | Railway | Meta OAuth |
| `FB_ACCESS_TOKEN` | Railway | Meta Graph API |
| `TIKTOK_CLIENT_KEY` | Railway | TikTok OAuth |
| `TIKTOK_CLIENT_SECRET` | Railway | TikTok OAuth |
| `TIKTOK_REDIRECT_URI` | Railway | TikTok OAuth |
| `PADDLE_API_KEY` | Railway | Paddle billing |
| `PADDLE_WEBHOOK_SECRET` | Railway | Paddle webhooks |
| `STRIPE_SECRET_KEY` | Railway | Stripe (גיבוי) |
| `STRIPE_PUBLISHABLE_KEY` | Railway | Stripe (גיבוי) |
| `SENDGRID_API_KEY` | Railway | SendGrid email |
| `TWILIO_ACCOUNT_SID` | Railway | Twilio WhatsApp |
| `TWILIO_AUTH_TOKEN` | Railway | Twilio WhatsApp |
| `WHATSAPP_FROM` | Railway | Twilio WhatsApp |
| `CRON_SECRET` | Railway + Vercel | אבטחת crons |
| `NEXT_PUBLIC_API_URL` | Vercel | כתובת ה-API |
| `WEB_URL` | Railway | כתובת ה-Web (CORS) |
| `PORT` | Railway | פורט שרת API |

---

*עדכון אחרון: 2026-05-30 — על בסיס QA פנימי + Railway env pull.*
