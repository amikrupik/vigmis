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
  chargeManagementFee,
} from '../billing/stripe.js';
import { calculateFee, currentMonth } from '../billing/calculator.js';
import { getUsageSummary } from '../services/usage.js';
import { executeAccountDeletion } from '../services/account-deletion.js';

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
        const customerId = obj.customer;

        // Special case: account deletion payment
        if (obj.metadata?.action === 'account_deletion' && tenantId) {
          const clerkUserId = obj.metadata?.clerkUserId || null;
          await executeAccountDeletion(tenantId, clerkUserId).catch(err =>
            request.log.error({ err, tenantId }, 'account deletion after payment failed')
          );
          break;
        }

        // Special case: creative revision approval payment
        if (obj.metadata?.action === 'creative_approval' && tenantId) {
          const jobId = obj.metadata?.jobId;
          if (jobId) {
            const { error: approveErr } = await db.from('creative_jobs')
              .update({ approved_at: new Date().toISOString() })
              .eq('id', jobId)
              .eq('tenant_id', tenantId);
            if (approveErr) request.log.error({ err: approveErr, jobId }, 'creative approval after payment failed');
          }
          break;
        }

        // Normal case: subscription upgrade
        const subscriptionId = obj.subscription;
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

        const isCanceled = obj.status === 'canceled';
        const plan = obj.status === 'active' ? 'pro' : 'free';

        if (billing) {
          const updatePayload: Record<string, any> = {
            plan,
            subscription_status: obj.status,
            updated_at: new Date().toISOString(),
          };
          if (isCanceled) {
            updatePayload.downgrade_requested_at = new Date().toISOString();
          }
          await db.from('billing_customers')
            .update(updatePayload)
            .eq('tenant_id', billing.tenant_id);
        } else {
          // Fallback: match by stripe_customer_id
          const tenantId = obj.metadata?.tenantId;
          if (tenantId) {
            const upsertPayload: Record<string, any> = {
              tenant_id: tenantId,
              stripe_customer_id: obj.customer,
              plan,
              subscription_id: obj.id,
              subscription_status: obj.status,
              updated_at: new Date().toISOString(),
            };
            if (isCanceled) {
              upsertPayload.downgrade_requested_at = new Date().toISOString();
            }
            await db.from('billing_customers').upsert(upsertPayload, { onConflict: 'tenant_id' });
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
            .update({
              plan: 'free',
              subscription_status: 'canceled',
              downgrade_requested_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('tenant_id', billing.tenant_id);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        // Management fee invoice paid — mark billing_invoice as paid
        const stripeInvoiceId = obj.id;
        const isManagementFee = obj.metadata?.type === 'management_fee';
        if (isManagementFee && stripeInvoiceId) {
          const { error: paidErr } = await db
            .from('billing_invoices')
            .update({ status: 'paid' })
            .eq('stripe_invoice_id', stripeInvoiceId);
          if (paidErr) request.log.error({ err: paidErr, stripeInvoiceId }, 'invoice paid update failed');
        }
        break;
      }

      case 'invoice.payment_failed': {
        // Management fee failed — mark as past_due
        const stripeInvoiceId = obj.id;
        const isManagementFee = obj.metadata?.type === 'management_fee';
        if (isManagementFee && stripeInvoiceId) {
          const { error: failErr } = await db
            .from('billing_invoices')
            .update({ status: 'past_due' })
            .eq('stripe_invoice_id', stripeInvoiceId);
          if (failErr) request.log.error({ err: failErr, stripeInvoiceId }, 'invoice failed update error');
        }

        // Also handle subscription payment failure — downgrade to free until resolved
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

  // ── Creative credits balance ────────────────────────────────────────────────
  app.get('/billing/credits', { preHandler: authenticate }, async (request, reply) => {
    const { data: billing } = await db
      .from('billing_customers')
      .select('plan, scale_video_credits_used, scale_image_credits_used, scale_post_credits_used, credits_period, downgrade_requested_at')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();

    const plan = billing?.plan ?? 'free';
    const isPro = plan === 'pro';
    const VIDEO_LIMIT = 1;
    const IMAGE_LIMIT = 3;
    const POST_LIMIT = 5;

    return reply.send({
      plan,
      period: (billing as any)?.credits_period ?? null,
      video: {
        used: isPro ? ((billing as any)?.scale_video_credits_used ?? 0) : 0,
        limit: isPro ? VIDEO_LIMIT : 0,
        available: isPro ? Math.max(0, VIDEO_LIMIT - ((billing as any)?.scale_video_credits_used ?? 0)) : 0,
      },
      image: {
        used: isPro ? ((billing as any)?.scale_image_credits_used ?? 0) : 0,
        limit: isPro ? IMAGE_LIMIT : 0,
        available: isPro ? Math.max(0, IMAGE_LIMIT - ((billing as any)?.scale_image_credits_used ?? 0)) : 0,
      },
      post: {
        used: isPro ? ((billing as any)?.scale_post_credits_used ?? 0) : 0,
        limit: isPro ? POST_LIMIT : 0,
        available: isPro ? Math.max(0, POST_LIMIT - ((billing as any)?.scale_post_credits_used ?? 0)) : 0,
      },
    });
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
    const periodMonth = period.start.toISOString().slice(0, 7); // "2026-06"
    let processed = 0;

    for (const tenant of tenants) {
      const fee = await calculateFee(tenant.id, period);
      if (fee.totalUsd <= 0) continue;

      // Get stripe_customer_id if tenant has one
      const { data: billing } = await db
        .from('billing_customers')
        .select('stripe_customer_id')
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      const stripeCustomerId = (billing as any)?.stripe_customer_id ?? null;

      // For Grow: charge full fee. For Scale: subscription ($49) already billed by Stripe recurring,
      // so only charge the percentage portion on top.
      const stripeChargeUsd = fee.totalUsd - fee.subscriptionUsd;

      let stripeInvoiceId: string | null = null;
      if (stripeCustomerId && stripeChargeUsd > 0) {
        try {
          const description = `Vigmis management fee ${periodMonth} — ${fee.feePercentage}% of $${fee.managedSpendUsd.toFixed(2)} ad spend`;
          const amountCents = Math.round(stripeChargeUsd * 100);
          stripeInvoiceId = await chargeManagementFee(
            stripeCustomerId,
            tenant.id,
            amountCents,
            description,
            periodMonth,
          );
        } catch (err) {
          request.log.error({ err, tenantId: tenant.id }, 'chargeManagementFee failed');
        }
      }

      await db.from('billing_invoices').insert({
        tenant_id: tenant.id,
        period_start: period.start.toISOString().slice(0, 10),
        period_end: period.end.toISOString().slice(0, 10),
        managed_spend_usd: fee.managedSpendUsd,
        fee_percentage: fee.feePercentage,
        fee_usd: fee.percentageFeeUsd,
        subscription_usd: fee.subscriptionUsd,
        total_usd: fee.totalUsd,
        stripe_invoice_id: stripeInvoiceId,
        status: stripeInvoiceId ? 'open' : 'draft',
      });

      processed++;
    }

    return reply.send({ processed });
  });
}
