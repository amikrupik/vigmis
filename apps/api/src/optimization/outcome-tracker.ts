// Outcome Tracker — closes the decision feedback loop.
//
// Problem: Vigmis makes hundreds of optimization decisions (scale up, scale down,
// creative refresh, pause). But no one ever checked whether they worked.
// A "scale up" that caused the CTR to drop is worse than doing nothing.
//
// This service:
//   1. Finds approved protocols that are 7-14 days old (the check_after window)
//   2. Compares CTR/ROAS before and after the decision
//   3. Writes outcome to audit_log as optimization.outcome_measured
//   4. Aggregates batting average per decision_type into client_settings.decision_quality_stats
//   5. Strategic Brain reads these outcomes in its weekly context
//
// Runs daily. Idempotent: each protocol can only produce one outcome measurement.

import { db } from '@vigmis/db';

export interface OutcomeMeasurement {
  protocolId: string;
  type: string;
  ctrBefore: number | null;
  ctrAfter: number | null;
  roasBefore: number | null;
  roasAfter: number | null;
  deltaPercent: number | null;
  verdict: 'improved' | 'worsened' | 'neutral' | 'insufficient_data';
  confidence: number;
  sampleSizeBefore: number;
  sampleSizeAfter: number;
  measuredAt: string;
}

const OUTCOME_ACTION = 'optimization.outcome_measured';

export async function runOutcomeTracker(): Promise<void> {
  if (process.env.ENABLE_OUTCOME_TRACKER === 'false') return;

  const now = new Date();
  const checkWindowStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const checkWindowEnd   = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000).toISOString();

  // Approved protocols whose check_after is in the past (overdue for measurement)
  const { data: protocols } = await db
    .from('decision_protocols')
    .select('id, tenant_id, type, campaign_id, platform, resolved_at, action_payload')
    .eq('status', 'approved')
    .not('check_after', 'is', null)
    .lte('check_after', now.toISOString())
    .limit(50);

  if (!protocols?.length) return;

  // Idempotency: only process protocols that haven't been measured yet.
  // Filter by tenant_id set to avoid cross-tenant false matches on protocolId.
  const ids = protocols.map(p => p.id);
  const tenantIds = [...new Set(protocols.map(p => p.tenant_id))];
  const { data: alreadyMeasured } = await db
    .from('audit_log')
    .select('payload')
    .eq('action', OUTCOME_ACTION)
    .in('tenant_id', tenantIds)
    .in('payload->protocolId', ids as any);

  const measuredIds = new Set(
    (alreadyMeasured ?? []).map((r: any) => (r.payload as any)?.protocolId as string)
  );

  const toProcess = protocols.filter(p => !measuredIds.has(p.id));
  if (!toProcess.length) return;

  const outcomesByTenant: Record<string, OutcomeMeasurement[]> = {};

  for (const protocol of toProcess) {
    try {
      const outcome = await measureOutcome(protocol);
      if (!outcome) continue;

      await db.from('audit_log').insert({
        tenant_id: protocol.tenant_id,
        action: OUTCOME_ACTION,
        platform: protocol.platform ?? null,
        actor: 'system',
        payload: outcome,
      });

      if (!outcomesByTenant[protocol.tenant_id]) {
        outcomesByTenant[protocol.tenant_id] = [];
      }
      outcomesByTenant[protocol.tenant_id].push(outcome);
    } catch (err) {
      console.error(`[outcome-tracker] protocol=${protocol.id} error:`, err instanceof Error ? err.message : err);
    }
  }

  // Update decision quality stats per tenant
  for (const [tenantId, outcomes] of Object.entries(outcomesByTenant)) {
    await updateDecisionQuality(tenantId, outcomes);
  }

  console.log(`[outcome-tracker] measured ${toProcess.length} protocols`);
}

async function measureOutcome(protocol: any): Promise<OutcomeMeasurement | null> {
  const campaignId = protocol.campaign_id ?? (protocol.action_payload as any)?.campaignId;
  if (!campaignId) return null;

  const resolvedAt = new Date(protocol.resolved_at);
  const windowDays = 7;

  // Snapshots BEFORE the decision (7 days before approval)
  const beforeStart = new Date(resolvedAt.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: snapshotsBefore } = await db
    .from('audit_log')
    .select('payload')
    .eq('tenant_id', protocol.tenant_id)
    .eq('action', 'optimization.metrics_snapshot')
    .contains('payload', { campaignId })
    .gte('created_at', beforeStart)
    .lt('created_at', resolvedAt.toISOString())
    .order('created_at', { ascending: false })
    .limit(7);

  // Snapshots AFTER the decision (7 days after approval)
  const afterEnd = new Date(resolvedAt.getTime() + windowDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: snapshotsAfter } = await db
    .from('audit_log')
    .select('payload')
    .eq('tenant_id', protocol.tenant_id)
    .eq('action', 'optimization.metrics_snapshot')
    .contains('payload', { campaignId })
    .gte('created_at', resolvedAt.toISOString())
    .lte('created_at', afterEnd)
    .order('created_at', { ascending: true })
    .limit(7);

  const bSnaps = snapshotsBefore ?? [];
  const aSnaps = snapshotsAfter ?? [];

  const avgCtr = (snaps: any[]) => {
    if (!snaps.length) return null;
    return snaps.reduce((s, r) => s + ((r.payload as any)?.ctr ?? 0), 0) / snaps.length;
  };
  const avgRoas = (snaps: any[]) => {
    const withRoas = snaps.filter(r => (r.payload as any)?.roas);
    if (!withRoas.length) return null;
    return withRoas.reduce((s, r) => s + ((r.payload as any)?.roas ?? 0), 0) / withRoas.length;
  };

  const ctrBefore  = avgCtr(bSnaps);
  const ctrAfter   = avgCtr(aSnaps);
  const roasBefore = avgRoas(bSnaps);
  const roasAfter  = avgRoas(aSnaps);

  const minSamples = 3;
  if (bSnaps.length < minSamples || aSnaps.length < minSamples) {
    return {
      protocolId: protocol.id,
      type: protocol.type,
      ctrBefore, ctrAfter, roasBefore, roasAfter,
      deltaPercent: null,
      verdict: 'insufficient_data',
      confidence: 0,
      sampleSizeBefore: bSnaps.length,
      sampleSizeAfter: aSnaps.length,
      measuredAt: new Date().toISOString(),
    };
  }

  // Primary signal: ROAS if available, else CTR
  const before = roasBefore ?? ctrBefore;
  const after  = roasAfter  ?? ctrAfter;
  const deltaPercent = (before && before > 0 && after !== null)
    ? ((after - before) / before) * 100
    : null;

  let verdict: OutcomeMeasurement['verdict'] = 'neutral';
  if (deltaPercent !== null) {
    if (deltaPercent > 5)  verdict = 'improved';
    if (deltaPercent < -5) verdict = 'worsened';
  }

  const confidence = Math.min(1, (bSnaps.length + aSnaps.length) / 14);

  return {
    protocolId: protocol.id,
    type: protocol.type,
    ctrBefore, ctrAfter, roasBefore, roasAfter,
    deltaPercent,
    verdict,
    confidence,
    sampleSizeBefore: bSnaps.length,
    sampleSizeAfter: aSnaps.length,
    measuredAt: new Date().toISOString(),
  };
}

async function updateDecisionQuality(tenantId: string, outcomes: OutcomeMeasurement[]): Promise<void> {
  const { data: settings } = await db
    .from('client_settings')
    .select('decision_quality_stats')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const stats = ((settings as any)?.decision_quality_stats ?? {}) as Record<string, {
    decisions: number; improved: number; worsened: number; batting_avg: number;
  }>;

  for (const outcome of outcomes) {
    if (outcome.verdict === 'insufficient_data') continue;
    const type = outcome.type;
    if (!stats[type]) stats[type] = { decisions: 0, improved: 0, worsened: 0, batting_avg: 0 };
    stats[type].decisions++;
    if (outcome.verdict === 'improved') stats[type].improved++;
    if (outcome.verdict === 'worsened') stats[type].worsened++;
    const total = stats[type].improved + stats[type].worsened;
    stats[type].batting_avg = total > 0 ? stats[type].improved / total : 0;
  }

  await db.from('client_settings')
    .update({ decision_quality_stats: stats, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId);
}

// Called from protocols.ts approve handler — sets check_after for outcome tracking
export async function scheduleOutcomeCheck(protocolId: string, delayDays = 10): Promise<void> {
  const checkAfter = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000).toISOString();
  await db.from('decision_protocols')
    .update({ check_after: checkAfter })
    .eq('id', protocolId);
}

// Returns last N outcome measurements for a tenant (for Strategic Brain context)
export async function getRecentOutcomes(tenantId: string, limit = 5): Promise<OutcomeMeasurement[]> {
  const { data } = await db
    .from('audit_log')
    .select('payload, created_at')
    .eq('tenant_id', tenantId)
    .eq('action', OUTCOME_ACTION)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map(r => r.payload as OutcomeMeasurement);
}
