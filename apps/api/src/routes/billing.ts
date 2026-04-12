// Billing routes
//
// GET  /billing/status        — current plan + fee estimate
// POST /billing/checkout      — start Stripe Checkout (upgrade to Pro)
// POST /billing/portal        — Stripe Customer Portal (manage subscription)
// POST /billing/webhook       — Stripe webhook events
// POST /billing/invoice       — generate monthly invoice (cron)

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { getStripe } from '../billing/stripe.js';
import { calculateFee, currentMonth } from '../billing/calculator.js';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

async function getOrCreateStripeCustomer(tenantId: string, clerkUserId: string): Promise<string> {
  const stripe = getStripe();

  // Check if already exists
  const { data: existing } = await db
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  // Create in Stripe
  const customer = await stripe.customers.create({
    metadata: { tenantId, clerkUserId },
  });

  // Upsert billing_customers row
  await db.from('billing_customers').upsert(
    { tenant_id: tenantId, stripe_customer_id: customer.id, plan: 'free', updated_at: new Date().toISOString() },
    { onConflict: 'tenant_id' },
  );

  return customer.id;
}

export async function billingRoutes(app: FastifyInstance) {

  // ── Status ────────────────────────────────────────────────────────────────
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

  // ── Checkout (upgrade to Pro) ─────────────────────────────────────────────
  app.post('/billing/checkout', { preHandler: authenticate }, async (request, reply) => {
    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(request.tenantId, request.clerkUserId);

    // Create or retrieve Pro price ($15/month)
    let priceId = process.env.STRIPE_PRO_PRICE_ID;

    if (!priceId) {
      // Create the product/price on the fly (first time setup)
      const product = await stripe.products.create({ name: 'Vigmis Pro' });
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: 1500, // $15.00
        currency: 'usd',
        recurring: { interval: 'month' },
      });
      priceId = price.id;
      // In production: save this to env or DB so it's reused
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${WEB_URL}/billing?success=true`,
      cancel_url: `${WEB_URL}/billing?canceled=true`,
      metadata: { tenantId: request.tenantId },
    });

    return reply.send({ url: session.url });
  });

  // ── Customer Portal (manage/cancel subscription) ──────────────────────────
  app.post('/billing/portal', { preHandler: authenticate }, async (request, reply) => {
    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(request.tenantId, request.clerkUserId);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${WEB_URL}/billing`,
    });

    return reply.send({ url: session.url });
  });

  // ── Stripe Webhook ────────────────────────────────────────────────────────
  app.post('/billing/webhook', async (request, reply) => {
    const stripe = getStripe();
    const sig = request.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      const rawBody = ((request as any).rawBody ?? JSON.stringify(request.body)) as string | Buffer;
      event = webhookSecret
        ? stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
        : request.body as any;
    } catch {
      return reply.code(400).send({ error: 'Webhook signature invalid' });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const tenantId = session.metadata?.tenantId;
        if (tenantId && session.subscription) {
          await db.from('billing_customers').upsert(
            {
              tenant_id: tenantId,
              plan: 'pro',
              subscription_id: session.subscription,
              subscription_status: 'active',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'tenant_id' },
          );
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as any;
        const { data: billing } = await db
          .from('billing_customers')
          .select('tenant_id')
          .eq('subscription_id', sub.id)
          .maybeSingle();

        if (billing) {
          const plan = sub.status === 'active' ? 'pro' : 'free';
          await db.from('billing_customers')
            .update({
              plan,
              subscription_status: sub.status,
              updated_at: new Date().toISOString(),
            })
            .eq('tenant_id', billing.tenant_id);
        }
        break;
      }
    }

    return reply.send({ received: true });
  });

  // ── List invoices ────────────────────────────────────────────────────────────
  app.get('/billing/invoices', { preHandler: authenticate }, async (request, reply) => {
    const { data: invoices } = await db
      .from('billing_invoices')
      .select('id, period_start, period_end, managed_spend_usd, fee_usd, subscription_usd, total_usd, status, created_at')
      .eq('tenant_id', request.tenantId)
      .order('period_start', { ascending: false })
      .limit(12);

    return reply.send({ invoices: invoices ?? [] });
  });

  // ── Generate monthly invoice (cron) ──────────────────────────────────────
  app.post('/billing/invoice', async (request, reply) => {
    const cronSecret = (request.headers['x-cron-secret'] as string) ?? '';
    if (cronSecret !== (process.env.CRON_SECRET ?? 'vigmis-cron')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

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
