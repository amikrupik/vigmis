// Billing routes — powered by Stripe
//
// GET  /billing/status        — current plan + fee estimate
// POST /billing/checkout      — create Stripe checkout session → return hosted URL
// POST /billing/portal        — Stripe customer portal → return URL
// POST /billing/webhook       — Stripe webhook events
// POST /billing/invoice       — generate monthly invoice (cron)
// GET  /billing/invoices      — invoice history

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { assertCronSecret } from '../middleware/secrets.js';
import { authenticate } from '../middleware/auth.js';
import {
  getOrCreateStripeCustomer,
  createStripeCheckoutSession,
  createStripePortalSession,
  verifyStripeWebhook,
} from '../billing/stripe.js';
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

  // ── Checkout (upgrade to Scale) ────────────────────────────────────────────
  app.post('/billing/checkout', { preHandler: authenticate }, async (request, reply) => {
    const { data: tenant } = await db
      .from('tenants')
      .select('email')
      .eq('id', request.tenantId)
      .single();

    const email = tenant?.email ?? `tenant+${request.tenantId}@vigmis.com`;
    const customerId = await getOrCreateStripeCustomer(request.tenantId, email);
    const checkoutUrl = await createStripeCheckoutSession(
      customerId,
      request.tenantId,
      `${WEB_URL}/billing?success=true`,
      `${WEB_URL}/billing?canceled=true`,
    );

    return reply.send({ url: checkoutUrl });
  });

  // ── Customer Portal (manage / cancel subscription) ─────────────────────────
  app.post('/billing/portal', { preHandler: authenticate }, async (request, reply) => {
    const { data: billing } = await db
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();

    const customerId = (billing as any)?.stripe_customer_id;
    if (!customerId) {
      return reply.send({ url: `${WEB_URL}/billing` });
    }

    const portalUrl = await createStripePortalSession(customerId, `${WEB_URL}/billing`);
    return reply.send({ url: portalUrl });
  });

  // ── Stripe Webhook ─────────────────────────────────────────────────────────
  app.post('/billing/webhook', async (request, reply) => {
    const signature = request.headers['stripe-signature'] as string | null;
    const rawBody = ((request as any).rawBody ?? JSON.stringify(request.body)) as string;

    let event;
    try {
      event = verifyStripeWebhook(rawBody, signature);
    } catch (err) {
      return reply.code(400).send({ error: 'Invalid webhook signature' });
    }

    const obj = event.data.object as any;

    switch (event.type) {
      case 'checkout.session.completed': {
        const tenantId = obj.metadata?.tenantId;
        const subscriptionId = obj.subscription;
        const customerId = obj.customer;
        if (tenantId && subscriptionId) {
          await db.from('billing_customers').upsert(
            {
              tenant_id: tenantId,
              stripe_customer_id: customerId,
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

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const { data: billing } = await db
          .from('billing_customers')
          .select('tenant_id')
          .eq('subscription_id', obj.id)
          .maybeSingle();

        if (billing) {
          const plan = obj.status === 'active' ? 'pro' : 'free';
          await db.from('billing_customers')
            .update({ plan, subscription_status: obj.status, updated_at: new Date().toISOString() })
            .eq('tenant_id', billing.tenant_id);
        } else {
          // Fallback: match by stripe_customer_id
          const tenantId = obj.metadata?.tenantId;
          if (tenantId) {
            const plan = obj.status === 'active' ? 'pro' : 'free';
            await db.from('billing_customers').upsert(
              {
                tenant_id: tenantId,
                stripe_customer_id: obj.customer,
                plan,
                subscription_id: obj.id,
                subscription_status: obj.status,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'tenant_id' },
            );
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const { data: billing } = await db
          .from('billing_customers')
          .select('tenant_id')
          .eq('subscription_id', obj.id)
          .maybeSingle();

        if (billing) {
          await db.from('billing_customers')
            .update({ plan: 'free', subscription_status: 'canceled', updated_at: new Date().toISOString() })
            .eq('tenant_id', billing.tenant_id);
        }
        break;
      }

      case 'invoice.payment_failed': {
        // Subscription payment failed — downgrade to free until resolved
        const subscriptionId = obj.subscription;
        if (subscriptionId) {
          const { data: billing } = await db
            .from('billing_customers')
            .select('tenant_id')
            .eq('subscription_id', subscriptionId)
            .maybeSingle();
          if (billing) {
            await db.from('billing_customers')
              .update({ subscription_status: 'past_due', updated_at: new Date().toISOString() })
              .eq('tenant_id', billing.tenant_id);
          }
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
