-- Migration 031: Season 4 badge updates
--
-- Run in the Supabase SQL editor.

-- 1. Remove Pitch Perfect and Net Gain
UPDATE badges SET active = false WHERE code IN ('pitch_perfect', 'net_gain');

-- 2. Convert No Chill from weekly_cumulative hours to qualifying_weeks
--    (counts weeks where the player logs 12+ hours of exercise)
UPDATE badges
SET criteria = '{"type":"qualifying_weeks","min_hours":12,"bronze":1,"silver":6,"gold":12}'
WHERE code = 'no_chill';

-- Clear stale weekly_cumulative progress for No Chill — incompatible with new type
DELETE FROM badge_progress
WHERE badge_id = (SELECT id FROM badges WHERE code = 'no_chill');

-- 3. Add Decathlon badge: log distinct qualifying sports (15 min minimum each)
INSERT INTO badges (code, name, emoji, category, criteria, active)
VALUES (
  'decathlon',
  'Decathlon',
  '🏅',
  'variety',
  '{
    "type": "unique_sports",
    "sports_list": [
      "Basketball","Cricket","Golf","IceSkate","Padel",
      "Racquetball","Rowing","Skateboard","Surfing","Squash",
      "Tennis","Volleyball","MountainBikeRide","Badminton",
      "Elliptical","InlineSkate","Pickleball"
    ],
    "min_elapsed_time": 900,
    "bronze": 2,
    "silver": 4,
    "gold": 6
  }',
  true
);
