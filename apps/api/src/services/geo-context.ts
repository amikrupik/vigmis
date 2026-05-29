// Geographic Context — resolves a tenant's business and target-market countries.
//
// Used by:
//   - Policy classifier (cannabis legal in CA, illegal in SA)
//   - AI disclosure (EU AI Act stricter than US)
//   - Industry-compliance gates (FDA scope vs EMA vs Israel MoH)
//
// We don't store explicit ISO codes today — `geo_include` is free-form city/
// region names. This module does best-effort mapping with a small lookup,
// falling back to "unknown" rather than guessing wrong.

import { db } from '@vigmis/db';

export interface GeoContext {
  business_country: string | null;  // ISO-2 where the business operates
  target_markets: string[];          // ISO-2 list of target markets
  is_strict_market: boolean;         // EU / California-CCPA / similar
  primary_target: string | null;     // single best-guess for prompts that need one
}

const GEO_LOOKUP: Record<string, string> = {
  // Israel
  israel: 'IL', 'tel aviv': 'IL', jerusalem: 'IL', haifa: 'IL', 'beer sheva': 'IL', netanya: 'IL', eilat: 'IL',
  // English locales
  usa: 'US', 'united states': 'US', america: 'US', us: 'US',
  uk: 'GB', 'united kingdom': 'GB', england: 'GB', britain: 'GB', london: 'GB',
  canada: 'CA', australia: 'AU',
  // EU (subset)
  germany: 'DE', berlin: 'DE',
  france: 'FR', paris: 'FR',
  spain: 'ES', madrid: 'ES', barcelona: 'ES',
  italy: 'IT', rome: 'IT', milan: 'IT',
  netherlands: 'NL', amsterdam: 'NL',
  ireland: 'IE',
  portugal: 'PT',
  greece: 'GR',
  poland: 'PL',
  // Other strict markets
  brazil: 'BR', mexico: 'MX',
  // Restrictive
  'saudi arabia': 'SA', uae: 'AE', 'united arab emirates': 'AE',
};

const STRICT_MARKETS = new Set<string>([
  // EU member states
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE',
  'IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
  // EEA / UK
  'NO','IS','LI','GB',
  // California is partially strict (CCPA) but we treat the whole US as non-strict for now.
]);

function resolveCountry(raw: string): string | null {
  const lower = raw.toLowerCase().trim();
  if (lower.length === 2 && /^[a-z]{2}$/.test(lower)) return lower.toUpperCase();
  return GEO_LOOKUP[lower] ?? null;
}

export async function getGeoContext(tenantId: string): Promise<GeoContext> {
  const { data } = await db.from('client_settings')
    .select('geo_include, business_country')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const targets = new Set<string>();
  for (const entry of (data?.geo_include ?? []) as string[]) {
    const c = resolveCountry(entry);
    if (c) targets.add(c);
  }

  const business = data?.business_country
    ? resolveCountry(data.business_country)
    : (targets.has('IL') ? 'IL' : null);

  const targetList = Array.from(targets);
  const isStrict =
    (business && STRICT_MARKETS.has(business)) ||
    targetList.some((c) => STRICT_MARKETS.has(c));

  return {
    business_country: business,
    target_markets: targetList,
    is_strict_market: isStrict,
    primary_target: targetList[0] ?? business ?? null,
  };
}

/**
 * Per-category geographic legality. Returns 'legal' / 'restricted' / 'illegal'
 * for the (category, country) pair. Used by the classifier to upgrade tier
 * based on geography.
 */
export function geoLegality(
  category: 'cannabis' | 'gambling' | 'alcohol' | 'political' | 'cbd' | 'medical_supplement',
  country: string,
): 'legal' | 'restricted' | 'illegal' {
  const cc = country.toUpperCase();
  switch (category) {
    case 'cannabis':
      if (['CA','DE','NL','MT','LU','UY'].includes(cc)) return 'restricted'; // medical/recreational regulated
      if (['SA','AE','EG','SG','MY','ID','JP','KR','RU','CN'].includes(cc)) return 'illegal';
      if (['US'].includes(cc)) return 'restricted'; // varies by state
      return 'restricted';
    case 'cbd':
      if (['DE','FR','SK','LT'].includes(cc)) return 'illegal';
      if (['SA','AE','SG'].includes(cc)) return 'illegal';
      return 'restricted';
    case 'gambling':
      if (['SA','AE','BN','KW'].includes(cc)) return 'illegal';
      return 'restricted'; // license required nearly everywhere
    case 'alcohol':
      if (['SA','LY','SD','KW','MR','YE'].includes(cc)) return 'illegal';
      return 'restricted';
    case 'political':
      // Heavily regulated everywhere; never "legal" without disclosures
      return 'restricted';
    case 'medical_supplement':
      return 'restricted'; // claims must be substantiated
    default:
      return 'legal';
  }
}
