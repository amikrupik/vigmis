# VIGMIS — Pre-Launch & Maintenance Checklist

## Status: Working Draft — June 2026

---

## PART 1: PRE-LAUNCH — שירותים שצריך לשדרג / לתקן לפני לקוחות אמיתיים

---

### 🔴 CRITICAL — בלי אלה האתר ייפול או לא יעבוד

#### 1. Supabase: Free → Pro ($25/month)

**סיבה:** Free tier מפסיק פרויקטים אחרי 7 ימים של חוסר פעילות. גם בפיתוח זה מבעיק, בproduction זה אסון.
- עלות: $25/month
- מה מקבלים: אין pause, 8GB DB, 100GB storage, Point-in-Time Recovery (7 days), daily backups
- **פעולה:** Dashboard → Settings → Billing → Upgrade to Pro
- **עדכון Railway:** `DATABASE_URL` (Supabase מספק URL חדש ב-Pro)

#### 2. Clerk: מפתחות TEST → LIVE

**סיבה:** כרגע כל המשתמשים נרשמים ב-Test environment. אין continuity לproduction.
- `CLERK_SECRET_KEY` = כרגע `sk_test_...` → צריך `sk_live_...`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = כרגע `pk_test_...` → צריך `pk_live_...`
- **פעולה:** Clerk Dashboard → switch to Production instance → קבל LIVE keys
- **עדכון:** Railway + Vercel env vars
- **חשוב:** כל המשתמשים שנרשמו ב-Test יאבדו — בפיתוח זה בסדר, לפני launch זה הזמן לעבור

#### 3. NewsAPI: Free → Developer plan ($99/month) או Business ($449/month)

**סיבה קריטית:** NewsAPI Free tier **אסור לשימוש מסחרי/production**. הם יחסמו את המפתח.
- המערכת משתמשת ב-NewsAPI לסריקת חדשות (cron `/api/cron/news-scan`)
- Free: 100 requests/day, no commercial use
- Developer: $99/month, 250k requests/month, production OK
- **אלטרנטיבה זולה יותר:** להחליף ב-Perplexity Sonar (כבר יש OpenRouter key) לסריקת חדשות. עולה ~$0.01 לשאילתה. אפשר לשקול.
- **פעולה:** https://newsapi.org/pricing — upgrade לפני launch

#### 4. Meta App: Development → Live (App Review)

**סיבה:** במצב Development, רק Test Users מורשים. לקוחות אמיתיים לא יוכלו לחבר Meta.
- כרגע: App Review לא הושלם (ממה שידוע מהשיחות הקודמות)
- **פעולה:** Meta for Developers → App Review → submit לScopes הנדרשים
- **הגבלה:** עד App Review מלא — לא ניתן לקבל לקוחות Meta חיים

#### 5. Stripe: Test → Live (כחלק מ-VIGMIS US LLC)

**סיבה:** ברור. אין גבייה אמיתית בtest mode.
- מכוסה ב-Post-EIN Checklist
- **תזכורת:** product + price + webhook חדשים על account החדש

---

### 🟠 IMPORTANT — לשדרג לפני תנועה משמעותית

#### 6. SendGrid: Free → Essentials ($20/month)

**סיבה:** Free tier = 100 emails/day. המערכת שולחת:
- Daily reports ללקוחות
- Invoice notifications
- Alert emails
- Weekly digest
100/day לא יספיק אפילו ל-50 לקוחות פעילים.
- Essentials: $19.95/month → 50,000 emails/month
- **פעולה:** SendGrid Dashboard → Upgrade

#### 7. Railway: לוודא Plan מתאים

**סיבה:** Hobby plan עלול לגרום לcold starts (שהייה של שניות לפני תגובה ראשונה).
- לבדוק: Railway Dashboard → Usage → plan נוכחי
- Pro plan: $20/seat/month — no sleep, custom domains, more RAM
- **פעולה:** לבדוק usage patterns; אם יש cold starts → upgrade

#### 8. Vercel: Pro כבר מאושר ✅

מתוך ה-JWT ב-env.local: `"plan":"pro"`. אין פעולה נדרשת.
- Crons: כלולים ב-Pro ✅
- Bandwidth: 1TB/month ✅

---

### 🟡 WHEN READY — לסגור לפי לוח זמנים

#### 9. HeyGen: לוודא API Quota

- HeyGen API מוגבל לפי plan
- לבדוק: HeyGen Dashboard → Usage & Billing
- לוודא שיש quota מספיקה לvideos במקביל

#### 10. Replicate: לוודא Billing Method

- Pay-as-you-go, אבל צריך billing method מוגדר
- לבדוק Replicate account billing

#### 11. OpenWeather: Free → Paid אם נדרש

- Free: 1,000 calls/day — מספיק בשלב ראשון
- אם מגיעים ל-500+ לקוחות פעילים → upgrade

#### 12. OpenRouter: Auto Top-Up מוגדר ✅

$20 כשיורד מתחת ל-$5. בסדר.

---

## PART 2: אבטחה — מפתחות שצריך להחליף לפני LIVE

---

### 🔴 להחליף עכשיו (נחשפו ב-Chat)

| מפתח | הסיבה | איפה להחליף |
|------|--------|-------------|
| `sbp_xxxx...` (Supabase PAT) | נכתב בצ'אט בעבר | Supabase Dashboard → Access Tokens → Revoke & New |
| `sk-or-v1-4f66b50d...` | OpenRouter key — נכתב בצ'אט | OpenRouter → API Keys → Revoke & New |
| `CRON_SECRET="vigmis-cron-secret-2026"` | חלש + נכתב בצ'אט | generate: `openssl rand -hex 32` → Railway |

### 🔴 להחליף בעת מעבר ל-LIVE

| מפתח | הסיבה | פעולה |
|------|--------|--------|
| `CLERK_SECRET_KEY` + `PUBLISHABLE_KEY` | TEST → LIVE | Clerk Dashboard → Production |
| `STRIPE_SECRET_KEY` | TEST → LIVE | Stripe Live account חדש |
| `STRIPE_WEBHOOK_SECRET` | TEST → LIVE | Stripe Live webhook |
| `META_APP_SECRET` | לוודא שלא נחשף | Meta for Developers |

### 🟡 לבדוק (לא בטוח נחשפו)

| מפתח | פעולה |
|------|--------|
| `OPENAI_API_KEY` | בדוק אם מופיע ב-chat history; אם כן — rotate |
| `ANTHROPIC_API_KEY` | בדוק אם מופיע ב-chat history; אם כן — rotate |
| `SENDGRID_API_KEY` | בדוק; אם נחשף — rotate |

### לגבי שאלתך: "האם צריך לעדכן אותי במפתחות"

**לא.** Claude Code לא צריך להכיר מפתחות. המפתחות נשמרים ב-Railway env vars בלבד. לClaude יש גישה לRailway CLI כשצריך לבצע פעולות. אין צורך להדביק מפתחות בצ'אט — זה מסכן.

---

## PART 3: CHECKLIST מלא לפני LIVE

```
[ ] Supabase: Free → Pro
[ ] Clerk: TEST → LIVE keys (Railway + Vercel)
[ ] NewsAPI: upgrade לDeveloper/Business
[ ] Meta App: App Review מוגש ואושר
[ ] Stripe: Live account (VIGMIS US LLC) + Railway env vars
[ ] SendGrid: Free → Essentials
[ ] Railway: לוודא plan ואין cold starts
[ ] Rotate: sbp_ Supabase token
[ ] Rotate: OpenRouter key
[ ] Rotate: CRON_SECRET (strong random)
[ ] Privacy Policy: עודכן ✅ (2026-06-10)
[ ] ToS: Taurus → VIGMIS US LLC (אחרי LLC)
[ ] RLS: audit ב-Supabase (Security Phase 1)
[ ] Supabase PITR: enabled ב-Pro ✅
[ ] Domain: vigmis.com מחובר וSSL פעיל
[ ] Error monitoring: Sentry / Railway logs configured
[ ] Backup: R2 backup policy מוגדר
```

---

## PART 4: תחזוקה שוטפת

### כל שבוע
- [ ] Railway logs — לבדוק errors חריגים
- [ ] Supabase — לבדוק DB size וconnection pool
- [ ] Stripe — לבדוק failed payments

### כל חודש
- [ ] בדיקת כל חשבונות שירותים (billing anomalies)
- [ ] OpenRouter credits — לוודא auto top-up עובד
- [ ] Railway usage — לוודא לא מתקרבים ל-limits
- [ ] Supabase storage — לוודא לא ממלאים
- [ ] Clerk MAU — לוודא לא מגיעים ל-cap
- [ ] Rotate CRON_SECRET אחת לחצי שנה
- [ ] npm audit — בדיקת vulnerabilities

### כל רבעון
- [ ] `npm audit fix` — עדכון חבילות עם vulnerabilities
- [ ] בדיקת כל OAuth tokens (Meta, Google, TikTok) — לא פגו
- [ ] Railway + Vercel dependency updates
- [ ] סקירת AI model pricing — האם הrouting עדיין אופטימלי
- [ ] בדיקת Stripe declined rates — אם גבוה → לחקור

### כל שנה
- [ ] Clerk API key rotation (best practice)
- [ ] Supabase service role key rotation
- [ ] סקירת plan pricing — האם עדיין מתאים
- [ ] Form 5472 + Form 1120 filing (CPA — ראה Post-EIN Checklist)
- [ ] Transfer Pricing documentation update

---

## PART 5: Stack Summary — כל השירותים ועלויותיהם

| שירות | תפקיד | עלות נוכחית | עלות post-launch |
|-------|--------|-------------|-----------------|
| Vercel | Frontend hosting + Crons | Pro ~$20/month ✅ | ~$20/month |
| Railway | API hosting | ~$5-20/month | ~$20/month |
| Supabase | DB + Storage | Free → **חייב Pro $25** | $25/month |
| Clerk | Auth | Free (test) | $25/month (live, 25k MAU) |
| Stripe | Payments | Free (test) | 2.9%+$0.30/charge |
| OpenAI | GPT-4o + DALL-E | Pay-per-use | ~$50-200/month (usage) |
| Anthropic | Claude Sonnet | Pay-per-use | ~$50-300/month (usage) |
| OpenRouter | Perplexity Sonar | $20 top-up ✅ | ~$10-50/month |
| HeyGen | Avatar videos | Pay-per-video | ~$50-200/month |
| Replicate | Cinematic/Animation | Pay-per-run | ~$20-100/month |
| Cloudflare R2 | Asset storage | Pay-per-GB | ~$5-20/month |
| SendGrid | Email | Free → **Essentials $20** | $20/month |
| NewsAPI | News scan | Free → **$99/month** | $99/month |
| Twilio | WhatsApp alerts | Pay-per-msg | ~$10-30/month |
| OpenWeather | Weather data | Free OK | Free initially |

**עלות תשתית baseline לפני AI usage: ~$300-400/month**

---

*מסמך זה להתעדכן לאחר כל שינוי תשתיתי משמעותי.*
