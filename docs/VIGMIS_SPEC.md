# Vigmis Product Specification

## 1. מה זה Vigmis

Vigmis הוא מערכת הפעלה לשיווק דיגיטלי (Marketing OS).

הכוונה: לא כלי פרסום נקודתי, אלא מערכת אחת שמנהלת את כל השיווק הדיגיטלי עבור לקוח.

המערכת חייבת:
- לחבר חשבונות Google Ads ו‑Meta Ads
- ללמוד העסק והאתר של הלקוח
- לבצע מחקר שוק ומתחרים
- לייצר דוח אסטרטגי והמלצה קמפיינית
- להציע קמפיין מבוסס
- לקבל אישור ידני
- להשיק קמפיינים
- לבצע אופטימיזציה רציפה
- לדווח ולתעד כל פעולה
- להגן על תקציב הלקוח
- לפעול בצורה בטוחה ומבוקרת


## 2. מה חייב להיות ב‑MVP

### 2.1. Onboarding
- חיבור OAuth ל‑Google Ads
- חיבור OAuth ל‑Meta Business Manager
- קלט עסקי:
  - תקציב יומי/חודשי
  - יעד קמפיין (לידים, מכירות, ROAS, תדמית)
  - מיקוד גיאוגרפי
  - שפה
  - קהלים רצויים ולא רצויים
  - סוג המוצר/שירות
  - האם להשתמש בקריאייטיב קיים או להציע קריאייטיב חדש
  - רמת סיכון מקובלת (למשל ״שמרני״ מול ״תקפתי״)

### 2.2. Website + Business Analysis
- סריקה אוטומטית של האתר
- ניתוח מבנה, מסרים, CTA, דפי נחיתה
- זיהוי נקודות חולשה בתוכן
- יצירת פרופיל עסקי
- שליפה של עמודים/מוצרים מרכזיים

### 2.3. Market & Competitor Research
- זיהוי מתחרים מרכזיים
- ניתוח מסרי מתחרים
- המלצת מילות מפתח לדיגיטל
- זיהוי זוויות פרסום
- המלצה על פילוח קהלים

### 2.4. Recommendation Report
- דוח אסטרטגי למשתמש
- נקודות חוזק וחולשה
- קהלים מומלצים
- מסרים מומלצים
- מבנה קמפיין מוצע
- חלוקת תקציב בין Google ו‑Meta
- הוראות לקריאייטיב

### 2.5. Campaign Proposal
- הצעה למבנה קמפיין
- הצעת קהלי יעד / ad sets
- הצעת תקציב יומי ותקציב פלטפורמות
- הצעת מיקומים ושפות
- תבנית מודעות מומלצת

### 2.6. Approval Gate
- לא משיקים קמפיין בלי אישור ידני ראשוני
- אפשרות לערוך את התכנית לפני השקה
- אפשרות לבטל / לחזור אחורה לפני השקה

### 2.7. Launch
- יצירה והפעלה של קמפיינים ב‑Google Ads
- יצירה והפעלה של קמפיינים ב‑Meta Ads
- תיעוד יצירה והפעלת קמפיין
- שמירת מצב השקה

### 2.8. Continuous Optimization
- optimization loop מבוקר
- בדיקת ביצועים אוטומטית
- זיהוי מודעות חלשות ו‑pause
- הזזת תקציב למודעות טובות
- בדיקה דינמית של קהלים
- בדיקה של שעות ומיקומים
- עדכון פרמטרים רק כשיש נתונים מספיקים

### 2.9. Dashboard & Reporting
- דשבורד ביצועים
- דוח שינויים ופעולות
- דוחות תקופתיים
- התראות חריגה
- תצוגת עלות / המרה / ROAS
- audit log של כל פעולה

### 2.10. Billing
- מבנה תמחור
- חיוב לפי שימוש
- חשבוניות PDF
- דוח הוצאות
- לוח בקרה לתשלומים

### 2.11. Risk & Control Layer
- hard budget caps
- stop-loss rules
- daily spend caps
- change caps
- kill switch
- dry-run mode
- safe mode אם יש תקלה
- audit log ברמת פעולה
- fallback כשדיוק הנתונים לא מספיק

### 2.12. Tracking & Attribution
- מעקב המרות מקוריות
- attribution בין Google/Meta
- campaign/ad-set/ad attribution
- בדיקת תקינות נתונים


## 3. הנחות עבודה והחלטות קבועות

### 3.1. מודל תמחור
- בחבילת בסיס:
  - שימוש לפי ק״ל: 15 סנט לקליק
- בחבילת פרו:
  - דמי מנוי חודשיים של 15 דולר
  - עלות קליק של 12 סנט
- מודל זה יהיה אבן דרך ראשון, אך לא התחייבות רווחיות.
- יש להגדיר מודל תמחור רשמי לפי שימוש, plan, ותעריפים בזמן הפיתוח.

### 3.2. למה ה‑MVP מתמקד
- Google Ads
- Meta Ads
- לא TikTok
- לא Amazon
- לא video AI
- לא ביצוע תיקונים אוטומטיים באתר

### 3.3. עוצמת הפרו
- אופטימיזציה דינמית תדירה יותר
- יותר בדיקות
- יותר דוחות
- יותר מעקב
- יותר תיקונים
- תמיכה ממוקדת

### 3.4. תדירות אופטימיזציה
- בסיס: בדיקה כל 60 דקות (לא ״עשיה כל שעה" אלא בדיקת החלטות)
- פרו: בדיקה כל 30 דקות
- שינויים בפועל מבוססים דאטה ולא קבועים כשאין מספיק ממצאים
- שעות / קהלים / תקציב מתעדכנים רק אם הנתונים תומכים בכך

### 3.5. אין הבטחות ביצועים
- לא מתחייבים ל‑CTR ספציפי
- לא מתחייבים ל‑CPA ספציפי
- כן נותנים יעדים ותחזיות מבוססות

### 3.6. תיעוד וזיכרון
- כל החלטה תתועד ב‑`docs/LOG.md`
- כל שינוי מהותי יתועד בקובץ תקציר ייעודי
- יש דרך עבודה עקבית של “session log”


## 4. ארכיטקטורה נדרשת

### 4.1. עקרונות עיקריים
- modular
- connector-based
- multi-tenant
- event/job-driven
- AI router abstraction: מנוע שמבחר איזה כלי AI להשתמש בכל משימה (GPT, Claude, Gemini) לפי התאמה, כדי להבטיח אמינות וגיוון. כרגע נרשם ל‑GPT, יירשם לשאר.
- cloud-ready
- i18n from day one

### 4.2. שכבות
- presentation layer: Next.js dashboard
- API / orchestration layer
- domain services layer
- connectors layer
- AI layer
- data layer
- workers / jobs layer

### 4.3. מודולים עיקריים
- onboarding service
- website analysis service
- market research service
- campaign planning service
- launch service
- optimization service
- reporting service
- billing service
- risk/control service
- audit service
- connector adapters
- localization service
- AI router service: מנוע לבחירת כלי AI מיטבי לכל משימה (GPT, Claude, Gemini), עם בדיקה ואופטימיזציה של בחירה.

### 4.4. connectors
- google_ads_connector
- meta_ads_connector
- future: tiktok_connector, amazon_connector
- כל connector עומד מאחורי interface אחיד

### 4.5. data model
- tenant
- user
- client profile
- brand profile
- website profile
- market research report
- recommendation report
- campaign plan
- approval record
- campaign
- optimization run
- optimization action
- creative asset
- billing record
- audit entry
- locale profile


## 5. מה לא נכנס ל‑MVP

- TikTok
- Amazon
- וידאו AI מלא
- תיקונים אוטומטיים באתר
- build-in CRM automation
- advanced ML training infrastructure
- ניתוח מורכב של נתוני first-party מעבר לקמפיין


## 6. כיווני המשך אחרי MVP

### Phase 2
- TikTok
- creative studio
- visual asset recommendations
- more frequent creative testing

### Phase 3
- website actions
- CMS integration
- landing page optimization

### Phase 4
- Amazon
- product catalog optimization
- Amazon campaign management

### Phase 5
- CRM automation
- retention automation
- open API
- enterprise features


## 7. סטטוס החלטות

### החלטות אחידות
- Vigmis = Marketing OS
- MVP = Google + Meta
- Approval-first flow
- Risk/Control layer חובה
- No performance guarantees
- No rigid hourly actions
- Audit log ברמת פעולה
- Budget protection חובה
- Fail-safe / safe mode חובה

### תמחור קבוע
- בסיס: 15 סנט לקליק
- פרו: 15 דולר לחודש + 12 סנט לקליק

### מה מגיע בפרו
- בדיקות יותר תכופות
- יותר דוחות
- יותר תיקונים
- יותר מעקב
- תמיכה מוקדמת יותר


## 8. מה זה נותן ללקוח

### בסיס
- מחקר שוק + מתחרים
- הצעת קמפיין מובנית
- השקה מבוקרת
- אופטימיזציה רציפה
- דשבורד ביצועים
- הגנה על תקציב

### פרו
- כל מה שבבסיס
- תגובה מהירה יותר לשינויים
- יותר בדיקות ושינויים
- דוחות בתדירות גבוהה
- רמת שירות גבוהה יותר


## 9. משימות קריטיות להמשך

1. לבנות את scaffold הפרויקט ב‑`c:\vigmis\vigmis-main`
2. להחליט על מבנה המונורפו לפי ARCHITECTURE.md
3. לבנות חיבורי Google + Meta ראשוניים
4. לבנות את ה‑Risk/Control layer לפני אוטומציה מלאה
5. לבנות audit log ברמת פעולה
6. לבנות approval gate ראשוני
7. לבנות optimization loop מבוקר


---

**מסמך זה מרכז את כל התכונות וההחלטות המשמעותיות של Vigmis, כפי שנקבעו עד כה.**