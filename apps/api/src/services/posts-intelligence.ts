// Posts Intelligence — aligns organic social content with live paid campaigns.
//
// Before this: posts were generated from strategy + website context alone.
// After this:  posts know what paid ads are running TODAY, what angle is working,
//              and what the campaign urgently needs from organic support.
//
// Examples of what this unlocks:
// - "Your Google ads are promoting the summer offer — reinforce this in posts"
// - "Retargeting campaigns are live — organic posts should build trust, not sell"
// - "Learning phase: ads need social proof — posts should share testimonials"
// - "Top performing creative uses scarcity hook — mirror this in captions"
//
// Designed to be non-blocking: if campaign data is unavailable, returns null
// and the post is generated without the intelligence layer (graceful degradation).

import { db } from '@vigmis/db';

export interface CampaignIntelligenceSummary {
  // The formatted string injected into the social post prompt
  contextBlock: string;
  // Debug metadata — not sent to AI
  activeCampaignCount: number;
  strategicPhase: 'learning' | 'scaling' | 'optimizing' | 'no_campaigns';
}

interface CampaignRow {
  id: string;
  name: string;
  platform: string;
  status: string;
  daily_budget_usd: number;
  created_at: string;
}

interface CreativeJobRow {
  type: string;
  brief: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

function daysSince(dateString: string): number {
  return Math.floor((Date.now() - new Date(dateString).getTime()) / 86_400_000);
}

function extractBriefHook(brief: Record<string, unknown> | null): string | null {
  if (!brief) return null;
  // Try to get the opening hook or script from the brief object
  const script = typeof brief.script === 'string' ? brief.script : null;
  const prompt = typeof brief.prompt === 'string' ? brief.prompt : null;
  const text = script ?? prompt;
  if (!text) return null;
  // Return only the first sentence (the hook)
  const firstSentence = text.split(/[.!?\n]/)[0]?.trim();
  return firstSentence && firstSentence.length > 10 ? firstSentence.slice(0, 120) : null;
}

export async function buildPostsIntelligence(
  tenantId: string,
): Promise<CampaignIntelligenceSummary | null> {
  try {
    // Fetch active campaigns
    const { data: campaigns } = await db
      .from('campaigns')
      .select('id, name, platform, status, daily_budget_usd, created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .limit(10);

    if (!campaigns || campaigns.length === 0) {
      return {
        contextBlock: '',
        activeCampaignCount: 0,
        strategicPhase: 'no_campaigns',
      };
    }

    const activeCampaigns = campaigns as CampaignRow[];
    const totalBudget = activeCampaigns.reduce((s, c) => s + (c.daily_budget_usd ?? 0), 0);

    // Determine strategic phase by how long the oldest active campaign has been running
    const oldestDays = Math.max(...activeCampaigns.map(c => daysSince(c.created_at)));
    const strategicPhase: CampaignIntelligenceSummary['strategicPhase'] =
      oldestDays < 7 ? 'learning' :
      oldestDays < 21 ? 'scaling' :
      'optimizing';

    // Fetch the most recently approved creative briefs (up to 3) — these are the winning angles
    const { data: approvedCreatives } = await db
      .from('creative_jobs')
      .select('type, brief, status, created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(3);

    const winningHooks = ((approvedCreatives ?? []) as CreativeJobRow[])
      .map(j => extractBriefHook(j.brief))
      .filter(Boolean) as string[];

    // Build platform list
    const platforms = [...new Set(activeCampaigns.map(c => c.platform))];

    // Build the intelligence context block
    const lines: string[] = [
      '\nCAMPAIGN INTELLIGENCE (live paid campaigns — align organic posts with these):',
      `Active paid campaigns: ${activeCampaigns.length} across ${platforms.join(', ')} · Budget: $${totalBudget.toFixed(0)}/day`,
    ];

    // Phase-specific guidance
    if (strategicPhase === 'learning') {
      lines.push(
        'Strategic phase: LEARNING (campaigns < 7 days old).',
        '→ Organic posts should build SOCIAL PROOF right now. Share testimonials, behind-the-scenes, or FAQs.',
        '→ Do NOT make hard sales claims — the paid ads are still gathering data. Organic should warm the audience.',
      );
    } else if (strategicPhase === 'scaling') {
      lines.push(
        'Strategic phase: SCALING (campaigns 1–3 weeks old).',
        '→ Organic posts should REINFORCE the paid message. Echo the same offer, urgency, or angle the ads are using.',
        '→ Consistent cross-channel messaging improves brand recall and lowers paid CPC.',
      );
    } else {
      lines.push(
        'Strategic phase: OPTIMIZING (campaigns 3+ weeks old).',
        '→ Organic posts should AMPLIFY what is working in paid. Double down on the proven angle.',
        '→ Use posts to test new angles cheaply before spending budget on them in paid ads.',
      );
    }

    // Winning hooks from approved creatives
    if (winningHooks.length > 0) {
      lines.push(
        '\nAPPROVED AD HOOKS (these already worked — use similar angles in organic):',
        ...winningHooks.map(h => `  • "${h}"`),
        'Mirror the tone and angle of these hooks. Do NOT copy them word-for-word.',
      );
    }

    // Platform-specific instruction
    if (platforms.includes('google')) {
      lines.push('→ Google Search ads are running: organic posts should reinforce INTENT-based messaging (problem → solution).');
    }
    if (platforms.includes('meta')) {
      lines.push('→ Meta/Instagram ads are running: organic posts should build brand FAMILIARITY and trust (not just sell).');
    }

    lines.push(''); // trailing newline for clean injection

    return {
      contextBlock: lines.join('\n'),
      activeCampaignCount: activeCampaigns.length,
      strategicPhase,
    };
  } catch (err) {
    // Non-blocking: if campaign data fetch fails, post generation continues without it
    console.error('[posts-intelligence] failed to build context, skipping:', err instanceof Error ? err.message : err);
    return null;
  }
}
