-- Create table to track which users to include in habit summaries
CREATE TABLE IF NOT EXISTS public.summary_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT, -- Override name for summary if needed
  include_in_summary BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0, -- Control order in summary
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id) -- Ensure each user can only be added once
);

-- Enable RLS for admin-only access
ALTER TABLE public.summary_participants ENABLE ROW LEVEL SECURITY;

-- Admin-only policy
CREATE POLICY "Admin only" ON public.summary_participants
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM auth.users
      WHERE email = 'gabrielbeal@gmail.com'
    )
  );

-- Add index for faster queries
CREATE INDEX idx_summary_participants_user_id ON public.summary_participants(user_id);

-- Trigger to update updated_at
CREATE TRIGGER update_summary_participants_updated_at
  BEFORE UPDATE ON public.summary_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();