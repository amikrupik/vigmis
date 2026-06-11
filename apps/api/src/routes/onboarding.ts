// POST /onboarding/settings  — save confirmed onboarding data
// GET  /onboarding/status    — return what's complete for this tenant
// POST /onboarding/chat      — AI intake interview message
// POST /onboarding/analyze   — full website + market + strategy analysis

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, decryptToken } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { route } from '@vigmis/ai-router';
import { getAllHistoricalData, fetchCompetitorAds } from '../services/historical.js';
import { scrapeWebsite } from '../services/website-scraper.js';
import { captureApprovalSnapshot } from '../services/approval-snapshot.js';
import { refreshBrandVoiceForTenant } from '../services/brand-voice.js';
import { extractCreativeBrief, saveCreativeBrief } from '../services/creative-brief.js';
import { auditConversionReadiness } from '../services/conversion-readiness.js';
import { getIndustryBenchmarks } from '../services/benchmark-aggregator.js';
import { getWinningThemes } from '../services/creative-performance.js';

// ── AI prompts & helpers ──────────────────────────────────────────────────────

// Content policy — categories blocked at MVP. Refusal is final, no exceptions.
const CONTENT_POLICY_BLOCKED = [
  {
    category: 'firearms',
    keywords: ['firearm', ' gun ', 'guns', 'weapon', 'ammunition', 'ammo', 'rifle', 'pistol', 'handgun', 'shotgun', 'bump stock', 'ghost gun', 'suppressor', 'silencer', 'holster', 'nra', 'gun shop', 'gun store', 'firearms safety', 'gun accessories', 'נשק', 'אקדח', 'רובה', 'תחמושת', 'נשק חם', 'ירי', 'כלי ירייה'],
    refusal_he: 'תודה שפנית ל-Vigmis. לצערנו, אנחנו לא יכולים לעבוד עם עסקים בתחום הנשק, האביזרים, התחמושת, או הדרכות ירי — גם אם העסק חוקי לחלוטין. פלטפורמות הפרסום הגדולות (Meta, Google) אוסרות קמפיינים בקטגוריה זו, מה שמונע מאיתנו לספק שירות אפקטיבי. מאחלים לך הצלחה.',
    refusal_en: "Thank you for reaching out to Vigmis. Unfortunately, we're unable to work with firearms, weapons, ammunition, or related businesses — even when fully legal. Major advertising platforms (Meta, Google) have categorical restrictions on this category that make it impossible for us to run effective campaigns. We wish you the best.",
  },
  {
    category: 'illegal_drugs',
    keywords: ['cocaine', 'heroin', 'methamphetamine', ' meth ', 'fentanyl', 'crack cocaine', 'drug dealing', 'drug sales', 'illegal drug', 'סמים', 'קוקאין', 'הרואין', 'מתאמפטמין', 'פנטניל', 'סחר בסמים'],
    refusal_he: 'תודה שפנית ל-Vigmis. לצערנו, לא נוכל לעבוד עם עסקים בתחום סמים לא חוקיים. מאחלים לך הצלחה.',
    refusal_en: "Thank you for reaching out. Vigmis doesn't work with businesses in the illegal drugs category. We wish you the best.",
  },
  {
    category: 'unauthorized_pharma',
    keywords: ['unlicensed pharmacy', 'fake medicine', 'unregistered medication', 'unapproved drug', 'cures cancer', 'guaranteed cure', 'miracle cure', 'reverses diabetes', 'eliminate disease', 'תרופה ללא רישוי', 'תרופת פלא', 'מרפא סרטן', 'ריפוי מובטח', 'בית מרקחת לא מורשה'],
    refusal_he: 'תודה שפנית ל-Vigmis. לא נוכל לעבוד עם עסקים שמוכרים תרופות ללא רישיון רגולטורי, או שעושים טענות ריפוי לא מוכחות. מאחלים לך הצלחה.',
    refusal_en: "Thank you for reaching out. Vigmis doesn't work with unlicensed pharmaceutical businesses or products making unverified medical cure claims. We wish you the best.",
  },
  {
    category: 'pyramid_scheme',
    keywords: ['pyramid scheme', 'ponzi', 'multi-level marketing', 'mlm recruitment', 'get rich quick', 'make money fast', 'guaranteed passive income', 'recruit members', 'downline', 'פירמידה', 'שיווק רב-שלבי', 'להתעשר מהר', 'הכנסה פסיבית מובטחת', 'גיוס חברים'],
    refusal_he: 'תודה שפנית ל-Vigmis. לא נוכל לעבוד עם עסקים בתחום פירמידות מכירה, שיווק רב-שלבי עם דגש על גיוס, או הבטחות להתעשרות מהירה. מאחלים לך הצלחה.',
    refusal_en: "Thank you for reaching out. Vigmis doesn't work with pyramid schemes, recruitment-focused MLM businesses, or get-rich-quick programs. We wish you the best.",
  },
  {
    category: 'gambling',
    keywords: ['online casino', 'sports betting', 'poker site', 'gambling site', 'casino online', 'bet365', 'betway', 'hizna', 'קזינו אונליין', 'הימורים', 'ספורט בט', 'ניחושי ספורט'],
    refusal_he: 'תודה שפנית ל-Vigmis. לא נוכל לעבוד עם אתרי הימורים, קזינו, או הגרלות בשלב זה — קטגוריה זו דורשת רישיון רגולטורי שאין ברשותנו. מאחלים לך הצלחה.',
    refusal_en: "Thank you for reaching out. Vigmis is currently unable to work with gambling, online casinos, or sports betting sites — this category requires regulatory licensing we don't currently hold. We wish you the best.",
  },
  {
    category: 'hate_incitement',
    keywords: ['hate group', 'white supremacist', 'neo-nazi', 'extremist group', 'terrorist', 'incitement to violence', 'anti-semitic', 'racism promotion', 'הסתה', 'גזענות', 'לאומנות קיצונית', 'קנאות דתית אלימה'],
    refusal_he: 'תודה שפנית ל-Vigmis. לא נוכל לעבוד עם תוכן זה. מאחלים לך הצלחה.',
    refusal_en: "Thank you for reaching out. We're unable to work with this type of content. We wish you the best.",
  },
] as const;

function detectContentPolicy(allMessages: string[]): { blocked: boolean; category?: string; refusal_he?: string; refusal_en?: string } {
  const combined = allMessages.join(' ').toLowerCase();
  for (const policy of CONTENT_POLICY_BLOCKED) {
    if (policy.keywords.some(kw => combined.includes(kw.toLowerCase()))) {
      return { blocked: true, category: policy.category, refusal_he: policy.refusal_he, refusal_en: policy.refusal_en };
    }
  }
  return { blocked: false };
}

const ONBOARDING_SYSTEM_PROMPT_BASE = `You are the Vigmis onboarding assistant — an AI marketing manager conducting a friendly intake interview.

Your job: gather the client's advertising needs through a natural conversation. Default language is English. If the client writes in Hebrew, switch to Hebrew and stay in Hebrew for the rest of the conversation.

## CONTENT POLICY — IMMEDIATE STOP (check FIRST before anything else)
If the business falls into any blocked category, respond ONLY with the refusal below. Do NOT continue onboarding.
Blocked categories: firearms / weapons / ammunition (even legal), illegal drugs, unlicensed medications with cure claims, pyramid schemes / MLM recruitment, online gambling/casinos, hate speech / incitement.
Refusal format (Hebrew): "תודה שפנית ל-Vigmis. לצערנו, אנחנו לא יכולים לעבוד עם עסקים בתחום [קטגוריה]. [סיבה]. מאחלים לך הצלחה."
Refusal format (English): "Thank you for reaching out to Vigmis. Unfortunately, we don't work with businesses in [category]. [Reason]. We wish you the best."
The refusal is FINAL — do not offer alternatives, exceptions, or reviews.

## TOPICS TO COVER
You MUST cover these topics before concluding:
1. business_type — what type of business: "ecommerce" (online store with many products), "hero_product" (one flagship product drives most revenue), "lead_gen" (generates leads/inquiries), "saas" (software subscription), or "general_store" (brick & mortar / local service). Ask this FIRST.
   DISAMBIGUATION RULE: If the client's FIRST message already implies business type (e.g., "online clothing store" = ecommerce; "I sell one product" = hero_product; "dental clinic" = lead_gen; "SaaS platform" = saas), DO NOT ask them to confirm or re-classify. Infer from context and move on. Only ask explicitly if the type is genuinely ambiguous after reading their message.
2. website — the client's website URL. If they have no website yet: say "No problem — describe your business in 2-3 sentences: what you sell and who your ideal customer is." Store that description in open_notes as "Business description (manual): [text]". Set website_url to null.
3. budget — monthly advertising budget.
   CURRENCY RULES:
   - User says "₪X" or "X שקל/שקלים" → ILS, accept directly, confirm: "Got it — ₪X/month."
   - User says "$X" or "X dollars" → USD, accept directly. Confirm in USD only (not ILS): "Got it — $X/month." Store as budget_monthly_ils = X * 3.7 internally.
   - User provides a bare number with no currency symbol (e.g., "5000" or "my budget is 5000") → ALWAYS ask: "Is that ILS (₪), USD ($), or another currency?" — never assume, never proceed without clarification.
   MINIMUM BUDGET WARNING: If budget_monthly_ils < 500 (≈ $135), warn ONCE: "Note: a budget under ₪500/month may produce limited results. We recommend at least ₪500 for any measurable ad performance. You can still continue if you wish." Then proceed.
4. management_percentage — what percentage of the budget should Vigmis manage. Accept any number 1–100. Explain briefly: "Vigmis takes a fee only on the portion it manages."
5. goal — what counts as success: leads (form/call), purchases, traffic, or brand awareness.
6. margin_pct — ONLY if goal is "purchases" AND business_type is "ecommerce" or "hero_product": ask "What is your gross margin percentage?" Skip for lead_gen, saas, general_store, or non-purchase goals.
7. hero_product — ONLY if business_type is "hero_product": ask for the flagship product name and its specific margin if different.
8. geography — which cities/regions/countries to target AND which to exclude.
9. exclusions — what the system must NEVER do: audiences to avoid, topics, tone, legal constraints, ad scheduling rules.
10. open_notes — any other important rules (business hours, seasonal pauses, product details, pricing, etc.).

## RULES
- Ask ONE question at a time. Keep it short and conversational.
- Mirror the client's language exactly (Hebrew in → Hebrew out, English in → English out).
- Skip margin_pct for goal="traffic" or "awareness", or business_type="lead_gen" or "saas" or "general_store".
- Skip hero_product unless business_type is "hero_product".
- Do NOT re-ask about topics already confirmed (check the state tracker below).
- Do NOT ask "any other rules?" repeatedly. One closing check is enough, then conclude.
- When all required topics are confirmed, output the [SUMMARY] block immediately.

## SUMMARY FORMAT (always in English for parsing, even if conversation is Hebrew)
[SUMMARY]
{
  "business_type": "ecommerce",
  "website_url": "https://example.com",
  "budget_monthly_ils": 10000,
  "management_percentage": 50,
  "goal": "purchases",
  "margin_pct": 45,
  "hero_product_name": null,
  "hero_product_margin_pct": null,
  "geo_include": ["Jerusalem", "Tel Aviv"],
  "geo_exclude": ["tourists", "under 25"],
  "exclusions": "Never mention prices. Avoid secular tone.",
  "open_notes": "Closed Friday 16:00 to Saturday night.",
  "preferred_platforms": null,
  "risk_level": "balanced",
  "dayparting_rules": []
}
[/SUMMARY]`;

const TOPIC_KEYWORDS: Record<string, string[]> = {
  business_type:         ['business_type'],
  website:               ['website_url'],
  budget:                ['budget_monthly_ils'],
  management_percentage: ['management_percentage'],
  goal:                  ['goal'],
  margin_pct:            ['margin_pct'],
  hero_product:          ['hero_product_name'],
  geography:             ['geo_include', 'geo_exclude'],
  exclusions:            ['exclusions'],
  open_notes:            ['open_notes', 'dayparting_rules'],
};

function extractSummary(text: string): object | null {
  const match = text.match(/\[SUMMARY\]([\s\S]*?)\[\/SUMMARY\]/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch { return null; }
}

function detectCoveredTopicsFromSummary(settings: any, existing: string[]): string[] {
  if (!settings) return existing;
  const covered = new Set(existing);
  for (const [topic, keys] of Object.entries(TOPIC_KEYWORDS)) {
    if (keys.some(k => k in settings && settings[k] !== undefined && settings[k] !== null)) covered.add(topic);
  }
  return Array.from(covered);
}

// Incrementally detect covered topics from each AI turn — no SUMMARY needed.
// Detects from user message content (what was provided) + AI response (what was confirmed).
// Patterns are intentionally loose — false positives are cheaper than missed detections.
function detectCoveredTopicsIncremental(aiResponse: string, userMessage: string, existing: string[]): string[] {
  const covered = new Set(existing);
  const combined = (aiResponse + ' ' + userMessage);
  const lc = combined.toLowerCase();
  const userLc = userMessage.toLowerCase();

  // business_type: any description of business category in either direction
  if (!covered.has('business_type') && /ecommerce|hero.?product|lead.?gen|saas|general.?store|local service|local business|חנות|מוצר|שירות|קורס|קליניקה|מרפאה|סוכנות|מסעדה|ליד|ecom|b2b|b2c|software|app|platform/.test(lc)) {
    covered.add('business_type');
  }

  // website: URL or explicit "no website" confirmation
  if (!covered.has('website') && (
    /https?:\/\/[^\s'"]{4,}/.test(combined) ||
    /no website|don.t have a (website|site)|אין לי אתר|בלי אתר/.test(lc)
  )) {
    covered.add('website');
  }

  // budget: any currency amount (₪, $, NIS, ILS, USD, shekels, dollars) or confirmed bare number
  if (!covered.has('budget') && (
    /₪\s*\d[\d,]+|\d[\d,]+\s*₪/.test(combined) ||
    /\$\s*\d[\d,]+/.test(combined) ||
    /\d[\d,]+\s*(nis|ils|usd|shekels?|dollars?|שקל|שקלים|דולר|דולרים)/.test(lc) ||
    /תקציב.{0,30}\d|\d.{0,10}(לחודש|per month|\/month|a month)/.test(lc) ||
    /budget.{0,30}\d/.test(lc)
  )) {
    covered.add('budget');
  }

  // management_percentage: any standalone percentage when budget is already covered (answer to "what % should Vigmis manage?")
  // Also catch explicit percentage in AI confirmation
  if (!covered.has('management_percentage') && (
    (/\d+\s*%/.test(userMessage) && covered.has('budget')) ||
    /vigmis.{0,20}manage.{0,20}\d+%|\d+%.{0,20}manage|vigmis.{0,10}ינהל/.test(lc) ||
    /manage.{0,10}\d+%|\d+%.{0,10}of.{0,10}budget/.test(lc)
  )) {
    covered.add('management_percentage');
  }

  // goal: any goal keyword in user message (natural answer to "what counts as success?")
  if (!covered.has('goal') && /\b(leads?|purchases?|traffic|awareness|sales?|demo|sign.?ups?|conversions?|לידים|רכישות|מכירות|תנועה|מודעות|הגשות)\b/.test(lc)) {
    covered.add('goal');
  }

  // margin_pct: percentage + margin keyword, only relevant for purchase/ecommerce goals
  if (!covered.has('margin_pct') && /(\d+)%.{0,30}(margin|gross|profit|מרג.ין|רווח)|(margin|gross|profit|מרג.ין|רווח).{0,30}(\d+)%/.test(lc)) {
    covered.add('margin_pct');
  }

  // hero_product: product name mentioned when business_type is hero_product (covered in AI's response)
  if (!covered.has('hero_product') && /\b(backright|hero.?product|flagship|מוצר מוביל|המוצר הראשי|מוצר יחיד).{0,60}\b/.test(lc)) {
    covered.add('hero_product');
  }

  // geography: any country, major city, or geographic scope in user message
  if (!covered.has('geography') && /\b(israel|usa|us|uk|england|europe|canada|australia|germany|france|worldwide|global|international|ישראל|ארה.ב|אמריקה|אירופה|תל.?אביב|ירושלים|חיפה|אנגליה|גרמניה|צרפת|עולמי|בינלאומי|north america|south america|middle east|המזרח התיכון)\b/.test(userLc)) {
    covered.add('geography');
  }

  // exclusions: any prohibition or constraint in user message ("don't", "never", "avoid", "לא ל", "אסור")
  if (!covered.has('exclusions') && /לא ל|לעולם לא|אסור|להימנע מ|אל תציג|לא לפרסם|never |don.t |avoid |no (men|wom|chi|reli|pol|rac)|exclude|forbidden|prohibited|no (?:ads?|targeting)/.test(userMessage)) {
    covered.add('exclusions');
  }

  // open_notes: business hours, seasonal, holidays, or any catch-all note after all other topics
  if (!covered.has('open_notes') && (
    /שבת|חגים|ראש השנה|פסח|יום כיפור|חנוכה|christmas|holiday|שעות פעילות|לא לפרסם ב|seasonal|schedule|daypart|business hours/.test(userLc) ||
    covered.size >= 7  // safety: if 7+ topics covered, treat next message as open_notes catch-all
  )) {
    covered.add('open_notes');
  }

  return Array.from(covered);
}

function detectCoveredTopics(settings: any, aiResponse: string, userMessage: string, existing: string[]): string[] {
  // First: incremental detection from this turn's messages
  const afterIncremental = detectCoveredTopicsIncremental(aiResponse, userMessage, existing);
  // Then: if we have a complete SUMMARY, use it to fill in anything missed
  return detectCoveredTopicsFromSummary(settings, afterIncremental);
}

// Build dynamic system prompt with current topics state injected
function buildOnboardingSystemPrompt(coveredTopics: string[]): string {
  const requiredBase = ['business_type', 'website', 'budget', 'management_percentage', 'goal', 'geography', 'exclusions', 'open_notes'];
  const remaining = requiredBase.filter(t => !coveredTopics.includes(t));
  const allDone = remaining.length === 0;

  const stateBlock = coveredTopics.length === 0
    ? '\n\n## CONVERSATION STATE\nNo topics confirmed yet. Start by asking about business_type.'
    : `\n\n## CONVERSATION STATE (updated each turn — do NOT re-ask confirmed topics)
Topics confirmed: ${coveredTopics.join(', ')}
Topics still needed: ${allDone ? 'NONE — ALL COMPLETE ✅' : remaining.join(', ')}
${allDone ? '\n⚡ ALL REQUIRED TOPICS ARE COVERED. Your NEXT response MUST output the [SUMMARY] JSON block, then a brief friendly closing line. Do NOT ask any more questions.' : ''}`;

  return ONBOARDING_SYSTEM_PROMPT_BASE + stateBlock;
}

const DaypartingRuleSchema = z.object({
  day: z.number().int().min(0).max(6),
  start_hour: z.number().int().min(0).max(23),
  end_hour: z.number().int().min(0).max(23),
});

const ConversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.string(),
});

const SaveSettingsSchema = z.object({
  business_type: z.enum(['ecommerce', 'hero_product', 'lead_gen', 'saas', 'general_store']).default('ecommerce'),
  website_url: z.preprocess(v => (v === '' ? undefined : v), z.string().url().optional()),
  management_percentage: z.number().min(1).max(100).default(100).transform(v => Math.round(v)),
  budget_monthly_ils: z.number().positive().transform(v => Math.round(v)),
  goal: z.enum(['leads', 'purchases', 'traffic', 'awareness']),
  margin_pct: z.number().min(0).max(100).optional().nullable(),
  hero_product_name: z.string().optional().nullable(),
  hero_product_margin_pct: z.number().min(0).max(100).optional().nullable(),
  geo_include: z.array(z.string()).default([]),
  geo_exclude: z.array(z.string()).default([]),
  exclusions: z.string().optional().nullable(),
  open_notes: z.string().optional().nullable(),
  risk_level: z.enum(['conservative', 'balanced', 'aggressive']).default('balanced'),
  dayparting_rules: z.array(DaypartingRuleSchema).default([]),
  strategy_plan: z.record(z.unknown()).optional(),
  website_analysis: z.string().optional(),
  conversation: z.array(ConversationMessageSchema),
  social_opt_in: z.object({
    enabled: z.boolean(),
    platforms: z.array(z.enum(['facebook', 'instagram', 'tiktok'])),
    approval_mode: z.enum(['auto', 'review', 'strict']),
    content_pillars: z.array(z.string()).optional(),
  }).optional(),
});

function buildHistoricalContext(historical: Record<string, any>): string {
  const parts: string[] = [];
  for (const [platform, data] of Object.entries(historical)) {
    if (!data) continue;
    const m = data.metrics_30d;
    const campaignNames = (data.campaigns ?? []).slice(0, 5).map((c: any) => c.name).join(', ');
    const keywords = (data.keywords ?? []).slice(0, 5).map((k: any) => k.text).join(', ');
    const audiences = (data.top_audiences ?? []).slice(0, 3).join(', ');
    parts.push(
      `${platform.toUpperCase()} (last 30 days): ` +
      `Spend $${m.spend_usd}, ${m.impressions.toLocaleString()} impressions, ${m.clicks.toLocaleString()} clicks, ` +
      `CTR ${m.ctr}%, avg CPC $${m.avg_cpc_usd}, ${m.conversions} conversions` +
      (m.roas ? `, ROAS ${m.roas}x` : '') +
      (campaignNames ? `. Campaigns: ${campaignNames}` : '') +
      (keywords ? `. Top keywords: ${keywords}` : '') +
      (audiences ? `. Audiences: ${audiences}` : ''),
    );
  }
  return parts.join('\n');
}

export async function onboardingRoutes(app: FastifyInstance) {
  // Save confirmed onboarding settings
  app.post(
    '/onboarding/settings',
    { preHandler: authenticate },
    async (request, reply) => {
      const result = SaveSettingsSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: 'Validation error', details: result.error.flatten() });
      }

      // Attestation gate — onboarding cannot complete without the master attestations.
      // The frontend Continue button records these; if they're absent something is off.
      const { data: attests } = await db
        .from('content_attestations')
        .select('attestation_kind')
        .eq('tenant_id', request.tenantId)
        .in('attestation_kind', ['onboarding_master', 'tos_acceptance', 'ai_disclosure_consent']);
      const have = new Set((attests ?? []).map((a: { attestation_kind: string }) => a.attestation_kind));
      const missing = ['onboarding_master', 'tos_acceptance', 'ai_disclosure_consent'].filter(k => !have.has(k));
      if (missing.length > 0) {
        return reply.code(412).send({
          error: 'attestation_required',
          missing,
          message: 'Please confirm the consent statements on the previous step before continuing.',
        });
      }

      const data = result.data;
      const { error } = await db.from('client_settings').upsert(
        {
          tenant_id: request.tenantId,
          ...data,
          margin_pct:              data.margin_pct ?? null,
          hero_product_name:       data.hero_product_name ?? null,
          hero_product_margin_pct: data.hero_product_margin_pct ?? null,
          website_analysis:        data.website_analysis ?? null,
          confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id' },
      );

      if (error) {
        request.log.error({ error }, 'Failed to save client settings');
        return reply.code(500).send({ error: 'Failed to save settings' });
      }

      // Create/update social_settings if opted in
      if (data.social_opt_in?.enabled && data.social_opt_in.platforms.length > 0) {
        const platformConfig = data.social_opt_in.platforms.map(p => ({
          platform: p,
          enabled: true,
          page_id: null,
        }));
        await db.from('social_settings').upsert(
          {
            tenant_id: request.tenantId,
            enabled: true,
            platforms: platformConfig,
            approval_mode: data.social_opt_in.approval_mode,
            content_pillars: data.social_opt_in.content_pillars ?? [
              'educational', 'promotional', 'social_proof', 'behind_the_scenes', 'trending',
            ],
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id' },
        );
      } else if (data.social_opt_in && !data.social_opt_in.enabled) {
        // Explicitly opted out — ensure disabled
        await db.from('social_settings').upsert(
          { tenant_id: request.tenantId, enabled: false, updated_at: new Date().toISOString() },
          { onConflict: 'tenant_id' },
        );
      }

      // Forensic snapshot of the complete onboarding submission. This is what the
      // customer is going on record as having approved — strategy plan, budget,
      // geo, exclusions, social opt-in, the works.
      await captureApprovalSnapshot({
        tenantId: request.tenantId,
        clerkUserId: request.clerkUserId,
        subjectKind: 'onboarding',
        contentSnapshot: data,
        approvalMethod: 'web_click',
        clientIp: request.ip ?? null,
        userAgent: (request.headers['user-agent'] as string | undefined) ?? null,
      }).catch((err) => {
        request.log.error({ err }, 'onboarding approval snapshot failed; continuing');
      });

      // Audit log
      await db.from('audit_log').insert({
        tenant_id: request.tenantId,
        action: 'onboarding.completed',
        actor: 'user',
        payload: {
          goal: data.goal,
          budget_monthly_ils: data.budget_monthly_ils,
          social_enabled: data.social_opt_in?.enabled ?? false,
          social_platforms: data.social_opt_in?.platforms ?? [],
        },
      });

      // Fire GEO audit in background — non-blocking
      if (data.website_url) {
        const { runGeoAuditForTenant } = await import('./geo.js');
        runGeoAuditForTenant(request.tenantId, data.website_url).catch(err => { request.log.error({ err }, 'background geo audit failed'); });
      }

      // ── Background: brand voice + creative brief extraction + conversion readiness
      // Non-blocking — onboarding can finish before these complete. If they
      // fail, the customer can re-run from dashboard.
      const tenantId = request.tenantId;
      (async () => {
        try {
          await refreshBrandVoiceForTenant(tenantId);
        } catch (err) { request.log.error({ err }, 'background brand voice extract failed'); }
      })();

      (async () => {
        try {
          const brief = await extractCreativeBrief({
            websiteAnalysis: data.website_analysis ?? null,
            businessGoal: data.goal,
            heroProductName: data.hero_product_name ?? undefined,
            productMarginPct: data.hero_product_margin_pct ?? data.margin_pct ?? null,
          });
          if (brief) {
            await saveCreativeBrief(tenantId, brief, { isDefault: true });
          }
        } catch (err) { request.log.error({ err }, 'background creative brief extract failed'); }
      })();

      if (data.website_url) {
        (async () => {
          try {
            await auditConversionReadiness({
              tenantId,
              websiteUrl: data.website_url!,
              goal: data.goal,
            });
          } catch (err) { request.log.error({ err }, 'background readiness audit failed'); }
        })();
      }

      return reply.code(201).send({ success: true });
    },
  );

  // ── AI intake chat ───────────────────────────────────────────────────────────
  app.post('/onboarding/chat', { preHandler: authenticate }, async (request, reply) => {
    const { history = [], message, coveredTopics = [] } = request.body as any;
    if (!message?.trim()) return reply.code(400).send({ error: 'message required' });

    // Content policy pre-check: scan full conversation history + current message
    const allUserMessages = [
      ...(history as any[]).filter((m: any) => m.role === 'user').map((m: any) => m.content),
      message,
    ];
    const policyCheck = detectContentPolicy(allUserMessages);
    if (policyCheck.blocked) {
      // Detect language from history: if any message contains Hebrew, use Hebrew refusal
      const allText = allUserMessages.join(' ');
      const isHebrew = /[֐-׿]/.test(allText);
      const refusal = isHebrew ? policyCheck.refusal_he! : policyCheck.refusal_en!;
      return reply.send({
        message: refusal,
        coveredTopics: [],
        settings: null,
        blocked: true,
        blockedCategory: policyCheck.category,
      });
    }

    const messages = [
      ...(history as any[]).map((m: any) => `${m.role === 'user' ? 'Client' : 'Vigmis'}: ${m.content}`),
      `Client: ${message}`,
    ].join('\n\n');

    // Build dynamic system prompt with current topics state
    const systemPrompt = buildOnboardingSystemPrompt(coveredTopics as string[]);

    let response;
    try {
      response = await route({
        task: 'analysis',
        prompt: messages,
        systemPrompt,
        options: { maxTokens: 800, temperature: 0.6 },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.send({
        message: `AI error: ${msg}. Please try again.`,
        coveredTopics,
        settings: null,
      });
    }

    const aiMessage = response.output;
    const settings = extractSummary(aiMessage);
    const newCoveredTopics = detectCoveredTopics(settings, aiMessage, message as string, coveredTopics as string[]);
    const visibleMessage = aiMessage.replace(/\[SUMMARY\][\s\S]*?\[\/SUMMARY\]/g, '').trim();

    return reply.send({
      message: visibleMessage || (settings ? 'Great! Here is your summary.' : aiMessage),
      coveredTopics: newCoveredTopics,
      settings,
    });
  });

  // ── Full analysis pipeline ────────────────────────────────────────────────
  app.post('/onboarding/analyze', { preHandler: authenticate }, async (request, reply) => {
    const { settings, feedback } = request.body as any;
    if (!settings) return reply.code(400).send({ error: 'settings required' });

    // Phase 1: Website scan + historical data + competitor ads (in parallel)
    let websiteAnalysis = 'Website could not be scanned.';
    type ScrapedSiteResult = Awaited<ReturnType<typeof scrapeWebsite>>;
    let scrapedSite: ScrapedSiteResult = null;

    const [websiteResult, historical, metaTokenRow, connectedPlatformsRow] = await Promise.all([
      // Website scan — real multi-page + JSON-LD extraction
      (async () => {
        try {
          scrapedSite = await scrapeWebsite(settings.website_url);
          if (!scrapedSite || !scrapedSite.confident) {
            // Honesty gate: refuse to confabulate. The strategy step will see this and surface it.
            return `UNABLE_TO_READ_WEBSITE: scraped ${scrapedSite?.pagesCrawled.length ?? 0} page(s) but could not extract enough business signal. The site may be JavaScript-rendered, login-gated, or blocking bots. Vigmis will not invent a description — ask the client to clarify what they sell.`;
          }
          const productSummary = scrapedSite.jsonLdProducts.length
            ? `\n\nProducts found in site schema:\n${scrapedSite.jsonLdProducts.slice(0, 8).map((p: any) => `- ${[p.name, p.brand, p.category, p.price ? '$' + p.price : null].filter(Boolean).join(' | ')}`).join('\n')}`
            : '';
          const analysis = await route({
            task: 'analysis',
            prompt: `You are a senior marketing analyst doing a deep pre-campaign audit of a website. Extract everything relevant to building a high-performance ad campaign.

Site URL: ${scrapedSite.url}
Pages crawled: ${scrapedSite.pagesCrawled.join(', ')}${productSummary}

Website content:
${scrapedSite.text.slice(0, 10000)}

Analyze and provide:
1. WHAT THEY SELL — specific products/services, pricing if visible, product range
2. TARGET CUSTOMER — who are they selling to? (demographics, lifestyle, needs)
3. POSITIONING & USP — what makes them different? what claims do they make? what's the value proposition?
4. BRAND VOICE — tone (professional/casual/luxurious/urgent?), personality, trust signals present (reviews, certifications, guarantees?)
5. CONVERSION ARCHITECTURE — what is the primary CTA? what's the funnel? is there an offer, discount, or lead magnet?
6. STRENGTHS — what works well on this site as a foundation for ads?
7. WEAKNESSES / RISKS — what's missing that could hurt ad performance? (no pricing, weak CTA, generic copy, no social proof?)
8. AD HOOKS — 3 specific message angles visible in the website content that could become strong ad hooks

CRITICAL: Only describe what is actually in the content. Do NOT invent products or claims not present.`,
            systemPrompt: 'You are a senior marketing analyst. Be precise, specific, and commercially sharp. Your analysis feeds directly into campaign strategy.',
            options: { maxTokens: 1500 },
          });
          return analysis.output;
        } catch (err) {
          return `Website could not be scanned: ${err instanceof Error ? err.message : 'unknown error'}`;
        }
      })(),
      // Historical data from connected platforms
      getAllHistoricalData(request.tenantId),
      // Meta token for Ad Library competitor search
      db.from('platform_tokens').select('access_token').eq('tenant_id', request.tenantId).eq('platform', 'meta').maybeSingle(),
      // All connected platforms for budget allocation guidance
      db.from('platform_tokens').select('platform').eq('tenant_id', request.tenantId),
    ]);

    websiteAnalysis = websiteResult;

    // If website couldn't be scraped, try to fall back to open_notes business description.
    // Hard-fail only if we have nothing to work with.
    if (websiteAnalysis.startsWith('UNABLE_TO_READ_WEBSITE')) {
      const manualDesc = [settings.open_notes, settings.exclusions]
        .filter(Boolean)
        .join('\n')
        .trim();

      if (manualDesc.length >= 30) {
        // Use manual description as a substitute for website analysis
        websiteAnalysis = `[MANUAL DESCRIPTION — website could not be scanned]\n\nBusiness type: ${settings.business_type ?? 'not specified'}\nGoal: ${settings.goal ?? 'not specified'}\n\nClient-provided description:\n${manualDesc}\n\n⚠️ Note: This strategy is based on the client's own description, not a live website scan. Quality depends on the completeness of the description. Treat all claims about the business as client-stated, not independently verified.`;
      } else {
        return reply.code(422).send({
          error: 'website_unreadable',
          message: 'Vigmis could not read enough content from the website to build a strategy. This usually means the site is JavaScript-rendered, behind a login, or blocking bots. Please describe what you sell in the chat so Vigmis can proceed.',
          scraped_pages: (scrapedSite as ScrapedSiteResult)?.pagesCrawled ?? [],
        });
      }
    }

    // Fetch competitor ads using Meta Ad Library
    const metaToken = metaTokenRow.data?.access_token ? decryptToken(metaTokenRow.data.access_token) : undefined;
    const competitorAds = await fetchCompetitorAds(settings.website_url, settings.geo_include ?? [], metaToken);

    // Build historical context string for AI prompts
    const historicalContext = buildHistoricalContext(historical);

    // Build connected platforms list for budget allocation guidance
    const connectedPlatformNames: string[] = (connectedPlatformsRow.data ?? []).map((r: { platform: string }) => r.platform);
    // If the client expressed a preference (e.g. "only Meta"), filter to that subset
    const preferredPlatforms: string[] | null = settings.preferred_platforms?.length
      ? connectedPlatformNames.filter(p => settings.preferred_platforms!.some((pref: string) => p.toLowerCase().includes(pref.toLowerCase()) || pref.toLowerCase().includes(p.toLowerCase())))
      : null;
    const activePlatforms = preferredPlatforms?.length ? preferredPlatforms : connectedPlatformNames;
    const connectedPlatformsNote = activePlatforms.length > 0
      ? `CONNECTED PLATFORMS (use ONLY these for budget allocation): ${activePlatforms.join(', ')}${preferredPlatforms ? `\nCLIENT PREFERENCE: The client explicitly asked to focus on ${activePlatforms.join(', ')} only. Do NOT include other platforms even if connected.` : '\nIMPORTANT: Only recommend budget allocation for platforms that are connected. If a platform is NOT in the list above, briefly mention it as an opportunity.'}`
      : `CONNECTED PLATFORMS: none yet\nIMPORTANT: The client has not connected any ad platforms yet. Do not include any platform in the budget breakdown. Focus on which platform to connect first and why.`;

    // Phase 2: Market research — deep strategic intelligence
    const managedBudget = Math.round(
      (settings.budget_monthly_ils / 3.7) * (settings.management_percentage / 100),
    );

    // Fetch industry benchmarks + winning creative themes in parallel with web research
    const countryCode = ((settings.geo_include ?? [])[0] ?? 'IL').toUpperCase().slice(0, 2);
    const [metaBenchmarks, googleBenchmarks, winningThemes] = await Promise.all([
      getIndustryBenchmarks({ industry: settings.business_type ?? 'ecommerce', platform: 'meta', countryCode, goal: settings.goal ?? 'purchases' }),
      getIndustryBenchmarks({ industry: settings.business_type ?? 'ecommerce', platform: 'google', countryCode, goal: settings.goal ?? 'purchases' }),
      getWinningThemes(request.tenantId),
    ]);

    const benchmarkContext = [metaBenchmarks, googleBenchmarks].filter(Boolean).join('\n');

    // Phase 2a: Perplexity web research — real-time competitive intelligence
    // Runs BEFORE Claude analysis so Claude has live market data, not just training knowledge
    const geoStr = (settings.geo_include ?? []).join(', ') || 'global';
    let webIntelligence = '';
    try {
      const webRes = await route({
        task: 'web_research',
        prompt: `Research the advertising landscape for ${settings.business_type ?? 'a business'} targeting ${geoStr}. I need:
1. Who are the main competitors advertising online in this space right now?
2. What ad messaging angles dominate in this category? (specific examples if possible)
3. Realistic CPC and CPM benchmarks for this industry/geography on Meta and Google (2025-2026)
4. What are the top customer pain points and purchase triggers for this product/service category?
5. Any recent market trends, seasonal patterns, or shifts in consumer behavior?

Business context: ${websiteAnalysis.slice(0, 400)}
Goal: ${settings.goal} | Budget: ~$${managedBudget}/month`,
        options: { maxTokens: 1200 },
      });
      webIntelligence = webRes.output;

      // Save research with timestamp for audit trail and future refresh logic
      await db.from('market_research_snapshots').insert({
        tenant_id: request.tenantId,
        query_type: 'strategy_research',
        query: `${settings.business_type ?? 'business'} in ${geoStr}`,
        raw_findings: webRes.output,
      });
    } catch {
      // Perplexity failure is non-blocking — Claude proceeds with training knowledge
    }

    const research = await route({
      task: 'market_research',
      prompt: `You are a senior strategic planner at a world-class digital agency. You are doing deep pre-campaign research for a new client. Your research directly feeds the campaign strategy — be specific, sharp, and commercially honest.

## BUSINESS PROFILE
${websiteAnalysis}

## PARAMETERS
- Advertising goal: ${settings.goal}
- Target geography: ${(settings.geo_include ?? []).join(', ') || 'not specified'}
- Monthly ad budget: ~$${managedBudget}/month
- Business type: ${settings.business_type ?? 'not specified'}
${settings.margin_pct ? `- Gross margin: ${settings.margin_pct}%` : ''}
${settings.exclusions ? `- Client constraints: ${settings.exclusions}` : ''}
${webIntelligence ? `\n## REAL-TIME WEB INTELLIGENCE (from live web search — use this as ground truth for market data)\n${webIntelligence}\n` : ''}
${benchmarkContext ? `\n## INDUSTRY BENCHMARKS (use these as realistic targets, not generic guesses)\n${benchmarkContext}\n` : ''}
${winningThemes ? `\n## ${winningThemes}\n` : ''}
${historicalContext ? `\n## CLIENT'S HISTORICAL AD PERFORMANCE\n${historicalContext}` : ''}
${competitorAds ? `\n## COMPETITOR ADS RUNNING RIGHT NOW (Meta Ad Library)\n${competitorAds}` : ''}

## YOUR RESEARCH MUST COVER ALL OF THE FOLLOWING:

### 1. COMPETITIVE LANDSCAPE
- Who are the main competitors in this space in ${(settings.geo_include ?? []).join(', ') || 'this market'}?
- What positioning strategies do they use? (price leader / quality / speed / lifestyle / niche?)
- What messaging angles are dominant in competitor ads right now?
- Where is there a positioning gap this business could own?
- What creative formats dominate this category?

### 2. CUSTOMER INTELLIGENCE
- Precise ideal customer profile: demographics AND psychographics (lifestyle, values, status signals, media consumption)
- Purchase trigger: what changes in the customer's life before they start looking for this product/service?
- Top 3 objections BEFORE purchase — be specific to this business, not generic
- What social proof format matters most to them? (number reviews, before/after, specific credentials, peer testimonials?)
- Awareness stage: are they problem-aware, solution-aware, or product-aware? This determines the right ad angle.
- Where do they spend time online and what do they trust?

### 3. MARKET DYNAMICS
- Estimated CPC range for this goal/geography combination (be specific — e.g. "$1.20–$2.80 for Meta lead gen in Israel")
- Competitive intensity assessment: low/medium/high — and what that means for creative aggressiveness
- Is this a search-intent market (active demand) or discovery market (latent demand)? This determines platform weight.
- Realistic conversion rate benchmark for this industry and goal
- Seasonal patterns or timing considerations
- Estimated addressable audience size: is this a mass market or niche? Does it affect budget ceiling?

### 4. HISTORICAL PERFORMANCE ANALYSIS (if data available)
- What worked in past campaigns? Specific patterns.
- What clearly failed? Root cause — was it creative, targeting, landing page, or budget?
- What budget level delivered the best efficiency ratio?
- What should NOT be repeated?

### 5. STRATEGIC INTELLIGENCE
- The single most powerful angle this business should lead with in ads
- Their unfair advantage vs. competitors (if any) — what can they credibly claim that others cannot?
- The biggest risk that would cause this campaign to fail (be honest and specific)
- 3 specific creative concepts that would win in this market, based on what you know about this audience

Be sharp, specific, and commercially honest. Avoid generic marketing clichés.`,
      systemPrompt: 'You are a senior strategic planner at a world-class digital agency. Your research must be specific, sharp, and commercially grounded. Generic output is unacceptable.',
      options: { maxTokens: 2500 },
    });
    const marketResearch = research.output;

    // Phase 3: Strategy generation
    const strategyRes = await route({
      task: 'analysis',
      prompt: `You are a senior media planner and Chief Strategy Officer at a world-class agency. A new client has come to you. Based on the deep research below, produce a COMPLETE, SPECIFIC strategic plan — not generic frameworks, but the real strategic thinking a $50M agency would deliver: the WHY behind every decision, the WHO with psychological precision, the HOW with specific execution steps, and what's at stake.

## BUSINESS ANALYSIS
${websiteAnalysis}

## MARKET RESEARCH & COMPETITIVE INTELLIGENCE
${marketResearch}

${historicalContext ? `## CLIENT'S HISTORICAL AD PERFORMANCE\n${historicalContext}\n` : ''}

PARAMETERS:
- Goal: ${settings.goal}
- Client's stated monthly budget: ~$${managedBudget}
- Target geography: ${(settings.geo_include ?? []).join(', ')}
- Exclusions: ${settings.exclusions ?? 'none'}
- Has parallel campaigns outside Vigmis: ${settings.has_parallel_campaigns ? 'yes' : 'no'}

${connectedPlatformsNote}

PLATFORM SELECTION RULES (apply strictly — do not include platforms that don't fit):
- Google Search: only if there is clear search intent for this product/service
- Google Display: only for retargeting or brand awareness with budget >$500/mo
- Meta (Facebook/Instagram): good for most B2C products, visual goods, 25-55 audience
- LinkedIn: REQUIRED for business_type = "saas" or B2B lead generation targeting professionals, managers, or enterprises. LinkedIn is the primary channel for B2B pipeline in North America and Western Europe — not optional, not a nice-to-have. Include in platforms array with reasoning tied to the specific B2B audience.
- TikTok: ONLY if target audience is under 40 AND product is visual/lifestyle/consumer. Never for B2B, medical, financial, legal, or products targeting 50+ audience.
- If budget is below $300/mo: use maximum 1-2 platforms

BUDGET ADVISORY — think like a CFO + CMO combined. Consider:
- What is the minimum budget to generate enough data to optimize in this market?
- What does the client's budget actually buy (clicks, leads) at the estimated CPC?
- Is there a ceiling where more spend won't help (market saturation, small audience)?
- Is the stated budget too low to work, sufficient, or higher than the efficient ceiling?
- What warnings does this client need to hear (funnel quality, competition, audience size)?
- Assume a realistic landing page conversion rate for this goal/industry (leads: 2-5%, purchases: 1-3%)

CUSTOM BENCHMARKS — this is critical. The optimization engine will use these instead of generic defaults.
Generate realistic performance thresholds for THIS specific business, in THIS market, with THIS goal.
Consider: vertical (B2B vs B2C), country (Israel CPC ≠ US), product price point, competition level, brand recognition, audience size.
For each platform the client will use, set minCtr (underperforming threshold), goodCtr (scale-up threshold), and optionally maxCpc/maxCpa.

SOCIAL MEDIA ORGANIC POSTING — Vigmis can also post organic content (Facebook Page, Instagram, TikTok) on behalf of the client. $1/post (FB/IG) or $3/post (TikTok, includes AI video). Once weekly per platform.
Assess whether this client would benefit, which platforms, and which content pillars.

STRATEGIC DELIVERABLES — write with the depth and specificity of a world-class agency brief:

strategy_narrative: 3 precise paragraphs — (1) the strategic insight and why THIS approach for THIS business, not a generic approach; (2) the exact customer psychographic profile and what moves them to buy; (3) the execution logic and sequencing rationale for THIS market right now. No filler.

competitive_advantage: What can this business credibly claim that competitors cannot? If nothing, say so honestly and explain the implications for creative strategy.

funnel_strategy: What we run at each funnel stage for THIS business. Specific ad formats, messages, audience layers, and the connection between stages.

creative_brief: For EACH platform — specific formats, number of assets needed, 3 message hooks based on the research (name the specific angle: pain point / social proof / transformation / fear of missing out / etc.), CTA, and what makes this creative direction right for THIS audience.

first_30_days: Week-by-week launch plan. What we test first, what signals we look for, what triggers moving to scale.

message_testing_matrix: 4 distinct creative angles to A/B test in the first month. For each: the hypothesis, the hook, the expected audience segment it will resonate with, and what a "win" looks like.

missing_platforms: Platforms NOT connected that would significantly help THIS business — with specific reasoning tied to the research.

${feedback ? `CLIENT FEEDBACK ON PREVIOUS STRATEGY:\n${feedback}\nAdjust accordingly.\n` : ''}

Return ONLY valid JSON (no extra text):
{
  "platforms": [
    { "name": "google", "campaign_types": ["search"], "budget_percentage": 60, "reasoning": "Specific reason based on this business and market data" }
  ],
  "market_insights": "2-3 sharp sentences: what the market looks like, what competitors do, what the real opportunity is",
  "target_audience": "Precise audience: demographics + psychographics + what triggers their purchase",
  "estimated_cpc": "$X.XX - $X.XX",
  "recommendations": "Top 3 specific, actionable recommendations based on research — not generic",
  "past_performance_notes": "Key learnings from client historical campaigns, or null",
  "organic_recommendations": "2-3 specific organic growth actions tied to this business's strengths",
  "competitive_advantage": "What this business can credibly own vs. competitors — or honest assessment if none exists",
  "strategy_narrative": "Paragraph 1: strategic insight and why this approach. Paragraph 2: exact customer psychographic and purchase trigger. Paragraph 3: execution logic and sequencing rationale.",
  "funnel_strategy": {
    "awareness": "Top of funnel: audience, message, format, and what we're trying to do",
    "consideration": "Mid funnel: retargeting who, with what offer, format",
    "conversion": "Bottom funnel: hot audiences, specific offer, urgency mechanic"
  },
  "creative_brief": [
    {
      "platform": "meta",
      "formats": ["video_15s", "single_image"],
      "quantity_images": 3,
      "quantity_videos": 1,
      "hooks": ["Pain point angle: specific hook text", "Social proof angle: specific hook text", "Transformation angle: specific hook text"],
      "cta": "Shop Now",
      "creative_direction": "What visually and tonally makes this creative right for this specific audience"
    }
  ],
  "first_30_days": {
    "week_1": "What we launch, what budget, what we're testing",
    "week_2": "What signals we look for, what we adjust",
    "week_3": "Scale decisions — what threshold triggers scaling vs. pausing",
    "week_4": "Assessment: what's confirmed, what next phase looks like"
  },
  "message_testing_matrix": [
    {
      "angle": "Pain point",
      "hook": "Specific headline/hook text for this business",
      "hypothesis": "This will resonate with X type of customer because Y",
      "target_segment": "Who specifically sees this",
      "win_signal": "CTR > X% or CPA < $Y"
    }
  ],
  "missing_platforms": [
    { "platform": "tiktok", "reason": "Specific reason tied to THIS business and market research", "potential_uplift": "Specific estimate" }
  ],
  "budget_analysis": {
    "verdict": "sufficient",
    "verdict_explanation": "One honest sentence about whether the budget makes sense for this market",
    "minimum_monthly_usd": 300,
    "recommended_learning_usd": 450,
    "recommended_steady_usd": 350,
    "efficiency_ceiling_usd": 800,
    "projected_clicks_monthly": 600,
    "projected_leads_monthly": 15,
    "break_even_conversions": 4,
    "warnings": [
      "Specific warning tied to this business's situation"
    ],
    "platform_exclusions": [
      { "platform": "tiktok", "reason": "Specific reason tied to audience demographics" }
    ]
  },
  "custom_benchmarks": {
    "meta_conversions": {
      "minCtr": 0.006,
      "goodCtr": 0.015,
      "maxCpc": 4.50,
      "maxCpa": 65.00,
      "learningDays": 10,
      "minDataClicks": 30,
      "rationale": "Specific rationale for these thresholds based on vertical/market/goal"
    }
  },
  "social_plan": {
    "recommended": true,
    "rationale": "Specific reason this business benefits from organic social",
    "platforms": [
      { "platform": "facebook", "rationale": "Specific rationale", "cost_usd": 1 },
      { "platform": "instagram", "rationale": "Specific rationale", "cost_usd": 1 }
    ],
    "content_pillars": ["educational", "promotional", "social_proof"],
    "synergy_with_ads": "How organic posts specifically help paid performance for this business",
    "estimated_monthly_cost_usd": 8
  }
}`,
      systemPrompt: 'You are a Chief Strategy Officer at a world-class digital agency. Return only valid JSON, no extra text. Every field must be specific to THIS business — generic placeholder text is unacceptable.',
      options: { maxTokens: 8000, temperature: 0.3 },
    });

    let strategy: object;
    try {
      const jsonMatch = strategyRes.output.match(/\{[\s\S]*\}/);
      strategy = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch { strategy = null as any; }

    if (!strategy) {
      // Fallback: AI response was too large or parse failed. Attempt a leaner retry.
      request.log.warn({ outputLength: strategyRes.output.length }, 'Strategy JSON parse failed — attempting compact retry');
      try {
        const retryRes = await route({
          task: 'analysis',
          prompt: `You are a campaign strategist. Based on this business and market research, return ONLY compact JSON — no extra text.

BUSINESS: ${websiteAnalysis.slice(0, 1500)}
MARKET RESEARCH: ${marketResearch.slice(0, 1500)}
GOAL: ${settings.goal} | BUDGET: ~$${managedBudget}/month | GEO: ${(settings.geo_include ?? []).join(', ')}

Return this exact JSON structure (be concise — max 2 sentences per text field):
{
  "platforms": [{"name":"google","campaign_types":["search"],"budget_percentage":60,"reasoning":"<why>"},{"name":"meta","campaign_types":["conversion"],"budget_percentage":40,"reasoning":"<why>"}],
  "market_insights": "<2 sharp sentences about the market opportunity>",
  "target_audience": "<demographic + psychographic profile>",
  "estimated_cpc": "$X.XX - $X.XX",
  "recommendations": "<top 3 specific actions>",
  "strategy_narrative": "<paragraph 1: strategic insight>\\n\\n<paragraph 2: customer psychographic>\\n\\n<paragraph 3: execution logic>",
  "creative_brief": [{"platform":"meta","formats":["video_15s","single_image"],"quantity_images":3,"quantity_videos":1,"hooks":["<hook 1>","<hook 2>","<hook 3>"],"cta":"Shop Now","creative_direction":"<what makes this right for this audience>"}],
  "budget_analysis": {"verdict":"sufficient","verdict_explanation":"<one honest sentence>","minimum_monthly_usd":${Math.round(managedBudget * 0.6)},"recommended_learning_usd":${Math.round(managedBudget * 1.2)},"recommended_steady_usd":${managedBudget},"efficiency_ceiling_usd":${Math.round(managedBudget * 2.5)},"projected_clicks_monthly":${Math.round(managedBudget / 1.5)},"projected_leads_monthly":${Math.round((managedBudget / 1.5) * 0.03)},"break_even_conversions":3,"warnings":["<specific warning>"],"platform_exclusions":[]},
  "organic_recommendations": "<2 organic growth suggestions>",
  "competitive_advantage": "<what this business can credibly own>"
}`,
          systemPrompt: 'Return only valid JSON. Be concise.',
          options: { maxTokens: 3000, temperature: 0.3 },
        });
        const retryMatch = retryRes.output.match(/\{[\s\S]*\}/);
        strategy = retryMatch ? JSON.parse(retryMatch[0]) : null;
      } catch { strategy = null as any; }
    }

    // Hard fallback if both AI attempts fail
    if (!strategy) {
      const defaultBudget = managedBudget;
      strategy = {
        platforms: [
          { name: 'google', campaign_types: ['search'], budget_percentage: 60, reasoning: 'High intent traffic for your goal' },
          { name: 'meta', campaign_types: ['conversion'], budget_percentage: 40, reasoning: 'Audience targeting and remarketing' },
        ],
        market_insights: marketResearch.slice(0, 800),
        target_audience: (settings.geo_include ?? []).join(', '),
        estimated_cpc: '$0.50 - $2.00',
        recommendations: 'Start with search, monitor CPC closely, scale what converts.',
        strategy_narrative: 'Strategy is being refined. The research phase completed successfully — full narrative will be available after the first optimization cycle.',
        creative_brief: [],
        budget_analysis: {
          verdict: 'sufficient',
          verdict_explanation: 'Budget appears workable for this market — monitor CPC in the first two weeks.',
          minimum_monthly_usd: Math.round(defaultBudget * 0.6),
          recommended_learning_usd: Math.round(defaultBudget * 1.2),
          recommended_steady_usd: defaultBudget,
          efficiency_ceiling_usd: Math.round(defaultBudget * 2.5),
          projected_clicks_monthly: Math.round(defaultBudget / 1.5),
          projected_leads_monthly: Math.round((defaultBudget / 1.5) * 0.03),
          break_even_conversions: 3,
          warnings: ['Actual CPC and conversion rate will be refined after the first 2 weeks of data.'],
          platform_exclusions: [],
        },
      };
    }

    return reply.send({ websiteAnalysis, marketResearch, strategy });
  });

  // ── Website quick understanding check ────────────────────────────────────────
  app.post('/onboarding/website-check', { preHandler: authenticate }, async (request, reply) => {
    const { website_url } = request.body as any;
    if (!website_url) return reply.code(400).send({ error: 'website_url required' });

    let websiteText = '';
    try {
      const res = await fetch(website_url, {
        headers: { 'User-Agent': 'Vigmis/1.0 (Marketing Analysis)' },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();
      websiteText = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000);
    } catch {
      return reply.send({
        adequate: false,
        summary: null,
        unclear: ['Website could not be loaded — please check the URL is correct and publicly accessible.'],
      });
    }

    if (websiteText.length < 100) {
      return reply.send({
        adequate: false,
        summary: null,
        unclear: ['The website appears to be empty or blocked. We could not read its content.'],
      });
    }

    const aiRes = await route({
      task: 'cheap_task',
      prompt: `You are a marketing analyst reviewing a business website for onboarding into an ad management platform.

Website content:
"${websiteText.slice(0, 4000)}"

Your task: extract what this business does and assess if there is enough information to build an ad campaign.

Respond ONLY with valid JSON:
{
  "adequate": true | false,
  "what_they_sell": "<one clear sentence: what product/service they offer>",
  "hero_product": "<the main/flagship product or service, or null if unclear>",
  "target_audience": "<who is the customer, or null if unclear>",
  "brand_voice": "<formal/casual/luxury/aggressive/friendly — based on site language>",
  "unclear": ["<question 1 if something important is missing>", "<question 2>"],
  "summary": "<2-3 sentence summary of what Vigmis understands about this business — written as if telling the client what you understood>"
}

Rules:
- adequate = false if: what they sell is unclear, no products/services mentioned, site is a login page / coming soon / error
- unclear array: list only what's genuinely missing and needed for ads. Empty array if everything is clear.
- Write summary and what_they_sell in the same language as the website content`,
      options: { maxTokens: 500, temperature: 0.3 },
    });

    try {
      const parsed = JSON.parse(aiRes.output);
      return reply.send(parsed);
    } catch {
      return reply.send({
        adequate: false,
        summary: null,
        unclear: ['Could not analyze the website content. Please add more details in the chat.'],
      });
    }
  });

  // ── Strategy discussion — Vigmis gives honest opinion on client's proposed changes ──
  app.post('/onboarding/discuss', { preHandler: authenticate }, async (request, reply) => {
    const { strategy, clientRequest, settings } = request.body as any;
    if (!strategy || !clientRequest) return reply.code(400).send({ error: 'strategy and clientRequest required' });

    const managedBudget = settings
      ? Math.round((settings.budget_monthly_ils / 3.7) * (settings.management_percentage / 100))
      : null;

    const res = await route({
      task: 'analysis',
      prompt: `You are Vigmis — an honest and direct marketing advisor. A client has reviewed your campaign strategy and wants to make changes.

CURRENT STRATEGY SUMMARY:
- Platforms: ${(strategy.platforms ?? []).map((p: any) => `${p.name} (${p.budget_percentage}%)`).join(', ')}
- Budget advisory verdict: ${strategy.budget_analysis?.verdict ?? 'unknown'}
- Recommended budget: $${strategy.budget_analysis?.recommended_steady_usd ?? managedBudget}/mo
- Estimated CPC: ${strategy.estimated_cpc ?? 'unknown'}

CLIENT'S REQUESTED CHANGES:
"${clientRequest}"

Your job: respond honestly and directly.
- If you agree with the client's changes: say so clearly and explain why it makes sense.
- If you partially agree: say which parts you agree with and which you don't, and why.
- If you disagree: explain your concern clearly and specifically. Don't be vague. Don't just say "it depends".
- Always end by acknowledging that the final decision is theirs. You will update the plan according to their decision.
- Be concise. 3-5 sentences max. Don't lecture. Don't repeat the strategy back to them.
- Write as a trusted advisor, not as a salesperson or a yes-man.`,
      systemPrompt: 'You are Vigmis, an honest marketing advisor. Be direct and concise.',
      options: { maxTokens: 400, temperature: 0.5 },
    });

    return reply.send({ response: res.output });
  });

  // ── Strategy viewer ──────────────────────────────────────────────────────────
  // Read-only access to the current strategy + the audit trail of optimization changes.
  app.get('/onboarding/strategy', { preHandler: authenticate }, async (request, reply) => {
    const [settingsRes, auditRes] = await Promise.all([
      db.from('client_settings')
        .select('strategy_plan, website_analysis, website_url, goal, budget_monthly_ils, management_percentage, geo_include, geo_exclude, exclusions, open_notes, confirmed_at, updated_at, business_type, margin_pct, hero_product_name')
        .eq('tenant_id', request.tenantId)
        .maybeSingle(),
      db.from('audit_log')
        .select('id, action, platform, actor, payload, created_at')
        .eq('tenant_id', request.tenantId)
        .in('action', [
          'onboarding.completed',
          'optimization.scale_up', 'optimization.scale_down', 'optimization.pause', 'optimization.resume',
          'optimization.alert', 'optimization.needs_targeting_review', 'optimization.creative_fatigue',
          'optimization.campaign_stagnant', 'optimization.benchmark_recalibrated',
          'strategy.updated', 'strategy.recalibrated',
        ])
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    return reply.send({
      settings: settingsRes.data ?? null,
      history: auditRes.data ?? [],
    });
  });

  // Return onboarding + connection status
  app.get(
    '/onboarding/status',
    { preHandler: authenticate },
    async (request, reply) => {
      const [settingsRes, tokensRes] = await Promise.all([
        db
          .from('client_settings')
          .select('confirmed_at, goal, budget_monthly_ils, risk_level, management_percentage, website_url')
          .eq('tenant_id', request.tenantId)
          .maybeSingle(),
        db
          .from('platform_tokens')
          .select('platform, expires_at')
          .eq('tenant_id', request.tenantId),
      ]);

      const connected = {
        google: false,
        meta: false,
        tiktok: false,
      };

      for (const token of tokensRes.data ?? []) {
        const valid = token.expires_at ? new Date(token.expires_at) > new Date() : true;
        if (valid && token.platform in connected) {
          connected[token.platform as keyof typeof connected] = true;
        }
      }

      return reply.send({
        onboardingComplete: !!settingsRes.data?.confirmed_at,
        settings: settingsRes.data ?? null,
        connected,
      });
    },
  );
}
