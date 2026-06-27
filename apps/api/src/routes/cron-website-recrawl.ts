import type { FastifyInstance } from 'fastify';
import { db } from '@vigmis/db';
import { route } from '@vigmis/ai-router';
import { hasValidCronSecret } from '../middleware/secrets.js';
import { scrapeWebsite } from '../services/website-scraper.js';

/**
 * Weekly website re-crawl cron.
 * Detects when a client's website has changed significantly (new product, price, offer, CTA)
 * and updates website_analysis + creates a strategy review alert.
 */
export async function websiteRecrawlRoutes(app: FastifyInstance) {
  app.post('/cron/website-recrawl', async (request, reply) => {
    if (!hasValidCronSecret(request)) return reply.code(401).send({ error: 'unauthorized' });

    const { data: tenants } = await db
      .from('client_settings')
      .select('tenant_id, website_url, website_analysis')
      .not('website_url', 'is', null)
      .neq('website_url', '');

    if (!tenants?.length) return reply.send({ recrawled: 0, changed: 0 });

    let recrawled = 0;
    let changed = 0;

    for (const row of tenants) {
      if (!row.website_url) continue;

      try {
        const scraped = await scrapeWebsite(row.website_url);
        if (!scraped || !scraped.confident) continue;
        recrawled++;

        // Skip if we have no previous analysis to compare
        if (!row.website_analysis) {
          await db.from('client_settings').update({
            website_analysis: scraped.text.slice(0, 3000),
            updated_at: new Date().toISOString(),
          }).eq('tenant_id', row.tenant_id);
          continue;
        }

        // Detect significant change via LLM diff
        const diffRes = await route({
          task: 'cheap_task',
          prompt: `Compare these two versions of a business website's content. Detect if there is a SIGNIFICANT change that would affect an advertising strategy.

OLD CONTENT (summary):
${(row.website_analysis as string).slice(0, 800)}

NEW CONTENT:
${scraped.text.slice(0, 800)}

Respond ONLY with JSON:
{"changed": true/false, "change_summary": "one sentence describing what changed, or null if no change", "change_type": "pricing|product|offer|cta|messaging|none"}`,
          options: { maxTokens: 200 },
        });

        let diffResult: { changed: boolean; change_summary: string | null; change_type: string } = { changed: false, change_summary: null, change_type: 'none' };
        try {
          diffResult = JSON.parse(diffRes.output.replace(/```json\n?|\n?```/g, '').trim());
        } catch { /* non-blocking */ }

        if (diffResult.changed) {
          changed++;

          // Update website analysis
          await db.from('client_settings').update({
            website_analysis: scraped.text.slice(0, 3000),
            updated_at: new Date().toISOString(),
          }).eq('tenant_id', row.tenant_id);

          // Create a news alert so the user sees it in their dashboard
          await db.from('news_alerts').insert({
            tenant_id: row.tenant_id,
            source: 'vigmis_internal',
            title: `Website change detected: ${diffResult.change_type}`,
            why_relevant: diffResult.change_summary ?? 'Your website content changed significantly.',
            suggested_action: 'Review your strategy — the change may affect your current campaign targeting or messaging.',
            relevance_score: 0.9,
            status: 'active',
          });

          // Queue as evidence for materiality assessment
          await db.from('evidence_events').insert({
            tenant_id: row.tenant_id,
            event_type: 'website_change',
            description: diffResult.change_summary ?? 'Website content changed',
            magnitude: diffResult.change_type === 'product' || diffResult.change_type === 'pricing' ? 'large' : 'medium',
          });

          // Log to audit
          await db.from('audit_log').insert({
            tenant_id: row.tenant_id,
            action: 'website.change_detected',
            actor: 'system',
            payload: { change_type: diffResult.change_type, summary: diffResult.change_summary },
          });
        }
      } catch { /* skip this tenant, continue */ }
    }

    return reply.send({ recrawled, changed });
  });
}
