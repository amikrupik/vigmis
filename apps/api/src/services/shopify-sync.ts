// Shopify Sync — populates shopify_products + shopify_settings tables so
// Truth Verifier (Session 4.1) has real data to fact-check against.
//
// Two paths:
//   1. Full sync — runs once after OAuth + nightly cron. Pulls catalog +
//      shipping policy via Shopify Admin API.
//   2. Webhook delta — products/create, products/update, products/delete +
//      inventory_levels/update keep us in sync between full syncs.

import { db, decryptToken } from '@vigmis/db';

const SHOPIFY_API_VERSION = '2024-01';

interface ShopifyProductVariant {
  id: number;
  price: string;
  compare_at_price: string | null;
  inventory_quantity: number | null;
  inventory_management: string | null;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  status: string;
  image: { src: string } | null;
  variants: ShopifyProductVariant[];
}

async function getShopifyConnection(tenantId: string): Promise<{ shop: string; token: string } | null> {
  const { data } = await db.from('shopify_connections')
    .select('shop, access_token')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!data?.access_token || !data?.shop) return null;
  return { shop: data.shop, token: decryptToken(data.access_token) };
}

/**
 * Full sync — fetches every product page-by-page and upserts to
 * shopify_products. Also pulls shop config (currency, shipping policy).
 */
export async function fullSyncForTenant(tenantId: string): Promise<{ products: number; settings: boolean }> {
  const conn = await getShopifyConnection(tenantId);
  if (!conn) return { products: 0, settings: false };

  // 1. Settings — shop config + shipping zones
  let settings = false;
  try {
    const shopRes = await fetch(`https://${conn.shop}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
      headers: { 'X-Shopify-Access-Token': conn.token },
    });
    const shopJson = await shopRes.json() as { shop?: { currency?: string } };
    const currency = shopJson.shop?.currency ?? 'USD';

    // Detect free shipping — pull shipping_zones, look for a free price-based rate
    let hasFreeShipping = false;
    let freeThreshold: number | null = null;
    try {
      const zonesRes = await fetch(`https://${conn.shop}/admin/api/${SHOPIFY_API_VERSION}/shipping_zones.json`, {
        headers: { 'X-Shopify-Access-Token': conn.token },
      });
      const zonesJson = await zonesRes.json() as {
        shipping_zones?: Array<{
          price_based_shipping_rates?: Array<{ price: string; min_order_subtotal: string | null }>;
          weight_based_shipping_rates?: Array<{ price: string }>;
        }>;
      };
      for (const z of zonesJson.shipping_zones ?? []) {
        for (const r of z.price_based_shipping_rates ?? []) {
          if (parseFloat(r.price) === 0) {
            hasFreeShipping = true;
            if (r.min_order_subtotal) {
              const threshold = parseFloat(r.min_order_subtotal);
              if (!freeThreshold || threshold < freeThreshold) freeThreshold = threshold;
            }
          }
        }
        for (const r of z.weight_based_shipping_rates ?? []) {
          if (parseFloat(r.price) === 0) hasFreeShipping = true;
        }
      }
    } catch { /* zones not exposed in some plans — best-effort */ }

    await db.from('shopify_settings').upsert(
      {
        tenant_id: tenantId,
        shop_domain: conn.shop,
        default_currency: currency,
        has_free_shipping: hasFreeShipping,
        free_shipping_threshold_usd: freeThreshold,
        last_sync_at: new Date().toISOString(),
        enabled: true,
      },
      { onConflict: 'tenant_id' },
    );
    settings = true;
  } catch (err) {
    console.error('[shopify-sync] settings fetch failed:', err);
  }

  // 2. Products — paginate using REST since_id (or cursor-based on 2024-04+)
  let productsSynced = 0;
  let sinceId: number | undefined;
  for (let page = 0; page < 50; page++) {  // hard cap 50 pages × 250 = 12500 products
    const url = new URL(`https://${conn.shop}/admin/api/${SHOPIFY_API_VERSION}/products.json`);
    url.searchParams.set('limit', '250');
    if (sinceId) url.searchParams.set('since_id', String(sinceId));

    let page_data: { products?: ShopifyProduct[] };
    try {
      const res = await fetch(url.toString(), {
        headers: { 'X-Shopify-Access-Token': conn.token },
      });
      if (!res.ok) break;
      page_data = await res.json() as { products?: ShopifyProduct[] };
    } catch (err) {
      console.error('[shopify-sync] products fetch failed:', err);
      break;
    }
    const products = page_data.products ?? [];
    if (products.length === 0) break;

    // Each product has variants — we flatten to the FIRST/cheapest variant per product
    const rows = products.map((p) => {
      const v = p.variants?.[0];
      const inv = (p.variants ?? []).reduce((s, x) => s + (x.inventory_quantity ?? 0), 0);
      return {
        tenant_id: tenantId,
        external_product_id: String(p.id),
        title: p.title,
        handle: p.handle,
        vendor: p.vendor,
        product_type: p.product_type,
        price: v?.price ? parseFloat(v.price) : null,
        compare_at_price: v?.compare_at_price ? parseFloat(v.compare_at_price) : null,
        available: p.status === 'active' && inv > 0,
        inventory_quantity: inv,
        image_url: p.image?.src ?? null,
        status: p.status,
        synced_at: new Date().toISOString(),
      };
    });

    await db.from('shopify_products').upsert(rows, { onConflict: 'tenant_id,external_product_id' });
    productsSynced += rows.length;
    sinceId = products[products.length - 1].id;
    if (products.length < 250) break;
  }

  return { products: productsSynced, settings };
}

/**
 * Register product/inventory webhooks. Called after OAuth.
 */
export async function registerProductWebhooks(tenantId: string): Promise<void> {
  const conn = await getShopifyConnection(tenantId);
  if (!conn) return;
  const apiUrl = process.env.API_URL ?? 'http://localhost:4000';
  const topics = ['products/create', 'products/update', 'products/delete', 'inventory_levels/update'];
  for (const topic of topics) {
    try {
      await fetch(`https://${conn.shop}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': conn.token,
        },
        body: JSON.stringify({
          webhook: {
            topic,
            address: `${apiUrl}/track/shopify/products-webhook`,
            format: 'json',
          },
        }),
      });
    } catch { /* non-fatal */ }
  }
}

/**
 * Apply a product webhook payload to shopify_products.
 * Caller must verify HMAC first.
 */
export async function applyProductWebhook(
  tenantId: string,
  topic: string,
  payload: any,
): Promise<void> {
  if (topic === 'products/delete') {
    await db.from('shopify_products')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('external_product_id', String(payload.id));
    return;
  }

  if (topic === 'products/create' || topic === 'products/update') {
    const p = payload as ShopifyProduct;
    const v = p.variants?.[0];
    const inv = (p.variants ?? []).reduce((s: number, x: any) => s + (Number(x.inventory_quantity) || 0), 0);
    await db.from('shopify_products').upsert(
      {
        tenant_id: tenantId,
        external_product_id: String(p.id),
        title: p.title,
        handle: p.handle,
        vendor: p.vendor,
        product_type: p.product_type,
        price: v?.price ? parseFloat(v.price) : null,
        compare_at_price: v?.compare_at_price ? parseFloat(v.compare_at_price) : null,
        available: p.status === 'active' && inv > 0,
        inventory_quantity: inv,
        image_url: p.image?.src ?? null,
        status: p.status,
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,external_product_id' },
    );
    return;
  }

  if (topic === 'inventory_levels/update') {
    // payload has { inventory_item_id, available }
    // We don't store inventory_item_id directly; refresh just the changed product by full re-fetch on next cron.
    // No-op for now; full nightly sync corrects.
    return;
  }
}

/**
 * Cron entrypoint — runs nightly to keep data fresh.
 */
export async function dispatchShopifySyncCron(): Promise<{ tenants: number; products: number }> {
  const { data: conns } = await db.from('shopify_connections')
    .select('tenant_id')
    .order('updated_at', { ascending: false });
  if (!conns?.length) return { tenants: 0, products: 0 };
  let totalProducts = 0;
  for (const c of conns) {
    const r = await fullSyncForTenant(c.tenant_id).catch(() => ({ products: 0, settings: false }));
    totalProducts += r.products;
  }
  return { tenants: conns.length, products: totalProducts };
}
