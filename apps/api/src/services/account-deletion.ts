// Shared account deletion logic — called both from DELETE /account (balance=0)
// and from Stripe webhook (checkout.session.completed with action=account_deletion).

import { db, decryptToken } from '@vigmis/db';
import { createClerkClient } from '@clerk/backend';

async function revokePlatformTokens(tenantId: string, log: (msg: string, err?: unknown) => void): Promise<void> {
  const { data: tokens } = await db
    .from('platform_tokens')
    .select('platform, access_token, refresh_token')
    .eq('tenant_id', tenantId);

  if (!tokens?.length) return;

  for (const t of tokens) {
    if (!t.access_token) continue;
    let access: string;
    try { access = decryptToken(t.access_token); } catch { continue; }

    try {
      if (t.platform === 'meta') {
        await fetch(`https://graph.facebook.com/v19.0/me/permissions?access_token=${encodeURIComponent(access)}`, { method: 'DELETE' });
      } else if (t.platform === 'google') {
        const tokenToRevoke = t.refresh_token ? decryptToken(t.refresh_token) : access;
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
      } else if (t.platform === 'tiktok') {
        const clientKey = process.env.TIKTOK_CLIENT_KEY;
        const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
        if (clientKey && clientSecret) {
          await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, token: access }),
          });
        }
      }
    } catch (err) {
      log(`revoke failed for ${t.platform}`, err);
    }
  }
}

export async function executeAccountDeletion(
  tenantId: string,
  clerkUserId: string | null,
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];
  const log = (msg: string, err?: unknown) => {
    errors.push(msg + (err instanceof Error ? `: ${err.message}` : ''));
  };

  // 1. Pause campaigns so spending stops.
  try {
    await db.from('campaigns').update({ status: 'paused' }).eq('tenant_id', tenantId);
  } catch (err) { log('campaign pause failed', err); }

  // 2. Revoke OAuth tokens.
  await revokePlatformTokens(tenantId, log);

  // 3. Drop Clerk user.
  try {
    const clerkSecret = process.env.CLERK_SECRET_KEY;
    if (clerkSecret && clerkUserId) {
      const clerk = createClerkClient({ secretKey: clerkSecret });
      await clerk.users.deleteUser(clerkUserId);
    }
  } catch (err) { log('clerk delete failed', err); }

  // 4. Audit log entry BEFORE cascade.
  try {
    await db.from('audit_log').insert({
      tenant_id: tenantId,
      action: 'account.deleted',
      actor: 'user',
      payload: { at: new Date().toISOString(), errors },
    });
  } catch { /* not critical */ }

  // 5. Hard delete — per-tenant tables cascade.
  try {
    const { error } = await db.from('tenants').delete().eq('id', tenantId);
    if (error) throw error;
  } catch (err) {
    log('tenant delete failed', err);
    return { success: false, errors };
  }

  return { success: true, errors };
}
