-- Migration 032: Remove Pack Animal, add Renaissance badge
--
-- Run in the Supabase SQL editor.

-- 1. Deactivate Pack Animal
UPDATE badges SET active = false WHERE code = 'pack_animal';

-- 2. Add Renaissance badge: weeks with 4+ distinct activity categories
INSERT INTO badges (code, name, emoji, category, criteria, active)
VALUES (
  'renaissance',
  'Renaissance',
  '🎨',
  'variety',
  '{"type":"variety_weeks","min_categories":4,"bronze":1,"silver":4,"gold":12}',
  true
);
