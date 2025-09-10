
-- Add user_id to habit_entries for easier RLS and queries.
ALTER TABLE public.habit_entries
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill user_id from the parent habit.
UPDATE public.habit_entries he
SET user_id = h.user_id
FROM public.habits h
WHERE he.habit_id = h.id AND he.user_id IS NULL;

-- Set the user_id column to be NOT NULL now that it's backfilled.
ALTER TABLE public.habit_entries
ALTER COLUMN user_id SET NOT NULL;

-- Re-create RLS policies to use the new user_id column for efficiency.
DROP POLICY IF EXISTS "Users can view their own habit entries" ON public.habit_entries;
CREATE POLICY "Users can view their own habit entries" ON public.habit_entries
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own habit entries" ON public.habit_entries;
CREATE POLICY "Users can create their own habit entries" ON public.habit_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own habit entries" ON public.habit_entries;
CREATE POLICY "Users can update their own habit entries" ON public.habit_entries
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own habit entries" ON public.habit_entries;
CREATE POLICY "Users can delete their own habit entries" ON public.habit_entries
  FOR DELETE USING (auth.uid() = user_id);
