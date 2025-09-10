-- This script applies the points refactor migration and optionally clears old points
-- Run this in your Supabase SQL editor

-- Step 1: Add new nullable columns for distinct point types.
ALTER TABLE public.user_points
ADD COLUMN IF NOT EXISTS exercise_points REAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS habit_points REAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS badge_points REAL DEFAULT 0;

-- Step 2: Backfill the new columns from the existing total_points.
-- We assume all existing points are exercise points since habits and badges
-- will be recalculated later.
UPDATE public.user_points
SET exercise_points = COALESCE(total_points, 0)
WHERE exercise_points IS NULL OR exercise_points = 0;

-- Step 3: Drop the old total_points column if it's not generated.
-- First check if it's a regular column (not generated)
DO $$
BEGIN
  -- Check if total_points exists and is not generated
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_points' 
    AND column_name = 'total_points'
    AND is_generated = 'NEVER'
  ) THEN
    ALTER TABLE public.user_points DROP COLUMN total_points;
  END IF;
END $$;

-- Step 4: Re-add total_points as a generated column that sums the others.
ALTER TABLE public.user_points
ADD COLUMN IF NOT EXISTS total_points REAL GENERATED ALWAYS AS (exercise_points + habit_points + badge_points) STORED;

-- Step 5: Add a comment to the generated column for clarity.
COMMENT ON COLUMN public.user_points.total_points IS 'Generated column that automatically sums exercise_points, habit_points, and badge_points.';

-- Step 6: Show current state
SELECT 
  user_id,
  week_start,
  exercise_points,
  habit_points,
  badge_points,
  total_points,
  activities_count
FROM public.user_points
ORDER BY week_start DESC, user_id;

-- OPTIONAL: Uncomment the following to delete ALL points and start fresh
-- DELETE FROM public.user_points;

-- OPTIONAL: Uncomment the following to delete points older than 2 weeks
-- DELETE FROM public.user_points 
-- WHERE week_start < CURRENT_DATE - INTERVAL '14 days';