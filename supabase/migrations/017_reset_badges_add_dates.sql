-- Migration to delete all existing badges and add date fields for time-limited badges

-- Step 1: Delete all user badge data
DELETE FROM user_badges;

-- Step 2: Delete all badge progress data
DELETE FROM badge_progress;

-- Step 3: Delete all badge definitions
DELETE FROM badges;

-- Step 4: Add date fields to badges table
ALTER TABLE badges
ADD COLUMN start_date DATE,
ADD COLUMN end_date DATE;

-- Step 5: Add comments explaining the date fields
COMMENT ON COLUMN badges.start_date IS 'Optional start date for time-limited badges. NULL means badge is active from contest start.';
COMMENT ON COLUMN badges.end_date IS 'Optional end date for time-limited badges. NULL means badge is active until contest end.';

-- Step 6: Reset all badge points to 0 in user_points table
UPDATE user_points 
SET badge_points = 0,
    updated_at = NOW()
WHERE badge_points > 0;

-- Step 7: Add check constraint to ensure end_date is after start_date when both are set
ALTER TABLE badges
ADD CONSTRAINT badges_date_check 
CHECK (
  (start_date IS NULL AND end_date IS NULL) OR
  (start_date IS NOT NULL AND end_date IS NULL) OR
  (start_date IS NULL AND end_date IS NOT NULL) OR
  (start_date < end_date)
);