-- Migration 030: Remove Stridezilla, add Rhythm Engine badge
--
-- Run in the Supabase SQL editor.

-- Deactivate Stridezilla (preserves any earned user_badges history)
UPDATE badges SET active = false WHERE code = 'stridezilla';

-- Add Rhythm Engine: cumulative total dance minutes
INSERT INTO badges (code, name, emoji, category, criteria, active)
VALUES (
  'rhythm_engine',
  'Rhythm Engine',
  '🕺',
  'activity',
  '{"type":"cumulative","metric":"moving_time_minutes","activity_type":"Dance","bronze":60,"silver":240,"gold":600}',
  true
);
