// Logo Fetcher — finds a business's logo for use in generated creatives.
//
// Priority order:
//   1. client_settings.logo_url already set → use it as-is
//   2. Scrape website_url HTML → look for og:image / apple-touch-icon / common logo paths
//   3. Try canonical paths: /logo.png, /logo.svg, /logo-white.png, /assets/logo.png
//   4. Favicon as last resort (small, but better than nothing)
//
// If a logo URL is found and client_settings.logo_url was empty, the URL is
// persisted back to the DB so future creatives don't need to re-scrape.

import { db } from '@vigmis/db';

const FETCH_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(url: string): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch {
    return null;
  }
}

// Check if a URL returns a valid image (content-type starts with image/)
async function isValidImageUrl(url: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res || !res.ok) return false;
    const ct = res.headers.get('content-type') ?? '';
    return ct.startsWith('image/');
  } catch {
    return false;
  }
}

// Parse HTML string for logo URL hints
function extractLogoFromHtml(html: string, baseUrl: string): string | null {
  const base = baseUrl.replace(/\/$/, '');

  // og:image — often a high-quality brand image
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogMatch?.[1]) {
    const u = ogMatch[1];
    return u.startsWith('http') ? u : `${base}${u.startsWith('/') ? '' : '/'}${u}`;
  }

  // apple-touch-icon — 180x180, better than favicon
  const appleMatch = html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i)
    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i);
  if (appleMatch?.[1]) {
    const u = appleMatch[1];
    return u.startsWith('http') ? u : `${base}${u.startsWith('/') ? '' : '/'}${u}`;
  }

  // <img> with logo in src, class, or alt (heuristic)
  const imgMatch = html.match(/<img[^>]+(src|class|alt)=["'][^"']*logo[^"']*["'][^>]*>/i);
  if (imgMatch) {
    const srcMatch = imgMatch[0].match(/src=["']([^"']+)["']/i);
    if (srcMatch?.[1]) {
      const u = srcMatch[1];
      return u.startsWith('http') ? u : `${base}${u.startsWith('/') ? '' : '/'}${u}`;
    }
  }

  return null;
}

// Common logo file paths to probe
function candidatePaths(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/$/, '');
  return [
    `${base}/logo.svg`,
    `${base}/logo.png`,
    `${base}/logo-white.png`,
    `${base}/logo-dark.png`,
    `${base}/assets/logo.png`,
    `${base}/assets/logo.svg`,
    `${base}/images/logo.png`,
    `${base}/images/logo.svg`,
    `${base}/img/logo.png`,
    `${base}/static/logo.png`,
    `${base}/public/logo.png`,
    `${base}/favicon.png`,
    `${base}/apple-touch-icon.png`,
    `${base}/favicon.ico`,
  ];
}

export async function fetchLogoForTenant(tenantId: string): Promise<string | null> {
  // Step 1: check if already stored
  const { data: settings } = await db
    .from('client_settings')
    .select('logo_url, website_url')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!settings) return null;

  const storedLogo: string | null = (settings as any).logo_url ?? null;
  if (storedLogo) return storedLogo;

  const websiteUrl: string | null = (settings as any).website_url ?? null;
  if (!websiteUrl) return null;

  const base = websiteUrl.replace(/\/$/, '');

  // Step 2: scrape HTML for logo hints
  let htmlLogo: string | null = null;
  try {
    const res = await fetchWithTimeout(base);
    if (res?.ok) {
      const html = await res.text();
      htmlLogo = extractLogoFromHtml(html, base);
    }
  } catch { /* scrape failed */ }

  // Step 3: probe common logo paths
  const candidates = htmlLogo
    ? [htmlLogo, ...candidatePaths(base)]
    : candidatePaths(base);

  let foundUrl: string | null = null;
  for (const url of candidates) {
    if (await isValidImageUrl(url)) {
      foundUrl = url;
      break;
    }
  }

  // Step 4: persist if found so future calls are instant
  if (foundUrl) {
    await db
      .from('client_settings')
      .update({ logo_url: foundUrl, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId);
  }

  return foundUrl;
}
