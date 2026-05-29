// High-Stakes Claim Detector — flags content that warrants extra friction.
//
// Used by:
//   - Pre-publish cooling-off (delay publish by 1h)
//   - Two-Key trigger
//   - Trust Tier action gate
//
// Patterns are deliberately precise. A "guarantee" mention isn't high-stakes
// if the body context is "no guarantee" — we use surrounding context.

const HIGH_STAKES_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(guarantee[d]?|guaranty|warranty)\b/i, label: 'guarantee' },
  { pattern: /\b(refund|money[\s-]?back)\b/i, label: 'refund_promise' },
  { pattern: /(\$|₪|€|£)\s?\d+(?:[.,]\d{1,2})?\b/, label: 'explicit_price' },
  { pattern: /\b\d{1,2}\s*%\s*(off|discount)\b/i, label: 'discount_pct' },
  { pattern: /\b(free\s+(shipping|delivery|trial))\b/i, label: 'free_offer' },
  { pattern: /(משלוח\s+חינם|אחריות|התחייבות)/, label: 'commitment_he' },
  { pattern: /\b(ends?\s+today|24\s+hours?\s+only|last\s+chance)\b/i, label: 'urgency' },
  { pattern: /(מסתיים\s+היום|רק\s+היום)/, label: 'urgency_he' },
];

export interface HighStakesResult {
  is_high_stakes: boolean;
  labels: string[];
}

export function detectHighStakes(text: string): HighStakesResult {
  const labels = HIGH_STAKES_PATTERNS
    .filter((p) => p.pattern.test(text))
    .map((p) => p.label);
  return { is_high_stakes: labels.length > 0, labels };
}
