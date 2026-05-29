// News Monitor — fetches news that may affect a tenant's business and
// filters for relevance via an LLM.
//
// A real marketing manager scans the news before deciding on creatives:
// is there a recall, a regulation change, a competitor announcement, a
// macro event? This service does that scan automatically.
//
// Provider: NewsAPI.org (cheapest + fastest setup). Env var: NEWSAPI_KEY.
// Degrade: no key → service no-ops (returns 0). Gracefully reported.

import { db } from '@vigmis/db';
import { route } from '@vigmis/ai-router';
import { sendTenantNotification } from './notify.js';

const NEWSAPI_KEY = process.env.NEWSAPI_KEY ?? '';
const NEWSAPI_BASE = 'https://newsapi.org/v2';
const MIN_RELEVANCE_TO_NOTIFY = 0.7;

interface NewsApiArticle {
  source: { id: string | null; name: string };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  publishedAt: string;
}

interface RelevanceResult {
  relevance_score: number;       // 0..1
  category: 'competitor' | 'industry' | 'regulation' | 'macroeconomy' | 'other' | 'noise';
  why_relevant: string;
  suggested_action: string;
}

const RELEVANCE_PROMPT = `You are a media-intelligence analyst for a small business. Given a news headline + description and the business's industry/competitors, score the news article's relevance to the business.

Output STRICT JSON, no markdown fences:
{
  "relevance_score": <0..1>,
  "category": "competitor" | "industry" | "regulation" | "macroeconomy" | "other" | "noise",
  "why_relevant": "<one sentence>",
  "suggested_action": "<one sentence — what should the business do>"
}

Scoring:
- 0.9-1.0: directly affects this business this week (competitor launches identical product, recall on their category, regulation hits their industry)
- 0.7-0.89: should know about it (broader industry trend, macro indicator)
- 0.4-0.69: weak link, contextually interesting
- 0.0-0.39: noise — politics, sports, celebrity, unrelated geography

Default to noise (low score). Only score high when impact is concrete.`;

interface TenantContext {
  tenant_id: string;
  business_summary: string;
  competitors: string[];
  market_country: string | null;
  hero_product: string | null;
}

async function getTenantContext(tenantId: string): Promise<TenantContext | null> {
  const { data } = await db.from('client_settings')
    .select('website_analysis, hero_product_name, geo_include, business_country, strategy_plan')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!data) return null;
  const competitors = ((data.strategy_plan as any)?.competitors as string[]) ?? [];
  const country = data.business_country
    ?? (Array.isArray(data.geo_include) && data.geo_include.length > 0 ? data.geo_include[0] : null);
  return {
    tenant_id: tenantId,
    business_summary: (data.website_analysis ?? '').slice(0, 800),
    competitors,
    market_country: country,
    hero_product: data.hero_product_name ?? null,
  };
}

function buildQuery(ctx: TenantContext): string {
  const parts: string[] = [];
  if (ctx.hero_product) parts.push(`"${ctx.hero_product}"`);
  if (ctx.competitors.length > 0) parts.push(`(${ctx.competitors.slice(0, 5).map((c) => `"${c}"`).join(' OR ')})`);
  // Industry keyword fallback — extract first noun-ish phrase from business summary
  if (parts.length === 0) {
    const firstSentence = ctx.business_summary.split(/[.!?]/)[0]?.slice(0, 80) ?? '';
    if (firstSentence) parts.push(`"${firstSentence}"`);
  }
  return parts.join(' AND ') || 'business';
}

async function fetchNewsApi(query: string, country?: string): Promise<NewsApiArticle[]> {
  if (!NEWSAPI_KEY) return [];
  const url = new URL(`${NEWSAPI_BASE}/everything`);
  url.searchParams.set('q', query);
  url.searchParams.set('language', country === 'IL' ? 'he' : 'en');
  url.searchParams.set('sortBy', 'publishedAt');
  url.searchParams.set('pageSize', '20');
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  url.searchParams.set('from', since);

  try {
    const res = await fetch(url.toString(), {
      headers: { 'X-Api-Key': NEWSAPI_KEY },
    });
    if (!res.ok) return [];
    const json = await res.json() as { articles?: NewsApiArticle[] };
    return json.articles ?? [];
  } catch {
    return [];
  }
}

async function scoreRelevance(article: NewsApiArticle, ctx: TenantContext): Promise<RelevanceResult | null> {
  const prompt = [
    `BUSINESS SUMMARY: ${ctx.business_summary}`,
    ctx.hero_product ? `HERO PRODUCT: ${ctx.hero_product}` : '',
    ctx.competitors.length > 0 ? `COMPETITORS: ${ctx.competitors.join(', ')}` : '',
    ctx.market_country ? `TARGET MARKET: ${ctx.market_country}` : '',
    '',
    `ARTICLE:`,
    `Title: ${article.title}`,
    `Source: ${article.source.name}`,
    `Description: ${article.description ?? '(none)'}`,
  ].filter(Boolean).join('\n');

  try {
    const res = await route({
      task: 'cheap_task',
      systemPrompt: RELEVANCE_PROMPT,
      prompt,
      options: { temperature: 0.2, maxTokens: 200, tenantId: ctx.tenant_id },
    });
    const cleaned = res.output.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    return JSON.parse(cleaned) as RelevanceResult;
  } catch {
    return null;
  }
}

export async function scanNewsForTenant(tenantId: string): Promise<{ fetched: number; relevant: number; notified: number }> {
  if (!NEWSAPI_KEY) return { fetched: 0, relevant: 0, notified: 0 };

  const ctx = await getTenantContext(tenantId);
  if (!ctx) return { fetched: 0, relevant: 0, notified: 0 };

  const query = buildQuery(ctx);
  const articles = await fetchNewsApi(query, ctx.market_country ?? undefined);
  if (articles.length === 0) return { fetched: 0, relevant: 0, notified: 0 };

  let relevant = 0;
  let notified = 0;
  for (const a of articles) {
    // Skip already-seen URLs
    const { data: existing } = await db.from('news_alerts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('source_url', a.url)
      .maybeSingle();
    if (existing) continue;

    const score = await scoreRelevance(a, ctx);
    if (!score) continue;

    if (score.relevance_score < 0.4) continue; // discard noise entirely

    relevant++;
    const { data: inserted } = await db.from('news_alerts').insert({
      tenant_id: tenantId,
      source: a.source.name,
      source_url: a.url,
      title: a.title,
      description: a.description,
      published_at: a.publishedAt,
      relevance_score: score.relevance_score,
      category: score.category,
      why_relevant: score.why_relevant,
      suggested_action: score.suggested_action,
    }).select('id').single();

    if (inserted && score.relevance_score >= MIN_RELEVANCE_TO_NOTIFY) {
      await sendTenantNotification(
        tenantId,
        `News alert: ${a.title.slice(0, 80)}`,
        `${score.why_relevant} → ${score.suggested_action}`,
        score.relevance_score >= 0.85 ? 'critical' : 'warning',
        'Open Intelligence tab',
      ).catch(() => null);
      await db.from('news_alerts').update({ notified: true }).eq('id', inserted.id);
      notified++;
    }
  }
  return { fetched: articles.length, relevant, notified };
}

export async function dispatchNewsScanCron(): Promise<{ tenants: number; relevant: number }> {
  if (!NEWSAPI_KEY) return { tenants: 0, relevant: 0 };
  const { data: tenants } = await db.from('client_settings')
    .select('tenant_id')
    .not('website_analysis', 'is', null);
  if (!tenants?.length) return { tenants: 0, relevant: 0 };

  let totalRelevant = 0;
  for (const t of tenants) {
    const r = await scanNewsForTenant(t.tenant_id).catch(() => ({ relevant: 0 }));
    totalRelevant += r.relevant;
  }
  return { tenants: tenants.length, relevant: totalRelevant };
}
