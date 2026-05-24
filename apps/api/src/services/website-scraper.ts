// Real website scraper used by onboarding analysis and social content generation.
// Goes beyond the homepage: crawls a handful of high-signal sub-pages, extracts
// Open Graph metadata + JSON-LD Product schema (which Shopify/Wix/Squarespace emit),
// and only returns content if there's enough material to be honest about it.
//
// Returns null when the site can't be read meaningfully. Callers MUST treat null as
// "we don't know what this business does" and refuse to invent strategy/copy.

export interface ScrapedSite {
  url: string;
  text: string;                  // combined plain-text content
  og: { title?: string; description?: string; siteName?: string; image?: string };
  jsonLdProducts: Array<{ name?: string; description?: string; price?: string; brand?: string; category?: string }>;
  pagesCrawled: string[];
  confident: boolean;            // true if we extracted enough to describe the business
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; VigmisBot/1.0; +https://vigmis.com)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const CANDIDATE_PATHS = [
  '/',
  '/about', '/about-us', '/our-story',
  '/products', '/shop', '/collections', '/catalog',
  '/services', '/menu', '/treatments',
  '/faq',
];

const MAX_PAGES = 6;
const PER_PAGE_TIMEOUT = 8000;
const MIN_CONFIDENCE_CHARS = 500;

function origin(url: string): string | null {
  try { return new URL(url).origin; } catch { return null; }
}

function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMeta(html: string, prop: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
  return html.match(re)?.[1];
}

function extractJsonLd(html: string): any[] {
  const blocks: any[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try { blocks.push(JSON.parse(m[1].trim())); } catch { /* ignore broken JSON-LD */ }
  }
  return blocks.flat().filter(Boolean);
}

function flattenProducts(jsonLd: any[]): ScrapedSite['jsonLdProducts'] {
  const products: ScrapedSite['jsonLdProducts'] = [];
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const type = node['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (types.includes('Product') || types.includes('ProductGroup')) {
      products.push({
        name: typeof node.name === 'string' ? node.name : undefined,
        description: typeof node.description === 'string' ? node.description.slice(0, 400) : undefined,
        price: node.offers?.price ? String(node.offers.price) : undefined,
        brand: typeof node.brand === 'string' ? node.brand : (node.brand?.name as string | undefined),
        category: typeof node.category === 'string' ? node.category : undefined,
      });
    }
    // Recurse into @graph or any nested object
    if (Array.isArray(node['@graph'])) visit(node['@graph']);
    for (const k of Object.keys(node)) {
      if (k === '@graph' || k === '@type') continue;
      const v = node[k];
      if (v && typeof v === 'object') visit(v);
    }
  };
  jsonLd.forEach(visit);
  return products.slice(0, 12);
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(PER_PAGE_TIMEOUT) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function scrapeWebsite(rootUrl: string): Promise<ScrapedSite | null> {
  const root = origin(rootUrl);
  if (!root) return null;

  // 1. Homepage first — gives us links to crawl + og + JSON-LD
  const homeHtml = await fetchHtml(rootUrl);
  if (!homeHtml) return null;

  const og = {
    title:       extractMeta(homeHtml, 'og:title') ?? extractMeta(homeHtml, 'twitter:title'),
    description: extractMeta(homeHtml, 'og:description') ?? extractMeta(homeHtml, 'description') ?? extractMeta(homeHtml, 'twitter:description'),
    siteName:    extractMeta(homeHtml, 'og:site_name'),
    image:       extractMeta(homeHtml, 'og:image'),
  };

  const internalLinks = new Set<string>();
  const linkRe = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(homeHtml)) !== null) {
    const href = lm[1];
    try {
      const parsed: URL = new URL(href, root);
      if (parsed.origin === root) internalLinks.add(parsed.pathname + parsed.search);
    } catch { /* ignore */ }
  }

  // 2. Build crawl list: candidate paths first, then any internal link that looks
  // product/category-like, up to MAX_PAGES total.
  const toCrawl = new Set<string>(['/']);
  for (const path of CANDIDATE_PATHS) {
    if (internalLinks.has(path) || internalLinks.has(path + '/')) toCrawl.add(path);
  }
  for (const href of internalLinks) {
    if (toCrawl.size >= MAX_PAGES) break;
    if (/\/(product|item|shop|collection|category)\//i.test(href)) toCrawl.add(href);
  }

  const pages: string[] = [];
  const collected: string[] = [extractText(homeHtml).slice(0, 3000)];
  const jsonLd: any[] = extractJsonLd(homeHtml);
  pages.push(rootUrl);

  for (const path of toCrawl) {
    if (pages.length >= MAX_PAGES) break;
    const url = path === '/' ? rootUrl : `${root}${path}`;
    if (url === rootUrl) continue;
    const html = await fetchHtml(url);
    if (!html) continue;
    pages.push(url);
    collected.push(extractText(html).slice(0, 2000));
    jsonLd.push(...extractJsonLd(html));
  }

  const products = flattenProducts(jsonLd);

  // 3. Build the combined text. Lead with structured signals (og + products) so
  // the LLM sees them even if the body text is sparse (JS-rendered SPA case).
  const parts: string[] = [];
  if (og.siteName)    parts.push(`Site name: ${og.siteName}`);
  if (og.title)       parts.push(`Page title: ${og.title}`);
  if (og.description) parts.push(`Site description: ${og.description}`);
  if (products.length) {
    parts.push('Products (from JSON-LD schema):');
    for (const p of products.slice(0, 8)) {
      const bits = [p.name, p.brand, p.category, p.price ? `$${p.price}` : null, p.description].filter(Boolean);
      parts.push(`  - ${bits.join(' | ')}`);
    }
  }
  parts.push('Body content:');
  parts.push(collected.join('\n').slice(0, 8000));

  const text = parts.join('\n').trim();

  // Confidence gate: refuse to confabulate. The signal we trust most is:
  // (a) we have OG metadata, OR (b) we found JSON-LD products, OR
  // (c) body text is non-trivial after stripping nav/footer junk.
  const confident =
    !!og.description ||
    products.length > 0 ||
    text.length >= MIN_CONFIDENCE_CHARS;

  return {
    url: rootUrl,
    text,
    og,
    jsonLdProducts: products,
    pagesCrawled: pages,
    confident,
  };
}
