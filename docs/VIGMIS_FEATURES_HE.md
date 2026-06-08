# Vigmis — ספר פיצ'רים מלא

**תאריך עדכון:** 2026-06-09 (Creative Studio Pro + Billing Model Final)  
**מקור אמת לתמחור:** `apps/api/src/billing/pricing.ts`  
**מקור אמת לטכנולוגיה:** קוד בפועל ב-monorepo

---

## 1. מה זה Vigmis

Vigmis היא פלטפורמת SaaS לניהול פרסום דיגיטלי אוטומטי לעסקים קטנים ובינוניים.

**מה Vigmis עושה בשביל הלקוח:**
- מנהלת קמפיינים בתשלום (Google Ads, Meta Ads, TikTok Ads) — תקציבים, bid, A/B, אופטימיזציה יומית.
- מייצרת ומפרסמת תוכן אורגני (פוסטים, תמונות, סרטונים) ב-Facebook, Instagram, TikTok.
- מגיבה לתגובות בסושיאל מדיה — מסווגת, מציעה תגובות, מתריעה על משברים.
- מנתחת ביצועים אמיתיים דרך GA4 (לא נתוני הפלטפורמות שמנופחים).
- שולחת תדריכים יומיים/שבועיים ב-WhatsApp או אימייל.

**מה הלקוח עושה:** Onboarding חד-פעמי + אישורים תקופתיים. הכל אחר — Vigmis.

---

## 2. Onboarding — 7 שלבים

### שלב 1 — ניתוח אתר אוטומטי
- Crawl של עמוד הבית + עד 5 עמודי משנה.
- חילוץ Open Graph, JSON-LD Product schema.
- User-Agent של דפדפן (לא bot — עוקף חסימות בסיסיות).
- "Confidence gate": מתחת ל-500 תווים → שגיאה מפורשת (לא ממציאים תוכן).
- תוצאה נשמרת ב-`client_settings.website_analysis`.

### שלב 2 — שאלון עסקי
- מטרת הקמפיין: מכירות / לידים / תנועה.
- תקציב חודשי.
- אזורים גיאוגרפיים + החרגות.
- מרווח רווח (Margin) למוצר-דגל.
- Hero product.

### שלב 3 — חיבור Meta (Facebook + Instagram)
- Facebook Login → בחירת Page מפורשת (אין ניחוש אוטומטי).
- Instagram מוצג אוטומטית לכל Page שמחובר.
- Ad Account נבחר בנפרד.

### שלב 4 — חיבור Google Ads (אופציונלי)
- OAuth נפרד מ-GA4 (Scope: adwords בלבד).
- בחירת Account מפורשת לאחר חיבור.

### שלב 5 — חיבור TikTok (אופציונלי)
- TikTok for Developers + TikTok for Business (APIs נפרדים).
- Scopes פעילים: `user.info.basic`, `video.upload`.

### שלב 6 — חיבור GA4 + Shopify (אופציונליים)
- GA4: OAuth נפרד (Scope: analytics.readonly). Properties Picker אוטומטי.
- Shopify: Webhook-based. Order tracking + AOV + product catalog.

### שלב 7 — הגדרת מצב אישור
- **Conservative:** כל פעולה משמעותית דורשת אישור לפני ביצוע.
- **Active:** פעולות אוטומטיות ללא המתנה.

---

## 3. חיבורי פלטפורמות

### 3.1 Meta (Facebook + Instagram)
| | |
|---|---|
| Auth | Facebook Login OAuth |
| Scopes | public_profile, ads_read, ads_management, pages_show_list, pages_read_engagement, pages_manage_posts, business_management, instagram_basic, instagram_content_publish, instagram_manage_comments |
| Token | Long-lived 60 ימים + רענון אוטומטי |
| סטטוס App Review | public_profile בלבד אושר. שאר ה-scopes ממתינים להגשה חוזרת עם סרטון end-to-end. |
| Business Verification | אושר (ID 3698041317002548) |

**שגיאות חיבור מוכרות:**
- "Vigmis does not have admin access to Page X" → הוראה לבחור Page אחר.
- "Page role too low" → הוראה לעדכן role ב-Facebook Page Settings.
- Permission error (`#100/#200`) → מודאל Reconnect Facebook.

### 3.2 Google Ads
| | |
|---|---|
| Auth | Google OAuth — `/auth/google` |
| Scope | adwords בלבד (נפרד מ-GA4) |
| Quota | 15,000 ops/יום (Basic Access) |
| Standard Access | יוגש כשנגיע ל-10,000 משתמשים |

### 3.3 TikTok
- **TikTok for Developers** (open.tiktokapis.com) — Content Posting. Scopes: `user.info.basic`, `video.upload`. `video.publish` הוסר (לא אושר), הוגש מחדש.
- **TikTok for Business** (business-api.tiktok.com) — Marketing API. ממתין לאישור.
- Upload: FILE_UPLOAD (לא PULL_FROM_URL — חוסך verify domain).

### 3.4 Google Analytics 4
| | |
|---|---|
| Auth | Google OAuth — `/auth/google/analytics` |
| Scope | analytics.readonly בלבד |
| Sync | יומי ב-02:30 UTC דרך Data API |
| שמירה | `ga4_daily_metrics` (sessions, conversions, revenue per source/medium) |

### 3.5 Shopify
- Webhooks ל-order/checkout/cancellation.
- Full catalog sync (products + shipping zones + currency).
- AOV model — Average Order Value per customer.
- Webhook: `/track/shopify/webhook` + HMAC verification.
- Cron sync יומי 03:00.

### 3.6 ניתוק (Disconnect)
- Meta: `DELETE /me/permissions` ב-Facebook → מחיקה מ-DB + ניקוי social_settings.
- Google/TikTok: revoke token API + מחיקה מ-DB.
- נרשם ב-audit_log.

---

## 4. אסטרטגיה (Strategy)

### 4.1 ייצור אוטומטי
- מבוסס על ניתוח האתר + תשובות השאלון.
- פלט:
  - חלוקת תקציב בין Google / Meta / TikTok.
  - קהל יעד.
  - CPC משוער + Custom benchmarks.
  - המלצות מסודרות.
  - Conversion Readiness verdict (block / fix_before_ads / ready).
- נשמר ב-`client_settings.strategy_plan`.

### 4.2 Conversion Readiness Gate
- LLM מבצע audit על האתר לפני שמשיקים קמפיין.
- Score 0-100. ערך ≥70 = ready. 40-69 = fix_before_ads. מתחת ל-40 = block.
- Verdict=block חוסם השקת קמפיין עד שהלקוח מתקן את האתר.

### 4.3 Strategy Viewer
- לשונית Strategy ב-Dashboard.
- מציג: ניתוח האתר, תוכנית קמפיין מלאה, Change History מה-audit_log.
- "Re-analyze website" → ריצה חוזרת.
- "Rethink strategy" → חזרה ל-onboarding.

---

## 5. ניהול קמפיינים

### 5.1 יצירה ותפעול
- פתיחת קמפיינים ב-Google / Meta / TikTok.
- הגדרת תקציבים יומיים וחודשיים.
- אופטימיזציית bid.
- A/B testing.
- Pause / Resume אוטומטי.

### 5.2 Optimization Engine — מה האלגוריתם עושה

מקור נתונים: **GA4** (לא self-reporting של הפלטפורמות).

| פעולה | תנאי |
|---|---|
| Scale up +20% תקציב | ROAS ≥ 2 + Statistical Significance (Wilson CI ≥90%) |
| Scale down -20% | CPA חורג מ-maxCpa |
| Pause | 0 conversions אחרי חלון זמן |
| Creative refresh alert | Creative fatigue (proportions z-test) |
| Targeting review | Stagnation alert |

### 5.3 Statistical Significance Gating
- `services/significance.ts` — Wilson confidence intervals.
- `safeToScaleUp` דורש: CI ≥90% + min spend max($30, 2× daily budget).
- `proportionsDiffer` — 2-prop z-test לזיהוי creative fatigue.
- מחובר ל-`optimization/rules.ts` — אין פעולה ללא significance.

### 5.4 תדירות אופטימיזציה
| מסלול | ריצות ביום | שעות UTC |
|---|---|---|
| Grow | 3 | 03:00, 11:00, 19:00 |
| Scale | 6 | + 07:00, 15:00, 23:00 |

### 5.5 Conservative Mode
- כל פעולה יוצרת "Decision Protocol" — ממתין לאישור.
- Active Mode → פעולות מיידיות.

### 5.6 Context-Aware Optimization
- **Calendar:** Black Friday, Cyber Monday, Christmas, Valentine's, Back-to-School, חגים ישראלים (Yom Kippur, Passover, High Holidays).
- **Weather:** OpenWeatherMap 3-day forecast. Per-business sensitivity (hot_boost/rain_dampens/etc). 2×/day.
- **News:** NewsAPI + LLM relevance filter. Alerts על relevance ≥0.7. Cron כל 6 שעות.
- getOperationalContext משלב הכל לcontext אחד לכל החלטה.

---

## 6. תוכן אורגני (Social Media)

### 6.1 ייצור פוסטים
- שבועי אוטומטי (Facebook + Instagram + TikTok).
- מבוסס על ניתוח האתר + אסטרטגיה + Creative Brief.
- שפה: `client_settings.content_language` — מפורש או auto (Unicode detection).
- Brand Voice: מחובר לכל generation. Tone, lexicon, formality מ-`brand_voice_profile`.
- Hashtags, CTA, לוגו — מוזרקים אוטומטית.
- עמודות תוכן (Content Pillars).
- AI Disclosure: suffix מתויג אוטומטית לפי פלטפורמה + EU AI Act.

### 6.2 Creative Brief Layer
- Dialog לפני כל יצירה: Product / Message / Style / CTA.
- ה-brief עובר ל-LLM לפני brand voice block.
- מחובר גם לפוסטים, גם לסרטונים, גם לתמונות.
- `services/creative-brief.ts` — extractCreativeBrief (pain/promise/proof/objection model).

### 6.3 Brand Voice Engine
- `services/brand-voice.ts` — extractBrandVoice מניתוח אתר.
- מחובר לכל paths: posts + replies + creatives.
- Human Override Learning: כשמשתמש עורך תגובת AI, המערכת לומדת מהפערים. אחרי ≥10 עריכות משמעותיות — LLM מעדכן `brand_voice_profile`.

### 6.4 מחזור חיי פוסט
```
Draft → AI-generated → Pending Approval → Approved → Scheduled → Published
                                        ↘ Rejected
```
- עריכה ידנית לפני אישור.
- תזמון לתאריך + שעה.
- AI Policy check לפני אישור (pre-flight + post-flight).
- High-stakes cooling-off: 1 שעה השהיה אם יש טענות מחירים/ערבויות/urgency.
- Two-Key Pattern: סיווג שני עצמאי לtier 1 + trust watch/restricted.

### 6.5 פרסום
| פלטפורמה | מצב |
|---|---|
| Facebook Page feed | ✅ פעיל |
| Instagram Business | ✅ פעיל (תמונה חובה) |
| TikTok | ✅ FILE_UPLOAD מוכן — ממתין לאישור scope video.publish |

### 6.6 Pre-launch Creative Scoring
- `POST /creatives/score`
- GPT-4o Vision מנתח: attention / clarity / emotion / cta_presence.
- ציון 0-100 + verdict (excellent/good/fair/poor) + tips לשיפור.

---

## 7. ייצור קריאייטיב (Videos & Images)

### 7.1 סוגי קריאייטיב

| סוג | פרובידר | מחיר בסיסי | זמן המתנה |
|---|---|---|---|
| Avatar Video (AI spokesperson) | HeyGen | $15 | ~3 דקות |
| Cinematic Video | Replicate (minimax/video-01) | $12 | ~5 דקות |
| Animation Video | Replicate (lucataco/animate-diff-v2) | $8 | ~4 דקות |
| Image Creative (standalone) | DALL-E / Replicate | $5 | שניות |

**פרסום:** קנייה כוללת פרסום ב-FB/IG/TikTok ללא הגבלה. TikTok אחד = FB אחד = IG אחד.

### 7.2 זרימת יצירה

```
POST /creatives/generate
        ↓
 brief מועשר (לוגו + CTA + brand voice)
        ↓
 אם provider API key חסר → status: pending_setup (שמור לעתיד)
        ↓
 שליחה ל-HeyGen / Replicate
        ↓
 polling GET /creatives/:id/status
        ↓
 completed → upload ל-Supabase Storage
        ↓
 Approve / Reject / Request Revision
```

### 7.3 מערכת Revisions — מחיר מעודכן

| Revision Number | עלות |
|---|---|
| 0 (דור ראשון) | חינם (לפני אישור) |
| 1 (תיקון ראשון) | חינם |
| 2 (תיקון שני) | חינם |
| 3–5 | 50% ממחיר דור ראשון |
| 6+ | חסום — חייבים להתחיל creative חדש |

**מחירי revision 3–5 (50%):**
- Avatar: $7.50
- Cinematic: $6.00
- Animation: $4.00
- Image: $2.50

**מקסימום:** 5 revisions לכל brief. אחרי 5 → Vigmis חוסמת יצירה חדשה על אותו brief.

**אישור = נעילה:** לאחר שלקוח מאשר creative → closed. כל שינוי = creative חדש.

**Auto-discard:** קריאייטיב שהושלם אך לא אושר תוך 7 ימים → נדחה אוטומטית, ללא חיוב.

### 7.4 Approve & Pay Flow (מעודכן)
- Revision 0–2: POST /creatives/:id/approve → sets `approved_at`, לא חיוב.
- Revision 3–5: POST /creatives/:id/approve → יוצר Stripe Checkout session → 402 + `checkout_url` (מחיר 50%).
- לאחר תשלום ב-Stripe: webhook `checkout.session.completed` → `approved_at` נרשם.

### 7.5 Reject Flow
- POST /creatives/:id/reject → status=rejected, אין חיוב.
- Auto-discard cron ב-02:00 UTC: כל `completed` + `approved_at IS NULL` + `updated_at < 7 days ago` → rejected.

### 7.6 כלול במסלולים (Scale Credits System)

| | Grow | Scale |
|---|---|---|
| Video Credits / חודש | אפס | 1 (כל סוג) |
| Image Credits / חודש | אפס | 3 |
| Post Credits / חודש | אפס | 5 |

**חשוב:** Credits לא מצטברים. נאפסים ב-1 לחודש. לא ניתנים להחזר.
- אם נוצל Video Credit → יצירת הוידאו הבאה באותו חודש תחויב במחיר מלא.
- בביטול Scale (downgrade) → credits חדשים לא ניתנים; Credits שנוצלו כבר בתקף עד סוף החודש.

### 7.6b Brand DNA System (חדש)
- כל Creative מקבל אוטומטית Brand DNA injection לפני שנשלח ל-provider.
- **Brand Colors**: עד 5 hex colors ב-Settings → Brand DNA.
- **Do Not Change Elements**: Logo / Product / Face/Person / Colors / Background / Text / Layout — checkboxes.
- **Approved Styles**: styles שנלמדו מ-creatives שאושרו בעבר.
- DNA string מוזרק לתוך prompt/script לפני שליחה ל-HeyGen / Replicate / DALL-E.

### 7.6c Keep/Change Form (חדש — לrevisions)
כשמשתמש לוחץ "Request Revision" על creative מושלם:
1. צ'קבוקסים — מה **לשמור בדיוק**: Logo, Product, Face, Background, Text, Colors.
2. שדה טקסט — מה **לשנות**.
3. ה-API בונה: `"KEEP EXACTLY: [list]. CHANGE ONLY: [description]. DO NOT modify anything else."`

### 7.6d Creative Studio Pro (עמוד עצמאי /studio)
- עמוד נפרד `/studio` — ניהול כל ה-creatives.
- לכל creative: Version History (V1→V2→V3...) timeline.
- Compare: השוואת שתי גרסאות זו לצד זו.
- Restore: יצירת revision חדש מ-brief של גרסה ישנה.
- Status badges: queued / processing / completed / failed / approved / credit-used.
- Approve / Discard / Request Revision — לכל creative מושלם.

### 7.6e AI Critic Service (חדש — לתמונות בלבד)
- `services/creative-critic.ts` — GPT-4o Vision משווה before/after.
- Returns: `{ score: 0-1, issues: string[], pass: boolean }`.
- score ≥ 0.75 = pass; < 0.75 = fail → regenerate silently (עד 2 retries).
- `critic_score` נשמר ב-`creative_jobs.critic_score`.
- **רק לrevisions עם תמונות** — לא לסרטונים (יקר מדי).

### 7.6f Best-of-3 Images (חדש — DALL-E בלבד)
- כל יצירת תמונה מייצרת 3 variants במקביל.
- כל variant עובר דרך `creative-scorer.ts` (GPT-4o Vision).
- ה-variant עם הציון הגבוה ביותר מוחזר ללקוח.
- כל 3 URLs נשמרים ב-`creative_jobs.brief._all_candidate_urls` לצפייה עתידית.

### 7.7 אחסון
- כל קריאייטיב מועלה ל-Supabase Storage bucket "creatives" לאחר completion.
- URL קבוע ב-CDN. Provider URL (HeyGen/Replicate) = fallback אם storage נכשל.

### 7.8 דיוק תמונות וסרטונים

**דרכים לשפר את הפלט:**

1. **Brand Brief מפורט** — ב-brief dialog: ציין בדיוק Product + Message + Style + CTA.
2. **לוגו** — העלה לוגו ב-Settings → מוזרק לכל prompt אוטומטית.
3. **Revision Loop** — revision ראשון חינם. תאר בדיוק מה לשנות (Keep: / Change:) ב-brief.
4. **Scoring** — הרץ Creative Scoring (POST /creatives/score) על התמונה לפני אישור. ציון מתחת ל-60 = כדאי revision.
5. **Style** — בחר style: professional / funny / urgent / inspirational. ה-LLM מכוון בהתאם.
6. **Avatar** — בחר avatar ספציפי מ-GET /creatives/avatars ו-voice מ-GET /creatives/voices.

---

## 8. Social Inbox — ניהול תגובות

### 8.1 סיווג אוטומטי (Taxonomy v2)

10 קטגוריות:
`positive` / `question` / `purchase_intent` / `lead` / `complaint` / `angry` / `troll` / `hate` / `legal_risk` / `spam`

גם: `do_not_engage` flag, `priority_score` (0-100), `routing_recommendation`, `reply_blocked_by_policy`.

### 8.2 Auto-Reply Logic
- Confidence ≥0.85 → auto-reply אפשרי.
- מתחת לסף → Human approval חובה.
- Draft reply עובר policy-classifier לפני שמירה.
- Brand voice מחובר לכל reply.

### 8.3 Priority Engine
- Score 0-100: sentiment × recency × reach × goal.
- Hot (≥75) → WhatsApp+Email digest מיידי.
- Cron כל 30 דקות.

### 8.4 Comment-to-Lead
- קטגוריה lead + purchase_intent → digest ל-WhatsApp + Email.
- 4 שפות (en/he/ar/ru).
- Fingerprint — אין double-send.

### 8.5 Crisis Detection
- Snapshot יומי + baseline 7 ימים.
- Z-score ≥2.5 → crisis alert.
- Per-metric: complaint/angry/hate/legal_risk/total.
- Critical notification + flag `crisis_alert_sent`.

### 8.6 Human Override Learning
- כל פעם שמשתמש עורך תגובת AI — נרשם ב-reply_override_log (Levenshtein diff).
- אחרי ≥10 עריכות משמעותיות → LLM מנתח patterns ומעדכן brand_voice_profile.

### 8.7 Insights Mining
- LLM מאגד קריאייטיב מ-90 ימים: שאלות חוזרות / התנגדויות / תלונות / שבחים / feature requests.
- min 3 occurrences. suggested_action קונקרטי.
- Cron יומי 05:00.

---

## 9. יועץ AI (Chat)

### 9.1 כיצד עובד
- זמין בכל עמוד (global chat, root layout, Clerk auth).
- מקבל `pageContext` (pathname) + נתוני הלקוח.
- Intent Router: מסווג כל בקשה ל-6 פחים לפני LLM.

### 9.2 Intent Router — 6 פחים

| פח | פעולה |
|---|---|
| Native capability | בצע |
| Subscription gate | "זמין ב-Scale — שדרג כאן" |
| Platform limitation | "Meta TOS אוסר X. החלופה: Y" |
| Legal block | סירוב + הסבר |
| Ethical block | סירוב + הסבר ערכי |
| Out of scope but adjacent | "אני כלי שיווק. לזה תצטרך עו"ד. הנה התובנה השיווקית" |

**כלל:** כל "לא" כולל (א) סיבה (ב) מה כן אפשר.

### 9.3 Pipe Actions (ב-Chat)
- `create_post|platform|pillar`
- `write_post|platform|pillar|text`
- `edit_post|postId|new_text`
- `set_post_image|postId|url`
- `approve_post|postId`
- `reject_post|postId|reason`
- `schedule_post|postId|ISO_datetime`
- `select_ad_account|act_xxx`

### 9.4 מכסות AI לפי תקציב + מסלול

מכסת AI Strategy Sessions נקבעת לפי מדרגת תקציב:

| Tier | הוצאות חודשיות | Sessions | Comments auto-handled |
|---|---|---|---|
| T1 | עד $1,000 | 30 | 300 |
| T2 | $1,001 – $3,000 | 75 | 800 |
| T3 | $3,001 – $6,000 | 150 | 2,000 |
| T4 | $6,001 – $12,000 | 300 | 4,000 |
| T5 | $12,000+ | 400 | 6,000 |

**Session = עד 12 הודעות.** מכסה נגמרת → הודעה רכה. לא שבירה.
חבילה נוספת: +25 sessions = $9.

---

## 10. ניתוח ביצועים (Analytics & Attribution)

### 10.1 Ground Truth דרך GA4
כל הפלטפורמות מנפחות נתונים (double-counting, view-through attribution). GA4 = מקור יחיד, ללא הטיה.

### 10.2 UTM Match
- כל קמפיין של Vigmis מקבל UTM אוטומטי.
- חיבור campaign_name ↔ source/medium ב-GA4.

### 10.3 Inflation Factor
- השוואה GA4 vs platform self-report.
- תיקון החלטות ה-engine לפי הפער.

### 10.4 Incrementality
- `services/incrementality.ts` — floor estimate: incremental_roas = new_customer_revenue / ad_spend.
- מבוסס על GA4 new_users + first_time_purchasers.
- `tenant_incrementality_snapshot` — cached.

### 10.5 Metric Interpretation
- `services/metric-interpreter.ts` — bands per (metric × campaign_type × category).
- 6 metrics: ctr / frequency / hook_rate / completion_rate / roas / cpa.
- Verdicts: excellent / good / normal / concerning / critical.
- Context-aware: frequency=4 ב-retargeting = good; frequency=4 ב-prospecting = concerning.

### 10.6 Budget Scenario Modeling
- `GET /analytics/budget-forecast?budget=N`
- 4 תרחישים: Conservative (50%) / Current / Growth (2×) / Aggressive (4×).
- מבוסס על GA4 ROAS היסטורי.

### 10.7 Creative Theme Learning
- `GET /intelligence/creative-themes`
- ניתוח 90 ימים אחרונים: אילו themes עובדים הכי טוב.

---

## 11. Proactive Briefings

### 11.1 מה הם
- תדריך ביצועים שנשלח אוטומטית ב-WhatsApp + Email.
- מה הוצא, מה ה-ROAS, מה ה-AI שינה ולמה.

### 11.2 תדירות לפי מסלול
| | Grow | Scale |
|---|---|---|
| תדירות | שבועי | יומי |

### 11.3 שפות
- 4 שפות: en / he / ar / ru.
- RTL email לעברית וערבית.

---

## 12. Publisher Shield — אחריות ותאימות

### 12.1 Content Policy — 3 Tiers

**Tier 0 — בלוק מוחלט (regex fast-path, ללא LLM):**
- סמים לא חוקיים, נשק, סחר בבני אדם, ניצול קטינים.
- דיבה על עסקים בשם. Shaming אנשים פרטיים.
- הסתה גזעית / דתית / מגדרית.
- פירמידות, הונאות פיננסיות. טענות רפואיות מוחלטות.
- שיווק לקטינים של אלכוהול/הימורים/טבק. Doxxing.

**Tier 1 — דורש Human Review + רישיון:**
- הימורים / אלכוהול / קנאביס (חוקיות לפי מדינה).
- תוספי תזונה עם טענות בריאות.
- שירותים פיננסיים / רפואיים.
- פוליטיקה ובחירות.

**Tier 2 — מותר עם הסתייגויות:**
- מוצרי מבוגרים (לפי מדינה + פלטפורמה).
- שירותי דייטינג.
- ירידה במשקל.

### 12.2 Geographic Awareness
- חוקיות נבדקת לפי מדינת הלקוח + מדינת היעד של הקמפיין.
- דוגמה: קנאביס — חוקי בקליפורניה, פלילי בסעודיה.

### 12.3 Truth Verification
- Vigmis מאמתת טענות בתוכן מול:
  - Shopify product catalog (מחיר, מלאי, משלוח).
  - `website_analysis`.
- Blocks: fake_scarcity, shipping_contradiction.
- Warns: שאר הטענות.

### 12.4 Trust Tier
- 4 רמות: trusted / standard / watch / restricted.
- 3 axes נפרדים: policy_violations / customer_complaints / bypass_attempts.
- Daily recompute.
- מחובר ל-publish, generation, campaign launch.

### 12.5 Attestation (הצהרות)
- 3 הצהרות חובה לפני onboarding: onboarding_master + tos_acceptance + ai_disclosure_consent.
- Re-attestation כל 90 ימים.

### 12.6 High-Stakes Cooling-Off
- 1 שעה השהיה לפוסטים עם: ערבות/refund/מחיר/הנחה/urgency.
- הלקוח יכול לבטל ידנית.

### 12.7 Stop Loss — סיום לקוח
- Auto-freeze אחרי: ≥5 bypass attempts.
- Manual review אחרי: ≥15 policy blocks / ≥3 legal_risk events ב-30 ימים.
- Cron יומי + OPS_ALERT_EMAIL.

### 12.8 Admin Kill Switch
- `POST /admin/tenants/:id/freeze` — ADMIN_SECRET header בלבד.
- freeze_capabilities: publish / optimize / generation / crons.
- `isFrozenFor(tenantId, capability)` מחובר לכל entry points.

---

## 13. מערך החיובים המלא

### 13.1 שני מסלולים

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

**נקודת שוויון בין המסלולים:** Scale זול יותר מ-Grow בעמלות בלבד כשהוצאות עולות על ~$4,900/חודש. מתחת לזה — Grow זול יותר בעמלה, Scale יקר יותר אבל כולל פיצ'רים (וידאו, פוסטים, יומי).

### 13.2 חישוב עמלה חודשית

**Grow:**
```
עמלה = max(7% × הוצאות, $29)
```
דוגמאות:
- הוצאות $200 → 7% = $14 → גובים $29 (רצפה).
- הוצאות $415 → 7% = $29 → גובים $29 (שוויון רצפה).
- הוצאות $1,000 → 7% = $70 → גובים $70.

**Scale:**
```
עמלה = $49 + 6% × הוצאות
```
דוגמאות:
- הוצאות $0 → $49.
- הוצאות $500 → $49 + $30 = $79.
- הוצאות $5,000 → $49 + $300 = $349.

**הוצאות מוערכות מ-DB:** תקציב יומי × ימי פעילות (קמפיין פעיל=100%, מושהה=50%). לא נתון ישיר מהפלטפורמות — הערכה.

### 13.3 תוספות בתשלום (Add-ons)

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
| Creative revision 2+ | מחיר מלא לפי סוג |

**Scale 5 פוסטים כלולים:** חלים על שני הסוגים ($1 / $0.70). 1 וידאו כלול = כל סוג כולל היקר ביותר.

### 13.4 Circuit Breaker — הגנת מרווח

בכל חודש, המערכת עוקבת אחרי **יחס עלות AI ÷ עמלה חודשית**:

| אחוז | פעולה |
|---|---|
| < 25% | תקין — Claude Sonnet 4.6 לכל שאלה |
| 25% – 30% (Grow) / 40% (Scale) | **Degrade** — מעבר שקט ל-GPT-4o-mini לשאלות שגרתיות. קרונים לא חיוניים (news/weather/insights) מושהים. |
| ≥ 30% (Grow) / ≥ 40% (Scale) | **Freeze** — כל AI נחסם עד ה-1 לחודש. הלקוח מקבל הודעה. OPS_ALERT_EMAIL + audit_log. |

**GPT-4o-mini = ~20× זול** ממקודם Claude Sonnet. Degrade = הגנה על מרווח, בשקט, ללא ידיעת הלקוח.

**דוגמה מעשית:**
- לקוח Grow, הוצאות $200 → עמלה $29 (רצפה).
  - Degrade at: $29 × 25% = $7.25 עלות AI.
  - Freeze at: $29 × 30% = $8.70.
- לקוח Scale, הוצאות $1,000 → עמלה $109.
  - Degrade at: $109 × 25% = $27.25.
  - Freeze at: $109 × 40% = $43.60.

### 13.5 Stripe Billing

**מה מחובר לאיזה Stripe:**

| | מנגנון |
|---|---|
| Scale $49/חודש | Stripe Subscription (auto-charge) |
| Creative revision 2+ | Stripe Checkout one-time (at approve time) |
| Account deletion עם חוב | Stripe Checkout one-time (final balance) |
| עמלת % חודשית | Draft invoice (לא auto-charge עדיין) |

**Stripe Checkout — שדרוג ל-Scale:**
1. `POST /billing/checkout` → יוצר Stripe Checkout session (mode: subscription).
2. Redirect למשתמש ל-Stripe hosted page.
3. לאחר תשלום: webhook `checkout.session.completed` → upsert billing_customers (plan=pro).

**Stripe Customer Portal — ניהול מנוי:**
1. `POST /billing/portal` → Stripe Portal URL.
2. הלקוח רואה: חשבוניות, ביטול, עדכון כרטיס.

**Stripe Webhooks — events מאזינים:**
- `checkout.session.completed` — שדרוג Scale / תשלום final balance / תשלום creative.
- `customer.subscription.created/updated` — עדכון plan.
- `customer.subscription.deleted` — downgrade ל-free.
- `invoice.payment_failed` — status → past_due.

**ENV vars נדרשים ב-Railway:**
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRO_PRICE_ID
```

### 13.6 זרימת מחיקת חשבון (Delete Account)

```
לחיצה על "Delete Account"
        ↓
1. ביטול Stripe subscription (Scale) — לא יחויב יותר
        ↓
2. חישוב יתרה לחודש הנוכחי (% × הוצאות + שירותים)
        ↓
        ↙              ↘
יתרה = $0          יתרה > $0
    ↓                    ↓
מחיקה מיידית     Stripe Checkout (one-time payment)
                         ↓
                  משתמש משלם
                         ↓
                  Stripe webhook
                         ↓
                  executeAccountDeletion
```

**מה executeAccountDeletion עושה (בסדר):**
1. מושהים כל קמפיינים (הוצאות נעצרות מיד).
2. Revoke OAuth tokens — Meta / Google / TikTok.
3. מחיקת משתמש Clerk (login חסום מיידית).
4. רישום ב-audit_log.
5. DELETE מ-tenants (cascade לכל הטבלאות).

**מה לא נמחק:** `billing_invoices` — tenant_id → NULL + `deleted_tenant_id` נשמר. חשבוניות שורדות לצרכי חשבונאות.

### 13.7 מחזור חיוב חודשי
- Cron `POST /billing/invoice` ביום 1 לכל חודש.
- מחשב עמלה לכל tenant.
- יוצר draft invoice ב-`billing_invoices`.
- Stripe subscription גובה $49 אוטומטית.
- עמלת % — draft בלבד כרגע (לא auto-charge).

### 13.8 בקרת יתרה
- `GET /account/balance` — מחזיר יתרה נוכחית + פירוט.
- `GET /billing/status` — plan + fee estimate + period.
- `GET /billing/invoices` — 12 חשבוניות אחרונות.

---

## 14. מחיקת חשבון — מה קורה אם הלקוח לא משלם

אם המשתמש קיבל Stripe Checkout ל-final balance ולא השלים תשלום — **החשבון נשאר פעיל**. אין מחיקה. הלקוח יכול לחזור לדשבורד ולסיים את התהליך. אין "Deletion Pending" state פורמלי כרגע — הוא פשוט לא נמחק.

---

## 15. חשבוניות — retention

- חשבוניות נשמרות גם לאחר מחיקת הלקוח.
- FK: `billing_invoices.tenant_id` → SET NULL (לא CASCADE).
- `billing_invoices.deleted_tenant_id` = UUID של הלקוח שנמחק — לאזכור עתידי.
- לעולם לא נמחקות.

---

## 16. אבטחה

### 16.1 Token Encryption
- כל OAuth tokens (Meta/Google/TikTok) מוצפנים ב-AES-256-GCM לפני שמירה.
- `packages/db/src/crypto.ts` — encryptToken / decryptToken.
- Token בטקסט חופשי לא נשמר בשום מקום ב-DB.

### 16.2 Audit Log
- כל פעולה משמעותית → `audit_log`.
- Append-only (migration 046 — immutable policy).
- כולל: חיבור/ניתוק פלטפורמה, scale_up/down, pause, AI freeze, account deletion.

### 16.3 OAuth Security
- State parameter: `crypto.randomBytes(16)` + Map עם expiry 10 דקות. מונע CSRF.
- לא pages[0] אוטומטי — הלקוח חייב לבחור.

### 16.4 Approval Snapshots
- Forensic-grade: canonical-JSON SHA256, IP, UA, attestation linkage.
- מחובר ל-publish + budget changes + campaign launch + onboarding.

### 16.5 CRON_SECRET
- כל Cron מ-Vercel עם `x-cron-secret` header.
- ה-API מאמת בכל route. ללא secret → 401.

### 16.6 HMAC על Webhooks
- Shopify webhook: HMAC verification.
- Stripe webhook: `verifyStripeWebhook()` עם raw body + signing secret.

---

## 17. Multi-User — Team Members

| | Grow | Scale |
|---|---|---|
| Seats | 1 | עד 3 |

- Invite-based. Token תוקף 7 ימים. שליחה ב-SendGrid.
- Auth middleware: tenant_id נפתר מ-own tenant → team_members → create new.
- API: GET/POST/DELETE `/team`, POST `/team/invite`, POST `/team/accept`.
- UI: `/settings/team`, `/join?token=xxx`.

---

## 18. i18n — רב-לשוניות

### 18.1 10 שפות נתמכות
en / he / ar / es / pt / fr / ru / de / tr / it

### 18.2 RTL
- עברית + ערבית: `html dir="rtl"` אוטומטי.

### 18.3 שפת UI לעומת שפת תוכן
- **שפת UI** (`ui_language`): השפה שהדשבורד מוצג בה.
- **שפת תוכן** (`content_language`): שפת הפוסטים/קמפיינים שנוצרים. ערך `auto` = זיהוי Unicode.

---

## 19. תשתית טכנית

### 19.1 Stack

| Component | Technology |
|---|---|
| Frontend | Next.js 16 App Router, Vercel, Tailwind CSS, Clerk |
| API | Fastify, Node.js, TypeScript, Railway |
| Database | Supabase (PostgreSQL) |
| Auth | Clerk (JWT), Bearer token per request |
| AI | Claude Sonnet 4.6 (החלטות), GPT-4o (תוכן), GPT-4o-mini (סיווג/degrade), DALL-E 3 (תמונות), Gemini 2.5 Flash (research) |
| AI Gateway | OpenRouter (לפרובידרים שאינם native — Perplexity Sonar Pro וכד') |
| Billing | Stripe (Checkout + Subscription + Webhooks) |
| Email | SendGrid |
| Storage | Supabase Storage (logos bucket, creatives bucket) |
| Videos | HeyGen (avatar), Replicate (cinematic + animation) |
| Monitoring | Railway health check + OPS_ALERT_EMAIL |

### 19.2 AI Router — ניתוב מודלים

| Task | Model | עלות |
|---|---|---|
| chat, optimization_decision, analysis, report_generation | Claude Sonnet 4.6 | $3/$15 per 1M |
| copywriting (posts, reply drafts) | GPT-4o | $2.5/$10 |
| triage, sentiment, classification | GPT-4o-mini | $0.15/$0.60 |
| image generation | DALL-E 3 | $0.04/image |
| market research | Gemini 2.5 Flash | זול |
| creative scoring | GPT-4o Vision | — |
| degrade mode | GPT-4o-mini | ~20× זול |

**OpenRouter:** עבור מודלים שאינם native (Perplexity, Mistral וכד'). OpenAI-compatible SDK עם baseURL של OpenRouter.

### 19.3 Middleware
- `apps/web/proxy.ts` — Clerk middleware (מחליף middleware.ts — שניהם ביחד שוברים build).

### 19.4 Monorepo Structure
```
apps/web        Next.js 16 (Vercel)
apps/api        Fastify (Railway)
packages/db     Supabase client + crypto
packages/ai-router  Model routing + providers
packages/ad-connectors  Google/Meta/TikTok APIs
packages/config  shared config
```

### 19.5 Migrations
- **49 migrations** (001 → 049) — כולן רצו על Supabase.
- DDL מורץ ידנית עם sbp_ token (Supabase Management API).

---

## 20. Crons פעילים (Vercel)

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
| `/api/cron/comments-insights` | 05:00 | חילוץ insights |
| `/api/cron/reattestation` | 09:00 | תזכורות re-attestation |
| `/api/cron/stop-loss` | 10:00 | auto-freeze violations |
| `/api/cron/trust-recompute` | 11:00 | חישוב מחדש Trust Tier |
| `/api/cron/shopify-sync` | 03:00 | sync מוצרי Shopify |
| `/api/cron/ghost-cleanup` | 09:00 | אזהרה ל-tenants ללא קמפיינים (יום 30/60) |
| `/api/cron/creative-discard` | 02:00 | auto-reject creatives לא מאושרים אחרי 7 ימים |
| `/api/cron/billing-invoice` | 01:00 (1st of month) | ייצור חשבוניות חודשיות |

---

## 21. עמודי UI עיקריים

| Path | תכולה |
|---|---|
| `/` | Landing page — pricing, CTA |
| `/pricing` | תמחור מלא עם גילוי מלא (7 פסקאות billing disclosure) |
| `/terms` | ToS מלא (§1-§20) |
| `/refund` | מדיניות ביטול + מחיקת חשבון |
| `/sign-in`, `/sign-up` | Clerk auth |
| `/onboarding` | 7-step onboarding wizard |
| `/dashboard` | Posts / Comments / Connect tabs |
| `/dashboard/intelligence` | Conversion Readiness / Insights / Briefings / Crisis |
| `/dashboard/compliance` | Attestations / Industry licenses |
| `/dashboard/settings` | Delete account / Export data |
| `/billing` | Plan status / Usage widget / Invoices / Upgrade |
| `/settings/team` | Team members management |
| `/settings/general` | Logo upload / Language |
| `/join?token=` | קבלת הזמנה לצוות |
| `/admin/freeze` | Kill switch (ADMIN_SECRET) |

---

## 22. מסלול לקוח — Customer Journey

1. `/sign-up` → Clerk auth → tenant נוצר אוטומטית.
2. Onboarding: URL → ניתוח → שאלון → חיבור Meta/Google/TikTok.
3. Vigmis מייצרת אסטרטגיה + Conversion Readiness audit.
4. לקוח מאשר → Vigmis פותחת קמפיינים.
5. Vigmis מייצרת פוסטים שבועיים → לקוח מאשר/דוחה/עורך.
6. Vigmis מפרסמת מאושרים. מגיבה לתגובות. מתריעה על leads.
7. אופטימיזציה 3-6×/יום. תדריך שבועי/יומי.
8. לקוח רואה Dashboard עם metrics אמיתיים (GA4) + history.
9. לקוח מוחק → חישוב יתרה → Stripe → cascade delete.

---

## 23. מה עדיין פתוח

| פריט | סטטוס |
|---|---|
| Meta App Review — pages_manage_posts/Instagram scopes | ממתין להגשה חוזרת עם סרטון |
| TikTok Marketing API | ממתין לאישור |
| TikTok video.publish scope | הוגש מחדש |
| עמלת % חודשית — auto-charge ב-Stripe | Draft invoice בלבד. לא auto-charge. |
| `/creatives/:id/approve` endpoint | **חסר** — נדרש לממש |
| "Deletion Pending" state | לא קיים — חשבון נשאר פעיל אם לא שילם |
| Google Ads Standard Access | יוגש ב-10,000 משתמשים |
| TikTok — אין Client Key עדיין | ממתין ל-Anna |
| Multi-user — לא נבדק end-to-end | נבנה, לא נבדק |

---

## 24. מדדי קוד

- **49 migrations** על Supabase (001–049)
- **3+ route modules** API (creatives, billing, account, social, campaigns, connectors, chat, ops, ...)
- **30+ services** ב-API
- **18+ crons** רשומים ב-Vercel
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

---

## נספח ב' — ENV Vars קריטיים

| Variable | איפה | שימוש |
|---|---|---|
| STRIPE_SECRET_KEY | Railway | Stripe API |
| STRIPE_WEBHOOK_SECRET | Railway | אימות webhook |
| STRIPE_PRO_PRICE_ID | Railway | Scale subscription price |
| OPENROUTER_API_KEY | Railway | Perplexity + non-native models |
| CLERK_SECRET_KEY | Railway + Vercel | Auth |
| SUPABASE_URL | Railway | DB |
| SUPABASE_SERVICE_ROLE_KEY | Railway | DB |
| CRON_SECRET | Railway + Vercel | Cron auth |
| SENDGRID_API_KEY | Railway | Email |
| OPS_ALERT_EMAIL | Railway | Circuit breaker alerts |
| HEYGEN_API_KEY | Railway | Avatar videos |
| REPLICATE_API_TOKEN | Railway | Cinematic + Animation |
| OPENAI_API_KEY | Railway | GPT-4o, DALL-E |
| ANTHROPIC_API_KEY | Railway | Claude Sonnet |
| META_APP_ID + META_APP_SECRET | Railway | Meta OAuth |
| GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET | Railway | Google OAuth |
| TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET | Railway | TikTok OAuth |
| TOKEN_ENCRYPTION_KEY | Railway | AES-256-GCM token encryption |
| ADMIN_SECRET | Railway | Kill switch |

---

*עדכון אחרון: 2026-06-09*
