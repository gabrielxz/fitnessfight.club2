
-- Step 1: Add new nullable columns for distinct point types.
ALTER TABLE public.user_points
ADD COLUMN exercise_points REAL DEFAULT 0,
ADD COLUMN habit_points REAL DEFAULT 0,
ADD COLUMN badge_points REAL DEFAULT 0;

-- Step 2: Backfill the new columns from the existing total_points.
-- We assume all existing points are exercise points. Habit and badge points
-- will be recalculated later.
UPDATE public.user_points
SET exercise_points = total_points;

-- Step 3: Drop the old total_points column.
ALTER TABLE public.user_points
DROP COLUMN total_points;

-- Step 4: Re-add total_points as a generated column that sums the others.
ALTER TABLE public.user_points
ADD COLUMN total_points REAL GENERATED ALWAYS AS (exercise_points + habit_points + badge_points) STORED;

-- Step 5: Add a new column to user_profiles to store timezone.
-- This is duplicative of the logic in migration 010, but ensures consistency
-- if migrations are run out of order or on a fresh database.
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS timezone TEXT;

-- Step 6: Add a comment to the generated column for clarity.
COMMENT ON COLUMN public.user_points.total_points IS 'Generated column that automatically sums exercise_points, habit_points, and badge_points.';

