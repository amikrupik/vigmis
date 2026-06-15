-- 069: Add intelligence fields to client_settings
-- hypotheses: Hypothesis Engine — Strategic Brain writes, Creative Director reads
-- decision_quality_stats: tracks batting average per decision type

ALTER TABLE client_settings
  ADD COLUMN IF NOT EXISTS hypotheses JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS decision_quality_stats JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN client_settings.hypotheses IS
  'Array of {id, text, confidence, evidence, status, createdAt, linkedTestId}. Written by Strategic Brain, read by Creative Director.';

COMMENT ON COLUMN client_settings.decision_quality_stats IS
  'Map of decision_type → {decisions, improved, worsened, batting_avg}. Updated by outcome-tracker weekly.';
