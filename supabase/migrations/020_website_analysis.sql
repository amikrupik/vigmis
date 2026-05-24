-- Migration 020: Persist website analysis on client_settings
-- Avoids refetching + re-analyzing the website for every social post, comment triage, or future feature.

ALTER TABLE client_settings
  ADD COLUMN IF NOT EXISTS website_analysis TEXT;
