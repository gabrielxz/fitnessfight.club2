-- Alternative approach: Keep user_id referencing auth.users but ensure proper data exists

-- First ensure all auth.users have corresponding user_profiles
INSERT INTO public.user_profiles (id, email, full_name, avatar_url)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email) as full_name,
  raw_user_meta_data->>'avatar_url' as avatar_url
FROM auth.users
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_profiles WHERE user_profiles.id = auth.users.id
)
ON CONFLICT (id) DO NOTHING;

-- Recreate the summary_participants table with proper structure
DROP TABLE IF EXISTS public.summary_participants CASCADE;

CREATE TABLE public.summary_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  display_name TEXT,
  include_in_summary BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Add foreign key that references user_profiles (which mirrors auth.users)
ALTER TABLE public.summary_participants
ADD CONSTRAINT summary_participants_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.user_profiles(id)
ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE public.summary_participants ENABLE ROW LEVEL SECURITY;

-- Create admin-only policy
CREATE POLICY "Admin full access" ON public.summary_participants
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.email = 'gabrielbeal@gmail.com'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.email = 'gabrielbeal@gmail.com'
    )
  );

-- Add index
CREATE INDEX idx_summary_participants_user_id ON public.summary_participants(user_id);

-- Update trigger for updated_at
CREATE TRIGGER update_summary_participants_updated_at
  BEFORE UPDATE ON public.summary_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();