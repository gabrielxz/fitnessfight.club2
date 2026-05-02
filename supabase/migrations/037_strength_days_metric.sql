-- Migration 037: Replace strength_count with strength_days for Period 3.
--
-- Run this in the Supabase SQL editor BEFORE Period 3 starts (May 4, 2026 PT).
--
-- Why: COUNT(*) of strength activities incentivized many short logged sessions.
-- strength_days counts distinct local calendar days with at least one strength
-- activity of >= 15 minutes moving_time, rewarding consistent showing-up
-- instead of session farming. 15 min matches the Decathlon badge threshold.
--
-- Day grouping is done in app code on start_date_local (the activity's local
-- calendar day), not the UTC date.

BEGIN;

-- ── 1. Sanity guard ───────────────────────────────────────────────────────────
-- Period 3 must still be unresolved. If it has any closed-out matchups, abort:
-- this migration is meant to run before any close-out happens.
DO $$
DECLARE
  resolved_count INT;
BEGIN
  SELECT COUNT(*) INTO resolved_count
  FROM rivalry_matchups m
  JOIN rivalry_periods p ON p.id = m.period_id
  WHERE p.period_number = 3
    AND m.player1_score IS NOT NULL;
  IF resolved_count > 0 THEN
    RAISE EXCEPTION 'Period 3 already has % resolved matchup(s); refusing to change its metric.', resolved_count;
  END IF;
END $$;

-- ── 2. Swap CHECK constraint ──────────────────────────────────────────────────
-- Replace strength_count with strength_days in the allowed metric list.
-- No existing row uses strength_count outside Period 3 (verified manually);
-- the UPDATE in step 3 covers it before any new constraint is enforced.

ALTER TABLE rivalry_periods DROP CONSTRAINT IF EXISTS rivalry_periods_metric_check;

UPDATE rivalry_periods
SET metric = 'strength_days',
    metric_label = 'Strength Days',
    metric_unit = 'days'
WHERE period_number = 3;

ALTER TABLE rivalry_periods
  ADD CONSTRAINT rivalry_periods_metric_check
  CHECK (metric IN (
    'total_distance',
    'run_distance',
    'moving_time',
    'elevation_gain',
    'unique_activity_types',
    'strength_days',         -- distinct local days with a >=15min strength activity
    'active_days',
    'yoga_time',
    'dance_time'
  ));

COMMIT;
