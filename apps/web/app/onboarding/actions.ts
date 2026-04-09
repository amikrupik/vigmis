'use server';

import { route } from '@vigmis/ai-router';
import type { ConversationMessage, StrategyPlan } from '@vigmis/db';

export type Topic = 'website' | 'budget' | 'management_percentage' | 'goal' | 'geography' | 'exclusions' | 'open_notes';

export interface OnboardingSettings {
  website_url: string;
  budget_monthly_ils: number;
  management_percentage: number;
  goal: 'leads' | 'purchases' | 'traffic' | 'awareness';
  geo_include: string[];
  geo_exclude: string[];
  exclusions: string;
  open_notes: string;
  risk_level: 'conservative' | 'balanced' | 'aggressive';
  dayparting_rules: Array<{ day: number; start_hour: number; end_hour: number }>;
}

export interface ChatResponse {
  message: string;
  coveredTopics: Topic[];
  settings: OnboardingSettings | null;
}

export interface AnalysisResult {
  websiteAnalysis: string;
  marketResearch: string;
  strategy: StrategyPlan;
}

const SYSTEM_PROMPT = `You are the Vigmis onboarding assistant — an AI marketing manager conducting a friendly intake interview.

Your job: gather the client's advertising needs through a natural conversation (Hebrew or English, match their language).

You MUST cover these 7 topics before concluding:
1. website — the client's website URL (e.g. https://example.com). Ask for it at the start.
2. budget — monthly advertising budget. Ask for a number. Accept any currency, convert to ILS mentally (1 USD ≈ 3.7 ILS).
3. management_percentage — what percentage of the budget should Vigmis manage (10%, 25%, 50%, or 100%). Explain briefly: "Vigmis takes a fee only on the portion it manages."
4. goal — what counts as success: leads (form/call), purchases, traffic, or brand awareness.
5. geography — which cities/regions/countries to target AND which to exclude.
6. exclusions — what the system must NEVER do: audiences to avoid, topics, tone, legal constraints.
7. open_notes — any other important rules (business hours, seasonal pauses, dayparting, etc.).

Rules:
- Ask ONE question at a time. Keep it short and conversational.
- Start by asking for their website URL.
- If an answer is vague, ask a natural follow-up to clarify.
- Mirror the client's language exactly.
- When all 7 topics are clearly answered, output a SUMMARY block (exact format, always in English for parsing):

[SUMMARY]
{
  "website_url": "https://example.com",
  "budget_monthly_ils": 10000,
  "management_percentage": 50,
  "goal": "leads",
  "geo_include": ["Jerusalem", "Tel Aviv"],
  "geo_exclude": ["tourists", "under 25"],
  "exclusions": "Never mention prices. Avoid secular tone.",
  "open_notes": "Closed Friday 16:00 to Saturday night.",
  "risk_level": "balanced",
  "dayparting_rules": [
    { "day": 5, "start_hour": 16, "end_hour": 23 }
  ]
}
[/SUMMARY]

Only output the SUMMARY block when all 7 topics are covered.`;

const TOPIC_KEYWORDS: Record<Topic, string[]> = {
  website: ['website_url'],
  budget: ['budget_monthly_ils'],
  management_percentage: ['management_percentage'],
  goal: ['goal'],
  geography: ['geo_include', 'geo_exclude'],
  exclusions: ['exclusions'],
  open_notes: ['open_notes', 'dayparting_rules'],
};

function extractSummary(text: string): OnboardingSettings | null {
  const match = text.match(/\[SUMMARY\]([\s\S]*?)\[\/SUMMARY\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim()) as OnboardingSettings;
  } catch {
    return null;
  }
}

function detectCoveredTopics(settings: OnboardingSettings | null, existing: Topic[]): Topic[] {
  if (!settings) return existing;
  const covered = new Set(existing);
  for (const [topic, keys] of Object.entries(TOPIC_KEYWORDS) as [Topic, string[]][]) {
    if (keys.some(k => k in settings && settings[k as keyof OnboardingSettings] !== undefined)) {
      covered.add(topic);
    }
  }
  return Array.from(covered);
}

export async function sendMessage(
  history: ConversationMessage[],
  userMessage: string,
  coveredTopics: Topic[],
): Promise<ChatResponse> {
  const messages = [
    ...history.map(m => `${m.role === 'user' ? 'Client' : 'Vigmis'}: ${m.content}`),
    `Client: ${userMessage}`,
  ].join('\n\n');

  let response;
  try {
    response = await route({
      task: 'analysis',
      prompt: messages,
      systemPrompt: SYSTEM_PROMPT,
      options: { maxTokens: 800, temperature: 0.6 },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      message: `שגיאה בתקשורת עם הבינה המלאכותית: ${msg}. אנא נסה שוב.`,
      coveredTopics,
      settings: null,
    };
  }

  const aiMessage = response.output;
  const settings = extractSummary(aiMessage);
  const newCoveredTopics = detectCoveredTopics(settings, coveredTopics);

  const visibleMessage = aiMessage
    .replace(/\[SUMMARY\][\s\S]*?\[\/SUMMARY\]/g, '')
    .trim();

  return {
    message: visibleMessage || (settings ? 'מצוין! הנה הסיכום שלך לאישור.' : aiMessage),
    coveredTopics: newCoveredTopics,
    settings,
  };
}

// ── Phase 2: Website scan ─────────────────────────────────────────────────────

export async function scanWebsite(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Vigmis/1.0 (Marketing Analysis)' },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000);

    const analysis = await route({
      task: 'analysis',
      prompt: `Analyze this website content and extract:\n1. What they sell / service they offer\n2. Target audience\n3. Unique selling proposition\n4. Tone and brand voice\n5. Key products/services\n\nWebsite content:\n${text}`,
      systemPrompt: 'You are a marketing analyst. Be concise. Respond in English.',
      options: { maxTokens: 600 },
    });

    return analysis.output;
  } catch {
    return 'Website could not be scanned. Proceeding with provided information only.';
  }
}

// ── Phase 2: Market research ──────────────────────────────────────────────────

export async function doMarketResearch(
  settings: OnboardingSettings,
  websiteAnalysis: string,
): Promise<string> {
  const prompt = `Do focused market research for a business with these parameters:
- Goal: ${settings.goal}
- Target geography: ${settings.geo_include.join(', ')}
- Exclude: ${settings.geo_exclude.join(', ')}
- Budget: ~$${Math.round(settings.budget_monthly_ils / 3.7)}/month (${settings.management_percentage}% managed by AI)
- Business context: ${websiteAnalysis.slice(0, 1000)}

Research ONLY what's relevant to this specific context. Provide:
1. Estimated CPC range for this niche and geography
2. Top 2-3 competitor tactics in this market
3. Best performing ad formats for this goal
4. Key audience insights
5. Seasonality or timing considerations

Be specific and actionable. No generic advice.`;

  const research = await route({
    task: 'market_research',
    prompt,
    systemPrompt: 'You are a digital marketing strategist with deep knowledge of Google Ads and Meta Ads. Be data-driven and specific.',
    options: { maxTokens: 800 },
  });

  return research.output;
}

// ── Phase 2: Strategy plan ────────────────────────────────────────────────────

export async function generateStrategy(
  settings: OnboardingSettings,
  websiteAnalysis: string,
  marketResearch: string,
): Promise<StrategyPlan> {
  const managedBudget = Math.round((settings.budget_monthly_ils / 3.7) * (settings.management_percentage / 100));

  const prompt = `Based on this data, generate a campaign strategy plan:

BUSINESS:
${websiteAnalysis.slice(0, 800)}

MARKET RESEARCH:
${marketResearch.slice(0, 800)}

PARAMETERS:
- Goal: ${settings.goal}
- Monthly managed budget: ~$${managedBudget}
- Target: ${settings.geo_include.join(', ')}
- Exclusions: ${settings.exclusions}

Return ONLY valid JSON in this exact format:
{
  "platforms": [
    {
      "name": "google",
      "campaign_types": ["search", "display"],
      "budget_percentage": 60,
      "reasoning": "Why this platform and split"
    },
    {
      "name": "meta",
      "campaign_types": ["conversion"],
      "budget_percentage": 40,
      "reasoning": "Why this platform and split"
    }
  ],
  "market_insights": "2-3 sentence summary of key market findings",
  "target_audience": "Specific audience description",
  "estimated_cpc": "$X.XX - $X.XX",
  "recommendations": "Top 3 actionable recommendations"
}`;

  const response = await route({
    task: 'analysis',
    prompt,
    systemPrompt: 'You are a senior media planner. Return only valid JSON, no extra text.',
    options: { maxTokens: 1000, temperature: 0.3 },
  });

  try {
    const jsonMatch = response.output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as StrategyPlan;
    }
  } catch {
    // fallback
  }

  // Fallback plan if parsing fails
  return {
    platforms: [
      { name: 'google', campaign_types: ['search'], budget_percentage: 60, reasoning: 'High intent traffic for your goal' },
      { name: 'meta', campaign_types: ['conversion'], budget_percentage: 40, reasoning: 'Audience targeting and remarketing' },
    ],
    market_insights: marketResearch.slice(0, 200),
    target_audience: settings.geo_include.join(', '),
    estimated_cpc: '$0.50 - $2.00',
    recommendations: 'Start with search campaigns, monitor CPC, scale what works.',
  };
}

// ── Full analysis pipeline ────────────────────────────────────────────────────

export async function runAnalysis(settings: OnboardingSettings): Promise<AnalysisResult> {
  const websiteAnalysis = await scanWebsite(settings.website_url);
  const marketResearch = await doMarketResearch(settings, websiteAnalysis);
  const strategy = await generateStrategy(settings, websiteAnalysis, marketResearch);

  return { websiteAnalysis, marketResearch, strategy };
}
