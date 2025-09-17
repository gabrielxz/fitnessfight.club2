-- Fix RLS policies on weekly_exercise_tracking to allow public read access
-- The leaderboard needs to show everyone's weekly hours

-- Drop the existing restrictive policies
DROP POLICY IF EXISTS "Users can manage their own weekly exercise tracking" ON public.weekly_exercise_tracking;
DROP POLICY IF EXISTS "Admin users can access all records" ON public.weekly_exercise_tracking;

-- Create new policies that allow public read but restricted write
CREATE POLICY "Anyone can read weekly exercise tracking"
ON public.weekly_exercise_tracking
FOR SELECT
USING (true);  -- Allow all authenticated users to read all records

CREATE POLICY "Users can insert their own weekly exercise tracking"
ON public.weekly_exercise_tracking
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own weekly exercise tracking"
ON public.weekly_exercise_tracking
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own weekly exercise tracking"
ON public.weekly_exercise_tracking
FOR DELETE
USING (auth.uid() = user_id);