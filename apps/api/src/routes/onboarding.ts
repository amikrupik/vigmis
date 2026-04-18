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

// ── AI prompts & helpers ──────────────────────────────────────────────────────

const ONBOARDING_SYSTEM_PROMPT = `You are the Vigmis onboarding assistant — an AI marketing manager conducting a friendly intake interview.

Your job: gather the client's advertising needs through a natural conversation. Default language is English. If the client writes in Hebrew, switch to Hebrew and stay in Hebrew for the rest of the conversation.

You MUST cover these 7 topics before concluding:
1. website — the client's website URL (e.g. https://example.com). Ask for it at the start.
2. budget — monthly advertising budget. Ask for a number. Accept any currency, convert to ILS mentally (1 USD ≈ 3.7 ILS).
3. management_percentage — what percentage of the budget should Vigmis manage (10%, 25%, 50%, or 100%). Explain briefly: "Vigmis takes a fee only on the portion it manages."
4. goal — what counts as success: leads (form/call), purchases, traffic, or brand awareness.
5. geography — which cities/regions/countries to target AND which to exclude.
6. exclusions — what the system must NEVER do: audiences to avoid, topics, tone, legal constraints.
7. open_notes — any other important rules (business hours, seasonal pauses, dayparting, etc.).

Rules:
- Ask ONE question at a time. Keep it short and conversational.
- Start by asking for their website URL.
- If an answer is vague, ask a natural follow-up to clarify.
- Mirror the client's language exactly.
- When all 7 topics are clearly answered, output a SUMMARY block (exact format, always in English for parsing):

[SUMMARY]
{
  "website_url": "https://example.com",
  "budget_monthly_ils": 10000,
  "management_percentage": 50,
  "goal": "leads",
  "geo_include": ["Jerusalem", "Tel Aviv"],
  "geo_exclude": ["tourists", "under 25"],
  "exclusions": "Never mention prices. Avoid secular tone.",
  "open_notes": "Closed Friday 16:00 to Saturday night.",
  "risk_level": "balanced",
  "dayparting_rules": [
    { "day": 5, "start_hour": 16, "end_hour": 23 }
  ]
}
[/SUMMARY]

Only output the SUMMARY block when all 7 topics are covered.`;

const TOPIC_KEYWORDS: Record<string, string[]> = {
  website:               ['website_url'],
  budget:                ['budget_monthly_ils'],
  management_percentage: ['management_percentage'],
  goal:                  ['goal'],
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
  website_url: z.string().url().optional(),
  management_percentage: z.number().int().min(1).max(100).default(100),
  budget_monthly_ils: z.number().int().positive(),
  goal: z.enum(['leads', 'purchases', 'traffic', 'awareness']),
  geo_include: z.array(z.string()).min(1),
  geo_exclude: z.array(z.string()).default([]),
  exclusions: z.string().optional(),
  open_notes: z.string().optional(),
  risk_level: z.enum(['conservative', 'balanced', 'aggressive']).default('balanced'),
  dayparting_rules: z.array(DaypartingRuleSchema).default([]),
  strategy_plan: z.record(z.unknown()).optional(),
  conversation: z.array(ConversationMessageSchema),
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

      const data = result.data;
      const { error } = await db.from('client_settings').upsert(
        {
          tenant_id: request.tenantId,
          ...data,
          confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id' },
      );

      if (error) {
        request.log.error({ error }, 'Failed to save client settings');
        return reply.code(500).send({ error: 'Failed to save settings' });
      }

      // Audit log
      await db.from('audit_log').insert({
        tenant_id: request.tenantId,
        action: 'onboarding.completed',
        actor: 'user',
        payload: { goal: data.goal, budget_monthly_ils: data.budget_monthly_ils },
      });

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

    const [websiteResult, historical, metaTokenRow] = await Promise.all([
      // Website scan
      (async () => {
        try {
          const res = await fetch(settings.website_url, {
            headers: { 'User-Agent': 'Vigmis/1.0 (Marketing Analysis)' },
            signal: AbortSignal.timeout(10000),
          });
          const html = await res.text();
          const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 6000);
          const analysis = await route({
            task: 'analysis',
            prompt: `Analyze this website content and extract:\n1. What they sell / service they offer\n2. Target audience\n3. Unique selling proposition\n4. Tone and brand voice\n5. Key products/services\n\nWebsite content:\n${text}`,
            systemPrompt: 'You are a marketing analyst. Be concise. Respond in English.',
            options: { maxTokens: 600 },
          });
          return analysis.output;
        } catch { return 'Website could not be scanned.'; }
      })(),
      // Historical data from connected platforms
      getAllHistoricalData(request.tenantId),
      // Meta token for Ad Library competitor search
      db.from('platform_tokens').select('access_token').eq('tenant_id', request.tenantId).eq('platform', 'meta').maybeSingle(),
    ]);

    websiteAnalysis = websiteResult;

    // Fetch competitor ads using Meta Ad Library
    const metaToken = metaTokenRow.data?.access_token ? decryptToken(metaTokenRow.data.access_token) : undefined;
    const competitorAds = await fetchCompetitorAds(settings.website_url, settings.geo_include ?? [], metaToken);

    // Build historical context string for AI prompts
    const historicalContext = buildHistoricalContext(historical);

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
      prompt: `You are a senior media planner and honest business advisor. Based on the data below, produce a complete campaign strategy with a detailed budget advisory section.

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
      "Landing page conversion rate is the key variable — a weak page will waste budget",
      "Competition in this niche is high — expect the lower end of the CPC range"
    ],
    "platform_exclusions": [
      { "platform": "tiktok", "reason": "Target audience is 45+ — TikTok reach in this demographic is minimal" }
    ]
  }
}`,
      systemPrompt: 'You are a senior media planner and honest business advisor. Return only valid JSON, no extra text.',
      options: { maxTokens: 1400, temperature: 0.3 },
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
