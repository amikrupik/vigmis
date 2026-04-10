// POST /onboarding/settings  — save confirmed onboarding data
// GET  /onboarding/status    — return what's complete for this tenant
// POST /onboarding/chat      — AI intake interview message
// POST /onboarding/analyze   — full website + market + strategy analysis

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { route } from '@vigmis/ai-router';

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

    // Phase 1: Website scan
    let websiteAnalysis = 'Website could not be scanned.';
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
      websiteAnalysis = analysis.output;
    } catch { /* use default */ }

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
- Business context: ${websiteAnalysis.slice(0, 1000)}

Provide: 1) Estimated CPC range 2) Top competitor tactics 3) Best ad formats for this goal 4) Key audience insights 5) Seasonality considerations. Be specific and actionable.`,
      systemPrompt: 'You are a digital marketing strategist. Be data-driven and specific.',
      options: { maxTokens: 800 },
    });
    const marketResearch = research.output;

    // Phase 3: Strategy generation
    const strategyRes = await route({
      task: 'analysis',
      prompt: `Based on this data, generate a campaign strategy plan:

BUSINESS:
${websiteAnalysis.slice(0, 800)}

MARKET RESEARCH:
${marketResearch.slice(0, 800)}

PARAMETERS:
- Goal: ${settings.goal}
- Monthly managed budget: ~$${managedBudget}
- Target: ${(settings.geo_include ?? []).join(', ')}
- Exclusions: ${settings.exclusions ?? ''}

Available platforms: google, meta, tiktok. Include only platforms that make strategic sense for this business and goal. TikTok is highly effective for audiences under 40 and visually-driven products.

${feedback ? `CLIENT FEEDBACK ON PREVIOUS STRATEGY:\n${feedback}\nAdjust the strategy accordingly.\n` : ''}
Return ONLY valid JSON:
{
  "platforms": [
    { "name": "google", "campaign_types": ["search"], "budget_percentage": 50, "reasoning": "..." },
    { "name": "meta", "campaign_types": ["conversion"], "budget_percentage": 30, "reasoning": "..." },
    { "name": "tiktok", "campaign_types": ["in-feed"], "budget_percentage": 20, "reasoning": "..." }
  ],
  "market_insights": "2-3 sentence summary",
  "target_audience": "Specific audience description",
  "estimated_cpc": "$X.XX - $X.XX",
  "recommendations": "Top 3 actionable recommendations"
}`,
      systemPrompt: 'You are a senior media planner. Return only valid JSON, no extra text.',
      options: { maxTokens: 1000, temperature: 0.3 },
    });

    let strategy: object;
    try {
      const jsonMatch = strategyRes.output.match(/\{[\s\S]*\}/);
      strategy = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch { strategy = null as any; }

    if (!strategy) {
      strategy = {
        platforms: [
          { name: 'google', campaign_types: ['search'], budget_percentage: 50, reasoning: 'High intent traffic for your goal' },
          { name: 'meta', campaign_types: ['conversion'], budget_percentage: 30, reasoning: 'Audience targeting and remarketing' },
          { name: 'tiktok', campaign_types: ['in-feed'], budget_percentage: 20, reasoning: 'Reach younger audiences with engaging short-form video' },
        ],
        market_insights: marketResearch.slice(0, 200),
        target_audience: (settings.geo_include ?? []).join(', '),
        estimated_cpc: '$0.50 - $2.00',
        recommendations: 'Start with search and social, monitor CPC, scale what works.',
      };
    }

    return reply.send({ websiteAnalysis, marketResearch, strategy });
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
