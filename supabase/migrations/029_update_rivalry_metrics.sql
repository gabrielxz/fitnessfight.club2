-- Migration 029: Update rivalry metric types and add score columns
--
-- Run this in the Supabase SQL editor.
--
-- Changes:
--   1. Add player1_score / player2_score to rivalry_matchups
--   2. Replace the narrow metric CHECK constraint with the full set of 9 metrics
--   3. Set correct metric / metric_label / metric_unit for every rivalry period

-- ── 1. Score columns ──────────────────────────────────────────────────────────

ALTER TABLE rivalry_matchups
  ADD COLUMN IF NOT EXISTS player1_score REAL,
  ADD COLUMN IF NOT EXISTS player2_score REAL;

-- ── 2. Swap CHECK constraint ──────────────────────────────────────────────────
-- Must rename existing 'distance' rows BEFORE adding the new constraint,
-- because the new constraint no longer allows the bare 'distance' value.

ALTER TABLE rivalry_periods DROP CONSTRAINT IF EXISTS rivalry_periods_metric_check;

UPDATE rivalry_periods SET metric = 'total_distance' WHERE metric = 'distance';

ALTER TABLE rivalry_periods
  ADD CONSTRAINT rivalry_periods_metric_check
  CHECK (metric IN (
    'total_distance',       -- SUM(distance) all sport types
    'run_distance',         -- SUM(distance) on-foot sports only
    'moving_time',          -- SUM(moving_time) all sport types
    'elevation_gain',       -- SUM(total_elevation_gain) all sport types
    'unique_activity_types',-- COUNT(DISTINCT sport_type)
    'strength_count',       -- COUNT(*) strength sport types
    'active_days',          -- COUNT(DISTINCT DATE(start_date))
    'yoga_time',            -- SUM(moving_time) WHERE sport_type = 'Yoga'
    'dance_time'            -- SUM(moving_time) WHERE sport_type = 'Dance'
  ));

-- ── 3. Period metadata ────────────────────────────────────────────────────────
-- Periods 1–4 are all total_distance (pre-season + first real period Apr 6).
-- Periods 5–13 use the full variety schedule.

UPDATE rivalry_periods SET
  metric       = 'total_distance',
  metric_label = 'All-Purpose Distance',
  metric_unit  = 'km'
WHERE period_number IN (1, 2, 3, 4);

UPDATE rivalry_periods SET
  metric       = 'run_distance',
  metric_label = 'Run & Walk Distance',
  metric_unit  = 'km'
WHERE period_number = 5;

UPDATE rivalry_periods SET
  metric       = 'strength_count',
  metric_label = 'Strength Sessions',
  metric_unit  = 'sessions'
WHERE period_number = 6;

UPDATE rivalry_periods SET
  metric       = 'moving_time',
  metric_label = 'Hours Exercised',
  metric_unit  = 'hrs'
WHERE period_number = 7;

UPDATE rivalry_periods SET
  metric       = 'active_days',
  metric_label = 'Active Days',
  metric_unit  = 'days'
WHERE period_number = 8;

UPDATE rivalry_periods SET
  metric       = 'elevation_gain',
  metric_label = 'Elevation Climbed',
  metric_unit  = 'm'
WHERE period_number = 9;

UPDATE rivalry_periods SET
  metric       = 'unique_activity_types',
  metric_label = 'Variety Week',
  metric_unit  = 'types'
WHERE period_number = 10;

UPDATE rivalry_periods SET
  metric       = 'yoga_time',
  metric_label = 'Yoga Week',
  metric_unit  = 'hrs'
WHERE period_number = 11;

UPDATE rivalry_periods SET
  metric       = 'dance_time',
  metric_label = 'Dance Week',
  metric_unit  = 'hrs'
WHERE period_number = 12;

UPDATE rivalry_periods SET
  metric       = 'run_distance',
  metric_label = 'Run & Walk Distance',
  metric_unit  = 'km'
WHERE period_number = 13;
