// AI Landscape Monthly Digest — sent on the 1st of every month to the Vigmis team.
//
// Uses Perplexity Sonar Pro (web search) to gather current AI + ad platform news,
// then Claude Sonnet to synthesize into a structured, actionable digest.
//
// Sections:
//   1. Creative AI Tools (image, video, copy generators — new or improved)
//   2. Ad Platform Updates (Google Ads, Meta Ads, TikTok Ads)
//   3. AI Models & Capabilities (Anthropic, OpenAI, Google, Mistral, Perplexity)
//   4. Competitor Intelligence (Madgicx, Pencil, Smartly.io, Albert, Motion)
//   5. Recommendations for Vigmis — ranked by priority

import { route } from '@vigmis/ai-router';

const RECIPIENT = process.env.AI_LANDSCAPE_EMAIL ?? 'ami@tmgt.co.il';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

async function sendEmail(subject: string, html: string): Promise<void> {
  if (!SENDGRID_API_KEY) return;
  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: RECIPIENT }] }],
      from: { email: 'hello@vigmis.com', name: 'Vigmis Intelligence' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });
}

interface LandscapeSection {
  title: string;
  items: { name: string; summary: string; vigmis_relevance: string }[];
}

interface LandscapeDigest {
  month: string;
  creative_tools: LandscapeSection;
  ad_platform_updates: LandscapeSection;
  ai_models: LandscapeSection;
  competitor_intelligence: LandscapeSection;
  recommendations: { priority: 'high' | 'medium' | 'low'; action: string; why: string; effort: string }[];
}

const DIGEST_SCHEMA = {
  type: 'object',
  properties: {
    month: { type: 'string' },
    creative_tools: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, summary: { type: 'string' }, vigmis_relevance: { type: 'string' } }, required: ['name', 'summary', 'vigmis_relevance'] } },
      },
      required: ['title', 'items'],
    },
    ad_platform_updates: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, summary: { type: 'string' }, vigmis_relevance: { type: 'string' } }, required: ['name', 'summary', 'vigmis_relevance'] } },
      },
      required: ['title', 'items'],
    },
    ai_models: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, summary: { type: 'string' }, vigmis_relevance: { type: 'string' } }, required: ['name', 'summary', 'vigmis_relevance'] } },
      },
      required: ['title', 'items'],
    },
    competitor_intelligence: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, summary: { type: 'string' }, vigmis_relevance: { type: 'string' } }, required: ['name', 'summary', 'vigmis_relevance'] } },
      },
      required: ['title', 'items'],
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          action: { type: 'string' },
          why: { type: 'string' },
          effort: { type: 'string' },
        },
        required: ['priority', 'action', 'why', 'effort'],
      },
    },
  },
  required: ['month', 'creative_tools', 'ad_platform_updates', 'ai_models', 'competitor_intelligence', 'recommendations'],
};

async function searchLandscape(topic: string): Promise<string> {
  try {
    const res = await route({
      task: 'web_research',
      prompt: `Search for the latest news and updates (last 30 days) about: ${topic}.
      Focus on concrete product releases, feature launches, pricing changes, and capability improvements.
      Return factual, specific information with dates where available. Be concise.`,
      options: { maxTokens: 800 },
    });
    return res.output;
  } catch {
    return '';
  }
}

export async function runAiLandscapeDigest(log: (msg: string) => void): Promise<{ sent: boolean; sections: number }> {
  const now = new Date();
  const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  log('Searching: creative AI tools...');
  const creativeNews = await searchLandscape(
    'new AI image generation tools, video generation AI, AI creative tools for advertising (Midjourney, DALL-E, Sora, Runway, Kling, HeyGen, Leonardo, Ideogram, Flux, Stable Diffusion updates)'
  );

  log('Searching: ad platform updates...');
  const adPlatformNews = await searchLandscape(
    'Google Ads new features and updates, Meta Ads Manager new features, TikTok Ads new features, advertising platform API changes'
  );

  log('Searching: AI model releases...');
  const aiModelNews = await searchLandscape(
    'new AI model releases and improvements from Anthropic Claude, OpenAI GPT, Google Gemini, Meta Llama, Mistral, Perplexity — capabilities, pricing, speed improvements'
  );

  log('Searching: competitor intelligence...');
  const competitorNews = await searchLandscape(
    'Madgicx AI advertising updates, Pencil AI creative tool features, Smartly.io platform updates, Albert AI marketing features, Motion creative analytics updates, new AI advertising SaaS tools launched'
  );

  log('Synthesizing digest...');
  const digest = await route({
    task: 'analysis',
    prompt: `You are the Chief Technology Officer of Vigmis — an AI-powered autonomous advertising management SaaS for SMBs that manages Google Ads, Meta Ads, and TikTok Ads.

Vigmis current capabilities:
- AI strategy generation and market research (Claude Sonnet)
- Automated campaign optimization (3-6x/day, Wilson significance testing)
- Creative generation: DALL-E images, HeyGen/Kling videos
- AI chat assistant (senior marketing manager persona)
- Social inbox management (Facebook + Instagram comments)
- Google Analytics 4 attribution as ground truth
- Monthly billing: 7% of spend (Grow) or $49 + 6% (Scale)

RESEARCH DATA:

CREATIVE AI TOOLS (last 30 days):
${creativeNews || 'No data retrieved'}

AD PLATFORM UPDATES (last 30 days):
${adPlatformNews || 'No data retrieved'}

AI MODEL RELEASES (last 30 days):
${aiModelNews || 'No data retrieved'}

COMPETITOR INTELLIGENCE (last 30 days):
${competitorNews || 'No data retrieved'}

Based on this research, create a monthly AI landscape digest for ${monthLabel}.

For each section, identify the 3-5 most significant updates. For each item:
- name: short name of the tool/update
- summary: 1-2 sentences describing what changed
- vigmis_relevance: 1 sentence explaining specifically how this affects or could improve Vigmis

For recommendations, list 3-7 specific actions Vigmis should consider taking this month, ranked by priority (high/medium/low). Include:
- action: what to do (specific, actionable)
- why: why it matters for Vigmis
- effort: "days" | "weeks" | "months"

Be specific, commercially sharp, and honest. If nothing significant happened in a category, say so briefly rather than inflating.`,
    systemPrompt: `You are a CTO-level technology scout. Your job is to produce an honest, actionable monthly digest that helps Vigmis stay at the cutting edge without wasting engineering time on hype. Be specific and commercially sharp.

IMPORTANT: Return ONLY a JSON object matching this exact schema, no other text:
${JSON.stringify(DIGEST_SCHEMA, null, 2)}`,
    options: { maxTokens: 3000, temperature: 0.2 },
  });

  let data: LandscapeDigest;
  try {
    const raw = digest.output.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    data = JSON.parse(raw) as LandscapeDigest;
  } catch {
    log('Failed to parse digest JSON — sending raw text fallback');
    await sendEmail(
      `[Vigmis] AI Landscape Digest — ${monthLabel}`,
      `<pre style="font-family:monospace;font-size:13px;white-space:pre-wrap">${digest.output}</pre>`
    );
    return { sent: true, sections: 0 };
  }

  const html = renderDigestEmail(data, monthLabel);
  await sendEmail(`[Vigmis] AI Landscape Digest — ${monthLabel}`, html);
  log(`Digest sent to ${RECIPIENT}`);

  const sections = [data.creative_tools, data.ad_platform_updates, data.ai_models, data.competitor_intelligence]
    .reduce((n, s) => n + (s?.items?.length ?? 0), 0);

  return { sent: true, sections };
}

function priorityColor(p: string): string {
  return p === 'high' ? '#dc2626' : p === 'medium' ? '#d97706' : '#64748b';
}

function renderSection(section: LandscapeSection): string {
  if (!section?.items?.length) return '<p style="color:#94a3b8;font-size:13px">No significant updates this month.</p>';
  return section.items.map(item => `
    <div style="margin-bottom:16px;padding:14px 16px;background:#f8fafc;border-radius:10px;border-left:3px solid #6366f1">
      <p style="margin:0 0 4px;font-weight:700;color:#1e293b;font-size:14px">${item.name}</p>
      <p style="margin:0 0 6px;color:#475569;font-size:13px;line-height:1.5">${item.summary}</p>
      <p style="margin:0;color:#6366f1;font-size:12px"><strong>Vigmis:</strong> ${item.vigmis_relevance}</p>
    </div>`).join('');
}

function renderDigestEmail(data: LandscapeDigest, monthLabel: string): string {
  const recs = (data.recommendations ?? []).map(r => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;vertical-align:top;width:60px">
        <span style="background:${priorityColor(r.priority)};color:white;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;text-transform:uppercase">${r.priority}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;vertical-align:top">
        <p style="margin:0 0 3px;font-weight:700;color:#1e293b;font-size:13px">${r.action}</p>
        <p style="margin:0;color:#64748b;font-size:12px">${r.why} — Effort: <em>${r.effort}</em></p>
      </td>
    </tr>`).join('');

  const sections: { emoji: string; title: string; section: LandscapeSection }[] = [
    { emoji: '🎨', title: 'Creative AI Tools', section: data.creative_tools },
    { emoji: '📢', title: 'Ad Platform Updates', section: data.ad_platform_updates },
    { emoji: '🤖', title: 'AI Models & Capabilities', section: data.ai_models },
    { emoji: '🔭', title: 'Competitor Intelligence', section: data.competitor_intelligence },
  ];

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;margin:0;padding:32px 16px">
  <div style="max-width:680px;margin:0 auto">

    <div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);border-radius:16px 16px 0 0;padding:32px;text-align:center">
      <h1 style="color:white;margin:0;font-size:24px;font-weight:800">Vigmis AI Landscape</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:15px">${monthLabel} — Monthly Intelligence Digest</p>
    </div>

    <div style="background:white;padding:8px 32px 24px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">

      ${sections.map(({ emoji, title, section }) => `
        <div style="margin-top:28px">
          <h2 style="color:#1e293b;font-size:16px;font-weight:700;margin:0 0 14px;padding-bottom:10px;border-bottom:2px solid #e2e8f0">${emoji} ${title}</h2>
          ${renderSection(section)}
        </div>`).join('')}

      <div style="margin-top:28px">
        <h2 style="color:#1e293b;font-size:16px;font-weight:700;margin:0 0 14px;padding-bottom:10px;border-bottom:2px solid #e2e8f0">⚡ Recommendations for Vigmis</h2>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
          ${recs}
        </table>
      </div>

    </div>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:16px 32px;text-align:center">
      <p style="margin:0;color:#94a3b8;font-size:12px">Generated by Vigmis Intelligence · <a href="https://vigmis.com" style="color:#6366f1">vigmis.com</a></p>
    </div>

  </div>
</body></html>`;
}
