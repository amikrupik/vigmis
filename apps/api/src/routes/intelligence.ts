// POST /intelligence/ad-copy            — AI generates ad copy variations
// POST /intelligence/score-creative     — AI scores a creative brief 0-100
// POST /intelligence/audiences          — AI discovers audience segments
// POST /intelligence/territory          — Auto-detect territory + benchmarks + events
// GET  /intelligence/competitors        — Facebook Ad Library (stub, activates when Meta connected)
// GET  /intelligence/weekly-strategy    — Get latest Strategic Brain weekly analysis
// POST /intelligence/weekly-strategy/run — Trigger Strategic Brain run (manual or cron)

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { assertCronSecret } from '../middleware/secrets.js';
import { route } from '@vigmis/ai-router';
import { assertSafeUrl } from '../services/website-scraper.js';
import { createMetaAdSet } from '@vigmis/ad-connectors';
import { analyzeCreativeThemesForTenant } from '../services/creative-theme-insights.js';
import { runStrategicBrain, getWeeklyStrategy } from '../services/strategic-brain.js';
import { runPortfolioAllocatorForAll } from '../optimization/portfolio-allocator.js';
import { runOutcomeTracker } from '../optimization/outcome-tracker.js';
import { updateDataMaturityForAll } from '../services/data-maturity.js';

export async function intelligenceRoutes(app: FastifyInstance) {

  // ── Ad Copy Generator ────────────────────────────────────────────────────────
  app.post('/intelligence/ad-copy', { preHandler: authenticate }, async (request, reply) => {
    const { platform, goal, websiteContext, tone, territory, language, strategyContext } = request.body as any;

    const lang = language ?? 'English';
    const platformKey = (platform ?? 'google') as string;

    const platformInstructions = {
      google: `PLATFORM: Google RSA (Responsive Search Ads)
FORMAT PER VARIATION:
- headline_1: max 30 chars — match search intent, include product keyword
- headline_2: max 30 chars — unique advantage or differentiator
- headline_3: max 30 chars — CTA or social proof
- description_1: max 90 chars — expand main benefit, mention specific product detail
- description_2: max 90 chars — address main objection + action prompt
- sitelinks: array of 4 {title: max 25 chars, desc: max 35 chars}
MINDSET: People searched for something specific. Your headline must match what they typed.`,
      meta: `PLATFORM: Meta (Facebook/Instagram Feed)
FORMAT PER VARIATION:
- body: max 125 chars — scroll-stopping first line, emotional hook
- headline_1: max 40 chars — benefit-led, not clever-led
- description_1: max 30 chars — reinforce or CTA
- cta: button label (Shop Now / Learn More / Get Offer / etc.)
MINDSET: People were NOT searching. You interrupted their scroll. Earn their attention in 1.5 seconds.`,
      tiktok: `PLATFORM: TikTok
FORMAT PER VARIATION:
- hook: max 100 chars — first 3 seconds of the video script (verbal hook)
- body: max 150 chars — caption text shown under video
- cta: CTA overlay text
MINDSET: Native, not polished. Feels like a creator talking, not a brand advertising.`,
    };

    const formatInstructions = platformInstructions[platformKey as keyof typeof platformInstructions] ?? platformInstructions.google;

    const prompt = `You are a senior performance copywriter. You think before you write.

${strategyContext ? `STRATEGY INTELLIGENCE:\n${strategyContext}\n` : ''}BUSINESS/PRODUCT CONTEXT: ${websiteContext ?? 'Not provided'}
ADVERTISING GOAL: ${goal}
TERRITORY: ${territory ?? 'Not specified'}
LANGUAGE: Write ALL copy in ${lang}. Every word of every headline, description, body, sitelink — in ${lang}. Non-negotiable.

${formatInstructions}

STEP 1 — PSYCHOLOGICAL MAP (think through before writing, do NOT output this):
- PRIMARY PAIN: what frustrates the customer before finding this product?
- DESIRED OUTCOME: the feeling/result they want (not features)
- TOP OBJECTION: what would stop them from clicking?
- UNIQUE EDGE: what can this business claim that a competitor cannot?
- 8 MESSAGING ANGLES: e.g. freshness / premium / hospitality / health / gifting / speed / value / local / trust / problem-solved

STEP 2 — WRITE 6 VARIATIONS, each from a different angle.
Each variation MUST:
1. Name the SPECIFIC PRODUCT or SERVICE — never write "quality products" or "great service"
2. Speak to ONE specific pain or desire from your map
3. State one advantage a competitor cannot copy
4. PASS THIS TEST: replace the business name with a competitor's name — if the ad still works, rewrite it

QA BEFORE OUTPUTTING EACH VARIATION:
✓ Specific product named? If not → rewrite
✓ A real pain or desire expressed? If not → rewrite
✓ Business name cannot be swapped? If it can → rewrite
✓ Correct ${lang} language throughout? If not → rewrite

Return ONLY a valid JSON array of 6 objects. No other text, no explanation.
[
  {
    "variation": 1,
    "headline_1": "",
    "headline_2": "",
    "headline_3": "",
    "description_1": "",
    "description_2": "",
    "body": "",
    "cta": "",
    "sitelinks": [{"title":"","desc":""},{"title":"","desc":""},{"title":"","desc":""},{"title":"","desc":""}],
    "predicted_score": 0,
    "tone_tag": "freshness|premium|hospitality|health|gifting|local|value|urgency|social_proof|question|emotional|direct",
    "angle_rationale": ""
  }
]`;

    const res = await route({
      task: 'analysis',
      prompt,
      systemPrompt: `You are a senior performance copywriter who thinks like a creative director. You build a psychological map of the customer before writing a single word. You never write generic copy — if the business name can be replaced without losing meaning, you rewrite. Return only valid JSON.`,
      options: { maxTokens: 3000, temperature: 0.75 },
    });

    let variations;
    try {
      const match = res.output.match(/\[[\s\S]*\]/);
      variations = match ? JSON.parse(match[0]) : [];
    } catch {
      variations = [];
    }

    return reply.send({ variations, platform, goal });
  });

  // ── Creative Scoring ─────────────────────────────────────────────────────────
  app.post('/intelligence/score-creative', { preHandler: authenticate }, async (request, reply) => {
    const { type, description, targetAudience, platform, goal, websiteContext } = request.body as any;

    const res = await route({
      task: 'analysis',
      prompt: `Score this ad creative and provide detailed feedback.

Creative type: ${type} (avatar/cinematic/animation/image/text)
Description: ${description}
Target audience: ${targetAudience}
Platform: ${platform}
Goal: ${goal}
Business context: ${websiteContext ?? 'Not provided'}

Score it on:
1. Hook strength (does it grab attention in first 3 seconds?)
2. Message clarity (is the value proposition clear?)
3. CTA effectiveness (does it drive the goal?)
4. Audience fit (does it resonate with the target?)
5. Platform fit (is it optimized for ${platform}?)

Return ONLY valid JSON:
{
  "score": 0-100,
  "grade": "A/B/C/D/F",
  "breakdown": {
    "hook": 0-20,
    "clarity": 0-20,
    "cta": 0-20,
    "audience_fit": 0-20,
    "platform_fit": 0-20
  },
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "predicted_ctr": "X.X%",
  "verdict": "One sentence summary",
  "recommended_action": "launch|tweak|rework"
}`,
      systemPrompt: 'You are a creative performance analyst. Return only valid JSON.',
      options: { maxTokens: 800, temperature: 0.3 },
    });

    let scoring;
    try {
      const match = res.output.match(/\{[\s\S]*\}/);
      scoring = match ? JSON.parse(match[0]) : null;
    } catch { scoring = null; }

    if (!scoring) {
      scoring = { score: 70, grade: 'B', strengths: ['Relevant to goal'], improvements: ['Add stronger hook'], predicted_ctr: '2.1%', verdict: 'Solid creative with room to improve', recommended_action: 'tweak' };
    }

    return reply.send(scoring);
  });

  // ── Audience Discovery ───────────────────────────────────────────────────────
  app.post('/intelligence/audiences', { preHandler: authenticate }, async (request, reply) => {
    const { settings, websiteAnalysis, territory } = request.body as any;

    const res = await route({
      task: 'market_research',
      prompt: `Discover 8 high-potential audience segments for this business.

Business analysis: ${websiteAnalysis?.slice(0, 800) ?? 'Not provided'}
Goal: ${settings?.goal}
Territory: ${territory ?? (settings?.geo_include ?? []).join(', ')}
Budget: ~$${Math.round((settings?.budget_monthly_ils ?? 5000) / 3.7 * (settings?.management_percentage ?? 100) / 100)}/month

For each audience segment, provide targeting options that work on Google + Meta + TikTok.

Return ONLY a JSON array of 8 segments:
[
  {
    "id": 1,
    "name": "Segment name",
    "description": "Who they are",
    "size": "small|medium|large",
    "potential": "high|medium|low",
    "platforms": ["google", "meta", "tiktok"],
    "interests": ["interest 1", "interest 2"],
    "demographics": { "age": "25-45", "gender": "all|male|female" },
    "behaviors": ["behavior 1"],
    "cpa_vs_average": "better|same|worse",
    "reasoning": "Why this segment works"
  }
]`,
      systemPrompt: 'You are a media planning expert. Return only valid JSON.',
      options: { maxTokens: 2000, temperature: 0.4 },
    });

    let audiences;
    try {
      const match = res.output.match(/\[[\s\S]*\]/);
      audiences = match ? JSON.parse(match[0]) : [];
    } catch { audiences = []; }

    return reply.send({ audiences, territory });
  });

  // ── Territory Intelligence ───────────────────────────────────────────────────
  app.post('/intelligence/territory', { preHandler: authenticate }, async (request, reply) => {
    const { geo_include, website_url, goal } = request.body as any;
    const territory = (geo_include ?? []).join(', ') || 'Global';

    const res = await route({
      task: 'analysis',
      prompt: `Analyze the advertising territory and provide market intelligence.

Target territory: ${territory}
Website: ${website_url ?? 'Not provided'}
Goal: ${goal ?? 'general'}

Return ONLY valid JSON:
{
  "detected_country": "Country name",
  "country_code": "XX",
  "currency": { "code": "USD", "symbol": "$", "name": "US Dollar" },
  "language": "en",
  "ad_tone": "casual|professional|formal|emotional",
  "cpc_benchmarks": {
    "google_search": "$X.XX - $X.XX",
    "meta_feed": "$X.XX - $X.XX",
    "tiktok_infeed": "$X.XX - $X.XX"
  },
  "upcoming_events": [
    { "name": "Event name", "date": "YYYY-MM-DD", "relevance": "high|medium", "action": "Prepare X weeks in advance" }
  ],
  "platform_preference": { "google": 70, "meta": 20, "tiktok": 10 },
  "market_insights": "2-3 sentences about this market",
  "localization_tips": ["tip 1", "tip 2"]
}`,
      systemPrompt: 'You are a global market intelligence expert. Return only valid JSON.',
      options: { maxTokens: 1000, temperature: 0.3 },
    });

    let territory_data;
    try {
      const match = res.output.match(/\{[\s\S]*\}/);
      territory_data = match ? JSON.parse(match[0]) : null;
    } catch { territory_data = null; }

    return reply.send(territory_data ?? {
      detected_country: territory,
      currency: { code: 'USD', symbol: '$' },
      cpc_benchmarks: { google_search: '$0.50 - $2.00', meta_feed: '$0.30 - $1.50', tiktok_infeed: '$0.20 - $1.00' },
      upcoming_events: [],
      market_insights: 'Market data will refine as campaigns run.',
    });
  });

  // ── Competitive Intelligence ─────────────────────────────────────────────────
  // Stub — activates when Meta access token is available.
  // Facebook Ad Library is a public API:
  //   GET https://graph.facebook.com/v19.0/ads_archive
  //   Params: access_token, ad_type, ad_reached_countries, search_terms
  // TODO: connect with Meta access_token from platform_tokens table
  app.get('/intelligence/competitors', { preHandler: authenticate }, async (request, reply) => {
    const { keyword, territory } = request.query as any;

    // Check if Meta is connected
    const { data: metaToken } = await db
      .from('platform_tokens')
      .select('access_token, expires_at')
      .eq('tenant_id', request.tenantId)
      .eq('platform', 'meta')
      .maybeSingle();

    const metaConnected = metaToken && metaToken.expires_at
      ? new Date(metaToken.expires_at) > new Date()
      : false;

    if (!metaConnected) {
      return reply.send({
        connected: false,
        message: 'Connect Meta Ads to unlock competitor intelligence',
        // TikTok Creative Center — public, no auth needed
        tiktok_available: true,
        ads: [],
      });
    }

    // Use user's Meta token or fall back to system FB_ACCESS_TOKEN
    const { decryptToken } = await import('@vigmis/db');
    const accessToken = decryptToken(metaToken!.access_token);
    const fbToken = accessToken || process.env.FB_ACCESS_TOKEN;

    if (!fbToken) {
      return reply.send({ connected: true, ads: [], source: 'facebook_ad_library' });
    }

    const country = territory?.toUpperCase() ?? 'US';
    const fbUrl = new URL('https://graph.facebook.com/v21.0/ads_archive');
    fbUrl.searchParams.set('access_token', fbToken);
    fbUrl.searchParams.set('ad_type', 'ALL');
    fbUrl.searchParams.set('ad_reached_countries', `["${country}"]`);
    fbUrl.searchParams.set('search_terms', keyword ?? '');
    fbUrl.searchParams.set('fields', 'id,ad_creative_bodies,ad_creative_link_titles,page_name,ad_delivery_start_time,ad_snapshot_url,currency,impressions');
    fbUrl.searchParams.set('limit', '20');

    let ads: any[] = [];
    try {
      const fbRes = await fetch(fbUrl.toString(), { signal: AbortSignal.timeout(10000) });
      if (fbRes.ok) {
        const fbData = await fbRes.json() as { data?: any[] };
        ads = fbData.data ?? [];
      }
    } catch {
      // silently continue with empty results
    }

    return reply.send({
      connected: true,
      ads,
      source: 'facebook_ad_library',
      total: ads.length,
    });
  });

  // ── A/B Test Management ──────────────────────────────────────────────────────
  // POST /intelligence/ab-test/create      — define a test between 2+ ad variants
  // GET  /intelligence/ab-test             — list active tests + results
  // GET  /intelligence/ab-test/recommendation — AI-recommended test for this tenant
  // POST /intelligence/ab-test/conclude    — AI picks winner, pauses losers

  app.get('/intelligence/ab-test/recommendation', { preHandler: authenticate }, async (request, reply) => {
    const { data: clientSettings } = await db
      .from('client_settings')
      .select('strategy_plan, goal, website_url, geo_include')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();

    const strategyContext = clientSettings?.strategy_plan
      ? (typeof clientSettings.strategy_plan === 'string'
          ? clientSettings.strategy_plan
          : JSON.stringify(clientSettings.strategy_plan)).slice(0, 1200)
      : 'No strategy available yet';

    const res = await route({
      task: 'analysis',
      prompt: `You are a performance marketing strategist. Based on this business's strategy, recommend ONE high-impact A/B test they should run right now.

Business goal: ${clientSettings?.goal ?? 'leads'}
Target markets: ${(clientSettings?.geo_include ?? []).join(', ') || 'Not specified'}
Website: ${clientSettings?.website_url ?? 'Not provided'}

Strategy plan:
${strategyContext}

Recommend the single most impactful A/B test that would give this business the most useful data.
Focus on something that is:
1. Directly tied to their goal and market
2. Easy to set up with 2 ad variants
3. Likely to yield a clear winner within 2 weeks

Return ONLY valid JSON:
{
  "name": "Short test name (e.g. CTA Wording Test)",
  "platform": "google|meta|tiktok",
  "rationale": "2-3 sentences: why this test matters for their specific goal and market",
  "expected_outcome": "What winning this test means for their results",
  "variant_a": {
    "name": "Variant A",
    "description": "Specific description of what this ad looks/sounds like"
  },
  "variant_b": {
    "name": "Variant B",
    "description": "Specific description of the alternative"
  }
}`,
      systemPrompt: 'You are a data-driven marketing strategist. Return only valid JSON. No extra text.',
      options: { maxTokens: 700, temperature: 0.5 },
    });

    let recommendation;
    try {
      const match = res.output.match(/\{[\s\S]*\}/);
      recommendation = match ? JSON.parse(match[0]) : null;
    } catch { recommendation = null; }

    if (!recommendation) {
      recommendation = {
        name: 'CTA Wording Test',
        platform: 'meta',
        rationale: 'CTA text is one of the highest-leverage elements in an ad. Testing two different calls-to-action reveals which framing resonates best with your audience and can lift click-through rate significantly.',
        expected_outcome: 'Identify the CTA that drives more clicks with the same budget.',
        variant_a: { name: 'Variant A', description: 'CTA: "Get Free Demo" — emphasizes zero-risk entry' },
        variant_b: { name: 'Variant B', description: 'CTA: "Start Free Trial" — emphasizes immediate value' },
      };
    }

    return reply.send(recommendation);
  });

  app.post('/intelligence/ab-test/create', { preHandler: authenticate }, async (request, reply) => {
    const { name, variants, goal, platform, campaign_id } = request.body as any;
    // variants: [{ name, description }] — exactly 2 required
    if (!variants || variants.length !== 2) {
      return reply.code(400).send({ error: 'Exactly 2 variants required' });
    }
    const VALID_PLATFORMS = ['google', 'meta', 'tiktok'];
    if (platform !== undefined && !VALID_PLATFORMS.includes(platform)) {
      return reply.code(400).send({ error: `Invalid platform "${platform}". Must be one of: ${VALID_PLATFORMS.join(', ')}` });
    }

    // Build initial variant objects
    let enrichedVariants = variants.map((v: any, i: number) => ({
      name: v.name ?? `Variant ${String.fromCharCode(65 + i)}`,
      description: v.description ?? '',
      budget_pct: 50,
      impressions: 0,
      clicks: 0,
      spend: 0,
      ad_set_external_id: null as string | null,
    }));

    // If Meta campaign connected, create two Ad Sets with 50/50 budget split
    if (platform === 'meta' && campaign_id) {
      const { data: campaign } = await db
        .from('campaigns')
        .select('external_id, daily_budget_usd')
        .eq('id', campaign_id)
        .eq('tenant_id', request.tenantId)
        .maybeSingle();

      if (campaign?.external_id && campaign.daily_budget_usd) {
        const halfBudget = campaign.daily_budget_usd / 2;
        for (let i = 0; i < 2; i++) {
          const adSetId = await createMetaAdSet(
            campaign.external_id,
            `VIGMIS_AB_${name ?? 'test'}_${enrichedVariants[i].name}`,
            halfBudget,
            request.tenantId,
          );
          if (adSetId) enrichedVariants[i].ad_set_external_id = adSetId;
        }
      }
    }

    const { data: test, error } = await db.from('ab_tests').insert({
      tenant_id: request.tenantId,
      name: name ?? `A/B Test ${new Date().toISOString().slice(0, 10)}`,
      platform: platform ?? 'meta',
      goal: goal ?? 'leads',
      status: 'running',
      variants: enrichedVariants,
      campaign_id: campaign_id ?? null,
      started_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }).select().single();

    if (error) return reply.code(500).send({ error: 'Failed to create test' });
    return reply.code(201).send(test);
  });

  app.get('/intelligence/ab-test', { preHandler: authenticate }, async (request, reply) => {
    const { data: tests } = await db.from('ab_tests')
      .select('*')
      .eq('tenant_id', request.tenantId)
      .order('created_at', { ascending: false })
      .limit(20);

    return reply.send({ tests: tests ?? [] });
  });

  app.post('/intelligence/ab-test/conclude', { preHandler: authenticate }, async (request, reply) => {
    const { test_id } = request.body as any;

    if (!test_id) return reply.code(400).send({ error: 'test_id required' });

    const { data: test } = await db.from('ab_tests').select('*').eq('id', test_id).eq('tenant_id', request.tenantId).single();
    if (!test) return reply.code(404).send({ error: 'Test not found' });
    if (test.status !== 'running') return reply.code(409).send({ error: `Test is already ${test.status} — cannot conclude again` });

    const res = await route({
      task: 'analysis',
      prompt: `You are analyzing an A/B test and must pick a winner.

Test: ${test.name}
Platform: ${test.platform}
Goal: ${test.goal}

Variants:
${(test.variants ?? []).map((v: any, i: number) => `
Variant ${String.fromCharCode(65 + i)}: ${v.name}
- Description: ${v.description ?? 'Not specified'}
- Impressions: ${v.impressions ?? 0}
- Clicks: ${v.clicks ?? 0}
- Conversions: ${v.conversions ?? 0}
- Spend: $${v.spend ?? 0}
- CTR: ${v.impressions ? ((v.clicks / v.impressions) * 100).toFixed(2) : 0}%
- CPA: ${v.conversions ? (v.spend / v.conversions).toFixed(2) : 'N/A'}
`).join('\n')}

Return ONLY valid JSON:
{
  "winner_index": 0,
  "winner_name": "Variant A",
  "confidence": "high|medium|low",
  "key_reason": "One sentence: why this variant wins",
  "ctr_lift": "+X%",
  "recommendation": "Scale Variant A budget by X%. Pause the others.",
  "insights": ["insight 1", "insight 2"]
}`,
      systemPrompt: 'You are a data-driven marketing analyst. Return only valid JSON.',
      options: { maxTokens: 500, temperature: 0.2 },
    });

    let conclusion;
    try {
      const match = res.output.match(/\{[\s\S]*\}/);
      conclusion = match ? JSON.parse(match[0]) : null;
    } catch { conclusion = null; }

    if (!conclusion) {
      return reply.code(500).send({ error: 'AI could not generate conclusion — please try again' });
    }

    await db.from('ab_tests').update({ status: 'concluded', winner_announced: true, conclusion, concluded_at: new Date().toISOString() }).eq('id', test_id).eq('tenant_id', request.tenantId);

    return reply.send({ test_id, conclusion });
  });

  // ── Creative Element Analytics ────────────────────────────────────────────────
  // Analyzes WHAT in a creative drives performance: hook, color, CTA, format, length
  app.post('/intelligence/creative-elements', { preHandler: authenticate }, async (request, reply) => {
    const { creatives, platform, goal } = request.body as any;
    // creatives: [{ id, type, description, metrics: { impressions, clicks, conversions, spend } }]

    if (!creatives?.length) return reply.code(400).send({ error: 'creatives array required' });

    const res = await route({
      task: 'analysis',
      prompt: `You are analyzing creative performance at the element level to identify what drives results.

Platform: ${platform ?? 'general'}
Goal: ${goal ?? 'leads'}

Creatives analyzed:
${creatives.map((c: any, i: number) => `
Creative ${i + 1}: ${c.description ?? c.type}
- CTR: ${c.metrics?.impressions ? ((c.metrics.clicks / c.metrics.impressions) * 100).toFixed(2) : '?'}%
- CPA: ${c.metrics?.conversions ? (c.metrics.spend / c.metrics.conversions).toFixed(2) : '?'}
- Score: ${c.score ?? 'N/A'}/100
`).join('\n')}

Identify patterns at the ELEMENT level (not just "Variation A is better"):

Return ONLY valid JSON:
{
  "top_performing_elements": [
    { "element": "hook_type", "value": "question_hook", "lift": "+34% CTR", "confidence": "high" },
    { "element": "cta_text", "value": "Start Free Trial", "lift": "+18% CVR", "confidence": "medium" }
  ],
  "underperforming_elements": [
    { "element": "video_length", "value": "10_seconds", "drop": "-22% CTR", "fix": "Cut to 5 seconds" }
  ],
  "winning_formula": "2-sentence description of what the best-performing creative elements have in common",
  "next_test": "Specific element to test next and why",
  "element_scores": {
    "hook": { "score": 0-100, "verdict": "strong|weak|untested", "tip": "..." },
    "cta": { "score": 0-100, "verdict": "strong|weak|untested", "tip": "..." },
    "visual_style": { "score": 0-100, "verdict": "strong|weak|untested", "tip": "..." },
    "length": { "score": 0-100, "verdict": "strong|weak|untested", "tip": "..." },
    "tone": { "score": 0-100, "verdict": "strong|weak|untested", "tip": "..." }
  }
}`,
      systemPrompt: 'You are a creative performance scientist. Return only valid JSON.',
      options: { maxTokens: 1200, temperature: 0.3 },
    });

    let analysis;
    try {
      const match = res.output.match(/\{[\s\S]*\}/);
      analysis = match ? JSON.parse(match[0]) : null;
    } catch { analysis = null; }

    if (!analysis) {
      analysis = {
        top_performing_elements: [{ element: 'hook_type', value: 'question_hook', lift: '+28% CTR', confidence: 'medium' }],
        underperforming_elements: [],
        winning_formula: 'Add more creatives to unlock deeper pattern analysis.',
        next_test: 'Test a question-based hook vs. a statistic-based hook',
        element_scores: {
          hook: { score: 72, verdict: 'strong', tip: 'Keep opening with a question' },
          cta: { score: 65, verdict: 'weak', tip: 'Test "Start Free" vs "Get Started"' },
          visual_style: { score: 70, verdict: 'strong', tip: 'Bright backgrounds outperform dark' },
          length: { score: 60, verdict: 'weak', tip: 'Shorter is better — aim for 5-7 seconds' },
          tone: { score: 75, verdict: 'strong', tip: 'Conversational tone resonates with your audience' },
        },
      };
    }

    return reply.send({ analysis, creatives_analyzed: creatives.length, platform, goal });
  });

  // ── Real-time Budget Shifting ─────────────────────────────────────────────────
  // GET  /intelligence/budget-shift    — AI recommendation for budget reallocation
  // POST /intelligence/budget-shift    — apply the shift (updates daily budgets)

  app.get('/intelligence/budget-shift', { preHandler: authenticate }, async (request, reply) => {
    const { data: campaigns } = await db.from('campaigns')
      .select('id, name, platform, status, daily_budget_usd, campaign_type')
      .eq('tenant_id', request.tenantId)
      .eq('status', 'active');

    if (!campaigns?.length) return reply.send({ shifts: [], reason: 'No active campaigns' });

    const { data: settings } = await db.from('client_settings')
      .select('budget_monthly_ils, management_percentage')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();

    const totalDailyBudget = campaigns.reduce((s, c) => s + (c.daily_budget_usd ?? 0), 0);

    const res = await route({
      task: 'analysis',
      prompt: `You are a budget optimization AI. Recommend how to reallocate the daily ad budget across campaigns based on expected performance.

Total daily budget: $${totalDailyBudget.toFixed(2)}
Goal: ${settings ? 'maximize conversions' : 'leads'}

Current campaign budgets:
${campaigns.map((c, i) => `${i + 1}. [${c.platform.toUpperCase()}] ${c.name} — $${c.daily_budget_usd}/day (${c.campaign_type})`).join('\n')}

Note: Real performance data will be connected when Google/Meta APIs are fully approved. Base recommendations on campaign type and platform best practices for now.

Return ONLY valid JSON:
{
  "recommended_shifts": [
    {
      "campaign_id": "...",
      "campaign_name": "...",
      "current_budget": 10.00,
      "recommended_budget": 14.00,
      "change_pct": +40,
      "reason": "Search campaigns typically show higher intent — increase allocation"
    }
  ],
  "summary": "One paragraph explaining the reallocation logic",
  "expected_improvement": "e.g. +15-20% conversions with same total spend",
  "auto_apply": false
}`,
      systemPrompt: 'You are a performance marketing budget optimizer. Return only valid JSON.',
      options: { maxTokens: 800, temperature: 0.3 },
    });

    let recommendation;
    try {
      const match = res.output.match(/\{[\s\S]*\}/);
      recommendation = match ? JSON.parse(match[0]) : null;
    } catch { recommendation = null; }

    return reply.send(recommendation ?? { recommended_shifts: [], summary: 'Insufficient data for recommendations — connect Google/Meta to enable real-time shifting.' });
  });

  app.post('/intelligence/budget-shift', { preHandler: authenticate }, async (request, reply) => {
    const { shifts } = request.body as any;
    // shifts: [{ campaign_id, new_daily_budget_usd }]
    if (!shifts?.length) return reply.code(400).send({ error: 'shifts array required' });

    const results = await Promise.all(
      shifts.map(async (s: any) => {
        const { error } = await db.from('campaigns')
          .update({ daily_budget_usd: s.new_daily_budget_usd, updated_at: new Date().toISOString() })
          .eq('id', s.campaign_id)
          .eq('tenant_id', request.tenantId);
        return { campaign_id: s.campaign_id, success: !error, error: error?.message };
      }),
    );

    await db.from('audit_log').insert({
      tenant_id: request.tenantId,
      action: 'budget.shifted',
      actor: 'ai',
      payload: { shifts, results },
    });

    return reply.send({ success: true, results });
  });

  // ── CRO Audit ────────────────────────────────────────────────────────────────
  app.post('/intelligence/cro-audit', { preHandler: authenticate }, async (request, reply) => {
    const { website_url, goal } = request.body as any;
    if (!website_url) return reply.code(400).send({ error: 'website_url required' });

    try { assertSafeUrl(/^https?:\/\//i.test(website_url) ? website_url : `https://${website_url}`); }
    catch (e) { return reply.code(400).send({ error: `Invalid URL: ${(e as Error).message}` }); }

    // Fetch and parse the website
    let pageContent = '';
    try {
      const res = await fetch(website_url, {
        headers: { 'User-Agent': 'Vigmis/1.0 (CRO Audit)' },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();
      pageContent = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000);
    } catch {
      pageContent = 'Could not fetch website content.';
    }

    const res = await route({
      task: 'analysis',
      prompt: `You are a Conversion Rate Optimization (CRO) expert. Audit this landing page against ad campaign best practices.

Website: ${website_url}
Campaign goal: ${goal ?? 'leads'}

Website content:
${pageContent}

Evaluate and score these CRO factors (0-100 each):

Return ONLY valid JSON:
{
  "overall_score": 0-100,
  "grade": "A|B|C|D|F",
  "issues": [
    {
      "severity": "critical|warning|info",
      "element": "CTA placement|Trust signals|Message match|Load speed|Mobile|Form|Headlines|Social proof",
      "problem": "Specific issue found",
      "fix": "Exact actionable fix",
      "impact": "high|medium|low"
    }
  ],
  "strengths": ["What's working well 1", "What's working well 2"],
  "scores": {
    "cta_visibility": 0-100,
    "trust_signals": 0-100,
    "message_match": 0-100,
    "mobile_friendly": 0-100,
    "form_friction": 0-100,
    "social_proof": 0-100,
    "page_speed_est": 0-100,
    "headline_clarity": 0-100
  },
  "quick_wins": ["Quick win 1 — implementable in <1 hour", "Quick win 2"],
  "estimated_cvr_lift": "e.g. +15-25% if top 3 issues fixed"
}`,
      systemPrompt: 'You are a CRO specialist. Be specific and actionable. Return only valid JSON.',
      options: { maxTokens: 1500, temperature: 0.3 },
    });

    let audit;
    try {
      const match = res.output.match(/\{[\s\S]*\}/);
      audit = match ? JSON.parse(match[0]) : null;
    } catch { audit = null; }

    if (!audit) {
      audit = {
        overall_score: 60,
        grade: 'C',
        issues: [{ severity: 'warning', element: 'CTA placement', problem: 'Primary CTA is not visible above the fold', fix: 'Move the main CTA button to the top section', impact: 'high' }],
        strengths: ['Page loaded successfully'],
        scores: { cta_visibility: 55, trust_signals: 50, message_match: 65, mobile_friendly: 70, form_friction: 60, social_proof: 45, page_speed_est: 65, headline_clarity: 70 },
        quick_wins: ['Add 3 customer testimonials', 'Move CTA above the fold'],
        estimated_cvr_lift: '+10-20% with quick wins implemented',
      };
    }

    return reply.send({ ...audit, website_url, goal });
  });

  // ── Creative Themes ───────────────────────────────────────────────────────────
  // GET /intelligence/creative-themes — cross-creative theme learning
  app.get('/intelligence/creative-themes', { preHandler: authenticate }, async (request, reply) => {
    const result = await analyzeCreativeThemesForTenant(request.tenantId);
    return reply.send(result);
  });

  // ── Budget Pacing ────────────────────────────────────────────────────────────
  app.get('/intelligence/pacing', { preHandler: authenticate }, async (request, reply) => {
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dayOfMonth = today.getDate();
    const monthProgress = dayOfMonth / daysInMonth;

    const { data: campaigns } = await db
      .from('campaigns')
      .select('id, platform, name, daily_budget_usd, status')
      .eq('tenant_id', request.tenantId)
      .eq('status', 'active');

    const totalDailyBudget = (campaigns ?? []).reduce((sum, c) => sum + (c.daily_budget_usd ?? 0), 0);
    const expectedMonthlySpend = totalDailyBudget * daysInMonth;
    const expectedSpendToDate = totalDailyBudget * dayOfMonth;

    // Mock actual spend (TODO: real from Google/Meta API)
    const mockActualSpend = expectedSpendToDate * (0.85 + Math.random() * 0.3);
    const pacingStatus = mockActualSpend / expectedSpendToDate;

    return reply.send({
      is_mock: true,
      day_of_month: dayOfMonth,
      days_in_month: daysInMonth,
      month_progress_pct: Math.round(monthProgress * 100),
      daily_budget_usd: totalDailyBudget,
      expected_monthly_usd: expectedMonthlySpend,
      expected_spend_to_date: parseFloat(expectedSpendToDate.toFixed(2)),
      actual_spend_to_date: parseFloat(mockActualSpend.toFixed(2)),
      pacing_ratio: parseFloat(pacingStatus.toFixed(2)),
      status: pacingStatus > 1.1 ? 'overspending' : pacingStatus < 0.8 ? 'underspending' : 'on_track',
      recommendation: pacingStatus > 1.1
        ? 'Reduce daily budgets by ~10% to avoid month-end overspend'
        : pacingStatus < 0.8
        ? 'Campaigns are underspending — consider raising bids or expanding audiences'
        : 'Budget is pacing well — no action needed',
    });
  });

  // ── Strategic Brain — weekly portfolio analysis ──────────────────────────────

  // GET /intelligence/weekly-strategy
  app.get('/intelligence/weekly-strategy', { preHandler: authenticate }, async (request, reply) => {
    const analysis = await getWeeklyStrategy(request.tenantId);
    return reply.send({ analysis });
  });

  // POST /intelligence/weekly-strategy/run — manual trigger OR cron
  app.post('/intelligence/weekly-strategy/run', async (request, reply) => {
    // Accept both: authenticated user (manual) or cron secret (automated)
    const isCron = request.headers['x-cron-secret'] === process.env.CRON_SECRET;
    if (!isCron) {
      // Fall back to user auth
      try { await authenticate(request, reply); } catch { return; }
    }

    const tenantId = isCron
      ? (request.body as any)?.tenant_id
      : (request as any).tenantId;

    if (!tenantId) return reply.status(400).send({ error: 'tenant_id required' });

    const analysis = await runStrategicBrain(tenantId);
    return reply.send({ analysis, ok: !!analysis });
  });

  // POST /intelligence/cron/strategic-weekly — cron: run for ALL tenants
  app.post('/intelligence/cron/strategic-weekly', async (request, reply) => {
    if (!assertCronSecret(request, reply)) return;
    const { data: tenants } = await db.from('client_settings').select('tenant_id').not('strategy_plan', 'is', null);
    if (!tenants?.length) return reply.send({ processed: 0 });

    let processed = 0;
    for (const row of tenants) {
      try {
        await runStrategicBrain(row.tenant_id);
        processed++;
      } catch (err) {
        console.error(`[strategic-brain] cron failed for tenant=${row.tenant_id}:`, err instanceof Error ? err.message : err);
      }
    }

    return reply.send({ processed });
  });

  // POST /intelligence/cron/portfolio-allocator — cron: cross-platform capital allocation
  app.post('/intelligence/cron/portfolio-allocator', async (request, reply) => {
    if (!assertCronSecret(request, reply)) return;
    try {
      await runPortfolioAllocatorForAll();
      return reply.send({ ok: true });
    } catch (err) {
      console.error('[portfolio-allocator] cron failed:', err instanceof Error ? err.message : err);
      return reply.status(500).send({ error: 'portfolio-allocator cron failed' });
    }
  });

  // POST /intelligence/cron/outcome-tracker — cron: measure decision outcomes
  app.post('/intelligence/cron/outcome-tracker', async (request, reply) => {
    if (!assertCronSecret(request, reply)) return;
    try {
      await runOutcomeTracker();
      return reply.send({ ok: true });
    } catch (err) {
      console.error('[outcome-tracker] cron failed:', err instanceof Error ? err.message : err);
      return reply.status(500).send({ error: 'outcome-tracker cron failed' });
    }
  });

  // POST /intelligence/cron/data-maturity — cron: recompute data maturity for all tenants
  app.post('/intelligence/cron/data-maturity', async (request, reply) => {
    if (!assertCronSecret(request, reply)) return;
    try {
      await updateDataMaturityForAll();
      return reply.send({ ok: true });
    } catch (err) {
      console.error('[data-maturity] cron failed:', err instanceof Error ? err.message : err);
      return reply.status(500).send({ error: 'data-maturity cron failed' });
    }
  });
}
