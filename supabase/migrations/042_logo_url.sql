-- Add logo_url and content_language columns to client_settings
ALTER TABLE client_settings ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE client_settings ADD COLUMN IF NOT EXISTS content_language TEXT DEFAULT 'auto';
