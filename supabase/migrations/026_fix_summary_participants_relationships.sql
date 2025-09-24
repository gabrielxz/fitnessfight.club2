-- Fix the foreign key relationships for summary_participants table

-- First, drop the existing foreign key constraint if it exists
ALTER TABLE public.summary_participants
DROP CONSTRAINT IF EXISTS summary_participants_user_id_fkey;

-- Add proper foreign key to user_profiles (not auth.users directly)
-- This ensures we can join with user_profiles table
ALTER TABLE public.summary_participants
ADD CONSTRAINT summary_participants_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.user_profiles(id)
ON DELETE CASCADE;

-- Update the RLS policy to be more permissive for the admin
DROP POLICY IF EXISTS "Admin only" ON public.summary_participants;

CREATE POLICY "Admin can do everything" ON public.summary_participants
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users
      WHERE email = 'gabrielbeal@gmail.com'
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM auth.users
      WHERE email = 'gabrielbeal@gmail.com'
    )
  );

-- Grant necessary permissions to authenticated users (admin will use these)
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT SELECT ON public.strava_connections TO authenticated;

-- Ensure the admin can read from auth.users indirectly through user_profiles
-- This is safer than granting direct access to auth.users