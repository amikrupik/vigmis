// A/B Test Engine
// Auto-concludes running tests when statistical significance is reached.
// Runs once per tenant after the campaign optimization loop.
//
// Conditions to conclude:
//   - Both variants have >= MIN_CLICKS_PER_VARIANT clicks, AND
//   - Test has been running >= MIN_DAYS days
//   OR
//   - Test has been running >= MAX_DAYS (force-conclude even if inconclusive)

import { db } from '@vigmis/db';
import { getMetaAdSetInsights, pauseMetaAdSet } from '@vigmis/ad-connectors';
import { createProtocol } from '../routes/protocols.js';
import { recordApprovedCreative } from '../services/learning-loop.js';

const MIN_CLICKS_PER_VARIANT = 50;
const MIN_DAYS = 7;
const MAX_DAYS = 30; // Force-conclude after this — prevents tests running forever

// Two-proportion z-test on CTR.
// |z| > 1.96 → 95% statistical confidence that the difference is real.
function ctrZTest(
  clicksA: number, impressionsA: number,
  clicksB: number, impressionsB: number,
): number {
  if (impressionsA < 1 || impressionsB < 1) return 0;
  const p1 = clicksA / impressionsA;
  const p2 = clicksB / impressionsB;
  const pPool = (clicksA + clicksB) / (impressionsA + impressionsB);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / impressionsA + 1 / impressionsB));
  if (se === 0) return 0;
  return (p1 - p2) / se;
}

// Returns true if this campaign is currently under an active A/B test —
// the optimization engine skips budget changes for such campaigns.
export async function hasActiveAbTest(tenantId: string, campaignId: string): Promise<boolean> {
  const { data } = await db
    .from('ab_tests')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('campaign_id', campaignId)
    .eq('status', 'running')
    .maybeSingle();
  return !!data;
}

// Main entry point — called once per tenant after the campaign loop.
export async function evaluateAbTests(tenantId: string): Promise<void> {
  const { data: tests } = await db
    .from('ab_tests')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'running')
    .eq('winner_announced', false);

  if (!tests?.length) return;

  for (const test of tests) {
    try {
      await processTest(tenantId, test);
    } catch (err) {
      console.error(`A/B test ${test.id} evaluation error:`, err);
    }
  }
}

async function processTest(tenantId: string, test: any): Promise<void> {
  const variants: any[] = test.variants ?? [];
  if (variants.length < 2) return;

  const daysRunning = Math.max(1, Math.floor(
    (Date.now() - new Date(test.started_at).getTime()) / (1000 * 60 * 60 * 24)
  ));

  // Sync real Meta insights per Ad Set
  let synced = [...variants];
  if (test.platform === 'meta') {
    for (let i = 0; i < synced.length; i++) {
      const v = synced[i];
      if (!v.ad_set_external_id) continue;
      const metrics = await getMetaAdSetInsights(v.ad_set_external_id, tenantId, daysRunning + 1);
      if (metrics) synced[i] = { ...v, ...metrics };
    }
    await db.from('ab_tests').update({ variants: synced }).eq('id', test.id);
  }

  const [a, b] = synced;
  const clicksA      = a.clicks ?? 0;
  const clicksB      = b.clicks ?? 0;
  const rawImpressionsA = a.impressions ?? 0;
  const rawImpressionsB = b.impressions ?? 0;
  // Floor to 1 only for safe division — raw values are used for display
  const impressionsA = Math.max(rawImpressionsA, 1);
  const impressionsB = Math.max(rawImpressionsB, 1);

  const hasEnoughData = clicksA >= MIN_CLICKS_PER_VARIANT
    && clicksB >= MIN_CLICKS_PER_VARIANT
    && daysRunning >= MIN_DAYS;
  const forceConclude = daysRunning >= MAX_DAYS;

  if (!hasEnoughData && !forceConclude) return;

  // Statistical analysis
  const ctrA = clicksA / impressionsA;
  const ctrB = clicksB / impressionsB;
  const z = ctrZTest(clicksA, impressionsA, clicksB, impressionsB);
  const isSignificant = Math.abs(z) >= 1.96;

  const winnerIdx = ctrA >= ctrB ? 0 : 1;
  const loserIdx  = winnerIdx === 0 ? 1 : 0;
  const winner    = synced[winnerIdx];
  const loser     = synced[loserIdx];
  const winnerLabel = winnerIdx === 0 ? 'Variant A' : 'Variant B';

  const winnerCtr = Math.max(ctrA, ctrB);
  const loserCtr  = Math.min(ctrA, ctrB);
  const ctrLift   = loserCtr > 0
    ? `+${(((winnerCtr - loserCtr) / loserCtr) * 100).toFixed(0)}%`
    : 'N/A';

  const conclusion = {
    winner_index: winnerIdx,
    winner_name: winner.name,
    confidence: isSignificant ? 'high' : forceConclude ? 'low' : 'medium',
    key_reason: isSignificant
      ? `${winnerLabel} achieved ${(winnerCtr * 100).toFixed(2)}% CTR vs ${(loserCtr * 100).toFixed(2)}% — 95% statistically significant (z=${z.toFixed(2)})`
      : `Test ran ${daysRunning} days — ${winnerLabel} performed marginally better but without statistical significance`,
    ctr_lift: ctrLift,
    recommendation: isSignificant
      ? `Scale "${winner.name}" as primary creative. Pause "${loser.name}".`
      : `Results were inconclusive. Consider running a fresh test with a more distinct creative difference.`,
    z_score: parseFloat(z.toFixed(3)),
    days_ran: daysRunning,
  };

  // Pause losing Meta Ad Set automatically when winner is clear
  if (test.platform === 'meta' && loser.ad_set_external_id && isSignificant) {
    await pauseMetaAdSet(loser.ad_set_external_id, tenantId);
  }

  // Close the learning loop — inject A/B winner into Creative Director memory
  if (isSignificant && winner.name) {
    recordApprovedCreative(
      tenantId,
      test.id,
      'animation',
      {
        script: winner.name,
        abTestId: test.id,
        ctrLift,
        winnerCtr: (winnerCtr * 100).toFixed(2) + '%',
        daysRan: daysRunning,
        platform: test.platform,
      },
      0,
      0,
    ).catch(err => console.error('[ab-learning] failed:', err instanceof Error ? err.message : err));
  }

  // Mark concluded in DB
  await db.from('ab_tests').update({
    status: 'concluded',
    winner_announced: true,
    conclusion,
    concluded_at: new Date().toISOString(),
  }).eq('id', test.id);

  // Create Decision Protocol with winner announcement
  const variantSummary = [
    `• ${a.name} (Variant A): ${(ctrA * 100).toFixed(2)}% CTR — ${clicksA} clicks / ${rawImpressionsA.toLocaleString()} impressions`,
    `• ${b.name} (Variant B): ${(ctrB * 100).toFixed(2)}% CTR — ${clicksB} clicks / ${rawImpressionsB.toLocaleString()} impressions`,
  ].join('\n');

  await createProtocol({
    tenantId,
    type: 'creative_refresh',
    title: isSignificant
      ? `A/B Test result: "${winner.name}" wins with ${ctrLift} higher CTR`
      : `A/B Test concluded after ${daysRunning} days — inconclusive result`,
    recommendation: [
      `The A/B test "${test.name}" has concluded after ${daysRunning} days.`,
      ``,
      `Results:`,
      variantSummary,
      ``,
      isSignificant
        ? `Winner: **${winnerLabel} — "${winner.name}"** (${ctrLift} CTR lift, 95% confidence).`
        : `No statistically significant winner (z-score = ${z.toFixed(2)}, need ≥1.96 for 95% confidence).`,
      ``,
      conclusion.recommendation,
    ].join('\n'),
    approvalText: isSignificant
      ? `I approve scaling "${winner.name}" as the primary creative and pausing "${loser.name}".`
      : `I acknowledge the A/B test results — no clear winner was found.`,
    approvalSummary: isSignificant
      ? `A/B winner: ${winnerLabel} — "${winner.name}" (${ctrLift})`
      : `A/B Test inconclusive after ${daysRunning} days`,
    actionPayload: {
      testId: test.id,
      winnerAdSetId: winner.ad_set_external_id ?? null,
      loserAdSetId: loser.ad_set_external_id ?? null,
      isSignificant,
    },
    campaignId: test.campaign_id ?? undefined,
    platform: test.platform,
  });
}
