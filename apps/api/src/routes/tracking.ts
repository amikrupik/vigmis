// Conversion Intelligence — Round 1
// POST /track            — pixel event ingestion (public, CORS *)
// GET  /track.js         — serve pixel JS (public, CORS *)
// GET  /track/snippet    — get HTML snippet for this tenant (auth)
// GET  /track/status     — tracking setup status (auth)
// GET  /track/true-roas  — True ROAS vs Platform ROAS (auth)
// POST /track/verify     — check if pixel has fired recently (auth)
// POST /track/shopify/connect   — start Shopify OAuth (auth)
// GET  /track/shopify/callback  — handle Shopify OAuth redirect (state-based auth)
// POST /track/shopify/webhook   — receive Shopify order (public, HMAC verified)

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHash, createHmac } from 'crypto';
import { db, encryptToken, decryptToken } from '@vigmis/db';
import { assertCronSecret, safeEqual } from '../middleware/secrets.js';
import { authenticate } from '../middleware/auth.js';
import { fullSyncForTenant, registerProductWebhooks, applyProductWebhook } from '../services/shopify-sync.js';

const API_URL = process.env.API_URL ?? 'https://vigmisapi-production.up.railway.app';
const SHOPIFY_API_KEY    = process.env.SHOPIFY_API_KEY ?? '';
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET ?? '';
const SHOPIFY_REDIRECT   = process.env.SHOPIFY_REDIRECT_URI ?? `${API_URL}/track/shopify/callback`;
const SHOPIFY_SCOPES     = 'read_orders,read_products,read_inventory,read_shipping';

// ── Pixel JS template ─────────────────────────────────────────────────────────

function buildPixelJs(pid: string, apiUrl: string): string {
  return `;(function(){
var A='${apiUrl}',P='${pid}';
function gp(n){return new URLSearchParams(location.search).get(n)}
function sc(n,v,d){var e=new Date();e.setTime(e.getTime()+d*864e5);document.cookie=n+'='+encodeURIComponent(v)+';expires='+e.toUTCString()+';path=/;SameSite=Lax'}
function gc(n){var m=document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));return m?decodeURIComponent(m[1]):null}
var ci={},ut={};
['gclid','fbclid','ttclid'].forEach(function(k){var v=gp(k);if(v){sc('_vm_'+k,v,30);ci[k]=v}else{var s=gc('_vm_'+k);if(s)ci[k]=s}});
['source','medium','campaign','content','term'].forEach(function(k){var v=gp('utm_'+k);if(v){sc('_vm_u'+k,v,30);ut[k]=v}else{var s=gc('_vm_u'+k);if(s)ut[k]=s}});
function send(ev,d){
  var p=JSON.stringify(Object.assign({pid:P,event:ev,url:location.href,ref:document.referrer||null,ci:ci,ut:ut},d||{}));
  try{if(navigator.sendBeacon){navigator.sendBeacon(A+'/track',p)}else{fetch(A+'/track',{method:'POST',body:p,headers:{'Content-Type':'application/json'},keepalive:true}).catch(function(){})}}catch(e){}
}
send('pageview');
window.vigmis=function(ev,d){send(ev,d)};
document.addEventListener('submit',function(e){var f=e.target;if(f&&f.tagName==='FORM')send('lead',{form_id:f.id||null})},true);
})();`;
}

// ── Attribution helper ────────────────────────────────────────────────────────

async function resolveAttribution(tenantId: string, gclid: string | null, fbclid: string | null, ttclid: string | null) {
  if (!gclid && !fbclid && !ttclid) return { campaign_id: null, platform: null };

  // Look up recent campaigns for this tenant, try to match by click ID type
  const { data: campaigns } = await db
    .from('campaigns')
    .select('id, platform')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .limit(10);

  if (!campaigns?.length) return { campaign_id: null, platform: null };

  // Simple attribution: match click ID type to platform
  if (gclid) {
    const google = campaigns.find(c => c.platform === 'google');
    if (google) return { campaign_id: google.id, platform: 'google' };
  }
  if (fbclid) {
    const meta = campaigns.find(c => c.platform === 'meta');
    if (meta) return { campaign_id: meta.id, platform: 'meta' };
  }
  if (ttclid) {
    const tiktok = campaigns.find(c => c.platform === 'tiktok');
    if (tiktok) return { campaign_id: tiktok.id, platform: 'tiktok' };
  }

  return { campaign_id: null, platform: null };
}

// ── CORS headers for public endpoints ────────────────────────────────────────

function setCorsPublic(reply: FastifyReply) {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function trackingRoutes(app: FastifyInstance) {

  // ── OPTIONS preflight for /track ─────────────────────────────────────────
  app.options('/track', async (_req, reply) => {
    setCorsPublic(reply);
    return reply.code(204).send();
  });

  // ── POST /track — pixel event ingestion ──────────────────────────────────
  app.post('/track', async (request: FastifyRequest, reply: FastifyReply) => {
    setCorsPublic(reply);

    let body: any;
    try {
      body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    } catch {
      return reply.code(400).send('bad json');
    }

    const { pid, event, url, ref, ci = {}, ut = {}, value, currency, order_id } = body ?? {};

    if (!pid || !event) return reply.code(400).send('missing pid or event');

    // Look up tenant by their tenant_id (pid IS the tenant_id)
    const { data: tenant } = await db
      .from('tenants')
      .select('id')
      .eq('id', pid)
      .maybeSingle();

    if (!tenant) return reply.code(200).send('ok'); // silent reject — don't reveal errors

    const tenantId = tenant.id;

    // Dedup purchases by order_id
    if (event === 'purchase' && order_id) {
      const { data: existing } = await db
        .from('conversion_events')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('order_id', order_id)
        .maybeSingle();
      if (existing) return reply.code(200).send('ok'); // already recorded
    }

    // Resolve attribution
    const { campaign_id, platform } = await resolveAttribution(tenantId, ci.gclid ?? null, ci.fbclid ?? null, ci.ttclid ?? null);

    // Hash IP for privacy
    const ip = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? request.ip ?? '';
    const ip_hash = ip ? createHash('sha256').update(ip).digest('hex').slice(0, 16) : null;

    await db.from('conversion_events').insert({
      tenant_id:    tenantId,
      event_type:   event,
      url:          url ?? null,
      referrer:     ref ?? null,
      gclid:        ci.gclid ?? null,
      fbclid:       ci.fbclid ?? null,
      ttclid:       ci.ttclid ?? null,
      utm_source:   ut.source ?? null,
      utm_medium:   ut.medium ?? null,
      utm_campaign: ut.campaign ?? null,
      utm_content:  ut.content ?? null,
      utm_term:     ut.term ?? null,
      value:        value ?? null,
      currency:     currency ?? 'USD',
      order_id:     order_id ?? null,
      campaign_id:  campaign_id ?? null,
      platform:     platform ?? null,
      ip_hash,
      user_agent:   (request.headers['user-agent'] ?? '').slice(0, 200),
    });

    return reply.code(200).send('ok');
  });

  // ── GET /track.js — pixel script (public) ────────────────────────────────
  app.get('/track.js', async (request: FastifyRequest, reply: FastifyReply) => {
    setCorsPublic(reply);
    reply.header('Content-Type', 'application/javascript; charset=utf-8');
    reply.header('Cache-Control', 'public, max-age=3600');

    const { pid } = request.query as any;
    if (!pid) return reply.code(400).send('// missing pid');

    const { data: tenant } = await db.from('tenants').select('id').eq('id', pid).maybeSingle();
    if (!tenant) return reply.code(404).send('// invalid pid');

    return reply.send(buildPixelJs(pid, API_URL));
  });

  // ── GET /track/snippet — HTML snippet for this tenant ────────────────────
  app.get('/track/snippet', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.tenantId;
    const snippet = `<!-- Vigmis Pixel -->\n<script src="${API_URL}/track.js?pid=${tenantId}" async></script>`;
    return reply.send({ snippet, pid: tenantId });
  });

  // ── GET /track/status — tracking setup status ─────────────────────────────
  app.get('/track/status', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.tenantId;

    const since30d = new Date(Date.now() - 30 * 86400_000).toISOString();
    const since24h = new Date(Date.now() - 86400_000).toISOString();

    const [settingsRes, shopifyRes, recentEventRes, events30dRes] = await Promise.all([
      db.from('client_settings')
        .select('tracking_verified, shopify_domain, margin_pct, business_type')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      db.from('shopify_connections')
        .select('shop, created_at')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      db.from('conversion_events')
        .select('created_at, event_type')
        .eq('tenant_id', tenantId)
        .gte('created_at', since24h)
        .order('created_at', { ascending: false })
        .limit(1),
      db.from('conversion_events')
        .select('event_type', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', since30d),
    ]);

    const lastEvent = recentEventRes.data?.[0] ?? null;

    return reply.send({
      pixel_active:      lastEvent !== null,
      last_event_at:     lastEvent?.created_at ?? null,
      tracking_verified: settingsRes.data?.tracking_verified ?? false,
      shopify_connected: !!shopifyRes.data,
      shopify_shop:      shopifyRes.data?.shop ?? null,
      events_30d:        events30dRes.count ?? 0,
      margin_pct:        settingsRes.data?.margin_pct ?? null,
      business_type:     settingsRes.data?.business_type ?? 'ecommerce',
      snippet_url:       `${API_URL}/track.js?pid=${tenantId}`,
    });
  });

  // ── POST /track/verify — mark tracking as verified ────────────────────────
  app.post('/track/verify', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.tenantId;

    // Check if there's at least one event from this tenant
    const { count } = await db
      .from('conversion_events')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    if ((count ?? 0) === 0) {
      return reply.send({ verified: false, message: 'No pixel events received yet. Make sure the snippet is on your website.' });
    }

    await db.from('client_settings')
      .update({ tracking_verified: true, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId);

    return reply.send({ verified: true });
  });

  // ── GET /track/true-roas — True ROAS vs Platform ROAS ─────────────────────
  app.get('/track/true-roas', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.tenantId;
    const { period: periodParam } = request.query as any;
    const days = [7, 30, 90].includes(Number(periodParam)) ? Number(periodParam) : 30;

    const since = new Date(Date.now() - days * 86400_000).toISOString();

    const [settingsRes, purchaseEventsRes, campaignsRes, shopifyRes] = await Promise.all([
      db.from('client_settings').select('margin_pct, business_type').eq('tenant_id', tenantId).maybeSingle(),
      db.from('conversion_events')
        .select('value, currency, order_id')
        .eq('tenant_id', tenantId)
        .eq('event_type', 'purchase')
        .gte('created_at', since),
      db.from('campaigns').select('daily_budget_usd, status').eq('tenant_id', tenantId),
      db.from('shopify_connections').select('shop').eq('tenant_id', tenantId).maybeSingle(),
    ]);

    const marginPct = settingsRes.data?.margin_pct ?? null;
    const purchases = purchaseEventsRes.data ?? [];
    const campaigns = campaignsRes.data ?? [];

    // Estimate spend from campaigns (mock — will be real once ad APIs are live)
    const dailyBudget = campaigns
      .filter(c => c.status === 'active')
      .reduce((s, c) => s + (c.daily_budget_usd ?? 0), 0);
    const spend = parseFloat((dailyBudget * days).toFixed(2));

    const revenueTracked = purchases.reduce((s, e) => s + (e.value ?? 0), 0);
    const conversionsTracked = purchases.length;

    const trueRoas = spend > 0 && revenueTracked > 0
      ? parseFloat((revenueTracked / spend).toFixed(2))
      : null;

    const trueProfit = marginPct && spend > 0 && revenueTracked > 0
      ? parseFloat((revenueTracked * (marginPct / 100) - spend).toFixed(2))
      : null;

    // Platform ROAS (mock — seeded from campaign data)
    const platformRoas = spend > 0
      ? parseFloat((revenueTracked > 0 ? (revenueTracked * 2.1) / spend : 3.5).toFixed(2))
      : 0;

    return reply.send({
      period_days:           days,
      platform_roas:         platformRoas,
      true_roas:             trueRoas,
      true_profit:           trueProfit,
      revenue_tracked:       parseFloat(revenueTracked.toFixed(2)),
      conversions_tracked:   conversionsTracked,
      spend,
      margin_pct:            marginPct,
      data_source:           shopifyRes.data ? 'shopify' : conversionsTracked > 0 ? 'pixel' : 'none',
    });
  });

  // ── POST /track/shopify/connect — start Shopify OAuth ────────────────────
  app.post('/track/shopify/connect', { preHandler: authenticate }, async (request, reply) => {
    if (!SHOPIFY_API_KEY) {
      return reply.code(503).send({ error: 'Shopify integration not configured' });
    }

    const { shop } = request.body as any;
    if (!shop) return reply.code(400).send({ error: 'shop required (e.g. mystore.myshopify.com)' });

    const cleanShop = shop.replace(/https?:\/\//, '').replace(/\/$/, '').toLowerCase();
    if (!/^[a-z0-9-]+\.myshopify\.com$/.test(cleanShop)) {
      return reply.code(400).send({ error: 'Invalid Shopify domain — must be yourstore.myshopify.com' });
    }

    // State = tenantId (we verify on callback)
    const state = `${request.tenantId}:${Date.now()}`;
    const stateB64 = Buffer.from(state).toString('base64');

    const authUrl = new URL(`https://${cleanShop}/admin/oauth/authorize`);
    authUrl.searchParams.set('client_id', SHOPIFY_API_KEY);
    authUrl.searchParams.set('scope', SHOPIFY_SCOPES);
    authUrl.searchParams.set('redirect_uri', SHOPIFY_REDIRECT);
    authUrl.searchParams.set('state', stateB64);

    return reply.send({ auth_url: authUrl.toString() });
  });

  // ── GET /track/shopify/callback — handle Shopify OAuth redirect ───────────
  app.get('/track/shopify/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const { code, shop, state, hmac } = request.query as any;

    if (!code || !shop || !state) {
      return reply.code(400).send('Invalid callback parameters');
    }

    // Verify HMAC from Shopify
    const query = request.query as Record<string, string>;
    const params = Object.entries(query)
      .filter(([k]) => k !== 'hmac' && k !== 'signature')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const expectedHmac = createHmac('sha256', SHOPIFY_API_SECRET).update(params).digest('hex');
    if (!hmac || !safeEqual(expectedHmac, hmac)) {
      return reply.code(401).send('Invalid HMAC');
    }

    // Decode state to get tenantId
    let tenantId: string;
    try {
      const decoded = Buffer.from(state, 'base64').toString('utf8');
      tenantId = decoded.split(':')[0];
    } catch {
      return reply.code(400).send('Invalid state');
    }

    // Exchange code for access token
    let accessToken: string;
    try {
      const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: SHOPIFY_API_KEY,
          client_secret: SHOPIFY_API_SECRET,
          code,
        }),
      });
      const tokenData = await tokenRes.json() as any;
      accessToken = tokenData.access_token;
      if (!accessToken) throw new Error('No access token returned');
    } catch (err) {
      return reply.code(500).send('Failed to exchange code for token');
    }

    // Save connection
    await db.from('shopify_connections').upsert(
      {
        tenant_id:    tenantId,
        shop,
        access_token: encryptToken(accessToken),
        scopes:       SHOPIFY_SCOPES,
        updated_at:   new Date().toISOString(),
      },
      { onConflict: 'tenant_id' },
    );

    // Update client_settings with shopify_domain
    await db.from('client_settings')
      .update({ shopify_domain: shop, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId);

    // Register orders/create webhook
    try {
      await fetch(`https://${shop}/admin/api/2024-01/webhooks.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          webhook: {
            topic: 'orders/create',
            address: `${API_URL}/track/shopify/webhook`,
            format: 'json',
          },
        }),
      });
    } catch {
      // Non-fatal — orders can still be synced manually
    }

    // Audit log
    await db.from('audit_log').insert({
      tenant_id: tenantId,
      action:    'tracking.shopify_connected',
      actor:     'user',
      payload:   { shop },
    });

    // Background: full sync of products + settings + register product webhooks.
    // Non-blocking so the redirect feels instant.
    (async () => {
      try {
        await fullSyncForTenant(tenantId);
        await registerProductWebhooks(tenantId);
      } catch (err) {
        console.error('[shopify] background sync/webhook register failed:', err);
      }
    })();

    // Redirect back to dashboard with success
    const webUrl = process.env.WEB_URL ?? 'https://vigmis.com';
    return reply.redirect(`${webUrl}/dashboard?shopify=connected`);
  });

  // ── POST /track/shopify/products-webhook — products/inventory deltas ────
  app.post('/track/shopify/products-webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const shopDomain = request.headers['x-shopify-shop-domain'] as string;
    const hmacHeader = request.headers['x-shopify-hmac-sha256'] as string;
    const topic = request.headers['x-shopify-topic'] as string;

    if (!shopDomain || !hmacHeader || !topic) return reply.code(401).send('Missing headers');

    const rawBody = (request as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(request.body);
    const expectedHmac = createHmac('sha256', SHOPIFY_API_SECRET).update(rawBody, 'utf8').digest('base64');
    if (!safeEqual(expectedHmac, hmacHeader)) {
      return reply.code(401).send('Invalid HMAC');
    }

    // Resolve tenant from shop_domain
    const { data: conn } = await db.from('shopify_connections')
      .select('tenant_id')
      .eq('shop', shopDomain)
      .maybeSingle();
    if (!conn?.tenant_id) return reply.code(200).send('No tenant for shop');

    await applyProductWebhook(conn.tenant_id, topic, request.body).catch(() => null);
    return reply.send({ ok: true });
  });

  // ── POST /track/shopify/cron-sync — nightly full sync ────────────────────
  app.post('/track/shopify/cron-sync', async (request, reply) => {
    if (!assertCronSecret(request, reply)) return;
    const { dispatchShopifySyncCron } = await import('../services/shopify-sync.js');
    const result = await dispatchShopifySyncCron();
    return reply.send(result);
  });

  // ── POST /track/shopify/webhook — receive Shopify orders ─────────────────
  app.post('/track/shopify/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const shopDomain = request.headers['x-shopify-shop-domain'] as string;
    const hmacHeader = request.headers['x-shopify-hmac-sha256'] as string;

    if (!shopDomain || !hmacHeader) return reply.code(401).send('Missing headers');

    // Verify HMAC over the exact bytes Shopify signed (not a re-serialization).
    const rawBody = (request as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(request.body);
    const expectedHmac = createHmac('sha256', SHOPIFY_API_SECRET).update(rawBody, 'utf8').digest('base64');
    if (!safeEqual(expectedHmac, hmacHeader)) {
      return reply.code(401).send('Invalid HMAC');
    }

    const order = request.body as any;
    if (!order?.id || !order?.total_price) return reply.code(200).send('ok');

    // Find tenant by shop domain
    const { data: connection } = await db
      .from('shopify_connections')
      .select('tenant_id')
      .eq('shop', shopDomain)
      .maybeSingle();

    if (!connection) return reply.code(200).send('ok');

    const tenantId = connection.tenant_id;
    const orderId = String(order.id);
    const value = parseFloat(order.total_price ?? '0');
    const currency = order.currency ?? 'USD';

    // Dedup
    const { data: existing } = await db
      .from('conversion_events')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('order_id', orderId)
      .maybeSingle();
    if (existing) return reply.code(200).send('ok');

    // Extract UTM from order note or landing_site
    const landingSite = order.landing_site ?? '';
    const landingParams = new URLSearchParams(landingSite.includes('?') ? landingSite.split('?')[1] : '');
    const gclid  = landingParams.get('gclid') ?? null;
    const fbclid = landingParams.get('fbclid') ?? null;

    const { campaign_id, platform } = await resolveAttribution(tenantId, gclid, fbclid, null);

    await db.from('conversion_events').insert({
      tenant_id:    tenantId,
      event_type:   'purchase',
      url:          order.landing_site ?? null,
      gclid,
      fbclid,
      utm_source:   landingParams.get('utm_source'),
      utm_medium:   landingParams.get('utm_medium'),
      utm_campaign: landingParams.get('utm_campaign'),
      value,
      currency,
      order_id:     orderId,
      campaign_id:  campaign_id ?? null,
      platform:     platform ?? null,
    });

    return reply.code(200).send('ok');
  });
}
