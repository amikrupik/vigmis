// Campaign Engine — create, list, pause, resume campaigns
//
// POST /campaigns/launch  — create campaigns from strategy plan
// GET  /campaigns         — list all campaigns for tenant
// POST /campaigns/:id/pause
// POST /campaigns/:id/resume

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import {
  createGoogleCampaign,
  createMetaCampaign,
  createTikTokCampaign,
  pauseGoogleCampaign,
  pauseMetaCampaign,
  pauseTikTokCampaign,
  resumeGoogleCampaign,
  resumeMetaCampaign,
  resumeTikTokCampaign,
} from '@vigmis/ad-connectors';
import type { CampaignSpec } from '@vigmis/ad-connectors';

// How to name campaigns consistently
function buildCampaignName(platform: string, type: string): string {
  const date = new Date().toISOString().slice(0, 10); // 2025-10-01
  const safeType = type.replace(/-/g, '_'); // 'in-feed' → 'IN_FEED'
  return `VIGMIS_${platform.toUpperCase()}_${safeType.toUpperCase()}_${date}`;
}

function detectPlatform(campaignName: string): 'google' | 'meta' | 'tiktok' {
  if (campaignName.includes('GOOGLE')) return 'google';
  if (campaignName.includes('META')) return 'meta';
  if (campaignName.includes('TIKTOK')) return 'tiktok';
  return 'google';
}

// Build campaign specs from strategy plan
function buildSpecs(
  strategyPlan: any,
  managedBudgetUsd: number,
  geoTargets: string[],
  goal: string,
): CampaignSpec[] {
  const specs: CampaignSpec[] = [];

  for (const platform of strategyPlan.platforms ?? []) {
    const platformBudget = (managedBudgetUsd * platform.budget_percentage) / 100;

    for (const type of platform.campaign_types ?? []) {
      const perCampaignBudget = platformBudget / (platform.campaign_types.length || 1);
      specs.push({
        name: buildCampaignName(platform.name, type),
        type,
        dailyBudgetUsd: Math.max(1, Math.round(perCampaignBudget / 30)), // monthly → daily
        geoTargets,
        goal: goal as CampaignSpec['goal'],
      });
    }
  }

  return specs;
}

const LaunchSchema = z.object({
  hasCreative: z.boolean().default(false),
});

export async function campaignRoutes(app: FastifyInstance) {

  // ── Launch campaigns from strategy plan ───────────────────────────────────
  app.post('/campaigns/launch', { preHandler: authenticate }, async (request, reply) => {
    const parsed = LaunchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation error' });
    }

    const { hasCreative } = parsed.data;

    // Load client settings + strategy plan
    const { data: settings, error: settingsErr } = await db
      .from('client_settings')
      .select('strategy_plan, management_percentage, budget_monthly_ils, geo_include, goal')
      .eq('tenant_id', request.tenantId)
      .single();

    if (settingsErr || !settings?.strategy_plan) {
      return reply.code(400).send({ error: 'No strategy plan found. Complete onboarding first.' });
    }

    // Calculate managed budget
    const monthlyBudgetUsd = Math.round(settings.budget_monthly_ils / 3.7);
    const managedBudgetUsd = Math.round(monthlyBudgetUsd * settings.management_percentage / 100);

    // Check which platforms are connected
    const { data: tokens } = await db
      .from('platform_tokens')
      .select('platform, expires_at')
      .eq('tenant_id', request.tenantId);

    const connectedPlatforms = new Set(
      (tokens ?? [])
        .filter(t => !t.expires_at || new Date(t.expires_at) > new Date())
        .map(t => t.platform)
    );

    const specs = buildSpecs(
      settings.strategy_plan,
      managedBudgetUsd,
      settings.geo_include,
      settings.goal,
    ).filter(s => connectedPlatforms.has(detectPlatform(s.name)));

    if (specs.length === 0) {
      return reply.code(400).send({ error: 'No connected platforms. Connect Google, Meta, or TikTok first.' });
    }

    // Create campaigns
    const results = await Promise.all(
      specs.map(async spec => {
        const platform = detectPlatform(spec.name);
        const result =
          platform === 'google' ? await createGoogleCampaign(spec, request.tenantId) :
          platform === 'meta'   ? await createMetaCampaign(spec, request.tenantId) :
                                  await createTikTokCampaign(spec, request.tenantId);

        // Save to DB
        await db.from('campaigns').insert({
          tenant_id: request.tenantId,
          platform: result.platform,
          external_id: result.externalId,
          name: result.name,
          campaign_type: spec.type,
          status: result.status === 'paused' ? 'paused' : result.status === 'error' ? 'error' : 'active',
          daily_budget_usd: spec.dailyBudgetUsd,
          error_message: result.error ?? null,
          updated_at: new Date().toISOString(),
        });

        return result;
      })
    );

    // Audit log
    await db.from('audit_log').insert({
      tenant_id: request.tenantId,
      action: 'campaigns.launched',
      actor: 'user',
      payload: {
        total: results.length,
        success: results.filter(r => r.status !== 'error').length,
        errors: results.filter(r => r.status === 'error').length,
      },
    });

    return reply.code(201).send({ campaigns: results });
  });

  // ── List campaigns ────────────────────────────────────────────────────────
  app.get('/campaigns', { preHandler: authenticate }, async (request, reply) => {
    const { data: campaigns, error } = await db
      .from('campaigns')
      .select('*')
      .eq('tenant_id', request.tenantId)
      .order('created_at', { ascending: false });

    if (error) return reply.code(500).send({ error: 'Failed to fetch campaigns' });
    return reply.send({ campaigns: campaigns ?? [] });
  });

  // ── Pause campaign ────────────────────────────────────────────────────────
  app.post('/campaigns/:id/pause', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const { data: campaign } = await db
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', request.tenantId)
      .single();

    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });
    if (!campaign.external_id) return reply.code(400).send({ error: 'Campaign has no external ID' });

    try {
      if (campaign.platform === 'google') {
        await pauseGoogleCampaign(campaign.external_id, request.tenantId);
      } else if (campaign.platform === 'tiktok') {
        await pauseTikTokCampaign(campaign.external_id, request.tenantId);
      } else {
        await pauseMetaCampaign(campaign.external_id, request.tenantId);
      }

      await db.from('campaigns')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', id);

      return reply.send({ success: true });
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Pause failed' });
    }
  });

  // ── Resume campaign ───────────────────────────────────────────────────────
  app.post('/campaigns/:id/resume', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const { data: campaign } = await db
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', request.tenantId)
      .single();

    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });
    if (!campaign.external_id) return reply.code(400).send({ error: 'Campaign has no external ID' });

    try {
      if (campaign.platform === 'google') {
        await resumeGoogleCampaign(campaign.external_id, request.tenantId);
      } else if (campaign.platform === 'tiktok') {
        await resumeTikTokCampaign(campaign.external_id, request.tenantId);
      } else {
        await resumeMetaCampaign(campaign.external_id, request.tenantId);
      }

      await db.from('campaigns')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', id);

      return reply.send({ success: true });
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Resume failed' });
    }
  });
}
