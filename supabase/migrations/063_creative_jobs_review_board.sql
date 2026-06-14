-- Add Review Board tracking columns to creative_jobs
-- review_board_passed: null = not run, true = passed, false = force-passed after max iterations
-- review_board_iterations: how many rounds the board ran (0 = not run)

ALTER TABLE creative_jobs
  ADD COLUMN IF NOT EXISTS review_board_passed boolean,
  ADD COLUMN IF NOT EXISTS review_board_iterations integer NOT NULL DEFAULT 0;
