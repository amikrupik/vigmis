# Vigmis Implementation Plan — Marketing Brain + Publisher Shield

מסמך זה מתאר את 5 הסשנים, 30 הפיצ'רים, וסדר העבודה ברמת קבצים.
מקור התכנון: דיון אסטרטגי 2026-05-28 (ראו memory: project_vigmis_marketing_brain, project_vigmis_content_policy, project_vigmis_publisher_shield).

עיקרון: כל סשן עומד בפני עצמו — אפשר לעצור/לשלוח לעולם בסוף כל סשן בלי לשבור את הקודם.

---

## Session 1 — Safety MVP Foundation ✅ הושלם

תשתית משפטית-בטיחותית. בלעדיה לא עולים לקנה מידה.

| # | פיצ'ר | קבצים |
|---|---|---|
| 1.1 | DB migration: 3 publisher-shield tables | `supabase/migrations/023_publisher_shield.sql` |
| 1.2 | Policy classifier engine (fast-path + LLM) | `apps/api/src/services/policy-classifier.ts` |
| 1.3 | `/policy/classify` API + audit log | `apps/api/src/routes/policy.ts` + server.ts |
| 1.4 | Approval snapshot service (SHA256+IP+UA) | `apps/api/src/services/approval-snapshot.ts` + `apps/api/src/routes/attestations.ts` |
| 1.5 | Attestation checkbox UI | `apps/web/app/components/AttestationCheckbox.tsx` + `attestation-actions.ts` |
| 1.6 | AI disclosure auto-tagger (Meta/TT/Google/EU) | `apps/api/src/services/ai-disclosure.ts` |

---

## Session 2 — Wire-in + ToS ✅ הושלם

מחברים את הפיצ'רים של סשן 1 לתוך flows קיימים (publish, onboarding, generation) ומעלים ToS draft שעו"ד יוכל לעדכן.

| # | פיצ'ר | קבצים |
|---|---|---|
| 2.1 | Pre-flight classifier hook ב-generation pipeline | `apps/api/src/services/social-content.ts` |
| 2.2 | Post-flight classifier hook ב-publish flow + Reconnect-style block UI | `apps/api/src/services/social-publisher.ts`, `apps/web/app/dashboard/...` |
| 2.3 | Approval snapshot ב-publish + ב-budget changes | `apps/api/src/services/social-publisher.ts`, `apps/api/src/routes/campaigns.ts` |
| 2.4 | AI disclosure injection ב-publish payloads | `apps/api/src/services/social-publisher.ts` |
| 2.5 | Onboarding attestation gate (3 attestations חובה) | `apps/web/app/onboarding/OnboardingPageClient.tsx`, `apps/api/src/routes/onboarding.ts` |
| 2.6 | ToS draft updated + Acceptable Use page | `apps/web/app/terms/page.tsx`, `apps/web/app/acceptable-use/page.tsx` |

---

## Session 3 — Smart Operations ✅ הושלם

ההבדל הראשון בין "אוטומציה" ל-"מנהל פרסום".

| # | פיצ'ר | קבצים |
|---|---|---|
| 3.1 | Statistical significance gating ב-Optimization Engine | `apps/api/src/optimization/...`, חדש `apps/api/src/services/significance.ts` |
| 3.2 | Trust Tier (3-axis scoring) | migration 024, `apps/api/src/services/trust-tier.ts` |
| 3.3 | Intent Router (6 buckets) | `apps/api/src/services/intent-router.ts`, חיבור ב-chat.ts |
| 3.4 | Brand voice profile extraction מ-website crawl | `apps/api/src/services/brand-voice.ts`, migration 025 |
| 3.5 | Creative brief schema + onboarding UI | migration 026 (creative_briefs), `apps/web/app/onboarding/CreativeBriefStep.tsx` |
| 3.6 | "Don't Advertise" Conversion Readiness check | `apps/api/src/services/conversion-readiness.ts` |

---

## Session 4 — Intelligence Layer ✅ הושלם

עומק חשיבה דיאגנוסטית.

| # | פיצ'ר | קבצים |
|---|---|---|
| 4.1 | Truth verification (crawl ↔ ads ↔ Shopify) | `apps/api/src/services/truth-verifier.ts` |
| 4.2 | Proactive briefings WhatsApp/SMS | `apps/api/src/services/briefings.ts`, cron, migration 027 |
| 4.3 | Context-aware metric interpretation engine | `apps/api/src/services/metric-interpreter.ts` |
| 4.4 | Incrementality / New vs Returning split | `apps/api/src/services/incrementality.ts` |
| 4.5 | Geographic awareness ב-classifier + publisher | עדכון `policy-classifier.ts`, `ai-disclosure.ts` |
| 4.6 | Two-Key pattern לתוכן high-risk גם ב-AUTO | עדכון `social-publisher.ts`, חדש `apps/api/src/services/two-key.ts` |

---

## Session 6 — Social Inbox Intelligence ✅ הושלם

**הקשר:** ה-Comments v1 כבר עובד בקוד (FB+IG, 5 קטגוריות, UI בדשבורד, send/hide/ignore). Session 6 מרחיב ל-v2 חכם. **חייב לרוץ אחרי Session 3.4** (Brand Voice) כי 6.5 משתמש בו.

| # | פיצ'ר | קבצים |
|---|---|---|
| 6.1 | Taxonomy מורחבת (10 קטגוריות) + Do-Not-Engage detection | עדכון `apps/api/src/services/social-comments.ts`, migration 029 |
| 6.2 | Priority Engine + Comment-to-Lead → WhatsApp/Email digest + Public/Private routing | `apps/api/src/services/comment-priority.ts`, חדש worker `lead-digest.ts` |
| 6.3 | Crisis Detection velocity-based (baseline 7d × 2.5σ) | `apps/api/src/services/sentiment-velocity.ts`, migration 030 |
| 6.4 | Toxicity gate + **Confidence Score** (≥0.85 לכל auto-reply) + no-engage | עדכון `apps/api/src/services/social-comments.ts` (gate על ai_draft_reply) |
| 6.5 | Brand voice on replies (תלוי 3.4) + **Human Override Learning** (feedback loop) | עדכון `triageComment` prompt + שילוב brand-voice + worker שלומד מ-edited drafts |
| 6.6 | Insights mining + outcome tracking infra | `apps/api/src/services/comment-insights.ts`, migration 031 (reply_outcomes) |

**דחויים לפוסט-Session 6 (lift עצום או scope חסום):**
- DM / Direct Messages (`instagram_manage_messages` לא ב-App Review)
- Mentions / Threads / TikTok comments (scopes/APIs לא מאושרים)
- Story replies / Ad-level comments / Reputation Dashboard מלא

---

## Session 7 — Conversation Intelligence (תלוי בנתונים מ-Session 6)

תלוי ב-Session 6 פרוס + ≥חודש של תגובות ב-DB.

| # | פיצ'ר | קבצים |
|---|---|---|
| 7.1 | Memory per Commenter (privacy-safe: author_id hash + counts) | migration 032, `apps/api/src/services/commenter-memory.ts` |
| 7.2 | Escalation Personality Matrix (5 modes per-sentiment) | עדכון `triageComment` prompts |
| 7.3 | Reply Outcome Learning (thread sentiment trajectory + variants A/B) | `apps/api/src/services/reply-learning.ts`, cron יומי |
| 7.4 | Cross-Tenant Author Reputation | migration 033 (global hash table), `apps/api/src/services/author-reputation.ts` |
| 7.5 | Sentiment Shift Detection per Thread | `apps/api/src/services/thread-sentiment.ts` |
| 7.6 | Reply Attribution → ROI + Time-of-Day rules | חיבור Shopify webhook → comments, business_hours ב-`social_settings` |

---

## Session 5 — Polish & Edge ✅ הושלם

הפיצ'רים שמרגישים "פוסט-לאנץ'" אבל קריטיים לאמינות.

| # | פיצ'ר | קבצים |
|---|---|---|
| 5.1 | Periodic re-attestation (quarterly cron) | `apps/api/src/workers/re-attestation.ts` + cron |
| 5.2 | Pre-publish cooling-off (1 שעה ל-high-stakes) | עדכון `social-publisher.ts`, migration 028 (publish_queue) |
| 5.3 | Industry compliance gates (medical/financial/kids/food) | `apps/api/src/services/industry-gates.ts` |
| 5.4 | Kill Switch admin UI | `apps/web/app/admin/kill-switch/page.tsx`, `apps/api/src/routes/admin.ts` |
| 5.5 | Explainability Layer (reason logs מוצגים) | `apps/web/app/dashboard/AuditTab.tsx`, `apps/api/src/routes/audit.ts` |
| 5.6 | Stop Loss customer termination | `apps/api/src/services/stop-loss.ts`, integrate עם Trust Tier |

---

## Cross-Session Dependencies

- 2.x תלוי ב-1.x (Session 1 חייב להיות פרוס).
- 3.2 (Trust Tier) משמש ב-4.6 (Two-Key) וב-5.6 (Stop Loss).
- 4.5 (Geographic) משלים את 1.2 (Classifier).
- 5.4 (Kill Switch) צריך את audit logs של 1.3 + 1.4.
- 6.5 (Brand voice replies) תלוי ב-3.4 (brand_voice_profile).
- 6.4 (toxicity gate) משתמש ב-policy-classifier מ-1.2.

**סדר ריצה:** 1 → 2 → 3 → 4 → 6 → 5.

## Items שדורשים לא-קוד

- **עו"ד** — ToS draft שיוקם ב-Session 2.6 דורש review משפטי לפני go-live.
- **E&O Insurance** — לא קוד, אבל trigger אופרטיבי מ-$1M ARR או 100+ לקוחות פעילים.
- **App Review** של Meta/TikTok יוכל לכלול את שכבת ה-AI disclosure כ-proof of compliance.

## Status

- Session 1: ✅ Done (2026-05-28)
- Session 2: ✅ Done (2026-05-28)
- Session 3: ✅ Done (2026-05-28)
- Session 4: ✅ Done (2026-05-28)
- Session 6: ✅ Done (2026-05-28)
- Session 5: ✅ Done (2026-05-28)
- Wire-ups + UI exposure: ✅ Done (2026-05-28)
- Session 7: pending (after 1 month data accumulation)

**סדר חדש:** 1 → 2 → 3 → 4 → 6 → 7 → 5.
