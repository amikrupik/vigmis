// Cross-creative theme learning — analyzes last 90 days of posts to surface
// repeating content patterns and their performance correlation.

import { db } from '@vigmis/db';

export interface CreativeThemeInsights {
  insights: Array<{ theme: string; performance: string; recommendation: string }>;
  topPerforming: string;
  toAvoid: string;
}

export async function analyzeCreativeThemesForTenant(
  tenantId: string,
): Promise<CreativeThemeInsights> {
  const { data: posts } = await db
    .from('social_posts')
    .select('content, platform, social_analytics(reach, likes, comments, shares)')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .gte(
      'published_at',
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    )
    .order('published_at', { ascending: false })
    .limit(30);

  if (!posts?.length) {
    return {
      insights: [],
      topPerforming: 'Not enough data yet',
      toAvoid: 'Not enough data yet',
    };
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return { insights: [], topPerforming: 'API not configured', toAvoid: '' };
  }

  const postSummaries = posts
    .map(p => {
      const analytics = Array.isArray(p.social_analytics)
        ? p.social_analytics[0]
        : p.social_analytics;
      const engagement =
        (analytics?.likes ?? 0) +
        (analytics?.comments ?? 0) +
        (analytics?.shares ?? 0);
      return `Post: "${(p.content ?? '').slice(0, 100)}" | Reach: ${analytics?.reach ?? 0} | Engagement: ${engagement}`;
    })
    .join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: `Analyze these social media posts and their performance. Identify 2-3 content themes or patterns that drove the best results, and 1 pattern to avoid. Be specific and actionable.\n\n${postSummaries}\n\nRespond with JSON: {"insights": [{"theme": "...", "performance": "...", "recommendation": "..."}], "topPerforming": "...", "toAvoid": "..."}`,
        },
      ],
      max_tokens: 600,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    return { insights: [], topPerforming: 'Analysis failed', toAvoid: '' };
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return JSON.parse(data.choices[0].message.content) as CreativeThemeInsights;
}
