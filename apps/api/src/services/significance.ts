// Statistical Significance — gating for Kill/Scale/Pause decisions.
//
// The optimization engine used to fire "scale up if CTR >= goodCtr" on raw
// ratios. That's how you scale up a winner that's actually variance and kill a
// loser that just hasn't had enough impressions. This module computes Wilson
// score intervals for proportions so the engine can ask "is this ratio
// STATISTICALLY above the benchmark, not just nominally?"
//
// Wilson is preferred over Wald for small samples and proportions near 0/1 —
// it doesn't break at p=0 or p=1, and converges to Wald as n grows.
//
// References:
//   Wilson, E.B. (1927). Probable Inference, the Law of Succession, and
//   Statistical Inference. JASA, 22(158), 209–212.

const Z_SCORES: Record<number, number> = {
  0.80: 1.282,
  0.90: 1.645,
  0.95: 1.960,
  0.99: 2.576,
};

export interface WilsonInterval {
  point: number;     // observed ratio
  lower: number;     // confidence-interval lower bound
  upper: number;     // confidence-interval upper bound
  n: number;         // sample size
  successes: number; // successes (clicks, conversions)
  confidence: number;
}

/**
 * Wilson score interval for a binomial proportion.
 * confidence default 0.90 → z = 1.645.
 *
 * If n == 0 returns [0, 1] (we know nothing).
 */
export function wilsonInterval(
  successes: number,
  n: number,
  confidence: number = 0.90,
): WilsonInterval {
  if (n <= 0) {
    return { point: 0, lower: 0, upper: 1, n: 0, successes: 0, confidence };
  }
  const z = Z_SCORES[confidence] ?? Z_SCORES[0.90];
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    point: p,
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
    n,
    successes,
    confidence,
  };
}

/**
 * Decide whether an observed proportion is statistically ABOVE a target threshold.
 * Lower-bound of confidence interval must be at or above the target.
 *
 * Use for: "scale up if CTR >= goodCtr" → require significantly_above(clicks, impressions, goodCtr).
 */
export function significantlyAbove(
  successes: number,
  n: number,
  threshold: number,
  confidence: number = 0.90,
): { significant: boolean; lower: number; point: number } {
  const ci = wilsonInterval(successes, n, confidence);
  return { significant: ci.lower >= threshold, lower: ci.lower, point: ci.point };
}

/**
 * Decide whether an observed proportion is statistically BELOW a target threshold.
 * Upper-bound of confidence interval must be at or below the target.
 *
 * Use for: "scale down if CTR < minCtr" → require significantly_below(clicks, impressions, minCtr).
 * Without this, a 3-impression campaign with 0 clicks gets killed at "0% CTR" — variance.
 */
export function significantlyBelow(
  successes: number,
  n: number,
  threshold: number,
  confidence: number = 0.90,
): { significant: boolean; upper: number; point: number } {
  const ci = wilsonInterval(successes, n, confidence);
  return { significant: ci.upper <= threshold, upper: ci.upper, point: ci.point };
}

/**
 * Two-proportion z-test: are two CTR/conversion-rate samples statistically different?
 * Used for: "recent CTR dropped vs baseline → creative fatigue".
 *
 * Returns the p-value and whether the drop is significant at the given confidence.
 */
export function proportionsDiffer(
  s1: number, n1: number,
  s2: number, n2: number,
  confidence: number = 0.90,
): { significant: boolean; p1: number; p2: number; z: number } {
  if (n1 <= 0 || n2 <= 0) return { significant: false, p1: 0, p2: 0, z: 0 };
  const p1 = s1 / n1;
  const p2 = s2 / n2;
  const pPool = (s1 + s2) / (n1 + n2);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  if (se === 0) return { significant: false, p1, p2, z: 0 };
  const z = (p1 - p2) / se;
  const zCrit = Z_SCORES[confidence] ?? Z_SCORES[0.90];
  return { significant: Math.abs(z) >= zCrit, p1, p2, z };
}

/**
 * Minimum spend gate. Even if statistics say "scale down at $5 spend", a real
 * marketing manager would say "wait, $5 is nothing". Combines daily-budget aware
 * minimum with an absolute floor. Used as an AND gate alongside significance.
 *
 * Default floor: 2× dailyBudget OR $30 absolute, whichever is higher.
 */
export function meetsMinSpendThreshold(
  spendUsd: number,
  dailyBudgetUsd: number,
  absoluteFloorUsd: number = 30,
): boolean {
  const target = Math.max(absoluteFloorUsd, dailyBudgetUsd * 2);
  return spendUsd >= target;
}

/**
 * Convenience: combined gate for a "scale down" decision.
 * Requires BOTH significance AND minimum spend.
 */
export function safeToScaleDown(args: {
  clicks: number;
  impressions: number;
  minCtr: number;
  spendUsd: number;
  dailyBudgetUsd: number;
  confidence?: number;
}): { ok: boolean; reason: string } {
  if (!meetsMinSpendThreshold(args.spendUsd, args.dailyBudgetUsd)) {
    return { ok: false, reason: `spend $${args.spendUsd.toFixed(0)} below min threshold (waiting for more data)` };
  }
  const sig = significantlyBelow(args.clicks, args.impressions, args.minCtr, args.confidence ?? 0.90);
  if (!sig.significant) {
    return { ok: false, reason: `CTR ${(sig.point * 100).toFixed(2)}% not yet statistically below ${(args.minCtr * 100).toFixed(2)}% (CI upper ${(sig.upper * 100).toFixed(2)}%)` };
  }
  return { ok: true, reason: `CTR ${(sig.point * 100).toFixed(2)}% statistically below benchmark (CI upper ${(sig.upper * 100).toFixed(2)}% ≤ ${(args.minCtr * 100).toFixed(2)}%)` };
}

/**
 * Convenience: combined gate for a "scale up" decision.
 * Requires BOTH significance AND minimum spend.
 */
export function safeToScaleUp(args: {
  clicks: number;
  impressions: number;
  goodCtr: number;
  spendUsd: number;
  dailyBudgetUsd: number;
  confidence?: number;
}): { ok: boolean; reason: string } {
  if (!meetsMinSpendThreshold(args.spendUsd, args.dailyBudgetUsd)) {
    return { ok: false, reason: `spend $${args.spendUsd.toFixed(0)} below min threshold` };
  }
  const sig = significantlyAbove(args.clicks, args.impressions, args.goodCtr, args.confidence ?? 0.90);
  if (!sig.significant) {
    return { ok: false, reason: `CTR ${(sig.point * 100).toFixed(2)}% not yet statistically above ${(args.goodCtr * 100).toFixed(2)}% (CI lower ${(sig.lower * 100).toFixed(2)}%)` };
  }
  return { ok: true, reason: `CTR ${(sig.point * 100).toFixed(2)}% statistically above target (CI lower ${(sig.lower * 100).toFixed(2)}% ≥ ${(args.goodCtr * 100).toFixed(2)}%)` };
}
