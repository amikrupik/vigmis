import { db } from '@vigmis/db';

const META_AD_LIBRARY_URL = 'https://graph.facebook.com/v21.0/ads_archive';

export interface CompetitorAd {
  id: string;
  page_name: string;
  ad_creative_body?: string;
  ad_creative_link_title?: string;
  ad_delivery_start_time?: string;
}

/**
 * Searches Meta Ad Library for competitor ads in a given category/keywords.
 * Uses the client's own ads_read token (already obtained during Meta OAuth).
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/reference/ads_archive
 */
export async function searchMetaAdLibrary(opts: {
  tenantId: string;
  keywords: string[];
  country?: string;
  limit?: number;
}): Promise<CompetitorAd[]> {
  const { tenantId, keywords, country = 'IL', limit = 15 } = opts;

  // Use tenant's Meta access token (has ads_read scope)
  const { data: tokenRow } = await db
    .from('platform_tokens')
    .select('access_token')
    .eq('tenant_id', tenantId)
    .eq('platform', 'meta')
    .maybeSingle();

  if (!tokenRow?.access_token) return [];

  // Decrypt token
  const { decryptToken } = await import('@vigmis/db');
  let accessToken: string;
  try {
    accessToken = decryptToken(tokenRow.access_token);
  } catch {
    return [];
  }

  const searchTerms = keywords.slice(0, 3).join(' OR ');
  const params = new URLSearchParams({
    search_terms: searchTerms,
    ad_type: 'ALL',
    ad_reached_countries: JSON.stringify([country]),
    fields: 'id,page_name,ad_creative_body,ad_creative_link_title,ad_delivery_start_time',
    limit: String(Math.min(limit, 25)),
    access_token: accessToken,
  });

  try {
    const res = await fetch(`${META_AD_LIBRARY_URL}?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = await res.json() as { data?: CompetitorAd[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Formats competitor ads as a compact context block for strategy prompts.
 */
export function formatCompetitorAds(ads: CompetitorAd[]): string {
  if (!ads.length) return '';
  const lines = ads.slice(0, 10).map(ad =>
    `- ${ad.page_name}: "${ad.ad_creative_body?.slice(0, 120) ?? ad.ad_creative_link_title ?? '(no body)'}"`
  );
  return `COMPETITOR ADS CURRENTLY RUNNING (Meta Ad Library):\n${lines.join('\n')}`;
}

/**
 * Extracts industry keywords from client settings for Ad Library search.
 */
export function extractSearchKeywords(settings: {
  business_type?: string;
  website_url?: string;
  goal?: string;
  open_notes?: string;
}): string[] {
  const words: string[] = [];

  if (settings.website_url) {
    // Extract domain name as a keyword (often business name)
    const match = settings.website_url.match(/https?:\/\/(?:www\.)?([^/]+)/);
    if (match?.[1]) words.push(match[1].replace(/\.(com|co\.il|net|org|io).*/, ''));
  }

  const typeKeywords: Record<string, string[]> = {
    ecommerce:    ['online store', 'shop online', 'delivery'],
    hero_product: ['order now', 'buy online'],
    lead_gen:     ['contact us', 'free consultation', 'get a quote'],
    saas:         ['free trial', 'software', 'platform'],
    general_store:['store', 'products'],
  };

  const extra = typeKeywords[settings.business_type ?? ''] ?? [];
  return [...words, ...extra].slice(0, 3);
}
