// POST /intelligence/ad-copy       — AI generates ad copy variations
// POST /intelligence/score-creative — AI scores a creative brief 0-100
// POST /intelligence/audiences      — AI discovers audience segments
// POST /intelligence/territory      — Auto-detect territory + benchmarks + events
// GET  /intelligence/competitors    — Facebook Ad Library (stub, activates when Meta connected)

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { route } from '@vigmis/ai-router';

export async function intelligenceRoutes(app: FastifyInstance) {

  // ── Ad Copy Generator ────────────────────────────────────────────────────────
  app.post('/intelligence/ad-copy', { preHandler: authenticate }, async (request, reply) => {
    const { platform, goal, websiteContext, tone, territory } = request.body as any;

    const limits = {
      google: { headline: 30, description: 90 },
      meta:   { headline: 40, description: 125 },
      tiktok: { headline: 100, description: 150 },
    };
    const lim = limits[platform as keyof typeof limits] ?? limits.google;

    const res = await route({
      task: 'analysis',
      prompt: `Generate 6 ad copy variations for ${platform} ads.

Business context: ${websiteContext ?? 'Not provided'}
Goal: ${goal}
Tone: ${tone ?? 'professional and friendly'}
Territory/Market: ${territory ?? 'Global'}

Character limits:
- Headline: max ${lim.headline} characters
- Description: max ${lim.description} characters
${platform === 'google' ? '- Google needs 3 headlines and 2 descriptions per variation\n- Include a strong CTA in description' : ''}
${platform === 'meta' ? '- Meta needs primary text (125 chars), headline, description, and CTA button label' : ''}
${platform === 'tiktok' ? '- TikTok needs a hook (first 3 seconds script) and a brief caption' : ''}

Return ONLY a JSON array of 6 variations:
[
  {
    "variation": 1,
    "headline_1": "...",
    "headline_2": "...",
    "headline_3": "...",
    "description_1": "...",
    "description_2": "...",
    "cta": "...",
    "body": "...",
    "predicted_score": 72,
    "tone_tag": "urgency|benefit|social_proof|question|emotional|direct"
  }
]
Keep every string within its character limit.`,
      systemPrompt: 'You are a world-class performance ad copywriter. Return only valid JSON. No extra text.',
      options: { maxTokens: 2000, temperature: 0.7 },
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

    // TODO: Real Facebook Ad Library call
    // const fbRes = await fetch(
    //   `https://graph.facebook.com/v19.0/ads_archive?` +
    //   `access_token=${metaToken.access_token}&ad_type=ALL&` +
    //   `ad_reached_countries=${territory}&search_terms=${keyword}&limit=20`
    // );
    // const fbData = await fbRes.json();

    return reply.send({
      connected: true,
      ads: [], // swap with fbData.data
      source: 'facebook_ad_library',
    });
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
}
