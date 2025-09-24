-- Grant necessary permissions for the admin to read user data through service role

-- Ensure RLS is enabled on all relevant tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strava_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.summary_participants ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Service role can manage profiles" ON public.user_profiles;

-- Recreate policies for user_profiles with proper permissions
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.user_profiles
  FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Drop and recreate strava_connections policies
DROP POLICY IF EXISTS "Users can view all connections" ON public.strava_connections;
DROP POLICY IF EXISTS "Users can manage their own connection" ON public.strava_connections;

CREATE POLICY "Public read for strava connections"
  ON public.strava_connections
  FOR SELECT
  USING (true);

CREATE POLICY "Users can manage their own strava connection"
  ON public.strava_connections
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Ensure habits table has proper RLS
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;

-- Drop and recreate habits policies if needed
DROP POLICY IF EXISTS "Users can view their own habits" ON public.habits;
DROP POLICY IF EXISTS "Users can create their own habits" ON public.habits;
DROP POLICY IF EXISTS "Users can update their own habits" ON public.habits;
DROP POLICY IF EXISTS "Users can delete their own habits" ON public.habits;

CREATE POLICY "Users can view their own habits"
  ON public.habits
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own habits"
  ON public.habits
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own habits"
  ON public.habits
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own habits"
  ON public.habits
  FOR DELETE
  USING (auth.uid() = user_id);

-- Ensure habit_entries has proper RLS
ALTER TABLE public.habit_entries ENABLE ROW LEVEL SECURITY;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_habit_entries_user_id ON public.habit_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_habits_user_id ON public.habits(user_id);

-- Note: The admin client with service role key bypasses all RLS policies,
-- so it can read all data regardless of these policies