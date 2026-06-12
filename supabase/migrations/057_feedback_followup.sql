-- Add followup column to feedback table
-- followup holds the answer to the contextual follow-up question shown after star rating
alter table feedback
  add column if not exists followup text;
