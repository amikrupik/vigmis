// GEO — Generative Engine Optimization
// POST /geo/audit   — crawl website, analyze for AI visibility, generate Schema + FAQ + description
// GET  /geo/report  — return stored report for this tenant
// POST /geo/refresh — delete existing report and re-run audit

import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { route } from '@vigmis/ai-router';

function extractHtmlData(html: string) {
  // Pull JSON-LD schema blocks
  const schemaBlocks: string[] = [];
  const schemaRx = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = schemaRx.exec(html)) !== null) schemaBlocks.push(m[1].trim());

  // Meta tags
  const metaDesc = (/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html))?.[1] ?? '';
  const ogTitle  = (/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html))?.[1] ?? '';
  const ogDesc   = (/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i.exec(html))?.[1] ?? '';
  const ogType   = (/<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']+)["']/i.exec(html))?.[1] ?? '';

  // Title tag
  const titleTag = (/<title[^>]*>([^<]+)<\/title>/i.exec(html))?.[1]?.trim() ?? '';

  // Headings
  const h1s: string[] = [];
  const h2s: string[] = [];
  const h1Rx = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
  const h2Rx = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  while ((m = h1Rx.exec(html)) !== null) h1s.push(m[1].replace(/<[^>]+>/g, '').trim());
  while ((m = h2Rx.exec(html)) !== null) h2s.push(m[1].replace(/<[^>]+>/g, '').trim());

  // FAQ-like patterns (look for question-ish h3/dt/summary tags)
  const faqSignals: string[] = [];
  const h3Rx = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  while ((m = h3Rx.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    if (text.includes('?') || /^(what|how|why|when|where|who|can|is|are|do|does)/i.test(text)) {
      faqSignals.push(text);
    }
  }

  // NAP signals
  const hasPhone   = /(\+?\d[\d\s\-().]{7,})|tel:/i.test(html);
  const hasEmail   = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(html);
  const hasAddress = /(street|avenue|road|blvd|מוצר|כתובת|רחוב|עיר|\d{4,5})/i.test(html);

  // Reviews/ratings schema
  const hasReviews = /"@type"\s*:\s*"(Review|AggregateRating)"/i.test(html);

  // Readable page content (stripped of tags, limited)
  const pageText = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);

  return {
    schemaBlocks,
    metaDesc,
    ogTitle,
    ogDesc,
    ogType,
    titleTag,
    h1s: h1s.slice(0, 5),
    h2s: h2s.slice(0, 10),
    faqSignals: faqSignals.slice(0, 5),
    hasPhone,
    hasEmail,
    hasAddress,
    hasReviews,
    pageText,
  };
}

export async function geoRoutes(app: FastifyInstance) {

  // ── Run audit ────────────────────────────────────────────────────────────────
  app.post('/geo/audit', { preHandler: authenticate }, async (request, reply) => {
    const { website_url: bodyUrl } = request.body as any;

    // Use provided URL or fall back to saved website_url
    let websiteUrl = bodyUrl;
    if (!websiteUrl) {
      const { data: s } = await db.from('client_settings').select('website_url').eq('tenant_id', request.tenantId).maybeSingle();
      websiteUrl = s?.website_url;
    }
    if (!websiteUrl) return reply.code(400).send({ error: 'No website URL found. Please provide website_url.' });

    // Fetch website HTML
    let extracted: ReturnType<typeof extractHtmlData>;
    try {
      const res = await fetch(websiteUrl, {
        headers: { 'User-Agent': 'Vigmis/1.0 (GEO Audit; contact: support@vigmis.com)' },
        signal: AbortSignal.timeout(12000),
      });
      const html = await res.text();
      extracted = extractHtmlData(html);
    } catch {
      extracted = {
        schemaBlocks: [], metaDesc: '', ogTitle: '', ogDesc: '', ogType: '',
        titleTag: '', h1s: [], h2s: [], faqSignals: [], hasPhone: false,
        hasEmail: false, hasAddress: false, hasReviews: false, pageText: 'Could not fetch website.',
      };
    }

    const { data: settings } = await db.from('client_settings')
      .select('business_type, goal, geo_include')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();

    const res = await route({
      task: 'analysis',
      prompt: `You are a GEO (Generative Engine Optimization) expert. Your job is to analyze a business website and determine how visible and trustworthy it appears to AI systems like ChatGPT, Claude, Gemini, and Perplexity when users ask for business recommendations.

Website: ${websiteUrl}
Business type: ${settings?.business_type ?? 'unknown'}
Goal: ${settings?.goal ?? 'leads'}
Territory: ${(settings?.geo_include ?? []).join(', ') || 'Not specified'}

WHAT WE FOUND ON THE WEBSITE:
- Title tag: "${extracted.titleTag}"
- Meta description: "${extracted.metaDesc}"
- H1 tags: ${extracted.h1s.length > 0 ? extracted.h1s.map(h => `"${h}"`).join(', ') : 'NONE FOUND'}
- H2 tags (first 10): ${extracted.h2s.length > 0 ? extracted.h2s.slice(0,5).map(h => `"${h}"`).join(', ') : 'NONE FOUND'}
- Existing JSON-LD Schema blocks: ${extracted.schemaBlocks.length > 0 ? extracted.schemaBlocks.length + ' found' : 'NONE — this is a major gap'}
- Open Graph tags: ${extracted.ogTitle ? `og:title="${extracted.ogTitle}"` : 'MISSING'}
- FAQ signals (question headings): ${extracted.faqSignals.length > 0 ? extracted.faqSignals.join(', ') : 'None detected'}
- Phone number found: ${extracted.hasPhone ? 'Yes' : 'No'}
- Email found: ${extracted.hasEmail ? 'Yes' : 'No'}
- Address found: ${extracted.hasAddress ? 'Yes' : 'No'}
- Reviews/ratings schema: ${extracted.hasReviews ? 'Yes' : 'No'}
- Page content sample: ${extracted.pageText.slice(0, 1500)}

YOUR TASKS:
1. Score this website's GEO readiness (0-100)
2. Identify specific issues
3. Generate production-ready JSON-LD Schema.org code for this business
4. Generate 10 FAQ question-answer pairs that AI systems would use to recommend this business
5. Write an AI-optimized business description (exactly 120 words, factual, structured)
6. List manual checklist items the business owner should do

Return ONLY valid JSON — no explanation, no markdown, just JSON:
{
  "score": 0-100,
  "grade": "A|B|C|D|F",
  "issues": [
    {
      "severity": "critical|warning|info",
      "element": "Schema.org markup|Meta description|H1 tag|Open Graph|FAQ content|NAP data|Reviews|Business description|Page structure",
      "problem": "Specific problem found on this website",
      "fix": "Exact actionable fix they should implement",
      "impact": "high|medium|low"
    }
  ],
  "strengths": ["What the website already does well — be specific"],
  "schema_code": "{\\"@context\\": \\"https://schema.org\\", \\"@type\\": \\"LocalBusiness or Organization or appropriate type\\", ... complete valid JSON-LD for this specific business}",
  "faq": [
    { "question": "Natural question a user might ask an AI about this business", "answer": "Factual, specific answer that an AI would cite" }
  ],
  "business_description": "Exactly 120 words. Structured for AI consumption. Starts with business name, includes what they do, who they serve, location, key differentiators, contact method. No marketing fluff — only facts.",
  "checklist": [
    { "item": "Register on Google Business Profile at business.google.com", "priority": "critical|high|medium", "url": "https://..." },
    { "item": "Submit to Yad2 / Dapei Zahav business directory", "priority": "high", "url": null }
  ]
}

The schema_code must be valid JSON-LD, complete, and specific to this business based on what you can infer from the page content. Include: @context, @type, name, description, url, and any relevant properties (telephone, address, openingHours, sameAs, etc.) that can be inferred.`,
      systemPrompt: 'You are a GEO (Generative Engine Optimization) specialist. Return only valid JSON. No markdown. No explanation.',
      options: { maxTokens: 3000, temperature: 0.2 },
    });

    let report: any;
    try {
      const match = res.output.match(/\{[\s\S]*\}/);
      report = match ? JSON.parse(match[0]) : null;
    } catch { report = null; }

    if (!report) {
      report = {
        score: 35,
        grade: 'D',
        issues: [
          { severity: 'critical', element: 'Schema.org markup', problem: 'No structured data found on the website', fix: 'Add JSON-LD schema block to <head> with Organization or LocalBusiness type', impact: 'high' },
          { severity: 'critical', element: 'FAQ content', problem: 'No FAQ section detected — AI systems can\'t extract Q&A about this business', fix: 'Add a FAQ section with 8-10 common customer questions and answers', impact: 'high' },
        ],
        strengths: ['Website is accessible'],
        schema_code: `{"@context":"https://schema.org","@type":"Organization","name":"Business Name","url":"${websiteUrl}","description":"Business description"}`,
        faq: [
          { question: 'What services does this business offer?', answer: 'Please run the audit again for specific FAQ content.' },
        ],
        business_description: 'Please run the audit again with a reachable website URL.',
        checklist: [
          { item: 'Register on Google Business Profile', priority: 'critical', url: 'https://business.google.com' },
          { item: 'Add JSON-LD Schema.org markup to website <head>', priority: 'critical', url: 'https://schema.org' },
          { item: 'Add FAQ section to website homepage', priority: 'high', url: null },
        ],
      };
    }

    // Upsert report (one per tenant)
    const { data: existing } = await db.from('geo_reports').select('id').eq('tenant_id', request.tenantId).maybeSingle();

    if (existing?.id) {
      await db.from('geo_reports').update({
        website_url: websiteUrl,
        score: report.score,
        grade: report.grade,
        issues: report.issues ?? [],
        strengths: report.strengths ?? [],
        schema_code: report.schema_code ?? '',
        faq: report.faq ?? [],
        business_description: report.business_description ?? '',
        checklist: report.checklist ?? [],
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await db.from('geo_reports').insert({
        tenant_id: request.tenantId,
        website_url: websiteUrl,
        score: report.score,
        grade: report.grade,
        issues: report.issues ?? [],
        strengths: report.strengths ?? [],
        schema_code: report.schema_code ?? '',
        faq: report.faq ?? [],
        business_description: report.business_description ?? '',
        checklist: report.checklist ?? [],
      });
    }

    return reply.send({ ...report, website_url: websiteUrl });
  });

  // ── Get stored report ────────────────────────────────────────────────────────
  app.get('/geo/report', { preHandler: authenticate }, async (request, reply) => {
    const { data } = await db.from('geo_reports')
      .select('*')
      .eq('tenant_id', request.tenantId)
      .maybeSingle();

    if (!data) return reply.send({ exists: false });
    return reply.send({ exists: true, ...data });
  });
}
