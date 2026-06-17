-- Migration 071: Add strategy_patch type to decision_protocols
-- Enables Vigmis to propose strategy updates via chat (new product, new market, etc.)

ALTER TABLE decision_protocols
  DROP CONSTRAINT IF EXISTS decision_protocols_type_check;

ALTER TABLE decision_protocols
  ADD CONSTRAINT decision_protocols_type_check
  CHECK (type IN (
    'strategy_approval',
    'budget_change',
    'campaign_pause',
    'campaign_resume',
    'campaign_scale',
    'creative_refresh',
    'targeting_review',
    'stagnation_alert',
    'general_advice',
    'strategy_patch'
  ));
