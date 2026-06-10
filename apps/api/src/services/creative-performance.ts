import { db } from '@vigmis/db';
import { route } from '@vigmis/ai-router';

/**
 * Syncs performance metrics from social_analytics back into creative_jobs.
 * Runs weekly. Builds creative_performance_themes for injection into future briefs.
 */
export async function syncCreativePerformance(): Promise<{ synced: number; themes: number }> {
  // Find approved creatives that have a linked post and haven't been synced yet (or synced >7d ago)
  const { data: jobs } = await db
    .from('creative_jobs')
    .select('id, tenant_id, type, platform, brief, linked_post_id')
    .eq('status', 'approved')
    .not('linked_post_id', 'is', null)
    .or('performance_synced_at.is.null,performance_synced_at.lt.' + new Date(Date.now() - 7 * 86400_000).toISOString());

  if (!jobs?.length) return { synced: 0, themes: 0 };

  let synced = 0;

  for (const job of jobs) {
    try {
      const { data: analytics } = await db
        .from('social_analytics')
        .select('engagement_rate, reach, impressions')
        .eq('post_id', job.linked_post_id)
        .maybeSingle();

      if (!analytics) continue;

      await db.from('creative_jobs').update({
        engagement_rate: analytics.engagement_rate,
        reach: analytics.reach,
        impressions: analytics.impressions,
        performance_synced_at: new Date().toISOString(),
      }).eq('id', job.id);

      synced++;
    } catch { /* continue */ }
  }

  // Build theme aggregates per tenant
  const { data: allJobs } = await db
    .from('creative_jobs')
    .select('tenant_id, type, platform, brief, engagement_rate, reach')
    .eq('status', 'approved')
    .not('engagement_rate', 'is', null)
    .order('engagement_rate', { ascending: false });

  type JobRow = NonNullable<typeof allJobs>[number];
  const tenantMap = new Map<string, JobRow[]>();
  for (const j of allJobs ?? []) {
    if (!tenantMap.has(j.tenant_id)) tenantMap.set(j.tenant_id, []);
    tenantMap.get(j.tenant_id)!.push(j);
  }

  let themesUpdated = 0;

  for (const [tenantId, tenantJobs] of tenantMap) {
    if (!tenantJobs || tenantJobs.length < 3) continue; // need minimum data

    try {
      const topPerformers = tenantJobs.slice(0, Math.min(20, tenantJobs.length));
      const jobSummary = topPerformers.map(j => ({
        type: j.type,
        platform: j.platform,
        hook: (j.brief as any)?.hooks?.[0] ?? (j.brief as any)?.hook ?? '',
        style: (j.brief as any)?.style ?? '',
        engagement: j.engagement_rate,
      }));

      const themeRes = await route({
        task: 'cheap_task',
        prompt: `Analyze these top-performing creatives for an advertiser and identify 3-5 winning themes/patterns.
For each theme, specify: what type of creative it is, what platform, what the hook pattern looks like, and the average engagement rate.

Top performers:
${JSON.stringify(jobSummary, null, 2)}

Return JSON array:
[{"theme": "...", "creative_type": "...", "platform": "...", "avg_engagement": 0.0, "avg_reach": 0, "sample_count": 0, "top_hook": "..."}]`,
        options: { maxTokens: 600 },
      });

      const parsed = JSON.parse(themeRes.output.replace(/```json\n?|\n?```/g, '').trim());
      for (const t of (Array.isArray(parsed) ? parsed : [])) {
        await db.from('creative_performance_themes').upsert({
          tenant_id: tenantId,
          theme: t.theme,
          creative_type: t.creative_type,
          platform: t.platform,
          avg_engagement: t.avg_engagement,
          avg_reach: t.avg_reach,
          sample_count: t.sample_count,
          top_hook: t.top_hook,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id,theme,platform' });
        themesUpdated++;
      }
    } catch { /* continue */ }
  }

  return { synced, themes: themesUpdated };
}

/**
 * Returns winning creative themes for a tenant, for injection into creative briefs.
 */
export async function getWinningThemes(tenantId: string): Promise<string> {
  const { data } = await db
    .from('creative_performance_themes')
    .select('theme, creative_type, platform, avg_engagement, top_hook')
    .eq('tenant_id', tenantId)
    .order('avg_engagement', { ascending: false })
    .limit(5);

  if (!data?.length) return '';

  const lines = data.map(t =>
    `- ${t.theme} (${t.creative_type ?? 'any'} on ${t.platform ?? 'any'}): avg engagement ${((t.avg_engagement ?? 0) * 100).toFixed(1)}%${t.top_hook ? `. Best hook: "${t.top_hook}"` : ''}`
  );
  return `WINNING CREATIVE THEMES FROM THIS ACCOUNT:\n${lines.join('\n')}`;
}
