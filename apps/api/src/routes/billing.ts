// Billing routes — powered by Paddle Billing (2023 API)
//
// GET  /billing/status        — current plan + fee estimate
// POST /billing/checkout      — create Paddle checkout → return hosted URL
// POST /billing/portal        — Paddle customer portal → return URL
// POST /billing/webhook       — Paddle webhook events
// POST /billing/invoice       — generate monthly invoice (cron)
// GET  /billing/invoices      — invoice history

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { assertCronSecret } from '../middleware/secrets.js';
import { authenticate } from '../middleware/auth.js';
import {
  getOrCreatePaddleCustomer,
  createPaddleCheckout,
  createPaddlePortalSession,
  verifyPaddleWebhook,
} from '../billing/paddle.js';
import { calculateFee, currentMonth } from '../billing/calculator.js';
import { getUsageSummary } from '../services/usage.js';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

export async function billingRoutes(app: FastifyInstance) {

  // ── Usage & quota snapshot (for the dashboard widget) ──────────────────────
  app.get('/billing/usage', { preHandler: authenticate }, async (request, reply) => {
    const summary = await getUsageSummary(request.tenantId);
    return reply.send(summary);
  });

  // ── Status ─────────────────────────────────────────────────────────────────
  app.get('/billing/status', { preHandler: authenticate }, async (request, reply) => {
    const period = currentMonth();
    const fee = await calculateFee(request.tenantId, period);

    const { data: billing } = await db
      .from('billing_customers')
      .select('plan, subscription_status')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();

    return reply.send({
      plan: billing?.plan ?? 'free',
      subscriptionStatus: billing?.subscription_status ?? null,
      period: {
        start: period.start.toISOString().slice(0, 10),
        end: period.end.toISOString().slice(0, 10),
      },
      fee,
    });
  });

  // ── Checkout (upgrade to Pro) ──────────────────────────────────────────────
  app.post('/billing/checkout', { preHandler: authenticate }, async (request, reply) => {
    // Fetch tenant email from Clerk user record
    const { data: tenant } = await db
      .from('tenants')
      .select('email')
      .eq('id', request.tenantId)
      .single();

    const email = tenant?.email ?? `tenant+${request.tenantId}@vigmis.com`;
    const customerId = await getOrCreatePaddleCustomer(request.tenantId, email);
    const checkoutUrl = await createPaddleCheckout(
      customerId,
      request.tenantId,
      `${WEB_URL}/billing?success=true`,
    );

    return reply.send({ url: checkoutUrl });
  });

  // ── Customer Portal (manage / cancel subscription) ─────────────────────────
  app.post('/billing/portal', { preHandler: authenticate }, async (request, reply) => {
    const { data: billing } = await db
      .from('billing_customers')
      .select('paddle_customer_id')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();

    const customerId = (billing as any)?.paddle_customer_id;
    if (!customerId) {
      // Not yet a Paddle customer — send to billing page
      return reply.send({ url: `${WEB_URL}/billing` });
    }

    const portalUrl = await createPaddlePortalSession(customerId);
    return reply.send({ url: portalUrl });
  });

  // ── Paddle Webhook ─────────────────────────────────────────────────────────
  app.post('/billing/webhook', async (request, reply) => {
    const signature = request.headers['paddle-signature'] as string | null;
    const rawBody = ((request as any).rawBody ?? JSON.stringify(request.body)) as string;

    const valid = await verifyPaddleWebhook(rawBody, signature);
    if (!valid) return reply.code(400).send({ error: 'Invalid webhook signature' });

    const event = request.body as any;
    const eventType = event.event_type as string;
    const data = event.data as any;

    switch (eventType) {
      case 'transaction.completed': {
        // New subscription payment succeeded
        const tenantId = data.custom_data?.tenantId;
        const subscriptionId = data.subscription_id;
        const customerId = data.customer_id;

        if (tenantId && subscriptionId) {
          await db.from('billing_customers').upsert(
            {
              tenant_id: tenantId,
              paddle_customer_id: customerId,
              plan: 'pro',
              subscription_id: subscriptionId,
              subscription_status: 'active',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'tenant_id' },
          );
        }
        break;
      }

      case 'subscription.activated': {
        const tenantId = data.custom_data?.tenantId;
        if (tenantId) {
          await db.from('billing_customers').upsert(
            {
              tenant_id: tenantId,
              paddle_customer_id: data.customer_id,
              plan: 'pro',
              subscription_id: data.id,
              subscription_status: 'active',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'tenant_id' },
          );
        }
        break;
      }

      case 'subscription.canceled': {
        const { data: billing } = await db
          .from('billing_customers')
          .select('tenant_id')
          .eq('subscription_id', data.id)
          .maybeSingle();

        if (billing) {
          await db.from('billing_customers')
            .update({ plan: 'free', subscription_status: 'canceled', updated_at: new Date().toISOString() })
            .eq('tenant_id', billing.tenant_id);
        }
        break;
      }

      case 'subscription.updated': {
        const { data: billing } = await db
          .from('billing_customers')
          .select('tenant_id')
          .eq('subscription_id', data.id)
          .maybeSingle();

        if (billing) {
          const plan = data.status === 'active' ? 'pro' : 'free';
          await db.from('billing_customers')
            .update({ plan, subscription_status: data.status, updated_at: new Date().toISOString() })
            .eq('tenant_id', billing.tenant_id);
        }
        break;
      }
    }

    return reply.send({ received: true });
  });

  // ── Invoice list ───────────────────────────────────────────────────────────
  app.get('/billing/invoices', { preHandler: authenticate }, async (request, reply) => {
    const { data: invoices } = await db
      .from('billing_invoices')
      .select('id, period_start, period_end, managed_spend_usd, fee_usd, subscription_usd, total_usd, status, created_at')
      .eq('tenant_id', request.tenantId)
      .order('period_start', { ascending: false })
      .limit(12);

    return reply.send({ invoices: invoices ?? [] });
  });

  // ── Generate monthly invoice (cron) ────────────────────────────────────────
  app.post('/billing/invoice', async (request, reply) => {
    if (!assertCronSecret(request, reply)) return;

    const { data: tenants } = await db.from('tenants').select('id');
    if (!tenants?.length) return reply.send({ processed: 0 });

    const period = currentMonth();
    let processed = 0;

    for (const tenant of tenants) {
      const fee = await calculateFee(tenant.id, period);
      if (fee.totalUsd <= 0) continue;

      await db.from('billing_invoices').insert({
        tenant_id: tenant.id,
        period_start: period.start.toISOString().slice(0, 10),
        period_end: period.end.toISOString().slice(0, 10),
        managed_spend_usd: fee.managedSpendUsd,
        fee_percentage: fee.feePercentage,
        fee_usd: fee.percentageFeeUsd,
        subscription_usd: fee.subscriptionUsd,
        total_usd: fee.totalUsd,
        status: 'draft',
      });

      processed++;
    }

    return reply.send({ processed });
  });
}
