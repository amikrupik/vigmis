// Periodic Re-Attestation — quarterly nudge to re-confirm onboarding_master.
//
// The original onboarding_master attestation is signed once. But businesses
// change: prices move, products turn over, licenses expire. After 90 days
// the signature is stale evidence.
//
// This service runs daily and flags tenants whose latest attestation is older
// than 90 days. They get an email + WhatsApp reminder. When they click
// through and re-sign in the UI, a new content_attestations row is logged.

import { db } from '@vigmis/db';
import { sendEmail } from './notify.js';

const REATTEST_AFTER_DAYS = 90;
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

export interface ReAttestationStatus {
  tenant_id: string;
  needs_reattest: boolean;
  last_attested_at: string | null;
  days_since: number | null;
}

/**
 * Check if a tenant needs re-attestation. Used both by the cron and by the
 * UI to surface a banner.
 */
export async function checkReAttestationStatus(tenantId: string): Promise<ReAttestationStatus> {
  const { data } = await db.from('content_attestations')
    .select('signed_at')
    .eq('tenant_id', tenantId)
    .eq('attestation_kind', 'onboarding_master')
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { tenant_id: tenantId, needs_reattest: false, last_attested_at: null, days_since: null };
  }

  const days = Math.floor((Date.now() - new Date(data.signed_at).getTime()) / (24 * 3600_000));
  return {
    tenant_id: tenantId,
    needs_reattest: days >= REATTEST_AFTER_DAYS,
    last_attested_at: data.signed_at,
    days_since: days,
  };
}

/**
 * Daily cron — find tenants needing re-attestation, send reminders. Don't
 * spam: only one reminder per tenant per 14-day window.
 */
export async function dispatchReAttestationCron(): Promise<{ checked: number; reminded: number }> {
  const cutoff = new Date(Date.now() - REATTEST_AFTER_DAYS * 24 * 3600_000).toISOString();
  // Latest onboarding_master per tenant
  const { data: latest } = await db.from('content_attestations')
    .select('tenant_id, signed_at')
    .eq('attestation_kind', 'onboarding_master')
    .lt('signed_at', cutoff)
    .order('signed_at', { ascending: false });

  if (!latest || latest.length === 0) return { checked: 0, reminded: 0 };

  // Deduplicate to latest-per-tenant
  const seen = new Set<string>();
  const candidates = (latest as { tenant_id: string; signed_at: string }[])
    .filter((row) => { if (seen.has(row.tenant_id)) return false; seen.add(row.tenant_id); return true; });

  let reminded = 0;
  const reminderWindow = new Date(Date.now() - 14 * 24 * 3600_000).toISOString();

  for (const row of candidates) {
    // Skip if a fresher onboarding_master exists (e.g., they already re-signed)
    const { data: fresher } = await db.from('content_attestations')
      .select('id')
      .eq('tenant_id', row.tenant_id)
      .eq('attestation_kind', 'onboarding_master')
      .gte('signed_at', cutoff)
      .maybeSingle();
    if (fresher) continue;

    // Skip if we already reminded recently
    const { data: lastReminder } = await db.from('audit_log')
      .select('id')
      .eq('tenant_id', row.tenant_id)
      .eq('action', 'reattestation.reminder_sent')
      .gte('created_at', reminderWindow)
      .maybeSingle();
    if (lastReminder) continue;

    // Send reminder
    const { data: alertSettings } = await db.from('alert_settings')
      .select('email, email_enabled')
      .eq('tenant_id', row.tenant_id)
      .maybeSingle();

    if (alertSettings?.email_enabled && alertSettings.email) {
      await sendEmail(
        alertSettings.email,
        'Vigmis: please re-confirm your business information',
        `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="color:#0f172a">Time for a quick re-confirmation</h2>
  <p style="color:#475569">It's been 90 days since you last confirmed that the business information, claims, prices, and media in Vigmis are accurate. Businesses change — please take a moment to confirm everything is still current, or update what isn't.</p>
  <a href="${WEB_URL}/dashboard?reattest=1" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:600;padding:10px 24px;border-radius:10px;text-decoration:none;font-size:14px;margin-top:16px">Confirm now</a>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px">This is a routine compliance reminder. If you do nothing, Vigmis continues running but may pause new high-stakes ad approvals.</p>
</div>`,
        row.tenant_id,
      ).catch(() => null);
    }

    await db.from('audit_log').insert({
      tenant_id: row.tenant_id,
      action: 'reattestation.reminder_sent',
      actor: 'system',
      payload: { last_attested_at: row.signed_at, days_since: Math.floor((Date.now() - new Date(row.signed_at).getTime()) / (24 * 3600_000)) },
    });

    reminded++;
  }

  return { checked: candidates.length, reminded };
}
