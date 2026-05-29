-- Migration 025: Brand Voice Profile
--
-- Stores the extracted "voice fingerprint" of the customer's brand — derived
-- from their existing copy (website + past posts if any) and used as a gate
-- on every piece of content Vigmis generates.
--
-- Without this, AI-generated content sounds generic and customers churn after
-- 2-3 months. With this, every post passes a "would this customer actually
-- write this?" check.

ALTER TABLE client_settings
  ADD COLUMN IF NOT EXISTS brand_voice_profile JSONB,
  ADD COLUMN IF NOT EXISTS brand_voice_extracted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS brand_voice_source TEXT;
  -- brand_voice_source: 'website_crawl' | 'past_posts' | 'manual' | 'mixed'

-- Brand voice profile schema (stored as JSONB):
--   {
--     "tone": ["professional", "warm", "concise"],
--     "formality": "informal" | "semiformal" | "formal",
--     "address_form": "אתה" | "את" | "אתם" | "you-formal" | "you-casual",  // Hebrew or English
--     "lexicon_preferred": ["term1", "term2"],     // Words/phrases the brand uses
--     "lexicon_avoid": ["term1", "term2"],         // No-go phrases (e.g. competitor names, jargon)
--     "sentence_rhythm": "short_punchy" | "medium" | "long_flowing",
--     "emoji_policy": "none" | "sparing" | "frequent",
--     "humor_level": "none" | "light" | "frequent",
--     "exclamation_policy": "none" | "sparing" | "frequent",
--     "common_ctas": ["Order now", "Learn more"],
--     "language_primary": "he" | "en" | "ar" | "ru",
--     "examples": ["sample sentence 1", "sample sentence 2"]
--   }
