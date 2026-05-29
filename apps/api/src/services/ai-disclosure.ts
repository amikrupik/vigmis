// AI-Generated Content Disclosure
//
// When Vigmis generates content with an LLM/image-model/video-model, the
// resulting post/ad must carry the platform-required AI disclosure. Failure to
// disclose is a violation of:
//   • Meta's "Misuse of AI" & "Generative AI Content" policies
//   • TikTok's "AI-generated content" labeling rule (mandatory since 2024)
//   • Google Ads "Synthetic content" disclosure (esp. for political/health/finance)
//   • EU AI Act Art. 50 (deployer transparency for AI-generated/synthetic content)
//
// This module produces the platform-specific metadata + visible suffix that
// Vigmis injects at the publish step. Called from the social-publisher and from
// ad-creative routes BEFORE the payload is sent to the platform.

export type DisclosurePlatform =
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'google_ads'
  | 'meta_ads';

export type AIComponent =
  | 'text'        // body copy was AI-generated
  | 'image'       // image was AI-generated/edited
  | 'video'       // video was AI-generated (e.g., HeyGen avatar)
  | 'voice'       // voiceover was synthesized
  | 'face'        // a synthetic human face appears
  | 'translation';// localized via AI

export interface DisclosureInput {
  platform: DisclosurePlatform;
  components: AIComponent[];   // what's AI-generated; can be multiple
  language?: 'en' | 'he' | 'ar' | 'ru' | string; // for visible suffix wording
  isPaidAd?: boolean;          // affects strictness (paid ads are stricter)
  market?: string;             // ISO country code; EU = stricter
}

export interface DisclosureOutput {
  // Visible suffix appended to the caption / post body / ad copy.
  // Empty string if no visible suffix required (label-only).
  visibleSuffix: string;

  // Platform-API metadata to set on the upload payload.
  // e.g. for TikTok: { ai_generated: true }
  //      for Meta:   { branded_content: { ai_disclosure: true } }
  platformMetadata: Record<string, unknown>;

  // Human-readable explanation (for logs / UI tooltips).
  rationale: string;

  // Disclosure version for audit trail.
  version: string;
}

const DISCLOSURE_VERSION = 'v1';

// ─── Suffix wording per language ─────────────────────────────────────────────
// Kept short and unambiguous. EU AI Act requires the disclosure to be
// "effective, interoperable, robust and reliable" — short and obvious wins.

const SUFFIX_TEXT: Record<string, { full: string; short: string; }> = {
  en: {
    full: 'This content was created with AI assistance.',
    short: 'AI-assisted',
  },
  he: {
    full: 'תוכן זה הופק בסיוע בינה מלאכותית.',
    short: 'AI-assisted',
  },
  ar: {
    full: 'تم إنشاء هذا المحتوى بمساعدة الذكاء الاصطناعي.',
    short: 'AI-assisted',
  },
  ru: {
    full: 'Этот контент создан с использованием ИИ.',
    short: 'AI-assisted',
  },
};

function suffixFor(language: string | undefined, length: 'full' | 'short'): string {
  const lang = (language ?? 'en').slice(0, 2).toLowerCase();
  return (SUFFIX_TEXT[lang] ?? SUFFIX_TEXT.en)[length];
}

// ─── EU/sensitive market detection ───────────────────────────────────────────
const EU_COUNTRIES = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE',
  'IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
]);

function isStrictMarket(market: string | undefined): boolean {
  if (!market) return false;
  return EU_COUNTRIES.has(market.toUpperCase());
}

// ─── Per-platform disclosure logic ───────────────────────────────────────────

export function buildDisclosure(input: DisclosureInput): DisclosureOutput {
  const hasVisualSynthesis = input.components.some((c) =>
    c === 'image' || c === 'video' || c === 'face' || c === 'voice',
  );
  const textOnly = !hasVisualSynthesis && input.components.includes('text');
  const strict = isStrictMarket(input.market) || input.isPaidAd === true;

  // Default rationale prefix
  const compList = input.components.join(', ');

  switch (input.platform) {
    case 'tiktok': {
      // TikTok requires the AI-generated label for any synthetic/realistic
      // image/audio/video. Label is set via the Content Posting API.
      return {
        visibleSuffix: hasVisualSynthesis ? suffixFor(input.language, 'short') : '',
        platformMetadata: {
          ai_generated: hasVisualSynthesis,
          ai_generated_components: input.components,
        },
        rationale: hasVisualSynthesis
          ? `TikTok mandates AI-content labeling for synthetic ${compList}.`
          : `Text-only AI content; TikTok does not strictly require the label, suffix omitted.`,
        version: DISCLOSURE_VERSION,
      };
    }

    case 'instagram':
    case 'facebook':
    case 'meta_ads': {
      // Meta requires the "AI Info" label for photorealistic AI-generated
      // images/video, and on ads using synthetic media. Set via the
      // branded_content / ai_disclosure flag on the upload.
      const visibleSuffix =
        hasVisualSynthesis || strict
          ? suffixFor(input.language, 'full')
          : '';

      return {
        visibleSuffix,
        platformMetadata: {
          ai_info_label: hasVisualSynthesis,
          ai_components: input.components,
          // Meta's structured field for AI content on posts (where supported)
          generative_ai_metadata: hasVisualSynthesis
            ? { is_ai_generated: true, components: input.components }
            : undefined,
        },
        rationale: hasVisualSynthesis
          ? `Meta requires AI Info label for synthetic ${compList}.`
          : strict
          ? `Strict market (${input.market}) — disclosure added for text AI as well.`
          : `Text-only AI on non-strict market; brief disclosure recommended but not strictly required.`,
        version: DISCLOSURE_VERSION,
      };
    }

    case 'google_ads': {
      // Google Ads requires synthetic-content disclosure for sensitive
      // categories (political, health, finance) and for any realistic
      // synthetic media that could mislead.
      const visibleSuffix =
        hasVisualSynthesis || strict
          ? suffixFor(input.language, 'full')
          : '';
      return {
        visibleSuffix,
        platformMetadata: {
          synthetic_content: hasVisualSynthesis,
          components: input.components,
        },
        rationale: hasVisualSynthesis
          ? `Google Ads requires synthetic-content disclosure for ${compList}.`
          : `Text-only AI ad; visible disclosure recommended for sensitive categories.`,
        version: DISCLOSURE_VERSION,
      };
    }

    default: {
      // Conservative default: disclose if visual synthesis or strict market.
      const visibleSuffix =
        hasVisualSynthesis || strict ? suffixFor(input.language, 'full') : '';
      return {
        visibleSuffix,
        platformMetadata: { ai_components: input.components },
        rationale: 'Unknown platform; using conservative disclosure default.',
        version: DISCLOSURE_VERSION,
      };
    }
  }
}

/**
 * Append the visible disclosure suffix to a caption/body, preserving spacing.
 * Idempotent: if the suffix is already present, no-ops. (Important — posts
 * sometimes get edited and re-published; we don't want to stack disclosures.)
 */
export function appendDisclosureSuffix(text: string, suffix: string): string {
  if (!suffix) return text;
  if (text.includes(suffix)) return text;
  const trimmed = text.trimEnd();
  // Separator: blank line for paragraphs, single space for short captions.
  const sep = trimmed.length > 120 ? '\n\n' : '\n';
  return `${trimmed}${sep}${suffix}`;
}

/**
 * One-shot helper: take a draft post and the AI components used to make it,
 * and return the final body + metadata to send to the platform.
 */
export function applyDisclosure(args: {
  body: string;
  platform: DisclosurePlatform;
  components: AIComponent[];
  language?: string;
  isPaidAd?: boolean;
  market?: string;
}): { body: string; platformMetadata: Record<string, unknown>; rationale: string; version: string } {
  const d = buildDisclosure({
    platform: args.platform,
    components: args.components,
    language: args.language,
    isPaidAd: args.isPaidAd,
    market: args.market,
  });
  return {
    body: appendDisclosureSuffix(args.body, d.visibleSuffix),
    platformMetadata: d.platformMetadata,
    rationale: d.rationale,
    version: d.version,
  };
}
