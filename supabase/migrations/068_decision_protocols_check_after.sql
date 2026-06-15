-- 068: Add check_after to decision_protocols for outcome tracking
-- After a protocol is approved, outcome-tracker checks back in 7-14 days
-- to measure whether the decision actually worked.

ALTER TABLE decision_protocols
  ADD COLUMN IF NOT EXISTS check_after TIMESTAMPTZ;

-- Index for efficient daily outcome-tracker queries
CREATE INDEX IF NOT EXISTS idx_decision_protocols_check_after
  ON decision_protocols (check_after)
  WHERE status = 'approved' AND check_after IS NOT NULL;
