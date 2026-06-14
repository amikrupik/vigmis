-- Social posts territory-language support:
--   content_language: the ISO 639-1 language the post was written in (e.g. 'he', 'en', 'ar')
--   content_translation: Hebrew (or English) summary so the business owner can approve
--                        posts written in a language they may not read.

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS content_language  VARCHAR(10),
  ADD COLUMN IF NOT EXISTS content_translation TEXT;
