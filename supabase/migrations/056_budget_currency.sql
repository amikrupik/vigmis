-- Add budget_currency and budget_original_amount to client_settings.
-- budget_monthly_ils remains the internal ILS value used for all calculations.
-- budget_currency / budget_original_amount preserve the original user input.

ALTER TABLE client_settings
  ADD COLUMN IF NOT EXISTS budget_currency text DEFAULT 'ILS',
  ADD COLUMN IF NOT EXISTS budget_original_amount numeric;
