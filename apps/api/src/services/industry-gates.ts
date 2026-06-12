// Industry Compliance Gates — block ads in regulated industries until proper
// licensing is attested.
//
// Each gate maps a detected industry/topic in the content to a required
// attestation kind. If the tenant doesn't have a current industry_eligibility
// attestation with matching context, the publish is blocked.

import { db } from '@vigmis/db';

export type IndustryCategory =
  | 'medical'
  | 'financial'
  | 'legal_services'
  | 'gambling'
  | 'alcohol'
  | 'cannabis'
  | 'cosmetic_procedure'
  | 'minor_targeting'
  | 'food_health_claim';

// Pattern detection — narrow but high-precision
const INDUSTRY_PATTERNS: { category: IndustryCategory; pattern: RegExp; required_license: string }[] = [
  { category: 'medical', pattern: /\b(treat(s|ment)?|cures?|diagnos(e|is)|prescri(be|ption))\s+(cancer|diabetes|disease|condition|illness)/i, required_license: 'medical_license' },
  { category: 'medical', pattern: /(טיפול|אבחון|מרשם)\s+(סרטן|סוכרת|מחלה)/, required_license: 'medical_license' },
  { category: 'financial', pattern: /\b(invest(ment|ing)\s+advice|portfolio\s+(management|advisor)|securities|brokerage)\b/i, required_license: 'financial_advisor_license' },
  { category: 'financial', pattern: /(ייעוץ\s+השקעות|רישיון\s+יועץ|תיקי\s+השקעות)/, required_license: 'financial_advisor_license' },
  { category: 'legal_services', pattern: /\b(attorney|lawyer|legal\s+representation|file\s+(a\s+)?lawsuit)\b/i, required_license: 'bar_admission' },
  { category: 'gambling', pattern: /\b(casino|sports[-\s]?bet(ting)?|poker|blackjack|slots?)\b/i, required_license: 'gambling_license' },
  { category: 'alcohol', pattern: /\b(beer|wine|whisky|whiskey|vodka|gin|liquor|distillery|brewery)\b/i, required_license: 'alcohol_license' },
  { category: 'cannabis', pattern: /\b(cannabis|marijuana|weed|CBD|THC|hemp\s+oil)\b/i, required_license: 'cannabis_license' },
  { category: 'cosmetic_procedure', pattern: /\b(botox|filler|liposuction|rhinoplasty|surgical\s+procedure)\b/i, required_license: 'medical_aesthetic_license' },
  { category: 'minor_targeting', pattern: /\b(for\s+kids|for\s+children|teen[s]?|under\s+18)\b/i, required_license: 'minor_targeting_review' },
  { category: 'food_health_claim', pattern: /\b(boost(s)?\s+immune|increases?\s+(metabolism|energy)|fights?\s+inflammation|burns?\s+fat)\b/i, required_license: 'health_claim_substantiation' },
];

export interface IndustryGateResult {
  detected_industry: IndustryCategory | null;
  required_license: string | null;
  attestation_present: boolean;
  blocked: boolean;
  reason: string;
}

export async function checkIndustryGate(args: {
  tenantId: string;
  text: string;
}): Promise<IndustryGateResult> {
  let match: { category: IndustryCategory; required_license: string } | null = null;
  for (const p of INDUSTRY_PATTERNS) {
    if (p.pattern.test(args.text)) {
      match = { category: p.category, required_license: p.required_license };
      break;
    }
  }

  if (!match) {
    return {
      detected_industry: null,
      required_license: null,
      attestation_present: true,
      blocked: false,
      reason: 'no_regulated_industry_detected',
    };
  }

  // Look for an industry_eligibility attestation with matching context.license
  const { data: attests } = await db.from('content_attestations')
    .select('id, context, signed_at')
    .eq('tenant_id', args.tenantId)
    .eq('attestation_kind', 'industry_eligibility')
    .order('signed_at', { ascending: false })
    .limit(10);

  const hasMatching = (attests ?? []).some((a: { context: any }) => {
    const ctx = a.context as { license?: string } | null;
    return ctx?.license === match!.required_license;
  });

  return {
    detected_industry: match.category,
    required_license: match.required_license,
    attestation_present: hasMatching,
    blocked: !hasMatching,
    reason: hasMatching
      ? `${match.category} content; ${match.required_license} attestation on file`
      : `${match.category} content requires ${match.required_license} attestation. Upload license proof in Settings → Compliance.`,
  };
}
