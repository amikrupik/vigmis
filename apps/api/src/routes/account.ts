// DELETE /account           — delete tenant: if balance>0 → Stripe payment first
// GET    /account/balance    — returns current accrued balance before deletion
// GET    /account/export     — export all tenant data as JSON
// POST   /account/contact    — contact form → send email to support
// POST   /account/unsubscribe — unsubscribe from alert emails (token-based, no auth)

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { calculateFee, currentMonth } from '../billing/calculator.js';
import { getStripe } from '../billing/stripe.js';
import { executeAccountDeletion } from '../services/account-deletion.js';

async function sendEmail(to: string, subject: string, html: string, from = 'hello@vigmis.com', fromName = 'Vigmis'): Promise<void> {
  const { SENDGRID_API_KEY } = process.env;
  if (!SENDGRID_API_KEY) return;
  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from, name: fromName },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });
}

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

export async function accountRoutes(app: FastifyInstance) {

  // ── Final balance (before deletion) ───────────────────────────────────────
  app.get('/account/balance', { preHandler: authenticate }, async (request, reply) => {
    const fee = await calculateFee(request.tenantId, currentMonth());
    return reply.send({ balance_usd: fee.totalUsd, breakdown: fee });
  });

  // ── Delete account ─────────────────────────────────────────────────────────
  // Full automated deletion flow:
  //   1. If Scale plan → cancel Stripe subscription via API (no more renewals)
  //   2. Calculate accrued balance for current month
  //   3. If balance > 0 → create Stripe Checkout (one-time payment) → return 402
  //      The actual deletion fires from the Stripe webhook (checkout.session.completed)
  //   4. If balance = 0 → delete immediately
  app.delete('/account', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.tenantId;
    const clerkUserId = request.clerkUserId;
    const stripe = getStripe();

    // 1. Cancel Stripe subscription so it doesn't renew.
    try {
      const { data: billing } = await db
        .from('billing_customers')
        .select('subscription_id, plan')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (billing?.subscription_id && billing.plan === 'pro') {
        await stripe.subscriptions.cancel(billing.subscription_id);
      }
    } catch (err) {
      request.log.warn({ err }, 'subscription cancel failed — continuing with deletion');
    }

    // 2. Calculate accrued balance.
    const fee = await calculateFee(tenantId, currentMonth());

    if (fee.totalUsd <= 0) {
      // No balance owed → delete immediately.
      const result = await executeAccountDeletion(tenantId, clerkUserId ?? null);
      if (!result.success) {
        return reply.code(500).send({ error: 'Deletion partially failed', details: result.errors });
      }
      return reply.send({
        success: true,
        message: 'Your account has been deleted. All campaign data has been removed.',
        warnings: result.errors.length ? result.errors : undefined,
      });
    }

    // 3. Balance > 0 → require Stripe payment before deletion.
    // Create a one-time Stripe Checkout session for the owed amount.
    try {
      // Ensure the user has a Stripe customer record.
      const { data: billing } = await db
        .from('billing_customers')
        .select('stripe_customer_id')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      let customerId = (billing as any)?.stripe_customer_id as string | undefined;
      if (!customerId) {
        const { data: tenant } = await db.from('tenants').select('email').eq('id', tenantId).single();
        const email = tenant?.email ?? `tenant+${tenantId}@vigmis.com`;
        const customer = await stripe.customers.create({ email, metadata: { tenantId } });
        customerId = customer.id;
        await db.from('billing_customers').upsert(
          { tenant_id: tenantId, stripe_customer_id: customerId, plan: 'free', updated_at: new Date().toISOString() },
          { onConflict: 'tenant_id' },
        );
      }

      const amountCents = Math.ceil(fee.totalUsd * 100);
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: 'Vigmis — Final balance on account closure',
              description: `Management fee for ${new Date().toISOString().slice(0, 7)} (ad spend + services)`,
            },
          },
          quantity: 1,
        }],
        success_url: `${WEB_URL}/sign-in?deleted=1`,
        cancel_url: `${WEB_URL}/dashboard/settings?cancel_deletion=1`,
        metadata: {
          action: 'account_deletion',
          tenantId,
          clerkUserId: clerkUserId ?? '',
        },
      });

      return reply.code(402).send({
        payment_required: true,
        amount_usd: fee.totalUsd,
        breakdown: fee,
        checkout_url: session.url,
      });
    } catch (err) {
      request.log.error({ err }, 'failed to create final-payment checkout');
      return reply.code(500).send({ error: 'Could not initiate final payment. Please contact billing@vigmis.com.' });
    }
  });

  // ── Export data ────────────────────────────────────────────────────────────
  app.get('/account/export', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.tenantId;

    const [settingsRes, campaignsRes, alertsRes, auditRes] = await Promise.all([
      db.from('client_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
      db.from('campaigns').select('name,platform,status,daily_budget_usd,created_at').eq('tenant_id', tenantId),
      db.from('alert_settings').select('email,whatsapp,email_enabled,whatsapp_enabled').eq('tenant_id', tenantId).maybeSingle(),
      db.from('audit_log').select('action,actor,created_at,payload').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(200),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      tenant_id: tenantId,
      settings: settingsRes.data ?? null,
      campaigns: campaignsRes.data ?? [],
      alert_settings: alertsRes.data ?? null,
      audit_log: auditRes.data ?? [],
    };

    return reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', `attachment; filename="vigmis-export-${tenantId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json"`)
      .send(exportData);
  });

  // ── Contact form ───────────────────────────────────────────────────────────
  app.post('/account/contact', async (request, reply) => {
    const { name, email, subject, category, message } = request.body as Record<string, string>;

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return reply.code(400).send({ error: 'name, email, and message are required' });
    }

    const categoryRoutes: Record<string, string> = {
      billing: 'billing@vigmis.com',
      bug: 'bugs@vigmis.com',
      partnership: 'partners@vigmis.com',
      legal: 'legal@vigmis.com',
    };
    const toAddress = categoryRoutes[category ?? ''] ?? 'hello@vigmis.com';
    const displayCategory = category ? category.charAt(0).toUpperCase() + category.slice(1) : 'General';

    // Send to support team
    await sendEmail(
      toAddress,
      `[Vigmis Support] ${displayCategory}: ${subject ?? message.slice(0, 60)}`,
      `<div style="font-family:sans-serif;max-width:600px">
        <h2 style="color:#1e293b">New Contact Form Submission</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px;font-weight:600;color:#475569;width:120px">Name</td><td style="padding:8px">${name}</td></tr>
          <tr><td style="padding:8px;font-weight:600;color:#475569">Email</td><td style="padding:8px"><a href="mailto:${email}">${email}</a></td></tr>
          <tr><td style="padding:8px;font-weight:600;color:#475569">Category</td><td style="padding:8px">${displayCategory}</td></tr>
          <tr><td style="padding:8px;font-weight:600;color:#475569">Subject</td><td style="padding:8px">${subject ?? '—'}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
        <p style="white-space:pre-wrap;color:#1e293b">${message}</p>
      </div>`,
      'support@vigmis.com',
      'Vigmis Support',
    );

    // Auto-reply to sender
    await sendEmail(
      email,
      'We received your message — Vigmis Support',
      `<div style="font-family:sans-serif;max-width:600px">
        <h2 style="color:#1e293b">Hi ${name},</h2>
        <p>Thank you for reaching out. We received your message and will respond within <strong>1–2 business days</strong>.</p>
        <p style="color:#475569;font-size:14px">Your message:</p>
        <blockquote style="border-left:3px solid #e2e8f0;margin:0;padding:12px 16px;color:#64748b;font-size:14px">${message.slice(0, 400)}${message.length > 400 ? '...' : ''}</blockquote>
        <p style="margin-top:24px">If your issue is urgent, please use the AI assistant inside your <a href="${WEB_URL}/dashboard" style="color:#4f46e5">dashboard</a>.</p>
        <p style="color:#94a3b8;font-size:12px;margin-top:32px">— The Vigmis Team<br>hello@vigmis.com</p>
      </div>`,
    );

    return reply.send({ success: true });
  });

  // ── Save logo URL ─────────────────────────────────────────────────────────
  app.put('/settings/logo', { preHandler: authenticate }, async (request, reply) => {
    const { logo_url } = request.body as { logo_url?: string };
    if (typeof logo_url !== 'string') {
      return reply.code(400).send({ error: 'logo_url (string) is required' });
    }
    const { error } = await db
      .from('client_settings')
      .update({ logo_url: logo_url || null })
      .eq('tenant_id', request.tenantId);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ success: true });
  });

  // ── Upload logo to Supabase Storage ──────────────────────────────────────
  app.post('/settings/logo/upload', { preHandler: authenticate }, async (request, reply) => {
    const data = await request.file?.();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    if (buffer.length > 2 * 1024 * 1024) {
      return reply.code(400).send({ error: 'File too large — maximum 2 MB' });
    }

    const ext = data.mimetype === 'image/png' ? 'png' : data.mimetype === 'image/gif' ? 'gif' : 'jpg';
    const path = `${request.tenantId}/logo.${ext}`;

    const { error: uploadError } = await db.storage.from('logos').upload(path, buffer, {
      contentType: data.mimetype,
      upsert: true,
    });

    if (uploadError) return reply.code(500).send({ error: uploadError.message });

    const { data: urlData } = db.storage.from('logos').getPublicUrl(path);
    const url = `${urlData.publicUrl}?v=${Date.now()}`;

    // Also save to client_settings
    await db.from('client_settings').update({ logo_url: url }).eq('tenant_id', request.tenantId);

    return reply.send({ url });
  });

  // ── Save content language ─────────────────────────────────────────────────
  // Stores the user's preferred content-generation language (not UI language —
  // that's handled client-side via the vigmis_lang cookie).
  app.put('/settings/language', { preHandler: authenticate }, async (request, reply) => {
    const { language } = request.body as { language?: string };
    if (typeof language !== 'string' || !language.trim()) {
      return reply.code(400).send({ error: 'language (string) is required' });
    }
    const supported = ['en', 'he', 'ar', 'es', 'pt', 'fr', 'ru', 'de', 'tr', 'it'];
    if (!supported.includes(language)) {
      return reply.code(400).send({ error: `Unsupported language. Must be one of: ${supported.join(', ')}` });
    }
    const { error } = await db
      .from('client_settings')
      .update({ content_language: language })
      .eq('tenant_id', request.tenantId);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ success: true, language });
  });

  // ── Unsubscribe (no auth — token = tenantId) ───────────────────────────────
  app.post('/account/unsubscribe', async (request, reply) => {
    const { token } = request.body as { token?: string };
    if (!token) return reply.code(400).send({ error: 'token required' });

    const { error } = await db
      .from('alert_settings')
      .update({ email_enabled: false })
      .eq('tenant_id', token);

    if (error) return reply.code(400).send({ error: 'Invalid token' });
    return reply.send({ success: true });
  });
}
