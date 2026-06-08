-- Migration 051: Brand DNA fields in client_settings

ALTER TABLE client_settings
  ADD COLUMN IF NOT EXISTS brand_colors TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS brand_fonts TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS do_not_change_elements TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS approved_creative_styles JSONB DEFAULT '[]';
