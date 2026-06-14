-- Add weekly_strategy JSONB column for Strategic Brain weekly analysis
-- Structure: WeeklyStrategyAnalysis { week_of, portfolio_verdict, hypothesis_still_valid,
--            hypothesis_drift, top_insights, top_actions, budget_recommendation,
--            creative_recommendation, generated_at }

ALTER TABLE client_settings
  ADD COLUMN IF NOT EXISTS weekly_strategy jsonb;
