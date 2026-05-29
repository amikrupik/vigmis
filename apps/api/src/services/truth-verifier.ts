// Truth Verifier — cross-reference claims in content against authoritative
// sources we already have (website crawl, Shopify inventory/prices).
//
// The policy classifier catches BAD content (illegal claims, defamation,
// hate). The truth verifier catches WRONG content — claims that contradict
// what the customer's own website or storefront says. Both gates matter:
//
//   classifier:    "free shipping always"  → may be misleading per regulation
//   truth_verifier: "free shipping always"  → checkout shows $9 shipping → BLOCK
//
// This is the data-joins gate. Cheaper, more deterministic, and addresses
// the most common real-world failure mode: AI generates a price/promise that
// doesn't match the customer's actual storefront.

import { db } from '@vigmis/db';

export type ContradictionSeverity = 'block' | 'warn' | 'info';

export interface Contradiction {
  severity: ContradictionSeverity;
  category: string;
  claim: string;          // what the content asserts
  observed: string;       // what we actually see in the source
  source: 'website_analysis' | 'shopify_inventory' | 'shopify_price' | 'business_settings';
  fix_suggestion: string;
}

export interface VerificationResult {
  ok: boolean;
  contradictions: Contradiction[];
  checked_at: string;
}

export interface VerifyInput {
  tenantId: string;
  contentText: string;
  contentKind?: 'ad_copy' | 'post' | 'video_script' | 'landing_claim' | 'other';
}

// ─── Claim patterns to extract from content ──────────────────────────────────
// Each pattern is intentionally narrow to keep false-positives low. We'd
// rather miss a claim than block a legitimate post.

interface ClaimPattern {
  kind: 'free_shipping' | 'price' | 'discount_pct' | 'limited_stock' | 'limited_time';
  pattern: RegExp;
  extract: (match: RegExpMatchArray) => string;
}

const CLAIM_PATTERNS: ClaimPattern[] = [
  // English free shipping
  {
    kind: 'free_shipping',
    pattern: /\bfree\s+shipping\b/i,
    extract: () => 'free shipping',
  },
  // Hebrew free shipping
  {
    kind: 'free_shipping',
    pattern: /(משלוח\s+חינם|משלוח\s+ללא\s+תשלום)/,
    extract: () => 'free shipping',
  },
  // Explicit price: "$49" / "₪149" / "149₪"
  {
    kind: 'price',
    pattern: /(?:\$|USD\s*|₪|ILS\s*|€|EUR\s*)(\d{1,5}(?:[.,]\d{1,2})?)|(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:₪|ILS)/i,
    extract: (m) => m[1] ?? m[2],
  },
  // "50% off" / "20%-30% הנחה"
  {
    kind: 'discount_pct',
    pattern: /(\d{1,2})\s*%\s*(?:off|discount|הנחה|דיסקאונט)/i,
    extract: (m) => m[1],
  },
  // "only 3 left" / "נשארו 5"
  {
    kind: 'limited_stock',
    pattern: /(?:only\s+(\d{1,3})\s+left|נשארו\s+(\d{1,3})|רק\s+(\d{1,3})\s+במלאי)/i,
    extract: (m) => m[1] ?? m[2] ?? m[3] ?? '?',
  },
  // "ends today" / "מסתיים היום" / "24 hours only"
  {
    kind: 'limited_time',
    pattern: /(ends\s+today|24\s+hours\s+only|מסתיים\s+היום|רק\s+היום)/i,
    extract: () => 'urgent_time_limit',
  },
];

// ─── Verification logic ──────────────────────────────────────────────────────

export async function verifyContent(input: VerifyInput): Promise<VerificationResult> {
  const text = input.contentText;
  const contradictions: Contradiction[] = [];

  // Extract claims from the content
  const claims = extractClaims(text);
  if (claims.length === 0) {
    return { ok: true, contradictions: [], checked_at: new Date().toISOString() };
  }

  // Fetch authoritative sources once
  const [websiteAnalysis, shopifyProducts, shopifyShipping] = await Promise.all([
    getWebsiteAnalysis(input.tenantId),
    getShopifyProducts(input.tenantId),
    getShopifyShippingPolicy(input.tenantId),
  ]);

  for (const claim of claims) {
    if (claim.kind === 'free_shipping') {
      const c = verifyFreeShipping(claim.extracted, shopifyShipping, websiteAnalysis);
      if (c) contradictions.push(c);
    } else if (claim.kind === 'price') {
      const c = verifyPrice(claim.extracted, shopifyProducts);
      if (c) contradictions.push(c);
    } else if (claim.kind === 'limited_stock') {
      const c = verifyLimitedStock(claim.extracted, shopifyProducts);
      if (c) contradictions.push(c);
    } else if (claim.kind === 'limited_time') {
      // We can't verify time-limits against any source — flag as info so the
      // operator can confirm they have a real deadline.
      contradictions.push({
        severity: 'info',
        category: 'unverifiable_urgency',
        claim: claim.extracted,
        observed: 'No verifiable end-time in business settings or Shopify',
        source: 'business_settings',
        fix_suggestion: 'Set the actual end date in campaign settings so this urgency is substantiated.',
      });
    } else if (claim.kind === 'discount_pct') {
      // We don't have a discount source yet (Shopify discount codes are an
      // additional integration). Flag as info for now.
      contradictions.push({
        severity: 'info',
        category: 'unverified_discount',
        claim: `${claim.extracted}% discount`,
        observed: 'No discount source connected',
        source: 'business_settings',
        fix_suggestion: 'Connect a Shopify discount code or document the offer to substantiate this claim.',
      });
    }
  }

  const blocking = contradictions.some((c) => c.severity === 'block');
  return {
    ok: !blocking,
    contradictions,
    checked_at: new Date().toISOString(),
  };
}

// ─── Source fetchers ─────────────────────────────────────────────────────────

async function getWebsiteAnalysis(tenantId: string): Promise<string | null> {
  const { data } = await db.from('client_settings')
    .select('website_analysis')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data?.website_analysis ?? null;
}

interface ShopifyProductLite {
  title: string;
  price: number | null;
  available: boolean;
  inventory_quantity: number | null;
}

async function getShopifyProducts(tenantId: string): Promise<ShopifyProductLite[] | null> {
  // We may or may not have a Shopify products cache table. Try shopify_products
  // first, then shopify_settings.products_snapshot if that exists. If neither
  // exists, return null — the verifier degrades gracefully.
  const { data: products } = await db.from('shopify_products')
    .select('title, price, available, inventory_quantity')
    .eq('tenant_id', tenantId)
    .limit(200);
  if (products && products.length > 0) return products as ShopifyProductLite[];
  return null;
}

async function getShopifyShippingPolicy(tenantId: string): Promise<{
  free_shipping_threshold_usd: number | null;
  has_free_shipping: boolean;
} | null> {
  const { data } = await db.from('shopify_settings')
    .select('free_shipping_threshold_usd, has_free_shipping')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!data) return null;
  return data as { free_shipping_threshold_usd: number | null; has_free_shipping: boolean };
}

// ─── Claim verifiers ─────────────────────────────────────────────────────────

function verifyFreeShipping(
  claim: string,
  shipping: { free_shipping_threshold_usd: number | null; has_free_shipping: boolean } | null,
  websiteAnalysis: string | null,
): Contradiction | null {
  // If we have explicit Shopify shipping data, trust it.
  if (shipping) {
    if (!shipping.has_free_shipping) {
      return {
        severity: 'block',
        category: 'shipping_contradiction',
        claim,
        observed: 'Shopify settings show no free shipping enabled',
        source: 'shopify_inventory',
        fix_suggestion: 'Enable free shipping in Shopify, or remove the claim from this ad.',
      };
    }
    if (shipping.free_shipping_threshold_usd && shipping.free_shipping_threshold_usd > 0) {
      return {
        severity: 'warn',
        category: 'shipping_conditional',
        claim,
        observed: `Free shipping requires order ≥ $${shipping.free_shipping_threshold_usd}`,
        source: 'shopify_inventory',
        fix_suggestion: `Add "on orders over $${shipping.free_shipping_threshold_usd}" to be accurate.`,
      };
    }
  }
  // No Shopify data — try website text. If website explicitly says "free
  // shipping", we're fine. If it says "shipping cost" or pricing, warn.
  if (websiteAnalysis) {
    const lower = websiteAnalysis.toLowerCase();
    if (lower.includes('free shipping') || lower.includes('משלוח חינם')) {
      return null; // verified
    }
    if (lower.includes('shipping cost') || lower.includes('עלות משלוח') || lower.includes('דמי משלוח')) {
      return {
        severity: 'warn',
        category: 'shipping_conditional',
        claim,
        observed: 'Website mentions shipping cost without confirming free option',
        source: 'website_analysis',
        fix_suggestion: 'Confirm that free shipping is available, or remove the claim.',
      };
    }
  }
  // No source contradicts but no source confirms — info.
  return {
    severity: 'info',
    category: 'shipping_unverified',
    claim,
    observed: 'Cannot find supporting evidence in website or Shopify settings',
    source: 'website_analysis',
    fix_suggestion: 'Confirm shipping policy is documented before publishing.',
  };
}

function verifyPrice(priceStr: string, products: ShopifyProductLite[] | null): Contradiction | null {
  const priceNum = parseFloat(priceStr.replace(',', '.'));
  if (isNaN(priceNum) || priceNum <= 0) return null;
  if (!products || products.length === 0) return null;

  // Check if the asserted price matches ANY product within ±5%.
  // We're not claiming the ad mentions a SPECIFIC product — just that the
  // price is in the ballpark of what's actually sold.
  const tolerance = 0.05;
  const matches = products.filter((p) => {
    if (p.price == null) return false;
    const diff = Math.abs(p.price - priceNum) / Math.max(p.price, priceNum);
    return diff <= tolerance;
  });
  if (matches.length === 0) {
    const min = Math.min(...products.map((p) => p.price ?? Infinity).filter((p) => isFinite(p)));
    const max = Math.max(...products.map((p) => p.price ?? 0));
    return {
      severity: 'warn',
      category: 'price_mismatch',
      claim: `${priceStr}`,
      observed: `Shopify catalog has products priced from ${min.toFixed(0)} to ${max.toFixed(0)}; no item within ±5% of ${priceNum}`,
      source: 'shopify_price',
      fix_suggestion: 'Verify the price in the ad matches an actual product in the catalog.',
    };
  }
  return null;
}

function verifyLimitedStock(qtyStr: string, products: ShopifyProductLite[] | null): Contradiction | null {
  if (!products) return null;
  const claimedQty = parseInt(qtyStr, 10);
  if (isNaN(claimedQty)) return null;

  // Limited-stock claims are scarcity messaging. If actual inventory across
  // the catalog is much higher, this is misleading scarcity.
  const totalInventory = products.reduce((sum, p) => sum + (p.inventory_quantity ?? 0), 0);
  if (totalInventory > claimedQty * 20 && totalInventory > 100) {
    return {
      severity: 'block',
      category: 'fake_scarcity',
      claim: `${claimedQty} left`,
      observed: `Shopify inventory across catalog: ${totalInventory} units`,
      source: 'shopify_inventory',
      fix_suggestion: 'Remove the scarcity claim unless it reflects actual stock of a specific product.',
    };
  }
  return null;
}

// ─── Claim extraction ────────────────────────────────────────────────────────

interface ExtractedClaim {
  kind: ClaimPattern['kind'];
  extracted: string;
}

function extractClaims(text: string): ExtractedClaim[] {
  const out: ExtractedClaim[] = [];
  for (const p of CLAIM_PATTERNS) {
    const m = text.match(p.pattern);
    if (m) {
      out.push({ kind: p.kind, extracted: p.extract(m) });
    }
  }
  return out;
}
