// POST /onboarding/settings  — save confirmed onboarding data
// GET  /onboarding/status    — return what's complete for this tenant
// POST /onboarding/chat      — AI intake interview message
// POST /onboarding/analyze   — full website + market + strategy analysis

export const maxDuration = 300;

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, decryptToken } from '@vigmis/db';
import { authenticate } from '../middleware/auth.js';
import { route } from '@vigmis/ai-router';
import { getAllHistoricalData, fetchCompetitorAds } from '../services/historical.js';
import { scrapeWebsite } from '../services/website-scraper.js';
import { captureApprovalSnapshot } from '../services/approval-snapshot.js';
import { refreshBrandVoiceForTenant } from '../services/brand-voice.js';
import { extractCreativeBrief, saveCreativeBrief } from '../services/creative-brief.js';
import { auditConversionReadiness } from '../services/conversion-readiness.js';
import { getIndustryBenchmarks } from '../services/benchmark-aggregator.js';
import { getWinningThemes } from '../services/creative-performance.js';
import { sendOperatorAlert } from '../services/operator-alert.js';

// ── AI prompts & helpers ──────────────────────────────────────────────────────

// Approximate ILS/USD exchange rate — update periodically, no live API needed
// approximate rate, updated 2026-06 (market rate as of June 2026)
const ILS_USD_RATE = 3.75;

// Content policy — categories blocked at MVP. Refusal is final, no exceptions.
const CONTENT_POLICY_BLOCKED = [
  {
    category: 'firearms',
    keywords: ['firearm', ' gun ', 'guns', 'weapon', 'ammunition', 'ammo', 'rifle', 'pistol', 'handgun', 'shotgun', 'bump stock', 'ghost gun', 'suppressor', 'silencer', 'holster', 'nra', 'gun shop', 'gun store', 'firearms safety', 'gun accessories', 'נשק', 'אקדח', 'רובה', 'תחמושת', 'נשק חם', 'הדרכות ירי', 'כלי ירייה', 'חנות נשק', 'מכירת נשק'],
    refusal_he: 'תודה שפנית ל-Vigmis. לצערנו, אנחנו לא יכולים לעבוד עם עסקים בתחום הנשק, האביזרים, התחמושת, או הדרכות ירי — גם אם העסק חוקי לחלוטין. פלטפורמות הפרסום הגדולות (Meta, Google) אוסרות קמפיינים בקטגוריה זו, מה שמונע מאיתנו לספק שירות אפקטיבי. מאחלים לך הצלחה.',
    refusal_en: "Thank you for reaching out to Vigmis. Unfortunately, we're unable to work with firearms, weapons, ammunition, or related businesses — even when fully legal. Major advertising platforms (Meta, Google) have categorical restrictions on this category that make it impossible for us to run effective campaigns. We wish you the best.",
  },
  {
    category: 'illegal_drugs',
    keywords: ['cocaine', 'heroin', 'methamphetamine', ' meth ', 'fentanyl', 'crack cocaine', 'drug dealing', 'drug sales', 'illegal drug', 'mdma', 'ecstasy', ' molly ', 'ketamine', ' lsd ', 'magic mushrooms', 'psilocybin', 'recreational drugs', 'party drugs', 'narcotics', 'drug trafficking', 'marijuana', ' cannabis ', 'cannabis-based', 'sell weed', 'selling weed', 'not legal here but', 'illegal here but', 'סמים', 'קוקאין', 'הרואין', 'מתאמפטמין', 'פנטניל', 'סחר בסמים', 'אקסטזי', 'מריחואנה לא חוקית', 'קנאביס'],
    refusal_he: 'תודה שפנית ל-Vigmis. נראה שהתיאור שסיפקת קשור לסמים לא חוקיים. פלטפורמות הפרסום הגדולות (Meta, Google, TikTok) חוסמות קטגוריה זו לחלוטין, ולכן לא נוכל לספק שירות אפקטיבי.\n\nאם הזכרת סמים כ*הגבלה* שלך — דבר שאינך רוצה לפרסם — פשוט כתוב: "אני מוכר [תאר את העסק שלך]" ונשמח להמשיך.',
    refusal_en: "Thank you for reaching out to Vigmis. It looks like your description involves illegal drugs — major advertising platforms (Meta, Google, TikTok) categorically block this, making effective campaigns impossible.\n\nIf you mentioned drugs as a RESTRICTION (something you refuse to advertise, not your business), simply write: \"I sell [describe your business]\" and we'll be happy to continue.",
  },
  {
    category: 'unauthorized_pharma',
    keywords: ['unlicensed pharmacy', 'fake medicine', 'unregistered medication', 'unapproved drug', 'cures cancer', 'guaranteed cure', 'miracle cure', 'reverses diabetes', 'eliminate disease', 'תרופה ללא רישוי', 'תרופת פלא', 'מרפא סרטן', 'ריפוי מובטח', 'בית מרקחת לא מורשה'],
    refusal_he: 'תודה שפנית ל-Vigmis. לא נוכל לעבוד עם עסקים שמוכרים תרופות ללא רישיון רגולטורי, או שעושים טענות ריפוי שאינן מגובות מחקרית — פלטפורמות הפרסום אוסרות על כך מפורשות. נשמח לסייע לעסקים בתחומים אחרים.',
    refusal_en: "Thank you for reaching out to Vigmis. We're unable to work with unlicensed pharmaceutical businesses or products making unverified medical cure claims — advertising platforms explicitly prohibit this. We'd be glad to help businesses in other categories.",
  },
  {
    category: 'pyramid_scheme',
    keywords: ['pyramid scheme', 'ponzi', 'multi-level marketing', 'mlm recruitment', 'get rich quick', 'make money fast', 'guaranteed passive income', 'recruit members', 'downline', 'פירמידה', 'שיווק רב-שלבי', 'להתעשר מהר', 'הכנסה פסיבית מובטחת', 'גיוס חברים'],
    refusal_he: 'תודה שפנית ל-Vigmis. לא נוכל לעבוד עם עסקים בתחום פירמידות מכירה, שיווק רב-שלבי עם דגש על גיוס, או הבטחות להתעשרות מהירה — קטגוריה זו נחסמת על ידי פלטפורמות הפרסום ואינה עומדת בהנחיות שלנו. נשמח לסייע לעסקים בתחומים אחרים.',
    refusal_en: "Thank you for reaching out to Vigmis. We're unable to work with pyramid schemes, recruitment-focused MLM businesses, or get-rich-quick programs — these are blocked by advertising platforms and don't align with our guidelines. We'd be glad to help businesses in other categories.",
  },
  {
    category: 'gambling',
    keywords: ['online casino', 'sports betting', 'poker site', 'gambling site', 'casino online', 'bet365', 'betway', 'hizna', 'קזינו אונליין', 'הימורים', 'ספורט בט', 'ניחושי ספורט'],
    refusal_he: 'תודה שפנית ל-Vigmis. לא נוכל לעבוד עם אתרי הימורים, קזינו, או הגרלות — קטגוריה זו דורשת רישיון פרסום ייעודי שאין ברשותנו כרגע, ומוגבלת על ידי פלטפורמות הפרסום הגדולות. נשמח לסייע לעסקים בתחומים אחרים.',
    refusal_en: "Thank you for reaching out to Vigmis. We're currently unable to work with gambling, online casinos, or sports betting — this category requires specialized advertising licenses we don't currently hold, and is heavily restricted by major platforms. We'd be glad to help businesses in other categories.",
  },
  {
    category: 'hate_incitement',
    keywords: ['hate group', 'white supremacist', 'neo-nazi', 'extremist group', 'terrorist', 'incitement to violence', 'anti-semitic', 'racism promotion', 'הסתה', 'גזענות', 'לאומנות קיצונית', 'קנאות דתית אלימה'],
    refusal_he: 'תודה שפנית ל-Vigmis. לא נוכל לעבוד עם תוכן הסתה, גזענות, או קמפיינים המכוונים נגד קבוצות ציבור — זה סותר את ערכי החברה שלנו ואת מדיניות פלטפורמות הפרסום. נשמח לסייע לעסקים בתחומים אחרים.',
    refusal_en: "Thank you for reaching out to Vigmis. We're unable to work with hate speech, incitement, or campaigns targeting groups of people — this conflicts with our values and advertising platform policies. We'd be glad to help businesses in other categories.",
  },
] as const;

function detectContentPolicy(
  allMessages: string[],
  lastAiMessage?: string,
): { blocked: boolean; category?: string; refusal_he?: string; refusal_en?: string } {
  const combined = allMessages.join(' ').toLowerCase();

  // Exclusions context: user is answering "what will your campaign NEVER do?" — keywords are
  // things they REFUSE to promote, not their own business. Two signals:
  // 1. Last AI message asked about restrictions/exclusions
  // 2. User's own language uses exclusion-framing words before the blocked keyword
  const aiAskedExclusions = lastAiMessage
    ? /לעולם לא|הגבלות?|restrictions?|never\b|exclude|avoid|אסור|מה לא|won'?t/i.test(lastAiMessage)
    : false;
  const userExclusionsLangHe = /(?:שלילי(?:ים|ות)?|לא לכלול|מה שאסור|הגבלות?|לאסור|מניע(?:ת)?|דברים שלא|מה שלא|אין לנו|לא נפרסם)[^.!?]{0,120}(?:סמים|נשק|קוקאין|הרואין|אקדח)/.test(combined);
  const userExclusionsLangEn = /\b(?:things? like|such as|never advertis|won'?t advertis|exclude|restrict|not (?:promote|sell|advertis))\b[^.!?]{0,120}\b(?:drugs?|weapons?|firearms?|cocaine|heroin)\b/.test(combined);
  const inExclusionsContext = aiAskedExclusions || userExclusionsLangHe || userExclusionsLangEn;

  // English negation guard: "no firearms", "won't advertise weapons", "do not sell any guns"
  const firearmsNegatedEn = /\b(no|not|don'?t|won'?t|will not|without|never|refuse)\b[^.!?]{0,80}\b(firearms?|weapons?|guns?|ammo|ammunition)\b/.test(combined);
  // Hebrew negation guard: "לא נשק", "ללא נשק", "בלי נשק", "לעולם לא נשק"
  const firearmsNegatedHe = /(?:לא|ללא|בלי|אסור|מנע|לעולם לא)[^.!?]{0,80}(?:נשק|אקדח|רובה|תחמושת|כלי ירייה)/.test(combined);
  const firearmsNegated = firearmsNegatedEn || firearmsNegatedHe || inExclusionsContext;

  // Drugs negation guard
  const drugsNegatedHe = /(?:לא|ללא|בלי|אסור|מנע|לעולם לא)[^.!?]{0,80}(?:סמים|קוקאין|הרואין|מריחואנה|קנאביס)/.test(combined);
  const drugsNegatedEn = /\b(no|not|don'?t|won'?t|will not|without|never|refuse)\b[^.!?]{0,80}\b(drugs?|cocaine|heroin|marijuana|cannabis)\b/.test(combined);
  const drugsNegated = drugsNegatedHe || drugsNegatedEn || inExclusionsContext;

  for (const policy of CONTENT_POLICY_BLOCKED) {
    if (policy.category === 'firearms' && firearmsNegated) continue;
    if (policy.category === 'illegal_drugs' && drugsNegated) continue;
    if (policy.keywords.some(kw => matchesKeyword(combined, kw))) {
      return { blocked: true, category: policy.category, refusal_he: policy.refusal_he, refusal_en: policy.refusal_en };
    }
  }
  return { blocked: false };
}

// Match a keyword against text with proper word boundaries.
// For purely Hebrew keywords, require non-Hebrew-letter boundaries to prevent
// substring false positives (e.g. 'ירי' appearing inside 'צעירים').
function matchesKeyword(text: string, kw: string): boolean {
  const kwLower = kw.toLowerCase();
  // Keywords that already carry leading/trailing spaces encode their own boundary — match literally
  if (kwLower.startsWith(' ') || kwLower.endsWith(' ')) return text.includes(kwLower);
  // For keywords made entirely of Hebrew letters, require non-Hebrew-letter on both sides
  if (/^[א-׺]+$/.test(kwLower)) {
    const escaped = kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\u05D0-\\u05FA])${escaped}(?![\\u05D0-\\u05FA])`).test(text);
  }
  return text.includes(kwLower);
}

const ONBOARDING_SYSTEM_PROMPT_BASE = `You are the Vigmis onboarding assistant — an AI marketing manager conducting a friendly intake interview.

Your job: gather the client's advertising needs through a natural conversation. Default language is English. Mirror the client's language exactly:
- If the client writes in Hebrew → switch to Hebrew, stay in Hebrew for the entire conversation.
- If the client writes in Arabic → switch to Arabic, stay in Arabic for the entire conversation.
- If the client writes in any other language → switch to that language.
Never mix languages in a single response.

## CONTENT POLICY — IMMEDIATE STOP (check FIRST before anything else)
If the business falls into any blocked category, respond ONLY with the refusal below. Do NOT continue onboarding.
Blocked categories: firearms / weapons / ammunition (even legal), illegal drugs, unlicensed medications with cure claims, pyramid schemes / MLM recruitment, online gambling/casinos, hate speech / incitement.
Refusal format (Hebrew): "תודה שפנית ל-Vigmis. לצערנו, אנחנו לא יכולים לעבוד עם עסקים בתחום [קטגוריה]. [סיבה]. מאחלים לך הצלחה."
Refusal format (English): "Thank you for reaching out to Vigmis. Unfortunately, we don't work with businesses in [category]. [Reason]. We wish you the best."

EXPLICIT EXCEPTIONS — these are ALWAYS allowed and must NEVER trigger a refusal:
- Hunting gear, outdoor sporting goods, archery, fishing equipment, camping gear — ALLOWED. Only blocked if the client explicitly says they sell firearms, guns, ammunition, or weapons.
- Licensed pharmacies that require valid prescriptions — ALLOWED.
- General sporting goods stores — ALLOWED.
If you are unsure, default to ALLOWED and continue onboarding. Do NOT refuse based on association. Refuse ONLY on explicit statements of blocked products.
The refusal is FINAL — do not offer alternatives, exceptions, or reviews.

RESTRICTED (warn but proceed): tobacco, cigarettes, vaping, e-cigarettes, alcohol, adult content (legal). Apply the restriction silently — do NOT show internal reasoning. Simply say: "Note: advertising tobacco/alcohol/adult content has platform restrictions — some formats and audiences will be unavailable. We can still work with you within these limits." Then continue onboarding normally. Never write phrases like "Wait —", "Let me apply...", or any chain-of-thought in your response.

## TOPICS TO COVER
You MUST cover these topics before concluding:
1. business_type — what type of business: "ecommerce" (online store with many products), "hero_product" (one flagship product drives most revenue), "lead_gen" (generates leads/inquiries), "saas" (software subscription), or "general_store" (brick & mortar / local service). Ask this FIRST.
   DISAMBIGUATION RULE: If the client's FIRST message already implies business type (e.g., "online clothing store" = ecommerce; "I sell one product" = hero_product; "dental clinic" = lead_gen; "SaaS platform" = saas), DO NOT ask them to confirm or re-classify. Infer from context and move on. Only ask explicitly if the type is genuinely ambiguous after reading their message.
2. website — the client's website URL.
   - If the client gives you a URL (any text containing a domain like ".co.il", ".com", "www.", "http"): accept it immediately, say "Got it — I'll use [url]." and move straight to the next question. Do NOT ask what the website does or what the business sells — the website will be analyzed automatically later.
   - If they have no website yet: say "No problem — describe your business in 2-3 sentences: what you sell and who your ideal customer is." Store that description in open_notes as "Business description (manual): [text]". Set website_url to null.
3. budget — monthly advertising budget.
   CURRENCY RULES:
   - User says "₪X" or "X שקל/שקלים" → ILS, accept directly. Confirm: "Got it — ₪X/month." Set budget_currency="ILS", budget_original_amount=X.
   - User says "$X" or "X dollars" → USD. Confirm in USD only: "Got it — $X/month." Set budget_currency="USD", budget_original_amount=X. Store budget_monthly_ils = X × 3.75 internally.
   - User says "X AED" or "X درهم" → AED (UAE dirham). Confirm in AED: "Got it — X AED/month." Set budget_currency="AED", budget_original_amount=X. Store budget_monthly_ils = X × 1.05 internally.
   - User provides a bare number with no currency symbol → ask ONCE with a language-appropriate suggestion:
       * Hebrew conversation: "₪ (שקל) או מטבע אחר?" (short, one line — make ₪ the obvious default)
       * Spanish conversation: "¿Es USD ($), EUR (€), u otra moneda?"
       * English/other: "Is that USD ($), EUR (€), or another currency?"
     Do NOT assume any currency without asking. Do NOT make ILS the automatic default — the client may operate from any country.
   - If you have ALREADY asked for currency clarification in this conversation AND the client gives another bare number without a symbol — stop asking and go with the most recently confirmed currency. Confirm and move on.
   MINIMUM BUDGET WARNING: If budget_monthly_ils < 500 (≈ $135), warn ONCE: "Note: a budget under ₪500/month may produce limited results. We recommend at least ₪500 for any measurable ad performance. You can still continue if you wish." Then proceed.
4. management_percentage — what percentage of the budget should Vigmis manage. Accept any number 1–100. Explain briefly: "Vigmis takes a fee only on the portion it manages."
5. goal — what counts as success: leads (form/call), purchases, traffic, or brand awareness.
6. margin_pct — ONLY if goal is "purchases" AND business_type is "ecommerce" or "hero_product": ask "What is your gross margin percentage?" Skip for lead_gen, saas, general_store, or non-purchase goals.
7. hero_product — ONLY if business_type is "hero_product": ask for the flagship product name and its specific margin if different.
8. geography — which cities/regions/countries to target AND which to exclude.
9. exclusions — what the system must NEVER do: audiences to avoid, topics, tone, legal constraints, ad scheduling rules.
10. open_notes — any other important rules (business hours, seasonal pauses, product details, pricing, etc.).

## RULES
- Ask ONE question at a time. Keep it short and conversational.
- Mirror the client's language exactly — whatever language they write in, respond in that same language (Hebrew → Hebrew, Arabic → Arabic, English → English, etc.).
- Skip margin_pct for goal="traffic" or "awareness", or business_type="lead_gen" or "saas" or "general_store".
- Skip hero_product unless business_type is "hero_product".
- Do NOT re-ask about topics already confirmed (check the state tracker below).
- Do NOT ask "any other rules?" repeatedly. One closing check is enough, then conclude.
- When all required topics are confirmed, output the [SUMMARY] block immediately.

## ANTI-HALLUCINATION RULES — ABSOLUTE
- NEVER write text that begins with "Client:" or puts words in the client's mouth. You are the assistant. The client speaks for themselves.
- NEVER invent business details the client did not state. If they did not mention a product line, collection, event, or feature — it does not go into the SUMMARY.
- open_notes and exclusions MUST contain ONLY facts the client explicitly stated word-for-word. Do not add context, inferences, or helpful elaborations.
- If you are unsure whether the client said something — do NOT include it. Omission is safe; hallucination destroys trust.

## SUMMARY FORMAT (always in English for parsing, even if conversation is Hebrew)

CRITICAL ACCURACY RULES — copy these values EXACTLY from the conversation, never approximate:
- website_url: copy the EXACT URL the user typed. If they said "https://www.goodland.co.il", write exactly that. NEVER use a placeholder like "https://example.com".
- budget_monthly_ils: if user said "$X" (USD), compute X × 3.75 and write the exact integer result. $2000 → 7500. $3000 → 11250. NEVER round to nearest thousand.
- margin_pct: copy the EXACT number. User said "37%" → write 37. User said "40%" → write 40. Never round.
- geo_include: list ALL geographic areas the user mentioned. "ישראל ויהודים בארה\"ב" → ["Israel", "Jewish communities in USA"]. Never drop any area.
- exclusions: copy the user's exact words about what to avoid. NEVER set to null if they stated any constraint.
- management_percentage: the number they provided for Vigmis's managed share. Never invent a default.
- preferred_platforms: MUST be ["linkedin"] if business_type is "saas". MUST include "linkedin" if goal is "leads" AND geo_include contains USA/Canada/UK/Europe (professional B2B markets). Otherwise null. Never leave this null for a SaaS business.

[SUMMARY]
{
  "business_type": "ecommerce",
  "website_url": "https://example.com",
  "budget_monthly_ils": 10000,
  "budget_currency": "ILS",
  "budget_original_amount": 10000,
  "management_percentage": 50,
  "goal": "purchases",
  "margin_pct": 45,
  "hero_product_name": null,
  "hero_product_margin_pct": null,
  "geo_include": ["Jerusalem", "Tel Aviv"],
  "geo_exclude": ["tourists", "under 25"],
  "exclusions": "Never mention prices. Avoid secular tone.",
  "open_notes": "Closed Friday 16:00 to Saturday night.",
  "preferred_platforms": null,
  "risk_level": "balanced",
  "dayparting_rules": []
}
[/SUMMARY]`;

const TOPIC_KEYWORDS: Record<string, string[]> = {
  business_type:         ['business_type'],
  website:               ['website_url'],
  budget:                ['budget_monthly_ils'],
  management_percentage: ['management_percentage'],
  goal:                  ['goal'],
  margin_pct:            ['margin_pct'],
  hero_product:          ['hero_product_name'],
  geography:             ['geo_include', 'geo_exclude'],
  exclusions:            ['exclusions'],
  open_notes:            ['open_notes', 'dayparting_rules'],
};

function extractSummary(text: string): object | null {
  const match = text.match(/\[SUMMARY\]([\s\S]*?)\[\/SUMMARY\]/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch { return null; }
}

function detectCoveredTopicsFromSummary(settings: any, existing: string[]): string[] {
  if (!settings) return existing;
  const covered = new Set(existing);
  for (const [topic, keys] of Object.entries(TOPIC_KEYWORDS)) {
    if (keys.some(k => k in settings && settings[k] !== undefined && settings[k] !== null)) covered.add(topic);
  }
  return Array.from(covered);
}

// Incrementally detect covered topics from each AI turn — no SUMMARY needed.
// Detects from user message content (what was provided) + AI response (what was confirmed).
// Patterns are intentionally loose — false positives are cheaper than missed detections.
function detectCoveredTopicsIncremental(aiResponse: string, userMessage: string, existing: string[]): string[] {
  const covered = new Set(existing);
  const combined = (aiResponse + ' ' + userMessage);
  const lc = combined.toLowerCase();
  const userLc = userMessage.toLowerCase();

  // business_type: any description of business category in either direction
  if (!covered.has('business_type') && /ecommerce|hero.?product|lead.?gen|saas|general.?store|local service|local business|חנות|מוצר|שירות|קורס|קליניקה|מרפאה|סוכנות|מסעדה|ליד|ecom|b2b|b2c|software|app|platform/.test(lc)) {
    covered.add('business_type');
  }

  // website: URL or explicit "no website" confirmation
  if (!covered.has('website') && (
    /https?:\/\/[^\s'"]{4,}/.test(combined) ||
    /no website|don.t have a (website|site)|אין לי אתר|בלי אתר/.test(lc)
  )) {
    covered.add('website');
  }

  // budget: any currency amount (₪, $, NIS, ILS, USD, shekels, dollars) or confirmed bare number
  if (!covered.has('budget') && (
    /₪\s*\d[\d,]+|\d[\d,]+\s*₪/.test(combined) ||
    /\$\s*\d[\d,]+/.test(combined) ||
    /\d[\d,]+\s*(nis|ils|usd|shekels?|dollars?|שקל|שקלים|דולר|דולרים)/.test(lc) ||
    /תקציב.{0,30}\d|\d.{0,10}(לחודש|per month|\/month|a month)/.test(lc) ||
    /budget.{0,30}\d/.test(lc)
  )) {
    covered.add('budget');
  }

  // management_percentage: any standalone percentage when budget is already covered (answer to "what % should Vigmis manage?")
  // Also catch explicit percentage in AI confirmation
  if (!covered.has('management_percentage') && (
    (/\d+\s*%/.test(userMessage) && covered.has('budget')) ||
    /vigmis.{0,20}manage.{0,20}\d+%|\d+%.{0,20}manage|vigmis.{0,10}ינהל/.test(lc) ||
    /manage.{0,10}\d+%|\d+%.{0,10}of.{0,10}budget/.test(lc)
  )) {
    covered.add('management_percentage');
  }

  // goal: detect from USER message only (not lc/combined) to avoid false positives
  // when the AI asks "leads, purchases, traffic, or awareness?" — those words in AI response must not trigger
  if (!covered.has('goal') && (
    /\b(leads?|purchases?|traffic|awareness|sales?|demo|sign.?ups?|conversions?)\b/.test(userLc) ||
    /(לידים|רכישות|מכירות|תנועה|מודעות|הגשות)/.test(userLc)
  )) {
    covered.add('goal');
  }

  // margin_pct: percentage + margin keyword, only relevant for purchase/ecommerce goals
  if (!covered.has('margin_pct') && /(\d+)%.{0,30}(margin|gross|profit|מרג.ין|רווח)|(margin|gross|profit|מרג.ין|רווח).{0,30}(\d+)%/.test(lc)) {
    covered.add('margin_pct');
  }

  // hero_product: product name mentioned when business_type is hero_product (covered in AI's response)
  if (!covered.has('hero_product') && /\b(backright|hero.?product|flagship|מוצר מוביל|המוצר הראשי|מוצר יחיד).{0,60}\b/.test(lc)) {
    covered.add('hero_product');
  }

  // geography: any country, major city, or geographic scope in user message
  // Note: \b doesn't work for Hebrew Unicode — split ASCII and Hebrew patterns
  if (!covered.has('geography') && (
    /\b(israel|usa|us|uk|england|europe|canada|australia|germany|france|italy|spain|netherlands|sweden|norway|denmark|poland|worldwide|global|international|north america|south america|middle east|tel aviv|jerusalem|haifa|beer sheva|new york|los angeles|chicago|london|dubai|abu dhabi|riyadh|cairo|amman|beirut|berlin|paris|amsterdam|toronto|sydney|melbourne)\b/.test(userLc) ||
    /(ישראל|ארה.ב|אמריקה|אירופה|תל.?אביב|ירושלים|חיפה|באר.?שבע|אנגליה|גרמניה|צרפת|עולמי|בינלאומי|המזרח התיכון|דובאי|לונדון|ניו.?יורק)/.test(userLc)
  )) {
    covered.add('geography');
  }

  // exclusions: any prohibition or constraint in user message ("don't", "never", "avoid", "לא ל", "אסור")
  if (!covered.has('exclusions') && /לא ל|לעולם לא|אסור|להימנע מ|אל תציג|לא לפרסם|never |don.t |avoid |no (men|wom|chi|reli|pol|rac)|exclude|forbidden|prohibited|no (?:ads?|targeting)/.test(userMessage)) {
    covered.add('exclusions');
  }

  // open_notes: business hours, seasonal, holidays, or any catch-all note after all other topics
  if (!covered.has('open_notes') && (
    /שבת|חגים|ראש השנה|פסח|יום כיפור|חנוכה|christmas|holiday|שעות פעילות|לא לפרסם ב|seasonal|schedule|daypart|business hours/.test(userLc) ||
    covered.size >= 7  // safety: if 7+ topics covered, treat next message as open_notes catch-all
  )) {
    covered.add('open_notes');
  }

  return Array.from(covered);
}

function detectCoveredTopics(settings: any, aiResponse: string, userMessage: string, existing: string[]): string[] {
  // First: incremental detection from this turn's messages
  const afterIncremental = detectCoveredTopicsIncremental(aiResponse, userMessage, existing);
  // Then: if we have a complete SUMMARY, use it to fill in anything missed
  return detectCoveredTopicsFromSummary(settings, afterIncremental);
}

// Detect script family from text for server-side language injection
function detectScriptLanguage(text: string): 'arabic' | 'hebrew' | 'other' {
  if (/[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(text)) return 'arabic';
  if (/[֐-׿יִ-ﭏ]/.test(text)) return 'hebrew';
  return 'other';
}

// Build dynamic system prompt with current topics state injected
function buildOnboardingSystemPrompt(coveredTopics: string[], lastMessage?: string): string {
  const requiredBase = ['business_type', 'website', 'budget', 'management_percentage', 'goal', 'geography', 'exclusions', 'open_notes'];
  const remaining = requiredBase.filter(t => !coveredTopics.includes(t));
  const allDone = remaining.length === 0;

  const stateBlock = coveredTopics.length === 0
    ? '\n\n## CONVERSATION STATE\nNo topics confirmed yet. Start by asking about business_type.'
    : `\n\n## CONVERSATION STATE (updated each turn — do NOT re-ask confirmed topics)
Topics confirmed: ${coveredTopics.join(', ')}
Topics still needed: ${allDone ? 'NONE — ALL COMPLETE ✅' : remaining.join(', ')}
${allDone ? '\n⚡ ALL REQUIRED TOPICS ARE COVERED. Your NEXT response MUST output the [SUMMARY] JSON block, then a brief friendly closing line. Do NOT ask any more questions.' : ''}`;

  // Hard language override injected as a HEADER (before the base prompt) so it has
  // maximum weight in long multi-turn contexts — suffix instructions get ignored by turn 5+
  let langOverride = '';
  if (lastMessage) {
    const lang = detectScriptLanguage(lastMessage);
    if (lang === 'arabic') langOverride = '⚠️ LANGUAGE LOCK: The client just wrote in Arabic. YOUR ENTIRE RESPONSE MUST BE IN ARABIC. EXCEPTION: the [SUMMARY]...[/SUMMARY] block must always use English JSON keys and values — output it in English regardless of conversation language.\n\n';
    else if (lang === 'hebrew') langOverride = '⚠️ LANGUAGE LOCK: The client just wrote in Hebrew. YOUR ENTIRE RESPONSE MUST BE IN HEBREW. EXCEPTION: the [SUMMARY]...[/SUMMARY] block must always use English JSON keys and values — output it in English regardless of conversation language.\n\n';
    else langOverride = '⚠️ LANGUAGE LOCK: The client just wrote in English. YOUR ENTIRE RESPONSE MUST BE IN ENGLISH.\n\n';
  }

  return langOverride + ONBOARDING_SYSTEM_PROMPT_BASE + stateBlock;
}

const DaypartingRuleSchema = z.object({
  day: z.number().int().min(0).max(6),
  start_hour: z.number().int().min(0).max(23),
  end_hour: z.number().int().min(0).max(23),
});

const ConversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.string(),
});

const SaveSettingsSchema = z.object({
  business_type: z.enum(['ecommerce', 'hero_product', 'lead_gen', 'saas', 'general_store']).default('ecommerce'),
  website_url: z.preprocess(v => {
    if (v === '' || v == null) return undefined;
    const s = String(v).trim();
    return /^https?:\/\//i.test(s) ? s : `https://${s}`;
  }, z.string().url().optional()),
  management_percentage: z.number().min(1).max(100).default(100).transform(v => Math.round(v)),
  budget_monthly_ils: z.number().positive().transform(v => Math.round(v)),
  budget_currency: z.string().default('ILS'),
  budget_original_amount: z.number().positive().optional().nullable(),
  goal: z.enum(['leads', 'purchases', 'traffic', 'awareness']),
  margin_pct: z.number().min(0).max(100).optional().nullable(),
  hero_product_name: z.string().optional().nullable(),
  hero_product_margin_pct: z.number().min(0).max(100).optional().nullable(),
  geo_include: z.array(z.string()).default([]),
  geo_exclude: z.array(z.string()).default([]),
  exclusions: z.string().optional().nullable(),
  open_notes: z.string().optional().nullable(),
  risk_level: z.enum(['conservative', 'balanced', 'aggressive']).default('balanced'),
  dayparting_rules: z.array(DaypartingRuleSchema).default([]),
  strategy_plan: z.record(z.unknown()).optional(),
  website_analysis: z.string().optional(),
  conversation: z.array(ConversationMessageSchema),
  social_opt_in: z.object({
    enabled: z.boolean(),
    platforms: z.array(z.enum(['facebook', 'instagram', 'tiktok'])),
    approval_mode: z.enum(['auto', 'review', 'strict']),
    content_pillars: z.array(z.string()).optional(),
  }).optional(),
});

function buildHistoricalContext(historical: Record<string, any>): string {
  const parts: string[] = [];
  for (const [platform, data] of Object.entries(historical)) {
    if (!data) continue;
    const m = data.metrics_30d;
    const campaignNames = (data.campaigns ?? []).slice(0, 5).map((c: any) => c.name).join(', ');
    const keywords = (data.keywords ?? []).slice(0, 5).map((k: any) => k.text).join(', ');
    const audiences = (data.top_audiences ?? []).slice(0, 3).join(', ');
    parts.push(
      `${platform.toUpperCase()} (last 30 days): ` +
      `Spend $${m.spend_usd}, ${m.impressions.toLocaleString()} impressions, ${m.clicks.toLocaleString()} clicks, ` +
      `CTR ${m.ctr}%, avg CPC $${m.avg_cpc_usd}, ${m.conversions} conversions` +
      (m.roas ? `, ROAS ${m.roas}x` : '') +
      (campaignNames ? `. Campaigns: ${campaignNames}` : '') +
      (keywords ? `. Top keywords: ${keywords}` : '') +
      (audiences ? `. Audiences: ${audiences}` : ''),
    );
  }
  return parts.join('\n');
}

export async function onboardingRoutes(app: FastifyInstance) {
  // Save confirmed onboarding settings
  app.post(
    '/onboarding/settings',
    { preHandler: authenticate },
    async (request, reply) => {
      const result = SaveSettingsSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: 'Validation error', details: result.error.flatten() });
      }

      // Attestation gate — onboarding cannot complete without the master attestations.
      // The frontend Continue button records these; if they're absent something is off.
      const { data: attests } = await db
        .from('content_attestations')
        .select('attestation_kind')
        .eq('tenant_id', request.tenantId)
        .in('attestation_kind', ['onboarding_master', 'tos_acceptance', 'ai_disclosure_consent']);
      const have = new Set((attests ?? []).map((a: { attestation_kind: string }) => a.attestation_kind));
      const missing = ['onboarding_master', 'tos_acceptance', 'ai_disclosure_consent'].filter(k => !have.has(k));
      if (missing.length > 0) {
        return reply.code(412).send({
          error: 'attestation_required',
          missing,
          message: 'Please confirm the consent statements on the previous step before continuing.',
        });
      }

      const data = result.data;
      const { error } = await db.from('client_settings').upsert(
        {
          tenant_id: request.tenantId,
          ...data,
          margin_pct:               data.margin_pct ?? null,
          hero_product_name:        data.hero_product_name ?? null,
          hero_product_margin_pct:  data.hero_product_margin_pct ?? null,
          website_analysis:         data.website_analysis ?? null,
          budget_currency:          data.budget_currency ?? 'ILS',
          budget_original_amount:   data.budget_original_amount ?? null,
          confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id' },
      );

      if (error) {
        request.log.error({ error }, 'Failed to save client settings');
        return reply.code(500).send({ error: 'Failed to save settings' });
      }

      // Create/update social_settings if opted in
      if (data.social_opt_in?.enabled && data.social_opt_in.platforms.length > 0) {
        const platformConfig = data.social_opt_in.platforms.map(p => ({
          platform: p,
          enabled: true,
          page_id: null,
        }));
        await db.from('social_settings').upsert(
          {
            tenant_id: request.tenantId,
            enabled: true,
            platforms: platformConfig,
            approval_mode: data.social_opt_in.approval_mode,
            content_pillars: data.social_opt_in.content_pillars ?? [
              'educational', 'promotional', 'social_proof', 'behind_the_scenes', 'trending',
            ],
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id' },
        );
      } else if (data.social_opt_in && !data.social_opt_in.enabled) {
        // Explicitly opted out — ensure disabled
        await db.from('social_settings').upsert(
          { tenant_id: request.tenantId, enabled: false, updated_at: new Date().toISOString() },
          { onConflict: 'tenant_id' },
        );
      }

      // Forensic snapshot of the complete onboarding submission. This is what the
      // customer is going on record as having approved — strategy plan, budget,
      // geo, exclusions, social opt-in, the works.
      await captureApprovalSnapshot({
        tenantId: request.tenantId,
        clerkUserId: request.clerkUserId,
        subjectKind: 'onboarding',
        contentSnapshot: data,
        approvalMethod: 'web_click',
        clientIp: request.ip ?? null,
        userAgent: (request.headers['user-agent'] as string | undefined) ?? null,
      }).catch((err) => {
        request.log.error({ err }, 'onboarding approval snapshot failed; continuing');
      });

      // Audit log
      await db.from('audit_log').insert({
        tenant_id: request.tenantId,
        action: 'onboarding.completed',
        actor: 'user',
        payload: {
          goal: data.goal,
          budget_monthly_ils: data.budget_monthly_ils,
          social_enabled: data.social_opt_in?.enabled ?? false,
          social_platforms: data.social_opt_in?.platforms ?? [],
        },
      });

      // Fire GEO audit in background — non-blocking
      if (data.website_url) {
        const { runGeoAuditForTenant } = await import('./geo.js');
        runGeoAuditForTenant(request.tenantId, data.website_url).catch(err => { request.log.error({ err }, 'background geo audit failed'); });
      }

      // ── Background: brand voice + creative brief extraction + conversion readiness
      // Non-blocking — onboarding can finish before these complete. If they
      // fail, the customer can re-run from dashboard.
      const tenantId = request.tenantId;
      (async () => {
        try {
          await refreshBrandVoiceForTenant(tenantId);
        } catch (err) { request.log.error({ err }, 'background brand voice extract failed'); }
      })();

      (async () => {
        try {
          const brief = await extractCreativeBrief({
            websiteAnalysis: data.website_analysis ?? null,
            businessGoal: data.goal,
            heroProductName: data.hero_product_name ?? undefined,
            productMarginPct: data.hero_product_margin_pct ?? data.margin_pct ?? null,
          });
          if (brief) {
            await saveCreativeBrief(tenantId, brief, { isDefault: true });
          }
        } catch (err) { request.log.error({ err }, 'background creative brief extract failed'); }
      })();

      if (data.website_url) {
        (async () => {
          try {
            await auditConversionReadiness({
              tenantId,
              websiteUrl: data.website_url!,
              goal: data.goal,
            });
          } catch (err) { request.log.error({ err }, 'background readiness audit failed'); }
        })();
      }

      return reply.code(201).send({ success: true });
    },
  );

  // ── AI intake chat ───────────────────────────────────────────────────────────
  app.post('/onboarding/chat', { preHandler: authenticate }, async (request, reply) => {
    const { history = [], message, coveredTopics = [] } = request.body as any;
    if (!message?.trim()) return reply.code(400).send({ error: 'message required' });

    // Content policy pre-check: scan full conversation history + current message
    const allUserMessages = [
      ...(history as any[]).filter((m: any) => m.role === 'user').map((m: any) => m.content),
      message,
    ];
    // Pass the last AI message so the classifier can detect exclusions context
    const lastAiMsg = (history as any[]).filter((m: any) => m.role === 'assistant').at(-1)?.content as string | undefined;
    const policyCheck = detectContentPolicy(allUserMessages, lastAiMsg);
    if (policyCheck.blocked) {
      // Detect language from history: if any message contains Hebrew, use Hebrew refusal
      const allText = allUserMessages.join(' ');
      const isHebrew = /[֐-׿]/.test(allText);
      const refusal = isHebrew ? policyCheck.refusal_he! : policyCheck.refusal_en!;
      return reply.send({
        message: refusal,
        coveredTopics: [],
        settings: null,
        blocked: true,
        blockedCategory: policyCheck.category,
      });
    }

    // Server-side disambiguation guard (A2-5)
    const historyArr = history as any[];
    const currentIsBareNumber = /^\s*\d[\d,. ]*\s*$/.test(message);
    const numericAmount = Number(message.replace(/[^0-9.]/g, '') || '0');

    const aiAlreadyAskedCurrency = historyArr.some(
      (m: any) => m.role === 'assistant' && /ILS|USD|AED|EUR|currency|מטבע|moneda/i.test(m.content) && /\?/.test(m.content),
    );
    const budgetAlreadyConfirmed = historyArr.some(
      (m: any) => m.role === 'assistant' && /₪|shekels?|ILS.*month|USD.*month|AED.*month|EUR.*month/i.test(m.content),
    );
    const historyHasHebrew = historyArr.some((m: any) => /[א-׿]/.test(m.content));
    // AI asked currency in Hebrew context (₪ was the suggested option) → safe to assume ILS on bare number follow-up
    const aiAskedCurrencyHebrew = historyArr.some(
      (m: any) => m.role === 'assistant' && /₪.*מטבע|מטבע.*₪|שקל.*או|או.*שקל/i.test(m.content),
    );

    // A2-5b: AI asked currency in Hebrew context → bypass AI, confirm ILS
    if (currentIsBareNumber && numericAmount > 0 && aiAskedCurrencyHebrew && !budgetAlreadyConfirmed) {
      const formatted = numericAmount.toLocaleString('en-US');
      return reply.send({
        message: `הבנתי — ₪${formatted} לחודש. מה האחוז מהתקציב שתרצה שוויגמיס ינהל?`,
        coveredTopics: Array.from(new Set([...(coveredTopics as string[]), 'budget'])),
        settings: null, // partial — full summary only after all topics covered
      });
    }
    // A2-5b legacy: AI already asked (ILS|USD pattern) and user gives another bare number → confirm with ILS
    if (currentIsBareNumber && numericAmount > 0 && aiAlreadyAskedCurrency && !aiAskedCurrencyHebrew && !budgetAlreadyConfirmed) {
      const formatted = numericAmount.toLocaleString('en-US');
      const confirmMsg = historyHasHebrew
        ? `הבנתי — ₪${formatted} לחודש. מה האחוז מהתקציב שתרצה שוויגמיס ינהל?`
        : `Got it — ₪${formatted}/month. What percentage of that budget would you like Vigmis to manage?`;
      return reply.send({
        message: confirmMsg,
        coveredTopics: Array.from(new Set([...(coveredTopics as string[]), 'budget'])),
        settings: null, // partial — full summary only after all topics covered
      });
    }

    const messages = [
      ...historyArr.map((m: any) => `${m.role === 'user' ? 'Client' : 'Vigmis'}: ${m.content}`),
      `Client: ${message}`,
    ].join('\n\n');

    // For bare ASCII messages (numbers, punctuation), detect language from history
    // to avoid overriding a Hebrew/Arabic session with "ENGLISH LOCK"
    const hasNonAscii = /[^\x00-\x7F]/.test(message);
    const effectiveLangMessage = hasNonAscii
      ? message
      : (historyArr.slice().reverse().find(
          (m: any) => m.role === 'user' && /[^\x00-\x7F]/.test(m.content),
        )?.content ?? message);

    const systemPrompt = buildOnboardingSystemPrompt(coveredTopics as string[], effectiveLangMessage);

    let response;
    try {
      response = await route({
        task: 'analysis',
        prompt: messages,
        systemPrompt,
        options: { maxTokens: 800, temperature: 0.6 },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Fire-and-forget — alert never blocks the reply
      sendOperatorAlert({
        title: 'Onboarding chat AI failure',
        body: `AI model error during onboarding chat.\n\nError: ${msg}\nMessage: ${String(message).slice(0, 200)}`,
        severity: 'warning',
        tenantId: request.tenantId,
      });
      return reply.send({
        message: `AI error: ${msg}. Please try again.`,
        coveredTopics,
        settings: null,
      });
    }

    const aiMessage = response.output;
    const settings = extractSummary(aiMessage);
    const newCoveredTopics = detectCoveredTopics(settings, aiMessage, message as string, coveredTopics as string[]);
    const visibleMessage = aiMessage.replace(/\[SUMMARY\][\s\S]*?\[\/SUMMARY\]/g, '').trim();

    return reply.send({
      message: visibleMessage || (settings ? 'Great! Here is your summary.' : aiMessage),
      coveredTopics: newCoveredTopics,
      settings,
    });
  });

  // ── Full analysis pipeline ────────────────────────────────────────────────
  app.post('/onboarding/analyze', { preHandler: authenticate }, async (request, reply) => {
    const { settings, feedback, lang } = request.body as any;
    if (!settings) return reply.code(400).send({ error: 'settings required' });
    const strategyLang: 'he' | 'en' = lang === 'he' ? 'he' : 'en';

    // Phase 1: Website scan + historical data + competitor ads (in parallel)
    let websiteAnalysis = 'Website could not be scanned.';
    type ScrapedSiteResult = Awaited<ReturnType<typeof scrapeWebsite>>;
    let scrapedSite: ScrapedSiteResult = null;

    const [websiteResult, historical, metaTokenRow, connectedPlatformsRow] = await Promise.all([
      // Website scan — real multi-page + JSON-LD extraction
      (async () => {
        try {
          scrapedSite = await scrapeWebsite(settings.website_url);
          if (!scrapedSite || !scrapedSite.confident) {
            // Honesty gate: refuse to confabulate. The strategy step will see this and surface it.
            return `UNABLE_TO_READ_WEBSITE: scraped ${scrapedSite?.pagesCrawled.length ?? 0} page(s) but could not extract enough business signal. The site may be JavaScript-rendered, login-gated, or blocking bots. Vigmis will not invent a description — ask the client to clarify what they sell.`;
          }
          const productSummary = scrapedSite.jsonLdProducts.length
            ? `\n\nProducts found in site schema:\n${scrapedSite.jsonLdProducts.slice(0, 8).map((p: any) => `- ${[p.name, p.brand, p.category, p.price ? '$' + p.price : null].filter(Boolean).join(' | ')}`).join('\n')}`
            : '';
          const analysis = await route({
            task: 'analysis',
            prompt: `You are a senior marketing analyst doing a deep pre-campaign audit of a website. Extract everything relevant to building a high-performance ad campaign.

Site URL: ${scrapedSite.url}
Pages crawled: ${scrapedSite.pagesCrawled.join(', ')}${productSummary}

Website content:
${scrapedSite.text.slice(0, 10000)}

Analyze and provide:
1. WHAT THEY SELL — specific products/services, pricing if visible, product range
2. TARGET CUSTOMER — who are they selling to? (demographics, lifestyle, needs)
3. POSITIONING & USP — what makes them different? what claims do they make? what's the value proposition?
4. BRAND VOICE — tone (professional/casual/luxurious/urgent?), personality, trust signals present (reviews, certifications, guarantees?)
5. CONVERSION ARCHITECTURE — what is the primary CTA? what's the funnel? is there an offer, discount, or lead magnet?
6. STRENGTHS — what works well on this site as a foundation for ads?
7. WEAKNESSES / RISKS — what's missing that could hurt ad performance? (no pricing, weak CTA, generic copy, no social proof?)
8. AD HOOKS — 3 specific message angles visible in the website content that could become strong ad hooks

CRITICAL: Only describe what is actually in the content. Do NOT invent products or claims not present.`,
            systemPrompt: 'You are a senior marketing analyst. Be precise, specific, and commercially sharp. Your analysis feeds directly into campaign strategy.',
            options: { maxTokens: 1500 },
          });
          return analysis.output;
        } catch (err) {
          return `Website could not be scanned: ${err instanceof Error ? err.message : 'unknown error'}`;
        }
      })(),
      // Historical data from connected platforms
      getAllHistoricalData(request.tenantId),
      // Meta token for Ad Library competitor search
      db.from('platform_tokens').select('access_token').eq('tenant_id', request.tenantId).eq('platform', 'meta').maybeSingle(),
      // All connected platforms for budget allocation guidance
      db.from('platform_tokens').select('platform').eq('tenant_id', request.tenantId),
    ]);

    websiteAnalysis = websiteResult;

    // If website couldn't be scraped, try to fall back to open_notes business description.
    // Hard-fail only if we have nothing to work with.
    if (websiteAnalysis.startsWith('UNABLE_TO_READ_WEBSITE')) {
      const manualDesc = [settings.open_notes, settings.exclusions]
        .filter(Boolean)
        .join('\n')
        .trim();

      if (manualDesc.length >= 30) {
        // Use manual description as a substitute for website analysis
        websiteAnalysis = `[MANUAL DESCRIPTION — website could not be scanned]\n\nBusiness type: ${settings.business_type ?? 'not specified'}\nGoal: ${settings.goal ?? 'not specified'}\n\nClient-provided description:\n${manualDesc}\n\n⚠️ Note: This strategy is based on the client's own description, not a live website scan. Quality depends on the completeness of the description. Treat all claims about the business as client-stated, not independently verified.`;
      } else {
        return reply.code(422).send({
          error: 'website_unreadable',
          message: 'Vigmis could not read enough content from the website to build a strategy. This usually means the site is JavaScript-rendered, behind a login, or blocking bots. Please describe what you sell in the chat so Vigmis can proceed.',
          scraped_pages: (scrapedSite as ScrapedSiteResult)?.pagesCrawled ?? [],
        });
      }
    }

    // Fetch competitor ads using Meta Ad Library
    const metaToken = metaTokenRow.data?.access_token ? decryptToken(metaTokenRow.data.access_token) : undefined;
    const competitorAds = await fetchCompetitorAds(settings.website_url, settings.geo_include ?? [], metaToken);

    // Build historical context string for AI prompts
    const historicalContext = buildHistoricalContext(historical);

    // Build connected platforms list for budget allocation guidance
    const connectedPlatformNames: string[] = (connectedPlatformsRow.data ?? []).map((r: { platform: string }) => r.platform);
    // If the client expressed a preference (e.g. "only Meta"), filter to that subset
    const preferredPlatforms: string[] | null = settings.preferred_platforms?.length
      ? connectedPlatformNames.filter(p => settings.preferred_platforms!.some((pref: string) => p.toLowerCase().includes(pref.toLowerCase()) || pref.toLowerCase().includes(p.toLowerCase())))
      : null;
    const activePlatforms = preferredPlatforms?.length ? preferredPlatforms : connectedPlatformNames;
    const connectedPlatformsNote = activePlatforms.length > 0
      ? `CONNECTED PLATFORMS (use ONLY these for budget allocation): ${activePlatforms.join(', ')}${preferredPlatforms ? `\nCLIENT PREFERENCE: The client explicitly asked to focus on ${activePlatforms.join(', ')} only. Do NOT include other platforms even if connected.` : '\nIMPORTANT: Only recommend budget allocation for platforms that are connected. If a platform is NOT in the list above, briefly mention it as an opportunity.'}`
      : `CONNECTED PLATFORMS: none yet\nIMPORTANT: The client has not connected any ad platforms yet. Do not include any platform in the budget breakdown. Focus on which platform to connect first and why.`;

    // Phase 2: Market research — deep strategic intelligence
    // Use original currency/amount if recorded; fall back to back-converting from ILS
    const budgetCurrency: string = (settings as any).budget_currency ?? 'ILS';
    const budgetOriginalAmount: number | null = (settings as any).budget_original_amount ?? null;
    const managedBudgetIls = Math.round(
      (settings.budget_monthly_ils / 1) * (settings.management_percentage / 100),
    );
    const managedBudgetDisplay = budgetCurrency === 'USD'
      ? `$${Math.round((budgetOriginalAmount ?? settings.budget_monthly_ils / ILS_USD_RATE) * settings.management_percentage / 100)}`
      : budgetCurrency === 'AED'
      ? `${Math.round((budgetOriginalAmount ?? settings.budget_monthly_ils / 1.05) * settings.management_percentage / 100)} AED`
      : `₪${Math.round(managedBudgetIls)}`;
    const managedBudget = budgetCurrency === 'USD'
      ? Math.round((budgetOriginalAmount ?? settings.budget_monthly_ils / ILS_USD_RATE) * settings.management_percentage / 100)
      : Math.round(settings.budget_monthly_ils / ILS_USD_RATE * settings.management_percentage / 100);

    // Fetch industry benchmarks + winning creative themes in parallel with web research
    const countryCode = ((settings.geo_include ?? [])[0] ?? 'IL').toUpperCase().slice(0, 2);
    const [metaBenchmarks, googleBenchmarks, winningThemes] = await Promise.all([
      getIndustryBenchmarks({ industry: settings.business_type ?? 'ecommerce', platform: 'meta', countryCode, goal: settings.goal ?? 'purchases' }),
      getIndustryBenchmarks({ industry: settings.business_type ?? 'ecommerce', platform: 'google', countryCode, goal: settings.goal ?? 'purchases' }),
      getWinningThemes(request.tenantId),
    ]);

    const benchmarkContext = [metaBenchmarks, googleBenchmarks].filter(Boolean).join('\n');

    // Phase 2a: Perplexity web research — real-time competitive intelligence
    // Runs BEFORE Claude analysis so Claude has live market data, not just training knowledge
    const geoStr = (settings.geo_include ?? []).join(', ') || 'global';
    let webIntelligence = '';
    try {
      const webRes = await route({
        task: 'web_research',
        prompt: `Research the advertising landscape for ${settings.business_type ?? 'a business'} targeting ${geoStr}. I need:
1. Who are the main competitors advertising online in this space right now?
2. What ad messaging angles dominate in this category? (specific examples if possible)
3. Realistic CPC and CPM benchmarks for this industry/geography on Meta and Google (2025-2026)
4. What are the top customer pain points and purchase triggers for this product/service category?
5. Any recent market trends, seasonal patterns, or shifts in consumer behavior?

Business context: ${websiteAnalysis.slice(0, 400)}
Goal: ${settings.goal} | Budget: ~${managedBudgetDisplay}/month`,
        options: { maxTokens: 1200 },
      });
      webIntelligence = webRes.output;

      // Save research with timestamp for audit trail and future refresh logic
      await db.from('market_research_snapshots').insert({
        tenant_id: request.tenantId,
        query_type: 'strategy_research',
        query: `${settings.business_type ?? 'business'} in ${geoStr}`,
        raw_findings: webRes.output,
      });
    } catch {
      // Perplexity failure is non-blocking — Claude proceeds with training knowledge
    }

    const research = await route({
      task: 'market_research',
      prompt: `You are a senior strategic planner at a world-class digital agency. You are doing deep pre-campaign research for a new client. Your research directly feeds the campaign strategy — be specific, sharp, and commercially honest.

## BUSINESS PROFILE
${websiteAnalysis}

## PARAMETERS
- Advertising goal: ${settings.goal}
- Target geography: ${(settings.geo_include ?? []).join(', ') || 'not specified'}
- Monthly ad budget: ~${managedBudgetDisplay}/month
- Business type: ${settings.business_type ?? 'not specified'}
${settings.margin_pct ? `- Gross margin: ${settings.margin_pct}%` : ''}
${settings.exclusions ? `- Client constraints: ${settings.exclusions}` : ''}
${webIntelligence ? `\n## REAL-TIME WEB INTELLIGENCE (from live web search — use this as ground truth for market data)\n${webIntelligence}\n` : ''}
${benchmarkContext ? `\n## INDUSTRY BENCHMARKS (use these as realistic targets, not generic guesses)\n${benchmarkContext}\n` : ''}
${winningThemes ? `\n## ${winningThemes}\n` : ''}
${historicalContext ? `\n## CLIENT'S HISTORICAL AD PERFORMANCE\n${historicalContext}` : ''}
${competitorAds ? `\n## COMPETITOR ADS RUNNING RIGHT NOW (Meta Ad Library)\n${competitorAds}` : ''}

## YOUR RESEARCH MUST COVER ALL OF THE FOLLOWING:

### 1. COMPETITIVE LANDSCAPE
- Who are the main competitors in this space in ${(settings.geo_include ?? []).join(', ') || 'this market'}?
- What positioning strategies do they use? (price leader / quality / speed / lifestyle / niche?)
- What messaging angles are dominant in competitor ads right now?
- Where is there a positioning gap this business could own?
- What creative formats dominate this category?

### 2. CUSTOMER INTELLIGENCE
- Precise ideal customer profile: demographics AND psychographics (lifestyle, values, status signals, media consumption)
- Purchase trigger: what changes in the customer's life before they start looking for this product/service?
- Top 3 objections BEFORE purchase — be specific to this business, not generic
- What social proof format matters most to them? (number reviews, before/after, specific credentials, peer testimonials?)
- Awareness stage: are they problem-aware, solution-aware, or product-aware? This determines the right ad angle.
- Where do they spend time online and what do they trust?

### 3. MARKET DYNAMICS
- Estimated CPC range for this goal/geography combination (be specific — e.g. "$1.20–$2.80 for Meta lead gen in Israel")
- Competitive intensity assessment: low/medium/high — and what that means for creative aggressiveness
- Is this a search-intent market (active demand) or discovery market (latent demand)? This determines platform weight.
- Realistic conversion rate benchmark for this industry and goal
- Seasonal patterns or timing considerations
- Estimated addressable audience size: is this a mass market or niche? Does it affect budget ceiling?

### 4. HISTORICAL PERFORMANCE ANALYSIS (if data available)
- What worked in past campaigns? Specific patterns.
- What clearly failed? Root cause — was it creative, targeting, landing page, or budget?
- What budget level delivered the best efficiency ratio?
- What should NOT be repeated?

### 5. STRATEGIC INTELLIGENCE
- The single most powerful angle this business should lead with in ads
- Their unfair advantage vs. competitors (if any) — what can they credibly claim that others cannot?
- The biggest risk that would cause this campaign to fail (be honest and specific)
- 3 specific creative concepts that would win in this market, based on what you know about this audience

Be sharp, specific, and commercially honest. Avoid generic marketing clichés.`,
      systemPrompt: 'You are a senior strategic planner at a world-class digital agency. Your research must be specific, sharp, and commercially grounded. Generic output is unacceptable.',
      options: { maxTokens: 2500 },
    });
    const marketResearch = research.output;

    // Phase 3: Strategy generation — capped at 240s so we stay under Vercel's 300s limit
    const STRATEGY_TIMEOUT_MS = 240_000;
    let strategyTimedOut = false;
    const strategyRes = await Promise.race([
      route({
        task: 'analysis',
        prompt: `You are a senior media planner and Chief Strategy Officer at a world-class agency. A new client has come to you. Based on the deep research below, produce a COMPLETE, SPECIFIC strategic plan — not generic frameworks, but the real strategic thinking a $50M agency would deliver: the WHY behind every decision, the WHO with psychological precision, the HOW with specific execution steps, and what's at stake.

## BUSINESS ANALYSIS
${websiteAnalysis}

## MARKET RESEARCH & COMPETITIVE INTELLIGENCE
${marketResearch}

${historicalContext ? `## CLIENT'S HISTORICAL AD PERFORMANCE\n${historicalContext}\n` : ''}

PARAMETERS:
- Goal: ${settings.goal}
- Client's stated monthly budget: ~${managedBudgetDisplay}
- Target geography: ${(settings.geo_include ?? []).join(', ')}
- Exclusions: ${settings.exclusions ?? 'none'}
- Has parallel campaigns outside Vigmis: ${settings.has_parallel_campaigns ? 'yes' : 'no'}

${connectedPlatformsNote}

BUDGET SPLIT RULE (apply strictly based on monthly managed budget in USD):
- Budget < $2000/month: recommend Google-only. Meta is not cost-effective at this scale — minimum test budget on Meta is $15–20/day to exit the learning phase.
- Budget $2000–$4000/month: recommend 85/15 Google/Meta split. The 15% Meta allocation is for retargeting only — warm audiences, past site visitors, video viewers, lookalikes. Do NOT use Meta for cold prospecting at this budget tier.
- Budget > $4000/month: recommend 70/30 Google/Meta. At this scale Meta prospecting becomes efficient enough to justify broader top-of-funnel investment alongside retargeting.
Always explain the split reasoning in budget_split_rationale — not just the numbers, but WHY this ratio fits this specific budget level.

ICP CONFIDENCE GAP RULE: If website analysis does not clearly identify the business type (Shopify store vs. SaaS vs. service vs. local), include "icp_confidence_gap" field with one sentence stating what specific information would improve ICP accuracy (e.g. "Knowing whether customers are B2B buyers or individual consumers would allow sharper audience targeting"). If the business type is clearly identified from the website, set this field to null or omit it.

STATISTICS SOURCE RULE: Cite real sources for benchmarks in the "cited_stats" array as { "claim": "...", "source": "WordStream 2024 / Meta Business Insights 2025 / Google Ads Benchmarks 2024", "confidence": "high" | "medium" }. Omit unverifiable numeric claims.

PLATFORM SELECTION RULES (apply strictly — do not include platforms that don't fit):
- Google Search: only if there is clear search intent for this product/service
- Google Display: only for retargeting or brand awareness with budget >$500/mo
- Meta (Facebook/Instagram): good for most B2C products, visual goods, 25-55 audience
- LinkedIn: REQUIRED for business_type = "saas" or B2B lead generation targeting professionals, managers, or enterprises. LinkedIn is the primary channel for B2B pipeline in North America and Western Europe — not optional, not a nice-to-have. Include in platforms array with reasoning tied to the specific B2B audience.
- TikTok: ONLY if target audience is under 40 AND product is visual/lifestyle/consumer. Never for B2B, medical, financial, legal, or products targeting 50+ audience.
- If budget is below $300/mo: use maximum 1-2 platforms

BUDGET ADVISORY — think like a CFO + CMO combined. Consider:
- What is the minimum budget to generate enough data to optimize in this market?
- What does the client's budget actually buy (clicks, leads) at the estimated CPC?
- Is there a ceiling where more spend won't help (market saturation, small audience)?
- Is the stated budget too low to work, sufficient, or higher than the efficient ceiling?
- What warnings does this client need to hear (funnel quality, competition, audience size)?
- Assume a realistic landing page conversion rate for this goal/industry (leads: 2-5%, purchases: 1-3%)

CUSTOM BENCHMARKS — this is critical. The optimization engine will use these instead of generic defaults.
Generate realistic performance thresholds for THIS specific business, in THIS market, with THIS goal.
Consider: vertical (B2B vs B2C), country (Israel CPC ≠ US), product price point, competition level, brand recognition, audience size.
For each platform the client will use, set minCtr (underperforming threshold), goodCtr (scale-up threshold), and optionally maxCpc/maxCpa.

SOCIAL MEDIA ORGANIC POSTING — Vigmis posts organic content (FB/IG $1/post, TikTok $3/post). Assess whether this client benefits and which platforms/pillars.

DEMAND MATURITY ANALYSIS — answer this FIRST before building any strategy:
Ask yourself: does strong, existing purchase intent already exist for this product/category (people actively searching and ready to buy), or is there latent demand that needs to be educated and awakened first?
- CAPTURED DEMAND (high intent, active search): e.g. "accountant near me", "buy iPhone 15" — conversion-first strategy works. Google Search is primary.
- LATENT DEMAND (people don't know they need it, or don't know THIS version exists): e.g. premium farm-direct food, niche B2B software, specialty wellness products — must invest in awareness and demand CREATION before conversion will work. Skipping this phase burns budget.
- MIXED: some terms have intent, most of the TAM is unaware — phased approach required.
Identify which type this is. It determines whether the strategy leads with conversion OR with awareness+education. NEVER default to conversion-first without justifying demand maturity.

CAMPAIGN PHASES — the strategy MUST be structured in explicit phases. Do not plan a single flat campaign.
Each phase has a distinct objective, budget weight, and success metric. Typical structure:
- Phase 1 (Warm-up/Brand): Build brand recognition + pixel audience. Low direct-response pressure. 2–4 weeks, 20–30% of budget.
- Phase 2 (Demand Activation): Convert awareness into intent. Educational content, problem-agitation, category creation messaging. 3–6 weeks, 30–40% of budget.
- Phase 3 (Conversion): Retarget warm audiences from phases 1+2 with direct purchase/lead CTAs. Ongoing, 40–50% of budget.
NOT every business needs 3 phases — high-intent search products can go Phase 2+3 immediately. But you MUST JUSTIFY skipping Phase 1.
Seasonal businesses: build phases around peak seasons, not calendar weeks.

ANTI-GENERIC RULES — violations will make the output useless:
✗ Do NOT compare to mass-market competitors (supermarkets, Amazon) unless they are the ACTUAL primary competition channel.
✗ Do NOT write "own a niche" or "build trust" without specifying EXACTLY what the niche is and what trust signal to use.
✗ Do NOT write "run short video content with direct purchase CTA" — explain what the video SHOWS, SAYS, and why that specific creative triggers this specific audience.
✗ Do NOT suggest "retarget site visitors within 7 days" without explaining WHY 7 days is the right window for this product's purchase cycle.
✗ Do NOT reference generic benchmarks ("average CTR for ecommerce") without explaining why this business is above or below average.
✗ Every creative hook must be a REAL headline someone would read and react to — not a category description.

STRATEGIC DELIVERABLES (all specific to THIS business, no generic filler):

strategy_narrative: 3 paragraphs — (1) demand maturity diagnosis and why it determines the approach; (2) exact customer psychographic WITH the specific moment/trigger that causes them to buy (what happens in their life that makes them search or respond to this ad TODAY); (3) phase sequencing logic — why these phases in this order for this business.
competitive_advantage: What this business can credibly own vs. competitors — or honest assessment if none.
funnel_strategy: What runs at each funnel stage — formats, messages, audience layers.
creative_brief: Per platform — formats, asset count, 3 specific hooks (write the ACTUAL headline text, not the angle name), CTA, creative direction.
first_30_days: Week-by-week plan — what to test, what signals to look for, what triggers scale.
message_testing_matrix: 4 A/B angles — hypothesis, hook, target segment, win signal.
missing_platforms: Unconnected platforms that would help, with specific reasoning.
confidence_scores: 0-100 integers for icp/channel/budget/overall. Be realistic — sparse data = 50-70, rich signals = 80-95.
confidence_notes: One sentence per dimension explaining the score and what data would raise it.
risk_factors: 3-5 concrete risks — probability/impact/mitigation. Real risks, not platitudes.
budget_split_rationale: WHY this ratio — what each dollar buys and why over alternatives.
what_we_dont_know: 2-5 honest unknowns that would change the plan.
counter_argument: Steelman the best alternative, then explain why we still chose this path.

${feedback ? `CLIENT FEEDBACK ON PREVIOUS STRATEGY:\n${feedback}\nAdjust accordingly.\n` : ''}

Return ONLY valid JSON (no extra text):
{
  "platforms": [
    { "name": "google", "campaign_types": ["search"], "budget_percentage": 60, "reasoning": "Specific reason based on this business and market data" }
  ],
  "market_insights": "2-3 sharp sentences: what the market looks like, what competitors do, what the real opportunity is",
  "target_audience": "Precise audience: demographics + psychographics + what triggers their purchase",
  "estimated_cpc": "$X.XX - $X.XX",
  "recommendations": "Top 3 specific, actionable recommendations based on research — not generic",
  "past_performance_notes": "Key learnings from client historical campaigns, or null",
  "organic_recommendations": "2-3 specific organic growth actions tied to this business's strengths",
  "competitive_advantage": "What this business can credibly own vs. competitors — or honest assessment if none exists",
  "strategy_narrative": "Paragraph 1: strategic insight and why this approach. Paragraph 2: exact customer psychographic and purchase trigger. Paragraph 3: execution logic and sequencing rationale.",
  "market_thesis": "Why do people buy THIS specific version of this product/service — not the generic category, but THIS business's version? What need, desire, or identity drives purchase? This is the core strategic insight everything else flows from.",
  "market_segments": [
    {
      "segment_name": "Short label for this segment",
      "size": "small | medium | large",
      "trigger": "The specific moment or context that causes THIS segment to buy — what happens in their life, what emotion or need drives it",
      "message": "The one message that resonates with this segment above all else",
      "channel": "Best channel to reach them and why",
      "ltv_potential": "low | medium | high — and why"
    }
  ],
  "real_competitors": [
    {
      "name": "Competitor name or category",
      "why_they_compete": "Why buyers consider this as an alternative to this business",
      "their_weakness": "What they can't credibly claim that this business can",
      "win_strategy": "How to position against them specifically"
    }
  ],
  "strategic_hypotheses": [
    {
      "hypothesis": "Testable bet about what will drive growth — not a strategy, a hypothesis",
      "why_we_believe_it": "Evidence from the website, market, or research that supports this",
      "how_to_test": "Specific experiment to validate or invalidate",
      "if_true": "What we do next if this is confirmed",
      "if_false": "What we do instead if this fails"
    }
  ],
  "campaign_phases": [
    {
      "phase": 1,
      "name": "Phase name tied to objective, not a generic label",
      "objective": "What cognitive or behavioral shift we are trying to create in the audience",
      "duration_weeks": 3,
      "budget_percentage": 25,
      "channels": ["meta"],
      "content_focus": "What the content SHOWS and SAYS — specific, not 'brand awareness'",
      "success_metric": "The one number that tells us this phase is working",
      "skip_if": "Condition under which we skip or compress this phase"
    }
  ],
  "funnel_strategy": {
    "awareness": "Top of funnel: audience, message, format, and what we're trying to do",
    "consideration": "Mid funnel: retargeting who, with what offer, format",
    "conversion": "Bottom funnel: hot audiences, specific offer, urgency mechanic"
  },
  "creative_brief": [
    {
      "platform": "meta",
      "formats": ["video_15s", "single_image"],
      "quantity_images": 3,
      "quantity_videos": 1,
      "hooks": ["Pain point angle: specific hook text", "Social proof angle: specific hook text", "Transformation angle: specific hook text"],
      "cta": "Shop Now",
      "creative_direction": "What visually and tonally makes this creative right for this specific audience"
    }
  ],
  "first_30_days": {
    "week_1": "What we launch, what budget, what we're testing",
    "week_2": "What signals we look for, what we adjust",
    "week_3": "Scale decisions — what threshold triggers scaling vs. pausing",
    "week_4": "Assessment: what's confirmed, what next phase looks like"
  },
  "message_testing_matrix": [
    {
      "angle": "Pain point",
      "hook": "Specific headline/hook text for this business",
      "hypothesis": "This will resonate with X type of customer because Y",
      "target_segment": "Who specifically sees this",
      "win_signal": "CTR > X% or CPA < $Y"
    }
  ],
  "missing_platforms": [
    { "platform": "tiktok", "reason": "Specific reason tied to THIS business and market research", "potential_uplift": "Specific estimate" }
  ],
  "budget_analysis": {
    "verdict": "sufficient",
    "verdict_explanation": "One honest sentence about whether the budget makes sense for this market",
    "minimum_monthly_usd": 300,
    "recommended_learning_usd": 450,
    "recommended_steady_usd": 350,
    "efficiency_ceiling_usd": 800,
    "projected_clicks_monthly": 600,
    "projected_leads_monthly": 15,
    "break_even_conversions": 4,
    "warnings": [
      "Specific warning tied to this business's situation"
    ],
    "platform_exclusions": [
      { "platform": "tiktok", "reason": "Specific reason tied to audience demographics" }
    ]
  },
  "custom_benchmarks": {
    "meta_conversions": {
      "minCtr": 0.006,
      "goodCtr": 0.015,
      "maxCpc": 4.50,
      "maxCpa": 65.00,
      "learningDays": 10,
      "minDataClicks": 30,
      "rationale": "Specific rationale for these thresholds based on vertical/market/goal"
    }
  },
  "social_plan": {
    "recommended": true,
    "rationale": "Specific reason this business benefits from organic social",
    "platforms": [
      { "platform": "facebook", "rationale": "Specific rationale", "cost_usd": 1 },
      { "platform": "instagram", "rationale": "Specific rationale", "cost_usd": 1 }
    ],
    "content_pillars": ["educational", "promotional", "social_proof"],
    "synergy_with_ads": "How organic posts specifically help paid performance for this business",
    "estimated_monthly_cost_usd": 8
  },
  "confidence_scores": {
    "icp": 85,
    "channel": 74,
    "budget": 91,
    "overall": 83
  },
  "confidence_notes": {
    "icp": "Based on website content + stated goal; would improve with explicit customer data",
    "channel": "Google strong fit; Meta excluded due to budget — low confidence without testing",
    "budget": "Allocation reasonable for the market; refine after first 2 weeks of real CPC",
    "overall": "Solid directional plan; biggest unknown is real conversion rate"
  },
  "risk_factors": [
    { "risk": "High CPC on target keywords", "probability": "high", "impact": "medium", "mitigation": "Start with broad match, narrow after week 2 once search-term data lands" }
  ],
  "budget_split_rationale": "Why this specific platform split — what each dollar buys and why this ratio over the alternatives, not just the numbers",
  "what_we_dont_know": ["No historical performance data", "Competitor spend unknown", "Landing page conversion rate unverified"],
  "counter_argument": "Here is why NOT to do X: <strongest case for the alternative>. Here is why we still chose Y: <why the recommended path wins for THIS business>.",
  "cited_stats": [
    { "claim": "Average Google Search CTR for ecommerce is 2–5%", "source": "WordStream Google Ads Benchmarks 2024", "confidence": "high" },
    { "claim": "Meta retargeting CPM is typically $8–15 in Israel", "source": "Meta Business Insights 2025", "confidence": "medium" }
  ],
  "icp_confidence_gap": "Knowing whether buyers are individual consumers or business procurement teams would allow sharper audience segmentation on Meta and LinkedIn."
}`,
        systemPrompt: `You are a senior CMO and market strategist — not a digital agency. Your job is NOT to recommend campaigns. Your job is to understand how this specific market works, who the real buyers are, why they buy, and THEN decide what campaigns make sense. The difference: an agency asks "what ads should we run?". You ask "why do people buy this, who are they really, and what's our hypothesis?" Start from market understanding, not from ad channels. Return only valid JSON, no extra text. Every field must be specific to THIS business — generic placeholder text ("run Meta videos", "build brand awareness", "own a niche") is a failure.${strategyLang === 'he' ? '\n\n⚠️ LANGUAGE INSTRUCTION: Write your entire response in Hebrew (עברית). All text fields must be in Hebrew — strategy_narrative, market_insights, target_audience, market_thesis, market_segments, real_competitors, strategic_hypotheses, campaign_phases, competitive_advantage, funnel_strategy, creative_brief hooks and directions, recommendations, organic_recommendations, first_30_days, message_testing_matrix, risk_factors, budget_split_rationale, what_we_dont_know, counter_argument, confidence_notes, past_performance_notes. Platform names (Meta, Google, TikTok, LinkedIn) stay in English. JSON keys stay in English. Numbers, URLs, and technical ad terms stay as-is.' : ''}`,
        options: { maxTokens: 4000, temperature: 0.3 },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          strategyTimedOut = true;
          reject(new Error('strategy_timeout'));
        }, STRATEGY_TIMEOUT_MS),
      ),
    ]).catch((err: unknown) => {
      if (strategyTimedOut) return null;
      throw err;
    });

    // If strategy timed out, return partial results immediately so the client
    // gets websiteAnalysis + marketResearch and can retry the strategy step.
    if (strategyTimedOut || strategyRes === null) {
      request.log.warn('Strategy generation timed out after 240s — returning partial results');
      return reply.send({
        websiteAnalysis,
        marketResearch,
        strategy: null,
        strategy_complete: false,
        timeout: true,
      });
    }

    let strategy: object;
    try {
      const jsonMatch = strategyRes.output.match(/\{[\s\S]*\}/);
      strategy = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch { strategy = null as any; }

    if (!strategy) {
      // Fallback: AI response was too large or parse failed. Attempt a leaner retry.
      request.log.warn({ outputLength: strategyRes.output.length }, 'Strategy JSON parse failed — attempting compact retry');
      try {
        const retryRes = await route({
          task: 'analysis',
          prompt: `You are a campaign strategist. Based on this business and market research, return ONLY compact JSON — no extra text.

BUSINESS: ${websiteAnalysis.slice(0, 1500)}
MARKET RESEARCH: ${marketResearch.slice(0, 1500)}
GOAL: ${settings.goal} | BUDGET: ~${managedBudgetDisplay}/month | GEO: ${(settings.geo_include ?? []).join(', ')}

Return this exact JSON structure (be concise — max 2 sentences per text field):
{
  "platforms": [{"name":"google","campaign_types":["search"],"budget_percentage":60,"reasoning":"<why>"},{"name":"meta","campaign_types":["conversion"],"budget_percentage":40,"reasoning":"<why>"}],
  "market_insights": "<2 sharp sentences about the market opportunity>",
  "target_audience": "<demographic + psychographic profile>",
  "estimated_cpc": "$X.XX - $X.XX",
  "recommendations": "<top 3 specific actions>",
  "strategy_narrative": "<paragraph 1: strategic insight>\\n\\n<paragraph 2: customer psychographic>\\n\\n<paragraph 3: execution logic>",
  "creative_brief": [{"platform":"meta","formats":["video_15s","single_image"],"quantity_images":3,"quantity_videos":1,"hooks":["<hook 1>","<hook 2>","<hook 3>"],"cta":"Shop Now","creative_direction":"<what makes this right for this audience>"}],
  "budget_analysis": {"verdict":"sufficient","verdict_explanation":"<one honest sentence>","minimum_monthly_usd":${Math.round(managedBudget * 0.6)},"recommended_learning_usd":${Math.round(managedBudget * 1.2)},"recommended_steady_usd":${managedBudget},"efficiency_ceiling_usd":${Math.round(managedBudget * 2.5)},"projected_clicks_monthly":${Math.round(managedBudget / 1.5)},"projected_leads_monthly":${Math.round((managedBudget / 1.5) * 0.03)},"break_even_conversions":3,"warnings":["<specific warning>"],"platform_exclusions":[]},
  "organic_recommendations": "<2 organic growth suggestions>",
  "competitive_advantage": "<what this business can credibly own>"
}`,
          systemPrompt: 'Return only valid JSON. Be concise.',
          options: { maxTokens: 3000, temperature: 0.3 },
        });
        const retryMatch = retryRes.output.match(/\{[\s\S]*\}/);
        strategy = retryMatch ? JSON.parse(retryMatch[0]) : null;
      } catch { strategy = null as any; }
    }

    // Hard fallback if both AI attempts fail
    if (!strategy) {
      const defaultBudget = managedBudget;
      strategy = {
        platforms: [
          { name: 'google', campaign_types: ['search'], budget_percentage: 60, reasoning: 'High intent traffic for your goal' },
          { name: 'meta', campaign_types: ['conversion'], budget_percentage: 40, reasoning: 'Audience targeting and remarketing' },
        ],
        market_insights: marketResearch.slice(0, 800),
        target_audience: (settings.geo_include ?? []).join(', '),
        estimated_cpc: '$0.50 - $2.00',
        recommendations: 'Start with search, monitor CPC closely, scale what converts.',
        strategy_narrative: 'Strategy is being refined. The research phase completed successfully — full narrative will be available after the first optimization cycle.',
        creative_brief: [],
        budget_analysis: {
          verdict: 'sufficient',
          verdict_explanation: 'Budget appears workable for this market — monitor CPC in the first two weeks.',
          minimum_monthly_usd: Math.round(defaultBudget * 0.6),
          recommended_learning_usd: Math.round(defaultBudget * 1.2),
          recommended_steady_usd: defaultBudget,
          efficiency_ceiling_usd: Math.round(defaultBudget * 2.5),
          projected_clicks_monthly: Math.round(defaultBudget / 1.5),
          projected_leads_monthly: Math.round((defaultBudget / 1.5) * 0.03),
          break_even_conversions: 3,
          warnings: ['Actual CPC and conversion rate will be refined after the first 2 weeks of data.'],
          platform_exclusions: [],
        },
      };
    }

    return reply.send({ websiteAnalysis, marketResearch, strategy });
  });

  // ── Website quick understanding check ────────────────────────────────────────
  app.post('/onboarding/website-check', { preHandler: authenticate }, async (request, reply) => {
    const { website_url: rawWebsiteUrl } = request.body as any;
    if (!rawWebsiteUrl) return reply.code(400).send({ error: 'website_url required' });
    const website_url = /^https?:\/\//i.test(rawWebsiteUrl) ? rawWebsiteUrl : `https://${rawWebsiteUrl}`;

    let websiteText = '';
    try {
      const res = await fetch(website_url, {
        headers: { 'User-Agent': 'Vigmis/1.0 (Marketing Analysis)' },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();
      websiteText = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000);
    } catch {
      return reply.send({
        adequate: false,
        summary: null,
        unclear: ['Website could not be loaded — please check the URL is correct and publicly accessible.'],
      });
    }

    if (websiteText.length < 100) {
      return reply.send({
        adequate: false,
        summary: null,
        unclear: ['The website appears to be empty or blocked. We could not read its content.'],
      });
    }

    const aiRes = await route({
      task: 'cheap_task',
      prompt: `You are a marketing analyst reviewing a business website for onboarding into an ad management platform.

Website content:
"${websiteText.slice(0, 4000)}"

Your task: extract what this business does and assess if there is enough information to build an ad campaign.

Respond ONLY with valid JSON:
{
  "adequate": true | false,
  "what_they_sell": "<one clear sentence: what product/service they offer>",
  "hero_product": "<the main/flagship product or service, or null if unclear>",
  "target_audience": "<who is the customer, or null if unclear>",
  "brand_voice": "<formal/casual/luxury/aggressive/friendly — based on site language>",
  "unclear": ["<question 1 if something important is missing>", "<question 2>"],
  "summary": "<2-3 sentence summary of what Vigmis understands about this business — written as if telling the client what you understood>"
}

Rules:
- adequate = false if: what they sell is unclear, no products/services mentioned, site is a login page / coming soon / error
- unclear array: list only what's genuinely missing and needed for ads. Empty array if everything is clear.
- Write summary and what_they_sell in the same language as the website content`,
      options: { maxTokens: 500, temperature: 0.3 },
    });

    try {
      const parsed = JSON.parse(aiRes.output);
      return reply.send(parsed);
    } catch {
      return reply.send({
        adequate: false,
        summary: null,
        unclear: ['Could not analyze the website content. Please add more details in the chat.'],
      });
    }
  });

  // ── Strategy discussion — Vigmis gives honest opinion on client's proposed changes ──
  app.post('/onboarding/discuss', { preHandler: authenticate }, async (request, reply) => {
    const { strategy, clientRequest, settings } = request.body as any;
    if (!strategy || !clientRequest) return reply.code(400).send({ error: 'strategy and clientRequest required' });

    const managedBudget = settings
      ? Math.round((settings.budget_monthly_ils / ILS_USD_RATE) * (settings.management_percentage / 100))
      : null;

    const res = await route({
      task: 'analysis',
      prompt: `You are Vigmis — an honest and direct marketing advisor. A client has reviewed your campaign strategy and wants to make changes.

CURRENT STRATEGY SUMMARY:
- Platforms: ${(strategy.platforms ?? []).map((p: any) => `${p.name} (${p.budget_percentage}%)`).join(', ')}
- Budget advisory verdict: ${strategy.budget_analysis?.verdict ?? 'unknown'}
- Recommended budget: $${strategy.budget_analysis?.recommended_steady_usd ?? managedBudget}/mo
- Estimated CPC: ${strategy.estimated_cpc ?? 'unknown'}

CLIENT'S REQUESTED CHANGES:
"${clientRequest}"

Your job: respond honestly and directly.
- If you agree with the client's changes: say so clearly and explain why it makes sense.
- If you partially agree: say which parts you agree with and which you don't, and why.
- If you disagree: explain your concern clearly and specifically. Don't be vague. Don't just say "it depends".
- Always end by acknowledging that the final decision is theirs. You will update the plan according to their decision.
- Be concise. 3-5 sentences max. Don't lecture. Don't repeat the strategy back to them.
- Write as a trusted advisor, not as a salesperson or a yes-man.`,
      systemPrompt: 'You are Vigmis, an honest marketing advisor. Be direct and concise.',
      options: { maxTokens: 400, temperature: 0.5 },
    });

    return reply.send({ response: res.output });
  });

  // ── Strategy viewer ──────────────────────────────────────────────────────────
  // Read-only access to the current strategy + the audit trail of optimization changes.
  app.get('/onboarding/strategy', { preHandler: authenticate }, async (request, reply) => {
    const [settingsRes, auditRes] = await Promise.all([
      db.from('client_settings')
        .select('strategy_plan, website_analysis, website_url, goal, budget_monthly_ils, management_percentage, geo_include, geo_exclude, exclusions, open_notes, confirmed_at, updated_at, business_type, margin_pct, hero_product_name, budget_currency, budget_original_amount')
        .eq('tenant_id', request.tenantId)
        .maybeSingle(),
      db.from('audit_log')
        .select('id, action, platform, actor, payload, created_at')
        .eq('tenant_id', request.tenantId)
        .in('action', [
          'onboarding.completed',
          'optimization.scale_up', 'optimization.scale_down', 'optimization.pause', 'optimization.resume',
          'optimization.alert', 'optimization.needs_targeting_review', 'optimization.creative_fatigue',
          'optimization.campaign_stagnant', 'optimization.benchmark_recalibrated',
          'strategy.updated', 'strategy.recalibrated',
        ])
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    return reply.send({
      settings: settingsRes.data ?? null,
      history: auditRes.data ?? [],
    });
  });

  // Return onboarding + connection status
  app.get(
    '/onboarding/status',
    { preHandler: authenticate },
    async (request, reply) => {
      const [settingsRes, tokensRes] = await Promise.all([
        db
          .from('client_settings')
          .select('confirmed_at, goal, budget_monthly_ils, risk_level, management_percentage, website_url')
          .eq('tenant_id', request.tenantId)
          .maybeSingle(),
        db
          .from('platform_tokens')
          .select('platform, expires_at')
          .eq('tenant_id', request.tenantId),
      ]);

      const connected = {
        google: false,
        meta: false,
        tiktok: false,
      };

      for (const token of tokensRes.data ?? []) {
        const valid = token.expires_at ? new Date(token.expires_at) > new Date() : true;
        if (valid && token.platform in connected) {
          connected[token.platform as keyof typeof connected] = true;
        }
      }

      return reply.send({
        onboardingComplete: !!settingsRes.data?.confirmed_at,
        settings: settingsRes.data ?? null,
        connected,
      });
    },
  );

  // ── Agency Brain: Creative Brief Extension ───────────────────────────────────
  // POST /onboarding/creative-brief
  //
  // Generates an extended creative brief on demand — called lazily when the user
  // enters the Creative tab.  Caches result in strategy_plan.creative_brief_extended
  // so subsequent calls are free (cache hit).
  //
  // Expert panel simulation:
  //   - Copywriter (hooks, headlines, CTAs)
  //   - Creative Director (visual concepts, scripts)
  //   - Media Planner (platform tactics, timing, audience segmentation)
  //   - Industry Expert (domain-specific insights)
  //
  // Input: settings fetched from DB (no body required).
  //        Optional body: { force_regenerate?: boolean }
  //
  // Output:
  //   { cached: boolean, generated_at: string, brief: CreativeBriefExtended }
  //
  // Error 409 if no strategy_plan exists yet.

  // GET /onboarding/creative-brief — cache-only read. Never triggers AI
  // generation (and thus never incurs cost or latency). Returns the cached
  // extended brief if one exists, otherwise { cached: false, brief: null }.
  // The frontend uses POST for lazy generation; this GET is a cheap probe.
  app.get('/onboarding/creative-brief', { preHandler: authenticate }, async (request, reply) => {
    const { data: settingsRow, error: settingsErr } = await db
      .from('client_settings')
      .select('strategy_plan')
      .eq('tenant_id', request.tenantId)
      .single();

    if (settingsErr || !settingsRow) {
      return reply.code(404).send({ error: 'settings_not_found', message: 'No client settings found.' });
    }

    const strategyPlan = settingsRow.strategy_plan as Record<string, any> | null;

    if (!strategyPlan) {
      return reply.code(409).send({
        error: 'no_strategy',
        message: 'Run strategy analysis first before generating the creative brief.',
      });
    }

    if (strategyPlan.creative_brief_extended && strategyPlan.creative_brief_extended_at) {
      return reply.send({
        cached: true,
        generated_at: strategyPlan.creative_brief_extended_at,
        brief: strategyPlan.creative_brief_extended,
      });
    }

    return reply.send({ cached: false, generated_at: null, brief: null });
  });

  app.post('/onboarding/creative-brief', { preHandler: authenticate }, async (request, reply) => {
    const { force_regenerate = false } = (request.body as any) ?? {};

    // Fetch full client settings
    const { data: settingsRow, error: settingsErr } = await db
      .from('client_settings')
      .select('strategy_plan, goal, website_url, geo_include, business_type, open_notes, exclusions')
      .eq('tenant_id', request.tenantId)
      .single();

    if (settingsErr || !settingsRow) {
      return reply.code(404).send({ error: 'settings_not_found', message: 'No client settings found.' });
    }

    const strategyPlan = settingsRow.strategy_plan as Record<string, any> | null;

    if (!strategyPlan) {
      return reply.code(409).send({
        error: 'no_strategy',
        message: 'Run strategy analysis first before generating the creative brief.',
      });
    }

    // Cache check — return stored brief unless force_regenerate
    if (!force_regenerate && strategyPlan.creative_brief_extended && strategyPlan.creative_brief_extended_at) {
      return reply.send({
        cached: true,
        generated_at: strategyPlan.creative_brief_extended_at,
        brief: strategyPlan.creative_brief_extended,
      });
    }

    // Build prompt inputs from strategy plan (tolerate missing new fields gracefully)
    const creativeBriefStr = strategyPlan.creative_brief
      ? JSON.stringify(strategyPlan.creative_brief, null, 2)
      : 'Not available';

    const narrativeStr = strategyPlan.strategy_narrative ?? strategyPlan.market_insights ?? '';
    const audienceStr = strategyPlan.target_audience ?? '';
    const advantageStr = strategyPlan.competitive_advantage ?? '';
    const funnelStr = strategyPlan.funnel_strategy ? JSON.stringify(strategyPlan.funnel_strategy, null, 2) : '';
    const messageMatrixStr = strategyPlan.message_testing_matrix
      ? JSON.stringify(strategyPlan.message_testing_matrix, null, 2)
      : 'Not available';
    const geoStr = (settingsRow.geo_include ?? []).join(', ') || 'not specified';
    const goal = settingsRow.goal ?? 'purchases';
    const businessType = settingsRow.business_type ?? 'ecommerce';

    const prompt = `You are a world-class advertising agency expert panel. Your job is to produce a complete, ready-to-use extended creative brief for a client. You represent four distinct experts — read the business context, then deliver each expert's output.

## BUSINESS CONTEXT

Goal: ${goal}
Business type: ${businessType}
Geography: ${geoStr}
Target audience: ${audienceStr}
Competitive advantage: ${advantageStr || 'Not specified'}

Strategy narrative:
${narrativeStr.slice(0, 1200)}

Funnel strategy:
${funnelStr.slice(0, 600)}

Platform creative brief (from strategy):
${creativeBriefStr.slice(0, 1000)}

Message testing matrix:
${messageMatrixStr.slice(0, 800)}

---

## YOUR TASK

Produce a comprehensive extended creative brief. Respond ONLY with valid JSON — no markdown, no extra text:

{
  "messaging_pillars": [
    {
      "pillar": "pain_relief",
      "headline": "<specific, punchy headline for this business>",
      "hook": "<first 3 seconds / opening line>",
      "body": "<primary text — 2-3 sentences max>",
      "cta": "<call to action text>"
    },
    {
      "pillar": "social_proof",
      "headline": "...",
      "hook": "...",
      "body": "...",
      "cta": "..."
    },
    {
      "pillar": "transformation",
      "headline": "...",
      "hook": "...",
      "body": "...",
      "cta": "..."
    }
  ],
  "tone_guide": {
    "voice": "<describe the brand voice in 5-8 words: e.g. confident, warm, jargon-free>",
    "examples": [
      "<example on-brand phrase 1>",
      "<example on-brand phrase 2>",
      "<example on-brand phrase 3>"
    ],
    "avoid": [
      "<phrase or tone to avoid 1>",
      "<phrase or tone to avoid 2>"
    ]
  },
  "hooks": {
    "google": [
      "<Google search headline hook 1 — max 30 chars>",
      "<Google search headline hook 2 — max 30 chars>",
      "<Google search headline hook 3 — max 30 chars>"
    ],
    "meta": [
      "<Meta/Facebook first-line hook 1>",
      "<Meta/Facebook first-line hook 2>",
      "<Meta/Facebook first-line hook 3>"
    ],
    "tiktok": [
      "<TikTok opening hook 1 — conversational, scroll-stopping>",
      "<TikTok opening hook 2>",
      "<TikTok opening hook 3>"
    ]
  },
  "creative_concepts": [
    {
      "type": "avatar",
      "platform": "meta",
      "concept": "<concept name, 3-5 words>",
      "script": "<paste-ready 30-second avatar script — full spoken words>",
      "rationale": "<why this wins for THIS specific audience>"
    },
    {
      "type": "cinematic",
      "platform": "meta",
      "concept": "<concept name>",
      "script": "<scene-by-scene cinematic description + on-screen text>",
      "rationale": "<why this format and angle>"
    },
    {
      "type": "animation",
      "platform": "google",
      "concept": "<concept name>",
      "script": "<animation sequence description + copy overlay>",
      "rationale": "<why this angle>"
    }
  ],
  "audience_variants": [
    {
      "segment": "<audience segment name>",
      "message_angle": "<specific angle for this segment>",
      "hook": "<hook tailored to this segment>",
      "platform": "<best platform for this segment>"
    },
    {
      "segment": "<second audience segment>",
      "message_angle": "...",
      "hook": "...",
      "platform": "..."
    }
  ],
  "time_strategy": {
    "morning": "<what to run in morning hours and why — specific to this business>",
    "evening": "<what to run in evening hours and why>",
    "weekend": "<weekend-specific strategy — spend more/less? different creative?>"
  }
}

RULES:
- Every field must be specific to THIS business and THIS audience. Generic placeholder text is unacceptable.
- messaging_pillars: exactly 3 pillars (pain_relief, social_proof, transformation).
- creative_concepts: exactly 3 items, one of each type: avatar, cinematic, animation.
- audience_variants: 2-3 segments.
- All copy must be ready to paste into an ad — not descriptions of what copy should say.
- Return ONLY the JSON object above.`;

    const aiRes = await route({
      task: 'analysis',
      prompt,
      systemPrompt: 'You are a world-class advertising agency. Return ONLY valid JSON — no markdown code blocks, no extra text. Every piece of copy must be specific, ready to use, and tailored to this exact business.',
      options: { maxTokens: 3500, temperature: 0.55 },
    });

    let brief: Record<string, unknown> | null = null;
    // Strip any markdown code fences before extracting the JSON object — some
    // models wrap their output in ```json despite the explicit instruction not to.
    let rawOut = aiRes.output.trim();
    if (rawOut.includes('```')) {
      rawOut = rawOut.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    }
    try {
      brief = JSON.parse(rawOut);
    } catch {
      try {
        const jsonMatch = rawOut.match(/\{[\s\S]*\}/);
        brief = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        brief = null;
      }
    }

    if (!brief) {
      request.log.warn({ outputLength: aiRes.output.length }, 'creative-brief JSON parse failed');
      return reply.code(502).send({ error: 'parse_failed', message: 'AI response could not be parsed. Please try again.' });
    }

    const generatedAt = new Date().toISOString();

    // Persist back into strategy_plan jsonb — read-modify-write to avoid clobbering other fields
    const updatedPlan = {
      ...strategyPlan,
      creative_brief_extended: brief,
      creative_brief_extended_at: generatedAt,
    };

    const { error: updateErr } = await db
      .from('client_settings')
      .update({
        strategy_plan: updatedPlan,
        updated_at: generatedAt,
      })
      .eq('tenant_id', request.tenantId);

    if (updateErr) {
      request.log.error({ updateErr }, 'Failed to persist creative_brief_extended');
      // Still return the result — a cache-write failure is non-fatal
    }

    return reply.send({
      cached: false,
      generated_at: generatedAt,
      brief,
    });
  });
}
