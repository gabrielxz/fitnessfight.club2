-- Migration 034: Add start_lat/start_lng to activities; add Out of Bounds badge
--
-- Run in the Supabase SQL editor.

-- 1. Add lat/lng columns to strava_activities (used by Out of Bounds badge + home location cluster script)
ALTER TABLE strava_activities
  ADD COLUMN IF NOT EXISTS start_lat REAL,
  ADD COLUMN IF NOT EXISTS start_lng REAL;

-- 2. Insert Out of Bounds badge: cumulative hours worked out 100+ miles from home
INSERT INTO badges (code, name, emoji, category, criteria, active)
VALUES (
  'out_of_bounds',
  'Out of Bounds',
  '🧭',
  'variety',
  '{"type":"away_hours","min_distance_miles":100,"bronze":3,"silver":10,"gold":20}',
  true
);
