// Paddle Billing client — uses Paddle Billing (2023 API), not Paddle Classic
// Docs: https://developer.paddle.com/api-reference/overview
//
// Required env vars:
//   PADDLE_API_KEY         — secret key from Paddle dashboard (Paddle → Developer Tools → Authentication)
//   PADDLE_WEBHOOK_SECRET  — from Paddle dashboard → Notifications → Webhook secret
//   PADDLE_PRO_PRICE_ID    — price ID for $15/month Pro plan (prctx_...)
//   PADDLE_ENV             — 'sandbox' or 'production' (default: production)

const BASE_URL = process.env.PADDLE_ENV === 'sandbox'
  ? 'https://sandbox-api.paddle.com'
  : 'https://api.paddle.com';

function getPaddleKey(): string {
  const key = process.env.PADDLE_API_KEY;
  if (!key) throw new Error('PADDLE_API_KEY not set');
  return key;
}

async function paddleRequest<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: object,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getPaddleKey()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json() as any;

  if (!res.ok) {
    throw new Error(`Paddle API error ${res.status}: ${JSON.stringify(json.error ?? json)}`);
  }

  return json.data as T;
}

// Create or retrieve a Paddle customer for this tenant.
export async function getOrCreatePaddleCustomer(
  tenantId: string,
  email: string,
): Promise<string> {
  const { db } = await import('@vigmis/db');

  const { data: existing } = await db
    .from('billing_customers')
    .select('paddle_customer_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if ((existing as any)?.paddle_customer_id) return (existing as any).paddle_customer_id as string;

  const customer = await paddleRequest<{ id: string }>('POST', '/customers', {
    email,
    custom_data: { tenantId },
  });

  await db.from('billing_customers').upsert(
    {
      tenant_id: tenantId,
      paddle_customer_id: customer.id,
      plan: 'free',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' },
  );

  return customer.id;
}

// Create a Paddle checkout transaction → returns the hosted checkout URL.
export async function createPaddleCheckout(
  customerId: string,
  tenantId: string,
  successUrl: string,
): Promise<string> {
  const priceId = process.env.PADDLE_PRO_PRICE_ID;
  if (!priceId) throw new Error('PADDLE_PRO_PRICE_ID not set');

  const transaction = await paddleRequest<{ checkout: { url: string } }>('POST', '/transactions', {
    items: [{ price_id: priceId, quantity: 1 }],
    customer_id: customerId,
    custom_data: { tenantId },
    checkout: {
      url: successUrl,
    },
  });

  return transaction.checkout.url;
}

// Generate a Paddle customer portal session URL (manage / cancel subscription).
export async function createPaddlePortalSession(customerId: string): Promise<string> {
  const session = await paddleRequest<{ urls: { general: string } }>(
    'POST',
    `/customers/${customerId}/portal-sessions`,
    {},
  );
  return session.urls.general;
}

// Verify a Paddle webhook signature.
// Paddle signs webhooks with HMAC-SHA256 using the raw body.
export async function verifyPaddleWebhook(
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signature) return false;

  // Paddle sends: Paddle-Signature: ts=...;h1=...
  const parts = Object.fromEntries(
    signature.split(';').map(p => p.split('=')).map(([k, ...v]) => [k, v.join('=')])
  );
  const ts = parts['ts'];
  const h1 = parts['h1'];
  if (!ts || !h1) return false;

  const payload = `${ts}:${rawBody}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const computed = Buffer.from(sig).toString('hex');

  return computed === h1;
}
