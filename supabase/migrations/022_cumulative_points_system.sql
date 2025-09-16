-- Step 1: Add cumulative point columns to user_profiles
ALTER TABLE public.user_profiles
ADD COLUMN cumulative_exercise_points REAL NOT NULL DEFAULT 0,
ADD COLUMN cumulative_habit_points REAL NOT NULL DEFAULT 0,
ADD COLUMN cumulative_badge_points REAL NOT NULL DEFAULT 0;

-- Step 2: Add a generated column for the total cumulative score
ALTER TABLE public.user_profiles
ADD COLUMN total_cumulative_points REAL
GENERATED ALWAYS AS (cumulative_exercise_points + cumulative_habit_points + cumulative_badge_points) STORED;

-- Step 3: Create a new table to track weekly exercise hours for capping purposes
CREATE TABLE public.weekly_exercise_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  hours_logged REAL NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);

-- Step 4: Enable RLS on the new tracking table and set policies
ALTER TABLE public.weekly_exercise_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own weekly exercise tracking" 
ON public.weekly_exercise_tracking
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin users can access all records" 
ON public.weekly_exercise_tracking
FOR SELECT
USING ((SELECT email FROM auth.users WHERE id = auth.uid()) = 'gabrielbeal@gmail.com');

-- Step 5: Drop the old, now obsolete, points and summary tables
DROP TABLE IF EXISTS public.user_points;
DROP TABLE IF EXISTS public.habit_weekly_summaries;

-- Step 6: Create RPC functions for safe concurrent updates to cumulative points

-- For exercise points
CREATE OR REPLACE FUNCTION increment_exercise_points(p_user_id UUID, p_points_to_add REAL)
RETURNS VOID AS $$
BEGIN
  UPDATE public.user_profiles
  SET cumulative_exercise_points = cumulative_exercise_points + p_points_to_add
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- For habit points
CREATE OR REPLACE FUNCTION increment_habit_points(p_user_id UUID, p_points_to_add REAL)
RETURNS VOID AS $$
BEGIN
  UPDATE public.user_profiles
  SET cumulative_habit_points = cumulative_habit_points + p_points_to_add
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- For badge points
CREATE OR REPLACE FUNCTION increment_badge_points(p_user_id UUID, p_points_to_add REAL)
RETURNS VOID AS $$
BEGIN
  UPDATE public.user_profiles
  SET cumulative_badge_points = cumulative_badge_points + p_points_to_add
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Note: The old increment_badge_points function that referenced user_points is dropped automatically when user_points is dropped.
