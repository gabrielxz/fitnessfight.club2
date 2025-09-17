-- Fix the badge_progress constraint to support weekly badges
-- The old constraint prevents multiple weeks of progress for the same badge

-- First, drop the existing constraint
ALTER TABLE badge_progress
DROP CONSTRAINT IF EXISTS badge_progress_user_id_badge_id_key CASCADE;

-- Also drop the intended constraint if it exists (in case this runs twice)
ALTER TABLE badge_progress
DROP CONSTRAINT IF EXISTS badge_progress_user_badge_period_unique CASCADE;

-- Create the correct unique constraint that includes period_start
-- This allows the same user to have progress for the same badge in different periods
ALTER TABLE badge_progress
ADD CONSTRAINT badge_progress_user_badge_period_unique
UNIQUE NULLS NOT DISTINCT (user_id, badge_id, period_start);

-- This constraint allows:
-- - Multiple week entries for weekly badges (different period_start values)
-- - Single entry for cumulative badges (NULL period_start)
-- The NULLS NOT DISTINCT ensures that two NULL period_starts are treated as equal,
-- preventing duplicate entries for cumulative badges