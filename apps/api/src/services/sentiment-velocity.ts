// Sentiment Velocity — crisis detection that triggers on RATE of change, not
// on absolute counts.
//
// A single complaint is not a crisis. 10 complaints in 2 hours for a brand
// that normally gets 1 a week IS a crisis. The math:
//
//   baseline = mean of last 7 daily snapshots
//   stddev   = stddev of last 7 daily snapshots
//   today's value > baseline + 2.5 × stddev → crisis
//
// We track per-sentiment crises (complaint, angry, hate, legal_risk) plus a
// combined "negative" bucket.
//
// On crisis: send urgent WhatsApp + Email alert + mark in sentiment_velocity
// snapshot to prevent repeated alerts within the same day.

import { db } from '@vigmis/db';
import { sendTenantNotification } from './notify.js';

const CRISIS_Z_SCORE = 2.5;
const MIN_BASELINE_DAYS = 5;   // need at least N days of data to compute a meaningful baseline
const MIN_TODAY_COUNT = 3;     // need at least N events today to even consider crisis

interface SentimentCounts {
  positive: number;
  question: number;
  complaint: number;
  angry: number;
  troll: number;
  hate: number;
  legal_risk: number;
  total: number;
}

const NEGATIVE_KEYS: (keyof SentimentCounts)[] = ['complaint', 'angry', 'hate', 'legal_risk'];

/**
 * Snapshot today's comment volumes by sentiment for one tenant.
 * Idempotent — re-running on the same day updates the existing row.
 */
export async function snapshotTenantSentimentToday(tenantId: string): Promise<SentimentCounts | null> {
  const today = new Date().toISOString().slice(0, 10);
  const startOfDay = `${today}T00:00:00.000Z`;

  const { data } = await db.from('social_comments')
    .select('sentiment')
    .eq('tenant_id', tenantId)
    .gte('commented_at', startOfDay);

  if (!data) return null;

  const counts: SentimentCounts = {
    positive: 0, question: 0, complaint: 0, angry: 0, troll: 0, hate: 0, legal_risk: 0, total: 0,
  };
  for (const row of data as { sentiment: keyof SentimentCounts }[]) {
    if (row.sentiment in counts) {
      counts[row.sentiment] = (counts[row.sentiment] ?? 0) + 1;
    }
    counts.total++;
  }

  await db.from('sentiment_velocity_snapshot').upsert(
    {
      tenant_id: tenantId,
      date: today,
      positive_count: counts.positive,
      question_count: counts.question,
      complaint_count: counts.complaint,
      angry_count: counts.angry,
      troll_count: counts.troll,
      hate_count: counts.hate,
      legal_risk_count: counts.legal_risk,
      total_count: counts.total,
    },
    { onConflict: 'tenant_id,date' },
  );

  return counts;
}

/**
 * Compute mean + stddev for a metric over the last N daily snapshots.
 */
function computeBaseline(values: number[]): { mean: number; stddev: number } {
  if (values.length === 0) return { mean: 0, stddev: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, stddev: Math.sqrt(variance) };
}

export interface CrisisDecision {
  is_crisis: boolean;
  reason: string;
  triggers: Array<{
    metric: string;
    today: number;
    baseline_mean: number;
    baseline_stddev: number;
    z_score: number;
  }>;
}

export async function detectCrisisForTenant(tenantId: string): Promise<CrisisDecision> {
  const today = new Date().toISOString().slice(0, 10);
  const lookbackStart = new Date(Date.now() - 7 * 24 * 3600_000).toISOString().slice(0, 10);

  const { data: history } = await db.from('sentiment_velocity_snapshot')
    .select('date, complaint_count, angry_count, hate_count, legal_risk_count, total_count, is_crisis, crisis_alert_sent')
    .eq('tenant_id', tenantId)
    .gte('date', lookbackStart)
    .order('date', { ascending: false });

  if (!history || history.length === 0) {
    return { is_crisis: false, reason: 'no_data', triggers: [] };
  }

  const todaysRow = history.find((r: { date: string }) => r.date === today);
  if (!todaysRow) {
    return { is_crisis: false, reason: 'no_snapshot_today', triggers: [] };
  }
  if (todaysRow.crisis_alert_sent) {
    return { is_crisis: true, reason: 'already_alerted_today', triggers: [] };
  }

  const baselineRows = history.filter((r: { date: string }) => r.date !== today);
  if (baselineRows.length < MIN_BASELINE_DAYS) {
    return { is_crisis: false, reason: `insufficient_baseline (have ${baselineRows.length} days, need ${MIN_BASELINE_DAYS})`, triggers: [] };
  }

  const triggers: CrisisDecision['triggers'] = [];

  for (const metric of [...NEGATIVE_KEYS, 'total' as const]) {
    const today_value = Number(todaysRow[`${metric}_count` as keyof typeof todaysRow]) || 0;
    if (metric !== 'total' && today_value < MIN_TODAY_COUNT) continue;

    const baselineValues = baselineRows.map((r: any) => Number(r[`${metric}_count`]) || 0);
    const { mean, stddev } = computeBaseline(baselineValues);
    if (stddev === 0 && today_value > mean * 3 && today_value >= MIN_TODAY_COUNT) {
      // No variance in baseline — flat zero — and today there's volume. That's a spike.
      triggers.push({ metric, today: today_value, baseline_mean: mean, baseline_stddev: 0, z_score: Infinity });
      continue;
    }
    if (stddev === 0) continue;
    const z = (today_value - mean) / stddev;
    if (z >= CRISIS_Z_SCORE) {
      triggers.push({ metric, today: today_value, baseline_mean: mean, baseline_stddev: stddev, z_score: z });
    }
  }

  if (triggers.length === 0) {
    return { is_crisis: false, reason: 'no_significant_deviation', triggers: [] };
  }

  // Mark the snapshot as crisis
  const reasonParts = triggers.map((t) =>
    `${t.metric}: ${t.today} today vs ${t.baseline_mean.toFixed(1)} avg (z=${t.z_score.toFixed(1)})`,
  );
  await db.from('sentiment_velocity_snapshot')
    .update({
      is_crisis: true,
      crisis_reason: reasonParts.join('; '),
    })
    .eq('tenant_id', tenantId)
    .eq('date', today);

  return {
    is_crisis: true,
    reason: reasonParts.join('; '),
    triggers,
  };
}

/**
 * Snapshot + detect + alert. The cron-friendly all-in-one.
 */
export async function evaluateAndAlertTenant(tenantId: string): Promise<{
  snapshot: SentimentCounts | null;
  decision: CrisisDecision;
  alerted: boolean;
}> {
  const snapshot = await snapshotTenantSentimentToday(tenantId);
  const decision = await detectCrisisForTenant(tenantId);

  let alerted = false;
  if (decision.is_crisis && decision.triggers.length > 0) {
    await sendTenantNotification(
      tenantId,
      'Sentiment spike detected on your social posts',
      `Vigmis noticed an unusual volume of negative comments today: ${decision.reason}. Open Comments tab to triage.`,
      'critical',
      'Open Comments tab',
    ).catch(() => null);
    await db.from('sentiment_velocity_snapshot')
      .update({ crisis_alert_sent: true })
      .eq('tenant_id', tenantId)
      .eq('date', new Date().toISOString().slice(0, 10));
    alerted = true;
  }

  return { snapshot, decision, alerted };
}

/**
 * Cron — runs hourly. Calls evaluateAndAlertTenant for every tenant with
 * recent comment activity.
 */
export async function dispatchCrisisCron(): Promise<{ tenants: number; alerts: number }> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: rows } = await db.from('social_comments')
    .select('tenant_id')
    .gte('commented_at', since);
  const tenants = [...new Set((rows ?? []).map((r: { tenant_id: string }) => r.tenant_id))];

  let alerts = 0;
  for (const t of tenants) {
    const r = await evaluateAndAlertTenant(t).catch(() => ({ alerted: false }));
    if (r.alerted) alerts++;
  }
  return { tenants: tenants.length, alerts };
}
