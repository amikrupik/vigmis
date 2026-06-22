// Maintenance cron services:
//   runGhostCleanup      — warn tenants with no campaigns after 30 days, soft-delete after 60
//   runCreativeDiscard   — auto-discard creative_jobs that are completed but unreviewed after 7 days
//   runStuckJobTimeout   — fail creative_jobs stuck in 'processing' for >30 min; restore credit if original generation

import { db } from '@vigmis/db';
import { sendEmail } from './notify.js';

const WEB_URL = process.env.WEB_URL ?? 'https://vigmis.com';

// ── Ghost cleanup ──────────────────────────────────────────────────────────────
// Day 30: first nudge email
// Day 60: second email ("account will be removed")
// Does NOT delete accounts — that must be a manual or explicit action. Keeps signal clean.

export async function runGhostCleanup(log: (msg: string) => void) {
  const now = new Date();
  const day30Cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const day60Cutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

  // Find all tenants that have no campaigns at all
  const { data: tenants } = await db
    .from('tenants')
    .select('id, created_at')
    .order('created_at', { ascending: true });

  if (!tenants?.length) return { nudged: 0, warned: 0 };

  // Get tenant IDs that have at least one campaign
  const { data: activeTenants } = await db
    .from('campaigns')
    .select('tenant_id');

  const activeTenantIds = new Set((activeTenants ?? []).map((r: any) => r.tenant_id));

  const ghosts = tenants.filter((t: any) => !activeTenantIds.has(t.id));

  let nudged = 0;
  let warned = 0;

  for (const tenant of ghosts) {
    const createdAt = tenant.created_at as string;

    // Load settings for email + name
    const { data: settings } = await db
      .from('client_settings')
      .select('business_name, content_language, notification_email')
      .eq('tenant_id', tenant.id)
      .maybeSingle();

    const email = (settings as any)?.notification_email;
    if (!email) continue;

    const name = (settings as any)?.business_name ?? 'there';

    if (createdAt <= day60Cutoff) {
      // Second warning at day 60
      await sendEmail(
        email,
        'Final reminder — your Vigmis account has no active campaigns',
        ghostWarningEmail(name, true),
        tenant.id,
      );
      log(`day-60 warning sent: ${tenant.id}`);
      warned++;
    } else if (createdAt <= day30Cutoff) {
      // First nudge at day 30
      await sendEmail(
        email,
        'Your Vigmis account is ready — launch your first campaign',
        ghostWarningEmail(name, false),
        tenant.id,
      );
      log(`day-30 nudge sent: ${tenant.id}`);
      nudged++;
    }
  }

  return { nudged, warned };
}

function ghostWarningEmail(name: string, isFinal: boolean): string {
  const cta = `<a href="${WEB_URL}/dashboard" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px">Launch your first campaign</a>`;
  const urgency = isFinal
    ? `<p style="color:#ef4444;font-weight:600">This is a final reminder. Accounts with no activity for 60 days may be reviewed for removal.</p>`
    : '';

  return `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
  <img src="${WEB_URL}/logo.png" alt="Vigmis" style="height:32px;margin-bottom:24px" />
  <h2 style="color:#1e293b;margin:0 0 16px">Hi ${name} 👋</h2>
  <p style="color:#475569;line-height:1.6">
    Your Vigmis account is set up but you haven't launched a campaign yet.
    When you're ready, your AI marketing manager is waiting — strategy, creatives, and posting on autopilot.
  </p>
  ${urgency}
  ${cta}
  <p style="color:#94a3b8;font-size:13px;margin-top:24px">
    Questions? Reply to this email or reach us at <a href="mailto:hello@vigmis.com">hello@vigmis.com</a>
  </p>
</div>`;
}

// ── Stuck job timeout ─────────────────────────────────────────────────────────
// creative_jobs with status = 'processing' and updated_at older than 30 min → mark 'failed'
// Restores scale credit for original generations (revision_number === 0) on pro plan tenants.

export async function runStuckJobTimeout(log: (msg: string) => void) {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: stuckJobs, error } = await db
    .from('creative_jobs')
    .select('id, tenant_id, type, revision_number, credit_consumed')
    .eq('status', 'processing')
    .lt('updated_at', cutoff);

  if (error) {
    log(`stuck-job-timeout query error: ${error.message}`);
    return { timedOut: 0 };
  }

  if (!stuckJobs?.length) {
    log('stuck-job-timeout: nothing to time out');
    return { timedOut: 0 };
  }

  let timedOut = 0;

  for (const job of stuckJobs) {
    const { error: updateErr } = await db
      .from('creative_jobs')
      .update({
        status: 'failed',
        error_message: 'Job timed out — provider did not respond',
        updated_at: new Date().toISOString(),
      })
      .eq('id', (job as any).id);

    if (updateErr) {
      log(`stuck-job-timeout: failed to update job ${(job as any).id}: ${updateErr.message}`);
      continue;
    }

    // Restore credit only for original generations (not revisions) where credit was consumed
    if ((job as any).revision_number === 0 && (job as any).credit_consumed) {
      await restoreScaleCreditForTimeout((job as any).tenant_id, (job as any).type);
    }

    log(`stuck-job-timeout: timed out job ${(job as any).id} (tenant=${(job as any).tenant_id}, type=${(job as any).type}, rev=${(job as any).revision_number})`);
    timedOut++;
  }

  return { timedOut };
}

// Inline credit restore — mirrors restoreScaleCredit in routes/creatives.ts (not exported from there)
async function restoreScaleCreditForTimeout(tenantId: string, jobType: string): Promise<void> {
  const creditType = jobType === 'image' ? 'image' : 'video';

  const { data: billing } = await db
    .from('billing_customers')
    .select('plan, scale_video_credits_used, scale_image_credits_used')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!billing || (billing as any).plan !== 'pro') return;

  if (creditType === 'video') {
    const used = Math.max(0, ((billing as any).scale_video_credits_used ?? 1) - 1);
    await db
      .from('billing_customers')
      .update({ scale_video_credits_used: used, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId);
  } else {
    const used = Math.max(0, ((billing as any).scale_image_credits_used ?? 1) - 1);
    await db
      .from('billing_customers')
      .update({ scale_image_credits_used: used, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId);
  }
}

// ── Auto-discard ───────────────────────────────────────────────────────────────
// creative_jobs with status = 'completed' and not approved after 7 days → mark 'rejected'

export async function runCreativeDiscard(log: (msg: string) => void) {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: expiredJobs, error } = await db
    .from('creative_jobs')
    .select('id, tenant_id, type')
    .eq('status', 'completed')
    .is('approved_at', null)   // not explicitly approved
    .lt('updated_at', cutoff);

  if (error) {
    log(`auto-discard query error: ${error.message}`);
    return { discarded: 0 };
  }

  if (!expiredJobs?.length) {
    log('auto-discard: nothing to expire');
    return { discarded: 0 };
  }

  const ids = expiredJobs.map((j: any) => j.id);

  const { error: updateErr } = await db
    .from('creative_jobs')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .in('id', ids);

  if (updateErr) {
    log(`auto-discard update error: ${updateErr.message}`);
    return { discarded: 0 };
  }

  log(`auto-discard: expired ${ids.length} jobs`);
  return { discarded: ids.length };
}
