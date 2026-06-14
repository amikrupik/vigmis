-- Add winning_patterns JSONB column to client_settings for Learning Loop
-- Structure: { avatar: WinningPattern[], image: WinningPattern[], cinematic: WinningPattern[], animation: WinningPattern[] }

ALTER TABLE client_settings
  ADD COLUMN IF NOT EXISTS winning_patterns jsonb;
