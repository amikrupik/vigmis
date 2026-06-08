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

// ── AI prompts & helpers ──────────────────────────────────────────────────────

const ONBOARDING_SYSTEM_PROMPT = `You are the Vigmis onboarding assistant — an AI marketing manager conducting a friendly intake interview.

Your job: gather the client's advertising needs through a natural conversation. Default language is English. If the client writes in Hebrew, switch to Hebrew and stay in Hebrew for the rest of the conversation.

You MUST cover these 10 topics before concluding:
1. business_type — what type of business: "ecommerce" (online store with many products), "hero_product" (one flagship product drives most revenue), "lead_gen" (generates leads/inquiries), "saas" (software subscription), or "general_store" (brick & mortar / local service). Ask this FIRST.
2. website — the client's website URL (e.g. https://example.com).
3. budget — monthly advertising budget. Accept any currency, convert to ILS mentally (1 USD ≈ 3.7 ILS).
4. management_percentage — what percentage of the budget should Vigmis manage (10%, 25%, 50%, or 100%). Explain briefly: "Vigmis takes a fee only on the portion it manages."
5. goal — what counts as success: leads (form/call), purchases, traffic, or brand awareness.
6. margin_pct — ONLY if goal is "purchases" or business_type is "ecommerce" or "hero_product": ask "What is your gross margin percentage? (e.g. if you sell for $100 and product costs $40, margin is 60%)". This lets Vigmis calculate your actual profit, not just revenue.
7. hero_product — ONLY if business_type is "hero_product": ask for the name of their flagship product and its specific margin if different from overall margin.
8. geography — which cities/regions/countries to target AND which to exclude.
9. exclusions — what the system must NEVER do: audiences to avoid, topics, tone, legal constraints.
10. open_notes — any other important rules (business hours, seasonal pauses, dayparting, etc.).
11. preferred_platforms — ONLY ask this if the client has multiple platforms connected. Ask: "Do you want to advertise on all connected platforms, or focus on just one for now?" Capture their answer. If they say only one platform (e.g. "just Meta", "only Google"), record it. If they're fine with all, leave it null.

Rules:
- Ask ONE question at a time. Keep it short and conversational.
- Start by asking what type of business they are (topic 1).
- Skip margin_pct if goal is "traffic" or "awareness" AND business_type is "lead_gen" or "saas" or "general_store".
- Skip hero_product unless business_type is "hero_product".
- If an answer is vague, ask a natural follow-up to clarify.
- Mirror the client's language exactly.
- When all required topics are clearly answered, output a SUMMARY block (exact format, always in English for parsing):

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
  "preferred_platforms": ["meta"],
  "risk_level": "balanced",
  "dayparting_rules": [
    { "day": 5, "start_hour": 16, "end_hour": 23 }
  ]
}
[/SUMMARY]

Only output the SUMMARY block when all required topics are covered.`;

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

function detectCoveredTopics(settings: any, existing: string[]): string[] {
  if (!settings) return existing;
  const covered = new Set(existing);
  for (const [topic, keys] of Object.entries(TOPIC_KEYWORDS)) {
    if (keys.some(k => k in settings && settings[k] !== undefined)) covered.add(topic);
  }
  return Array.from(covered);
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

    const messages = [
      ...(history as any[]).map((m: any) => `${m.role === 'user' ? 'Client' : 'Vigmis'}: ${m.content}`),
      `Client: ${message}`,
    ].join('\n\n');

    let response;
    try {
      response = await route({
        task: 'analysis',
        prompt: messages,
        systemPrompt: ONBOARDING_SYSTEM_PROMPT,
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
    const newCoveredTopics = detectCoveredTopics(settings, coveredTopics);
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
            prompt: `Analyze this website content and extract:
1. What they sell / service they offer — be SPECIFIC. Name the actual products if visible.
2. Target audience
3. Unique selling proposition
4. Tone and brand voice
5. Key products / services

IMPORTANT: if the content does not clearly describe what the business sells, say so explicitly. Do NOT guess from generic words. Do NOT make up products. Only describe what is actually in the content below.

Site URL: ${scrapedSite.url}
Pages crawled: ${scrapedSite.pagesCrawled.join(', ')}${productSummary}

Website content:
${scrapedSite.text.slice(0, 8000)}`,
            systemPrompt: 'You are a marketing analyst. Be precise and literal — never invent products or claims. If the site is unclear, say so.',
            options: { maxTokens: 700 },
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

    // Surface scrape failure as a hard error to the client — don't pretend we built a strategy on nothing.
    if (websiteAnalysis.startsWith('UNABLE_TO_READ_WEBSITE')) {
      return reply.code(422).send({
        error: 'website_unreadable',
        message: 'Vigmis could not read enough content from the website to build a strategy. This usually means the site is JavaScript-rendered, behind a login, or blocking bots. Please describe what you sell in the chat so Vigmis can proceed.',
        scraped_pages: (scrapedSite as ScrapedSiteResult)?.pagesCrawled ?? [],
      });
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

    // Phase 2: Market research
    const managedBudget = Math.round(
      (settings.budget_monthly_ils / 3.7) * (settings.management_percentage / 100),
    );
    const research = await route({
      task: 'market_research',
      prompt: `Do focused market research for a business with these parameters:
- Goal: ${settings.goal}
- Target geography: ${(settings.geo_include ?? []).join(', ')}
- Exclude: ${(settings.geo_exclude ?? []).join(', ')}
- Budget: ~$${managedBudget}/month
- Business context: ${websiteAnalysis.slice(0, 800)}
${historicalContext ? `\nCLIENT'S HISTORICAL AD PERFORMANCE:\n${historicalContext}` : ''}
${competitorAds ? `\nCOMPETITOR ADS RUNNING RIGHT NOW (Facebook Ad Library):\n${competitorAds}` : ''}

Provide: 1) Estimated CPC range 2) What competitors are doing and how to differentiate 3) Best ad formats for this goal 4) Key audience insights based on history and market 5) What worked vs what didn't in past campaigns. Be specific and actionable.`,
      systemPrompt: 'You are a digital marketing strategist. Be data-driven and specific.',
      options: { maxTokens: 900 },
    });
    const marketResearch = research.output;

    // Phase 3: Strategy generation
    const strategyRes = await route({
      task: 'analysis',
      prompt: `You are a senior media planner and honest business advisor at a world-class agency. A new client has come to you. Based on the data below, produce a COMPLETE strategic plan — not just budget numbers, but the full strategic thinking a professional agency would deliver: why, who, how, with what creative, and what's missing.

BUSINESS:
${websiteAnalysis.slice(0, 600)}

MARKET RESEARCH & COMPETITOR INSIGHTS:
${marketResearch.slice(0, 700)}

${historicalContext ? `CLIENT'S HISTORICAL AD PERFORMANCE (learn from it):\n${historicalContext.slice(0, 500)}\n` : ''}

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

STRATEGIC NARRATIVE — write the full agency-level strategy:
- strategy_narrative: 3 paragraphs explaining the STRATEGIC LOGIC: (1) what problem we're solving / why this approach, (2) exactly who we're targeting and their psychographic profile, (3) how we'll execute and why this sequence makes sense for THIS business right now. Be specific, not generic.
- funnel_strategy: describe what we do at each funnel stage for THIS business (awareness / consideration / conversion). Include specific ad formats and messages for each stage.
- creative_brief: for EACH platform we're using — what creatives to produce: formats (video_15s, image_carousel, single_image, story), how many images/videos, 3 specific message hooks (angles the ads will use), and the CTA. Be specific to this business, not generic.
- missing_platforms: if there are platforms NOT connected that would significantly help this specific business (e.g. TikTok for youth fashion, YouTube for high-ticket products, Google for high search-intent products), list them with the specific reason and estimated uplift. Do NOT list platforms that aren't relevant.

${feedback ? `CLIENT FEEDBACK ON PREVIOUS STRATEGY:\n${feedback}\nAdjust accordingly.\n` : ''}

Return ONLY valid JSON (no extra text):
{
  "platforms": [
    { "name": "google", "campaign_types": ["search"], "budget_percentage": 60, "reasoning": "Specific reason based on this business and market data" }
  ],
  "market_insights": "2-3 sentences including what competitors are doing and market dynamics",
  "target_audience": "Specific audience description based on analysis",
  "estimated_cpc": "$X.XX - $X.XX",
  "recommendations": "Top 3 actionable recommendations based on history and market",
  "past_performance_notes": "Key learnings from client historical campaigns, or null",
  "organic_recommendations": "2-3 specific organic growth actions to complement and reduce ad dependency",
  "strategy_narrative": "Paragraph 1: the strategic logic and why this approach. Paragraph 2: who exactly we are targeting and their psychographic profile. Paragraph 3: how we execute and the sequencing rationale.",
  "funnel_strategy": {
    "awareness": "What we run at top of funnel, to whom, with what message and format",
    "consideration": "What we run at mid funnel, retargeting whom, with what offer",
    "conversion": "Bottom funnel — hot audiences, specific offer, urgency mechanic"
  },
  "creative_brief": [
    {
      "platform": "meta",
      "formats": ["video_15s", "single_image"],
      "quantity_images": 3,
      "quantity_videos": 1,
      "hooks": ["Pain point angle: ...", "Social proof angle: ...", "Benefit angle: ..."],
      "cta": "Shop Now"
    }
  ],
  "missing_platforms": [
    { "platform": "tiktok", "reason": "Your target demographic 18-28 spends 3+ hours/day on TikTok. Competitors are not yet active there — first-mover advantage.", "potential_uplift": "~35% more reach at lower CPM than Meta" }
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
      "Landing page conversion rate is the key variable — a weak page will waste budget"
    ],
    "platform_exclusions": [
      { "platform": "tiktok", "reason": "Target audience is 45+ — TikTok reach in this demographic is minimal" }
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
      "rationale": "B2B professional services in Israel. Small addressable audience means lower raw CTR is acceptable."
    }
  },
  "social_plan": {
    "recommended": true,
    "rationale": "This business has a visual product well-suited to Instagram.",
    "platforms": [
      { "platform": "facebook", "rationale": "Local reach and community trust", "cost_usd": 1 },
      { "platform": "instagram", "rationale": "Visual product showcase, 25-40 demographic", "cost_usd": 1 }
    ],
    "content_pillars": ["educational", "promotional", "social_proof"],
    "synergy_with_ads": "Organic posts warm up cold audiences so paid retargeting converts at lower CPA.",
    "estimated_monthly_cost_usd": 8
  }
}`,
      systemPrompt: 'You are a senior media planner and honest business advisor. Return only valid JSON, no extra text.',
      options: { maxTokens: 2200, temperature: 0.3 },
    });

    let strategy: object;
    try {
      const jsonMatch = strategyRes.output.match(/\{[\s\S]*\}/);
      strategy = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch { strategy = null as any; }

    if (!strategy) {
      const defaultBudget = managedBudget;
      strategy = {
        platforms: [
          { name: 'google', campaign_types: ['search'], budget_percentage: 60, reasoning: 'High intent traffic for your goal' },
          { name: 'meta', campaign_types: ['conversion'], budget_percentage: 40, reasoning: 'Audience targeting and remarketing' },
        ],
        market_insights: marketResearch.slice(0, 200),
        target_audience: (settings.geo_include ?? []).join(', '),
        estimated_cpc: '$0.50 - $2.00',
        recommendations: 'Start with search, monitor CPC closely, scale what converts.',
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
