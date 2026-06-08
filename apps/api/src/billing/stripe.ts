// Stripe Billing client
// Required env vars:
//   STRIPE_SECRET_KEY        — from Stripe dashboard → API keys
//   STRIPE_WEBHOOK_SECRET    — from Stripe dashboard → Webhooks → signing secret
//   STRIPE_PRO_PRICE_ID      — price ID for the Scale plan (price_...)
//   STRIPE_GROW_PRICE_ID     — price ID for Grow usage-based price (optional)

import Stripe from 'stripe';
import { db } from '@vigmis/db';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY not set');
    _stripe = new Stripe(key, { apiVersion: '2025-03-31.basil' });
  }
  return _stripe;
}

export async function getOrCreateStripeCustomer(
  tenantId: string,
  email: string,
): Promise<string> {
  const { data: existing } = await db
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if ((existing as any)?.stripe_customer_id) return (existing as any).stripe_customer_id as string;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    metadata: { tenantId },
  });

  await db.from('billing_customers').upsert(
    {
      tenant_id: tenantId,
      stripe_customer_id: customer.id,
      plan: 'free',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' },
  );

  return customer.id;
}

// Stripe Checkout Session → returns the hosted checkout URL.
// On success, Stripe redirects to success_url.
export async function createStripeCheckoutSession(
  customerId: string,
  tenantId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<string> {
  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  if (!priceId) throw new Error('STRIPE_PRO_PRICE_ID not set');

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { tenantId },
    subscription_data: { metadata: { tenantId } },
  });

  return session.url!;
}

// Stripe Customer Portal → returns the portal URL.
export async function createStripePortalSession(
  customerId: string,
  returnUrl: string,
): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}

// Create a standalone Stripe Invoice for the variable management fee.
// Returns the Stripe invoice ID so we can store it in billing_invoices.
export async function chargeManagementFee(
  customerId: string,
  tenantId: string,
  amountCents: number,
  description: string,
  periodMonth: string,
): Promise<string> {
  const stripe = getStripe();

  await stripe.invoiceItems.create({
    customer: customerId,
    amount: amountCents,
    currency: 'usd',
    description,
    metadata: { tenantId, period: periodMonth },
  });

  const invoice = await stripe.invoices.create({
    customer: customerId,
    auto_advance: true,
    collection_method: 'charge_automatically',
    metadata: { tenantId, period: periodMonth, type: 'management_fee' },
  });

  // Finalize immediately so Stripe charges right away.
  await stripe.invoices.finalizeInvoice(invoice.id);

  return invoice.id;
}

// Create a one-time Stripe Checkout for a creative revision approval.
// Returns the hosted checkout URL. Metadata triggers approved_at on completion.
export async function createCreativeApprovalCheckout(
  customerId: string,
  tenantId: string,
  jobId: string,
  amountCents: number,
  description: string,
  successUrl: string,
  cancelUrl: string,
): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: { name: description },
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { action: 'creative_approval', tenantId, jobId },
  });

  return session.url!;
}

// Verify a Stripe webhook signature.
export function verifyStripeWebhook(
  rawBody: Buffer | string,
  signature: string | null,
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not set');
  if (!signature) throw new Error('Missing Stripe-Signature header');
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}
